#!/usr/bin/env node
/**
 * Controleert of de overdrachtsdocumenten nog kloppen.
 *
 * ⚠️ **Geleerd in GoalBuddies (QS8-125).** Drie documenten beschreven dezelfde
 *    stand en liepen op één dag **vijf keer** uiteen; twee van die vijf
 *    ontstonden tijdens het bijwerken van diezelfde documenten — één plek
 *    bijgewerkt, de andere vergeten. Wie kopieën met de hand onderhoudt, maakt
 *    het probleem groter. Dit script is de controle die daar de zin vervangt.
 *
 * Twee soorten:
 *
 *   A. **Meetbaar** — een bewering over het migratiebereik wordt getoetst aan
 *      `supabase/migrations/`. Loopt hij achter, dan is dat hard aantoonbaar.
 *
 *   B. **Eigenaarschap** — een feit hoort in precies één document te staan.
 *      Staat het er in twee, dan is het een kwestie van tijd voordat er één
 *      bijgewerkt wordt en de andere liegt.
 *
 * ⚠️ **In dit project dragen twee feiten extra gewicht: de prijs en de doelen.**
 *    De prijs van het Roots-traject is wat een klant te horen krijgt (grens 1 van
 *    de beslisbevoegdheid); de groeidoelen zijn waar Evianne op stuurt. Beide
 *    horen op één plek: het PRD. Elders wordt ernaar verwezen.
 *
 * Draaien: `npm run docs:controle`. Draait mee in de poort en in CI.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

export const DOCUMENTEN = {
  'CLAUDE.md': 'CLAUDE.md',
  WERKVOORRAAD: 'docs/WERKVOORRAAD.md',
  'VOLGENDE-SESSIE': 'docs/VOLGENDE-SESSIE.md',
  PRD: 'docs/PRD-luz-de-luna-lera.md',
};

/**
 * Welk document bezit welk feit, en waaraan herken je dat feit.
 *
 * ⚠️ De eigenaar is niet willekeurig: `CLAUDE.md` bezit de regels,
 *    `WERKVOORRAAD.md` de stand en de volgorde, `VOLGENDE-SESSIE.md` de
 *    startprompt, en het PRD het product — inclusief prijs en doelen.
 *    Zie `CLAUDE.md`, sectie "Wie bezit welk feit".
 */
export const FEITEN = [
  {
    naam: 'de testteller',
    eigenaar: 'WERKVOORRAAD',
    patroon: /\b\d{2,4}\s+(geslaagd|passed)\b/i,
  },
  {
    naam: 'het migratiebereik',
    eigenaar: 'WERKVOORRAAD',
    patroon: /migraties?\s+\*{0,2}`?0001`?\s*t\/m/i,
  },
  {
    naam: 'de prijs van het Roots-traject',
    eigenaar: 'PRD',
    patroon: /€\s?9\d\d\b/,
  },
  {
    naam: 'het sessiedoel',
    eigenaar: 'PRD',
    patroon: /\b80\s+(betaalde\s+)?(1-op-1-)?sessies\b/i,
  },
  {
    naam: 'het volgersdoel',
    eigenaar: 'PRD',
    patroon: /\b5\.?000\s+(instagram-)?volgers\b/i,
  },
];

/**
 * A — het migratiebereik in de documenten tegen de map.
 *
 * @param {{ hoogste: string | null, teksten: Record<string, string> }} invoer
 * @returns {string[]}
 */
export function klachtenMigratiebereik({ hoogste, teksten }) {
  const klachten = [];
  for (const [sleutel, inhoud] of Object.entries(teksten)) {
    // ⚠️ Het woord "migraties" is verplicht. Zonder dat raakt de regex ook een
    //    zin als "0001 t/m 0004 zijn byte-identiek".
    const genoemd = inhoud.match(/migraties?\s+\*{0,2}`?0001`?\*{0,2}\s*t\/m\s*\*{0,2}`?(\d{4})/i)?.[1];
    if (genoemd === undefined) continue;
    if (hoogste === null) {
      klachten.push(`${sleutel} noemt migraties 0001 t/m ${genoemd}, maar de map is leeg.`);
    } else if (genoemd !== hoogste) {
      klachten.push(`${sleutel} zegt dat migraties 0001 t/m ${genoemd} bestaan, maar het hoogste bestand is ${hoogste}.`);
    }
  }
  return klachten;
}

/**
 * B — een feit hoort in precies één document te staan.
 *
 * @param {Record<string, string>} teksten sleutel → inhoud
 * @returns {string[]}
 */
export function klachtenEigenaarschap(teksten) {
  const klachten = [];
  for (const feit of FEITEN) {
    const elders = Object.keys(teksten).filter(
      (sleutel) => sleutel !== feit.eigenaar && feit.patroon.test(teksten[sleutel] ?? ''),
    );
    if (elders.length === 0) continue;
    klachten.push(
      `${feit.naam} hoort alleen in ${DOCUMENTEN[feit.eigenaar] ?? feit.eigenaar} te staan, ` +
        `maar staat ook in ${elders.map((s) => DOCUMENTEN[s] ?? s).join(' en ')}. ` +
        'Verwijs daar in plaats van het te herhalen.',
    );
  }
  return klachten;
}

function hoogsteMigratie() {
  const map = join(WORTEL, 'supabase/migrations');
  if (!existsSync(map)) return null;
  const sql = readdirSync(map).filter((n) => /^\d{4}[a-z]?_.*\.sql$/.test(n)).sort();
  const laatste = sql.at(-1);
  return laatste ? laatste.slice(0, 4) : null;
}

function hoofd() {
  const teksten = {};
  const ontbreekt = [];
  for (const [sleutel, pad] of Object.entries(DOCUMENTEN)) {
    const vol = join(WORTEL, pad);
    if (!existsSync(vol)) ontbreekt.push(pad);
    else teksten[sleutel] = readFileSync(vol, 'utf8');
  }

  const fouten = [
    ...ontbreekt.map((pad) => `${pad} ontbreekt. Elk overdrachtsdocument hoort te bestaan.`),
    ...klachtenMigratiebereik({ hoogste: hoogsteMigratie(), teksten }),
    ...klachtenEigenaarschap(teksten),
  ];

  if (fouten.length === 0) {
    console.log('docs-controle: de overdrachtsdocumenten spreken elkaar niet tegen.');
    return 0;
  }

  console.error('docs-controle: de overdrachtsdocumenten lopen uiteen.\n');
  for (const fout of fouten) console.error(`  - ${fout}`);
  console.error('\nEén stand hoort op één plek te staan. Zie "Wie bezit welk feit" in CLAUDE.md.');
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
