-- 0188_de_weg_terug_na_uitzetting_werkt_echt.sql — een aangenomen verzoek maakt de
-- aanvrager ook echt lid, ook als er nog een uitgezette rij van hem ligt (QS8-328).
--
-- ROLLBACK-PAD:
--   De vorige versie van `beslis_lidmaatschapsverzoek(uuid, text)` staat in
--   0145_melden_en_blokkeren.sql; die opnieuw afspelen zet deze wijziging terug.
--   De handtekening verandert niet, dus `create or replace` volstaat en er is
--   geen drop nodig.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Aangewezen in de security-ronde op QS8-314 (migratie 0187) en daarna zelf
-- gemeten met een echte fixture — niet uit de functiebron geconcludeerd, want
-- dat is in dit project geen bewijs.
--
-- 📏 De meting, met een lokale stack en echte JWT's: anna zet cor uit de groep,
--    cor vraagt lidmaatschap aan, anna neemt aan. Uitkomst vóór deze migratie:
--
--      beslis_lidmaatschapsverzoek → {"ok": true, "status": "accepted"}
--      group_members.status        → 'inactive'      ← onveranderd
--      group_events                → een rij 'join_request_decided'
--
--    De beheerder krijgt te horen dat het gelukt is, er komt een rij in de
--    onveranderlijke groepsgeschiedenis, en de aanvrager staat nog steeds
--    buiten. Dat is de vorm die 0102 en 0187 al eerder opleverden: een bewering
--    over iets dat niet gebeurd is.
--
-- ⚠️ **En het is geen race maar de normale weg terug.**
--    `vraag_lidmaatschap_aan()` weigert een aanvraag van een bestaand lid, maar
--    toetst met zoveel woorden `m.status <> 'inactive'` — een uitgezet lid mág
--    dus aanvragen. Dat is ook zijn énige weg terug: `join_group_with_code()`
--    weigert hem met `removed` (0029). Kwam die aanvraag vervolgens uit bij
--    `on conflict do nothing`, dan was de hele terugweg dood en zei niets dat.
--
-- ---------------------------------------------------------------------------
-- Wat er verandert
-- ---------------------------------------------------------------------------
--
-- De bestaande rij wordt gelézen in plaats van weggeslikt, en de tak hangt aan
-- wat er werkelijk staat:
--
--   geen rij       → invoegen, zoals hiervoor
--   'active'       → de gewenste toestand is al bereikt (de uitnodigingscode-race
--                    die het oude commentaar noemde). Niets te doen.
--   'inactive'     → heractiveren: dit is de terugkeer waar het verzoek om vroeg
--   'paused'       → idem; de tak bestaat, de toestand vandaag nog niet (QS8-325)
--
-- Na deze migratie geldt in alle drie de gevallen: **zegt de functie `ok`, dan
-- is de aanvrager ook echt actief lid.** De auditrij en het lidmaatschap kunnen
-- niet meer uit elkaar lopen, en dát is de belofte waar de test op staat — niet
-- de tak.
--
-- ⚠️ **`role` gaat mee terug naar 'member', en dat is een beveiligingskwestie
--    en geen netheid.** `verwijder_lid()` zet alleen `status` op 'inactive' en
--    laat `role` staan; de rij van een uitgezette beheerder draagt dus nog
--    `role = 'admin'`. Alleen de status omzetten zou die rechten stilzwijgend
--    teruggeven aan iemand die er juist uit was gezet. De invoegtak schrijft al
--    'member'; de terugkeertak hoort hetzelfde te doen.
--
-- ⚠️ **De auditrij blijft precies wat hij was, en dat is een besluit.** De
--    verleiding was om er 'teruggekeerd' in te zetten zodat de beheerder ziet
--    dat hij iemand terughaalt die eerder verwijderd is. Maar `group_events` is
--    groepszichtbaar en append-only: dat zou een nieuw oppervlak zijn waarop
--    élk lid kan lezen dat iemand ooit uit de groep is gezet. Domeinregel 7
--    zegt dat beschermd het antwoord is tot iemand het tegendeel besluit.
--    Het signaal gaat daarom mee in het **antwoord aan de aanroeper** — dat
--    leest alleen de beheerder die de knop indrukt — en niet in de
--    geschiedenis.
--
-- ⚠️ De UPDATE hieronder laat `guard_group_member_update()` (0187) wél vuren,
--    anders dan de INSERT van hiervoor. Dat is goed: `auth.uid()` is hier de
--    beslissende beheerder, die trigger ziet een actieve beheerder van de groep
--    en laat rol en status door — hij pint alleen `group_id` en `user_id` vast.
--    Zou de beslisser géén actieve beheerder zijn, dan was hij hierboven al op
--    `not_admin` afgeketst.

