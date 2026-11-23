/**
 * Waar de vragenlijst vandaan geopend is — QS8-817.
 *
 * ⚠️ **Besluit Quinten (23-11-2026, 17:06 UTC, meerkeuze (ii)):** wie de vragenlijst
 *    via de vaste ingang op Profiel opent, gaat na "Bewaren en verder" terug naar
 *    Profiel, zonder de verwijzing naar de belofte (QS8-762). De terugknop wijst dan
 *    ook naar Profiel. Elke andere weg erheen (na de onboarding, de kaart op Vandaag)
 *    houdt het eindpunt dat hij had: `/doelen?belofte=na-vragenlijst`.
 *
 * ⚠️ **Een allowlist van één waarde.** Alleen precies `van=profiel` telt; een lijst,
 *    een andere waarde of geen parameter valt terug op het oude eindpunt. Zo kan
 *    een link van buiten de vragenlijst nergens anders heen sturen dan naar een van
 *    de twee vaste plekken.
 *
 * ⚠️ Geen imports, net als `../belofte/verwijzingsparameter.ts`: dit bestand is pure
 *    logica en wordt zonder React Native getoetst.
 */
export const HERKOMST_PARAM = 'van';
const PROFIEL = 'profiel';

/** De vragenlijst, geopend vanaf de vaste ingang op Profiel. */
export function vragenlijstVanafProfiel() {
  return { pathname: '/onboarding/vragenlijst', params: { [HERKOMST_PARAM]: PROFIEL } } as const;
}

/** Kwam de gebruiker via de vaste ingang op Profiel? Alleen de exacte waarde telt. */
export function komtVanProfiel(waarde: string | readonly string[] | undefined): boolean {
  return waarde === PROFIEL;
}
