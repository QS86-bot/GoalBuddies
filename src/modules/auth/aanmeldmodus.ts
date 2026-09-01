/**
 * Waarop het aanmeldscherm opent — als pure functie, zodat hij te toetsen is.
 *
 * ⚠️ **Waarom dit een eigen bestand is en geen `useState(false)`.** De stand
 *    stond in één boolean (`nieuw`) die op `true` begon, en die ene `true`
 *    bepaalde de titel, de knop, de wachtwoordhint én `autoComplete`. Wie
 *    uitlogde kwam op *"Account maken"* terug — en de wachtwoordmanager bood
 *    daardoor een **nieuw** wachtwoord aan in plaats van het opgeslagene. Dat is
 *    de echte kostenpost: je krijgt niet de suggestie die je nodig hebt
 *    (QS8-248).
 *
 * ⚠️ **De standaard hoort het veelvoorkomende geval te zijn.** Een gebruiker
 *    maakt één keer een account en logt daarna honderden keren in.
 *
 * ⚠️ **En dit is dezelfde beweging als `routewacht.ts`.** Er is geen enkele test
 *    in `app/` en geen renderer in dit project, dus zolang de beslissing in een
 *    `useState` in een scherm zit, is ze niet te toetsen. Puur is ze dat wel:
 *    uit de routeparameters volgt één modus.
 */

/** Waarop het scherm staat. Een naam leest beter dan een boolean die `nieuw` heet. */
export type Aanmeldmodus = 'inloggen' | 'aanmelden';

/**
 * De parameters zoals `useLocalSearchParams()` ze geeft.
 *
 * ⚠️ Een waarde kan een `string[]` zijn — expo-router geeft dat bij een
 *    herhaalde parameter (`?nieuw=1&nieuw=0`). Vandaar `unknown` en een eigen
 *    weging hieronder in plaats van een cast die belooft wat er niet staat.
 */
export type Routeparameters = Readonly<Record<string, unknown>>;

/**
 * De waarden die "ja, ik ben nieuw" betekenen.
 *
 * ⚠️ **Bewust een lijst en geen aanwezigheidstoets.** `params.nieuw !== undefined`
 *    ziet er korter uit en maakt `?nieuw=0` óók een aanmeldscherm — precies het
 *    tegenovergestelde van wat er staat. Wie een link met de hand typt, typt
 *    vaker `0` dan dat hij de parameter weglaat.
 */
const JA: readonly string[] = ['1', 'true', 'ja'];

/**
 * Waarop het aanmeldscherm opent, gegeven de route.
 *
 * **Inloggen, tenzij de route ondubbelzinnig om aanmelden vraagt.** Alles wat
 * niet één heldere ja is — geen parameter, een lege waarde, een onbekende
 * waarde, of meerdere waarden tegelijk — valt terug op inloggen.
 *
 * ⚠️ **Meerdere waarden is met opzet géén "pak de eerste".** CLAUDE.md-vraag 6:
 *    `[0]` op een lijst die er ook twee kan bevatten, kiest er stilzwijgend een.
 *    `?nieuw=1&nieuw=0` is geen ondubbelzinnige ja, dus wint de standaard — en
 *    de standaard is hier ook de veilige kant, want inloggen laat je met één tik
 *    door naar aanmelden en niemand raakt iets kwijt.
 */
export function beginModus(params: Routeparameters | null | undefined): Aanmeldmodus {
  const waarde = params?.['nieuw'];
  if (typeof waarde !== 'string') return 'inloggen';
  return JA.includes(waarde.trim().toLowerCase()) ? 'aanmelden' : 'inloggen';
}

/** De andere stand — de wisselknop, zonder dat het scherm de namen hoeft te kennen. */
export function andereModus(modus: Aanmeldmodus): Aanmeldmodus {
  return modus === 'inloggen' ? 'aanmelden' : 'inloggen';
}

/**
 * De route die rechtstreeks op het aanmeldformulier uitkomt.
 *
 * ⚠️ **Eén plek die het pad schrijft, want er zijn twee soorten aanroepers.** De
 *    routewacht stuurt een uitgelogde bezoeker naar `/aanmelden` (inloggen, de
 *    standaard); een uitnodigingslink hoort meteen op aanmelden uit te komen.
 *    Zou elke aanroeper zijn eigen querystring plakken, dan is een typefout in
 *    `?nieuw=1` stil: je komt gewoon op inloggen en niemand merkt het.
 */
export const ROUTE_AANMELDEN = '/aanmelden?nieuw=1' as const;
