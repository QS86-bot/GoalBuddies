import { t } from '../../shared/i18n';

import type { Tables } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { cyclesBetween, userCycleOn, type Cycle, type UserClock } from '../../shared/time';
import { invoerfout, type Resultaat } from '../../shared/api';

import { huidigeCyclus } from './cycles';

import { weekdoelSchema, type WeekdoelInvoer } from './weekly-schemas';

// ⚠️ Opnieuw geëxporteerd zodat de aanroepers via `modules/<naam>/index.ts`
//    ongemoeid blijven. De definitie staat sinds 25-08-2026 in `shared/api`;
//    hij stond hiervoor zeven keer woordelijk in deze codebase.
export type { Resultaat };

/**
 * Weekdoelen: het hart van het model.
 *
 * ⚠️ Geen enkele functie hier rekent zelf een week uit. Alles gaat via
 *    `shared/time`, en de klok van de gebruiker komt uit zijn profiel
 *    (CLAUDE.md, correctheidsregel 7). Een weekdoel met een handmatig getypte
 *    `cycle_start_date` is een bug die zich pas maanden later laat zien, als
 *    iemand met een andere week-startdag hem probeert af te ronden.
 */

export type Weekdoel = Tables<'weekly_goals'>;


/**
 * De weekdoelen van één cyclus, over alle doelen van de gebruiker heen.
 *
 * Eén query met een join op `goals`, want het scherm "Vandaag" toont ze door
 * elkaar en niet per doel gegroepeerd.
 */
export async function fetchWeekdoelen(
  userId: string,
  cyclus: Cycle,
): Promise<readonly Weekdoel[]> {
  const { data, error } = await supabase()
    .from('weekly_goals')
    .select('*, goals!inner(owner_id)')
    .eq('goals.owner_id', userId)
    .eq('cycle_start_date', cyclus.startDate)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    reportError(error, 'weekly.list', { user_id: userId, code: error.code });
    throw new Error(t('weekdoel.laden_mislukt'));
  }

  return (data ?? []) as unknown as Weekdoel[];
}

/**
 * Gemiste weken uit eerdere cycli die je nog kunt meenemen — QS8-47, QS8-106.
 *
 * ⚠️ Alleen `missed`, en dat is geen filter maar de hele voorwaarde. Sinds
 *    migratie 0045 accepteert `markeer_doorgeschoven()` uitsluitend een week die
 *    de rollover al als gemist heeft afgestempeld; alles daarvoor geeft
 *    `not_missed` terug. Zou dit ook `todo` of `cancelled` ophalen, dan bood het
 *    scherm een knop aan die de database gegarandeerd weigert.
 *
 * ⚠️ **Dit is privé en het hoort nergens op een groepsscherm.** Een lijst
 *    gemiste weken is precies wat `weekly_goals_select` in EPIC 5 lekte en wat
 *    migratie 0019 heeft dichtgezet. De filter op `owner_id` is hier de
 *    leesbaarheid voor de volgende lezer; de afdwinging zit in RLS.
 *
 * ⚠️ De huidige cyclus valt erbuiten. Doorschuiven naar de week waar je al in
 *    zit is zinloos, en `maakWeekdoel()` zou dan een tweede rij in dezelfde
 *    cyclus zetten — precies de dubbele-rij-situatie waar Q-TODO A37 nog over
 *    openstaat.
 */
export async function fetchDoorschuifbaar(
  userId: string,
  klok: UserClock,
): Promise<readonly Weekdoel[]> {
  const { data, error } = await supabase()
    .from('weekly_goals')
    .select('*, goals!inner(owner_id)')
    .eq('goals.owner_id', userId)
    .eq('status', 'missed')
    .lt('cycle_start_date', huidigeCyclus(klok).startDate)
    .order('cycle_start_date', { ascending: false })
    .limit(20);

  if (error) {
    reportError(error, 'weekly.carryable', { user_id: userId, code: error.code });
    throw new Error(t('weekdoel.open_laden'));
  }

  return (data ?? []) as unknown as Weekdoel[];
}

