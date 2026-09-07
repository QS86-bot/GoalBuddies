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
 *
 *    ⚠️⚠️ **En dat werkte in de eerste versie niet, want het faalpad was nooit
 *    geijkt.** Een onbereikbaar register geeft géén kapotte uitvoer maar
 *    gewoon geldige JSON — `{"message":"request to … failed, reason: connect
 *    ECONNREFUSED","error":{…}}` — zonder `vulnerabilities`-sleutel.
 *    `JSON.parse` slaagde dus, de catch werd nooit bereikt, en de controle
 *    meldde alle vier de bekende wortels als **verdwenen**: vier regels die de
 *    lezer uitnodigen het register leeg te maken. Een mislukking die zich
 *    voordoet als een uitspraak — precies de klasse uit QS8-268. Daarom is de
 *    vorm van het rapport nu een eigen grendel, en is `hoofd()` geëxporteerd
 *    zodat die grendel te voeden is.
 *
 * ⚠️ **Het register bewaart advisory-nummers en niet alleen een ernst.** Een
 *    naam plus het zwaarste label is te weinig: krijgt een bekend pakket er
 *    een advisory bíj van gelijke zwaarte, dan verandert er aan naam noch
 *    ernst iets en blijft de controle groen — terwijl de `reden` in het
 *    register een gebeurtenis afweegt die niet meer dezelfde is. Dat is geen
 *    randgeval: twee van de vier huidige wortels dragen vandaag al twee
 *    advisories. De verzameling die telt is de verzameling **advisories**.
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
 * `advisories` en `reparatie` zijn de twee velden die zeggen of die meting nog
 * over dezelfde gebeurtenis gaat. `advisories` zijn de `source`-nummers uit
 * `npm audit`; `reparatie` is `geen`, `brekend` of `gratis`.
 *
 * ⚠️ **`reparatie: 'gratis'` bij `image-size` en `@xmldom/xmldom` is wat npm
 *    zégt** (`fixAvailable: true`), en niet wat er gebeurt: `npm audit fix
 *    --omit=dev --dry-run` laat de negentien regels staan, want de ouders
 *    pinnen ze. Het veld staat hier om een **verandering** te melden, niet als
 *    advies — sla het niet op als bewijs dat het te repareren is.
 *
 * 📏 Alle vier gemeten op 07-09-2026 tegen `expo-router@57.0.13`.
 */
export const NAGEKEKEN = {
  'image-size': {
    ernst: 'high',
    advisories: [1138808, 1138809],
    reparatie: 'gratis',
    in_bundel: false,
    marker: 'detectImageType',
    reden:
      'Zit onder `metro`, de bundler — build-tooling en geen app-code. Nul treffers in dist/. ' +
      '⚠️ De treffer op `imageSize` die je wél vindt is React DOM\'s `imageSizes`/`imageSrcSet`.',
  },
  uuid: {
    ernst: 'moderate',
    advisories: [1119441],
    reparatie: 'brekend',
    in_bundel: false,
    marker: 'stringify.unsafe',
    reden:
      'Zit onder `xcode` via `@expo/config-plugins` — prebuild-tooling. De uuid-code die wél ' +
      'in de bundel staat is Expo\'s eigen implementatie (`expo-modules-core/src/uuid/`).',
  },
  '@xmldom/xmldom': {
    ernst: 'moderate',
    advisories: [1158517, 1158518],
    reparatie: 'gratis',
    in_bundel: false,
    marker: 'Only one doctype is allowed',
    reden:
      '⚠️ Vals alarm van dezelfde soort als `imageSize`: `XML/1998/namespace` staat drie keer ' +
      'in dist/, maar dat is React DOM (`xmlLang`, `xmlSpace`, `xmlBase`). Alle drie de ' +
      'xmldom-eigen foutteksten geven nul.',
  },
  'decode-uri-component': {
    ernst: 'moderate',
    advisories: [1147955],
    reparatie: 'brekend',
    in_bundel: true,
    marker: '(%[a-f0-9]{2})|([^%]+?)',
    reden:
      '⚠️⚠️ **Deze zit er wél in**, via `query-string@7.1.3` via `expo-router`. Letterlijk in ' +
      'dist/: `new RegExp("(%[a-f0-9]{2})|([^%]+?)",\'gi\')`. GHSA-vcc3-ghjq-m6fr — DoS door ' +
      'exponentieel decoderen van misvormde percent-encoding. Bereik: een bezoeker die een ' +
      'geprepareerde link opent, laat zijn eigen tab hangen. Niet te repareren met een ' +
      'override op `decode-uri-component` zelf: 0.4.1 en 0.5.0 zijn allebei ' +
      '`"type": "module"` zónder `main`, dus dat breekt het CJS-`require` in ' +
      '`query-string@7.1.3`. Een override op `query-string` kan ook niet: gefixt vanaf 9.5, ' +
      'en 8.x is ESM-only, wat onder Metro een ander en groter risico is dan deze DoS. ' +
      '📏 Beide takken nagemeten op 07-09-2026 met `npm view`.',
  },
};

