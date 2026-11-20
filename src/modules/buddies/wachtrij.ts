import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { type Resultaat, type RpcRij } from '../../shared/api';
import { t } from '../../shared/i18n';
import { ouderDan, toonKlokDatum, type TimeZone } from '../../shared/time';

import { fetchOntdekteGroepen, type OntdekteGroep } from './ontdekken';

/**
 * De wachtrij voor koppeling aan onbekenden met een gelijkend doel — QS8-233,
 * migraties 0299 en 0300.
 *
 * ⚠️ **Wat je over je eigen wachtopdracht te zien krijgt, staat in de
 *    handtekening van `buddyzoek_stand()` en niet hier.** Die functie is
 *    SECURITY DEFINER met een expliciete kolomlijst, want RLS kan geen kolommen
 *    beperken. Deze module kan dat dus niet verbreden — zelfde vorm en zelfde
 *    reden als `ontdekken.ts` naast `ontdek_groepen()`.
 *
 * ⚠️⚠️ **`nogNodig` is afgekapt op 0, 1 of 2, en dat is geen afronding maar een
 *    grendel.** Een exacte telling van je bak is met één API-verzoek te herhalen
 *    terwijl je je categorie of streefdatum varieert, en dan is het een
 *    demografisch meetinstrument op de gebruikersbasis. Het scherm zegt daarom
 *    nooit meer dan "er zijn nog twee mensen nodig", ook als het er zeven zijn.
 *
 * ⚠️ **Een groep die hieruit ontstaat is permanent beschermd**, als CHECK op
 *    `groups` plus een pin in `guard_group_update()`. Een groep van onbekenden
 *    openzetten zou domeinregel 7 via een omweg afschaffen, en besluit A41 is
 *    genomen voor groepen van vrienden.
 */

/**
 * De stand van je eigen wachtopdracht.
 *
 * ⚠️ `verlopen` sinds QS8-643 (migratie 0305): veertien dagen tevergeefs gezocht.
 *    Tot dan viel het scherm na het verlopen terug op "je zoekt niet", en dat is
 *    de stilte die het criterium van QS8-233 uitsluit. Een tegenvaller, en dus
 *    alleen voor de eigenaar: de RPC filtert op `owner_id` (domeinregel 7).
 */
export interface Buddyzoekstand {
  readonly status: 'wachtend' | 'gekoppeld' | 'verlopen';
  /** Hoeveel mensen er nog bij moeten. Nooit hoger dan 2 — zie de kop. */
  readonly nogNodig: number;
  readonly sinds: string;
  readonly verloopt: string;
  /** Gevuld zodra `status` `gekoppeld` is, en dan nooit `null`. */
  readonly groupId: string | null;
}

type RpcStand = RpcRij<{
  status: string;
  nog_nodig: number;
  sinds: string;
  verloopt: string;
  group_id: string;
}>;

function naarStand(rij: RpcStand): Buddyzoekstand | null {
  if (rij.status !== 'wachtend' && rij.status !== 'gekoppeld' && rij.status !== 'verlopen') return null;
  if (typeof rij.sinds !== 'string' || typeof rij.verloopt !== 'string') return null;

  const nog = typeof rij.nog_nodig === 'number' ? rij.nog_nodig : 0;

  return {
    status: rij.status,
    nogNodig: Math.max(0, Math.min(2, nog)),
    sinds: rij.sinds,
    verloopt: rij.verloopt,
    groupId: typeof rij.group_id === 'string' ? rij.group_id : null,
  };
}

/** De reden die de RPC teruggeeft, als zin voor de gebruiker. */
function meldingBijReden(reden: string | undefined): string {
  if (reden === 'rate_limited') return t('buddyzoek.te_veel');
  if (reden === 'not_found') return t('buddyzoek.niet_gevonden');
  if (reden === 'not_confirmed') return t('buddyzoek.niet_bevestigd');
  if (reden === 'not_active') return t('buddyzoek.doel_niet_actief');
  if (reden === 'expired') return t('buddyzoek.datum_verstreken');
  if (reden === 'too_many_queued') return t('buddyzoek.te_veel_open');
  if (reden === 'too_many_groups') return t('buddyzoek.te_veel_groepen');
  if (reden === 'already_matched') return t('buddyzoek.al_gekoppeld');
  return t('buddyzoek.mislukt');
}

