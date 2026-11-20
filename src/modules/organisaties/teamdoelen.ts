import { reportError } from '../../lib/observability';
import { invoerfout, type Resultaat } from '../../shared/api';
import { t } from '../../shared/i18n';
import { daysBetween, type IsoDate } from '../../shared/time';

import { volgendeCursor, type Bladzijde } from './api';
import { db } from './database';
import {
  teamdoelBeschrijvingSchema,
  TEAMDOELEN_PER_PAGINA,
  teamdoelDatumSchema,
  teamdoelTitelSchema,
  uuidSchema,
} from './schemas';

/**
 * Teamdoelen, de teambalk en het eigen aandeel — QS8-658.
 *
 * ⚠️ **Nergens `select('*')` op `team_goals`.** `created_by` staat buiten de
 *    kolomgrant (0319): rij 46 in 002 belooft een teambericht zonder persoon, en
 *    een aanmaker in de rij zou dat langs een omweg geven. Een `*` geeft hier
 *    een fout in plaats van extra kolommen, en de kolomlijst staat daarom op één
 *    plek.
 *
 * ⚠️ **De teambalk komt altijd van de server en nooit uit lokale state** (besluit
 *    7 en 16: hij telt alleen op). Dat is een type en geen afspraak: `Teambalk`
 *    heeft een merk dat alleen `laadTeamdoel()` kan zetten, dus een scherm dat
 *    na een aandeel "even +1" wil tonen kan geen balk samenstellen. Een
 *    getal dat lokaal bijgehouden wordt, kan dalen of verspringen bij een
 *    herlaad, en dat is precies het signaal dat domeinregel 7 verbiedt.
 *
 * ⚠️ **Er is hier geen lijst van wie een aandeel heeft.** `team_goal_shares`
 *    geeft alleen de eigen rij (besluit 11 en 21), en deze module vraagt er
 *    niet meer van.
 */

export interface Teamdoel {
  readonly id: string;
  readonly groepId: string;
  readonly titel: string;
  readonly beschrijving: string | null;
  readonly streefdatum: string;
  readonly status: string;
}

const bron: unique symbol = Symbol('teambalk');

/** Het aantal behaalde mijlpalen, zoals de server het telde. Alleen `laadTeamdoel()` maakt er een. */
export type Teambalk = { readonly aantal: number; readonly [bron]: true };

export interface Teamdoelstand {
  readonly teamdoel: Teamdoel;
  readonly balk: Teambalk;
  /** Het persoonlijke doel dat jouw aandeel is, of `null` als je er nog geen hebt. */
  readonly aandeelDoelId: string | null;
}

const TEAMDOEL_KOLOMMEN = 'id, group_id, title, description, target_date, status, created_at';

interface TeamdoelRuw {
  readonly id: string;
  readonly group_id: string;
  readonly title: string;
  readonly description: string | null;
  readonly target_date: string;
  readonly status: string;
}

function naarTeamdoel(rij: TeamdoelRuw): Teamdoel {
  return {
    id: rij.id,
    groepId: rij.group_id,
    titel: rij.title,
    beschrijving: rij.description,
    streefdatum: rij.target_date,
    status: rij.status,
  };
}

// ---------------------------------------------------------------------------
// De datum (V15-A, besluit van Quinten, 20-11-2026)
// ---------------------------------------------------------------------------

/**
 * Wat een teamdoel onder zijn titel zegt over de tijd.
 *
 * ⚠️ **Een verstreken streefdatum staat nergens.** Een teamdoel dat zijn datum
 *    niet haalde, wijst in een klein team naar wie er een aandeel in had; dat is
 *    het schaamtemoment van domeinregel 7, in een groep die niet vrijwillig
 *    gekozen is. Daarom: de streefdatum zolang hij nog komt, en daarna
 *    "loopt nog". De lijst toont helemaal geen datum (zie het lijstscherm).
 *
 * ⚠️ **"Verstreken" rekent zoals de server:** `target_date < mijn_datum()` in
 *    0319, dus de streefdatum zelf telt nog als "komt nog". `vandaag` is de datum
 *    in de tijdzone van de gebruiker, zoals `mijn_datum()`.
 *
 * ⚠️ Een afgerond teamdoel zegt "afgerond" (V20 = A, Quinten, 20-11-2026), een
 *    gearchiveerd teamdoel zegt niets.
 */
