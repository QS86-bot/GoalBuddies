/**
 * Metadata uit een afbeelding knippen vóór hij de deur uit gaat — QS8-395.
 *
 * ⚠️⚠️ **Waarom dit bestaat.** Een foto van een telefoon draagt EXIF, en daar
 *    staan `GPSLatitude` en `GPSLongitude` in. Zet iemand thuis een foto in de
 *    groepschat, dan deelt hij zijn adres met de groep — en met iedereen aan wie
 *    een lid de ondertekende URL doorstuurt. 📏 Gevonden in de doorlichting van
 *    09-09-2026: `exif|EXIF|ImageManipulator|stripMetadata` gaf **nul treffers
 *    in de hele repository**.
 *
 * ⚠️ **Dit is een probleem met de óntvanger en niet met de server**, en dat is
 *    de reden dat het vóór alle andere privacyplannen komt (QS8-394). Ook met
 *    volmaakte end-to-end-versleuteling staan die coördinaten in het bestand dat
 *    de groep per definitie mag openen. Versleuteling beschermt tegen de server;
 *    hier is de groep de lezer.
 *
 * ⚠️⚠️ **Waarom knippen en niet her-encoderen.** De voor de hand liggende route
 *    is `expo-image-manipulator`: één bewerking zonder inhoud en de encoder laat
 *    de metadata vallen. Drie bezwaren, en ze wegen samen zwaarder dan het
 *    gemak:
 *
 *    1. Het is een dependency erbij voor iets wat bytewerk is.
 *    2. Hij werkt per platform anders. Op native gaat het door een
 *       systeemencoder, op web door een `canvas`. Dan is "er zit geen locatie
 *       meer in" een eigenschap van een bibliotheek op een platform, en niet
 *       iets wat wij kunnen tonen. Precies de vorm waar dit project telkens op
 *       valt: een grendel die in werkelijkheid een aanname is.
 *    3. Her-encoderen comprimeert opnieuw. De gebruiker levert zichtbaar
 *       kwaliteit in voor een privacymaatregel die dat niet nodig heeft.
 *
 *    Knippen is verliesvrij, identiek op elk platform, en — het punt — **te
 *    meten op de bytes**. `draagtMetadata()` hieronder is de meting, en
 *    `ontdoeVanMetadata()` weigert als die na het knippen nog iets vindt.
 *
 * ⚠️ **De faalstand valt dicht.** Herkennen we het formaat niet, of blijft er na
 *    het knippen metadata staan, dan gaat er niets de deur uit. Beide emmers
 *    (`chatfotos`, `avatars`) staan op `image/jpeg, image/png, image/webp`, dus
 *    een vierde type hoort hier ook niet binnen te komen.
 */

/** De drie types die beide emmers toestaan. Alles daarbuiten weigeren we. */
const GEKEND = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type Uitkomst =
  | { readonly ok: true; readonly data: Uint8Array }
  | { readonly ok: false; readonly reden: 'onbekend_formaat' | 'stukke_afbeelding' | 'blijft_dragen' };

/**
 * Knipt de metadata eruit en toetst daarna of het gelukt is.
 *
 * ⚠️ De toets ná het knippen is geen dubbelop. Hij vangt het geval dat een
 *    bestand een vorm heeft die de knipper niet begrijpt maar wél doorlaat — een
 *    truncated segment, een tweede afbeelding achter de eerste. Zonder die toets
 *    is dit een hoop en geen grendel.
 */
export function ontdoeVanMetadata(bytes: Uint8Array, mime: string): Uitkomst {
  if (!GEKEND.has(mime)) return { ok: false, reden: 'onbekend_formaat' };

  const geknipt = knip(bytes, mime);
  if (geknipt === null) return { ok: false, reden: 'stukke_afbeelding' };
  if (draagtMetadata(geknipt, mime)) return { ok: false, reden: 'blijft_dragen' };

  return { ok: true, data: geknipt };
}

function knip(bytes: Uint8Array, mime: string): Uint8Array | null {
  if (mime === 'image/jpeg') return knipJpeg(bytes);
  if (mime === 'image/png') return knipPng(bytes);
  return knipWebp(bytes);
}

/**
 * Zegt of er nog een metadatablok in zit. Geëxporteerd omdat een controle die je
 * niet kunt voeden, niet te ijken is (CLAUDE.md, regel 18).
 */
