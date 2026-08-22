import { z } from 'zod';

import { t } from '../../shared/i18n';

import type { Tables } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import type { IsoDate } from '../../shared/time';

import { datumLigtInDeToekomst, isoDatum } from './schemas';

/**
 * De streefdatum verschuiven met akkoord van de groep — Q-TODO A7.
 *
 * Besluit van Quinten: *"Ja dat moet de groep zien. Je moet een goed argument
 * indienen om de deadline te mogen verschuiven. Wanneer de groep akkoord is, dan
 * kost het je geen punten."*
 *
 * ⚠️ Dit is een uitzondering op domeinregel 7, en hij past in het patroon dat de
 *    regel zelf beschrijft: tegenslag bereikt de groep uitsluitend via de
 *    gebruiker zélf. Jij vraagt het, jij schrijft het argument, jij verzendt het.
 *    Wat de groep ziet is jouw mededeling en niet een afgeleide van je falen.
 *
 * ⚠️ Er is geen puntenstraf gebouwd. Van de drie lezingen van het besluit is de
 *    variant gekozen die het puntenmodel niet aanraakt: verschuiven kán
 *    uitsluitend mét akkoord, dus een straf voor verschuiven zonder akkoord is
 *    overbodig. CLAUDE.md domeinregel 10 legt de punten vast en zegt dat
 *    wijzigen daarvan een vraag is; die vraag staat open in `docs/Q-TODO.docx`.
 *
 * ⚠️ Niets in dit bestand is de beveiliging. De RPC's toetsen eigenaarschap,
 *    lidmaatschap, de koppeling van het doel aan de groep, en dat de beslisser
 *    niet de aanvrager is. Dit bestand is de knop.
 */

export type Resultaat<T> = { ok: true; waarde: T } | { ok: false; melding: string };

export type DeadlineVerzoekRij = Tables<'deadline_requests'>;

export interface DeadlineVerzoek {
  readonly id: string;
  readonly goal_id: string;
  readonly group_id: string;
  readonly requester_id: string;
  readonly old_date: string;
  readonly new_date: string;
  readonly reason: string;
  readonly status: string;
  readonly decided_by: string | null;
  readonly decision_note: string | null;
  readonly created_at: string;
}

/** Ondergrens uit de CHECK `deadline_requests_reason_len`. */
export const ARGUMENT_MIN = 20;
export const ARGUMENT_MAX = 1000;

/**
 * ⚠️ Dezelfde grenzen als de database, en dat is geen dubbel werk: zonder dit
 *    schema krijgt iemand die drie woorden typt een CHECK-fout uit Postgres te
 *    zien in plaats van een zin die uitlegt wat er wordt gevraagd.
 */
export const deadlineVerzoekSchema = z.object({
  // ⚠️ Hetzelfde schema als het doelformulier. Stond hier eerst `z.string().min(1)`,
  //    en dat is niet zichtbaar fout: `datumLigtInDeToekomst` vergelijkt strings,
  //    dus "morgen" gold als een geldige toekomstige datum. Postgres viel er
  //    daarna over en de gebruiker kreeg een storingsmelding voor een tikfout —
  //    nadat hij zijn argument al had getypt.
  new_date: isoDatum,
  reason: z
    .string()
    .trim()
    .min(ARGUMENT_MIN, {
      error: () => t('deadline.argument_kort'),
    })
    .max(ARGUMENT_MAX, { error: () => t('deadline.argument_lang') }),
});

export type DeadlineVerzoekInvoer = z.infer<typeof deadlineVerzoekSchema>;

/**
 * De redenen van `vraag_deadline_verschuiving()`, in gewone taal.
 *
 * ⚠️ **Functies en geen constanten** — QS8-115. Een `const` met `t()` erin wordt
 *    één keer bij het importeren opgebouwd, en dat is vóórdat het profiel geladen
 *    is; de taal staat dan vast op de apparaattaal. Dit waren de laatste twee van
 *    de zes meldingentabellen in dit project.
 */
function vraagMelding(reden: string | undefined): string {
  const tabel: Readonly<Record<string, string>> = {
    not_owner: t('doel.niet_van_jou'),
    not_member: t('deadline.geen_lid'),
    not_linked: t('deadline.niet_gekoppeld'),
    same_date: t('deadline.zelfde_datum'),
    reason_too_short: t('deadline.argument_leeg'),
    reason_too_long: t('deadline.argument_lang'),
    already_open: t('deadline.al_open'),
  };

  return tabel[reden ?? ''] ?? t('deadline.versturen_mislukt_kort');
}

