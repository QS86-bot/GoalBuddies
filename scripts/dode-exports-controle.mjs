#!/usr/bin/env node
/**
 * dode-exports-controle — een datalaagfunctie zonder pad naar een mens.
 *
 * ⚠️ **Waarom dit bestaat, en waarom een lijst niet genoeg was** (QS8-150).
 *    `tests/beloftes/bereikbaar.test.ts` bewaakt zes functies **per naam, met
 *    een reden erbij**. Dat is een register en geen detector: de zevende functie
 *    zonder scherm komt er ongezien langs, en dat is precies hoe QS8-112,
 *    QS8-113 en QS8-106 konden gebeuren — elk schakeltje af, de keten nergens
 *    verbonden, en geen enkele test die het kón zien.
 *
 *    Dit script is de detector. Het register blijft: daar staat per functie
 *    *waarom* een gebruiker erbij moet kunnen, en dat is iets anders dan of hij
 *    erbij kán.
 *
 * ⚠️ **Geen grep, en ook geen nieuwe dependency.** Het issue rekende op een
 *    afweging over `ts-morph`; die is er niet, want `typescript` staat al in
 *    `devDependencies` (`tsc` draait in de poort). De compiler-API leest de AST,
 *    dus een naam in een commentaarblok, in een string of in een `import`-regel
 *    telt niet mee — precies de valse meldingen waar de ruwe telling op stukliep.
 *
 * ---------------------------------------------------------------------------
 * Wat "bereikbaar" hier betekent
 * ---------------------------------------------------------------------------
 *
 * **Een gebruiker bereikt code langs twee wegen: een scherm of een geplande
 * taak.** `app/` en `supabase/functions/` zijn daarom de wortels. Van daaruit
 * loopt dit script de aanroepen na, transitief: een scherm roept een hook aan,
 * de hook roept de datalaag aan, en dan is die datalaag bereikbaar.
 *
 * ⚠️ **Dat transitieve stuk is de hele reden voor een parser.** `uploadAvatar`
 *    wordt door geen enkel scherm aangeroepen — alleen door `useAvatarKeuze`,
 *    die wél op een scherm staat. Een controle die één schakel diep kijkt, meldt
 *    hem als dood; deze niet.
 *
 * ⚠️ **Alleen functies.** Types, constanten en Zod-schema's worden niet
 *    aangeroepen maar genoemd, en "wordt genoemd" is geen belofte over
 *    bereikbaarheid. Bij de eerste opzet telde die groep mee en stonden er 279
 *    meldingen — een controle die alles meldt, leer je te negeren.
 *
 * ⚠️ **Op naam en niet op symbool, en dat is een bewuste onnauwkeurigheid.** Een
 *    naam die op twee plekken gedeclareerd staat, geldt als bereikbaar zodra
 *    één van beide gebruikt wordt. Dat levert een vals-negatief op (een dode
 *    functie die meelift op zijn naamgenoot) en nooit een vals-positief. Die
 *    kant is met opzet gekozen: dit script hoort niemand wakker te maken voor
 *    iets dat wél werkt.
 *
 * ---------------------------------------------------------------------------
 * De vorm: een ratel met redenen
 * ---------------------------------------------------------------------------
 *
 * Er staan er vandaag twee. Die zijn niet in één ronde te repareren — elk ervan
 * is óf een scherm dat er niet is, óf een functie die weg kan, en dat is per
 * geval een aparte afweging (QS8-300). Tot die tijd staan ze hieronder **met een
 * reden**, en de bedoeling is dat het aantal alleen daalt.
 *
 * ⚠️ **"De bedoeling", want dit script telt niet — en dat is minder dan de kop
 *    hier tot 07-09-2026 beweerde.** Er stond dat dit dezelfde ratel is als
 *    `regel15:controle` en `levend:controle`. Dat is hij niet: `nieuw` is
 *    `gevonden.filter((n) => !(n in BEKENDE_ONBEREIKBAAR))`, dus een onbereikbare
 *    export maakt hem rood tót je hem registreert, en dáárna is hij groen. Er is
 *    geen getal dat meezakt. Omhoog is dus onbewaakt, en deze branch liep er
 *    zelf tegenaan: QS8-342 bracht het register van één op twee.
 *
 *    Wat er wél bewaakt was, is de andere richting: een rij die blijft staan
 *    terwijl de functie bereikbaar of verdwenen is, is rood. Een register dat
 *    blijft staan terwijl de functie verdwenen is, is een lijst die liegt.
 *
 * ✅ **Sinds 10-09-2026 is die kant er ook — QS8-194, en dit is nu wél dezelfde
 *    ratel als `regel15:controle` en `levend:controle`.** `PLAFOND` staat naast
 *    het register en telt zijn rijen. Een derde rij erbij is rood tot iemand het
 *    plafond in dezelfde wijziging verhoogt, en een rij eruit is óók rood tot
 *    het plafond meezakt. Dat tweede is het punt van een ratel: blijft de ruimte
 *    open staan, dan glijdt de volgende onbereikbare functie erin zonder dat
 *    iemand het ziet.
 *
 *    ⚠️ Het plafond stopt niemand die vastbesloten is — hij staat in hetzelfde
 *    bestand als het register. Wat hij wél doet is de verhoging in de diff
 *    zetten, náást de rij en zijn reden. Een register dat stil kan groeien is
 *    precies de vorm die deze rij van de review-agenda beschrijft: elk
 *    schakeltje af, en niemand die de keten telt.
 *
 * Draaien: `npm run exports:controle`. Hoort mee in de poort.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import ts from 'typescript';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * De functies die vandaag geen pad naar een mens hebben, met de reden erbij.
 *
 * ⚠️ **Een reden en geen naam.** Zelfde eis als bij `MOET_EEN_SCHERM_HEBBEN` in
 *    `bereikbaar.test.ts` en `BEWUST_ONGESCHREVEN` in `dode-keten-controle.mjs`:
 *    wie hier iets aan toevoegt zonder op te schrijven wat er aan de hand is,
 *    parkeert een naam in plaats van een bevinding vast te leggen.
 */
