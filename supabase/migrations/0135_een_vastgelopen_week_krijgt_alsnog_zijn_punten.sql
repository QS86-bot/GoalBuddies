-- 0135_een_vastgelopen_week_krijgt_alsnog_zijn_punten.sql — de goedkeuringstermijn (QS8-178)
--
-- ROLLBACK-PAD:
--   drop function if exists public.keur_vastgelopen_goedkeuringen_goed(integer);
--   Er is niets anders gewijzigd; `vastgelopen_goedkeuringen()` blijft zoals hij was.
--   ⚠️ Al toegekende punten blijven staan — `points_ledger` is append-only
--   (domeinregel 6). Terugdraaien gebeurt met een `correction`-boeking en niet
--   door geschiedenis te wissen.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Een voltooiing die op goedkeuring wacht bleef `pending` staan terwijl de
-- beoordelaars waren weggevallen: geen minpunt, maar ook nooit meer punten.
-- Gemeten op 28-08 (migratie 0109), vier routes, elk als lid uitgevoerd met RLS
-- actief:
--
--   R1  eigenaar ontkoppelt het doel
--   R2  eigenaar verlaat de groep (0102)
--   R3  beheerder zet de enige beoordelaar op `inactive`
--   R4  beheerder archiveert de groep (0092)
--
-- Besluit van Quinten, 31-08-2026: **zo'n week wordt na een termijn alsnog
-- goedgekeurd.**
--
-- ⚠️ **Dat besluit lag er al, en is nooit gebouwd.** Beslisdocument 001 §2.6b.3
--    zegt met zoveel woorden: *"Bij het verstrijken van de goedkeuringstermijn
--    krijgt het weekdoel alsnog zijn punten, zodat een trage buddy jou geen
--    minpunt kan bezorgen."* Het document beschreef een tráge beoordelaar; de
--    vier routes hierboven zijn het geval waarin er helemaal géén beoordelaar
--    meer is. Eén mechanisme dekt allebei.
--
-- ⚠️ **Waarom goedkeuren en niet als gemist boeken.** Alle vier de routes zijn
--    handelingen van een ánder. Iemand een minpunt geven omdat zijn buddy de
--    groep verliet, straft hem voor iets buiten zijn macht. CLAUDE.md zegt het
--    zelf bij domeinregel 8: de reeks dient de gebruiker, nooit andersom. En
--    domeinregel 7 komt erbij — een dalend puntentotaal is privé bewijs van een
--    gemiste week, en dit is een week die niet gemist ís.
--
-- ---------------------------------------------------------------------------
-- De termijn, en dat is een aanname
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Beslisdocument 001 noemt de termijn maar geeft er geen getal aan.** Zeven
--    dagen is hier ingevuld, met de reden erbij zodat het te veranderen is
--    zonder archeologie:
--
--      - de week is in deze app de enige eenheid die telt, dus een termijn in
--        weken is de minst verrassende;
--      - korter dan een week zou een voltooiing kunnen goedkeuren terwijl de
--        cyclus zelf nog loopt;
--      - langer laat iemand die niets fout deed onnodig wachten op punten die
--        hij verdiend heeft.
--
--    Hij staat als default op de parameter, dus omzetten is één regel. Zie
--    QS8-178.
--
-- ⚠️ **De klok begint bij `submitted_at` en niet bij de cyclusgrens.** De belofte
--    is dat een trage of verdwenen buddy jou niet kan benadelen; die klok hoort
--    dus te lopen vanaf het moment dat jíj je deel deed. Bij de cyclusgrens
--    beginnen zou iemand die op de laatste dag indient een kortere termijn geven
--    dan iemand die op dag één indient, en dat verschil heeft geen enkele reden.

