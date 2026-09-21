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

import { metSchuineStrepen } from './paden.mjs';
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
  'scripts/sleutelvorm-controle.mjs:zonderCommentaar':
    'knipt SQL-commentaar uit een functiedefinitie: `--` én geneste `/* */`, om ' +
    'enkele quotes én dollar-quotes heen — een streepje binnen een literal mag ' +
    'de leesplek niet opeten (QS8-491)',
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
 * De bronlezers die géén knip hebben, en de reden waarom dat hier klopt.
 *
 * ⚠️⚠️ **Dit is de andere helft van deze controle en hij kwam er later bij
 *    (QS8-567).** Het register hierboven bewaakt de knip die er **ís**: wie er
 *    een schrijft, gebruikt de gedeelde of legt uit waarom niet. Wat niemand
 *    bewaakte is de knip die er **niet** is — en dat is de gevaarlijker helft,
 *    want een ontbrekende knip ziet er precies zo uit als een controle die
 *    niets te knippen heeft. Zelfde vorm als bij `padverwijzing:controle`: een
 *    ontbrekende test valt op, een test waarvan in de bron staat dát hij er is
 *    niet.
 *
 * 📏 **Geteld op 19-09-2026:** 48 lezende controles, waarvan 11 knipten en 37
 *    niet. Acht daarvan bouwden een dynamische regex uit een naam — de vorm
 *    waarin een commentaarregel als code gelezen wordt. **Drie waren een echte
 *    instantie en faalden alle drie open:**
 *
 *    | controle | gemeten vóór de knip |
 *    | -- | -- |
 *    | `foutsleutel-controle.mjs` | een vormtoets in een comment telde als vormtoets; een voorbeeld-allowlist in een comment verving de echte |
 *    | `kolomrechten-controle.mjs` | `const velden = { onschuldig: 1 }` in een comment verving de echte kolomlijst |
 *    | `aansluiting-controle.mjs` | een naam die alléén in een comment stond, maakte een dode keten levend |
 *
 * ⚠️⚠️ **Wat deze helft wél en níet belooft, en dat verschil is de hele reden
 *    dat dit issue bestond.** Hij belooft: **een nieuwe bronlezende controle
 *    wordt geclassificeerd** — knipt, of staat hier met een reden. Hij belooft
 *    **niet** dat elke bronlezer correct knipt.
 *
 *    Die tweede belofte is niet te maken met dit gereedschap, en hem tóch
 *    opschrijven zou de fout herhalen die dit issue vond. "Importeert dit
 *    bestand de knip" is een **neveneffect** van de reparatie, geen eigenschap
 *    van het werk: `foutsleutel-controle.mjs` importeert hem en leest zijn derde
 *    helft nog steeds ruw, met reden. Een grendel die op de import afgaat, zou
 *    dat groen noemen — en dan meet hij precies wat hij zegt te bewaken niet.
 *    Wat elke bronlezer echt doet, blijft handwerk en een ijkingstest.
 */
export const ZONDER_KNIP = {
  'scripts/migratie-hernummer.mjs':
    'herschrijft verwijzingen naar een migratienummer, en een verwijzing ín commentaar ' +
    'hóórt mee te gaan — CLAUDE.md: hij "neemt de verwijzingen mee; de kale die hij niet ' +
    'aanraakt print hij". Knippen zou hier juist een verwijzing laten staan die verkeerd wordt',
  'scripts/tekst-controle.mjs':
    'houdt zijn eigen commentaarzeef op regelindex (`commentaarregels()`), want hij meldt ' +
    'regelnummers — 📏 gemeten: een `label="…"` op een `//`- of ` * `-regel geeft nul treffers',
  'scripts/ci-controles.mjs':
    'leest YAML-workflows, en de gedeelde knip is een JS-knip — een `#` haalt hij niet weg. ' +
    '📏 Gemeten: een uitgecommentarieerde `# - run: npm run x` telt mee. Dat faalt **dicht** ' +
    '(een handmatige stap melden die er niet is), dus het is ruis en geen gat',
  'scripts/dode-keten-controle.mjs':
    'leest SQL-migraties; daar hoort een SQL-knip bij en niet deze. Zijn commentaargevoeligheid ' +
    'staat als eigen rij in docs/ENGINEER-REVIEW.md — hij faalt **dicht** (0292 meldde een ' +
    '`klok_fout()` die alleen in een comment stond)',
};

