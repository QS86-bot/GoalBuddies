/**
 * Wat er op de plek van het klassement staat op het groepsscherm — QS8-666 (A57), deel 3b-1.
 *
 * ⚠️ **De uitkomst van de RPC beslist, niet een vlag op de groep.** Een groep die rijen teruggeeft, toont zijn lijst;
 *    het scherm kent de regel van A57 niet en `groep_klassement()` is de poort. Geen enkele import, zodat een toets
 *    ze kan laden zonder `react-native`.
 *
 * ⚠️ **`'lijst'` is waar dan en alleen dan als er rijen zijn**, dezelfde voorwaarde als waarmee `KlassementKaart` zelf
 *    beslist of hij iets tekent. De rij "Op deze pagina" noemt het klassement dus precies als de kaart er staat.
 */
export type KlassementUitkomstVorm =
  | { readonly staat: 'ok'; readonly pagina: { readonly rijen: readonly unknown[] } }
  | { readonly staat: 'fout' };

export type KlassementPlek = 'lijst' | 'fout' | 'niets';

export function klassementPlek(uitkomst: KlassementUitkomstVorm): KlassementPlek {
  if (uitkomst.staat === 'fout') return 'fout';
  return uitkomst.pagina.rijen.length > 0 ? 'lijst' : 'niets';
}
