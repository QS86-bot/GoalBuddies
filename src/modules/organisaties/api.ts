import { reportError } from '../../lib/observability';
import { invoerfout, type Resultaat, type RpcRij } from '../../shared/api';
import { t } from '../../shared/i18n';
import { codeSchema } from '../buddies';

import { db } from './database';
import {
  naamSchema,
  ORGANISATIELEDEN_PER_PAGINA,
  teamNaamSchema,
  uuidSchema,
} from './schemas';

export type { Resultaat };

/**
 * Organisaties, leden, teams en de uitnodigcode — QS8-657.
 *
 * ⚠️ **De client vraagt nooit "ben ik beheerder" om iets toe te staan.** De rol
 *    uit `fetchMijnOrganisaties()` bepaalt alleen welke knoppen er staan; elke
 *    RPC toetst zelf en antwoordt `niet_toegestaan`. Een rolcontrole hier zou een
 *    tweede waarheid zijn die uit elkaar kan lopen met de database.
 *
 * ⚠️ **Er komt nooit servertekst op het scherm.** De RPC's geven een kort
 *    kenmerk terug en de zin staat in de catalogus; een onbekend kenmerk krijgt
 *    de terugvaltekst van de aanroeper en nooit een lege string.
 *
 * ⚠️ **Nergens `select('*')`.** `organizations` heeft een kolomgrant waar de
 *    uitnodigcode buiten valt; die komt alleen uit `organisatie_uitnodigcode()`.
 */

export type Organisatierol = 'admin' | 'member';

export interface Organisatie {
  readonly id: string;
  readonly naam: string;
  readonly rol: Organisatierol;
}

export interface Organisatielid {
  readonly userId: string;
  readonly naam: string;
  readonly rol: Organisatierol;
}

export interface Organisatieteam {
  readonly id: string;
  readonly naam: string;
}

/** Eén pagina met een cursor: `volgende` is `null` als er niets meer is. */
export interface Bladzijde<T> {
  readonly rijen: readonly T[];
  readonly volgende: string | null;
}

export interface Uitnodigcode {
  readonly code: string;
  readonly ingetrokken: boolean;
}

/** Wat de RPC's teruggeven, met elke sleutel optioneel: de lijn is ons niet gegarandeerd. */
interface RpcUitkomst {
  readonly ok?: boolean;
  readonly reason?: string;
  readonly organization_id?: string;
  readonly group_id?: string;
  readonly code?: string;
  readonly ingetrokken?: boolean;
}

function uitkomstVan(data: unknown): RpcUitkomst {
  return typeof data === 'object' && data !== null ? (data as RpcUitkomst) : {};
}

/**
 * De redenen die de RPC's teruggeven, in gewone taal.
 *
 * ⚠️ Een functie en geen constante: de taal ligt bij het importeren nog niet vast
 *    (QS8-115).
 *
 * ⚠️ `invalid` en `removed` zeggen hetzelfde. Een apart antwoord voor "je bent
 *    eruit gezet" maakt van de code-invoer een orakel over wie er lid was.
 *
 * `rate_limited` staat hier niet: die betekent per handeling iets anders en
 * wordt door de aanroeper meegegeven.
 */
function meldingen(): Readonly<Record<string, string>> {
  return {
    ongeldige_naam: t('organisatie.naam_ongeldig'),
    te_veel_organisaties: t('organisatie.te_veel'),
    // maak_organisatie (0337, QS8-776): wie niet op de allowlist staat.
    niet_toegelaten: t('organisatie.niet_toegelaten'),
    invalid: t('organisatie.code_ongeldig'),
    removed: t('organisatie.code_ongeldig'),
    geen_lid: t('organisatie.geen_lid'),
    laatste_beheerder: t('organisatie.laatste_beheerder'),
    niet_toegestaan: t('organisatie.niet_toegestaan'),
    // maak_teamgroep (0317) en `create_group()`: dezelfde zinnen als bij groepen.
    name_too_short: t('groep.naam_kort'),
    name_too_long: t('groep.naam_lang'),
    name_invalid: t('groep.naam_ongeldig'),
    daily_limit: t('groep.daglimiet'),
  };
}

function melding(reden: string | undefined, terugval: string, rateLimited = terugval): string {
  if (reden === 'rate_limited') return rateLimited;
  return meldingen()[reden ?? ''] ?? terugval;
}

/** Een mislukte uitkomst als `Resultaat`, of `null` als hij gelukt is. */
function weigering(data: unknown, terugval: string, rateLimited?: string): Resultaat<never> | null {
  const uitkomst = uitkomstVan(data);
  if (uitkomst.ok === true) return null;
  return { ok: false, melding: melding(uitkomst.reason, terugval, rateLimited) };
}

// ---------------------------------------------------------------------------
// Aanmaken en lid worden
// ---------------------------------------------------------------------------

