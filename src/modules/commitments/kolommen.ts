/**
 * De kolommen die deze client van `commitments` leest — één lijst voor elke
 * `.select()`, want de SELECT-grant is per kolom (0280).
 *
 * ⚠️ **Een `string` en geen letterlijke tekst**, zolang `periode_start` niet in de
 *    gegenereerde typen staat: de parser van supabase-js kent de kolom niet en
 *    zou het hele resultaat als fout typeren. De vorm van het resultaat legt
 *    het type `Commitment` in `api.ts` vast; `tests/beloftes/commitment-kolommen.test.ts` legt
 *    deze lijst naast dat type. ⚠️ Pas uitrollen ná 0312 (`docs/DEPLOY.md` §2.5c):
 *    vóór die migratie geeft PostgREST hier `42703`.
 */
export const COMMITMENT_KOLOMMEN: string =
  'id, goal_id, type, body, image_url, beneficiary_group_id, beneficiary_user_id, status, confirmed_at, created_at, periode_start';
