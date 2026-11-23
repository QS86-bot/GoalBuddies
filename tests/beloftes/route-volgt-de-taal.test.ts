import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Elke route in `app/` volgt de taal — QS8-796.
 *
 * ⚠️ **De belofte is "een taalwissel bereikt elke route", en die wordt gedragen door
 *    één regel per route.** De navigator verpakt elke route in een
 *    `StaticContainer`; een render van bovenaf komt er niet doorheen. Een route die
 *    `useVolgTaal()` niet aanroept, blijft na een taalwissel in de oude taal staan
 *    (F1), en blijft bij direct laden in de apparaattaal staan als het profiel een
 *    andere taal heeft (F2). Dat de hook het werk dóét, toetst
 *    `tests/render/taal-volgt-de-bron.test.ts` op twee routes achter de echte muur;
 *    dit bestand toetst dat élke route hem heeft, ook de volgende die erbij komt.
 *
 * ⚠️ **Als eerste regel van de standaardexport, en dat is strenger dan nodig.** Een
 *    hook mag ook verderop staan, zolang hij maar onvoorwaardelijk is. Eerste regel
 *    is de vorm die met tekst te toetsen is zonder een parser, en een vorm die je
 *    niet kunt toetsen is een gewoonte.
 *
 * Uitzondering, met reden: `app/+html.tsx` rendert alleen bij `expo export` op de
 * bouwmachine en nooit in de client; daar valt niets te wisselen.
 *
 * IJKING — met de hand, 23-11-2026: `useVolgTaal();` uit
 *    `app/instellingen/index.tsx` halen → rood met die route in de lijst.
 */

const WORTEL = fileURLToPath(new URL('../..', import.meta.url));
const UITZONDERINGEN = new Map([['app/+html.tsx', 'rendert alleen op de bouwmachine']]);

/** Volgt deze bron de taal: is de eerste regel van de standaardexport `useVolgTaal();`? */
export function volgtDeTaal(bron: string): boolean {
  const kop = /^export default function \w*\([^)]*\)[^{]*\{\s*\n\s*useVolgTaal\(\);/m;
  const importeert = /import\s*\{[^}]*\buseVolgTaal\b[^}]*\}\s*from\s*'@\/shared\/i18n\/react';/;
  return kop.test(bron) && importeert.test(bron);
}

function routes(map: string): string[] {
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) return routes(pad);
    return pad.endsWith('.tsx') ? [pad] : [];
  });
}

describe('elke route volgt de taal', () => {
  const alle = routes(join(WORTEL, 'app')).map((p) => relative(WORTEL, p).replaceAll('\\', '/'));

  it('vindt de routes (een lege lijst bewijst niets)', () => {
    expect(alle.length).toBeGreaterThan(40);
    expect(alle).toContain('app/instellingen/[onderdeel].tsx');
  });

  it('elke route behalve de uitzonderingen roept useVolgTaal() als eerste aan', () => {
    const zonder = alle
      .filter((p) => !UITZONDERINGEN.has(p))
      .filter((p) => !volgtDeTaal(readFileSync(join(WORTEL, p), 'utf8')));
    expect(zonder).toEqual([]);
  });

  it('elke uitzondering bestaat nog (een register met dode rijen liegt)', () => {
    for (const pad of UITZONDERINGEN.keys()) expect(alle).toContain(pad);
  });
});

describe('volgtDeTaal() — wat hij vindt en wat hij met rust laat', () => {
  const IMPORT = "import { useVolgTaal } from '@/shared/i18n/react';\n";

  it('herkent de goede vorm', () => {
    expect(volgtDeTaal(`${IMPORT}export default function A() {\n  useVolgTaal();\n  return null;\n}`)).toBe(true);
    expect(volgtDeTaal(`${IMPORT}export default function B({ x }: P) {\n  useVolgTaal();\n}`)).toBe(true);
  });

  it('meldt een route zonder de aanroep', () => {
    expect(volgtDeTaal(`${IMPORT}export default function A() {\n  return null;\n}`)).toBe(false);
  });

  it('meldt een aanroep die niet de eerste regel is', () => {
    expect(volgtDeTaal(`${IMPORT}export default function A() {\n  const x = 1;\n  useVolgTaal();\n}`)).toBe(false);
  });

  it('meldt een aanroep in een andere functie dan de standaardexport', () => {
    const bron = `${IMPORT}function Hulp() {\n  useVolgTaal();\n}\nexport default function A() {\n  return null;\n}`;
    expect(volgtDeTaal(bron)).toBe(false);
  });

  it('meldt een standaardexport die geen functiedeclaratie is', () => {
    expect(volgtDeTaal(`${IMPORT}const A = () => null;\nexport default A;`)).toBe(false);
  });

  it('meldt een aanroep zonder de import uit shared/i18n/react', () => {
    expect(volgtDeTaal(`export default function A() {\n  useVolgTaal();\n}`)).toBe(false);
  });
});
