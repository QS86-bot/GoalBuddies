import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Een adempauze begint binnen een venster — QS8-373, migratie 0216.
 *
 * ⚠️⚠️ **`breathers` groeide onbeperkt, en alle drie de bestaande toetsen waren
 *    juist.** `te_lang` begrenst de **lengte** van één pauze, de overlaptoets
 *    begrenst twee pauzes op dezelfde cyclus, en de advisory lock begrenst
 *    gelijktijdigheid. Geen van drieën zegt iets over hoe ver vooruit een pauze
 *    mag beginnen — en cyclus 1, 2, 3 … tot in het jaar 3000 overlappen elkaar
 *    niet. Onwrikbare regel 18 in zijn gewone vorm: elk onderdeel klopt en het
 *    geheel lekt.
 *
 * 📏 Vóór 0216 gaven 200 aanroepen met niet-overlappende cyclusstarts 200 rijen,
 *    in één transactie, zonder één weigering.
 *
 * ⚠️ **Deze test telt de rijen en toetst niet alleen de weigering**, want dat is
 *    de belofte: er is een bovengrens. Een test die alleen kijkt of één ver
 *    weggelegen datum geweigerd wordt, blijft groen bij een venster van duizend
 *    cycli — en dan is er nog steeds geen grens die iets voorstelt.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'plan_adempauze'",
  import.meta.url,
);

/**
 * Zet een gebruiker met één doel neer, doet `aantal` pogingen op opeenvolgende
 * cyclusstarts vanaf `vanafCycli` cycli na vandaag, en geeft terug hoeveel rijen
 * er in `breathers` staan. Rolt alles terug.
 */
function pauzesNaPogingen(aantal: number, vanafCycli = 0): number {
  const uit = psql(`
    begin;
    create temp table v (uid uuid, goal uuid, start date);
    grant select, insert, update on v to authenticated;
    insert into v (uid) values (shim_maak_gebruiker('venster@proef.test', 'Venster'));
    update profiles set tz = 'Europe/Amsterdam', week_start_day = 1
     where id = (select uid from v);
    insert into goals (owner_id, title, target_date)
      select uid, 'Vensterdoel', current_date + 400 from v;
    update v set goal = (select id from goals where owner_id = (select uid from v) limit 1);
    update v set start = (date_trunc('week', current_date) + interval '${vanafCycli} weeks')::date;

    select set_config('request.jwt.claims',
      json_build_object('sub', (select uid from v), 'role', 'authenticated')::text, true);
    set local role authenticated;
    do $lus$
    declare i int; v_start date := (select start from v); v_goal uuid := (select goal from v);
    begin
      for i in 0..${aantal - 1} loop
        perform plan_adempauze(v_goal, v_start + i * 7, v_start + i * 7);
      end loop;
    end $lus$;
    reset role;
    select count(*) from breathers where goal_id = (select goal from v);
    rollback;
  `)
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r !== '')
    .at(-1);

  return Number(uit);
}

/** Geeft de `reason` terug van één poging, `vanafCycli` cycli na vandaag. */
function redenOp(vanafCycli: number): string {
  return (
    psql(`
      begin;
      create temp table v (uid uuid, goal uuid);
      grant select, insert, update on v to authenticated;
      insert into v (uid) values (shim_maak_gebruiker('venster1@proef.test', 'Venster'));
      update profiles set tz = 'Europe/Amsterdam', week_start_day = 1
       where id = (select uid from v);
      insert into goals (owner_id, title, target_date)
        select uid, 'Vensterdoel', current_date + 4000 from v;
      update v set goal = (select id from goals where owner_id = (select uid from v) limit 1);
      select set_config('request.jwt.claims',
        json_build_object('sub', (select uid from v), 'role', 'authenticated')::text, true);
      set local role authenticated;
      select coalesce(
        plan_adempauze(
          (select goal from v),
          (date_trunc('week', current_date) + interval '${vanafCycli} weeks')::date,
          (date_trunc('week', current_date) + interval '${vanafCycli} weeks')::date
        ) ->> 'reason', 'GEEN');
      rollback;
    `)
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r !== '')
      .at(-1) ?? ''
  );
}

describe.skipIf(!beschikbaar)('een adempauze ligt binnen een venster', () => {
  it('MUST-FIND: tweehonderd pogingen leveren geen tweehonderd pauzes op', () => {
    // 📏 Vóór 0216 stond hier 200. Nu ligt de bovengrens op wat er aan
    //    cyclusstarts binnen het venster past.
    const aantal = pauzesNaPogingen(200);

    expect(aantal, 'de opstelling plande niets').toBeGreaterThan(0);
    expect(aantal, `tweehonderd pogingen gaven ${aantal} pauzes`).toBeLessThan(200);
  }, 120_000);

  it('MUST-FIND: een pauze een jaar en een week vooruit wordt geweigerd', () => {
    // 53 cycli: net buiten het venster van 52 vooruit.
    expect(redenOp(53), 'een pauze buiten het venster werd geaccepteerd').toBe('buiten_venster');
  }, 120_000);

  it('MUST-ALLOW: deze cyclus, de volgende, en over een maand mogen gewoon', () => {
    // ⚠️ De keerzijde, en ze is hier het belangrijkst: een venster dat te krap
    //    staat, breekt het plannen van een vakantie. Dit zijn de drie gevallen
    //    die een gebruiker werkelijk invoert.
    for (const cycli of [0, 1, 4]) {
      expect(redenOp(cycli), `cyclus +${cycli} werd geweigerd`).toBe('GEEN');
    }
  }, 120_000);

  it('MUST-ALLOW: een pauze precies op de rand van het venster mag nog', () => {
    // 52 cycli vooruit is de laatste die erin hoort. Zonder dit geval zou een
    // venster dat er één te krap staat ook groen zijn.
    expect(redenOp(52), 'de laatste cyclus binnen het venster werd geweigerd').toBe('GEEN');
  }, 120_000);
});
