/**
 * Register en zeef die bewaken dat een tijdelijke typebrug weggaat zodra de typen hem overbodig maken — QS8-782.
 *
 * ⚠️ **Waarom dit bestaat.** Na de uitrol van 0303 t/m 0336 gingen drie bruggen rood bij het
 *    regenereren van `src/lib/database.types.ts` (ze hadden een eigen toets die de naam van
 *    hun functie in dat bestand zocht). Zeven andere gingen niet rood: `NogNietInTypes` in
 *    twee modules, vijf modules met een cast, en een testbestand met een onware uitleg. Hun
 *    enige "wekker" was een zin in commentaar (*"zodra de migratie uitgerold is: `npm run
 *    types:db`"*), en een zin gaat niet af. Regel 18, vraag 3: een tijdelijke brug zonder
 *    wekker blijft staan nadat hij overbodig is.
 *
 * ⚠️ **De regel is niet "elke brug heeft een eigen toets".** Dat vergeet de volgende bouwer, en
 *    precies dat is de aanleiding. De regel is: *wie schrijft dat iets nog niet in de typen
 *    staat, staat in het register hieronder met een sleutel die de typen nog niet mogen
 *    kennen.* Dit script is de wekker voor alle bruggen tegelijk:
 *
 *      1. een bestand dat zo'n bewering of `NogNietInTypes` bevat en niet in `BRUGGEN` staat
 *         is rood (een nieuwe brug zonder wekker);
 *      2. een ingang waarvan de sleutel nu in de typen staat is rood (de brug is overbodig);
 *      3. een ingang waarvan het bestand de bewering niet meer draagt is rood (het register
 *         is verouderd; de ingang hoort weg).
 *
 * `BRUGGEN` draagt één brug (QS8-784, tot de uitrol). Een ingang is `{ pad, sleutel, reden }`, en de sleutel
 * is een naam (functie, tabel of kolom) die de typen nog NIET kennen.
 *
 * Draait mee in `npm test` (`tests/beloftes/geen-verouderde-typebrug.test.ts`), en bewust niet
 * als eigen `*:controle`: die zou het poortstand-blok in `docs/WERKVOORRAAD.md` en het auditkop-blok
 * van `/audit` laten meegroeien voor een toets die in dezelfde run al draait. Geijkt in
 * `tests/beloftes/geen-verouderde-typebrug.test.ts`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORTEL = fileURLToPath(new URL('../..', import.meta.url));
const MAPPEN = ['src', 'app', 'tests', 'scripts', 'supabase/functions'];
const TYPES = 'src/lib/database.types.ts';
/** Bestanden die de afspraak zelf beschrijven en dus de zin mogen noemen. */
const ZELF = new Set(['tests/beloftes/typebrug-register.ts', 'tests/beloftes/geen-verouderde-typebrug.test.ts']);

export interface Brug {
  readonly pad: string;
  readonly sleutel: string;
  readonly reden: string;
}
export interface Bron {
  readonly pad: string;
  readonly bron: string;
}
export interface Vondst {
  readonly pad: string;
  readonly soort: 'zonder-wekker' | 'overbodig' | 'verouderd-register';
  readonly tekst: string;
}

export const BRUGGEN: readonly Brug[] = [
  {
    pad: 'src/modules/buddies/klassement-weg.ts',
    sleutel: 'klassement_uitnodiging_weg',
    reden: 'QS8-784: de tabel komt in de gegenereerde typen na de uitrol van zijn migratie en `npm run types:db`',
  },
];

const BEWERINGEN = [
  /\bNogNietInTypes\b/,
  /\bnog niet in (?:de )?(?:gegenereerde typen|gegenereerde types|`?(?:src\/lib\/)?database\.types(?:\.ts)?`?)/i,
  /\b(?:staat|staan|zit|zitten|is|zijn|ontbreekt|ontbreken)\b[^.\n]{0,40}\bniet in `?(?:src\/lib\/)?database\.types/i,
  /\bnog niet in (?:de )?typen\b/i,
];

export function bevatBewering(bron: string): boolean {
  return BEWERINGEN.some((re) => re.test(bron));
}

export function vindBruggen(invoer: {
  bronnen: readonly Bron[];
  types: string;
  register?: readonly Brug[];
}): Vondst[] {
  const { bronnen, types, register = BRUGGEN } = invoer;
  const vondsten: Vondst[] = [];
  const geregistreerd = new Map(register.map((r) => [r.pad, r]));
  for (const { pad, bron } of bronnen) {
    if (ZELF.has(pad)) continue;
    const draagt = bevatBewering(bron);
    const ingang = geregistreerd.get(pad);
    if (draagt && !ingang) {
      vondsten.push({ pad, soort: 'zonder-wekker', tekst: 'beweert dat iets nog niet in de typen staat, maar staat niet in BRUGGEN' });
    }
    if (!draagt && ingang) {
      vondsten.push({ pad, soort: 'verouderd-register', tekst: `staat in BRUGGEN maar draagt de bewering niet meer: haal de ingang weg` });
    }
  }
  for (const ingang of register) {
    if (new RegExp(`\\b${ingang.sleutel}\\b`).test(types)) {
      vondsten.push({
        pad: ingang.pad,
        soort: 'overbodig',
        tekst: `de typen kennen \`${ingang.sleutel}\` nu zelf: haal de brug weg (${ingang.reden})`,
      });
    }
  }
  return vondsten;
}

function bestanden(map: string): string[] {
  const pad = join(WORTEL, map);
  try {
    statSync(pad);
  } catch {
    return [];
  }
  return readdirSync(pad, { withFileTypes: true }).flatMap((e) => {
    const rel = join(map, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : bestanden(rel);
    return /\.(ts|tsx|mjs)$/.test(e.name) ? [rel] : [];
  });
}

export function leesRepo(): { bronnen: Bron[]; types: string } {
  const bronnen = MAPPEN.flatMap(bestanden)
    .filter((pad) => pad !== TYPES)
    .map((pad) => ({ pad, bron: readFileSync(join(WORTEL, pad), 'utf8') }));
  return { bronnen, types: readFileSync(join(WORTEL, TYPES), 'utf8') };
}
