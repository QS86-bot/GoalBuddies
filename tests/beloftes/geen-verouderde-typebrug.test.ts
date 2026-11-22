import { describe, expect, it } from 'vitest';

import { bevatBewering, leesRepo, vindBruggen } from './typebrug-register';

/**
 * IJking van `tests/beloftes/typebrug-register.ts` — QS8-782.
 *
 * ⚠️ **Drie grendels, apart gevoed:** een bewering zonder register (G1), een ingang
 *    waarvan de sleutel in de typen staat (G2), een ingang die haar bewering kwijt is (G3).
 *    De vormen die hij met rust moet laten staan er ook in: een controle die alles meldt
 *    leer je negeren.
 *
 * IJKING met de hand, 22-11-2026 (wélke test omviel, niet dát er een omviel):
 *   - `NogNietInTypes` terug in `src/modules/auth/profile.ts` → de repo-test meldt
 *     `[zonder-wekker]` voor dat bestand; `G1: een bewering zonder ingang` is hier de test die
 *     hetzelfde met een gevoerde bron doet.
 *   - `"in `src/modules/xp/api.ts`" met de zin "De functie staat nog niet in
 *     `src/lib/database.types.ts`" terug → `[zonder-wekker]`.
 *   - `BRUGGEN = [{ pad: 'a.ts', sleutel: 'mijn_xp', … }]` met de gegenereerde typen → `[overbodig]`.
 */
describe('de repo', () => {
  it('draagt geen tijdelijke typebrug zonder wekker, en geen die voorbij zijn tijd is', () => {
    const { bronnen, types } = leesRepo();
    expect(vindBruggen({ bronnen, types })).toEqual([]);
  });
});

const INGANG = { pad: 'src/x.ts', sleutel: 'nieuwe_functie', reden: 'wacht op 0999' };
const TYPEN_ZONDER = 'Functions: { oude_functie: { Args: {} } }';
const TYPEN_MET = 'Functions: { nieuwe_functie: { Args: {} } }';

describe('G1 — een bewering zonder ingang', () => {
  it.each([
    'export interface NogNietInTypes {}',
    '// De functie staat nog niet in `src/lib/database.types.ts`.',
    ' * `periode_start` staat nog niet in de gegenereerde typen.',
    ' * Die functie staat niet in `database.types.ts`, en dat is geen omissie',
  ])('vindt %s', (bron) => {
    expect(bevatBewering(bron)).toBe(true);
    const v = vindBruggen({ bronnen: [{ pad: 'src/a.ts', bron }], types: TYPEN_ZONDER, register: [] });
    expect(v.map((x: { soort: string }) => x.soort)).toEqual(['zonder-wekker']);
  });

  it.each([
    '// Dit bestand is een afschrift van productie, hergenereer met `npm run types:db`.',
    'const uit = rij.staat_niet_in_de_lijst;',
    '// `database.types.ts` kent deze functie.',
  ])('laat %s met rust', (bron) => {
    expect(bevatBewering(bron)).toBe(false);
  });
});

describe('G2 — een ingang die overbodig is geworden', () => {
  const bron = [{ pad: INGANG.pad, bron: '// staat nog niet in `src/lib/database.types.ts`' }];

  it('is groen zolang de typen de sleutel niet kennen', () => {
    expect(vindBruggen({ bronnen: bron, types: TYPEN_ZONDER, register: [INGANG] })).toEqual([]);
  });

  it('is rood zodra de typen de sleutel kennen', () => {
    const v = vindBruggen({ bronnen: bron, types: TYPEN_MET, register: [INGANG] });
    expect(v.map((x: { soort: string }) => x.soort)).toEqual(['overbodig']);
  });
});

describe('G3 — een ingang zonder bewering', () => {
  it('is rood: het register is verouderd', () => {
    const v = vindBruggen({
      bronnen: [{ pad: INGANG.pad, bron: 'export const x = 1;' }],
      types: TYPEN_ZONDER,
      register: [INGANG],
    });
    expect(v.map((x: { soort: string }) => x.soort)).toEqual(['verouderd-register']);
  });
});
