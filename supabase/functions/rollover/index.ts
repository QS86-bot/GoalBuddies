import { createClient } from 'jsr:@supabase/supabase-js@2';

// ⚠️ Rechtstreeks uit cycle.ts en types.ts, niet via index.ts. Die laatste
//    re-exporteert ook clock.ts, en dat bestand leest process.env om freezeNow()
//    in productie te weigeren — op Deno is dat een valkuil die je pas merkt als
//    de job 's nachts stilvalt.
import { closableUserCycle } from '../_shared/time/cycle.ts';
import type { Weekday } from '../_shared/time/types.ts';

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
 * ⚠️ Idempotent. De functie raakt uitsluitend weekdoelen met status `todo`, en
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

Deno.serve(async (req: Request) => {
  const auth = req.headers.get('Authorization') ?? '';

  if (rolUit(auth) !== 'service_role') {
    return new Response(JSON.stringify({ error: 'Alleen aanroepbaar als service_role' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? auth.replace(/^Bearer\s+/i, ''),
    { auth: { persistSession: false } },
  );

  const { data: profielen, error: profielFout } = await db
    .from('profiles')
    .select('id, week_start_day, tz');

  if (profielFout) {
    return new Response(JSON.stringify({ error: profielFout.message }), { status: 500 });
  }

  const nu = new Date();
  let gemist = 0;
  let vrijgesteld = 0;
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
      overgeslagen += 1;
      continue;
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
      .eq('status', 'todo')
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

    // Reeksen herberekenen voor de doelen die geraakt zijn. Herberekenen en
    // niet ophogen: user_streaks is cache, geen waarheid.
    const geraakteDoelen = new Set((open ?? []).map((w) => (w as unknown as OpenWeekdoel).goal_id));
    for (const goalId of geraakteDoelen) {
      await db.rpc('herbereken_reeks', { p_user_id: profiel.id, p_goal_id: goalId });
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

  return new Response(
    JSON.stringify({
      ok: true,
      gemist,
      gered,
      overgeslagen,
      vrijgesteld,
      profielen: (profielen ?? []).length,
      geslapen: geslapen ?? 0,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
