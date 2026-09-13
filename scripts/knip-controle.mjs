#!/usr/bin/env node
/**
 * knip-controle — wie commentaar uit bron knipt, doet dat met de gedeelde knip
 * of staat met een reden in het register (QS8-446).
 *
 * ⚠️⚠️ **Waarom dit een controle is en geen opgeruimde regel.** 📏 Op
 *    13-09-2026 geteld: **27 definities** van `zonderCommentaar*` in 27
 *    bestanden, met **2** importeurs — en die 27 waren **17 verschillende
 *    implementaties**. Niemand was slordig; er kwam code bij en niets bewaakte
 *    de regel. Ik zette er bij QS8-442 zelf nog een bij.
 *
 * ⚠️⚠️ **En het is geen smaakkwestie, want deze knip bepaalt wat er *code*
 *    heet.** Een zeef die te veel wegknipt blijft groen terwijl de belofte
 *    breekt, en een zeef die niets meer vindt ziet er precies zo uit als een
 *    zeef die niets te vinden heeft. CLAUDE.md noemt hem daarom met zoveel
 *    woorden een grendel: *"De knip die een controle scherp houdt, is zelf een
 *    grendel."*
 *
 * 📏 **Het gemeten geval (QS8-412):** `/\/\/[^\n]*\/g` eet alles op ná de `//`
 *    van een URL. Bij het ijken werd de suite toen rood op een ándere toets dan
 *    de grendel die de mutatie noemde, en de bedoelde grendel bleef groen.
 *
 * ## Wat hij vraagt
 *
 * Elke definitie van een functie die `zonderCommentaar` heet, of daarmee
 * begint, staat in `MET_REDEN` — of hij bestaat niet en het bestand importeert
 * `scripts/zonder-commentaar.mjs`.
 *
 * ⚠️ **Het register is breed en dat is met opzet.** Niet elke knip is dezelfde
 *    knip: vier ervan halen **SQL**-commentaar weg (`--`), één haalt óók
 *    stringliteralen weg, en één vervangt een blok door evenveel regeleindes
 *    omdat hij regelnúmmers meldt. Die verschillen zijn de reden dat ze
 *    bestaan, niet een teken dat ze vergeten zijn. Wat dit register toevoegt is
 *    dat de **volgende** definitie een keuze wordt in plaats van een gewoonte.
 *
 * ⚠️ **Geëxporteerd én los te voeden**, want een controle die je niet kunt
 *    ijken, kun je niet vertrouwen. Zie `tests/scripts/knip-controle.test.ts`.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { zonderCommentaar } from './zonder-commentaar.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const MAPPEN = ['scripts', 'tests', 'src', 'app'];

/**
 * De map met de ijkingstests, en die wordt overgeslagen.
 *
 * ⚠️⚠️ **Niet uit gemak, maar omdat het anders niet kán.** Een ijkingstest voedt
 *    zijn controle precies de vormen die de controle moet vinden — hier dus
 *    regels als `'function zonderCommentaar(b) {}'` als **string**. 📏 Zonder
 *    deze uitzondering meldde deze controle bij zijn eerste run acht treffers in
 *    zijn eigen toets. Een controle die zijn eigen ijking rood maakt, leer je
 *    uitzetten — dezelfde stelregel waarmee `gedeelde-identiteit-controle.mjs`
 *    commentaar wegknipt voordat hij telt.
 *
 * ⚠️ **De prijs, en die staat hier zodat hij niet vergeten wordt:** een knip die
 *    écht in `tests/scripts/` gedefinieerd wordt, ziet deze controle niet. Dat is
 *    smal — die map bevat toetsen óver scripts en geen zeven die zelf bron
 *    lezen — maar het is geen nul.
 */
export const ZONDER_TOETS = 'tests/scripts';

/** De gedeelde bron; die mag zichzelf definiëren. */
export const GEDEELD = 'scripts/zonder-commentaar.mjs';

