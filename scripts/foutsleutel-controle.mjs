#!/usr/bin/env node
/**
 * foutsleutel-controle — een foutcode reist door één kanaal, en dat kanaal heeft
 * een vormtoets (QS8-330).
 *
 * ⚠️ **De aanleiding is een gat dat níemand rood maakte.** 57 aanroepen van
 *    `reportError()` gaven `{ pgcode: error.code }` mee. `pgcode` staat niet op
 *    `ALLOWED_KEYS` en is niet `sqlstate`, dus `scrubContext()` maakte er 57 keer
 *    `[weggelaten]` van. De aanroepers dachten een foutcode mee te sturen; er
 *    kwam niets aan, en niets in de suite zei er iets van — de schoonmaaklaag
 *    deed precies wat hij belooft, en de aanroepers deden iets dat nergens
 *    bestond. Een fout die je alleen ziet door de twee naast elkaar te leggen,
 *    en dat is nu net wat geen enkele test deed (onwrikbare regel 18, vraag 1).
 *
 * ⚠️ **Waarom een controle en geen test.** Het gat ontstaat bij de volgende
 *    aanroeper die zijn eigen codesleutel verzint, niet in de 57 die er stonden.
 *    Alleen iets dat over `src/` en `app/` loopt kan een aanroep zien die vandaag
 *    nog niet geschreven is.
 *
 * Hij bewaakt twee dingen, en dat zijn de twee helften van dezelfde belofte:
 *
 *   1. **Geen aanroeper verzint een eigen codesleutel.** Alles wat als foutcode
 *      leest en niet `sqlstate` heet, is een sleutel die stil weggegooid wordt.
 *   2. **Geen codesleutel op `ALLOWED_KEYS` zonder vormtoets.** Een sleutel op
 *      de allowlist is een kanaal naar buiten; staat er geen vorm op, dan kan de
 *      volgende aanroeper er gebruikerstekst doorheen duwen door zijn veld
 *      simpelweg zo te noemen. Dat is precies de reden dat `sqlstate` níet op
 *      `ALLOWED_KEYS` staat maar zijn eigen tak met `FOUTCODE` heeft — zie de kop
 *      van `FOUTCODE` in `src/lib/observability/scrub.ts`.
 *
 * ⚠️ **Wat hij niet kan.** Hij leest namen en geen dataflow: een codesleutel die
 *    via een tussenvariabele of een spread binnenkomt (`{ ...extra }`) ziet hij
 *    niet. Dat is dezelfde grens als bij `meldtekst:controle` en hij staat hier
 *    zodat niemand erop rekent dat dit alles dekt.
 *
 * De ijking staat in `tests/scripts/foutsleutel-controle.test.ts`, met de vormen
 * die hij moet vinden én de vormen die hij met rust moet laten. Die tweede helft
 * is even belangrijk: een controle die alles meldt, leer je te negeren.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { metSchuineStrepen } from './paden.mjs';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * De enige sleutel waarlangs een foutcode naar buiten mag.
 *
 * ⚠️ Eén naam en geen lijst. Twee sleutels voor hetzelfde ding is precies hoe er
 *    een derde bij komt, en dan bewaakt de vormtoets van de eerste niets meer.
 */
export const CODESLEUTEL = 'sqlstate';

/**
 * Namen die een aanroeper verzint als hij een foutcode bedoelt.
 *
 * ⚠️ **Een vorm en geen opsomming.** `pgcode`, `errcode`, `error_code`,
 *    `sqlcode`, `errstate` — wie een nieuwe verzint, valt er meestal ook onder.
 *    Te ruim is hier de veilige kant: wat er onterecht onder valt, hernoem je
 *    naar `sqlstate` en dan klopt het alsnog.
 *
 * ⚠️ **`statusCode` en `httpStatus` vallen er met opzet búiten**, en dat stond
 *    hier eerst verkeerd: de kop noemde `statusCode` als gedekt terwijl
 *    `CODEACHTIG.test('statusCode')` gewoon `false` is. Ze zijn ook geen
 *    foutcode — `StorageApiError.statusCode` is de HTTP-code als string
 *    (`'404'`), en die hoort niet in hetzelfde kanaal als een SQLSTATE. Zie de
 *    kop van `foutcodeVan()` in `scrub.ts`, waar dezelfde verwarring al een keer
 *    tot een terugval leidde die nooit iets kon opleveren.
 */
export const CODEACHTIG = /^(?:pg|sql|err(?:or)?)_?(?:code|state|error)$/i;

