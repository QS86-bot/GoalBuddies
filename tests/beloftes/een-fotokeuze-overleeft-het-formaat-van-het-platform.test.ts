/**
 * De belofte: een foto die de gebruiker kiest, komt er verstuurbaar uit — hoe
 * het platform dat bestand ook noemt (QS8-547).
 *
 * ⚠️⚠️ **Waarom deze suite bestaat.** `kiesFoto()` gaf het formaat door dat
 *    `expo-image-picker` in `mimeType` zette, en gebruikte daarnáást de bytes uit
 *    `base64`. 📏 Gelezen in de native bron van 57.0.14 zijn dat op de
 *    PHPicker-route **twee verschillende bestanden**: `ImageUtils.swift` geeft
 *    voor HEIC de originele bytes terug (`case UTType.heic.identifier: return
 *    (rawData, ".heic")`) terwijl `MediaHandler.swift` de base64 altijd via
 *    `readJpegBase64From(image:compressionQuality:)` maakt.
 *
 *    Gevolg: elke foto van een iPhone die op "Hoge efficiëntie" staat — de
 *    standaard sinds iOS 11 — kwam binnen als `image/heic` met JPEG-bytes, viel
 *    buiten `GEKEND`, en de gebruiker las `chatfoto.kiezen_mislukt`.
 *
 * ⚠️ **En geen enkele test zag het**, want alle bestaande tests rond dit pad
 *    toetsen een eigenschap van een ónderdeel: dát elke kiezer via
 *    `ontdoeVanMetadata()` loopt (`geen-foto-verlaat-de-app-met-metadata`), en
 *    dát een keuze niet stilvalt (`een-bijlagekeuze-valt-nooit-stil`). Allebei
 *    bleven ze terecht groen. De belofte — *er komt een foto uit* — had geen
 *    test. Regel 18, vraag 2 en 3.
 *
 * ⚠️ **De must-allow staat er met opzet naast.** Een `kiesFoto()` die alles maar
 *    `image/jpeg` noemt, haalt het eerste geval groen en stuurt een PNG de emmer
 *    in onder de verkeerde vlag. Zonder de twee gevallen eronder bewaakt het
 *    eerste niets.
 *
 * IJKING — met de hand gedraaid op 18-09-2026, één mutatie per grendel:
 *
 *   L  `herkenFormaat(bytes)` terugzetten naar `gekozen.mimeType ?? 'image/jpeg'`
 *      — dus letterlijk de code van vóór QS8-547
 *      -> **3 rood**: 'een heic-etiket met jpeg-bytes levert een verstuurbare
 *         foto op', 'het formaat volgt de bytes en niet het etiket', én 'een png
 *         onder een jpeg-etiket komt er als png uit'
 *   M  de `null`-tak in `kiesFoto()` weghalen (`herkenFormaat(bytes) ?? 'image/jpeg'`)
 *      -> **0 rood**. Zie hieronder.
 *
 * ⚠️ **De derde rode bij L was niet voorspeld en is leerzaam.** De png-test staat
 *    er als must-allow — hij moet vóórkomen dat "alles heet jpeg" ook groen is.
 *    Maar met de óude code valt hij óók om, en om een andere reden: `knipJpeg()`
 *    op png-bytes geeft `stukke_afbeelding`, dus de gebruiker kreeg een foutmelding
 *    op een volstrekt geldige png zodra het platform er het verkeerde etiket op
 *    plakte. 📏 Die tweede helft van de bug stond niet in QS8-547 beschreven.
 *
 * ⚠️⚠️ **En M deed niets, net als I in `src/shared/afbeelding/index.test.ts`.**
 *    De reden is dezelfde vorm: `ontdoeVanMetadata()` weigert die bytes toch al
 *    (`image/jpeg` + heic-bytes -> `stukke_afbeelding`), dus de `null`-tak is een
 *    tweede grendel op dezelfde deur. Hij blijft staan omdat hij de júiste reden
 *    geeft — "dit formaat kennen we niet" in plaats van "deze afbeelding is
 *    stuk" — maar **geen enkele test hieronder bewaakt hem**, en dat hoort er te
 *    staan in plaats van stilzwijgend aangenomen te worden.
 *
 *    Twee van de vier mutaties in deze wijziging landden achter een bestaande
 *    grendel. Dat is geen toeval maar de vorm van dit pad: er staan er meerdere
 *    achter elkaar, en dan meet één mutatie voor "de controle" niets.
 */
import { describe, expect, it, vi } from 'vitest';

const kiezer = vi.hoisted(() => ({ resultaat: null as unknown }));

vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: async () => kiezer.resultaat,
  requestMediaLibraryPermissionsAsync: async () => ({ granted: true }),
}));

