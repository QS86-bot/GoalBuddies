/**
 * Wie "Organisatie aanmaken" te zien krijgt — QS8-663 (besluit van Quinten,
 * 20-11-2026, punt 3).
 *
 * Zolang de juridische toets niet klaar is (besluit 33) komt niemand een
 * organisatie aanmaken via een knop: je komt een organisatie binnen met een
 * uitnodiging of een code. Eén constante en geen tweede knop; zet hem pas op
 * `true` als dat besluit er ligt.
 *
 * ⚠️ **Dit verbergt een knop en schermt niets af.** `maak_organisatie()` is
 *    server-side voor elke ingelogde gebruiker aanroepbaar; een echte afscherming
 *    is een migratie en een eigen besluit. Zie de ER-rij bij QS8-663.
 */
export const ORGANISATIE_AANMAKEN_ZICHTBAAR = false;
