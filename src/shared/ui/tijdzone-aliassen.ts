/**
 * Waar mensen op zoeken als ze een tijdzone kiezen — QS8-212.
 *
 * ⚠️ **Waarom dit bestaat.** De lijst uit `Intl.supportedValuesOf('timeZone')`
 *    kent alléén zonenamen. Gemeten: **"Rotterdam", "Manchester", "Osaka" en
 *    "Netherlands" geven nul treffers.** Voor een Nederlandse gebruiker in de
 *    onboarding is dat een muur — er wonen ruim een miljoen mensen in steden die
 *    geen eigen IANA-zone hebben, en de melding *"Zoek op een grote stad in de
 *    buurt"* wijst wel de goede kant op maar lost het niet op.
 *
 * ⚠️ **Waarom dit een tabel is en geen truc.** Er bestaat geen runtime-bron die
 *    plaats of land aan een zone koppelt: `Intl` geeft de namen en verder niets.
 *    Elke oplossing is dus data. Het issue liet dit daarom liggen met *"data die
 *    onderhouden moet worden, en die keuze hoort bij het product"* — maar het
 *    bezwaar gold een **volledige** plaatsnamendatabase. Deze tabel is met opzet
 *    begrensd, en de grens staat hieronder zodat een volgende lezer weet wat er
 *    wél en niet bij hoort.
 *
 * ## Wat hier hoort
 *
 * 1. **Nederlandse en Belgische plaatsen**, want dat is de gebruiker van
 *    vandaag en dat is het gemeten geval.
 * 2. **Landsnamen in het Nederlands én het Engels**, want de app is tweetalig en
 *    "Nederland" is voor veel mensen het eerste wat ze typen.
 * 3. **Grote steden zonder eigen zone**, wereldwijd, waar iemand redelijkerwijs
 *    op zoekt.
 *
 * ## Wat hier níét hoort
 *
 * Elke plaats die al een eigen zone heeft (`Europe/Amsterdam` vind je op
 * "amsterdam" zonder tabel), en elke plaats die niemand zou intypen. Een alias
 * die niets toevoegt, is onderhoud zonder opbrengst.
 *
 * ⚠️ **Elke waarde hoort een zone te zijn die dit platform kent.** Een typefout
 *    is hier stil: de zoekterm matcht, de knop verschijnt, en de gebruiker slaat
 *    een zone op die niet bestaat. `tests/beloftes/tijdzone-aliassen.test.ts`
 *    legt daarom élke waarde naast `Intl` — en dat is de grendel die deze tabel
 *    tegen verval beschermt.
 */

/**
 * Zoekterm → tijdzone. Sleutels in kleine letters en zonder diakrieten, want
 * `zoekvorm()` in `tijdzone.ts` normaliseert de invoer op dezelfde manier.
 */
