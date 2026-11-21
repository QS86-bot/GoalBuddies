import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De rollover sluit een week in één transactie af — QS8-687, migratie 0329.
 *
 * ⚠️⚠️ **De belofte is een eigenschap van het geheel, niet van de stappen.** Elke
 *    stap (status, minpunt, weekpas) bestond al en klopte. Wat ontbrak was dat ze
 *    samen heel zijn: viel het platform tussen `status = 'missed'` en het
 *    minpunt, dan bleef de week voorgoed half verwerkt (security-review op
 *    QS8-685). De tests hieronder toetsen dus de uitkomst van de hele aanroep,
 *    en de zwaarste ervan laat een stap midden in een week mislukken.
 *
 * ⚠️ Alles draait in een transactie die wordt teruggerold; er blijft niets staan.
 *    Het minpunt zelf wordt hier niet geteld: `geen_minpunt_zonder_beoordelaar()`
 *    (0065) slaat het over voor een gebruiker zonder buddy, en dat is de bedoeling.
 *    Zijn eigen werking staat in `minpunt.test.ts`.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'sluit_verstreken_weken_af'",
  import.meta.url,
);

/** Een gebruiker met één doel; `v` houdt `uid` en `goal` vast. */
const OPZET = `
  create temp table v (uid uuid, goal uuid);
  insert into v (uid) values (shim_maak_gebruiker('rollover-week@proef.test', 'Week'));
  insert into goals (owner_id, title, target_date)
    select uid, 'Weekdoel', current_date + 400 from v;
  update v set goal = (select id from goals where owner_id = (select uid from v) limit 1);
`;

const week = (titel: string, start: string): string => `
  insert into weekly_goals (goal_id, title, cycle_start_date, status)
    select goal, '${titel}', date '${start}', 'todo' from v;
`;

/** Draait `sql` in een transactie die terugrolt en geeft de laatste regel terug. */
function laatsteRegel(sql: string): string {
  const uit = psql(`begin; ${OPZET} ${sql} rollback;`)
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r !== '' && r !== 'BEGIN' && r !== 'ROLLBACK');
  return uit.at(-1) ?? '';
}

const AANROEP = "select gemist || '/' || vrijgesteld || '/' || gered || '/' || cardinality(geraakte_doelen) from sluit_verstreken_weken_af((select uid from v), date '2026-02-01');";
/** Een aanroep waarvan de uitvoer er niet toe doet; alleen de laatste regel telt. */
const STAP = "select count(*) from sluit_verstreken_weken_af((select uid from v), date '2026-02-01');";
const STATUSSEN = "select string_agg(status, ',' order by cycle_start_date) from weekly_goals where goal_id = (select goal from v);";

