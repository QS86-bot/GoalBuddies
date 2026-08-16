/**
 * Het enige punt in de app waar "nu" vandaan komt.
 *
 * ⚠️ CLAUDE.md, correctheidsregel 7. De lint-regel blokkeert `new Date()` en
 *    `Date.now()` buiten deze module; `now()` is de vervanger. Alle andere
 *    functies in `shared/time` nemen het moment als parameter, juist zodat ze
 *    deterministisch te testen zijn. Roep `now()` dus zo laat mogelijk aan — aan
 *    de rand van een scherm of een job — en geef het resultaat door naar beneden.
 */

let frozen: Date | undefined;

/** Het huidige moment in UTC. */
export function now(): Date {
  return frozen ?? new Date();
}

/**
 * Zet de klok vast op één moment. Uitsluitend voor tests: een testsuite die van
 * de echte klok afhangt, faalt ooit op een dinsdag om middernacht.
 *
 * Geeft de opruimfunctie terug, zodat `afterEach(freezeNow(t))` niet kan lekken.
 */
export function freezeNow(at: Date): () => void {
  frozen = at;
  return unfreezeNow;
}

/** Draait `freezeNow` terug. */
export function unfreezeNow(): void {
  frozen = undefined;
}
