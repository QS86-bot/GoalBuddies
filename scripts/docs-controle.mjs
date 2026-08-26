#!/usr/bin/env node
/**
 * Controleert of de overdrachtsdocumenten nog kloppen — QS8-125.
 *
 * ⚠️ Waarom dit bestaat. `CLAUDE.md`, `docs/WERKVOORRAAD.md` en
 *    `docs/VOLGENDE-SESSIE.md` beschreven alle drie dezelfde stand. Op 23-08-2026
 *    liepen ze op één dag vijf keer uiteen, en drie daarvan zijn alleen gevonden
 *    doordat iemand het hele bestand las. Dat is geen herhaalbare controle.
 *
 *    De eigen regel uit `CLAUDE.md`: *schrijf je iets nieuws op, vraag dan eerst
 *    of het een controle kan worden in plaats van een zin.* Dit is die controle.
 *
 * Twee soorten:
 *
 *   A. **Meetbaar** — een bewering over het migratiebereik wordt getoetst aan
 *      `supabase/migrations/`. Loopt hij achter, dan is dat hard aantoonbaar.
 *
 *   B. **Eigenaarschap** — een feit hoort in precies één document te staan. Staat
 *      het er in twee, dan is het een kwestie van tijd voordat er één bijgewerkt
 *      wordt en de andere liegt. Dat is exact wat er vijf keer gebeurde.
 *
 * Draaien: `npm run docs:controle`. Hoort mee in `/audit`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

const DOCUMENTEN = {
  'CLAUDE.md': 'CLAUDE.md',
  WERKVOORRAAD: 'docs/WERKVOORRAAD.md',
  'VOLGENDE-SESSIE': 'docs/VOLGENDE-SESSIE.md',
};

/**
 * Welk document bezit welk feit, en waaraan herken je dat feit.
 *
 * ⚠️ De eigenaar is niet willekeurig gekozen: `CLAUDE.md` bezit de regels en
 *    conventies, `WERKVOORRAAD.md` bezit de stand en de volgorde, en
 *    `VOLGENDE-SESSIE.md` bezit alleen de startprompt en verwijst voor de rest.
 *    Zie `CLAUDE.md`, sectie "Wie bezit welk feit".
 */
const FEITEN = [
  {
    naam: 'de testteller',
    eigenaar: 'WERKVOORRAAD',
    patroon: /\b\d{3}\s+(geslaagd|passed)\b/i,
  },
  {
    naam: 'het aantal verruimingen van domeinregel 7',
    eigenaar: 'CLAUDE.md',
    // ⚠️ Geen `\s` maar `[^\S\n]`: over een regeleinde heen matchen zou ook de
    //    valkuil raken die de oude fout cíteert, en die hoort er juist te staan.
    patroon: /\b(twee|drie)[^\S\n]+benoemde[^\S\n]+verruimingen\b/i,
  },
  {
    naam: 'het toegepaste migratiebereik',
    eigenaar: 'WERKVOORRAAD',
    patroon: /migraties?\s+\*{0,2}`?0001`?\s*t\/m/i,
  },
];

const fouten = [];

function lees(sleutel) {
  return readFileSync(join(WORTEL, DOCUMENTEN[sleutel]), 'utf8');
}

/** A — het migratiebereik in de documenten tegen de map. */
function controleerMigratiebereik() {
  const bestanden = readdirSync(join(WORTEL, 'supabase/migrations'))
    .filter((n) => n.endsWith('.sql'))
    .sort();
  const laatste = bestanden.at(-1);
  const hoogste = laatste?.match(/^(\d{4})/)?.[1];
  if (hoogste === undefined) {
    fouten.push('Kon het hoogste migratienummer niet bepalen uit supabase/migrations/.');
    return;
  }

  for (const sleutel of Object.keys(DOCUMENTEN)) {
    const inhoud = lees(sleutel);
    // ⚠️ Het woord "migraties" is verplicht. Zonder dat raakt de regex ook een
    //    zin als "0001 t/m 0004 zijn byte-identiek", en dat is geen bewering
    //    over de stand maar een historische vaststelling.
    const genoemd = inhoud.match(/migraties?\s+\*{0,2}`?0001`?\*{0,2}\s*t\/m\s*\*{0,2}`?(\d{4})/i)?.[1];
    if (genoemd === undefined) continue;
    if (genoemd !== hoogste) {
      fouten.push(
        `${DOCUMENTEN[sleutel]} zegt dat migraties 0001 t/m ${genoemd} zijn toegepast, ` +
          `maar het hoogste bestand is ${hoogste}.`,
      );
    }
  }
}

/** B — een feit hoort in precies één document te staan. */
function controleerEigenaarschap() {
  for (const feit of FEITEN) {
    const elders = Object.keys(DOCUMENTEN).filter(
      (sleutel) => sleutel !== feit.eigenaar && feit.patroon.test(lees(sleutel)),
    );
    if (elders.length === 0) continue;

    fouten.push(
      `${feit.naam} hoort alleen in ${DOCUMENTEN[feit.eigenaar]} te staan, ` +
        `maar staat ook in ${elders.map((s) => DOCUMENTEN[s]).join(' en ')}. ` +
        'Verwijs daar in plaats van het te herhalen.',
    );
  }
}

controleerMigratiebereik();
controleerEigenaarschap();

if (fouten.length === 0) {
  console.log('docs-controle: de overdrachtsdocumenten spreken elkaar niet tegen.');
  process.exit(0);
}

console.error('docs-controle: de overdrachtsdocumenten lopen uiteen.\n');
for (const fout of fouten) console.error(`  - ${fout}`);
console.error(
  '\nEén stand hoort op één plek te staan. Zie QS8-125 en de sectie ' +
    '"Wie bezit welk feit" in CLAUDE.md.',
);
process.exit(1);
