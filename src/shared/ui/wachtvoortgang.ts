/**
 * Wat een scherm laat zien terwijl de Doelcoach nadenkt — QS8-208.
 *
 * ⚠️ **Zonder imports, en dat is dezelfde reden als bij `beweging.ts`.** De
 *    belofte hieronder is niet "er staat een mooie balk" maar "er is altijd
 *    zichtbare voortgang, ook zonder animatie". Dat is een eigenschap van een
 *    beslissing en niet van een component, en beslissingen horen toetsbaar te
 *    zijn zonder renderer. Er is in dit project geen React-testbibliotheek; wat
 *    in een `.tsx` staat, staat per definitie buiten de suite.
 *
 * ⚠️ **De duur is gemeten en niet geschat.** De AI-call duurt ongeveer twintig
 *    seconden — gemeten op 21-08-2026, en dat getal staat ook in de kop van
 *    `app/doel/coach/[id].tsx`. Het pollen loopt in rondes van twee seconden tot
 *    maximaal zestig, dus twee minuten is de bovengrens en twintig seconden de
 *    verwachting. Die twee zijn niet hetzelfde en de balk hoort naar de
 *    verwachting te lopen: een balk die in twee minuten volloopt staat na twintig
 *    seconden op een zesde, terwijl het antwoord er dan is.
 *
 * ⚠️ **En daarom mag hij ook niet op 100% blijven hangen.** Een balk die vol
 *    staat terwijl er niets gebeurt, is precies het beeld van een vastgelopen app
 *    dat deze wijziging moet wegnemen. Voorbij de verwachting is de eerlijke
 *    boodschap "dit duurt langer dan gewoonlijk" en niet een vollere balk.
 */

/** De verwachte duur van een coach-call, in milliseconden. Gemeten, niet geschat. */
export const VERWACHTE_WACHT_MS = 20_000;

/** Hoe het wachten er op dit moment voor staat. */
export type Wachtfase = 'loopt' | 'duurt_langer';

export interface Wachtstand {
  /** 0 tot en met 1. Loopt nooit voorbij 1. */
  readonly deel: number;
  /** Hele verstreken seconden, voor een tekstuele teller. */
  readonly seconden: number;
  readonly fase: Wachtfase;
  /** Welke stap er nu getoond wordt, als index in de meegegeven lijst. */
  readonly stap: number;
}

/**
 * De stand van het wachten op grond van de verstreken tijd.
 *
 * ⚠️ **De stap wisselt op tijd en doet niet alsof hij een serverstatus is.** Dat
 *    is met opzet en het staat zo in het issue: drie stappen maken twintig
 *    seconden korter dan één zin dat doet, maar suggereren dat "stappen bedenken"
 *    daadwerkelijk aan de gang is terwijl niemand dat weet, is liegen tegen de
 *    gebruiker. De namen beschrijven wat de coach dóét, in de volgorde waarin hij
 *    het doet; de klok bepaalt wanneer ze wisselen.
 *
 * ⚠️ `stappen <= 0` geeft `-1`, en dat is geen index maar "geen stap". Een `0`
 *    teruggeven zou de aanroeper naar `lijst[0]` van een lege lijst sturen.
 */
export function wachtstand(
  verstrekenMs: number,
  verwachtMs: number,
  stappen: number,
): Wachtstand {
  const verstreken = Math.max(0, verstrekenMs);
  const verwacht = Math.max(1, verwachtMs);

  const stapDuur = verwacht / Math.max(1, stappen);
  const stap =
    stappen <= 0 ? -1 : Math.min(stappen - 1, Math.floor(verstreken / stapDuur));

  return {
    deel: Math.min(1, verstreken / verwacht),
    seconden: Math.floor(verstreken / 1000),
    fase: verstreken > verwacht ? 'duurt_langer' : 'loopt',
    stap,
  };
}

/** Welke signalen er op het scherm horen te staan. */
export interface Voortgangsweergave {
  readonly balk: boolean;
  /** De secondenteller in tekst. */
  readonly teller: boolean;
  /** Animatieduur in ms; 0 betekent geen overgang. */
  readonly animatieMs: number;
}

/**
 * Wat er zichtbaar is, gegeven de bewegingsvoorkeur van de gebruiker.
 *
 * ⚠️ **De belofte is dat er áltijd iets zichtbaars is.** Het issue zegt het met
 *    zoveel woorden: val bij een uitgezette voorkeur terug op een tekstuele
 *    teller *in plaats van op niets*. De valkuil is dat je "verminder beweging"
 *    leest als "laat de voortgang weg" — dan kijkt precies de gebruiker die het
 *    minst aan een animatie heeft, twintig seconden naar stilstaande tekst.
 *
 * ⚠️ **De balk blijft ook bij verminderde beweging staan.** Hij springt dan
 *    zonder overgang, en dat is geen animatie: `bewegingsStijl()` maakt
 *    hetzelfde onderscheid voor de voortgangsbalken die er al zijn. Wat erbij
 *    komt is de teller, zodat de voortgang ook af te lezen is als je de sprong
 *    niet ziet.
 */
export function voortgangsweergave(reduced: boolean): Voortgangsweergave {
  return {
    balk: true,
    teller: reduced,
    animatieMs: reduced ? 0 : 400,
  };
}
