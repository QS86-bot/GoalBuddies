-- 0137_weekdoelstatus_herstellen_binnen_een_grens.sql — de statuscache repareren zonder de rest van de database aan te raken (QS8-145)
--
-- ROLLBACK-PAD:
--   drop function if exists public.herstel_weekdoelstatus(uuid);
--   drop function if exists public.weekdoelstatus_afwijkingen(uuid);
--   Daarna migratie 0096 vanaf "-- 2." opnieuw afspelen; die maakt de
--   argumentloze versies terug, inclusief hun revoke- en grant-regels.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- `reeks.test.ts` viel op 27-08 vier keer op negen runs om, elke keer met een
-- andere buur, en altijd alleen in een vólle run. De faalsignatuur stond in
-- `vitest.config.mts` opgeschreven: `4, 4, 4, 4, 4, 4, 0, 0, 0, 0` — een reeks
-- die halverwege een lus omklapt die zelf niets schrijft.
--
-- 📏 **Gemeten op 31-08, en het is geen ruis maar een `update` zonder `where` op
--    eigenaar.** In één transactie nagespeeld op een lege database:
--
--     reeks VOOR herstel:  4
--     herstel_weekdoelstatus() raakte 4 rijen aan
--     reeks NA herstel:    0
--     rijen nog aanwezig:  5
--
--    Die vier rijen waren van een ánder testbestand. `herstel_weekdoelstatus()`
--    doet `update weekly_goals ... from weekdoelstatus_afwijkingen()`, en die
--    bron leest de héle tabel. Draait `statuscache.test.ts` naast `reeks.test.ts`,
--    dan zet hij diens vier `approved`-weken terug naar `todo` — want die zijn
--    met de hand gezet, zonder voltooiing, en dus per definitie "afwijkend".
--
-- ⚠️ **En daarom zag geen enkele test het.** `reeks.test.ts` heeft een bewaker,
--    `fixtureGaaf()`, die precies voor dit geval geschreven is. Die telt
--    **rijen**, en de rijen bleven staan — alleen hun `status` veranderde. De
--    bewaker zweeg dus terwijl de fixture inhoudelijk weg was. Dat is
--    onwrikbare regel 18 in zijn zuiverste vorm: hij toetste een eigenschap van
--    het onderdeel (er zijn nog drie rijen) in plaats van de belofte (die drie
--    weken zijn nog gehaald).
--
-- ---------------------------------------------------------------------------
-- Wat hier verandert, en wat met opzet niet
-- ---------------------------------------------------------------------------
--
-- Allebei de functies krijgen `p_goal_id uuid default null`. **Zonder argument
-- doen ze exact wat ze deden** — de hele database, want dat is waar de
-- herstelweg voor bestaat. Mét een doel doen ze alleen dat doel.
--
-- ⚠️ **De productieweg is dus onveranderd, en dat is de bedoeling.** Deze
--    functies hebben geen enkele aanroeper in `src/`, `app/` of
--    `supabase/functions/`; het is handgereedschap dat je draait wanneer
--    `weekdoelstatus_afwijkingen()` iets meldt (0096, en de aantekening in
--    `scripts/dode-keten-controle.mjs`). De enige aanroeper is de test, en die
--    hoort zich te beperken tot zijn eigen fixture.
--
-- ⚠️ **`default null` en niet `default` een doel, want de gevaarlijke kant is de
--    stille.** Zou de parameter verplicht zijn, dan valt een vergeten aanroeper
--    hard om en dat is prima. Maar de herstelweg móet ook ongescopeerd kunnen —
--    een beheerder die drift over de hele database rechtzet, is precies het
--    geval waarvoor 0096 hem schreef. De grens ligt daarom niet in de functie
--    maar bij de aanroeper, en die grens wordt bewaakt door
--    `tests/rls/nevenschade.test.ts`.
--
-- ⚠️ **Eerst droppen en dan opnieuw maken, met de vólledige handtekening.** Een
--    parameter met een default erbij zetten maakt geen nieuwe versie van
--    dezelfde functie maar een tweede functie ernaast, en dan is
--    `herstel_weekdoelstatus()` dubbelzinnig en valt élke aanroep om met
--    "function is not unique". Dat is de les van 0059, die
--    `plaats_systeembericht(uuid, text, text)` dropte en er daarna een met zes
--    argumenten naast zette.
--
--    Een `drop` neemt de grants mee, dus die staan hieronder opnieuw.

