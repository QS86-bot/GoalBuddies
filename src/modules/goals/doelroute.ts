/**
 * Waar de doelroute op uitkomt zodra er een doel staat — QS8-229.
 *
 * ⚠️ **Waarom dit een functie is en geen string in twee schermen.** Er zijn twee
 *    manieren om een doel te maken — `/doel/plan` (de Doelcoach) en
 *    `/doel/nieuw` (het formulier) — en ze moeten allebei op dezelfde plek
 *    uitkomen. Doen ze dat niet, dan hangt het van je vertrekpunt af of je ooit
 *    gevraagd wordt wie dit met je meemaakt, en dan is de uitnodigingsstap een
 *    toevalligheid.
 *
 *    📏 Dat is niet hypothetisch: precies die asymmetrie tussen dezelfde twee
 *    schermen was QS8-383 — beide knoppen wezen naar het oude formulier terwijl
 *    de nieuwe route af en gemerged klaarlag. `plan.tsx` schrijft het sinds
 *    QS8-208 ook al bij `zelfInvullen()` op: twee kopieën van dezelfde URL zijn
 *    twee plekken waar de parameters uit de pas kunnen lopen.
 *
 * ⚠️ **De helper alleen is niet de grendel.** Een scherm dat hem negeert en zelf
 *    een pad typt, is even stil kapot als daarvoor. Daarom leest
 *    `tests/beloftes/wie-een-doel-maakt-krijgt-de-vraag.test.ts` de bestemmingen
 *    uit de schérmen en niet uit dit bestand — hetzelfde als
 *    `onboarding-eindigt-ergens.test.ts` doet, en om dezelfde reden.
 */

/** Het scherm dat vraagt wie dit met je meemaakt. */
export const SAMEN = '/doel/samen';

/**
 * De bestemming na het aanmaken van een doel.
 *
 * ⚠️ **`volledig` is geen vlag voor de vorm.** Landde er maar een deel van het
 *    plan, dan gaat de gebruiker naar het doel zelf en niet naar de
 *    uitnodigingsstap: hij moet dan eerst kunnen zien *wát* er ontbreekt. Een
 *    scherm dat om een buddy vraagt bovenop een half plan, vraagt het verkeerde
 *    op het verkeerde moment. `plan.tsx` besloot dat al vóór dit issue; die
 *    keuze staat hier nu met zoveel woorden in plaats van als een ternary in een
 *    scherm.
 */
export function naEenNieuwDoel(goalId: string, volledig = true): string {
  return volledig ? `${SAMEN}?doel=${encodeURIComponent(goalId)}` : `/doel/${goalId}`;
}
