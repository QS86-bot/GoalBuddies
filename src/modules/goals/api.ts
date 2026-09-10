import type { Json, Tables, TablesUpdate } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import type { IsoDate } from '../../shared/time';
import { t } from '../../shared/i18n';
import { invoerfout, type Pagina, type Resultaat } from '../../shared/api';

import { streefdatumRedenen } from './deadline-redenen';

import {
  datumLigtInDeToekomst,
  doelPatchSchema,
  doelSchema,
  leesRitme,
  type DoelgebeurtenisClient,
  type DoelInvoer,
  type DoelPatch,
  type Ritme,
} from './schemas';

// ⚠️ Opnieuw geëxporteerd zodat de aanroepers via `modules/<naam>/index.ts`
//    ongemoeid blijven. De definitie staat sinds 25-08-2026 in `shared/api`;
//    hij stond hiervoor zeven keer woordelijk in deze codebase.
export type { Pagina, Resultaat };

/**
 * Hoofddoelen: aanmaken, bewerken, archiveren en het dashboard.
 *
 * ⚠️ Elke wijziging aan de streefdatum wordt gelogd in `goal_events`. Dat is
 *    geen boekhouding om de boekhouding: zonder die geschiedenis "loopt op
 *    koers" iemand die zijn deadline drie keer verzet, en dat is precies de
 *    zelfmisleiding die de Risico-radar moet zien (EPIC 12).
 */

export type Doel = Tables<'goals'>;

/**
 * Wat een client van een `goals`-rij terugkríjgt sinds migratie 0236.
 *
 * ⚠️⚠️ **`Doel` spiegelt de kolommen van de tabel; dit type spiegelt de
 *    kolomgrant.** Die twee liepen uiteen op de dag dat 0236 vijf kolommen
 *    introk, en TypeScript zweeg — de gegenereerde typing wéét niets van grants.
 *    Precies de klasse die vandaag als bevinding in `docs/ENGINEER-REVIEW.md`
 *    belandde: *"de gegenereerde typing zegt dat kolommen schrijfbaar zijn die
 *    dat niet zijn"*, en hier gold hetzelfde voor lezen.
 *
 *    Door het type te noemen valt het uiteenlopen voortaan van beide kanten op:
 *    haalt iemand een kolom uit de `select`, dan klaagt TypeScript, en zet
 *    iemand er een bij waar geen grant op zit, dan klaagt Postgres. Zelfde
 *    reparatie en zelfde reden als `Lijstgroep` in `modules/buddies` (QS8-387).
 */
export type DoelKern = Pick<
  Doel,
  | 'id'
  | 'owner_id'
  | 'title'
  | 'description'
  | 'category'
  | 'target_date'
  | 'status'
  | 'created_at'
  | 'updated_at'
  | 'ritme'
>;

/**
 * Een doel met zijn tellingen, uit de view `goal_dashboard` (migratie 0013).
 *
 * ⚠️ Postgres kent geen NOT NULL op viewkolommen, dus de gegenereerde types
 *    zijn overal nullable. Dat is technisch juist en praktisch onwerkbaar: elk
 *    scherm zou dan `?? ''` moeten strooien over velden die in werkelijkheid
 *    nooit leeg zijn.
 *
 *    De oplossing is niet een cast maar één controle, hier, in `naarDoel()`.
 *    Klopt een rij niet, dan valt hij eruit met een melding — en niet drie
 *    schermen verderop als `undefined`.
 */