/*
 * ⚠️ **Hier stond een uitzonderingslijst `GEEN_FOUTCODE`, en die is weggehaald
 *    omdat hij niets deed.** Zijn enige regel was `httpStatus`, en die matcht
 *    `CODEACHTIG` niet en is niet `code` — beide grendels sloegen hem dus al
 *    over vóór de uitzondering aan bod kwam. 📏 Gemeten door hem weg te muteren:
 *    nul tests werden er rood van, en de testinvoer die hem zogenaamd ijkte gaf
 *    mét en zónder de lijst exact dezelfde uitslag.
 *
 *    Een uitzonderingsmechanisme dat nooit bereikt wordt, is gevaarlijker dan
 *    geen: de volgende schrijver zet er een naam in, denkt dat hij iets heeft
 *    vastgelegd, en legt niets vast. Komt er ooit een sleutel die `CODEACHTIG`
 *    wél matcht en tóch geen foutcode draagt, dan komt de lijst terug — mét een
 *    ijking die aantoont dát hij afgaat.
 */

/**
 * De functies die een fout mét een context-object melden.
 *
 * ⚠️⚠️ **`meld` hoort hier, en dat is een gerepareerde valse groene.** De eerste
 *    versie zocht alleen op `reportError` terwijl de scan wél al over
 *    `supabase/functions/` liep. 📏 Geijkt door `pgcode: fout.code` in een echte
 *    edge-job te zetten: de controle telde 204 bestanden en meldde niets. De map
 *    toevoegen zonder de aanroepnaam is een uitbreiding op papier — het bestand
 *    wordt gelezen en er wordt niet naar gekeken, en dat is erger dan hem niet
 *    scannen, want de tellerstand suggereert dekking.
 *
 * ⚠️ `meld(fout, waar, extra)` in `_shared/melden.ts` heeft dezelfde vorm als
 *    `reportError(error, where, extra)` en komt via `meldEdgeFout()` op dezelfde
 *    `scrubContext()` uit. Eén lijst dus, en niet twee controles.
 */
export const MELDERS = ['reportError', 'meldEdgeFout', 'meld'];

/**
 * Welke sleutels in een `reportError`-aanroep noemt dit bestand?
 *
 * ⚠️ **Elk object-argument, op elk niveau — en dat is ruimer dan hier eerst
 *    stond.** De kop beweerde "alleen het derde argument, alleen het eerste
 *    niveau"; 📏 nagemeten klopt geen van beide: `reportError(e, { pgcode: c })`
 *    en `{ meta: { pgcode: c } }` worden allebei gezien. Ruimer is hier de
 *    veilige kant, en een kop die minder belooft dan de code doet, laat de
 *    volgende lezer denken dat er een gat zit waar er geen is.
 *
 * ⚠️⚠️ **Twee vormen ziet hij écht niet, en die horen hier te staan.** Een
 *    spread (`{ ...extra }`) en de verkorte schrijfwijze (`{ pgcode }`, zonder
 *    dubbele punt). Die tweede is een échte blinde vlek en geen theorie: de vorm
 *    komt in de boom voor (`src/modules/buddies/rem.ts:32` schrijft
 *    `{ teller }`). Wie zijn variabele `pgcode` noemt en hem zo meegeeft, komt
 *    er langs. Dichten vraagt dataflow — dezelfde grens als bij
 *    `meldtekst:controle` — en zolang dat er niet is, is opschrijven dat hij er
 *    is het enige eerlijke.
 */
