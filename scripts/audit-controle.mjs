#!/usr/bin/env node
/**
 * audit-controle — welke kwetsbare pakketten er in de productieboom zitten, en
 * of dat nog steeds de verzameling is die iemand met een bóuw heeft nagekeken.
 * QS8-191.
 *
 * ⚠️ **Waarom dit bestaat.** De dossierrij van 15-08 sloot af met *"opnieuw
 *    controleren bij elke SDK-upgrade — en dan opnieuw door te bouwen, niet
 *    door te lezen"*. Dat is een handeling die je moet ónthouden, en die is op
 *    07-09-2026 aantoonbaar niet gebeurd: de rij noemde **15** meldingen met
 *    twee wortels, en er stonden er **19** met **vier**. Twee wortels waren er
 *    stil bij gekomen.
 *
 * ⚠️⚠️ **En dat was niet vrijblijvend.** Eén van die twee, `decode-uri-component`,
 *    zit wél in de gebouwde webbundel — via `query-string` via `expo-router`.
 *    De rij concludeerde "geen ervan zit in de bundel", en dat klopte niet meer.
 *
 * ⚠️ **Waarom een register en geen drempel.** Een controle die "nul
 *    kwetsbaarheden" eist, staat hier per definitie rood: `image-size` en
 *    `uuid` hangen onder `expo` en zijn niet weg te krijgen zonder Expo te
 *    downgraden. Een controle die altijd rood staat, leer je uitzetten. Deze
 *    meldt daarom alleen **verandering** ten opzichte van wat er nagekeken is —
 *    dezelfde vorm als `GEDEELDE_WAARDEN` in `dode-keten-controle`.
 *
 * ⚠️ **Wat hij níet kan.** Hij zegt niet of iets in de bundel zit; dat kan
 *    alleen door te bouwen, en dat is precies de meting die het register
 *    vastlegt. Hij zegt: *de verzameling is veranderd, dus die meting is
 *    verlopen*. Het antwoord op een rode uitslag is `npm run build` plus een
 *    grep op de string-markers uit het register — niet het register bijwerken.
 *
 * ⚠️ **Zonder netwerk slaat hij zichzelf over — zichtbaar.** `npm audit` heeft
 *    het register van npm nodig. Zelfde afspraak als `functies:controle`: de
 *    melding gaat naar stderr met `OVERGESLAGEN` erin, want op stdout leest
 *    "overgeslagen" als "gelukt".
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/**
 * De kwetsbare pakketten die met een **bouw** zijn nagekeken, met de uitkomst.
 *
 * `in_bundel` is gemeten door `npm run build` te draaien en in `dist/` te
 * grepen op een **stringliteraal** uit het pakket — nooit op een
 * identifier, want die worden geminificeerd, en nooit op de pakketnaam, want
 * die staat er niet in.
 *
 * 📏 Alle vier gemeten op 07-09-2026 tegen `expo-router@57.0.13`.
 */
export const NAGEKEKEN = {
  'image-size': {
    ernst: 'high',
    in_bundel: false,
    marker: 'detectImageType',
    reden:
      'Zit onder `metro`, de bundler — build-tooling en geen app-code. Nul treffers in dist/. ' +
      '⚠️ De treffer op `imageSize` die je wél vindt is React DOM\'s `imageSizes`/`imageSrcSet`.',
  },
  uuid: {
    ernst: 'moderate',
    in_bundel: false,
    marker: 'stringify.unsafe',
    reden:
      'Zit onder `xcode` via `@expo/config-plugins` — prebuild-tooling. De uuid-code die wél ' +
      'in de bundel staat is Expo\'s eigen implementatie (`expo-modules-core/src/uuid/`).',
  },
  '@xmldom/xmldom': {
    ernst: 'moderate',
    in_bundel: false,
    marker: 'Only one doctype is allowed',
    reden:
      '⚠️ Vals alarm van dezelfde soort als `imageSize`: `XML/1998/namespace` staat drie keer ' +
      'in dist/, maar dat is React DOM (`xmlLang`, `xmlSpace`, `xmlBase`). Alle drie de ' +
      'xmldom-eigen foutteksten geven nul.',
  },
  'decode-uri-component': {
    ernst: 'moderate',
    in_bundel: true,
    marker: '(%[a-f0-9]{2})|([^%]+?)',
    reden:
      '⚠️⚠️ **Deze zit er wél in**, via `query-string@7.1.3` via `expo-router`. Letterlijk in ' +
      'dist/: `new RegExp("(%[a-f0-9]{2})|([^%]+?)",\'gi\')`. GHSA-vcc3-ghjq-m6fr — DoS door ' +
      'exponentieel decoderen van misvormde percent-encoding. Bereik: een bezoeker die een ' +
      'geprepareerde link opent, laat zijn eigen tab hangen. Niet te repareren met een ' +
      'override: gefixt vanaf `query-string@9.5`, en 8.x is ESM-only, wat onder Metro een ' +
      'ander en groter risico is dan deze DoS.',
  },
};