export interface DoelMetVoortgang {
  readonly id: string;
  readonly owner_id: string;
  readonly title: string;
  readonly description: string | null;
  readonly category: string;
  readonly identity_statement: string | null;
  readonly target_date: string;
  readonly status: string;
  readonly available_hours_per_week: number | null;
  readonly max_points: number;
  /**
   * ⚠️ Geen `risk_status` meer. Die stond tot migratie 0050 als kolom op `goals`,
   *    en `goals_select` gaf elke groepsgenoot de héle rij — inclusief
   *    `'behind'` en `'unreachable'`, per definitie tegenslag over iemand
   *    anders. Hij woont nu in `goal_risk`, eigenaar-only. EPIC 12 leest hem
   *    daar; voortgang en risico zijn twee dingen en horen niet in één rij.
   */
  readonly milestones_total: number;
  readonly milestones_done: number;
  readonly weekly_total: number;
  readonly weekly_approved: number;
  /**
   * Het ritme van dit doel — besluit A53, migratie 0140, in de view sinds 0146.
   *
   * ⚠️ **Een voorkeur en geen oordeel.** Hij stuurt de beginstand van het
   *    weekdoelformulier; wat een week wáárd is, staat in
   *    `weekly_goals.ceiling_days` op de rij zelf. Zou het oordeel het doel
   *    lezen, dan verandert de uitslag van een afgelopen week zodra iemand zijn
   *    ritme omzet.
   *
   * ⚠️ Versmald met `leesRitme()` en niet met een cast: de view geeft `string`
   *    terug, en onbekend hoort `weekly` te zijn — de stand van vóór A53.
   */
  readonly ritme: Ritme;
}

/**
 * De drie kolommen die alleen de eigenaar mag lezen, per doel-id.
 *
 * ⚠️⚠️ **Ze staan sinds migratie 0236 niet meer op `goals` voor `authenticated`**,
 *    en dat is geen opruiming maar een gerepareerd lek (QS8-392 en QS8-393).
 *    `goals_select` geeft een groepsgenoot de héle rij, dus `identity_statement`
 *    — *"Wie word je als dit lukt?"* — was voor hem leesbaar terwijl er boven dat
 *    invoerveld staat dat zijn groep het nooit ziet. En `max_points` telt de
 *    weken mee die `weekly_goals_select` juist verbergt, dus het verschil met de
 *    zichtbare weekdoelen ís het aantal gemiste weken.
 *
 * ⚠️ **RLS kan geen kolommen beperken**, dus dit is een kolomgrant plus een
 *    eigenaar-only view (`mijn_doelvelden`) en geen policy. Een lege uitkomst
 *    betekent hier "niet van jou" en is dus de goede stand, geen fout.
 */
type Doelvelden = Pick<
  DoelMetVoortgang,
  'identity_statement' | 'available_hours_per_week' | 'max_points'
>;

const GEEN_VELDEN: Doelvelden = {
  identity_statement: null,
  available_hours_per_week: null,
  max_points: 0,
};

async function mijnDoelvelden(ids: readonly string[]): Promise<Map<string, Doelvelden>> {
  const kaart = new Map<string, Doelvelden>();
  if (ids.length === 0) return kaart;

  const { data, error } = await supabase()
    .from('mijn_doelvelden')
    .select('id, identity_statement, available_hours_per_week, max_points')
    .in('id', ids);

  // ⚠️ Een fout hier is geen reden om het doel niet te tonen: de titel, de datum
  //    en de voortgang komen uit een ándere query en die is geslaagd. De velden
  //    vallen terug op leeg, wat exact de stand is die een groepsgenoot ziet.
  if (error) {
    reportError(error, 'goals.velden');
    return kaart;
  }

  for (const rij of data ?? []) {
    if (rij.id === null) continue;
    kaart.set(rij.id, {
      identity_statement: rij.identity_statement,
      available_hours_per_week: rij.available_hours_per_week,
      max_points: rij.max_points ?? 0,
    });
  }
  return kaart;
}

/**
 * Zet viewrijen om en haalt de eigenaar-velden er in één extra ronde bij.
 *
 * ⚠️ Eén query voor de hele pagina en niet één per doel — onwrikbare regel 12.
 */
async function naarDoelen(
  rijen: readonly Tables<'goal_dashboard'>[],
): Promise<DoelMetVoortgang[]> {
  const ids = rijen.map((r) => r.id).filter((id): id is string => id !== null);
  const velden = await mijnDoelvelden(ids);

  return rijen
    .map((rij) => naarDoel(rij, velden.get(rij.id ?? '') ?? GEEN_VELDEN))
    .filter((d): d is DoelMetVoortgang => d !== null);
}

