// ⚠️ GEGENEREERD BESTAND — niet met de hand bewerken.
//
// Kopie van src/shared/time, gemaakt door `npm run edge:sync`. Bewerk het
// origineel en draai het script opnieuw; een wijziging hier gaat verloren en,
// erger, laat de app en de rollover-job met verschillende weken rekenen.

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
 * Geeft de opruimfunctie terug, zodat je hem kunt doorgeven aan `afterEach`:
 *
 * ```ts
 * let herstel: () => void;
 * beforeEach(() => { herstel = freezeNow(new Date('2026-08-16T10:00:00Z')); });
 * afterEach(() => herstel());
 * ```
 *
 * ⚠️ Weigert dienst in productie. Een primitive die de klok van de hele app kan
 *    bevriezen hoort niet mee te reizen in de bundle, en "hij staat er alleen
 *    voor tests" is geen bescherming zodra er honderd bestanden zijn.
 */
export function freezeNow(at: Date): () => void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('freezeNow() is testgereedschap en werkt niet in productie.');
  }
  frozen = at;
  return unfreezeNow;
}

/** Draait `freezeNow` terug. */
export function unfreezeNow(): void {
  frozen = undefined;
}