/** Zie `vraagMelding()`. */
function beslisMelding(reden: string | undefined): string {
  const tabel: Readonly<Record<string, string>> = {
    not_found: t('deadline.bestaat_niet'),
    already_decided: t('deadline.al_beslist'),
    own_request: t('deadline.niet_zelf'),
    not_member: t('deadline.geen_lid'),
    note_too_long: t('deadline.argument_lang'),
  };

  return tabel[reden ?? ''] ?? t('deadline.beslissen_mislukt_kort');
}

/**
 * Dient een verzoek in — Q-TODO A7.
 *
 * ⚠️ De datum wordt hier óók op "ligt in de toekomst" getoetst, met `vandaag`
 *    uit `shared/time`. De database doet dat niet: die kent de tijdzone van de
 *    gebruiker niet en mag er volgens correctheidsregel 7 ook niet mee rekenen.
 */
export async function vraagDeadlineVerschuiving(
  goalId: string,
  groupId: string,
  invoer: DeadlineVerzoekInvoer,
  vandaag: IsoDate,
): Promise<Resultaat<string>> {
  const gevalideerd = deadlineVerzoekSchema.safeParse(invoer);
  if (!gevalideerd.success) {
    return { ok: false, melding: gevalideerd.error.issues[0]?.message ?? t('doel.invoer') };
  }

  if (!datumLigtInDeToekomst(gevalideerd.data.new_date, vandaag)) {
    return { ok: false, melding: t('doel.datum_verleden') };
  }

  const { data, error } = await supabase().rpc('vraag_deadline_verschuiving', {
    p_goal_id: goalId,
    p_group_id: groupId,
    p_new_date: gevalideerd.data.new_date,
    p_reason: gevalideerd.data.reason,
  });

  if (error) {
    reportError(error, 'deadline.request', { goal_id: goalId, code: error.code });
    return { ok: false, melding: t('deadline.versturen_mislukt') };
  }

  const uitkomst = (data ?? {}) as { ok?: boolean; reason?: string; request_id?: string };

  if (uitkomst.ok !== true || typeof uitkomst.request_id !== 'string') {
    return {
      ok: false,
      melding: vraagMelding(uitkomst.reason),
    };
  }

  return { ok: true, waarde: uitkomst.request_id };
}

/**
 * Beslist over een verzoek van een ander — Q-TODO A7.
 *
 * ⚠️ Bij akkoord verschuift de datum in dezelfde transactie als de beslissing.
 *    Zou de app die twee stappen los zetten, dan bestaat er een toestand waarin
 *    het verzoek goedgekeurd is en de datum niet verschoven — en dan klopt de
 *    geschiedenis niet meer met het doel.
 */
export async function beslisDeadlineVerzoek(
  verzoekId: string,
  akkoord: boolean,
  opmerking: string | null,
): Promise<Resultaat<boolean>> {
  const schoon = opmerking?.trim() ?? '';

  const { data, error } = await supabase().rpc('beslis_deadline_verzoek', {
    p_request_id: verzoekId,
    p_akkoord: akkoord,
    ...(schoon === '' ? {} : { p_note: schoon }),
  });

  if (error) {
    reportError(error, 'deadline.decide', { request_id: verzoekId, code: error.code });
    return { ok: false, melding: t('deadline.beslissen_mislukt') };
  }

  const uitkomst = (data ?? {}) as { ok?: boolean; reason?: string; moved?: boolean };

  if (uitkomst.ok !== true) {
    return { ok: false, melding: beslisMelding(uitkomst.reason) };
  }

  return { ok: true, waarde: uitkomst.moved ?? false };
}

/**
 * Trekt je eigen openstaande verzoek in — Q-TODO A7.
 *
 * ⚠️ Zonder deze route is een verzoek waar niemand op reageert een blokkade
 *    zonder uitweg: de unieke index weigert een tweede verzoek, en je streefdatum
 *    staat vast tot iemand toevallig kijkt. `deadline_requests` kende de status
 *    `withdrawn` vanaf dag één en er was geen enkele manier om hem te bereiken.
 */