/** Zet een viewrij om, of geeft `null` als de rij niet compleet is. */
function naarDoel(rij: Tables<'goal_dashboard'>, velden: Doelvelden): DoelMetVoortgang | null {
  if (rij.id === null || rij.owner_id === null || rij.title === null || rij.target_date === null) {
    reportError(new Error('Onvolledige rij uit goal_dashboard'), 'goals.parse', {
      goal_id: rij.id ?? 'geen',
    });
    return null;
  }

  return {
    id: rij.id,
    owner_id: rij.owner_id,
    title: rij.title,
    description: rij.description,
    category: rij.category ?? 'other',
    ritme: leesRitme(rij.ritme),
    identity_statement: velden.identity_statement,
    target_date: rij.target_date,
    status: rij.status ?? 'active',
    available_hours_per_week: velden.available_hours_per_week,
    max_points: velden.max_points,
    milestones_total: rij.milestones_total ?? 0,
    milestones_done: rij.milestones_done ?? 0,
    weekly_total: rij.weekly_total ?? 0,
    weekly_approved: rij.weekly_approved ?? 0,
  };
}


export const PER_PAGINA = 20;


/**
 * De actieve doelen van één gebruiker, met voortgang.
 *
 * ⚠️ Leest uit `goal_dashboard` en niet uit `goals`, zodat de tellingen in
 *    dezelfde query meekomen. Eén ronde, ongeacht hoeveel doelen er zijn.
 */
export async function fetchDoelen(
  userId: string,
  opties: { readonly pagina?: number; readonly status?: 'active' | 'archived' } = {},
): Promise<Pagina<DoelMetVoortgang>> {
  const pagina = opties.pagina ?? 0;
  const van = pagina * PER_PAGINA;

  const { data, error, count } = await supabase()
    .from('goal_dashboard')
    .select('*', { count: 'exact' })
    .eq('owner_id', userId)
    .eq('status', opties.status ?? 'active')
    .order('target_date', { ascending: true })
    .range(van, van + PER_PAGINA - 1);

  if (error) {
    reportError(error, 'goals.list', { user_id: userId });
    throw new Error(t('doel.doelen_laden'));
  }

  const rijen = await naarDoelen(data ?? []);
  const totaal = count ?? rijen.length;

  return { rijen, totaal, meer: van + rijen.length < totaal };
}

/**
 * De doelen die jij aan déze groep kunt koppelen — QS8-342.
 *
 * ⚠️ **Waarom dit bestaat en een aftrekking in het scherm niet volstond.** Het
 *    koppelscherm deed `fetchDoelen(userId)` en streepte daar de al gekoppelde
 *    doelen vanaf. `fetchDoelen()` geeft **pagina 0** — twintig doelen op
 *    `target_date` — dus met eenentwintig doelen waarvan de eerste twintig al
 *    gekoppeld waren, bleef er niets over en zei het scherm *"Je hebt nog geen
 *    doel om te delen"*, met een knop "Nieuw doel" eronder. Doodlopend: eruit kwam
 *    je alleen door doelen te archiveren of streefdata te verzetten.
 *
 *    Dat is woordelijk QS8-226, één scherm verderop. De reparatie stond hier al
 *    uitgeschreven in `fetchDoelnamen()` hieronder, en ze hing aan de plek en niet
 *    aan de belofte — onwrikbare regel 18, vraag 4.
 *
 * ⚠️ **Serverzijdig uitsluiten en niet bladeren-met-aftrekken.** Wie de pagina's
 *    afloopt en onderweg aftrekt, kan nog steeds een lege pagina teruggeven
 *    terwijl er verderop wél een koppelbaar doel staat — dan liegt de lege staat
 *    opnieuw, alleen zeldzamer. Met `not.in` klopt `count`, en dus ook `meer`, en
 *    is "leeg" per constructie hetzelfde als "er is er geen".
 *
 * ⚠️ **Dit hoort hier en niet in `modules/buddies`, waar `koppelbareGroepen()`
 *    de omgekeerde richting doet.** Die functie is een pure aftrekking op data
 *    die het scherm toch al had; deze stelt een vraag over `goal_dashboard` en
 *    leunt op `naarDoel()` en `PER_PAGINA`. Daar een kopie van maken in een
 *    andere module is precies de duplicatie die uit elkaar gaat lopen.
 *
 * ⚠️ **Dit is gebruiksgemak en geen grens**, net als `koppelbareGroepen()`. De
 *    controle is `goal_group_links_insert`: lid van de groep én eigenaar van het
 *    doel. Gebruik deze functie nooit om een recht te bepalen.
 */