/**
 * De wortels uit een `npm audit --json`: de pakketten met een echte advisory.
 *
 * ⚠️ **Alleen de wortels en niet de hele lijst.** `npm audit` meldt ook elk
 *    pakket dat er transitief boven hangt — vandaag 19 regels voor 4 echte
 *    kwetsbaarheden. Zou dit register die 19 dragen, dan verandert hij bij elke
 *    Expo-patch zonder dat er iets nieuws is, en dan is hij ruis.
 */
export function wortelsUit(rapport) {
  const uit = {};
  for (const [naam, v] of Object.entries(rapport?.vulnerabilities ?? {})) {
    const eigen = (v.via ?? []).some((x) => typeof x === 'object' && x !== null);
    if (eigen) uit[naam] = v.severity;
  }
  return uit;
}

/**
 * Wat er veranderd is ten opzichte van het register.
 *
 * @param {Record<string, string>} gemeten wortel -> ernst, uit `wortelsUit()`
 * @param {Record<string, {ernst: string, in_bundel: boolean, marker: string, reden: string}>} register
 */
export function verschil(gemeten, register = NAGEKEKEN) {
  const nieuw = [];
  const anders = [];
  const verdwenen = [];
  for (const [naam, ernst] of Object.entries(gemeten)) {
    const bekend = register[naam];
    if (bekend === undefined) nieuw.push({ naam, ernst });
    else if (bekend.ernst !== ernst) anders.push({ naam, ernst, was: bekend.ernst });
  }
  for (const naam of Object.keys(register)) {
    if (!(naam in gemeten)) verdwenen.push(naam);
  }
  return { nieuw, anders, verdwenen };
}

function hoofd() {
  let rapport;
  try {
    const uit = execFileSync('npm', ['audit', '--omit=dev', '--json'], {
      cwd: WORTEL,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    rapport = JSON.parse(uit);
  } catch (fout) {
    // ⚠️ `npm audit` geeft exitcode 1 zodra er íets gevonden is — dat is hier de
    //    normale toestand en geen mislukking. De uitvoer staat dan gewoon op
    //    stdout. Alleen als er geen JSON uitkomt, is er echt niets gemeten.
    const tekst = String(fout?.stdout ?? '');
    try {
      rapport = JSON.parse(tekst);
    } catch {
      console.error(
        '⚠ audit-controle: OVERGESLAGEN — `npm audit` gaf geen bruikbare JSON.\n' +
          '  Deze controle heeft het register van npm nodig; zonder netwerk kan hij niets\n' +
          '  meten. Dat is geen groene uitslag maar een ongemeten.',
      );
      return 1;
    }
  }

  const gemeten = wortelsUit(rapport);
  const { nieuw, anders, verdwenen } = verschil(gemeten);

  if (nieuw.length === 0 && anders.length === 0 && verdwenen.length === 0) {
    const inBundel = Object.entries(NAGEKEKEN).filter(([, v]) => v.in_bundel).length;
    console.log(
      `audit-controle: ${Object.keys(gemeten).length} kwetsbare wortels, allemaal nagekeken ` +
        `met een bouw — ${inBundel} daarvan zit in de webbundel.`,
    );
    return 0;
  }

  for (const { naam, ernst } of nieuw) {
    console.error(`✗ '${naam}' (${ernst}) is nieuw en staat niet in NAGEKEKEN.`);
  }
  for (const { naam, ernst, was } of anders) {
    console.error(`✗ '${naam}' is nu ${ernst} en was ${was} toen hij nagekeken werd.`);
  }
  for (const naam of verdwenen) {
    console.error(`✗ NAGEKEKEN noemt '${naam}', maar npm audit meldt hem niet meer.`);
  }
  console.error(
    '\nEen verandering hier betekent dat de bouw-meting verlopen is, niet dat het\n' +
      'register bijgewerkt moet worden. Draai `npm run build` met dummy-`EXPO_PUBLIC_*`\n' +
      'waarden en grep in dist/ op een **stringliteraal** uit het pakket — niet op de\n' +
      'pakketnaam en niet op een identifier: die eerste staat er nooit in en die tweede\n' +
      'wordt geminificeerd. Zet daarna de uitkomst mét die marker in NAGEKEKEN.',
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
