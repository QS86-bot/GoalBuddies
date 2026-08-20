-- 0047_excused_hoort_bij_de_afscherming.sql — domeinregel 7 (Q-TODO A45)
--
-- ROLLBACK-PAD:
--   drop policy if exists weekly_goals_select on public.weekly_goals;
--   create policy weekly_goals_select on public.weekly_goals for select to authenticated
--     using (
--       exists (select 1 from goals g where g.id = weekly_goals.goal_id and g.owner_id = auth.uid())
--       or (shares_group_with_goal(goal_id)
--           and status <> all (array['missed', 'carried', 'cancelled']))
--     );
--
-- ⚠️ Waarom deze migratie bestaat. `weekly_goals_select` schermde drie statussen
--    af voor groepsgenoten — `missed`, `carried` en `cancelled` — en `excused`
--    niet. Een adempauze betekent "ik heb deze week niet gedaan"; dat is een
--    niet-voltooide week, en die hoort de groep niet te zien (domeinregel 7).
--
-- ⚠️ **Vandaag lekt er niets, en dat is precies waarom dit nú moet.** Geen enkele
--    functie in `public` schrijft `excused`: een weekpas laat de rij op `missed`
--    staan en schrijft alleen in `week_pass_events`. De status stond wél in de
--    CHECK `weekly_goals_status_valid`, en QS8-82 (de adempauze) is het issue dat
--    hem gaat schrijven. Vanaf die dag zou elk groepslid met één
--    `GET /rest/v1/weekly_goals` kunnen uitlezen welke weken jij op adempauze
--    hebt gezet.
--
--    Dat is dezelfde vorm als de valkuil "een redenering die klopt zolang een
--    tabel leeg is". Hier is het zelfs een stap eerder: een CHECK-constraint die
--    een waarde toestaat, is een belofte dat die waarde ooit voorkomt.
--
-- ⚠️ En het is de derde keer dat dit patroon terugkomt: **de schermen deden het
--    goed, de database niet.** `rangeState()` in `src/shared/ui/metrics.ts`
--    verbergt alles wat niet `approved` of `pending` is voor `viewer: 'group'`,
--    en `metrics.test.ts` rekent `excused` expliciet tot de tegenslag. Precies
--    zoals bij 0019 (`weekly_goals.status`) en 0023 (goedkeuring): de UI klopte
--    en de policy niet. De regel is pas afgedwongen als de dátabase hem afdwingt.
--
-- ⚠️ Twee routes lopen hierlangs mee en hoeven daarom géén eigen reparatie:
--
--    1. De view `goal_dashboard` staat op `security_invoker = true`, dus de
--       subquery's `weekly_total` en `weekly_approved` tellen onder de RLS van de
--       aanroeper. Met deze policy valt `excused` daar vanzelf buiten.
--    2. De realtime-publicatie past RLS toe op INSERT en UPDATE, dus een rij die
--       op `excused` gezet wordt, wordt niet meer naar groepsgenoten uitgezonden.
--       (Voor DELETE geldt dat níét — daarvoor bestaat het verbod op
--       `REPLICA IDENTITY FULL` en de test in migratie 0027.)
--
--    Nagelopen en veilig bevonden, dus hier niet aangeraakt: `weekpas_standen()`
--    (filtert op `g.owner_id = auth.uid()` mét de niet-NULL-controle),
--    `ketting_schakel()` (leest alleen je eigen `approved`-weken) en
--    `openstaande_beoordelingen()` (geen SECURITY DEFINER, dus RLS geldt).
--
-- ⚠️ De eigenaar blijft alles zien. Dat is geen detail: een adempauze is voor
--    jezelf zichtbaar, hij is alleen niet van de groep. `FloorCeiling` toont hem
--    met het label "Adempauze" aan `viewer: 'owner'`.

begin;

drop policy if exists weekly_goals_select on public.weekly_goals;

create policy weekly_goals_select on public.weekly_goals
  for select
  to authenticated
  using (
    -- De eigenaar ziet zijn eigen weken, in elke status.
    exists (
      select 1 from goals g
      where g.id = weekly_goals.goal_id
        and g.owner_id = auth.uid()
    )
    or (
      shares_group_with_goal(goal_id)
      -- ⚠️ Vier statussen, niet drie. Elke waarde die "deze week is niet
      --    voltooid" betekent, hoort in deze lijst. Komt er ooit een vijfde bij
      --    in `weekly_goals_status_valid`, dan is dit de plek die meeverandert —
      --    en de test in tests/rls/policies.test.ts is wat je eraan herinnert.
      --
      -- ⚠️ `<> all (...)` is hier veilig omdat `status` NOT NULL is. Was dat niet
      --    zo, dan gaf een NULL het derde antwoord dat zich als "niet waar"
      --    gedraagt — hier zou dat toevallig goed uitpakken (de rij wordt
      --    verborgen), maar reken daar nooit op.
      and status <> all (array['missed', 'carried', 'cancelled', 'excused'])
    )
  );

commit;
