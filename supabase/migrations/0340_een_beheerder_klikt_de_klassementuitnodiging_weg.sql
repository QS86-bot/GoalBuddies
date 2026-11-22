-- 0340_een_beheerder_klikt_de_klassementuitnodiging_weg.sql — QS8-784 (A57, P3 c): de uitnodigingskaart per beheerder wegklikken
--
-- ⚠️ Nummer 0340 op sein van de hoofdorchestrator (22-11-2026): 0338 (QS8-666 3c-db) en 0339 (QS8-787) landen eerst.
--
-- ROLLBACK-PAD (de tabel is bij het landen leeg; daarna staan er alleen weergavevoorkeuren in, die bij een rollback
-- verloren gaan: elke beheerder ziet de kaart dan weer. Geen gebruikersdata van waarde, maar wel eerst `pg_dump`):
--   drop trigger if exists groups_klassementuitnodiging_terug on public.groups;
--   drop function if exists public.klassementuitnodiging_terug();
--   drop table if exists public.klassement_uitnodiging_weg;
--
-- ---------------------------------------------------------------------------
-- Wat dit doet
-- ---------------------------------------------------------------------------
--
-- De uitnodigingskaart "Zet het klassement aan" (QS8-666 deel 3b-2, `KlassementUitnodiging`) krijgt een knop om hem
-- weg te klikken. Besluit P3 c: **per beheerder**, en alleen de eigen rij leesbaar en schrijfbaar: een beheerder ziet
-- niet wie van de andere beheerders de kaart wegklikte (domeinregel 7). Besluit Quinten 22-11-2026 (QS8-784): **de kaart
-- komt terug na aan → uit**: zet iemand het klassement aan en daarna weer uit, dan ziet elke beheerder hem opnieuw.
--
-- ⚠️ **Een eigen tabel en geen kolom op `group_members`.** Die rij is voor groepsgenoten leesbaar onder de bestaande
--    policy, en RLS kan geen kolommen beperken: een kolom daar is een kolomgrant of een view verder van een lek.
--    Hier is de rij de eenheid van toegang, en de vier policies zeggen alle vier `user_id = auth.uid()`.
--
-- ⚠️ **"Terug na aan → uit" is een trigger op `groups` en niet een regel in `zet_groepsklassement()`.** 📏 Gemeten op
--    main 42beea69 (`grep -n 'klassement_aan *[:=]' supabase/migrations/*.sql`): drie routes zetten de kolom bij een
--    bestaande groep om: `zet_groepsklassement()` (0336, beide kanten), `zet_groepszichtbaarheid()` naar open (0333,
--    zet hem aan, besluit 45) en `zet_groepsontdekbaarheid()` (0336, zet hem uit). Een reset in alleen
--    `zet_groepsklassement()` mist "open maken → weer uit": de kaart bleef dan weg terwijl het klassement er tussendoor
--    wél was. De trigger wist bij elke overgang **uit → aan**, langs welke route ook; de kaart staat alleen bij
--    "uit", dus de volgende "uit" toont hem aan iedereen. Geen herdefinitie van een bestaande functie, dus geen
--    registerdrift met een andere tak.
--
-- ⚠️ **De trigger wist bij élke wissel van de kolom, niet alleen bij uit → aan** (spec-planner, QS8-784). De
--    INSERT-policy weigert een wegklik bij "aan", maar een beheerder met een verouderd scherm kan net vóór een wissel
--    naar "aan" schrijven; zijn rij moet dan de volgende "uit" niet overleven. Wissen bij aan → uit dekt dat; wissen bij
--    uit → aan is waar het besluit om vraagt. Beide samen kosten niets: er staat alleen iets bij "uit".
--
-- ⚠️ **De trigger is géén `security definer`.** Elke schrijver van `klassement_aan` is een definer-RPC met de
--    tabeleigenaar als `current_user`, of `service_role`; beide slaan RLS over (geen FORCE RLS). `authenticated` kan de
--    kolom niet wijzigen (kolomrevoke 0333 en `pin_groepsklassement()`). Komt er ooit een invoker-pad naar de kolom bij,
--    dan wist de trigger alleen de eigen rij en blijft de kaart voor anderen weg: dan hoort hij definer te worden.
--
-- ⚠️ **De foreign key wijst naar `group_members (group_id, user_id)`**, zelfde vorm als `groep_demping` (0305): wie de
--    groep verlaat of zijn account verwijdert, neemt zijn rij mee, en `verwijder_mijn_account()` hoeft niet te veranderen.
--
-- ⚠️ **Wegklikken mag alleen bij "uit"** (de `with check` van INSERT). Een rij die bij "aan" wordt neergezet,
--    overleeft de wissel naar "uit" en zou de kaart verbergen terwijl de overgang aan → uit er wél was.
--
-- ⚠️ **Wat dit níet is:** geen grens. De kaart is een weergavehint; `zet_groepsklassement()` beslist. Een rij hier zet
--    niets aan of uit en is voor niemand behalve de eigenaar zichtbaar.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. De tabel
-- ---------------------------------------------------------------------------

