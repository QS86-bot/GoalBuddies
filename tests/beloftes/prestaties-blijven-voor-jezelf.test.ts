import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from './roept-aan';

/**
 * Het Prestatiescherm en zijn gegevens komen nooit in een groepscomponent — QS8-735.
 *
 * ⚠️ **De belofte is een eigenschap van het geheel:** `badges.ts` zegt "geef dit type nooit
 *    aan een groepscomponent", en een zin in een comment houdt niemand tegen. Een
 *    badgemuur naast een ledenlijst is het signaal dat domeinregel 7 beschrijft: de badge
 *    die er níét staat, is de gemiste week. Voor XP en niveau geldt hetzelfde (domeinregel
 *    10). Deze test leest dus elk bestand dat een groep kan tonen en weigert elke verwijzing
 *    naar het scherm, de XP-module of de bron van zeldzaamheid en XP per badge.
 */

const WORTEL = fileURLToPath(new URL('../..', import.meta.url));

/** Waar een groep te zien is: de groepsroutes, de buddies-module en alle gedeelde UI. */
export const GROEPSOPPERVLAK = [
  'app/groep',
  'app/mensen',
  'app/uitnodiging',
  'app/(tabs)/groep.tsx',
  'app/beoordelen.tsx',
  'app/meldingen.tsx',
  'src/modules/buddies',
  'src/modules/completions',
  'src/modules/notifications',
  'src/shared/ui',
];

/**
 * De omgekeerde kant: XP, niveau en de bron van zeldzaamheid mogen **nergens** in `app/` en `src/`
 * staan behalve hier. Een lijst met groepsoppervlakken vergeet het volgende oppervlak; een lijst
 * met wie het wél mag is de belofte zelf.
 */
export const MAG_XP_LEZEN = [
  'app/prestaties.tsx',
  'src/schermen/prestaties/',
  'src/modules/xp/',
  'src/modules/goals/',
];

const XP_PATRONEN = [
  /schermen\/prestaties/,
  /modules\/xp\b/,
  /from\s+['"][^'"]*\/xp['"/]/,
  /\bhaalMijnXp\b/,
  /\bleesXpStand\b/,
  /\bXpStand\b/,
  /\bBADGE_WAARDE\b/,
  /badge-zeldzaamheid/,
];
const BADGE_PATRONEN = [/\bVerdiendeBadge\b/, /goals\/badges/, /\bfetchBadges\b/];
const VERBODEN = [...XP_PATRONEN, ...BADGE_PATRONEN];

/** Alleen de XP-verwijzingen, voor de omgekeerde toets. */
export function xpVerwijzingen(bron: string): readonly string[] {
  const kaal = zonderCommentaar(bron);
  return XP_PATRONEN.filter((p) => p.test(kaal)).map(String);
}

/** Welke verboden verwijzing staat er in deze bron (zonder commentaar)? */
export function verbodenVerwijzingen(bron: string): readonly string[] {
  const kaal = zonderCommentaar(bron);
  return VERBODEN.filter((p) => p.test(kaal)).map(String);
}

function bronbestanden(map: string): string[] {
  const volledig = join(WORTEL, map);
  return readdirSync(volledig).flatMap((naam) => {
    const pad = join(volledig, naam);
    if (statSync(pad).isDirectory()) return bronbestanden(join(map, naam));
    return /\.tsx?$/.test(naam) && !/\.test\.tsx?$/.test(naam) ? [pad] : [];
  });
}

function bestandenIn(pad: string): string[] {
  return statSync(join(WORTEL, pad)).isDirectory() ? bronbestanden(pad) : [join(WORTEL, pad)];
}

describe('verbodenVerwijzingen (de zeef is geijkt)', () => {
  it('vindt elke vorm waarmee het scherm of zijn gegevens binnenkomen', () => {
    for (const regel of [
      "import { Prestatiescherm } from '@/schermen/prestaties';",
      "import { haalMijnXp } from '@/modules/xp';",
      "import { BADGE_WAARDE } from '@/modules/goals';",
      "import type { VerdiendeBadge } from '@/modules/goals';",
      "import { x } from '../goals/badges';",
      "import { leesXpStand, type XpStand } from '../xp';",
    ]) {
      expect(verbodenVerwijzingen(regel), regel).not.toEqual([]);
    }
  });

  it('laat een verwijzing in commentaar en een gewone import met rust', () => {
    expect(verbodenVerwijzingen("// zie schermen/prestaties\nimport { Card } from './Card';")).toEqual([]);
    expect(verbodenVerwijzingen("/** niet haalMijnXp aanroepen */ export const x = 1;")).toEqual([]);
  });
});

describe('xpVerwijzingen', () => {
  it('vindt een relatieve import van de XP-module en laat een andere map xp met rust', () => {
    expect(xpVerwijzingen("import { a } from '../xp';")).not.toEqual([]);
    expect(xpVerwijzingen("import { a } from './xpad';")).toEqual([]);
  });
});

describe('XP en niveau staan alleen op hun eigen plek', () => {
  it('geen enkel ander bestand in app/ en src/ verwijst ernaar', () => {
    const fouten = [...bronbestanden('app'), ...bronbestanden('src')]
      .map((pad) => relative(WORTEL, pad))
      .filter((pad) => !MAG_XP_LEZEN.some((ok) => pad === ok || pad.startsWith(ok)))
      .filter((pad) => xpVerwijzingen(readFileSync(join(WORTEL, pad), 'utf8')).length > 0);
    expect(fouten).toEqual([]);
  });
});

describe('prestaties blijven voor jezelf', () => {
  for (const map of GROEPSOPPERVLAK) {
    it(`${map} verwijst niet naar het Prestatiescherm, XP of de zeldzaamheid`, () => {
      const bestanden = bestandenIn(map);
      expect(bestanden.length).toBeGreaterThan(0);
      const fouten = bestanden
        .map((pad) => ({ pad: relative(WORTEL, pad), gevonden: verbodenVerwijzingen(readFileSync(pad, 'utf8')) }))
        .filter((r) => r.gevonden.length > 0);
      expect(fouten).toEqual([]);
    });
  }
});
