import { t, type Sleutel } from '../../shared/i18n';

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

/**
 * De standen waar een tekst voor is.
 *
 * ⚠️ `reward:due` en `reward:resolved` staan er bewust niet bij: een beloning
 *    wordt nooit verschuldigd. Zou dat ooit veranderen, dan hoort deze lijst mee
 *    te veranderen — en de test hieronder wordt dan rood.
 */
export const COMMITMENT_STANDEN = [
  'reward:set',
  'reward:unlocked',
  'reward:cancelled',
  'penalty:set',
  'penalty:due',
  'penalty:resolved',
  'penalty:cancelled',
] as const;

export interface CommitmentTekst {
  readonly titel: string;
  readonly uitleg: string;
}

/**
 * De teksten per stand, uit de catalogus.
 *
 * ⚠️ **Een functie en geen constante** — QS8-115. Een module-constante legt de
 *    taal vast op het moment van importeren, en dat is vóórdat het profiel
 *    geladen is. Iemand met Engels ingesteld kreeg dan Nederlandse teksten tot
 *    hij de app herstartte. Zelfde val als bij `BEVESTIGING` in `shared/ui`.
 */
export function statusTeksten(): Readonly<Record<string, CommitmentTekst>> {
  const uit: Record<string, CommitmentTekst> = {};

  for (const stand of COMMITMENT_STANDEN) {
    const [type, status] = stand.split(':');
    uit[stand] = {
      titel: t(`commitment.${type}.${status}.titel` as Sleutel),
      uitleg: t(`commitment.${type}.${status}.uitleg` as Sleutel),
    };
  }

  return uit;
}

/** Fallback die nooit een lege kaart oplevert (coderegel 16 in de geest). */
function onbekend(): CommitmentTekst {
  return {
    titel: t('commitment.onbekend.titel'),
    uitleg: t('commitment.onbekend.uitleg'),
  };
}

export function tekstVoor(commitment: Commitment): CommitmentTekst {
  return statusTeksten()[`${commitment.type}:${commitment.status}`] ?? onbekend();
}

/**
 * Is dit commitment in werking getreden?
 *
 * ⚠️ Dit is óók de grens waar de begunstigde groep meeleest
 *    (`commitments_select`). Gebruik hem dus niet alleen om een badge te kleuren:
 *    zodra dit `true` is, is de inhoud niet meer privé.
 *
 * ⚠️ **Deze lijst is een kopie van `commitment_zichtbaar_voor_groep()`** (migratie
 *    0084), die in de database de enige bron is voor `commitments_select` én
 *    `verwijder_doel()`. Hij staat hier los omdat de client geen SQL kan
 *    aanroepen — niet omdat hij zijn eigen waarheid mag hebben.
 *    `tests/rls/epic9.test.ts` legt de twee naast elkaar en wordt rood zodra ze
 *    uiteenlopen.
 *
 * ⚠️ Neemt een losse `status` en niet een hele `Commitment`, zodat die test elke
 *    stand uit `commitments_status_valid` erlangs kan halen zonder een rij te
 *    verzinnen — en dus zonder een cast die de toets zou uithollen.
 */
export function isAfgegaan(commitment: { readonly status: string }): boolean {
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