export type Datumregel =
  | { readonly soort: 'streefdatum'; readonly datum: string }
  | { readonly soort: 'loopt_nog' }
  | { readonly soort: 'afgerond' }
  | { readonly soort: 'geen' };

function isVerstreken(streefdatum: string, vandaag: IsoDate): boolean {
  return daysBetween(streefdatum as IsoDate, vandaag) > 0;
}

export function datumregel(teamdoel: Teamdoel, vandaag: IsoDate): Datumregel {
  if (teamdoel.status === 'completed') return { soort: 'afgerond' };
  if (teamdoel.status !== 'active') return { soort: 'geen' };
  if (isVerstreken(teamdoel.streefdatum, vandaag)) return { soort: 'loopt_nog' };
  return { soort: 'streefdatum', datum: teamdoel.streefdatum };
}

/**
 * Of het scherm de knop "Neem een aandeel" toont (V21 = A, Quinten, 20-11-2026).
 *
 * ⚠️ De server blijft de grens: `neem_aandeel()` weigert met
 *    `streefdatum_verstreken` en `niet_actief`. Dit haalt alleen een knop weg
 *    die altijd tot een weigering leidt.
 */
export function kanAandeelNemen(teamdoel: Teamdoel, vandaag: IsoDate): boolean {
  return teamdoel.status === 'active' && !isVerstreken(teamdoel.streefdatum, vandaag);
}

// ---------------------------------------------------------------------------
// Lezen
// ---------------------------------------------------------------------------

/** Is dit een groep van een organisatie? Een niet-lid en een onbekende groep geven allebei `false`. */
export async function fetchIsTeamgroep(groupId: string): Promise<boolean> {
  const { data, error } = await db()
    .from('groups')
    .select('organization_id')
    .eq('id', groupId)
    .maybeSingle();
  if (error) {
    reportError(error, 'teamdoelen.teamgroep', { group_id: groupId });
    throw new Error(t('teamdoel.ingang_storing'));
  }
  return data?.organization_id != null;
}

export async function fetchTeamdoelen(
  groupId: string,
  na?: string | null,
): Promise<Bladzijde<Teamdoel>> {
  const basis = db()
    .from('team_goals')
    .select(TEAMDOEL_KOLOMMEN)
    .eq('group_id', groupId)
    .order('id', { ascending: true });
  const { data, error } = await (na ? basis.gt('id', na) : basis).limit(TEAMDOELEN_PER_PAGINA);
  if (error) {
    reportError(error, 'teamdoelen.lijst', { group_id: groupId });
    throw new Error(t('teamdoel.lijst_laden'));
  }

  const ruw = data ?? [];
  return {
    rijen: ruw.map(naarTeamdoel),
    volgende: volgendeCursor(
      ruw.map((rij) => ({ sleutel: rij.id })),
      TEAMDOELEN_PER_PAGINA,
    ),
  };
}

/**
 * Eén teamdoel met zijn balk en jouw aandeel: drie vaste verzoeken, geen verzoek
 * per rij.
 *
 * ⚠️ `null` voor een onleesbaar teamdoel én voor een balk die `null` is. De
 *    server maakt die twee niet te onderscheiden (0320) en het scherm hoort dat
 *    ook niet te doen.
 *
 * ⚠️ Geen cache en geen `max()` over eerdere uitkomsten. Een balk die lager is
 *    dan de vorige keer is een gegeven van de server en geen fout van de client.
 */
