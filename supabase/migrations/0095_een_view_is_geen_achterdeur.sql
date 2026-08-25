-- 0095_een_view_is_geen_achterdeur.sql — een RLS-bypass via `mijn_profiel`
--
-- ROLLBACK-PAD:
--   grant insert, update, delete, references on public.mijn_profiel to anon, authenticated;
--   grant insert, update, delete, references on public.group_visible_streaks to anon, authenticated;
--   grant insert, update, delete, references on public.goal_dashboard to anon, authenticated;
--   alter function public.commitment_zichtbaar_voor_groep() reset search_path;
--   drop function if exists public.viewrechten_bewaking();
--
-- ⚠️ Terugrollen zet de bypass hieronder weer open. Doe het niet zonder reden.
--
-- ---------------------------------------------------------------------------
-- Wat er mis was
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`mijn_profiel` was een achterdeur om RLS heen, en dat is bewezen en niet
--    beredeneerd.** De view is auto-updatable (een simpele `select p.* from
--    profiles p where p.id = auth.uid()`), draait met `security_invoker=false`
--    — dus met de rechten van zijn eigenaar `postgres` — en `authenticated` had
--    er INSERT, UPDATE én DELETE op. Geen enkele migratie gaf die rechten: ze
--    komen uit de standaardrechten van Supabase (`alter default privileges ...
--    grant all on tables to anon, authenticated`), en die gelden ook voor views.
--
--    Gemeten op de lokale stack, in een transactie die teruggedraaid is:
--
--      set local role authenticated;
--      delete from public.profiles      where id = <eigen id>;   -- DELETE 0
--      delete from public.mijn_profiel  where id = <eigen id>;   -- DELETE 1
--
--    Rechtstreeks weigert RLS; via de view gaat de rij weg. `profiles` heeft
--    geen DELETE-policy, en `relforcerowsecurity` staat op geen enkele tabel
--    aan, dus als eigenaar geldt er niets.
--
-- ⚠️ **De schade is niet één rij.** Dertien tabellen hangen met `on delete
--    cascade` aan `profiles`: `goals`, `completions`, `points_ledger`,
--    `group_members`, `user_streaks`, `week_pass_events`, `breathers`,
--    `ai_jobs`, `push_tokens` en meer. Eén verzoek wist dus de hele
--    geschiedenis van een gebruiker — inclusief `points_ledger` en
--    `completions`, die volgens domeinregel 6 append-only zijn en alleen via een
--    correctie-record rechtgezet mogen worden. En omdat `group_members`
--    meecascadeert, verandert het ook wat ánderen in hun groep zien.
--
--    Niemand kan hiermee bij de rij van een ander: de `where` van de view
--    beperkt de zichtbare rijen tot je eigen id. Het is een zelfvernietiging
--    zonder bevestiging, langs een pad dat de policies uitdrukkelijk dichthouden.
--
-- ⚠️ `group_visible_streaks` is niet auto-updatable, dus daar was het inert.
--    `goal_dashboard` draait met `security_invoker=true`, dus daar geldt RLS wél.
--    Alle drie gaan ze toch dicht: een view is een leesvorm, en het verschil
--    tussen "inert" en "een gat" is één `INSTEAD OF`-trigger of één `alter view`.
--
-- Gevonden op 25-08-2026 bij het nameten van QS8-134, waar een reviewer de
-- overbodige grants opmerkte en ze "pre-existent en inert" noemde. Dat gold voor
-- die view; voor `mijn_profiel` niet.

-- ---------------------------------------------------------------------------
-- 1. De deur dicht
-- ---------------------------------------------------------------------------

revoke insert, update, delete, references on public.mijn_profiel from anon, authenticated;
revoke insert, update, delete, references on public.group_visible_streaks from anon, authenticated;
revoke insert, update, delete, references on public.goal_dashboard from anon, authenticated;

-- ⚠️ `service_role` houdt wat het had. Die rol heeft BYPASSRLS en draait alleen
--    in de Edge Functions; hem hier beperken suggereert een bescherming die er
--    niet is.

-- ---------------------------------------------------------------------------
-- 2. Zodat het niet stil terugkomt
-- ---------------------------------------------------------------------------
--
-- ⚠️ De standaardrechten van Supabase blijven staan — voor tábellen zijn ze het
--    hele model (grants plus RLS), en ze zijn niet per objecttype te splitsen:
--    `alter default privileges ... on tables` dekt views mee. Élke nieuwe view
--    krijgt dus opnieuw schrijfrechten. Vandaar een bewaking in plaats van een
--    instelling, in dezelfde vorm als `realtime_bewaking()` uit 0027: een
--    functie die de stand teruggeeft, zodat de RLS-suite hem kan toetsen.

create or replace function viewrechten_bewaking()
returns table(view_naam text, rol text, recht text)
language sql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $$
  select c.relname::text, a.grantee::text, a.privilege_type::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
  join lateral (
    select pg_get_userbyid(x.grantee) as grantee,
           x.privilege_type::text     as privilege_type
  ) a on true
  where n.nspname = 'public'
    and c.relkind = 'v'
    and a.grantee in ('anon', 'authenticated')
    and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'REFERENCES')
  order by 1, 2, 3;
$$;

comment on function viewrechten_bewaking() is
  'Views in public waar anon of authenticated meer dan lezen mag. Hoort leeg te '
  'zijn: een view die met de rechten van zijn eigenaar draait en beschrijfbaar '
  'is, gaat om RLS heen. Zie migratie 0095 en tests/rls/viewrechten.test.ts.';

revoke all on function viewrechten_bewaking() from public, anon, authenticated;
grant execute on function viewrechten_bewaking() to service_role;

-- ---------------------------------------------------------------------------
-- 3. De laatste functie zonder zoekpad
-- ---------------------------------------------------------------------------
--
-- ⚠️ `commitment_zichtbaar_voor_groep()` was de enige van 103 functies zonder
--    `search_path`, en de Supabase-advisor meldt hem al een tijd. Vandaag is het
--    een stijlkwestie — de functie is SECURITY INVOKER, dus er valt niets te
--    escaleren — maar hij is de enige uitzondering op een patroon dat alle
--    andere functies wél volgen, en de dag dat iemand er DEFINER van maakt is
--    het de klassieke zoekpad-val. Zie de rij van 25-08 in ENGINEER-REVIEW.

alter function public.commitment_zichtbaar_voor_groep() set search_path = public, pg_temp;
