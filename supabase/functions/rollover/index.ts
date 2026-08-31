import { createClient } from 'jsr:@supabase/supabase-js@2';

// ⚠️ Rechtstreeks uit cycle.ts en types.ts, niet via index.ts. Die laatste
//    re-exporteert ook clock.ts, en dat bestand leest process.env om freezeNow()
//    in productie te weigeren — op Deno is dat een valkuil die je pas merkt als
//    de job 's nachts stilvalt.
import { closableUserCycle, cyclesBetween, userCycle, userCycleOn } from '../_shared/time/cycle.ts';
import type { Weekday } from '../_shared/time/types.ts';
import { localDateIn } from '../_shared/time/zoned.ts';
import { meld } from '../_shared/melden.ts';
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

interface Profiel {
  id: string;
  week_start_day: number;
  tz: string;
}

/** Eén rij uit `weekplan_kandidaten()` — migratie 0137. */
interface Kandidaat {
  goal_id: string;
  eerste_cyclus: string | null;
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

async function draaiRollover(auth: string): Promise<Response> {


  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? auth.replace(/^Bearer\s+/i, ''),
    { auth: { persistSession: false } },
  );

  const { data: profielen, error: profielFout } = await db
    .from('profiles')
    .select('id, week_start_day, tz');

  if (profielFout) {
    // ⚠️ De melding van Postgres gaat door `scrubMessage()` heen voordat er iets
    //    verstuurd wordt; een geciteerde waarde uit een constraint blijft hier.
    await meld(new Error(`profielen ophalen mislukte: ${profielFout.message}`), 'rollover.profielen', {
      code: 'profielen_ophalen_mislukt',
    });
    return new Response(JSON.stringify({ error: profielFout.message }), { status: 500 });
  }

  const nu = new Date();
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

  for (const profiel of (profielen ?? []) as Profiel[]) {
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
    let afsluitbaar;
    try {
      afsluitbaar = closableUserCycle(
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
      overgeslagen += 1;
      continue;
    }

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
      console.error(`straffen afwikkelen mislukte voor ${profiel.id}: ${strafFout.message}`);
    } else {
      verschuldigd += typeof straffen === 'number' ? straffen : 0;
    }

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
      .lt('cycle_start_date', afsluitbaar.startDate)
      .order('cycle_start_date', { ascending: true });

    if (openFout) {
      console.error(`weekdoelen ophalen mislukte voor ${profiel.id}: ${openFout.message}`);
      continue;
    }

    for (const weekdoel of (open ?? []) as unknown as OpenWeekdoel[]) {
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

      if (pauze) {
        const { error: pauzeFout } = await db
          .from('weekly_goals')
          .update({ status: 'excused' })
          .eq('id', weekdoel.id);

        if (pauzeFout) {
          console.error(`vrijstellen mislukte voor ${weekdoel.id}: ${pauzeFout.message}`);
          continue;
        }

        vrijgesteld += 1;
        continue;
      }

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
        continue;
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

      gemist += 1;

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
          `weekpas verbruiken mislukte voor ${profiel.id}/${weekdoel.goal_id}: ${pasFout.message}`,
        );
      } else if (geredeWeek === true) {
        gered += 1;
      }
    }

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
      console.error(`weekplan-kandidaten ophalen mislukte voor ${profiel.id}: ${kandidaatFout.message}`);
    } else {
      for (const kandidaat of (kandidaten ?? []) as Kandidaat[]) {
        // ⚠️ Geen rekenwerk in SQL: het cyclusnummer komt uit `shared/time`,
        //    net als in `maakWeekdoel()` (correctheidsregel 7).
        const eerste =
          kandidaat.eerste_cyclus === null
            ? null
            : userCycleOn(
                { weekStartDay: profiel.week_start_day as Weekday, tz: profiel.tz },
                kandidaat.eerste_cyclus,
              );

        const index = eerste === null ? 1 : cyclesBetween(eerste, huidige) + 1;

        const { data: uitkomst, error: stapFout } = await db.rpc('activeer_weekplanstap', {
          p_goal_id: kandidaat.goal_id,
          p_cycle_start_date: huidige.startDate,
          p_cycle_index: index,
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

    // Reeksen herberekenen voor de doelen die geraakt zijn. Herberekenen en
    // niet ophogen: user_streaks is cache, geen waarheid.
    const geraakteDoelen = new Set((open ?? []).map((w) => (w as unknown as OpenWeekdoel).goal_id));
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
        risicoBijgewerkt += 1;
      }
    }
  }

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
  }

  // ⚠️ **De goedkeuringstermijn — QS8-178, migratie 0135.** Een voltooiing die op
  //    goedkeuring wacht terwijl de beoordelaars zijn weggevallen, bleef eeuwig
  //    `pending`: geen minpunt, maar ook nooit punten. Vier routes leiden daarheen
  //    en alle vier zijn het handelingen van een ánder — de beheerder deactiveert
  //    je beoordelaar, archiveert de groep, of de eigenaar ontkoppelt zijn doel.
  //
  //    Beslisdocument 001 §2.6b.3 had dit al besloten en het was nooit gebouwd:
  //    bij het verstrijken van de termijn krijgt het weekdoel alsnog zijn punten,
  //    zodat een trage buddy jou geen minpunt kan bezorgen.
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
    console.error(`vastgelopen goedkeuringen afhandelen mislukte: ${termijnFout.message}`);
    await meld(
      new Error(`vastgelopen goedkeuringen afhandelen mislukte: ${termijnFout.message}`),
      'rollover.goedkeuringstermijn',
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      gemist,
      gered,
      overgeslagen,
      vrijgesteld,
      verschuldigd,
      profielen: (profielen ?? []).length,
      geslapen: geslapen ?? 0,
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
      recaps: (recaps as { recaps?: number } | null)?.recaps ?? 0,
      // ⚠️ Om dezelfde reden als `recaps` hierboven: een job zonder scherm heeft
      //    alleen zijn uitvoer. Wat hij niet teruggeeft, is niet gebeurd voor wie
      //    het log leest — en dít getal hoort nul te zijn zolang er niets vastloopt.
      alsnogGoedgekeurd: (alsnogGoedgekeurd as number | null) ?? 0,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
