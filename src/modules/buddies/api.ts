import type { Tables, TablesUpdate } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import type { Cycle } from '../../shared/time';

import {
  codeSchema,
  groepPatchSchema,
  normaliseerCode,
  type GroepInvoer,
  type GroepPatch,
} from './schemas';

/**
 * Buddy-groepen — EPIC 5.
 *
 * ⚠️ Drie dingen die hier niet gebeuren, en waar de reden bij hoort:
 *
 *    1. **Er wordt nergens een uitnodigingscode bedacht.** Die komt uit
 *       `create_group()` of `rotate_invite_code()`. Een code die de client kiest,
 *       is geen code maar een verzoek — dezelfde fout als de vier
 *       client-gekozen waarden die migratie 0006 heeft dichtgezet.
 *
 *    2. **Er wordt nergens een week uitgerekend.** Het groepsoverzicht krijgt de
 *       begindatum van de lopende periode mee uit `periods.ts`, die hem uit
 *       `shared/time` haalt (CLAUDE.md, correctheidsregel 7).
 *
 *    3. **Er wordt nergens op lidmaatschap gefilterd om iets te verbergen.** Dat
 *       doen de policies. Een `.eq('user_id', ...)` erbij zou suggereren dat de
 *       beveiliging hier zit, en dat is precies het misverstand dat je niet wilt.
 */

export type Groep = Tables<'groups'>;
export type Lidmaatschap = Tables<'group_members'>;

export type Resultaat<T> = { ok: true; waarde: T } | { ok: false; melding: string };

/** Standaard 20 per pagina. Ongepagineerd bestaat niet (CLAUDE.md, regel 10). */
export const LEDEN_PER_PAGINA = 20;

export interface Pagina<T> {
  readonly rijen: readonly T[];
  readonly totaal: number;
  readonly meer: boolean;
}

// ---------------------------------------------------------------------------
// Lezen
// ---------------------------------------------------------------------------

/**
 * De groepen waar deze gebruiker lid van is.
 *
 * ⚠️ Geen filter op `user_id` nodig: `groups_select` laat uitsluitend groepen
 *    door waar je lid van bent.
 */
export async function fetchMijnGroepen(): Promise<readonly Groep[]> {
  const { data, error } = await supabase()
    .from('groups')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) {
    reportError(error, 'groups.mine', { code: error.code });
    throw new Error('Je groepen konden niet geladen worden.');
  }

  return data ?? [];
}

/**
 * Eén groep.
 *
 * ⚠️ Een niet-lid krijgt hier `null`, precies zoals bij een groep die niet
 *    bestaat. Dat onderscheid hoort niet te bestaan: anders is dit een orakel
 *    dat vertelt welke groeps-id's echt zijn.
 */
export async function fetchGroep(groupId: string): Promise<Groep | null> {
  const { data, error } = await supabase()
    .from('groups')
    .select('*')
    .eq('id', groupId)
    .maybeSingle();

  if (error) {
    reportError(error, 'groups.get', { group_id: groupId, code: error.code });
    throw new Error('Deze groep kon niet geladen worden.');
  }

  return data;
}

/** Eén lid, om te weten of jij beheerder bent zonder de hele lijst op te halen. */
export async function fetchMijnLidmaatschap(
  groupId: string,
  userId: string,
): Promise<Lidmaatschap | null> {
  const { data, error } = await supabase()
    .from('group_members')
    .select('*')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    reportError(error, 'groups.membership', { group_id: groupId, code: error.code });
    throw new Error('Je lidmaatschap kon niet geladen worden.');
  }

  return data;
}