export async function fetchKoppelbareDoelen(
  groupId: string,
  opties: { readonly pagina?: number } = {},
): Promise<Pagina<DoelMetVoortgang>> {
  const pagina = opties.pagina ?? 0;
  const van = pagina * PER_PAGINA;

  const { data, error, count } = await supabase()
    .rpc('koppelbare_doelen', { p_group_id: groupId }, { count: 'exact' })
    .range(van, van + PER_PAGINA - 1);

  if (error) {
    reportError(error, 'goals.koppelbaar', { group_id: groupId });
    throw new Error(t('doel.doelen_laden'));
  }

  const rijen = await naarDoelen(data ?? []);
  const totaal = count ?? rijen.length;

  return { rijen, totaal, meer: van + rijen.length < totaal };
}


/** De titel en het gebied van één doel, voor een lijst die er naar verwijst. */
export interface Doelnaam {
  readonly title: string;
  readonly category: string;
}

/**
 * De titels en gebieden van precies deze doelen — QS8-226.
 *
 * ⚠️ **Waarom dit bestaat en `fetchDoelen()` hier niet voldoet.** Het hoofdscherm
 *    bouwde zijn titelkaart uit `fetchDoelen(userId)`, en die geeft **pagina 0**:
 *    de eerste twintig. `StandBlok` filtert vervolgens elke stand weg waarvan hij
 *    de titel niet kent — met als reden "dat is een gearchiveerd of verwijderd
 *    doel". Bij eenentwintig actieve doelen klopte die reden niet meer, en dan
 *    verdween een levend doel stilzwijgend van het dashboard. Geen fout, geen
 *    melding, gewoon weg.
 *
 *    Onwrikbare regel 18 vraag 6: een aanname die van "ze passen op één pagina"
 *    naar "er kunnen er meer zijn" gaat. De reparatie is niet een tweede pagina
 *    ophalen maar de vraag omdraaien — vraag naar de doelen die je toont, in
 *    plaats van te hopen dat ze in de eerste pagina zaten.
 *
 * ⚠️ **Begrensd, en dat is geen detail** (regel 10). De lijst komt uit wat er op
 *    het scherm staat; `PER_PAGINA` ligt er als plafond overheen zodat een
 *    onverwacht lange lijst hier geen ongepagineerde query wordt.
 */
export async function fetchDoelnamen(
  ids: readonly string[],
): Promise<ReadonlyMap<string, Doelnaam>> {
  const uniek = [...new Set(ids)].slice(0, PER_PAGINA);
  if (uniek.length === 0) return new Map();

  const { data, error } = await supabase()
    .from('goals')
    .select('id, title, category')
    .in('id', uniek);

  if (error) {
    reportError(error, 'goals.namen', { aantal: uniek.length });
    return new Map();
  }

  const kaart = new Map<string, Doelnaam>();
  for (const rij of data ?? []) {
    if (rij.title === null) continue;
    kaart.set(rij.id, { title: rij.title, category: rij.category ?? 'other' });
  }

  return kaart;
}