create or replace function public.keur_vastgelopen_goedkeuringen_goed(
  p_termijn_dagen integer default 7
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rij      record;
  v_week     weekly_goals%rowtype;
  v_voltooid completions%rowtype;
  v_punten   integer;
  v_reden    text;
  v_aantal   integer := 0;
begin
  if p_termijn_dagen is null or p_termijn_dagen < 1 then
    raise exception 'p_termijn_dagen moet minstens 1 zijn, kreeg %', p_termijn_dagen;
  end if;

  -- ⚠️ **`vastgelopen_goedkeuringen()` is de enige definitie van "vastgelopen",
  --    en dat blijft zo.** Die functie spiegelt `te_beoordelen_voor()` met
  --    dezelfde vier voorwaarden; hier een eigen variant naast zetten is precies
  --    de tweede lijst die in 0032/0034 uit elkaar liep.
  for v_rij in select * from vastgelopen_goedkeuringen() loop
    select * into v_voltooid from completions where id = v_rij.completion_id;

    -- De termijn loopt vanaf het indienen. Zie de kop.
    continue when v_voltooid.submitted_at is null
              or v_voltooid.submitted_at > now() - make_interval(days => p_termijn_dagen);

    select * into v_week from weekly_goals where id = v_voltooid.weekly_goal_id;

    -- ⚠️ Alleen een week die nog écht wacht. `vastgelopen_goedkeuringen()` filtert
    --    daar al op, maar tussen die query en deze regel kan een goedkeuring
    --    binnenkomen; dan hoort deze functie niets meer te doen.
    continue when v_week.status is distinct from 'pending';

    -- ⚠️ **Dezelfde redenen en dezelfde volgorde als `award_points_on_approval()`.**
    --    Twee paden naar een goedgekeurde week met verschillende gevolgen is hoe
    --    het puntenmodel stil uit elkaar loopt; wat de trigger doet, doet dit ook.
    if v_voltooid.achieved_level = 'ceiling' then
      v_punten := v_week.points_ceiling;
      v_reden  := 'completion_approved_ceiling';
    else
      v_punten := v_week.points_floor;
      v_reden  := 'completion_approved_floor';
    end if;

    update weekly_goals set status = 'approved' where id = v_week.id;

    -- ⚠️ `group_id` is `null` en dat is geen omissie: er ís geen groep meer, want
    --    dat is nu juist waarom deze week vastliep. De normale route boekt de
    --    groep van de beoordelaar; die bestaat hier per definitie niet.
    insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id)
    values (v_rij.owner_id, v_week.goal_id, null, v_punten, v_reden, 'weekly_goal', v_week.id)
    on conflict do nothing;

    perform verdien_weekpassen(v_rij.owner_id, v_week.goal_id);
    perform herbereken_reeks(v_rij.owner_id, v_week.goal_id);

    v_aantal := v_aantal + 1;
  end loop;

  return v_aantal;
end;
$function$;

-- ⚠️ `from public, anon, authenticated` en niet `from public, anon`. In Supabase
--    deelt `alter default privileges` élke nieuwe functie in `public` uit aan
--    alle drie, en `from public, anon` houdt precies de rol over waaronder iedere
--    ingelogde gebruiker draait. Zie CLAUDE.md beveiligingsregel 4.
revoke all on function public.keur_vastgelopen_goedkeuringen_goed(integer)
  from public, anon, authenticated;

-- ⚠️ Alleen de rollover roept dit aan. Een gebruiker die zijn eigen week kan
--    laten goedkeuren is zelfgoedkeuring met een omweg, en dat is precies wat
--    peer-goedkeuring moest voorkomen (domeinregel 3).
grant execute on function public.keur_vastgelopen_goedkeuringen_goed(integer) to service_role;

comment on function public.keur_vastgelopen_goedkeuringen_goed(integer) is
  'Keurt weken goed die na de goedkeuringstermijn nog op een beoordelaar wachten '
  'die er niet meer is. Beslisdocument 001 §2.6b.3, gebouwd in QS8-178. '
  'Alleen voor de rollover; nooit voor een client.';
