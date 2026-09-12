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
 * Drie soorten:
 *
 *   A. **Meetbaar** — een bewering over het migratiebereik wordt getoetst aan
 *      `supabase/migrations/`. Loopt hij achter, dan is dat hard aantoonbaar.
 *
 *   C. **De stand in proza** — het aantal bestanden in de map en de grootte van
 *      het gat tot productie, zoals `WERKVOORRAAD.md` ze in gewone zinnen
 *      opschrijft. Ook tegen de map.
 *
 *   B. **Eigenaarschap** — een feit hoort in precies één document te staan. Staat
 *      het er in twee, dan is het een kwestie van tijd voordat er één bijgewerkt
 *      wordt en de andere liegt. Dat is exact wat er vijf keer gebeurde.
 *
 * ⚠️⚠️ **Waarom C erbij moest — QS8-404.** Tot 09-09-2026 was A de énige
 *    meetbare tak, en in `WERKVOORRAAD.md` pakte hij de eerste treffer: het
 *    `STAND`-blok, dat `npm run stand` genereert en dus per definitie waar houdt.
 *    📏 Gemeten die dag: de eerste alinea van dat bestand zei "de map telt er
 *    **229**" en "het gat is **vijf** bestanden" terwijl het er 237 en dertien
 *    waren — en deze controle was groen. **Hij toetste een eigenschap van een
 *    onderdeel dat niet kán liegen, terwijl de belofte een eigenschap van het
 *    geheel is** (onwrikbare regel 18, vraag 2 en 3).
 *
 * ⚠️ **C draait alleen op het document dat de stand bezit.** `CLAUDE.md` en
 *    `VOLGENDE-SESSIE.md` citeren verouderde getallen mét opzet — als
 *    waarschuwend voorbeeld van precies deze fout. Die citaten rood maken zou de
 *    les wissen die ze dragen. De eigenaarstabel in `CLAUDE.md` wijst
 *    `WERKVOORRAAD.md` aan; tak B bewaakt dat de zinnen niet elders opduiken.
 *
 * ⚠️ **Wat C niet vangt:** een zin die er niet staat. Verdwijnt de alinea, dan
 *    zwijgt de controle. Dat is dezelfde keuze als bij A (`continue` op een
 *    ontbrekende bewering) en met reden: een controle die proza *eist*, schrijft
 *    het document. Zie `docs/decisions/2026-09-09-een-generator-kan-niet-liegen.md`.
 *
 * Draaien: `npm run docs:controle`. Hoort mee in `/audit`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

const DOCUMENTEN = {
  'CLAUDE.md': 'CLAUDE.md',
  WERKVOORRAAD: 'docs/WERKVOORRAAD.md',
  'VOLGENDE-SESSIE': 'docs/VOLGENDE-SESSIE.md',
};

/** Het document dat de stand bezit — zie "Wie bezit welk feit" in CLAUDE.md. */
const EIGENAAR_VAN_DE_STAND = 'WERKVOORRAAD';

/**
 * ⚠️ De documenten schrijven kleine aantallen voluit ("het gat is **vijf**
 *    bestanden"), dus een controle die alleen cijfers leest, leest de helft niet.
 */
export const NUMMERWOORDEN = {
  nul: 0, geen: 0, een: 1, één: 1, twee: 2, drie: 3, vier: 4, vijf: 5,
  zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10, elf: 11, twaalf: 12,
  dertien: 13, veertien: 14, vijftien: 15, zestien: 16, zeventien: 17,
  achttien: 18, negentien: 19, twintig: 20,
};

