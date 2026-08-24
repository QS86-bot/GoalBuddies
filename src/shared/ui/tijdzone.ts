import { isGeldigeTijdzone, tijdzones } from '../time';

/**
 * Zoeken in de lijst met tijdzones — QS8-27, criterium 1.
 *
 * ⚠️ **Puur, zonder renderer**, om dezelfde reden als `risico.ts` en
 *    `metrics.ts`: het zoekgedrag ís hier de feature, en dat hoort testbaar te
 *    zijn zonder een scherm te tekenen. Wat er wél in `shared/time` staat is de
 *    lijst zelf — welke zones er bestaan is een tijdvraag (correctheidsregel 7),
 *    hoe je erin zoekt niet.
 */

/** Hoeveel voorstellen er hooguit onder het veld verschijnen. */
export const VOORSTELLEN_MAX = 8;

/**
 * De vorm waarin een zone te doorzoeken is.
 *
 * ⚠️ `America/New_York` moet te vinden zijn op "new york", en `Europe/Amsterdam`
 *    op "amsterdam". Zonder deze normalisatie zoekt de gebruiker op wat hij op
 *    zijn scherm ziet staan en vindt hij niets, want daar staat een liggend
 *    streepje waar hij een spatie typte.
 */
function zoekvorm(waarde: string): string {
  return waarde.toLowerCase().replaceAll('_', ' ').replaceAll('/', ' ');
}

/**
 * De tijdzones die bij deze zoekterm passen, hooguit `VOORSTELLEN_MAX`.
 *
 * ⚠️ **Zones waarvan de plaatsnaam met de term begint, staan vooraan.** Zoek je
 *    op "ams", dan hoort `Europe/Amsterdam` boven een zone waar "ams" toevallig
 *    middenin staat. Zonder die ordening is de eerste knop zelden de goede, en
 *    dan is een lijst van acht net zo onbruikbaar als een lijst van vierhonderd.
 *
 * ⚠️ **Een lege term geeft niets terug en niet de eerste acht.** Vierhonderd
 *    zones alfabetisch afkappen levert acht keer Afrika op, en dat leest als een
 *    kapotte lijst in plaats van als "typ iets".
 */
export function zoekTijdzones(
  term: string,
  alles: readonly string[] = tijdzones(),
): readonly string[] {
  const gezocht = zoekvorm(term.trim());
  if (gezocht === '') return [];

  const treffers = alles.filter((zone) => zoekvorm(zone).includes(gezocht));

  // De plaatsnaam is het deel achter de laatste schuine streep; daar zoekt een
  // mens op, niet op het werelddeel ervoor.
  const beginMet = (zone: string): boolean =>
    zoekvorm(zone.slice(zone.lastIndexOf('/') + 1)).startsWith(gezocht);

  return [...treffers]
    .sort((a, b) => {
      const verschil = Number(beginMet(b)) - Number(beginMet(a));
      return verschil !== 0 ? verschil : a.localeCompare(b);
    })
    .slice(0, VOORSTELLEN_MAX);
}

/**
 * Is deze ingetypte waarde zelf al een bruikbare zone?
 *
 * ⚠️ Bestaat voor het geval dat `Intl.supportedValuesOf` ontbreekt en
 *    `tijdzones()` dus leeg is. Dan is er geen lijst om uit te kiezen, maar
 *    `Intl.DateTimeFormat` kent de zone nog steeds — en dan mag je hem gewoon
 *    intypen. Zonder deze uitweg zou een ouder toestel helemaal geen tijdzone
 *    kunnen zetten, en dat is precies de gebruiker die het het hardst nodig
 *    heeft.
 */
export function isBruikbareZone(waarde: string): boolean {
  return isGeldigeTijdzone(waarde.trim());
}

