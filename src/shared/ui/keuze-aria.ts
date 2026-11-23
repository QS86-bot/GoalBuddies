/**
 * Wat een knop over zijn stand tegen een schermlezer zegt: QS8-794 en QS8-803.
 *
 * ⚠️ **Op web komt alleen de losse `aria-*`-prop in de DOM.** react-native-web 0.21 leest
 *    `accessibilityState` niet. Dat geldt voor élke sleutel, niet alleen `selected`: gemeten in QS8-803 voor
 *    `selected`, `checked`, `expanded` en `busy` (alleen `disabled` komt er wel door, omdat react-native-web
 *    die uit de `disabled`-prop haalt). Op native is het omgekeerd: daar is `accessibilityState` de weg.
 *
 * ⚠️ **Twee bronnen per knop, en dat is een bekende zwakte.** Alleen `Button` (QS8-794) haalt beide kanten uit
 *    deze helper. De componenten van QS8-803 nemen alleen `aria` en houden hun eigen `accessibilityState`
 *    ernaast, omdat native in dat issue met opzet niet veranderd is: niet te meten. Die twee kunnen dus uit
 *    elkaar lopen, en bij `Choice` doen ze dat al bewust: native `selected`, web `aria-checked`.
 *
 * ⚠️ **Eén vertaaltabel, `ARIA`.** Wie een stand aan een knop hangt, hangt hem hier aan, en nergens anders.
 *
 *    | stand      | web             | waarom                                                              |
 *    |------------|-----------------|---------------------------------------------------------------------|
 *    | `selected` | `aria-pressed`  | een gekozen knop is een wisselknop (QS8-794); `aria-selected` is op |
 *    |            |                 | `role="button"` geen geldige ARIA en een schermlezer zegt hem niet   |
 *    | `checked`  | `aria-checked`  | radio, schakelaar en vinkje                                         |
 *    | `expanded` | `aria-expanded` | een knop die een menu opent                                         |
 *    | `busy`     | `aria-busy`     | een knop die iets aan het doen is (opslaan); niet voor een stand die |
 *    |            |                 | aan of uit staat: `aria-busy` stelt het voorlezen uit             |
 *
 * ⚠️ **Een radio geeft op web `checked` door, nooit `selected`.** Anders draagt hij `aria-pressed`, en dat is
 *    op een radio betekenisloos.
 *
 * ⚠️ **Een radio is nog geen goede radio op web.** `role="radio"`, `"switch"` en `"checkbox"` maken van de
 *    `<button>` een `<div>`, en react-native-web laat de spatiebalk dan niet door (`isValidKeyPress`). Sinds
 *    QS8-804 vangt `spatieActiveert()` hieronder dat op; zie
 *    `docs/decisions/2026-11-23-een-gekozen-keuzeknop-is-een-wisselknop-of-een-radio.md` en
 *    `docs/decisions/2026-11-23-de-spatiebalk-op-een-rol-die-geen-knop-is.md`.
 *
 * Het bestand importeert geen `react-native`, zodat het zonder renderer te toetsen is.
 */

/** De standen die een knop kan hebben, met de namen van `accessibilityState`. */
export interface Stand {
  readonly selected?: boolean | undefined;
  readonly checked?: boolean | undefined;
  readonly expanded?: boolean | undefined;
  readonly busy?: boolean | undefined;
}

const ARIA = {
  selected: 'aria-pressed',
  checked: 'aria-checked',
  expanded: 'aria-expanded',
  busy: 'aria-busy',
} as const satisfies Record<keyof Stand, string>;

type AriaNaam = (typeof ARIA)[keyof typeof ARIA];

export interface StandEigenschappen {
  /** Wat in `accessibilityState` erbij hoort; native leest dit, web negeert het. */
  readonly state: Stand;
  /** De losse `aria-*`-props; alleen gevuld op web, en alleen voor de standen die meegegeven zijn. */
  readonly aria: Readonly<Partial<Record<AriaNaam, boolean>>>;
}