/** Een cijfer of een voluit geschreven getal → een getal. Anders `undefined`. */
export function telWoord(tekst) {
  if (typeof tekst !== 'string') return undefined;
  const kaal = tekst.trim().toLowerCase().replace(/[.*`]/g, '');
  if (/^\d+$/.test(kaal)) return Number(kaal);
  return Object.hasOwn(NUMMERWOORDEN, kaal) ? NUMMERWOORDEN[kaal] : undefined;
}

/**
 * De twee proza-beweringen over de migratiemap.
 *
 * ⚠️ Het getal staat vlák voor "bestanden" en niet ergens in de zin. Zonder die
 *    eis raakt `het gat is …` ook `CLAUDE.md`: *"Het gat is de belangrijkste: de
 *    bestanden zijn de enige manier om dit schema ergens anders op te bouwen"* —
 *    een zin over waaróm een gat erg is, geen bewering over een aantal.
 */
export const MAPTELLING = /de map telt er\s+\*{0,2}([\wéë]+)\*{0,2}/i;
export const GATGROOTTE = /het gat is(?:\s+daarmee)?\s+\*{0,2}([\wéë]+)\*{0,2}\s+bestanden/i;
export const PRODUCTIESTAND = /productie staat op\s+\*{0,2}`?(\d{4})/i;

/** Het viercijferige nummer voor de underscore; `0039a_…` telt als 39. */
export function nummerVan(bestandsnaam) {
  const gevonden = bestandsnaam.match(/^(\d{4})/);
  return gevonden === null ? undefined : Number(gevonden[1]);
}

/**
 * C — de proza-stand tegen de map. Geen database, met opzet: deze controle
 * draait in de poort en in CI.
 *
 * @param {{ inhoud: string, bestanden: string[] }} invoer
 * @returns {string[]} de gevonden tegenspraken, leeg als alles klopt
 */
export function beoordeelStand({ inhoud, bestanden }) {
  const fouten = [];
  const beweerdeTelling = telWoord(inhoud.match(MAPTELLING)?.[1]);
  if (beweerdeTelling !== undefined && beweerdeTelling !== bestanden.length) {
    fouten.push(
      `zegt dat de migratiemap ${beweerdeTelling} bestanden telt, ` +
        `maar het zijn er ${bestanden.length}.`,
    );
  }

  const beweerdGat = telWoord(inhoud.match(GATGROOTTE)?.[1]);
  const productie = Number(inhoud.match(PRODUCTIESTAND)?.[1]);
  if (beweerdGat === undefined || Number.isNaN(productie)) return fouten;

  const echtGat = bestanden.filter((n) => (nummerVan(n) ?? 0) > productie).length;
  if (beweerdGat !== echtGat) {
    fouten.push(
      `zegt dat het gat tot productie (${String(productie).padStart(4, '0')}) ` +
        `${beweerdGat} bestanden groot is, maar er staan er ${echtGat} boven dat nummer.`,
    );
  }
  return fouten;
}

/**
 * Een rij in de gattabel: het migratiebestand dat hij noemt.
 *
 * ⚠️ **Het anker is `^|` plus backticks plus een migratienaam**, en die vorm is
 *    gemeten en niet gekozen. 📏 Op 12-09-2026 staan er in `WERKVOORRAAD.md`
 *    **33** regels die eraan voldoen, en alle 33 staan in het gatblok — nul
 *    daarbuiten. Een documentbrede zeef heeft hier dus geen valse treffers en
 *    hoeft niet te weten waar de tabel begint of eindigt, wat hem bestand maakt
 *    tegen een kop die verplaatst.
 */
const GATRIJ = /^\| `(\d{4}[a-z]?_[a-z0-9_]+\.sql)`/gm;

/**
 * D — de gattabel tegen de map — QS8-445.
 *
 * ⚠️⚠️ **Waarom dit naast `beoordeelStand()` staat en er niet in.** Die telt de
 *    twee **proza**-beweringen na: "de map telt er N" en "het gat is N
 *    bestanden". 📏 Precies dáárdoor bleef hij groen terwijl de tabel eronder
 *    `0255` miste: het getal boven de tabel klopte (34 = 34), alleen de rijen
 *    niet. Een controle die het makkelijke deel van een belofte bewaakt, geeft
 *    toestemming om te stoppen met kijken — zelfde klasse als QS8-415.
 *
 * ⚠️ **De ratel slaat twee kanten op.** Een bestand zonder rij is rood, en een
 *    rij zonder bestand ook: dat tweede is een migratie die hernummerd of
 *    ingetrokken is, en zo'n rij stuurt de lezer naar een bestand dat er niet
 *    meer is. Zelfde vorm als `ZONDER_BESTAND` in `padverwijzing:controle`.
 *
 * ⚠️ Staat er geen productienummer in het document, dan is er geen gat te
 *    berekenen en zwijgt hij — net als `beoordeelStand()`. Zwijgen mag alleen
 *    als er niets beweerd is.
 *
 * @param {{ inhoud: string, bestanden: string[] }} invoer
 * @returns {string[]} de gevonden tegenspraken, leeg als alles klopt
 */
export function gattabelKlachten({ inhoud, bestanden }) {
  const productie = Number(inhoud.match(PRODUCTIESTAND)?.[1]);
  if (Number.isNaN(productie)) return [];

  const inTabel = new Set([...inhoud.matchAll(GATRIJ)].map((m) => m[1]));
  if (inTabel.size === 0) return [];

  const inGat = new Set(bestanden.filter((n) => (nummerVan(n) ?? 0) > productie));
  const fouten = [];

  for (const bestand of inGat) {
    if (!inTabel.has(bestand)) fouten.push(`de gattabel mist een rij voor \`${bestand}\`.`);
  }
  for (const rij of inTabel) {
    if (!inGat.has(rij)) fouten.push(`de gattabel noemt \`${rij}\`, maar dat staat niet in het gat.`);
  }
  return fouten;
}

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
  {
    naam: 'het aantal bestanden in de migratiemap',
    eigenaar: EIGENAAR_VAN_DE_STAND,
    patroon: MAPTELLING,
  },
  {
    naam: 'de grootte van het gat tot productie',
    eigenaar: EIGENAAR_VAN_DE_STAND,
    patroon: GATGROOTTE,
  },
];

const fouten = [];

function lees(sleutel) {
  return readFileSync(join(WORTEL, DOCUMENTEN[sleutel]), 'utf8');
}

function migratiebestanden() {
  return readdirSync(join(WORTEL, 'supabase/migrations'))
    .filter((n) => n.endsWith('.sql'))
    .sort();
}

/** A — het migratiebereik in de documenten tegen de map. */
function controleerMigratiebereik() {
  const bestanden = migratiebestanden();
  const hoogste = bestanden.at(-1)?.match(/^(\d{4})/)?.[1];
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

/** C en D — de proza-stand én de gattabel, in het document dat de stand bezit. */
function controleerStand() {
  const pad = DOCUMENTEN[EIGENAAR_VAN_DE_STAND];
  for (const fout of gattabelKlachten({ inhoud: lees(EIGENAAR_VAN_DE_STAND), bestanden: migratiebestanden() })) {
    fouten.push(`${pad} ${fout}`);
  }
  for (const fout of beoordeelStand({
    inhoud: lees(EIGENAAR_VAN_DE_STAND),
    bestanden: migratiebestanden(),
  })) {
    fouten.push(`${pad} ${fout}`);
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

function hoofd() {
  controleerMigratiebereik();
  controleerStand();
  controleerEigenaarschap();

  if (fouten.length === 0) {
    console.log('docs-controle: de overdrachtsdocumenten spreken elkaar niet tegen.');
    return 0;
  }

  console.error('docs-controle: de overdrachtsdocumenten lopen uiteen.\n');
  for (const fout of fouten) console.error(`  - ${fout}`);
  console.error(
    '\nEén stand hoort op één plek te staan. Zie QS8-125 en de sectie ' +
      '"Wie bezit welk feit" in CLAUDE.md.',
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
