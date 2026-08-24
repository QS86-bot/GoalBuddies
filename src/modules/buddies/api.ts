import { t } from '../../shared/i18n';

import type { Database, Tables, TablesUpdate } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { apparaatTijdzone, type Cycle } from '../../shared/time';

import {
  codeSchema,
  groepPatchSchema,
  groepSchema,
  normaliseerCode,
  type GroepInvoer,
  type GroepPatch,
  type Zichtbaarheid,
} from './schemas';

/**
 * Buddy-groepen — EPIC 5.
 *
 * ⚠️ Vier dingen die hier niet gebeuren, en waar de reden bij hoort:
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
 *
 *    4. **Er komt nooit servertekst op het scherm.** De RPC's geven sinds 0017 en
 *       0018 een kort kenmerk terug (`rate_limited`, `not_admin`) en de zin
 *       hoort thuis in dit bestand. Een eerdere versie liet "leesbare"
 *       servermeldingen door en dat lekte Postgres-jargon en tabelnamen —
 *       precies wat `shared/ui/AsyncView.tsx` verbiedt.
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
// Uitkomsten van de RPC's
// ---------------------------------------------------------------------------

/**
 * De RPC's geven `{ ok, reason }` terug in plaats van een exception te gooien.
 *
 * ⚠️ Dat is geen stijlkeuze. Een `raise exception` in een SECURITY DEFINER-RPC
 *    rolt de transactie terug, inclusief alles wat je net wilde onthouden — zo
 *    telde de limiet op uitnodigingspogingen jarenlang niets (migratie 0017).
 */
interface RpcUitkomst {
  readonly ok?: boolean;
  readonly reason?: string;
  readonly group?: Groep;
  readonly group_id?: string;
  readonly invite_code?: string;
  readonly invite_revoked?: boolean;
}

/**
 * De redenen die de RPC's teruggeven, in gewone taal.
 *
 * ⚠️ **Een functie en geen constante** — QS8-115. Een `const` met `t()` erin
 *    wordt één keer bij het importeren opgebouwd, en dat is vóórdat het profiel
 *    geladen is; de taal staat dan vast op de apparaattaal. Zelfde val als bij
 *    `BEVESTIGING` in `shared/ui`, `verwijderMelding()` in `auth` en de twee
 *    tabellen in `completions/approvals.ts`.
 *
 * ⚠️ Geen van deze zinnen noemt wélke groep of wie erin zit. Een onbekende code
 *    hoort geen informatie op te leveren over een groep waar je niet in zit —
 *    anders is een uitnodigingslink een zoekmachine.
 */
function meldingen(): Readonly<Record<string, string>> {
  return {
    // join_group_with_code
    rate_limited: t('groep.rate_limited'),
    invalid: t('groep.ongeldige_link'),
    group_full: t('groep.vol'),
    too_many_groups: t('groep.te_veel_groepen'),

    // create_group
    name_too_short: t('groep.naam_kort'),
    name_too_long: t('groep.naam_lang'),
    bad_huddle_day: t('groep.slechte_huddledag'),
    daily_limit: t('groep.daglimiet'),

    // rotate_invite_code en set_invite_revoked
    not_admin: t('groep.geen_beheerder'),

    // zet_groepszichtbaarheid (besluit A41, migratie 0076)
    not_confirmed: t('zichtbaarheid.niet_bevestigd'),
    unknown_visibility: t('zichtbaarheid.onbekend'),
    unchanged: t('zichtbaarheid.ongewijzigd'),
    too_soon: t('zichtbaarheid.te_snel'),
  };
}

function melding(reason: string | undefined, terugval: string): string {
  return meldingen()[reason ?? ''] ?? terugval;
}

function uitkomstVan(data: unknown): RpcUitkomst {
  return (data ?? {}) as RpcUitkomst;
}

// ---------------------------------------------------------------------------
// Lezen
// ---------------------------------------------------------------------------

