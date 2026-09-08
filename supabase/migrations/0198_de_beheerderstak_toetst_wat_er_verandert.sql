-- 0198_de_beheerderstak_toetst_wat_er_verandert.sql — een beheerder raakt de rol
-- of de status van een ánder lid niet meer aan buiten de RPC's om (QS8-356)
--
-- ROLLBACK-PAD:
--   Zet `guard_group_member_update()`, `verlaat_groep()` en
--   `beslis_lidmaatschapsverzoek()` terug naar de vorm van 0187 respectievelijk
--   0102 en 0188. Alle drie zijn `create or replace`, dus grants en
--   `comment on function` blijven staan en er valt verder niets terug te draaien.
--
--   ⚠️ De twee RPC's krijgen alléén een `set_config(..., true)` erbij. Wie
--      terugdraait moet die regels weghalen én de guard terugzetten; alleen de
--      guard terugdraaien laat twee sleutels achter die niemand meer leest, en
--      dat is onschadelijk maar verwarrend.
--
-- ---------------------------------------------------------------------------
-- Wat er stuk was
-- ---------------------------------------------------------------------------
--
-- `guard_group_member_update()` (0187) doet voor een **actieve beheerder** een
-- vroege `return new` en toetst daarna niets meer.
--
-- 📏 Gemeten met echte JWT's, elk in een eigen groep:
--
--   een ánder lid tot `admin` promoveren           -> landde, geen spoor
--   een mede-beheerder naar `member` degraderen    -> landde, geen spoor
--   iemand anders op `paused` zetten               -> landde, geen spoor
--   een uitgezet lid terug op `active`             -> landde
--
-- ⚠️⚠️ **De overnameroute is de zwaarste.** De `last_admin`-grendel toetst
--    `old.user_id = auth.uid()` — alléén jezelf. Een tweede beheerder kon
--    daarmee de oprichter degraderen, en 📏 er is geen weg terug: één treffer op
--    `set role` in álle functiedefinities, en die zit in de overdracht van
--    `verlaat_groep()`. Er is geen RPC en geen scherm dat een rol zet.
--
-- ⚠️ Rolwijzigingen laten niets achter: `meld_uitzetting` vuurt op
--    `status → inactive`, `meld_nieuw_lid` op `inactive → active`. Van de vier
--    handelingen schrijft alleen de uitzetting een `group_events`-rij.
--
-- ---------------------------------------------------------------------------
-- Waarom dit geen `revoke` is
-- ---------------------------------------------------------------------------
--
-- Bij QS8-351 stond `group_members` UPDATE op de intreklijst van 0197. 📏 Die
-- revoke maakte **21 bestaande tests in zeven bestanden** rood; alleen die ene
-- grant teruggeven maakte alle 100 weer groen.
--
-- **Dit pad heeft een doel.** 0102 en 0187 zijn er juist voor gebouwd, en de
-- audittrigger schrijft een spoor "ook bij een uitzetting buiten de RPC om".
-- Intrekken maakt de guard onbereikbaar vanaf een client en heel QS8-314
-- inhoudsloos. *Een recht zonder aanroeper in de app is iets anders dan een
-- recht zonder doel.*
--
-- ---------------------------------------------------------------------------
-- De val: de trigger vuurt óók voor SECURITY DEFINER
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **`auth.uid()` blijft binnen een definer-functie de aanroeper**, dus
--    `verwijder_lid()`, `verlaat_groep()` en `beslis_lidmaatschapsverzoek()`
--    lopen door precies dezelfde beheerderstak als een rechtstreekse PATCH. Een
--    grendel die alleen kijkt naar *wat* er verandert, breekt ze alle drie.
--
-- Vandaar twee benoemde uitzonderingen, in de vorm die
-- `join_group_with_code()` al gebruikte: een `set_config(..., true)` — dat is
-- `set local`, dus alleen binnen die transactie — die niemand anders zet.
--
--   app.beheer_overgedragen    de rolwijziging in `verlaat_groep()`
--   app.lidmaatschap_besloten  de terugkeer in `beslis_lidmaatschapsverzoek()`
--
-- ⚠️ `verwijder_lid()` heeft er geen nodig: uitzetten is `* → inactive`, en dat
--    blijft een beheerdershandeling. Hij schrijft ook al een spoor.
--
-- ---------------------------------------------------------------------------
-- Het besluit: promoveren en degraderen bestaan niet
-- ---------------------------------------------------------------------------
--
-- Acceptatiecriterium 6 liet twee wegen open: het rechtstreekse pad weg, óf een
-- `group_events`-rij per rolwijziging. **Het pad gaat weg**, en dat is de
-- conservatiefste keuze die het werk áf maakt:
--
-- * 📏 er is vandaag geen scherm en geen RPC die een rol zet, dus er verdwijnt
--   niets dat bestaat;
-- * criterium 7 vroeg om een weg terug uit een degradatie — die is er niet, en
--   met dit besluit is hij ook niet nodig, want degraderen kan niet meer;
-- * een auditregel om een handeling die niemand ontworpen heeft, legitimeert
--   die handeling. Beschermd is het antwoord tot iemand het tegendeel besluit.
--
-- Wie promoveren alsnog wil, bouwt er een RPC voor met een `group_events`-rij
-- en een systeembericht — en dat laatste vraagt een migratie, want
-- `chat_messages_system_event_bekend` is een allowlist.

