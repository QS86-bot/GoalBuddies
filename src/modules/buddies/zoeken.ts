/**
 * Mensen zoeken buiten je eigen groepen — QS8-476.
 *
 * ⚠️⚠️ **De grens zit in `zoek_mensen()` en niet hier.** Die functie is
 *    SECURITY DEFINER met een expliciete kolomlijst, omdat RLS geen kolommen kan
 *    beperken: een extra tak op `profiles_select` zou de héle profielrij
 *    weggeven. Wat deze laag doet is de RPC netjes aanroepen en het antwoord
 *    naar de app-vorm brengen — geen filter, geen tweede oordeel.
 *
 * ⚠️ **Geen totaal, en dat is een afwijking met een reden.** Elk ander
 *    lijstscherm leest `totaal` uit een `count(*) over ()`. Hier zou dat een
 *    telling over de hele vindbare populatie zijn bij élke toetsaanslag. De
 *    RPC geeft hem dus niet, en `meer` komt uit "de pagina zat vol".
 */
import { metGetekendeAvatars } from '../auth/avatar';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { type Pagina } from '../../shared/api';
import { t } from '../../shared/i18n';
import { telTekens } from '../../shared/tekst';

/** Wat de RPC per pagina teruggeeft. Gelijk aan het plafond in de functie. */
export const MENSEN_PER_PAGINA = 20;

/**
 * De ondergrens van de zoekterm, in **codepunten**.
 *
 * ⚠️ Gelijk aan de grens in `zoek_mensen()`, en geteld met `telTekens()` en niet
 *    met `.length`. Bij een ondergrens gaat dat verschil de gevaarlijke kant op:
 *    `.length` telt UTF-16-eenheden en is altijd ≥ `char_length`, dus een client
 *    die in UTF-16 telt laat een term door die Postgres weigert. Zie
 *    `docs/decisions/2026-08-28-tekst-zonder-grens.md`.
 */
export const ZOEKTERM_MIN = 2;

export interface GevondenPersoon {
  readonly userId: string;
  readonly naam: string;
  readonly avatarUrl: string | null;
}

interface RpcPersoon {
  readonly id?: string;
  readonly display_name?: string;
  readonly avatar_url?: string | null;
}

/** Is deze term lang genoeg om mee te zoeken? */
export function termIsLangGenoeg(term: string): boolean {
  return telTekens(term.trim()) >= ZOEKTERM_MIN;
}

/**
 * Zoekt mensen die zichzelf vindbaar hebben gemaakt.
 *
 * ⚠️ Een te korte term geeft een lege pagina en géén aanroep. Dat scheelt niet
 *    alleen netwerkverkeer: de dagteller in de RPC telt per poging, en elke
 *    toetsaanslag zou er een zijn.
 */
export async function zoekMensen(
  term: string,
  opties: { readonly pagina?: number } = {},
): Promise<Pagina<GevondenPersoon>> {
  if (!termIsLangGenoeg(term)) return { rijen: [], totaal: 0, meer: false };

  const pagina = opties.pagina ?? 0;
  const van = pagina * MENSEN_PER_PAGINA;

  const { data, error } = await supabase().rpc('zoek_mensen', {
    p_term: term.trim(),
    p_limit: MENSEN_PER_PAGINA,
    p_offset: van,
  });

  if (error) {
    reportError(error, 'people.search');
    throw new Error(t('mensen.zoeken_mislukt'));
  }

  const ruw = (data ?? []) as readonly RpcPersoon[];
  const rijen: GevondenPersoon[] = [];
  for (const rij of ruw) {
    if (typeof rij.id !== 'string' || typeof rij.display_name !== 'string') continue;
    rijen.push({ userId: rij.id, naam: rij.display_name, avatarUrl: rij.avatar_url ?? null });
  }

  // ⚠️⚠️ **`avatar_url` is een pad en geen adres, en dat is het halve issue.**
  //    De bucket is privé sinds 0126, dus wat de RPC teruggeeft is
  //    `<uuid>/foto.jpg`. Dat rechtstreeks in een `<Image>` zetten geeft een leeg
  //    vlak zónder foutmelding — de vorm waar `avatar:controle` voor bestaat, en
  //    die controle vond dit hier ook. De policy-tak in 0271 opent de deur; deze
  //    regel is de andere helft van diezelfde keten (regel 18 vraag 5).
  //
  // ⚠️ Eén ronde voor de hele pagina en niet één per rij — schaalbaarheidsregel
  //    12. `metGetekendeAvatars()` geeft per definitie een ondertekende URL of
  //    `null`, en `Avatar` valt bij `null` terug op initialen.
  const getekend = await metGetekendeAvatars(rijen, 'avatarUrl');

  return { rijen: [...getekend], totaal: getekend.length, meer: ruw.length === MENSEN_PER_PAGINA };
}
