import { describe, expect, it } from 'vitest';

import { addDays, userCycle, type IsoDate, type Weekday } from '../../src/shared/time';

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
 * ⚠️⚠️ **De cyclusstart komt van de eigenaar en niet van de server (QS8-792).**
 *    Tot 22-11-2026 rekende deze test vanaf `date_trunc('week', current_date)`, dus
 *    in UTC, terwijl `plan_adempauze()` het venster op `eigenaarsdatum()` legt. Op
 *    zondag na 23:00 UTC is het in Amsterdam al maandag: "53 cycli vooruit" was
 *    dan voor de gebruiker 52, en de test viel elk zondagsuur om, ook op `main`.
 *
 *    De SQL-kant van `currentUserCycle` (domeinregel 1) is hier `lopendeCyclus`:
 *    `eigenaarsdatum()` min het aantal dagen sinds `week_start_day`. Hij wordt
 *    vóór `set local role` in tabel `v` gezet, want `eigenaarsdatum()` is niet aan
 *    `authenticated` gegeven. Dat `v.cyc` met `cycli` weken verschoven wordt, is
 *    de enige plek waar de test een datum afleidt.
 */
function lopendeCyclusSql(uid: string): string {
  return `(eigenaarsdatum(${uid})
    - ((extract(dow from eigenaarsdatum(${uid}))::int - (select wsd from v) + 7) % 7))`;
}

const TZ_AMSTERDAM = 'Europe/Amsterdam';

/**
 * Zet een gebruiker met één doel neer, doet `aantal` pogingen op opeenvolgende
 * cyclusstarts vanaf `vanafCycli` cycli na vandaag, en geeft terug hoeveel rijen
 * er in `breathers` staan. Rolt alles terug.
 */
function pauzesNaPogingen(
  aantal: number,
  vanafCycli = 0,
  tz: string = TZ_AMSTERDAM,
  wsd: number = 1,
): number {
  const uit = psql(`
    begin;
    create temp table v (uid uuid, goal uuid, start date, wsd int);
    grant select, insert, update on v to authenticated;
    insert into v (uid, wsd) values (shim_maak_gebruiker('venster@proef.test', 'Venster'), ${wsd});
    update profiles set tz = '${tz}', week_start_day = ${wsd}
     where id = (select uid from v);
    insert into goals (owner_id, title, target_date)
      select uid, 'Vensterdoel', current_date + 400 from v;
    update v set goal = (select id from goals where owner_id = (select uid from v) limit 1);
    update v set start = ${lopendeCyclusSql('(select uid from v)')} + ${vanafCycli} * 7;

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
function redenOp(vanafCycli: number, tz: string = TZ_AMSTERDAM, wsd: number = 1): string {
  return (
    psql(`
      begin;
      create temp table v (uid uuid, goal uuid, start date, wsd int);
      grant select, insert, update on v to authenticated;
      insert into v (uid, wsd) values (shim_maak_gebruiker('venster1@proef.test', 'Venster'), ${wsd});
      update profiles set tz = '${tz}', week_start_day = ${wsd}
       where id = (select uid from v);
      insert into goals (owner_id, title, target_date)
        select uid, 'Vensterdoel', current_date + 4000 from v;
      update v set goal = (select id from goals where owner_id = (select uid from v) limit 1);
      update v set start = ${lopendeCyclusSql('(select uid from v)')} + ${vanafCycli} * 7;
      select set_config('request.jwt.claims',
        json_build_object('sub', (select uid from v), 'role', 'authenticated')::text, true);
      set local role authenticated;
      select coalesce(
        plan_adempauze((select goal from v), (select start from v), (select start from v))
          ->> 'reason', 'GEEN');
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

/**
 * ⚠️⚠️ **De klokgrens zelf (QS8-792).** De databaseklok is in een test niet te
 *    bevriezen, en een vaste zone is dan een bom: Amsterdam wijkt alleen op
 *    zondag in het laatste uur voor middernacht UTC van de week af, dus de rest
 *    van de week is zo'n test groen zonder iets te bewijzen. Pacific/Kiritimati (UTC+14) en
 *    Pacific/Niue (UTC-11) wijken samen op élk moment minstens één kalenderdag
 *    van UTC af, en dat is dezelfde grens als zondag 23:30 UTC in Amsterdam.
 *    Zie `risicoklok.test.ts` voor hetzelfde ontwerp.
 */
describe.skipIf(!beschikbaar)('het venster volgt de kalender van de eigenaar (QS8-792)', () => {
  const zones = ['Pacific/Kiritimati', 'Pacific/Niue', TZ_AMSTERDAM];

  for (const tz of zones) {
    for (const wsd of [1, 4]) {
      it(`${tz}, week-start ${wsd}: 53 cycli is buiten, 52 is op de rand`, () => {
        expect(redenOp(53, tz, wsd), 'buiten het venster werd geaccepteerd').toBe('buiten_venster');
        expect(redenOp(52, tz, wsd), 'de rand werd geweigerd').toBe('GEEN');
      }, 120_000);
    }
  }
});

/**
 * De bevroren klok, aan de TypeScript-kant: dezelfde twee momenten als in het issue.
 * Op zondag 23:30 UTC is het in Amsterdam maandag en op maandag 00:30 UTC ook, en de
 * cyclus moet op beide momenten dezelfde zijn — dat is de belofte die `lopendeCyclusSql`
 * aan de SQL-kant waarmaakt met `eigenaarsdatum()`.
 */
describe('de lopende cyclus op de klokgrens (bevroren klok, shared/time)', () => {
  const zondag = new Date('2026-11-22T23:30:00Z');
  const maandag = new Date('2026-11-23T00:30:00Z');

  it.each([1, 4])('week-start %i: zondag 23:30 en maandag 00:30 UTC geven één cyclus', (wsd) => {
    const cyc = (t: Date): IsoDate =>
      userCycle({ weekStartDay: wsd as Weekday, tz: TZ_AMSTERDAM }, t).startDate;

    expect(cyc(zondag)).toBe(cyc(maandag));
    // en ze verschilt van wat UTC zou zeggen voor week-start 1:
    if (wsd === 1) expect(cyc(zondag)).toBe('2026-11-23');
    expect(addDays(cyc(zondag), 7)).not.toBe(cyc(zondag));
  });
});