/**
 * Eén regel van het groepsoverzicht — QS8-55.
 *
 * ⚠️ Wat hier niet in staat, staat er met opzet niet in: geen puntentotaal, geen
 *    gemiste weken, geen weekstatus, geen `last_cycle_start`. Uit alle vier is
 *    af te leiden dat iemand een week gemist heeft, en dat is domeinregel 7. Wat
 *    er wél staat, staat er omdat het een positief signaal is.
 *
 * ⚠️ `closed_this_period` is aanwezigheid en geen prestatie: De Ketting telt
 *    opdagen. Binnen de lopende periode betekent `false` niets anders dan "nog
 *    niet" — en daarom vraagt deze module uitsluitend de lopende periode op.
 */
export interface Groepslid {
  readonly user_id: string;
  readonly display_name: string;
  readonly avatar_url: string | null;
  readonly role: string;
  readonly member_status: string;
  readonly goal_id: string | null;
  readonly goal_title: string | null;
  readonly goal_target_date: string | null;
  readonly milestones_total: number;
  readonly milestones_done: number;
  readonly current_streak: number | null;
  readonly best_streak: number | null;
  readonly closed_this_period: boolean;
}

/**
 * De rij zoals de RPC hem teruggeeft. Kolommen van een set-returning functie zijn
 * in de gegenereerde types niet nullable, terwijl de left joins ze wel degelijk
 * leeg kunnen laten. Zelfde patroon als `naarDoel()` in de doelenmodule: één
 * omzetfunctie, geen cast, en een melding als een rij niet klopt.
 */
interface OverzichtRij {
  readonly user_id: string | null;
  readonly display_name: string | null;
  readonly avatar_url: string | null;
  readonly role: string | null;
  readonly member_status: string | null;
  readonly goal_id: string | null;
  readonly goal_title: string | null;
  readonly goal_target_date: string | null;
  readonly milestones_total: number | null;
  readonly milestones_done: number | null;
  readonly current_streak: number | null;
  readonly best_streak: number | null;
  readonly closed_this_period: boolean | null;
  readonly total_members: number | null;
}

function naarGroepslid(rij: OverzichtRij): Groepslid | null {
  if (rij.user_id === null || rij.display_name === null) {
    reportError(new Error('Onvolledige rij uit group_overview'), 'groups.parse', {
      user_id: rij.user_id ?? 'geen',
    });
    return null;
  }

  return {
    user_id: rij.user_id,
    display_name: rij.display_name,
    avatar_url: rij.avatar_url,
    role: rij.role ?? 'member',
    member_status: rij.member_status ?? 'active',
    goal_id: rij.goal_id,
    goal_title: rij.goal_title,
    goal_target_date: rij.goal_target_date,
    milestones_total: rij.milestones_total ?? 0,
    milestones_done: rij.milestones_done ?? 0,
    current_streak: rij.current_streak,
    best_streak: rij.best_streak,
    closed_this_period: rij.closed_this_period ?? false,
  };
}

/**
 * Het groepsoverzicht in één ronde — QS8-55.
 *
 * ⚠️ De klassieke N+1 van dit project. Eén RPC levert lid, gekoppeld doel,
 *    mijlpaalvoortgang, reeks én of deze periode al afgesloten is. Per lid
 *    opnieuw bevragen is hier de valkuil die het beslisdocument met naam noemt,
 *    en er staat een test op met tien leden.
 */
export async function fetchGroepsoverzicht(
  groupId: string,
  periode: Cycle,
  opties: { readonly pagina?: number } = {},
): Promise<Pagina<Groepslid>> {
  const pagina = opties.pagina ?? 0;
  const van = pagina * LEDEN_PER_PAGINA;

  const { data, error } = await supabase().rpc('group_overview', {
    p_group_id: groupId,
    p_period_start: periode.startDate,
    p_limit: LEDEN_PER_PAGINA,
    p_offset: van,
  });

  if (error) {
    reportError(error, 'groups.overview', { group_id: groupId, code: error.code });
    throw new Error('Het groepsoverzicht kon niet geladen worden.');
  }

  const rijen = ((data ?? []) as unknown as OverzichtRij[])
    .map(naarGroepslid)
    .filter((lid): lid is Groepslid => lid !== null);

  const totaal = ((data ?? []) as unknown as OverzichtRij[])[0]?.total_members ?? rijen.length;

  return { rijen, totaal, meer: van + rijen.length < totaal };
}