export const BEKENDE_ONBEREIKBAAR = {
  fetchGekoppeldeDoelIds:
    'Verloor zijn scherm bij QS8-342: het koppelscherm trok de gekoppelde doelen ' +
    'van pagina 0 af, en dat gaf een lege lijst bij eenentwintig doelen. Dat pad ' +
    'is vervangen door `fetchKoppelbareDoelen()`, dat serverzijdig uitsluit. ' +
    '⚠️ Deze functie blijft omdat `tests/rls/doorloop.test.ts` er iets ánders mee ' +
    'toetst: dat **Bram** het doel van Anna in de groep ziet — een leesrecht van ' +
    'een groepsgenoot, niet van de eigenaar. `fetchKoppelbareDoelen()` kan dat ' +
    'niet uitdrukken, want die is op je eigen doelen gescopet. ' +
    '⚠️ Wie hem alsnog weghaalt, vervangt die assertie eerst — anders verdwijnt ' +
    'de enige plek waar het groepsoppervlak van een gekoppeld doel end-to-end ' +
    'gemeten wordt.',
  isAfgegaan:
    'Wordt niet door een scherm gebruikt maar wél door `tests/rls/epic9.test.ts`, ' +
    'dat hem naast `commitment_zichtbaar_voor_groep()` legt. ⚠️ Dat is een ' +
    'geldige reden om te bestaan en geen reden om bereikbaar te zijn: hij is een ' +
    'kopie van een databaseregel die onder test staat. Weghalen breekt die toets.',
};

/**
 * Zoveel rijen mag `BEKENDE_ONBEREIKBAAR` hebben, en niet meer — QS8-194.
 *
 * ⚠️ Alleen verlagen. Wie dit getal verhoogt om een build groen te krijgen, heeft
 *    de ratel omgedraaid in plaats van gebruikt. Verhogen mag, maar dan staat de
 *    verhoging in dezelfde wijziging als de rij en zijn reden — en dat is het
 *    hele verschil met een register dat stil kan groeien.
 */
export const PLAFOND = 2;

/** De mappen waar een mens de app binnenkomt: een scherm of een geplande taak. */
export const WORTELMAPPEN = ['app', join('supabase', 'functions')];

/** De mappen waar de datalaag staat. */
export const BRONMAPPEN = ['src', 'app', join('supabase', 'functions')];

/** Alle `.ts`/`.tsx` onder een map, zonder tests. */
export function bestanden(map, uit = []) {
  let inhoud;
  try {
    inhoud = readdirSync(map);
  } catch {
    return uit;
  }
  for (const naam of inhoud) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) {
      bestanden(pad, uit);
      continue;
    }
    if (!/\.tsx?$/.test(naam) || /\.test\.tsx?$/.test(naam)) continue;
    uit.push(pad);
  }
  return uit;
}