export async function maakOrganisatie(naam: string): Promise<Resultaat<string>> {
  const gevalideerd = naamSchema.safeParse(naam);
  if (!gevalideerd.success) {
    return { ok: false, melding: invoerfout(gevalideerd.error, t('organisatie.aanmaken_mislukt')) };
  }

  const { data, error } = await db().rpc('maak_organisatie', { p_naam: gevalideerd.data });
  if (error) {
    reportError(error, 'organisaties.maak');
    return { ok: false, melding: t('organisatie.aanmaken_mislukt') };
  }

  const uitkomst = uitkomstVan(data);
  if (uitkomst.ok !== true || typeof uitkomst.organization_id !== 'string') {
    return {
      ok: false,
      melding: melding(
        uitkomst.reason,
        t('organisatie.aanmaken_mislukt'),
        t('organisatie.rate_limited_aanmaken'),
      ),
    };
  }
  return { ok: true, waarde: uitkomst.organization_id };
}

export async function wordOrganisatielid(code: string): Promise<Resultaat<string>> {
  const gevalideerd = codeSchema.safeParse(code);
  if (!gevalideerd.success) {
    return { ok: false, melding: invoerfout(gevalideerd.error, t('organisatie.code_ongeldig')) };
  }

  const { data, error } = await db().rpc('word_organisatielid', { p_code: gevalideerd.data });
  if (error) {
    reportError(error, 'organisaties.deelnemen');
    return { ok: false, melding: t('organisatie.deelnemen_mislukt') };
  }

  const uitkomst = uitkomstVan(data);
  if (uitkomst.ok !== true || typeof uitkomst.organization_id !== 'string') {
    return {
      ok: false,
      melding: melding(
        uitkomst.reason,
        t('organisatie.deelnemen_mislukt'),
        t('organisatie.rate_limited_deelnemen'),
      ),
    };
  }
  return { ok: true, waarde: uitkomst.organization_id };
}

// ---------------------------------------------------------------------------
// Lezen
// ---------------------------------------------------------------------------

/**
 * Je organisaties met je eigen rol: twee vaste verzoeken, geen verzoek per rij.
 *
 * ⚠️ Een gebruiker zit in hooguit tien organisaties (0316), dus twintig is een
 *    rem en geen afkapping. De rol komt uit je eigen `organization_members`-rij —
 *    de enige rij die de tabel teruggeeft — en bepaalt alleen welke knoppen er
 *    staan.
 */
export async function fetchMijnOrganisaties(): Promise<readonly Organisatie[]> {
  const [organisaties, lidmaatschappen] = await Promise.all([
    db().from('organizations').select('id, name').order('name', { ascending: true }).limit(20),
    db().from('organization_members').select('organization_id, role').limit(20),
  ]);

  const fout = organisaties.error ?? lidmaatschappen.error;
  if (fout) {
    reportError(fout, 'organisaties.mijn');
    throw new Error(t('organisatie.ingang_storing'));
  }

  const rollen = new Map<string, Organisatierol>();
  for (const rij of lidmaatschappen.data ?? []) {
    rollen.set(rij.organization_id, rij.role === 'admin' ? 'admin' : 'member');
  }

  return (organisaties.data ?? []).map((rij) => ({
    id: rij.id,
    naam: rij.name,
    rol: rollen.get(rij.id) ?? 'member',
  }));
}

type LidRij = RpcRij<{ user_id: string; display_name: string; role: string }>;
type TeamRij = RpcRij<{ id: string; name: string }>;

/** De cursor is de laatste sleutel van een volle pagina; een korte pagina is de laatste. */
export function volgendeCursor(rijen: readonly { readonly sleutel: string }[], plafond: number): string | null {
  if (rijen.length < plafond) return null;
  // ⚠️ Een lege sleutel is geen cursor: hij zou als "geen cursor" gelezen worden
  //    en dezelfde eerste pagina opnieuw laden.
  const laatste = rijen.at(-1)?.sleutel;
  return laatste === undefined || laatste === '' ? null : laatste;
}

export async function fetchOrganisatieleden(
  organisatieId: string,
  na?: string | null,
): Promise<Bladzijde<Organisatielid>> {
  const { data, error } = await db().rpc('organisatieleden', {
    p_organization_id: organisatieId,
    p_limit: ORGANISATIELEDEN_PER_PAGINA,
    ...(na ? { p_na_user_id: na } : {}),
  });
  if (error) {
    reportError(error, 'organisaties.leden', { organization_id: organisatieId });
    throw new Error(t('organisatie.leden_laden'));
  }

  const ruw: readonly LidRij[] = data ?? [];
  const rijen: Organisatielid[] = [];
  for (const rij of ruw) {
    if (rij.user_id === null) continue;
    rijen.push({
      userId: rij.user_id,
      naam: rij.display_name ?? '',
      rol: rij.role === 'admin' ? 'admin' : 'member',
    });
  }

  return {
    rijen,
    volgende: volgendeCursor(
      ruw.map((rij) => ({ sleutel: rij.user_id ?? '' })),
      ORGANISATIELEDEN_PER_PAGINA,
    ),
  };
}

