-- 0189_de_weg_terug_na_uitzetting_werkt_echt.sql — een aangenomen verzoek maakt de
-- aanvrager ook echt lid, ook als er nog een uitgezette rij van hem ligt (QS8-328).
--
-- ROLLBACK-PAD:
--   Speel het `create or replace function beslis_lidmaatschapsverzoek(...)`-blok
--   uit 0145_melden_en_blokkeren.sql opnieuw af, én zet de trigger terug met
--   `create or replace trigger group_members_systeembericht after insert on
--   group_members for each row execute function meld_nieuw_lid();` plus het
--   `meld_nieuw_lid()`-blok uit 0102. De handtekeningen veranderen niet, dus
--   `create or replace` volstaat en er is geen drop nodig.
--
--   ⚠️ **Speel 0145 niet als geheel opnieuw af.** Dat bestand herdefinieert óók
--      `join_group_with_code()`, en 0187 heeft die functie vier dagen geleden
--      gerepareerd: 0145 kent `app.hervat_lidmaatschap` niet, dus een integraal
--      terugzetten haalt de reparatie van QS8-314 weg en laat die functie weer
--      succes melden over iets dat niet gebeurd is. Een rollback-pad dat naar een
--      bestand wijst in plaats van naar een functie, draait onder tijdsdruk meer
--      terug dan de wijziging waar het bij hoort. Gevonden in de security-ronde
--      op dit issue.
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
-- ⚠️ **De auditrij blijft precies wat hij was.** In de eerste versie van deze
--    kop stond dat een veld 'teruggekeerd' in `group_events` een níeuw
--    oppervlak zou zijn waarop élk lid kan lezen dat iemand ooit uit de groep is
--    gezet. 📏 Dat is nagemeten en het klopt niet: `meld_uitzetting()` schrijft
--    al een rij `member_removed` mét `subject_id`, en `group_events_select` is
--    `mag_groep_lezen(group_id)` zonder filter op `event_type`. Dat oppervlak
--    bestáát dus. De rij blijft ongewijzigd om een saaiere reden: er is niemand
--    die het veld leest, en dit project heeft een eigen issue over backend-werk
--    zonder aanroeper (QS8-194).
--
-- ⚠️ **Om diezelfde reden is 'teruggekeerd' ook uit het ántwoord gehaald.** Het
--    stond er als signaal voor de beslissende beheerder, maar
--    `beslisVerzoek()` in `src/modules/buddies/ontdekken.ts` gooit alles behalve
--    `ok` en `reason` weg, en het scherm toont in beide gevallen dezelfde zin.
--    Regel 18 vraag 5: elk schakeltje af en de keten loopt nergens heen. Dat de
--    beheerder bij het beslissen niet ziet dat het om een oud-lid gaat, is een
--    echte tekortkoming — maar een van het scherm, en die staat als eigen issue.
--
-- ⚠️ **Wat er wél bij moest: de terugkeer krijgt een systeembericht.** De
--    trigger `group_members_systeembericht` stond op AFTER INSERT, dus een
--    eerste toetreder werd aangekondigd en een teruggekeerd lid niet. Dat is
--    precies de constructie die beslisdocument 002 rij 22 vermijdt bij een
--    vertrek: **dan wordt de afwezigheid van het bericht het signaal.** Een naam
--    die in de ledenlijst verschijnt zónder regel in de chat is per constructie
--    iemand die er eerder al was, en dat kan élk lid aflezen. De trigger vuurt
--    daarom ook op de overgang `inactive` → `active`, met precies hetzelfde
--    bericht als bij een eerste toetreding — geen letter meer.
--
-- ⚠️ De `paused`-overgang krijgt bewust géén bericht. Een adempauze telt in
--    `status <> 'inactive'` gewoon mee, dus zo iemand staat al in de ledenlijst
--    en er is geen gat om te vullen; een bericht zou dáár juist iets zeggen wat
--    de lijst niet zegt. QS8-325 gaat over die toestand.
--
-- ⚠️ **De groepsrij wordt als eerste vergrendeld, en dat is een gemeten
--    reparatie en geen voorzorg.** De eerste versie nam `for update` op de
--    lidmaatschapsrij en schreef daarna pas in `group_events` — en die insert
--    neemt via zijn foreign key een `FOR KEY SHARE` op de gróepsrij. De
--    slotvolgorde was dus lidmaatschap → groep, terwijl `verwijder_lid()` en
--    `verlaat_groep()` het andersom doen. 📏 Met twee gelijktijdige sessies
--    uitgelokt:
--
--      ERROR:  deadlock detected
--      CONTEXT: while locking tuple in relation "group_members"
--
--    Twee beheerders die het oneens zijn over hetzelfde lid — precies het geval
--    waarin dit pad gebruikt wordt — konden elkaar zo laten vastlopen; één van
--    de twee kreeg 40P01, via PostgREST een HTTP 500. Sinds deze versie is de
--    volgorde groep → lidmaatschap, gelijk aan de twee buurfuncties. 📏 Ook
--    nagemeten dat niets `groups` vóór `group_join_requests` vergrendelt: de zes
--    functies die de groepsrij vergrendelen raken die tabel geen van alle aan.
--
-- ⚠️ **`on conflict do nothing` staat weer op de invoegtak.** Een
--    `select … for update` dat nul rijen oplevert neemt géén slot, dus de
--    null-tak kan gekozen zijn op een toestand die intussen veranderd is: komt
--    de aanvrager op datzelfde moment via een uitnodigingslink binnen, dan valt
--    een kale insert om met 23505 en rolt de hele transactie terug — het verzoek
--    blijft op `pending` staan en de beheerder ziet een serverfout. De oude code
--    had die clausule; hem weghalen was een regressie.
--
-- ⚠️ **De twee grenzen worden hier geteld, en dat was een gat.** 📏 Het plafond
--    van 12 actieve leden en de grens van 10 groepen per gebruiker staan
--    uitsluitend in `join_group_with_code()` en `create_group()` — er is geen
--    CHECK en geen trigger die ze draagt. Gemeten: een groep met 12 actieve
--    leden groeide via dit pad naar 13. Dat gold al voor de invoegtak sinds
--    0144; de terugkeertak zou het gat verbreden, want een uitgezet lid telt in
--    `status <> 'inactive'` níet mee en duwt de groep er bij terugkeer per
--    definitie overheen. Beide grenzen tellen daarom hetzelfde als in
--    `join_group_with_code()` — twee tellingen van hetzelfde plafond die
--    verschillend rekenen, is een limiet die van je route afhangt.
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
  r            group_join_requests;
  v_bestaand   text;
  v_leden      integer;
  v_groepen    integer;
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

  if p_naar = 'accepted' then
    -- ⚠️ De gróepsrij eerst, en pas daarna de lidmaatschapsrij. Zie de kop: de
    --    omgekeerde volgorde gaf een gemeten deadlock met `verwijder_lid()`.
    perform 1 from groups where id = r.group_id for update;

    select m.status into v_bestaand
    from group_members m
    where m.group_id = r.group_id and m.user_id = r.user_id
    for update;

    -- ⚠️ **De grenzen vóór het verzoek als afgehandeld te merken**, anders
    --    staat het verzoek op `accepted` terwijl er niets gebeurd is — precies
    --    de klasse waar dit issue over gaat.
    if v_bestaand is distinct from 'active' then
      select count(*) into v_leden
      from group_members
      where group_id = r.group_id and status <> 'inactive';

      if v_leden >= 12 then
        return jsonb_build_object('ok', false, 'reason', 'group_full');
      end if;

      -- Dezelfde telling als in `join_group_with_code()` en `create_group()`:
      -- twee tellingen van hetzelfde plafond die verschillend rekenen, is een
      -- limiet die van je route afhangt.
      select count(*) into v_groepen
      from group_members m
      join groups g on g.id = m.group_id
      where m.user_id  = r.user_id
        and m.status  <> 'inactive'
        and g.status  <> 'archived';

      if v_groepen >= 10 then
        return jsonb_build_object('ok', false, 'reason', 'too_many_groups');
      end if;
    end if;
  end if;

  update group_join_requests
     set status = p_naar, decided_by = (select auth.uid()), decided_at = now()
   where id = p_request_id;

  if p_naar = 'accepted' then
    if v_bestaand is null then
      -- ⚠️ `on conflict do nothing` blijft staan: het `for update` hierboven nam
      --    geen slot omdat er geen rij was, dus de aanvrager kan intussen via
      --    een uitnodigingslink binnengekomen zijn. Zie de kop.
      insert into group_members (group_id, user_id, role, status)
      values (r.group_id, r.user_id, 'member', 'active')
      on conflict do nothing;

    elsif v_bestaand <> 'active' then
      -- De terugkeer waar het verzoek om vroeg. `role` gaat mee naar 'member':
      -- zie de kop.
      update group_members
         set status = 'active',
             role   = 'member'
       where group_id = r.group_id and user_id = r.user_id;
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

  return jsonb_build_object('ok', true, 'status', p_naar);
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
  'lag (QS8-328). Een teruggekeerd lid krijgt altijd rol member, telt mee voor '
  'het ledenplafond, en wordt in de chat aangekondigd als elke andere toetreder.';

