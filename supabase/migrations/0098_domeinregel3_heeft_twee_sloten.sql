-- 0098_domeinregel3_heeft_twee_sloten.sql — de bewaking op peer-goedkeuring
--
-- ROLLBACK-PAD:
--   drop function if exists public.domeinregel3_bewaking();
--
-- ---------------------------------------------------------------------------
-- Wat er mis was
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Domeinregel 3 eist twee sloten en er stond er maar één onder test.**
--    CLAUDE.md: *"Alleen een lid van dezelfde buddy-groep mag een voltooiing
--    goedkeuren. Nooit jezelf. Afgedwongen in RLS **én** met een
--    database-constraint, niet alleen in de UI. Test dit expliciet."*
--
--    De constraint (`completion_approvals_not_self`) en de trigger die hem
--    voedt (`fill_approval_subject()`) zijn getest en werken. De RLS-helft —
--    de clausule `c.user_id <> auth.uid()` in `completion_approvals_insert` —
--    was vanuit een client niet los te toetsen: Postgres draait
--    `before insert`-triggers vóór de RLS `with check`, dus de trigger en de
--    CHECK gooien altijd als eerste.
--
-- ⚠️ **Gemeten op 27-08-2026 in plaats van beredeneerd.** Op de lokale stack is
--    de clausule uit de policy gehaald en daarna draaide de héle RLS-suite:
--
--      24 bestanden, 428 tests, alles groen — met het RLS-slot eruit.
--
--    Het gedrag bleef namelijk goed: de gebruiker komt er nog steeds niet
--    doorheen, want de constraint vangt hem. Maar de dúbbele beveiliging die
--    domeinregel 3 met zoveel woorden eist, was daarmee een enkele geworden, en
--    niets zou dat gemeld hebben.
--
-- ⚠️ **Dit is de vorm van regel 18, vraag 3:** kan deze test groen blijven
--    terwijl de belofte breekt? Hier was het antwoord ja, en dat is precies
--    waarom de belofte een eigen bewaking nodig heeft in plaats van nog een
--    gedragstest die hetzelfde onderste slot raakt.
--
-- ⚠️ **Wat deze functie wél en niet doet.** Hij toetst dat de twee sloten
--    bestáán — de clausule in de policy, de CHECK, en de trigger die de
--    gedenormaliseerde kolom vult. Hij toetst niet dat ze het juiste doen; dat
--    doen de gedragstests in `tests/rls/policies.test.ts`. De twee samen dekken
--    de belofte: die tests bewijzen dat de deur dicht is, deze functie bewijst
--    dat er twee sloten op zitten.

create or replace function domeinregel3_bewaking()
returns table(slot text, ontbreekt text)
language sql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $$
  -- 1. De RLS-helft: de clausule die de eigenaar buiten de deur houdt.
  select 'rls'::text,
         'completion_approvals_insert mist de clausule c.user_id <> auth.uid()'::text
  where not exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relname = 'completion_approvals'
      and p.polname = 'completion_approvals_insert'
      and pg_get_expr(p.polwithcheck, p.polrelid) like '%user_id <> auth.uid()%'
  )

  union all

  -- 2. De constraint-helft, op de gedenormaliseerde kolom.
  select 'constraint'::text,
         'completion_approvals_not_self bestaat niet meer'::text
  where not exists (
    select 1 from pg_constraint
    where conrelid = 'public.completion_approvals'::regclass
      and conname = 'completion_approvals_not_self'
      and contype = 'c'
  )

  union all

  -- 3. De trigger die die kolom vult. Zonder hem is de CHECK te omzeilen door
  --    een gelogen `subject_id` mee te sturen, en dan is slot 2 een sierhek.
  select 'trigger'::text,
         'completion_approvals_subject bestaat niet meer'::text
  where not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.completion_approvals'::regclass
      and tgname = 'completion_approvals_subject'
      and not tgisinternal
  );
$$;

comment on function domeinregel3_bewaking() is
  'De twee sloten van domeinregel 3 op peer-goedkeuring: de RLS-clausule, de '
  'CHECK op de gedenormaliseerde subject_id, en de trigger die die kolom vult. '
  'Hoort leeg te zijn. De RLS-helft is vanuit een client niet los te toetsen — '
  'triggers draaien vóór de with check — dus zonder deze functie kan hij '
  'verdwijnen zonder dat één test rood wordt. Zie migratie 0098 en '
  'tests/rls/domeinregel3.test.ts.';

revoke all on function domeinregel3_bewaking() from public, anon, authenticated;
grant execute on function domeinregel3_bewaking() to service_role;
