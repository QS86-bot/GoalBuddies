import { HELDVRAGEN } from '@/modules/helden';
// ⚠️ Rechtstreeks uit het vormbestand en niet uit de barrel: dit bestand is pure logica
//    en wordt zonder React Native getoetst.
import { alsVoortgang, type Voortgang } from '@/shared/ui/paginakop-vorm';

/**
 * De stappen van de vragenlijst — QS8-733.
 *
 * ⚠️ **Eén vraag per scherm, en de volgorde staat hier en nergens anders.** Vijf
 *    vragen die op `profiles` landen (focus, tijd, moment, valkuil, gevoel), vier
 *    heldenvragen, het voorbeeld van de herinnering en de samenvatting. Welke
 *    heldenvraag welke is bezit `modules/helden`; hier staat alleen waar ze
 *    beginnen.
 *
 * ⚠️ **De streep toont voortgang, nooit een score**: het aantal gedane stappen
 *    gedeeld door het aantal. Hij gaat via `alsVoortgang()` en is dus alleen te
 *    krijgen als waarde tussen 0 en 1 (domeinregel 10: voortgang stijgt).
 */
export type Stap = number;

export const FOCUS = 0;
export const TIJD = 1;
export const MOMENT = 2;
export const VALKUIL = 3;
export const GEVOEL = 4;
export const EERSTE_HELDVRAAG = 5;
/** Het voorbeeld van de herinnering staat vóór de samenvatting en dus vóór elke pushvraag. */
export const VOORBEELD = EERSTE_HELDVRAAG + HELDVRAGEN.length;
export const SAMENVATTING = VOORBEELD + 1;

/** Een stap is een vraag zolang hij vóór het voorbeeld ligt. */
export function isVraag(stap: Stap): boolean {
  return stap < VOORBEELD;
}

/** Stappen die een eigen schermvraag zijn: de vragen plus het voorbeeld. */
export function stapNummer(stap: Stap): number {
  return Math.min(stap, VOORBEELD) + 1;
}

export function aantalVragen(): number {
  return VOORBEELD;
}

/** 0 op de eerste stap, 1 op de samenvatting. */
export function stapVoortgang(stap: Stap): Voortgang | null {
  return alsVoortgang(Math.min(Math.max(stap, 0), SAMENVATTING) / SAMENVATTING);
}

export interface Beantwoord {
  readonly focus: boolean;
  readonly tijd: boolean;
  readonly moment: boolean;
  readonly valkuil: boolean;
  readonly gevoel: boolean;
}

/**
 * Waar iemand begint die terugkomt: de eerste vraag die nog open staat.
 *
 * ⚠️ Is alles beantwoord, dan begint hij bij de samenvatting en niet bij vraag 1:
 *    wie halverwege afhaakte en terugkomt, leest wat er staat en wat hij mist,
 *    zonder dat zijn antwoorden verloren zijn (acceptatiecriterium 7).
 */
export function beginStap(b: Beantwoord): Stap {
  if (!b.focus) return FOCUS;
  if (!b.tijd) return TIJD;
  if (!b.moment) return MOMENT;
  if (!b.valkuil) return VALKUIL;
  if (!b.gevoel) return GEVOEL;
  return SAMENVATTING;
}