export function draagtMetadata(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'image/jpeg') return jpegSegmenten(bytes).delen.some((s) => WEG_JPEG.has(s.merker));
  if (mime === 'image/png') return pngChunks(bytes).delen.some((c) => WEG_PNG.has(c.soort));
  if (mime === 'image/webp') return webpChunks(bytes).delen.some((c) => WEG_WEBP.has(c.soort));
  return false;
}

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------
//
// ⚠️ **Welke segmenten weg moeten, en welke bewust blijven.** EXIF en XMP wonen
//    in APP1 (`0xE1`), IPTC en Photoshop-gerei in APP13 (`0xED`), en `COM`
//    (`0xFE`) is een vrij tekstveld. APP3 t/m APP12 zijn leveranciersblokken —
//    makernotes, "Ducky", "Picture Info" — die niets aan de weergave bijdragen.
//
//    Blijven staan: **APP0** (JFIF; sommige decoders willen hem), **APP2** (het
//    ICC-kleurprofiel — weghalen verandert zichtbaar de kleuren) en **APP14**
//    (de Adobe-merker die zegt of de data YCbCr of CMYK is; weghalen maakt een
//    Adobe-JPEG onleesbaar). Privacy zit in de eerste groep, weergave in de
//    tweede.
const WEG_JPEG = new Set([0xe1, 0xed, 0xfe, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xeb, 0xec]);

interface Segment {
  readonly merker: number;
  readonly van: number;
  readonly tot: number;
}

/**
 * ⚠️⚠️ **`volledig` is een gerepareerd defect en geen extraatje.** 📏 De eerste
 *    versie bouwde de uitvoer uit de blokken die hij gevónden had. Stopt het
 *    aflopen halverwege op een blok dat een lengte opgeeft die buiten het
 *    bestand valt, dan vielen alle bytes daarachter stilzwijgend weg — en kwam
 *    er een afgeknotte afbeelding uit met `ok: true`. Geen lek, wél stille
 *    verminking, en dat is precies het soort uitkomst dat niemand ooit meldt.
 *
 *    Kunnen we niet elke byte verantwoorden, dan gaat er niets de deur uit.
 */
interface Gelezen<T> {
  readonly delen: readonly T[];
  readonly volledig: boolean;
}

/** Loopt de segmenten af tot aan `SOS` (`0xDA`) of `EOI` (`0xD9`). */
function jpegSegmenten(bytes: Uint8Array): Gelezen<Segment> {
  const leeg = { delen: [], volledig: false } as const;
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return leeg;

  const delen: Segment[] = [];
  let i = 2;

  while (i + 3 < bytes.length && bytes[i] === 0xff) {
    const merker = bytes[i + 1] as number;
    // ⚠️ Bij `SOS` en `EOI` is stoppen de goede uitkomst en niet een gebrek:
    //    daarachter staat de entropie-gecodeerde stroom, waarin `0xFF` gewoon
    //    data is. Doorlopen zou daar willekeurige merkers "vinden".
    if (merker === 0xda || merker === 0xd9) return { delen, volledig: true };

    const lengte = ((bytes[i + 2] as number) << 8) | (bytes[i + 3] as number);
    if (lengte < 2 || i + 2 + lengte > bytes.length) return { delen, volledig: false };

    delen.push({ merker, van: i, tot: i + 2 + lengte });
    i += 2 + lengte;
  }

  return { delen, volledig: false };
}

/**
 * ⚠️⚠️ **De staart loopt tot en met `EOI` en geen byte verder.** Alles achter de
 *    afsluiter is geen beeld: sommige toestellen plakken daar een voorbeeldfoto
 *    of een tweede metadatablok achter, en een bestand met een payload achter
 *    `EOI` is een bekende manier om iets mee te sturen wat niemand ziet.
 *    `jpegSegmenten()` kijkt daar niet — hij stopt bij `SOS` — dus zonder deze
 *    afkapping zou zo'n blok er ongezien doorheen komen én ongezien blijven.
 *
 * ⚠️ Zoeken op `FF D9` in de beeldstroom kan geen valse treffer geven: binnen
 *    de entropie-gecodeerde data wordt een `0xFF` gevuld tot `FF 00`, en de
 *    herstartmerkers zijn `FF D0` t/m `FF D7`. Een echte `FF D9` ís dus de
 *    afsluiter.
 */
function knipJpeg(bytes: Uint8Array): Uint8Array | null {
  const { delen, volledig } = jpegSegmenten(bytes);
  if (!volledig || delen.length === 0) return null;

  const houden = delen.filter((s) => !WEG_JPEG.has(s.merker));
  const staart = delen[delen.length - 1]?.tot ?? 2;
  const eind = zoekEoi(bytes, staart);
  if (eind === null) return null;

  return plak([bytes.subarray(0, 2), ...houden.map((s) => bytes.subarray(s.van, s.tot)), bytes.subarray(staart, eind)]);
}

/** De positie ná `FF D9`, of `null` als de afsluiter ontbreekt. */
function zoekEoi(bytes: Uint8Array, van: number): number | null {
  for (let i = van; i + 1 < bytes.length; i += 1) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) return i + 2;
  }
  return null;
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------
//
// ⚠️ `tIME` staat er bewust bij: het tijdstip van de laatste bewerking zegt
//    wanneer iemand ergens was, en dat is dezelfde soort gegeven als een
//    coördinaat. `eXIf` draagt een volledig EXIF-blok, inclusief gps.
const WEG_PNG = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);
const PNG_KOP = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

