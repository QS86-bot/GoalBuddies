#!/usr/bin/env node
/**
 * belofteknip-controle — een belofte-test toetst nooit bevestigend op ruwe
 * bestandsinhoud (QS8-574).
 *
 * ## De vorm die hij zoekt
 *
 *     const inhoud = readFileSync(SCHERM, 'utf8');
 *     expect(inhoud).toContain('magOvernemenUitDagzetten(');
 *
 * De belofte is *"dit scherm roept die poort aan"*. Wat er getoetst wordt is
 * *"die tekenreeks staat in het bestand"* — en dat is óók waar als de aanroep
 * uitgecommentarieerd is. Bij een tijdelijke uitschakeling blijft de naam juist
 * wél staan, in de comment. QS8-568 vond er vijf en repareerde ze; dit is het
 * mechanisme eronder, want CLAUDE.md zegt bij QS8-417 met zoveel woorden dat
 * *een reparatie die de instanties opruimt en het mechanisme laat staan,
 * teruggroeit — onder een rij die "opgelost" zegt.*
 *
 * ⚠️⚠️ **Alleen de bevéstigende toets, en dat is de hele scope.** Een
 *    `.not.toContain()` op ruwe bron faalt **dicht**: commentaar erbij kan hem
 *    alleen rood maken, nooit stil groen. Die vorm melden zou de controle vol
 *    ruis zetten, en een controle die je leert negeren bewaakt de volgende
 *    instantie ook niet meer. Het issue waarschuwde hier met zoveel woorden
 *    voor.
 *
 * ## Wat hij ziet en wat niet — gemeten, niet geschat
 *
 * Dit is een detector op vórm, en een vormdetector heeft altijd een rand. Die
 * staat hier zodat niemand de telling voor volledigheid aanziet.
 *
 * | vorm | |
 * | -- | -- |
 * | `const X = readFileSync(…)` + `expect(X).toContain(…)` | gezien |
 * | `{ pad, inhoud: readFileSync(…) }` + `expect(s.inhoud).toMatch(…)` | gezien |
 * | `function lees(p) { return readFileSync(p); }` + `const X = lees(…)` | gezien |
 * | `const lees = (p) => readFileSync(p);` + `const X = lees(…)` | gezien |
 * | `expect(X, 'melding').toContain(…)` — met meldingsargument | gezien |
 * | een toets over meerdere regels | gezien |
 * | `const X = knip(readFileSync(…))` — wát `knip` ook doet | **gemist, met opzet** |
 * | `readFileSync(…).replace(…)` — een keten erachter | **gemist, met opzet** |
 * | `expect(readFileSync(…)).toContain(…)` — zonder binding | **gemist** |
 * | een hulpfunctie die een ánder hulpfunctie aanroept — twee lagen diep | **gemist** |
 *
 * ⚠️ **De hulpfunctie zit erin omdat hij een échte instantie droeg en geen
 *    hypothese.** 📏 `weekpas-bereikt-je.test.ts` heeft
 *    `function bron(pad) { return readFileSync(join(WORTEL, pad), 'utf8'); }` en
 *    toetst `expect(job).toContain(…)` op het resultaat — vier bevestigende
 *    toetsen die een detector zonder deze laag niet ziet. Eén laag is genoeg
 *    gebleken; twee lagen staan hierboven als gemeten rand en niet als
 *    geruststelling.
 *
 * ⚠️⚠️ **Die derde rij van onderen is de gevaarlijkste, en hij is met opzet zo.**
 *    Deze controle beoordeelt **niet** of een knip een góede knip is — hij ziet
 *    alleen dat de waarde ergens langs gaat. 📏 Gemeten op 21-09-2026: **vier**
 *    belofte-tests knippen met een eigen functie die niet `zonderCommentaar`
 *    heet, en `knip:controle` ziet geen van vieren — zijn `DEFINITIE` matcht
 *    alleen namen die met `zonderCommentaar` beginnen:
 *
 *    | knip | bestand | gemeten |
 *    | -- | -- | -- |
 *    | `plat()` | `aanmeldscherm.test.ts` | ✅ faalt dicht (1 rood) |
 *    | `bronZonderCommentaar()` | `tabbalk-bovenaan.test.ts` | ✅ faalt dicht (2 rood) |
 *    | `ontdaanVanCommentaar()` | `datumopmaak.test.ts` | **niet gemeten** |
 *    | `ontdaanVanCommentaar()` | `onboarding-schrijft-niets-over.test.ts` | **niet gemeten** |
 *
 *    ⚠️ Die laatste twee rijen staan er als *niet gemeten* en niet als *in
 *    orde*. De poort houdt ongemeten en groen uit elkaar; een kop die dat
 *    verschil dichtschrijft is de fout waar dit hele issue over gaat. Het gat
 *    — vier knippen die hun eigen register ontlopen — staat als QS8-579, en
 *    hoort niet hier: een grendel die "gaat ergens langs" voor "knipt correct"
 *    laat doorgaan, belooft meer dan hij meet.
 *
 * ⚠️ **Geëxporteerd én los te voeden**, want een controle die je niet kunt
 *    ijken, kun je niet vertrouwen. Zie `tests/scripts/belofteknip-controle.test.ts`.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { metSchuineStrepen } from './paden.mjs';
import { zonderCommentaar } from './zonder-commentaar.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/**
 * De map die hij afloopt.
 *
 * ⚠️ **`tests/beloftes/` en niet heel `tests/`.** De belofte-tests zijn de enige
 *    plek waar een test een eigenschap van het **gehéél** vastlegt en daarvoor
 *    bron leest; een gewone unit-test roept zijn onderwerp aan. Hem breder
 *    zetten zou melden wat er niet is, en dat is hoe een controle ruis wordt.
 *    Zelfde afbakening als `knip:controle`, die sinds QS8-567 met reden alleen
 *    in `scripts/` kijkt — en het is bewust een éígen controle en geen tweede
 *    helft van die: twee controles met dezelfde naam en een andere reikwijdte
 *    is een val, en dat staat in criterium 4 van QS8-574.
 */