/**
 * Wat voor reparatie `npm audit` zegt te kennen.
 *
 * ⚠️ **Een boolean is hier te grof, en dat is gemeten.** `fixAvailable` heeft
 *    vandaag drie vormen tegelijk in dit project: `true` bij `image-size` en
 *    `@xmldom/xmldom`, en een object met `isSemVerMajor: true` bij
 *    `decode-uri-component` en `uuid`. `Boolean()` maakt die vier gelijk,
 *    terwijl het verschil precies is wat de dossierrij als voorwaarde noemt:
 *    *"zodra `expo-router` een `query-string` ≥9.5 meeneemt, is de override
 *    gratis"*. Dat moment is de overgang `brekend` → `gratis`, niet de
 *    overgang `geen` → `wel`.
 */
export function reparatieSoort(fixAvailable) {
  if (!fixAvailable) return 'geen';
  if (typeof fixAvailable === 'object' && fixAvailable.isSemVerMajor) return 'brekend';
  return 'gratis';
}

/**
 * De wortels uit een `npm audit --json`: de pakketten met een echte advisory.
 *
 * ⚠️ **Alleen de wortels en niet de hele lijst.** `npm audit` meldt ook elk
 *    pakket dat er transitief boven hangt — vandaag 19 regels voor 4 echte
 *    kwetsbaarheden. Zou dit register die 19 dragen, dan verandert hij bij elke
 *    Expo-patch zonder dat er iets nieuws is, en dan is hij ruis.
 */
export function wortelsUit(rapport) {
  // ⚠️ `Object.create(null)` en niet `{}`: een pakket dat `__proto__` heet,
  //    wordt door een object-literal stilzwijgend verzwolgen — gemeten, en de
  //    controle bleef er groen bij. De invoer komt van buiten deze repo.
  const uit = Object.create(null);
  for (const [naam, v] of Object.entries(rapport?.vulnerabilities ?? {})) {
    const eigen = (v.via ?? []).filter((x) => typeof x === 'object' && x !== null);
    if (eigen.length === 0) continue;
    uit[naam] = {
      ernst: v.severity,
      // ⚠️ Gesorteerd op nummer, zodat de volgorde waarin npm ze meldt geen
      //    verschil kan maken. Dít is wat een verandering zichtbaar maakt.
      advisories: eigen.map((x) => x.source).sort((a, b) => a - b),
      reparatie: reparatieSoort(v.fixAvailable),
    };
  }
  return uit;
}

/**
 * Wat er veranderd is ten opzichte van het register.
 *
 * ⚠️ Drie dingen kunnen verlopen en alle drie worden ze gemeld: de ernst, de
 *    verzameling advisories, en of er een reparatie bereikbaar is. Alleen de
 *    eerste stond er in de eerste versie, en dat was de dunste van de drie.
 *
 * @param {Record<string, {ernst: string, advisories: number[], reparatie: string}>} gemeten uit `wortelsUit()`
 * @param {Record<string, {ernst: string, advisories: number[], reparatie: string, in_bundel: boolean, marker: string, reden: string}>} register
 */
