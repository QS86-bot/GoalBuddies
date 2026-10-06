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
 *    kwetsbaarheden" eist, staat hier per definitie rood: `uuid` en
 *    `@xmldom/xmldom` hangen onder `expo` en zijn niet weg te krijgen zonder
 *    Expo te downgraden. Een controle die altijd rood staat, leer je uitzetten. Deze
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
 * ⚠️ **`reparatie: 'gratis'` bij `@xmldom/xmldom` is wat npm zégt** (`fixAvailable: true`), en niet wat er gebeurt: `npm audit fix
 *    --omit=dev --dry-run` laat de negentien regels staan, want de ouders
 *    pinnen ze. Het veld staat hier om een **verandering** te melden, niet als
 *    advies — sla het niet op als bewijs dat het te repareren is.
 *
 * 📏 Alle vier gemeten op 07-09-2026 tegen `expo-router@57.0.13`.
 */
/**
 * ⚠️ **Een rij kan wegvallen en terugkomen, en dan vragen beide richtingen een
 *    andere handeling.** `image-size` deed dat op 24-09-2026 binnen een uur:
 *    eruit toen npm hem niet meer meldde (QS8-616), terug onder nieuwe
 *    advisory-nummers (QS8-618). De metingen staan in de `reden` van die rij en
 *    niet hier, zodat er maar één plek is die bijgewerkt moet worden. Dat de
 *    melding per richting verschilt, is de les van QS8-616: zie `slotwoord()`.
 *
 * ⚠️ Dit blok zei tot QS8-622 dat `image-size` eruit wás, tien regels boven de
 *    rij die het tegendeel liet zien. De rij werd bijgewerkt en het commentaar
 *    erboven niet.
 */
