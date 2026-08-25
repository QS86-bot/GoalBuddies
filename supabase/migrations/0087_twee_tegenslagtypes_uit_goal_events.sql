-- 0087_twee_tegenslagtypes_uit_goal_events.sql — domeinregel 7 wint van §4.2
--
-- ROLLBACK-PAD:
--   alter table public.goal_events drop constraint if exists goal_events_type_valid;
--   alter table public.goal_events add constraint goal_events_type_valid
--     check (event_type in ('created', 'deadline_moved', 'scope_reduced',
--                           'milestone_dropped', 'archived', 'completed'));
--   drop policy if exists goal_events_insert on public.goal_events;
--   create policy goal_events_insert on public.goal_events
--     for insert to authenticated
--     with check (
--       actor_id = auth.uid()
--       and exists (select 1 from goals g where g.id = goal_events.goal_id
--                     and g.owner_id = auth.uid())
--     );
--
-- Veilig terug te draaien: er is vandaag geen rij met `scope_reduced` of
-- `milestone_dropped`, en er is niets dat die waarden schrijft. Nagemeten op
-- 25-08-2026.
--
-- ---------------------------------------------------------------------------
-- Twee documenten die elkaar tegenspreken, en één moet wijken
-- ---------------------------------------------------------------------------
--
-- Bevinding van 16-08-2026 uit `docs/ENGINEER-REVIEW.md`, en de rij zegt het zelf
-- het scherpst: **"Productbeslissing, geen technische."** `goal_events_select`
-- geeft groepsgenoten leestoegang op `deadline_moved`, `scope_reduced` en
-- `milestone_dropped`. Dat zijn per definitie tegenslagsignalen over iemand
-- anders. `001-datamodel.md` §4.2 staat het toe; domeinregel 7 verbiedt het.
--
-- ⚠️ **Het project heeft die vraag elders al beantwoord, en tegengesteld.**
--    `VERBODEN_GEBEURTENISSEN` in `src/modules/buddies/chat-schemas.ts` noemt
--    `milestone_dropped` met naam: dat mag nooit een systeembericht worden. De
--    ene kant van de app zegt dus "de groep hoort dit nooit te zien" terwijl de
--    andere kant het via een SELECT gewoon uitgeeft. Dat is geen open vraag meer
--    maar een tegenspraak, en domeinregel 7 wint.
--
-- ⚠️ **`deadline_moved` blijft en dat is geen inconsequentie.** Dat is een van de
--    twee benoemde verruimingen uit `docs/decisions/002-...md` §4a: je vraagt hem
--    zelf aan en een buddy keurt hem goed (A7). Een verschuiving die de groep
--    heeft goedgekeurd, mag de groep ook zien.
--
-- ---------------------------------------------------------------------------
-- Waarom weghalen en niet afschermen
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Niets schrijft deze twee waarden.** Nagemeten: `logGoalEvent()` in
--    `src/modules/goals/api.ts` wordt drie keer aangeroepen — `created`,
--    `archived`, `completed` — en `beslis_deadline_verzoek()` schrijft
--    `deadline_moved`. `scope_reduced` staat wel in de TypeScript-union maar
--    heeft geen enkele aanroeper; `milestone_dropped` bestaat alleen in de CHECK.
--
-- Dat is exact de vorm van 0082 (`goals.status = 'missed'`): een CHECK-waarde die
-- niemand vult, die wél groepszichtbaar is, en waarvan de bevinding zei
-- **"besluit vóór iemand hem vult, niet erna"**. Een policy-tak toevoegen voor
-- twee waarden die niet bestaan, is een afscherming bouwen om lucht.
--
-- ⚠️ Wil iemand ze terug, dan is dat een migratie, en dan komt hij langs deze kop
--    — inclusief de vraag hoe ze op `groups.zichtbaarheid` variëren (A41), zoals
--    0077 t/m 0079 dat voor de weekdoelen, de reeks en De Ketting deden.

alter table public.goal_events drop constraint if exists goal_events_type_valid;

alter table public.goal_events add constraint goal_events_type_valid
  check (event_type in ('created', 'deadline_moved', 'archived', 'completed'));

comment on column public.goal_events.event_type is
  'De gebeurtenissen in de audittrail van een doel. ⚠️ scope_reduced en '
  'milestone_dropped zijn er op 25-08-2026 uit gehaald: groepsgenoten lezen deze '
  'tabel via goal_events_select, en dat zijn tegenslagsignalen over iemand anders '
  '(domeinregel 7). milestone_dropped stond bovendien al op VERBODEN_GEBEURTENISSEN '
  'in chat-schemas.ts. Wil je ze terug, kies dan eerst hoe ze op '
  'groups.zichtbaarheid variëren — zoals 0077 t/m 0079.';

-- ---------------------------------------------------------------------------
-- En de client schrijft niet meer wat het systeem hoort te schrijven
-- ---------------------------------------------------------------------------
--
-- Tweede helft van dezelfde bevinding: *"`goal_events_insert` geeft de
-- doeleigenaar schrijfrecht met vrije jsonb terwijl §4.2 'systeem' belooft — een
-- gebruiker kan zijn eigen audittrail vervalsen."*
--
-- ⚠️ **Een kale intrekking kan niet: er ís een cliëntschrijver.** `logGoalEvent()`
--    schrijft `created`, `archived` en `completed` rechtstreeks. Alles dichtzetten
--    zou drie werkende paden slopen — precies het soort dode keten waar QS8-113
--    op stukliep, maar dan andersom.
--
-- Dus de grens ligt op het type. `deadline_moved` is de enige gebeurtenis die een
-- **uitspraak over een ander mens** draagt ("een buddy ging akkoord"), en die
-- wordt door `beslis_deadline_verzoek()` geschreven. Die mag een client dus niet
-- zelf neerzetten.
--
-- ⚠️ **Wat hiermee níét gesloten is, en dat is bewust:** de eigenaar kan nog
--    steeds een `created`, `archived` of `completed` verzinnen op zijn eigen doel,
--    met vrije jsonb. Dat is zelfbedrog en geen autorisatiegrens — dezelfde
--    afweging als bij de rij van 17-08 over het ontkoppelen. **Wordt zwaarder als:**
--    er ooit een punt, een reeks of een groepszichtbaar oppervlak aan een
--    `goal_events`-rij gaat hangen. Dan is het geen dagboek meer maar een bron.

drop policy if exists goal_events_insert on public.goal_events;

create policy goal_events_insert on public.goal_events
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and exists (
      select 1 from goals g
      where g.id = goal_events.goal_id and g.owner_id = auth.uid()
    )
    -- ⚠️ `deadline_moved` staat er bewust niet bij: die schrijft
    --    `beslis_deadline_verzoek()`, en hij is de enige die een uitspraak over
    --    een ander mens draagt.
    and event_type in ('created', 'archived', 'completed')
  );
