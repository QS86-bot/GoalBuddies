import { createClient } from 'jsr:@supabase/supabase-js@2';

// ⚠️ Rechtstreeks uit cycle.ts en types.ts, niet via index.ts. Die laatste
//    re-exporteert ook clock.ts, en dat bestand leest process.env om freezeNow()
//    in productie te weigeren — op Deno is dat een valkuil die je pas merkt als
//    de job 's nachts stilvalt.
import { closableUserCycle, userCycle } from '../_shared/time/cycle.ts';
import type { Weekday } from '../_shared/time/types.ts';
import { localDateIn } from '../_shared/time/zoned.ts';
import { meld } from '../_shared/melden.ts';
import { rijen } from '../_shared/bladeren/index.ts';
import { metCors } from '../_shared/cors.ts';

/**
 * De cycle-rollover — QS8-49, en daarmee ook QS8-47 en QS8-51.
 *
 * Sluit cycli af die voorbij zijn: onvoltooide weekdoelen krijgen `missed` en
 * een minpunt, weekdoelen onder een adempauze krijgen `excused` en niets.
 *
 * Sinds QS8-81 zet hij daarbij een weekpas in als de gebruiker er een heeft.
 * Dat verandert niets aan het minpunt — een pas beschermt de reeks, niet het
 * punt — en is daarmee de enige plek waar `week_pass_events` een `spent`-rij
 * krijgt.
 *
 * ⚠️ Waarom een Edge Function en niet een Postgres-functie. Het rekenwerk is
 *    cyclusrekenwerk: per gebruiker de weekgrenzen bepalen uit zijn
 *    week-startdag én tijdzone, inclusief de coulanceperiode. CLAUDE.md
 *    correctheidsregel 7 zegt dat dat uitsluitend in `shared/time` gebeurt. Een
 *    SQL-versie zou die logica een tweede keer implementeren, en dan is de vraag
 *    "in welke week valt dit" op twee plekken beantwoord — met twee antwoorden.
 *
 *    De tijdcode komt daarom uit `_shared/time`, een gegenereerde kopie van
 *    `src/shared/time` (`npm run edge:sync`).
 *
 * ⚠️ Autorisatie. verify_jwt staat aan, dus het platform controleert de
 *    handtekening. Deze functie deelt minpunten uit, dus daar bovenop moet de rol
 *    service_role zijn — een gewone ingelogde gebruiker heeft ook een geldig JWT.
 *
 *    De eerste versie vergeleek de Authorization-header met
 *    SUPABASE_SERVICE_ROLE_KEY uit de omgeving. Dat gaf altijd 401: die variabele
 *    komt in de functie-omgeving niet aan zoals verwacht. De rolclaim lezen is
 *    bovendien het juiste niveau — je controleert wat iemand mág, niet welke
 *    string hij toevallig heeft.
 *
 * ⚠️ Idempotent. De functie raakt uitsluitend weekdoelen met status `todo` of
 *    `cancelled` — allebei "nog niets gebeurd", en allebei een gemiste week
 *    zodra de cyclus verstrijkt (A40) — en
 *    de unieke index op `points_ledger` weigert een tweede boeking voor dezelfde
 *    reden en referentie. Twee keer draaien verandert dus niets, en een
 *    overgeslagen dag wordt vanzelf ingehaald: alles wat te oud is, wordt bij de
 *    volgende run alsnog gepakt.
 *
 * ⚠️ `pending` blijft `pending`. Een weekdoel dat op goedkeuring wacht, is niet
 *    gemist — een trage buddy mag jou geen minpunt bezorgen.
 */

/**
 * Hoeveel chatfoto's één ronde van de opruimpas maximaal ophaalt — QS8-396.
 *
 * ⚠️ Onwrikbare regel 10 in de vorm die hier telt: een ongepagineerde lijst is op
 *    een job zonder scherm een verzoek dat omvalt op de dag dat het uitmaakt. De
 *    pas draait elk uur, dus 500 per ronde is 12.000 per dag — ruim boven wat
 *    deze groepsgroottes kunnen produceren. Wordt hij tóch geraakt, dan meldt de
 *    functie dat; zie de tak hieronder.
 */
const BIJLAGE_PAS_LIMIET = 500;

interface Profiel {
  id: string;
  week_start_day: number;
  tz: string;
}

/**
 * Eén rij uit `weekplan_kandidaten()` — migratie 0137.
 *
 * ⚠️ De RPC geeft ook `eerste_cyclus` terug. Die kolom bestond om er een
 *    `cycle_index` mee uit te rekenen, en die kolom is met 0185 verdwenen; hier
 *    staat hij daarom niet meer. De RPC berekent hem nog wel — zie de rij in
 *    `docs/ENGINEER-REVIEW.md` van 07-09.
 */
interface Kandidaat {
  goal_id: string;
}

interface OpenWeekdoel {
  id: string;
  goal_id: string;
  cycle_start_date: string;
  points_miss: number;
  goals: { owner_id: string } | null;
}

/**
 * De rol uit een JWT, zonder de handtekening te controleren — dat deed het
 * platform al.
 *
 * ⚠️ `\s` en niet `s`. In de repo stond `/^Bearers+/i`: de backslash was
 *    weggevallen bij een meerregelige zoek-en-vervang, precies de valkuil die in
 *    docs/WERKVOORRAAD.md §7 staat. Dat patroon matcht "Bearerssss" en dus nooit
 *    een echte header, waarna deze functie altijd 403 geeft. Het is nooit
 *    opgevallen omdat de gedéployde versie wél goed was; de repo en het platform
 *    waren uit elkaar gelopen. Bij de eerstvolgende deploy vanuit de repo was de
 *    rollover stilgevallen.
 */
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
  //    profiel loggen en melden zoals ze deden — die zijn verwacht en
  //    afgehandeld. Wat hier gevangen wordt is het ónverwachte: een afgewezen
  //    rpc, een platformhapering. Dat werd tot 26-08-2026 geruisloos een 500
  //    zonder enig spoor, en dat is precies het geval waar QS8-24 voor bestaat.
  //
  // ⚠️ `await` en niet los laten lopen. Supabase kan een Edge Function bevriezen
  //    zodra het antwoord verstuurd is; een niet-afgewachte `fetch` wordt dan
  //    afgekapt en de melding komt nooit aan. Eerst melden, dan antwoorden.
  try {
    return await draaiRollover(auth);
  } catch (fout) {
    await meld(fout, 'rollover', { code: 'rollover_onverwacht_gestopt' });
    return new Response(JSON.stringify({ error: 'rollover_onverwacht_gestopt' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}));

/**
 * Hoeveel profielen de rollover per ronde ophaalt — QS8-206.
 *
 * ⚠️ **Bewust klein.** Deze job doet per profiel nog meerdere query's, dus de
 *    grens is niet het geheugen maar de looptijd van één Edge Function. Een
 *    kleinere pagina betekent meer ronden en niet meer werk; een grotere zet de
 *    hele job op het spel zodra hij zijn tijdslimiet raakt.
 */
const PROFIELEN_PER_PAGINA = 200;

/**
 * De systeemclient, met het type dat de aanroep zélf oplevert.
 *
 * ⚠️ **Een functie en geen `ReturnType<typeof createClient>`** — QS8-424, en dat
 *    is dezelfde val die `deno check` in `doelcoach/index.ts` al een keer
 *    gevonden heeft. Die vorm instantieert de generieken met hun **defaults**
 *    (`unknown` en `never`); de echte aanroep leidt ze uit de argumenten af, en
 *    die twee zijn niet toewijsbaar. Deze vorm leidt het type af uit de
 *    aanroep, dus hij blijft kloppen als `supabase-js` zijn typeparameters
 *    verandert.
 */
function maakClient(auth: string) {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? auth.replace(/^Bearer\s+/i, ''),
    { auth: { persistSession: false } },
  );
}