export const MAP = 'tests/beloftes';

/** De gedeelde knip, in de melding genoemd zodat niemand een achttiende schrijft. */
export const GEDEELD = 'scripts/zonder-commentaar.mjs';

/**
 * Hoe ver voorbij de `expect(…)` hij naar de matcher kijkt.
 *
 * ⚠️ Ruim genoeg voor een toets die prettier over vier regels uitsmeert, en krap
 *    genoeg om niet in de vólgende toets te belanden. De grens bestaat omdat de
 *    zeef geen parser is; `expect(` in de staart breekt de zoektocht sowieso af.
 */
const STAART = 400;

/** Index van het haakje dat bij `open` hoort, of -1. */
function sluithaak(bron, open) {
  let diep = 0;
  for (let i = open; i < bron.length; i++) {
    if (bron[i] === '(') diep++;
    else if (bron[i] === ')' && --diep === 0) return i;
  }
  return -1;
}

/** Wat er na `)` volgt tot het eerste niet-witte teken — of `''`. */
function volgendTeken(bron, na) {
  const rest = /^\s*(\S)/.exec(bron.slice(na + 1));
  return rest === null ? '' : rest[1];
}

/**
 * De hulpfuncties die ruwe bestandsinhoud teruggeven.
 *
 * ⚠️ **Alleen als het lichaam níets anders doet dan teruggeven.**
 *    `schermbron()` in `aanmeldscherm.test.ts` is
 *    `return plat(readFileSync(…))` en valt er dus buiten — terecht, want die
 *    knipt. Dezelfde regel als bij een binding: gaat de waarde ergens langs, dan
 *    is dit gereedschap er klaar mee.
 */
