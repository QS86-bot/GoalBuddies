-- 0121_auth_uid_een_keer_per_query.sql — 49 policies naar de InitPlan-vorm
--
-- ROLLBACK-PAD:
--   Elke policy hieronder terug naar de kale vorm: vervang in elke `using` en
--   `with check` de tekst `( SELECT auth.uid() AS uid )` door `auth.uid()`, en
--   speel de `drop policy` / `create policy`-paren opnieuw af. De uitdrukkingen
--   zijn verder letterlijk gelijk — dat is gemeten, zie hieronder.
--   drop function if exists public.initplan_bewaking();
--   drop function if exists public.is_kale_auth_uid(text);
--   drop function if exists public.zonder_initplan_hijs(text);
--   domeinregel3_bewaking() terug naar de versie van 0093.
--
-- ---------------------------------------------------------------------------
-- Wat dit is
-- ---------------------------------------------------------------------------
--
-- Bevinding 3 van de controleronde van 28-08. **49 policies over 30 tabellen
-- roepen `auth.uid()` kaal aan**, en nul van de 49 gebruikte de subselectvorm.
-- Supabase' eigen linter noemt dit `auth_rls_initplan`.
--
-- `auth.uid()` is geen goedkope functie: hij is
-- `coalesce(current_setting('request.jwt.claim.sub'), (current_setting('request.jwt.claims')::jsonb ->> 'sub'))::uuid`.
-- Kaal in een policy komt die hele keten in het rij-filter terecht en draait hij
-- één keer per gescande rij. `(select auth.uid())` maakt er een InitPlan van:
-- één keer per query, en het filter wordt `user_id = $0`.
--
-- ---------------------------------------------------------------------------
-- ⚠️ Hoe groot het verschil is, en wanneer het nul is
-- ---------------------------------------------------------------------------
--
-- Gemeten op een echte Postgres 16, 500.000 rijen, dezelfde policyvorm
-- (`user_id = <uid>`), als `authenticated` met een echt JWT-claim:
--
-- | Vorm | Zonder index op de kolom | Mét index |
-- |---|---|---|
-- | `auth.uid()`          | Seq Scan, **633 ms** | Bitmap Index Scan, 2,3 ms |
-- | `(select auth.uid())` | Seq Scan, **41 ms**  | 2,0 ms |
--
-- ⚠️ **De tweede kolom is het eerlijke deel van dit verhaal en stond niet in de
--    bevinding.** `auth.uid()` is `stable`, dus voor een indexzoekopdracht rekent
--    Postgres hem sowieso één keer uit — daar wint de hijs niets. Het verschil
--    van vijftien keer verschijnt pas bij een **sequentiële scan**, en dat is
--    precies waar onwrikbare regel 11 al over gaat.
--
--    Dit is dus geen brand. Het is: nooit langzamer, soms vijftien keer sneller,
--    en het haalt een waarschuwing weg die je anders went te negeren.
--
-- ⚠️ Er is een tweede verschil dat in het plan te zien is en dat verder reikt dan
--    één scan: de rijschatting. Kaal schatte de planner 433 rijen, gehesen 1. Bij
--    een join bepaalt zo'n schatting de plankeuze, en dan gaat het niet meer over
--    milliseconden op één tabel.
--
-- ---------------------------------------------------------------------------
-- ⚠️ Waarom dit veilig is, en hoe dat gemeten is en niet beredeneerd
-- ---------------------------------------------------------------------------
--
-- Negenenveertig policies herschrijven is negenenveertig kansen op een
-- overtikfout in een autorisatieregel. De uitdrukkingen hieronder zijn daarom
-- **niet met de hand overgetypt** maar uit `pg_get_expr()` gegenereerd, met één
-- tekstvervanging: een kale `auth.uid()` wordt `( select auth.uid() )`.
--
-- En daarna nagemeten. Alle **73** policies in `public` zijn vóór en ná
-- vastgelegd (tabel, naam, opdracht, permissief, rollen, `using`, `with check`).
-- In de ná-opname is de subselectverpakking weggenormaliseerd, en toen was het
-- resultaat **byte voor byte gelijk** aan de vóór-opname: 59 uitdrukkingen
-- veranderd, **nul** semantische verschillen. `tests/rls/initplan.test.ts` legt
-- die eigenschap vast voor de toekomst.
--
-- ⚠️ De 24 policies die géén `auth.uid()` noemen zijn niet aangeraakt. Ze staan
--    wél in de vergelijking, want een migratie die per ongeluk iets anders sloopt
--    hoort daar zichtbaar te worden.
--
-- ---------------------------------------------------------------------------
-- De 49 policies
-- ---------------------------------------------------------------------------

