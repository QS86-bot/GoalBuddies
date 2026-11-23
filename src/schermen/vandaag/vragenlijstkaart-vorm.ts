import { heeftVragenlijstAntwoord, type VragenlijstVelden } from '@/modules/goals';

/**
 * Staat de kaart "Zodat de app je kent" op Vandaag? — QS8-805.
 *
 * ⚠️ **Besluit Quinten (23-11-2026, variant B): voor iedereen die de vragenlijst
 *    oversloeg**, niet alleen voor wie via een uitnodiging of werkcode instapte. De
 *    vragenlijst belooft "je kunt het later invullen", en tot dit issue was er geen
 *    knop die dat waarmaakte.
 *
 * ⚠️ **"Oversloeg" is: geen van de vijf antwoorden op het profiel** (aanname van de
 *    orchestrator, de conservatiefste lezing). Wie er één invulde, ziet de kaart niet;
 *    de vragenlijst opent bij hem toch op de samenvatting van wat er mist. Ook een
 *    bestaand account zonder antwoorden krijgt de kaart.
 *
 * ⚠️ Niets tonen zolang "Niet nu" nog niet gelezen is (`geladen`), of zolang er geen
 *    profiel is: een kaart die verschijnt en weer weggaat is erger dan een kaart die
 *    een tel later komt.
 */
export function toonVragenlijstkaart(stand: {
  readonly profiel: VragenlijstVelden | null;
  readonly geladen: boolean;
  readonly weg: boolean;
}): boolean {
  if (!stand.geladen || stand.weg || stand.profiel === null) return false;
  return !heeftVragenlijstAntwoord(stand.profiel);
}