const { kiesFoto } = await import('../../src/shared/kiezers/kiesFoto');

/** Het gps-blok waar QS8-395 over gaat, herkenbaar terug te zoeken. */
const GPS = [...'GPSLatitude'].map((c) => c.charCodeAt(0));

function segment(merker: number, inhoud: readonly number[]): number[] {
  const lengte = inhoud.length + 2;
  return [0xff, merker, (lengte >> 8) & 0xff, lengte & 0xff, ...inhoud];
}

/** Een geldige JPEG met een Exif-blok mét gps erin. */
function jpegMetGps(): number[] {
  return [
    0xff, 0xd8,
    ...segment(0xe0, [...'JFIF\0'].map((c) => c.charCodeAt(0))),
    ...segment(0xe1, [...[...'Exif\0\0'].map((c) => c.charCodeAt(0)), ...GPS, 52, 13]),
    ...segment(0xdb, [0, 1, 2, 3]),
    0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0x00,
    0x12, 0x34, 0x56, 0x78, 0x9a,
    0xff, 0xd9,
  ];
}

function pngKaal(): number[] {
  const chunk = (soort: string, inhoud: readonly number[]): number[] => {
    const n = inhoud.length;
    return [
      (n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff,
      ...[...soort].map((c) => c.charCodeAt(0)),
      ...inhoud,
      0, 0, 0, 0,
    ];
  };
  return [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
    ...chunk('IDAT', [0x78, 0x9c, 0x63, 0x00]),
    ...chunk('IEND', []),
  ];
}

function naarBase64(bytes: readonly number[]): string {
  return Buffer.from(Uint8Array.from(bytes)).toString('base64');
}

/** Wat de picker teruggeeft: het etiket dat hij plakt, en de bytes die hij levert. */
function keuze(mimeType: string, bytes: readonly number[]) {
  return {
    canceled: false,
    assets: [{ uri: 'file:///tmp/foto', mimeType, base64: naarBase64(bytes), fileSize: 3_000_000 }],
  };
}

function bevat(hooiberg: Uint8Array, naald: readonly number[]): boolean {
  return hooiberg.some((_, i) => naald.every((b, n) => hooiberg[i + n] === b));
}

describe('een fotokeuze overleeft het formaat dat het platform eraan plakt', () => {
  it('een heic-etiket met jpeg-bytes levert een verstuurbare foto op', async () => {
    // Precies wat een iPhone teruggeeft: mimeType van het bestand op schijf,
    // base64 van een JPEG die de picker ernaast maakte.
    kiezer.resultaat = keuze('image/heic', jpegMetGps());

    const uit = await kiesFoto('chatfoto.kiezen_mislukt');

    expect(uit.soort, `een gewone iPhone-foto kwam er niet doorheen: ${JSON.stringify(uit)}`).toBe(
      'gekozen',
    );
  });

  it('het formaat volgt de bytes en niet het etiket', async () => {
    kiezer.resultaat = keuze('image/heic', jpegMetGps());

    const uit = await kiesFoto('chatfoto.kiezen_mislukt');
    if (uit.soort !== 'gekozen') throw new Error('geen foto om te toetsen');

    expect(uit.mime, 'het etiket van het platform won van de bytes').toBe('image/jpeg');
    // ⚠️ En de belofte van QS8-395 blijft staan op ditzelfde pad: de gps is weg.
    expect(bevat(uit.data, GPS), 'het gps-blok ging alsnog de deur uit').toBe(false);
  });

  it('een png onder een jpeg-etiket komt er als png uit', async () => {
    // ⚠️ De must-allow: het gaat niet om "alles is jpeg" maar om "het formaat
    //    komt van de bytes". Een kiezer die blind `image/jpeg` invult, valt hier.
    kiezer.resultaat = keuze('image/jpeg', pngKaal());

    const uit = await kiesFoto('bewijsfoto.kiezen_mislukt');
    if (uit.soort !== 'gekozen') throw new Error(`de png kwam er niet door: ${JSON.stringify(uit)}`);

    expect(uit.mime).toBe('image/png');
  });

  it('bytes die geen afbeelding zijn, leveren geen foto op', async () => {
    // ⚠️ De faalstand valt dicht (QS8-395). Een etiket dat wél in `GEKEND` staat
    //    mag geen onbekende bytes naar binnen praten.
    kiezer.resultaat = keuze('image/jpeg', [0, 0, 0, 0x18, ...[...'ftypheic'].map((c) => c.charCodeAt(0))]);

    const uit = await kiesFoto('chatfoto.kiezen_mislukt');

    expect(uit.soort, 'onbekende bytes kwamen er als foto uit').toBe('fout');
  });
});
