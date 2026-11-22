/**
 * De poortfuncties van het klassement — QS8-666 (A57), weergavehints en geen grenzen: `zet_groepsklassement()` beslist.
 * Geen enkele import, zodat een RLS-toets ze kan laden.
 */

/** De velden van een groep die bepalen of er een klassement bij hoort. */
export interface KlassementGroep {
  readonly status: string;
  readonly automatisch: boolean;
  readonly klassement_aan: boolean;
  readonly organization_id: string | null;
}

/**
 * Mag deze gebruiker de schakelaar zien? Een weergavehint, geen grens.
 *
 * ⚠️ **Dezelfde vier toetsen als de database, in dezelfde volgorde van belang:**
 *    een teamgroep, een automatisch gevormde groep en een gearchiveerde groep hebben
 *    geen schakelaar, ook niet voor een beheerder. De RPC weigert ze met een eigen
 *    reden; dit voorkomt dat het scherm een knop toont die gegarandeerd faalt.
 */
export function kanKlassementZetten(groep: KlassementGroep, beheerder: boolean): boolean {
  if (!beheerder) return false;
  if (typeof groep.organization_id === 'string') return false;
  if (groep.automatisch) return false;
  return groep.status !== 'archived';
}

/**
 * Toont het scherm de uitnodigingskaart: alleen een beheerder, in een groep waar het
 * klassement kán maar uit staat.
 *
 * ⚠️ De poort is `klassement_aan === false` en niet "nul rijen uit de RPC": nul rijen
 *    is ook wat een storing of een niet-lid oplevert.
 */
export function toonKlassementUitnodiging(groep: KlassementGroep, beheerder: boolean): boolean {
  return kanKlassementZetten(groep, beheerder) && !groep.klassement_aan;
}

/**
 * Wat er op de plek van het klassement staat op het groepsscherm — QS8-666 (A57), deel 3b.
 *
 * ⚠️ **De uitkomst van de RPC wint van de vlag op de groep.** Een groep die rijen teruggeeft, toont zijn lijst, ook
 *    als de gelezen groep (iets) ouder is en `klassement_aan` nog `false` zegt. Het scherm kent de regel van A57
 *    niet; `groep_klassement()` is de poort en dit toont wat zij geeft. De uitnodigingskaart komt pas aan bod als
 *    er niets te tonen is, en is een weergavehint voor een beheerder: `zet_groepsklassement()` beslist.
 *
 * ⚠️ **`'lijst'` is waar dan en alleen dan als er rijen zijn**, dezelfde voorwaarde als waarmee `KlassementKaart` zelf
 *    beslist of hij iets tekent. De rij "Op deze pagina" noemt het klassement dus precies als de kaart er staat.
 */
export type KlassementUitkomstVorm =
  | { readonly staat: 'ok'; readonly pagina: { readonly rijen: readonly unknown[] } }
  | { readonly staat: 'fout' };

export type KlassementPlek = 'lijst' | 'fout' | 'uitnodiging' | 'niets';

export function klassementPlek(
  uitkomst: KlassementUitkomstVorm,
  groep: KlassementGroep | null,
  beheerder: boolean,
): KlassementPlek {
  if (uitkomst.staat === 'ok' && uitkomst.pagina.rijen.length > 0) return 'lijst';
  if (uitkomst.staat === 'fout') return 'fout';
  if (groep !== null && toonKlassementUitnodiging(groep, beheerder)) return 'uitnodiging';
  return 'niets';
}