drop policy if exists ai_jobs_select on public.ai_jobs;
create policy ai_jobs_select on public.ai_jobs
  for select to authenticated
  using ((user_id = ( select auth.uid() )))
  ;

drop policy if exists approval_withdrawals_select on public.approval_withdrawals;
create policy approval_withdrawals_select on public.approval_withdrawals
  for select to authenticated
  using (((approver_id = ( select auth.uid() )) OR (EXISTS ( SELECT 1
   FROM ((completions c
     JOIN weekly_goals w ON ((w.id = c.weekly_goal_id)))
     JOIN goals g ON ((g.id = w.goal_id)))
  WHERE ((c.id = approval_withdrawals.completion_id) AND (g.owner_id = ( select auth.uid() )))))))
  ;

drop policy if exists badges_select on public.badges;
create policy badges_select on public.badges
  for select to authenticated
  using ((user_id = ( select auth.uid() )))
  ;

drop policy if exists breathers_select on public.breathers;
create policy breathers_select on public.breathers
  for select to authenticated
  using (((user_id = ( select auth.uid() )) OR (EXISTS ( SELECT 1
   FROM goals g
  WHERE ((g.id = breathers.goal_id) AND shares_group_with_goal(g.id))))))
  ;

drop policy if exists chain_links_select on public.chain_links;
-- ⚠️ **Deze ene is met de hand bijgewerkt en niet gegenereerd, en dat is de
--    reden dat dit bestand 0121 heet en geen 0119.** De generatie liep tegen de
--    stand van vóór 0120; die migratie laat het kettingvenster op de klok van de
--    groep tellen (`groepsdatum(group_id)`) in plaats van in UTC. De gegenereerde
--    versie zou `current_date` hebben teruggezet en dat werk stil ongedaan
--    hebben gemaakt — mét een groene bewaking op de InitPlan-vorm, want die kijkt naar
--    de vórm en niet naar de betekenis.
--
--    Gevonden door na het mergen van `main` de twee bestanden naast elkaar te
--    leggen. Dit is dus de uitzondering op "niet overgetypt": hier is de
--    uitdrukking uit 0120 overgenomen en alleen `auth.uid()` gehesen.
create policy chain_links_select on public.chain_links
  for select to authenticated
  using (
    user_id = ( select auth.uid() )
    or (is_group_member(group_id) and group_period_start >= groepsdatum(group_id) - 6)
    or lid_van_open_groep(group_id)
  )
  ;

drop policy if exists chat_messages_delete on public.chat_messages;
create policy chat_messages_delete on public.chat_messages
  for delete to authenticated
  using ((sender_id = ( select auth.uid() )))
  ;

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
  for insert to authenticated
  with check (((sender_id = ( select auth.uid() )) AND is_group_member(group_id) AND (type <> 'system'::text) AND (system_event IS NULL) AND (berichten_over() > 0)))
  ;

drop policy if exists chat_messages_update on public.chat_messages;
create policy chat_messages_update on public.chat_messages
  for update to authenticated
  using (((sender_id = ( select auth.uid() )) AND (created_at > (now() - '00:15:00'::interval))))
  with check (((sender_id = ( select auth.uid() )) AND is_group_member(group_id) AND (type <> 'system'::text) AND (system_event IS NULL)))
  ;

drop policy if exists commitment_events_select on public.commitment_events;
create policy commitment_events_select on public.commitment_events
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM commitments c
  WHERE ((c.id = commitment_events.commitment_id) AND (EXISTS ( SELECT 1
           FROM goals g
          WHERE ((g.id = c.goal_id) AND (g.owner_id = ( select auth.uid() )))))))))
  ;

drop policy if exists commitments_insert on public.commitments;
create policy commitments_insert on public.commitments
  for insert to authenticated
  with check (((EXISTS ( SELECT 1
   FROM goals g
  WHERE ((g.id = commitments.goal_id) AND (g.owner_id = ( select auth.uid() ))))) AND (status = 'set'::text) AND ((beneficiary_group_id IS NULL) OR is_group_member(beneficiary_group_id))))
  ;