/**
 * In de rij stappen.
 *
 * ⚠️⚠️ **`bevestigd` is geen formaliteit en hoort nooit hardgecodeerd op `true`.**
 *    Koppelen zet de beoordeelbaarheidsgrendel om: je lópende weekdoelen worden
 *    beoordeelbaar en kunnen vanaf dat moment een minpunt opleveren. Dat is wat
 *    een gebruiker als consequentie beloofd is, en hij hoort het te lezen vóór
 *    de knop en niet erna. De database weigert zonder bevestiging, dus wie hem
 *    hier op `true` zet, omzeilt een scherm en geen vinkje.
 */
export async function zoekBuddies(goalId: string, bevestigd: boolean): Promise<Resultaat<true>> {
  const { data, error } = await supabase().rpc('zoek_buddies_aan', {
    p_goal_id: goalId,
    p_bevestigd: bevestigd,
  });

  if (error) {
    reportError(error, 'buddies.match_queue_join', { goal_id: goalId });
    return { ok: false, melding: t('buddyzoek.mislukt') };
  }

  const uit = data as unknown as { ok?: boolean; reason?: string };
  if (uit.ok !== true) return { ok: false, melding: meldingBijReden(uit.reason) };

  return { ok: true, waarde: true };
}

/**
 * Uit de rij stappen.
 *
 * ⚠️ Dit kost niets — geen punt, geen gebeurtenis, geen bericht in een groep.
 *    Dat staat zo in de acceptatiecriteria en het is de reden dat er geen
 *    bevestiging omheen zit: wie eruit wil, wil eruit.
 */
export async function stopBuddyZoeken(goalId: string): Promise<Resultaat<true>> {
  const { data, error } = await supabase().rpc('zoek_buddies_uit', { p_goal_id: goalId });

  if (error) {
    reportError(error, 'buddies.match_queue_leave', { goal_id: goalId });
    return { ok: false, melding: t('buddyzoek.mislukt') };
  }

  const uit = data as unknown as { ok?: boolean; reason?: string };
  if (uit.ok !== true) return { ok: false, melding: meldingBijReden(uit.reason) };

  return { ok: true, waarde: true };
}

/**
 * De stand van je eigen wachtopdracht, of `null` als je niet zoekt.
 *
 * ⚠️ `null` betekent hier twee dingen die het scherm hetzelfde mag tonen: je
 *    zoekt niet, of je zocht en bent eruit gestapt. Een vertrokken rij komt niet
 *    terug; een verlopen rij wél, sinds QS8-643 — want "je zocht veertien dagen
 *    en er was niemand" is iets anders dan "je zoekt niet", en het scherm hoort
 *    dat verschil te laten zien.
 */
export async function fetchBuddyzoekStand(
  goalId: string,
  vandaag: string,
): Promise<Buddyzoekstand | null> {
  const { data, error } = await supabase().rpc('buddyzoek_stand', {
    p_goal_id: goalId,
    p_vandaag: vandaag,
  });

  if (error) {
    reportError(error, 'buddies.match_queue_status', { goal_id: goalId });
    return null;
  }

  // ⚠️⚠️ **Geen `.maybeSingle()`, en dat is een keuze.** De RPC geeft door zijn
  //    eigen `limit 1` hoogstens één rij, dus `.maybeSingle()` zou kloppen —
  //    maar die garantie staat in het functielichaam en is op deze regel niet te
  //    zien. `eenrij:controle` kan hem daar ook niet lezen: die leidt garanties
  //    af uit `create table`/`create index`, en een `.rpc()`-keten heeft geen
  //    tabel om op te kijken. Dan is "pak de eerste als er een is" eerlijker dan
  //    een belofte die de lezer op zijn woord moet geloven.
  //
  //    ⚠️ Dat de controle dit geval niet kán dekken, is een gat in de controle en
  //    geen eigenschap van deze regel. Het staat als eigen issue; hier omzeil ik
  //    het niet maar vermijd ik de aanname.
  const rijen = (data ?? []) as unknown as readonly RpcStand[];
  const eerste = rijen[0];

  return eerste === undefined ? null : naarStand(eerste);
}

/**
 * Hoeveel wachtopdrachten je vandaag nog mag doen.
 *
 * ⚠️ Bij een storing `null` en geen nul — zelfde afweging als
 *    `fetchVerzoekenOver()`: "je mag niets meer" is een bewering, en die doen we
 *    niet op grond van een mislukte aanroep. Het scherm laat de teller dan weg
 *    en de database blijft de rem.
 */
