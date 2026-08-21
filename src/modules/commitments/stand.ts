import type { Commitment } from './api';

/**
 * Hoe een commitment ervoor staat, in gewone taal — QS8-83 en QS8-84.
 *
 * ⚠️ **De toon is een acceptatiecriterium, geen smaak.** QS8-84 vraagt letterlijk
 *    om nuchter en niet vernederend, en dat is de reden dat deze teksten hier
 *    staan en niet verspreid door de schermen: iemand heeft dit zichzelf vooraf
 *    opgelegd en bevestigd. Er wordt dus niets uitgeroepen, niets verweten en
 *    niets aangemoedigd — er wordt verteld wat er is gebeurd.
 *
 * ⚠️ De tekst gaat over de *eigenaar* die naar zijn eigen commitment kijkt. De
 *    begunstigde groep krijgt geen van deze zinnen te zien; die krijgt het
 *    systeembericht uit `meld_commitment()`, en dat noemt de persoon en de
 *    gebeurtenis en verder niets (beslisdocument 002 §3).
 */

export const STATUS_TEKST: Readonly<Record<string, { titel: string; uitleg: string }>> = {
  'reward:set': {
    titel: 'Staat klaar',
    uitleg: 'Deze beloning komt vrij zodra je dit doel op tijd afrondt.',
  },
  'reward:unlocked': {
    titel: 'Vrijgespeeld',
    uitleg: 'Je hebt je doel gehaald. Je groep heeft het gezien.',
  },
  'reward:cancelled': {
    titel: 'Vervallen',
    uitleg: 'Deze beloning is niet meer van toepassing.',
  },
  'penalty:set': {
    titel: 'Staat vast',
    uitleg:
      'Dit gaat in werking als je streefdatum verstrijkt zonder dat het doel af is. ' +
      'Een week missen doet er niets aan.',
  },
  'penalty:due': {
    titel: 'Verschuldigd',
    uitleg: 'Je streefdatum is verstreken. De groep die je gekozen hebt, kan dit nu lezen.',
  },
  'penalty:resolved': {
    titel: 'Afgehandeld',
    uitleg: 'Deze inzet is voldaan.',
  },
  'penalty:cancelled': {
    titel: 'Vervallen',
    uitleg: 'Je hebt je doel afgerond, dus deze inzet gaat niet meer in werking.',
  },
};

/** Fallback die nooit een lege kaart oplevert (coderegel 16 in de geest). */
const ONBEKEND = { titel: 'Onbekend', uitleg: 'De stand van deze afspraak is niet te bepalen.' };

export function tekstVoor(commitment: Commitment): { titel: string; uitleg: string } {
  return STATUS_TEKST[`${commitment.type}:${commitment.status}`] ?? ONBEKEND;
}

/**
 * Is dit commitment in werking getreden?
 *
 * ⚠️ Dit is óók de grens waar de begunstigde groep meeleest
 *    (`commitments_select`). Gebruik hem dus niet alleen om een badge te kleuren:
 *    zodra dit `true` is, is de inhoud niet meer privé.
 */
export function isAfgegaan(commitment: Commitment): boolean {
  return commitment.status === 'unlocked' || commitment.status === 'due' ||
    commitment.status === 'resolved';
}

/**
 * Staat dit commitment nog open — en is het dus nog in te trekken?
 *
 * Alleen `set`. Dat is dezelfde grens als in `commitments_update`; staat het
 * eenmaal aan, dan kun je het niet meer wegpoetsen, want anders is een
 * commitment device geen commitment device.
 */
export function isOpenstaand(commitment: Commitment): boolean {
  return commitment.status === 'set';
}
