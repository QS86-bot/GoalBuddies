import type { Tables } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { invoerfout, type Pagina, type Resultaat } from '../../shared/api';
import { t } from '../../shared/i18n';
import { now } from '../../shared/time';

import {
  VOLGORDE_MAX,
  taakInvoerSchema,
  taakPatchSchema,
  type TaakInvoer,
} from './todo-schemas';

/**
 * De datalaag van De Lijst — QS8-380, tabel uit migratie 0215.
 *
 * ⚠️ **Een taak telt nooit mee.** Geen punten, geen reeks, geen goedkeuring,
 *    geen invloed op een doel. Dat is dezelfde grens die domeinregel 9 voor De
 *    Dagzet trekt, en om dezelfde reden: de week blijft de enige eenheid die
 *    telt. Er staat hier dus met opzet geen enkele aanroep naar `points_ledger`,
 *    `user_streaks` of `completion_approvals`.
 *
 * ⚠️ **Alles is eigenaar-only.** De RLS-policies van 0215 filteren op
 *    `user_id = (select auth.uid())`; deze functies leunen daarop en niet op een
 *    filter dat ze zelf meesturen. Het `eq('user_id', …)` in `fetchTaken()` is
 *    er voor de índex en niet voor de autorisatie — zie de aantekening daar.
 */

export type Taak = Pick<
  Tables<'todo_items'>,
  'id' | 'body' | 'done_at' | 'order_index' | 'created_at'
>;

/**
 * ⚠️ Gepagineerd, altijd — CLAUDE.md schaalbaarheidsregel 10. Een to-do lijst
 *    lijkt kort tot iemand er driehonderd in zet, en dan is de dag dat je het
 *    merkt de dag dat het scherm vastloopt.
 */
export const TAKEN_PER_PAGINA = 20;

const KOLOMMEN = 'id, body, done_at, order_index, created_at';

/**
 * Eén pagina van je eigen lijst: open taken eerst, afgevinkte eronder.
 *
 * ⚠️⚠️ **De volgorde staat op de server en niet in het scherm, en dat is geen
 *    smaak maar een eis van paginering.** Zou het scherm de pagina groeperen,
 *    dan staat een open taak van pagina 2 onder een afgevinkte van pagina 1 —
 *    de groepering klopt dan per pagina en niet voor de lijst.
 *
 * ⚠️ `done_at` nulls first is de eerste sleutel: `null` betekent "nog te doen".
 *    Daarna de volgorde die de gebruiker zelf zet, en `created_at` als
 *    tiebreak — zonder die derde sleutel is de volgorde van twee taken met
 *    hetzelfde `order_index` niet vastgelegd, en dan springt de lijst tussen
 *    twee ronden.
 *
 * ⚠️ **`eq('user_id', …)` is er voor de index en niet voor de autorisatie.** Die
 *    doet `todo_items_select`. Zonder deze regel leest de query nog steeds
 *    precies jouw rijen, maar dan zonder `todo_items_volgorde_idx` te kunnen
 *    gebruiken. Wie hem ooit weghaalt, verandert de snelheid en niet de grens.
 */
export async function fetchTaken(
  userId: string,
  opties: { readonly pagina?: number } = {},
): Promise<Pagina<Taak>> {
  const pagina = opties.pagina ?? 0;
  const van = pagina * TAKEN_PER_PAGINA;

  const { data, error, count } = await supabase()
    .from('todo_items')
    .select(KOLOMMEN, { count: 'exact' })
    .eq('user_id', userId)
    .order('done_at', { ascending: true, nullsFirst: true })
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true })
    .range(van, van + TAKEN_PER_PAGINA - 1);

  if (error) {
    reportError(error, 'todos.list', { user_id: userId, code: error.code });
    throw new Error(t('lijst.laden_mislukt'));
  }

  const rijen = data ?? [];
  const totaal = count ?? rijen.length;

  return { rijen, totaal, meer: van + rijen.length < totaal };
}