export async function fetchDoel(goalId: string): Promise<DoelMetVoortgang | null> {
  const { data, error } = await supabase()
    .from('goal_dashboard')
    .select('*')
    .eq('id', goalId)
    .maybeSingle();

  if (error) {
    reportError(error, 'goals.get', { goal_id: goalId });
    throw new Error(t('doel.doel_laden'));
  }

  if (data === null) return null;

  // ⚠️ Dít is het pad waar het lek zat: `fetchDoel()` filtert niet op eigenaar,
  //    want een groepsgenoot mág een gekoppeld doel openen. Voor hem geeft
  //    `mijn_doelvelden` nul rijen en valt het doel terug op `GEEN_VELDEN` —
  //    precies wat `coach.alleen_voor_jou` belooft.
  const velden = await mijnDoelvelden([goalId]);
  return naarDoel(data, velden.get(goalId) ?? GEEN_VELDEN);
}

/**
 * Maakt een hoofddoel aan.
 *
 * `vandaag` komt van de aanroeper omdat alleen `shared/time` mag bepalen welke
 * dag het is in de tijdzone van de gebruiker (CLAUDE.md, correctheidsregel 7).
 */
export async function maakDoel(
  userId: string,
  invoer: DoelInvoer,
  vandaag: IsoDate,
): Promise<Resultaat<DoelKern>> {
  const gevalideerd = doelSchema.safeParse(invoer);
  if (!gevalideerd.success) {
    return { ok: false, melding: invoerfout(gevalideerd.error, t('doel.invoer')) };
  }

  if (!datumLigtInDeToekomst(gevalideerd.data.target_date, vandaag)) {
    return { ok: false, melding: t('doel.datum_verleden') };
  }

  // ⚠️⚠️ **Een expliciete kolomlijst en geen `select('*')`, en dat is een
  //    gerepareerd defect.** Sinds migratie 0236 heeft `authenticated` geen
  //    tabelbrede SELECT meer op `goals` maar een kolomgrant, en `*` eist recht
  //    op élke kolom — dus dit verzoek gaf een kale `42501` voor de eigenaar van
  //    zijn eigen, net aangemaakte doel. ⚠️ TypeScript ziet dat niet: de
  //    gegenereerde typing spiegelt de kólommen van de tabel en niet de grants.
  //    Dezelfde klasse als QS8-387 bij `fetchMijnGroepen()`.
  const { data, error } = await supabase()
    .from('goals')
    .insert({ ...gevalideerd.data, owner_id: userId })
    .select('id, owner_id, title, description, category, target_date, status, created_at, updated_at, ritme')
    .single();

  if (error) {
    reportError(error, 'goals.create', { user_id: userId });
    return { ok: false, melding: t('doel.opslaan_mislukt') };
  }

  // Het eerste event in de geschiedenis van dit doel.
  await logGoalEvent(data.id, userId, 'created', null, { title: data.title });

  return { ok: true, waarde: data };
}

/**
 * Wijzigt een doel — alles behalve de streefdatum.
 *
 * ⚠️ `target_date` staat hier bewust niet meer bij en wordt stilzwijgend
 *    genegeerd als hij toch in de patch zit. Sinds migratie 0032 heeft
 *    `authenticated` geen UPDATE-recht meer op die kolom: verschuiven loopt via
 *    `zetStreefdatum()` (doel zonder groep) of via een verzoek aan de groep
 *    (`modules/goals/deadline.ts`). Dat is het besluit van Q-TODO A7.
 *
 *    Zou dit veld hier blijven staan, dan kreeg de gebruiker een kale
 *    rechtenfout van Postgres te zien op een scherm dat er niets aan kan doen.
 */
