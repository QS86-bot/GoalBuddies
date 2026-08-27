-- 0102 — Een vertrek is een handeling en geen DELETE (QS8-57, PRD 5.6)
--
-- *Als gebruiker kan ik een groep verlaten zonder dat mijn doel uit andere
-- groepen verdwijnt.*
--
-- ---------------------------------------------------------------------------
-- ROLLBACK-PAD
-- ---------------------------------------------------------------------------
--   drop policy if exists group_members_delete on public.group_members;
--   create policy group_members_delete on public.group_members
--     for delete to authenticated
--     using ((user_id = auth.uid() and status <> 'inactive') or is_group_admin(group_id));
--   drop function if exists public.verlaat_groep(uuid, boolean, uuid);
--   create or replace function public.shares_group_with_goal(g uuid) returns boolean
--     language sql stable security definer set search_path = public, pg_temp
--   as $rb$ select exists (
--     select 1 from goal_group_links l
--     join group_members m on m.group_id = l.group_id
--     where l.goal_id = g and m.user_id = auth.uid() and m.status <> 'inactive'); $rb$;
--   alter table public.group_events drop constraint group_events_type_valid;
--   alter table public.group_events add constraint group_events_type_valid
--     check (event_type in ('visibility_changed', 'group_archived'));
--   alter table public.group_events drop column if exists subject_id;
--
-- ⚠️ Terugrollen kan alleen zolang er geen rij met `member_left` of
--    `admin_transferred` in `group_events` staat. Die moeten er eerst uit, en
--    dat is geschiedenis weggooien — geen terloopse stap. Zelfde waarschuwing
--    als in 0076 en 0092.
--
-- ⚠️ Het terugrollen van `shares_group_with_goal()` zet drie lekken terug open
--    (§2). Doe dat alleen als de reparatie zelf aantoonbaar iets breekt.
--
-- Idempotent: `create or replace`, `drop policy if exists`, `drop constraint
-- if exists`.
--
-- ---------------------------------------------------------------------------
-- 1. Wat er open stond, en waarom een DELETE er niet aan voldoet
-- ---------------------------------------------------------------------------
--
-- Vertrekken kón al: `group_members_delete` (0029) laat je je eigen rij
-- verwijderen zolang je niet uitgezet bent. Drie dingen kloppen daar niet aan,
-- en alle drie staan ze in de acceptatiecriteria van QS8-57.
--
--   1. **De laatste beheerder kon zomaar weg.** Wat er overbleef was een groep
--      met leden en zonder beheerder: niemand kan de naam wijzigen, de
--      uitnodigingslink intrekken, de zichtbaarheid omzetten of de groep
--      archiveren. `groups_delete` staat sinds 0092 op `using (false)`, dus die
--      groep is daarna ook niet meer op te ruimen. Onherstelbaar vanuit de app.
--
--      Erger nog is de lege variant. Een groep zonder één actief lid houdt zijn
--      `invite_code`, en `join_group_with_code()` werkt gewoon door — dus een
--      wildvreemde die de link ooit heeft gezien, kan er later in en is dan het
--      enige lid van een groep die niemand beheert.
--
--   2. **Je doel bleef achter.** `goal_group_links` heeft geen enkele band met
--      `group_members`, dus de koppeling overleeft het vertrek. Zie punt 3 voor
--      wat dat betekende.
--
--   3. **Het vertrek was eenzijdig, en dat is een lek.** Zie hieronder.
--
-- ---------------------------------------------------------------------------
-- 2. `shares_group_with_goal()` vroeg nooit of de eigenaar er nog bij hoort
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Dit is de zwaarste vondst van dit issue en hij is uitgevoerd, niet
--    beredeneerd.** De functie beantwoordde één vraag: is de kíjker actief lid
--    van een groep waar dit doel aan hangt. Over de eigenaar zei ze niets.
--
-- Nagemeten op een verse database uit deze map:
--
--     bob vóór het vertrek van alice ziet haar doel: true
--     bob ná  het vertrek van alice ziet haar doel: true      ← het lek
--     alice na haar vertrek nog lid van de groep:   false
--
-- Het vertrek was dus eenzijdig: Alice raakt de groep kwijt, de groep houdt
-- Alice. Zeven policies lopen langs deze functie — `goals_select`,
-- `weekly_goals_select`, `completions_select`, `milestones_select`,
-- `daily_moves_select`, `breathers_select` en `goal_events_select` — dus de
-- oud-groep bleef haar doel, haar mijlpalen, haar weekdoelen en haar
-- voltooiingen lezen. Onbeperkt, en zonder dat zij er iets van ziet.
--
-- In een **open** groep (0077) is dat bovendien een schending van domeinregel 7
-- op de vervelendste manier die er is: wie een open groep verlaat, blijft zijn
-- gemiste weken aan die groep uitdelen. Vertrekken is precies de handeling
-- waarmee iemand zegt dat hij dat niet meer wil.
--
-- ⚠️ **Drie routes naar hetzelfde effect, en ze gaan hier alle drie dicht.**
--    Dat is de duurste les van dit project (WERKVOORRAAD §7): 0043 t/m 0046
--    kostten vier migraties omdat elke reparatie te smal was. Het effect dat
--    voorkomen moet worden is "iemand die niet meer bij een groep hoort, is via
--    die groep tóch zichtbaar". De routes:
--
--      a. de eigenaar is vertrokken           → twee sloten, zie hieronder
--      b. de eigenaar staat op `inactive`     → 0029 deed dit voor de kíjker en
--                                               vergat de eigenaar
--      c. de groep is gearchiveerd            → 0092 zette de archieftoets in
--                                               `is_group_member()` en
--                                               `is_group_admin()`, en deze
--                                               functie gebruikt geen van beide
--
--    Route (b) en (c) staan los van QS8-57 en zouden op zichzelf een eigen
--    issue zijn. Ze gaan hier tóch mee omdat het één predicaat in één functie
--    is: twee van de drie dichtzetten is dezelfde fout nog een keer maken, en
--    de dichtgestreepte regel is de plek waar niemand meer kijkt.
--
-- ⚠️ **Route (a) zit dubbel op slot, en dat is gemeten en niet aangenomen.**
--    `verlaat_groep()` haalt de koppeling wég (§6c), dus na een vertrek is er
--    geen `goal_group_links`-rij meer om langs te kijken. Het predicaat
--    hieronder is daar de tweede grendel: het vangt élke koppeling die blíjft
--    staan terwijl de eigenaar er niet meer bij hoort.
--
--    De proef: met het oude predicaat terug (en de nieuwe RPC intact) blijft de
--    vertrektest gróén en worden alleen de tests voor (b) en (c) rood. Dat is
--    geen argument tégen het predicaat maar de reden erváár — het vertrekpad
--    heeft nu twee sloten, en (b) en (c) hebben er maar één. Wie de koppeling
--    ooit laat staan (een uitzetting, een accountverwijdering, een pad dat er
--    nog niet is), valt terug op dit predicaat.
--
-- ⚠️ **Wat dit níét verandert.** De eigenaar zelf blijft alles zien: elk van de
--    zeven policies heeft daarnaast een `owner_id = auth.uid()`-tak, en die
--    raakt dit niet. Een gewoon groepslid blijft de doelen van zijn buddy's
--    zien, want die zijn allebei actief lid. Er is één positieve tegentest per
--    route in `tests/rls/vertrek.test.ts` — zonder die tegenhanger bewijst een
--    lege uitkomst alleen dat er iets anders stuk is (valkuil 10).