CREATE OR REPLACE FUNCTION public.guard_group_member_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_toegestaan boolean := false;
  v_overdracht boolean := false;
  v_besluit    boolean := false;
begin
  -- ⚠️ **Deze toets staat vóór de vroege uitgang en geldt dus voor élke rol,
  --    `service_role` inbegrepen.** Dat is de keuze die `archief_blijft_archief()`
  --    (0153) ook maakt, en om dezelfde reden: een rolfilter is geen grendel,
  --    want élke SECURITY DEFINER-functie komt er langs. 📏 Stond hij ná de
  --    uitgang, dan verplaatste `service_role` een lidmaatschap naar een andere
  --    groep met HTTP 200 en de verplaatste rij terug — gemeten, en het is de
  --    reden dat hij hier staat en niet drie regels lager.
  --
  --    `group_id` en `user_id` vormen de sleutel van de rij. Er is geen rol en
  --    geen functie die een lidmaatschap verplaatst: dat is verlaten en opnieuw
  --    toetreden. 📏 Nagemeten dat geen enkele schrijver ze aanraakt —
  --    `verlaat_groep()` en `verwijder_lid()` zetten alleen `role` en `status`.
  if new.group_id is distinct from old.group_id
     or new.user_id is distinct from old.user_id
  then
    raise exception 'lidmaatschap_verplaatst'
      using hint = 'group_id en user_id vormen de sleutel van een lidmaatschap. '
                   'Verlaat de ene groep en treed toe tot de andere.';
  end if;

  if auth.uid() is null then
    return new;
  end if;

  -- ⚠️ De grendel van 0102, ongewijzigd. Geeft je eigen rij het beheerderschap
  --    op terwijl jij de enige actieve beheerder bent? Dan is dit een vertrek in
  --    vermomming, en vertrekken loopt via `verlaat_groep()`.
  if old.user_id = auth.uid()
     and old.role = 'admin'
     and old.status <> 'inactive'
     and (new.role <> 'admin' or new.status = 'inactive')
     and not exists (
       select 1 from group_members mede
       where mede.group_id = old.group_id
         and mede.user_id <> auth.uid()
         and mede.role     = 'admin'
         and mede.status  <> 'inactive'
     )
  then
    raise exception 'last_admin'
      using hint = 'Draag het beheer over via verlaat_groep() of promoveer eerst een ander lid.';
  end if;

  -- ⚠️ Rechtstreeks op de tabel en niet via `is_group_admin()`: die geeft sinds
  --    migratie 0029 `false` voor een uitgezette beheerder, en dat is hier ook
  --    precies wat we willen — maar de bedoeling moet leesbaar blijven, dus de
  --    voorwaarde staat er uitgeschreven bij.
  if exists (
    select 1 from group_members m
    where m.group_id = old.group_id
      and m.user_id  = auth.uid()
      and m.role     = 'admin'
      and m.status  <> 'inactive'
  ) then
    -- ⚠️ De eigen rij van de beheerder is hierboven al afgehandeld: de
    --    `last_admin`-grendel is de enige regel die daarover gaat, en die staat
    --    er sinds 0102 ongewijzigd.
    if old.user_id = auth.uid() then
      return new;
    end if;

    -- -----------------------------------------------------------------------
    -- Vanaf hier: een beheerder die de rij van een ÁNDER aanraakt — QS8-356.
    -- -----------------------------------------------------------------------
    --
    -- ⚠️⚠️ **Hier stond alleen `return new`, en dat was het gat.** 📏 Gemeten met
    --    echte JWT's: een beheerder promoveerde een ander tot `admin`,
    --    degradeerde een mede-beheerder — óók de oprichter — zette iemand op
    --    `paused`, en zette een uitgezet lid terug op `active`. Van die vier
    --    schreef alleen de uitzetting een spoor.
    --
    -- ⚠️ **De trigger vuurt óók voor `SECURITY DEFINER`-functies**, want
    --    `auth.uid()` blijft daarbinnen de aanroeper. `verwijder_lid()`,
    --    `verlaat_groep()` en `beslis_lidmaatschapsverzoek()` lopen dus door
    --    precies deze tak. Vandaar de benoemde uitzonderingen hieronder, in de
    --    vorm die `join_group_with_code()` hierboven al gebruikt: een `set local`
    --    die alleen binnen die transactie geldt en die niemand anders zet.
    -- ⚠️⚠️ **`coalesce(..., false)` en dat is geen overdaad.** Een ongezette
    --    sleutel geeft `null`, en `null = <tekst>` is `null` en niet `false`.
    --    Zonder de coalesce wordt `not (v_overdracht or v_besluit)` dus `null`,
    --    vuurt de `if` níét, en laat de guard alles door — 📏 gemeten: met de
    --    drie regels erin bleven de promotie, de degradatie en het terugzetten
    --    gewoon landen.
    --
    --    ⚠️ Dezelfde uitdrukking staat hierboven in `v_toegestaan` van
    --    `join_group_with_code()` zónder coalesce, en dáár is dat veilig: die
    --    waarde staat aan de *toelaat*-kant, dus `null` betekent "niet
    --    toegelaten". Hier staat hij aan de *weiger*-kant en betekent `null`
    --    "niet geweigerd". **Dezelfde regel, tegengesteld gevolg** — dat is de
    --    reden dat hij hier expliciet staat en niet gekopieerd is.
    v_overdracht := coalesce(
      nullif(current_setting('app.beheer_overgedragen', true), '') = old.group_id::text,
      false
    );
    v_besluit := coalesce(
      nullif(current_setting('app.lidmaatschap_besloten', true), '') = old.group_id::text,
      false
    );

    -- ⚠️ **Een rolwijziging van een ander loopt alleen via `verlaat_groep()`.**
    --    Er is geen scherm en geen andere RPC die een rol zet — 📏 nagemeten met
    --    één treffer op `set role` in álle functiedefinities. Promoveren en
    --    degraderen bestaan dus niet als handeling, en dat is het besluit: de
    --    overnameroute gaat dicht in plaats van dat er een auditregel omheen
    --    komt. `beslis_lidmaatschapsverzoek()` zet `role = 'member'` mee en valt
    --    daarom ook onder de uitzondering.
    if new.role is distinct from old.role and not (v_overdracht or v_besluit) then
      raise exception 'rol_van_een_ander'
        using hint = 'Een rol van een ander lid verandert alleen bij de overdracht '
                     'in verlaat_groep(). Promoveren en degraderen bestaan niet.';
    end if;

    -- ⚠️ **Terugkomen loopt via `beslis_lidmaatschapsverzoek()`**, want daar
    --    vraagt het lid er zélf om. Een PATCH van de beheerder is geen
    --    toestemming, en hij slaat de opruiming van `verwijder_lid()` over.
    if old.status = 'inactive' and new.status <> 'inactive' and not v_besluit then
      raise exception 'lid_teruggezet'
        using hint = 'Een uitgezet lid komt terug via een lidmaatschapsverzoek, '
                     'dat het lid zelf indient en een beheerder toewijst.';
    end if;

    -- ⚠️ **`paused` schrijft niemand** (QS8-325 gaat over de vraag of die stand
    --    überhaupt hoort te bestaan). Zolang dat zo is, is een beheerder die een
    --    ánder op pauze zet een handeling die nergens ontworpen is.
    if new.status = 'paused' and old.status is distinct from 'paused' then
      raise exception 'pauze_van_een_ander'
        using hint = 'Een lidmaatschap op pauze zetten is geen beheerdershandeling.';
    end if;

    return new;
  end if;

  -- -------------------------------------------------------------------------
  -- Vanaf hier: geen actieve beheerder van deze groep.
  -- -------------------------------------------------------------------------
  --
  -- ⚠️ **De uitzondering met een naam, en niet met een `if` verderop.**
  --    `join_group_with_code()` mag één overgang maken die hier anders zou
  --    stranden: je eigen lidmaatschap van `paused` terug naar `active`, nadat
  --    een geldige uitnodigingscode is aangeboden. Die functie zet
  --    `app.hervat_lidmaatschap` op het groeps-id; niemand anders doet dat, en de
  --    instelling geldt alleen binnen die transactie (`set local`).
  --
  --    De rol blijft daarbij wat hij was — de uitzondering gaat over terugkomen,
  --    niet over rechten.
  v_toegestaan :=
        old.user_id = auth.uid()
    and old.status  = 'paused'
    and new.status  = 'active'
    and new.role    is not distinct from old.role
    and nullif(current_setting('app.hervat_lidmaatschap', true), '') = old.group_id::text;

  if v_toegestaan then
    return new;
  end if;

  -- ⚠️ **`is distinct from` en niet "je bent geen beheerder".** Een update die
  --    niets van deze kolommen verandert, is geen geweigerd verzoek maar een
  --    no-op; daar is `UPDATE 1` een eerlijk antwoord op. Alleen een verzoek dat
  --    iets zou hebben veranderd en dat niet mag, wordt hier hoorbaar geweigerd.
  if new.role      is distinct from old.role
     or new.status is distinct from old.status
     or new.joined_at is distinct from old.joined_at
  then
    raise exception 'geen_groepsbeheerder'
      using hint = 'Alleen een actieve beheerder van deze groep wijzigt rol, '
                   'status of toetredingsmoment. Vertrekken doe je met verlaat_groep().';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.verlaat_groep(p_group_id uuid, p_bevestigd boolean DEFAULT false, p_nieuwe_beheerder uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rol            text;
  v_status         text;
  v_andere_leden   integer;
  v_andere_admins  integer;
  v_gearchiveerd   boolean := false;
  v_gearchiveerd_al boolean := false;
  v_overgedragen   uuid    := null;
  v_ontkoppeld     integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  -- ⚠️ **Vergrendel de gróep en niet je eigen rij, en dat is een gerepareerde
  --    fout.** Hier stond `for update` op de eigen `group_members`-rij met het
  --    commentaar dat dat twee gelijktijdige vertrekken zou serialiseren. Dat
  --    doet het niet: de telling die de beslissing draagt gaat over de rijen van
  --    ánderen, en die worden dan nergens vergrendeld. In READ COMMITTED ziet
  --    elke sessie de nog niet gecommitte delete van de ander niet.
  --
  --    De security-review van 27-08 heeft het met twee gelijktijdige sessies
  --    afgedwongen: beide kregen `ok: true`, en er bleven nul beheerders over in
  --    een groep met een levende uitnodigingscode. Twee tabbladen zijn genoeg;
  --    er hoeft niemand iets kwaads te willen.
  --
  --    Een lock op de `groups`-rij serialiseert élk vertrek binnen één groep, en
  --    dat is precies de reikwijdte van de beslissing. `archiveer_groep()`
  --    vergrendelt dezelfde rij verderop nog een keer; binnen één transactie is
  --    dat een no-op.
  perform 1 from groups where id = p_group_id for update;

  select m.role, m.status into v_rol, v_status
  from group_members m
  where m.group_id = p_group_id
    and m.user_id  = auth.uid();

  select g.status = 'archived' into v_gearchiveerd_al
  from groups g where g.id = p_group_id;

  if v_rol is null then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;

  -- ⚠️ Uitgezet is geen vertrek. Dezelfde grens als in 0029: je eigen
  --    lidmaatschap opzeggen mag, het bewijs wissen dat je eruit gezet bent niet.
  if v_status = 'inactive' then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;

  if p_bevestigd is not true then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed');
  end if;

  -- ⚠️ `<> 'inactive'` en niet `= 'active'`, want dat is de definitie die de
  --    goedkeuringspolicy gebruikt en die 0066 (M1) als de enige juiste heeft
  --    vastgelegd. Een lid op `paused` telt mee als lid.
  select
    count(*) filter (where m.status <> 'inactive'),
    count(*) filter (where m.status <> 'inactive' and m.role = 'admin')
  into v_andere_leden, v_andere_admins
  from group_members m
  where m.group_id = p_group_id
    and m.user_id <> auth.uid();

  -- -------------------------------------------------------------------------
  -- 6a. De overdracht
  -- -------------------------------------------------------------------------
  --
  -- ⚠️ Overdragen en vertrekken in één handeling, en niet twee losse stappen.
  --    Twee stappen betekent dat er een moment bestaat waarop de overdracht wél
  --    is gelukt en het vertrek niet, of andersom — en het tweede geval is de
  --    beheerderloze groep waar dit hele stuk over gaat.
  if p_nieuwe_beheerder is not null then
    -- ⚠️ **Deze toets ontbrak, en de review van 27-08 vond hem.** De `update`
    --    hieronder wordt voor een gewoon lid stil geneutraliseerd door
    --    `guard_group_member_update()`, maar de `group_events`-rij ernaast werd
    --    wél geschreven en de functie gaf `ok: true` met `overgedragen_aan`
    --    erin. Nagemeten: rol van de "opvolger" bleef `member`, en er stond een
    --    `admin_transferred`-regel in de onveranderlijke groepsgeschiedenis.
    --
    --    Dat is twee dingen tegelijk: een vertrekker kan een bewering over
    --    iemand ánders in de audit zetten die hij niet meer kan toelichten (hij
    --    is weg, en élk lid leest `group_events`), en de eigen app liegt tegen
    --    de gebruiker over wat er gebeurd is.
    --
    -- ⚠️ Nooit vertrouwen op het feit dat een trigger de UPDATE toevallig
    --    tegenhoudt. Dat is een deur die alleen dichtzit omdat er verderop een
    --    `if` staat — dezelfde formulering als bij de `revoke` onderaan.
    if v_rol <> 'admin' then
      return jsonb_build_object('ok', false, 'reason', 'not_admin');
    end if;

    if p_nieuwe_beheerder = auth.uid() then
      return jsonb_build_object('ok', false, 'reason', 'successor_is_self');
    end if;

    if not exists (
      select 1 from group_members m
      where m.group_id = p_group_id
        and m.user_id  = p_nieuwe_beheerder
        and m.status  <> 'inactive'
    ) then
      return jsonb_build_object('ok', false, 'reason', 'unknown_successor');
    end if;

    -- ⚠️ Dit moet vóór de delete verderop: `guard_group_member_update()` (0029)
    --    laat een rolwijziging alleen door zolang de aanroeper zélf nog een
    --    actieve beheerdersrij heeft. Andersom zou de overdracht stil niets doen
    --    en de groep beheerderloos achterlaten — precies wat hier voorkomen moet
    --    worden.
    -- ⚠️ **De benoemde uitzondering voor `guard_group_member_update()`** —
    --    QS8-356. Sinds die migratie weigert de guard elke rolwijziging van een
    --    ánder lid; de overdracht is de enige plek waar dat wél hoort. `set
    --    local` (de `true` als derde argument) betekent: alleen binnen deze
    --    transactie, en niemand anders zet deze sleutel.
    perform set_config('app.beheer_overgedragen', p_group_id::text, true);

    update group_members
       set role = 'admin'
     where group_id = p_group_id
       and user_id  = p_nieuwe_beheerder;

    insert into group_events (group_id, actor_id, subject_id, event_type)
    values (p_group_id, auth.uid(), p_nieuwe_beheerder, 'admin_transferred');

    v_overgedragen  := p_nieuwe_beheerder;
    v_andere_admins := v_andere_admins + 1;
  end if;

  -- -------------------------------------------------------------------------
  -- 6b. De laatste beheerder
  -- -------------------------------------------------------------------------
  --
  -- ⚠️ Drie gevallen en niet twee. Een beheerder die als laatste lid vertrekt,
  --    kan per definitie aan niemand overdragen — die tegenhouden zou betekenen
  --    dat je nooit meer uit je eigen lege groep komt. Die groep wordt in
  --    dezelfde transactie gearchiveerd, en dat is geen extraatje: een groep
  --    zonder leden houdt zijn uitnodigingscode, en `join_group_with_code()`
  --    laat daar een wildvreemde binnen die dan het enige lid is van een groep
  --    die niemand beheert.
  --
  -- ⚠️ **Een gearchiveerde groep valt hier buiten.** Daar valt niets meer te
  --    beheren — `is_group_admin()` geeft er sinds 0092 onwaar terug en elke
  --    schrijfpolicy loopt daarlangs — dus een overdracht eisen zou de laatste
  --    beheerder opsluiten in een groep die niet meer bestaat. Vertrekken uit een
  --    archief mag altijd; het snijdt alleen nog een band door.
  if v_rol = 'admin' and v_andere_admins = 0 and not v_gearchiveerd_al then
    if v_andere_leden > 0 then
      return jsonb_build_object(
        'ok', false,
        'reason', 'last_admin',
        'leden', v_andere_leden
      );
    end if;

    -- ⚠️ **`archiveer_groep()` en niet zelf een schrijfopdracht op de
    --    groepstabel.** Dat was hier de
    --    eerste versie, en `npm run pin:controle` maakte hem terecht rood:
    --    `groups.status` is een gepinde kolom, en een SECURITY DEFINER-functie
    --    die hem zelf zet, staat buiten de trigger die de pin afdwingt. Het
    --    register in dat script kent precies vijf uitzonderingen en
    --    `archiveer_groep()` is er één van — dus de juiste reparatie is niet een
    --    zesde uitzondering, maar hergebruik van de functie die dit al bezit.
    --
    -- ⚠️ Dit werkt alleen op deze plek in de volgorde: `archiveer_groep()` eist
    --    een actieve beheerder, en die is de vertrekker hier nog. Zou het
    --    archiveren ná de `delete` staan, dan weigert het stil met `not_admin`
    --    en blijft er een ledenloze levende groep achter.
    --
    -- ⚠️ De `group_archived`-rij in `group_events` schrijft die functie zelf, dus
    --    hier staat er geen tweede.
    if (archiveer_groep(p_group_id, true) ->> 'ok') = 'true' then
      v_gearchiveerd := true;
    end if;
  end if;

  -- -------------------------------------------------------------------------
  -- 6c. Alleen déze groep laat los
  -- -------------------------------------------------------------------------
  --
  -- ⚠️ **Dit is de kop van PRD 5.6 en de reden dat er `and l.group_id =
  --    p_group_id` staat.** Zonder die voorwaarde zou een vertrek de doelen uit
  --    álle groepen halen, en dat is precies het gedrag dat dit issue verbiedt.
  --
  -- ⚠️ Alleen de doelen van de vertrekker. Een doel van iemand anders hangt hier
  --    niet aan zijn lidmaatschap.
  --
  -- ⚠️ **Eerst de openstaande deadline-verzoeken van de vertrekker in déze
  --    groep, en dat is geen opruimwerk maar een autorisatiegat.** Nagemeten met
  --    `pg_get_functiondef()` en niet uit het migratiebestand gelezen:
  --    `beslis_deadline_verzoek()` toetst het lidmaatschap van de *beslisser*
  --    (`m.user_id = auth.uid()`) en zegt niets over de aanvrager. Blijft het
  --    verzoek `open` staan, dan kan de groep die je zojuist verlaten hebt de
  --    streefdatum verzetten van een doel dat niet meer aan die groep hangt —
  --    een toestemming die zijn eigen intrekking overleeft, dezelfde klasse als
  --    beslisdocument 002 §3.
  --
  -- ⚠️ `withdrawn` en niet `rejected`: niemand heeft dit afgewezen. `decided_by`
  --    blijft leeg, en de CHECK `deadline_requests_beslissing_compleet` staat dat
  --    toe voor elke status behalve `open` — nagemeten, niet aangenomen.
  --
  -- ⚠️ Dit kost geen punt. Een deadline verschuiven is puntloos (besluit A43),
  --    en het intrekken van een verzoek dus zeker.
  update deadline_requests
     set status     = 'withdrawn',
         decided_at = now()
   where group_id     = p_group_id
     and requester_id = auth.uid()
     and status       = 'open';

  with weg as (
    delete from goal_group_links l
    using goals d
    where l.goal_id  = d.id
      and l.group_id = p_group_id
      and d.owner_id = auth.uid()
    returning 1
  )
  select count(*) into v_ontkoppeld from weg;

  delete from group_members
   where group_id = p_group_id
     and user_id  = auth.uid();

  insert into group_events (group_id, actor_id, event_type, old_value, new_value)
  values (
    p_group_id,
    auth.uid(),
    'member_left',
    jsonb_build_object('role', v_rol, 'status', v_status),
    jsonb_build_object(
      'ontkoppelde_doelen', v_ontkoppeld,
      'overgedragen_aan',   v_overgedragen,
      'gearchiveerd',       v_gearchiveerd
    )
  );

  return jsonb_build_object(
    'ok',                 true,
    'ontkoppelde_doelen', v_ontkoppeld,
    'overgedragen_aan',   v_overgedragen,
    'gearchiveerd',       v_gearchiveerd
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.beslis_lidmaatschapsverzoek(p_request_id uuid, p_naar text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      -- ⚠️ **De benoemde uitzondering voor `guard_group_member_update()`** —
      --    QS8-356. Die guard weigert sinds die migratie zowel een rolwijziging
      --    van een ander als `inactive → active` van een ander; dit is de plek
      --    waar allebei wél horen, want het lid heeft er zélf om gevraagd.
      perform set_config('app.lidmaatschap_besloten', r.group_id::text, true);

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
$function$;

-- ---------------------------------------------------------------------------
-- De teller van de sleutels — 0153, uitgebreid
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **`sleutelzetters()` meldde deze migratie zelf, en dat is precies
--    waarvoor hij gebouwd is.** 0153 zette hem neer met de reden erbij: een
--    nieuw bypass-mechanisme zonder eigen teller zou de uitzondering zijn. Deze
--    migratie maakt er twee, en de derde tak van die teller — "een
--    `app.`-sessiesleutel die in geen enkel register staat" — vond ze allebei
--    binnen één suite-run.
--
-- 📏 De twee tests die dat melden staan in `stille-weigering.test.ts` en
--    `archief-leesbaar.test.ts`, en ze werden rood zonder dat iemand ze had
--    aangeraakt. Zo hoort een grendel zich te gedragen.

CREATE OR REPLACE FUNCTION public.sleutelzetters()
 RETURNS TABLE(naam text, bezwaar text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with sleutel(instelling, toegestaan) as (
    values
      ('app.heropent_groep',      array['heropen_groep', 'archief_blijft_archief']),
      ('app.hervat_lidmaatschap', array['join_group_with_code', 'guard_group_member_update']),
      -- ⚠️ Twee sleutels erbij met QS8-356. De guard weigert sinds die migratie
      --    een rolwijziging en een terugkeer van een ánder lid; dit zijn de twee
      --    plekken waar dat wél hoort, en ze staan hier zodat de derde tak van
      --    deze teller ze niet als ongeregistreerd meldt — en zodat een vierde
      --    functie die ze zet, wél gemeld wordt.
      ('app.beheer_overgedragen',   array['verlaat_groep', 'guard_group_member_update']),
      ('app.lidmaatschap_besloten', array['beslis_lidmaatschapsverzoek', 'guard_group_member_update'])
  ),
  bekend as (
    select p.proname::text as naam, s.instelling, s.toegestaan
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join sleutel s
    where n.nspname = 'public'
      and p.prosrc like '%' || s.instelling || '%'
      and p.proname <> 'sleutelzetters'
  )
  select naam,
         'noemt ' || instelling || '; alleen ' ||
         array_to_string(toegestaan, '() en ') || '() horen die sleutel te kennen'
    from bekend
   where naam <> all (toegestaan)

  union all

  -- ⚠️ De derde tak: een `app.`-instelling die in geen enkel register hierboven
  --    staat. Zonder deze tak dekt de teller alleen de sleutels die iemand er al
  --    in heeft gezet, en is de vólgende sleutel weer ongeteld.
  select p.proname::text,
         -- ⚠️ De naam van deze functie staat met opzet niet in deze tekst.
         --    `keten:controle` telt een naam in de bron als een aanroeper, en
         --    strippen doet hij alleen commentaar — niet een tekenreeks. Een
         --    functie die zichzelf in een melding noemt, meldt zichzelf dus
         --    levend. Dezelfde klasse als het commentaargeval dat dat script in
         --    zijn eigen kop beschrijft: de tekst óver een functie is geen
         --    gebruik ervan.
         'noemt een app.-sessiesleutel die in geen enkel register van deze '
         'teller staat; een nieuwe sleutel hoort er met zijn eigen regel in '
         'te komen'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname <> 'sleutelzetters'
     and p.prosrc ~ 'app\.[a-z_]+'
     and not exists (
       select 1 from sleutel s where p.prosrc like '%' || s.instelling || '%'
     )

   order by 1;
$function$;