export async function wijzigDoel(
  doelId: string,
  patch: DoelPatch,
): Promise<Resultaat<DoelKern>> {
  const gevalideerd = doelPatchSchema.safeParse(patch);
  if (!gevalideerd.success) {
    return { ok: false, melding: invoerfout(gevalideerd.error, t('doel.invoer')) };
  }

  const velden = gevalideerd.data;

  const update: TablesUpdate<'goals'> = {};
  if (velden.title !== undefined) update.title = velden.title;
  if (velden.description !== undefined) update.description = velden.description;
  if (velden.category !== undefined) update.category = velden.category;
  if (velden.identity_statement !== undefined) {
    update.identity_statement = velden.identity_statement;
  }
  if (velden.available_hours_per_week !== undefined) {
    update.available_hours_per_week = velden.available_hours_per_week;
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, melding: t('doel.niets_gewijzigd') };
  }

  // ⚠️ Zelfde reden als bij `maakDoel()`: sinds 0236 is `*` op `goals` een
  //    permissiefout voor de eigenaar zelf.
  const { data, error } = await supabase()
    .from('goals')
    .update(update)
    .eq('id', doelId)
    .select('id, owner_id, title, description, category, target_date, status, created_at, updated_at, ritme')
    .single();

  if (error) {
    reportError(error, 'goals.update', { goal_id: doelId });
    return { ok: false, melding: t('doel.wijzigen_mislukt') };
  }

  return { ok: true, waarde: data };
}

/**
 * Zet de streefdatum van een doel dat aan géén enkele groep hangt — Q-TODO A7.
 *
 * ⚠️ Loopt via een RPC en niet via een UPDATE, want de kolom is sinds 0032 niet
 *    meer client-schrijfbaar. De RPC weigert zodra het doel wél aan een groep
 *    gekoppeld is; dan is een verzoek de enige route en dat is precies de
 *    bedoeling van het besluit.
 *
 * ⚠️ De `deadline_moved`-regel in `goal_events` wordt door de RPC geschreven, in
 *    dezelfde transactie. Deed de client dat (zoals hiervoor), dan kon de datum
 *    verschuiven zonder dat het ergens vastlag — en dan is de geschiedenis die
 *    de Risico-radar straks leest een keuze van de client.
 */
export async function zetStreefdatum(
  doelId: string,
  datum: string,
  vandaag: IsoDate,
): Promise<Resultaat<true>> {
  if (!datumLigtInDeToekomst(datum, vandaag)) {
    return { ok: false, melding: t('doel.datum_verleden') };
  }

  const { data, error } = await supabase().rpc('zet_streefdatum', {
    p_goal_id: doelId,
    p_date: datum,
  });

  if (error) {
    reportError(error, 'goals.target_date', { goal_id: doelId });
    return { ok: false, melding: t('doel.streefdatum_mislukt') };
  }

  const uitkomst = (data ?? {}) as { ok?: boolean; reason?: string };

  if (uitkomst.ok !== true) {
    return { ok: false, melding: streefdatumMelding(uitkomst.reason) };
  }

  return { ok: true, waarde: true };
}

/**
 * Zie `meldingen()` in `buddies/api.ts`: een functie, om dezelfde reden.
 *
 * ⚠️ De tabel zelf staat in `deadline-redenen.ts`, samen met die van de drie
 *    andere streefdatum-RPC's — daar kan de grendel erbij die ze naast de
 *    gedeployde functies legt (QS8-311), en dat kan hier niet: dit bestand trekt
 *    via `lib/supabase` React Native mee.
 */
function streefdatumMelding(reden: string | undefined): string {
  return streefdatumRedenen()[reden ?? ''] ?? t('doel.actie_mislukt_kort');
}

/**
 * Archiveert een doel, of haalt het terug.
 *
 * ⚠️ Archiveren is omkeerbaar en verwijderen niet — dat verschil moet in de UI
 *    zichtbaar zijn (QS8-32). Een gearchiveerd doel verdwijnt uit
 *    groepsoverzichten maar houdt zijn hele geschiedenis: voltooiingen,
 *    goedkeuringen en punten blijven staan (domeinregel 6).
 */
