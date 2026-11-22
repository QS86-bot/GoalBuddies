import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { type Pagina, type Resultaat, type RpcRij } from '../../shared/api';
import { t } from '../../shared/i18n';

/**
 * Het klassement en de optelteller van een groep — QS8-254 (A54), sinds QS8-666 (A57) met een schakelaar.
 *
 * ⚠️ **Twee getallen met twee verschillende regels, en dat is de hele module.**
 *    De teller is een groepstotaal zonder namen en staat in béide
 *    zichtbaarheidstanden open (dat is wat besluit A42 al toestond). Het
 *    klassement is per persoon en hangt sinds 0333 aan `groups.klassement_aan`
 *    en niet meer aan de zichtbaarheid: een beheerder zet het aan of uit met
 *    `zet_groepsklassement()` (0336). Een teamgroep en een automatisch gevormde
 *    groep hebben het nooit.
 *
 * ⚠️ **De grens zit in de database en niet hier.** `groep_klassement()` toetst
 *    `lid_van_levende_groep()`, de schakelaar en de teamgroep en geeft anders
 *    nul rijen terug. Deze module verbergt dus niets: hij toont wat hij krijgt,
 *    en dat is precies de bedoeling: een scherm dat de regel zelf zou moeten
 *    kennen, is een regel die met één verzoek aan PostgREST te omzeilen valt.
 *    De poortfuncties onderaan (`kanKlassementZetten`, `toonKlassementUitnodiging`)
 *    zijn een weergavehint voor wie een knop mag zien; ze beslissen niets.
 *
 * ⚠️ **Er komt hier nooit een delta of een datum binnen.** De RPC heeft die
 *    kolommen niet (0141). Wie een verloop per lid wil tonen, kan dat niet
 *    oplossen in dit bestand — en dat is met opzet zo gebouwd, want een belofte
 *    die in een component staat, verhuist mee met dat component.
 */

/** Eén regel uit het klassement. */
export interface Klassementsrij {
  readonly userId: string;
  readonly naam: string;
  readonly punten: number;
  readonly positie: number;
}

/** De twee groepstotalen die alleen optellen. */
export interface Groepsteller {
  readonly weken: number;
  readonly mijlpalen: number;
}

/**
 * ⚠️ Twintig, gelijk aan `LEDEN_PER_PAGINA`. Bewust een eigen constante: het
 *    klassement en de ledenlijst hoeven niet dezelfde paginagrootte te houden,
 *    en één gedeelde constante maakt van een latere wijziging aan het ene scherm
 *    stilzwijgend een wijziging aan het andere.
 */
export const KLASSEMENT_PER_PAGINA = 20;

type RpcKlassement = RpcRij<{
  user_id: string;
  display_name: string;
  punten: number;
  positie: number;
  total_members: number;
}>;

/**
 * Zet één RPC-rij om, of `null` als hij onbruikbaar is.
 *
 * ⚠️ Dezelfde vorm als `naarGroepslid()` in `api.ts` en om dezelfde reden: de
 *    gegenereerde typen beschrijven wat de functie belóóft, niet wat er over de
 *    lijn komt.
 */
function naarRij(rij: RpcKlassement): Klassementsrij | null {
  if (typeof rij.user_id !== 'string') return null;
  if (typeof rij.punten !== 'number') return null;
  if (typeof rij.positie !== 'number') return null;

  return {
    userId: rij.user_id,
    naam: rij.display_name ?? '',
    punten: rij.punten,
    positie: rij.positie,
  };
}

/**
 * Het klassement van een groep.
 *
 * Geeft een lege pagina als het klassement uit staat, en ook aan een niet-lid. Dat
 * onderscheid bestaat bewust niet: allebei krijgen ze nul rijen van de RPC, en
 * een aanroeper die het verschil kon zien, zou daarmee kunnen uitlezen of een
 * groep het klassement aan heeft zonder er lid van te zijn.
 */
export async function fetchKlassement(
  groupId: string,
  opties: { readonly pagina?: number } = {},
): Promise<Pagina<Klassementsrij>> {
  const pagina = opties.pagina ?? 0;
  const van = pagina * KLASSEMENT_PER_PAGINA;

  const { data, error } = await supabase().rpc('groep_klassement', {
    p_group_id: groupId,
    p_limit: KLASSEMENT_PER_PAGINA,
    p_offset: van,
  });

  if (error) {
    reportError(error, 'groups.leaderboard', { group_id: groupId });
    throw new Error(t('klassement.laden_mislukt'));
  }

  const ruw = (data ?? []) as readonly RpcKlassement[];
  const rijen = ruw.map(naarRij).filter((rij): rij is Klassementsrij => rij !== null);

  // ⚠️ Onbruikbare rijen gaan óók van het totaal af — dezelfde aftrek als in
  //    `fetchGroepsoverzicht()`. Zonder die aftrek blijft "meer" op waar staan
  //    en biedt de UI een volgende pagina aan die leeg terugkomt.
  const overgeslagen = ruw.length - rijen.length;
  const totaal = Math.max(0, (ruw[0]?.total_members ?? rijen.length) - overgeslagen);

  return { rijen, totaal, meer: van + rijen.length < totaal };
}

