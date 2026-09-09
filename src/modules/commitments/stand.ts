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

/**
 * De gebeurtenissen in het auditspoor van een commitment.
 *
 * ⚠️ **Een kopie van de CHECK `commitment_events_event_type_valid`, en geen
 *    bron.** `tests/rls/policies.test.ts` legt zulke lijsten naast de constraint
 *    zelf — in beide richtingen, want de vorige keer dat twee zulke lijsten uit
 *    elkaar liepen (0032/0034) vergeleek de test de app-lijst met zichzélf en
 *    bleef groen.
 */
export const SPOORGEBEURTENISSEN = [
  'created',
  'confirmed',
  'edited',
  'triggered',
  'posted',
  'resolved',
  'cancelled',
] as const;

/**
 * De labels per gebeurtenis, uit de catalogus.
 *
 * ⚠️ Een functie en geen constante, om dezelfde reden als `statusTeksten()`.
 */
export function spoorLabels(): Readonly<Record<string, string>> {
  const uit: Record<string, string> = {};

  for (const gebeurtenis of SPOORGEBEURTENISSEN) {
    uit[gebeurtenis] = t(`commitmentspoor.${gebeurtenis}` as Sleutel);
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
 * Wordt dit commitment zichtbaar voor de groep zodra je om uitstel vraagt?
 *
 * ⚠️ **De clientkant van `straffen_bij_uitstelverzoek()`** (migratie 0218,
 *    QS8-370), en de grens is met opzet exact dezelfde: `type = 'penalty'` en
 *    geen statuslijst. Wie om uitstel vraagt, laat die groep weten dat er een
 *    straf op dat doel staat — ook als die ingetrokken is.
 *
 * ⚠️ **Daarom is dit ruimer dan `isAfgegaan()` en ruimer dan de `heeftStraf` van
 *    `Herplannen`**, die allebei `cancelled` buitensluiten. Een waarschuwing die
 *    smaller is dan het oppervlak dat hij aankondigt, is geen waarschuwing: dan
 *    ziet de groep iets waarvoor het scherm niet gewaarschuwd heeft, en dat is
 *    precies wat domeinregel 5 verbiedt.
 *
 * ⚠️ **Waarom dit een geëxporteerde functie is en geen `===` in de JSX.** Zolang
 *    de vergelijking in een scherm staat, is de enige test die haar kan raken een
 *    test die in dát bestand zoekt — en die verhuist niet mee (regel 18 vraag 4).
 *    Zelfde reden als bij `magStrafVastleggen()` hieronder.
 *
 * ⚠️ **De stand staat wél in de handtekening en wordt met opzet niet gebruikt.**
 *    Dat is de plek waar deze eigenschap zichtbaar hoort te zijn: wie hier ooit
 *    een `status`-vergelijking bij zet, ziet hem al staan en leest de zin
 *    hierboven. Een parameter die er niet is, kan die vraag niet stellen. Een
 *    test kan er bovendien elk type en elke stand langs halen zonder een rij te
 *    verzinnen — en dus zonder een cast die de toets zou uithollen.
 */
export function wordtZichtbaarBijUitstelverzoek(
  commitment: { readonly type: string; readonly status: string },
): boolean {
  return commitment.type === 'penalty';
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

/**
 * Kan er op dit doel nog een straf vastgelegd worden?
 *
 * ⚠️ **Dit is de clientkant van de derde grens van migratie 0170 (QS8-293), en
 *    de grens is met opzet exact dezelfde.** `commitments_insert` weigert een
 *    `penalty` op een doel waarvan `target_date < mijn_datum()`: zo'n straf zou
 *    bij de eerstvolgende rollover meteen verschuldigd zijn, en dat was de
 *    spamvector — twintig doelen met de datum van vandaag, morgen bij elk een
 *    straf met dezelfde persoon als getuige.
 *
 * ⚠️ **Waarom dit een geëxporteerde functie is en geen `<` in de JSX.** Zolang
 *    de vergelijking in een scherm staat, is de enige test die hem kan raken een
 *    test die in dat schermbestand zoekt — en die verhuist niet mee (regel 18
 *    vraag 4). Hier staat de grens náást de databasegrens en is hij los te
 *    toetsen, inclusief de dag zelf: `>=` daar, dus vandaag mag hier ook nog.
 *
 * ⚠️ `vandaag` komt van de aanroeper, want alleen `shared/time` mag bepalen
 *    welke dag dat is (correctheidsregel 7). Weet het scherm het nog niet — het
 *    profiel is dan nog aan het laden — dan is het antwoord `true`: de database
 *    weigert alsnog, en een kaart die verdwijnt zodra een lading binnenkomt is
 *    erger dan een knop die één keer een melding geeft.
 */
export function magStrafVastleggen(streefdatum: string, vandaag: string | null): boolean {
  if (vandaag === null) return true;
  return streefdatum >= vandaag;
}
