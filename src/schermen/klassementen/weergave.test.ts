import { describe, expect, it } from 'vitest';

import type { Klassementkaart } from '@/modules/buddies';

import { filterOpties, FILTER_ALLE, geldigFilter, kolommenVoor, zichtbareKaarten } from './weergave';

/**
 * Het filter en de kolommen van "Alle klassementen" — QS8-666 (A57b), 3c-ui. Fixtures, geen scherm.
 *
 * IJKING (met de hand, 22-11-2026): in `kolommenVoor` `min(3, aantal)` weghalen -> 'geen lege kolommen' valt om; in `filterOpties` de grens
 * `< 2` op `< 1` zetten -> 'geen chips bij één groep' valt om; `geldigFilter` altijd het filter laten teruggeven -> 'valt terug' valt om.
 */
const kaart = (groupId: string): Klassementkaart => ({ groupId, groepnaam: `Groep ${groupId}`, bovenste: [], eigen: null, ledental: 3, iedereenOpNul: false });

describe('filterOpties', () => {
  it('geen keuzes bij minder dan twee kaarten', () => {
    expect(filterOpties([], 0)).toEqual([]);
    expect(filterOpties([kaart('a')], 1)).toEqual([]);
  });

  it('"Alle (N)" met het totaal uit de RPC, en één keuze per kaart in de volgorde van de kaarten', () => {
    const opties = filterOpties([kaart('b'), kaart('a')], 12);
    expect(opties.map((o) => o.waarde)).toEqual([FILTER_ALLE, 'b', 'a']);
    expect(opties[0]?.label).toBe('Alle (12)');
    expect(opties[1]?.label).toBe('Groep b');
  });
});

describe('zichtbareKaarten en geldigFilter', () => {
  const kaarten = [kaart('a'), kaart('b')];

  it('alle kaarten, of alleen de gekozen', () => {
    expect(zichtbareKaarten(kaarten, FILTER_ALLE)).toHaveLength(2);
    expect(zichtbareKaarten(kaarten, 'b').map((k) => k.groupId)).toEqual(['b']);
  });

  it('een gekozen groep die na een herlading weg is, valt terug op alle', () => {
    expect(geldigFilter('b', kaarten)).toBe('b');
    expect(geldigFilter('weg', kaarten)).toBe(FILTER_ALLE);
    expect(geldigFilter(FILTER_ALLE, [])).toBe(FILTER_ALLE);
  });
});

describe('kolommenVoor', () => {
  it('één kolom op een smal scherm, hoeveel kaarten er ook zijn', () => {
    expect(kolommenVoor('bovenrand', 1)).toBe(1);
    expect(kolommenVoor('bovenrand', 7)).toBe(1);
  });

  it('op een breed scherm drie, of minder als er minder kaarten zijn: geen lege kolommen', () => {
    expect(kolommenVoor('zijkant', 1)).toBe(1);
    expect(kolommenVoor('zijkant', 2)).toBe(2);
    expect(kolommenVoor('zijkant', 3)).toBe(3);
    expect(kolommenVoor('zijkant', 9)).toBe(3);
    expect(kolommenVoor('zijkant', 0)).toBe(1);
  });
});
