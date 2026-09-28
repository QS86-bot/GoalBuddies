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
 * ⚠️⚠️ **Maar "er staat niets" en "ik kan het niet lezen" zijn twee dingen, en
 *    dat verschil is de reparatie van QS8-482.** 📏 Gemeten op 14-09-2026:
 *    `WERKVOORRAAD.md` §0 zei *"Het gat is daarmee **veertig** bestanden"* bij
 *    een werkelijk gat van 37, en deze controle was groen. `NUMMERWOORDEN` liep
 *    tot `twintig`, `telWoord()` gaf `undefined`, en de tak liet zich daarop
 *    stilzwijgend vallen. Dat is niet *"geen tegenspraak"* maar *"niet
 *    gemeten"* — en dit project houdt die twee elders wél uit elkaar:
 *    `functies:controle` en `register:controle` printen OVERGESLAGEN en de
 *    poort telt ze als ongemeten in plaats van als groen.
 *
 *    **Staat er een bewering en is haar getal niet te lezen, dan is dát de
 *    klacht.** Zwijgen mag alleen als er niets beweerd is.
 *
 * ⚠️ **Waar de grens tussen voluit en cijfers ligt, zodat de volgende schrijver
 *    hem niet per keer hoeft te kiezen: tot en met twintig mag voluit, daarboven
 *    hoort een cijfer.** Dat is geen nieuwe huisstijl maar de bestaande,
 *    opgeschreven: 📏 de twee beweringen in `WERKVOORRAAD.md` §0 staan vandaag
 *    allebei in cijfers (270 en 43). `NUMMERWOORDEN` is met opzet niet tot
 *    negenennegentig uitgebreid — dat verkleint het stille venster maar sluit
 *    het niet (`honderdtwaalf` ontsnapt er nog steeds aan), en het zou een
 *    tweede grens invoeren die nergens staat. De klacht hierboven sluit het
 *    venster wél, en zegt meteen wat de schrijver moet doen. De afweging staat
 *    in `docs/decisions/2026-09-14-een-bewering-die-niet-te-lezen-is.md`.
 *
 * ⚠️ `PRODUCTIESTAND` kán niet onleesbaar zijn: zijn patroon matcht alleen vier
 *    cijfers, dus hij levert een getal of geen treffer. Zijn stilte is daarmee
 *    altijd de "er staat niets"-soort en nooit de andere.
 *
 * Draaien: `npm run docs:controle`. Hoort mee in `/audit`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/**
 * De documenten die onder tak B vallen.
 *
 * ⚠️ **`PROMPT-SESSIE` staat er sinds QS8-583 bij, en dat is de reden dat dit
 *    een lijst is en geen drietal.** Dat document draagt zelf metingen, en een
 *    vierde bestand met stand dat níets bewaakt is precies de drift waar QS8-125
 *    voor bestaat. Het bezit alleen de afspraken tussen gelijktijdige sessies;
 *    voor de stand verwijst het naar `WERKVOORRAAD`.
 *
 * ⚠️ Een document toevoegen is daarmee geen administratieve handeling: vanaf dat
 *    moment mag het geen enkel feit uit `FEITEN` meer dragen dat een ander bezit.
 */