begin;

-- ---------------------------------------------------------------------------
-- 3. Eén functie, drie voorwaarden
-- ---------------------------------------------------------------------------
--
-- ⚠️ Eén slot en niet zeven, om de reden die 0092 opschreef: er lopen zeven
--    policies langs deze functie en er komen er meer bij. Zeven losse
--    voorwaarden is zeven kansen om er één te vergeten.
--
-- ⚠️ De eigenaar wordt uit `goals` gehaald en niet meegegeven. Een parameter
--    zou een tweede plek zijn waar "wie is de eigenaar" staat, en de aanroeper
--    is hier altijd een policy-expressie die hem niet bij de hand heeft.

create or replace function public.shares_group_with_goal(g uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from goal_group_links l
    join goals         d on d.id       = l.goal_id
    join groups        gr on gr.id     = l.group_id
    -- De kijker hoort er nog bij.
    join group_members m on m.group_id = l.group_id
                        and m.user_id  = auth.uid()
                        and m.status  <> 'inactive'
    -- En de eigenaar ook. Dit was de ontbrekende helft.
    join group_members o on o.group_id = l.group_id
                        and o.user_id  = d.owner_id
                        and o.status  <> 'inactive'
    where l.goal_id  = g
      and gr.status <> 'archived'
  );
$$;