/**
 * Voegt een taak toe, onderaan.
 *
 * ⚠️ **`order_index` wordt hier bepaald en niet door het formulier**, net als bij
 *    `maakMijlpaal()`. Een client die zelf een nummer verzint, botst met wat er
 *    al staat — en de volgorde is dan van wie het laatst schreef.
 *
 * ⚠️ **Geen unieke index op `(user_id, order_index)`, en dat is met opzet.** Twee
 *    toestellen die tegelijk toevoegen, rekenen allebei hetzelfde nummer uit;
 *    met een unieke index zou de tweede omvallen op iets waar de gebruiker niets
 *    aan kan doen. Nu delen ze een nummer en beslist `created_at` de volgorde.
 *    `verzetTaak()` hieronder kan zo'n paar niet uit elkaar halen, en die zegt
 *    dat ook.
 */
export async function maakTaak(userId: string, invoer: TaakInvoer): Promise<Resultaat<Taak>> {
  const gevalideerd = taakInvoerSchema.safeParse(invoer);
  if (!gevalideerd.success) {
    return { ok: false, melding: invoerfout(gevalideerd.error, t('lijst.invoer')) };
  }

  const { data: laatste, error: leesFout } = await supabase()
    .from('todo_items')
    .select('order_index')
    .eq('user_id', userId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (leesFout) {
    reportError(leesFout, 'todos.next', { user_id: userId, code: leesFout.code });
    return { ok: false, melding: t('lijst.toevoegen_mislukt') };
  }

  // ⚠️ Geklemd op de CHECK `todo_items_order_bereik`. Zonder deze regel weigert
  //    de database de taak van iemand die precies op de grens staat, met een
  //    23514 waar hij niets aan kan doen. Hij komt dan bovenaan te staan in
  //    plaats van onderaan, en dat is de zachtere fout van de twee.
  const volgende = Math.min((laatste?.order_index ?? -1) + 1, VOLGORDE_MAX);

  const { data, error } = await supabase()
    .from('todo_items')
    .insert({ user_id: userId, body: gevalideerd.data.body, order_index: volgende })
    .select(KOLOMMEN)
    .single();

  if (error) {
    reportError(error, 'todos.create', { user_id: userId, code: error.code });
    return { ok: false, melding: t('lijst.toevoegen_mislukt') };
  }

  return { ok: true, waarde: data };
}

/**
 * Vinkt af of vinkt uit.
 *
 * ⚠️ **Afvinken haalt de regel niet weg.** Een afgevinkte taak zakt naar onderen
 *    en blijft staan; weggooien is een aparte handeling met een eigen
 *    bevestiging. Dat is ook wat QS8-381 nodig heeft.
 *
 * ⚠️ **De tijd komt uit `shared/time` en niet uit een kale `new Date()`** —
 *    correctheidsregel 7, en de lint-regel dwingt hem af. `now()` is bovendien
 *    te bevriezen, dus een test die op deze waarde let, hangt niet aan de klok
 *    van de machine.
 *
 * ⚠️ **En hij komt van het tóestel en niet van de server, en dat mag hier**: aan
 *    `done_at` hangt geen cyclus, geen punt en geen reeks. Zou er ooit iets aan
 *    gaan hangen, dan hoort dit een RPC te worden met `now()` van de database —
 *    want dan is een verzette systeemklok een scoregat.
 */
export async function zetAfgevinkt(id: string, af: boolean): Promise<Resultaat<Taak>> {
  // ⚠️ **Geen `{ done_at }`-verkorting, en dat is geen stijl.**
  //    `scripts/kolomrechten-controle.mjs` leest de kolomnamen uit deze aanroep
  //    om ze naast de kolomgrant te leggen, en een verkorte sleutel is voor die
  //    lezer geen objectliteraal — dan zwijgt de controle over dit hele paar.
  const wanneer = af ? now().toISOString() : null;

  const gevalideerd = taakPatchSchema.safeParse({ done_at: wanneer });
  if (!gevalideerd.success) {
    return { ok: false, melding: invoerfout(gevalideerd.error, t('lijst.invoer')) };
  }

  const { data, error } = await supabase()
    .from('todo_items')
    .update({ done_at: wanneer })
    .eq('id', id)
    .select(KOLOMMEN)
    .maybeSingle();

  return naSchrijf(data, error, 'todos.check');
}

/**
 * Wisselt de plek van twee taken.
 *
 * ⚠️ **Twee losse PATCH-verzoeken, en dat mag hier.** Bij `milestones` moest dit
 *    een RPC worden omdat `(goal_id, order_index)` een unieke index draagt en
 *    PostgREST elk verzoek in zijn eigen transactie draait — halverwege stuklopen
 *    laat daar een halfverschoven lijst achter. `todo_items` heeft die index
 *    niet, dus het ergste dat hier kan gebeuren is dat twee taken even hetzelfde
 *    nummer dragen en `created_at` de volgorde bepaalt.
 *
 * ⚠️ **Dragen ze al hetzelfde nummer, dan doet wisselen niets**, en dat zegt deze
 *    functie met zoveel woorden in plaats van stil te slagen. Dat gebeurt alleen
 *    als twee toestellen tegelijk een taak toevoegden — zie `maakTaak()`.
 */
export async function verzetTaak(deze: Taak, die: Taak): Promise<Resultaat<true>> {
  if (deze.order_index === die.order_index) {
    return { ok: false, melding: t('lijst.verzetten_gelijk') };
  }

  const eerste = await zetVolgorde(deze.id, die.order_index);
  if (!eerste.ok) return eerste;

  const tweede = await zetVolgorde(die.id, deze.order_index);
  if (!tweede.ok) return tweede;

  return { ok: true, waarde: true };
}

/**
 * Zet één taak op een plek in de lijst.
 *
 * ⚠️ **De patch staat hier als objectliteraal en niet achter een opgebouwd
 *    object, en dat is geen stijl.** `scripts/kolomrechten-controle.mjs` leest
 *    de kolommen uit de aanroep om ze naast de kolomgrant te leggen; een object
 *    dat elders wordt samengesteld is voor die lezer onleesbaar, en dan zwijgt
 *    de controle over álle kolommen van dit paar. 📏 Dat is gemeten: de eerste
 *    versie bouwde de patch met voorwaardelijke spreads, en de controle meldde
 *    `body`, `done_at` en `order_index` alle drie als grant zonder gebruiker.
 */
async function zetVolgorde(id: string, plek: number): Promise<Resultaat<Taak>> {
  const gevalideerd = taakPatchSchema.safeParse({ order_index: plek });
  if (!gevalideerd.success) {
    return { ok: false, melding: invoerfout(gevalideerd.error, t('lijst.invoer')) };
  }

  const { data, error } = await supabase()
    .from('todo_items')
    .update({ order_index: plek })
    .eq('id', id)
    .select(KOLOMMEN)
    .maybeSingle();

  return naSchrijf(data, error, 'todos.move');
}

/**
 * De gedeelde afhandeling van een PATCH op één taak.
 *
 * ⚠️ **Nul rijen is hier een fout en geen stilte.** RLS filtert een taak van
 *    iemand anders weg zónder foutcode, dus een PATCH die niets raakte geeft
 *    `data === null` en `error === null`. Zou dit als succes tellen, dan meldt
 *    het scherm "opgeslagen" bij een wijziging die nergens landde — precies de
 *    stille terugzetting van QS8-314.
 */
function naSchrijf(
  data: Taak | null,
  error: { readonly code?: string } | null,
  bron: string,
): Resultaat<Taak> {
  if (error) {
    reportError(error, bron, { code: error.code });
    return { ok: false, melding: t('lijst.opslaan_mislukt') };
  }

  if (data === null) {
    return { ok: false, melding: t('lijst.bestaat_niet') };
  }

  return { ok: true, waarde: data };
}

/**
 * Verwijdert een taak. Onomkeerbaar; het scherm vraagt eerst.
 *
 * ⚠️ **Deze functie staat onderaan en dat is geen willekeur.**
 *    `scripts/kolomrechten-controle.mjs` leest een keten vanaf de tabelnaam tot
 *    aan de volgende, en een `.delete()` heeft geen kolommen om te lezen. Stond
 *    deze functie tussen twee schrijvers in, dan pakte die lezer de
 *    schrijfaanroep van de vólgende functie op en meldde "geen objectliteraal": een
 *    ongemeten paar, en ongemeten is in dit project niet groen. 📏 Precies dat
 *    gebeurde, en het is de reden dat deze regel hier staat in plaats van een
 *    rij in `NIET_TE_LEZEN` — een uitzondering die je met een verhuizing kunt
 *    vermijden, hoort geen uitzondering te worden.
 */
export async function verwijderTaak(id: string): Promise<Resultaat<true>> {
  const { error } = await supabase().from('todo_items').delete().eq('id', id);

  if (error) {
    reportError(error, 'todos.delete', { code: error.code });
    return { ok: false, melding: t('lijst.verwijderen_mislukt') };
  }

  return { ok: true, waarde: true };
}
