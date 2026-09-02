import { describe, expect, it } from 'vitest';

import { MAPPEN, overslaan, treffersIn } from '../../scripts/emoji-controle.mjs';

/**
 * De ijking van `npm run emoji:controle`.
 *
 * ⚠️ Tweezijdig: de vormen die hij moet vinden én de vormen die hij met rust
 *    moet laten. Een controle die alles meldt, leer je te negeren.
 */
describe('wat de controle moet vinden', () => {
  it('een emoji in een knoptekst', () => {
    const uit = treffersIn('web/src/Knop.tsx', ['<button>Start de zelftest 🚀</button>']);
    expect(uit).toHaveLength(1);
    expect(uit[0]?.regel).toBe(1);
  });

  it('een vlag en een hartje', () => {
    expect(treffersIn('web/src/x.tsx', ['🇳🇱 welkom', 'met ❤ gemaakt'])).toHaveLength(2);
  });

  it('een emoji in een mailsjabloon', () => {
    expect(treffersIn('n8n/templates/spiegel.html', ['<p>Dit ben jij ✨</p>'])).toHaveLength(1);
  });

  it('de vinkjes en kruisjes uit het symbolenblok', () => {
    expect(treffersIn('web/src/x.tsx', ['✅ gelukt', '❌ mislukt', '⭐ 5 sterren'])).toHaveLength(3);
  });
});

describe('wat de controle met rust moet laten', () => {
  it('de waarschuwingsdriehoek en pijlen uit de huisstijl', () => {
    expect(treffersIn('web/src/x.tsx', ['⚠️ let op', 'a → b'])).toEqual([]);
  });

  it('commentaar, in alle drie de vormen', () => {
    expect(
      treffersIn('web/src/x.tsx', [' * ⚠️ 😀 in een kop', '// 😀', '/* 😀 */', '<!-- 😀 -->']),
    ).toEqual([]);
  });

  it('een testbestand', () => {
    expect(overslaan('web/src/tekst.test.ts', 'expect(telTekens("😀")).toBe(1)')).toBe(true);
    expect(treffersIn('web/src/tekst.test.ts', ['telTekens("👨‍👩‍👧‍👦")'])).toEqual([]);
  });

  it('gewone tekst zonder emoji', () => {
    expect(treffersIn('web/src/x.tsx', ['<h1>Je weet wat je wilt</h1>'])).toEqual([]);
  });
});

describe('de opstelling', () => {
  it('kijkt niet in docs/content — dat is van Evianne', () => {
    expect(MAPPEN.some((m: string) => m.startsWith('docs'))).toBe(false);
  });
});