/** De ruwe vorm van `groep_teller()`. */
interface RpcTeller {
  readonly weken?: number;
  readonly mijlpalen?: number;
}

/**
 * De twee optellende groepstotalen.
 *
 * Geeft `null` als de RPC niets teruggeeft, en dat gebeurt in precies één geval:
 * je bent geen lid van deze groep. Een onvolledig antwoord is iets anders — dat
 * is een storing, en die gooit. Zelfde afweging als in `ketting.ts`: gaven ze
 * allebei `null`, dan ziet een lid bij een defect hetzelfde als een
 * buitenstaander en weet niemand of dat normaal is.
 */
export async function fetchGroepsteller(groupId: string): Promise<Groepsteller | null> {
  const { data, error } = await supabase().rpc('groep_teller', { p_group_id: groupId });

  if (error) {
    reportError(error, 'groups.counter', { group_id: groupId });
    throw new Error(t('klassement.teller_mislukt'));
  }

  if (data === null || data === undefined) return null;

  const ruw = data as RpcTeller;

  if (typeof ruw.weken !== 'number' || typeof ruw.mijlpalen !== 'number') {
    reportError(new Error('Onvolledig antwoord van groep_teller'), 'groups.counter_parse', {
      group_id: groupId,
    });
    throw new Error(t('klassement.teller_mislukt'));
  }

  return { weken: ruw.weken, mijlpalen: ruw.mijlpalen };
}

/**
 * De weigerredenen van `zet_groepsklassement()` (0336), in woorden voor de beheerder.
 *
 * ⚠️ **Een eigen tabel en niet `meldingen()` uit `api.ts`.** Daar betekent
 *    `not_confirmed` iets over de zichtbaarheid en `unchanged` "dit verandert wat
 *    de groep over anderen ziet". Eén reden met twee betekenissen hoort niet in
 *    één tabel, en `zetHuddledag()` vertaalt ze om dezelfde reden bij de aanroep.
 *
 * ⚠️ **Een functie en geen constante** (QS8-115): `t()` leest de taal op het
 *    moment van aanroepen, en een constante bevriest hem bij het laden.
 *    `tests/beloftes/klassement-zet-redenen.test.ts` legt de sleutels naast de
 *    redenen in de laatste definitie van de RPC.
 */
export function klassementMeldingen(): Readonly<Record<string, string>> {
  return {
    not_confirmed: t('klassement.niet_bevestigd'),
    not_admin: t('groep.geen_beheerder'),
    teamgroep: t('klassement.teamgroep'),
    automatisch: t('klassement.automatisch'),
    archived: t('klassement.gearchiveerd'),
    unchanged: t('klassement.ongewijzigd'),
    unknown_group: t('klassement.onbekend'),
    unknown_state: t('groep.actie_mislukt_kort'),
  };
}

/**
 * Zet het klassement van een groep aan of uit — migratie 0336 (QS8-666, A57).
 *
 * ⚠️ `bevestigd` is een parameter om dezelfde reden als bij `zetGroepszichtbaarheid()`:
 *    de handeling raakt álle leden (aanzetten maakt ook de al verdiende punten
 *    zichtbaar, want `points_ledger` bewaart de groep altijd), en domeinregel 5 zegt
 *    dat zoiets expliciet bevestigd moet zijn. De database weigert zonder.
 *
 * Geeft de stand terug die de database nu heeft, en niet de gevraagde.
 */
export async function zetGroepsklassement(
  groupId: string,
  aan: boolean,
  bevestigd: boolean,
): Promise<Resultaat<boolean>> {
  const { data, error } = await supabase().rpc('zet_groepsklassement', {
    p_group_id: groupId,
    p_aan: aan,
    p_bevestigd: bevestigd,
  });

  if (error) {
    reportError(error, 'groups.leaderboard_set', { group_id: groupId });
    return { ok: false, melding: t('groep.actie_mislukt') };
  }

  const uit = (data ?? {}) as { ok?: boolean; reason?: string; klassement?: boolean };
  if (uit.ok !== true) {
    const reden = uit.reason ?? '';
    return {
      ok: false,
      melding: klassementMeldingen()[reden] ?? t('groep.actie_mislukt_kort'),
    };
  }

  return { ok: true, waarde: uit.klassement ?? aan };
}

// ⚠️ De poortfuncties staan in `klassement-poort.ts`, zonder enige import: de RLS-toets leest ze naast de database
//    (`tests/rls/klassement-uitnodiging.test.ts`) en kan geen module laden die `react-native` meetrekt.
export {
  kanKlassementZetten,
  klassementPlek,
  toonKlassementUitnodiging,
  type KlassementGroep,
  type KlassementPlek,
  type KlassementUitkomstVorm,
} from './klassement-poort';