export function contextsleutels(bron) {
  const gevonden = [];
  const aanroep = new RegExp(`\\b(${MELDERS.join('|')})\\s*\\(`, 'g');

  let m;
  while ((m = aanroep.exec(bron)) !== null) {
    // Van de haakjes na `reportError(` het bijpassende sluithaakje zoeken, zodat
    // een object met genest haakwerk niet halverwege afgekapt wordt.
    let diepte = 1;
    let i = m.index + m[0].length;
    for (; i < bron.length && diepte > 0; i += 1) {
      if (bron[i] === '(') diepte += 1;
      else if (bron[i] === ')') diepte -= 1;
    }
    const argumenten = bron.slice(m.index + m[0].length, i - 1);

    // Het derde argument begint bij de eerste `{` na de tweede komma op niveau 0.
    const opening = argumenten.indexOf('{');
    if (opening === -1) continue;

    for (const sleutel of argumenten.slice(opening).matchAll(/(?:^|[{,\s])([A-Za-z_$][\w$]*)\s*:/g)) {
      gevonden.push({
        sleutel: sleutel[1],
        melder: m[1],
        regel: bron.slice(0, m.index).split('\n').length,
      });
    }
  }
  return gevonden;
}

/** De sleutels op `ALLOWED_KEYS` in `scrub.ts`. */
export function allowlist(bron) {
  const blok = bron.match(/ALLOWED_KEYS[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/);
  if (blok === null) return null;
  return [...blok[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** Draagt deze sleutel in `scrub.ts` een eigen vormtoets? */
export function heeftVormtoets(bron, sleutel) {
  return new RegExp(`key === '${sleutel}'`).test(bron);
}

export function beoordeel({ bestanden, scrub }) {
  const bevindingen = [];

  for (const { pad, bron } of bestanden) {
    for (const { sleutel, melder, regel } of contextsleutels(bron)) {
      if (sleutel === CODESLEUTEL) continue;
      if (!CODEACHTIG.test(sleutel)) continue;
      bevindingen.push(
        `${pad}:${regel} geeft \`${sleutel}\` mee aan ${melder}(). ` +
          `Alleen \`${CODESLEUTEL}\` heeft een vormtoets; al het andere wordt ` +
          `[weggelaten] en komt nooit aan. Hernoem hem, of haal hem weg — sinds ` +
          `QS8-319 rijdt de foutcode al in de melding mee.`,
      );
    }
  }

  const sleutels = allowlist(scrub);
  if (sleutels === null) {
    bevindingen.push(
      'ALLOWED_KEYS is niet te vinden in src/lib/observability/scrub.ts. ' +
        'Is de vorm veranderd, werk dan deze controle bij — stil overslaan is ' +
        'hier hetzelfde als niets bewaken.',
    );
  } else {
    for (const sleutel of sleutels) {
      if (!CODEACHTIG.test(sleutel) && sleutel !== 'code') continue;
      if (heeftVormtoets(scrub, sleutel)) continue;
      bevindingen.push(
        `\`${sleutel}\` staat op ALLOWED_KEYS zonder eigen vormtoets in ` +
          `scrubContext(). Een allowlist-sleutel is een kanaal naar buiten: zonder ` +
          `vorm duwt de volgende aanroeper er gebruikerstekst doorheen door zijn ` +
          `veld zo te noemen. Geef hem een tak met FOUTCODE, zoals \`${CODESLEUTEL}\`, ` +
          `of haal hem van de lijst.`,
      );
    }
  }

  return bevindingen;
}

function bronbestanden(map) {
  const uit = [];
  const loop = (huidig) => {
    for (const naam of readdirSync(huidig)) {
      if (naam === 'node_modules' || naam.startsWith('.')) continue;
      const pad = join(huidig, naam);
      if (statSync(pad).isDirectory()) loop(pad);
      else if (/\.tsx?$/.test(naam) && !/\.test\.tsx?$/.test(naam)) {
        uit.push({ pad: metSchuineStrepen(relative(WORTEL, pad)), bron: readFileSync(pad, 'utf8') });
      }
    }
  };
  loop(map);
  return uit;
}

/**
 * ⚠️ **Ook `supabase/functions/`, en dat is een gerepareerd gat.** De eerste
 *    versie scande alleen `src/` en `app/`, terwijl de edge-jobs via
 *    `_shared/melden.ts` op dezelfde `scrubContext()` uitkomen én daar met de
 *    hand een `code:` invullen (📏 tien plekken in `rollover` en
 *    `notificaties`). De bug-klasse die dit script bestaat om te vangen — een
 *    sleutel die stil `[weggelaten]` wordt — kon daar dus opnieuw ontstaan
 *    zonder dat iets rood werd: de helft van het huis onbewaakt.
 *
 * ⚠️ De gesynchroniseerde kopie in `_shared/observability/` valt erbuiten. Die
 *    ís `src/lib/observability/`, en hem twee keer beoordelen levert twee
 *    meldingen op voor één regel.
 */
const SCANMAPPEN = ['src', 'app', 'supabase/functions'];

/** De kopie die `npm run edge:sync` neerzet — dezelfde bron, ander pad. */
const GESYNCT = 'supabase/functions/_shared/';

function hoofd() {
  const bestanden = SCANMAPPEN.map((m) => join(WORTEL, m))
    .flatMap(bronbestanden)
    .filter(({ pad }) => !pad.startsWith(GESYNCT));
  const scrub = readFileSync(join(WORTEL, 'src/lib/observability/scrub.ts'), 'utf8');
  const bevindingen = beoordeel({ bestanden, scrub });

  if (bevindingen.length > 0) {
    console.error('foutsleutel-controle: een foutcode gaat langs een kanaal zonder vormtoets.\n');
    for (const regel of bevindingen) console.error(`  - ${regel}`);
    console.error(
      '\nEén sleutel voor één ding, en die sleutel heeft een vorm. Zie\n' +
        'docs/decisions/2026-09-07-een-sleutel-die-nergens-aankwam.md.',
    );
    return 1;
  }

  console.log(
    `foutsleutel-controle: ${bestanden.length} bestanden — geen aanroeper verzint een eigen ` +
      `codesleutel, en elke codesleutel op de allowlist heeft een vormtoets.`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
