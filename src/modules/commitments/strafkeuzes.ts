import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { t } from '../../shared/i18n';

import type { MogelijkeBegunstigde } from './api';
import {
  isKolomOnbekend,
  isTabelOnbekend,
  strafGroepen,
  type MijnGroep,
  type StrafKeuzes,
} from './strafgroepen';
import { teamDb } from './teamtypes.tijdelijk';

/**
 * De keuzelijst van een straf, gefilterd op wat de database toelaat — QS8-698.
 *
 * ⚠️ De database is de grendel, dit is het gemak. `bewaak_teamstraf()` (0325)
 *    weigert een verkeerde keuze; deze lijst biedt er geen aan. Dezelfde twee
 *    regels, dus:
 *    - **Een aandeel** (het doel heeft een `team_goal_shares`-rij): alleen het
 *      eigen team als groep, en alleen actieve teamgenoten als persoon.
 *    - **Een gewoon doel**: geen teamgroep als groep. Als persoon alleen wie een
 *      niet-organisatiegroep met je deelt (regel M2 van de trigger): een collega
 *      met wie je alleen het team deelt, is geen getuige van je privédoel.
 */

export const GEEN_STRAFKEUZES: StrafKeuzes = { aandeel: false, groepen: [], personen: [] };

/** Een aandeel waarvan het team niet leesbaar is: geen privélijst tonen. */
const GEEN_TEAM_LEESBAAR = Symbol('geen-team-leesbaar');

type TeamUitkomst = string | null | typeof GEEN_TEAM_LEESBAAR;

const MAX_GROEPEN = 20;
const MAX_LEDEN = 100;

/**
 * Het team van een aandeel, of `null` als het doel geen aandeel is.
 *
 * ⚠️ Alleen "tabel bestaat niet" telt als "geen aandeel". Een tijdelijke fout na de
 *    uitrol zou anders een aandeel als privédoel tonen; de lijst blijft dan leeg,
 *    en dat is de veilige kant.
 */
async function teamVanAandeel(goalId: string): Promise<TeamUitkomst> {
  const db = teamDb();
  const aandeel = await db
    .from('team_goal_shares')
    .select('team_goal_id')
    .eq('goal_id', goalId)
    .limit(1);
  if (isTabelOnbekend(aandeel.error?.code)) {
    reportError(aandeel.error, 'commitments.strafkeuzes.aandeel');
    return null;
  }
  if (aandeel.error) throw aandeel.error;
  const teamDoelId = aandeel.data?.[0]?.team_goal_id;
  if (teamDoelId === undefined) return null;

  const doel = await db.from('team_goals').select('group_id').eq('id', teamDoelId).limit(1);
  if (doel.error) throw doel.error;
  // ⚠️ Het aandeel bestaat, maar het team is niet leesbaar (een oud-teamlid houdt zijn
  //    aandeel, 0321, zonder een actief lidmaatschap). Dat is een aandeel zonder team: de
  //    lijst blijft leeg, en nooit de privélijst.
  return doel.data?.[0]?.group_id ?? GEEN_TEAM_LEESBAAR;
}

async function mijnGroepen(ik: string): Promise<readonly MijnGroep[]> {
  const db = teamDb();
  const lid = await db
    .from('group_members')
    .select('group_id')
    .eq('user_id', ik)
    .neq('status', 'inactive')
    .limit(MAX_GROEPEN);
  if (lid.error) throw lid.error;

  const ids = (lid.data ?? []).map((r) => r.group_id);
  if (ids.length === 0) return [];

  const groepen = await db.from('groups').select('id, name, organization_id').in('id', ids);
  if (!groepen.error) return (groepen.data ?? []) as readonly MijnGroep[];
  if (!isKolomOnbekend(groepen.error.code)) throw groepen.error;

  // ⚠️ Zonder `organization_id` (productie vóór de teamketen) is elke groep privé.
  //    Dat is juist vóór de uitrol: er bestaat dan geen organisatie. De melding
  //    blijft staan, zodat het niet stil gebeurt.
  reportError(groepen.error, 'commitments.strafkeuzes.groepen');
  const zonderOrganisatie = await db.from('groups').select('id, name').in('id', ids);
  if (zonderOrganisatie.error) throw zonderOrganisatie.error;
  return (zonderOrganisatie.data ?? []).map((g) => ({ ...g, organization_id: null }));
}

async function ledenVan(groepIds: readonly string[], ik: string): Promise<readonly MogelijkeBegunstigde[]> {
  if (groepIds.length === 0) return [];
  const leden = await teamDb()
    .from('group_members')
    .select('user_id, profiles(display_name)')
    .in('group_id', [...groepIds])
    .neq('user_id', ik)
    .neq('status', 'inactive')
    .limit(MAX_LEDEN);
  if (leden.error) throw leden.error;

  // Ontdubbelen op `user_id`: een collega in twee van je groepen staat maar één keer in de lijst.
  const gezien = new Map<string, MogelijkeBegunstigde>();
  for (const rij of leden.data ?? []) {
    const id = rij.user_id as string;
    if (gezien.has(id)) continue;
    const profiel = rij.profiles as { display_name?: string | null } | null;
    gezien.set(id, { id, naam: profiel?.display_name ?? t('commitment.begunstigde.naamloos') });
  }
  return [...gezien.values()];
}

/**
 * De keuzelijst voor een straf op dit doel. Bij een fout: een lege lijst en een
 * melding in de foutrapportage, zoals `fetchMogelijkeBegunstigden`. De lege lijst
 * laat het scherm de bestaande uitleg tonen in plaats van een keuze die misschien
 * niet klopt.
 */
export async function fetchStrafKeuzes(goalId: string): Promise<StrafKeuzes> {
  const { data: sessie } = await supabase().auth.getUser();
  const ik = sessie.user?.id ?? '';
  if (ik === '') return GEEN_STRAFKEUZES;

  try {
    const teamId = await teamVanAandeel(goalId);
    if (teamId === GEEN_TEAM_LEESBAAR) return { aandeel: true, groepen: [], personen: [] };
    const mijn = await mijnGroepen(ik);
    const { groepen, ledenVan: ids } = strafGroepen(mijn, teamId);
    const personen = await ledenVan(ids, ik);
    return { aandeel: teamId !== null, groepen, personen };
  } catch (fout) {
    reportError(fout, 'commitments.strafkeuzes');
    return GEEN_STRAFKEUZES;
  }
}
