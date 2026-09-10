import type { Sleutel } from '../i18n';

/**
 * Wanneer een veld een microfoon krijgt, en wat er met het resultaat gebeurt —
 * QS8-250.
 *
 * ⚠️ **Waarom dit een eigen module is en niet drie regels in `Field.tsx`.** Er is
 *    geen renderer in dit project en geen enkele test in `app/`, dus een
 *    beslissing die in een component blijft zitten is niet te toetsen. Zelfde
 *    beweging als `wachtwoordveld.ts`, `routewacht.ts` en `aanmeldmodus.ts` — en
 *    zelfde reden: een controle die je niet kunt voeden, kun je niet ijken.
 *
 * ⚠️ **Alles hier is puur.** Geen `window`, geen `Platform`, geen React. Het
 *    venster en het platform komen als argument binnen, zodat een test een
 *    Firefox, een Chrome en een telefoon los kan aanbieden zonder er een te
 *    hebben.
 */

/**
 * Wat deze module van het globale object hoeft te weten.
 *
 * ⚠️ Beide namen, en dat is geen overdaad: Chrome en Edge leveren de API nog
 *    steeds onder het `webkit`-voorvoegsel. Alleen de ongeprefixte naam
 *    controleren betekent dat de knop nergens verschijnt.
 */
export interface Spraakvenster {
  readonly SpeechRecognition?: unknown;
  readonly webkitSpeechRecognition?: unknown;
}

/**
 * De velden waar deze beslissing op leunt. Bewust een smalle vorm en niet de
 * volledige `TextInputProps`: wat hier niet in staat, kan de uitkomst ook niet
 * per ongeluk veranderen.
 */
export interface Veldvorm {
  readonly wachtwoord?: boolean | undefined;
  readonly secureTextEntry?: boolean | undefined;
  readonly inputMode?: string | undefined;
  readonly keyboardType?: string | undefined;
  readonly autoComplete?: string | undefined;
  readonly editable?: boolean | undefined;
  /** Zonder schrijfweg valt er niets aan te vullen — zie `magSpraak`. */
  readonly onChangeText?: unknown;
}

/**
 * Invoermodi waar spraak meer correctiewerk oplevert dan typen.
 *
 * ⚠️ **`search` staat er met opzet níet bij.** Dat is vrije tekst; hij staat
 *    alleen op een ander toetsenbord.
 */
const GESLOTEN_INPUTMODE: readonly string[] = ['numeric', 'decimal', 'tel', 'email', 'url', 'none'];

/** Dezelfde grens, maar zoals React Native hem op `keyboardType` noemt. */
const GESLOTEN_KEYBOARDTYPE: readonly string[] = [
  'email-address',
  'numeric',
  'number-pad',
  'decimal-pad',
  'phone-pad',
  'url',
];

/**
 * En zoals de browser hem op `autoComplete` noemt.
 *
 * ⚠️ De wachtwoordwaarden staan hier óók in, náást de `wachtwoord`-vlag. Dat is
 *    dubbel en dat is de bedoeling: een veld dat `autoComplete="new-password"`
 *    draagt zonder de vlag is een wachtwoordveld dat iemand vergeten is te
 *    markeren, en dat is precies het geval waarin een microfoon het ergst is.
 */
const GESLOTEN_AUTOCOMPLETE: readonly string[] = [
  'email',
  'tel',
  'tel-country-code',
  'tel-national',
  'password',
  'password-new',
  'new-password',
  'current-password',
  'postal-code',
  'cc-number',
  'cc-csc',
  'cc-exp',
  'birthdate-day',
  'birthdate-month',
  'birthdate-year',
  'one-time-code',
  'sms-otp',
];

/**
 * Heeft dit apparaat een spraakherkenner die wij mogen gebruiken?
 *
 * ⚠️ **Alleen op web, en dat is een besluit en geen omissie.** iOS en Android
 *    hebben een dicteerknop op het systeemtoetsenbord; wie daar typt, kan
 *    vandaag al inspreken zonder dat deze app iets doet. Zelf een herkenner
 *    inbouwen zou daar een dependency en een microfoontoestemming kosten voor
 *    een knop die er al staat. Onderbouwing in
 *    `docs/decisions/2026-09-09-de-microfoon-staat-op-web.md`.
 *
 * ⚠️ **Geen knop die niets doet.** Firefox heeft de API niet, en een microfoon
 *    die daar wél staat en niets doet is erger dan geen microfoon — dezelfde
 *    regel die het aanmeldscherm al toepast bij OAuth op native.
 */
export function spraakBeschikbaar(platform: string, venster: Spraakvenster | null | undefined): boolean {
  if (platform !== 'web') return false;
  if (venster === null || venster === undefined) return false;

  return (
    typeof venster.SpeechRecognition === 'function' ||
    typeof venster.webkitSpeechRecognition === 'function'
  );
}