export async function laadTeamdoel(id: string, userId: string): Promise<Teamdoelstand | null> {
  if (!uuidSchema.safeParse(id).success) return null;

  const [teamdoel, balk, aandeel] = await Promise.all([
    db().from('team_goals').select(TEAMDOEL_KOLOMMEN).eq('id', id).maybeSingle(),
    db().rpc('teambalk', { p_team_goal_id: id }),
    db()
      .from('team_goal_shares')
      .select('goal_id')
      .eq('team_goal_id', id)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const fout = teamdoel.error ?? balk.error ?? aandeel.error;
  if (fout) {
    reportError(fout, 'teamdoelen.laden', { team_goal_id: id });
    throw new Error(t('teamdoel.laden_mislukt'));
  }
  if (teamdoel.data === null || balk.data === null) return null;

  return {
    teamdoel: naarTeamdoel(teamdoel.data),
    balk: { aantal: balk.data, [bron]: true },
    aandeelDoelId: aandeel.data?.goal_id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Schrijven
// ---------------------------------------------------------------------------

interface RpcUitkomst {
  readonly ok?: boolean;
  readonly reason?: string;
  readonly team_goal_id?: string;
  readonly goal_id?: string;
}

function uitkomstVan(data: unknown): RpcUitkomst {
  return typeof data === 'object' && data !== null ? (data as RpcUitkomst) : {};
}

/**
 * De redenen van `maak_teamdoel()` en `neem_aandeel()` (0319), in gewone taal.
 *
 * ⚠️ Een functie en geen constante: de taal ligt bij het importeren nog niet vast.
 *    `niet_toegestaan` is één antwoord voor "geen lid", "geen teamgroep" en
 *    "bestaat niet", en blijft dat ook hier.
 */
function meldingen(): Readonly<Record<string, string>> {
  return {
    niet_toegestaan: t('teamdoel.niet_toegestaan'),
    ongeldige_titel: t('teamdoel.titel_ongeldig'),
    ongeldige_beschrijving: t('teamdoel.beschrijving_lang'),
    ongeldige_streefdatum: t('teamdoel.datum_voorbij'),
    ongeldige_tekst: t('teamdoel.tekst_ongeldig'),
    daily_limit: t('teamdoel.daglimiet'),
    niet_actief: t('teamdoel.niet_actief'),
    al_aandeel: t('teamdoel.al_aandeel'),
    streefdatum_verstreken: t('teamdoel.streefdatum_verstreken'),
  };
}

function melding(reden: string | undefined, terugval: string): string {
  return meldingen()[reden ?? ''] ?? terugval;
}

/**
 * Een teamdoel aanmaken. Elk lid van de teamgroep mag (besluit 20); de server
 * toetst het lidmaatschap en de streefdatum in de kalender van de groep.
 */
export async function maakTeamdoel(
  groupId: string,
  titel: string,
  streefdatum: string,
  beschrijving: string,
): Promise<Resultaat<string>> {
  const terugval = t('teamdoel.aanmaken_mislukt');
  const geparst = {
    groep: uuidSchema.safeParse(groupId),
    titel: teamdoelTitelSchema.safeParse(titel),
    datum: teamdoelDatumSchema.safeParse(streefdatum),
    beschrijving: teamdoelBeschrijvingSchema.safeParse(beschrijving),
  };
  if (!geparst.groep.success) return { ok: false, melding: terugval };
  if (!geparst.titel.success) return { ok: false, melding: invoerfout(geparst.titel.error, terugval) };
  if (!geparst.datum.success) return { ok: false, melding: invoerfout(geparst.datum.error, terugval) };
  if (!geparst.beschrijving.success) {
    return { ok: false, melding: invoerfout(geparst.beschrijving.error, terugval) };
  }

  const { data, error } = await db().rpc('maak_teamdoel', {
    p_group_id: geparst.groep.data,
    p_titel: geparst.titel.data,
    p_streefdatum: geparst.datum.data,
    p_beschrijving: geparst.beschrijving.data,
  });
  if (error) {
    reportError(error, 'teamdoelen.maken', { group_id: groupId });
    return { ok: false, melding: terugval };
  }

  const uitkomst = uitkomstVan(data);
  if (uitkomst.ok !== true || typeof uitkomst.team_goal_id !== 'string') {
    return { ok: false, melding: melding(uitkomst.reason, terugval) };
  }
  return { ok: true, waarde: uitkomst.team_goal_id };
}

/**
 * Een aandeel nemen: de server maakt een nieuw persoonlijk doel en koppelt het.
 *
 * ⚠️ **De uitkomst bevat het doel en nooit een balk.** Het scherm herlaadt daarna
 *    `laadTeamdoel()`; er is hier geen getal om lokaal op te tellen.
 */
export async function neemAandeel(teamGoalId: string): Promise<Resultaat<string>> {
  const terugval = t('teamdoel.aandeel_mislukt');
  if (!uuidSchema.safeParse(teamGoalId).success) return { ok: false, melding: terugval };

  const { data, error } = await db().rpc('neem_aandeel', { p_team_goal_id: teamGoalId });
  if (error) {
    reportError(error, 'teamdoelen.aandeel', { team_goal_id: teamGoalId });
    return { ok: false, melding: terugval };
  }

  const uitkomst = uitkomstVan(data);
  if (uitkomst.ok !== true || typeof uitkomst.goal_id !== 'string') {
    return { ok: false, melding: melding(uitkomst.reason, terugval) };
  }
  return { ok: true, waarde: uitkomst.goal_id };
}
