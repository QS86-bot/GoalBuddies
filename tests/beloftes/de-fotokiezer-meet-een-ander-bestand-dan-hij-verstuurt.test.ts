/**
 * De belofte: **`kiesFoto()` zet geen grootte-poort op `fileSize`, omdat dat
 * getal een ánder bestand beschrijft dan de bytes die de app verstuurt** —
 * QS8-436.
 *
 * ⚠️⚠️ **Waarom dit een toets is en geen alinea.** QS8-431 zette een poort vóór
 *    het lezen in `kiesDocument()`, en criterium 5 daarvan vroeg of `kiesFoto()`
 *    dezelfde behandeling moest krijgen. Het antwoord is nee, en het rust op een
 *    meting in de **native bron van `expo-image-picker`** — precies het soort
 *    feit dat stilletjes onwaar wordt bij een upgrade. Een alinea in een kop
 *    verandert dan niet mee; deze toets wordt rood.
 *
 * 📏 **De meting, gelezen in de meegeleverde bron van 57.0.14 (21-09-2026).**
 *
 *    | platform / formaat | wat `fileSize` beschrijft |
 *    |---|---|
 *    | **Android, altijd** | de **originele** grootte |
 *    | iOS, JPEG | de **verwerkte** grootte |
 *    | iOS, HEIC / TIFF / AVIF / WEBP / BMP | de **originele** grootte |
 *    | iOS, PNG | opnieuw gecodeerd — kan **groter** zijn dan het origineel |
 *
 *    - **Android** `MediaHandler.kt:73` — `fileSize = fileData?.fileSize ?:
 *      outputFile.length()`. Die `fileData` komt uit `getAdditionalFileData(
 *      sourceUri)`, dat `OpenableColumns.SIZE` opvraagt op de **bron**-URI; de
 *      gecomprimeerde `outputFile.length()` is alleen de terugval.
 *    - **iOS** `ImageUtils.swift:147` — `case UTType.heic.identifier: return
 *      (rawData, ".heic")`. Voor HEIC (en TIFF, AVIF, WEBP, BMP) gaan de
 *      **originele** bytes naar schijf en `quality` doet niets; alleen de
 *      `default`-tak hercodeert naar JPEG.
 *    - **En de bytes die wíj versturen zijn iets anders**: `kiesFoto()` leest
 *      `base64`, en die maakt `MediaHandler.swift` altíjd via
 *      `readJpegBase64From(…)` — de bron zet er zelf een comment bij (*"Always
 *      export base64 as JPEG"*). Op Android komt `base64` uit de
 *      `CompressionImageExporter`.
 *
 * ⚠️⚠️ **Dat is een sterkere reden dan "het getal klopt soms niet".** Bij een
 *    HEIC van 3 MB is `fileSize` 3 MB terwijl de app een JPEG van een paar
 *    honderd kB verstuurt. Een poort op `fileSize` zou een foto weigeren die
 *    ruim binnen de emmergrens van 1 MB valt — een regressie voor de gewone
 *    gebruiker, niet een bescherming. Dat is geval 3 uit QS8-436.
 *
 * ⚠️ **Wat hier géén meting is, en dat hoort erbij.** De bron zegt wat de code
 *    doet; hij zegt niet wat iOS op runtime als eerste in
 *    `itemProvider.registeredTypeIdentifiers` zet, en dáár hangt van af of een
 *    iPhone-foto in de HEIC-tak of in de JPEG-tak valt. Voor deze conclusie
 *    maakt het niet uit: Android is op zichzelf al beslissend, en de
 *    iOS-JPEG-tak meet nog steeds een ánder bestand dan `base64`.
 *
 * IJKING — met de hand gedraaid op 21-09-2026, één mutatie per grendel, met
 * vooraf gemeten 5 groen:
 *
 *   | # | Mutatie | Wat er rood werd |
 *   |---|---|---|
 *   | A | `fileSize` uitlezen in `kiesFoto()` | 1 — de bronzeef |
 *   | B | de Android-regel in de pin naar `outputFile.length()` | 1 |
 *   | C | de iOS-heic-tak uit de pin | 1 |
 *   | D | `readJpegBase64From` uit de pin | 1 |
 *   | E | de majorversie in de pin op 56 | 1 |
 *
 * ⚠️ B t/m E muteren de bron in `node_modules`, en dat is hier de juiste plek om
 *    te breken: de belofte is *"die bron leest nog zoals hij gemeten is"*, en die
 *    breek je niet door de toets te veranderen. Alle vier de bestanden zijn erna
 *    woordelijk teruggezet en met `diff` vergeleken.
 *
 * De afweging staat in
 * `docs/decisions/2026-09-21-de-poort-die-er-met-reden-niet-staat.md`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';

const WORTEL = join(__dirname, '..', '..');
const PAKKET = join(WORTEL, 'node_modules', 'expo-image-picker');

/**
 * De major waarvan de bron gelezen is.
 *
 * ⚠️ Niet de volledige versie: een patch verandert deze takken niet, en een pin
 *    die bij élke patch rood wordt, leer je bij te werken zonder te lezen.
 */
