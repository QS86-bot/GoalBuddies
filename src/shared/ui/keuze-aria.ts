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
 *    `<button>` een `<div>`, en react-native-web laat de spatiebalk dan niet door (`isValidKeyPress`). Dat zit
 *    al in `Choice`, `Schakelaar` en `Afvinkcirkel` en lost deze helper niet op; zie
 *    `docs/decisions/2026-11-23-een-gekozen-keuzeknop-is-een-wisselknop-of-een-radio.md`.
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
