/**
 * De belofte van QS8-723 (criterium 3): **een scherm of component bevat geen kleurliteraal; alle kleuren staan in `tokens.ts`.**
 *
 * ⚠️ Waarom een bronscan en geen render: er is geen React-testbibliotheek die schermen tekent, en de belofte is een eigenschap
 *    van de bron ("er staat nergens een hex"), niet van wat er op een scherm komt. De scan leest `app/` en `src/shared/ui/`, knipt
 *    commentaar met de gedeelde knip, en meldt `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(` en `rgba(`.
 *
 * ⚠️ Een uiterlijk dat een ander accent heeft, krijgt een andere knopkleur; die staat daarom in het palet (`knop`, `knopTekst`)
 *    en niet meer als literaal in `Button.tsx` (daar stonden `#141e3c` en `#ffffff`).
 *
 * IJKING — met de hand, per grendel (QS8-723):
 *   A  een `'#ff0000'` in `app/(tabs)/index.tsx` → de sweep rood, met dat bestand als treffer
 *   B  de uitzondering voor `app/+html.tsx` uit het register halen → de registertoets rood
 *   C  een `rgba(0,0,0,0.5)` in `src/shared/ui/Card.tsx` → de sweep rood
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';

const WORTEL = fileURLToPath(new URL('../..', import.meta.url));

/**
 * De bewuste uitzonderingen, mét reden. ⚠️ Een register van één rij; een tweede rij is een gesprek en geen toevoeging.
 */
const TOEGESTAAN: Readonly<Record<string, string>> = {
  'app/+html.tsx':
    '`theme-color` wordt door het besturingssysteem gelezen voordat er JavaScript draait; er is hier geen thema-context (zie de kop van het bestand).',
};

/** Vindt kleurliteralen in code; commentaar is er al uit. */
export function kleurliteralen(bron: string): readonly string[] {
  return [...zonderCommentaar(bron).matchAll(/#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|\brgba?\s*\(/g)].map(
    (m) => m[0],
  );
}

function bronBestanden(map: string): string[] {
  return readdirSync(join(WORTEL, map), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name))
    .map((e) => relative(WORTEL, join(e.parentPath, e.name)).split('\\').join('/'));
}

describe('kleurliteralen', () => {
  it('vindt hex in elke lengte en rgb(a)', () => {
    expect(kleurliteralen("const a = '#fff'; const b = '#1a2b3c'; const c = '#1a2b3c80';")).toHaveLength(3);
    expect(kleurliteralen("x = 'rgba(0,0,0,0.5)'; y = 'rgb (1,2,3)';")).toHaveLength(2);
  });

  it('laat commentaar, issuenummers in commentaar en gewone tekst met rust', () => {
    expect(kleurliteralen('// #fff en #123456\n{/* haalde #169 weg */}\nconst x = 1;')).toEqual([]);
    expect(kleurliteralen("const href = '#sectie'; const kop = 'Nummer 12';")).toEqual([]);
  });
});

describe('heel app/ en src/shared/ui/', () => {
  const bestanden = [...bronBestanden('app'), ...bronBestanden('src/shared/ui')];

  it('kent geen kleurliteraal buiten het register', () => {
    const treffers = bestanden
      .filter((f) => TOEGESTAAN[f] === undefined)
      .map((f) => [f, kleurliteralen(readFileSync(join(WORTEL, f), 'utf8'))] as const)
      .filter(([, k]) => k.length > 0);
    expect(treffers).toEqual([]);
  });

  it('heeft elke geregistreerde plek ook echt', () => {
    for (const [f] of Object.entries(TOEGESTAAN)) {
      expect(kleurliteralen(readFileSync(join(WORTEL, f), 'utf8')).length, f).toBeGreaterThan(0);
    }
  });
});
