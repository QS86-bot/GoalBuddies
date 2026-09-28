/**
 * De `for update` in `weekplanstap_naar_weekdoel()`, met twee echte sessies —
 * QS8-575, rij 594 van `docs/ENGINEER-REVIEW.md`.
 *
 * ⚠️⚠️ **Waarom deze toets er niet was.** Rij 594 schreef het zelf op: *"Toetsen
 *    vraagt twee gelijktijdige transacties en dus een eigen opzet — bewust niet
 *    in deze PR gebouwd."* 📏 En hij mat wat dat kostte: met de clausule eruit
 *    bleef **de hele RLS-suite groen — 180 bestanden, 2086 tests**. Er was geen
 *    enkele toets die het verschil zag.
 *
 * ⚠️⚠️ **En wat er zonder de grendel gebeurt is erger dan die rij beschreef.**
 *    De rij zegt dat de unieke index het *"alsnog vangt, maar als
 *    storingsmelding in plaats van als een nette `al_geactiveerd`"*. 📏 Met de
 *    hand nagemeten op stand 0294, twee sessies op dezelfde stap:
 *
 *      met `for update`     A: ok        B: al_verbruikt   1 weekdoel
 *      zonder `for update`  A: ok        B: **ok**         2 weekdoelen
 *
 *    Er komt dus **geen** storingsmelding. De unieke index die de rij bedoelt is
 *    `weekly_plan_steps_een_per_cyclus` op `(goal_id, activated_cycle)`, en
 *    beide transacties werken dezelfde **stap**rij bij — er is geen tweede rij
 *    om mee te botsen. Niets vangt het.
 *
 * ⚠️⚠️ **Het gevolg is een stille dubbele, en hij raakt de score.** 📏 Gemeten:
 *    twee weekdoelen voor hetzelfde doel in dezelfde cyclus, waarvan er één
 *    **wees** is (geen enkele stap wijst ernaar), en `goals.max_points` staat op
 *    **2** in plaats van 1. Domeinregel 10: *"Elk doel heeft een puntenplafond:
 *    de som van de plafondpunten van zijn weekdoelen."* Het plafond is daarmee
 *    opgeblazen door een race, en niet doordat iemand een taak toevoegde.
 *
 * ⚠️ **De volgorde van de twee sessies doet er niet toe, en dat is met opzet.**
 *    Deze toets telt de uitkomsten als verzameling: precies één `ok` en precies
 *    één `al_verbruikt`. Wie van de twee wint hangt van de planner en de machine
 *    af, en een toets die dát vastlegt is een toets die op een trage runner
 *    omvalt zonder dat er iets stuk is.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { psql, psqlParallel, stackBeschikbaarOfFaal } from './psql-stack';

const TEST_TIMEOUT = 120_000;

const METEN = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'weekplanstap_naar_weekdoel'",
  import.meta.url,
);

/**
 * Eigen id's per run.
 *
 * ⚠️ Vaste uuid's zouden twee gelijktijdige suite-runs op elkaar laten botsen —
 *    dezelfde klasse die `proefCode()` voor `invite_code` oplost (QS8-542).
 */
const GEBRUIKER = crypto.randomUUID();
const DOEL = crypto.randomUUID();
const STAP = crypto.randomUUID();

function opzet(): void {
  psql(`
    insert into auth.users (id, email)
      values ('${GEBRUIKER}', 'race-${GEBRUIKER}@proef.nl');
    insert into public.goals (id, owner_id, title, status, target_date)
      values ('${DOEL}', '${GEBRUIKER}', 'Racedoel', 'active', current_date + 60);
    insert into public.weekly_plan_steps (id, goal_id, title, order_index)
      values ('${STAP}', '${DOEL}', 'Stap 1', 1);
  `);
}

function ruimOp(): void {
  psql(`
    delete from public.weekly_goals where goal_id = '${DOEL}';
    delete from public.weekly_plan_steps where goal_id = '${DOEL}';
    delete from public.goals where id = '${DOEL}';
    delete from auth.users where id = '${GEBRUIKER}';
  `);
}

/**
 * Twee sessies die dezelfde onverbruikte stap tegelijk activeren.
 *
 * ⚠️ Sessie A houdt zijn transactie open met `pg_sleep`, zodat de aanroep van B
 *    er gegarandeerd binnen valt. Zónder die overlap meet deze toets niets: dan
 *    is het gewoon twee keer achter elkaar, en dát is al gedekt door de
 *    `al_verbruikt`-tak in `tests/rls/weekplan.test.ts`.
 */
const SESSIES = [
  `begin;
   select public.weekplanstap_naar_weekdoel('${STAP}'::uuid, current_date)::text;
   select pg_sleep(2);
   commit;`,
  `select pg_sleep(0.5);
   select public.weekplanstap_naar_weekdoel('${STAP}'::uuid, current_date)::text;`,
];

describe.skipIf(!METEN)('twee rollover-rondes op dezelfde weekplanstap', () => {
  afterAll(() => {
    if (METEN) ruimOp();
  });

  it(
    'laat er precies één door en geeft de ander `al_verbruikt`',
    async () => {
      opzet();

      const uit = await psqlParallel(SESSIES, { gelijktijdig: 2 });
      const samen = uit.join('\n');

      const gelukt = (samen.match(/"ok": true/g) ?? []).length;
      const verbruikt = (samen.match(/al_verbruikt/g) ?? []).length;

      // ⚠️ Als verzameling geteld: wie van de twee wint hangt van de planner af.
      expect({ gelukt, verbruikt }).toEqual({ gelukt: 1, verbruikt: 1 });

      // ⚠️⚠️ **Dit is de assertie die zonder de grendel omvalt.** 📏 Zonder
      //    `for update` staan hier er **twee**, allebei uit een geslaagde
      //    aanroep, en vangt geen enkele constraint dat af.
      const weekdoelen = psql(
        `select count(*) from public.weekly_goals where goal_id = '${DOEL}';`,
      ).trim();

      expect(weekdoelen).toBe('1');

      // ⚠️ En geen wees: elk weekdoel hoort bij een stap die ernaar wijst.
      //    Zonder de grendel is er één weekdoel waar niets naar verwijst, en dat
      //    is precies het exemplaar dat niemand ooit terugvindt.
      const wezen = psql(`
        select count(*) from public.weekly_goals w
         where w.goal_id = '${DOEL}'
           and not exists (
             select 1 from public.weekly_plan_steps s where s.weekly_goal_id = w.id
           );
      `).trim();

      expect(wezen).toBe('0');

      // ⚠️⚠️ **Het puntenplafond is de reden dat dit meer is dan netheid.**
      //    Domeinregel 10: het plafond van een doel is de som van de
      //    plafondpunten van zijn weekdoelen, en `recalc_goal_max_points()`
      //    rekent dat als `sum(points_ceiling)`. Eén weekdoel met plafond `+2`
      //    geeft dus **2**.
      //
      //    ⚠️ Hier stond eerst `'1'`, en dat was een aanname over het
      //       puntenmodel in plaats van een meting — het plafond is +2 per
      //       weekdoel en niet +1. De toets werd er terecht rood van.
      const plafond = psql(
        `select coalesce(max_points, -1) from public.goals where id = '${DOEL}';`,
      ).trim();

      expect(plafond).toBe('2');
    },
    TEST_TIMEOUT,
  );
});
