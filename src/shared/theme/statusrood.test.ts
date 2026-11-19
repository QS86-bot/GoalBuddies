import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from '../../../scripts/zonder-commentaar.mjs';
import { contrastRatio, WCAG } from './contrast';
import { kleurafstand, MIN_AFSTAND } from './kleurafstand';
import { roles } from './tokens';
import { allePaletten, MODI, UITERLIJKEN, UITERLIJK_IDS, type Modus } from './uiterlijken';

/**
 * Het ene statusrood van de hele app — QS8-743, besluit Quinten 19-11-2026.
 *
 * ⚠️ **Dit bestand toetst een eigenschap van het geheel.** Eén rood, in elk uiterlijk en elke modus, dat op alle
 *    plekken waar het staat dezelfde betekenis draagt (deadline-risico) en op elk palet te onderscheiden is van wat
 *    eromheen ligt. De losse toetsen (`uiterlijken.test.ts`, `kleurafstand.test.ts`, `contrast.test.ts`) toetsen het
 *    rood per palet; deze toetsen de beloften waar QS8-725 (Koraal) en elk volgend palet op leunen.
 */

/**
 * De twee Koraal-kleuren uit de fase-1-acceptatiecriteria §12.3 (donker). Sinds QS8-725 is Koraal een palet (`C-koraal`) en dekt `buren()` ze
 * ook via `accent` en `accenttint`; de constante blijft als vastgelegd voorstel, en de toets onderaan houdt hem gelijk aan dat palet.
 * Het lichte Koraal wijkt bewust af van het voorstel (zie het beslisdocument van QS8-725) en staat hier daarom niet.
 */
const KORAAL_DONKER = ['#fb7185', '#fdba74'] as const;

/** Wat een rood in dit palet nooit mag benaderen: alles wat een andere betekenis draagt. */
function buren(u: ReturnType<typeof allePaletten>[number][1], modus: Modus): [string, string][] {
  const c = u.colors;
  const lijst: [string, string][] = [
    ...Object.entries(u.families).map(([f, k]): [string, string] => [`familie ${f}`, k]),
    ['accent', c.accent],
    ['oranje', c.orange],
    ['groen', c.green],
    ['grijs', c.grey],
    ...(u.verloop?.accent.map((t): [string, string] => ['accenttint', t]) ?? []),
  ];
  if (modus === 'donker') lijst.push(...KORAAL_DONKER.map((k): [string, string] => ['Koraal', k]));
  return lijst;
}

describe.each(MODI)('het statusrood — %s', (modus) => {
  const rood = UITERLIJKEN.B[modus].colors.red;

  it('is in elk uiterlijk dezelfde kleur (één rood voor de hele app)', () => {
    for (const id of UITERLIJK_IDS) expect(UITERLIJKEN[id][modus].colors.red, id).toBe(rood);
  });

  it('ligt minstens MIN_AFSTAND van elke familie, elk accent, elke accenttint, oranje, groen, grijs en Koraal', () => {
    for (const [naam, u] of allePaletten().filter(([n]) => n.includes(modus))) {
      for (const [wie, kleur] of buren(u, modus)) {
        expect(kleurafstand(rood, kleur), `${naam}: ${wie} ${kleur}`).toBeGreaterThanOrEqual(MIN_AFSTAND);
      }
    }
  });

  it('haalt 3:1 als element op achtergrond, paneel, donker paneel en einde van het achtergrondverloop', () => {
    for (const [naam, u] of allePaletten().filter(([n]) => n.includes(modus))) {
      const vlakken = [u.colors.bg, u.colors.panel, u.colors.panelDark, ...(u.verloop ? [u.verloop.achtergrond[1]] : [])];
      for (const vlak of vlakken) {
        expect(contrastRatio(rood, vlak), `${naam} op ${vlak}`).toBeGreaterThanOrEqual(WCAG.AA_LARGE);
      }
    }
  });
});

/**
 * ⚠️ **Tekst in rood (`Text danger`) is in het lichte uiterlijk 4,5:1 en in het donkere niet, en dat is gemeten
 *    en geen vergeten eis.** Onder donker bestaat er geen rood dat 4,5:1 haalt op elk paneel én 10 afstand houdt tot
 *    Koraal, oranje en de roze familie (zoekruimte: elke rood-tint, zie het beslisdocument). De bodem hieronder is
 *    wat het gekozen rood haalt; hij mag niet zakken.
 */
const TEKSTBODEM: Readonly<Record<Modus, number>> = { donker: 4.3, licht: WCAG.AA_TEXT };

describe.each(MODI)('rood als tekst — %s', (modus) => {
  it('haalt de gemeten bodem op achtergrond en paneel van elk palet', () => {
    const rood = UITERLIJKEN.B[modus].colors.red;
    for (const [naam, u] of allePaletten().filter(([n]) => n.includes(modus))) {
      for (const vlak of [u.colors.bg, u.colors.panel]) {
        expect(contrastRatio(rood, vlak), `${naam} op ${vlak}`).toBeGreaterThanOrEqual(TEKSTBODEM[modus]);
      }
    }
  });
});