/**
 * De eigenschappen die een knop voor zijn stand op zijn `Pressable` zet.
 *
 * `state` gaat altijd mee; `aria` alleen op web, want op native is een onbekende prop ruis. Een stand die
 * `undefined` is, komt in geen van beide: een knop zonder stand zegt er niets over.
 */
export function standEigenschappen(stand: Stand, web: boolean): StandEigenschappen {
  const state: Record<string, boolean> = {};
  const aria: Partial<Record<AriaNaam, boolean>> = {};
  for (const sleutel of Object.keys(ARIA) as (keyof Stand)[]) {
    const waarde = stand[sleutel];
    if (waarde === undefined) continue;
    state[sleutel] = waarde;
    if (web) aria[ARIA[sleutel]] = waarde;
  }
  return { state, aria };
}

export interface KeuzeEigenschappen {
  readonly state: { readonly selected: boolean };
  readonly aria: { readonly 'aria-pressed'?: boolean };
}

/** De gekozen stand van `Button` (QS8-794): `standEigenschappen` met alleen `selected`. */
export function keuzeEigenschappen(gekozen: boolean, web: boolean): KeuzeEigenschappen {
  const pressed = standEigenschappen({ selected: gekozen }, web).aria['aria-pressed'];
  return { state: { selected: gekozen }, aria: pressed === undefined ? {} : { 'aria-pressed': pressed } };
}

/**
 * Wat een toetsaanslag van react-native-web meegeeft; structureel getypt, zodat dit bestand geen `react-native`
 * importeert.
 */
export interface Toetsaanslag {
  readonly key: string;
  readonly repeat?: boolean;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly nativeEvent?: { readonly isComposing?: boolean } | undefined;
  preventDefault(): void;
  stopPropagation(): void;
}

/**
 * Is dit een spatie die van de knop is? Niet met Ctrl, Alt of Meta (dat is een sneltoets van het systeem) en
 * niet tijdens het samenstellen van een teken (IME). Shift+Spatie wel, zoals op een `<button>`.
 */
export function isSpatie(e: Toetsaanslag): boolean {
  if (e.key !== ' ' && e.key !== 'Spacebar') return false;
  if (e.altKey === true || e.ctrlKey === true || e.metaKey === true) return false;
  return e.nativeEvent?.isComposing !== true;
}

/**
 * De spatiebalk voor een knop met rol `radio`, `switch` of `checkbox` op web — QS8-804.
 *
 * ⚠️ **Waarom dit nodig is.** react-native-web 0.21 maakt alleen bij rol `button` een `<button>`
 *    (`propsToAccessibilityComponent`), en laat de spatie alleen op een `<button>` of rol `button` door
 *    (`PressResponder.isValidKeyPress`). Op deze drie rollen werkte dus alleen Enter, en scrolde een spatie de
 *    pagina. De rol blijft staan: een `<button role="radio">` is via `Pressable` niet te maken.
 *
 * ⚠️ **Alleen de spatie.** Enter loopt via react-native-web zelf; zou deze helper hem ook afhandelen, dan
 *    activeert Enter twee keer.
 *
 * ⚠️ **Activeren op keydown, één keer.** Een ingedrukt gehouden spatie (`repeat`) activeert niet opnieuw, en
 *    een uitgeschakelde of bezige knop activeert niet. Beide krijgen wél `preventDefault()`: de focus kan op een
 *    knop staan die net bezig werd, en dan mag de pagina evenmin scrollen.
 *
 * Op native geeft dit niets: daar is geen spatiebalk die react-native-web wegfiltert.
 */
export function spatieActiveert(
  onPress: () => void,
  uitgeschakeld: boolean,
  web: boolean,
): { readonly onKeyDown?: (e: Toetsaanslag) => void } {
  if (!web) return {};
  return {
    onKeyDown: (e: Toetsaanslag) => {
      if (!isSpatie(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat === true || uitgeschakeld) return;
      onPress();
    },
  };
}
