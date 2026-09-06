import { isGeldigeTijdzone, tijdzones } from '../time';

import { TIJDZONE_ALIASSEN } from './tijdzone-aliassen';

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
  return waarde
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replaceAll('_', ' ')
    .replaceAll('/', ' ')
    .replaceAll("'", '');
}

/**
 * Zone → de termen waarop hij óók te vinden is.
 *
 * ⚠️ Eén keer opgebouwd. De tabel verandert binnen een sessie niet, en het
 *    alternatief is bij elke toetsaanslag over een paar honderd sleutels lopen.
 */
const aliassenPerZone: ReadonlyMap<string, readonly string[]> = (() => {
  const kaart = new Map<string, string[]>();
  for (const [term, zone] of Object.entries(TIJDZONE_ALIASSEN)) {
    const bestaand = kaart.get(zone);
    if (bestaand === undefined) kaart.set(zone, [zoekvorm(term)]);
    else bestaand.push(zoekvorm(term));
  }
  return kaart;
})();

/**
 * De zones waarin gezocht wordt als het platform er zelf geen kent.
 *
 * ⚠️ **Dit is de tweede helft van QS8-212.** Zonder
 *    `Intl.supportedValuesOf` geeft `tijdzones()` met opzet een lege lijst — dat
 *    contract staat in `shared/time` en blijft zo. Maar een lege lijst betekende
 *    ook een lege zoekopdracht, en dan werkte alleen nog de letterlijke
 *    zonenaam: precies de gebruiker met een ouder toestel, van wie de klok het
 *    vaakst niet klopt.
 *
 * ⚠️ **Gefilterd op wat `Intl.DateTimeFormat` wél aankan.** Die kent de zone ook
 *    op een toestel dat hem niet opsomt — dat is dezelfde waarneming waar
 *    `isBruikbareZone()` op leunt. Een voorstel dat het toestel niet kan
 *    gebruiken, hoort er niet te staan.
 */
function terugvalzones(): readonly string[] {
  return [...new Set(Object.values(TIJDZONE_ALIASSEN))].filter(isGeldigeTijdzone).sort();
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

  const lijst = alles.length > 0 ? alles : terugvalzones();
  const aliassen = (zone: string): readonly string[] => aliassenPerZone.get(zone) ?? [];

  const treffers = lijst.filter(
    (zone) =>
      zoekvorm(zone).includes(gezocht) || aliassen(zone).some((a) => a.includes(gezocht)),
  );

  // ⚠️ **Drie rangen en niet twee, en dat is een gemeten correctie.** De eerste
  //    versie liet een alias net zo zwaar tellen als een echte plaatsnaam. Toen
  //    zakte `Pacific/Auckland` bij het zoeken op "a" uit de eerste vier, want
  //    "antwerpen", "ankara" en "atlanta" duwden hun zones ernaast omhoog. Een
  //    alias hoort te helpen waar de lijst niets heeft — niet de lijst
  //    verdringen waar hij wél wat heeft.
  //
  //    De plaatsnaam is het deel achter de laatste schuine streep; daar zoekt
  //    een mens op, niet op het werelddeel ervoor.
  const rang = (zone: string): number => {
    if (zoekvorm(zone.slice(zone.lastIndexOf('/') + 1)).startsWith(gezocht)) return 0;
    if (aliassen(zone).some((a) => a.startsWith(gezocht))) return 1;
    return 2;
  };

  return [...treffers]
    .sort((a, b) => {
      const verschil = rang(a) - rang(b);
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

