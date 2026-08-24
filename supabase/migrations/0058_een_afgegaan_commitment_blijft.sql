-- 0058_een_afgegaan_commitment_blijft.sql — EPIC 9, nazorg op 0057
--
-- ROLLBACK-PAD:
--   de vorige verwijder_doel() uit 0046 terugzetten (zonder de commitment-toets).
--
-- ⚠️ **Deze bevinding stond al in `ENGINEER-REVIEW.md`, met "hoort bij EPIC 9"
--    erachter.** Bijvangst van de review op 0043, 19-08-2026:
--
--      "`commitments.goal_id … on delete cascade` (0001) betekent dat één DELETE
--       op een doel ook een commitment wist dat al `due` is — en domeinregel 11
--       zegt juist dat de begunstigde groep op dat moment leesrecht krijgt."
--
--    Zolang niets een commitment ooit op `due` zette, was dat theorie. Sinds 0057
--    zet de rollover hem er elk uur op, dus het is nu een echte route.
--
-- ⚠️ **Waarom `verwijder_doel()` en niet de foreign key.** De cascade zelf is
--    goed: gooi je een doel weg dat nog nergens aan hangt, dan hoort een
--    beloning die je er in dezelfde minuut bij hebt bedacht mee te verdwijnen.
--    Wat níét mag, is dat een commitment verdwijnt nadát het in werking is
--    getreden. Dat onderscheid is een voorwaarde en geen referentiële actie, dus
--    het hoort in de functie die de voorwaarden al bewaakt.
--
-- ⚠️ **De grens is precies `commitments_select`.** `unlocked`, `due` en
--    `resolved` zijn de standen waarop de begunstigde groep meeleest; vanaf dat
--    moment is de rij niet meer alleen van jou en is weggooien geen vergissing
--    herstellen maar geschiedenis wissen (domeinregel 6). `set` en `cancelled`
--    blijven verwijderbaar — een straf die je hebt ingetrokken en een beloning
--    die nooit is afgegaan, zijn nooit buiten je eigen scherm geweest.
--
--    ⚠️ Loopt die lijst uit de pas met `commitments_select`, dan wist je hier
--       weer iets wat de groep al gezien heeft. Er staat daarom een test op in
--       `tests/rls/epic9.test.ts`, en `isAfgegaan()` in
--       `src/modules/commitments/stand.ts` is dezelfde lijst voor de UI.
--
-- ⚠️ De toets staat ná de goedkope controles en vóór de DELETE, zoals de andere
--    vier in deze functie (zelfde afweging als 0035 §255).

begin;

create or replace function public.verwijder_doel(p_goal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  g goals%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_logged_in');
  end if;

  select g2.* into g from goals g2 where g2.id = p_goal_id and g2.owner_id = auth.uid();

  if g.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  if g.created_at < now() - bedenktijd() then
    return jsonb_build_object('ok', false, 'reason', 'te_oud');
  end if;

  if exists (select 1 from goal_group_links l where l.goal_id = p_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'gedeeld_met_groep');
  end if;

  if exists (select 1 from weekly_goals w where w.goal_id = p_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'heeft_weekdoelen');
  end if;

  if exists (select 1 from points_ledger p where p.goal_id = p_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'heeft_punten');
  end if;

  -- Nieuw in 0058. Zie de kop: dezelfde lijst als `commitments_select`.
  if exists (
    select 1 from commitments c
     where c.goal_id = p_goal_id
       and c.status in ('unlocked', 'due', 'resolved')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'commitment_in_werking');
  end if;

  delete from goals where id = p_goal_id;

  return jsonb_build_object('ok', true);
end;
$$;

commit;
