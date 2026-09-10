import { createClient } from 'jsr:@supabase/supabase-js@2';

// ⚠️ Rechtstreeks uit de bestanden en niet via een index. Zie de rollover: een
//    index re-exporteert ook `clock.ts`, dat `process.env` leest om `freezeNow()`
//    in productie te weigeren — op Deno is dat een valkuil die je pas merkt als
//    de job stilvalt.
import { partsIn } from '../_shared/time/zoned.ts';
import { previousCycle, userCycle } from '../_shared/time/cycle.ts';
import { GRACE_HOURS, type Weekday } from '../_shared/time/types.ts';
import { inStilteVenster, verschovenUur } from '../_shared/time/stilte.ts';
import { meld } from '../_shared/melden.ts';
import { metCors } from '../_shared/cors.ts';
import { paginas } from '../_shared/bladeren/index.ts';
import { nudgeBesluit } from '../_shared/notificaties/nudge-besluit.ts';

/**
 * Hoeveel profielen er per ronde opgehaald worden.
 *
 * ⚠️ Bewust klein, om dezelfde reden als in de rollover: deze functie doet per
 *    profiel nog meerdere query's, dus de grens is de looptijd van één Edge
 *    Function en niet het geheugen. Kleiner betekent meer ronden, niet meer werk.
 */
const PROFIELEN_PER_PAGINA = 200;
import {
  berichtVoor,
  meldingPoortReden,
  nudgeBericht,
  overzichtsuur,
  type Taalcode,
  uurUit,
  type Bericht,
  type Melding,
  type Meldingsvoorkeuren,
  type Toon,
} from '../_shared/notificaties/regels.ts';
import {
  verstuurWebPush,
  type VapidSleutels,
  type WebPushDoel,
} from '../_shared/notificaties/webpush-verzenden.ts';

/**
 * De meldingen-job — EPIC 11 (QS8-91) en de dagelijkse nudge (QS8-77).
 *
 * ⚠️ **`push_tokens` is vandaag leeg.** Deze functie draait dan gewoon, vindt geen
 *    ontvangers en stuurt niets. Voor web is de keten sinds 25-08-2026 compleet
 *    en wacht hij alleen nog op een VAPID-sleutelpaar in de omgeving; voor native
 *    wacht hij op een EAS-projectId (Q-TODO B4).
 *
 * ⚠️ **Twee bestemmingen, en maar één daarvan is sleutelloos.** De Expo-pushdienst
 *    accepteert een bericht op basis van het token zelf; FCM- en APNs-sleutels
 *    zitten in de build en niet in deze aanroep. Een browserabonnement wél: dat
 *    vraagt het VAPID-sleutelpaar (`EXPO_PUBLIC_VAPID_PUBLIC_KEY`,
 *    `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) in de omgeving van deze functie.
 *    Ontbreken ze, dan gaan native meldingen gewoon door en worden web-tokens
 *    overgeslagen met een melding in het log.
 *
 * ⚠️ Tot 25-08-2026 stond hier dat deze functie niets geheims hoefde te kennen,
 *    en dat klopte omdat het verzendpad voor web nooit gebouwd was. Zie de kop
 *    van `stuur()`.
 *
 * ⚠️ Elk uur, net als de rollover. Gevolg dat je moet weten: een
 *    goedkeuringsverzoek kan tot een uur oud zijn voordat de melding komt. Het
 *    alternatief is een trigger die `pg_net` gebruikt, en dan staat de
 *    service-role-key in de database — precies wat Quinten op 19-08 heeft
 *    afgewezen bij de rolloverplanning. Voor een app met een weekritme is een
 *    uur vertraging de goedkopere kant van die ruil.
 *
 * ⚠️ **Domeinregel 7.** Er zijn vijf soorten en vier ervan gaan over jezelf; de
 *    CHECK op `notifications_sent.kind` dwingt af dat er niet stil een zesde
 *    bijkomt. De vijfde — `commitment_witness` — is de énige die over een ander
 *    gaat, en dat kan op precies één grond: de uitzondering die domeinregel 7
 *    zelf noemt, *een straf die de gebruiker zelf vooraf heeft ingesteld en
 *    bevestigd*. Zie `_shared/notificaties/regels.ts` en migratie 0178 voor de
 *    onderbouwing, en sectie 5 hieronder voor de drie dingen die die grond
 *    dragen.
 */

interface Profiel {
  id: string;
  tz: string;
  week_start_day: number;
  reminder_enabled: boolean;
  reminder_time: string | null;
  reminder_tone: string | null;
  /** De taalkeuze van de ontvanger. `null` = nog niet gekozen (migratie 0061). */
  locale: string | null;
  /**
   * De schakelaars per meldingsoort (migratie 0237, QS8-92).
   *
   * ⚠️ `nudge` staat hier niet bij: die schakelaar ís `reminder_enabled`
   *    hierboven. De vertaling van soort naar veld staat op één plek,
   *    `VOORKEUR_PER_SOORT` in `_shared/notificaties/regels.ts`.
   */
  notify_approval_request: boolean;
  notify_approval_received: boolean;
  notify_cycle_summary: boolean;
  notify_commitment_witness: boolean;
  /** Het stille venster in hele uren (migratie 0238, QS8-406). */
  quiet_from: number | null;
  quiet_to: number | null;
}

/**
 * Eén geregistreerd apparaat of browserabonnement.
 *
 * ⚠️ **Tot 25-08-2026 stond hier alleen `token`, en dát was het gat.** Voor een
 *    native toestel ís het token het adres en gaat het naar Expo. Voor een
 *    browser is `token` de endpoint-URL van de pushdienst, en zonder `p256dh` en
 *    `auth` kun je er niets versleuteld naartoe sturen. De kolommen bestaan sinds
 *    migratie 0062; ze werden alleen nooit gelezen.
 */
interface Token {
  token: string;
  platform: string;
  p256dh: string | null;
  auth: string | null;
}

const EXPO_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

