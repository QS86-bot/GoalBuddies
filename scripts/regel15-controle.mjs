#!/usr/bin/env node
/**
 * regel15-controle — een ratel op de functies die boven de vijftig regels zitten.
 *
 * ⚠️ **Waarom deze controle bestaat, en waarom ESLint hem niet in zijn eentje
 *    kan doen** (QS8-190). `CLAUDE.md` coderegel 15 eist *functies <50 regels,
 *    nesting <3 diep*. De nesting is sinds deze ronde een gewone lintregel
 *    (`max-depth`) en daarmee klaar. De vijftig kan dat niet overal zijn:
 *
 *    📏 Gemeten op 05-09-2026, zonder testbestanden: **66 functies in `app/`
 *    boven de vijftig regels**, en negen in `src/shared/ui`. De langste is
 *    `GroepBeheer` op **523**.
 *
 *    Een lintregel op 50 zou dus 75 keer rood staan, en een lintregel op 523
 *    staat nooit rood. Allebei leer je negeren, en dat is precies de toestand
 *    die deze bevinding beschrijft: *"de regel bestaat alleen op papier, en dat
 *    is het slechtste van beide werelden."*
 *
 * ⚠️ **Wat er dan wél bindt: het áántal, en dat mag alleen dalen.** Zelfde vorm
 *    als `levend-controle` (QS8-219): rood als het erboven komt, én rood als het
 *    eronder zakt zonder dat het plafond meezakt. Een ratel die niet meezakt,
 *    houdt ruimte open voor een kopie die niemand ziet terugkomen.
 *
 * ⚠️ **Waarom een component anders geteld wordt dan een functie.** Het lichaam
 *    van een React-component is grotendeels JSX — één `return` met opmaak erin.
 *    Zestig regels opmaak zijn niet het probleem waar regel 15 voor bestaat;
 *    vertakking is dat wel, en dáár gaat `max-depth` over. Vandaar dat de
 *    logicalaag (`src/` buiten `shared/ui`) de vijftig gewoon als lintregel
 *    krijgt en de schermlaag deze ratel.
 *
 * ⚠️ **De meting komt uit ESLint zelf en niet uit een eigen teller.** Wie hier
 *    regels zou gaan tellen met een reguliere expressie, krijgt een tweede
 *    opvatting van "wat is een functie" naast die van de lintregel — en twee
 *    lijsten die hetzelfde horen te zeggen, lopen uiteen (0032/0034).
 *
 * Gebruik:
 *   npm run regel15:controle
 */

import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ESLint } from 'eslint';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/** De grens uit coderegel 15. */
export const GRENS = 50;

/**
 * Het plafond per laag: hoeveel functies er vandaag bóven de grens zitten.
 *
 * ⚠️ **Deze getallen horen omláág.** Splits je een scherm, verlaag ze dan — de
 *    controle wordt anders rood, en dat is het hele idee van een ratel.
 *
 * ⚠️ Het type staat er met zoveel woorden bij: zonder die annotatie leidt `tsc`
 *    uit `Object.freeze({ 'app/': 66 })` het lítérale type `66` af, en dan is
 *    elke test die een eigen plafond meegeeft rood op iets dat niets met de
 *    regel te maken heeft.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const PLAFOND = Object.freeze({
  'app/': 65,
  'src/shared/ui/': 8,
  // ⚠️ **`scripts/` telt mee sinds 06-09-2026** (QS8-291). Die map viel
  //    structureel buiten de linter — 57 bestanden, 14.170 regels — en de
  //    vijftig kan er om dezelfde reden als in `app/` geen lintregel zijn:
  //    er zitten er vandaag vijftien boven, en een regel die vijftien keer rood
  //    staat leer je uitzetten. De nesting is er wél hard aan gegaan.
  'scripts/': 15,
  // ⚠️ **`supabase/functions/` telt mee sinds 11-09-2026** (QS8-422). Die map
  //    viel buiten élke coderegel — `eslint.config.js` sloot `supabase/*` uit en
  //    `deno lint` kent geen complexiteitsregels — en het is de map die elk uur
  //    met `service_role` tegen productie draait.
  //
  //    📏 Bij het aanzetten zes functies erboven, de langste op 280 regels
  //    (`draaiRollover`). Vandaar een ratel en geen lintregel, om precies
  //    dezelfde reden als in `app/` en `scripts/`.
  //
  // ⚠️ **Tel met `skipBlankLines` en `skipComments`, zoals de lintregel doet.**
  //    📏 Zonder die twee telt dezelfde map er tien boven de vijftig met een
  //    langste van 710 in plaats van zes met een langste van 280. Een plafond in
  //    een andere eenheid dan de meting is een plafond dat niemand terugvindt.
  //
  // ⚠️⚠️ **Zes werden er vier op 11-09-2026** (QS8-424). `draaiRollover` (282)
  //    en `draaiNotificaties` (203) zijn opgesplitst; wat er nog boven zit is
  //    `stuur()` in de notificatiejob (61, bestond al) en drie functies in
  //    `doelcoach/`. Die vier vielen buiten dat issue en staan hier als het
  //    getal dat verder omlaag hoort.
  'supabase/functions/': 4,
});

/** De lagen die deze ratel telt, in de volgorde waarin ze gemeld worden. */
/**
 * De **langste** functie per laag, in regels. De tweede grootheid van deze ratel.
 *
 * ⚠️⚠️ **`PLAFOND` telt kóppen en zegt niets over lengte** — en dat was een gat
 *    (QS8-427). 📏 Gemeten over de week tot 11-09-2026: het aantal functies boven
 *    de vijftig **daalde met vijf** terwijl het aantal regels erbinnen met **292
 *    steeg**; `app/` ging van 7574 naar 7845 regels en zijn langste van 523 naar
 *    557. De controle stond die hele week terecht groen.
 *
 *    Dat is dezelfde klasse die CLAUDE.md elders zelf benoemt: *een teller in
 *    grafemen bij een grens in codepunten is een nieuwe fout en geen reparatie.*
 *    Een plafond in een andere grootheid dan de regel meet, is een plafond dat
 *    de volgende meting niet terugvindt.
 *
 * ⚠️ En het getal was al bekend: de koppen hierboven schrijven de langste zélf
 *    op. Het werd gemeten, opgeschreven, en vervolgens niet afgedwongen.
 *
 * ⚠️ Zelfde rateleigenschap als `PLAFOND`: tweezijdig. Splits je de langste, zet
 *    dit getal dan mee omlaag — anders glijdt de volgende lange functie in de
 *    vrijgekomen ruimte, precies zoals bij het aantal.
 */
