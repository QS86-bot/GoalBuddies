import { SYSTEEM_GEBEURTENISSEN } from './chat-schemas';

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

/** Hoe iemand heet die er niet meer is. Zie oppervlak 18 in beslisdocument 002. */
export const OUD_LID = 'Een oud-lid';

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
}

/** Een naam, of de nette vervanging als hij er niet meer is. */
function naam(waarde: string | null): string {
  const schoon = (waarde ?? '').trim();
  return schoon === '' ? OUD_LID : schoon;
}

/**
 * De zin die in de groepschat komt te staan.
 *
 * Geeft altijd iets terug. Een lege regel in een gesprek leest als een storing,
 * en dat is precies wat een systeembericht niet mag zijn.
 */
export function systeemberichtTekst(invoer: SysteembericthInvoer): string {
  const wie = naam(invoer.subject_name);

  switch (invoer.system_event) {
    case 'member_joined':
      return `${wie} doet mee.`;

    case 'completion_pending':
      return `${wie} heeft een week afgerond en wacht op bevestiging.`;

    case 'completion_approved':
      // De enige met twee personen. `actor` bevestigde de week van `wie`.
      return `${naam(invoer.actor_name)} bevestigde de week van ${wie}.`;

    case 'milestone_done':
      return `${wie} heeft een mijlpaal gehaald.`;

    case 'goal_completed':
      return `${wie} heeft een doel afgerond.`;

    case 'commitment_unlocked':
      return `${wie} heeft een beloning vrijgespeeld.`;

    case 'commitment_due':
      // ⚠️ Nuchter, niet vernederend — QS8-84. Deze persoon heeft dit zichzelf
      //    vooraf opgelegd en bevestigd, en dit is de enige benoemde uitzondering
      //    op domeinregel 7. De zin zegt wát er gebeurd is en oordeelt niet.
      return `De inzet die ${wie} zelf heeft ingesteld, is verschuldigd geworden.`;

    case 'deadline_requested':
      return `${wie} vraagt de groep om een streefdatum te verschuiven.`;

    case 'group_sleeping':
      // De enige zonder persoon: hij gaat over de groep, niet over iemand.
      return 'Deze groep is stil geworden. Eén bericht maakt hem weer wakker.';

    default:
      // Onbekende gebeurtenis: de opgeslagen zin, of niets tonen als die er ook
      // niet is. Geen "onbekend bericht" — dat is ruis in een gesprek.
      return invoer.body.trim();
  }
}

/**
 * Kent deze app deze gebeurtenis?
 *
 * ⚠️ Bestaat om `systeemberichten.test.ts` te laten bewijzen dat er voor élke
 *    toegestane gebeurtenis een zin is. De allowlist in `chat-schemas.ts` is een
 *    kopie van de CHECK in de database; komt daar iets bij, dan wordt die test
 *    rood in plaats van dat er stilletjes een `body` doorheen valt.
 */
export function kentGebeurtenis(event: string | null): boolean {
  return event !== null && (SYSTEEM_GEBEURTENISSEN as readonly string[]).includes(event);
}