export const TIJDZONE_ALIASSEN: Readonly<Record<string, string>> = {
  // ── Nederland ──────────────────────────────────────────────────────────────
  nederland: 'Europe/Amsterdam',
  netherlands: 'Europe/Amsterdam',
  holland: 'Europe/Amsterdam',
  nl: 'Europe/Amsterdam',
  rotterdam: 'Europe/Amsterdam',
  'den haag': 'Europe/Amsterdam',
  'the hague': 'Europe/Amsterdam',
  'sgravenhage': 'Europe/Amsterdam',
  utrecht: 'Europe/Amsterdam',
  eindhoven: 'Europe/Amsterdam',
  groningen: 'Europe/Amsterdam',
  tilburg: 'Europe/Amsterdam',
  almere: 'Europe/Amsterdam',
  breda: 'Europe/Amsterdam',
  nijmegen: 'Europe/Amsterdam',
  arnhem: 'Europe/Amsterdam',
  haarlem: 'Europe/Amsterdam',
  leiden: 'Europe/Amsterdam',
  delft: 'Europe/Amsterdam',
  maastricht: 'Europe/Amsterdam',
  zwolle: 'Europe/Amsterdam',
  enschede: 'Europe/Amsterdam',
  apeldoorn: 'Europe/Amsterdam',
  amersfoort: 'Europe/Amsterdam',
  dordrecht: 'Europe/Amsterdam',
  leeuwarden: 'Europe/Amsterdam',

  // ── België ─────────────────────────────────────────────────────────────────
  belgie: 'Europe/Brussels',
  belgium: 'Europe/Brussels',
  brussel: 'Europe/Brussels',
  antwerpen: 'Europe/Brussels',
  antwerp: 'Europe/Brussels',
  gent: 'Europe/Brussels',
  ghent: 'Europe/Brussels',
  brugge: 'Europe/Brussels',
  bruges: 'Europe/Brussels',
  leuven: 'Europe/Brussels',
  luik: 'Europe/Brussels',
  charleroi: 'Europe/Brussels',

  // ── Landen om ons heen, in beide talen ─────────────────────────────────────
  duitsland: 'Europe/Berlin',
  germany: 'Europe/Berlin',
  munchen: 'Europe/Berlin',
  munich: 'Europe/Berlin',
  hamburg: 'Europe/Berlin',
  keulen: 'Europe/Berlin',
  cologne: 'Europe/Berlin',
  frankfurt: 'Europe/Berlin',
  stuttgart: 'Europe/Berlin',
  dusseldorf: 'Europe/Berlin',
  frankrijk: 'Europe/Paris',
  france: 'Europe/Paris',
  lyon: 'Europe/Paris',
  marseille: 'Europe/Paris',
  bordeaux: 'Europe/Paris',
  toulouse: 'Europe/Paris',
  nice: 'Europe/Paris',
  spanje: 'Europe/Madrid',
  spain: 'Europe/Madrid',
  barcelona: 'Europe/Madrid',
  valencia: 'Europe/Madrid',
  sevilla: 'Europe/Madrid',
  seville: 'Europe/Madrid',
  malaga: 'Europe/Madrid',
  italie: 'Europe/Rome',
  italy: 'Europe/Rome',
  milaan: 'Europe/Rome',
  milan: 'Europe/Rome',
  napels: 'Europe/Rome',
  naples: 'Europe/Rome',
  turijn: 'Europe/Rome',
  turin: 'Europe/Rome',
  florence: 'Europe/Rome',
  venetie: 'Europe/Rome',
  venice: 'Europe/Rome',
  portugal: 'Europe/Lisbon',
  lissabon: 'Europe/Lisbon',
  porto: 'Europe/Lisbon',
  'verenigd koninkrijk': 'Europe/London',
  'united kingdom': 'Europe/London',
  engeland: 'Europe/London',
  england: 'Europe/London',
  schotland: 'Europe/London',
  scotland: 'Europe/London',
  wales: 'Europe/London',
  manchester: 'Europe/London',
  birmingham: 'Europe/London',
  liverpool: 'Europe/London',
  glasgow: 'Europe/London',
  edinburgh: 'Europe/London',
  leeds: 'Europe/London',
  bristol: 'Europe/London',
  ierland: 'Europe/Dublin',
  ireland: 'Europe/Dublin',
  zwitserland: 'Europe/Zurich',
  switzerland: 'Europe/Zurich',
  geneve: 'Europe/Zurich',
  geneva: 'Europe/Zurich',
  bazel: 'Europe/Zurich',
  basel: 'Europe/Zurich',
  oostenrijk: 'Europe/Vienna',
  austria: 'Europe/Vienna',
  wenen: 'Europe/Vienna',
  denemarken: 'Europe/Copenhagen',
  denmark: 'Europe/Copenhagen',
  kopenhagen: 'Europe/Copenhagen',
  zweden: 'Europe/Stockholm',
  sweden: 'Europe/Stockholm',
  goteborg: 'Europe/Stockholm',
  noorwegen: 'Europe/Oslo',
  norway: 'Europe/Oslo',
  finland: 'Europe/Helsinki',
  polen: 'Europe/Warsaw',
  poland: 'Europe/Warsaw',
  krakau: 'Europe/Warsaw',
  krakow: 'Europe/Warsaw',
  tsjechie: 'Europe/Prague',
  czechia: 'Europe/Prague',
  praag: 'Europe/Prague',
  hongarije: 'Europe/Budapest',
  hungary: 'Europe/Budapest',
  boedapest: 'Europe/Budapest',
  griekenland: 'Europe/Athens',
  greece: 'Europe/Athens',
  athene: 'Europe/Athens',
  turkije: 'Europe/Istanbul',
  turkey: 'Europe/Istanbul',
  ankara: 'Europe/Istanbul',
  roemenie: 'Europe/Bucharest',
  romania: 'Europe/Bucharest',
  boekarest: 'Europe/Bucharest',

  // ── Verder weg, waar gebruikers vandaan komen of naartoe reizen ────────────
  marokko: 'Africa/Casablanca',
  morocco: 'Africa/Casablanca',
  rabat: 'Africa/Casablanca',
  suriname: 'America/Paramaribo',
  bonaire: 'America/Kralendijk',
  indonesie: 'Asia/Jakarta',
  indonesia: 'Asia/Jakarta',
  bali: 'Asia/Makassar',
  'verenigde staten': 'America/New_York',
  'united states': 'America/New_York',
  usa: 'America/New_York',
  amerika: 'America/New_York',
  boston: 'America/New_York',
  philadelphia: 'America/New_York',
  washington: 'America/New_York',
  atlanta: 'America/New_York',
  miami: 'America/New_York',
  orlando: 'America/New_York',
  dallas: 'America/Chicago',
  houston: 'America/Chicago',
  austin: 'America/Chicago',
  'new orleans': 'America/Chicago',
  'san francisco': 'America/Los_Angeles',
  seattle: 'America/Los_Angeles',
  'san diego': 'America/Los_Angeles',
  'las vegas': 'America/Los_Angeles',
  portland: 'America/Los_Angeles',
  canada: 'America/Toronto',
  montreal: 'America/Toronto',
  ottawa: 'America/Toronto',
  calgary: 'America/Edmonton',
  mexico: 'America/Mexico_City',
  brazilie: 'America/Sao_Paulo',
  brazil: 'America/Sao_Paulo',
  'rio de janeiro': 'America/Sao_Paulo',
  argentinie: 'America/Argentina/Buenos_Aires',
  argentina: 'America/Argentina/Buenos_Aires',
  japan: 'Asia/Tokyo',
  osaka: 'Asia/Tokyo',
  kyoto: 'Asia/Tokyo',
  yokohama: 'Asia/Tokyo',
  china: 'Asia/Shanghai',
  peking: 'Asia/Shanghai',
  beijing: 'Asia/Shanghai',
  shenzhen: 'Asia/Shanghai',
  guangzhou: 'Asia/Shanghai',
  india: 'Asia/Kolkata',
  mumbai: 'Asia/Kolkata',
  bombay: 'Asia/Kolkata',
  delhi: 'Asia/Kolkata',
  bangalore: 'Asia/Kolkata',
  'zuid-korea': 'Asia/Seoul',
  'south korea': 'Asia/Seoul',
  thailand: 'Asia/Bangkok',
  vietnam: 'Asia/Ho_Chi_Minh',
  filipijnen: 'Asia/Manila',
  philippines: 'Asia/Manila',
  israel: 'Asia/Jerusalem',
  'zuid-afrika': 'Africa/Johannesburg',
  'south africa': 'Africa/Johannesburg',
  kaapstad: 'Africa/Johannesburg',
  'cape town': 'Africa/Johannesburg',
  egypte: 'Africa/Cairo',
  egypt: 'Africa/Cairo',
  nigeria: 'Africa/Lagos',
  kenia: 'Africa/Nairobi',
  kenya: 'Africa/Nairobi',
  australie: 'Australia/Sydney',
  australia: 'Australia/Sydney',
  canberra: 'Australia/Sydney',
  'nieuw-zeeland': 'Pacific/Auckland',
  'new zealand': 'Pacific/Auckland',
  wellington: 'Pacific/Auckland',
};