-- ---------------------------------------------------------------------------
-- De terugkeer krijgt hetzelfde systeembericht als een eerste toetreding
-- ---------------------------------------------------------------------------
--
-- ⚠️ Zie de kop. De trigger stond op AFTER INSERT, dus alleen een eerste
--    toetreder werd aangekondigd — en daarmee werd de afwezigheid van het
--    bericht het signaal dat iemand er eerder al was (beslisdocument 002 rij 22,
--    in spiegelbeeld).
--
-- ⚠️ Alleen de overgang `inactive` → `active`. Een `paused`-lid telt al mee in
--    `status <> 'inactive'` en staat dus al in de ledenlijst; daar is geen gat
--    om te vullen, en een bericht zou er juist iets zeggen wat de lijst niet
--    zegt.
--
-- ⚠️ `member_joined` bestaat al in de CHECK `chat_messages_system_event_bekend`
--    en in `src/modules/buddies/chat-schemas.ts`. Er komt hier dus géén nieuw
--    type systeembericht bij — dat zou een eigen migratie én een aanpassing in
--    dat bestand vragen.

create or replace function meld_nieuw_lid()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Alleen een terugkeer uit `inactive` telt als een toetreding. Elke andere
  -- update laat deze trigger met rust.
  if tg_op = 'UPDATE'
     and not (old.status = 'inactive' and new.status = 'active')
  then
    return new;
  end if;

  begin
    if exists (
      select 1 from groups g where g.id = new.group_id and g.created_by = new.user_id
    ) then
      return new;
    end if;

    perform plaats_systeembericht(
      new.group_id,
      'member_joined',
      weergavenaam(new.user_id) || ' doet mee.',
      new.user_id
    );
  exception
    when others then
      raise warning 'Systeembericht member_joined is niet geplaatst: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists group_members_systeembericht on group_members;

create trigger group_members_systeembericht
after insert or update on group_members
for each row execute function meld_nieuw_lid();

commit;