begin;

create or replace function beslis_lidmaatschapsverzoek(p_request_id uuid, p_naar text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r             group_join_requests;
  v_bestaand    text;
  v_teruggekeerd boolean := false;
begin
  if (select auth.uid()) is null then
    raise exception 'Niet ingelogd';
  end if;

  if p_naar is null or p_naar not in ('accepted', 'declined') then
    return jsonb_build_object('ok', false, 'reason', 'unknown_decision');
  end if;

  select * into r from group_join_requests where id = p_request_id for update;

  if r.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if not is_group_admin(r.group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  if r.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'already_decided');
  end if;

  -- QS8-232, route 3. Afwijzen mag altijd; aannemen niet.
  if p_naar = 'accepted' and blokkade_met_groep(r.group_id, r.user_id) then
    return jsonb_build_object('ok', false, 'reason', 'blocked');
  end if;

  update group_join_requests
     set status = p_naar, decided_by = (select auth.uid()), decided_at = now()
   where id = p_request_id;

  if p_naar = 'accepted' then
    -- ⚠️ De rij vergrendelen vóór de beslissing erover. Zonder `for update`
    --    kan er tussen het lezen en het schrijven een tweede beheerder langs
    --    komen, en dan is de tak gekozen op een toestand die niet meer geldt.
    select m.status into v_bestaand
    from group_members m
    where m.group_id = r.group_id and m.user_id = r.user_id
    for update;

    if v_bestaand is null then
      insert into group_members (group_id, user_id, role, status)
      values (r.group_id, r.user_id, 'member', 'active');

    elsif v_bestaand <> 'active' then
      -- De terugkeer waar het verzoek om vroeg. `role` gaat mee naar 'member':
      -- zie de kop.
      update group_members
         set status = 'active',
             role   = 'member'
       where group_id = r.group_id and user_id = r.user_id;

      v_teruggekeerd := true;
    end if;
    -- v_bestaand = 'active': de gewenste toestand is al bereikt. Niets te doen,
    -- en het verzoek is terecht als aangenomen afgehandeld.
  end if;

  insert into group_events (group_id, actor_id, event_type, old_value, new_value)
  values (
    r.group_id,
    (select auth.uid()),
    'join_request_decided',
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', p_naar)
  );

  return jsonb_build_object('ok', true, 'status', p_naar, 'teruggekeerd', v_teruggekeerd);
end;
$$;

-- ⚠️ Elke `revoke` noemt `authenticated` met zoveel woorden: `alter default
--    privileges` deelt een nieuwe functie in `public` aan anon, authenticated
--    én service_role uit, en `from public, anon` houdt precies de rol over
--    waaronder iedere ingelogde gebruiker draait. Zie het beslisdocument van
--    28-08 en de grendel in tests/rls/functiegrants.test.ts.
revoke all on function beslis_lidmaatschapsverzoek(uuid, text) from public, anon, authenticated;
grant execute on function beslis_lidmaatschapsverzoek(uuid, text) to authenticated;

comment on function beslis_lidmaatschapsverzoek(uuid, text) is
  'Neemt een lidmaatschapsverzoek aan of wijst het af. Zegt hij ok, dan is de '
  'aanvrager ook echt actief lid — ook als er nog een uitgezette rij van hem '
  'lag (QS8-328). Een teruggekeerd lid krijgt altijd rol member.';

commit;
