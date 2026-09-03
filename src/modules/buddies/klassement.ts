import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { type Pagina, type RpcRij } from '../../shared/api';
import { t } from '../../shared/i18n';

/**
 * Het klassement en de optelteller van een groep — QS8-254, besluit A54.
 *
 * ⚠️ **Twee getallen met twee verschillende regels, en dat is de hele module.**
 *    De teller is een groepstotaal zonder namen en staat in béide
 *    zichtbaarheidstanden open (dat is wat besluit A42 al toestond). Het
 *    klassement is per persoon en bestaat alleen in een **open** groep — een
 *    groep die onder A41 heeft afgesproken elkaars tegenslag te zien.
 *
 * ⚠️ **De grens zit in de database en niet hier.** `groep_klassement()` toetst
 *    `lid_van_open_groep()` en geeft in een beschermde groep nul rijen terug.
 *    Deze module verbergt dus niets — hij toont wat hij krijgt, en dat is precies
 *    de bedoeling: een scherm dat de regel zelf zou moeten kennen, is een regel
 *    die met één verzoek aan PostgREST te omzeilen valt.
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
 * Het klassement van een open groep.
 *
 * Geeft een lege pagina in een beschermde groep, en ook aan een niet-lid. Dat
 * onderscheid bestaat bewust niet: allebei krijgen ze nul rijen van de RPC, en
 * een aanroeper die het verschil kon zien, zou daarmee kunnen uitlezen of een
 * groep open staat zonder er lid van te zijn.
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
    reportError(error, 'groups.leaderboard', { group_id: groupId, pgcode: error.code });
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
    reportError(error, 'groups.counter', { group_id: groupId, pgcode: error.code });
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