function rolUit(authHeader: string): string {
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const stukken = token.split('.');
  if (stukken.length !== 3) return '';

  try {
    const payload = stukken[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '='));
    const claims = JSON.parse(json) as { role?: string };
    return claims.role ?? '';
  } catch {
    return '';
  }
}

/**
 * De taal van de ontvanger — QS8-115.
 *
 * ⚠️ **Per ontvanger en niet per proces.** Deze job loopt over álle profielen;
 *    een procesbrede taal (zoals `shared/i18n` die voor de app bijhoudt) zou hier
 *    betekenen dat iedereen de taal krijgt van wie er toevallig als laatste is
 *    ingesteld. Die fout is onzichtbaar: er komt gewoon een melding aan, alleen
 *    in de verkeerde taal. Vandaar dat `regels.ts` een parameter neemt.
 *
 * ⚠️ `locale` is `null` zolang de gebruiker niets gekozen heeft. Dan wordt het de
 *    standaardtaal — de apparaattaal is hier niet bekend en hoort dat ook niet te
 *    zijn: een server weet niet op welk toestel dit geopend wordt.
 */
function taalVan(profiel: Profiel): Taalcode | null {
  return profiel.locale === 'en' ? 'en' : null;
}

// ⚠️ `metCors` ook hier, terwijl deze functie server-side wordt aangeroepen en
//    dus nooit een preflight krijgt — QS8-195, punt 3. Dat is niet gratis
//    plaksel: de volgende die hem vanaf het web aanroept, betaalt anders
//    dezelfde twee minuten die de Doelcoach gekost heeft. Zonder `Origin` doet
//    `metCors` niets.
Deno.serve(metCors(async (req: Request) => {
  const auth = req.headers.get('Authorization') ?? '';

  if (rolUit(auth) !== 'service_role') {
    return new Response(JSON.stringify({ error: 'Alleen aanroepbaar als service_role' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ⚠️ **De hele run in een vangnet, en dat was een gat.** De zachte fouten per
  //    profiel melden zoals ze deden — die zijn verwacht en afgehandeld. Wat
  //    hier gevangen wordt is het ónverwachte: een afgewezen rpc, een
  //    platformhapering. Dat werd tot 26-08-2026 geruisloos een 500 zonder enig
  //    spoor, en dat is precies het geval waar QS8-24 voor bestaat.
  //
  // ⚠️ `await` en niet los laten lopen. Supabase kan een Edge Function bevriezen
  //    zodra het antwoord verstuurd is; een niet-afgewachte `fetch` wordt dan
  //    afgekapt en de melding komt nooit aan. Eerst melden, dan antwoorden.
  try {
    return await draaiNotificaties(auth);
  } catch (fout) {
    await meld(fout, 'notificaties', { code: 'notificaties_onverwacht_gestopt' });
    return new Response(JSON.stringify({ error: 'notificaties_onverwacht_gestopt' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}));

async function draaiNotificaties(auth: string): Promise<Response> {
  const db = maakClient(
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? auth.replace(/^Bearer\s+/i, ''),
  );

  const nu = new Date();
  let verstuurd = 0;
  let onderdrukt = 0;
  let overgeslagen = 0;
  let zonderToken = 0;

  // ⚠️ **In pagina's, met een expliciete `order`** — QS8-341, en dit is
  //    woordelijk de reparatie die op 03-09 in de rollover landde en hier bleef
  //    liggen. Zonder `range()` kapt een gezette `max-rows` in PostgREST de lijst
  //    stilzwijgend af: geen fout, geen melding, alleen gebruikers die nooit een
  //    melding krijgen.
  //
  // ⚠️ De `order` staat hier en niet in `paginas()`, want dat is de enige
  //    eigenschap die die lus niet kan bewaken.
  let profielFout: { message: string; code?: string } | null = null;

  const haalProfielen = async (start: number, aantal: number): Promise<readonly Profiel[]> => {
    const { data, error } = await db
      .from('profiles')
      // ⚠️ **Eén string-literal en geen samenstelling.** supabase-js leidt de vorm
      //    van de rij af uit de lítterlijke tekst van deze selectie; een `+` maakt
      //    er een gewone `string` van en dan wordt `data` een `GenericStringError[]`.
      //    📏 `npm run edge:types:controle` viel er meteen over (TS2352) — dat is
      //    de enige typecheck die deze map ziet, want `tsconfig.json` sluit hem uit.
      // deno-fmt-ignore
      .select('id, tz, week_start_day, reminder_enabled, reminder_time, reminder_tone, locale, notify_approval_request, notify_approval_received, notify_cycle_summary, notify_commitment_witness, quiet_from, quiet_to')
      .order('id', { ascending: true })
      .range(start, start + aantal - 1);

    if (error) {
      // ⚠️ Leeg teruggeven en de fout apart onthouden, net als in de rollover:
      //    `paginas()` stopt dan netjes en de aanroeper beslist wat er gebeurt.
      profielFout = error;
      return [];
    }
    return (data ?? []) as Profiel[];
  };


  // ⚠️ **Per pagina verwerken en niet eerst alles inlezen.** Alle profielen in
  //    het geheugen zetten lost de stille afkapping wél op, maar houdt de kosten
  //    lineair in het tótale aantal gebruikers — precies wat dit issue aanwijst.
  let profielenGezien = 0;

  for await (const pagina of paginas(haalProfielen, PROFIELEN_PER_PAGINA)) {
    if (profielFout !== null) break;
    profielenGezien += pagina.length;

    for (const profiel of pagina) {
      // ⚠️ In een try, om dezelfde reden als in de rollover: `profiles.tz` is
      //    vrije tekst zonder controle en `Intl` gooit op een onbekende zone.
      //    Zonder dit legt één profiel met een typefout de meldingen voor iedereen
      //    stil. De echte reparatie is een CHECK op die kolom (Q-TODO A38).
      let lokaalUur: number;
      let lokaleDatum: string;
      try {
        const p = partsIn(profiel.tz, nu);
        lokaalUur = p.hour;
        lokaleDatum = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
      } catch (fout) {
        console.error(
          `tijdzone onbruikbaar (tz=${profiel.tz}): ${
            fout instanceof Error ? fout.message : String(fout)
          }`,
        );
        // ⚠️ De tijdzone gaat niet mee naar buiten: dicht genoeg bij een
        //    woonplaats om hem niet in een foutdashboard te willen hebben.
        await meld(fout, 'notificaties.tijdzone', { code: 'tz_onbruikbaar' });
        overgeslagen += 1;
        continue;
      }

      // ⚠️ Eén keer per profiel uitgerekend en niet per melding: het antwoord
      //    hangt alleen van het lokale uur af, en de lus eronder doet vijf
      //    soorten.
      const inStilte = inStilteVenster(lokaalUur, profiel.quiet_from, profiel.quiet_to);

      const { data: tokens } = await db
        .from('push_tokens')
        .select('token, platform, p256dh, auth')
        .eq('user_id', profiel.id);

      const apparaten = (tokens ?? []) as Token[];

      if (apparaten.length === 0) {
        // Geen apparaat geregistreerd. Vandaag geldt dat voor iedereen, en de
        // reden is per platform een andere (QS8-366): native heeft geen build
        // uitgerold, en op web wacht de registratie op een VAPID-sleutelpaar en
        // op de knop in Profiel — QS8-124.
        zonderToken += 1;
        continue;
      }

      // -----------------------------------------------------------------------
      // 1. De dagelijkse nudge — QS8-77
      // -----------------------------------------------------------------------
      // ⚠️ **De zes dure vragen staan achter de gratis poort** — QS8-341. Hier
      //    stond een object-literal die ze alle zes eager evalueerde, terwijl
      //    `nudgeReden()` op de eerste drie gratis velden al kortsluit: voor de
      //    23 van de 24 uren waarin deze gebruiker sowieso niets krijgt, en voor
      //    iedereen met `reminder_enabled = false`, was dat weggegooid werk.
      //
      // ⚠️ De poort en de beslissing zijn dezelfde code — `nudgeBesluit()` roept
      //    `nudgeVoorpoortReden()` aan en daarna `nudgeReden()`. Er staat hier
      //    dus géén kopie van de drie voorwaarden die uit de pas kan lopen.
      const besluit = await nudgeBesluit(
        {
          herinneringAan: profiel.reminder_enabled,
          // ⚠️ **Verschoven en niet onderdrukt — het besluit van QS8-406.** Een
          //    herinnering die in de stille uren valt, zou anders die dag
          //    helemaal niet gaan; bij 23:00 met stilte 22→7 nóóit meer. Nu komt
          //    hij op het eerste luide uur. Zie `verschovenUur()` voor waarom dit
          //    geen validatie is geworden.
          herinneringUur: verschovenUur(
            uurUit(profiel.reminder_time),
            profiel.quiet_from,
            profiel.quiet_to,
          ),
          lokaalUur,
        },
        {
          heeftDagzet: () => heeftDagzetVandaag(db, profiel.id, lokaleDatum),
          heeftAfronding: () => heeftAfrondingVandaag(db, profiel.id, lokaleDatum),
          heeftOpenWeekdoel: () => heeftOpenWeekdoel(db, profiel.id),
          inAdempauze: () => inAdempauze(db, profiel.id, lokaleDatum),
          alleenSlapendeGroepen: () => alleenSlapendeGroepen(db, profiel.id),
          alVerstuurd: () => alVerstuurd(db, profiel.id, 'nudge', lokaleDatum, null),
        },
      );

      if (besluit.mag) {
        const toon: Toon = profiel.reminder_tone === 'firm' ? 'firm' : 'gentle';
        const stand = await stuur(db, {
          userId: profiel.id,
          apparaten,
          voorkeuren: profiel,
          inStilte,
          nu,
          soort: 'nudge',
          bericht: nudgeBericht(toon, taalVan(profiel)),
          lokaleDatum,
          refId: null,
        });
        if (stand === 'verstuurd') verstuurd += 1;
        if (stand === 'onderdrukt') onderdrukt += 1;
      }

      // -----------------------------------------------------------------------
      // 2. Goedkeuringsverzoeken — een buddy wacht op jou
      // -----------------------------------------------------------------------
      //
      // ⚠️ Eén melding per voltooiing (`ref_id`), niet één per dag. Twee buddy's
      //    die op je wachten zijn twee verzoeken, en dan is samenvoegen tot "er
      //    wacht iets" minder bruikbaar. De unieke index op (user_id, kind,
      //    ref_id) houdt het bij één per stuk.
      const teBeoordelen = await openBeoordelingen(db, profiel.id);

      for (const rij of teBeoordelen) {
        if (await alVerstuurd(db, profiel.id, 'approval_request', lokaleDatum, rij.completionId)) {
          continue;
        }

        const stand = await stuur(db, {
          userId: profiel.id,
          apparaten,
          voorkeuren: profiel,
          inStilte,
          nu,
          soort: 'approval_request',
          bericht: berichtVoor('approval_request', { naam: rij.naam }, taalVan(profiel)),
          lokaleDatum,
          refId: rij.completionId,
        });
        if (stand === 'verstuurd') verstuurd += 1;
        if (stand === 'onderdrukt') onderdrukt += 1;
      }

      // -----------------------------------------------------------------------
      // 3. Ontvangen goedkeuringen — goed nieuws over jezelf
      // -----------------------------------------------------------------------
      const ontvangen = await verseGoedkeuringen(db, profiel.id);

      for (const rij of ontvangen) {
        if (await alVerstuurd(db, profiel.id, 'approval_received', lokaleDatum, rij.approvalId)) {
          continue;
        }

        const stand = await stuur(db, {
          userId: profiel.id,
          apparaten,
          voorkeuren: profiel,
          inStilte,
          nu,
          soort: 'approval_received',
          bericht: berichtVoor('approval_received', { naam: rij.naam }, taalVan(profiel)),
          lokaleDatum,
          refId: rij.approvalId,
        });
        if (stand === 'verstuurd') verstuurd += 1;
        if (stand === 'onderdrukt') onderdrukt += 1;
      }

      // -----------------------------------------------------------------------
      // 4. Het cyclusoverzicht — je week is afgelopen
      // -----------------------------------------------------------------------
      //
      // ⚠️ Op de eerste dag van je nieuwe cyclus, op je eigen herinneringsuur (of
      //    negen uur als je er geen hebt ingesteld). Dat is het moment waarop
      //    terugkijken zin heeft: de vorige week is dicht en de nieuwe is nog leeg.
      //
      // ⚠️ De cyclusgrens komt uit `shared/time` en wordt hier niet uitgerekend —
      //    correctheidsregel 7. Zonder dat zou deze job een eigen antwoord geven
      //    op "welke week is het", en dan lopen de app en de meldingen uit elkaar
      //    voor iedereen met een andere week-startdag.
      try {
        const cyclus = userCycle(
          { weekStartDay: profiel.week_start_day as Weekday, tz: profiel.tz },
          nu,
        );

        // ⚠️ **Nooit vóór de coulanceperiode** — QS8-202. Het waarom staat bij
        //    `overzichtsuur()`; de korte versie is dat de rollover een gemiste week
        //    pas ná `GRACE_HOURS` afschrijft, dus vóór dat uur is "is er een weekpas
        //    verbruikt" per definitie nee — en de ontdubbeling laat die dag geen
        //    tweede melding meer toe.
        // ⚠️ Zelfde verschuiving als bij de nudge: valt het overzichtsuur in de
        //    stille uren, dan komt het overzicht op het eerste luide uur in
        //    plaats van die week helemaal niet.
        const basisUur = overzichtsuur(uurUit(profiel.reminder_time), GRACE_HOURS);
        // ⚠️ De `??` is typenarrowing en geen gedrag: `verschovenUur()` geeft
        //    alleen `null` terug op een `null`-invoer, en `overzichtsuur()` geeft
        //    altijd een getal. De tak is dus onbereikbaar en staat er omdat de
        //    handtekening hem toelaat.
        const overzichtsUur =
          verschovenUur(basisUur, profiel.quiet_from, profiel.quiet_to) ?? basisUur;

        // ⚠️ **Niet over een week waarin je met opzet niets deed.** De nudge en het
        //    goedkeuringsverzoek slaan een lid met een lopende adempauze al over
        //    (`regels.ts`, `magNudgen`); dit overzicht deed dat tot 25-08-2026 niet,
        //    dus wie een adempauze had aangekondigd kreeg tóch "je week is
        //    afgelopen" — precies het duwtje waar een adempauze voor bedoeld is om
        //    het níét te krijgen. Gevonden bij het nameten van QS8-91.
        //
        // ⚠️ Op de **vorige** cyclus en niet op vandaag: dit bericht kijkt terug op
        //    de week die net dicht is, en vandaag is de eerste dag van de nieuwe.
        //    De grens komt uit `shared/time` en wordt hier niet uitgerekend
        //    (correctheidsregel 7).
        //
        // ⚠️ De vraag staat bínnen de tijdvoorwaarde en niet ervoor. Ervoor is het
        //    een extra query per profiel per ronde voor een bericht dat hoogstens
        //    één keer per week valt (onwrikbare regel 12).
        // ⚠️ **`>=` en niet `===`, en dat is een reparatie die los van de stille
        //    uren al nodig was.** Met een gelijkheid kost één mislukte job-run om
        //    het overzichtsuur stilzwijgend het hele weekoverzicht van die
        //    gebruiker — dezelfde klasse als QS8-202. De ontdubbeling op
        //    `(user_id, 'cycle_summary', local_date)` houdt het bij één, dus
        //    later alsnog sturen kan geen tweede opleveren.
        if (cyclus.startDate === lokaleDatum && lokaalUur >= overzichtsUur) {
          const afgelopen = previousCycle(cyclus);
          const wasAdempauze = await inAdempauze(db, profiel.id, afgelopen.startDate);

          if (!wasAdempauze && !(await alVerstuurd(db, profiel.id, 'cycle_summary', lokaleDatum, null))) {
            // ⚠️ **Hier hing QS8-202.** "Een weekpas heeft je reeks gered" stond
            //    alleen als privéblok op het dashboard, en wie de app die week niet
            //    opende, hoorde het nooit. Dit is het enige moment waarop de app
            //    hem uit zichzelf bereikt, en het valt precies goed: de rollover
            //    verbruikt de pas op de cyclusgrens en dit bericht gaat over
            //    diezelfde net afgesloten week.
            //
            // ⚠️ **Strikt persoonlijk, en dat is de hele reden dat het een `push`
            //    is en geen systeembericht.** Een verbruikte weekpas is het bewijs
            //    van een gemiste week (domeinregel 7). Deze melding gaat naar de
            //    apparaten van de eigenaar en nergens anders heen; de soort blijft
            //    `cycle_summary`, dus er komt geen groepsoppervlak bij.
            //
            // ⚠️ De vraag staat bínnen de tijdvoorwaarde, om dezelfde reden als de
            //    adempauze hierboven: ervoor is het een extra query per profiel per
            //    ronde voor een bericht dat hoogstens één keer per week valt.
            const weekpasGered = await weekpasVerbruikt(db, profiel.id, afgelopen.startDate);

            const stand = await stuur(db, {
              userId: profiel.id,
              apparaten,
              voorkeuren: profiel,
              inStilte,
              nu,
              // ⚠️ De sóórt blijft `cycle_summary` en alleen de tékst verandert.
              //    `notifications_sent_kind_bekend` (0053) kent vier waarden; een
              //    vijfde zou een migratie zijn, en de ontdubbeling op
              //    `(user_id, kind, local_date)` zou een tweede melding over
              //    dezelfde week toelaten.
              //
              // ⚠️ Dit bestand staat buiten `tsc` (Deno), dus het type houdt hier
              //    niets tegen. De grendel is de grep in
              //    `tests/beloftes/weekpas-bereikt-je.test.ts`.
              soort: 'cycle_summary',
              bericht: berichtVoor('cycle_summary', { weekpasGered }, taalVan(profiel)),
              lokaleDatum,
              refId: null,
            });
            if (stand === 'verstuurd') verstuurd += 1;
            if (stand === 'onderdrukt') onderdrukt += 1;
          }
        }
      } catch (fout) {
        console.error(
          `cyclus bepalen mislukte voor een profiel: ${
            fout instanceof Error ? fout.message : String(fout)
          }`,
        );
        await meld(fout, 'notificaties.cyclus', { code: 'cyclus_onbepaalbaar', userId: profiel.id });
      }

      // -----------------------------------------------------------------------
      // 5. Je bent getuige — een straf van een ander is verschuldigd geworden
      // -----------------------------------------------------------------------
      //
      // ⚠️ **De enige soort die over een ander gaat, en dat is een uitzondering
      //    met een naam.** Domeinregel 7 noemt er precies één: een straf die de
      //    gebruiker zelf vooraf heeft ingesteld en bevestigd. De eigenaar heeft
      //    deze getuige zélf aangewezen, de melding gaat pas af bij `due`
      //    (domeinregel 11), en er gaat niets naar de groep. Uitgeschreven in
      //    migratie 0178 en in `docs/decisions/2026-09-07-de-getuige-hoort-het-...`.
      //
      // ⚠️ **Niet via de groepschat**, ook niet als de getuige toevallig in een
      //    groep van de eigenaar zit. Dan zou de hele groep horen wat expliciet
      //    naar één persoon ging — de verruiming die QS8-228 níét maakte.
      //
      // ⚠️ Eén melding per commitment (`ref_id`) en niet één per dag, zelfde vorm
      //    als het goedkeuringsverzoek: twee straffen waarvan je getuige bent zijn
      //    twee dingen om te weten. De grens staat in `getuigenissen_voor()`
      //    (limiet 50) en niet hier.
      const getuigenissen = await openGetuigenissen(db, profiel.id);

      for (const rij of getuigenissen) {
        if (await alVerstuurd(db, profiel.id, 'commitment_witness', lokaleDatum, rij.commitmentId)) {
          continue;
        }

        const stand = await stuur(db, {
          userId: profiel.id,
          apparaten,
          voorkeuren: profiel,
          inStilte,
          nu,
          soort: 'commitment_witness',
          bericht: berichtVoor('commitment_witness', { naam: rij.naam }, taalVan(profiel)),
          lokaleDatum,
          refId: rij.commitmentId,
        });
        if (stand === 'verstuurd') verstuurd += 1;
        if (stand === 'onderdrukt') onderdrukt += 1;
      }
    }
  }

  // ⚠️ **De foutcontrole staat ná de lus, want daar wordt hij pas gezet.**
  //    Hij stond eerst vóór de query-definitie, en dan kan hij per constructie
  //    nooit vuren — de vorm van een grendel die er wel staat en niets bewaakt.
  if (profielFout !== null) {
    // ⚠️ **De cast staat hier om dezelfde reden als in de rollover (r.512).**
    //    TypeScript volgt geen toekenning die in een closure gebeurt, dus na de
    //    declaratie op `null` versmalt hij dit type tot `never` — en dan bestaat
    //    `.message` niet meer. Deno's typecheck is daar strenger in dan die van
    //    de app, en dít bestand valt buiten `tsconfig.json`: `npx tsc --noEmit`
    //    keek er dus nooit naar.
    const fout = profielFout as { message: string; code?: string };
    // ⚠️ **Zie de rollover — en hier stond dezelfde onjuiste geruststelling
    //    (QS8-315).** De dossierrij van 04-09 noemde twee plekken in de
    //    rollover; dit is de derde, in een functie die de rij niet noemde.
    //    Zelfde vorm als QS8-206, waar de rij twee `console.error` telde en het
    //    er elf in twee functies bleken: de klasse is groter dan de aanleiding,
    //    en dáárom staat er nu een grendel onder (`meldtekst:controle`).
    console.error(`profielen ophalen mislukte: ${fout.message}`);
    await meld(new Error('profielen ophalen mislukte'), 'notificaties.profielen', {
      code: 'profielen_ophalen_mislukt',
      sqlstate: fout.code,
    });
    // ⚠️ Een slug en niet de melding, om dezelfde gemeten reden als in de
    //    rollover: `notificaties.yml:70` doet `cat` op deze body vóór de
    //    statuscontrole, en dat runlog staat publiek.
    return new Response(JSON.stringify({ error: 'profielen_ophalen_mislukt' }), { status: 500 });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      verstuurd,
      onderdrukt,
      overgeslagen,
      zonderToken,
      profielen: profielenGezien,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

// ---------------------------------------------------------------------------
// De vragen die de regels stellen
// ---------------------------------------------------------------------------

// ⚠️ `Db` moet van een échte aanroep komen en niet van `createClient` zelf.
//    `ReturnType<typeof createClient>` vult de generieke parameters met hun
//    *constraint* in plaats van met hun default, en dat levert
//    `SupabaseClient<unknown, …, never, never>` op. Elke helper hieronder kreeg
//    daarmee een `db` die niets accepteert wat `createClient(url, key)` teruggeeft,
//    en `.rpc()` en `.insert()` kregen argumenttypes `undefined` en `never[]`.
//    Achttien fouten, en geen ervan was zichtbaar zolang deze map buiten
//    typecheck stond. Door de client via een gewone functie te bouwen, is `Db`
//    precies het type dat hier daadwerkelijk rondgaat — en blijft het dat ook
//    als de opties ooit veranderen.
function maakClient(sleutel: string) {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', sleutel, {
    auth: { persistSession: false },
  });
}

type Db = ReturnType<typeof maakClient>;

async function heeftDagzetVandaag(db: Db, userId: string, datum: string): Promise<boolean> {
  const { count } = await db
    .from('daily_moves')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('local_date', datum);

  return (count ?? 0) > 0;
}

async function heeftAfrondingVandaag(db: Db, userId: string, datum: string): Promise<boolean> {
  // ⚠️ Op `submitted_at` en niet op `cycle_start_date`: de vraag is of hij
  //    vandáág iets gedaan heeft, niet of er deze week iets ligt.
  const { count } = await db
    .from('completions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('submitted_at', `${datum}T00:00:00Z`)
    .lte('submitted_at', `${datum}T23:59:59Z`);

  return (count ?? 0) > 0;
}

async function heeftOpenWeekdoel(db: Db, userId: string): Promise<boolean> {
  const { count } = await db
    .from('weekly_goals')
    .select('id, goals!inner(owner_id)', { count: 'exact', head: true })
    .eq('goals.owner_id', userId)
    .eq('status', 'todo');

  return (count ?? 0) > 0;
}

async function inAdempauze(db: Db, userId: string, datum: string): Promise<boolean> {
  const { count } = await db
    .from('breathers')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .lte('starts_cycle', datum)
    .gte('ends_cycle', datum);

  return (count ?? 0) > 0;
}

/**
 * Is er een weekpas verbruikt voor de cyclus die op `datum` begon? — QS8-202.
 *
 * ⚠️ **Leest `week_pass_events` rechtstreeks en niet `weekpas_standen()`.** Die
 *    RPC filtert op `auth.uid()` en deze job draait als `service_role`, dus daar
 *    zou hij nul rijen krijgen. Bovendien geeft hij `max(cycle_start_date)` per
 *    doel, en de vraag hier is smaller: is er voor déze week iets verbruikt.
 *
 * ⚠️ `head: true` met een `count`: er hoeft geen rij mee terug, alleen het
 *    antwoord ja of nee. Eén doel is genoeg om de zin te verantwoorden.
 */
async function weekpasVerbruikt(db: Db, userId: string, datum: string): Promise<boolean> {
  const { count, error } = await db
    .from('week_pass_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('event', 'spent')
    .eq('cycle_start_date', datum);

  // ⚠️ **Een mislukte vraag is niet hetzelfde als "geen weekpas".** Zonder deze
  //    tak wordt een schemawijziging of een ingetrokken recht stilzwijgend het
  //    gewone weekoverzicht, en de ontdubbeling maakt dat voor die week
  //    definitief: de gebruiker hoort het nooit meer. Coderegel 14, en dezelfde
  //    vorm als `openBeoordelingen()` hieronder.
  if (error) {
    console.error(`weekpas-stand ophalen mislukte: ${error.message}`);
    await meld(error, 'notificaties.weekpas', { code: 'weekpas_onleesbaar' });
  }

  return (count ?? 0) > 0;
}

/**
 * ⚠️ "Alleen slapende groepen" en niet "geen enkele actieve groep". Wie in geen
 *    enkele groep zit, hoort zijn nudge gewoon te krijgen — solo werken mag, en
 *    dan is er niets dat slaapt.
 */
async function alleenSlapendeGroepen(db: Db, userId: string): Promise<boolean> {
  const { data } = await db
    .from('group_members')
    .select('groups!inner(status)')
    .eq('user_id', userId)
    .eq('status', 'active');

  const groepen = (data ?? []) as unknown as { groups: { status: string } | null }[];
  if (groepen.length === 0) return false;

  return groepen.every((g) => g.groups?.status === 'sleeping');
}

async function alVerstuurd(
  db: Db,
  userId: string,
  kind: Melding,
  datum: string,
  refId: string | null,
): Promise<boolean> {
  let vraag = db
    .from('notifications_sent')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', kind);

  vraag = refId === null ? vraag.eq('local_date', datum).is('ref_id', null) : vraag.eq('ref_id', refId);

  const { count } = await vraag;
  return (count ?? 0) > 0;
}

/**
 * Voltooiingen die op het oordeel van deze gebruiker wachten.
 *
 * ⚠️ Via `te_beoordelen_voor()` (migratie 0054) en **niet** via
 *    `openstaande_beoordelingen()`. Die laatste is geen SECURITY DEFINER en
 *    leunt op de RLS van de aanroeper; deze job draait als `service_role` en
 *    zou daarmee élke openstaande voltooiing in het hele project terugkrijgen.
 *    Een melding daarop baseren betekent iedereen een bericht sturen over de
 *    week van een wildvreemde. De autorisatiegrens staat nu in de functie zelf.
 */
async function openBeoordelingen(
  db: Db,
  userId: string,
): Promise<{ completionId: string; naam: string }[]> {
  const { data, error } = await db.rpc('te_beoordelen_voor', { p_user_id: userId });

  if (error) {
    console.error(`te beoordelen ophalen mislukte voor een gebruiker: ${error.message}`);
    return [];
  }

  const rijen = (data ?? []) as unknown as {
    completion_id: string;
    owner_name: string | null;
  }[];

  return rijen.map((r) => ({ completionId: r.completion_id, naam: r.owner_name ?? '' }));
}

/** Goedkeuringen op je eigen weken van de afgelopen dag. */
async function verseGoedkeuringen(
  db: Db,
  userId: string,
): Promise<{ approvalId: string; naam: string }[]> {
  const sinds = new Date(Date.now() - 26 * 3_600_000).toISOString();

  const { data, error } = await db
    .from('completion_approvals')
    .select('id, approver_id, subject_id, status, created_at')
    .eq('subject_id', userId)
    .eq('status', 'approved')
    .gte('created_at', sinds)
    .limit(20);

  if (error) {
    console.error(`goedkeuringen ophalen mislukte voor een gebruiker: ${error.message}`);
    return [];
  }

  return ((data ?? []) as { id: string }[]).map((r) => ({ approvalId: r.id, naam: '' }));
}

/**
 * De verschuldigde straffen waarvan deze gebruiker de getuige is — QS8-298.
 *
 * ⚠️ Via `getuigenissen_voor()` (migratie 0178) en **niet** via `getuigenissen()`.
 *    Die laatste leest `auth.uid()` en is voor de app; deze job draait als
 *    `service_role` en heeft daar geen. Dezelfde reden waarom `openBeoordelingen`
 *    op `te_beoordelen_voor()` leunt en niet op `openstaande_beoordelingen()`:
 *    de autorisatiegrens hoort in de functie en niet in de aanroeper.
 */
async function openGetuigenissen(
  db: Db,
  userId: string,
): Promise<{ commitmentId: string; naam: string }[]> {
  const { data, error } = await db.rpc('getuigenissen_voor', { p_user_id: userId });

  if (error) {
    console.error(`getuigenissen ophalen mislukte voor een gebruiker: ${error.message}`);
    return [];
  }

  const rijen = (data ?? []) as unknown as {
    commitment_id: string;
    eigenaar_naam: string | null;
  }[];

  return rijen.map((r) => ({ commitmentId: r.commitment_id, naam: r.eigenaar_naam ?? '' }));
}

/**
 * Waar `ref_id` naar wijst — QS8-298.
 *
 * ⚠️ **Hier stond `'completion'` voor élke soort met een `ref_id`.** Voor
 *    `approval_request` klopt dat, voor `approval_received` wees het al naar de
 *    verkeerde tabel, en met `commitment_witness` erbij zou de rij zeggen dat
 *    een commitment-id een voltooiing is. Er is geen CHECK op
 *    `notifications_sent.ref_type` die dat vangt, en vandaag leest niets die
 *    kolom — dus niets werd er rood van. Precies de vorm waar regel 18 over
 *    gaat: de volgende die er een join op bouwt, krijgt het verkeerde id.
 */
function refTypeVoor(soort: Melding, refId: string | null): string | null {
  if (refId === null) return null;
  if (soort === 'approval_request') return 'completion';
  if (soort === 'approval_received') return 'approval';
  if (soort === 'commitment_witness') return 'commitment';
  return null;
}

// ---------------------------------------------------------------------------
// Versturen
// ---------------------------------------------------------------------------

/**
 * De VAPID-sleutels uit de omgeving, of `null` als ze er niet zijn.
 *
 * ⚠️ Ontbreken ze, dan is dat geen storing maar de stand van vandaag: er is nog
 *    geen sleutelpaar gegenereerd. Native meldingen gaan gewoon door; web-tokens
 *    worden overgeslagen en dat wordt gemeld.
 */
function vapidUitOmgeving(): VapidSleutels | null {
  const publiek = Deno.env.get('EXPO_PUBLIC_VAPID_PUBLIC_KEY') ?? '';
  const prive = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  const subject = Deno.env.get('VAPID_SUBJECT') ?? '';
  if (publiek === '' || prive === '' || subject === '') return null;
  return { publiek, prive, subject };
}

/**
 * Levert af bij de browserabonnementen van één gebruiker.
 *
 * ⚠️ Een abonnement dat 404 of 410 geeft, bestaat niet meer — de gebruiker heeft
 *    zijn toestemming ingetrokken of de browser opnieuw geïnstalleerd. Die rij
 *    gaat weg, want anders probeert elke ronde opnieuw een adres dat nooit meer
 *    werkt. Elke ándere fout laat de rij staan: een storing van dit moment mag
 *    geen dataverlies worden. Dat onderscheid staat onder test in
 *    `src/modules/notifications/webpush-verzenden.test.ts`.
 */
async function stuurWeb(
  db: Db,
  abonnementen: readonly Token[],
  bericht: Bericht,
  soort: Melding,
  sleutels: VapidSleutels,
  nu: Date,
): Promise<number> {
  let bezorgd = 0;

  for (const rij of abonnementen) {
    if (rij.p256dh === null || rij.auth === null) {
      // De CHECK uit 0062 sluit dit uit; belandt het hier tóch, dan is de rij
      // stuk en niet het abonnement.
      console.error('web-token zonder sleutels overgeslagen');
      continue;
    }

    const doel: WebPushDoel = { endpoint: rij.token, p256dh: rij.p256dh, auth: rij.auth };
    const uitkomst = await verstuurWebPush({
      doel,
      bericht: { titel: bericht.titel, body: bericht.body, pad: bericht.pad, soort },
      sleutels,
      nu,
      fetchImpl: fetch,
    });

    if (uitkomst.status === 'bezorgd') {
      bezorgd += 1;
      continue;
    }

    if (uitkomst.status === 'weg') {
      const { error } = await db.from('push_tokens').delete().eq('token', rij.token);
      if (error) console.error(`verlopen abonnement opruimen mislukte: ${error.message}`);
      continue;
    }

    console.error(`web push mislukte: ${uitkomst.reden}`);
  }

  return bezorgd;
}

/**
 * De native helft: één verzoek aan Expo voor alle toestellen van deze gebruiker.
 *
 * @returns hoeveel adressen er bereikt zijn — nul of alle, want Expo neemt de
 *   hele batch aan of geen.
 */
async function stuurExpo(
  userId: string,
  apparaten: readonly Token[],
  soort: Melding,
  bericht: Bericht,
): Promise<number> {
  const berichten = apparaten.map((t) => ({
    to: t.token,
    title: bericht.titel,
    body: bericht.body,
    // De diepe link. `expo-router` leest dit uit `data.pad`.
    data: { pad: bericht.pad, soort },
    sound: 'default',
  }));

  try {
    const antwoord = await fetch(EXPO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(berichten),
      // CLAUDE.md coderegel 14: elke externe call heeft een timeout.
      signal: AbortSignal.timeout(15_000),
    });

    if (!antwoord.ok) {
      console.error(`Expo gaf HTTP ${antwoord.status} voor een gebruiker`);
      return 0;
    }

    return apparaten.length;
  } catch (fout) {
    console.error(
      `versturen mislukte voor een gebruiker: ${fout instanceof Error ? fout.message : String(fout)}`,
    );
    // ⚠️ Dit is de stap die de keten van EPIC 11 afmaakt. Valt hij om, dan komt
    //    er geen enkele melding aan en is er verder geen enkel signaal.
    await meld(fout, 'notificaties.versturen', { code: 'versturen_mislukt', userId });
    return 0;
  }
}

/**
 * Stuurt naar elk geregistreerd apparaat en legt vast dát er gestuurd is.
 *
 * ⚠️ **Twee bestemmingen sinds 25-08-2026.** Een native token gaat naar Expo, een
 *    browserabonnement rechtstreeks naar de pushdienst van die browser, met een
 *    versleutelde payload en een VAPID-kop. Tot die datum kende deze functie er
 *    één, en een webabonnement — dat een endpoint-URL ís — ging dus naar Expo,
 *    dat er niets mee kan. De crypto stond er, de sleutels stonden in
 *    `.env.example`, de service worker was geregistreerd; alleen deze schakel
 *    ontbrak, en er was daardoor niets kapot om rood van te worden.
 *
 * ⚠️ De rij in `notifications_sent` wordt **vóór** het versturen geschreven, en
 *    dat is een bewuste ruil. Andersom levert een crash tussen versturen en
 *    vastleggen een tweede melding op bij de volgende run; zo levert een
 *    mislukte verzending hooguit een gemiste melding op. Een dubbele push is
 *    vervelender dan een gemiste — en de unieke index is de grendel die deze
 *    volgorde pas betrouwbaar maakt.
 *
 * ⚠️ **Maar een ronde waarin níéts is aangekomen, haalt die rij weer weg.** Zonder
 *    dat staat er een permanent "verstuurd" voor een melding die nooit bezorgd
 *    is, en zorgt precies die dedupe-index dat hij ook nooit meer geprobeerd
 *    wordt. Deelt de aflevering zich — native gelukt, web mislukt — dan blijft de
 *    rij staan: er ís dan iemand bereikt, en opnieuw sturen zou een dubbele
 *    melding zijn.
 */
/**
 * Wat er met één melding gebeurd is.
 *
 * ⚠️ **Drie standen en geen `boolean`, en dat is niet cosmetisch.** `false`
 *    betekende "mislukt"; met een schakelaar erbij zou het "mislukt óf bewust
 *    onderdrukt" gaan betekenen, en dan is er geen enkele plek meer waar je kunt
 *    zien dat het mechanisme zijn werk doet. Een job heeft geen scherm — dit
 *    onderscheid ís zijn tegenhanger van onwrikbare regel 16.
 */
type Verzendstand = 'verstuurd' | 'onderdrukt' | 'mislukt';

async function stuur(
  db: Db,
  opdracht: {
    userId: string;
    apparaten: readonly Token[];
    soort: Melding;
    bericht: Bericht;
    lokaleDatum: string;
    refId: string | null;
    nu: Date;
    voorkeuren: Meldingsvoorkeuren;
    inStilte: boolean;
  },
): Promise<Verzendstand> {
  // ⚠️⚠️ **Het keelpunt, en het staat vóór de rij in `notifications_sent`.**
  //    Alle vijf de soorten gaan hier langs; een zesde kan er niet omheen zonder
  //    deze functie te omzeilen, en dat bewaakt
  //    `tests/beloftes/elke-soort-passeert-de-poort.test.ts`.
  //
  // ⚠️ **Vóór de insert en niet erna, en dat verschil is dataverlies.** Wordt de
  //    rij wél geschreven en de melding niet verstuurd, dan is de ontdubbeling
  //    verbruikt: zet de gebruiker de soort later weer aan, dan komt die melding
  //    nooit meer. Nu blijft de rij weg en probeert de volgende ronde opnieuw —
  //    en de queries erboven leveren alleen wat nog openstaat, dus er ontstaat
  //    geen stapel oude meldingen.
  const reden = meldingPoortReden(opdracht.soort, opdracht.voorkeuren, opdracht.inStilte);
  if (reden !== null) return 'onderdrukt';

  const { data: logRij, error: logFout } = await db
    .from('notifications_sent')
    .insert({
      user_id: opdracht.userId,
      kind: opdracht.soort,
      local_date: opdracht.lokaleDatum,
      ref_type: refTypeVoor(opdracht.soort, opdracht.refId),
      ref_id: opdracht.refId,
    })
    .select('id')
    .single();

  if (logFout) {
    // Een unieke-indexfout betekent dat een andere run hem al gestuurd heeft.
    // Dat is geen storing maar precies waar die index voor is.
    if (logFout.code !== '23505') {
      console.error(`melding vastleggen mislukte voor een gebruiker: ${logFout.message}`);
    }
    return 'mislukt';
  }

  const web = opdracht.apparaten.filter((t) => t.platform === 'web');
  const native = opdracht.apparaten.filter((t) => t.platform !== 'web');

  let bezorgd = 0;

  if (native.length > 0) {
    bezorgd += await stuurExpo(opdracht.userId, native, opdracht.soort, opdracht.bericht);
  }

  if (web.length > 0) {
    const sleutels = vapidUitOmgeving();
    if (sleutels === null) {
      console.error('VAPID-sleutels ontbreken; web-abonnementen overgeslagen');
    } else {
      bezorgd += await stuurWeb(db, web, opdracht.bericht, opdracht.soort, sleutels, opdracht.nu);
    }
  }

  if (bezorgd === 0) {
    // Niets aangekomen. De rij weer weg, zodat de volgende ronde het opnieuw mag
    // proberen in plaats van hem als verstuurd te beschouwen.
    const { error } = await db
      .from('notifications_sent')
      .delete()
      .eq('id', (logRij as { id: string }).id);
    if (error) {
      console.error(
        `mislukte melding kon niet teruggedraaid worden voor een gebruiker: ${error.message}`,
      );
    }
    return 'mislukt';
  }

  return 'verstuurd';
}