drop policy if exists commitments_select on public.commitments;
create policy commitments_select on public.commitments
  for select to authenticated
  using (((EXISTS ( SELECT 1
   FROM goals g
  WHERE ((g.id = commitments.goal_id) AND (g.owner_id = ( select auth.uid() ))))) OR ((beneficiary_group_id IS NOT NULL) AND (status = ANY (commitment_zichtbaar_voor_groep())) AND is_group_member(beneficiary_group_id))))
  ;

drop policy if exists commitments_update on public.commitments;
create policy commitments_update on public.commitments
  for update to authenticated
  using (((status = 'set'::text) AND (EXISTS ( SELECT 1
   FROM goals g
  WHERE ((g.id = commitments.goal_id) AND (g.owner_id = ( select auth.uid() )))))))
  with check (((status = ANY (ARRAY['set'::text, 'cancelled'::text])) AND (EXISTS ( SELECT 1
   FROM goals g
  WHERE ((g.id = commitments.goal_id) AND (g.owner_id = ( select auth.uid() )))))))
  ;

drop policy if exists completion_approval_rules_select on public.completion_approval_rules;
create policy completion_approval_rules_select on public.completion_approval_rules
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM ((completions c
     JOIN weekly_goals w ON ((w.id = c.weekly_goal_id)))
     JOIN goals g ON ((g.id = w.goal_id)))
  WHERE ((c.id = completion_approval_rules.completion_id) AND ((g.owner_id = ( select auth.uid() )) OR shares_group_with_goal(g.id))))))
  ;

drop policy if exists completion_approvals_insert on public.completion_approvals;
create policy completion_approvals_insert on public.completion_approvals
  for insert to authenticated
  with check (((approver_id = ( select auth.uid() )) AND (EXISTS ( SELECT 1
   FROM group_members m
  WHERE ((m.group_id = completion_approvals.group_id) AND (m.user_id = ( select auth.uid() )) AND (m.status <> 'inactive'::text)))) AND (EXISTS ( SELECT 1
   FROM ((completions c
     JOIN weekly_goals w ON ((w.id = c.weekly_goal_id)))
     JOIN goal_group_links l ON ((l.goal_id = w.goal_id)))
  WHERE ((c.id = completion_approvals.completion_id) AND (l.group_id = completion_approvals.group_id) AND (c.user_id <> ( select auth.uid() )) AND (c.superseded_by IS NULL))))))
  ;

drop policy if exists completion_approvals_select on public.completion_approvals;
create policy completion_approvals_select on public.completion_approvals
  for select to authenticated
  using (((approver_id = ( select auth.uid() )) OR (subject_id = ( select auth.uid() ))))
  ;

drop policy if exists completions_insert on public.completions;
create policy completions_insert on public.completions
  for insert to authenticated
  with check (((user_id = ( select auth.uid() )) AND (EXISTS ( SELECT 1
   FROM (weekly_goals w
     JOIN goals g ON ((g.id = w.goal_id)))
  WHERE ((w.id = completions.weekly_goal_id) AND (g.owner_id = ( select auth.uid() )))))))
  ;

drop policy if exists completions_select on public.completions;
create policy completions_select on public.completions
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM (weekly_goals w
     JOIN goals g ON ((g.id = w.goal_id)))
  WHERE ((w.id = completions.weekly_goal_id) AND ((g.owner_id = ( select auth.uid() )) OR shares_group_with_goal(g.id))))))
  ;

drop policy if exists daily_moves_select on public.daily_moves;
create policy daily_moves_select on public.daily_moves
  for select to authenticated
  using (((user_id = ( select auth.uid() )) OR ((visibility = 'group'::text) AND (weekly_goal_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM weekly_goals w
  WHERE ((w.id = daily_moves.weekly_goal_id) AND shares_group_with_goal(w.goal_id)))))))
  ;

drop policy if exists daily_moves_write on public.daily_moves;
create policy daily_moves_write on public.daily_moves
  for all to authenticated
  using ((user_id = ( select auth.uid() )))
  with check (((user_id = ( select auth.uid() )) AND ((weekly_goal_id IS NULL) OR (EXISTS ( SELECT 1
   FROM (weekly_goals w
     JOIN goals g ON ((g.id = w.goal_id)))
  WHERE ((w.id = daily_moves.weekly_goal_id) AND (g.owner_id = ( select auth.uid() ))))))))
  ;