/**
 * Leest dit bestand bronbestanden én bouwt het een regex uit een naam?
 *
 * ⚠️⚠️ **Wat hij ziet en wat niet — gemeten, niet geschat (QS8-567).** Dit is
 *    een detector op vórm, en een vormdetector heeft altijd een rand. Die staat
 *    hier zodat niemand de telling voor volledigheid aanziet:
 *
 *    | vorm | |
 *    | -- | -- |
 *    | `new RegExp(`…${naam}…`)`, ook met een newline of spatie ná de haak | gezien |
 *    | `new RegExp('…' + naam)` — concatenatie | **gemist** |
 *    | `RegExp(` zonder `new` | **gemist** |
 *    | `bron.includes(`…${naam}…`)` | **gemist** |
 *    | `bron.split(`const ${naam} =`)` | **gemist** |
 *
 *    📏 De whitespace-vorm is er later bij gekomen en kostte niets: nog steeds
 *    11 bronlezers, toen 5 met reden zonder knip (inmiddels 4 — `catalogus`
 *    knipt sinds QS8-571). Hij zat erin omdat prettier van
 *    een lange regex precies die vorm maakt — de goedkoopste manier waarop de
 *    vólgende grendel zich onzichtbaar maakt.
 *
 * ⚠️ **Twee bestanden lezen bron en matchen op naam in een gemiste vorm:**
 *    `padverwijzing-controle.mjs` (concatenatie) en
 *    `conflictmarkeringen-controle.mjs` (`startsWith(`${vorm} `)`). Allebei
 *    **mogen** niet knippen — een pad ín een comment is daar juist het
 *    onderwerp, en een conflictmarkering in een comment is nog steeds een
 *    kapotte merge — maar dat staat nergens, en de teller onderschat het veld.
 *    De resterende vormen en die twee rijen staan als QS8-572.
 */
/**
 * Wélke knipvorm past dit bestand toe op bron? Leeg = geen.
 *
 * ⚠️⚠️ **Op gedrag en niet op naam, en dat is de hele reden dat QS8-576
 *    bestaat.** `DEFINITIE` hieronder zoekt een functie die `zonderCommentaar`
 *    héét. 📏 Gemeten: **19** bestanden knippen commentaar onder een andere
 *    naam — tegenover **18** die de naamdetector ziet. Meer dan de helft van
 *    het veld was onzichtbaar, voor béide helften, want de tweede helft draait
 *    alleen op `scripts/`.
 *
 *    De aanleiding is een knip die tijdens QS8-570 in
 *    `tests/migraties/idempotentie.ts` geschreven werd en `schoneBron` heette:
 *    identieke code, groen bij die naam, rood zodra hij `zonderCommentaarEnTekst`
 *    ging heten. **Wat de grendel zag, hing af van de naam** — en `schoneBron`
 *    was gewoon de betere naam. Dit is de vorm die je per ongeluk bereikt.
 *
 * ⚠️ **Drie vormen, want een knip is niet één ding.** JS-blok, JS-regel en
 *    SQL-regel worden apart gemeld, zodat een registerrij kan zeggen wélke hij
 *    heeft — een SQL-knip is een andere belofte dan een JS-knip.
 *
 * ⚠️⚠️ **En hij is met opzet niet "alles".** 📏 Een ruwer signaal meldde er
 *    **29**, waarvan tien geen knip waren: het `--` van een git-aanroep, een
 *    CLI-argument, `https://` in een URL-regex, een regex die sterretjes uit
 *    vetgedrukte tekst haalt. Een register dat volloopt met zulke rijen
 *    leert je hem te negeren — dezelfde waarschuwing als bij `GEEN_FOUTCODE`
 *    in `foutsleutel-controle.mjs`. Vandaar de eis dat een SQL-knip op iets
 *    bron-achtigs werkt (`regel`, `bron`, `inhoud`, `sql`, …).
 */