export const DOCUMENTEN = {
  'CLAUDE.md': 'CLAUDE.md',
  WERKVOORRAAD: 'docs/WERKVOORRAAD.md',
  'VOLGENDE-SESSIE': 'docs/VOLGENDE-SESSIE.md',
  'PROMPT-SESSIE': 'docs/PROMPT-SESSIE.md',
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
 * Eén proza-bewering uit een document: staat hij er, en is zijn getal te lezen?
 *
 * ⚠️⚠️ **De drie uitkomsten zijn met opzet drie en niet twee — QS8-482.** Er
 *    staat niets (`staatEr: false`), er staat iets leesbaars (`waarde`), of er
 *    staat iets dat geen getal is (`onleesbaar`). Die derde hoorde vóór dit
 *    issue bij de eerste, en daardoor liep een bewering die de controle niet
 *    kon lézen door voor een bewering die er niet stond.
 *
 * ⚠️⚠️ **`onleesbaar` is altijd tekst, ook als groep 1 er niet is — en dat is
 *    geen netheid maar dezelfde grendel nog een keer.** Krijgt `patroon` ooit de
 *    `g`-vlag, dan geeft `String.match()` de hele treffers terug zónder groepen
 *    en is `gevonden[1]` bij één treffer `undefined`. Een aanroeper die op
 *    `onleesbaar !== undefined` toetst, valt daarop stil terug in precies het
 *    gedrag dat QS8-482 wegnam. Daarom valt hij terug op de hele treffer, en
 *    toetst `beoordeelStand()` op `staatEr && waarde === undefined` in plaats
 *    van op de aanwezigheid van `onleesbaar`.
 *
 * @param {string} inhoud de tekst van het document
 * @param {RegExp} patroon een patroon met het getal in groep 1, zónder `g`-vlag
 * @returns {{ staatEr: boolean, waarde?: number, onleesbaar?: string }}
 */
export function leesBewering(inhoud, patroon) {
  const gevonden = inhoud.match(patroon);
  if (gevonden === null) return { staatEr: false };

  const waarde = telWoord(gevonden[1]);
  return waarde === undefined
    ? { staatEr: true, onleesbaar: gevonden[1] ?? gevonden[0] }
    : { staatEr: true, waarde };
}

/**
 * De klacht voor een bewering die er staat maar niet te lezen is.
 *
 * ⚠️ Hij noemt het woord dat hij niet kon lezen én wat de schrijver moet doen.
 *    Een controle die alleen *"niet getoetst"* zegt, laat de lezer raden welke
 *    van de twee beweringen hij bedoelt.
 *
 * @param {string} bewering waar de bewering over gaat, in gewone woorden
 * @param {string} woord het stuk tekst dat `telWoord()` niet kon lezen
 */
function onleesbaarKlacht(bewering, woord) {
  return (
    `zegt ${bewering}, maar \`${woord}\` is voor deze controle geen getal — ` +
    'die bewering is dus niet getoetst maar overgeslagen. ' +
    'Tot en met twintig mag voluit, daarboven hoort een cijfer.'
  );
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
  const telling = leesBewering(inhoud, MAPTELLING);
  if (telling.staatEr && telling.waarde === undefined) {
    fouten.push(onleesbaarKlacht('hoeveel bestanden de migratiemap telt', telling.onleesbaar));
  } else if (telling.waarde !== undefined && telling.waarde !== bestanden.length) {
    fouten.push(
      `zegt dat de migratiemap ${telling.waarde} bestanden telt, ` +
        `maar het zijn er ${bestanden.length}.`,
    );
  }

  const gat = leesBewering(inhoud, GATGROOTTE);
  if (gat.staatEr && gat.waarde === undefined) {
    fouten.push(onleesbaarKlacht('hoe groot het gat tot productie is', gat.onleesbaar));
  }

  const productie = Number(inhoud.match(PRODUCTIESTAND)?.[1]);
  if (gat.waarde === undefined || Number.isNaN(productie)) return fouten;

  const echtGat = bestanden.filter((n) => (nummerVan(n) ?? 0) > productie).length;
  if (gat.waarde !== echtGat) {
    fouten.push(
      `zegt dat het gat tot productie (${String(productie).padStart(4, '0')}) ` +
        `${gat.waarde} bestanden groot is, maar er staan er ${echtGat} boven dat nummer.`,
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

/**
 * B — een feit hoort in precies één document te staan.
 *
 * ⚠️ **Deze tak is een pure functie en leest zelf niets van schijf, sinds
 *    QS8-583.** Hij stond hiervoor rechtstreeks op `lees()`, en daarmee was hij
 *    alleen te ijken door een echt document te verminken. Dat is de vorm die
 *    CLAUDE.md bij regel 18 afwijst: *een controle die je niet kunt voeden, kun
 *    je niet ijken* — en de helft die het zwaarst weegt is de tweede, de vormen
 *    die hij met rúst moet laten.
 *
 * @param {Record<string, string>} inhoudPerDocument sleutel uit `DOCUMENTEN` naar
 *   de tekst van dat document. Een sleutel die ontbreekt wordt overgeslagen, niet
 *   als leeg gelezen — anders zou een vergeten document als "feit staat er niet"
 *   tellen.
 * @param {typeof FEITEN} feiten
 * @param {Record<string, string>} paden
 * @returns {string[]}
 */
export function eigendomsklachten(inhoudPerDocument, feiten = FEITEN, paden = DOCUMENTEN) {
  const klachten = [];

  for (const feit of feiten) {
    const elders = Object.keys(inhoudPerDocument).filter(
      (sleutel) => sleutel !== feit.eigenaar && feit.patroon.test(inhoudPerDocument[sleutel]),
    );
    if (elders.length === 0) continue;

    klachten.push(
      `${feit.naam} hoort alleen in ${paden[feit.eigenaar] ?? feit.eigenaar} te staan, ` +
        `maar staat ook in ${elders.map((s) => paden[s] ?? s).join(' en ')}. ` +
        'Verwijs daar in plaats van het te herhalen.',
    );
  }

  return klachten;
}

function controleerEigenaarschap() {
  const inhoud = Object.fromEntries(Object.keys(DOCUMENTEN).map((s) => [s, lees(s)]));
  for (const klacht of eigendomsklachten(inhoud)) fouten.push(klacht);
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