/**
 * De groepen waar deze gebruiker lid van is.
 *
 * ⚠️ Geen filter op `user_id` nodig: `groups_select` laat uitsluitend groepen
 *    door waar je lid van bent.
 *
 * ⚠️ Een expliciete kolomlijst en geen `select('*')`. Het lijstscherm heeft de
 *    uitnodigingscode niet nodig, en een code die je niet ophaalt kan niet in een
 *    cache of een schermafbeelding belanden.
 */
export async function fetchMijnGroepen(): Promise<readonly Groep[]> {
  const { data, error } = await supabase()
    .from('groups')
    .select('id, name, icon, huddle_day, tz, status, created_at, created_by')
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) {
    reportError(error, 'groups.mine', { pgcode: error.code });
    throw new Error(t('groep.groepen_laden'));
  }

  return (data ?? []) as unknown as Groep[];
}

/**
 * Eén groep, met de uitnodigingscode erbij.
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
    reportError(error, 'groups.get', { group_id: groupId, pgcode: error.code });
    throw new Error(t('groep.groep_laden'));
  }

  return data;
}

/**
 * Het lidmaatschap van één gebruiker in één groep.
 *
 * ⚠️ Hiermee en niet met een regel uit het overzicht wordt bepaald of je
 *    beheerder bent. Dat lijkt omslachtig — de rol staat ook in
 *    `group_overview` — maar dan hangt een autorisatie-afgeleide aan de vraag of
 *    je toevallig op pagina één staat.
 */
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
    reportError(error, 'groups.membership', { group_id: groupId, pgcode: error.code });
    throw new Error(t('groep.lidmaatschap_laden'));
  }

  return data;
}

/**
 * Eén regel van het groepsoverzicht — QS8-55.
 *
 * ⚠️ Wat hier niet in staat, staat er met opzet niet in: geen puntentotaal, geen
 *    gemiste weken, geen weekstatus, geen `last_cycle_start` en sinds migratie
 *    0019 ook geen `best_streak` — want `best_streak > current_streak` is
 *    sluitend bewijs dat iemand een reeks verbroken heeft. Wat er wél staat,
 *    staat er omdat het een positief signaal is.
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
  /**
   * De beste reeks ooit — **alleen gevuld in een open groep** (besluit A41,
   * migratie 0078) en voor de eigenaar zelf.
   *
   * ⚠️ `null` betekent hier "niet voor jou" en niet "geen waarde":
   *    `user_streaks.best_streak` is `not null default 0`. In een beschermde
   *    groep is dit veld dus altijd `null`, en dát is de bescherming — `best >
   *    current` is sluitend bewijs van een verbroken reeks.
   */
  readonly best_streak: number | null;
  /**
   * De laatste cyclus die in de reeks meetelde — zelfde regel als
   * `best_streak`.
   *
   * ⚠️ Hier is `null` wél dubbelzinnig (de kolom is nullable: niemand heeft nog
   *    een cyclus afgerond), en dat valt de goede kant op. Wie hem niet mag
   *    zien, leert niets uit een `null` die twee dingen kan betekenen; wie hem
   *    wél mag zien, krijgt altijd de echte waarde.
   */
  readonly last_cycle_start: string | null;
  readonly closed_this_period: boolean;
}

/**
 * De rij zoals de RPC hem teruggeeft.
 *
 * ⚠️ Afgeleid van het gegenereerde type en niet met de hand overgetypt. Dat is
 *    het hele punt van dit patroon: hernoemt iemand een kolom in
 *    `group_overview()`, dan breekt de build hier en niet pas op een scherm.
 *    De nullability klopt in de generator níét — kolommen van een
 *    set-returning functie komen er nooit als nullable uit, terwijl de left joins
 *    ze wel degelijk leeg kunnen laten — dus die wordt hier toegevoegd.
 */
type RpcOverzichtRij = Database['public']['Functions']['group_overview']['Returns'][number];
type OverzichtRij = { readonly [K in keyof RpcOverzichtRij]: RpcOverzichtRij[K] | null };