comment on function public.shares_group_with_goal(uuid) is
  'Deelt de kijker een levende groep met dit doel, waar de eigenaar óók nog '
  'actief lid van is? ⚠️ De eigenaarshelft en de archieftoets zijn er in 0102 '
  'bij gekomen: zonder die twee bleef een oud-lid zijn doel, weekdoelen en '
  'voltooiingen aan een groep uitdelen die hij verlaten had. Zie QS8-57.';

-- ---------------------------------------------------------------------------
-- 3b. Dezelfde twee sloten op de open-groepstakken
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Dit is de bevinding die de security-review van 27-08 blokkerend noemde,
--    en hij had gelijk.** §3 repareerde `shares_group_with_goal()` en de kop van
--    deze migratie beweerde daarmee dat de drie routes "alle drie dicht" gingen.
--    Dat klopte voor `goals_select`. Het klopte **niet** voor
--    `weekly_goals_select`, en dat is precies de policy waar het om gaat.
--
--    Die policy heeft sinds 0077 een dérde tak die dezelfde vraag zélf
--    beantwoordt, met het oude predicaat:
--
--      (owner_id = auth.uid())
--      or (shares_group_with_goal(goal_id) and status <> all (…))   ← gerepareerd
--      or deelt_open_groep_met_doel(goal_id)                        ← niet
--
--    Nagemeten in een open groep met een weekdoel op `status = 'missed'`:
--
--      tegentest, alles normaal, kijker ziet de gemiste week:  1
--      route b — eigenaar op `inactive`, kijker ziet hem nog:  1
--      route c — groep gearchiveerd, kijker ziet hem nog:      1
--
--    Een beheerder van een open groep kon dus iemand uitzetten en daarna
--    onbeperkt diens **gemiste weken** blijven lezen. Dat is domeinregel 7 op de
--    zwaarste kolom die er is, en de uitgezette persoon ziet er niets van.
--
-- ⚠️ **De les eronder is die van §2, en hij is duur betaald.** Ik repareerde één
--    functie en schreef in de kop dat het effect dicht was. Er waren twee
--    functies die dezelfde vraag beantwoorden. Een dichtgestreepte regel is de
--    plek waar niemand meer kijkt — dat staat in WERKVOORRAAD §7 en het is hier
--    binnen één migratie nóg een keer gebeurd. **Zoek bij een predicaat niet
--    alleen de aanroepers, maar ook de functies die het overschríjven.**
--
-- ⚠️ Waarom de testsuite dit niet zag, en dat is regel 18 vraag 3 in het echt:
--    `tests/rls/vertrek.test.ts` las `goals` en al zijn fixtures waren
--    **beschermde** groepen. De open-groepstak kon per constructie nooit rood
--    worden. Er staat nu een fixture met `zichtbaarheid = 'open'` die
--    `weekly_goals` leest, met een positieve tegentest ernaast.