export function verschil(gemeten, register = NAGEKEKEN) {
  const nieuw = [];
  const anders = [];
  const verdwenen = [];
  for (const [naam, meting] of Object.entries(gemeten)) {
    // ⚠️ `Object.hasOwn` en niet `register[naam] === undefined`: anders vindt
    //    een wortel die `toString` heet een geërfde methode en heet hij bekend.
    if (!Object.hasOwn(register, naam)) {
      nieuw.push({ naam, ernst: meting.ernst });
      continue;
    }
    const bekend = register[naam];
    const redenen = [];
    if (bekend.ernst !== meting.ernst) redenen.push(`ernst ${bekend.ernst} → ${meting.ernst}`);
    const was = [...(bekend.advisories ?? [])].sort((a, b) => a - b).join(',');
    const is = meting.advisories.join(',');
    if (was !== is) redenen.push(`advisories ${was || '—'} → ${is || '—'}`);
    if (bekend.reparatie !== meting.reparatie) {
      redenen.push(`reparatie ${bekend.reparatie ?? '—'} → ${meting.reparatie}`);
    }
    if (redenen.length) anders.push({ naam, redenen });
  }
  for (const naam of Object.keys(register)) {
    if (!Object.hasOwn(gemeten, naam)) verdwenen.push(naam);
  }
  return { nieuw, anders, verdwenen };
}

/**
 * Is dit een rapport waar iets uit te lezen valt?
 *
 * ⚠️ **Dit is een eigen grendel en geen detail.** Een onbereikbaar npm-register
 *    geeft geldige JSON zonder `vulnerabilities`; zonder deze toets is dat niet
 *    te onderscheiden van "er zijn geen kwetsbaarheden meer".
 */
export function isBruikbaarRapport(rapport) {
  return (
    typeof rapport === 'object' &&
    rapport !== null &&
    typeof rapport.vulnerabilities === 'object' &&
    rapport.vulnerabilities !== null
  );
}

function leesAudit() {
  try {
    const uit = execFileSync('npm', ['audit', '--omit=dev', '--json'], {
      cwd: WORTEL,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      // ⚠️ **`shell` op Windows, en alleen daar.** `npm` is er een `.cmd`-shim,
      //    en Node ≥20 weigert die zonder shell sinds de mitigatie van
      //    CVE-2024-27980. Zonder dit valt de controle daar in de
      //    OVERGESLAGEN-tak en meet hij structureel niets op de énige machine
      //    waar hij vandaag met de hand gedraaid wordt. De argumenten zijn drie
      //    constanten zonder spatie of metateken, dus er is niets in te
      //    injecteren — en de Windows-job in CI draait hem, zodat die zin
      //    gemeten is en niet beredeneerd.
      shell: process.platform === 'win32',
      // ⚠️ Coderegel 14: elke externe call heeft een timeout. npm's eigen
      //    `fetch-timeout` staat op vijf minuten met twee pogingen, dus een
      //    register dat de verbinding openhoudt in plaats van te weigeren,
      //    hangt anders de hele poort op. `maxBuffer` erbij omdat een
      //    afgekapte stdout stil is: het rapport is vandaag ~12 KB.
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return JSON.parse(uit);
  } catch (fout) {
    // ⚠️ `npm audit` geeft exitcode 1 zodra er íets gevonden is — dat is hier de
    //    normale toestand en geen mislukking. De uitvoer staat dan gewoon op
    //    stdout. Alleen als er geen JSON uitkomt, is er echt niets gemeten.
    try {
      return JSON.parse(String(fout?.stdout ?? ''));
    } catch {
      return { message: String(fout?.message ?? 'onbekend') };
    }
  }
}

export function hoofd(leesRapport = leesAudit) {
  const rapport = leesRapport();

  if (!isBruikbaarRapport(rapport)) {
    console.error(
      '⚠ audit-controle: OVERGESLAGEN — `npm audit` gaf geen rapport met `vulnerabilities`.\n' +
        `  Reden van npm: ${rapport?.message ?? 'onbekend'}\n` +
        '  Deze controle heeft het register van npm nodig; zonder netwerk kan hij niets\n' +
        '  meten. Dat is geen groene uitslag maar een ongemeten — en het is nadrukkelijk\n' +
        '  géén reden om NAGEKEKEN leeg te maken.',
    );
    return 1;
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
  for (const { naam, redenen } of anders) {
    console.error(`✗ '${naam}' is veranderd sinds hij nagekeken werd: ${redenen.join('; ')}.`);
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