/**
 * Zet een rij om, of geeft `null` als hij niet bruikbaar is.
 *
 * ⚠️ De controle staat op `user_id`. `display_name` staat er bewust níét bij:
 *    `profiles.display_name` is NOT NULL en de functie doet een inner join, dus
 *    die controle zou nooit afgaan — een vangnet onder een plek waar niemand
 *    valt. Wat wél leeg kan zijn (`goal_id`, `goal_title`, `current_streak`) komt
 *    uit left joins en is een geldige uitkomst, geen fout.
 */
function naarGroepslid(rij: OverzichtRij): Groepslid | null {
  if (typeof rij.user_id !== 'string') {
    reportError(new Error('Rij uit group_overview zonder user_id'), 'groups.parse');
    return null;
  }

  return {
    user_id: rij.user_id,
    display_name: rij.display_name ?? t('groep.onbekend_lid'),
    avatar_url: rij.avatar_url,
    role: rij.role ?? 'member',
    member_status: rij.member_status ?? 'active',
    goal_id: rij.goal_id,
    goal_title: rij.goal_title,
    goal_target_date: rij.goal_target_date,
    milestones_total: rij.milestones_total ?? 0,
    milestones_done: rij.milestones_done ?? 0,
    current_streak: rij.current_streak,
    // ⚠️ Geen `?? 0` op deze twee. Dat zou van "niet voor jou" een `0` maken, en
    //    dan toont een beschermde groep "beste reeks: 0" — een getal dat een
    //    bewering doet waar de database er geen deed. Zie besluit A41.
    best_streak: rij.best_streak,
    last_cycle_start: rij.last_cycle_start,
    closed_this_period: rij.closed_this_period ?? false,
  };
}