create or replace function public.deelt_open_groep_met_doel(g uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from goal_group_links l
    join goals         d  on d.id       = l.goal_id
    join groups        gr on gr.id      = l.group_id
    join group_members m  on m.group_id = l.group_id
                         and m.user_id  = auth.uid()
                         and m.status  <> 'inactive'
    join group_members o  on o.group_id = l.group_id
                         and o.user_id  = d.owner_id
                         and o.status  <> 'inactive'
    where l.goal_id        = g
      and gr.zichtbaarheid = 'open'
      and gr.status       <> 'archived'
  );
$$;

comment on function public.deelt_open_groep_met_doel(uuid) is
  'Deelt de kijker een lévende open groep met dit doel, waar de eigenaar óók '
  'nog actief lid van is? ⚠️ De eigenaarshelft en de archieftoets zijn er in '
  '0102 bij gekomen, tegelijk met dezelfde reparatie in '
  'shares_group_with_goal(). Deze functie draagt de gevoeligste tak die er is: '
  'in een open groep laat hij `weekly_goals.status = ''missed''` door.';

-- ⚠️ Dezelfde vorm, en daarom in dezelfde migratie. `chain_links_select` heeft
--    naast `is_group_member(group_id) and group_period_start >= …` een
--    open-groepstak die geen van beide draagt: geen archieftoets en geen venster
--    van acht dagen. De Ketting telt alleen op, dus er lekt vandaag geen
--    tegenslag — maar het is structureel hetzelfde gat, en het los laten liggen
--    is hoe 0043 t/m 0046 er vier werden.
create or replace function public.lid_van_open_groep(gid uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from group_members m
    join groups g on g.id = m.group_id
    where m.group_id      = gid
      and m.user_id       = auth.uid()
      and m.status       <> 'inactive'
      and g.zichtbaarheid = 'open'
      and g.status       <> 'archived'
  );
$$;

comment on function public.lid_van_open_groep(uuid) is
  'Actief lid van een lévende open groep. ⚠️ De archieftoets is er in 0102 bij '
  'gekomen: zonder die toets bleef een gearchiveerde open groep zijn schakels '
  'uitdelen.';

-- ---------------------------------------------------------------------------
-- 4. Vertrekken loopt niet meer via een DELETE uit de client
-- ---------------------------------------------------------------------------
--
-- ⚠️ `using (false)` en niet "de policy weghalen": onwrikbare regel 1 wil op
--    elke tabel een policy voor alle vier de werkwoorden, zodat er staat dát
--    erover nagedacht is. Zelfde vorm als `groups_delete` sinds 0092.
--
-- ⚠️ **Dit weigert stil en niet luid, en dat is geen slordigheid maar de aard
--    van DELETE.** RLS filtert de rij weg; een DELETE die niets raakt is geen
--    fout, dus PostgREST antwoordt met 204 en een ongewijzigde tabel
--    (valkuil 5). Een test die op `42501` rekent, wordt hier groen zonder iets
--    te bewijzen. `tests/rls/vertrek.test.ts` toetst daarom de úitkomst — staat
--    de rij er nog? — via `magNietLanden()`.
--
-- ⚠️ **Er verdwijnt geen knop.** Er is vandaag geen enkel scherm dat een rij uit
--    `group_members` verwijdert — nagemeten met een grep op `src/` en `app/`,
--    niet aangenomen. Een lid uitzetten loopt sinds 0029 via `status =
--    'inactive'` (een UPDATE), en dat blijft ongemoeid.

drop policy if exists group_members_delete on public.group_members;

create policy group_members_delete on public.group_members
  for delete to authenticated
  using (false);

comment on policy group_members_delete on public.group_members is
  'Niemand verwijdert nog een lidmaatschap vanuit een client. Vertrekken gaat '
  'via verlaat_groep(); een lid uitzetten via status = ''inactive''.';

