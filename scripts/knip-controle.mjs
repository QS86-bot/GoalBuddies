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
 * ⚠️⚠️ **Er zijn twee gedeelde knippen sinds QS8-574, en dat is geen
 *    verwatering.** `zonder-commentaar.mjs` doet JS/TS en
 *    `zonder-sql-commentaar.mjs` doet SQL; een JS-knip haalt een `--` niet weg
 *    en een SQL-knip een `//` niet. Wat níet verandert is de regel eronder: de
 *    **derde** gedeelde knip is een keuze die je verantwoordt, geen gewoonte.
 *
 * ⚠️⚠️ **En hij ziet alleen knippen die `zonderCommentaar` héten.** 📏 Gemeten
 *    op 21-09-2026 staan er vier die dat niet doen en dus buiten dit register
 *    vallen: `plat()` in `tests/beloftes/aanmeldscherm.test.ts`,
 *    `ontdaanVanCommentaar()` in `datumopmaak.test.ts` en
 *    `onboarding-schrijft-niets-over.test.ts`, en `bronZonderCommentaar()` in
 *    `tabbalk-bovenaan.test.ts`. Alle vier knippen vandaag correct — nagemeten
 *    bij QS8-574 — maar niets bewaakt dat. Dat gat staat als QS8-579.
 *
 * ⚠️ **Het register is breed en dat is met opzet.** Niet elke knip is dezelfde
 *    knip: er staan er **SQL**-knippen in (`--`), één haalt óók
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
 * Een knip herkend aan zijn **lichaam** en niet aan zijn naam — QS8-579.
 *
 * ⚠️⚠️ **Waarom dit er later bij kwam.** `DEFINITIE` hierboven matcht alleen
 *    namen die met `zonderCommentaar` beginnen. 📏 Gemeten op 21-09-2026 liepen
 *    er **tien** knippen omheen die anders heten — vier in `tests/beloftes/` en
 *    zes in `scripts/` — en geen van tien stond in een register. Een knip die
 *    anders heet is precies zo onzichtbaar als de knip die er niet is, en dit
 *    register bestaat nu juist om de vólgende een keuze te maken in plaats van
 *    een gewoonte.
 *
 * ⚠️⚠️ **En twee van die tien faalden open, met een tegenproef erbij:**
 *    `ontdaanVanCommentaar()` in `datumopmaak.test.ts` liet een zelf-opgemaakte
 *    datum dóór zodra er een URL vóór stond op dezelfde regel, en
 *    `normaliseer()` in `edge-tijd-controle.mjs` verklaarde twee uiteenlopende
 *    kopieën van `shared/time` gelijk op precies diezelfde vorm — dat is
 *    correctheidsregel 7, de regel waarvan CLAUDE.md zegt dat hij je een
 *    gebruiker kost. Allebei de blinde vorm van QS8-412.
 *
 * ## Wat hij zoekt: de operatie, niet het teken
 *
 * ⚠️ **Een commentaarteken alleen is niet genoeg en dat is gemeten.** 📏 Een
 *    eerste versie die op `'--'` matchte meldde `git('diff', '--name-only', …)`
 *    in `branches-controle.mjs`, en een versie die op `\/\/` matchte meldde elke
 *    URL-regex. Daarom eist hij een **operatie** — `replace`, `split`, `filter`
 *    of `test` — én een patroon dat een commentaaropener codeert, en kijkt hij
 *    de `\/\/`-vorm voorbij als er een `:` voor staat (`https:\/\/`).
 */
