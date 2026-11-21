import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../lib/database.types.correcties';
import { supabase } from '../../lib/supabase';

/**
 * TIJDELIJKE typebrug voor de teamaandelen in het straf-scherm — QS8-698.
 *
 * ⚠️ **Dit bestand verdwijnt na de uitrol van de teamketen (0303 t/m 0327) én
 *    `npm run types:db`.** Tot dan staan `team_goal_shares`, `team_goals` en
 *    `groups.organization_id` niet in `src/lib/database.types.ts`, een afschrift
 *    van productie dat `types:db` in zijn geheel overschrijft (QS8-569). Besluit
 *    van Quinten, 20-11-2026: tijdelijk typebestand tot de uitrol. Zie
 *    `docs/decisions/2026-11-20-tijdelijk-typebestand-voor-het-strafscherm.md`.
 *
 *    Zodra de gegenereerde types de teamtabellen kennen: dit bestand weg, en
 *    `teamDb()` vervangen door `supabase()` in `strafkeuzes.ts`.
 *    `tests/beloftes/teamtypes-typebrug.test.ts` wordt rood zodra dat zover is.
 *
 * ⚠️ **De cast staat op één plek.** De rijvormen hieronder zijn de kolommen die
 *    het scherm leest, niet het hele schema. `groups` krijgt alleen de extra
 *    kolom `organization_id` erbij; de rest komt uit de bestaande `Database`.
 */

type AandeelRij = {
  goal_id: string;
  team_goal_id: string;
};

type TeamDoelRij = {
  id: string;
  group_id: string;
};

type GeenSchrijver = Record<string, never>;

type TeamTabellen = {
  team_goal_shares: {
    Row: AandeelRij;
    Insert: GeenSchrijver;
    Update: GeenSchrijver;
    Relationships: [];
  };
  team_goals: {
    Row: TeamDoelRij;
    Insert: GeenSchrijver;
    Update: GeenSchrijver;
    Relationships: [];
  };
  groups: {
    Row: { organization_id: string | null };
    Insert: GeenSchrijver;
    Update: GeenSchrijver;
    Relationships: [];
  };
};

/** Wat er bovenop de correctielaag komt: alleen wat dit scherm leest. */
type Uitbreiding = {
  public: {
    Tables: TeamTabellen;
    Functions: Record<string, never>;
  };
};

// ⚠️ Zelfde vorm als `db()` in `src/modules/organisaties/database.ts`, en
//    `tests/beloftes/typecorrecties.test.ts` leest de eerste naam achter de `<`.
export function teamDb(): SupabaseClient<Database & Uitbreiding> {
  return supabase() as unknown as SupabaseClient<Database & Uitbreiding>;
}
