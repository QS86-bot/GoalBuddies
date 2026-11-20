/**
 * Verschijnt de verwijzing naar de weekbelofte na de vragenlijst? — QS8-762.
 *
 * ⚠️ **Alleen als er al een groep of een getuige is** (criterium 1). De vragenlijst
 *    maakt zelf nooit een commitment (besluit 3 van de poort QS8-744); deze functie
 *    beslist alleen of er naar de aparte bevestigstap van QS8-761 gewezen wordt.
 * ⚠️ Los van de bron: de aanroeper levert de aantallen uit dezelfde ophaalactie als
 *    het beloftescherm, zodat de verwijzing en het scherm nooit iets anders zeggen.
 */
export function toonBelofteverwijzing(kandidaten: {
  readonly groepen: number;
  readonly getuigen: number;
}): boolean {
  return kandidaten.groepen > 0 || kandidaten.getuigen > 0;
}
