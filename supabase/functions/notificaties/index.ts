import { createClient } from 'jsr:@supabase/supabase-js@2';

// ⚠️ Rechtstreeks uit de bestanden en niet via een index. Zie de rollover: een
//    index re-exporteert ook `clock.ts`, dat `process.env` leest om `freezeNow()`
//    in productie te weigeren — op Deno is dat een valkuil die je pas merkt als
//    de job stilvalt.
import { partsIn } from '../_shared/time/zoned.ts';
import { previousCycle, userCycle } from '../_shared/time/cycle.ts';
import type { Weekday } from '../_shared/time/types.ts';
import { meld } from '../_shared/melden.ts';
import {
  berichtVoor,
  magNudgen,
  nudgeBericht,
  type Taalcode,
  uurUit,
  type Bericht,
  type Melding,
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
 * ⚠️ **Domeinregel 7.** Er zijn vier soorten en geen ervan gaat over de
 *    tegenslag van een ander; de CHECK op `notifications_sent.kind` dwingt dat
 *    af. Zie `_shared/notificaties/regels.ts` voor de onderbouwing.
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

Deno.serve(async (req: Request) => {
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
});

async function draaiNotificaties(auth: string): Promise<Response> {
  const db = maakClient(
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? auth.replace(/^Bearer\s+/i, ''),
  );

  const nu = new Date();
  let verstuurd = 0;
  let overgeslagen = 0;
  let zonderToken = 0;

  const { data: profielen, error: profielFout } = await db
    .from('profiles')
    .select('id, tz, week_start_day, reminder_enabled, reminder_time, reminder_tone, locale');

  if (profielFout) {
    // ⚠️ Zie de rollover: de melding van Postgres wordt geschoond voor verzending.
    await meld(
      new Error(`profielen ophalen mislukte: ${profielFout.message}`),
      'notificaties.profielen',
      { code: 'profielen_ophalen_mislukt' },
    );
    return new Response(JSON.stringify({ error: profielFout.message }), { status: 500 });
  }

  for (const profiel of (profielen ?? []) as Profiel[]) {
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

    const { data: tokens } = await db
      .from('push_tokens')
      .select('token, platform, p256dh, auth')
      .eq('user_id', profiel.id);

    const apparaten = (tokens ?? []) as Token[];

    if (apparaten.length === 0) {
      // Geen apparaat geregistreerd. Vandaag geldt dat voor iedereen, want
      // `expo-notifications` staat nog niet in de app.
      zonderToken += 1;
      continue;
    }

    // -----------------------------------------------------------------------
    // 1. De dagelijkse nudge — QS8-77
    // -----------------------------------------------------------------------
    const situatie = {
      herinneringAan: profiel.reminder_enabled,
      herinneringUur: uurUit(profiel.reminder_time),
      lokaalUur,
      heeftDagzet: await heeftDagzetVandaag(db, profiel.id, lokaleDatum),
      heeftAfronding: await heeftAfrondingVandaag(db, profiel.id, lokaleDatum),
      heeftOpenWeekdoel: await heeftOpenWeekdoel(db, profiel.id),
      inAdempauze: await inAdempauze(db, profiel.id, lokaleDatum),
      alleenSlapendeGroepen: await alleenSlapendeGroepen(db, profiel.id),
      alVerstuurd: await alVerstuurd(db, profiel.id, 'nudge', lokaleDatum, null),
    };

    if (magNudgen(situatie)) {
      const toon: Toon = profiel.reminder_tone === 'firm' ? 'firm' : 'gentle';
      const gelukt = await stuur(db, {
        userId: profiel.id,
        apparaten,
        nu,
        soort: 'nudge',
        bericht: nudgeBericht(toon, taalVan(profiel)),
        lokaleDatum,
        refId: null,
      });
      if (gelukt) verstuurd += 1;
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

      const gelukt = await stuur(db, {
        userId: profiel.id,
        apparaten,
        nu,
        soort: 'approval_request',
        bericht: berichtVoor('approval_request', { naam: rij.naam }, taalVan(profiel)),
        lokaleDatum,
        refId: rij.completionId,
      });
      if (gelukt) verstuurd += 1;
    }

    // -----------------------------------------------------------------------
    // 3. Ontvangen goedkeuringen — goed nieuws over jezelf
    // -----------------------------------------------------------------------
    const ontvangen = await verseGoedkeuringen(db, profiel.id);

    for (const rij of ontvangen) {
      if (await alVerstuurd(db, profiel.id, 'approval_received', lokaleDatum, rij.approvalId)) {
        continue;
      }

      const gelukt = await stuur(db, {
        userId: profiel.id,
        apparaten,
        nu,
        soort: 'approval_received',
        bericht: berichtVoor('approval_received', { naam: rij.naam }, taalVan(profiel)),
        lokaleDatum,
        refId: rij.approvalId,
      });
      if (gelukt) verstuurd += 1;
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

      const overzichtsUur = uurUit(profiel.reminder_time) ?? 9;

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
      if (cyclus.startDate === lokaleDatum && lokaalUur === overzichtsUur) {
        const afgelopen = previousCycle(cyclus, profiel.week_start_day as Weekday);
        const wasAdempauze = await inAdempauze(db, profiel.id, afgelopen.startDate);

        if (!wasAdempauze && !(await alVerstuurd(db, profiel.id, 'cycle_summary', lokaleDatum, null))) {
          const gelukt = await stuur(db, {
            userId: profiel.id,
            apparaten,
            nu,
            soort: 'cycle_summary',
            bericht: berichtVoor('cycle_summary', {}, taalVan(profiel)),
            lokaleDatum,
            refId: null,
          });
          if (gelukt) verstuurd += 1;
        }
      }
    } catch (fout) {
      console.error(
        `cyclus bepalen mislukte voor ${profiel.id}: ${
          fout instanceof Error ? fout.message : String(fout)
        }`,
      );
      await meld(fout, 'notificaties.cyclus', { code: 'cyclus_onbepaalbaar', userId: profiel.id });
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      verstuurd,
      overgeslagen,
      zonderToken,
      profielen: (profielen ?? []).length,
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
    console.error(`te beoordelen ophalen mislukte voor ${userId}: ${error.message}`);
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
    console.error(`goedkeuringen ophalen mislukte voor ${userId}: ${error.message}`);
    return [];
  }

  return ((data ?? []) as { id: string }[]).map((r) => ({ approvalId: r.id, naam: '' }));
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
      console.error(`Expo gaf HTTP ${antwoord.status} voor ${userId}`);
      return 0;
    }

    return apparaten.length;
  } catch (fout) {
    console.error(
      `versturen mislukte voor ${userId}: ${fout instanceof Error ? fout.message : String(fout)}`,
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
  },
): Promise<boolean> {
  const { data: logRij, error: logFout } = await db
    .from('notifications_sent')
    .insert({
      user_id: opdracht.userId,
      kind: opdracht.soort,
      local_date: opdracht.lokaleDatum,
      ref_type: opdracht.refId === null ? null : 'completion',
      ref_id: opdracht.refId,
    })
    .select('id')
    .single();

  if (logFout) {
    // Een unieke-indexfout betekent dat een andere run hem al gestuurd heeft.
    // Dat is geen storing maar precies waar die index voor is.
    if (logFout.code !== '23505') {
      console.error(`melding vastleggen mislukte voor ${opdracht.userId}: ${logFout.message}`);
    }
    return false;
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
        `mislukte melding kon niet teruggedraaid worden voor ${opdracht.userId}: ${error.message}`,
      );
    }
    return false;
  }

  return true;
}