/**
 * Eén mijlpaal, voor zover een weekdoelformulier en het bewerkformulier hem nodig
 * hebben.
 *
 * ⚠️ **`description` staat er sinds 28-08 bij, en dat is een reparatie en geen
 *    uitbreiding.** `wijzigMijlpaal()` stuurt titel, omschrijving én streefdatum
 *    in één UPDATE, zoals `mijlpaalSchema` voorschrijft. Zonder dit veld had het
 *    bewerkscherm geen andere keus dan `description: null` mee te sturen, en dan
 *    wist elke titelcorrectie stilzwijgend de omschrijving. Het type dwingt de
 *    juiste waarde af in plaats van hem te laten raden.
 */
export type Mijlpaal = Pick<
  Tables<'milestones'>,
  'id' | 'title' | 'status' | 'order_index' | 'target_date' | 'description'
>;

/**
 * De mijlpalen van een doel, op volgorde — QS8-43, QS8-112.
 *
 * ⚠️ `dropped` valt af. Een laten vallen mijlpaal is geen keuze meer om een
 *    weekdoel onder te hangen, en hem tonen zou de lijst vullen met dingen die
 *    je juist hebt weggestreept.
 *
 * ⚠️ Sorteert op `order_index` en niet op datum. De volgorde van mijlpalen is
 *    de volgorde die de gebruiker (of de Doelcoach) heeft gekozen; `target_date`
 *    mag leeg zijn en is dus geen betrouwbare sorteersleutel.
 */
export async function fetchMijlpalen(goalId: string): Promise<readonly Mijlpaal[]> {
  const { data, error } = await supabase()
    .from('milestones')
    .select('id, title, status, order_index, target_date, description')
    .eq('goal_id', goalId)
    .neq('status', 'dropped')
    .order('order_index', { ascending: true })
    .limit(50);

  if (error) {
    reportError(error, 'goals.milestones', { goal_id: goalId, code: error.code });
    throw new Error(t('weekdoel.mijlpalen_laden'));
  }

  return data ?? [];
}

/**
 * De cyclus waarin het eerste weekdoel van dit doel viel — QS8-106.
 *
 * ⚠️ `maakWeekdoel()` en `schuifDoor()` hebben dit nodig om `cycle_index` te
 *    bepalen: de hoeveelste week van dít doel is dit? Geef je `null` mee, dan
 *    wordt elke nieuwe week week 1, en dan telt de teller in het doeloverzicht
 *    niet meer mee met de werkelijkheid.
 *
 * ⚠️ Bewust een aparte query in plaats van rekenen met `cycle_index` van het
 *    weekdoel dat je al hebt. Dat zou kloppen zolang die kolom klopt, en dan
 *    vermenigvuldigt een fout in één rij zich stil door in alle volgende. De
 *    vroegste rij is de bron; dit is een enkele geïndexeerde lookup op een
 *    handeling die zelden voorkomt.
 *
 * Geeft `null` terug als dit doel nog geen enkel weekdoel heeft — dan is de week
 * die je nu maakt per definitie de eerste.
 */
export async function eersteCyclusVanDoel(
  goalId: string,
  klok: UserClock,
): Promise<Cycle | null> {
  const { data, error } = await supabase()
    .from('weekly_goals')
    .select('cycle_start_date')
    .eq('goal_id', goalId)
    .order('cycle_start_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    reportError(error, 'weekly.firstCycle', { goal_id: goalId, code: error.code });
    return null;
  }

  const start = data?.cycle_start_date;
  return start === undefined || start === null ? null : userCycleOn(klok, start);
}

/**
 * Voegt een weekdoel toe — QS8-43 en QS8-44.
 *
 * ⚠️ `cycle_start_date` en `cycle_index` worden hier berekend uit de klok van de
 *    gebruiker, niet door de aanroeper meegegeven. Dat is het hele punt van deze
 *    functie: er is precies één plek waar een weekdoel aan een cyclus wordt
 *    gekoppeld.
 */