-- ---------------------------------------------------------------------------
-- 5. `member_left` als spoor
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Wél in `group_events`, niet in de groepschat**, en dat is een beslissing.
--    Een nieuw systeembericht vraagt een migratie én een regel in
--    `SYSTEEM_GEBEURTENISSEN`, en die drempel bestaat om precies deze vraag af
--    te dwingen: mag de groep dit zien? Domeinregel 7 zegt dat de feed
--    uitsluitend positieve signalen draagt, en een vertrek is er geen. Het is
--    ook geen tegenslag van een ánder — maar "niet verboden" is in dit project
--    geen argument om iets te tónen; voor élk nieuw oppervlak is beschermd het
--    antwoord tot iemand het tegendeel besluit.
--
--    De groep merkt het vertrek sowieso: de naam staat niet meer in de
--    ledenlijst. Daar is geen aankondiging voor nodig die tien jaar in de
--    geschiedenis blijft staan, want een chatbericht is een onveranderlijke
--    kopie (beslisdocument 002 §3). `archiveer_groep()` maakte in 0092 dezelfde
--    keuze om een andere reden, en het spoor hoort in beide gevallen in
--    `group_events` — dat is de plek waar een audit hoort.

-- ⚠️ **En er is een tweede, scherpere reden om hem uit de chat te houden, die
--    uit de planning van dit issue kwam.** `VERBODEN_GEBEURTENISSEN` bevat
--    `member_inactive`: "iemand is uit de groep gezet" mag nooit in de chat.
--    Zou "iemand is zélf vertrokken" er wél in komen, dan wordt **de afwezigheid
--    van het bericht het signaal**: verdwijnt een naam uit de ledenlijst zonder
--    regel in de chat, dan is hij eruit gezet. Dat is exact de constructie die
--    0070 vermeed door de ketting-mijlpaal cumulatief te maken in plaats van
--    conditioneel. Een bericht toevoegen zou hier dus niet één ding
--    onthullen maar twee, en het tweede is andermans oordeel over iemand.
--
-- ⚠️ `admin_transferred` staat er los naast en niet als veld in `member_left`.
--    Een rolwissel is een eigen gebeurtenis met een eigen actor en een eigen
--    ontvanger, en een audit die hem in de nieuwe waarde van een ánder feit
--    verstopt, is een audit die je moet weten te lezen.

-- ⚠️ **De opvolger krijgt een echte kolom en geen veld in `new_value`.** Dat was
--    hier de eerste versie, en `npm run persoon:controle` maakte hem terecht
--    rood: een uuid in jsonb heeft geen foreign key, dus `on delete set null`
--    raakt hem niet en de persoon blijft afleidbaar uit een rij die volgens
--    0031/0033 juist geanonimiseerd hoort te zijn. Dat is de algemene regel van
--    0059, nagelopen in 0085 — en dit is de eerste keer dat de controle hem
--    vóór het landen gevonden heeft in plaats van erna.
--
-- ⚠️ `group_events` draagt geen enkele trigger (nagemeten in `pg_trigger`), dus
--    valkuil 6 speelt hier niet: er is niets dat de `set null` in dezelfde
--    bewerking terugdraait.

alter table public.group_events
  add column if not exists subject_id uuid references profiles (id) on delete set null;

-- ⚠️ Onwrikbare regel 11, en sinds 0097 een test die er zelf naar zoekt:
--    `tests/rls/indexdekking.test.ts` werd rood op precies deze foreign key
--    voordat deze regel er stond. Een `on delete set null` zonder index scant
--    de hele tabel bij elke accountverwijdering.
create index if not exists group_events_subject_idx
  on public.group_events (subject_id)
  where subject_id is not null;

comment on column public.group_events.subject_id is
  'De persoon over wie de gebeurtenis gaat, als dat iemand anders is dan de '
  'actor — vandaag alleen de nieuwe beheerder bij admin_transferred (0102). '
  '⚠️ Een echte kolom en geen jsonb-veld: alleen zo wist het verwijderen van '
  'een account de verwijzing mee. Zie 0059 en 0085.';

