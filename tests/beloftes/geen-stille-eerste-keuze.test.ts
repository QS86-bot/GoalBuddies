import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from './roept-aan';

/**
 * Hulpvraag, straf, getuige en taak delen kiezen nooit stilzwijgend de eerste
 * kandidaat — QS8-651 (regel 18, vraag 6).
 *
 * ⚠️ **De naad.** `geldigeKeuze()` kán bij twee kandidaten niets kiezen (dat staat
 *    in `groepskeuze.test.ts`). Deze toets bewaakt de andere helft: dat de
 *    schermen die functie gebruiken en er geen `[0]` naast zetten. Tot QS8-651
 *    stonden er vijf, en elk scherm klopte op zich.
 *
 * ⚠️ Toetst de belofte (geen stille standaard in deze schermen) en niet een
 *    regelnummer; de functie `staandeStandaarden()` krijgt elke vorm los.
 */

const SCHERMEN = [
  '../../app/doel/[id].tsx',
  '../../app/(tabs)/lijst.tsx',
].map((p) => fileURLToPath(new URL(p, import.meta.url)));

/** Elke `groepen[0]` / `mensen[0]` die als waarde gelezen wordt (`?.`, `.` of `!`). */
export function staandeStandaarden(inhoud: string): readonly string[] {
  const bron = zonderCommentaar(inhoud);
  return [...bron.matchAll(/\b(?:groepen|mensen)\[0\]\s*[?!.]/g)].map((m) => m[0]);
}

describe('staandeStandaarden — de controle zelf', () => {
  it('vindt de vormen die er stonden', () => {
    expect(staandeStandaarden("useState(groepen[0]?.id ?? '')")).toHaveLength(1);
    expect(staandeStandaarden("(mensen[0]?.id ?? '')")).toHaveLength(1);
    expect(staandeStandaarden('const g = groepen[0].group_id;')).toHaveLength(1);
    expect(staandeStandaarden('onDeel(groepen[0]!.id)')).toHaveLength(1);
  });

  it('laat commentaar en andere indexen met rust', () => {
    expect(staandeStandaarden('// groepen[0]?.id was de standaard')).toHaveLength(0);
    expect(staandeStandaarden('const u = "https://x"; groepen[1]?.id')).toHaveLength(0);
    expect(staandeStandaarden('groepen.length')).toHaveLength(0);
  });
});

describe('de schermen', () => {
  for (const pad of SCHERMEN) {
    it(`${pad.split('/app/')[1]} heeft geen stille eerste-uit-de-lijst`, () => {
      const inhoud = readFileSync(pad, 'utf8');
      const gevonden = staandeStandaarden(inhoud);
      // `lijst.tsx` r.555 deelt direct bij precies één groep; dat is de
      // exact-één-regel en de enige toegestane `[0]`, achter een length-check.
      const toegestaan = pad.endsWith('lijst.tsx') ? 1 : 0;
      expect(gevonden).toHaveLength(toegestaan);
    });
  }

  it('gebruikt geldigeKeuze op alle vier de plekken', () => {
    const doel = readFileSync(SCHERMEN[0] as string, 'utf8');
    const lijst = readFileSync(SCHERMEN[1] as string, 'utf8');
    expect((zonderCommentaar(doel).match(/geldigeKeuze\(/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((zonderCommentaar(lijst).match(/geldigeKeuze\(/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });
});
