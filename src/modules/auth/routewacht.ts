/**
 * Waar de routewacht iemand heen stuurt — als pure functie, zodat hij te toetsen is.
 *
 * ⚠️ **Dit stond in `app/_layout.tsx` en er is geen enkele test in `app/`.** De
 *    beslissing zelf is puur: uit sessie, profiel, laadstand en fout volgt één
 *    bestemming. Hij hier neerzetten maakt hem toetsbaar zonder renderer — dat
 *    is regel 18 vraag 3, want de belofte hieronder brak zonder dat er iets rood
 *    werd.
 *
 * ⚠️ **De belofte: een mislukte profielophaling is geen nieuwe gebruiker.**
 *    `profiel` is dan `null` en `isOnboarded(null)` is `false`. Tot 28-08 leidde
 *    dat iemand met zes weken reeks naar de onboarding, waar het formulier zich
 *    met standaardwaarden vulde en bij Bewaren `week_start_day = 1` over zijn
 *    instelling schreef. Dat is klok 1 van domeinregel 1, stilzwijgend verzet.
 *    Supabase pauzeert projecten op de gratis tier, dus dit is geen randgeval.
 */

/**
 * Onboarding-subroutes die bereikbaar blijven zodra `onboarded_at` gezet is.
 *
 * ⚠️ **Dit is de uitzondering die QS8-266 nodig maakte, en hij is met opzet een
 *    lijst.** `/onboarding/vragenlijst` komt ná het afronden (besluit A56): de
 *    onboarding is dan klaar en de vier vragen zijn een bonus die je mag
 *    wegklikken. De wacht zag alleen het eerste segment, vond `onboarding`, en
 *    stuurde iedereen die er aankwam op hetzelfde moment naar `/`. Elk schakeltje
 *    was af — het scherm, de kolommen, de patch — en de keten was nergens
 *    verbonden.
 *
 * ⚠️ **Wegsturen blijft het antwoord voor élke andere onboardingroute.** Wie hier
 *    iets aan toevoegt, zegt daarmee dat dat scherm ook ná het afronden zin
 *    heeft; dat is een besluit en geen vormkwestie.
 */
export const NA_ONBOARDING_BEREIKBAAR: readonly string[] = ['vragenlijst'];

/** Wat de wacht weet op het moment dat hij beslist. */
export interface Routestand {
  readonly heeftSessie: boolean;
  readonly sessieLaadt: boolean;
  readonly profielLaadt: boolean;
  /** De fout van de profielophaling, of `null`. */
  readonly profielFout: unknown;
  readonly isOnboarded: boolean;
  /** Het eerste segment van de huidige route. */
  readonly wortel: string;
  /** Het tweede segment van de huidige route, of `''`. */
  readonly tak: string;
}

/** De route waar de wacht heen stuurt, of `null` als hij niets doet. */
export type Bestemming = '/aanmelden' | '/onboarding/uitleg' | '/' | null;

export function bestemmingVoor(stand: Routestand): Bestemming {
  const opAanmelden = stand.wortel === 'aanmelden';
  const inOnboarding = stand.wortel === 'onboarding';
  const opUitnodiging = stand.wortel === 'uitnodiging';

  if (stand.sessieLaadt || stand.profielLaadt) return null;

  // Een uitnodigingslink is het eerste dat iemand van dit product ziet en blijft
  // altijd bereikbaar, ingelogd of niet.
  if (opUitnodiging) return null;

  if (!stand.heeftSessie) return opAanmelden ? null : '/aanmelden';

  // ⚠️ De tak die 28-08 ontbrak. Blijf staan waar je bent: het scherm eronder
  //    heeft zijn eigen foutstaat met een opnieuw-knop (onwrikbare regel 16).
  if (stand.profielFout !== null && stand.profielFout !== undefined) return null;

  if (!stand.isOnboarded) return inOnboarding ? null : '/onboarding/uitleg';

  // ⚠️ Niet élk onboardingscherm is klaar zodra `onboarded_at` staat — zie
  //    `NA_ONBOARDING_BEREIKBAAR`.
  const blijftNaAfronden = inOnboarding && NA_ONBOARDING_BEREIKBAAR.includes(stand.tak);

  return opAanmelden || (inOnboarding && !blijftNaAfronden) ? '/' : null;
}
