import { describe, expect, it } from 'vitest';

import {
  isKolomOnbekend,
  isTabelOnbekend,
  strafGroepen,
  type MijnGroep,
} from '../../src/modules/commitments/strafgroepen';

/**
 * De keuzelijst van een straf op een teamaandeel — QS8-698.
 *
 * ⚠️ De database weigert de verkeerde keuze (0325, `bewaak_teamstraf()`). Deze
 *    toets legt vast dat de lijst er geen aanbiedt: een keuze die de database
 *    weigert, is in het scherm een belofte die niet waar is.
 */

const TEAM: MijnGroep = { id: 'team', name: 'Team Marketing', organization_id: 'org' };
const ANDER_TEAM: MijnGroep = { id: 'team2', name: 'Team Sales', organization_id: 'org' };
const VRIENDEN: MijnGroep = { id: 'vrienden', name: 'Hardloopgroep', organization_id: null };
const ZATERDAG: MijnGroep = { id: 'zaterdag', name: 'Zaterdagclub', organization_id: null };
const MIJN = [TEAM, ANDER_TEAM, VRIENDEN, ZATERDAG];

describe('strafGroepen op een aandeel', () => {
  it('biedt alleen het eigen team als groep aan', () => {
    const { groepen } = strafGroepen(MIJN, 'team');
    expect(groepen.map((g) => g.id)).toEqual(['team']);
  });

  it('laat de leden alleen uit het eigen team komen, nooit uit een vriendengroep', () => {
    const { ledenVan } = strafGroepen(MIJN, 'team');
    expect(ledenVan).toEqual(['team']);
    expect(ledenVan).not.toContain('vrienden');
    expect(ledenVan).not.toContain('team2');
  });

  it('biedt niets aan als de gebruiker niet meer in het team zit', () => {
    const zonderTeam = [VRIENDEN, ZATERDAG];
    expect(strafGroepen(zonderTeam, 'team')).toEqual({ groepen: [], ledenVan: [] });
  });
});

describe('strafGroepen op een gewoon doel', () => {
  it('biedt geen teamgroep aan als groep', () => {
    const { groepen } = strafGroepen(MIJN, null);
    expect(groepen.map((g) => g.id)).toEqual(['vrienden', 'zaterdag']);
    expect(groepen.map((g) => g.id)).not.toContain('team');
    expect(groepen.map((g) => g.id)).not.toContain('team2');
  });

  it('laat leden alleen komen uit niet-organisatiegroepen (regel M2)', () => {
    const { ledenVan } = strafGroepen(MIJN, null);
    expect(ledenVan).toEqual(['vrienden', 'zaterdag']);
    expect(ledenVan).not.toContain('team');
  });

  it('is leeg als alle groepen van een organisatie zijn', () => {
    expect(strafGroepen([TEAM, ANDER_TEAM], null)).toEqual({ groepen: [], ledenVan: [] });
  });
});

describe('de terugval vóór de teamketen', () => {
  it('telt alleen "tabel bestaat niet" als reden om geen aandeel te zoeken', () => {
    expect(isTabelOnbekend('42P01')).toBe(true);
    expect(isTabelOnbekend('PGRST205')).toBe(true);
    // Een tijdelijke fout of een rechtenfout mag geen aandeel als privédoel tonen.
    expect(isTabelOnbekend('PGRST301')).toBe(false);
    expect(isTabelOnbekend('42501')).toBe(false);
    expect(isTabelOnbekend(undefined)).toBe(false);
  });

  it('telt alleen "kolom bestaat niet" als reden om organisatie als privé te lezen', () => {
    expect(isKolomOnbekend('42703')).toBe(true);
    expect(isKolomOnbekend('42P01')).toBe(false);
    expect(isKolomOnbekend('57014')).toBe(false);
  });
});
