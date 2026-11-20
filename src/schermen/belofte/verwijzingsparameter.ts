/**
 * De parameter waarmee de vragenlijst naar de doelenlijst doorstuurt — QS8-762.
 *
 * ⚠️ **Een eigen klein bestand zonder imports**, zodat de vragenlijst het kan
 *    gebruiken zonder iets van het beloftescherm mee te trekken:
 *    `tests/beloftes/vragenlijst-maakt-geen-belofte.test.ts` volgt elke import
 *    vanaf de onboardingroutes en wordt rood zodra er `gaWeekbelofteAan` of
 *    `zetStraf` bereikbaar is. De parameter mag geen commitment-pad openen.
 * ⚠️ Besluit van Quinten (20-11-2026): de verwijzing verschijnt **alleen direct na het
 *    afronden van de vragenlijst**. Wie de doelenlijst opent zonder de vragenlijst
 *    te doorlopen, ziet haar niet, ook niet bij een eerdere keer afronden.
 */
export const VERWIJZING_PARAM = 'belofte';
const WAARDE = 'na-vragenlijst';

/** Waar `bewaar()` heen stuurt: de doelenlijst, met de vraag om de verwijzing. */
export function doelenNaVragenlijst() {
  return { pathname: '/doelen', params: { [VERWIJZING_PARAM]: WAARDE } } as const;
}

/** Vroeg de navigatie om de verwijzing? Alleen de exacte waarde telt, ook niet bij een lijst. */
export function verwijzingAangevraagd(waarde: string | readonly string[] | undefined): boolean {
  return waarde === WAARDE;
}
