import { describe, expect, it } from 'vitest';

import { addDays, userCycle, now, type IsoDate, type Weekday } from '../../src/shared/time';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Een adempauze achteraf dekt hoogstens de laatst gesloten week — QS8-770, migratie 0330.
 *
 * ⚠️ **De belofte is een eigenschap van het geheel:** een gemiste week die verder terug ligt dan
 *    de laatst gesloten week kan niet met een pauze vrijgesteld worden, ook niet door
 *    `plan_adempauze()` rechtstreeks aan te roepen buiten het scherm om. Daarom toetst dit
 *    bestand de database, met `userCycle()` uit `shared/time` als bron van de grens (domeinregel
 *    1): de SQL-kant en de TypeScript-kant van "de lopende cyclus" moeten dezelfde zijn.
 *
 * ⚠️ **Twee week-starts** (maandag en donderdag), want de grens hangt aan `week_start_day` en
 *    een test met één start is groen bij een grens die toevallig op maandag valt.
 *
 * ⚠️ **Beide kanten van de grens.** Alleen "verder terug wordt geweigerd" is groen bij een rem
 *    die alles weigert; de laatst gesloten week en de lopende week moeten wél lukken.
 *
 * Breek de grendel met de hand: haal het `te_ver_terug`-blok uit `plan_adempauze()` (0216) en
 * de geval "twee weken terug" wordt rood, voor beide week-starts.
 */
const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'plan_adempauze'",
  import.meta.url,
);

const TZ = 'Europe/Amsterdam';

/** De uitkomst (`ok` of `reason`) van één poging met `starts_cycle = start`. */
function poging(weekStartDay: number, start: IsoDate): string {
  return (
    psql(`
      begin;
      create temp table v (uid uuid, goal uuid);
      grant select, insert, update on v to authenticated;
      insert into v (uid) values (shim_maak_gebruiker('rem${weekStartDay}@proef.test', 'Rem'));
      update profiles set tz = '${TZ}', week_start_day = ${weekStartDay}
       where id = (select uid from v);
      insert into goals (owner_id, title, target_date)
        select uid, 'Remdoel', current_date + 400 from v;
      update v set goal = (select id from goals where owner_id = (select uid from v) limit 1);
      select set_config('request.jwt.claims',
        json_build_object('sub', (select uid from v), 'role', 'authenticated')::text, true);
      set local role authenticated;
      select coalesce(
        (plan_adempauze((select goal from v), '${start}'::date, '${start}'::date)) ->> 'reason',
        'ok');
      rollback;
    `)
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r !== '')
      .at(-1) ?? ''
  );
}

describe.skipIf(!beschikbaar)('een pauze achteraf dekt hoogstens de laatst gesloten week (0330)', () => {
  it.each([1, 4])('week-start %i: de grens ligt waar currentUserCycle hem legt', (weekStartDay) => {
    const lopend = userCycle({ weekStartDay: weekStartDay as Weekday, tz: TZ }, now()).startDate;

    expect(poging(weekStartDay, addDays(lopend, 0))).toBe('ok'); // de lopende week
    expect(poging(weekStartDay, addDays(lopend, -7))).toBe('ok'); // de laatst gesloten week
    expect(poging(weekStartDay, addDays(lopend, -14))).toBe('te_ver_terug'); // twee weken terug
    expect(poging(weekStartDay, addDays(lopend, -70))).toBe('te_ver_terug');
  }, 120_000);
});
