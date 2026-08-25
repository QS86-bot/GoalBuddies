// ⚠️ GEGENEREERD BESTAND — niet met de hand bewerken.
//
// Kopie van src/shared/time, gemaakt door `npm run edge:sync`.
// Bewerk het origineel en draai het script opnieuw; een wijziging hier gaat
// verloren en, erger, laat de app en de jobs met verschillende regels werken.

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

/**
 * Is dit tijdstip langer dan `uren` geleden?
 *
 * ⚠️ **Hier en niet bij de aanroeper, en dat is correctheidsregel 7.** "Is dit
 *    ouder dan een dag" is een tijdberekening, en die hoort in `shared/time` —
 *    ook als het maar één aftrekking is. De aanleiding is besluit A49 (QS8-136):
 *    een bewaarde uitnodigingscode verloopt na 24 uur.
 *
 * ⚠️ Leest de klok via `now()` en niet via `Date.now()`, zodat `freezeNow()` hem
 *    in tests kan stilzetten. Zonder dat is dit alleen te toetsen met een
 *    wachtende test, en die bestaat niet in dit project.
 *
 * ⚠️ Een onbruikbaar tijdstip — `NaN`, een lege string, een datum uit een oudere
 *    opslagvorm — telt als **verlopen**. Onbekend is hier de kant waar niets
 *    stilzwijgend gebeurt; zie de aanroeper in `modules/buddies/pending.ts`.
 */
export function ouderDan(uren: number, tijdstip: Date | string | null): boolean {
  if (tijdstip === null) return true;

  const moment = typeof tijdstip === 'string' ? new Date(tijdstip) : tijdstip;
  if (Number.isNaN(moment.getTime())) return true;

  return now().getTime() - moment.getTime() > uren * 60 * 60 * 1000;
}
