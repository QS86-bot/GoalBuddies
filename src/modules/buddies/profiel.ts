/**
 * Het profiel van een groepsgenoot — QS8-750, migratie 0306.
 *
 * ⚠️⚠️ **De grens zit in `profiel_van_lid()`, `profiel_doelen_van_lid()` en
 *    `profiel_groepen_van_lid()` en niet hier.** Elke functie is `security
 *    definer` met een expliciete kolomlijst en geeft nul rijen aan wie geen
 *    groep met de persoon deelt. Wat deze laag doet is aanroepen, het antwoord
 *    door een smalle parser halen en de tabs bepalen — geen filter, geen tweede
 *    oordeel over wie wat mag zien.
 *
 * ⚠️ **De parsers kennen precies de kolommen die de tabs nodig hebben.** Een
 *    kolom die de database ooit méér teruggeeft, komt hier niet door: dat is de
 *    tweede sleutel op dezelfde deur (defensief), en het is wat
 *    `PROFIEL_RPC_KOLOMMEN` toetsbaar maakt tegen de echte database
 *    (`tests/rls/profiel-van-een-ander.test.ts`).
 *
 * ⚠️ **De tabs "statistieken" en "prestaties" bestaan voor een ander niet.**
 *    `profielTabs(false)` bevat ze niet — ze zijn dus niet verborgen maar
 *    afwezig. Wie ze wil tonen moet `profielTabs()` aanpassen, en dat is een
 *    rode test in `profiel.test.ts`.
 *
 * ⚠️ De functies staan nog niet in `src/lib/database.types.ts`: dat bestand is
 *    een afschrift van productie en de migratie wacht op Quintens "backup
 *    gedaan". Tot `npm run types:db` ze kent loopt de aanroep door één smalle
 *    structurele rand, zoals `modules/xp/api.ts`.
 */
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { metGetekendeAvatars } from '../auth/avatar';
import { t } from '../../shared/i18n';

import {
  leesDoelen,
  leesGroepen,
  leesProfiel,
  PROFIEL_DOELEN_PER_PAGINA,
  type GedeeldeGroep,
  type LidProfiel,
  type ProfielDoel,
} from './profiel-lezen';

export {
  isEigenTab,
  profielTabs,
  PROFIEL_TABS_ANDER,
  PROFIEL_TABS_EIGEN,
  type GedeeldeGroep,
  type LidProfiel,
  type ProfielDoel,
  type ProfielTab,
} from './profiel-lezen';
export { PROFIEL_RPC_KOLOMMEN } from './profiel-kolommen';

interface RpcRand {
  rpc(
    naam: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

const rand = () => supabase() as unknown as RpcRand;

/** Het antwoord van een RPC, of een leesbare fout; de technische fout gaat naar `reportError`. */
function uitkomst(
  antwoord: { data: unknown; error: { message: string } | null },
  plek: string,
): unknown {
  if (antwoord.error) {
    reportError(antwoord.error, plek);
    throw new Error(t('profiel_ander.laden_mislukt'));
  }
  return antwoord.data;
}

/**
 * Het profiel, of `null` als er niets te zien is.
 *
 * ⚠️ `null` is hier één antwoord voor twee vragen — "bestaat niet" en "geen
 *    groepsgenoot" — en dat is met opzet: de database maakt dat onderscheid niet,
 *    dus het scherm kan het ook niet. Een tekst die het verschil benoemt, zou een
 *    bestaanstoets op gebruikers-id's zijn.
 */
export async function fetchProfielVanLid(userId: string): Promise<LidProfiel | null> {
  const profiel = leesProfiel(
    uitkomst(await rand().rpc('profiel_van_lid', { p_user: userId }), 'profiel.lid'),
  );
  if (profiel === null) return null;
  // ⚠️ `avatar_url` is een pad in een privébucket; zie `zoekMensen()`.
  const [getekend] = await metGetekendeAvatars([profiel], 'avatarUrl');
  return getekend ?? profiel;
}

export async function fetchProfielDoelen(
  userId: string,
  pagina = 0,
): Promise<{ readonly rijen: readonly ProfielDoel[]; readonly meer: boolean }> {
  const data = uitkomst(
    await rand().rpc('profiel_doelen_van_lid', {
      p_user: userId,
      p_limit: PROFIEL_DOELEN_PER_PAGINA,
      p_offset: pagina * PROFIEL_DOELEN_PER_PAGINA,
    }),
    'profiel.doelen',
  );
  const rijen = leesDoelen(data);
  return { rijen, meer: Array.isArray(data) && data.length === PROFIEL_DOELEN_PER_PAGINA };
}

export async function fetchProfielGroepen(userId: string): Promise<readonly GedeeldeGroep[]> {
  return leesGroepen(
    uitkomst(await rand().rpc('profiel_groepen_van_lid', { p_user: userId }), 'profiel.groepen'),
  );
}