drop policy if exists deadline_requests_select on public.deadline_requests;
create policy deadline_requests_select on public.deadline_requests
  for select to authenticated
  using (((requester_id = ( select auth.uid() )) OR is_group_member(group_id)))
  ;

drop policy if exists goal_events_insert on public.goal_events;
create policy goal_events_insert on public.goal_events
  for insert to authenticated
  with check (((actor_id = ( select auth.uid() )) AND (EXISTS ( SELECT 1
   FROM goals g
  WHERE ((g.id = goal_events.goal_id) AND (g.owner_id = ( select auth.uid() ))))) AND (event_type = ANY (ARRAY['created'::text, 'archived'::text, 'completed'::text]))))
  ;

drop policy if exists goal_events_select on public.goal_events;
create policy goal_events_select on public.goal_events
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM goals g
  WHERE ((g.id = goal_events.goal_id) AND ((g.owner_id = ( select auth.uid() )) OR shares_group_with_goal(g.id))))))
  ;

drop policy if exists goal_group_links_delete on public.goal_group_links;
create policy goal_group_links_delete on public.goal_group_links
  for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM goals g
  WHERE ((g.id = goal_group_links.goal_id) AND (g.owner_id = ( select auth.uid() ))))))
  ;

drop policy if exists goal_group_links_insert on public.goal_group_links;
create policy goal_group_links_insert on public.goal_group_links
  for insert to authenticated
  with check ((is_group_member(group_id) AND (EXISTS ( SELECT 1
   FROM goals g
  WHERE ((g.id = goal_group_links.goal_id) AND (g.owner_id = ( select auth.uid() )))))))
  ;

drop policy if exists goal_interviews_all on public.goal_interviews;
create policy goal_interviews_all on public.goal_interviews
  for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM goals g
  WHERE ((g.id = goal_interviews.goal_id) AND (g.owner_id = ( select auth.uid() ))))))
  with check ((EXISTS ( SELECT 1
   FROM goals g
  WHERE ((g.id = goal_interviews.goal_id) AND (g.owner_id = ( select auth.uid() ))))))
  ;

drop policy if exists goal_risk_select on public.goal_risk;
create policy goal_risk_select on public.goal_risk
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM goals g
  WHERE ((g.id = goal_risk.goal_id) AND (g.owner_id = ( select auth.uid() ))))))
  ;

drop policy if exists goals_insert on public.goals;
create policy goals_insert on public.goals
  for insert to authenticated
  with check ((owner_id = ( select auth.uid() )))
  ;

drop policy if exists goals_select on public.goals;
create policy goals_select on public.goals
  for select to authenticated
  using (((owner_id = ( select auth.uid() )) OR shares_group_with_goal(id)))
  ;

drop policy if exists goals_update on public.goals;
create policy goals_update on public.goals
  for update to authenticated
  using ((owner_id = ( select auth.uid() )))
  with check ((owner_id = ( select auth.uid() )))
  ;

drop policy if exists group_members_insert_founder on public.group_members;
create policy group_members_insert_founder on public.group_members
  for insert to authenticated
  with check (((user_id = ( select auth.uid() )) AND (EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_members.group_id) AND (g.created_by = ( select auth.uid() )))))))
  ;

drop policy if exists group_members_update on public.group_members;
create policy group_members_update on public.group_members
  for update to authenticated
  using (((user_id = ( select auth.uid() )) OR is_group_admin(group_id)))
  with check (((user_id = ( select auth.uid() )) OR is_group_admin(group_id)))
  ;

drop policy if exists milestone_tips_select on public.milestone_tips;
create policy milestone_tips_select on public.milestone_tips
  for select to authenticated
  using ((user_id = ( select auth.uid() )))
  ;

drop policy if exists milestones_select on public.milestones;
create policy milestones_select on public.milestones
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM goals g
  WHERE ((g.id = milestones.goal_id) AND ((g.owner_id = ( select auth.uid() )) OR shares_group_with_goal(g.id))))))
  ;

drop policy if exists milestones_write on public.milestones;
create policy milestones_write on public.milestones
  for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM goals g
  WHERE ((g.id = milestones.goal_id) AND (g.owner_id = ( select auth.uid() ))))))
  with check ((EXISTS ( SELECT 1
   FROM goals g
  WHERE ((g.id = milestones.goal_id) AND (g.owner_id = ( select auth.uid() ))))))
  ;