export async function maakWeekdoel(
  klok: UserClock,
  invoer: WeekdoelInvoer,
  eersteCyclusVanDoel: Cycle | null,
): Promise<Resultaat<Weekdoel>> {
  const gevalideerd = weekdoelSchema.safeParse(invoer);
  if (!gevalideerd.success) {
    return { ok: false, melding: invoerfout(gevalideerd.error, t('doel.invoer')) };
  }

  const cyclus = huidigeCyclus(klok);
  const index = eersteCyclusVanDoel === null ? 1 : cyclesBetween(eersteCyclusVanDoel, cyclus) + 1;

  const { data, error } = await supabase()
    .from('weekly_goals')
    .insert({
      goal_id: gevalideerd.data.goal_id,
      milestone_id: gevalideerd.data.milestone_id,
      title: gevalideerd.data.title,
      floor_text: gevalideerd.data.floor_text,
      ceiling_text: gevalideerd.data.ceiling_text,
      cycle_start_date: cyclus.startDate,
      cycle_index: index,
    })
    .select('*')
    .single();

  if (error) {
    reportError(error, 'weekly.create', { goal_id: gevalideerd.data.goal_id, code: error.code });
    return { ok: false, melding: t('weekdoel.opslaan_mislukt') };
  }

  return { ok: true, waarde: data };
}

/**
 * Verwijdert een weekdoel dat je net per ongeluk hebt aangemaakt — migratie 0046.
 *
 * ⚠️ Dit is niet de tegenhanger van `sluitWeekdoelAf()` maar het uitzonderingspad
 *    ernaast. Afsluiten is een besluit over een week die je niet gaat halen, en
 *    dat kost een minpunt zodra de cyclus verstrijkt. Verwijderen is voor de
 *    dubbele invoer en het weekdoel onder het verkeerde doel: het mag alleen
 *    zolang de rij vers is (`bedenktijd()`, nu 24 uur), nog op `todo` staat en er
 *    geen voltooiing aan hangt.
 *
 * ⚠️ De reden komt terug zodat het scherm hem kan tonen. Een verwijdering die
 *    stil niets doet is hier het verkeerde faalgedrag — de gebruiker verwacht
 *    het resultaat te zien.
 */
export async function verwijderWeekdoel(id: string): Promise<Resultaat<true>> {
  const { data, error } = await supabase().rpc('verwijder_weekdoel', {
    p_weekly_goal_id: id,
  });

  if (error) {
    reportError(error, 'weekly.delete', { code: error.code });
    return { ok: false, melding: t('weekdoel.verwijderen_mislukt') };
  }

  const uitkomst = (data ?? {}) as { ok?: boolean; reason?: string };
  if (uitkomst.ok !== true) {
    return { ok: false, melding: verwijderMelding(uitkomst.reason) };
  }

  return { ok: true, waarde: true };
}

function verwijderMelding(reden: string | undefined): string {
  switch (reden) {
    case 'te_oud':
      return t('weekdoel.te_oud');
    case 'not_open':
      return t('weekdoel.al_gebeurd');
    case 'heeft_voltooiing':
      return t('weekdoel.al_ingediend');
    default:
      return t('weekdoel.verwijderen_mislukt');
  }
}

/**
 * Sluit een weekdoel af — A40, migratie 0045.
 *
 * ⚠️ Heette `verwijderWeekdoel()` en gooide de rij ook echt weg. Dat was een
 *    gat: de rollover stempelt een week pas ná afloop als gemist, dus wie zijn
 *    weekdoel wiste vóórdat de cyclus sloot, had die week nooit gemist — geen
 *    minpunt, geen onderbreking, en een reeks die stalde in plaats van brak.
 *
 * ⚠️ De rij blijft nu staan met status `cancelled`, en de rollover veegt hem bij
 *    het verstrijken van de cyclus mee naar `missed`. Afsluiten kost dus wat het
 *    hoort te kosten, en een weekpas kan het opvangen zoals elke gemiste week.
 *    Verwijderen kán niet meer: het recht is ingetrokken, dus een rechtstreekse
 *    DELETE geeft 42501.
 */
