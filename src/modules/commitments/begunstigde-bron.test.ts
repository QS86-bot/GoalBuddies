import { afterEach, describe, expect, it } from 'vitest';

import { STANDAARDTAAL, t, zetTaal } from '../../shared/i18n';

import { BEGUNSTIGDE_BRON, begunstigdeVan, stuurlozeReden } from './begunstigde-bron';

/**
 * QS8-800: welke begunstigde de strafkaart noemt, en in welke woorden.
 *
 * ⚠️ De leesgrens zelf staat in `tests/rls/qs8-800-begunstigde-naam.test.ts`; hier
 *    alleen de pure keuze en de teksten in beide talen (criterium 1).
 */
afterEach(() => {
  zetTaal(STANDAARDTAAL);
});

describe('begunstigdeVan', () => {
  it('kiest de groep als die er is', () => {
    expect(begunstigdeVan({ beneficiary_group_id: 'g', beneficiary_user_id: null })).toEqual({ soort: 'groep', id: 'g' });
  });

  it('kiest de persoon als er geen groep is', () => {
    expect(begunstigdeVan({ beneficiary_group_id: null, beneficiary_user_id: 'p' })).toEqual({ soort: 'persoon', id: 'p' });
  });

  it('geeft niets bij een stuurloze straf (QS8-333 heeft een eigen kaart)', () => {
    expect(begunstigdeVan({ beneficiary_group_id: null, beneficiary_user_id: null })).toBeNull();
  });
});

describe('de bron', () => {
  it('leest alleen kolommen die de eigenaar al mocht lezen', () => {
    // ⚠️ `display_name` staat in de kolomgrant van 0089; `name` in `groups_select`.
    //    Een andere kolom of tabel hier is een nieuwe leesroute en vraagt een
    //    nieuwe toets in de RLS-suite, niet alleen een groene unit-test.
    expect(BEGUNSTIGDE_BRON).toEqual({
      groep: { tabel: 'groups', kolom: 'name' },
      persoon: { tabel: 'profiles', kolom: 'display_name' },
    });
  });
});

describe('de teksten op de kaart', () => {
  it.each(['nl', 'en'] as const)('noemt de naam in %s', (taal) => {
    zetTaal(taal);
    expect(t('straf.begunstigde.groep', { groep: 'Hardloopclub' })).toContain('Hardloopclub');
    expect(t('straf.begunstigde.persoon', { naam: 'Sam' })).toContain('Sam');
    expect(t('straf.begunstigde.groep_onzichtbaar')).not.toBe('straf.begunstigde.groep_onzichtbaar');
    expect(t('straf.begunstigde.persoon_onzichtbaar')).not.toBe('straf.begunstigde.persoon_onzichtbaar');
    expect(t('straf.begunstigde.fout')).not.toBe('straf.begunstigde.fout');
  });

  it('zegt het in het Engels in het Engels', () => {
    zetTaal('en');
    expect(t('straf.begunstigde.groep', { groep: 'X' })).toBe('Witness: the group X');
  });
});

/**
 * QS8-820 (0343): wanneer de kaart een straf stuurloos noemt. Dezelfde toets als
 * `herstel_stuurloze_straf()`; de serverkant staat in
 * `tests/rls/begunstigde-groep-band.test.ts`.
 */
describe('stuurlozeReden', () => {
  const groep = { beneficiary_group_id: 'g', beneficiary_user_id: null };
  const kwijt = { soort: 'groep', naam: null, fout: false } as const;

  it('noemt een verschuldigde straf zonder begunstigde verdwenen', () => {
    expect(stuurlozeReden({ status: 'due', beneficiary_group_id: null, beneficiary_user_id: null }, null)).toBe('verdwenen');
  });

  it('noemt een verschuldigde straf bij een groep die de eigenaar niet meer leest groep_verlaten', () => {
    expect(stuurlozeReden({ status: 'due', ...groep }, kwijt)).toBe('groep_verlaten');
  });

  it('niet zolang de straf niet verschuldigd is: dan kan de eigenaar intrekken', () => {
    expect(stuurlozeReden({ status: 'set', ...groep }, kwijt)).toBeNull();
  });

  it('niet als de eigenaar de groep nog leest, of de naam nog niet geladen is', () => {
    expect(stuurlozeReden({ status: 'due', ...groep }, { soort: 'groep', naam: 'X', fout: false })).toBeNull();
    expect(stuurlozeReden({ status: 'due', ...groep }, null)).toBeNull();
  });

  it('niet bij een storing: bij twijfel geen knop die de server afwijst', () => {
    expect(stuurlozeReden({ status: 'due', ...groep }, { soort: 'groep', naam: null, fout: true })).toBeNull();
  });

  it('niet bij een persoonlijke getuige die geen groep meer deelt (QS8-306 is een ander besluit)', () => {
    expect(
      stuurlozeReden(
        { status: 'due', beneficiary_group_id: null, beneficiary_user_id: 'p' },
        { soort: 'persoon', naam: null, fout: false },
      ),
    ).toBeNull();
  });
});

describe('de kaarttekst bij een groep waar je geen lid meer van bent (QS8-820)', () => {
  it('zegt woordelijk wat het issue vraagt, in het Nederlands', () => {
    zetTaal('nl');
    expect(t('straf.begunstigde.groep_onzichtbaar')).toBe(
      'Getuige: een groep waar je geen lid meer van bent. Zolang dat zo is, krijgt die groep je straf niet te zien.',
    );
  });

  it('en in het Engels', () => {
    zetTaal('en');
    expect(t('straf.begunstigde.groep_onzichtbaar')).toBe(
      'Witness: a group you are no longer a member of. As long as that is the case, that group will not see your penalty.',
    );
  });

  it.each(['nl', 'en'] as const)('heeft een eigen kop en uitleg op de stuurloze kaart in %s', (taal) => {
    zetTaal(taal);
    expect(t('stuurloos.kop_groep')).not.toBe(t('stuurloos.kop'));
    expect(t('stuurloos.uitleg_groep')).not.toBe(t('stuurloos.uitleg'));
    expect(t('stuurloos.kop_groep')).not.toBe('stuurloos.kop_groep');
  });
});
