#!/usr/bin/env node
/**
 * idlijst-controle — elke `.in()` op een GET draagt een gemeten bovengrens (QS8-368).
 *
 * ⚠️ **Waarom een controle en niet vijf reparaties.** Het gat ontstaat bij de
 *    vólgende `.in()` die iemand schrijft, niet in de zeven die er nu staan. Een
 *    lijst die vandaag uit een pagina van twintig komt, komt volgend jaar uit een
 *    lijst die stapelt — dat is precies wat er met `fetchRisicos()` gebeurd is:
 *    de kop zei *"tot twintig tegelijk"* en `doelen.tsx` stapelde de pagina's,
 *    zodat er na eenentwintig keer "meer laden" 420 id's stonden.
 *
 * ⚠️ **De grens is niet lokaal te zien, en dát is de reden voor een register.**
 *    Bij zes van de zeven staat de bovengrens in een ánder bestand: een `.limit()`
 *    op de vraag erboven, of een `.slice()` bij de aanroeper. Een controle die
 *    naar de regel eronder kijkt, zou ze allemaal melden — en een controle die
 *    alles meldt, leer je uitzetten. Dus: elke `.in()` staat in het register
 *    hieronder, mét de gemeten grens en waar die vandaan komt. Een nieuwe staat
 *    er niet in en wordt rood.
 *
 * ⚠️ **Redenen en geen namen**, dezelfde vorm als `GEEN_UITGANG_NODIG` in
 *    `uitgang-controle.mjs`. Wie hier een regel neerzet zonder de grens en zijn
 *    herkomst op te schrijven, heeft de controle het zwijgen opgelegd in plaats
 *    van een grens vastgelegd.
 *
 * ⚠️ **Wat hij niet kan.** Nagaan óf die grens klopt — dat is een eigenschap van
 *    de keten en niet van de regel. Wat hij wél afdwingt is dat iemand hem
 *    opgeschreven heeft, en dat een verplaatste of verdwenen `.in()` opvalt.
 *    De klif zelf staat onder test in `tests/rls/idlijstklif.test.ts`, tegen de
 *    echte stack.
 *
 * De ijking staat in `tests/scripts/idlijst-controle.test.ts`, met de vormen die
 * hij moet vinden én de vormen die hij met rust moet laten.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { metSchuineStrepen } from './paden.mjs';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Waar gezocht wordt. De Edge Functions draaien op Deno en hebben hun eigen fetch. */
const MAPPEN = ['src', 'app'];

/**
 * De gemeten bovengrens van elke `.in()`-lijst, per kolom waarop gefilterd wordt.
 *
 * ⚠️ De sleutel is `<pad>#<kolom>` en niet een regelnummer: een regelnummer
 *    verschuift bij elke bewerking erboven, en dan bewaakt dit register de
 *    volgende maand iets anders dan het zegt.
 *
 * ⚠️ **De klif ligt ergens boven de 400** — 📏 413 tot 415 afhankelijk van de
 *    `select`, en dat is de grens van undici; de browser, Hermes en de proxy
 *    vóór productie zijn ongemeten. Zie `src/shared/idlijst`. Alles hieronder
 *    met een grens boven de 100 hoort door `brokken()` te gaan.
 */
