-- 0100_vragen_zijn_niet_van_de_groep.sql — completion_approvals_select inperken
--
-- ROLLBACK-PAD:
--   drop policy if exists completion_approvals_select on public.completion_approvals;
--   create policy completion_approvals_select on public.completion_approvals
--     for select to authenticated
--     using (public.is_group_member(group_id));
--
-- ---------------------------------------------------------------------------
-- Wat er mis was
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Élk groepslid las élke `more_info`-opmerking over élk ander lid.** De
--    policy was `is_group_member(group_id)` en verder niets. Zit je in een
--    groep van zes, dan kon je met één PostgREST-verzoek zien dat er aan Anna
--    is doorgevraagd, met de tekst van die vraag erbij.
--
-- ⚠️ **Waarom dat de rand van domeinregel 7 is.** "Anna is doorgevraagd" is een
--    licht negatief signaal over iemand anders, en het loopt niet via Anna zelf.
--    De regel kent precies drie routes waarlangs tegenslag de groep bereikt en
--    alle drie lopen via de gebruiker: vraag 2 van de weekafsluiting, de knop
--    "vraag je groep om hulp", en het verzoek om je streefdatum te verschuiven.
--    Dit was een vierde, en niemand had hem gekozen. De schermen toonden het
--    nergens — precies de vorm die EPIC 5 dit project al een keer gekost heeft:
--    de UI hield de regel netjes aan terwijl de database hem lekte.
--
-- ⚠️ **`approval_withdrawals_select` had de goede vorm al** (migratie 0030):
--    `approver_id = auth.uid() or de eigenaar van de voltooiing`. Deze migratie
--    zet dezelfde vorm op de tabel ernaast. `subject_id` ís de eigenaar van de
--    voltooiing — een gedenormaliseerde kolom die de trigger
--    `fill_approval_subject()` onvoorwaardelijk vult — dus die tweede helft is
--    hier één kolomvergelijking in plaats van een join.
--
-- ---------------------------------------------------------------------------
-- Wat er langs deze policy moet blijven komen, en waarom het dat doet
-- ---------------------------------------------------------------------------
--
-- Op 27-08-2026 nagemeten tegen de gedeployde database, niet tegen de
-- migratiebestanden:
--
--   1. `openstaande_beoordelingen()` is SECURITY **INVOKER** en aanroepbaar door
--      `authenticated`, dus die valt wél onder deze policy. Zijn enige gebruik
--      van deze tabel is `not exists (… where a.approver_id = auth.uid() …)` —
--      hij kijkt uitsluitend naar zijn eigen goedkeuringen. Blijft werken.
--   2. De RETURNING-rij van een INSERT. Postgres past de SELECT-policy ook toe
--      op wat een INSERT teruggeeft, en het beoordeelscherm heeft die id nodig
--      om binnen een kwartier in te trekken. De invoeger ís de beoordelaar.
--   3. `fetchVragen()` leest de vragen op je éigen voltooiing. Dat is de
--      `subject_id`-helft.
--   4. `trek_goedkeuring_in()`, `te_beoordelen_voor()`,
--      `verwachte_weekdoelstatus()` en `domeinregel3_bewaking()` zijn SECURITY
--      DEFINER en zien deze policy niet.
--   5. Er is géén view die deze tabel leest (`pg_get_viewdef` over alle views:
--      nul treffers), en geen andere policy die hem in een subquery gebruikt.
--
-- ⚠️ De groep blijft zien dát een week goedgekeurd is — dat loopt via
--    `weekly_goals.status` en het systeembericht `completion_approved`, niet via
--    deze tabel. Er gaat dus geen positief signaal verloren; alleen het negatieve
--    dat er nooit had moeten staan.
--
-- ---------------------------------------------------------------------------

drop policy if exists completion_approvals_select on public.completion_approvals;

create policy completion_approvals_select on public.completion_approvals
  for select
  to authenticated
  using (
    -- Jij hebt hem gegeven.
    approver_id = auth.uid()
    -- Of hij gaat over jouw voltooiing. `subject_id` is niet door de client te
    -- kiezen: `fill_approval_subject()` zet hem onvoorwaardelijk op de eigenaar,
    -- op INSERT én op UPDATE.
    or subject_id = auth.uid()
  );
