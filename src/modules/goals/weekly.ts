import type { Tables } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { cyclesBetween, type Cycle, type UserClock } from '../../shared/time';

import { huidigeCyclus } from './cycles';

import { weekdoelSchema, type WeekdoelInvoer } from './weekly-schemas';

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

export type Resultaat<T> = { ok: true; waarde: T } | { ok: false; melding: string };

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
    throw new Error('Je weekdoelen konden niet geladen worden.');
  }

  return (data ?? []) as unknown as Weekdoel[];
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
    return { ok: false, melding: gevalideerd.error.issues[0]?.message ?? 'Controleer je invoer.' };
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
    return { ok: false, melding: 'Je weekdoel kon niet worden opgeslagen.' };
  }

  return { ok: true, waarde: data };
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
    return { ok: false, melding: 'Verwijderen lukte niet.' };
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
      return 'Dit weekdoel staat er te lang om nog te verwijderen. Je kunt hem wel afsluiten — dan telt de week als gemist.';
    case 'not_open':
      return 'Er is al iets met dit weekdoel gebeurd, dus verwijderen kan niet meer.';
    case 'heeft_voltooiing':
      return 'Je hebt hier al iets voor ingediend. Verwijderen kan dan niet meer.';
    default:
      return 'Verwijderen lukte niet.';
  }
}

export async function sluitWeekdoelAf(id: string): Promise<Resultaat<true>> {
  const { data, error } = await supabase().rpc('sluit_weekdoel_af', {
    p_weekly_goal_id: id,
  });

  if (error) {
    reportError(error, 'weekly.cancel', { code: error.code });
    return { ok: false, melding: 'Afsluiten lukte niet.' };
  }

  const uitkomst = (data ?? {}) as { ok?: boolean; reason?: string };
  if (uitkomst.ok !== true) {
    return {
      ok: false,
      melding:
        uitkomst.reason === 'not_open'
          ? 'Deze week staat niet meer open. Alleen een weekdoel waar nog niets mee gebeurd is, kun je afsluiten.'
          : 'Afsluiten lukte niet.',
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
  const { data, error: markeerFout } = await supabase().rpc('markeer_doorgeschoven', {
    p_weekly_goal_id: doel.id,
  });

  if (markeerFout) {
    reportError(markeerFout, 'weekly.carry', { pgcode: markeerFout.code });
    return { ok: false, melding: 'Doorschuiven lukte niet.' };
  }

  const uitkomst = (data ?? {}) as { ok?: boolean; reason?: string };
  if (uitkomst.ok !== true) {
    return {
      ok: false,
      melding:
        // ⚠️ `not_open` bestaat sinds 0045 niet meer als reden — de RPC geeft
        //    `not_missed` terug. De tak is weg in plaats van dood te blijven
        //    staan: dode foutafhandeling suggereert dat een geval nog kan
        //    optreden, en dan gaat de volgende lezer ernaar zoeken.
        uitkomst.reason === 'not_missed'
          ? 'Doorschuiven kan pas als de week is afgesloten. Dat gebeurt automatisch kort na het einde van je week.'
          : 'Doorschuiven lukte niet.',
    };
  }

  return await maakWeekdoel(
    klok,
    {
      goal_id: doel.goal_id,
      milestone_id: doel.milestone_id,
      title: doel.title,
      floor_text: doel.floor_text,
      ceiling_text: doel.ceiling_text,
    },
    eersteCyclusVanDoel,
  );
}
