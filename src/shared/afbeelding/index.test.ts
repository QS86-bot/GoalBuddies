import { describe, expect, it } from 'vitest';

import { draagtMetadata, ontdoeVanMetadata } from './index';

/**
 * Metadata uit een afbeelding knippen — QS8-395, deel 1 van QS8-394.
 *
 * ⚠️⚠️ **Deze tests toetsen de belófte en niet de aanroep.** De belofte is *"er
 *    gaan geen coördinaten de deur uit"*. Een test die vaststelt dát er een
 *    stripfunctie aangeroepen is, blijft groen zodra die functie stukgaat —
 *    CLAUDE.md, regel 18 vraag 2. Daarom voeren de gevallen hieronder een
 *    afbeelding in met een **letterlijk herkenbaar gps-blok** erin, en zoeken ze
 *    dat blok daarna terug in de uitvoerbytes. Vinden ze het, dan is de test
 *    rood, ongeacht welk mechanisme eronder zit.
 *
 * ⚠️ **De andere helft weegt even zwaar:** een knipper die álles weggooit haalt
 *    elke test hierboven groen en levert een kapotte foto. Vandaar per formaat
 *    een geval dat ongemoeid moet blijven, mét de beeldbytes ernaast gelegd.
 *
 * IJKING — met de hand gedraaid op 09-09-2026, één mutatie per grendel:
 *
 *   A  `0xe1` (APP1/Exif) uit `WEG_JPEG` halen
 *      -> 2 rood: 'jpeg: het gps-blok is weg' + 'een blok achter de afsluiter'
 *   B  `eXIf` uit `WEG_PNG` halen
 *      -> 1 rood: 'png: eXIf en tEXt zijn weg'
 *   C  `WEG_WEBP` leegmaken
 *      -> 2 rood: 'webp: het EXIF-blok is weg' + 'ziet eXIf in een png en EXIF in een webp'
 *   D  `knipJpeg()` niets laten filteren
 *      -> 6 rood, waaronder de natoets via 'ziet APP1 in een jpeg en niets in de geknipte versie'
 *   D2 de `volledig`-eis uit `knipPng()` halen
 *      -> 1 rood: 'een half leesbare afbeelding gaat niet de deur uit'
 *   D3 `zoekEoi()` het einde van het bestand laten teruggeven
 *      -> 1 rood: 'jpeg: een blok achter de afsluiter gaat niet mee'
 *   E  `GEKEND` uitbreiden met image/gif
 *      -> 1 rood: 'een onbekend formaat gaat niet de deur uit'
 *   F  de RIFF-lengte niet herschrijven in `knipWebp()`
 *      -> 1 rood: 'webp: de RIFF-lengte klopt na het knippen'
 *   G  de beeldstroom na SOS laten vallen in `knipJpeg()`
 *      -> 2 rood: 'de beeldstroom blijft byte voor byte staan' + 'een blok achter de afsluiter'
 *
 * ⚠️ **A raakt de `draagtMetadata`-test níet, en dat is gemeten en niet gemist.**
 *    Mijn eerste kop beweerde van wel. Met alleen `0xe1` eruit blijft het
 *    COM-segment (`0xfe`) in `WEG_JPEG` staan, dus die test blijft terecht
 *    groen — hij zegt "er zit nog iets in", en dat klopt dan nog steeds. Een
 *    ijkingskop die een uitkomst noemt die er niet is, is precies zo misleidend
 *    als een grendel die niet bijt.
 */

/** Het gps-blok waar het om gaat. Herkenbaar terug te zoeken in de uitvoer. */
const GPS = [...'GPSLatitude'].map((c) => c.charCodeAt(0));

function plakBytes(stukken: readonly Uint8Array[]): Uint8Array {
  const uit = new Uint8Array(stukken.reduce((n, s) => n + s.length, 0));
  let i = 0;
  for (const stuk of stukken) {
    uit.set(stuk, i);
    i += stuk.length;
  }
  return uit;
}

function bevat(hooiberg: Uint8Array, naald: readonly number[]): boolean {
  return hooiberg.some((_, i) => naald.every((b, n) => hooiberg[i + n] === b));
}

function segment(merker: number, inhoud: readonly number[]): number[] {
  const lengte = inhoud.length + 2;
  return [0xff, merker, (lengte >> 8) & 0xff, lengte & 0xff, ...inhoud];
}

/** Een JPEG met JFIF (blijft), een Exif-blok mét gps (weg) en een comment (weg). */
function jpegMetGps(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    ...segment(0xe0, [...'JFIF\0'].map((c) => c.charCodeAt(0))),
    ...segment(0xe1, [...[...'Exif\0\0'].map((c) => c.charCodeAt(0)), ...GPS, 52, 13, 4, 21]),
    ...segment(0xfe, [...'gemaakt in Utrecht'].map((c) => c.charCodeAt(0))),
    ...segment(0xdb, [0, 1, 2, 3]),
    0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0x00,
    0x12, 0x34, 0x56, 0x78, 0x9a,
    0xff, 0xd9,
  ]);
}