export const KNIPVORM = {
  blok: /\\\/\\\*|\\\*\\\//,
  'regel-js': /\(\^\|\[\^:\]\)\\\/\\\/|\\\/\\\/(?:\[\^\\n\]|\.\*)/,
  'regel-sql':
    /(?:regel|bron|inhoud|sql|tekst|line|body|definitie|kop)\w*\s*(?:\.\w+\(\))?\s*\.(?:startsWith|split|indexOf)\(\s*'--'|\/\^\\s\*--|\|--\)/i,
};

/**
 * De bestanden die een eigen knip toepassen zónder hem `zonderCommentaar` te
 * noemen — mét de reden waarom die knip daar eigen is.
 *
 * ⚠️ Zelfde bedoeling als `MET_REDEN` hierboven, andere ingang: dáár staat een
 *    knip op naam, hier op gedrag. Een bestand dat in `MET_REDEN` staat hoeft
 *    hier niet nog eens.
 */
export const EIGEN_KNIP = {
  'scripts/avatar-controle.mjs':
    'per regel, en dekt ook de `*`-vervolgregel van een JSDoc — nodig omdat deze ' +
    'controle per regel telt en de gedeelde knip een blok tot één spatie plet',
  'scripts/edge-tijd-controle.mjs':
    'blok én regel, in twee stappen over dezelfde bron; leest Deno-bron die hier ' +
    'verder nergens langskomt',
  'scripts/logboek-controle.mjs':
    'loopt teken voor teken door SQL en kijkt op elke positie of er `--` staat — ' +
    'een regelvorm zou de quote-afhandeling eromheen breken',
  'scripts/migratie-hernummer.mjs':
    'verzámelt de kopregels in plaats van ze weg te knippen: hij heeft de kop nodig, ' +
    'niet de code eronder. Andere belofte dan een knip',
  'scripts/migraties-controle.mjs': 'idem — verzamelt de kop om het rollback-pad te vinden',
  'scripts/rollbackpad.mjs': 'idem — de kop ís hier het onderwerp',
  'scripts/tijdzones-controle.mjs':
    'één regelfilter over JS én SQL tegelijk, omdat hij beide bomen in dezelfde ' +
    'pas langsloopt',
  'tests/beloftes/aanmeldscherm.test.ts':
    'blok plus een regelvorm mét `:`-wacht die óók een áchterlopend `//` weghaalt — ' +
    'strenger dan de gedeelde knip, die alleen hele commentaarregels filtert',
  'tests/beloftes/een-document-voert-niets-uit.test.ts': 'dezelfde vorm als aanmeldscherm',
  'tests/beloftes/een-foto-is-getekend-of-niets.test.ts': 'dezelfde vorm als aanmeldscherm',
  'tests/beloftes/tabbalk-bovenaan.test.ts': 'dezelfde vorm als aanmeldscherm',
  'tests/beloftes/geen-foto-verlaat-de-app-met-metadata.test.ts':
    'alleen blokken, met opzet: deze toets zoekt naar aanroepen en een ' +
    'regelcommentaar kan er geen verbergen',
  'tests/beloftes/pushdienst-allowlist.test.ts':
    'SQL-regelfilter op een migratie; JS-commentaar komt er niet in voor',
  'tests/migraties/bewaking-zonder-lijst.test.ts':
    'SQL, regelbehoudend (`split` op `--`), zodat de regelindeling van de query heel blijft',
  'tests/migraties/idempotentie.ts':
    'SQL, regelbehoudend — deze grendel meldt regelnúmmers, en een knip die regels ' +
    'samenvouwt laat elke melding naar de verkeerde regel wijzen (QS8-570)',
  'tests/rls/functiegrants.test.ts':
    'SQL, regelbehoudend (`split` op `--`) over een functiedefinitie uit de database',
};