/**
 * Het heldenpalet (QS8-470) is ongewijzigd; `ignis` draagt zelf een rood. Het nieuwe statusrood mag er niet mee
 * samenvallen: bodem uit de meting van QS8-743 (donker 16,7; licht 5,8). Valt het eronder, dan staat de held op het
 * neutrale heldenvlak en is dit de plek om dat te besluiten.
 */
const IGNIS_BODEM: Readonly<Record<Modus, number>> = { donker: 16, licht: 5 };

describe.each(MODI)('het statusrood naast ignis — %s', (modus) => {
  it('blijft op afstand van het rood van de held', () => {
    const { colors, helden } = UITERLIJKEN.B[modus];
    expect(kleurafstand(colors.red, helden.ignis.primair)).toBeGreaterThanOrEqual(IGNIS_BODEM[modus]);
    expect(kleurafstand(colors.red, helden.ignis.accent)).toBeGreaterThanOrEqual(IGNIS_BODEM[modus]);
  });
});

/**
 * Domeinregel 7: `red` is deadline-risico en niets anders. Een lege dag of een gemiste week is nooit rood.
 */
describe('rood is nergens een lege dag, een gemiste week of een prestatie (domeinregel 7)', () => {
  it('is in elk palet alleen de rol `atRisk`, en geen enkele andere rol heeft dezelfde kleur', () => {
    for (const [naam, u] of allePaletten()) {
      const { atRisk, ...rest } = roles(u.colors);
      expect(atRisk, naam).toBe(u.colors.red);
      for (const [rol, kleur] of Object.entries(rest)) expect(kleur, `${naam}: ${rol}`).not.toBe(atRisk);
    }
  });

  it('wordt buiten het thema direct alleen gelezen door de drie bestanden van het register (niet: wie `danger` meegeeft)', () => {
    expect(rodeLezers(bronnenIn(['src', 'app']))).toEqual(Object.keys(REGISTER).sort());
  });
});

/** Wie `colors.red`, `c.red` of de rol `atRisk` leest. Een rij heeft een reden nodig; een vierde lezer is een besluit. */
const REGISTER: Readonly<Record<string, string>> = {
  'src/shared/ui/RisicoBadge.tsx': 'de zwaarste Risico-radarstand (`unreachable`): deadline onhaalbaar',
  'src/shared/ui/Field.tsx': 'de rand van een veld met een invoerfout',
  'src/shared/ui/Text.tsx': '`danger`: een foutmelding, nooit een gemiste week',
};

/** De bestanden buiten `shared/theme` en buiten testbestanden die het rood of de rol `atRisk` lezen. */
function rodeLezers(bronnen: Record<string, string>): string[] {
  return Object.entries(bronnen)
    .filter(([pad]) => !/shared[/\\]theme[/\\]/.test(pad) && !/\.test\.tsx?$/.test(pad))
    .filter(([, tekst]) => /\b(?:colors|theme\.colors|c|p|palette)\.red\b|\.roles\.atRisk\b|\batRisk\b\s*[:}),]/.test(strip(tekst)))
    .map(([pad]) => pad)
    .sort();
}

const strip = zonderCommentaar;

function bronnenIn(mappen: string[]): Record<string, string> {
  const uit: Record<string, string> = {};
  const loop = (dir: string) => {
    for (const naam of readdirSync(dir)) {
      const pad = join(dir, naam);
      if (statSync(pad).isDirectory()) loop(pad);
      else if (/\.tsx?$/.test(naam)) uit[pad.replace(/\\/g, '/')] = readFileSync(pad, 'utf8');
    }
  };
  mappen.forEach(loop);
  return uit;
}

/** Een controle die je niet kunt voeden, kun je niet ijken: de scanner krijgt hier de vormen die hij moet vinden en laten. */
describe('de scanner voor rode lezers ziet een nieuwe lezer', () => {
  it('vindt een scherm dat `colors.red` leest', () => {
    expect(rodeLezers({ 'app/week.tsx': 'const k = theme.colors.red;' })).toEqual(['app/week.tsx']);
  });

  it('vindt een component die de rol `atRisk` leest', () => {
    expect(rodeLezers({ 'src/shared/ui/Streep.tsx': 'return theme.roles.atRisk;' })).toEqual(['src/shared/ui/Streep.tsx']);
  });

  it('laat commentaar, testbestanden en het thema zelf met rust', () => {
    expect(rodeLezers({ 'app/a.tsx': '// colors.red is hier verboden\nconst x = 1;' })).toEqual([]);
    expect(rodeLezers({ 'app/a.test.tsx': 'colors.red' })).toEqual([]);
    expect(rodeLezers({ 'src/shared/theme/tokens.ts': 'atRisk: p.red,' })).toEqual([]);
  });
});

describe('het Koraal-anker (QS8-725)', () => {
  it('is gelijk aan de kleuren van het donkere palet C-koraal', () => {
    const k = UITERLIJKEN['C-koraal'].donker;
    expect([...k.verloop!.accent].sort()).toEqual([...KORAAL_DONKER].sort());
    expect(k.colors.accent).toBe('#fb7185');
  });
});