export async function fetchOrganisatieteams(
  organisatieId: string,
  na?: string | null,
): Promise<Bladzijde<Organisatieteam>> {
  const { data, error } = await db().rpc('organisatieteams', {
    p_organization_id: organisatieId,
    p_limit: ORGANISATIELEDEN_PER_PAGINA,
    ...(na ? { p_na_id: na } : {}),
  });
  if (error) {
    reportError(error, 'organisaties.teams', { organization_id: organisatieId });
    throw new Error(t('organisatie.teams_laden'));
  }

  const ruw: readonly TeamRij[] = data ?? [];
  const rijen: Organisatieteam[] = [];
  for (const rij of ruw) {
    if (rij.id === null) continue;
    rijen.push({ id: rij.id, naam: rij.name ?? '' });
  }

  return {
    rijen,
    volgende: volgendeCursor(
      ruw.map((rij) => ({ sleutel: rij.id ?? '' })),
      ORGANISATIELEDEN_PER_PAGINA,
    ),
  };
}

/**
 * De uitnodigcode, of `null` als je geen beheerder bent (of de organisatie niet
 * bestaat — de RPC maakt die twee niet te onderscheiden).
 */
export async function fetchUitnodigcode(organisatieId: string): Promise<Uitnodigcode | null> {
  const { data, error } = await db().rpc('organisatie_uitnodigcode', {
    p_organization_id: organisatieId,
  });
  if (error) {
    reportError(error, 'organisaties.code', { organization_id: organisatieId });
    throw new Error(t('organisatie.code_laden'));
  }

  const uitkomst = uitkomstVan(data);
  if (typeof uitkomst.code !== 'string') return null;
  return { code: uitkomst.code, ingetrokken: uitkomst.ingetrokken === true };
}

// ---------------------------------------------------------------------------
// Beheren
// ---------------------------------------------------------------------------

/** Een nieuwe code maken, of de huidige intrekken. Beide alleen voor een beheerder. */
export async function vernieuwOrganisatiecode(
  organisatieId: string,
  intrekken: boolean,
): Promise<Resultaat<Uitnodigcode>> {
  const { data, error } = await db().rpc('vernieuw_organisatiecode', {
    p_organization_id: organisatieId,
    p_intrekken: intrekken,
  });
  if (error) {
    reportError(error, 'organisaties.code_vernieuwen', { organization_id: organisatieId });
    return { ok: false, melding: t('organisatie.actie_mislukt') };
  }

  const uitkomst = uitkomstVan(data);
  if (uitkomst.ok !== true || typeof uitkomst.code !== 'string') {
    return {
      ok: false,
      melding: melding(
        uitkomst.reason,
        t('organisatie.actie_mislukt'),
        t('organisatie.rate_limited_code'),
      ),
    };
  }
  return { ok: true, waarde: { code: uitkomst.code, ingetrokken: uitkomst.ingetrokken === true } };
}

export async function zetLidUit(organisatieId: string, userId: string): Promise<Resultaat<true>> {
  const ids = uuidSchema.safeParse(organisatieId).success && uuidSchema.safeParse(userId).success;
  if (!ids) return { ok: false, melding: t('organisatie.uitzetten_mislukt') };

  const { data, error } = await db().rpc('zet_organisatielid_uit', {
    p_organization_id: organisatieId,
    p_user_id: userId,
  });
  if (error) {
    reportError(error, 'organisaties.uitzetten', { organization_id: organisatieId });
    return { ok: false, melding: t('organisatie.uitzetten_mislukt') };
  }
  return weigering(data, t('organisatie.uitzetten_mislukt')) ?? { ok: true, waarde: true };
}

export async function verlaatOrganisatie(organisatieId: string): Promise<Resultaat<true>> {
  const { data, error } = await db().rpc('verlaat_organisatie', {
    p_organization_id: organisatieId,
  });
  if (error) {
    reportError(error, 'organisaties.verlaten', { organization_id: organisatieId });
    return { ok: false, melding: t('organisatie.verlaten_mislukt') };
  }
  return weigering(data, t('organisatie.verlaten_mislukt')) ?? { ok: true, waarde: true };
}

/** Een team aanmaken. Alleen een organisatiebeheerder; de server beslist. */
export async function maakTeam(organisatieId: string, naam: string): Promise<Resultaat<string>> {
  const gevalideerd = teamNaamSchema.safeParse(naam);
  if (!gevalideerd.success) {
    return {
      ok: false,
      melding: invoerfout(gevalideerd.error, t('organisatie.team_aanmaken_mislukt')),
    };
  }

  const { data, error } = await db().rpc('maak_teamgroep', {
    p_organization_id: organisatieId,
    p_naam: gevalideerd.data,
  });
  if (error) {
    reportError(error, 'organisaties.team_maken', { organization_id: organisatieId });
    return { ok: false, melding: t('organisatie.team_aanmaken_mislukt') };
  }

  const uitkomst = uitkomstVan(data);
  if (uitkomst.ok !== true || typeof uitkomst.group_id !== 'string') {
    return {
      ok: false,
      melding: melding(uitkomst.reason, t('organisatie.team_aanmaken_mislukt')),
    };
  }
  return { ok: true, waarde: uitkomst.group_id };
}