// ---------------------------------------------------------------------------
// Schrijven
// ---------------------------------------------------------------------------

/**
 * Maakt een groep aan — QS8-52.
 *
 * ⚠️ Loopt via de RPC en niet via een insert. Twee losse inserts kunnen halverwege
 *    stranden en laten dan een groep zonder leden achter — een groep die
 *    vervolgens voor niemand zichtbaar is, ook niet voor zijn eigen oprichter.
 *    De policy `groups_insert` staat sinds migratie 0016 dan ook op `false`.
 */
export async function maakGroep(invoer: GroepInvoer): Promise<Resultaat<Groep>> {
  const { data, error } = await supabase().rpc('create_group', {
    group_name: invoer.name,
    huddle_day: invoer.huddle_day,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  if (error) {
    reportError(error, 'groups.create', { code: error.code });
    return { ok: false, melding: serverMelding(error.message, 'Je groep kon niet worden aangemaakt.') };
  }

  return { ok: true, waarde: data as unknown as Groep };
}

/**
 * Werkt de instellingen van een groep bij — QS8-58 voor de huddledag.
 *
 * ⚠️ Alleen een beheerder komt hier doorheen (`groups_update`), en zelfs een
 *    beheerder raakt de uitnodigingscode niet: de trigger `groups_guard` zet die
 *    terug. Wie de link wil vervangen, gebruikt `vernieuwUitnodiging()`.
 *
 * ⚠️ De huddledag wijzigen breekt geen lopende ketting: een `chain_links`-rij
 *    draagt de `group_period_start` waarmee hij gelegd is, en niets herberekent
 *    die achteraf.
 */
export async function wijzigGroep(
  groupId: string,
  patch: GroepPatch,
): Promise<Resultaat<Groep>> {
  const gevalideerd = groepPatchSchema.safeParse(patch);
  if (!gevalideerd.success) {
    return { ok: false, melding: gevalideerd.error.issues[0]?.message ?? 'Controleer je invoer.' };
  }

  const update: TablesUpdate<'groups'> = {};
  if (gevalideerd.data.name !== undefined) update.name = gevalideerd.data.name;
  if (gevalideerd.data.huddle_day !== undefined) update.huddle_day = gevalideerd.data.huddle_day;

  const { data, error } = await supabase()
    .from('groups')
    .update(update)
    .eq('id', groupId)
    .select('*')
    .single();

  if (error) {
    reportError(error, 'groups.update', { group_id: groupId, code: error.code });
    return { ok: false, melding: 'Opslaan lukte niet. Alleen een beheerder kan dit wijzigen.' };
  }

  return { ok: true, waarde: data };
}

/** Nieuwe uitnodigingscode. De oude link werkt daarna niet meer — QS8-52. */
export async function vernieuwUitnodiging(groupId: string): Promise<Resultaat<string>> {
  const { data, error } = await supabase().rpc('rotate_invite_code', { p_group_id: groupId });

  if (error) {
    reportError(error, 'groups.rotate', { group_id: groupId, code: error.code });
    return { ok: false, melding: serverMelding(error.message, 'De link vernieuwen lukte niet.') };
  }

  return { ok: true, waarde: data };
}

/** Sluit of heropent de uitnodigingslink zonder de code te vervangen — QS8-52. */
export async function zetUitnodigingIngetrokken(
  groupId: string,
  ingetrokken: boolean,
): Promise<Resultaat<boolean>> {
  const { data, error } = await supabase().rpc('set_invite_revoked', {
    p_group_id: groupId,
    p_revoked: ingetrokken,
  });

  if (error) {
    reportError(error, 'groups.revoke', { group_id: groupId, code: error.code });
    return { ok: false, melding: serverMelding(error.message, 'Dat lukte niet.') };
  }

  return { ok: true, waarde: data };
}

/**
 * De uitkomsten die `join_group_with_code` teruggeeft (migratie 0017).
 *
 * ⚠️ Dit zijn géén exceptions, en dat is de hele reden dat ze bestaan. Een
 *    `raise exception` in een RPC rolt de transactie terug, inclusief de rij in
 *    `invite_events` die de poging moest tellen — en dan telt een mislukte
 *    poging niet mee, precies het geval waarvoor de limiet er is.
 */
const DEELNAME_MELDING: Readonly<Record<string, string>> = {
  rate_limited:
    'Je hebt vandaag te vaak een uitnodiging geprobeerd. Morgen kan het weer — ' +
    'vraag je buddy intussen om de link nog eens te sturen.',
  invalid:
    'Deze uitnodigingslink werkt niet meer. Hij is ingetrokken of hij klopt niet; ' +
    'vraag je buddy om een nieuwe.',
  group_full: 'Deze groep zit vol. Drie tot vijf mensen werkt het best, dus dat is geen ramp.',
  too_many_groups: 'Je zit al in tien groepen. Verlaat er een om ruimte te maken.',
};

interface DeelnameUitkomst {
  readonly ok: boolean;
  readonly reason?: string;
  readonly group_id?: string;
}

/**
 * Toetreden met een code — QS8-53.
 *
 * ⚠️ Al lid zijn is hier geen fout maar een succes: de RPC geeft dan gewoon de
 *    groeps-id terug. Bij Habit Huddle liep hier stil elke uitnodiging dood, en
 *    dat staat met naam in de acceptatiecriteria.
 *
 * ⚠️ Ingetrokken en nooit-bestaan geven hetzelfde antwoord, en dus ook dezelfde
 *    melding. Een apart antwoord per geval maakt van deze route een orakel dat
 *    vertelt welke codes bestaan.
 */
export async function neemDeel(code: string): Promise<Resultaat<string>> {
  const gevalideerd = codeSchema.safeParse(code);
  if (!gevalideerd.success) {
    return { ok: false, melding: gevalideerd.error.issues[0]?.message ?? 'Controleer de link.' };
  }

  const { data, error } = await supabase().rpc('join_group_with_code', {
    code: gevalideerd.data,
  });

  if (error) {
    reportError(error, 'groups.join', { code: error.code });
    return {
      ok: false,
      melding: 'Deelnemen lukte niet. Probeer het zo nog eens.',
    };
  }

  const uitkomst = data as unknown as DeelnameUitkomst | null;

  if (!uitkomst?.ok || typeof uitkomst.group_id !== 'string') {
    return {
      ok: false,
      melding:
        DEELNAME_MELDING[uitkomst?.reason ?? ''] ??
        'Deelnemen lukte niet. Vraag je buddy om een nieuwe link.',
    };
  }

  return { ok: true, waarde: uitkomst.group_id };
}

// ---------------------------------------------------------------------------
// De gastvrije uitnodiging (QS8-59)
// ---------------------------------------------------------------------------

export interface UitnodigingLid {
  readonly display_name: string;
  readonly avatar_url: string | null;
  readonly goal_title: string | null;
}

export interface Uitnodiging {
  readonly group_id: string;
  readonly group_name: string;
  readonly icon: string | null;
  readonly huddle_day: number;
  readonly member_count: number;
  readonly members: readonly UitnodigingLid[];
}

/**
 * De groep achter een uitnodigingslink, zónder account — QS8-59.
 *
 * ⚠️ Dit is het enige eindpunt van de app dat zonder in te loggen bereikbaar is.
 *    Wat eruit komt is precies wat de RPC teruggeeft: naam, aantal leden en de
 *    doelen die expliciet aan déze groep gekoppeld zijn. Geen notities, geen
 *    chat, geen bewijs, geen reeksen, geen punten.
 *
 * ⚠️ `null` betekent: ingetrokken, verlopen of nooit bestaan. Die drie geven met
 *    opzet hetzelfde antwoord.
 */
export async function fetchUitnodiging(code: string): Promise<Uitnodiging | null> {
  const schoon = normaliseerCode(code);
  if (schoon.length === 0) return null;

  const { data, error } = await supabase().rpc('invite_preview', { code: schoon });

  if (error) {
    reportError(error, 'groups.preview', { code: error.code });
    throw new Error('Deze uitnodiging kon niet geladen worden.');
  }

  return data === null ? null : (data as unknown as Uitnodiging);
}

// ---------------------------------------------------------------------------
// Doelen koppelen (QS8-54)
// ---------------------------------------------------------------------------

/**
 * Koppelt een eigen doel aan een groep — QS8-54.
 *
 * ⚠️ Koppelen is de toestemming. Tot dit gebeurt staat het doel in geen enkele
 *    ledenlijst, ook niet van een groep waar je wél in zit. Hetzelfde doel kan in
 *    groep A staan en in groep B niet — dat is het acceptatiecriterium uit de PRD
 *    en het is de reden dat `goal_group_links` een aparte tabel is.
 */
export async function koppelDoelAanGroep(
  goalId: string,
  groupId: string,
): Promise<Resultaat<true>> {
  const { error } = await supabase()
    .from('goal_group_links')
    .upsert({ goal_id: goalId, group_id: groupId }, { onConflict: 'goal_id,group_id' });

  if (error) {
    reportError(error, 'groups.link', { group_id: groupId, goal_id: goalId, code: error.code });
    return { ok: false, melding: 'Koppelen lukte niet. Ben je lid van deze groep?' };
  }

  return { ok: true, waarde: true };
}

/**
 * Ontkoppelt een doel van een groep — QS8-54.
 *
 * ⚠️ Wist geen geschiedenis. Voltooiingen, goedkeuringen, punten en
 *    kettingschakels blijven staan; alleen de zichtbaarheid in déze groep stopt.
 */
export async function ontkoppelDoelVanGroep(
  goalId: string,
  groupId: string,
): Promise<Resultaat<true>> {
  const { error } = await supabase()
    .from('goal_group_links')
    .delete()
    .eq('goal_id', goalId)
    .eq('group_id', groupId);

  if (error) {
    reportError(error, 'groups.unlink', { group_id: groupId, goal_id: goalId, code: error.code });
    return { ok: false, melding: 'Ontkoppelen lukte niet.' };
  }

  return { ok: true, waarde: true };
}

/** De doelen die deze gebruiker aan deze groep gekoppeld heeft. */
export async function fetchGekoppeldeDoelIds(groupId: string): Promise<readonly string[]> {
  const { data, error } = await supabase()
    .from('goal_group_links')
    .select('goal_id')
    .eq('group_id', groupId)
    .limit(50);

  if (error) {
    reportError(error, 'groups.links', { group_id: groupId, code: error.code });
    throw new Error('De gekoppelde doelen konden niet geladen worden.');
  }

  return (data ?? []).map((rij) => rij.goal_id);
}

// ---------------------------------------------------------------------------
// Hulp
// ---------------------------------------------------------------------------

/**
 * De meldingen die de RPC's met `raise exception` teruggeven zijn Nederlands en
 * voor een gebruiker geschreven ("Deze groep zit vol", "Te veel pogingen").
 * Die zijn beter dan wat wij eroverheen zouden verzinnen. Alles wat er níét zo
 * uitziet — een Postgres-foutcode, een timeout — wordt vervangen door de
 * meegegeven tekst, zodat er nooit database-jargon op het scherm komt.
 */
function serverMelding(bericht: string, terugval: string): string {
  const schoon = bericht.trim();
  const leesbaar = schoon.length > 0 && schoon.length <= 160 && !/[_{}]|^ERROR/i.test(schoon);
  return leesbaar ? schoon : terugval;
}