/** Leest een bestand als AST. */
export function ontleed(pad, bron = readFileSync(pad, 'utf8')) {
  return ts.createSourceFile(
    pad,
    bron,
    ts.ScriptTarget.Latest,
    true,
    pad.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/**
 * Elke naam die in dit stuk code als **waarde** gebruikt wordt.
 *
 * ⚠️ Een aanroep telt, een callback die wordt doorgegeven telt, en een JSX-tag
 *    telt. Wat niet telt: de naam van de declaratie zelf, een naam in een
 *    `import`- of `export`-regel, de rechterkant van `obj.naam`, en een sleutel
 *    in een object-literal.
 *
 * ⚠️ **Dat een doorgegeven callback meetelt, is geen detail.**
 *    `useAsyncMetTerugval(fetchMogelijkeBegunstigden, …)` is de vorm die dit
 *    project overal gebruikt, en een zeef die alleen `naam(` ziet, meldde hem
 *    als dood.
 */
export function gebruikteNamen(node) {
  const uit = new Set();
  const loop = (n) => {
    if (ts.isIdentifier(n)) {
      const p = n.parent;
      const isDeclaratienaam =
        p !== undefined &&
        (ts.isFunctionDeclaration(p) ||
          ts.isVariableDeclaration(p) ||
          ts.isParameter(p) ||
          ts.isPropertySignature(p) ||
          ts.isClassDeclaration(p) ||
          ts.isInterfaceDeclaration(p) ||
          ts.isTypeAliasDeclaration(p) ||
          ts.isMethodDeclaration(p)) &&
        p.name === n;
      const isImportExport =
        p !== undefined &&
        (ts.isImportSpecifier(p) ||
          ts.isExportSpecifier(p) ||
          ts.isImportClause(p) ||
          ts.isNamespaceImport(p));
      const isEigenschapsnaam = p !== undefined && ts.isPropertyAccessExpression(p) && p.name === n;
      const isSleutel = p !== undefined && ts.isPropertyAssignment(p) && p.name === n;
      if (!isDeclaratienaam && !isImportExport && !isEigenschapsnaam && !isSleutel) uit.add(n.text);
    }
    ts.forEachChild(n, loop);
  };
  loop(node);
  return uit;
}

/** Alle functie-achtige declaraties in een bestand, als `naam -> lichaam[]`. */
export function functiesIn(bron) {
  const uit = [];
  const loop = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name) uit.push({ naam: n.name.text, lichaam: n });
    else if (ts.isVariableStatement(n)) {
      for (const d of n.declarationList.declarations) {
        const init = d.initializer;
        if (ts.isIdentifier(d.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          uit.push({ naam: d.name.text, lichaam: init });
        }
      }
    }
    ts.forEachChild(n, loop);
  };
  loop(bron);
  return uit;
}

/** De namen die een barrel (`modules/<naam>/index.ts`) naar buiten geeft. */
export function barrelExports(bron) {
  const uit = new Set();
  const loop = (n) => {
    if (ts.isExportDeclaration(n) && n.exportClause && ts.isNamedExports(n.exportClause)) {
      for (const el of n.exportClause.elements) if (!el.isTypeOnly) uit.add(el.name.text);
    }
    ts.forEachChild(n, loop);
  };
  loop(bron);
  return uit;
}

/**
 * De kern, los te voeden: welke van `exports` is niet bereikbaar vanaf `wortels`?
 *
 * @param {{pad: string, bron: string}[]} bestandenMetBron alle broncode
 * @param {(pad: string) => boolean} isWortel welke bestanden de wortels zijn
 * @param {Iterable<string>} exports de namen die getoetst worden
 */
export function onbereikbaar(bestandenMetBron, isWortel, exports) {
  const lichamen = new Map();
  const wortelnamen = new Set();

  for (const { pad, bron } of bestandenMetBron) {
    const ast = ontleed(pad, bron);
    for (const { naam, lichaam } of functiesIn(ast)) {
      if (!lichamen.has(naam)) lichamen.set(naam, []);
      lichamen.get(naam).push(lichaam);
    }
    if (isWortel(pad)) for (const naam of gebruikteNamen(ast)) wortelnamen.add(naam);
  }

  const bereikbaar = new Set(wortelnamen);
  const wachtrij = [...wortelnamen];

  /** Zet één naam op de lijst, als hij er nog niet op staat. */
  const noteer = (naam) => {
    if (bereikbaar.has(naam)) return;
    bereikbaar.add(naam);
    wachtrij.push(naam);
  };

  while (wachtrij.length > 0) {
    const naam = wachtrij.pop();
    for (const lichaam of lichamen.get(naam) ?? []) {
      for (const volgende of gebruikteNamen(lichaam)) noteer(volgende);
    }
  }

  return [...exports].filter((naam) => lichamen.has(naam) && !bereikbaar.has(naam));
}

/** Draait de controle over de echte boom. */
export function controleer() {
  const paden = BRONMAPPEN.flatMap((m) => bestanden(join(WORTEL, m)));
  const bestandenMetBron = paden.map((pad) => ({ pad, bron: readFileSync(pad, 'utf8') }));
  const isWortel = (pad) => WORTELMAPPEN.some((m) => pad.startsWith(join(WORTEL, m) + '/'));

  const exports = new Set();
  const modulemap = join(WORTEL, 'src', 'modules');
  for (const m of readdirSync(modulemap)) {
    const pad = join(modulemap, m, 'index.ts');
    for (const naam of barrelExports(ontleed(pad))) exports.add(naam);
  }

  return onbereikbaar(bestandenMetBron, isWortel, exports).sort();
}

const UITLEG =
  'Een geëxporteerde functie zonder pad naar een scherm of een geplande taak is\n' +
  '  dood hout dat geen enkele test ziet — elk schakeltje af, de keten nergens\n' +
  '  verbonden. Bouw er een knop voor, haal hem weg, of zet hem met een reden in\n' +
  '  `BEKENDE_ONBEREIKBAAR` in dit script. Zie QS8-150 en onwrikbare regel 18,\n' +
  '  vraag 5.';

/**
 * De vier uitslagen naast elkaar, als gewone functie zodat hij te voeden is.
 *
 * ⚠️ **`teveel` en `teruim` gaan over het régister en niet over `gevonden`.**
 *    Dat lijkt een detail en is het niet: `nieuw` maakt de controle al rood
 *    zodra er een onbereikbare functie bij komt, en die roodheid gaat weg door
 *    een rij toe te voegen. Wat er niet was, is iets dat díe handeling telt.
 *    Vandaar een plafond op het aantal rijen.
 *
 * ⚠️ De typen staan er met zoveel woorden bij. Zonder `@param` leidt TypeScript
 *    het type van `register` af uit de standaardwaarde — dus letterlijk uit de
 *    twee namen die er vandaag in staan — en dan weigert hij elk gevoerd
 *    voorbeeld in de test. Een controle die je niet kunt voeden, kun je niet
 *    ijken.
 *
 * @param {string[]} gevonden de namen die vandaag onbereikbaar zijn
 * @param {Record<string, string>} [register] `BEKENDE_ONBEREIKBAAR`, of een gevoerde variant
 * @param {number} [plafond] `PLAFOND`, of een gevoerde variant
 */
export function beoordeel(gevonden, register = BEKENDE_ONBEREIKBAAR, plafond = PLAFOND) {
  const bekend = Object.keys(register).sort();
  return {
    nieuw: gevonden.filter((n) => !(n in register)),
    verdwenen: bekend.filter((n) => !gevonden.includes(n)),
    rijen: bekend.length,
    teveel: bekend.length > plafond,
    teruim: bekend.length < plafond,
  };
}

function hoofd() {
  const gevonden = controleer();
  const { nieuw, verdwenen, rijen, teveel, teruim } = beoordeel(gevonden);

  if (nieuw.length === 0 && verdwenen.length === 0 && !teveel && !teruim) {
    console.log(
      `dode-exports-controle: ${gevonden.length} onbereikbare functie(s), allemaal bekend ` +
        `en met een reden — precies het plafond van ${PLAFOND}.`,
    );
    return;
  }

  console.log('\ndode-exports-controle: de lijst klopt niet meer.\n');
  for (const naam of nieuw) {
    console.log(`  ✗ ${naam}() is vanaf geen enkel scherm of geplande taak te bereiken`);
  }
  for (const naam of verdwenen) {
    console.log(
      `  ✗ ${naam}() staat in BEKENDE_ONBEREIKBAAR maar is bereikbaar (of weg) — haal de rij eruit`,
    );
  }

  if (teveel) {
    console.log(
      `  ✗ ${rijen} rijen in BEKENDE_ONBEREIKBAAR, en het plafond is ${PLAFOND}.\n` +
        '      Een rij erbij is een bevinding die je wegzet, geen reparatie. Zet PLAFOND\n' +
        `      in dezelfde wijziging op ${rijen}, zodat de verhoging naast de reden staat.`,
    );
  }
  if (teruim) {
    console.log(
      `  ✗ Nog maar ${rijen} rijen, en het plafond staat op ${PLAFOND}.\n` +
        '      Dat is goed nieuws en toch rood: een ratel die niet meezakt houdt ruimte\n' +
        `      open voor de volgende. Zet PLAFOND op ${rijen} in dit script.`,
    );
  }

  console.log(`\n${UITLEG}\n`);
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) hoofd();