export async function sluitWeekdoelAf(id: string): Promise<Resultaat<true>> {
  const { data, error } = await supabase().rpc('sluit_weekdoel_af', {
    p_weekly_goal_id: id,
  });

  if (error) {
    reportError(error, 'weekly.cancel', { code: error.code });
    return { ok: false, melding: t('weekdoel.afsluiten_mislukt') };
  }

  const uitkomst = (data ?? {}) as { ok?: boolean; reason?: string };
  if (uitkomst.ok !== true) {
    return {
      ok: false,
      melding:
        uitkomst.reason === 'not_open'
          ? t('weekdoel.niet_meer_open')
          : t('weekdoel.afsluiten_mislukt'),
    };
  }

  return { ok: true, waarde: true };
}

/**
 * Schuift een onvoltooid weekdoel door naar de huidige cyclus — QS8-47.
 *
 * ⚠️ Het oude weekdoel blijft staan met status `carried`, en verdwijnt dus niet
 *    stilletjes. Dat is privé: een doorgeschoven weekdoel komt nooit in de
 *    groepsfeed (domeinregel 7).
 *
 * ⚠️ Via een RPC en niet via een update. Sinds migratie 0023 kan de client
 *    `weekly_goals.status` niet meer schrijven: die kolom was de achterdeur om
 *    jezelf goed te keuren zonder buddy, en daarmee de hele peer-goedkeuring te
 *    omzeilen. Doorschuiven is een van de twee statusovergangen die van de
 *    gebruiker mogen komen, en die loopt nu langs een functie die toetst dat de
 *    week ook echt van jou is en nog openstaat.
 */
export async function schuifDoor(
  doel: Weekdoel,
  klok: UserClock,
  eersteCyclusVanDoel: Cycle | null,
): Promise<Resultaat<Weekdoel>> {
  const cyclus = huidigeCyclus(klok);
  const index = eersteCyclusVanDoel === null ? 1 : cyclesBetween(eersteCyclusVanDoel, cyclus) + 1;

  const { data, error } = await supabase().rpc('schuif_weekdoel_door', {
    p_weekly_goal_id: doel.id,
    p_cycle_start_date: cyclus.startDate,
    p_cycle_index: index,
  });

  if (error) {
    reportError(error, 'weekly.carry', { pgcode: error.code });
    return { ok: false, melding: t('weekdoel.doorschuiven_mislukt') };
  }

  const uitkomst = (data ?? {}) as { ok?: boolean; reason?: string; weekdoel?: Weekdoel };
  if (uitkomst.ok !== true) {
    return { ok: false, melding: doorschuifMelding(uitkomst.reason) };
  }

  // ⚠️ De RPC geeft de nieuwe rij terug, dus er is geen tweede rondgang meer.
  //    Ontbreekt hij toch, dan is dat een fout van de functie en geen geval dat
  //    de gebruiker moet oplossen — een lege `waarde` teruggeven zou het scherm
  //    laten denken dat er niets gebeurd is terwijl de week wél doorgeschoven is.
  if (!uitkomst.weekdoel) {
    reportError(new Error('schuif_weekdoel_door gaf ok zonder weekdoel'), 'weekly.carry');
    return { ok: false, melding: t('weekdoel.doorschuiven_mislukt') };
  }

  return { ok: true, waarde: uitkomst.weekdoel };
}

function doorschuifMelding(reden: string | undefined): string {
  switch (reden) {
    // ⚠️ `not_open` bestaat sinds 0045 niet meer als reden — de RPC geeft
    //    `not_missed` terug. De tak is weg in plaats van dood te blijven staan:
    //    dode foutafhandeling suggereert dat een geval nog kan optreden, en dan
    //    gaat de volgende lezer ernaar zoeken.
    case 'not_missed':
      return t('weekdoel.nog_niet_afgesloten');
    case 'te_veel_deze_dag':
      return t('weekdoel.te_veel_deze_dag');
    default:
      return t('weekdoel.doorschuiven_mislukt');
  }
}
