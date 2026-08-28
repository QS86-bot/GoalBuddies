/**
 * IJking van `scripts/migratie-nieuw.mjs`.
 *
 * ⚠️ **De belofte is niet "geeft max + 1".** Dat is wat iedereen al deed, en het
 *    is precies waarom er op 28-08-2026 drie keer een nummer botste. De belofte
 *    is: *het nummer is vrij op élke branch die de remote kent* — ook op
 *    branches waarvan de PR nog niet geland is, want juist die dragen de nummers
 *    die nog niet in `main` staan.
 *
 * ⚠️ **En de must-allow-helft: een achtervoegsel claimt geen nieuw nummer.**
 *    `0039a` is nazorg op 0039. Zou dat als 39 tellen én als een eigen claim,
 *    dan schuift elke suffix het volgende nummer op en ontstaat er een gat — en
 *    een gat maakt `migraties:controle` rood.
 */
import { describe, expect, it } from 'vitest';

import {
  branchesVoorOp,
  hoogsteIn,
  nummerUit,
  sjabloon,
  volgendVrijNummer,
} from '../../scripts/migratie-nieuw.mjs';

describe('nummerUit', () => {
  it('leest een gewoon migratienummer', () => {
    expect(nummerUit('0121_reacties_pagineren_met_een_cursor.sql')).toBe(121);
  });

  it('leest een achtervoegsel als het nummer waar het bij hoort', () => {
    expect(nummerUit('0039a_weekpas_maximum_niet_voor_anon.sql')).toBe(39);
  });

  it('laat alles met rust wat geen migratie is', () => {
    expect(nummerUit('README.md')).toBeNull();
    expect(nummerUit('schema-opbouwen.sh')).toBeNull();
    // Niet aan het begin: geen claim.
    expect(nummerUit('backup_0042_iets.sql')).toBeNull();
    // Drie cijfers is de vorm niet.
    expect(nummerUit('042_iets.sql')).toBeNull();
  });
});

describe('hoogsteIn', () => {
  it('vindt het hoogste nummer', () => {
    expect(hoogsteIn(['0001_a.sql', '0121_b.sql', '0042_c.sql'])).toBe(121);
  });

  it('geeft nul bij een lijst zonder migraties', () => {
    expect(hoogsteIn(['README.md'])).toBe(0);
    expect(hoogsteIn([])).toBe(0);
  });

  it('laat een achtervoegsel het nummer niet opschuiven', () => {
    expect(hoogsteIn(['0039_a.sql', '0039a_b.sql'])).toBe(39);
  });
});

describe('volgendVrijNummer', () => {
  it('telt door op de werkkopie als die het hoogst is', () => {
    expect(volgendVrijNummer({ lokaal: ['0121_a.sql'], perBranch: { 'origin/main': 118 } })).toBe(122);
  });

  // ⚠️ Dit is het geval waar het script voor gemaakt is. Zonder de branches zou
  //    dit 122 geven — en dat is precies het nummer dat op 28-08 botste.
  it('slaat een nummer over dat op een ándere branch al geclaimd is', () => {
    expect(
      volgendVrijNummer({
        lokaal: ['0121_a.sql'],
        perBranch: { 'origin/main': 123, 'origin/fix/iets': 118 },
      }),
    ).toBe(124);
  });

  it('telt ook een branch mee die nog niet geland is', () => {
    expect(
      volgendVrijNummer({
        lokaal: ['0117_a.sql'],
        perBranch: { 'origin/main': 117, 'origin/fix/nog-open': 118 },
      }),
    ).toBe(119);
  });

  it('werkt op een lege map', () => {
    expect(volgendVrijNummer({ lokaal: [], perBranch: {} })).toBe(1);
  });
});

describe('branchesVoorOp', () => {
  it('noemt alleen de branches die hóger zitten dan de werkkopie', () => {
    const voorop = branchesVoorOp({
      lokaal: ['0121_a.sql'],
      perBranch: { 'origin/main': 123, 'origin/oud': 4, 'origin/gelijk': 121 },
    });
    expect(voorop).toEqual([{ branch: 'origin/main', hoogste: 123 }]);
  });

  it('zegt niets als de werkkopie voorloopt — dan is er niets aan de hand', () => {
    expect(branchesVoorOp({ lokaal: ['0130_a.sql'], perBranch: { 'origin/main': 123 } })).toEqual([]);
  });
});

describe('sjabloon', () => {
  // Onwrikbare regel 20: een migratie zonder rollback-pad in de kop is rood bij
  // `migraties:controle`. Het sjabloon hoort daar niet doorheen te vallen.
  it('draagt een rollback-pad vanaf het begin', () => {
    const tekst = sjabloon({ nummer: 124, naam: 'iets' });
    expect(tekst).toContain('ROLLBACK-PAD:');
    expect(tekst.startsWith('-- 0124_iets.sql')).toBe(true);
  });
});