export function knipvormenIn(bron) {
  const schoon = zonderCommentaar(bron);
  return Object.entries(KNIPVORM)
    .filter(([, patroon]) => patroon.test(schoon))
    .map(([naam]) => naam);
}

export function leestBronMetNaampatroon(bron) {
  const schoon = zonderCommentaar(bron);
  return /readFileSync\(|readFile\(/.test(schoon) && /new RegExp\(\s*`[^`]*\$\{/.test(schoon);
}

/** Knipt dit bestand — gedeeld, of met een eigen knip die in MET_REDEN staat? */
export function knipt(bron, pad) {
  if (/from '\.\/zonder-commentaar\.mjs'/.test(zonderCommentaar(bron))) return true;
  return Object.keys(MET_REDEN).some((sleutel) => sleutel.startsWith(`${pad}:`));
}

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
export function klachten(bron, ruwPad) {
  // ⚠️⚠️ **Normaliseren vóór élke padvergelijking (QS8-567).** Op Windows geeft
  //    `relative()` `scripts\x.mjs`, en dan matcht `startsWith('scripts/')`
  //    nooit — de nieuwe helft staat er dan uit zónder dat iets dat zegt, en de
  //    oude meldt elke geregistreerde knip als onbekend. 📏 Gemeten: met een
  //    backslash-pad gaf `klachten()` 0 klachten waar het er 1 moest zijn, en
  //    `verweesdeVrijstellingen()` meldde 5 van de 5 rijen als verweesd.
  //    Precies de vorm waar `scripts/paden.mjs` voor bestaat — zie de kop daar,
  //    inclusief de zin dat een controle die onzin meldt geleerd wordt te
  //    negeren.
  const pad = metSchuineStrepen(ruwPad);
  if (pad === GEDEELD || pad.startsWith(`${ZONDER_TOETS}/`)) return [];

  const uit = definitiesIn(bron)
    .filter((naam) => MET_REDEN[`${pad}:${naam}`] === undefined)
    .map(
      (naam) =>
        `${pad}: \`${naam}\` is een eigen knip — importeer \`${GEDEELD}\`, of zet hem ` +
        'met zijn reden in MET_REDEN.',
    );

  // ⚠️ De derde helft: een knip die niet `zonderCommentaar` heet (QS8-576).
  //    `definitiesIn()` hierboven zoekt op naam; dit zoekt op gedrag.
  const vormen = knipvormenIn(bron);
  if (
    vormen.length > 0 &&
    EIGEN_KNIP[pad] === undefined &&
    !Object.keys(MET_REDEN).some((sleutel) => sleutel.startsWith(`${pad}:`))
  ) {
    uit.push(
      `${pad}: past zelf een knip toe (${vormen.join(', ')}) zonder hem ` +
        `\`zonderCommentaar\` te noemen — gebruik \`${GEDEELD}\`, of zet hem met ` +
        'zijn reden in EIGEN_KNIP.',
    );
  }

  // ⚠️ De tweede helft: een bronlezer zónder knip is een keuze of een gat, en
  //    die twee zien er hetzelfde uit tot iemand het opschrijft (QS8-567).
  if (
    pad.startsWith('scripts/') &&
    leestBronMetNaampatroon(bron) &&
    !knipt(bron, pad) &&
    ZONDER_KNIP[pad] === undefined
  ) {
    uit.push(
      `${pad}: leest bron en bouwt een regex uit een naam, maar knipt geen commentaar — ` +
        `importeer \`${GEDEELD}\`, of zet hem met een gemeten reden in ZONDER_KNIP.`,
    );
  }

  return uit;
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

/**
 * Rijen in `EIGEN_KNIP` waarvan het bestand geen knip meer toepast.
 *
 * ⚠️ Zelfde ratel als bij de andere twee registers: een vrijstelling die niets
 *    meer vrijstelt, leest de volgende persoon als een reden om er niet aan te
 *    twijfelen.
 */
export function verweesdeEigenKnippen(bronnen) {
  return Object.keys(EIGEN_KNIP).filter((pad) => {
    const bron = bronnen.get(metSchuineStrepen(pad));
    return bron === undefined || knipvormenIn(bron).length === 0;
  });
}

/**
 * Rijen in `ZONDER_KNIP` die hun reden kwijt zijn.
 *
 * ⚠️ **Twee kanten, net als bij `verweesdeRedenen`.** Een bestand dat niet meer
 *    bestaat, én een bestand dat inmiddels wél knipt: dan is de vrijstelling een
 *    rij die niets meer vrijstelt, en die leest de volgende persoon als een
 *    reden om er niet aan te twijfelen.
 */
export function verweesdeVrijstellingen(bronnen) {
  const genormaliseerd = new Map([...bronnen].map(([p, b]) => [metSchuineStrepen(p), b]));
  return Object.keys(ZONDER_KNIP).filter((pad) => {
    const bron = genormaliseerd.get(pad);
    if (bron === undefined) return true;
    return !leestBronMetNaampatroon(bron) || knipt(bron, pad);
  });
}

export function hoofd() {
  const paden = MAPPEN.flatMap((map) => bestanden(map));
  const gevonden = new Set();
  const bronnen = new Map();
  const uit = [];

  for (const pad of paden) {
    if (pad.startsWith(`${ZONDER_TOETS}/`)) continue;
    const bron = readFileSync(join(WORTEL, pad), 'utf8');
    bronnen.set(metSchuineStrepen(relative('.', pad)), bron);
    for (const naam of definitiesIn(bron)) gevonden.add(`${pad}:${naam}`);
    uit.push(...klachten(bron, relative('.', pad)));
  }

  const verweesd = verweesdeRedenen(gevonden);
  const losseVrijstellingen = verweesdeVrijstellingen(bronnen);
  const losseKnippen = verweesdeEigenKnippen(bronnen);

  if (
    uit.length > 0 ||
    verweesd.length > 0 ||
    losseVrijstellingen.length > 0 ||
    losseKnippen.length > 0
  ) {
    console.error('knip-controle: er staat een knip buiten de gedeelde bron.\n');
    for (const regel of uit) console.error(`  ${regel}`);
    for (const sleutel of verweesd) {
      console.error(`  ${sleutel} staat in MET_REDEN maar bestaat niet meer — haal de rij weg.`);
    }
    for (const pad of losseVrijstellingen) {
      console.error(
        `  ${pad} staat in ZONDER_KNIP maar heeft die vrijstelling niet meer nodig — ` +
          'haal de rij weg.',
      );
    }
    for (const pad of losseKnippen) {
      console.error(`  ${pad} staat in EIGEN_KNIP maar past geen knip meer toe — haal de rij weg.`);
    }
    console.error(
      `\n  De gedeelde knip is \`${GEDEELD}\`, en hij is geijkt in\n` +
        '  `tests/scripts/zonder-commentaar.test.ts` — mét de URL-vorm die dit\n' +
        '  project een halve ijking kostte (QS8-412).',
    );
    return 1;
  }

  // ⚠️ Beide helften noemen, want een controle die alleen zijn oude helft meldt,
  //    laat de lezer denken dat de nieuwe er niet is (QS8-567).
  const lezers = [...bronnen].filter(
    ([pad, bron]) => leestBronMetNaampatroon(bron) && metSchuineStrepen(pad).startsWith('scripts/'),
  );
  console.log(
    `knip-controle: ${Object.keys(MET_REDEN).length} knippen met een reden, de rest deelt er één ` +
      `(${paden.length} bestanden). ` +
      `${lezers.length} bronlezers met een naampatroon, waarvan ` +
      `${Object.keys(ZONDER_KNIP).length} met reden zonder knip. ` +
      `${Object.keys(EIGEN_KNIP).length} knippen zonder die naam, elk met een reden.`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
