import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { en } from '../i18n/en';
import { nl } from '../i18n/nl';
// ⚠️ Uit de bronbestanden en niet uit de barrel: de barrel trekt react-native mee (zie `merken.test.ts`).
import { contrastRatio } from '../theme/contrast';
import { pictogramkleurenDonker, pictogramkleurenLicht } from '../theme/pictogramkleuren';
import { allePaletten } from '../theme/uiterlijken';

import {
  BETEKENISSEN,
  PICTOGRAM_BETEKENISSEN,
  PICTOGRAMMEN,
  pictogramLabel,
  pictogramToegestaan,
  teken,
  TEKENINGEN,
  VERLOPEN,
  verlopenVan,
} from './pictogrammen';

/**
 * De naden van de pictogrammen — QS8-730, regel 18.
 *
 * ⚠️ Elke toets hier is met de hand gebroken en rood gezien; zie het PR-verslag.
 */

const WORTEL = fileURLToPath(new URL('../../..', import.meta.url));
const NEGATIEF = /gemist|missed|verbroken|broken|achterstand|behind|leeg|lege|verloren|lost/i;

describe('de lijst die CategorieMerk-achtige componenten kennen', () => {
  it('heeft voor elk benoemd pictogram een tekening, een betekenis en een label in beide talen', () => {
    for (const naam of PICTOGRAMMEN) {
      expect(TEKENINGEN[naam].delen.length, naam).toBeGreaterThan(0);
      expect(PICTOGRAM_BETEKENISSEN[naam].length, naam).toBeGreaterThan(0);
      expect(nl[`pictogram.${naam}` as keyof typeof nl], naam).toBeTruthy();
      expect(en[`pictogram.${naam}` as keyof typeof en], naam).toBeTruthy();
    }
    expect(Object.keys(TEKENINGEN).sort()).toEqual([...PICTOGRAMMEN].sort());
    expect(Object.keys(PICTOGRAM_BETEKENISSEN).sort()).toEqual([...PICTOGRAMMEN].sort());
  });

  it('geeft het label uit de catalogus, en zegt bij vergrendeld ook in tekst dat het nog te behalen is', () => {
    expect(pictogramLabel('vlam', false)).toBe(nl['pictogram.vlam']);
    expect(pictogramLabel('vlam', true)).toContain(nl['pictogram.vlam']);
    expect(pictogramLabel('vlam', true)).not.toBe(pictogramLabel('vlam', false));
  });

  it('draagt geen emoji of tekst in de tekening', () => {
    for (const naam of PICTOGRAMMEN) {
      for (const deel of TEKENINGEN[naam].delen) expect(deel.d, naam).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/);
    }
  });
});

describe('kleuren komen uit het palet', () => {
  const sleutels = Object.keys(pictogramkleurenDonker);

  it('noemt alleen sleutels die in beide paletten bestaan', () => {
    expect(Object.keys(pictogramkleurenLicht).sort()).toEqual([...sleutels].sort());
    for (const naam of PICTOGRAMMEN) {
      const genoemd = TEKENINGEN[naam].delen.flatMap((d) => [d.vul, d.rand]).filter((k) => k !== undefined);
      for (const k of [...genoemd, ...TEKENINGEN[naam].drager]) expect(sleutels, `${naam}: ${k}`).toContain(k);
    }
    for (const stops of Object.values(VERLOPEN)) for (const k of stops) expect(sleutels).toContain(k);
  });

  it('laat elke dragende kleur ook echt in de tekening voorkomen', () => {
    for (const naam of PICTOGRAMMEN) {
      const gebruikt = new Set(TEKENINGEN[naam].delen.flatMap((d) => [d.vul, d.rand]));
      for (const k of TEKENINGEN[naam].drager) expect(gebruikt.has(k), `${naam}: ${k}`).toBe(true);
    }
  });

  it('gebruikt nooit het statusrood als kleur van een pictogram', () => {
    for (const [naam, palet] of allePaletten()) {
      const kleuren = naam.includes('licht') ? pictogramkleurenLicht : pictogramkleurenDonker;
      for (const [sleutel, waarde] of Object.entries(kleuren)) {
        expect(waarde.toLowerCase(), `${naam}: ${sleutel}`).not.toBe(palet.colors.red.toLowerCase());
      }
    }
  });
});