describe.skipIf(!beschikbaar)('QS8-687 — sluit_verstreken_weken_af()', () => {
  it('sluit een verstreken week af als missed, en telt hem', () => {
    const uit = laatsteRegel(`${week('w1', '2026-01-05')} ${AANROEP}`);
    expect(uit).toBe('1/0/0/1');
  });

  it('laat een week op of na de grens ongemoeid', () => {
    const uit = laatsteRegel(`
      ${week('voor', '2026-01-05')} ${week('op de grens', '2026-02-01')} ${week('erna', '2026-02-08')}
      ${STAP} ${STATUSSEN}
    `);
    expect(uit).toBe('missed,todo,todo');
  });

  it('stelt een week onder een adempauze vrij, zonder weekpas', () => {
    const uit = laatsteRegel(`
      ${week('w1', '2026-01-05')}
      insert into breathers (user_id, goal_id, starts_cycle, ends_cycle)
        select uid, goal, date '2026-01-05', date '2026-01-05' from v;
      ${AANROEP}
    `);
    expect(uit).toBe('0/1/0/1');
  });

  it('geeft de weekpas aan de oudste gemiste week en niet aan een latere', () => {
    const uit = laatsteRegel(`
      ${week('w1', '2026-01-05')} ${week('w2', '2026-01-12')}
      insert into week_pass_events (user_id, goal_id, event, cycle_start_date)
        select uid, goal, 'earned', date '2025-12-01' from v;
      ${STAP}
      select string_agg(cycle_start_date::text, ',') from week_pass_events
       where user_id = (select uid from v) and event = 'spent';
    `);
    expect(uit).toBe('2026-01-05');
  });

  it('is idempotent: een tweede aanroep vindt niets meer', () => {
    const uit = laatsteRegel(`
      ${week('w1', '2026-01-05')}
      ${STAP}
      ${AANROEP}
    `);
    expect(uit).toBe('0/0/0/0');
  });

  it('draait één week terug als een stap midden erin mislukt, en gaat door met de rest', () => {
    // ⚠️ Een trigger op `points_ledger` die voor één weekdoel faalt: de status
    //    `missed` is dan al gezet en moet weer weg. Zonder subtransactie zou het
    //    hele profiel omvallen, of — erger — blijft de week `missed` zonder punt.
    const uit = laatsteRegel(`
      ${week('kapot', '2026-01-05')} ${week('heel', '2026-01-12')}
      create function pg_temp.faal() returns trigger language plpgsql as $f$
        begin
          if new.delta is not null and (select title from weekly_goals where id = new.ref_id) = 'kapot' then
            raise exception 'proef';
          end if;
          return new;
        end $f$;
      create trigger faal before insert on points_ledger for each row execute function pg_temp.faal();
      ${STAP}
      ${STATUSSEN}
    `);
    expect(uit).toBe('todo,missed');
  });

  it('meldt een week die niet afsluit in `mislukt`, zodat hij niet stil openblijft', () => {
    const uit = laatsteRegel(`
      ${week('kapot', '2026-01-05')}
      create function pg_temp.faal() returns trigger language plpgsql as $f$
        begin raise exception 'proef'; end $f$;
      create trigger faal before insert on points_ledger for each row execute function pg_temp.faal();
      select gemist || '/' || mislukt from sluit_verstreken_weken_af((select uid from v), date '2026-02-01');
    `);
    expect(uit).toBe('0/1');
  });

  it('laat het minpunt staan als de weekpas de reeks redt (domeinregel 10)', () => {
    // ⚠️ Met `beoordeelbaar = true`, anders slaat 0065 het minpunt over en toetst
    //    deze test niets.
    const uit = laatsteRegel(`
      ${week('w1', '2026-01-05')}
      update weekly_goals set beoordeelbaar = true where goal_id = (select goal from v);
      insert into week_pass_events (user_id, goal_id, event, cycle_start_date)
        select uid, goal, 'earned', date '2025-12-01' from v;
      ${STAP}
      select (select count(*) from points_ledger where user_id = (select uid from v) and reason = 'cycle_missed')
          || '/' || (select count(*) from week_pass_events where user_id = (select uid from v) and event = 'spent');
    `);
    expect(uit).toBe('1/1');
  });

  it('raakt een week niet meer aan die intussen niet meer open is', () => {
    // ⚠️ Een weekdoel dat al `pending` is wordt niet eens geselecteerd; dit is de
    //    ondergrens. De race zelf (status verandert ná de selectie) is met één
    //    sessie niet na te bouwen — zie het beslisdocument.
    const uit = laatsteRegel(`
      ${week('w1', '2026-01-05')}
      update weekly_goals set status = 'pending' where goal_id = (select goal from v);
      ${STAP} ${STATUSSEN}
    `);
    expect(uit).toBe('pending');
  });

  it('is niet aanroepbaar voor authenticated of anon', () => {
    const uit = psql(`
      select has_function_privilege('authenticated', 'public.sluit_verstreken_weken_af(uuid,date)', 'execute')
          || ',' || has_function_privilege('anon', 'public.sluit_verstreken_weken_af(uuid,date)', 'execute')
          || ',' || has_function_privilege('service_role', 'public.sluit_verstreken_weken_af(uuid,date)', 'execute');
    `);
    expect(uit).toBe('false,false,true');
  });
});
