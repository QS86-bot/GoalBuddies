-- 0329_een_aandeel_is_niet_weg_te_gooien_alleen_los_te_koppelen.sql — QS8-772, nazorg op 0190 en 0320
--
-- ROLLBACK-PAD:
--   Zet `verwijder_doel()` terug op de vorm van 0190: haal het blok `is_aandeel` weg
--   (`create or replace`, dus grants blijven staan). Dat opent de lus van QS8-772 weer: de
--   teambalk is dan op te blazen. Geen data te herstellen: de functie schrijft niets bij
--   een weigering.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Gevonden door de security-ronde op de zakelijke keten (20-11-2026), vervolg op QS8-655:
-- de teambalk is op te blazen via `neem_aandeel()` -> mijlpalen `done` -> ontkoppelen ->
-- `verwijder_doel()` -> opnieuw. Besluit van Quinten (21-11-2026): `verwijder_doel()` weigert
-- een aandeel; loskoppelen kan wel. Tekst voor de gebruiker (van Quinten): "Een aandeel in
-- een teamdoel kun je niet weggooien, alleen loskoppelen."
--
-- ⚠️ **Het lichaam is dat van 0190**, de laatste definitie (`grep -i "function public.verwijder_doel"`:
--    0046, 0058, 0084, 0190; geen latere). Alleen het blok `is_aandeel` is nieuw.
--
-- ⚠️ **Wat dit niet is:** geen wijziging van de teller, geen dagteller op `neem_aandeel()` en
--    geen unieke telling per aandeel (de twee andere opties van het issue, niet gekozen).
--
-- ---------------------------------------------------------------------------

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

  -- ⚠️⚠️ **Een aandeel in een teamdoel is niet weg te gooien, alleen los te koppelen**
  --    (QS8-772, besluit Quinten, 21-11-2026, variant "niet weggooien"). Zonder deze regel was
  --    de teambalk (`team_progress_events`, 0320) onbeperkt op te blazen: `neem_aandeel()`,
  --    mijlpalen op `done` zetten (ze worden geteld), de koppeling van het aandeel aan de
  --    teamgroep verwijderen, `verwijder_doel()` (binnen de bedenktijd, geen weekdoelen of
  --    punten), en opnieuw een aandeel nemen. De tellers blijven staan; de plafonds
  --    (`begrens_doelen`, `begrens_mijlpalen`) tellen alleen rijen die nog bestaan en zetten
  --    zich dus elke ronde terug.
  --
  --    ⚠️ **Vóór de toets op `goal_group_links`, en dat is de kern:** de lus ontkoppelt
  --    eerst, dus een toets die op de koppeling leunt, laat het aandeel er daarna wél door.
  --    `team_goal_shares` is de bron en blijft staan tot het teamdoel zelf weg is.
  if exists (select 1 from team_goal_shares s where s.goal_id = p_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'is_aandeel');
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

  -- 0058, en sinds 0084 uit de gedeelde bron in plaats van een derde kopie.
  --
  -- ⚠️ **Deze tak blijft staan en gaat vóór de nieuwe**, en dat is geen
  --    volgordekwestie maar een meldingskwestie: een straf die al verschuldigd
  --    is, verdient de melding die dát zegt ("je straf is al in werking
  --    getreden") en niet de algemenere. De eerste versie van deze migratie
  --    verving hem per ongeluk, en `epic9.test.ts` ving dat.
  if exists (
    select 1 from commitments c
     where c.goal_id = p_goal_id
       and c.status = any (commitment_zichtbaar_voor_groep())
  ) then
    return jsonb_build_object('ok', false, 'reason', 'commitment_in_werking');
  end if;

  -- ⚠️⚠️ **Elke commitment, en niet alleen een zichtbare** (QS8-331). Tot 0190
  --    stond hier `c.status = any (commitment_zichtbaar_voor_groep())` — dus
  --    `unlocked`, `due` en `resolved`. Een straf op `set` hield niets tegen, en
  --    die is wél bevestigd: `commitments.confirmed_at` is `NOT NULL`, dus elke
  --    rij is per constructie een vastgelegde afspraak met een auditregel erbij.
  --
  --    📏 Gemeten vóór deze migratie: straf 1 en auditregel 1 vooraf, allebei 0
  --    erna, met `{"ok": true}` als antwoord. Twee `on delete cascade`-ketens
  --    namen de hele geschiedenis mee.
  --
  --    ⚠️ Ook een `cancelled` telt mee, en dat is de kern en geen scherpslijperij:
  --    de intrekking ís het spoor dat domeinregel 5 wil bewaren. Zou hij niet
  --    meetellen, dan is intrekken-dan-verwijderen precies de omweg die deze
  --    migratie sluit.
  if exists (select 1 from commitments c where c.goal_id = p_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'heeft_commitment');
  end if;

  delete from goals where id = p_goal_id;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.verwijder_doel(uuid) is
  'Verwijdert een eigen doel binnen de bedenktijd (0046). Weigert bij een groepskoppeling, '
  'weekdoelen, geboekte punten en — sinds 0190 (QS8-331) — bij elke commitment aan het doel en (0329, QS8-772) bij een aandeel in een teamdoel, '
  'ongeacht status: die is per constructie bevestigd en draagt een auditspoor dat anders '
  'meecascadeert. Voor alles daarbuiten is archiveren de weg.';