-- ---------------------------------------------------------------------------
-- 1. De oude, argumentloze versies weg
-- ---------------------------------------------------------------------------
--
-- ⚠️ De volgorde doet ertoe: `herstel_weekdoelstatus()` leunt op
--    `weekdoelstatus_afwijkingen()`, dus die gaat als eerste weg.
drop function if exists public.herstel_weekdoelstatus();
drop function if exists public.weekdoelstatus_afwijkingen();

-- ---------------------------------------------------------------------------
-- 2. De melding, nu begrensbaar
-- ---------------------------------------------------------------------------
--
-- ⚠️ De `where`-voorwaarden zijn woord voor woord die van 0096. Alleen de
--    laatste regel is nieuw. Een tweede opvatting van "wat is drift" naast de
--    bestaande is precies de twee lijsten die in 0032/0034 uit elkaar liepen.
create or replace function public.weekdoelstatus_afwijkingen(p_goal_id uuid default null)
returns table(weekly_goal_id uuid, opgeslagen text, verwacht text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select w.id, w.status, verwachte_weekdoelstatus(w.id)
  from weekly_goals w
  -- ⚠️ Alleen de afleidbare drie. Zie 0096: een gemiste week is geen drift.
  where w.status in ('todo', 'pending', 'approved')
    and w.status <> verwachte_weekdoelstatus(w.id)
    and (p_goal_id is null or w.goal_id = p_goal_id)
  order by w.id;
$$;

comment on function public.weekdoelstatus_afwijkingen(uuid) is
  'Weekdoelen waarvan de statuscache niet klopt met completions en '
  'completion_approvals. Hoort leeg te zijn. Zonder argument de hele database, '
  'met een doel alleen dat doel (QS8-145). Zie tests/rls/statuscache.test.ts.';

-- ---------------------------------------------------------------------------
-- 3. De herstelweg, nu begrensbaar
-- ---------------------------------------------------------------------------
--
-- ⚠️ Onveranderd uit 0096: schrijft uitsluitend rijen die nú al in een van de
--    drie afleidbare statussen staan, boekt géén punten en raakt
--    `points_ledger` niet aan. Een cache rechtzetten is iets anders dan een
--    gebeurtenis alsnog laten plaatsvinden.
create or replace function public.herstel_weekdoelstatus(p_goal_id uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  hersteld integer;
begin
  with af as (select * from weekdoelstatus_afwijkingen(p_goal_id))
  update weekly_goals w
  set status = af.verwacht
  from af
  where w.id = af.weekly_goal_id;

  get diagnostics hersteld = row_count;
  return hersteld;
end;
$$;

comment on function public.herstel_weekdoelstatus(uuid) is
  'Zet de statuscache terug naar wat de gebeurtenissen zeggen, alleen voor de '
  'drie afleidbare statussen. Boekt geen punten. Zonder argument de hele '
  'database, met een doel alleen dat doel (QS8-145). Zie migratie 0096.';

-- ---------------------------------------------------------------------------
-- 4. De rechten terug
-- ---------------------------------------------------------------------------
--
-- ⚠️ `from public, anon, authenticated` en niet `from public, anon`. In Supabase
--    deelt `alter default privileges` élke nieuwe functie in `public` uit aan
--    alle drie, en `from public, anon` houdt precies de rol over waaronder
--    iedere ingelogde gebruiker draait. Zie CLAUDE.md beveiligingsregel 4 en het
--    beslisdocument van 28-08 — de drop hierboven maakte deze twee functies
--    letterlijk nieuw, dus dit is geen herhaling maar noodzaak.
revoke all on function public.weekdoelstatus_afwijkingen(uuid) from public, anon, authenticated;
revoke all on function public.herstel_weekdoelstatus(uuid) from public, anon, authenticated;

-- Alleen `service_role`, net als in 0096: dit is gereedschap voor de rollover en
-- de audit, geen clientoppervlak — en `herstel_weekdoelstatus()` schrijft.
grant execute on function public.weekdoelstatus_afwijkingen(uuid) to service_role;
grant execute on function public.herstel_weekdoelstatus(uuid) to service_role;