export async function trekDeadlineVerzoekIn(verzoekId: string): Promise<Resultaat<true>> {
  const { data, error } = await supabase().rpc('trek_deadline_verzoek_in', {
    p_request_id: verzoekId,
  });

  if (error) {
    reportError(error, 'deadline.withdraw', { request_id: verzoekId, code: error.code });
    return { ok: false, melding: t('deadline.intrekken_mislukt') };
  }

  const uitkomst = (data ?? {}) as { ok?: boolean; reason?: string };

  if (uitkomst.ok !== true) {
    return {
      ok: false,
      melding:
        uitkomst.reason === 'already_decided'
          ? t('deadline.intussen_beslist')
          : t('deadline.intrekken_mislukt_kort'),
    };
  }

  return { ok: true, waarde: true };
}

function naarVerzoek(rij: DeadlineVerzoekRij): DeadlineVerzoek {
  return {
    id: rij.id,
    goal_id: rij.goal_id,
    group_id: rij.group_id,
    requester_id: rij.requester_id,
    old_date: rij.old_date,
    new_date: rij.new_date,
    reason: rij.reason,
    status: rij.status,
    decided_by: rij.decided_by,
    decision_note: rij.decision_note,
    created_at: rij.created_at,
  };
}

/**
 * Het lopende verzoek van één doel, of `null`.
 *
 * ⚠️ Geen filter op eigenaar of lidmaatschap: `deadline_requests_select` laat
 *    uitsluitend door wat je mag zien. Een `.eq()` erbij zou suggereren dat de
 *    beveiliging hier zit.
 */
export async function fetchOpenVerzoek(goalId: string): Promise<DeadlineVerzoek | null> {
  const { data, error } = await supabase()
    .from('deadline_requests')
    .select('*')
    .eq('goal_id', goalId)
    .eq('status', 'open')
    .maybeSingle();

  if (error) {
    reportError(error, 'deadline.open', { goal_id: goalId, code: error.code });
    throw new Error(t('deadline.lopend_laden'));
  }

  return data === null ? null : naarVerzoek(data);
}

/**
 * Het laatste verzoek van dit doel waar al over beslist is — Q-TODO A7.
 *
 * ⚠️ Bestaat omdat een afwijzing anders volledig onzichtbaar is. `fetchOpenVerzoek`
 *    haalt alleen `open` op, dus zodra een buddy op "Liever niet" drukt verdwijnt
 *    het verzoek van het scherm en staat er weer een leeg formulier — alsof je
 *    nooit iets gevraagd had. Dan typ je het een tweede keer, zonder te weten dat
 *    er al nee gezegd is.
 *
 * ⚠️ Alleen op je eigen doelscherm. Dit is géén lijst voor de groep: een
 *    afgewezen verzoek is precies het soort tegenslagsignaal over een ander dat
 *    domeinregel 7 verbiedt.
 */
export async function fetchLaatsteBesluit(goalId: string): Promise<DeadlineVerzoek | null> {
  const { data, error } = await supabase()
    .from('deadline_requests')
    .select('*')
    .eq('goal_id', goalId)
    .in('status', ['approved', 'rejected'])
    .order('decided_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    reportError(error, 'deadline.last', { goal_id: goalId, code: error.code });
    // Geen harde fout: dit is een extraatje op het scherm en geen kernfunctie.
    return null;
  }

  return data === null ? null : naarVerzoek(data);
}

/** Standaard 20 per pagina. Ongepagineerd bestaat niet (CLAUDE.md, regel 10). */
export const VERZOEKEN_PER_PAGINA = 20;

/**
 * De open verzoeken in een groep waar jij over mag beslissen — Q-TODO A7.
 *
 * ⚠️ Je eigen verzoek valt eruit. Niet omdat het geheim is (het staat gewoon op
 *    je eigen doel), maar omdat een lijst "waar wacht men op mij" waar je eigen
 *    verzoek in staat, je twee keer laat kijken naar iets dat je niet kunt doen.
 */
export async function fetchOpenVerzoekenVoorGroep(
  groupId: string,
  mijnId: string,
): Promise<readonly DeadlineVerzoek[]> {
  const { data, error } = await supabase()
    .from('deadline_requests')
    .select('*')
    .eq('group_id', groupId)
    .eq('status', 'open')
    .neq('requester_id', mijnId)
    .order('created_at', { ascending: true })
    .limit(VERZOEKEN_PER_PAGINA);

  if (error) {
    reportError(error, 'deadline.queue', { group_id: groupId, code: error.code });
    throw new Error(t('deadline.verzoeken_laden'));
  }

  return (data ?? []).map(naarVerzoek);
}
