-- 0077_weekdoelen_in_een_open_groep.sql — QS8-132, EPIC 13, het eerste oppervlak
--
-- ROLLBACK-PAD:
--   drop policy if exists weekly_goals_select on weekly_goals;
--   create policy weekly_goals_select on weekly_goals for select to authenticated
--     using (
--       exists (select 1 from goals g
--               where g.id = weekly_goals.goal_id and g.owner_id = auth.uid())
--       or (
--         shares_group_with_goal(goal_id)
--         and status <> all (array['missed', 'carried', 'cancelled', 'excused'])
--       )
--     );
--   drop function if exists deelt_open_groep_met_doel(uuid);
--
-- Vooraf: `pg_dump` (onwrikbare regel 20). Geen schemawijziging aan een tabel;
-- op 24-08-2026 stonden er 0 rijen in `groups` en `weekly_goals`.
--
-- ---------------------------------------------------------------------------
-- Oppervlak 3 uit beslisdocument 002, en niet toevallig het eerste
-- ---------------------------------------------------------------------------
--
-- Dit is het oppervlak waar domeinregel 7 op schemaniveau begonnen is. In EPIC 5
-- gaf `weekly_goals_select` elke groepsgenoot de hele rij van een gekoppeld
-- doel, inclusief `status = 'missed'`: één `GET /rest/v1/weekly_goals` leverde de
-- volledige lijst gemiste weken van een ander op, mét datum. De schermen hielden
-- de regel netjes aan; de database lekte hem. 0019 en 0020 hebben dat gedicht,
-- 0045 heeft `cancelled` erbij gezet en 0047 `excused`.
--
-- Precies daarom is het hier het eerste oppervlak: wat besluit A41 betekent, is
-- hier het scherpst te zien, en wat er misgaat als je het verkeerd doet ook.
--
-- ⚠️ **Wat "open" hier betekent, en waar het ophoudt.** Een lid van een **open**
--    groep ziet van een gekoppeld doel élke weekdoelrij, ook `missed`, `carried`,
--    `cancelled` en `excused`. Meer niet: het is dezelfde tabel en dezelfde
--    kolommen als een groepsgenoot vandaag al ziet, zonder de statusfilter.
--    `points_ledger` blijft dicht (besluit A42), `goal_risk` blijft
--    eigenaar-only (A17, migratie 0050), en de weekpassen blijven privé
--    (oppervlak 19). Die drie staan hier niet en horen hier ook niet.
--
-- ⚠️ **De keuze is per groep en dus per koppeling.** Een doel kan aan meerdere
--    groepen hangen. Zit het aan één open en één beschermde groep, dan ziet
--    alleen het lid van de open groep de volledige lijst — de derde tak toetst
--    de zichtbaarheid van de groep die de kijker met dit doel deelt, niet die van
--    "een" groep. Dat is het verschil tussen een policy per groep en een vlag op
--    het doel.
--
-- ⚠️ **Koppelen blijft de toestemming** (QS8-54), en dat is hier de kern van de
--    zaak. Een eigenaar die zijn doel aan een open groep koppelt, weet wat hij
--    deelt. Een groep die ná die koppeling van beschermd naar open gaat,
--    verandert dat met terugwerkende kracht — en dáárom eist 0076 dat het
--    omzetten expliciet, auditeerbaar en aangekondigd is. Het systeembericht is
--    het moment waarop een lid kan besluiten zijn doel te ontkoppelen. Zonder
--    0076 zou deze migratie een stilzwijgende verruiming zijn.

begin;

-- ---------------------------------------------------------------------------
-- 1. Deel ik een ópen groep met dit doel?
-- ---------------------------------------------------------------------------
--
-- ⚠️ Zelfde vorm als `shares_group_with_goal()` (0002/0004) en om dezelfde reden
--    SECURITY DEFINER: de policy op `group_members` zou anders in recursie lopen.
--    STABLE, `search_path` vast, en ingetrokken voor `public` en `anon`.
--
-- ⚠️ **Zonder sessie is dit `false` en niet NULL.** `m.user_id = auth.uid()` met
--    een NULL rechterkant levert nul rijen, en `exists` daarop is `false`. Dat is
--    de val uit migratie 0040 (`eigenaar <> auth.uid()` gaat zonder sessie niet
--    af), en `exists` heeft hem niet — maar hij staat hier opgeschreven omdat
--    elke volgende definer-functie in dit project een kopie van de vorige is.
--
-- ⚠️ `status <> 'inactive'` staat erbij, net als in `is_group_member()` sinds
--    0029. Een ontkoppeld of verwijderd lid van een open groep is geen kijker
--    meer.

create or replace function deelt_open_groep_met_doel(g uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from goal_group_links l
    join group_members m on m.group_id = l.group_id
    join groups        gr on gr.id     = l.group_id
    where l.goal_id       = g
      and m.user_id       = auth.uid()
      and m.status       <> 'inactive'
      and gr.zichtbaarheid = 'open'
  );
$$;

comment on function deelt_open_groep_met_doel(uuid) is
  'Deelt de aanroeper een groep met dit doel die op "open" staat? Besluit A41 '
  '(QS8-132). SECURITY DEFINER om dezelfde reden als shares_group_with_goal: de '
  'policy op group_members zou anders in recursie lopen.';

revoke all on function deelt_open_groep_met_doel(uuid) from public, anon;
grant execute on function deelt_open_groep_met_doel(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Een derde tak, en de eerste twee blijven woordelijk staan
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De statusfilter van 0020/0045/0047 wordt niet aangeraakt.** Hij hoort bij
--    de tweede tak — de beschermde groep — en die verandert hier niet. Zou ik de
--    filter verruimen in plaats van een tak toevoegen, dan zou élke groep meteen
--    open staan; dat is grens 4 van het besluit, letterlijk.
--
--    Gevolg dat je zou missen: de opmerking uit 0045 blijft gelden. Komt er ooit
--    een vijfde status die "niet gelukt" betekent, dan hoort hij in die array —
--    en `tests/rls/policies.test.ts` is wat je eraan herinnert. De derde tak
--    heeft die lijst niet, want daar is juist álles zichtbaar.
--
-- ⚠️ De volgorde van de takken doet er voor de uitkomst niet toe, maar wel voor
--    de lezer: eigenaar, beschermde groepsgenoot, open groepsgenoot. Van meest
--    naar minst beperkt.

drop policy if exists weekly_goals_select on weekly_goals;
create policy weekly_goals_select on weekly_goals
  for select to authenticated
  using (
    exists (
      select 1 from goals g
      where g.id = weekly_goals.goal_id
        and g.owner_id = auth.uid()
    )
    or (
      shares_group_with_goal(goal_id)
      and status <> all (array['missed', 'carried', 'cancelled', 'excused'])
    )
    or deelt_open_groep_met_doel(goal_id)
  );

commit;
