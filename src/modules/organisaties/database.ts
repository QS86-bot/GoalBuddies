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

type GeenSchrijver = Record<string, never>;

type LedenArgs = {
  p_organization_id: string;
  p_limit?: number;
  p_na_user_id?: string;
};

type MaakTeamgroepArgs = {
  p_organization_id: string;
  p_naam: string;
  p_huddledag?: number;
  p_tz?: string;
  p_zichtbaarheid?: string;
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
    Args: LedenArgs;
    Returns: { user_id: string; display_name: string; role: string }[];
  };
  organisatie_uitnodigcode: {
    Args: { p_organization_id: string };
    Returns: Json;
  };
  vernieuw_organisatiecode: {
    Args: { p_organization_id: string; p_intrekken?: boolean };
    Returns: Json;
  };
  organisatieteams: {
    Args: { p_organization_id: string; p_limit?: number; p_na_id?: string };
    Returns: { id: string; name: string }[];
  };
  maak_teamgroep: {
    Args: MaakTeamgroepArgs;
    Returns: Json;
  };
};

type OrganisatieTabellen = {
  organizations: {
    Row: OrganisatieRij;
    Insert: GeenSchrijver;
    Update: GeenSchrijver;
    Relationships: [];
  };
  organization_members: {
    Row: LidmaatschapRij;
    Insert: GeenSchrijver;
    Update: GeenSchrijver;
    Relationships: [];
  };
};

/** Wat er bovenop de correctielaag komt: alleen de tabellen en functies van 0299, 0300 en 0305. */
type Uitbreiding = {
  public: {
    Tables: OrganisatieTabellen;
    Functions: OrganisatieFuncties;
  };
};

// ⚠️ `SupabaseClient<Database & …>` en niet een eigen alias: `tests/beloftes/typecorrecties.test.ts`
//    leest de eerste naam achter de `<` en eist dat die uit de correctielaag
//    komt. Zo is dat ook letterlijk waar.
export function db(): SupabaseClient<Database & Uitbreiding> {
  return supabase() as unknown as SupabaseClient<Database & Uitbreiding>;
}