export async function zetArchief(
  goalId: string,
  actorId: string,
  gearchiveerd: boolean,
): Promise<Resultaat<true>> {
  // ⚠️ Via een RPC en niet via een UPDATE. `authenticated` heeft sinds migratie
  //    0035 geen schrijfrecht meer op `goals.status`: van de vier toegestane
  //    waarden deden er twee iets dat de client niet mag doen. `completed` liet
  //    `meld_doel_af()` afgaan en plaatste "X heeft een doel afgerond" in elke
  //    gekoppelde groep zonder dat er iets afgerond was, en `missed` is via
  //    `goals_select` leesbaar voor groepsgenoten — precies het patroon dat
  //    `weekly_goals.status` in EPIC 5 tot de zwaarste bevinding maakte.
  const { data, error } = await supabase().rpc('zet_doelstatus', {
    p_goal_id: goalId,
    p_gearchiveerd: gearchiveerd,
  });

  if (error) {
    reportError(error, 'goals.archive', { goal_id: goalId });
    return { ok: false, melding: t('doel.actie_mislukt') };
  }

  const uitkomst = (data ?? {}) as { ok?: boolean; reason?: string };

  if (uitkomst.ok !== true) {
    return {
      ok: false,
      melding:
        uitkomst.reason === 'not_owner' ? t('doel.niet_van_jou') : t('doel.actie_mislukt_kort'),
    };
  }

  if (gearchiveerd) await logGoalEvent(goalId, actorId, 'archived', null, null);

  // ⚠️ Geeft geen doelrij terug. De RPC levert er geen, en het scherm herlaadt
  //    toch: een tweede ronde naar de database om iets terug te geven dat
  //    niemand gebruikt, is verkeer voor niets op een gratis tier.
  return { ok: true, waarde: true };
}

/**
 * Rondt een doel af — QS8-83, migratie 0057.
 *
 * ⚠️ **Dit was het ontbrekende moment.** `goals.status` kende `completed` sinds
 *    0001 en `meld_doel_af()` stond klaar om er een systeembericht op te
 *    plaatsen, maar niets in de codebase zette een doel ooit op die status:
 *    `zet_doelstatus()` kan alleen archiveren en `authenticated` heeft sinds 0035
 *    geen schrijfrecht meer op de kolom. Er was dus ook geen moment waarop een
 *    beloning kón vrijkomen. Zelfde patroon als QS8-112.
 *
 * ⚠️ **Onomkeerbaar, en het scherm moet dat zeggen vóórdat je klikt.** Afronden
 *    plaatst "X heeft een doel afgerond" in elke gekoppelde groep, en een
 *    chatbericht is een onveranderlijke kopie — terugzetten haalt hem niet weg.
 *    Daarnaast wikkelt het je commitments af: de beloning komt vrij, de straf
 *    vervalt.
 *
 * ⚠️ **Er mag geen mijlpaal meer openstaan.** Afronden is de enige handeling die
 *    je eigen straf laat vervallen, dus zonder die eis is elk commitment device
 *    te ontlopen met één druk op de knop. Een mijlpaal laten vallen kan wel, maar
 *    dat is een aparte, zichtbare handeling. Besluit van Quinten, 21-08-2026.
 */
export async function rondDoelAf(goalId: string, actorId: string): Promise<Resultaat<Afronding>> {
  const { data, error } = await supabase().rpc('rond_doel_af', { p_goal_id: goalId });

  if (error) {
    reportError(error, 'goals.complete', { goal_id: goalId });
    return { ok: false, melding: t('doel.afronden_mislukt') };
  }

  const uitkomst = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    aantal?: number;
    commitments?: Afronding;
  };

  if (uitkomst.ok !== true) {
    return { ok: false, melding: afrondMelding(uitkomst.reason, uitkomst.aantal) };
  }

  await logGoalEvent(goalId, actorId, 'completed', null, null);

  return {
    ok: true,
    waarde: uitkomst.commitments ?? { vrijgespeeld: 0, verlopen: 0, vervallen: 0 },
  };
}

/** Wat het afronden met je commitments deed. Alle drie kunnen nul zijn. */
export interface Afronding {
  /** Beloningen die zijn vrijgekomen, en dus in je groepen gemeld zijn. */
  readonly vrijgespeeld: number;
  /** Beloningen die vervielen omdat de streefdatum al gepasseerd was. */
  readonly verlopen: number;
  /** Straffen die vervielen omdat het doel af is. */
  readonly vervallen: number;
}