-- De PK (user_id, group_id) is één rij per paar en de index op de leeskant; de tweede index dekt de FK (regel 11) en
-- het wissen per groep in de trigger.
create table if not exists public.klassement_uitnodiging_weg (
  user_id       uuid        not null,
  group_id      uuid        not null,
  weggeklikt_op timestamptz not null default now(),

  primary key (user_id, group_id),
  constraint klassement_uitnodiging_weg_lid_van_groep
    foreign key (group_id, user_id)
    references public.group_members (group_id, user_id)
    on delete cascade
);

create index if not exists klassement_uitnodiging_weg_groep_idx
  on public.klassement_uitnodiging_weg (group_id, user_id);

comment on table public.klassement_uitnodiging_weg is
  'Welke beheerder de uitnodigingskaart van het klassement in welke groep wegklikte (QS8-784, A57 P3 c). Alleen de '
  'eigen rij is leesbaar en schrijfbaar. De rijen van een groep verdwijnen bij elke wissel van groups.klassement_aan '
  '(trigger groups_klassementuitnodiging_terug), zodat de kaart na aan → uit voor iedereen terugkomt.';

alter table public.klassement_uitnodiging_weg enable row level security;

-- ⚠️ Elke policy is `user_id = (select auth.uid())`, zonder groepstak, ook niet voor een andere beheerder: "wie klikte
--    weg" is nooit iets dat een ander mag afleiden (P3 c, domeinregel 7).
-- ⚠️ De INSERT eist een actieve beheerder van díé groep en een klassement dat uit staat (zie de kop). De policy weigert
--    per rij vóór het schrijven (42501); de FK zou pas aan het eind van het statement weigeren.
-- ⚠️ UPDATE en DELETE dragen `is_group_member()`: `archiefleesgat()` (0153) eist een archieftoets op elke schrijvende
--    policy. Een oud-lid kan zijn rij dus niet wissen; de cascade doet dat bij het vertrek al.
drop policy if exists klassement_uitnodiging_weg_select on public.klassement_uitnodiging_weg;
create policy klassement_uitnodiging_weg_select on public.klassement_uitnodiging_weg
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists klassement_uitnodiging_weg_insert on public.klassement_uitnodiging_weg;
create policy klassement_uitnodiging_weg_insert on public.klassement_uitnodiging_weg
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_group_admin(group_id)
    and exists (
      select 1 from public.groups g
      where g.id = group_id
        and not g.klassement_aan
        -- Dezelfde poort als het scherm (`kanKlassementZetten`): een teamgroep en een automatisch gevormde groep tonen de
        -- kaart nooit, dus daar valt niets weg te klikken (security-review QS8-784, laag; de database spiegelt de hint).
        and g.organization_id is null
        and not g.automatisch
    )
  );

drop policy if exists klassement_uitnodiging_weg_update on public.klassement_uitnodiging_weg;
create policy klassement_uitnodiging_weg_update on public.klassement_uitnodiging_weg
  for update to authenticated
  using (user_id = (select auth.uid()) and public.is_group_member(group_id))
  with check (user_id = (select auth.uid()) and public.is_group_member(group_id));

drop policy if exists klassement_uitnodiging_weg_delete on public.klassement_uitnodiging_weg;
create policy klassement_uitnodiging_weg_delete on public.klassement_uitnodiging_weg
  for delete to authenticated
  using (user_id = (select auth.uid()) and public.is_group_member(group_id));

-- ⚠️ Regel 4: `authenticated` met zoveel woorden. `weggeklikt_op` staat in geen grant: de database zet het moment.
--    Geen UPDATE-grant: er valt niets te wijzigen.
revoke all on table public.klassement_uitnodiging_weg from public, anon, authenticated;
grant select on table public.klassement_uitnodiging_weg to authenticated;
grant insert (user_id, group_id) on table public.klassement_uitnodiging_weg to authenticated;
grant delete on table public.klassement_uitnodiging_weg to authenticated;

-- ---------------------------------------------------------------------------
-- 2. De kaart komt terug na aan → uit
-- ---------------------------------------------------------------------------

create or replace function public.klassementuitnodiging_terug()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  delete from public.klassement_uitnodiging_weg w where w.group_id = new.id;
  return null;
end;
$$;

revoke all on function public.klassementuitnodiging_terug() from public, anon, authenticated;

drop trigger if exists groups_klassementuitnodiging_terug on public.groups;
create trigger groups_klassementuitnodiging_terug
  after update of klassement_aan on public.groups
  for each row
  when (old.klassement_aan is distinct from new.klassement_aan)
  execute function public.klassementuitnodiging_terug();