/**
 * Het groepsoverzicht in één ronde — QS8-55.
 *
 * ⚠️ De klassieke N+1 van dit project. Eén RPC levert lid, gekoppeld doel,
 *    mijlpaalvoortgang, reeks én of deze periode al afgesloten is. Per lid
 *    opnieuw bevragen is hier de valkuil die het beslisdocument met naam noemt,
 *    en er staat een test op met twaalf leden die telt hoeveel verzoeken het
 *    kost.
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
    reportError(error, 'groups.overview', { group_id: groupId, pgcode: error.code });
    throw new Error(t('groep.overzicht_laden'));
  }

  const ruw = (data ?? []) as readonly OverzichtRij[];
  const rijen = ruw.map(naarGroepslid).filter((lid): lid is Groepslid => lid !== null);

  // ⚠️ Onbruikbare rijen gaan óók van het totaal af. Zonder die aftrek blijft
  //    `meer` op waar staan en toont de UI voor altijd "11 van 12" zonder dat er
  //    een twaalfde te laden valt.
  const overgeslagen = ruw.length - rijen.length;
  const totaal = Math.max(0, (ruw[0]?.total_members ?? rijen.length) - overgeslagen);

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
  // Wél valideren, net als `wijzigGroep`. De server is de waarheid en weigert dit
  // ook, maar een lege naam hoort niet eerst een netwerkronde te kosten.
  const gevalideerd = groepSchema.safeParse(invoer);
  if (!gevalideerd.success) {
    return { ok: false, melding: gevalideerd.error.issues[0]?.message ?? t('groep.invoer') };
  }

  const { data, error } = await supabase().rpc('create_group', {
    group_name: gevalideerd.data.name,
    huddle_day: gevalideerd.data.huddle_day,
    // ⚠️ Uit `shared/time` en niet rechtstreeks uit `Intl`. Dit is de groepsklok
    //    van domeinregel 1: `groups.tz` bepaalt de huddledag, de weekafsluiting
    //    en De Ketting voor iedereen in deze groep. Een lege of onbekende waarde
    //    is hier geen persoonlijk ongemak maar een groep waarvan de week op het
    //    verkeerde moment omslaat. Zie `apparaatTijdzone()`.
    tz: apparaatTijdzone(),
    // ⚠️ Besluit A41 (migratie 0076). De server valt bij een onbekende waarde
    //    terug op `beschermd` en weigert niet — dat is dezelfde keuze als bij
    //    `tz`: een groep die per ongeluk beschermd is, kan alsnog open; een groep
    //    die per ongeluk open is, heeft de gemiste weken van zijn leden al laten
    //    zien.
    zichtbaarheid: gevalideerd.data.zichtbaarheid,
  });

  if (error) {
    reportError(error, 'groups.create', { pgcode: error.code });
    return { ok: false, melding: t('groep.aanmaken_mislukt_kort') };
  }

  const uitkomst = uitkomstVan(data);
  if (uitkomst.ok !== true || uitkomst.group === undefined) {
    return {
      ok: false,
      melding: melding(uitkomst.reason, t('groep.aanmaken_mislukt')),
    };
  }

  return { ok: true, waarde: uitkomst.group };
}

/**
 * Werkt de instellingen van een groep bij — QS8-58 voor de huddledag.
 *
 * ⚠️ Alleen een beheerder komt hier doorheen (`groups_update`), en zelfs een
 *    beheerder raakt de uitnodigingscode niet: sinds 0019 heeft `authenticated`
 *    geen UPDATE-recht op die kolom, en de trigger `groups_guard` zet hem
 *    bovendien terug. Wie de link wil vervangen, gebruikt `vernieuwUitnodiging()`.
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
    return { ok: false, melding: gevalideerd.error.issues[0]?.message ?? t('groep.invoer') };
  }

  const update: TablesUpdate<'groups'> = {};
  if (gevalideerd.data.name !== undefined) update.name = gevalideerd.data.name;
  if (gevalideerd.data.huddle_day !== undefined) update.huddle_day = gevalideerd.data.huddle_day;
  if (gevalideerd.data.evidence_policy !== undefined) {
    update.evidence_policy = gevalideerd.data.evidence_policy;
  }

  const { data, error } = await supabase()
    .from('groups')
    .update(update)
    .eq('id', groupId)
    .select('*')
    .single();

  if (error) {
    reportError(error, 'groups.update', { group_id: groupId, pgcode: error.code });
    return { ok: false, melding: t('groep.opslaan_mislukt') };
  }

  return { ok: true, waarde: data };
}

/** Nieuwe uitnodigingscode. De oude link werkt daarna niet meer — QS8-52. */
export async function vernieuwUitnodiging(groupId: string): Promise<Resultaat<string>> {
  const { data, error } = await supabase().rpc('rotate_invite_code', { p_group_id: groupId });

  if (error) {
    reportError(error, 'groups.rotate', { group_id: groupId, pgcode: error.code });
    return { ok: false, melding: t('groep.link_vernieuwen_mislukt') };
  }

  const uitkomst = uitkomstVan(data);
  if (uitkomst.ok !== true || typeof uitkomst.invite_code !== 'string') {
    return { ok: false, melding: melding(uitkomst.reason, t('groep.link_vernieuwen_mislukt_kort')) };
  }

  return { ok: true, waarde: uitkomst.invite_code };
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
    reportError(error, 'groups.revoke', { group_id: groupId, pgcode: error.code });
    return { ok: false, melding: t('groep.actie_mislukt') };
  }

  const uitkomst = uitkomstVan(data);
  if (uitkomst.ok !== true) {
    return { ok: false, melding: melding(uitkomst.reason, t('groep.actie_mislukt_kort')) };
  }

  return { ok: true, waarde: uitkomst.invite_revoked ?? ingetrokken };
}