function afrondMelding(reden: string | undefined, aantal: number | undefined): string {
  if (reden === 'open_milestones') {
    const n = aantal ?? 0;
    return n === 1
      ? t('doel.een_mijlpaal_open')
      : t('doel.meer_mijlpalen_open', { aantal: n });
  }

  return (
    {
      not_owner: t('doel.niet_van_jou'),
      already_completed: t('doel.al_afgerond'),
      not_active: t('doel.gearchiveerd'),
      not_signed_in: t('doel.niet_ingelogd'),
    }[reden ?? ''] ?? t('doel.actie_mislukt_kort')
  );
}

/**
 * Schrijft een regel in de audittrail van een doel.
 *
 * Gooit bewust niet: een mislukte logregel mag de handeling zelf niet
 * terugdraaien. Hij wordt wel gemeld, want een gat in de audittrail is iets dat
 * je wilt weten.
 */
async function logGoalEvent(
  goalId: string,
  actorId: string,
  eventType: DoelgebeurtenisClient,
  oud: Json,
  nieuw: Json,
): Promise<void> {
  const { error } = await supabase().from('goal_events').insert({
    goal_id: goalId,
    actor_id: actorId,
    event_type: eventType,
    old_value: oud,
    new_value: nieuw,
  });

  if (error) reportError(error, 'goals.event', { goal_id: goalId, name: eventType });
}

/**
 * Verwijdert een doel dat je net per ongeluk hebt aangemaakt — migratie 0046.
 *
 * ⚠️ Strenger dan bij een weekdoel, en met opzet. Een doel verwijderen sleept
 *    alles mee wat eraan hangt: weekdoelen, mijlpalen, je reeks, je weekpassen,
 *    de koppeling met een groep. Daarom mag het alleen zolang het doel vers is
 *    (`bedenktijd()`, nu 24 uur) én er werkelijk niets aan hangt — geen
 *    weekdoelen, geen punten, niet gedeeld met een groep.
 *
 * ⚠️ Voor een doel mét geschiedenis is **archiveren** de weg (`zetArchief`). Dat
 *    is geen tweederangs alternatief maar het juiste gereedschap: een doel dat
 *    je een maand hebt bijgehouden en dan loslaat, is geschiedenis en geen
 *    vergissing (domeinregel 6).
 */
export async function verwijderDoel(goalId: string): Promise<Resultaat<true>> {
  const { data, error } = await supabase().rpc('verwijder_doel', { p_goal_id: goalId });

  if (error) {
    reportError(error, 'goals.delete', { goal_id: goalId });
    return { ok: false, melding: t('doel.verwijderen_mislukt') };
  }

  const uitkomst = (data ?? {}) as { ok?: boolean; reason?: string };
  if (uitkomst.ok !== true) {
    return { ok: false, melding: doelVerwijderMelding(uitkomst.reason) };
  }

  return { ok: true, waarde: true };
}

function doelVerwijderMelding(reden: string | undefined): string {
  switch (reden) {
    case 'te_oud':
      return t('doel.te_oud');
    case 'gedeeld_met_groep':
      return t('doel.gedeeld_met_groep');
    case 'heeft_weekdoelen':
      return t('doel.heeft_weekdoelen');
    case 'heeft_punten':
      return t('doel.heeft_punten');
    // Migratie 0058. Een beloning die is vrijgekomen of een straf die
    // verschuldigd is, heeft de groep al gezien; weggooien zou geschiedenis
    // wissen die niet meer alleen van jou is (domeinregel 6 en 11).
    case 'commitment_in_werking':
      return t('doel.commitment_in_werking');
    // Migratie 0190. Elke commitment telt, ook een ingetrokken: `confirmed_at`
    // is NOT NULL, dus elke rij is een vastgelegde afspraak met een auditregel.
    // Weggooien zou dat spoor meecascaderen (domeinregel 5 en 6).
    case 'heeft_commitment':
      return t('doel.heeft_commitment');
    default:
      return t('doel.verwijderen_mislukt');
  }
}
