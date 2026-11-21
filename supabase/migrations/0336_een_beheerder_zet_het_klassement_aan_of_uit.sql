-- 0336_een_beheerder_zet_het_klassement_aan_of_uit.sql — QS8-666 (A57), PR 2: de schakelaar
--
-- ROLLBACK-PAD:
--   drop function if exists public.zet_groepsklassement(uuid, boolean, boolean);
--   -- en `zet_klassement_beginstand()` terugzetten op de vorm van 0333 (nieuwe groep: alleen aan als hij open is):
--   --   new.klassement_aan := new.zichtbaarheid = 'open' and new.organization_id is null and not new.automatisch;
--   -- en `zet_groepsontdekbaarheid()` terugzetten op de vorm van 0302 (zonder het uitzetten van het klassement).
--   -- Rijen met 'leaderboard_changed' in `group_events` en 'leaderboard_enabled'/'leaderboard_disabled' in
--   -- `chat_messages` hoeven niet weg: beide typen staan sinds 0333 in de allowlists.
--
-- ---------------------------------------------------------------------------
-- Wat dit doet
-- ---------------------------------------------------------------------------
--
-- PR 1 (0333) gaf de groep een schakelaar `klassement_aan` die voor geen client schrijfbaar is. Dit is de enige weg
-- ernaartoe voor een beheerder: `zet_groepsklassement(p_group_id, p_aan, p_bevestigd)`, met een bevestiging, een rij in
-- `group_events` en een systeembericht, in beide richtingen (besluit 40 en 41 van het A57-document).
--
-- ⚠️ **Dit hoort samen uit te rollen met PR 1** (besluit Quinten, 21-11-2026): zonder deze functie heeft een groep die
--    open en weer beschermd wordt een klassement dat niemand kan uitzetten.
--
-- ⚠️ **Wat een bevestiging hier betekent.** `points_ledger` bewaart de `group_id` altijd. Aanzetten maakt dus ook de punten
--    zichtbaar die al in deze groep verdiend zijn; dat staat in de bevestigingstekst (T5, besluit Quinten 21-11-2026).
--    Daarom `p_bevestigd` en geen stille `update`.
--
-- ⚠️ **Geen rem (P2, besluit Quinten 21-11-2026).** Anders dan bij `zet_groepszichtbaarheid()` is er geen `too_soon`:
--    aan en uit kunnen elkaar zonder wachttijd opvolgen. Elke wissel laat een rij en een bericht achter, dus een beheerder
--    die heen en weer schakelt, doet dat zichtbaar.
--
-- ⚠️ **Volgorde van de toetsen is met opzet:** teamgroep en automatisch gevormde groep komen vóór de beheerderstoets.
--    Een automatisch gevormde groep heeft geen beheerder, en `is_group_admin()` bevat sinds 0317 ook de teambeheerder; wie
--    de beheerderstoets vooraan zet, geeft voor die twee groepen de verkeerde reden of, bij een teambeheerder, een ja.
--
-- ⚠️ **Beginstand van een nieuwe groep (besluit 42 en 43, A57):** elke nieuwe groep zonder organisatie en niet automatisch
--    begint met het klassement aan, ook een beschermde. Bestaande beschermde groepen blijven uit tot een beheerder het aanzet.
--
-- ⚠️ **Vindbaar maken zet het klassement uit (besluit Quinten, 21-11-2026, vraag 1).** `zet_groepsontdekbaarheid()`
--    zet bij `p_naar = true` ook `klassement_aan` op false, met een `group_events`-rij en een systeembericht (alleen als
--    het klassement aanstond). Een beheerder zet het daarna apart weer aan met `zet_groepsklassement()`. Reden: een groep
--    waar onbekenden zich bij kunnen voegen mag niet stilzwijgend een klassement houden dat voor vrienden besloten is
--    (domeinregel 7, QS8-230). Het lichaam is dat van 0302, de laatste definitie.
--
-- ---------------------------------------------------------------------------

create or replace function public.zet_klassement_beginstand()
returns trigger
language plpgsql
set search_path = public, pg_catalog, pg_temp
as $$
begin
  -- Besluit 42/43 (A57): elke nieuwe groep zonder organisatie, niet automatisch gevormd, begint met het klassement aan.
  new.klassement_aan := new.organization_id is null
                        and not new.automatisch;
  return new;