interface Chunk {
  readonly soort: string;
  readonly van: number;
  readonly tot: number;
}

function pngChunks(bytes: Uint8Array): Gelezen<Chunk> {
  if (bytes.length < 8 || PNG_KOP.some((b, n) => bytes[n] !== b)) return { delen: [], volledig: false };

  const delen: Chunk[] = [];
  let i = 8;

  while (i + 8 <= bytes.length) {
    const lengte = leesGetal(bytes, i);
    const eind = i + 12 + lengte;
    if (lengte < 0 || eind > bytes.length) return { delen, volledig: false };

    delen.push({ soort: leesVier(bytes, i + 4), van: i, tot: eind });
    i = eind;
  }

  // ⚠️ Precies uitkomen is de eis: blijft er een staart over, dan hebben we hem
  //    niet gelezen en kunnen we er dus niets over zeggen.
  return { delen, volledig: i === bytes.length };
}

function knipPng(bytes: Uint8Array): Uint8Array | null {
  const { delen, volledig } = pngChunks(bytes);
  if (!volledig || delen.length === 0) return null;

  const houden = delen.filter((c) => !WEG_PNG.has(c.soort));
  return plak([bytes.subarray(0, 8), ...houden.map((c) => bytes.subarray(c.van, c.tot))]);
}

// ---------------------------------------------------------------------------
// WebP
// ---------------------------------------------------------------------------
//
// ⚠️ De RIFF-kop draagt de totale lengte, dus die moet ná het knippen opnieuw
//    geschreven worden. Een WebP met een te grote lengte in de kop is voor veel
//    decoders stuk, en dat zou het knippen zichtbaar maken als een bug in plaats
//    van als een maatregel.
const WEG_WEBP = new Set(['EXIF', 'XMP ']);

function webpChunks(bytes: Uint8Array): Gelezen<Chunk> {
  const leeg = { delen: [], volledig: false } as const;
  if (bytes.length < 12 || leesVier(bytes, 0) !== 'RIFF' || leesVier(bytes, 8) !== 'WEBP') return leeg;

  const delen: Chunk[] = [];
  let i = 12;

  while (i + 8 <= bytes.length) {
    const lengte = leesGetalKlein(bytes, i + 4);
    const eind = i + 8 + lengte + (lengte % 2);
    if (lengte < 0 || eind > bytes.length) return { delen, volledig: false };

    delen.push({ soort: leesVier(bytes, i), van: i, tot: eind });
    i = eind;
  }

  return { delen, volledig: i === bytes.length };
}

function knipWebp(bytes: Uint8Array): Uint8Array | null {
  const { delen, volledig } = webpChunks(bytes);
  if (!volledig || delen.length === 0) return null;

  const houden = delen.filter((c) => !WEG_WEBP.has(c.soort));
  const romp = plak(houden.map((c) => bytes.subarray(c.van, c.tot)));
  const uit = plak([bytes.subarray(0, 12), romp]);

  schrijfGetalKlein(uit, 4, romp.length + 4);
  return uit;
}

// ---------------------------------------------------------------------------
// Bytegereedschap
// ---------------------------------------------------------------------------

function plak(stukken: readonly Uint8Array[]): Uint8Array {
  const totaal = stukken.reduce((n, s) => n + s.length, 0);
  const uit = new Uint8Array(totaal);
  let i = 0;
  for (const stuk of stukken) {
    uit.set(stuk, i);
    i += stuk.length;
  }
  return uit;
}

/** Vier bytes als ASCII — de chunknamen van PNG en WebP. */
function leesVier(bytes: Uint8Array, van: number): string {
  return String.fromCharCode(...bytes.subarray(van, van + 4));
}

/** PNG telt big-endian. */
function leesGetal(bytes: Uint8Array, van: number): number {
  return (
    ((bytes[van] as number) << 24) |
    ((bytes[van + 1] as number) << 16) |
    ((bytes[van + 2] as number) << 8) |
    (bytes[van + 3] as number)
  );
}

/** RIFF telt little-endian. */
function leesGetalKlein(bytes: Uint8Array, van: number): number {
  return (
    (bytes[van] as number) |
    ((bytes[van + 1] as number) << 8) |
    ((bytes[van + 2] as number) << 16) |
    ((bytes[van + 3] as number) << 24)
  );
}

function schrijfGetalKlein(bytes: Uint8Array, van: number, waarde: number): void {
  bytes[van] = waarde & 0xff;
  bytes[van + 1] = (waarde >> 8) & 0xff;
  bytes[van + 2] = (waarde >> 16) & 0xff;
  bytes[van + 3] = (waarde >> 24) & 0xff;
}
