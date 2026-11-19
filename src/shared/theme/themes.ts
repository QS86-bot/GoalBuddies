import type { ColorSchemeName } from 'react-native';

import {
  afstandVoor,
  roles,
  shadow,
  type Afstandsschaal,
  type Categoriekleuren,
  type Heldpalet,
  type Palette,
} from './tokens';
import {
  schaduwVoor,
  UITERLIJKEN,
  type Modus,
  type UiterlijkId,
  type Verloop,
} from './uiterlijken';

/** De twee thema's van het Q-Projects navy-stelsel. */

export interface Theme {
  readonly name: 'navy' | 'navy-licht';
  readonly dark: boolean;
  readonly colors: Palette;
  readonly roles: ReturnType<typeof roles>;
  /**
   * De kleur per categoriefamilie — besluit A55.
   *
   * ⚠️ Staat naast `colors` en niet erin, omdat `Palette` het gedeelde
   *    Q-Projects-stelsel is en dit een uitbreiding van GoalBuddies. Zie de kop
   *    bij `Categoriekleuren` in `tokens.ts`.
   */
  readonly families: Categoriekleuren;
  /**
   * Het kleurenpaar per held — QS8-470.
   *
   * ⚠️ Staat naast `families` en niet erin: dit is de benoemde uitzondering op
   *    het Q-Projects-stelsel en geldt alleen voor heldenoppervlakken. Zie de
   *    kop bij `Heldkleuren` in `tokens.ts`.
   */
  readonly helden: Heldpalet;
  readonly shadow: (typeof shadow)['navy'] | (typeof shadow)['navyLight'];
  /** Welk uiterlijk dit is (QS8-731): `B` voor het huidige stelsel, `C-baai` enzovoort voor de kleurvarianten. */
  readonly uiterlijk: UiterlijkId;
  /** Het verloop van uiterlijk C; `null` voor A en B, die vlak blijven. */
  readonly verloop: Verloop | null;
  /** De afstandsschaal bij de gekozen dichtheid. Ruim is de schaal uit `tokens.ts`, compact is kleiner. */
  readonly afstand: Afstandsschaal;
  /** Mogen prestatiekaarten emoji tonen? Alleen die; nooit de emoji die een gebruiker zelf typt (QS8-732). */
  readonly emoji: boolean;
}

/**
 * ⚠️ Afgeleid van `UITERLIJKEN` en niet nog eens samengesteld (QS8-723): zo bestaat elk uiterlijk op één
 *    plek, en kan een wijziging aan een palet niet ongemerkt afwijken van wat de app toont.
 *
 * `name` is het oude modusetiket (`navy` = donker, `navy-licht` = licht) en zegt niets over de stijl; wie het
 * uiterlijk wil weten leest `uiterlijk`.
 */
function themaVan(id: UiterlijkId, modus: Modus, dichtheid: Dichtheid, emoji: boolean): Theme {
  const u = UITERLIJKEN[id][modus];
  return {
    name: modus === 'donker' ? 'navy' : 'navy-licht',
    dark: modus === 'donker',
    colors: u.colors,
    roles: u.roles,
    families: u.families,
    helden: u.helden,
    shadow: schaduwVoor(modus),
    uiterlijk: id,
    verloop: u.verloop,
    afstand: afstandVoor(dichtheid),
    emoji,
  };
}

export const navyTheme: Theme = themaVan('B', 'donker', 'ruim', true);

export const navyLightTheme: Theme = themaVan('B', 'licht', 'ruim', true);

/**
 * Het thema dat bij een systeemvoorkeur hoort.
 *
 * Donker is de primaire modus van dit stelsel, dus dat is de terugval zodra het
 * systeem niets zegt: React Native levert dan 'unspecified'.
 */
export function themeFor(scheme: ColorSchemeName): Theme {
  return scheme === 'light' ? navyLightTheme : navyTheme;
}

export type Dichtheid = 'ruim' | 'compact';

/**
 * Wat de gebruiker kiest, in de vorm die het thema kent (QS8-731).
 *
 * ⚠️ **Een eigen type en geen import uit `modules/uiterlijk`**: de gedeelde laag importeert niets uit de
 *    datalaag. `Uiterlijkvoorkeur` is hieraan toewijsbaar, en `UiterlijkProvider` geeft hem door als prop; krijgt
 *    de module een waarde erbij, dan is dat daar een typefout en geen stille terugval.
 */
export interface Themakeuze {
  readonly stijl: 'a' | 'b' | 'c';
  readonly kleurvariant: 'geen' | 'baai' | 'avondgloed' | 'bosrand' | 'pruim' | 'koraal';
  readonly weergave: 'donker' | 'licht' | 'systeem';
  readonly dichtheid: Dichtheid;
  readonly emoji: boolean;
}

/** B, donker, ruim, emoji aan: wat een gebruiker krijgt die nooit iets koos. Kopie van `STANDAARD_VOORKEUR`. */
export const STANDAARD_THEMAKEUZE: Themakeuze = {
  stijl: 'b',
  kleurvariant: 'geen',
  weergave: 'donker',
  dichtheid: 'ruim',
  emoji: true,
};

/**
 * Het uiterlijk bij een stijl en een variant. Stijl C zonder variant (of met een onbekende) is Baai, de
 * terugval van de module; A en B kennen geen variant en negeren hem.
 */
export function uiterlijkIdVoor(stijl: Themakeuze['stijl'], variant: Themakeuze['kleurvariant']): UiterlijkId {
  if (stijl === 'a') return 'A';
  if (stijl === 'b') return 'B';
  const id: UiterlijkId = `C-${variant === 'geen' ? 'baai' : variant}`;
  return id in UITERLIJKEN ? id : 'C-baai';
}

export function themeVoorKeuze(keuze: Themakeuze, scheme: ColorSchemeName): Theme {
  const modus: Modus =
    keuze.weergave === 'systeem' ? (scheme === 'light' ? 'licht' : 'donker') : keuze.weergave;
  return themaVan(uiterlijkIdVoor(keuze.stijl, keuze.kleurvariant), modus, keuze.dichtheid, keuze.emoji);
}
