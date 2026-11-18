/**
 * Wat de ingang naar /meldingen laat zien — QS8-705.
 *
 * - `wacht`: er staat iets open dat jij mag beoordelen (de oorspronkelijke kaart);
 * - `rustig`: je mag beoordelen, er wacht nu niets (de ingang blijft staan);
 * - `geen`: je beoordeelt nergens iets, dus niets te tonen.
 *
 * ⚠️ **Een pure functie en geen vertakking in het scherm**, want dit is de
 *    beslissing waar het issue om draait en `app/` heeft geen renderer. De
 *    volgorde is de belofte: wat wacht wint altijd van wat je mag, anders
 *    verdwijnt de urgentie achter een rustige kaart.
 */
export type Meldingeningang = 'wacht' | 'rustig' | 'geen';

export function meldingenIngangStand(aantalWachtend: number, magBeoordelen: boolean): Meldingeningang {
  if (aantalWachtend > 0) return 'wacht';
  return magBeoordelen ? 'rustig' : 'geen';
}
