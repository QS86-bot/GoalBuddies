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
  botsendeBranches,
  hoofdbranchVoorop,
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
  it('telt door op de werkkopie', () => {
    expect(volgendVrijNummer({ lokaal: ['0121_a.sql'] })).toBe(122);
  });

  /**
   * ⚠️⚠️ **Deze twee eisten tot QS8-365 het tegenovergestelde**, en dat is de
   *    kern van dat issue: ze lazen een branch mee in het nummer, en dan staat er
   *    een gat in de eigen map. `migraties:controle` wordt daar rood van, en in
   *    CI is de branch die het gat vult niet te zien — `actions/checkout@v4`
   *    haalt er één op. 📏 Drie keer op één dag gemeten en drie keer met de hand
   *    teruggezet; `docs/decisions/2026-09-08-het-gat-is-erger-dan-de-botsing.md`.
   *
   *    Ze staan er nog, omgedraaid, omdat dít de gevallen zijn waar iemand naar
   *    zoekt als hij zich afvraagt of de branches meetellen.
   */
  // ⚠️ De branches staan niet meer in de handtekening, en dat is de reparatie
  //    zelf: er valt niets meer mee te geven dat het nummer kan verschuiven.
  //    Dát een échte branch het nummer niet verschuift, staat end-to-end in
  //    `migratie-fetch.test.ts` — daar is er een, op een echte remote.
  it('kijkt alleen naar het hoogste dat er lokaal staat', () => {
    expect(volgendVrijNummer({ lokaal: ['0117_a.sql', '0003_b.sql'] })).toBe(118);
  });

  it('werkt op een lege map', () => {
    expect(volgendVrijNummer({ lokaal: [] })).toBe(1);
  });
});

describe('botsendeBranches', () => {
  it('noemt de branches die precies dit nummer dragen', () => {
    expect(
      botsendeBranches({
        volledig: { 'origin/a': [117, 118], 'origin/b': [119], 'origin/c': [118] },
        nummer: 118,
      }),
    ).toEqual(['origin/a', 'origin/c']);
  });

  // ⚠️ Op het hóógste nummer kijken zou `origin/a` hier missen: die draagt 118
  //    én 119. Vandaar de volledige verzameling en niet het maximum per branch.
  it('vindt ook een branch die het nummer niet als hoogste draagt', () => {
    expect(botsendeBranches({ volledig: { 'origin/a': [118, 119] }, nummer: 118 })).toEqual([
      'origin/a',
    ]);
  });

  it('zwijgt als niemand het draagt', () => {
    expect(botsendeBranches({ volledig: { 'origin/a': [117] }, nummer: 118 })).toEqual([]);
  });
});

describe('hoofdbranchVoorop', () => {
  // ⚠️ De énige toestand waarin het nieuwe nummer écht fout is: `main` heeft het
  //    al, en er valt niets te hernummeren maar te pullen.
  it('meldt het als origin/main hoger staat dan de werkkopie', () => {
    expect(hoofdbranchVoorop({ lokaal: ['0117_a.sql'], perBranch: { 'origin/main': 120 } })).toEqual(
      { hoofd: 'origin/main', hoogste: 120, hier: 117 },
    );
  });

  it('zwijgt als de werkkopie bij is', () => {
    expect(hoofdbranchVoorop({ lokaal: ['0120_a.sql'], perBranch: { 'origin/main': 120 } })).toBeNull();
  });

  // ⚠️ Een feature-branch die vooroploopt is géén verouderde werkkopie. Zou deze
  //    functie die meetellen, dan krijgt de lezer "ga pullen" op een branch die
  //    nergens heen te pullen is.
  it('kijkt niet naar feature-branches', () => {
    expect(
      hoofdbranchVoorop({
        lokaal: ['0117_a.sql'],
        perBranch: { 'origin/main': 117, 'origin/iets': 130 },
      }),
    ).toBeNull();
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
