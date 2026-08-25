-- 0083_bovengrens_op_weekdoelen_per_dag.sql — beveiligingsregel 5, en de tier is 500 MB
--
-- ROLLBACK-PAD:
--   drop policy if exists weekly_goals_insert on public.weekly_goals;
--   create policy weekly_goals_insert on public.weekly_goals
--     for insert to authenticated
--     with check (
--       exists (select 1 from goals g where g.id = weekly_goals.goal_id and g.owner_id = auth.uid())
--     );
--   drop function if exists weekdoelen_vandaag();
--   drop index if exists weekly_goals_vers_idx;
--
-- ---------------------------------------------------------------------------
-- Wat er open stond
-- ---------------------------------------------------------------------------
--
-- Bevinding van 19-08-2026 uit `docs/ENGINEER-REVIEW.md`, opgemerkt bij de review
-- op 0043. `weekly_goals_insert` toetste alleen eigenaarschap. `cycle_start_date`
-- en `cycle_index` zijn vrij te kiezen en er is geen unieke constraint, dus één
-- ingelogd account kon in een lus tienduizenden rijen invoegen — op een gratis
-- tier van 500 MB zonder automatische backups.
--
-- ⚠️ **Dit is opslagmisbruik en geen scoremisbruik**, en dat onderscheid is de
--    reden dat het niet urgenter was: punten en weekpassen tellen allebei
--    `distinct cycle_start_date`, dus meer rijen leveren geen punt op. Precies
--    het argument dat 0023 §3 zelf maakt over `completions`.
--
-- CLAUDE.md beveiligingsregel 5 eist een limiet per gebruiker per dag. Die stond
-- er voor uitnodigingen (0008) en voor AI-calls, en hier niet.
--
-- ---------------------------------------------------------------------------
-- Waarom een dagelijkse limiet en niet een unieke constraint
-- ---------------------------------------------------------------------------
--
-- ⚠️ De bevinding stelde een unieke constraint op `(goal_id, cycle_start_date)`
--    voor, die dit én de dubbelzinnigheid in `herbereken_reeks()` in één keer
--    zou oplossen. **Die weg is sindsdien afgesloten door besluit A37**
--    (24-08-2026): twee weekdoelen op hetzelfde doel in één week zijn toegestaan
--    en migratie 0074 rekent daar juist mee. Een unieke constraint zou een
--    genomen besluit terugdraaien.
--
-- ⚠️ En een grens per doel per cyclus zou de lus niet stoppen: `cycle_start_date`
--    is vrij te kiezen, dus wie geremd wordt op één week telt de datum op en gaat
--    door. De enige grens die de lus écht bindt, is er een op wat de gebruiker
--    per dag aanmaakt — dezelfde vorm als `join_group_with_code` (0008).
--
-- ---------------------------------------------------------------------------
-- Waarom in de policy en niet in een trigger
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De rollover moet hier ongehinderd langs.** `weekly_goals_insert` geldt
--    alleen voor `authenticated`; de geplande job draait als `service_role` en
--    valt dus buiten deze grens zonder dat daar één regel voor nodig is. Een
--    trigger zou voor beide gelden, en een trigger die op een rolnaam beslist
--    faalt open (WERKVOORRAAD §7). De grens hoort op de laag waar de rol al
--    verschil maakt.
--
-- Tweehonderd per dag. Iemand die in één zitting tien doelen opzet met vijf
-- weekdoelen elk, zit op vijftig; dit is ruim en bindt de lus alsnog.

create index if not exists weekly_goals_vers_idx
  on public.weekly_goals (goal_id, created_at desc);

comment on index public.weekly_goals_vers_idx is
  'Voor de dagelijkse bovengrens in weekly_goals_insert (0083): per doel de '
  'meest recente rijen eerst, zodat de telling niet de hele geschiedenis leest.';

/**
 * Hoeveel weekdoelen heeft de ingelogde gebruiker het laatste etmaal aangemaakt?
 *
 * ⚠️ **Faalt dicht bij een lege `auth.uid()`.** Dat is niet overdreven maar een
 *    fout die dit project al gemaakt heeft: elke definer-functie hier is een
 *    kopie van de vorige, en de `auth.uid()`-NULL-val kostte in augustus veertig
 *    regels omdat precies één functie hem had. Zonder sessie is het antwoord een
 *    getal boven elke grens, niet nul.
 */
create or replace function weekdoelen_vandaag()
  returns integer
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select case
    when auth.uid() is null then 2147483647
    else (
      select count(*)::integer
      from weekly_goals w
      join goals g on g.id = w.goal_id
      where g.owner_id = auth.uid()
        and w.created_at > now() - interval '1 day'
    )
  end;
$$;

comment on function weekdoelen_vandaag() is
  'Telt de weekdoelen die de ingelogde gebruiker het laatste etmaal aanmaakte, '
  'voor de bovengrens in weekly_goals_insert (beveiligingsregel 5). Geeft zonder '
  'sessie een getal boven elke grens terug, zodat de policy dichtvalt en niet '
  'opengaat.';

revoke all on function weekdoelen_vandaag() from public, anon;
grant execute on function weekdoelen_vandaag() to authenticated;

drop policy if exists weekly_goals_insert on public.weekly_goals;

create policy weekly_goals_insert on public.weekly_goals
  for insert to authenticated
  with check (
    exists (select 1 from goals g where g.id = weekly_goals.goal_id and g.owner_id = auth.uid())
    and weekdoelen_vandaag() < 200
  );
