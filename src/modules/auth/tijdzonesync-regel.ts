import { normaliseerZone } from '../../shared/time';

/**
 * De regel achter `useTijdzoneSync()` — QS8-472.
 *
 * ⚠️⚠️ **Een eigen bestand, en dat is een meting en geen smaak.** De hook
 *    importeert `ProfielProvider`, die trekt `lib/supabase` mee, en die trekt
 *    react-native mee. 📏 Nagemeten: een test die `useTijdzoneSync.ts`
 *    importeert valt om met `RolldownError: Flow is not supported` op
 *    `node_modules/react-native/index.js` — `vitest` draait hier op
 *    `environment: 'node'`. Dat is dezelfde grens die `modules/auth/react.ts`
 *    sinds QS8-423 beschrijft, één laag dieper.
 *
 *    Zonder deze splitsing is het oordeel hieronder niet te testen, en dan is de
 *    enige grendel eronder het lezen van de code. Onwrikbare regel 18, vraag 3:
 *    een belofte die groen kan blijven terwijl ze breekt, bewaakt niets.
 */

/**
 * Moet de zone van het apparaat weggeschreven worden?
 *
 * ⚠️ **Apart van de hook omdat dit de énige logica hier is en een hook in deze
 *    suite niet te renderen valt** — `vitest` draait op `environment: 'node'` en
 *    er is geen testing-library. Zou dit oordeel in het effect blijven zitten,
 *    dan was het alleen met de hand te controleren, en dat is precies de vorm
 *    waar onwrikbare regel 18 vraag 3 over gaat: een belofte die groen kan
 *    blijven terwijl ze breekt.
 *
 * ⚠️ `geprobeerd` telt ook ná een mislukte poging mee. Een structureel falende
 *    schrijfactie is anders een oneindige lus tegen PostgREST, en
 *    `max_connections` is 60 voor de héle database.
 */
export function moetSynchroniseren({
  opgeslagen,
  apparaat,
  geprobeerd,
}: {
  /** Wat er nu in `profiles.tz` staat. Leeg betekent: nog nooit gezet. */
  readonly opgeslagen: string;
  /** Wat `apparaatTijdzone()` teruggaf — altijd een geldige zone. */
  readonly apparaat: string;
  /** De zone die we voor deze gebruiker al aangeboden hebben, of `null`. */
  readonly geprobeerd: string | null;
}): boolean {
  if (geprobeerd === apparaat) return false;
  if (opgeslagen === '') return true;

  // ⚠️ Vergelijken op de kanonieke vorm: `Intl` accepteert `europe/amsterdam`,
  //    en dan zou een profiel dat prima werkt bij elke start herschreven worden.
  return normaliseerZone(opgeslagen) !== apparaat;
}