const GELEZEN_MAJOR = 57;

function bron(pad: string): string {
  return readFileSync(join(PAKKET, pad), 'utf8');
}

/**
 * Dezelfde bron, maar zonder commentaar — QS8-579.
 *
 * ⚠️⚠️ **Een pin op andermans bron heeft precies dezelfde zwakte als een pin op
 *    de onze.** `expect(kt).toContain('fileSize = …')` is ook waar als upstream
 *    die regel uitcommentarieert, en dan blijft deze test groen terwijl de tak
 *    waarop `kiesFoto.ts` rust er niet meer is. 📏 Gemeten bij QS8-579: met
 *    `// fileSize = fileData?.fileSize ?: outputFile.length()` in de Kotlin-bron
 *    bleef dit bestand **5 van de 5** groen.
 *
 * ⚠️ **Kotlin en Swift kennen allebei dezelfde twee commentaarvormen als JS**,
 *    dus de gedeelde knip past hier — dat is geen toeval maar de reden dat hij
 *    op die vormen zit en niet op een taal.
 *
 * ⚠️ `bron()` blijft ernaast staan voor `package.json`: JSON kent geen
 *    commentaar, en er doorheen knippen zou een versie stilzwijgend kunnen
 *    veranderen.
 *
 * ⚠️⚠️ **Dit bestand importeerde de gedeelde knip al** — het gebruikte hem voor
 *    `kiesFoto.ts`, onze eigen bron, en niet voor de pin op die van upstream.
 *    Dat is de vorm waar de grendel voor bestaat: de kennis was er, en juist
 *    de plek waar niemand hem verwachtte bleef ongeknipt.
 */
function code(pad: string): string {
  return zonderCommentaar(bron(pad));
}

describe('de bron waarop deze keuze rust, staat er nog zoals hij gelezen is', () => {
  it(`is nog major ${GELEZEN_MAJOR}`, () => {
    const versie = JSON.parse(bron('package.json')) as { version: string };

    expect(
      Number(versie.version.split('.')[0]),
      `expo-image-picker staat op ${versie.version}. De meting in de kop van dit bestand en ` +
        `in die van src/shared/kiezers/kiesFoto.ts is gelezen uit ${GELEZEN_MAJOR}.x. Lees de ` +
        `vier takken hieronder opnieuw en werk beide koppen bij — dat is tien minuten en het ` +
        `alternatief is een toestel.`,
    ).toBe(GELEZEN_MAJOR);
  });

  it('leest op Android de grootte van de bron-URI en niet van het uitvoerbestand', () => {
    const kt = code('android/src/main/java/expo/modules/imagepicker/MediaHandler.kt');

    expect(kt).toContain('fileSize = fileData?.fileSize ?: outputFile.length()');
    expect(kt).toContain('OpenableColumns.SIZE');
  });

  it('laat op iOS de heic-bytes ongemoeid, zodat quality daar niets doet', () => {
    const swift = code('ios/ImageUtils.swift');

    expect(swift).toContain('case UTType.heic.identifier:');
    expect(swift).toContain('return (rawData, ".heic")');
  });

  it('maakt base64 op iOS altijd als jpeg, los van wat er op schijf staat', () => {
    expect(code('ios/MediaHandler.swift')).toContain('readJpegBase64From');
  });
});

describe('en daarom staat er geen grootte-poort op dit pad', () => {
  /**
   * ⚠️ **Een bronzeef en geen gedragstoets, en dat is hier de juiste vorm.** Er
   *    ís geen gedrag om te meten: de belofte is dat een bepaalde poort er níet
   *    staat. Wat een toets dan kan doen is de volgende schrijver tegenhouden —
   *    en hem naar de meting sturen in plaats van naar een `git blame`.
   */
  it('kijkt kiesFoto() niet naar fileSize', () => {
    const code = zonderCommentaar(
      readFileSync(join(WORTEL, 'src', 'shared', 'kiezers', 'kiesFoto.ts'), 'utf8'),
    );

    expect(
      code,
      'kiesFoto() leest `fileSize`. Dat getal beschrijft op Android altijd, en op iOS voor elk ' +
        'formaat dat een iPhone standaard maakt, een ánder bestand dan de bytes uit `base64` die ' +
        'deze functie verstuurt — zie de meting in de kop hierboven. Wil je hier tóch een poort, ' +
        'lees die vier takken dan eerst opnieuw en werk beide koppen bij.',
    ).not.toContain('fileSize');
  });
});
