import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';
import { useGehydrateerd } from '../../src/shared/ui/useGehydrateerd';

/**
 * De prerender is neutraal: server en eerste clientronde tekenen hetzelfde — QS8-740.
 *
 * ⚠️ **De belofte is "een client met een andere taal dan de bouwmachine geeft geen
 *    React-fout #418".** Dat is een eigenschap van het geheel: de hook moet op de
 *    server `false` geven, en alles wat van de taal afhangt moet erachter staan.
 *    Eén van de twee alleen laat de fout bestaan.
 *
 * 📏 De toestand ervóór, gemeten op een lokale webexport (19-11-2026): Node heeft
 *    een globale `navigator` waarvan `language` de `LANG` van de bouwmachine
 *    volgt, dus de prerender stond in de taal van de machine waarop `npm run
 *    deploy` draait. Bouwmachine `en-US` × client `nl-NL`: 2 × #418; bouwmachine
 *    `nl-NL` × client `en-US`: 2 × #418; gelijke talen: 0. Na de reparatie 0 in
 *    alle 12 combinaties (3 paden × 2 bouwtalen × 2 clienttalen).
 *
 * ⚠️ **Wat dit niet bewijst, staat erbij.** Er is geen renderer in dit project met
 *    een DOM, dus de hydratie zelf is met Playwright gemeten en niet in CI. De
 *    eerste toets bewijst de serverhelft (er komt niets uit); de tweede de
 *    aansluiting in `Shell`. Dat er geen tekst in de `<body>` van de export
 *    staat, is met de hand gemeten (`index.html`, beide bouwtalen).
 *
 * IJKING — met de hand, 19-11-2026, vooraf en achteraf 5 groen:
 *
 *   A  `opServer` geeft `true`
 *      -> rood: 'op de server geeft de hook false, dus er wordt niets getekend'
 *   B  de poort in `Shell` weghalen (alles altijd tekenen)
 *      -> rood: 'Shell tekent de wachters en de Stack pas na de hydratie'
 *   C  `<Pushwacht />` buiten de poort zetten
 *      -> rood: 'Shell tekent de wachters en de Stack pas na de hydratie'
 */

// ⚠️ `react-dom/server` heeft in dit project geen typedeclaratie en `@types/react-dom`
//    toevoegen is een dependency voor één toets. Via een variabele laden houdt de
//    compiler erbuiten; het smalle type hieronder is alles wat deze test gebruikt.
const SERVER = 'react-dom/server';
const { renderToStaticMarkup } = (await import(SERVER)) as {
  renderToStaticMarkup: (element: unknown) => string;
};

describe('de serverhelft', () => {
  it('op de server geeft de hook false, dus er wordt niets getekend', () => {
    const Kind = () => (useGehydrateerd() ? createElement('span', null, 'tekst') : null);
    expect(renderToStaticMarkup(createElement(Kind))).toBe('');
  });

  it('de hook geeft op de server een boolean en geen undefined', () => {
    let waarde: unknown = 'nog niet';
    const Probe = () => {
      waarde = useGehydrateerd();
      return null;
    };
    renderToStaticMarkup(createElement(Probe));
    expect(waarde).toBe(false);
  });
});

describe('de aansluiting in Shell', () => {
  const root = zonderCommentaar(readFileSync(join(__dirname, '..', '..', 'app', '_layout.tsx'), 'utf8'));
  const shell = root.slice(root.indexOf('function Shell()'), root.indexOf('function Shell()') + 1500);

  it('Shell vraagt of de hydratie klaar is', () => {
    expect(shell).toMatch(/const klaar = useGehydrateerd\(\)/);
  });

  it('Shell tekent de wachters en de Stack pas na de hydratie', () => {
    const poort = shell.indexOf('{klaar ?');
    expect(poort).toBeGreaterThan(-1);
    for (const deel of ['<Routewacht />', '<Uitnodigingswacht />', '<Pushwacht />', '<Tijdzonewacht />', '<Stack']) {
      const plek = shell.indexOf(deel);
      expect(plek, `${deel} hoort in Shell te staan`).toBeGreaterThan(-1);
      expect(plek, `${deel} hoort achter de poort te staan`).toBeGreaterThan(poort);
    }
  });

  it('de poort staat binnen de View en laat bij false niets tekenen', () => {
    expect(shell).toMatch(/\) : null\}/);
  });
});