export function ruweProducenten(schoon) {
  const uit = new Set();

  const voegToe = (naam, open) => {
    const sluit = sluithaak(schoon, open);
    if (sluit !== -1 && volgendTeken(schoon, sluit) !== '.') uit.add(naam);
  };

  // `function bron(pad) { return readFileSync(…); }`
  for (const m of schoon.matchAll(
    /function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)[^{]*\{\s*return\s+readFileSync\(/g,
  )) {
    voegToe(m[1], m.index + m[0].length - 1);
  }

  // `const lees = (pad: string) => readFileSync(pad, 'utf8');`
  for (const m of schoon.matchAll(
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\([^)]*\)\s*(?::\s*[A-Za-z_$][\w$<>[\]| ]*)?\s*=>\s*readFileSync\(/g,
  )) {
    voegToe(m[1], m.index + m[0].length - 1);
  }

  return uit;
}

/**
 * De namen die rechtstreeks een `readFileSync(…)` dragen.
 *
 * ⚠️⚠️ **"Rechtstreeks" doet al het werk.** De binding telt alleen als er tussen
 *    de `=` (of de `:`) en de `readFileSync(` niets staat, én er achter het
 *    sluithaakje geen punt komt. Zo vallen `zonderCommentaar(readFileSync(…))`
 *    en `readFileSync(…).replace(…)` er allebei buiten — de eerste omdat hij
 *    geknipt is, de tweede omdat hij dat kán zijn. Zie de randtabel in de kop:
 *    deze controle meet *of de waarde ergens langs gaat*, niet *of die knip
 *    deugt*.
 */
export function ruweNamen(bron) {
  const schoon = zonderCommentaar(bron);
  const uit = new Set();

  const voegToe = (naam, open) => {
    const sluit = sluithaak(schoon, open);
    if (sluit !== -1 && volgendTeken(schoon, sluit) !== '.') uit.add(naam);
  };

  // `const BRON = readFileSync(…)`, met een optionele typeannotatie ertussen.
  for (const m of schoon.matchAll(
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[A-Za-z_$][\w$<>[\]| ]*)?\s*=\s*readFileSync\(/g,
  )) {
    voegToe(m[1], m.index + m[0].length - 1);
  }

  // `{ pad, inhoud: readFileSync(…) }` — de vorm van een `.map()` over bestanden.
  for (const m of schoon.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*readFileSync\(/g)) {
    voegToe(m[1], m.index + m[0].length - 1);
  }

  // `const job = bron(JOB)`, waar `bron()` de ruwe inhoud teruggeeft.
  for (const producent of ruweProducenten(schoon)) {
    for (const m of schoon.matchAll(
      new RegExp(
        `(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::\\s*[A-Za-z_$][\\w$<>[\\]| ]*)?\\s*=\\s*${producent}\\(`,
        'g',
      ),
    )) {
      voegToe(m[1], m.index + m[0].length - 1);
    }
  }

  return uit;
}

/** Het onderwerp van een `expect(…)`, als losse naam — `s.inhoud` geeft `inhoud`. */
function onderwerp(argument) {
  const eerste = argument.split(',')[0].trim();
  if (!/^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*$/.test(eerste)) return null;
  const delen = eerste.split('.');
  return delen[delen.length - 1];
}

/**
 * Elke bevestigende `toContain`/`toMatch` op een ruwe naam.
 *
 * ⚠️⚠️ **Zonder regelnummer, en dat is een keuze.** De gedeelde knip gooit
 *    `//`-regels wég in plaats van ze leeg te maken, dus een index in de
 *    geknipte bron wijst naar een ándere regel in de echte. Een controle die
 *    naar de verkeerde regel wijst, leer je te negeren — dat is precies waarom
 *    `gedeelde-identiteit-controle.mjs` en `schermingang-controle.mjs` met reden
 *    hun eigen positiebehoudende knip houden. Hier is de goedkope uitweg beter
 *    dan een achttiende knip: meld het bestand en de naam, en laat de lezer één
 *    keer grepen. Een verkeerd nummer is duurder dan geen nummer.
 */
export function bevestigendeToetsen(bron) {
  const schoon = zonderCommentaar(bron);
  const ruw = ruweNamen(bron);
  const uit = [];

  for (const m of schoon.matchAll(/\bexpect\(/g)) {
    const open = m.index + m[0].length - 1;
    const sluit = sluithaak(schoon, open);
    if (sluit === -1) continue;

    const naam = onderwerp(schoon.slice(open + 1, sluit));
    if (naam === null || !ruw.has(naam)) continue;

    const staart = schoon.slice(sluit + 1, sluit + 1 + STAART).split('expect(')[0];
    const treffer = /\.(toContain|toMatch)\(/.exec(staart);
    if (treffer === null) continue;

    // ⚠️ `.not.` vóór de matcher maakt hem negatief, en een negatieve toets op
    //    ruwe bron faalt **dicht**: commentaar kan hem rood maken, nooit stil
    //    groen. Die laat deze controle met rust — zie de kop.
    if (/\.not\b/.test(staart.slice(0, treffer.index))) continue;

    uit.push({ naam, toets: treffer[1] });
  }

  return uit;
}

/**
 * De belofte-tests die met reden bevestigend op ruwe bron toetsen.
 *
 * ⚠️⚠️ **Hij is leeg, en dat is een uitkomst en geen omissie.** QS8-574 heeft
 *    alle acht de gevonden bestanden met een eigen mutatie gemeten, en **alle
 *    acht faalden open**: de belofte brak en de suite bleef groen. Er was dus
 *    geen enkele rij te verantwoorden — ze zijn alle acht gerepareerd. De tabel
 *    met de elf mutaties staat in
 *    `docs/decisions/2026-09-21-het-mechanisme-onder-de-commentaarval.md`.
 *
 * ⚠️⚠️ **Het mechanisme blijft staan omdat de negende er wél een kan
 *    verdienen.** Er is een echte vorm die dicht faalt: een toets die zoekt naar
 *    iets dat in een comment niet kán staan. 📏 Gemeten in dit issue dat die
 *    redenering **niet vanzelf klopt** — `een-profielveld-is-te-wijzigen.test.ts`
 *    betoogde in zijn eigen kop dat `display_name:\s*[A-Za-z_$]` niet in proza
 *    voorkomt, en dat was waar; wat de kop niet zag is dat een **uitgeschakelde
 *    echte regel** (`// display_name: naam,`) hem gewoon haalt. Een rij hier
 *    vraagt dus een mutatie, niet een argument.
 *
 * ⚠️ **Elke rij draagt zijn eigen gemeten reden, en dat is de eis.** Een
 *    register met ongemeten rijen is de vorm die dit project elders afwijst —
 *    zie `dml:controle`. Een rij betekent nooit "die toets is prima zo", maar:
 *    *de mutatie is gedraaid en hij faalt dicht*. Verandert de toets, dan
 *    vervalt de meting en hoort de rij opnieuw gemeten te worden.
 *
 * ⚠️ **Injecteerbaar via de derde parameter van `klachten()`**, want een leeg
 *    register is niet te ijken op de vraag of vrijstellen wérkt. De toets voedt
 *    hem een rij; zie `tests/scripts/belofteknip-controle.test.ts`.
 */
export const MET_REDEN = {};

/** Wat er mis is aan deze bron, als leesbare regels. */
export function klachten(bron, ruwPad, register = MET_REDEN) {
  const pad = metSchuineStrepen(ruwPad);
  if (register[pad] !== undefined) return [];

  const geteld = new Map();
  for (const { naam, toets } of bevestigendeToetsen(bron)) {
    const sleutel = `${naam}).${toets}`;
    geteld.set(sleutel, (geteld.get(sleutel) ?? 0) + 1);
  }

  return [...geteld].map(
    ([sleutel, aantal]) =>
      `${pad}: ${aantal}\u00d7 \`expect(${sleutel}()\` toetst ruwe bestandsinhoud — ` +
      `commentaar stelt hem tevreden. Knip met \`${GEDEELD}\` op de leesplek, ` +
      'of zet het bestand met een gemeten reden in MET_REDEN.',
  );
}

/**
 * Rijen die hun reden kwijt zijn — anders groeit het register stil door.
 *
 * ⚠️ **Twee kanten.** Een bestand dat niet meer bestaat, én een bestand dat de
 *    vorm niet meer draagt: dan stelt de rij niets meer vrij, en die leest de
 *    volgende persoon als een reden om er niet aan te twijfelen. Zelfde vorm als
 *    `verweesdeVrijstellingen()` in `knip-controle.mjs`.
 */
export function verweesdeRedenen(bronnen, register = MET_REDEN) {
  const genormaliseerd = new Map([...bronnen].map(([p, b]) => [metSchuineStrepen(p), b]));
  return Object.keys(register).filter((pad) => {
    const bron = genormaliseerd.get(pad);
    if (bron === undefined) return true;
    return bevestigendeToetsen(bron).length === 0;
  });
}

function bestanden() {
  const uit = [];
  const loop = (pad) => {
    for (const naam of readdirSync(join(WORTEL, pad))) {
      if (naam === 'node_modules' || naam.startsWith('.')) continue;
      const kind = `${pad}/${naam}`;
      if (statSync(join(WORTEL, kind)).isDirectory()) loop(kind);
      else if (/\.(ts|tsx)$/.test(naam)) uit.push(kind);
    }
  };
  loop(MAP);
  return uit;
}

export function hoofd() {
  const paden = bestanden();
  const bronnen = new Map();
  const uit = [];

  for (const pad of paden) {
    const bron = readFileSync(join(WORTEL, pad), 'utf8');
    bronnen.set(metSchuineStrepen(relative('.', pad)), bron);
    uit.push(...klachten(bron, relative('.', pad)));
  }

  const verweesd = verweesdeRedenen(bronnen);

  if (uit.length > 0 || verweesd.length > 0) {
    console.error('belofteknip-controle: een belofte-test toetst bevestigend op ruwe bron.\n');
    for (const regel of uit) console.error(`  ${regel}`);
    for (const pad of verweesd) {
      console.error(
        `  ${pad} staat in MET_REDEN maar draagt de vorm niet meer — haal de rij weg.`,
      );
    }
    console.error(
      '\n  Waarom dit een grendel is: een bevestigende `toContain` op ruwe bron is ook\n' +
        '  waar als de aanroep uitgecommentarieerd is — en bij een tijdelijke\n' +
        '  uitschakeling blijft de naam juist in de comment staan (QS8-568).',
    );
    return 1;
  }

  const lezers = [...bronnen].filter(([, bron]) => ruweNamen(bron).size > 0);
  console.log(
    `belofteknip-controle: ${paden.length} belofte-tests, ${lezers.length} met een ruwe ` +
      `bronbinding, ${Object.keys(MET_REDEN).length} met een gemeten reden bevestigend.`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
