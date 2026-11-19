import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BADGES } from '@/modules/goals/badges';
import { UITZONDERINGEN } from '../../../scripts/emoji-controle.mjs';

import { BADGE_EMOJI, emojiVoorPrestatie } from './prestatie-emoji';

const pictografisch = /\p{Extended_Pictographic}/u;

describe('emojiVoorPrestatie — QS8-732', () => {
  it('geeft elke badge precies één emoji, uit een vaste lijst', () => {
    expect(Object.keys(BADGE_EMOJI).sort()).toEqual([...BADGES].sort());
    for (const b of BADGES) expect([...BADGE_EMOJI[b].replace('️', '')]).toHaveLength(1);
  });

  it('toont de emoji bij een behaalde prestatie als de schakelaar aan staat', () => {
    for (const b of BADGES) expect(emojiVoorPrestatie(b, true, true)).toBe(BADGE_EMOJI[b]);
  });

  it('toont bij "uit" geen enkel emoji-teken, voor geen enkele prestatie', () => {
    for (const b of BADGES) {
      for (const behaald of [true, false]) {
        const uit = emojiVoorPrestatie(b, behaald, false);
        expect(uit).toBeNull();
        expect(pictografisch.test(String(uit ?? ''))).toBe(false);
      }
    }
  });

  it('toont bij een vergrendelde prestatie nooit een emoji, ook bij "aan"', () => {
    for (const b of BADGES) expect(emojiVoorPrestatie(b, false, true)).toBeNull();
  });

  it('de lijst is gelijk aan wat de controle toestaat: geen teken erbij, geen teken eraf', () => {
    const inLijst = new Set(Object.values(BADGE_EMOJI).map((e) => e.replace('️', '')));
    const mag = new Set(UITZONDERINGEN['src/schermen/prestaties/prestatie-emoji.ts']?.tekens);
    expect(inLijst).toEqual(mag);
  });
});

describe('de naad: het scherm gebruikt alleen de ene beslisser', () => {
  const bron = (naam: string) =>
    readFileSync(fileURLToPath(new URL(naam, import.meta.url)), 'utf8');

  it('Prestatiescherm.tsx draagt zelf geen emoji en haalt hem uit emojiVoorPrestatie met de voorkeur', () => {
    const scherm = bron('./Prestatiescherm.tsx');
    expect(pictografisch.test(scherm.replace(/⚠️?/g, ''))).toBe(false);
    expect(scherm).toMatch(/emojiVoorPrestatie\(p\.badge, p\.behaaldOp !== null, voorkeur\.emoji\)/);
    expect(scherm).not.toMatch(/BADGE_EMOJI/);
  });

  it('de emoji staat in een veld dat voor schermlezers verborgen is', () => {
    expect(bron('./Prestatiescherm.tsx')).toMatch(/<Text aria-hidden importantForAccessibility="no-hide-descendants"/);
  });
});