export const DEFINITIE = /(?:export\s+)?function\s+(zonderCommentaar\w*)\s*\(/g;

/**
 * De knippen die met reden een eigen vorm houden.
 *
 * ⚠️ **Op bestand én functienaam, niet op bestand alleen.** Een uitzondering per
 *    bestand zou ook de knip vrijstellen die er morgen bijkomt. Zelfde
 *    overweging als in `gedeelde-identiteit-controle.mjs`.
 */
export const MET_REDEN = {
  'scripts/definers-controle.mjs:zonderCommentaar':
    'knipt SQL-commentaar (`--`), niet JS — een andere taal en dus een andere knip',
  'scripts/storage-eigendom-controle.mjs:zonderCommentaar':
    'knipt SQL-commentaar (`--`) uit een migratie; JS-commentaar komt er niet in voor',
  'scripts/pinuitzonderingen-controle.mjs:zonderCommentaar':
    'knipt SQL-commentaar (`--`) uit een functiedefinitie; JS-commentaar komt er niet in voor',
  'scripts/persoon-in-jsonb-controle.mjs:zonderCommentaar':
    'knipt SQL-commentaar per regel, zodat de regelindeling van de query heel blijft',
  'scripts/klokgrens-controle.mjs:zonderCommentaar':
    'SQL én stringliteralen, per regel — hij loopt teken voor teken om quotes heen',
  'scripts/uitgang-controle.mjs:zonderCommentaarEnTekst':
    'haalt óók stringliteralen weg; dat is een andere belofte dan "zonder commentaar"',
  'scripts/gedeelde-identiteit-controle.mjs:zonderCommentaar':
    'vervangt een blok door evenveel regeleindes, want deze controle meldt regelnummers — ' +
    'met de gedeelde knip zou hij naar de verkeerde regel wijzen',
  'scripts/idlijst-controle.mjs:zonderCommentaar':
    'loopt teken voor teken en slaat stringliteralen over; nodig omdat een id in een string staat',
  'scripts/edge-gedeployd.mjs:zonderCommentaar':
    'vergelijkt gedeployde functiebron met de map en moet daar exact dezelfde normalisatie voor doen',
  'scripts/schermingang-controle.mjs:zonderCommentaar':
    'houdt regelposities heel (`(^|[^:])\\/\\/` per regel) omdat hij routes op regel meldt',
  'tests/beloftes/uitkomsttypen.ts:zonderCommentaar':
    'loopt regel voor regel met blokstand, zodat een type over meerdere regels intact blijft',
  'tests/beloftes/foutcontext.ts:zonderCommentaar':
    'vervangt een blok door evenveel spaties en houdt daarmee de regelindeling heel',
  'tests/beloftes/de-terugknop-van-de-router.test.ts:zonderCommentaar':
    'knipt per regel met een `:`-wacht; bewust niet regelfilterend, want deze zeef telt regels',
  'tests/beloftes/huddledag-vandaag.test.ts:zonderCommentaar':
    'knipt per regel met een `:`-wacht en vervangt door een spatie, zodat posities kloppen',
  'tests/beloftes/recap-mislukking-verlaat-de-job.test.ts:zonderCommentaar':
    'knipt per regel met een `:`-wacht; deze zeef leest blokken over meerdere regels',
  'tests/beloftes/koppelscherm-vraagt-koppelbare-doelen.test.ts:zonderCommentaar':
    'knipt per regel met een `:`-wacht en houdt daarmee elke regel op zijn plek',
  'tests/beloftes/uitstelbeslisser-krijgt-het-te-zien.test.ts:zonderCommentaar':
    'knipt per regel met een `:`-wacht; dezelfde vorm als het koppelscherm ernaast',
  'tests/beloftes/auditspoor-volgorde.test.ts:zonderCommentaar':
    'de blokstand-vorm van `uitkomsttypen.ts`, hier met een eigen kop',
  'tests/beloftes/spraakveld.test.ts:zonderCommentaar':
    'de blokstand-vorm: loopt regel voor regel en onthoudt of hij in een blok zit',
  'tests/beloftes/tekstinvoer.test.ts:zonderCommentaar':
    'de blokstand-vorm, nodig omdat een veld zijn props over meerdere regels spreidt',
  'tests/beloftes/wachtwoordveld.test.ts:zonderCommentaar':
    'de blokstand-vorm, zelfde reden als bij `tekstinvoer.test.ts` ernaast',
};

/**
 * Elke definitie in deze bron, als `functienaam`.
 *
 * ⚠️⚠️ **Hij knipt eerst het commentaar weg, en hij doet dat met de gedeelde
 *    knip.** 📏 Zonder die stap meldde deze controle zijn éígen uitleg: de kop
 *    van `ZONDER_TOETS` hierboven citeert een definitie om uit te leggen waarom
 *    die map erbuiten valt, en dat citaat telde mee. Een controle die zijn eigen
 *    documentatie rood maakt, leer je uitzetten — dezelfde stap en dezelfde
 *    reden als in `gedeelde-identiteit-controle.mjs`.
 *
 * ⚠️ Dat hij daarvoor de knip gebruikt die hij zelf bewaakt, is geen grap maar
 *    de goedkoopste ijking die er is: gaat die knip stuk, dan gaat deze controle
 *    mee.
 */
export function definitiesIn(bron) {
  return [...zonderCommentaar(bron).matchAll(DEFINITIE)].map((m) => m[1]);
}

/** Wat er mis is aan deze bron, als leesbare regels. */
export function klachten(bron, pad) {
  if (pad === GEDEELD || pad.startsWith(`${ZONDER_TOETS}/`)) return [];

  return definitiesIn(bron)
    .filter((naam) => MET_REDEN[`${pad}:${naam}`] === undefined)
    .map(
      (naam) =>
        `${pad}: \`${naam}\` is een eigen knip — importeer \`${GEDEELD}\`, of zet hem ` +
        'met zijn reden in MET_REDEN.',
    );
}

function bestanden(map) {
  const uit = [];
  const loop = (pad) => {
    for (const naam of readdirSync(join(WORTEL, pad))) {
      if (naam === 'node_modules' || naam.startsWith('.')) continue;
      const kind = `${pad}/${naam}`;
      if (statSync(join(WORTEL, kind)).isDirectory()) loop(kind);
      else if (/\.(ts|tsx|mjs)$/.test(naam)) uit.push(kind);
    }
  };
  loop(map);
  return uit;
}

/** Rijen in het register die niet meer bestaan — anders groeit het stil door. */
export function verweesdeRedenen(gevonden) {
  return Object.keys(MET_REDEN).filter((sleutel) => !gevonden.has(sleutel));
}

export function hoofd() {
  const paden = MAPPEN.flatMap((map) => bestanden(map));
  const gevonden = new Set();
  const uit = [];

  for (const pad of paden) {
    if (pad.startsWith(`${ZONDER_TOETS}/`)) continue;
    const bron = readFileSync(join(WORTEL, pad), 'utf8');
    for (const naam of definitiesIn(bron)) gevonden.add(`${pad}:${naam}`);
    uit.push(...klachten(bron, relative('.', pad)));
  }

  const verweesd = verweesdeRedenen(gevonden);

  if (uit.length > 0 || verweesd.length > 0) {
    console.error('knip-controle: er staat een knip buiten de gedeelde bron.\n');
    for (const regel of uit) console.error(`  ${regel}`);
    for (const sleutel of verweesd) {
      console.error(`  ${sleutel} staat in MET_REDEN maar bestaat niet meer — haal de rij weg.`);
    }
    console.error(
      `\n  De gedeelde knip is \`${GEDEELD}\`, en hij is geijkt in\n` +
        '  `tests/scripts/zonder-commentaar.test.ts` — mét de URL-vorm die dit\n' +
        '  project een halve ijking kostte (QS8-412).',
    );
    return 1;
  }

  console.log(
    `knip-controle: ${Object.keys(MET_REDEN).length} knippen met een reden, de rest deelt er één ` +
      `(${paden.length} bestanden).`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