/**
 * Zet de zichtbaarheid van een groep om — besluit A41, grens 3 (QS8-132).
 *
 * ⚠️ **`bevestigd` is geen formaliteit en hoort daarom een parameter te zijn.**
 *    De RPC weigert zonder, en de default in de database is `false`. Een groep
 *    die van beschermd naar open gaat, verandert met terugwerkende kracht wat er
 *    over de ándere leden zichtbaar wordt — dat is dezelfde zwaarte als een
 *    commitment device (domeinregel 5), en dus nooit één klik.
 *
 * ⚠️ De kolom is voor geen enkele client schrijfbaar (migratie 0076 §2), dus dit
 *    is de énige route. Een `update` op `groups` zou stil niets doen: de trigger
 *    zet de waarde terug.
 *
 * ⚠️ Terug naar `beschermd` kan altijd; naar `open` hooguit één keer per etmaal.
 *    De rem staat alleen op de onveilige richting, want een beheerder die zich
 *    vergist heeft, moet dat onmiddellijk kunnen terugdraaien.
 */
export async function zetGroepszichtbaarheid(
  groupId: string,
  naar: Zichtbaarheid,
  bevestigd: boolean,
): Promise<Resultaat<Zichtbaarheid>> {
  const { data, error } = await supabase().rpc('zet_groepszichtbaarheid', {
    p_group_id: groupId,
    p_naar: naar,
    p_bevestigd: bevestigd,
  });

  if (error) {
    reportError(error, 'groups.visibility', { group_id: groupId, pgcode: error.code });
    return { ok: false, melding: t('groep.actie_mislukt') };
  }

  const uitkomst = uitkomstVan(data);
  if (uitkomst.ok !== true) {
    return { ok: false, melding: melding(uitkomst.reason, t('groep.actie_mislukt_kort')) };
  }

  return { ok: true, waarde: naar };
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
    return { ok: false, melding: gevalideerd.error.issues[0]?.message ?? t('groep.controleer_link') };
  }

  const { data, error } = await supabase().rpc('join_group_with_code', {
    code: gevalideerd.data,
  });

  if (error) {
    reportError(error, 'groups.join', { pgcode: error.code });
    return { ok: false, melding: t('groep.deelnemen_mislukt') };
  }

  const uitkomst = uitkomstVan(data);
  if (uitkomst.ok !== true || typeof uitkomst.group_id !== 'string') {
    return {
      ok: false,
      melding: melding(uitkomst.reason, t('groep.deelnemen_mislukt_link')),
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
  /**
   * Staat deze groep open of beschermd? Besluit A41, migratie 0080.
   *
   * ⚠️ **Dit is het enige feit op dit scherm dat over de weken van de bezoeker
   *    zélf gaat.** Meedoen met een open groep maakt zijn gemiste weken zichtbaar
   *    voor de anderen — dezelfde overgang als wanneer een groep wordt opengezet,
   *    maar zonder systeembericht, want er verandert niets aan de groep. Dit veld
   *    is de enige plek waar dat kan staan.
   *
   * ⚠️ Ontbreekt hij (een oudere server), dan `beschermd`. Onbekend is beschermd
   *    — overal in dit besluit dezelfde kant op.
   */
  readonly zichtbaarheid: Zichtbaarheid;
  readonly member_count: number;
  /** Ziet deze bezoeker het volledige beeld? Alleen waar als hij ingelogd is. */
  readonly detailed: boolean;
  readonly members: readonly UitnodigingLid[];
}

/**
 * De groep achter een uitnodigingslink, zónder account — QS8-59.
 *
 * ⚠️ Dit is het enige eindpunt van de app dat zonder in te loggen bereikbaar is.
 *    Wie niet ingelogd is, krijgt sinds migratie 0019 minder te zien: de naam van
 *    de groep, het aantal leden, de huddledag en voornamen. Volledige namen,
 *    avatars en doeltitels zijn voor wie een account heeft.
 *
 *    De reden: koppelen is toestemming voor de gróép, niet voor iedereen aan wie
 *    de link ooit wordt doorgestuurd — en een link is nu juist bedoeld om door te
 *    sturen.
 *
 * ⚠️ `null` betekent: ingetrokken, verlopen of nooit bestaan. Die drie geven met
 *    opzet hetzelfde antwoord.
 */
export async function fetchUitnodiging(code: string): Promise<Uitnodiging | null> {
  const schoon = normaliseerCode(code);
  if (schoon.length === 0) return null;

  const { data, error } = await supabase().rpc('invite_preview', { code: schoon });

  if (error) {
    reportError(error, 'groups.preview', { pgcode: error.code });
    throw new Error(t('groep.uitnodiging_laden'));
  }

  if (data === null) return null;

  const gelezen = data as unknown as Uitnodiging & { zichtbaarheid?: unknown };

  // ⚠️ **Onbekend is beschermd**, en dat is geen defensieve reflex maar de kant
  //    waar dit hele besluit op leunt. Een oudere server die dit veld nog niet
  //    stuurt, hoort geen "open" te suggereren: dan zou een bezoeker denken dat
  //    hij iets deelt wat hij niet deelt, of erger, andersom.
  const zichtbaarheid: Zichtbaarheid =
    gelezen.zichtbaarheid === 'open' ? 'open' : 'beschermd';

  return { ...gelezen, zichtbaarheid };
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
    reportError(error, 'groups.link', { group_id: groupId, goal_id: goalId, pgcode: error.code });
    return { ok: false, melding: t('groep.koppelen_mislukt') };
  }

  return { ok: true, waarde: true };
}