export const GRENZEN = {
  'src/modules/goals/api.ts#id':
    '20 — `fetchDoelnamen()` kapt zelf af met `.slice(0, PER_PAGINA)`, ter ' +
    'plekke zichtbaar. Dit is het patroon om te kopiëren.',
  'src/modules/goals/deadline.ts#status':
    '2 — een literal `[\'approved\', \'rejected\']` in `deadline.ts`. Kan per ' +
    'definitie niet groeien; er is geen aanroeper die er iets aan toevoegt.',
  'src/modules/goals/mijlpalen.ts#milestone_id':
    '200 — komt uit `fetchVolgendeMijlpalen()` in ditzelfde bestand, en die ' +
    'draagt `.limit(200)`.',
  'src/modules/goals/mijlpalen.ts#goal_id':
    'IDS_PER_VERZOEK — `fetchVolgendeMijlpalen()` kapt zelf af met ' +
    '`.slice(0, IDS_PER_VERZOEK)`. Stond hier eerst als "100, want ' +
    '`fetchWeekdoelen()` draagt `.limit(100)`": dat klopte en het was geen ' +
    'grens, want die woonde in een schermbestand terwijl de functie publiek ' +
    'geëxporteerd is. Correctie uit de security-review op QS8-368.',
  'src/modules/goals/risico.ts#goal_id':
    'IDS_PER_VERZOEK — de enige die geen bovengrens hád: `doelen.tsx` stapelt ' +
    'de pagina\'s. Gaat sinds QS8-368 door `brokken()`, dus de grens staat hier ' +
    'ter plekke en niet bij een aanroeper.',
  'src/modules/completions/api.ts#id':
    '20 — de vraag erboven in `bewijseisVoorDoel()` draagt `.limit(20)`.',
  'src/modules/commitments/api.ts#group_id':
    '20 — de vraag erboven in `fetchMogelijkeBegunstigden()` draagt ' +
    '`.limit(MAX_GROEPEN)`, en die constante staat op 20.',
};

/**
 * Haalt commentaar weg en laat tekst staan.
 *
 * ⚠️ **Niet `zonderCommentaarEnTekst()` uit `uitgang-controle`**, hoe verleidelijk
 *    ook: die vervangt élke string door `''`, en dan is de kolomnaam die we hier
 *    juist zoeken weg. De eerste versie hiervan telde de `.in(`-posities in de
 *    schone bron en zocht de kolomnamen daarna in de rúwe — met als gevolg dat
 *    één echte `.in()` in een bestand élke `.in()` in het commentaar eromheen
 *    meesleepte. Gevonden bij de ijking, niet door erover na te denken.
 *
 * ⚠️ Strings blijven staan en worden overgeslagen als geheel, zodat een `//` in
 *    een URL of een `/*` in een tekst de rest van het bestand niet opeet.
 */
export function zonderCommentaar(bron) {
  let uit = '';
  let i = 0;

  while (i < bron.length) {
    const twee = bron.slice(i, i + 2);

    if (twee === '//') {
      const eind = bron.indexOf('\n', i);
      i = eind === -1 ? bron.length : eind;
      continue;
    }
    if (twee === '/*') {
      const eind = bron.indexOf('*/', i + 2);
      i = eind === -1 ? bron.length : eind + 2;
      continue;
    }

    const teken = bron[i];
    if (teken === "'" || teken === '"' || teken === '`') {
      const start = i;
      i += 1;
      while (i < bron.length && bron[i] !== teken) i += bron[i] === '\\' ? 2 : 1;
      i += 1;
      uit += bron.slice(start, i);
      continue;
    }

    uit += teken;
    i += 1;
  }

  return uit;
}

/**
 * Elke filter in deze bron die een lijst in de querystring zet, als kolomnaam.
 *
 * ⚠️⚠️ **Drie vormen en niet één, en dat is een correctie uit de security-review.**
 *    De eerste versie zocht alleen `.in('kolom', …)`. 📏 Gemeten dat twee andere
 *    vormen exact hetzelfde verzoek opleveren en tóch op exitcode 0 langskwamen:
 *
 *      db.filter('goal_id', 'in', `(${ids.join(',')})`)   → zweeg
 *      db.or(ids.map((i) => `goal_id.eq.${i}`).join(','))  → zweeg
 *
 *    En `.or()` is de gevaarlijkste van de drie: 📏 op `goals?select=id` valt
 *    `.in()` om bij 416 id's en `.or()` al bij **361** — een `id.eq.` per id is
 *    nu eenmaal langer dan een komma. Vandaag bestaat geen van beide vormen in
 *    `src/` of `app/`; dit is de opening dichtzetten vóór de eerste er is.
 *
 * ⚠️ Bij `.or()` is er geen kolomnaam om op te registreren — één aanroep kan er
 *    tien noemen. Die krijgt daarom de sleutel `#or`: het register zegt dan iets
 *    over die aanroep en niet over een kolom.
 *
 * ⚠️ Een filter met een berekende kolomnaam (`.in(kolom, …)`) valt hier buiten,
 *    en dat is met opzet: die vorm bestaat vandaag niet, en zou hij ontstaan,
 *    dan is een register op naam er de verkeerde grendel voor — dan hoort de
 *    grens bij de aanroeper te staan.
 */
