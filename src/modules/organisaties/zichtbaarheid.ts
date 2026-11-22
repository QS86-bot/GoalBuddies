/**
 * Wie "Organisatie aanmaken" te zien krijgt — QS8-663 (besluit van Quinten,
 * 20-11-2026, punt 3).
 *
 * Zolang de juridische toets niet klaar is (besluit 33) komt niemand een
 * organisatie aanmaken via een knop: je komt een organisatie binnen met een
 * uitnodiging of een code. Eén constante en geen tweede knop; zet hem pas op
 * `true` als dat besluit er ligt.
 *
 * ⚠️ **Dit verbergt een knop; de afscherming zit in de database.** Sinds 0337
 *    (QS8-776, besluit Quinten 22-11-2026) weigert `maak_organisatie()` iedereen
 *    die niet in `organisatie_aanmakers` staat, en die lijst begint leeg. De knop
 *    blijft ook voor een toegelaten gebruiker verborgen; `/organisatie/nieuw` is
 *    dan de enige weg. Zet je deze constante om, dan hoort er een migratie bij die
 *    de toelating opheft — `tests/rls/organisatie-aanmaken.test.ts` wordt rood
 *    zolang dat niet samen gebeurt. Uitleg in
 *    `docs/decisions/2026-11-22-een-organisatie-aanmaken-vraagt-toelating.md`.
 */
export const ORGANISATIE_AANMAKEN_ZICHTBAAR = false;