export async function fetchBuddyzoekopdrachtenOver(): Promise<number | null> {
  const { data, error } = await supabase().rpc('buddyzoekopdrachten_over');

  if (error) {
    reportError(error, 'buddies.match_queue_left');
    return null;
  }

  return typeof data === 'number' ? data : null;
}

/**
 * Of deze stand verlopen is — ook als de database hem nog `wachtend` noemde.
 *
 * ⚠️ **Twee wegen naar `verlopen`** (QS8-643, de naad uit de
 *    acceptatiecriteria). De database zegt `verlopen` zodra `expires_at` voorbij
 *    is, ook zonder dat de matcher draaide (0305). Een scherm dat de stand van
 *    vóór het verlopen vasthoudt, kijkt bij elke weergave ook zelf naar
 *    `verloopt` — via `ouderDan()` uit `shared/time`, want "is dit voorbij" is een
 *    tijdberekening (correctheidsregel 7).
 *
 * ⚠️ **Bij elke weergave, niet op het moment zelf.** Er is geen timer: een scherm
 *    dat open blijft staan zonder dat iets het opnieuw rendert, toont het
 *    verlopen pas bij de eerstvolgende weergave (code-review op QS8-643).
 */
export function isVerlopen(stand: Buddyzoekstand): boolean {
  if (stand.status === 'verlopen') return true;
  return stand.status === 'wachtend' && ouderDan(0, stand.verloopt);
}

/**
 * De datum waarop de zoekopdracht afliep of afloopt, als tekst voor de gebruiker.
 *
 * ⚠️ **`verloopt` is een `timestamptz` en geen `YYYY-MM-DD`**, en `toonDatum()`
 *    accepteert alleen dat laatste: hij gaf de ruwe tijdstempel terug, en het
 *    scherm zei "we zoeken tot 2026-11-15T12:34:56.789+00:00" (📏 code-review op
 *    QS8-643; zo stond het sinds QS8-233 ook in de wachtende stand). Hier de
 *    kalenderdag in de zone van de lezer, via `toonKlokDatum()`.
 */
export function verloopdatumTekst(stand: Buddyzoekstand, tz: TimeZone, taal: string): string {
  return toonKlokDatum(stand.verloopt, tz, taal);
}

/** Hoeveel alternatieven het scherm na een verlopen zoekopdracht hoogstens toont. */
export const ALTERNATIEVEN_MAX = 3;

/**
 * De groepen die we na een verlopen zoekopdracht voorstellen.
 *
 * ⚠️ **Een groep waar je al in zit, is geen alternatief.** `ontdek_groepen()`
 *    laat die niet weg — op het ontdekscherm is dat geen bezwaar, daar zie je
 *    hem en weet je het. Hier staat er "probeer deze", en dan is je eigen groep
 *    een voorstel dat nergens heen leidt (`already_member`).
 *
 * ⚠️ **Een automatisch gevormde groep komt hier nooit langs**, en dat is geen
 *    filter in deze functie maar een eigenschap van de database:
 *    `groups_automatisch_niet_ontdekbaar` (0300) en `ontdek_groepen()` geeft
 *    alleen `ontdekbaar`. Een tweede filter hier zou suggereren dat de eerste
 *    niet volstaat; de toets staat in `tests/rls/buddywachtrij-verlopen.test.ts`.
 */
export function kiesAlternatieven(
  groepen: readonly OntdekteGroep[],
  mijneGroepen: ReadonlySet<string>,
): readonly OntdekteGroep[] {
  return groepen.filter((g) => !mijneGroepen.has(g.groupId)).slice(0, ALTERNATIEVEN_MAX);
}

/**
 * De kandidaten voor een verlopen zoekopdracht: ontdekbare groepen in de
 * categorie van het doel. Het scherm kiest eruit met `kiesAlternatieven()`.
 *
 * ⚠️ **Zonder je eigen groepen als argument**, zodat het ophalen niet opnieuw
 *    start zodra die later binnenkomen (code-review op QS8-643). Het kiezen
 *    gebeurt bij het tonen.
 *
 * @throws bij een storing, zodat het scherm zijn foutstand toont (regel 16) en
 *   niet "er is nu niets" beweert op grond van een mislukte aanroep.
 */
export async function fetchBuddyzoekAlternatieven(categorie: string | null): Promise<readonly OntdekteGroep[]> {
  const pagina = await fetchOntdekteGroepen(categorie, null);
  return pagina.rijen;
}