alter table public.group_events drop constraint if exists group_events_type_valid;
alter table public.group_events add constraint group_events_type_valid
  check (event_type in (
    'visibility_changed', 'group_archived', 'member_left', 'admin_transferred'
  ));

-- ---------------------------------------------------------------------------
-- 6. `verlaat_groep()`
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Geeft `{ok, reason}` terug en gooit niet.** In een SECURITY DEFINER-RPC
--    overleeft niets een `raise exception`: PostgREST draait elke RPC in zijn
--    eigen transactie, dus gooien rolt ook de `group_events`-rij terug die net
--    is weggeschreven. Dat is de les van 0017 en hij geldt hier onverkort.
--    `auth.uid() is null` is de ene uitzondering — daar valt niets te bewaren,
--    en het is dezelfde vorm als `archiveer_groep()`.
--
-- ⚠️ **Bevestiging verplicht**, net als bij `zet_groepszichtbaarheid()` en
--    `archiveer_groep()`. Vertrekken is niet terug te draaien vanuit de app:
--    terugkomen vraagt een geldige uitnodigingscode, en die heeft de vertrekker
--    misschien niet meer.
--
-- ⚠️ **Wat deze functie met opzet níét doet is opruimen.** Geen voltooiing, geen
--    goedkeuring, geen schakel in De Ketting, geen chatbericht en geen
--    puntenregel wordt aangeraakt — niet van de vertrekker en niet van de groep.
--    Domeinregel 6 zegt dat geschiedenis append-only is, en beslisdocument 001
--    §2.5 zegt met zoveel woorden dat het vertrek van een lid de historische
--    ketting niet mag wijzigen. Het enige dat weggaat is het lidmaatschap zelf
--    en de koppelingen van de vertrekker aan déze groep.
--
-- ⚠️ **Het minpunt is niet te ontlopen door te vertrekken.** `beoordeelbaar` is
--    sinds 0066 een grendel die maar één kant op beweegt: het ontkoppelen
--    hieronder zet hem niet terug. Een lopende week die al beoordeelbaar was,
--    blijft dat, en de rollover boekt het minpunt zoals altijd. Dat is
--    nadrukkelijk gecontroleerd, want "vertrek op vrijdag, kom maandag terug"
--    is exact de vorm die 0066 moest dichten.
--
--    De keerzijde is echt en blijft staan: wie vertrekt met een week op
--    `pending` die nog niemand beoordeeld heeft, verliest de kans op die
--    goedkeuring in déze groep. Hing het doel ook aan een andere groep, dan
--    pakt `openstaande_beoordelingen()` die groep op en gaat de beoordeling
--    daar gewoon door — en dat is precies de belofte van PRD 5.6.