function chunkPng(soort: string, inhoud: readonly number[]): number[] {
  const n = inhoud.length;
  return [
    (n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff,
    ...[...soort].map((c) => c.charCodeAt(0)),
    ...inhoud,
    0, 0, 0, 0,
  ];
}

function pngMetGps(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunkPng('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
    ...chunkPng('eXIf', [...GPS, 52, 13]),
    ...chunkPng('tEXt', [...'Locatie\0Utrecht'].map((c) => c.charCodeAt(0))),
    ...chunkPng('IDAT', [0x78, 0x9c, 0x63, 0x00]),
    ...chunkPng('IEND', []),
  ]);
}

function chunkWebp(soort: string, inhoud: readonly number[]): number[] {
  const n = inhoud.length;
  const vulling = n % 2 === 1 ? [0] : [];
  return [
    ...[...soort].map((c) => c.charCodeAt(0)),
    n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff,
    ...inhoud,
    ...vulling,
  ];
}

function webpMetGps(): Uint8Array {
  const romp = [
    ...chunkWebp('VP8 ', [0x11, 0x22, 0x33, 0x44]),
    ...chunkWebp('EXIF', [...GPS, 52, 13]),
  ];
  const n = romp.length + 4;
  return new Uint8Array([
    ...[...'RIFF'].map((c) => c.charCodeAt(0)),
    n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff,
    ...[...'WEBP'].map((c) => c.charCodeAt(0)),
    ...romp,
  ]);
}

function geknipt(bytes: Uint8Array, mime: string): Uint8Array {
  const uit = ontdoeVanMetadata(bytes, mime);
  if (!uit.ok) throw new Error(`onverwacht geweigerd: ${uit.reden}`);
  return uit.data;
}

describe('de belofte: er gaan geen coordinaten de deur uit', () => {
  it('jpeg: het gps-blok is weg', () => {
    expect(bevat(jpegMetGps(), GPS), 'de opstelling draagt geen gps').toBe(true);
    expect(bevat(geknipt(jpegMetGps(), 'image/jpeg'), GPS)).toBe(false);
  });

  it('png: eXIf en tEXt zijn weg', () => {
    expect(bevat(pngMetGps(), GPS), 'de opstelling draagt geen gps').toBe(true);

    const uit = geknipt(pngMetGps(), 'image/png');
    expect(bevat(uit, GPS)).toBe(false);
    expect(bevat(uit, [...'Utrecht'].map((c) => c.charCodeAt(0))), 'de tEXt-tekst staat er nog').toBe(false);
  });

  it('webp: het EXIF-blok is weg', () => {
    expect(bevat(webpMetGps(), GPS), 'de opstelling draagt geen gps').toBe(true);
    expect(bevat(geknipt(webpMetGps(), 'image/webp'), GPS)).toBe(false);
  });

  it('en de vrije tekst van een jpeg-comment ook', () => {
    const uit = geknipt(jpegMetGps(), 'image/jpeg');
    expect(bevat(uit, [...'Utrecht'].map((c) => c.charCodeAt(0)))).toBe(false);
  });
});

describe('de andere helft: wat blijven moet, blijft', () => {
  /**
   * ⚠️ Zonder deze regel haalt een knipper die de hele staart weggooit élke test
   *    hierboven groen, en levert hij een foto zonder beeld.
   */
  it('jpeg: de beeldstroom blijft byte voor byte staan', () => {
    const uit = geknipt(jpegMetGps(), 'image/jpeg');
    expect(bevat(uit, [0x12, 0x34, 0x56, 0x78, 0x9a]), 'de beeldbytes zijn weg').toBe(true);
    expect(bevat(uit, [0xff, 0xd9]), 'de afsluiter is weg').toBe(true);
  });

  it('jpeg: JFIF en de kwantisatietabel blijven', () => {
    const uit = geknipt(jpegMetGps(), 'image/jpeg');
    expect(bevat(uit, [...'JFIF'].map((c) => c.charCodeAt(0))), 'APP0 is weggeknipt').toBe(true);
    expect(bevat(uit, [0xff, 0xdb]), 'de kwantisatietabel is weggeknipt').toBe(true);
  });

  it('png: IHDR, IDAT en IEND blijven', () => {
    const uit = geknipt(pngMetGps(), 'image/png');
    for (const soort of ['IHDR', 'IDAT', 'IEND']) {
      expect(bevat(uit, [...soort].map((c) => c.charCodeAt(0))), `${soort} is weggeknipt`).toBe(true);
    }
  });

  it('webp: de beelddata blijft', () => {
    const uit = geknipt(webpMetGps(), 'image/webp');
    expect(bevat(uit, [...'VP8 '].map((c) => c.charCodeAt(0)))).toBe(true);
    expect(bevat(uit, [0x11, 0x22, 0x33, 0x44])).toBe(true);
  });

  /**
   * ⚠️ De RIFF-kop draagt de totale lengte. Blijft die op de oude waarde staan,
   *    dan is het bestand voor veel decoders stuk en lijkt de maatregel een bug.
   */
  it('webp: de RIFF-lengte klopt na het knippen', () => {
    const uit = geknipt(webpMetGps(), 'image/webp');
    const gemeld = uit[4]! | (uit[5]! << 8) | (uit[6]! << 16) | (uit[7]! << 24);
    expect(gemeld, 'de kop meldt een andere lengte dan het bestand heeft').toBe(uit.length - 8);
  });

  it('een schone afbeelding komt er ongewijzigd uit', () => {
    const schoon = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...chunkPng('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
      ...chunkPng('IDAT', [0x78, 0x9c, 0x63, 0x00]),
      ...chunkPng('IEND', []),
    ]);
    expect(Array.from(geknipt(schoon, 'image/png'))).toEqual(Array.from(schoon));
  });
});

