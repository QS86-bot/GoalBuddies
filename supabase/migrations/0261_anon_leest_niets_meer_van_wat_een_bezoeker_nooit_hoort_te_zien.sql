-- 0261_anon_leest_niets_meer_van_wat_een_bezoeker_nooit_hoort_te_zien.sql — QS8-467
--
-- ROLLBACK-PAD:
--   grant select on public.ai_jobs, public.approval_withdrawals, public.breathers,
--     public.chain_links, public.chat_messages, public.commitment_events,
--     public.commitments, public.completion_approvals, public.completions,
--     public.daily_moves, public.deadline_requests, public.goal_events,
--     public.goal_group_links, public.goal_interviews, public.group_members,
--     public.groups, public.invite_events, public.milestones, public.points_ledger,
--     public.user_streaks, public.week_pass_events, public.week_review_replies,
--     public.week_reviews, public.weekly_goals to anon;
--
-- ⚠️ **Waarom dit bestaat.** Supabase deelt met `alter default privileges` élke
--    nieuwe tabel in `public` uit aan `anon`, `authenticated` én `service_role`.
--    📏 Gemeten op 14-09-2026: 24 tabellen in de map dragen zo'n geërfde
--    `anon`-SELECT (op productie 25 — daar is 0236 nog niet toegepast, dus
--    `goals` staat er nog bij met vijftien kolommen).
--
--    Die tabellen blijven vandaag uitsluitend dicht doordat er **géén policy
--    voor `anon` bestaat**. Dat is de afwezigheid van iets, en dus geen slot:
--    één `create policy … using (…)` **zonder** `TO`-clausule — de standaardvorm,
--    die `TO PUBLIC` betekent en `anon` insluit — opent ze in één klap.
--
-- ⚠️ **Twee metingen maken deze reparatie aantoonbaar en niet hoopvol:**
--
--    1. Het recht is **direct aan `anon`** gegund, niet via `PUBLIC`
--       (`role_table_grants`: anon 24, PUBLIC 0). Een revoke heeft hier dus
--       effect; via `PUBLIC` was dezelfde regel een schijnreparatie geweest.
--    2. Er is **nul** permissive SELECT-policy die `anon` insluit. De grant
--       levert vandaag dus geen enkele rij op, en intrekken kan per constructie
--       niets breken dat nu werkt.
--
-- ⚠️⚠️ **`authenticated` staat hier met opzet NIET bij, en dat is een afwijking
--    van de huisvorm.** CLAUDE.md schrijft `from public, anon, authenticated`
--    voor, omdat `revoke … from public, anon` er nu juist uitziet als "van
--    iedereen" terwijl het de rol overhoudt waaronder elke ingelogde gebruiker
--    draait. Hier is het omgekeerde de bedoeling: `authenticated` **moet** zijn
--    SELECT houden, want daar draait de hele app op. `public` staat er wél bij,
--    want dat is het pad waarlangs `anon` het anders alsnog zou erven.
--    `tests/rls/anonleesrecht.test.ts` toetst beide kanten.
--
-- ⚠️ Idempotent: een `revoke` van een recht dat er niet is, is een no-op.

revoke select on
  public.ai_jobs,
  public.approval_withdrawals,
  public.breathers,
  public.chain_links,
  public.chat_messages,
  public.commitment_events,
  public.commitments,
  public.completion_approvals,
  public.completions,
  public.daily_moves,
  public.deadline_requests,
  public.goal_events,
  public.goal_group_links,
  public.goal_interviews,
  public.group_members,
  public.groups,
  public.invite_events,
  public.milestones,
  public.points_ledger,
  public.user_streaks,
  public.week_pass_events,
  public.week_review_replies,
  public.week_reviews,
  public.weekly_goals
  from public, anon;