describe('leesbaar op elk uiterlijk en op de heldenoppervlakken', () => {
  // ⚠️ bg, panel en panelDark: de drie vlakken waar ook een heldenoppervlak uit kiest.
  it('haalt voor de dragende kleuren 3:1 op elk vlak van elk palet', () => {
    const dragers = PICTOGRAMMEN.flatMap((p) => TEKENINGEN[p].drager.map((sleutel) => [p, sleutel] as const));
    for (const [naam, palet] of allePaletten()) {
      const kleuren = naam.includes('licht') ? pictogramkleurenLicht : pictogramkleurenDonker;
      for (const [pictogram, sleutel] of dragers) {
        for (const vlak of ['bg', 'panel', 'panelDark'] as const) {
          expect(
            contrastRatio(kleuren[sleutel], palet.colors[vlak]),
            `${pictogram}.${sleutel} op ${vlak} van ${naam}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('haalt 3:1 voor de rand van de vergrendelde variant', () => {
    for (const [naam, palet] of allePaletten()) {
      const kleuren = naam.includes('licht') ? pictogramkleurenLicht : pictogramkleurenDonker;
      for (const vlak of ['bg', 'panel', 'panelDark'] as const) {
        expect(contrastRatio(kleuren.slotRand, palet.colors[vlak]), `${vlak} van ${naam}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('vergrendeld is dezelfde vorm in grijs', () => {
  const slot = new Set(['slot', 'slotRand', 'slotLicht'].map((k) => pictogramkleurenDonker[k as 'slot']));

  it('gebruikt alleen de slotkleuren, geen verloop en dezelfde paden', () => {
    for (const naam of PICTOGRAMMEN) {
      const open = teken(naam, pictogramkleurenDonker, false, 'x');
      const dicht = teken(naam, pictogramkleurenDonker, true, 'x');
      expect(dicht.map((d) => d.d), naam).toEqual(open.map((d) => d.d));
      for (const deel of dicht) {
        expect(deel.fill === 'none' || slot.has(deel.fill), `${naam} vulling`).toBe(true);
        expect(deel.stroke === 'none' || slot.has(deel.stroke), `${naam} rand`).toBe(true);
      }
    }
  });

  it('maakt de gradiënt-ids per instantie uniek', () => {
    const a = teken('vlam', pictogramkleurenDonker, false, 'a');
    const b = teken('vlam', pictogramkleurenDonker, false, 'b');
    expect(a[0]?.fill).toContain('a-vlam');
    expect(b[0]?.fill).toContain('b-vlam');
    expect(verlopenVan('medaille')).toEqual(['goud']);
  });
});

describe('alleen bij positieve dingen — domeinregel 7', () => {
  it('kent geen negatieve betekenis', () => {
    for (const b of BETEKENISSEN) expect(b).not.toMatch(NEGATIEF);
  });

  it('laat hart en duim alleen aanmoediging zijn, en kroon en bliksem alleen zeldzaam', () => {
    for (const n of ['hart', 'duim'] as const) expect(PICTOGRAM_BETEKENISSEN[n]).toEqual(['aanmoediging']);
    for (const n of ['kroon', 'bliksem'] as const) expect(PICTOGRAM_BETEKENISSEN[n]).toEqual(['zeldzame_prestatie']);
    expect(pictogramToegestaan('hart', 'reeks')).toBe(false);
  });

  /**
   * ⚠️ De naad: elk gebruik in de schermlaag draagt een betekenis die bestaat, en
   *    een toestemming die bij dat pictogram hoort. Zonder gebruik is dit leeg en
   *    dat is geen fout; zodra er een scherm komt, is dit de poort.
   */
  it('laat elk gebruik in app/ en src/ een toegestane betekenis dragen', () => {
    const bestanden = ['app', 'src']
      .flatMap((m) => readdirSync(join(WORTEL, m), { recursive: true, withFileTypes: true }))
      .filter((e) => e.isFile() && /\.tsx$/.test(e.name) && !/\.test\./.test(e.name) && e.name !== 'Pictogram.tsx')
      .map((e) => relative(WORTEL, join(e.parentPath, e.name)));

    for (const f of bestanden) {
      const bron = readFileSync(join(WORTEL, f), 'utf8');
      for (const m of bron.matchAll(/<Pictogram\b[^>]*>/g)) {
        const naam = /naam=["{']+(\w+)/.exec(m[0])?.[1];
        const betekenis = /betekenis=["{']+(\w+)/.exec(m[0])?.[1];
        expect(naam, `${f}: naam`).toBeTruthy();
        expect(betekenis, `${f}: betekenis`).toBeTruthy();
        expect(pictogramToegestaan(naam as never, betekenis as never), `${f}: ${naam}/${betekenis}`).toBe(true);
      }
    }
  });
});