export function inFilters(bron) {
  const schoon = zonderCommentaar(bron);

  const kolommen = [
    // `.in('kolom', …)`
    ...[...schoon.matchAll(/\.in\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1]),
    // `.filter('kolom', 'in', …)` — hetzelfde verzoek, andere schrijfwijze.
    ...[...schoon.matchAll(/\.filter\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]in['"`]/g)].map(
      (m) => m[1],
    ),
  ];

  if (/\.or\(/.test(schoon)) kolommen.push('or');

  return kolommen;
}

/**
 * Beoordeelt één bestand. Geeft de fouten terug; een lege lijst is goed.
 *
 * @param pad Pad vanaf de wortel, met `/` als scheidingsteken.
 * @param bron De inhoud van het bestand.
 * @param grenzen Het register; los meegegeven zodat de ijking hem kan voeden.
 */
export function beoordeelBestand({ pad, bron, grenzen = GRENZEN }) {
  const fouten = [];

  for (const kolom of new Set(inFilters(bron))) {
    const sleutel = `${pad}#${kolom}`;
    if (Object.hasOwn(grenzen, sleutel)) continue;

    fouten.push(
      `${sleutel} zet een lijst in de querystring en staat niet in GRENZEN. Een GET met ` +
        'meer dan ~400 id\'s valt om op de 16 KB-klif in de ' +
        '`Content-Location`-responseheader (zie `src/shared/idlijst`), en dat ' +
        'komt terug als een lege lijst zonder foutcode. Meet de bovengrens van ' +
        'deze lijst en zet hem met zijn herkomst in het register — of laat hem ' +
        'door `brokken()` lopen als er geen bovengrens is.',
    );
  }

  return fouten;
}

function bronbestanden(map) {
  const uit = [];

  for (const naam of readdirSync(map)) {
    const vol = join(map, naam);
    if (statSync(vol).isDirectory()) uit.push(...bronbestanden(vol));
    else if (/\.tsx?$/.test(naam) && !/\.test\.tsx?$/.test(naam)) uit.push(vol);
  }

  return uit;
}

function hoofd() {
  const bestanden = MAPPEN.flatMap((map) => bronbestanden(join(WORTEL, map)));
  const fouten = [];
  const gezien = new Set();

  for (const vol of bestanden) {
    const pad = metSchuineStrepen(relative(WORTEL, vol));
    const bron = readFileSync(vol, 'utf8');

    for (const kolom of new Set(inFilters(bron))) gezien.add(`${pad}#${kolom}`);
    fouten.push(...beoordeelBestand({ pad, bron }));
  }

  // ⚠️ Een grens voor een `.in()` die er niet meer is, is een aanname die
  //    niemand meer nakijkt — en hij dekt straks een nieuwe af die wél stuk is.
  for (const sleutel of Object.keys(GRENZEN)) {
    if (!gezien.has(sleutel)) {
      fouten.push(`${sleutel} staat in GRENZEN maar die \`.in()\` bestaat niet meer.`);
    }
  }

  if (fouten.length === 0) {
    console.log(
      `idlijst-controle: ${gezien.size} \`.in()\`-filters, allemaal met een gemeten grens.`,
    );
    return 0;
  }

  for (const fout of fouten) console.error(`✗ ${fout}`);
  console.error('\nZie QS8-368 en `src/shared/idlijst`.');
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