drop policy if exists notifications_sent_select on public.notifications_sent;
create policy notifications_sent_select on public.notifications_sent
  for select to authenticated
  using ((user_id = ( select auth.uid() )))
  ;

drop policy if exists points_ledger_select on public.points_ledger;
create policy points_ledger_select on public.points_ledger
  for select to authenticated
  using ((user_id = ( select auth.uid() )))
  ;

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check ((id = ( select auth.uid() )))
  ;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (((id = ( select auth.uid() )) OR shares_group_with_user(id)))
  ;

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using ((id = ( select auth.uid() )))
  with check ((id = ( select auth.uid() )))
  ;

drop policy if exists push_tokens_delete on public.push_tokens;
create policy push_tokens_delete on public.push_tokens
  for delete to authenticated
  using ((user_id = ( select auth.uid() )))
  ;

drop policy if exists push_tokens_select on public.push_tokens;
create policy push_tokens_select on public.push_tokens
  for select to authenticated
  using ((user_id = ( select auth.uid() )))
  ;

drop policy if exists user_streaks_select on public.user_streaks;
create policy user_streaks_select on public.user_streaks
  for select to authenticated
  using ((user_id = ( select auth.uid() )))
  ;

drop policy if exists week_pass_events_select on public.week_pass_events;
create policy week_pass_events_select on public.week_pass_events
  for select to authenticated
  using ((user_id = ( select auth.uid() )))
  ;

drop policy if exists week_review_replies_delete on public.week_review_replies;
create policy week_review_replies_delete on public.week_review_replies
  for delete to authenticated
  using ((author_id = ( select auth.uid() )))
  ;

drop policy if exists week_review_replies_insert on public.week_review_replies;
create policy week_review_replies_insert on public.week_review_replies
  for insert to authenticated
  with check (((author_id = ( select auth.uid() )) AND (EXISTS ( SELECT 1
   FROM week_reviews r
  WHERE ((r.id = week_review_replies.week_review_id) AND is_group_member(r.group_id)))) AND (weekreacties_over() > 0)))
  ;

drop policy if exists week_reviews_write on public.week_reviews;
create policy week_reviews_write on public.week_reviews
  for all to authenticated
  using ((user_id = ( select auth.uid() )))
  with check (((user_id = ( select auth.uid() )) AND is_group_member(group_id)))
  ;

drop policy if exists weekly_goals_insert on public.weekly_goals;
create policy weekly_goals_insert on public.weekly_goals
  for insert to authenticated
  with check (((EXISTS ( SELECT 1
   FROM goals g
  WHERE ((g.id = weekly_goals.goal_id) AND (g.owner_id = ( select auth.uid() ))))) AND (weekdoelen_over() > 0)))
  ;

drop policy if exists weekly_goals_select on public.weekly_goals;
create policy weekly_goals_select on public.weekly_goals
  for select to authenticated
  using (((EXISTS ( SELECT 1
   FROM goals g
  WHERE ((g.id = weekly_goals.goal_id) AND (g.owner_id = ( select auth.uid() ))))) OR (shares_group_with_goal(goal_id) AND (status <> ALL (ARRAY['missed'::text, 'carried'::text, 'cancelled'::text, 'excused'::text]))) OR deelt_open_groep_met_doel(goal_id)))
  ;

drop policy if exists weekly_goals_update on public.weekly_goals;
create policy weekly_goals_update on public.weekly_goals
  for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM goals g
  WHERE ((g.id = weekly_goals.goal_id) AND (g.owner_id = ( select auth.uid() ))))))
  with check ((EXISTS ( SELECT 1
   FROM goals g
  WHERE ((g.id = weekly_goals.goal_id) AND (g.owner_id = ( select auth.uid() ))))))
  ;


-- ---------------------------------------------------------------------------
-- En een bewaking, want de volgende policy is zo weer kaal
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Dit is precies de vorm die terugkomt.** Niemand schrijft `(select
--    auth.uid())` uit gewoonte; `auth.uid()` is wat er in elk voorbeeld staat,
--    ook in dat van Supabase zelf. Zonder bewaking staat de vijftigste policy er
--    kaal in en meldt niets dat.
--
-- ⚠️ Geen lijst, dezelfde les als 0118: de regel is uit te rekenen. Hij kijkt
--    naar de gedéployde uitdrukking via `pg_get_expr()` en niet naar de tekst van
--    een migratiebestand, want dat laatste zegt wat er ooit is afgespeeld.