/**
 * Ontkoppelt een doel van een groep — QS8-54.
 *
 * ⚠️ Wist geen geschiedenis. Voltooiingen, goedkeuringen, punten en
 *    kettingschakels blijven staan; alleen de zichtbaarheid in déze groep stopt.
 *    Een toestemming die je niet kunt intrekken is geen toestemming, dus deze
 *    functie hoort een knop te hebben — en die staat op het groepsscherm.
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
    reportError(error, 'groups.unlink', { group_id: groupId, goal_id: goalId, pgcode: error.code });
    return { ok: false, melding: t('groep.ontkoppelen_mislukt') };
  }

  return { ok: true, waarde: true };
}

/**
 * De groepen waar dít doel aan gekoppeld is — Q-TODO A7.
 *
 * ⚠️ De omgekeerde vraag van `fetchGekoppeldeDoelIds`, en nodig sinds de
 *    streefdatum van een gedeeld doel alleen met akkoord van de groep verschuift:
 *    het doelscherm moet weten óf er een groep is, en zo ja welke het verzoek
 *    krijgt.
 *
 * ⚠️ `goal_group_links_select` eist lidmaatschap van de groep, dus dit levert
 *    alleen groepen op waar je zelf in zit. Voor de eigenaar van het doel is dat
 *    hetzelfde antwoord — koppelen kan hij immers alleen bij eigen groepen.
 */
export async function fetchGroepenVanDoel(
  goalId: string,
): Promise<readonly { readonly group_id: string; readonly name: string }[]> {
  const { data, error } = await supabase()
    .from('goal_group_links')
    .select('group_id, groups(name)')
    .eq('goal_id', goalId)
    .limit(20);

  if (error) {
    reportError(error, 'groups.ofGoal', { goal_id: goalId, pgcode: error.code });
    throw new Error(t('groep.gekoppelde_groepen_laden'));
  }

  return (data ?? []).map((rij) => ({
    group_id: rij.group_id,
    name: rij.groups?.name ?? t('groep.naamloos'),
  }));
}

/** De doelen die aan deze groep gekoppeld zijn en die jij mag zien. */
export async function fetchGekoppeldeDoelIds(groupId: string): Promise<readonly string[]> {
  const { data, error } = await supabase()
    .from('goal_group_links')
    .select('goal_id')
    .eq('group_id', groupId)
    .limit(50);

  if (error) {
    reportError(error, 'groups.links', { group_id: groupId, pgcode: error.code });
    throw new Error(t('groep.gekoppelde_doelen_laden'));
  }

  return (data ?? []).map((rij) => rij.goal_id);
}
