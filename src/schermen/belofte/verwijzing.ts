/**
 * Verschijnt de verwijzing naar de weekbelofte na de vragenlijst? — QS8-762.
 *
 * ⚠️ **Alleen als er al een groep of een getuige is** (criterium 1). De vragenlijst
 *    maakt zelf nooit een commitment (besluit 3 van de poort QS8-744); deze functie
 *    beslist alleen of er naar de aparte bevestigstap van QS8-761 gewezen wordt.
 * ⚠️ Los van de bron: de aanroeper levert de aantallen uit dezelfde ophaalactie als
 *    het beloftescherm, zodat de verwijzing en het scherm nooit iets anders zeggen.
 */
export function toonBelofteverwijzing(kandidaten: { readonly groepen: number; readonly getuigen: number }): boolean {
  return kandidaten.groepen > 0 || kandidaten.getuigen > 0;
}

/**
 * Het ene doel waar de verwijzing heen wijst, of `null` — besluit van Quinten,
 * 20-11-2026: alleen bij **precies één actief eigen doel**.
 *
 * ⚠️ Het totaal komt uit de telling van de database en niet uit de getoonde rijen:
 *    op de eerste pagina zijn die gelijk, maar bij eenentwintig doelen toont
 *    pagina 0 er twintig en zegt `rijen.length` iets anders dan `totaal`. Beide
 *    moeten één zijn, en alleen op de eerste pagina.
 */
export function verwijzingsdoel(lijst: {
  readonly paginaNr: number;
  readonly totaal: number | undefined;
  readonly doelIds: readonly string[];
}): string | null {
  if (lijst.paginaNr !== 0 || lijst.totaal !== 1 || lijst.doelIds.length !== 1) return null;
  return lijst.doelIds[0] ?? null;
}
