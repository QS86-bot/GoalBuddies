/**
 * Wie of welke groep een scherm voorinvult — QS8-651.
 *
 * ⚠️ **Dit is de plek waar "de eerste uit de lijst" ophoudt een standaard te
 *    zijn.** Vier schermen namen stilzwijgend `[0]`: de hulpvraag (domeinregel 7,
 *    één van de drie routes waarlangs tegenslag de groep bereikt), de straf-
 *    begunstigde (domeinregel 5), de aan te wijzen getuige, en de groep waaraan
 *    een taak gedeeld wordt. Bij één kandidaat is dat onschuldig; bij twee of
 *    meer stuurt een tik op "versturen" iets naar een groep of persoon die
 *    niemand gekozen heeft, en een hulpvraag of straf is niet terug te nemen
 *    uit het geheugen van de ontvanger.
 *
 * ⚠️ **De regel is dezelfde als in `beslissendeGroep()` (QS8-56): bij precies
 *    één kandidaat vraagt de app niets, pas bij twee of meer verschijnt de
 *    keuze.** Hier staat hij los van `DoelGroep`, omdat een straf-begunstigde
 *    een persoon kan zijn en een taak een `Lijstgroep` deelt.
 *
 * ⚠️ **Een teamgroep is nooit de standaard, ook niet als enige kandidaat.**
 *    Teamgroepen bestaan nog niet (QS8-649); het veld `soort` is er zodat de
 *    regel er vanaf de eerste dag is en niet achteraf in vier schermen
 *    teruggezocht hoeft te worden. Met een lone team geeft `geldigeKeuze()` ''
 *    en geeft `moetKiezen()` true: het scherm toont de keuze ook bij één rij.
 *
 * ⚠️ **Een keuze telt alleen als ze nog bestaat.** Verdwijnt de gekozen
 *    kandidaat terwijl het formulier openstaat en blijven er twee of meer over,
 *    dan is het antwoord '' en niet de volgende in de rij. Blijft er precies één
 *    over, dan is dat de enige kandidaat en geeft de functie die (zelfde gedrag
 *    als `beslissendeGroep()`); het scherm toont dan geen keuze meer. Dat is een
 *    bekende rand, gemeld in de security-ronde van QS8-651.
 *
 * ⚠️ **Dit is gebruiksgemak en geen grens.** De autorisatie zit in RLS en in de
 *    RPC's; deze functie bepaalt alleen wat het scherm voorinvult.
 */
export interface Kandidaat {
  readonly id: string;
  /** Alleen 'team' heeft betekenis; wat niet gezet is, is geen team. */
  readonly soort?: string;
}

export function moetKiezen(kandidaten: readonly Kandidaat[]): boolean {
  if (kandidaten.length > 1) return true;
  return kandidaten.length === 1 && kandidaten[0]?.soort === 'team';
}

/** De id waarmee het scherm mag versturen, of '' zolang er niemand gekozen is. */
export function geldigeKeuze(kandidaten: readonly Kandidaat[], keuze: string): string {
  if (keuze !== '' && kandidaten.some((k) => k.id === keuze)) return keuze;
  if (moetKiezen(kandidaten)) return '';
  return kandidaten[0]?.id ?? '';
}