type Db = ReturnType<typeof maakClient>;

async function draaiRollover(auth: string): Promise<Response> {
  const db = maakClient(auth);

  const nu = new Date();
  const { telling, profielFout } = await verwerkAlleProfielen(db, nu);
  const {
    gemist,
    vrijgesteld,
    risicoBijgewerkt,
    ingeschoven,
    verschuldigd,
    gered,
    overgeslagen,
    profielenGezien,
  } = telling;

  // ⚠️ **Pas hier, en niet in `haalProfielen`.** Een 500 midden in de lus zou de
  //    profielen die al afgehandeld zijn onvermeld laten; nu is het werk gedaan
  //    en meldt de job dat hij niet compleet was.
  if (profielFout !== null) {
    // ⚠️ **Hier stond een cast naar `{ message: string; code?: string }`, en die
    //    is met QS8-424 weg.** Hij was nodig zolang `profielFout` een `let` in
    //    deze functie was: TypeScript volgt geen toekenning die in een closure
    //    gebeurt, dus na de declaratie op `null` versmalde hij het type tot
    //    `never` en bestond `.code` niet meer. Nu de profiellus een eigen
    //    functie is, komt de fout als teruggave binnen mét zijn type.
    const fout = profielFout;

    // ⚠️ **Hier stond dat `scrubMessage()` de melding schoonmaakt vóór verzending,
    //    en dat was maar de halve waarheid — QS8-315.** Hij haalt geciteerde
    //    waarden en de `Key (col)=(val)`-vorm eruit, maar níét een
    //    `%`-interpolatie, en dat is precies de vorm die onze eigen wachters
    //    gooien: `Europe/Bogus is geen bekende tijdzone` komt er onveranderd uit.
    //    Gemeten met de échte functie, niet beredeneerd.
    //
    //    Dus dezelfde splitsing als in het recap-pad hieronder en in de kop van
    //    0158: de volledige tekst gaat naar het functielog — een ander systeem,
    //    met een andere bewaartermijn, dat de database niet verlaat — en Sentry
    //    krijgt een vaste zin plus de foutcode.
    console.error(`profielen ophalen mislukte: ${fout.message}`);
    await meld(new Error('profielen ophalen mislukte'), 'rollover.profielen', {
      code: 'profielen_ophalen_mislukt',
      // ⚠️ De SQLSTATE is wat er ván de fout overblijft, en dat is genoeg om hem
      //    te plaatsen: `42501` is een recht, `PGRST202` een verdwenen route,
      //    `23514` een constraint. Geen van drieën draagt gebruikerstekst.
      sqlstate: fout.code,
    });
    // ⚠️ **Een slug en niet de melding — en dat is een gemeten reparatie, geen
    //    voorzorg (security-review op QS8-315).** Hier stond `fout.message`, met
    //    als verdediging dat de body "Supabase niet verlaat". Dat is onwaar: de
    //    aanroeper is `.github/workflows/rollover.yml`, en die doet op regel 67
    //    `cat /tmp/rollover.json` — vóór de statuscontrole, en `curl` geeft
    //    exitcode 0 op een 500. De melding landt dus in het GitHub
    //    Actions-runlog: een derde systeem, met een eigen bewaartermijn.
    //
    //    📏 En de repository staat op `visibility: public`, nagekeken via de
    //    GitHub-API. Dat runlog is wereldleesbaar.
    //
    //    Dezelfde vorm als de vangnettak bovenaan dit bestand, die dit al goed
    //    deed. De volledige tekst staat in de `console.error` hierboven.
    return new Response(JSON.stringify({ error: 'profielen_ophalen_mislukt' }), { status: 500 });
  }

  const geslapen = await slaapStilleGroepen(db);

  const seizoensrecaps = await maakSeizoensrecaps(db);

  const alsnogGoedgekeurd = await handelVastgelopenGoedkeuringenAf(db);

  const bijlagen = await ruimVerlopenBijlagenOp(db);

  return new Response(
    JSON.stringify({
      ok: true,
      gemist,
      gered,
      overgeslagen,
      vrijgesteld,
      verschuldigd,
      // ⚠️ **Dit was `(profielen ?? []).length` en dus de lengte van de láátste
      //    pagina.** Sinds QS8-206 leest deze job in pagina's, en dan is dat
      //    getal geen totaal meer maar een restant — precies het soort stille
      //    onwaarheid waar dit veld voor bedoeld is om hem te voorkomen.
      profielen: profielenGezien,
      geslapen,
      risicoBijgewerkt,
      // ⚠️ Om dezelfde reden als `recaps` en `alsnogGoedgekeurd`: een job zonder
      //    scherm heeft alleen zijn uitvoer. Dit getal is bovendien het enige
      //    bewijs dat het inschuiven draait — er gaat geen melding uit en er
      //    breekt niets als het stilvalt. Precies de vorm van QS8-140.
      ingeschoven,
      // ⚠️ In de uitvoer, want zonder dit is de enige manier om te zien dát er
      //    een recap uit is gegaan, de groepschat zelf. De rollover is een job
      //    zonder scherm; wat hij niet teruggeeft, is niet gebeurd voor wie het
      //    log leest.
      recaps: seizoensrecaps.recaps,
      // ⚠️ **Hoort nul te zijn.** Staat hij hoger, dan hebben zoveel groepen dit
      //    seizoen geen recap gekregen en is de oorzaak per groep terug te
      //    vinden in het Postgres-log — QS8-171, migratie 0158. Zonder dit getal
      //    in de uitvoer is een deels mislukte job niet van een geslaagde te
      //    onderscheiden.
      recapsOvergeslagen: seizoensrecaps.overgeslagen,
      // ⚠️ Om dezelfde reden als `recaps` hierboven: een job zonder scherm heeft
      //    alleen zijn uitvoer. Wat hij niet teruggeeft, is niet gebeurd voor wie
      //    het log leest — en dít getal hoort nul te zijn zolang er niets vastloopt.
      alsnogGoedgekeurd: (alsnogGoedgekeurd as number | null) ?? 0,
      // ⚠️ Om dezelfde reden als `recaps`: een job zonder scherm heeft alleen zijn
      //    uitvoer, en de bewaartermijn is een belofte aan de gebruiker. Blijft dit
      //    getal op nul staan terwijl er wél bijlagen ouder dan 21 dagen zijn, dan
      //    draait de pas niet — en dat is niet te zien aan de app.
      //
      // ⚠️ **Eén getal over beide emmers sinds QS8-408, en dat is een keuze met
      //    een prijs:** een pas die alleen op `chatdocs` vastloopt, is aan dit
      //    getal niet te zien. Wat dat wél laat zien is `bijlagenMislukt` plus de
      //    meldingen eronder, en díé gaan sinds de securityronde **per emmer** —
      //    de eerste vorm beweerde dat hier en deed het niet.
      bijlagenOpgeruimd: bijlagen.opgeruimd,
      // ⚠️ **Hoort nul te zijn.** Staat hij hoger, dan zijn er paden die de
      //    Storage-API niet kwijt wil en blijft er dus meer bewaard dan beloofd.
      bijlagenMislukt: bijlagen.mislukt,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

/** Wat één ronde over alle profielen aan de uitslag bijdraagt. */
interface Profieltelling {
  gemist: number;
  vrijgesteld: number;
  risicoBijgewerkt: number;
  ingeschoven: number;
  verschuldigd: number;
  gered: number;
  overgeslagen: number;
  profielenGezien: number;
}

/**
 * Loopt alle profielen af en sluit per profiel af wat afgesloten kan worden.
 *
 * ⚠️ **Uit `draaiRollover` getild in QS8-424.** De `profielFout` gaat mee als
 *    teruggave en niet als worp: de aanroeper meldt hem **ná** de lus, zodat de
 *    profielen die al afgehandeld zijn niet onvermeld blijven. Dat was al de
 *    reden dat die controle onderaan stond, en die reden geldt hier onverkort.
 */
async function verwerkAlleProfielen(
  db: Db,
  nu: Date,
): Promise<{ telling: Profieltelling; profielFout: { message: string; code?: string } | null }> {
  let gemist = 0;
  let vrijgesteld = 0;
  let risicoBijgewerkt = 0;

  // Geplande weekstappen die deze ronde een weekdoel geworden zijn — QS8-203.
  let ingeschoven = 0;

  // Straffen die verschuldigd zijn geworden — QS8-84.
  let verschuldigd = 0;

  // Hoeveel gemiste weken er door een weekpas gered zijn — QS8-81. Een deelverzameling
  // van `gemist`: het punt is afgeboekt, alleen de reeks bleef staan.
  let gered = 0;
  // Profielen die overgeslagen zijn omdat hun cyclus niet te bepalen was.
  let overgeslagen = 0;

  // ---------------------------------------------------------------------------
  // De profielen, in pagina's
  // ---------------------------------------------------------------------------
  //
  // ⚠️ **Dit was `.select('id, week_start_day, tz')` zonder meer**, en dat is de
  //    dossierrij van 19-08. PostgREST kent een `max-rows`; staat die gezet, dan
  //    kapt hij de lijst af en slaat deze job **stilzwijgend een deel van de
  //    gebruikers over** — geen fout, geen melding, alleen weken die voor
  //    niemand afgesloten worden. Onwrikbare regel 10.
  //
  // ⚠️ **`order('id')` is geen netheid maar de voorwaarde.** Zonder een stabiele
  //    sortering is `range()` betekenisloos: Postgres mag rijen dan in elke
  //    volgorde teruggeven, en dan overlappen pagina's elkaar én missen ze
  //    rijen. Dit is dezelfde grendel als bij de cursorpaginering van 0121,
  //    0125 en 0152, alleen hoeft het hier geen cursor te zijn — een job leest
  //    alles en een verschuiving tussen twee pagina's raakt hooguit één profiel
  //    dat deze ronde overgeslagen of dubbel bekeken wordt. Dubbel is
  //    onschadelijk: elke stap hieronder is idempotent op de cyclus die hij
  //    afsluit.
  //
  // ⚠️ **De paginagrootte is bewust klein.** Deze functie doet per profiel nog
  //    meerdere query's, dus het geheugen is niet de grens maar de looptijd van
  //    één Edge Function. Kleiner betekent meer ronden en niet meer werk.
  // ⚠️ **De lus zelf staat in `src/shared/bladeren` en niet hier**, want daar
  //    draait vitest. Wat hier blijft is de query — en die draagt de enige
  //    eigenschap die `paginas()` níét kan bewaken: de `order`.
  let profielenGezien = 0;
  let profielFout: { message: string; code?: string } | null = null;

  const haalProfielen = async (start: number, aantal: number): Promise<readonly Profiel[]> => {
    const { data, error } = await db
      .from('profiles')
      .select('id, week_start_day, tz')
      .order('id', { ascending: true })
      .range(start, start + aantal - 1);

    if (error) {
      profielFout = error;
      // ⚠️ Leeg teruggeven en de fout apart onthouden: `paginas()` stopt dan
      //    netjes en de aanroeper beslist wat er met de fout gebeurt. Gooien zou
      //    de generator halverwege afbreken en de al verwerkte pagina's stil
      //    laten vervallen.
      return [];
    }
    return (data ?? []) as Profiel[];
  };

  // ⚠️ **`rijen()` en niet `paginas()`** — QS8-422. Hiervoor stonden hier twee
  //    lussen boven elkaar, allebei op dezelfde inspringing omdat het lichaam
  //    bij het invoeren van de paginering nooit herschreven is. Die buitenste
  //    lus duwde élke vertakking hieronder een stap dieper dan de code leest;
  //    zeven van de tweeëntwintig nesting-overtredingen in deze map kwamen
  //    daarvandaan en niet uit de logica.
  for await (const profiel of rijen(haalProfielen, PROFIELEN_PER_PAGINA)) {
    profielenGezien += 1;

    const afsluitbaar = await afsluitbareCyclus(profiel, nu);
    if (afsluitbaar === null) {
      overgeslagen += 1;
      continue;
    }

    verschuldigd += await wikkelStraffenAf(db, profiel, nu);

    const afgesloten = await sluitVerstrekenWekenAf(db, profiel, afsluitbaar.startDate);
    if (afgesloten === null) continue;

    gemist += afgesloten.telling.gemist;
    vrijgesteld += afgesloten.telling.vrijgesteld;
    gered += afgesloten.telling.gered;

    ingeschoven += await schuifWeekplanIn(db, profiel, nu);
    risicoBijgewerkt += await herberekenReeksEnRisico(db, profiel, afgesloten.geraakteDoelen);
  }

  const telling: Profieltelling = {
    gemist, vrijgesteld, risicoBijgewerkt, ingeschoven,
    verschuldigd, gered, overgeslagen, profielenGezien,
  };

  return { telling, profielFout };
}

/**
 * Zet groepen die lang stil zijn op slapend, en geeft terug hoeveel dat er
 * waren.
 *
 * ⚠️ Uit `draaiRollover` getild in QS8-424; de termijn van dertig dagen en de
 *    zachte foutafhandeling zijn ongewijzigd.
 */
async function slaapStilleGroepen(db: Db): Promise<number> {
  // Slapende groepen — QS8-60.
  //
  // ⚠️ Hangt hier en niet in een eigen job, om één reden: dit is de enige
  //    terugkerende taak die er is. Een tweede job zou een tweede planning
  //    vragen, en er staat nog geen enkele planning (Q-TODO A11). Zolang de
  //    rollover niet draait, slaapt er ook niets in.
  //
  //    Geen cyclusrekenwerk: dertig dagen sinds de laatste activiteit is een
  //    leeftijd en geen week, dus dit mag in SQL staan (correctheidsregel 7).
  const { data: geslapen, error: slaapFout } = await db.rpc('slaap_stille_groepen', {
    p_dagen: 30,
  });

  if (slaapFout) {
    console.error(`slapende groepen bijwerken mislukte: ${slaapFout.message}`);
  }

  return geslapen ?? 0;
}

/**
 * Maakt de seizoensrecaps en meldt wat er misging.
 *
 * ⚠️ Uit `draaiRollover` getild in QS8-424. De drie meldpaden — de RPC die
 *    faalt, groepen die overgeslagen zijn, en een weigering — zijn
 *    ongewijzigd; alleen de twee getallen die het runrapport noemt komen nu
 *    als teruggave terug in plaats van uit een `let` erboven.
 */
async function maakSeizoensrecaps(db: Db): Promise<{ recaps: number; overgeslagen: number }> {
  // ⚠️ **De seizoensrecap hangt aan dezelfde uurlijkse job, en dat is opzet** —
  //    QS8-79. `maak_seizoensrecaps()` doet zelf de twee toetsen die ertoe doen:
  //    is het de eerste dag van het nieuwe seizoen, en is het 08:00 in de
  //    tijdzone van de gróép. Daarom moet dit elk uur langskomen; een dagelijkse
  //    job zou voor de helft van de tijdzones op het verkeerde uur vallen.
  //
  //    Geen cyclusrekenwerk: een kwartaal is een kalenderfeit dat voor iedereen
  //    op dezelfde dag valt, ongeacht wiens week op dinsdag begint. Dat is de
  //    reden dat dit in SQL mag staan (correctheidsregel 7) — de kop van
  //    migratie 0112 schrijft de afweging uit.
  const { data: recaps, error: recapFout } = await db.rpc('maak_seizoensrecaps');

  if (recapFout) {
    console.error(`seizoensrecaps maken mislukte: ${recapFout.message}`);
    // ⚠️ **De melding zelf gaat níet mee naar Sentry, en dat is dezelfde keuze
    //    als in de kop van 0158.** `scrubMessage()` haalt geciteerde waarden en
    //    de `Key (col)=(val)`-vorm eruit, maar niet een `%`-interpolatie —
    //    gemeten: `Bogus/Zone is geen bekende tijdzone` en `Te veel avatars voor
    //    deze gebruiker (12).` komen er onveranderd uit, en dat zijn precies de
    //    vormen die `bewaak_tijdzone()` en `bewaak_avatar_aantal()` gooien. De
    //    volledige tekst staat in de regel hierboven, in de Supabase-logs.
    await meld(new Error('seizoensrecaps maken mislukte'), 'rollover.recap', {
      code: 'recap_rpc_fout',
    });
  }

  // ⚠️ **Sinds migratie 0158 (QS8-171) breekt de recapjob niet meer af op één
  //    stukke groepsrij — hij slaat die groep over en telt hem.** Dat lost het
  //    afbreken op en zou het stille falen inbouwen als het hier bij bleef: een
  //    RPC die netjes `ok: true` teruggeeft terwijl er groepen zijn overgeslagen,
  //    is precies de vorm waar QS8-140 op stukliep.
  //
  //    Vandaar twee dingen, en niet één. `meld()` maakt er een gebeurtenis van
  //    die iemand bereikt; het getal in de teruggave hieronder maakt hem
  //    naleesbaar voor wie het log leest. De `group_id`'s gaan niet mee naar
  //    Sentry — ze staan in het Postgres-log naast de volledige melding, en dat
  //    is de kant waar de uuid's thuishoren.
  const recapMislukt = (recaps as { mislukt?: number } | null)?.mislukt ?? 0;

  if (recapMislukt > 0) {
    console.error(`seizoensrecap overgeslagen voor ${recapMislukt} groep(en)`);
    await meld(
      new Error(`seizoensrecap overgeslagen voor ${recapMislukt} groep(en)`),
      'rollover.recap',
      // ⚠️ `count` en niet `groepen`. `scrubContext()` laat alleen de sleutels uit
      //    `ALLOWED_KEYS` door en vervangt de rest door `[weggelaten]` — gemeten,
      //    dus een zelfbedachte veldnaam komt niet aan.
      { code: 'recap_groep_overgeslagen', count: recapMislukt },
    );
  }

  // ⚠️ **De weigeringstak van de RPC geeft geen `error` maar `ok: false`.** Zonder
  //    deze regel is "ik mocht dit niet" niet te onderscheiden van "geen enkele
  //    groep had dit uur een seizoensgrens": allebei nul recaps, allebei stil.
  //    Dezelfde vorm als de `ok === true`-toets bij het inschuiven hierboven.
  if ((recaps as { ok?: boolean } | null)?.ok === false) {
    const reden = (recaps as { reason?: string } | null)?.reason ?? 'onbekend';
    console.error(`seizoensrecaps geweigerd: ${reden}`);
    await meld(new Error(`seizoensrecaps geweigerd: ${reden}`), 'rollover.recap', {
      code: 'recap_geweigerd',
    });
  }

  return {
    recaps: (recaps as { recaps?: number } | null)?.recaps ?? 0,
    overgeslagen: recapMislukt,
  };
}

/**
 * Handelt de vastgelopen goedkeuringen af en geeft terug hoeveel er alsnog
 * goedgekeurd zijn.
 *
 * ⚠️ Uit `draaiRollover` getild in QS8-424; de termijn en de foutafhandeling
 *    zijn ongewijzigd.
 */
async function handelVastgelopenGoedkeuringenAf(db: Db): Promise<number> {
  // ⚠️ **De goedkeuringstermijn — QS8-178, migratie 0135.** Een voltooiing die op
  //    goedkeuring wacht terwijl de beoordelaars zijn weggevallen, bleef eeuwig
  //    `pending`: geen minpunt, maar ook nooit punten.
  //
  //    Beslisdocument 001 §2.6b.3 had dit al besloten en het was nooit gebouwd:
  //    bij het verstrijken van de termijn krijgt het weekdoel alsnog zijn punten,
  //    zodat een trage buddy jou geen minpunt kan bezorgen.
  //
  // ⚠️⚠️ **Hier stond dat alle vier de routes handelingen van een ánder zijn, en
  //    dat was onjuist — de zin noemde in zijn eigen opsomming al "of de eigenaar
  //    ontkoppelt zijn doel".** Op 01-09 nagemeten (QS8-186): in de
  //    standaardopstelling — je maakt zélf je groep aan en bent daarmee beheerder —
  //    zijn er zeven routes en zijn er vijf handelingen van de eigenaar, elk met
  //    dezelfde uitkomst: week `approved`, twee punten, nul goedkeuringen. Daar
  //    kwamen op 02-09 twee gevallen bij waarin de eigenaar niets deed maar wél aan
  //    zet was: een buddy die om toelichting vroeg, en een ingetrokken goedkeuring.
  //
  //    Migratie 0147 sluit dat af aan de databasekant: `vastgelopen_goedkeuringen()`
  //    meldt zo'n rij nog steeds — dat is het rapport van 0109 — maar zet
  //    `beurt_bij_eigenaar`, en de functie hieronder slaat die over. Deze aanroep
  //    verandert dus niet; de onderbouwing eronder wel.
  //
  //    ⚠️ Het is een afkoeling van zeven dagen en geen slot. Wie zijn doel
  //    ontkoppelt en daarna een week niets doet, valt terug op het gedrag van 0135
  //    — bewust ontwerp, want wie al maanden solo werkt ís een solo-gebruiker, maar
  //    het staat als open productvraag in `docs/ENGINEER-REVIEW.md`.
  //
  // ⚠️ **Hier en niet in een eigen job.** Deze functie draait al elk uur en heeft
  //    de cyclusberekening al. Een tweede planner is een tweede plek die stil kan
  //    uitvallen — en dat is precies wat QS8-140 vandaag laat zien: `maak_seizoensrecaps`
  //    stond maandenlang in de database zonder dat iets hem aanriep.
  //
  //    Geen cyclusrekenwerk: zeven dagen sinds het indienen is een leeftijd en
  //    geen week, dus dit mag in SQL staan (correctheidsregel 7).
  const { data: alsnogGoedgekeurd, error: termijnFout } = await db.rpc(
    'keur_vastgelopen_goedkeuringen_goed',
    { p_termijn_dagen: 7 },
  );

  if (termijnFout) {
    // ⚠️ De volledige tekst blijft in deze regel; Sentry krijgt hem niet meer
    //    (QS8-315). `keur_vastgelopen_goedkeuringen_goed()` gooit onder andere
    //    `p_termijn_dagen moet minstens 1 zijn, kreeg %` — een `%`-vorm, en die
    //    laat `scrubMessage()` ongemoeid.
    console.error(`vastgelopen goedkeuringen afhandelen mislukte: ${termijnFout.message}`);
    await meld(
      new Error('vastgelopen goedkeuringen afhandelen mislukte'),
      'rollover.goedkeuringstermijn',
      { code: 'goedkeuringstermijn_mislukt', sqlstate: termijnFout.code },
    );
  }

  return (alsnogGoedgekeurd as number | null) ?? 0;
}

/**
 * Ruimt de verlopen chatbijlagen op en geeft terug hoeveel er weg zijn en
 * hoeveel er niet weg konden.
 *
 * ⚠️ **Uit `draaiRollover` getild in QS8-424.** Dit is de stap die QS8-422
 *    aanwees als *beslissende* logica — aftoppen dat zichzelf meldt,
 *    blokgewijs wissen, doortellen bij een fout — en daarmee de reden dat die
 *    map onder coderegel 15 moest. Hij hoort dus zeker niet in een functie van
 *    tweehonderd regels te wonen.
 */
async function ruimVerlopenBijlagenOp(db: Db): Promise<{ opgeruimd: number; mislukt: number }> {
  // ---------------------------------------------------------------------------
  // De bijlagen opruimen — QS8-396 (0235) en QS8-408 (0250)
  // ---------------------------------------------------------------------------
  //
  // ⚠️⚠️ **Dit is de helft die SQL níet kan doen, en dat is de hele reden dat het
  //    hier staat.** `delete from storage.objects` haalt de **metadata-rij** weg
  //    en laat het bestand op de opslag staan — een bekende bevinding sinds
  //    QS8-71. De bijlage zou dan onleesbaar zijn en tóch bewaard, en dat is
  //    precies de belofte van die issues, half. Alleen `storage.remove()` haalt
  //    rij én blob weg.
  //
  //    De database bepaalt daarom **wat** er weg mag (`verlopen_chatfotos()`,
  //    `verlopen_chatdocs()`), en deze functie voert het uit. Twee redenen,
  //    allebei uit de RPC's:
  //      * `verlopen` — ouder dan de bewaartermijn van die emmer, 21 dagen.
  //      * `wees` — geen chatbericht meer, met een uur respijt zodat een upload
  //        die op dít moment verstuurd wordt niet onder handen weggewist wordt.
  //
  // ⚠️⚠️ **Eén lus over twee emmers en geen tweede blok, en dát is de plek waar
  //    duplicatie zou gaan rotten** (QS8-408). De twee RPC's zijn elk vier regels
  //    SQL met een eigen getal — dat mogen zusterfuncties zijn. De uitvoerende
  //    helft is dat niet: het aftoppen dat zichzelf meldt, het blokgewijs wissen,
  //    het doortellen bij een fout en het tellen op de teruggave van `remove()`
  //    zijn vier grendels die stuk voor stuk uit een bevinding komen. Twee
  //    kopieën daarvan is twee plekken waar de volgende reparatie er één vergeet.
  //
  // ⚠️ **Hier en niet in een eigen job**, om dezelfde reden als de slapende
  //    groepen en de seizoensrecap hierboven: er is één planning, en een tweede
  //    planner is een tweede plek die stil kan uitvallen (QS8-140).
  //
  // ⚠️ Geen cyclusrekenwerk: eenentwintig dagen is een leeftijd en geen week, dus
  //    dit mag in SQL staan (correctheidsregel 7).
  // ⚠️⚠️ **De RPC-naam staat hier lettérlijk en komt niet uit de lus, en dat is
  //    een gemeten reparatie.** 📏 De eerste vorm zette de naam in het
  //    emmer-object en riep `db.rpc(emmer.rpc, …)` aan. Dat werkt, en het maakte
  //    `keten:controle` blind: die zoekt naar een letterlijke `.rpc('naam')`, dus
  //    hij meldde **allebei** de passen als functies zonder aanroeper — ook
  //    `verlopen_chatfotos()`, die er vóór deze wijziging gewoon een had. Een
  //    refactor die een grendel uitzet is erger dan de duplicatie die hij
  //    wegneemt; zelfde klasse als `storage-controle.mjs`, dat om dezelfde reden
  //    alleen letterlijke bucketnamen vindt.
  //
  // ⚠️ Wat de lus deelt, blijft de uitvoerende helft. Alleen het opvrágen is per
  //    emmer een eigen regel, en dat is precies één ternary.
  async function verlopenPaden(emmer: 'chatfotos' | 'chatdocs') {
    return emmer === 'chatfotos'
      ? await db.rpc('verlopen_chatfotos', { p_limiet: BIJLAGE_PAS_LIMIET })
      : await db.rpc('verlopen_chatdocs', { p_limiet: BIJLAGE_PAS_LIMIET });
  }

  const emmers = ['chatfotos', 'chatdocs'] as const;

  let opgeruimd = 0;
  let mislukt = 0;
  const misluktPerEmmer: Record<(typeof emmers)[number], number> = {
    chatfotos: 0,
    chatdocs: 0,
  };

  for (const emmer of emmers) {
    const { data: verlopen, error: verlopenFout } = await verlopenPaden(emmer);

    if (verlopenFout) {
      console.error(`verlopen ${emmer} ophalen mislukte: ${verlopenFout.message}`);
      await meld(new Error(`verlopen ${emmer} ophalen mislukte`), 'rollover.bijlagen', {
        code: 'bijlagen_ophalen_mislukt',
        emmer,
        sqlstate: verlopenFout.code,
      });
      continue;
    }

    const paden = ((verlopen as { pad: string }[] | null) ?? []).map((rij) => rij.pad);

    // ⚠️⚠️ **De aftopping moet zichzelf melden, anders wijst het signaal de
    //    verkeerde kant op.** Komen er 500 terug, dan waren het er waarschijnlijk
    //    méér, en groeit de achterstand elk uur: de bewaartermijn wordt dan stil
    //    onwaar terwijl het opgeruimde aantal juist hóóg staat. Zonder deze tak is
    //    een volle emmer niet van een geslaagde ronde te onderscheiden.
    if (paden.length >= BIJLAGE_PAS_LIMIET) {
      console.error(`opruimpas ${emmer} zat aan zijn limiet (${paden.length})`);
      await meld(new Error(`opruimpas ${emmer} zat aan zijn limiet`), 'rollover.bijlagen', {
        code: 'bijlagen_limiet_geraakt',
        emmer,
        count: paden.length,
      });
    }

    const uitkomst = await wisBlokgewijs(db, emmer, paden);
    opgeruimd += uitkomst.opgeruimd;
    mislukt += uitkomst.mislukt;
    misluktPerEmmer[emmer] += uitkomst.mislukt;
  }

  // ⚠️⚠️ **Per emmer melden en niet één keer met een totaal.** 📏 De eerste vorm
  //    stuurde `{ code, count }` en de toelichting bij de uitvoer beweerde dat de
  //    melding de emmer meedroeg — dat deed hij niet: de emmer stond alleen in de
  //    `console.error`, en die gaat niet naar Sentry. Gevolg: een pas die alléén
  //    op `chatdocs` vastloopt was uit geen enkel gestructureerd signaal af te
  //    leiden. Dat is de "één → meer dan één"-verschuiving van regel 18 vraag 6,
  //    en de aggregatie is precies de plek waar hij lekt.
  for (const emmer of emmers) {
    if (misluktPerEmmer[emmer] === 0) continue;
    await meld(new Error(`${emmer} wissen mislukte`), 'rollover.bijlagen', {
      code: 'bijlagen_wissen_mislukt',
      emmer,
      count: misluktPerEmmer[emmer],
    });
  }

  return { opgeruimd, mislukt };
}

/**
 * Wist de gegeven paden blokgewijs uit één emmer.
 *
 * ⚠️ **Honderd tegelijk, en dat is de reden dat deze lus bestaat.** De
 *    Storage-API neemt een lijst aan; één verzoek per pad zou een opruimpas
 *    van duizend bijlagen duizend ronden kosten.
 *
 * ⚠️ **Doortellen bij een fout en niet stoppen.** Een blok dat niet weg kan,
 *    mag de rest niet tegenhouden — het getal `mislukt` is precies wat er dan
 *    blijft staan, en dat hoort nul te zijn.
 */
async function wisBlokgewijs(
  db: Db,
  emmer: 'chatfotos' | 'chatdocs',
  paden: readonly string[],
): Promise<{ opgeruimd: number; mislukt: number }> {
  let opgeruimd = 0;
  let mislukt = 0;

  // ⚠️ **In blokken van honderd, en dat is geen netheid.** `remove()` zet elk
  //    pad in de body van één verzoek; vijfhonderd paden van bijna honderd
  //    tekens is een aanvraag die de gateway mag afkappen, en dan is het
  //    verschil tussen "deels gelukt" en "mislukt" niet te zien.
  for (let i = 0; i < paden.length; i += 100) {
    const blok = paden.slice(i, i + 100);
    const { data: weg, error: wisFout } = await db.storage.from(emmer).remove(blok);
    if (wisFout) {
      // ⚠️ **Doortellen en niet afbreken.** Eén onwisbaar pad mag de rest van
      //    de bewaartermijn niet ophouden; wat blijft staan komt volgende
      //    ronde gewoon weer boven. Dezelfde vorm als 0158 bij de recaps.
      mislukt += blok.length;
      console.error(`${emmer} wissen mislukte (${blok.length} paden): ${wisFout.message}`);
      continue;
    }
    // ⚠️ De teruggave van `remove()` en niet `blok.length`: de Storage-API
    //    geeft de objecten terug die hij daadwerkelijk weghaalde, en een pad
    //    dat er niet meer was telt dan niet mee. Zonder dit verschil is een
    //    pas die niets doet niet van een geslaagde te onderscheiden.
    opgeruimd += (weg ?? []).length;
  }

  return { opgeruimd, mislukt };
}

/**
 * De cyclus die dit profiel nog mág afsluiten, of `null` als zijn tijdzone
 * onbruikbaar is.
 *
 * ⚠️ **Uit `draaiRollover` getild in QS8-424.** De `try` blijft hier en
 *    verhuist niet naar de aanroeper: `profiles.tz` is vrije tekst zonder
 *    CHECK, en zonder deze vangst legt één profiel met een typefout de job
 *    voor iedereen stil. De aanroeper telt de `null` als `overgeslagen`, net
 *    als hiervoor.
 */
async function afsluitbareCyclus(profiel: Profiel, nu: Date) {
  // ⚠️ De cyclus die deze gebruiker nog mág afsluiten. Binnen de
  //    coulanceperiode is dat nog de vórige week, en dan is er dus níéts te
  //    rollen — anders kost een late log alsnog een minpunt (QS8-51).
  //
  // ⚠️ In een try, en dat is geen overdreven voorzichtigheid. `profiles.tz` is
  //    vrije tekst zonder controle en de eigenaar mag hem zelf zetten;
  //    `Intl.DateTimeFormat` gooit een RangeError op een onbekende zone. Zonder
  //    deze try valt de hele handler om op één profiel — elk uur opnieuw, op
  //    hetzelfde profiel — en sluit er voor niemand meer een week af. Eén
  //    gebruiker met een typefout legt dan de job voor alle anderen stil.
  //    Gevonden door de security-review op QS8-81; de echte reparatie is een
  //    CHECK op `profiles.tz`, zoals 0019 die voor `groups.tz` al zette.
  try {
    return closableUserCycle(
      { weekStartDay: profiel.week_start_day as Weekday, tz: profiel.tz },
      nu,
    );
  } catch (fout) {
    console.error(
      `cyclus bepalen mislukte voor een profiel (tz=${profiel.tz}): ${
        fout instanceof Error ? fout.message : String(fout)
      }`,
    );
    // ⚠️ Een console-regel in de Supabase-logs leest niemand uit zichzelf.
    //    `profiel.tz` gaat niet mee: een tijdzone is dicht genoeg bij een
    //    woonplaats om hem niet in een foutdashboard te willen hebben.
    await meld(fout, 'rollover.cyclus', { code: 'cyclus_onbepaalbaar' });
    return null;
  }
}

/**
 * Wikkelt de straffen af die voor dit profiel verschuldigd geworden zijn, en
 * geeft terug hoeveel dat er waren.
 *
 * ⚠️ **Uit `draaiRollover` getild in QS8-424.** De plek in de volgorde is
 *    ongewijzigd — ná de tijdzonecontrole en vóór het weekdoelenwerk — en dát
 *    is geen stijl maar domeinregel 11: geen enkele gemiste week zet een straf
 *    in werking, dus deze stap hoort niet in de lus die de gemiste weken
 *    afhandelt.
 *
 * ⚠️ Een mislukte aanroep telt nul en stopt de ronde niet, zoals hiervoor.
 */
async function wikkelStraffenAf(db: Db, profiel: Profiel, nu: Date): Promise<number> {
  // -----------------------------------------------------------------------
  // Straffen die verschuldigd worden — QS8-84, migratie 0057
  // -----------------------------------------------------------------------
  //
  // ⚠️ **Hier, en niet in SQL, omdat de datum van de gebruiker is.** Een straf
  //    treedt in werking zodra zijn streefdatum verstreken is, en "verstreken"
  //    is een uitspraak in de tijdzone van de eigenaar (domeinregel 2). De
  //    functie in de database vergelijkt alleen; de datum komt uit
  //    `shared/time` (correctheidsregel 7). Zou `maak_straffen_verschuldigd()`
  //    zelf `current_date` gebruiken, dan gaat de straf voor iemand in Auckland
  //    een dag te vroeg af — en te vroeg is precies het enige dat hier niet mag.
  //
  // ⚠️ **Staat vóór het weekdoelenwerk en is er volledig los van.** Domeinregel
  //    11 en QS8-84 criterium 2: geen enkele gemiste week zet een straf in
  //    werking. Deze aanroep kijkt niet naar `weekly_goals` en hoort daarom ook
  //    niet in de lus die de gemiste weken afhandelt.
  //
  // ⚠️ **Na de tz-controle hierboven.** Faalt `closableUserCycle`, dan is de
  //    tijdzone onbruikbaar en slaan we het profiel over — een straf op een
  //    gegokte datum is erger dan een straf die een uur later komt.
  //
  // ⚠️ Idempotent: de functie raakt alleen commitments met status `set`, dus een
  //    tweede run op hetzelfde uur vindt niets meer.
  const { data: straffen, error: strafFout } = await db.rpc('maak_straffen_verschuldigd', {
    p_owner_id: profiel.id,
    p_vandaag: localDateIn(profiel.tz, nu),
  });

  if (strafFout) {
    // Zacht, zoals de andere afgeleide stappen: de rest van de rollover moet
    // door. Wel zichtbaar — een straf die niet afgaat, ondermijnt het hele
    // commitment device (domeinregel 5).
    console.error(`straffen afwikkelen mislukte voor een profiel: ${strafFout.message}`);
  } else {
    return typeof straffen === 'number' ? straffen : 0;
  }

  return 0;
}

/**
 * Sluit elke verstreken week van dit profiel af.
 *
 * Geeft `null` terug als de weekdoelen niet op te halen waren — dat was in de
 * oude vorm een `continue` op de profiellus, en het slaat dus óók het
 * inschuiven en het herberekenen over. ⚠️ **Dat is de enige `continue` in deze
 * refactor die een heel profiel oversloeg**, en daarom is hij hier een `null`
 * geworden en geen lege telling: de aanroeper moet de rest van dit profiel
 * overslaan, en een telling van nul zou dat verschil wegpoetsen.
 *
 * `geraakteDoelen` komt uit de volledige lijst en niet uit de gemiste weken —
 * ook een vrijgestelde week verandert de reeks.
 */
async function sluitVerstrekenWekenAf(
  db: Db,
  profiel: Profiel,
  grens: string,
): Promise<{ telling: Weekuitkomst; geraakteDoelen: ReadonlySet<string> } | null> {
  const telling: Weekuitkomst = { gemist: 0, vrijgesteld: 0, gered: 0 };

  // ⚠️ `order` staat er om de uitkomst reproduceerbaar te maken. Zonder
  //    sorteervolgorde bepaalt het queryplan welke gemiste week een weekpas
  //    krijgt als er meer gemiste weken zijn dan passen — en dan geeft
  //    dezelfde data twee keer een ander antwoord. Oudste eerst, zodat een
  //    ingehaalde achterstand chronologisch wordt afgewikkeld.
  const { data: open, error: openFout } = await db
    .from('weekly_goals')
    .select('id, goal_id, cycle_start_date, points_miss, goals!inner(owner_id)')
    .eq('goals.owner_id', profiel.id)
    // ⚠️ `cancelled` hoort hier net zo goed bij als `todo` — A40, migratie
    //    0045. Een afgesloten weekdoel is een week die je bewust hebt
    //    opgegeven, en die telt bij het verstrijken van de cyclus als gemist:
    //    mét minpunt, en een weekpas kan hem redden zoals elke andere.
    //    Precies daarom hoeft `herbereken_reeks()` niets van `cancelled` te
    //    weten: in de lopende cyclus is hij neutraal zoals `todo`, en daarna
    //    is hij gewoon `missed`.
    .in('status', ['todo', 'cancelled'])
    .lt('cycle_start_date', grens)
    .order('cycle_start_date', { ascending: true });

  if (openFout) {
    console.error(`weekdoelen ophalen mislukte voor een profiel: ${openFout.message}`);
    return null;
  }

  for (const weekdoel of (open ?? []) as unknown as OpenWeekdoel[]) {
    const uitkomst = await verwerkVerstrekenWeek(db, profiel, weekdoel);
    telling.gemist += uitkomst.gemist;
    telling.vrijgesteld += uitkomst.vrijgesteld;
    telling.gered += uitkomst.gered;
  }

  const geraakteDoelen = new Set((open ?? []).map((w) => (w as unknown as OpenWeekdoel).goal_id));
  return { telling, geraakteDoelen };
}

/** Wat één verstreken week aan de telling van de ronde toevoegt. */
interface Weekuitkomst {
  gemist: number;
  vrijgesteld: number;
  gered: number;
}

const GEEN_TELLING: Weekuitkomst = { gemist: 0, vrijgesteld: 0, gered: 0 };

/**
 * Wikkelt één verstreken week af: vrijstellen bij een adempauze, anders
 * afschrijven met een minpunt en zo nodig een weekpas.
 *
 * ⚠️⚠️ **Uit `draaiRollover` getild in QS8-424, en de `continue`s van de oude
 *    lus zijn hier `return GEEN_TELLING` geworden.** Dat is precies dezelfde
 *    sprong — ze sloegen het rést van dít weekdoel over en niet het profiel —
 *    maar het is de plek waar deze refactor mis kón gaan, dus hij staat hier
 *    opgeschreven. Een `continue` die per ongeluk een profiel oversloeg, zou
 *    een hele gebruiker zijn minpunt schelen.
 *
 * ⚠️ De volgorde is ongewijzigd en dát is domeinregel 10: het minpunt wordt
 *    geboekt vóór de weekpas, want een pas beschermt de reeks en niet het punt.
 */
async function verwerkVerstrekenWeek(
  db: Db,
  profiel: Profiel,
  weekdoel: OpenWeekdoel,
): Promise<Weekuitkomst> {
  // Loopt er een adempauze over deze cyclus? Dan telt de week niet mee —
  // niet positief en niet negatief (domeinregel 10, adempauze = 0).
  const { data: pauze } = await db
    .from('breathers')
    .select('id')
    .eq('user_id', profiel.id)
    .eq('goal_id', weekdoel.goal_id)
    .lte('starts_cycle', weekdoel.cycle_start_date)
    .gte('ends_cycle', weekdoel.cycle_start_date)
    .maybeSingle();

  // ⚠️⚠️ **Hier stond tot QS8-424 een ternair met twee guards erachter**, en die
  //    vorm bestond alleen omdat dit blok toen ín twee lussen zat: `max-depth`
  //    liet er geen `if` in een `if` toe. De security-review op QS8-422 wees
  //    hem aan als de plek die daardoor fragiel werd — `vrijstelFout` niet-null
  //    ímpliceerde dat `pauze` waar was, en dat stond nergens behalve in een
  //    comment, twintig regels boven de plek waar het minpunt geboekt wordt.
  //
  //    In een eigen functie is die nestingruimte er weer, dus de gewone vorm kan
  //    terug. **Dat is de winst die deze refactor eigenlijk oplevert**: niet
  //    kortere functies maar code die niet meer om een lintregel heen hoeft te
  //    buigen.
  if (pauze) {
    const { error: vrijstelFout } = await db
      .from('weekly_goals')
      .update({ status: 'excused' })
      .eq('id', weekdoel.id);

    if (vrijstelFout) {
      console.error(`vrijstellen mislukte voor ${weekdoel.id}: ${vrijstelFout.message}`);
      return GEEN_TELLING;
    }

    return { gemist: 0, vrijgesteld: 1, gered: 0 };
  }

  return await schrijfWeekAf(db, profiel, weekdoel);
}

/**
 * Schrijft één verstreken week af: status `missed`, het minpunt, en daarna de
 * weekpas.
 *
 * ⚠️⚠️ **De volgorde is domeinregel 10 en geen stijl.** Het minpunt wordt
 *    geboekt vóór de weekpas, want een pas beschermt de reeks en niet het
 *    punt; andersom is missen gratis en zegt de score niets. En de weekpas
 *    staat ná de statuswijziging omdat `verbruik_weekpas()` zelf toetst dat de
 *    cyclus écht gemist is — andersom weigert hij en verdwijnt de bescherming
 *    zonder dat er iets stukgaat.
 */
async function schrijfWeekAf(
  db: Db,
  profiel: Profiel,
  weekdoel: OpenWeekdoel,
): Promise<Weekuitkomst> {
  // ⚠️ Deze drie schrijfacties controleerden hun fout niet, en dat is geen
  //    theorie: faalt de statuswijziging en gaat de rest wél door, dan is
  //    het minpunt geboekt terwijl `verbruik_weekpas()` daarna netjes
  //    weigert — er is immers geen `missed`-rij. Uitkomst: punt kwijt,
  //    bescherming niet ingezet, geen enkel signaal. Coderegel 14.
  const { error: gemistFout } = await db
    .from('weekly_goals')
    .update({ status: 'missed' })
    .eq('id', weekdoel.id);

  if (gemistFout) {
    console.error(`afschrijven mislukte voor ${weekdoel.id}: ${gemistFout.message}`);
    return GEEN_TELLING;
  }

  // Het minpunt. De unieke index maakt dit veilig bij een tweede run.
  const { error: puntFout } = await db.from('points_ledger').insert({
    user_id: profiel.id,
    goal_id: weekdoel.goal_id,
    delta: weekdoel.points_miss,
    reason: 'cycle_missed',
    ref_type: 'weekly_goal',
    ref_id: weekdoel.id,
  });

  if (puntFout) {
    console.error(`minpunt boeken mislukte voor ${weekdoel.id}: ${puntFout.message}`);
  }

  let gered = 0;

  // De weekpas — QS8-81.
  //
  // ⚠️ Staat ná het minpunt, en dat is de hele regel: een weekpas beschermt
  //    de reeks, niet het punt (domeinregel 10). Zou hij ook het punt
  //    terugdraaien, dan is missen gratis en zegt de score niets meer.
  //
  // ⚠️ Staat ná de statuswijziging omdat `verbruik_weekpas()` zelf
  //    controleert dat de cyclus écht gemist is. Die volgorde is dus geen
  //    smaak: andersom weigert de functie en verdwijnt de bescherming
  //    zonder dat er iets stukgaat.
  //
  // ⚠️ Geen rekenwerk hier. De functie krijgt de cyclusdatum die al in de
  //    rij staat; er wordt geen week afgeleid (correctheidsregel 7).
  const { data: geredeWeek, error: pasFout } = await db.rpc('verbruik_weekpas', {
    p_user_id: profiel.id,
    p_goal_id: weekdoel.goal_id,
    p_cycle_start_date: weekdoel.cycle_start_date,
  });

  if (pasFout) {
    // Zichtbaar maar zacht. Een pas die niet ingezet kon worden kost een
    // reeks en hoort niet stil te gebeuren, maar de rollover mag er niet op
    // stuklopen: de andere profielen moeten nog.
    console.error(
      `weekpas verbruiken mislukte voor doel ${weekdoel.goal_id}: ${pasFout.message}`,
    );
  } else if (geredeWeek === true) {
    gered = 1;
  }

  return { gemist: 1, vrijgesteld: 0, gered };
}

/**
 * Schuift het weekplan van dit profiel in en geeft terug hoeveel stappen dat
 * opleverde.
 *
 * ⚠️ **Uit `draaiRollover` getild in QS8-424**, met de kop en de volgorde
 *    ongewijzigd. De aanroeper telt de teruggave op bij `ingeschoven`; dat is
 *    woordelijk dezelfde telling als de `+= 1` die hier stond.
 */
async function schuifWeekplanIn(db: Db, profiel: Profiel, nu: Date): Promise<number> {
  let ingeschoven = 0;

  // -----------------------------------------------------------------------
  // Het weekplan inschuiven — QS8-203, migratie 0137
  // -----------------------------------------------------------------------
  //
  // ⚠️ **De cyclus is `userCycle` en niet `afsluitbaar`.** Dat is het hele
  //    verschil tussen de twee helften van deze job. Afschrijven gaat over de
  //    week die vóórbij is en mag pas na de coulanceperiode; inschuiven gaat
  //    over de week waar de gebruiker nú in zit. Zou dit `afsluitbaar` nemen,
  //    dan komt het nieuwe weekdoel binnen de coulanceperiode in de vórige
  //    week terecht — en die is al verstreken, dus de eerstvolgende ronde
  //    schrijft hem meteen als gemist af. Een minpunt op een weekdoel dat de
  //    app zelf net heeft aangemaakt.
  //
  // ⚠️ **Staat ná het afschrijven en dat is opzet.** Andersom zou het verse
  //    weekdoel in dezelfde ronde langs de `missed`-lus komen. Dat gaat vandaag
  //    goed omdat die lus op `cycle_start_date < afsluitbaar.startDate` filtert,
  //    maar dat is een eigenschap van een andere query — precies het soort
  //    verband dat stilvalt zodra iemand die filter aanpast.
  //
  // ⚠️ **Eén vraag per gebruiker en niet twee per doel** (onwrikbare regel 12).
  //    `weekplan_kandidaten()` geeft de actieve doelen mét openstaande stap en
  //    de vroegste cyclus van dat doel in één keer terug; het omrekenen naar
  //    een cyclusnummer gebeurt hier, met `shared/time`.
  //
  // ⚠️ Idempotent, en de grendel is een unieke index en geen afspraak:
  //    `weekly_plan_steps_een_per_cyclus`. Een tweede ronde in hetzelfde uur
  //    krijgt `al_geactiveerd` terug en maakt niets.
  const huidige = userCycle(
    { weekStartDay: profiel.week_start_day as Weekday, tz: profiel.tz },
    nu,
  );

  const { data: kandidaten, error: kandidaatFout } = await db.rpc('weekplan_kandidaten', {
    p_owner_id: profiel.id,
  });

  if (kandidaatFout) {
    // Zacht: het afschrijven is het echte werk van deze job. Wel zichtbaar —
    // een plan dat niet inschuift, is een week waarin de gebruiker niets te
    // doen heeft zonder dat iemand dat besloten heeft.
    console.error(`weekplan-kandidaten ophalen mislukte voor een profiel: ${kandidaatFout.message}`);
  } else {
    for (const kandidaat of (kandidaten ?? []) as Kandidaat[]) {
      const { data: uitkomst, error: stapFout } = await db.rpc('activeer_weekplanstap', {
        p_goal_id: kandidaat.goal_id,
        p_cycle_start_date: huidige.startDate,
      });

      if (stapFout) {
        console.error(
          `weekplanstap activeren mislukte voor ${kandidaat.goal_id}: ${stapFout.message}`,
        );
        continue;
      }

      // ⚠️ `al_geactiveerd` en `geen_stap` zijn de normale uitkomsten van een
      //    tweede ronde en van een leeg plan. Die tellen niet mee en horen
      //    niet in het log — anders staat er elk uur een regel per doel.
      if ((uitkomst as { ok?: boolean } | null)?.ok === true) ingeschoven += 1;
    }
  }

  return ingeschoven;
}

/**
 * Herberekent de reeks en het risico van elk doel dat deze ronde geraakt is.
 *
 * ⚠️ **Uit `draaiRollover` getild in QS8-424.** De telling is woordelijk
 *    dezelfde: één op elke geslaagde `herbereken_risico`, en de aanroeper telt
 *    de teruggave op bij `risicoBijgewerkt`.
 */
async function herberekenReeksEnRisico(
  db: Db,
  profiel: Profiel,
  geraakteDoelen: ReadonlySet<string>,
): Promise<number> {
  let bijgewerkt = 0;

  for (const goalId of geraakteDoelen) {
    await db.rpc('herbereken_reeks', { p_user_id: profiel.id, p_goal_id: goalId });

    // De Risico-radar — QS8-93, migratie 0051.
    //
    // ⚠️ Hier én in de trigger op `completion_approvals`, en dat zijn samen
    //    precies de twee momenten waarop de uitkomst kan veranderen: een week
    //    die verstrijkt en een week die goedgekeurd wordt. Niet bij elke
    //    schermweergave — dat is acceptatiecriterium 2, en op een gratis tier
    //    is het ook gewoon zonde.
    //
    // ⚠️ De fout wordt gemeld en niet gegooid. Een mislukte risicoberekening
    //    mag de rollover niet stoppen: het minpunt en de reeks zijn het echte
    //    werk, het risico is een afgeleide. Zelfde afweging als bij de
    //    trigger.
    const { error: risicoFout } = await db.rpc('herbereken_risico', {
      p_goal_id: goalId,
    });

    if (risicoFout) {
      console.error(`risico niet herberekend voor ${goalId}: ${risicoFout.message}`);
    } else {
      bijgewerkt += 1;
    }
  }

  return bijgewerkt;
}
