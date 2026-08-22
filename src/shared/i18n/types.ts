/**
 * De talen die GoalBuddies kent — QS8-113.
 *
 * ⚠️ **Fase 1 is Nederlands en Engels.** De volgorde daarna staat in QS8-107:
 *    Duits en Frans, dan Spaans, Portugees en Pools. Een taal toevoegen is één
 *    catalogusbestand plus één regel hier; de test in `catalogus.test.ts` wordt
 *    rood zolang die catalogus niet compleet is, en dat is met opzet — een half
 *    vertaalde taal is erger dan een taal die er nog niet is.
 *
 * ⚠️ **Geen regiovarianten, en dat is een besluit.** `pt-BR` naast `pt-PT` of
 *    `es-ES` naast `es-419` is twee talen aan onderhoud voor één taal aan waarde
 *    (QS8-107). Blijkt een variant later toch nodig, dan komt hij erbij als eigen
 *    code — maar niet vooruitlopend.
 */
export const TALEN = ['nl', 'en'] as const;

export type Taal = (typeof TALEN)[number];

export const STANDAARDTAAL: Taal = 'nl';

/**
 * Hoe je iemand aanspreekt in deze taal.
 *
 * ⚠️ QS8-107 noemt dit expliciet: de je-vorm bestaat niet in elke taal.
 *    `du`/`Sie`, `tu`/`vous`. Voor vrienden onderling is tutoyeren juist; voor
 *    een app die binnen een bedrijf wordt uitgedeeld minder vanzelfsprekend.
 *    Het staat per taal vast en niet per gebruiker — een instelling erbij zou
 *    betekenen dat elke zin in twee varianten moet bestaan.
 */
export const AANSPREEKVORM: Readonly<Record<Taal, 'informeel' | 'formeel'>> = {
  nl: 'informeel',
  en: 'informeel',
};

export function isTaal(waarde: unknown): waarde is Taal {
  return typeof waarde === 'string' && (TALEN as readonly string[]).includes(waarde);
}