create or replace function public.verlaat_groep(
  p_group_id          uuid,
  p_bevestigd         boolean default false,
  p_nieuwe_beheerder  uuid    default null
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
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
$$;

comment on function public.verlaat_groep(uuid, boolean, uuid) is
  'Verlaat één groep. Ontkoppelt alleen de doelen van de vertrekker van déze '
  'groep (PRD 5.6), raakt geen enkele voltooiing, goedkeuring of schakel aan '
  '(domeinregel 6), en weigert een laatste beheerder zonder overdracht. Is de '
  'vertrekker het laatste lid, dan wordt de groep gearchiveerd — anders blijft '
  'er een beheerderloze groep achter met een werkende uitnodigingscode.';

-- ⚠️ `anon` er expliciet af. Zonder sessie is `auth.uid()` leeg en gooit de
--    functie al, maar een SECURITY DEFINER-functie die anoniem aanroepbaar is,
--    is een deur die alleen dichtzit omdat er toevallig een `if` in staat.
revoke all on function public.verlaat_groep(uuid, boolean, uuid) from public, anon;
grant execute on function public.verlaat_groep(uuid, boolean, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. De twee deuren náást de knop
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Dit is de duurste les van dit project, en hij is bij het schrijven van
--    déze migratie opnieuw misgegaan.** §6 zet een nette route naar buiten neer
--    met een laatste-beheerder-eis, en de security-review van 27-08 liep er twee
--    keer omheen zonder die functie aan te raken. Het effect dat voorkomen moet
--    worden is niet "iemand roept `verlaat_groep()` verkeerd aan" maar **"er
--    blijft een groep achter die niemand kan beheren en waarvan de
--    uitnodigingscode werkt"**. Zoek élke bewerking die dát bereikt.

-- ---------------------------------------------------------------------------
-- 7a. Een beheerder kon zichzelf op `inactive` zetten
-- ---------------------------------------------------------------------------
--
-- `guard_group_member_update()` (0029) pint `role` en `status` voor een
-- niet-beheerder, en laat een beheerder élke kolom van élke rij zetten — ook
-- zijn eigen. Gemeten:
--
--     select verlaat_groep(g, true, null);
--     -- {"ok": false, "reason": "last_admin"}          ← de RPC weigert netjes
--     update group_members set status = 'inactive'
--      where group_id = g and user_id = <zelf>;
--     -- UPDATE 1                                       ← en dit lukt gewoon
--
--     actieve leden: 1 / actieve admins: 0
--     bob kan archiveren?      {"ok": false, "reason": "not_admin"}
--     bob kan code intrekken?  {"ok": false, "reason": "not_admin"}
--     wildvreemde met code:    {"ok": true, ...}
--     alice kan terug?         {"ok": false, "reason": "removed"}
--
-- Eén PATCH op `/rest/v1/group_members` en de groep is onherstelbaar — precies
-- het wrak dat §1 van deze migratie als reden opvoert.
--
-- ⚠️ **Waarom een `raise` en geen pin op `old`.** Pinnen weigert stil (valkuil
--    5): de client krijgt 204 en denkt dat het gelukt is. Hier valt bovendien
--    niets te bewaren — dit is een trigger en geen SECURITY DEFINER-RPC, dus de
--    les van 0017 speelt niet.
--
-- ⚠️ **Waarom niet `role` en `status` van de eigen rij onvoorwaardelijk pinnen.**
--    Dat brak het terugkomen: `join_group_with_code()` doet een upsert die je
--    eigen `status` van `paused` naar `active` zet. Nagelezen in
--    `pg_get_functiondef()`, niet aangenomen. De regel moet dus de *specifieke
--    overgang* raken en niet de kolom.
--
-- ⚠️ **Alleen de eigen rij, en dat is voldoende.** Nul beheerders is alleen te
--    bereiken door zelf je adminschap op te geven: wie een ánder degradeert,
--    moet zelf beheerder zijn en blijft dat.

create or replace function public.guard_group_member_update()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  -- ⚠️ De nieuwe grendel, vóór de bestaande takken. Geeft je eigen rij het
  --    beheerderschap op terwijl jij de enige actieve beheerder bent? Dan is dit
  --    een vertrek in vermomming, en vertrekken loopt via `verlaat_groep()` —
  --    daar zit de overdracht in, en daar wordt een lege groep gearchiveerd.
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
    new.group_id := old.group_id;
    new.user_id  := old.user_id;
    return new;
  end if;

  new.role      := old.role;
  new.status    := old.status;
  new.group_id  := old.group_id;
  new.user_id   := old.user_id;
  new.joined_at := old.joined_at;

  return new;
end;
$$;

comment on function public.guard_group_member_update() is
  'Pint `role` en `status` voor een niet-beheerder (0029), en weigert sinds 0102 '
  'dat de énige actieve beheerder zijn eigen adminschap opgeeft — dat is een '
  'vertrek in vermomming en het loopt via verlaat_groep().';

-- ---------------------------------------------------------------------------
-- 7b. Een verwijderd account liet een lege groep achter
-- ---------------------------------------------------------------------------
--
-- `verwijder_mijn_account()` (0031) heeft een eigen laatste-beheerder-toets en
-- die klopt — maar alleen voor groepen mét andere leden. Bij een sólo-groep
-- cascadeert het lidmaatschap weg (`on delete cascade`) terwijl de groep blijft
-- staan (`created_by` is `on delete set null`). Gemeten:
--
--     account verwijderen: {"ok": true}
--     groep na afloop: status=active  invite_revoked=false  leden=0
--     wildvreemde treedt toe met de oude code: {"ok": true, ...}
--
-- Woordelijk het scenario dat §6b in `verlaat_groep()` afvangt door te
-- archiveren. Twee routes naar buiten, één ervan gerepareerd — en dat is de
-- vorm waar dit project 0043 t/m 0046 voor betaald heeft.
--
-- ⚠️ Archiveren en niet verwijderen, om de reden van 0092: weggooien cascadeert
--    naar zes tabellen en raakt daarmee de geschiedenis van niemand anders —
--    maar bij een solo-groep is dat de eigen geschiedenis, en die gaat met het
--    account toch mee. Archiveren is hier het goedkopere en het consistente
--    antwoord.

create or replace function public.verwijder_mijn_account()
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  mij  uuid := auth.uid();
  solo record;
begin
  if mij is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  -- ⚠️ Laatste beheerder van een groep met andere leden? Dan eerst het
  --    beheerderschap overdragen. Zonder deze regel blijft er een groep achter
  --    die niemand meer kan beheren: de code niet roteren, geen lid uitzetten,
  --    de groep niet opheffen. Dat is geen verwijdering maar een wrak.
  if exists (
    select 1
    from group_members mijn
    where mijn.user_id = mij
      and mijn.role    = 'admin'
      and mijn.status <> 'inactive'
      and exists (
        select 1 from group_members ander
        where ander.group_id = mijn.group_id
          and ander.user_id <> mij
          and ander.status <> 'inactive'
      )
      and not exists (
        select 1 from group_members mede
        where mede.group_id = mijn.group_id
          and mede.user_id <> mij
          and mede.role     = 'admin'
          and mede.status  <> 'inactive'
      )
  ) then
    return jsonb_build_object('ok', false, 'reason', 'last_admin');
  end if;

  -- ⚠️ Sinds 0102: de groepen waarvan ik het énige actieve lid ben, gaan mee het
  --    archief in. Anders blijft er een `active` groep staan met nul leden en een
  --    werkende uitnodigingscode, en loopt een wildvreemde er als enig,
  --    niet-beherend lid binnen.
  --
  -- ⚠️ **Via `archiveer_groep()` en niet met een eigen schrijfopdracht op de
  --    groepstabel**, om dezelfde reden als in `verlaat_groep()` §6b:
  --    `groups.status` is een gepinde kolom, en `npm run pin:controle` maakte de
  --    eerste versie hiervan terecht rood. Het register in dat script kent vijf
  --    uitzonderingen; de juiste reparatie is hergebruik en geen zesde.
  --
  -- ⚠️ Dit werkt alleen vóór de delete: `archiveer_groep()` eist een actieve
  --    beheerder, en dat ben ik in mijn eigen solo-groep nog. De bevestiging is
  --    hier `true` omdat de gebruiker het verwijderen van zijn account al
  --    bevestigd heeft — dit is er een gevolg van en geen losse handeling.
  for solo in
    select g.id
    from groups g
    where g.status <> 'archived'
      and exists (
        select 1 from group_members m
        where m.group_id = g.id and m.user_id = mij and m.status <> 'inactive'
      )
      and not exists (
        select 1 from group_members m
        where m.group_id = g.id and m.user_id <> mij and m.status <> 'inactive'
      )
  loop
    perform archiveer_groep(solo.id, true);
  end loop;

  delete from auth.users where id = mij;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.verwijder_mijn_account() is
  'Verwijdert het eigen account. Weigert bij een laatste beheerderschap in een '
  'groep met andere leden (0031), en archiveert sinds 0102 de groepen waarvan ik '
  'het enige actieve lid was — anders blijft er een lege groep met een werkende '
  'uitnodigingscode achter.';

commit;