-- ⚠️ **Het patroon staat in een eigen functie, want een zeef die je niet kunt
--    voeden kun je niet ijken.** Dat is de les van QS8-115: `tekst:controle`
--    meldde maandenlang nul terwijl er zeven onvertaalde zinnen stonden, en er
--    was geen manier om te zien wát hij vond zonder de codebase te wijzigen.
--    `is_kale_auth_uid()` is één regel op één plek, en `tests/rls/initplan.test.ts`
--    biedt hem elke vorm los aan — de vormen die hij moet vinden én de vormen die
--    hij met rust moet laten.

create or replace function public.is_kale_auth_uid(p_uitdrukking text)
returns boolean
language sql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $$
  -- De negatieve vooruitblik is het hele punt: `( SELECT auth.uid() AS uid )` is
  -- juist de vorm die we willen, en die mag niet meetellen.
  select p_uitdrukking ~* '(?<!select )auth\.uid\(\)';
$$;

revoke all on function public.is_kale_auth_uid(text) from public, anon, authenticated;
grant execute on function public.is_kale_auth_uid(text) to service_role;

-- ⚠️ **De keerzijde, en die is nodig omdat een bestaande bewaking omviel.**
--    `domeinregel3_bewaking()` (0093) zoekt de letterlijke clausule
--    `user_id <> auth.uid()` in `completion_approvals_insert`. Door de hijs staat
--    daar nu `user_id <> ( SELECT auth.uid() AS uid )`, en de bewaking meldde dat
--    het slot weg was terwijl het er gewoon stond.
--
-- ⚠️ **Dat is onwrikbare regel 18, vraag 4, en de test wás goed.** Hij greep naar
--    een spelling in plaats van naar de belofte, en dan verhuist hij niet mee.
--    De reparatie is niet "het patroon oprekken" maar de spelling wegnormaliseren
--    vóór het vergelijken — dan blijft er in de bewaking staan wat de belofte is.

create or replace function public.zonder_initplan_hijs(p_uitdrukking text)
returns text
language sql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $$
  select regexp_replace(
           p_uitdrukking,
           '\(\s*select\s+auth\.uid\(\)(\s+as\s+uid)?\s*\)',
           'auth.uid()',
           'gi'
         );
$$;

revoke all on function public.zonder_initplan_hijs(text) from public, anon, authenticated;
grant execute on function public.zonder_initplan_hijs(text) to service_role;

create or replace function public.domeinregel3_bewaking()
returns table (slot text, ontbreekt text)
language sql
stable
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
  -- 1. De RLS-helft: de clausule die de eigenaar buiten de deur houdt.
  --    ⚠️ Door `zonder_initplan_hijs()` heen, zodat de vorm van 0121 hem niet
  --       ineens laat "ontbreken". De clausule zelf staat er onveranderd.
  select 'rls'::text,
         'completion_approvals_insert mist de clausule c.user_id <> auth.uid()'::text
  where not exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relname = 'completion_approvals'
      and p.polname = 'completion_approvals_insert'
      and public.zonder_initplan_hijs(pg_get_expr(p.polwithcheck, p.polrelid))
            like '%user_id <> auth.uid()%'
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

revoke all on function public.domeinregel3_bewaking() from public, anon, authenticated;
grant execute on function public.domeinregel3_bewaking() to service_role;

create or replace function public.initplan_bewaking()
returns table (tabel text, policy text, deel text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with delen as (
    select c.relname::text as tabel,
           pol.polname::text as policy,
           d.deel,
           case d.deel
             when 'using' then pg_get_expr(pol.polqual, pol.polrelid)
             else              pg_get_expr(pol.polwithcheck, pol.polrelid)
           end as uitdrukking
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    cross join (select unnest(array['using', 'with check']) as deel) d
  )
  select tabel, policy, deel
  from delen
  where uitdrukking is not null
    and public.is_kale_auth_uid(uitdrukking)
  order by 1, 2, 3;
$$;

revoke all on function public.initplan_bewaking() from public, anon, authenticated;
grant execute on function public.initplan_bewaking() to service_role;
