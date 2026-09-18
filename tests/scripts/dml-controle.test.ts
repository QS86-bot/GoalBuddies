import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `review-controle.test.ts`.
import {
  beoordeel,
  DML_MET_REDEN,
  topniveauDml,
  zonderFunctielichamen,
} from '../../scripts/dml-controle.mjs';

/**
 * De ijking van `npm run dml:controle` (QS8-528).
 *
 * ⚠️⚠️ **De helft "moet met rust gelaten worden" is hier de zwaarste, en dat is
 *    gemeten.** Een woordtelling op `update` geeft over deze migratiemap **206**
 *    treffers; de eenheid *statement* geeft er **23**. Het verschil zijn
 *    `create policy … for update`, `create trigger … after update on` en
 *    `grant update (…)` — allemaal DDL. Een controle die er 206 meldt, leer je
 *    uitzetten.
 */

const migratie = (sql: string) => sql;

describe('wat de controle moet vinden', () => {
  it('een `update` op topniveau', () => {
    expect(topniveauDml(migratie('update t set n = n + 1;'))).toHaveLength(1);
  });

  it('een `insert into` en een `delete from` op topniveau', () => {
    expect(topniveauDml(migratie("insert into t (a) values (1);"))).toHaveLength(1);
    expect(topniveauDml(migratie('delete from t where a = 1;'))).toHaveLength(1);
  });

  it('meerdere statements in één bestand, elk apart', () => {
    const sql = 'update a set x = 1; create table b (id int); delete from c;';
    expect(topniveauDml(sql)).toHaveLength(2);
  });

  it('DML ná een functiedefinitie telt gewoon mee', () => {
    const sql = `
      create function f() returns void language plpgsql as $fn$
      begin update binnen set x = 1; end; $fn$;
      update buiten set y = 2;
    `;
    const uit = topniveauDml(sql);
    expect(uit).toHaveLength(1);
    expect(uit[0]).toContain('buiten');
  });
});

describe('wat de controle met rust moet laten', () => {
  /**
   * ⚠️ De drie DDL-vormen die het wóórd `update` dragen. Zonder deze poort
   *    meldt de controle 206 in plaats van 23.
   */
  it('`create policy … for update` is geen DML', () => {
    expect(topniveauDml('create policy p on t for update to authenticated using (true);')).toEqual([]);
  });

  it('`create trigger … after update on` is geen DML', () => {
    expect(topniveauDml('create trigger tr after update on t for each row execute function f();')).toEqual([]);
  });

  it('`grant update (…) on … to …` is geen DML', () => {
    expect(topniveauDml('grant update (naam) on groups to authenticated;')).toEqual([]);
  });

  it('DML binnen een functielichaam', () => {
    const sql = `create function f() returns void language plpgsql as $fn$
      begin update t set n = n + 1; delete from u; end; $fn$;`;
    expect(topniveauDml(sql)).toEqual([]);
  });

  it('DML in commentaar', () => {
    expect(topniveauDml('-- update t set n = n + 1;\ncreate table t (id int);')).toEqual([]);
    expect(topniveauDml('/* update t set n = n + 1; */ create table t (id int);')).toEqual([]);
  });

  /**
   * ⚠️⚠️ **De vorm die er écht toe doet, en mijn eerste toets miste hem.**
   *    Bij het ijken werd de controle rood zonder dat één toets omviel: de twee
   *    gevallen hierboven beginnen met `--` of `/*`, en die matchen het
   *    `^`-anker sowieso niet — ze waren groen om de verkeerde reden.
   *
   *    Wat de knip wél nodig heeft is een **`;` binnen het commentaar**, want
   *    dan begint het volgende fragment met de DML-tekst erna. 📏 Beide vormen
   *    staan echt in de map: `0176` (`insert into t default values` in een kop)
   *    en `0265` (`update groups -- set created_at = …`).
   */
  it('commentaar met een puntkomma erin, zodat de tekst erna een fragment begint', () => {
    expect(topniveauDml('-- zie 0204; update public.group_members set status = 1\ncreate table t (id int);')).toEqual([]);
    expect(topniveauDml('-- de kop legt uit; insert into t default values\nalter table t add column x int;')).toEqual([]);
  });

  it('een `$$`-lichaam zonder tag', () => {
    expect(topniveauDml('create function f() returns void as $$ update t set n = 1; $$ language sql;')).toEqual([]);
  });
});

describe('het register', () => {
  const perMigratie = {
    '0001': { naam: '0001_x.sql', statements: ['update t set n = 1 where n is null'] },
  };

  it('een geregistreerd statement geeft geen bevinding', () => {
    const uit = beoordeel(perMigratie, { '0001': [{ bevat: 'update t set n = 1', reden: 'r' }] });
    expect(uit.ongeregistreerd).toEqual([]);
    expect(uit.verweesd).toEqual([]);
  });

  it('een niet-geregistreerd statement is een bevinding', () => {
    const uit = beoordeel(perMigratie, {});
    expect(uit.ongeregistreerd).toHaveLength(1);
    expect(uit.ongeregistreerd[0].naam).toBe('0001_x.sql');
  });

  /**
   * ⚠️⚠️ Zonder deze helft rot het register: een rij blijft staan nadat het
   *    statement eruit is, en dekt morgen een ánder statement dat toevallig
   *    hetzelfde fragment draagt. Tak 5 van `definer_bewaking()` doet het om
   *    dezelfde reden.
   */
  it('een registerrij die niets meer dekt is een bevinding', () => {
    const uit = beoordeel(perMigratie, {
      '0001': [
        { bevat: 'update t set n = 1', reden: 'r' },
        { bevat: 'delete from allang_weg', reden: 'r' },
      ],
    });
    expect(uit.ongeregistreerd).toEqual([]);
    expect(uit.verweesd).toHaveLength(1);
    expect(uit.verweesd[0].bevat).toBe('delete from allang_weg');
  });

  it('een register voor een migratie die geen DML meer heeft, is ook verweesd', () => {
    const uit = beoordeel({}, { '0099': [{ bevat: 'update weg set x = 1', reden: 'r' }] });
    expect(uit.verweesd).toHaveLength(1);
  });

  it('elke registerrij draagt een niet-lege reden', () => {
    for (const [nummer, rijen] of Object.entries(DML_MET_REDEN)) {
      for (const rij of rijen as { bevat: string; reden: string }[]) {
        expect(rij.reden.length, `${nummer}: ${rij.bevat}`).toBeGreaterThan(10);
      }
    }
  });
});

describe('zonderFunctielichamen', () => {
  it('vervangt een lichaam door een merkteken en plakt niets aan elkaar', () => {
    const uit = zonderFunctielichamen('update a set x = 1; $fn$ body $fn$ update b set y = 2;');
    expect(uit).toContain('update a');
    expect(uit).toContain('update b');
    expect(uit).not.toContain('body');
  });
});
