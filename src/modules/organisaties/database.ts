import type { SupabaseClient } from '@supabase/supabase-js';

import type { Json } from '../../lib/database.types';
import type { Database } from '../../lib/database.types.correcties';
import { supabase } from '../../lib/supabase';

/**
 * TIJDELIJKE typebrug voor de organisatietabellen en -functies — QS8-657.
 *
 * ⚠️ **Dit bestand verdwijnt na de uitrol van 0299, 0300 en 0305.** Die
 *    migraties staan nog niet op productie, en `src/lib/database.types.ts` is
 *    een afschrift van productie dat `npm run types:db` in zijn geheel
 *    overschrijft (QS8-569). Zodra productie ze draagt en het afschrift is
 *    hergenereerd, kent `supabase()` deze functies zelf: dan gaat `db()` weg en
 *    wordt elke `db().rpc(…)` een `supabase().rpc(…)`.
 *    `tests/beloftes/organisatie-typebrug.test.ts` wordt rood zodra dat zover is.
 *
 * ⚠️ **De cast is de enige in de module en hij staat op één plek.** De rijvormen
 *    hieronder zijn de kolomgrants van 0299, niet het hele schema:
 *    `organizations` geeft `id, name, status, created_at` (nooit de code),
 *    en `organization_members` geeft via de tabel alleen je eigen actieve rij.
 *    Een `select('*')` zou dus een fout geven in plaats van extra kolommen, en
 *    daarom staat er in de api overal een kolomlijst.
 */

type Publiek = Database['public'];

type OrganisatieRij = {
  id: string;
  name: string;
  status: string;
  created_at: string;
};

type LidmaatschapRij = {
  organization_id: string;
  user_id: string;
  role: string;
  status: string;
  joined_at: string;
};

type LeesTabel<R> = {
  Row: R;
  Insert: Record<string, never>;
  Update: Record<string, never>;
  Relationships: [];
};

type OrganisatieFuncties = {
  maak_organisatie: { Args: { p_naam: string }; Returns: Json };
  word_organisatielid: { Args: { p_code: string }; Returns: Json };
  verlaat_organisatie: { Args: { p_organization_id: string }; Returns: Json };
  zet_organisatielid_uit: {
    Args: { p_organization_id: string; p_user_id: string };
    Returns: Json;
  };
  organisatieleden: {
    Args: { p_organization_id: string; p_limit?: number; p_na_user_id?: string };
    Returns: { user_id: string; display_name: string; role: string }[];
  };
  organisatie_uitnodigcode: { Args: { p_organization_id: string }; Returns: Json };
  vernieuw_organisatiecode: {
    Args: { p_organization_id: string; p_intrekken?: boolean };
    Returns: Json;
  };
  organisatieteams: {
    Args: { p_organization_id: string; p_limit?: number; p_na_id?: string };
    Returns: { id: string; name: string }[];
  };
  maak_teamgroep: {
    Args: {
      p_organization_id: string;
      p_naam: string;
      p_huddledag?: number;
      p_tz?: string;
      p_zichtbaarheid?: string;
    };
    Returns: Json;
  };
};

export type OrganisatieDatabase = Omit<Database, 'public'> & {
  public: Omit<Publiek, 'Tables' | 'Functions'> & {
    Tables: Publiek['Tables'] & {
      organizations: LeesTabel<OrganisatieRij>;
      organization_members: LeesTabel<LidmaatschapRij>;
    };
    Functions: Publiek['Functions'] & OrganisatieFuncties;
  };
};

export function db(): SupabaseClient<OrganisatieDatabase> {
  return supabase() as unknown as SupabaseClient<OrganisatieDatabase>;
}