export const NAGEKEKEN = {
  'image-size': {
    ernst: 'high',
    advisories: [1239765, 1239766],
    reparatie: 'gratis',
    in_bundel: false,
    marker: 'detectImageType',
    reden:
      'Zit onder `metro`, de bundler — build-tooling en geen app-code. ' +
      '⚠️⚠️ **Deze rij stond hier tot 24-09-2026, is die dag verwijderd en dezelfde dag ' +
      'teruggezet, en dat is geen slordigheid maar twee metingen.** 📏 Om ~19:10 UTC meldde ' +
      '`npm audit` hem niet meer en waren de nummers **1138808** en **1138809** weg (QS8-616). ' +
      '📏 Om ~20:11 UTC stond hij er weer, ernst `high`, met **andere** nummers: 1239765 en ' +
      '1239766. Geen flip-flop dus, maar een herpublicatie onder nieuwe ID\'s. ' +
      '⚠️ Omdat de controle dit terecht als een **nieuw** pakket ziet, is de bundel-meting ' +
      'opnieuw gedaan in plaats van overgenomen: verse `npx expo export --platform web` met ' +
      'dummy-EXPO_PUBLIC-waarden, `dist/` van 5,3 MB en twee JS-bestanden, en **nul** treffers ' +
      'op `detectImageType`. Met een controlegrep op `supabase` ernaast, want een grep die niets ' +
      'vindt kan ook een kapotte grep zijn. ' +
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
    ernst: 'high',
    advisories: [
      1158517, 1158518, 1193671, 1193695, 1193696, 1193697, 1193699, 1193700, 1193701, 1193702,
      1193704, 1193705, 1193707, 1193708, 1193709, 1193711, 1193712, 1193714, 1193715,
    ],
    reparatie: 'gratis',
    in_bundel: false,
    marker: 'Only one doctype is allowed',
    reden:
      '⚠️ Vals alarm van dezelfde soort als `imageSize`: `XML/1998/namespace` staat drie keer ' +
      'in dist/, maar dat is React DOM (`xmlLang`, `xmlSpace`, `xmlBase`). Alle drie de ' +
      'xmldom-eigen foutteksten geven nul. ' +
      '⚠️ **Hermeten op 08-09-2026**, en die dag kwamen er in één keer zeventien advisories ' +
      'bij: van twee naar negentien, ernst van moderate naar high. Allemaal parse- en ' +
      'serialisatiefouten in xmldom zelf — ReDoS, kwadratisch geheugen, en een reeks ' +
      '`requireWellFormed`-omzeilingen. 📏 Verse `npm run build` met dummy-EXPO_PUBLIC-waarden, ' +
      'daarna gegrept op zes xmldom-eigen stringliteralen plus de pakketnaam: allemaal nul ' +
      'treffers in dist/. Het pakket komt de bundel niet in, dus geen van de zeventien ' +
      'verandert iets aan de weging — alleen aan wat hier geregistreerd staat. ' +
      '⚠️ De lijst groeide tússen de lokale poort en CI door, dus een rode CI op nóg een ' +
      'nummer is hier geen nieuwe bevinding maar dezelfde: hermeet de bundel en pin opnieuw.',
  },
  'js-yaml': {
    ernst: 'high',
    advisories: [1193727],
    reparatie: 'gratis',
    in_bundel: false,
    marker: 'maxTotalMergeKeys',
    reden:
      'Nieuw op 09-09-2026: GHSA voor `maxTotalMergeKeys`, dat de CPU niet begrenst bij lege ' +
      'merge-bronnen — een DoS op wie er onvertrouwde YAML mee parseert. 📏 Dit project parseert ' +
      'geen YAML: `npm ls` zet hem onder `expo > @expo/cli > @expo/xcpretty`, de opmaak van ' +
      'Xcode-uitvoer, dus bouw-tooling en geen app-code. Verse `npm run build` met dummy-' +
      'EXPO_PUBLIC-waarden en gegrept op drie js-yaml-eigen foutteksten plus de pakketnaam: ' +
      'nul treffers in dist/. Zelfde klasse als `uuid`: bouw-tooling, geen app-code.',
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
  'brace-expansion': {
    ernst: 'high',
    advisories: [1240103, 1240107, 1240111],
    reparatie: 'gratis',
    in_bundel: false,
    marker: '^[a-zA-Z]\\.\\.[a-zA-Z](?:\\.\\.-?\\d+)?$',
    reden:
      'Nieuw op 05-10-2026 (QS8-625): drie DoS-varianten op brace-expansie van onvertrouwde ' +
      'patronen. 📏 `npm ls` zet hem onder `expo > @expo/fingerprint > minimatch@10.2.6` — de ' +
      'vingerafdruk van een native bouw, dus bouw-tooling en geen app-code. Verse `npx expo ' +
      'export --platform web` met dummy-EXPO_PUBLIC-waarden, dist/ van 5,3 MB met twee ' +
      'JS-bestanden: **nul** treffers op de marker, met een controlegrep op `supabase` ernaast. ' +
      '⚠️ De marker is de regex-letterlijke voor een lettersequentie en geen tekst: het pakket ' +
      'heeft geen foutmeldingen, en `PERIOD`/`SLASH` komen ook in `picomatch` en `fbjs` voor. ' +
      '📏 Dat een regex-letterlijke de minificatie overleeft is gemeten en niet aangenomen: ' +
      "`/[!'()*]/g` uit `strict-uri-encode` (via `query-string`) staat letterlijk in dist/. " +
      '⚠️ **`reparatie: gratis` is hier wél waar**, anders dan bij `@xmldom/xmldom`: 📏 ' +
      '`minimatch@10.2.6` vraagt `^5.0.8`, en `npm audit fix --omit=dev --dry-run` zet hem binnen ' +
      'dat bereik van 5.0.9 naar 5.0.12. Bewust niet in QS8-625 gedaan — dat issue raakt de ' +
      'lockfile niet — en de controle meldt het zodra de reparatie verandert of de rij wegvalt.',
  },
  braces: {
    ernst: 'high',
    advisories: [1240992],
    reparatie: 'brekend',
    in_bundel: false,
    marker: 'expanded array length exceeds range limit',
    reden:
      'Nieuw op 05-10-2026 (QS8-625): stack-uitputting op diep geneste patronen. 📏 `npm ls` zet ' +
      'hem onder `expo > @expo/cli > @expo/metro-file-map > micromatch@4.0.8` — het ' +
      'bestandsoverzicht van de bundler. Zelfde verse bouw als `brace-expansion`: **nul** ' +
      'treffers op de foutmelding uit `braces/lib/expand.js`. npm biedt alleen `expo@44.0.6` als ' +
      'reparatie, een downgrade van dertien majors, en dat is geen reparatie.',
  },
  'node-forge': {
    ernst: 'high',
    advisories: [1240912],
    reparatie: 'brekend',
    in_bundel: false,
    marker: 'Too few bytes to read ASN.1',
    reden:
      'Nieuw op 05-10-2026 (QS8-625): RSA PKCS#1 v1.5-handtekeningverificatie accepteert extra ' +
      'geneste DigestAlgorithm-elementen. 📏 `npm ls` zet hem onder `expo > @expo/cli` en ' +
      '`@expo/code-signing-certificates` — het ondertekenen van updates door de CLI. Zelfde verse ' +
      'bouw: **nul** treffers op de foutmelding uit `node-forge/lib/asn1.js`. ⚠️ Dit is de enige ' +
      'van de drie die over vertrouwen gaat en niet over beschikbaarheid: hij telt zodra de app of ' +
      'een edge-functie een handtekening verifieert met deze bibliotheek. 📏 Vandaag doet niets ' +
      'in `src/`, `app/` of `supabase/functions/` dat — geen import van `node-forge`.',
  },
  compression: {
    ernst: 'high',
    advisories: [1241221],
    reparatie: 'gratis',
    in_bundel: false,
    marker: 'size below threshold',
    reden:
      'Nieuw op 06-10-2026 (QS8-648): DoS via een geheugenlek bij een voortijdig gesloten ' +
      'respons (`<1.8.2`). 📏 `npm ls` zet hem onder `expo > @expo/cli > compression@1.8.1` — ' +
      'de dev-server van de CLI, dus bouw-tooling en geen app-code. Verse `npx expo export ' +
      '--platform web` met dummy-EXPO_PUBLIC-waarden, dist/ van 5,3 MB met twee JS-bestanden: ' +
      '**nul** treffers op de debugtekst uit `compression/index.js`, tegen 51 op de controlegrep ' +
      '`supabase`. Niets in `src/`, `app/` of `supabase/functions/` importeert hem. ⚠️ ' +
      '**`reparatie: gratis` is binnen het bereik waar, maar niet klein**: 📏 `@expo/cli` vraagt ' +
      '`^1.7.4` en 1.8.2 bestaat, maar `npm audit fix --omit=dev --dry-run` doet 196 wijzigingen, ' +
      'waaronder `expo` 57.0.13 → 57.0.26. Bewust niet in QS8-648 gedaan — dat issue raakt de ' +
      'lockfile niet.',
  },
  'source-map-js': {
    ernst: 'high',
    advisories: [1241209],
    reparatie: 'gratis',
    in_bundel: false,
    marker: 'Subclasses must implement _parseMappings',
    reden:
      'Nieuw op 06-10-2026 (QS8-648): event-loop-DoS via de sectie-offsets van een ' +
      'geïndexeerde source map (`1.0.0 – 1.2.1`). 📏 `npm ls` zet hem onder `expo > ' +
      '@expo/metro-config > postcss > source-map-js@1.2.1` — de CSS-verwerking van de bundler. ' +
      'Zelfde verse bouw als `compression`: **nul** treffers op de foutmelding uit ' +
      '`source-map-js/lib/source-map-consumer.js`. ⚠️ Die tekst staat ook in het `source-map`-pakket ' +
      'waar `source-map-js` een fork van is; bij nul treffers maakt dat niet uit, bij een treffer ' +
      'wel — dan is de marker niet genoeg om te zeggen wélk pakket in de bundel zit. 📏 `postcss` ' +
      'vraagt `^1.2.1` en 1.2.2 bestaat; dezelfde dry-run als bij `compression` neemt hem mee.',
  },
};

/**
 * Wat voor reparatie `npm audit` zegt te kennen.
 *
 * ⚠️ **Een boolean is hier te grof, en dat is gemeten.** `fixAvailable` heeft
 *    vandaag twee vormen tegelijk in dit project: `true` bij `@xmldom/xmldom`,
 *    en een object met `isSemVerMajor: true` bij `decode-uri-component` en
 *    `uuid`. `Boolean()` maakt die drie gelijk,
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
  slotwoord({ meetbaar: nieuw.length > 0 || anders.length > 0, verdwenen: verdwenen.length > 0 });
  return 1;
}

/**
 * Wat je moet doen, per richting waarin de verzameling veranderde.
 *
 * ⚠️⚠️ **Eén slotzin voor beide richtingen was fout, en dat is de bevinding van
 *    QS8-616.** De tekst was geschreven voor *er komt er een bij*: ga bouwen en
 *    grep in `dist/`. Voor een pakket dat **verdwenen** is, klopt dat niet — er
 *    is geen kwetsbaarheid meer om een bundel-meting over te doen. Wie dat advies
 *    tóch opvolgt, bouwt tien minuten en concludeert dan dat de controle onzin
 *    gaf.
 *
 * ⚠️ **En dat is duurder dan een controle die zwijgt.** Een grendel die je naar
 *    de verkeerde handeling stuurt, verliest zijn gezag — precies de reden dat
 *    dit project geen controles wil die je leert overslaan.
 */
export function slotwoord({ meetbaar, verdwenen }) {
  if (meetbaar) {
    console.error(
      '\nEr is een pakket bijgekomen of veranderd, en dat betekent dat de bouw-meting\n' +
        'verlopen is — niet dat het register bijgewerkt moet worden. Draai\n' +
        '`npm run build` met dummy-`EXPO_PUBLIC_*` waarden en grep in dist/ op een\n' +
        '**stringliteraal** uit het pakket — niet op de pakketnaam en niet op een\n' +
        'identifier: die eerste staat er nooit in en die tweede wordt geminificeerd.\n' +
        'Zet daarna de uitkomst mét die marker in NAGEKEKEN.',
    );
  }

  if (verdwenen) {
    console.error(
      '\nEr staat een rij in NAGEKEKEN waarvoor npm geen melding meer geeft. Hier valt\n' +
        'niets te bouwen: er is geen kwetsbaarheid meer om een bundel-meting over te\n' +
        'doen. Die rij mag eruit — maar meet het in plaats van het aan te nemen.\n' +
        'Draai `npm audit --omit=dev --json` en kijk of de advisory-nummers uit die rij\n' +
        'er echt niet meer in staan; een pakket dat alleen van naam of van ouder\n' +
        'wisselde, hoort een rij te houden. Zet de datum en die nummers in het\n' +
        'commit-bericht, zodat de volgende lezer ziet waaróp hij weg is.',
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
