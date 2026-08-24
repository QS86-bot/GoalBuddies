import { getal, t, type Sleutel } from '../../shared/i18n';

import { SYSTEEM_GEBEURTENISSEN, type SysteemGebeurtenis } from './chat-schemas';

/**
 * De tekst van een systeembericht — QS8-107 stap 2.
 *
 * ⚠️ **Waarom dit bestaat.** Tot migratie 0059 werd de Nederlandse zin bij het
 *    schrijven in `chat_messages.body` gezet. Een chatbericht is een
 *    onveranderlijke kopie (beslisdocument 002 §3), dus die zin was er later niet
 *    meer uit te krijgen: wie ooit Duits aanzet, krijgt een Duitse app met
 *    Nederlandse regels in de geschiedenis. Sinds 0059 staan de parameters als
 *    kolommen in de rij en wordt de zin híer gemaakt.
 *
 *    Dat betekent ook dat dit bestand straks de enige plek is die vertaald hoeft
 *    te worden voor de chat — de rest van QS8-107 (de bibliotheek en de 56
 *    bestanden met schermtekst) staat los en is een eigen issue.
 *
 * ⚠️ **De regel uit beslisdocument 002 §3 staat hier en nergens anders.** Een
 *    systeembericht noemt de persoon en de gebeurtenis, nooit een titel, notitie
 *    of niveau. Vóór 0059 was die regel verspreid over zeven SQL-functies die je
 *    stuk voor stuk moest lezen; nu is het één bestand met een test eronder. Zie
 *    `systeemberichten.test.ts`, die weigert dat er een parameter bij komt die
 *    geen persoon is zonder dat iemand er bewust over nadenkt.
 *
 * ⚠️ **Puur, zonder Supabase en zonder React Native**, om dezelfde reden als
 *    `notifications/regels.ts`: de tekst is de regel, en die hoort testbaar te
 *    zijn zonder database en zonder renderer.
 */

/**
 * Iemand die er niet meer is. Zie oppervlak 18 in beslisdocument 002.
 *
 * ⚠️ Sinds QS8-113 komt deze tekst uit de catalogus. Hij blijft hier
 *    geëxporteerd omdat tests en schermen ernaar verwijzen, maar hij is geen
 *    constante meer: hij hangt van de ingestelde taal af.
 */
export function oudLid(): string {
  return t('algemeen.oud_lid');
}

export interface SysteembericthInvoer {
  readonly system_event: string | null;
  /** De naam uit de join op `profiles`. `null` = account verwijderd of onzichtbaar. */
  readonly subject_name: string | null;
  /** Alleen gevuld bij `completion_approved`. */
  readonly actor_name: string | null;
  /**
   * De opgeslagen Nederlandse zin.
   *
   * ⚠️ Uitsluitend noodterugval, voor twee gevallen: de rijen van vóór 0059 (die
   *    hebben geen `subject_id`) en een gebeurtenis die deze app nog niet kent —
   *    een server die vooruitloopt op een geïnstalleerde app. Beter een zin in de
   *    verkeerde taal dan een lege regel in het gesprek.
   */
  readonly body: string;
  /**
   * Het enige getal dat een systeembericht draagt: de bereikte drempel van De
   * Ketting. `null` bij elke andere gebeurtenis.
   *
   * ⚠️ **Dit is het vijfde veld en dat is met opzet lastig.** De test hieronder
   *    legt de veldnamen vast, dus er komt er nooit een bij zonder dat iemand
   *    zich afvraagt of het een titel, een notitie of een niveau is —
   *    beslisdocument 002 §3. Een getal zonder eenheid is dat niet: het zegt
   *    hoeveel schakels de groep samen heeft, en niet wie welke week deed.
   */
  readonly aantal: number | null;
}

/**
 * Gebeurtenissen waarvan de zin een getal nodig heeft.
 *
 * ⚠️ Bestaat zodat een rij zónder dat getal terugvalt op de opgeslagen zin in
 *    plaats van "telt {aantal} schakels" te tonen. Dat kan alleen bij een rij van
 *    vóór migratie 0075; er zijn er nul, maar een half ingevulde zin in de
 *    groepschat is precies het soort storing dat het kanaal onbetrouwbaar maakt.
 */
const GEBEURTENISSEN_MET_AANTAL: ReadonlySet<string> = new Set(['chain_milestone']);

/** Een naam, of de nette vervanging als hij er niet meer is. */
function naam(waarde: string | null): string {
  const schoon = (waarde ?? '').trim();
  return schoon === '' ? oudLid() : schoon;
}

/**
 * De zin die in de groepschat komt te staan.
 *
 * ⚠️ **Sinds QS8-113 loopt dit via de catalogus.** De sleutel is
 *    `systeembericht.<gebeurtenis>`, wat betekent dat een nieuwe gebeurtenis op
 *    drie plekken moet: de CHECK in de database, `SYSTEEM_GEBEURTENISSEN`, en
 *    élke taalcatalogus. Dat is met opzet lastig — een systeembericht is het
 *    kanaal dat de groep vertrouwt, en er staat een test op alle drie.
 *
 * Geeft altijd iets terug. Een lege regel in een gesprek leest als een storing,
 * en dat is precies wat een systeembericht niet mag zijn.
 */
export function systeemberichtTekst(invoer: SysteembericthInvoer): string {
  if (!kentGebeurtenis(invoer.system_event)) {
    // Onbekende gebeurtenis: de opgeslagen zin, of niets tonen als die er ook
    // niet is. Geen "onbekend bericht" — dat is ruis in een gesprek.
    return invoer.body.trim();
  }

  if (GEBEURTENISSEN_MET_AANTAL.has(invoer.system_event) && invoer.aantal === null) {
    return invoer.body.trim();
  }

  return t(`systeembericht.${invoer.system_event}` as Sleutel, {
    naam: naam(invoer.subject_name),
    actor: naam(invoer.actor_name),
    // ⚠️ Door `getal()` en niet als kale `String()`: 1000 schakels leest in het
    //    Nederlands als "1.000" en in het Engels als "1,000".
    aantal: invoer.aantal === null ? '' : getal(invoer.aantal, 0),
  });
}

/**
 * Kent deze app deze gebeurtenis?
 *
 * ⚠️ Bestaat om `systeemberichten.test.ts` te laten bewijzen dat er voor élke
 *    toegestane gebeurtenis een zin is. De allowlist in `chat-schemas.ts` is een
 *    kopie van de CHECK in de database; komt daar iets bij, dan wordt die test
 *    rood in plaats van dat er stilletjes een `body` doorheen valt.
 */
export function kentGebeurtenis(event: string | null): event is SysteemGebeurtenis {
  return event !== null && (SYSTEEM_GEBEURTENISSEN as readonly string[]).includes(event);
}
