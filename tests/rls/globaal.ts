import { niveauMelding, registerVanDatabase } from './migratieniveau';

/**
 * Draait één keer, vóór de hele RLS-groep — QS8-426.
 *
 * ⚠️ **Waarom `globalSetup` en niet een test of een setupFile.** Een test die
 *    het niveau toetst, is één rode test tussen duizend groene, en hij zegt niets
 *    over de duizend andere die intussen tegen het oude schema gemeten hebben.
 *    Een `setupFile` draait per bestand — honderdveertig keer dezelfde vraag.
 *    Dit hoort een voorwaarde te zijn waaronder de suite überhaupt begint.
 *
 * ⚠️ **Zwijgen mag alleen als niemand beweerde te meten**, dezelfde afspraak als
 *    `stackBeschikbaarOfFaal()` sinds QS8-270. Zonder `RLS_DOEL` doet deze
 *    controle niets: dan draait de suite niet tegen een database en valt er niets
 *    te vergelijken.
 *
 * ⚠️ **En hij zwijgt óók als de database onbereikbaar is.** Dat is niet dezelfde
 *    zaak en heeft al een uitgewerkte melding: `stackBeschikbaarOfFaal()` houdt
 *    "geen server" en "wel server, oud schema" uit elkaar en noemt per geval wat
 *    je moet doen. Die hier overdoen zou twee meldingen voor één zaak geven, en
 *    de eerste in de volgorde wint — niet de beste.
 */
export default function setup(): void {
  if (!process.env.RLS_DOEL) return;

  const melding = niveauMelding(registerVanDatabase());
  if (melding !== null) throw new Error(melding);
}