export const LANGSTE = Object.freeze({
  'app/': 557,
  'src/shared/ui/': 70,
  'scripts/': 221,
  // ⚠️ Stond op 280 (`draaiRollover`) tot QS8-424 die functie splitste.
  'supabase/functions/': 115,
});

export const LAGEN = Object.freeze(Object.keys(PLAFOND));

/** Bij welke laag hoort dit pad? `null` = telt niet mee. */
export function laagVan(pad) {
  const schoon = (pad ?? '').replace(/\\/g, '/');
  if (/\.test\.(?:tsx?|mjs)$/.test(schoon)) return null;
  // ⚠️ Langste eerst: `src/shared/ui/` zit ín `src/`, en wie op de eerste
  //    treffer stopt zonder te sorteren, telt hem bij de verkeerde laag.
  return [...LAGEN].sort((a, b) => b.length - a.length).find((l) => schoon.startsWith(l)) ?? null;
}

/**
 * Telt de overtredingen per laag.
 *
 * @param vondsten `[{ pad, regels }]` — als parameter, zodat deze controle te
 *   voeden is zonder de hele codebase te wijzigen (CLAUDE.md bij regel 18).
 */
export function tel(vondsten) {
  const perLaag = Object.fromEntries(LAGEN.map((l) => [l, 0]));
  const langstePerLaag = Object.fromEntries(LAGEN.map((l) => [l, 0]));
  const buiten = [];

  for (const { pad, regels } of vondsten ?? []) {
    if (regels <= GRENS) continue;
    const laag = laagVan(pad);
    if (laag === null) buiten.push(pad);
    else {
      perLaag[laag] += 1;
      // ⚠️ Nul is hier de juiste ondergrens: een laag zónder overtredingen heeft
      //    geen langste, en `teKort` hoort dan af te gaan zolang het plafond nog
      //    hoger staat. Zelfde tweezijdigheid als bij het aantal.
      if (regels > langstePerLaag[laag]) langstePerLaag[laag] = regels;
    }
  }

  return { perLaag, langstePerLaag, buiten };
}

/**
 * Rood als een laag erboven komt, én rood als hij eronder zakt — op **allebei**
 * de grootheden: het aantal functies boven de grens, en de langste ervan.
 *
 * ⚠️ `langste` staat apart van `plafond` en niet als tweede veld erin, zodat de
 *    bestaande aanroepen en hun tests onveranderd blijven werken. Wie er een
 *    derde grootheid bij wil, doet hetzelfde.
 */
export function beoordeel(vondsten, plafond = PLAFOND, langste = LANGSTE) {
  const { perLaag, langstePerLaag, buiten } = tel(vondsten);

  const teveel = LAGEN.filter((l) => perLaag[l] > (plafond[l] ?? 0));
  const teruim = LAGEN.filter((l) => perLaag[l] < (plafond[l] ?? 0));
  const teLang = LAGEN.filter((l) => langstePerLaag[l] > (langste[l] ?? 0));
  const teKort = LAGEN.filter((l) => langstePerLaag[l] < (langste[l] ?? 0));

  return {
    perLaag,
    langstePerLaag,
    buiten,
    teveel,
    teruim,
    teLang,
    teKort,
    ok: teveel.length === 0 && teruim.length === 0 && teLang.length === 0 && teKort.length === 0,
  };
}

