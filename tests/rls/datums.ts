/**
 * Een streefdatum die niet verloopt — QS8-675.
 *
 * ⚠️ **Waarom dit bestaat.** Sinds migratie 0170 weigert `goals_insert` een
 *    streefdatum in het verleden (`target_date >= mijn_datum()`), en
 *    `vraag_deadline_verschuiving()` en `zet_streefdatum()` doen hetzelfde. Een
 *    vaste datum in een toets is dus een datum waarop de suite omvalt, zonder dat
 *    er iets aan de code veranderd is. 📏 Op 09-11-2026 stond `RLS-policies` rood
 *    op `main` omdat `beheerdersgrens.test.ts` `'2026-11-07'` gebruikte: twee dagen
 *    verleden, geschreven op 22-09 met een datum die toen ver weg leek. Het is de
 *    vierde keer dat een vaste datum in deze familie verliep (zie
 *    `tests/rls/seizoensmoment.ts`).
 *
 * ⚠️ **Marge.** `mijn_datum()` rekent in de tijdzone van de gebruiker, en die
 *    loopt van UTC-12 tot UTC+14: de lokale datum ligt tot een dag naast de
 *    UTC-datum. `dagen` moet dus minstens 2 zijn om de ondergrens nooit te raken.
 *    Wie een nabije datum zoekt, kiest een grotere waarde en niet een kleinere.
 *
 * `scripts/vaste-datum-controle.mjs` wordt rood zodra een toets toch weer een
 * vaste datum voor `target_date`, `p_new_date` of `p_date` zet die binnen
 * 120 dagen verloopt.
 */
export function datumOver(dagen: number): string {
  if (!Number.isInteger(dagen) || dagen < 2) {
    throw new Error(`datumOver(${dagen}): minstens 2 dagen, anders raakt een tijdzone de ondergrens van 0170.`);
  }
  const nu = new Date();
  const dag = new Date(Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth(), nu.getUTCDate() + dagen));
  return dag.toISOString().slice(0, 10);
}