export const KNIPVORM = {
  /** `\/\*` in een regex: een blokopener, en die schrijf je nergens anders. */
  blok: /\\\/\\\*/,
  /** `\/\/` in een regex, maar niet de `https:\/\/` van een URL. */
  regel: /(?<![:s])\\\/\\\//,
  /** `--[^\n]*` of `--.*`: SQL-commentaar tot het regeleinde. */
  sql: /--(?:\[\^\\n\]|\.)\*/,
  /** `startsWith('//')` en familie — de regelfilter-vorm. */
  filter: /startsWith\(\s*['"`](?:\/\/|--|\/\*)/,
};

const OPERATIE = /\.(?:replace|split|filter|test)\s*\(/;

/** Doet dit functielichaam aan commentaar wegknippen? */
export function isKnipLichaam(lichaam) {
  if (!OPERATIE.test(lichaam)) return false;
  return Object.values(KNIPVORM).some((vorm) => vorm.test(lichaam));
}

/** De index van de `}` die hoort bij de `{` op `open`. */
function sluitAccolade(bron, open) {
  let diepte = 0;
  for (let i = open; i < bron.length; i += 1) {
    if (bron[i] === '{') diepte += 1;
    else if (bron[i] === '}') {
      diepte -= 1;
      if (diepte === 0) return i;
    }
  }
  return -1;
}

/**
 * Elke functie in deze bron met een knip-lichaam, als `functienaam`.
 *
 * ⚠️⚠️ **Wat hij ziet en wat niet — gemeten, niet geschat.** Dit is een detector
 *    op vórm, en die heeft een rand. Die staat hier zodat niemand de telling voor
 *    volledigheid aanziet:
 *
 *    | vorm | |
 *    | -- | -- |
 *    | `function naam(bron) { … .replace(/\/\*…\*\//…) … }` | gezien |
 *    | een knip ergens middenin een grotere functie | gezien |
 *    | een pijlfunctie: `const knip = (b) => b.replace(…)` | **gemist** |
 *    | een methode in een klasse of object-literal | **gemist** |
 *    | een knip die teken voor teken loopt zonder regex | **gemist** |
 *    | een knip met twee parameters | **gemist** |
 *
 * ⚠️ **Eén parameter, en dat is een keuze die precisie koopt.** Een knip neemt
 *    bron en geeft bron terug. 📏 Zonder die eis meldde de detector `git()`-
 *    aanroepen met vlaggen en een handvol formatteerfuncties. De prijs staat
 *    hierboven: een knip met twee parameters ziet hij niet. De teken-voor-teken-
 *    vorm mist hij ook, en dat is de vorm van `sleutelvorm`, `idlijst` en
 *    `klokgrens` — die staan alle drie al op naam in `MET_REDEN`, dus vandaag
 *    kost dat niets. Morgen kan dat anders zijn, en dan is dít de regel die
 *    verruimd moet worden.
 */
export function knipVormenIn(bron) {
  const schoon = zonderCommentaar(bron);
  const uit = [];

  for (const m of schoon.matchAll(
    /(?:export\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)[^{]*\{/g,
  )) {
    const parameters = m[2].trim();
    if (parameters === '' || parameters.includes(',')) continue;

    const open = m.index + m[0].length - 1;
    const eind = sluitAccolade(schoon, open);
    if (eind === -1) continue;

    if (isKnipLichaam(schoon.slice(open, eind))) uit.push(m[1]);
  }

  return uit;
}

/**
 * De vormtreffers die géén knip zijn, met de reden waarom niet.
 *
 * ⚠️⚠️ **Dit is de precisiehelft en hij hoort erbij te staan.** Een vormdetector
 *    zonder plek voor zijn eigen valse treffers wordt een controle die je
 *    uitzet — en dan bewaakt hij de échte elfde ook niet meer. Elke rij zegt
 *    waaróm die functie geen commentaar wegknipt.
 *
 * ⚠️ **Een rij hier is geen vrijbrief voor het bestand.** Hij vrijwaart één
 *    functie; komt er morgen een echte knip naast, dan meldt de controle die
 *    gewoon. Zelfde overweging als bij `MET_REDEN`.
 */
export const GEEN_KNIP = {
  'scripts/migratie-hernummer.mjs:kopNummer':
    'selecteert juist de commentaarregels in plaats van ze weg te gooien — de kop van ' +
    'een migratie ís commentaar, en dit leest het nummer eruit',
  'scripts/rollbackpad.mjs:padOnderbroken':
    'verzamelt de `--`-kopregels om te toetsen of het rollback-pad erin staat; hij ' +
    'gooit niets weg',
  'scripts/deploy-web.mjs:stripSourceMapVerwijzing':
    'haalt de `//# sourceMappingURL`-aanwijzing weg, en dat is een bundeldirective en ' +
    'geen toelichting — hij bepaalt nergens wat er *code* heet',
};

/**
 * De knippen die met reden een eigen vorm houden.
 *
 * ⚠️ **Op bestand én functienaam, niet op bestand alleen.** Een uitzondering per
 *    bestand zou ook de knip vrijstellen die er morgen bijkomt. Zelfde
 *    overweging als in `gedeelde-identiteit-controle.mjs`.
 */
export const MET_REDEN = {
  // ── Knippen die niet `zonderCommentaar` heten (QS8-579) ──────────────────
  'scripts/avatar-controle.mjs:beoordeelBestand':
    'knipt per regel en op regelbegin (`/^\\s*(\\/\\/|\\*|\\/\\*).*$/`), want deze ' +
    'controle meldt regelnummers — de gedeelde knip gooit een regel wég en dan ' +
    'wijst de melding naar de verkeerde regel',
  'scripts/dode-keten-controle.mjs:zonderDefinities':
    'knipt SQL (`--`) uit een migratie en doet daarna nog drie dingen; JS-commentaar ' +
    'komt er niet in voor. 📏 Op 28-08 gemeten dat dit nodig was: zonder de knip ' +
    'telde een ⚠️-regel in 0122 die `initplan_bewaking()` noemde als aanroeper. ' +
    '⚠️ Hij stond tot QS8-579 in ZONDER_KNIP alsof hij niets knipte; die rij is ' +
    'vervallen. Zijn resterende commentaargevoeligheid staat als eigen rij in ' +
    'docs/ENGINEER-REVIEW.md en faalt **dicht** — 0292 meldde een `klok_fout()` ' +
    'die alleen in een comment stond',
  'scripts/edge-tijd-controle.mjs:normaliseer':
    'knipt óók een **staartcommentaar** weg, en dat moet hier: deze controle ' +
    'vergelijkt twee kopieën van `shared/time` en commentaar mág daar verschillen. ' +
    'De gedeelde knip laat een staart staan en meldt dan een verschil dat er geen ' +
    'is. 📏 Gemeten bij QS8-579: met de gedeelde knip viel ' +
    '`tests/scripts/edge-tijd.test.ts` om op `const a = 1; // uitleg`. Hij draagt ' +
    'sinds datzelfde issue wél de `(^|[^:])`-wacht van QS8-412 — zonder die wacht ' +
    'verklaarde hij twee uiteenlopende kopieën gelijk zodra er een URL in stond',
  'scripts/registerdrift-controle.mjs:registersIn':
    'knipt SQL (`--`) uit een functielichaam om de registerrijen te tellen; een ' +
    'JS-knip haalt daar niets weg',
  'scripts/tijdzones-controle.mjs:tijdzonekandidaten':
    'filtert regels die mét commentaar beginnen (`/^\\s*(\\/\\/|\\*|\\/\\*|--)/`) en ' +
    'dekt daarmee JS én SQL in één zeef — de gedeelde knip kent de `--` niet',
  'scripts/verbindingen-controle.mjs:controleer':
    'slaat commentaarregels over met een `return` middenin een grotere lus; de knip ' +
    'is hier geen aparte stap maar de eerste regel van de beoordeling',
  'tests/beloftes/aanmeldscherm.test.ts:plat':
    'knipt mét de `(^|[^:])`-wacht van QS8-412 én slaat witruimte plat — dat tweede ' +
    'is een andere belofte dan "zonder commentaar". 📏 Gemeten bij QS8-579: faalt ' +
    'dicht (1 rood) op de `beginModus`-mutatie',
  'tests/beloftes/tabbalk-bovenaan.test.ts:bronZonderCommentaar':
    'knipt per regel mét de `(^|[^:])`-wacht van QS8-412, zodat een `https://` in het ' +
    'scherm niet de rest van zijn regel opeet. 📏 Gemeten bij QS8-579: faalt dicht ' +
    '(2 rood) op de `<Taakbalk />`-mutatie',
  'scripts/definers-controle.mjs:zonderCommentaar':
    'knipt SQL-commentaar (`--`), niet JS — een andere taal en dus een andere knip',
  'scripts/storage-eigendom-controle.mjs:zonderCommentaar':
    'knipt SQL-commentaar (`--`) uit een migratie; JS-commentaar komt er niet in voor',
  'scripts/pinuitzonderingen-controle.mjs:zonderCommentaar':
    'knipt SQL-commentaar (`--`) uit een functiedefinitie; JS-commentaar komt er niet in voor',
  'scripts/zonder-sql-commentaar.mjs:zonderCommentaarSql':
    'de **gedeelde SQL-knip**, de tegenhanger van de gedeelde JS-knip: `--` én ' +
    'geneste `/* */`, om enkele quotes én dollar-quotes heen, met de literalen ' +
    'intact — een streepje binnen een literal mag de leesplek niet opeten ' +
    '(QS8-491). Stond tot QS8-574 in `sleutelvorm-controle.mjs`, waar ' +
    '`dml-controle.mjs` hem al uit importeerde',
  'scripts/persoon-in-jsonb-controle.mjs:zonderCommentaar':
    'knipt SQL-commentaar per regel, zodat de regelindeling van de query heel blijft',
  'scripts/klokgrens-controle.mjs:zonderCommentaar':
    'SQL én stringliteralen, per regel — hij loopt teken voor teken om quotes heen',
  'scripts/uitgang-controle.mjs:zonderCommentaarEnTekst':
    'haalt óók stringliteralen weg; dat is een andere belofte dan "zonder commentaar"',
  'tests/migraties/idempotentie.ts:zonderCommentaarEnTekst':
    'knipt SQL en niet JS: geneste blokken, dollar-quotes en enkele quotes, met ' +
    'behoud van regellengte omdat een bezwaar een regelnummer draagt (QS8-570)',
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
  'scripts/hoofdrun-controle.mjs':
    'leest YAML-workflows, net als `ci-controles.mjs` — 📏 gemeten op 22-09-2026 haalt de ' +
    'gedeelde knip uit `concurrency:\\n  # group: ci-x\\n  group: ci-goed\\n` **niets** weg, ' +
    'want die kent de `#` niet. ⚠️ Het verschil met die buur is dat deze controle wél knipt, ' +
    'alleen met zijn eigen zeef: `concurrencyBlok()` gooit de commentaarregels binnen het blok ' +
    'eruit, en 📏 dezelfde invoer geeft `groepRegel() === "ci-goed"`. Die zeef staat onder toets ' +
    'in `tests/scripts/hoofdrun-controle.test.ts` — met de meting die hem opleverde: de kop van ' +
    '`ci.yml` legt `cancel-in-progress` uit en maakte de controle rood op zijn eigen uitleg ' +
    '(QS8-582, klasse QS8-412)',
  'scripts/padverwijzing-controle.mjs':
    'een pad ín een comment is daar juist het onderwerp en niet de ruis — QS8-412 ontstond bij ' +
    '`src/shared/ui/Foto.tsx`, dat in zijn eigen kop naar een toets wees die nooit geschreven is. ' +
    'Knippen zou precies de klasse wegnemen waarvoor die controle bestaat. Hij bouwt zijn twee ' +
    'regexen met concatenatie uit `EXTENSIES` en `SUBMAPPEN`, en die vorm ziet deze detector ' +
    'sinds QS8-572',
};

/**
 * Bestanden die bron lezen en op een naam matchen in een vorm die
 * `leestBronMetNaampatroon()` **met opzet** niet ziet — QS8-572.
 *
 * ⚠️⚠️ **Dit register is met de hand bijgehouden, en dat is het verschil met
 *    `ZONDER_KNIP`.** Dat register hangt aan de detector: wie erin staat, wordt
 *    gevonden, en `verweesdeVrijstellingen()` gooit een rij eruit zodra hij niets
 *    meer vrijstelt. Deze rijen vindt niemand automatisch — ze bestaan juist
 *    omdát de detector ze niet ziet. Het register koopt dus één ding, en niet
 *    meer: **de volgende lezer kan zien dát ze beoordeeld zijn** in plaats van
 *    te moeten uitzoeken of hier iets lekt.
 *
 * ⚠️ **Waarom deze vorm niet gewoon meegedetecteerd wordt** staat gemeten in de
 *    kop van `leestBronMetNaampatroon()`: van de vijf treffers op de
 *    stringmethode-vormen is er één een échte bronscan. De andere vier zijn pad-
 *    en sleutelvergelijkingen, waaronder twee in dit bestand zelf.
 *
 * ⚠️ Een rij hier mag nooit "gezien, komt goed" zeggen. De reden hoort te zeggen
 *    wat er gemeten is en waarom de uitkomst geen gat is.
 *
 * ⚠️⚠️ **Wat deze ratel níet vangt, en dat is met de hand gemeten.**
 *    `verweesdeBeoordelingen()` meldt een rij die weg **mag**; hij kan niet weten
 *    dat er een rij **mist**. 📏 Geijkt door dit register leeg te maken:
 *    `knip:controle` bleef groen (exitcode 0), en alleen de toetsen in
 *    `tests/scripts/knip-controle.test.ts` werden rood — en die drie vallen om
 *    omdat ze een echte sleutel nodig hebben, niet omdat ze de leegte bewaken.
 *    Dat is de prijs van een handgeschreven register, en hij hoort hier te staan
 *    in plaats van weggeredeneerd te worden: **wie een vorm tegenkomt die deze
 *    detector niet ziet, is zelf de grendel.**
 */
export const BEOORDEELD = {
  'scripts/conflictmarkeringen-controle.mjs':
    'scant regels op een markering die uit een naam gebouwd wordt (`regel.startsWith(`${vorm} `)`), ' +
    'en dat is een échte bronscan. Hij **mag** niet knippen: een conflictmarkering in een ' +
    'uitgecommentarieerd blok is nog steeds een kapotte merge, en juist die is met het blote oog ' +
    'het makkelijkst te missen. Faalt dus bewust **open** in de veilige richting',
};

/** Leest dit bestand überhaupt bronbestanden? */
export const LEEST_BRON = /readFileSync\(|readFile\(/;

/**
 * Een regex die uit een naam gebouwd wordt.
 *
 * ⚠️ **`\\bRegExp\\(` en niet `new RegExp\\(`** — sinds QS8-572. `RegExp('x')` zonder
 *    `new` doet in JavaScript precies hetzelfde, en een detector die het ene wel
 *    ziet en het andere niet, laat de volgende grendel zich onzichtbaar maken met
 *    een weggelaten sleutelwoord. 📏 Gemeten bij het verbreden: **0** nieuwe
 *    treffers, dus dit is verzekering en geen opruiming. De `\\b` houdt
 *    `XRegExp(` erbuiten.
 *
 * ⚠️ **En de concatenatievorm erbij.** `RegExp('…' + naam)` draagt hetzelfde
 *    risico als de templatevorm — een treffer ín een comment telt als code — en
 *    is de vorm die je schrijft zodra de regex zo lang wordt dat een template
 *    onleesbaar is.
 */
export const NAAMPATROON = /\bRegExp\(\s*(?:`[^`]*\$\{|(?:'[^']*'|"[^"]*")\s*\+)/;

/**
 * Leest dit bestand bronbestanden én bouwt het een regex uit een naam?
 *
 * ⚠️⚠️ **Wat hij ziet en wat niet — gemeten, niet geschat (QS8-567, verbreed in
 *    QS8-572).** Dit is een detector op vórm, en een vormdetector heeft altijd
 *    een rand. Die staat hier zodat niemand de telling voor volledigheid aanziet:
 *
 *    | vorm | | sinds |
 *    | -- | -- | -- |
 *    | `new RegExp(`…${naam}…`)`, ook met een newline of spatie ná de haak | gezien | QS8-567 |
 *    | `RegExp(` zonder `new` | gezien | QS8-572 |
 *    | `RegExp('…' + naam)` — concatenatie | gezien | QS8-572 |
 *    | `bron.includes(`…${naam}…`)` | **gemist**, met opzet | |
 *    | `bron.split(`…${naam}…`)` | **gemist**, met opzet | |
 *    | `regel.startsWith(`${naam} `)` | **gemist**, met opzet | |
 *
 * 📏 **De twee verbredingen van QS8-572, elk vóór en ná gemeten.** `RegExp(`
 *    zonder `new` kostte **0** nieuwe treffers; de concatenatievorm kostte er
 *    **1**, en dat is `padverwijzing-controle.mjs` — een rij die dit issue
 *    hoe dan ook wilde. Beide zijn dus gratis of goedkoop, en geen van beide
 *    levert een haastige registerreden op.
 *
 * ⚠️⚠️ **De stringmethodes zijn gemeten en bewust níet overgenomen, en dat is
 *    de vondst van QS8-572.** Ze zien er verwant uit — een naald uit een naam,
 *    gezocht in tekst — maar de **ontvanger** verschilt, en die is met een
 *    vormdetector niet te zien:
 *
 *    | vorm | treffers | daarvan een échte bronscan |
 *    | -- | -- | -- |
 *    | `.includes(`…${…}…`)` | 1 | **0** — `catalogus-controle.mjs` filtert er een **pad** mee |
 *    | `.split(`…${…}…`)` | 0 | 0 |
 *    | `.startsWith(`…${…}…`)` | 4 (3 nieuw) | **1** — `conflictmarkeringen-controle.mjs` |
 *
 *    De andere twee `startsWith`-treffers zijn pad- en sleutelvergelijkingen:
 *    `padverwijzing-controle.mjs` doet `pad.startsWith(`${map}/`)` en **dit
 *    bestand zelf** doet `sleutel.startsWith(`${pad}:`)`. Eén op de vijf dus.
 *    Een controle die vier van de vijf keer iets meldt dat niet aan de hand is,
 *    leer je uitzetten — dat staat in de kop van `scripts/paden.mjs` en het geldt
 *    hier onverkort. **Wat er op stringmethodes ontbreekt is geen bredere regex
 *    maar een ander soort signaal**, en dat is een eigen issue waard en niet een
 *    oprekking van deze.
 *
 * ⚠️ **Een zesde vorm is onderweg gemeten en ook afgewezen: `RegExp(naam)` met
 *    een kále variabele.** 📏 Eén nieuwe treffer,
 *    `afstemgetal-controle.mjs` regel 102 — `new RegExp(patroon, 'iu')`, waar
 *    `patroon` een héél patroon is en geen naam die ergens in gevlochten wordt.
 *    Precisie 0 op 1, en het is dezelfde valse treffer die QS8-567 al een keer
 *    corrigeerde. Daarom eist de concatenatietak een **stringliteraal** vóór de
 *    `+`: dat is het teken dat er een naald omheen gebouwd wordt.
 *
 * ⚠️ De ene échte instantie uit die tabel staat daarom in `BEOORDEELD` hieronder,
 *    en niet in `ZONDER_KNIP`: dat register hoort bij wat deze detector vindt.
 */
export function leestBronMetNaampatroon(bron) {
  const schoon = zonderCommentaar(bron);
  return LEEST_BRON.test(schoon) && NAAMPATROON.test(schoon);
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

  // ⚠️ De derde helft: een knip die niet `zonderCommentaar` heet, ontliep dit
  //    register volledig (QS8-579). Wat hier gevraagd wordt is hetzelfde als bij
  //    de eerste helft — deel de knip, of leg uit waarom je hem houdt — plus de
  //    uitweg dat het helemaal geen knip is.
  for (const naam of knipVormenIn(bron)) {
    const sleutel = `${pad}:${naam}`;
    if (MET_REDEN[sleutel] !== undefined || GEEN_KNIP[sleutel] !== undefined) continue;
    if (DEFINITIE.test(`function ${naam}(`)) continue;
    DEFINITIE.lastIndex = 0;
    uit.push(
      `${pad}: \`${naam}\` knipt commentaar maar heet niet zo — importeer ` +
        `\`${GEDEELD}\`, zet hem met zijn reden in MET_REDEN, of zet hem in ` +
        'GEEN_KNIP als hij geen commentaar wegknipt.',
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

/**
 * Rijen in `BEOORDEELD` die hun reden kwijt zijn — QS8-572.
 *
 * ⚠️⚠️ **Drie manieren waarop zo'n rij verloopt, en de derde is de interessante.**
 *    Het bestand kan weg zijn, het kan zijn gaan knippen — en het kan **alsnog
 *    gedetecteerd worden**, doordat iemand de vorm herschrijft of de detector
 *    verbreedt. In dat laatste geval hoort de rij niet hier maar in
 *    `ZONDER_KNIP`, waar hij aan de detector hangt in plaats van aan iemands
 *    geheugen. Twee registers met dezelfde rij is precies de val die CLAUDE.md
 *    bij twee gelijknamige controles beschrijft.
 *
 * ⚠️ Ook een bestand dat helemaal geen bron meer leest, verliest zijn reden:
 *    dan gaat deze rij over een risico dat er niet meer is.
 */
export function verweesdeBeoordelingen(bronnen) {
  const genormaliseerd = new Map([...bronnen].map(([p, b]) => [metSchuineStrepen(p), b]));
  return Object.keys(BEOORDEELD).filter((pad) => {
    const bron = genormaliseerd.get(pad);
    if (bron === undefined) return true;
    if (knipt(bron, pad)) return true;
    if (leestBronMetNaampatroon(bron)) return true;
    return !LEEST_BRON.test(zonderCommentaar(bron));
  });
}

/**
 * Elk bestand in de gescande mappen, met zijn bron en zijn definities.
 *
 * ⚠️ Losgetrokken uit `hoofd()` voor onwrikbare regel 15 — en dat is hier niet
 *    alleen boekhouding: de drie stappen (verzamelen, fouten melden, de stand
 *    melden) zijn los te lezen en de eerste is de enige die schijf aanraakt.
 */
function verzamel() {
  const paden = MAPPEN.flatMap((map) => bestanden(map));
  const gevonden = new Set();
  const bronnen = new Map();
  const uit = [];

  for (const pad of paden) {
    if (pad.startsWith(`${ZONDER_TOETS}/`)) continue;
    const bron = readFileSync(join(WORTEL, pad), 'utf8');
    bronnen.set(metSchuineStrepen(relative('.', pad)), bron);
    // ⚠️ Béide helften voeden het "bestaat nog"-beeld (QS8-579). Zonder de
    //    tweede regel meldt `verweesdeRedenen()` elke vormgeregistreerde knip
    //    als verdwenen — een controle die onzin meldt, leer je negeren.
    for (const naam of definitiesIn(bron)) gevonden.add(`${pad}:${naam}`);
    for (const naam of knipVormenIn(bron)) gevonden.add(`${pad}:${naam}`);
    uit.push(...klachten(bron, relative('.', pad)));
  }

  return { paden, gevonden, bronnen, klachtenLijst: uit };
}

/** De drie registers die stil kunnen verouderen, in één keer. */
function verweesd({ gevonden, bronnen }) {
  return {
    redenen: verweesdeRedenen(gevonden),
    vrijstellingen: verweesdeVrijstellingen(bronnen),
    beoordelingen: verweesdeBeoordelingen(bronnen),
  };
}

function meldFouten(klachtenLijst, los) {
  console.error('knip-controle: er staat een knip buiten de gedeelde bron.\n');
  for (const regel of klachtenLijst) console.error(`  ${regel}`);
  for (const sleutel of los.redenen) {
    console.error(`  ${sleutel} staat in MET_REDEN maar bestaat niet meer — haal de rij weg.`);
  }
  for (const pad of los.vrijstellingen) {
    console.error(
      `  ${pad} staat in ZONDER_KNIP maar heeft die vrijstelling niet meer nodig — ` +
        'haal de rij weg.',
    );
  }
  for (const pad of los.beoordelingen) {
    console.error(
      `  ${pad} staat in BEOORDEELD maar hoort daar niet meer — hij knipt, of hij wordt ` +
        'inmiddels gedetecteerd (dan is ZONDER_KNIP de plek), of hij leest geen bron meer.',
    );
  }
  console.error(
    `\n  De gedeelde knip is \`${GEDEELD}\`, en hij is geijkt in\n` +
      '  `tests/scripts/zonder-commentaar.test.ts` — mét de URL-vorm die dit\n' +
      '  project een halve ijking kostte (QS8-412).',
  );
}

/**
 * De stand, met beide helften én hun noemer.
 *
 * ⚠️ Beide helften noemen, want een controle die alleen zijn oude helft meldt,
 *    laat de lezer denken dat de nieuwe er niet is (QS8-567).
 *
 * ⚠️⚠️ **En sinds QS8-572 staat de noemer erbij.** Hier stond alleen het aantal
 *    gedetecteerde bronlezers, en dat las als "zoveel bronlezers zijn er". 📏 Er
 *    zijn er in `scripts/` veel meer die bron lezen; wat deze controle telt is de
 *    deelverzameling die er een **patroon uit een naam** mee bouwt. Een getal
 *    zonder zijn noemer is precies de vorm waarmee dit project eerder een
 *    uitrolstand en een testteller verkeerd heeft gelezen.
 */
function meldStand(paden, bronnen) {
  const inScripts = [...bronnen].filter(([pad]) => metSchuineStrepen(pad).startsWith('scripts/'));
  const bronlezers = inScripts.filter(([, bron]) => LEEST_BRON.test(zonderCommentaar(bron)));
  const lezers = inScripts.filter(([, bron]) => leestBronMetNaampatroon(bron));
  const beoordeeld = Object.keys(BEOORDEELD).length;
  console.log(
    `knip-controle: ${Object.keys(MET_REDEN).length} knippen met een reden, de rest deelt er één ` +
      `(${paden.length} bestanden). ` +
      `In scripts/ lezen ${bronlezers.length} bestanden bron; ${lezers.length} bouwen daar een ` +
      `patroon uit een naam mee, waarvan ${Object.keys(ZONDER_KNIP).length} met reden zonder knip. ` +
      `${beoordeeld} ${beoordeeld === 1 ? 'staat' : 'staan'} als beoordeeld in een vorm die deze ` +
      'detector met opzet niet ziet.',
  );
}

export function hoofd() {
  const { paden, gevonden, bronnen, klachtenLijst } = verzamel();
  const los = verweesd({ gevonden, bronnen });

  if (
    klachtenLijst.length > 0 ||
    los.redenen.length > 0 ||
    los.vrijstellingen.length > 0 ||
    los.beoordelingen.length > 0
  ) {
    meldFouten(klachtenLijst, los);
    return 1;
  }

  meldStand(paden, bronnen);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