end;
$$;

create or replace function public.zet_groepsklassement(p_group_id uuid, p_aan boolean, p_bevestigd boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_oud    boolean;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  if p_aan is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_state');
  end if;

  -- Teamgroep en automatisch gevormde groep eerst: zie de kop. ⚠️ Alleen voor wie de groep mag lezen (bevinding
  -- security-review): een buitenstaander met een groeps-uuid leert hier anders welk soort groep het is, en krijgt
  -- `not_admin` zoals bij elke andere groep.
  if mag_groep_lezen(p_group_id) then
    if exists (select 1 from groups g2 where g2.id = p_group_id and g2.organization_id is not null) then
      return jsonb_build_object('ok', false, 'reason', 'teamgroep');
    end if;

    if exists (select 1 from groups g2 where g2.id = p_group_id and g2.automatisch) then
      return jsonb_build_object('ok', false, 'reason', 'automatisch');
    end if;
  end if;

  -- P6: een gearchiveerde groep weigert met zijn eigen reden. `is_group_admin()` is onwaar voor een archief, dus deze toets
  -- staat vóór de beheerderstoets, en alleen voor wie de groep mag lezen: een buitenstaander leert hier niets over een groep.
  if exists (select 1 from groups g2 where g2.id = p_group_id and g2.status = 'archived')
     and mag_groep_lezen(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'archived');
  end if;

  if not is_group_admin(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  -- ⚠️ Nogmaals, nu zonder ledentoets: `is_group_admin()` is sinds 0317 ook waar voor een organisatiebeheerder die geen lid
  --    is van de teamgroep. Die komt hier, en krijgt dan de reden en geen 23514 van de CHECK `groups_team_geen_klassement`.
  --    Wie hier komt is beheerder, dus de reden lekt niets.
  if exists (select 1 from groups g2 where g2.id = p_group_id and g2.organization_id is not null) then
    return jsonb_build_object('ok', false, 'reason', 'teamgroep');
  end if;

  if exists (select 1 from groups g2 where g2.id = p_group_id and g2.automatisch) then
    return jsonb_build_object('ok', false, 'reason', 'automatisch');
  end if;

  if p_bevestigd is not true then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed');
  end if;

  -- ⚠️ `for update`: twee beheerders die tegelijk omzetten zouden anders allebei "was uit" lezen en allebei een bericht
  --    plaatsen, en het spoor zou twee keer dezelfde overgang tonen terwijl er één was.
  select g.klassement_aan, g.status into v_oud, v_status
  from groups g
  where g.id = p_group_id
  for update;

  if v_oud is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_group');
  end if;

  -- P6 (besluit Quinten 21-11-2026): een gearchiveerde groep is niet te wijzigen.
  if v_status = 'archived' then
    return jsonb_build_object('ok', false, 'reason', 'archived');
  end if;

  if v_oud = p_aan then
    return jsonb_build_object('ok', false, 'reason', 'unchanged');
  end if;

  -- ⚠️ `current_user` is hier de eigenaar van deze functie en niet `authenticated`, dus `pin_groepsklassement()` laat
  --    de kolom staan: één route naar deze kolom, en die toetst zelf.
  update groups set klassement_aan = p_aan where id = p_group_id;

  insert into group_events (group_id, actor_id, event_type, old_value, new_value)
  values (
    p_group_id,
    auth.uid(),
    'leaderboard_changed',
    jsonb_build_object('klassement', v_oud),
    jsonb_build_object('klassement', p_aan)
  );

  -- Geen titel en geen punten in de tekst: het gaat over de groep (domeinregel 7, tweede slot).
  perform plaats_systeembericht(
    p_group_id,
    case when p_aan then 'leaderboard_enabled' else 'leaderboard_disabled' end,
    case when p_aan
         then 'Het klassement staat aan in deze groep.'
         else 'Het klassement staat uit in deze groep.'
    end,
    p_subject_id => auth.uid()
  );

  return jsonb_build_object('ok', true, 'klassement', p_aan);
end;
$function$;

revoke all on function public.zet_groepsklassement(uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.zet_groepsklassement(uuid, boolean, boolean) to authenticated;

comment on function public.zet_groepsklassement(uuid, boolean, boolean) is
  'Zet het klassement van een groep aan of uit (A57, QS8-666): alleen een actieve beheerder, met bevestiging, een rij in '
  'group_events en een systeembericht. Nooit voor een teamgroep, een automatisch gevormde groep of een gearchiveerde groep.';

-- Vindbaar maken zet het klassement uit (besluit Quinten 21-11-2026). Lichaam van 0302 + het klassement.
create or replace function public.zet_groepsontdekbaarheid(p_group_id uuid, p_naar boolean, p_bevestigd boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_oud   boolean;
  v_zicht text;
  v_cat   text;
  v_klas  boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Niet ingelogd';
  end if;

  if p_naar is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_state');
  end if;

  -- ⚠️⚠️ **Vóór de beheerderstoets, en dat was de bug.** Deze tak stond eronder,
  --    en een automatisch gevormde groep heeft per constructie géén beheerder:
  --    `is_group_admin()` is er altijd onwaar. 📏 Gemeten: een lid kreeg
  --    `not_admin` en nooit `automatisch`, dus de tak was onbereikbaar voor
  --    precies de groepen waarvoor hij geschreven is. Een grendel die zijn eigen
  --    geval niet haalt bewaakt niets — en de kop van 0300 beweerde dat de
  --    gebruiker hier een zin leest die niemand ooit gezien heeft.
  --
  --    ⚠️ Dit verruimt niets: het antwoord was al "nee". Wat verandert is wélke
  --    reden de gebruiker leest, en of de i18n-sleutel ervoor bereikbaar is.
  if exists (select 1 from groups g2 where g2.id = p_group_id and g2.automatisch) then
    return jsonb_build_object('ok', false, 'reason', 'automatisch');
  end if;

  if not is_group_admin(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  if p_bevestigd is not true then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed');
  end if;

  select g.ontdekbaar, g.zichtbaarheid, g.categorie, g.klassement_aan
    into v_oud, v_zicht, v_cat, v_klas
  from groups g
  where g.id = p_group_id
  for update;

  if v_oud is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_group');
  end if;

  if v_oud = p_naar then
    return jsonb_build_object('ok', false, 'reason', 'unchanged');
  end if;

  -- ⚠️ De twee voorwaarden geven een eigen reden terug en geen `23514`. De
  --    CHECK is de grendel; dit is de uitleg, en een scherm kan er iets mee.
  if p_naar and v_zicht <> 'beschermd' then
    return jsonb_build_object('ok', false, 'reason', 'not_protected');
  end if;

  if p_naar and v_cat is null then
    return jsonb_build_object('ok', false, 'reason', 'no_category');
  end if;

  -- Besluit Quinten 21-11-2026 (QS8-666): vindbaar maken zet het klassement uit. Een groep van onbekenden krijgt zo
  -- nooit stilzwijgend een klassement; een beheerder kan het daarna apart aanzetten met zet_groepsklassement().
  -- Eén update, zodat er geen tussenstand is. `current_user` is hier de eigenaar: pin_groepsklassement() laat de kolom staan.
  update groups
     set ontdekbaar = p_naar,
         klassement_aan = case when p_naar then false else klassement_aan end
   where id = p_group_id;

  insert into group_events (group_id, actor_id, event_type, old_value, new_value)
  values (
    p_group_id,
    (select auth.uid()),
    'discoverable_changed',
    jsonb_build_object('ontdekbaar', v_oud),
    jsonb_build_object('ontdekbaar', p_naar)
  );

  if p_naar and v_klas then
    insert into group_events (group_id, actor_id, event_type, old_value, new_value)
    values (p_group_id, (select auth.uid()), 'leaderboard_changed',
            jsonb_build_object('klassement', true), jsonb_build_object('klassement', false));
    perform plaats_systeembericht(
      p_group_id, 'leaderboard_disabled', 'Het klassement staat uit in deze groep.',
      p_subject_id => (select auth.uid())
    );
  end if;

  if p_naar then
    perform plaats_systeembericht(
      p_group_id,
      'group_discoverable',
      'Deze groep is vanaf nu te vinden voor mensen die je nog niet kent. Zij zien de naam, het onderwerp, de omschrijving en het aantal leden — verder niets.',
      null,
      (select auth.uid()),
      null
    );
  end if;

  return jsonb_build_object('ok', true, 'ontdekbaar', p_naar, 'klassement', case when p_naar then false else v_klas end);
end;
$function$;
