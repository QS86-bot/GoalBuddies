import { t } from '../i18n';

/**
 * Het voorgestelde bericht bij een adempauze — QS8-753.
 *
 * ⚠️ **Een voorstel en geen sjabloon.** Het staat in het tekstveld, het lid ziet
 *    het vóór het weggaat en mag het aanpassen of wissen; leeg is "geen bericht".
 *    Het bericht gaat als gewoon chatbericht van het lid zelf, nooit als
 *    systeembericht (domeinregel 7: de route loopt via de persoon).
 *
 * ⚠️ **Neutraal, en met opzet zonder invulling.** Geen doeltitel, geen datum, geen
 *    woord over gemist, reeks of punten: de groep leest een aankondiging en geen
 *    verslag. Wat het lid daar zelf bij typt is zijn keuze; de app zet het er niet
 *    vast in.
 */

/** Gelijk aan `BERICHT_MAX` in `modules/buddies/chat-schemas.ts`; de test koppelt ze. */
export const ADEMPAUZE_BERICHT_MAX = 4000;

export function adempauzeBerichtVoorstel(): string {
  return t('adempauze.bericht_voorstel');
}