/**
 * Hoort er bij dít veld een microfoon te staan?
 *
 * ⚠️⚠️ **Dit is een uitsluitlijst en geen toelaatlijst, en dat is tegen de
 *    gewoonte van dit project in.** Domeinregel 7 zegt "beschermd tot iemand het
 *    tegendeel besluit", en die vorm is hier bewust níet overgenomen. Reden: van
 *    de achtenveertig `Field`-aanroepen in deze app zijn er acht geen vrije
 *    tekst. Een toelaatlijst zou veertig velden moeten opsommen en bij elk nieuw
 *    formulier stil achterlopen — dan staat de microfoon er niet en wordt niets
 *    daar rood van.
 *
 *    Het verschil met domeinregel 7 is dat dáár de fout een lek is en hier een
 *    ongemak: een microfoon bij een postcodeveld is hinderlijk, geen
 *    schaamtemoment. De acceptatie van dit issue vraagt bovendien letterlijk
 *    "bij **elk** vrijetekstveld".
 *
 * ⚠️ **Zonder `onChangeText` geen microfoon.** Inspreken vult het veld aan, en
 *    aanvullen kan alleen langs de schrijfweg die de aanroeper meegeeft. Een
 *    knop zonder die weg zou luisteren en de tekst weggooien.
 */
export function magSpraak(veld: Veldvorm): boolean {
  if (veld.wachtwoord === true || veld.secureTextEntry === true) return false;
  if (veld.editable === false) return false;
  if (typeof veld.onChangeText !== 'function') return false;

  if (veld.inputMode !== undefined && GESLOTEN_INPUTMODE.includes(veld.inputMode)) return false;
  if (veld.keyboardType !== undefined && GESLOTEN_KEYBOARDTYPE.includes(veld.keyboardType)) return false;
  if (veld.autoComplete !== undefined && GESLOTEN_AUTOCOMPLETE.includes(veld.autoComplete)) return false;

  return true;
}

/**
 * De herkende tekst achter wat er al staat.
 *
 * ⚠️ **Aanvullen en niet overschrijven** — acceptatiecriterium 2. Wie halverwege
 *    een zin de microfoon pakt, hoort zijn eerste helft terug te zien.
 *
 * ⚠️ **Geen `slice`, geen `charAt`, geen `[0]`.** Gebruikers mogen overal emoji
 *    typen en spraakherkenning voegt er zelf ook weleens een toe; snijden op een
 *    UTF-16-grens rendert als een vervangingsteken. `trim` en `endsWith` raken
 *    geen codepunt en zijn daarom veilig. Zie de emoji-sectie in CLAUDE.md.
 *
 * ⚠️ **De witruimte die er al stond blijft staan.** Wie een nieuwe regel begon,
 *    krijgt zijn zin op die regel en niet met een spatie ervoor geplakt.
 */
export function voegAan(bestaand: string, herkend: string): string {
  const nieuw = herkend.trim();
  if (nieuw === '') return bestaand;
  if (bestaand === '') return nieuw;

  return /\s$/u.test(bestaand) ? `${bestaand}${nieuw}` : `${bestaand} ${nieuw}`;
}

/**
 * De taaltag die de herkenner meekrijgt.
 *
 * ⚠️ Uit dezelfde taal als de rest van de app praat, en niet uit de browser: wie
 *    de app op Nederlands zet op een Engels systeem, wil Nederlands herkend
 *    krijgen. Acceptatiecriterium 6 van het issue.
 */
export function spraakTaalTag(taal: string): string {
  return taal === 'en' ? 'en-US' : 'nl-NL';
}

/**
 * Welke melding bij een foutcode van de herkenner hoort.
 *
 * ⚠️ **`aborted` geeft `null`, en dat is de enige stille tak.** Die code komt
 *    binnen als de gebruiker zélf stopt. Een melding daarop is ruis: hij weet
 *    wat hij deed. Elke andere code krijgt een zin — onwrikbare regel 16 en 14,
 *    en de acceptatie vraagt met zoveel woorden om "geen stilte".
 *
 * ⚠️ **Een onbekende code valt terug op de algemene zin en niet op `null`.**
 *    Zwijgen bij iets wat we niet kennen is precies de vorm die dit project
 *    elders heeft afgeschaft: de gebruiker zit dan naar een knop te kijken die
 *    niets deed.
 */
export function spraakfoutSleutel(code: string): Sleutel | null {
  if (code === 'aborted') return null;

  if (code === 'not-allowed' || code === 'service-not-allowed') return 'spraak.fout_geweigerd';
  if (code === 'network') return 'spraak.fout_verbinding';
  if (code === 'no-speech' || code === 'audio-capture') return 'spraak.fout_niets_verstaan';

  return 'spraak.fout_algemeen';
}

/** Welke sleutel op de knop hoort, gegeven de stand. Zelfde vorm als `knopSleutel`. */
export function microfoonSleutel(luistert: boolean): Sleutel {
  return luistert ? 'spraak.stoppen' : 'spraak.starten';
}