/** Elke functie boven de grens, gemeten door ESLint zelf. */
async function meet() {
  const linter = new ESLint({
    cwd: WORTEL,
    overrideConfigFile: join(WORTEL, 'eslint.config.js'),
    overrideConfig: {
      files: [
        'app/**/*.tsx',
        'app/**/*.ts',
        'src/**/*.ts',
        'src/**/*.tsx',
        'scripts/**/*.mjs',
        'supabase/functions/**/*.ts',
      ],
      rules: {
        'max-lines-per-function': ['error', { max: GRENS, skipBlankLines: true, skipComments: true }],
      },
    },
  });

  const uitslagen = await linter.lintFiles(['app', 'src', 'scripts', 'supabase/functions']);
  const vondsten = [];

  for (const uitslag of uitslagen) {
    const pad = uitslag.filePath.replace(WORTEL, '').replace(/\\/g, '/');
    for (const bericht of uitslag.messages) {
      if (bericht.ruleId !== 'max-lines-per-function') continue;
      const m = /has too many lines \((\d+)\)/.exec(bericht.message ?? '');
      if (m !== null) vondsten.push({ pad, regels: Number(m[1]), regel: bericht.line });
    }
  }

  return vondsten;
}

/** De langste overtreders van een laag, als ingesprongen regels. */
function toon(vondsten, laag, hoeveel) {
  return vondsten
    .filter((v) => laagVan(v.pad) === laag)
    .sort((a, b) => b.regels - a.regels)
    .slice(0, hoeveel)
    .map((v) => `      ${String(v.regels).padStart(4)} regels  ${v.pad}:${v.regel}`);
}

/**
 * Meldt één kant van de ratel en geeft `1` terug, of `0` als er niets is.
 *
 * ⚠️ Vier meldblokken in `hoofd()` zetten die functie over de vijftig regels —
 *    en deze controle wees daar zelf op (QS8-427). Dat is de bedoeling: een
 *    grendel die zijn eigen bestand niet haalt, leert je hem uit te zetten.
 */
function meld(kop, lagen, regelVoor, staart, vondsten = null) {
  if (lagen.length === 0) return 0;
  console.error(`✗ ${kop}\n`);
  for (const laag of lagen) {
    console.error(regelVoor(laag));
    if (vondsten !== null) for (const r of toon(vondsten, laag, 3)) console.error(r);
  }
  console.error(`\n${staart}`);
  return 1;
}

async function hoofd() {
  const vondsten = await meet();
  const { perLaag, langstePerLaag, teveel, teruim, teLang, teKort, ok } = beoordeel(vondsten);

  const uitslag =
    meld(
      'Er zitten meer functies boven de vijftig regels dan het plafond toestaat.',
      teveel,
      (l) => `    ${l}  ${perLaag[l]} boven de grens, plafond ${PLAFOND[l]}`,
      'Splits de functie, of — als dit er echt een is die niet kleiner kan — zet uit\n' +
        'waaróm in een commentaar en verhoog het plafond pas na dat gesprek.',
      vondsten,
    ) ||
    meld(
      'Een laag zakte onder zijn plafond, en dat is goed nieuws en toch rood.',
      teruim,
      (l) => `    ${l}  nog ${perLaag[l]} boven de grens, plafond staat op ${PLAFOND[l]}`,
      'Een ratel die niet meezakt, houdt ruimte open voor een functie die niemand ziet\n' +
        'terugkomen. Zet PLAFOND bij in scripts/regel15-controle.mjs.',
    ) ||
    meld(
      'Een functie werd langer dan de langste die dit plafond toestaat.',
      teLang,
      (l) => `    ${l}  langste ${langstePerLaag[l]} regels, plafond ${LANGSTE[l]}`,
      '⚠️ Het áántal functies boven de vijftig kan hierbij gelijk gebleven zijn — dat\n' +
        'is precies het gat waar QS8-427 over ging: een laag kan krimpen in koppen en\n' +
        'groeien in regels. Splits de functie, of verhoog LANGSTE pas na dat gesprek.',
      vondsten,
    ) ||
    meld(
      'De langste functie van een laag werd korter, en dat is goed nieuws en toch rood.',
      teKort,
      (l) => `    ${l}  langste nu ${langstePerLaag[l]} regels, plafond staat op ${LANGSTE[l]}`,
      'Zelfde reden als bij het aantal: een ratel die niet meezakt houdt ruimte open.\n' +
        'Zet LANGSTE bij in scripts/regel15-controle.mjs.',
    );

  if (uitslag !== 0) return 1;

  console.log(
    'regel15-controle: ' +
      LAGEN.map((l) => `${l} ${perLaag[l]} (langste ${langstePerLaag[l]})`).join(', ') +
      ` — precies het plafond. ${ok ? 'Nieuwe lange functies gaan niet meer door, en bestaande groeien niet.' : ''}`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  hoofd().then((code) => process.exit(code));
}