describe('de faalstand valt dicht', () => {
  it('een onbekend formaat gaat niet de deur uit', () => {
    expect(ontdoeVanMetadata(jpegMetGps(), 'image/gif')).toEqual({ ok: false, reden: 'onbekend_formaat' });
    expect(ontdoeVanMetadata(jpegMetGps(), 'image/svg+xml')).toEqual({ ok: false, reden: 'onbekend_formaat' });
  });

  it('een stuk bestand gaat niet de deur uit', () => {
    for (const [bytes, mime] of [
      [new Uint8Array([1, 2, 3]), 'image/jpeg'],
      [new Uint8Array([1, 2, 3]), 'image/png'],
      [new Uint8Array([1, 2, 3]), 'image/webp'],
      [new Uint8Array(), 'image/jpeg'],
    ] as const) {
      expect(ontdoeVanMetadata(bytes, mime), `${mime} liet een stuk bestand door`).toEqual({
        ok: false,
        reden: 'stukke_afbeelding',
      });
    }
  });

  /**
   * ⚠️⚠️ **Kunnen we niet elke byte verantwoorden, dan gaat er niets uit.** 📏
   *    De eerste versie bouwde de uitvoer uit de blokken die hij gevónden had:
   *    stopt het aflopen halverwege, dan vielen alle bytes daarachter
   *    stilzwijgend weg en kwam er een afgeknótte afbeelding uit met `ok: true`.
   *    Geen lek, wél stille verminking — en dat is een uitkomst die niemand ooit
   *    meldt, want de foto ís er.
   */
  it('een half leesbare afbeelding gaat niet de deur uit', () => {
    const stuk = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...chunkPng('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
      // Een chunk die 4096 bytes belooft en er tien levert: het aflopen stopt
      // hier, en de eXIf daarachter wordt nooit gezien.
      0, 0, 0x10, 0x00, ...[...'IDAT'].map((c) => c.charCodeAt(0)), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      ...chunkPng('eXIf', [...GPS, 52, 13]),
    ]);

    expect(bevat(stuk, GPS), 'de opstelling draagt geen gps').toBe(true);
    expect(ontdoeVanMetadata(stuk, 'image/png')).toEqual({ ok: false, reden: 'stukke_afbeelding' });
  });

  /**
   * ⚠️⚠️ **Alles achter `EOI` is geen beeld.** Sommige toestellen plakken daar
   *    een voorbeeldfoto of een tweede metadatablok achter, en het is een
   *    bekende manier om iets mee te sturen wat geen enkele viewer laat zien.
   *    `jpegSegmenten()` kijkt daar niet — die stopt bij `SOS` — dus zonder de
   *    afkapping komt zo'n blok er ongezien én ongemeten doorheen.
   */
  it('jpeg: een blok achter de afsluiter gaat niet mee', () => {
    const metStaart = plakBytes([
      jpegMetGps(),
      new Uint8Array([...[...'Exif\0\0'].map((c) => c.charCodeAt(0)), ...GPS, 52, 13]),
    ]);

    expect(bevat(metStaart, GPS), 'de opstelling draagt geen gps').toBe(true);

    const uit = geknipt(metStaart, 'image/jpeg');
    expect(bevat(uit, GPS), 'het blok achter de afsluiter ging mee').toBe(false);
    expect(bevat(uit, [0x12, 0x34, 0x56, 0x78, 0x9a]), 'de beeldbytes zijn weg').toBe(true);
  });

  it('jpeg zonder afsluiter gaat niet de deur uit', () => {
    const zonderEinde = jpegMetGps().subarray(0, jpegMetGps().length - 2);
    expect(ontdoeVanMetadata(zonderEinde, 'image/jpeg')).toEqual({ ok: false, reden: 'stukke_afbeelding' });
  });
});

describe('draagtMetadata is los te voeden', () => {
  it('ziet APP1 in een jpeg en niets in de geknipte versie', () => {
    expect(draagtMetadata(jpegMetGps(), 'image/jpeg')).toBe(true);
    expect(draagtMetadata(geknipt(jpegMetGps(), 'image/jpeg'), 'image/jpeg')).toBe(false);
  });

  it('ziet eXIf in een png en EXIF in een webp', () => {
    expect(draagtMetadata(pngMetGps(), 'image/png')).toBe(true);
    expect(draagtMetadata(webpMetGps(), 'image/webp')).toBe(true);
  });
});
