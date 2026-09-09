-- 0204_paused_is_geen_lidmaatschapstoestand.sql — `paused` gaat uit de CHECK op
-- `group_members.status` en uit de drie functies die hem lazen (QS8-325)
--
-- ROLLBACK-PAD:
--   alter table public.group_members drop constraint if exists group_members_status_valid;
--   alter table public.group_members
--     add constraint group_members_status_valid
--     check (status in ('active', 'inactive', 'paused'));
--
--   en zet `ketting_stand()`, `join_group_with_code()`,
--   `guard_group_member_update()` en `sleutelzetters()` terug naar de vorm van
--   respectievelijk 0107, 0187, 0199 en 0200. Alle vier zijn `create or replace`,
--   dus grants en `comment on function` blijven staan; de twee commentaren die
--   deze migratie herschrijft, horen dan ook terug.
--
--   ⚠️ De `update` hieronder is niet terug te draaien: een rij die op `paused`
--      stond, staat daarna op `active` en er is geen kolom die onthoudt dat dat
--      zo was. 📏 Gemeten voordat hij hier kwam te staan: het echte project
--      (`wehgocadxehottiiyvsc`) heeft **nul** rijen in `group_members`, van welke
--      status dan ook. Hij is er voor een omgeving die dat niet is.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten op de lokale stack tegen `pg_get_functiondef()`, en met een grep
--    over `src/`, `app/` en `scripts/`:
--
--   group_members_status_valid          check (status in ('active','inactive','paused'))
--   functies die 'paused' SCHRIJVEN     geen
--   client-code die 'paused' schrijft   geen
--   functies met een 'paused'-literal   guard_group_member_update, join_group_with_code,
--                                       ketting_stand
--   objectcommentaren die hem noemen    shares_group_with_user, join_group_with_code
--
-- `verlaat_groep()` verwijdert de rij, `verwijder_lid()` zet `inactive`. Er is
-- geen weg waarlangs een lidmaatschap op `paused` komt — ook niet voor
-- `service_role`, want sinds 0199 werpt de beheerderstak `pauze_van_een_ander`
-- en de niet-beheerderstak `geen_groepsbeheerder`.
--
-- ---------------------------------------------------------------------------
-- Waarom hij weggaat en niet een schrijver krijgt
-- ---------------------------------------------------------------------------
--
-- 📏 **De adempauze die het product bedoelt, bestaat al en is bereikbaar.**
--    `docs/PRODUCT-PROPOSAL.md` regel 70: "Vacation Mode (14 dagen) →
--    **Adempauze** — tot 2 cycli, vooraf aangekondigd aan je groep." Dat is
--    letterlijk `breathers`: hele cycli (`breathers_hele_cycli`), aangekondigd
--    (`announced_at`), met `plan_adempauze()` en `annuleer_adempauze()` en een
--    aanroeper in `src/modules/goals/adempauze.ts`.
--
--    `ketting_stand()` had daardoor twee vrijstellingen naast elkaar voor
--    dezelfde gedachte: een `breathers`-toets die werkt, en een statusfilter op
--    een waarde die niemand kan zetten.
--
-- ⚠️ `group_members.status = 'paused'` is dus niet een half gebouwde feature
--    maar dezelfde feature op de verkeerde korrel — per lidmaatschap in plaats
--    van per doel — uit 0001, van vóór `breathers`. Er is geen productvraag die
--    hij beantwoordt die de adempauze niet al beantwoordt.
--
-- ⚠️⚠️ **Wat dit besluit níét is: een uitspraak dat `<> 'inactive'` hetzelfde
--    mag worden als `= 'active'`.** Die twee vallen vanaf nu samen, en dat is
--    precies de reden om de grens te laten staan zoals hij staat: komt er ooit
--    een derde status, dan is het verschil weer een verschil. De zeven
--    hulpfuncties blijven ongemoeid.
--
-- Volledige afweging: docs/decisions/2026-09-08-paused-was-de-adempauze-op-de-verkeerde-plek.md
--
-- ---------------------------------------------------------------------------
-- Wat er blijft staan
-- ---------------------------------------------------------------------------
--
-- ⚠️ Twee functiecommentaren in het *lichaam* van `getuigenissen_voor()` en
--    `verlaat_groep()` noemen `paused` nog als bestaande stand. Ze worden hier
--    niet aangeraakt: **een functie wordt vervangen als haar lichaam verandert,
--    en een commentaar erin wordt bijgewerkt bij de eerstvolgende vervanging.**
--    `verlaat_groep()` is 263 regels; die overschrijven om één zin te wijzigen
--    begraaft de echte wijzigingen van deze migratie in kopieerwerk, en dat kost
--    de security-review meer dan de zin oplevert. Er staat een rij over in
--    `docs/ENGINEER-REVIEW.md`.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. De rijen die er niet zijn
-- ---------------------------------------------------------------------------
--
-- ⚠️ `paused` telde overal mee als lidmaatschap (`status <> 'inactive'`), dus
--    `active` is de vertaling die niets wegneemt. Er staan **vier** triggers op
--    deze tabel en geen ervan houdt deze `update` tegen: `meld_nieuw_lid` eist
--    `inactive → active`, `meld_uitzetting` eist `→ inactive`,
--    `noteer_beoordelaar_weg_lid` keert vroeg terug zodra `auth.uid()` NULL is,
--    en `group_members_guard` — de BEFORE-trigger die hem wél had kunnen
--    weigeren — doet dat op dezelfde voorwaarde. In een migratie is `auth.uid()`
--    NULL. 📏 Nagemeten in `pg_get_functiondef()` van alle vier, en met een
--    echte rij in een teruggedraaide transactie.
--
-- ⚠️ Dat het er vier zijn en niet drie, is een correctie uit de security-review
--    op deze branch. De drie claims klopten; de telling niet, en de vierde was
--    net de enige die had kunnen tegenhouden.
update public.group_members set status = 'active' where status = 'paused';

-- ---------------------------------------------------------------------------
-- 2. De CHECK
-- ---------------------------------------------------------------------------
--
-- `drop ... if exists` en dan `add`: dat is de idempotente vorm. Een tweede keer
-- draaien geeft dezelfde constraint met dezelfde naam.
alter table public.group_members
  drop constraint if exists group_members_status_valid;

alter table public.group_members
  add constraint group_members_status_valid
  check (status in ('active', 'inactive'));

-- ---------------------------------------------------------------------------
-- 3. De Ketting telt zonder de dubbele vrijstelling
-- ---------------------------------------------------------------------------
create or replace function public.ketting_stand(p_group_id uuid, p_period_start date)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with in_aanmerking as (
    select m.user_id
    from group_members m
    join profiles     p on p.id = m.user_id
    where m.group_id = p_group_id
      -- ⚠️ Hier stond `not in ('inactive', 'paused')`. De tweede waarde was de
      --    adempauze op de verkeerde korrel; de echte staat hieronder, in
      --    `breathers`, en die telt per doel en per cyclus.
      and m.status <> 'inactive'
      and not exists (
        select 1
        from breathers        b
        join goals            g on g.id = b.goal_id
        join goal_group_links l on l.goal_id = g.id
        where b.user_id  = m.user_id
          and l.group_id = p_group_id
          -- ⚠️ De klok van het lid zelf, niet die van de server. Zie de kop:
          --    `current_date` stond hier en kostte de groep een voltallige week
          --    zodra één lid in een andere tijdzone zat.
          and (now() at time zone p.tz)::date between b.starts_cycle and b.ends_cycle
      )
  ),
  schakels as (
    select count(*) as aantal
    from chain_links c
    join in_aanmerking a on a.user_id = c.user_id
    where c.group_id = p_group_id
      and c.group_period_start = p_period_start
  )
  select jsonb_build_object(
    'schakels',      (select aantal from schakels),
    'in_aanmerking', (select count(*) from in_aanmerking),
    'voltallig',     (select aantal from schakels) >= greatest((select count(*) from in_aanmerking), 1)
  )
  where is_group_member(p_group_id);
$$;

revoke all on function public.ketting_stand(uuid, date) from public, anon, authenticated;
grant execute on function public.ketting_stand(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Toetreden met een code: de terugweg die nergens meer heen leidt
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Wat hier weggaat is de uitzondering van 0187, en dat is de grootste
--    wijziging van deze migratie.** `join_group_with_code()` zette
--    `app.hervat_lidmaatschap` zodat `guard_group_member_update()` de overgang
--    `paused → active` van je eigen rij doorliet. Zonder `paused` is er niets
--    om terug te komen ván.
--
-- ⚠️ De `on conflict` blijft staan en wordt `do nothing`, en dat is geen
--    verslapping: hij ving nooit iets anders af dan `paused`. `inactive` keert
--    hierboven al terug met `reason = 'removed'` (regel 51 van de functie), dus
--    de enige bestaande rij die hier nog aankomt is er één die al `active` is.
--    📏 `do update set status = <dezelfde waarde>` liep daarvoor de BEFORE-trigger
--    in en kwam er via de no-op-tak weer uit; `do nothing` doet dat niet meer,
--    en er verandert niets aan de uitkomst voor de aanroeper.
create or replace function public.join_group_with_code(code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target       groups%rowtype;
  pogingen     integer;
  leden        integer;
  lidmaatschap integer;
  bestaand     text;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  select count(*) into pogingen
  from invite_events
  where user_id = auth.uid()
    and created_at > now() - interval '1 day';

  if pogingen >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  insert into invite_events (user_id) values (auth.uid());

  select * into target
  from groups
  where invite_code = code
    and invite_revoked = false;

  if target.id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- QS8-232, route 1. Zie de kop van deze sectie voor waarom dit `invalid` is.
  if blokkade_met_groep(target.id, auth.uid()) then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if target.status = 'archived' then
    return jsonb_build_object('ok', false, 'reason', 'archived');
  end if;

  select status into bestaand
  from group_members
  where group_id = target.id and user_id = auth.uid();

  if bestaand = 'inactive' then
    return jsonb_build_object('ok', false, 'reason', 'removed');
  end if;

  if bestaand is null then
    select count(*) into leden
    from group_members
    where group_id = target.id and status <> 'inactive';

    if leden >= 12 then
      return jsonb_build_object('ok', false, 'reason', 'group_full');
    end if;

    -- ⚠️ Dezelfde uitzondering als in `create_group()`, en om dezelfde reden.
    --    Twee tellingen van hetzelfde plafond die verschillend rekenen, is een
    --    limiet die van je route afhangt.
    select count(*) into lidmaatschap
    from group_members m
    join groups g on g.id = m.group_id
    where m.user_id = auth.uid()
      and m.status <> 'inactive'
      and g.status <> 'archived';

    if lidmaatschap >= 10 then
      return jsonb_build_object('ok', false, 'reason', 'too_many_groups');
    end if;
  end if;

  -- ⚠️ Hier stond een `set_config` van de sessiesleutel die 0187 invoerde voor
  --    de terugweg, met de pauzetak van de upsert eronder. Beide zijn weg met de
  --    stand zelf. `bestaand` kan op dit punt nog maar twee waarden hebben:
  --    NULL (nieuw lid) of `active` (hij zit er al in) — `inactive` is hierboven
  --    afgevangen.
  --
  -- ⚠️ **De sleutel staat hier met opzet niet uitgeschreven.** `sleutelzetters()`
  --    leest `prosrc` en strípt geen commentaar, dus een functie die een sleutel
  --    alleen nóémt, telt als een functie die hem zet — en die zou hier meteen
  --    als ongeregistreerd gemeld worden. 📏 Precies dat gebeurde bij de eerste
  --    versie van deze migratie: de teller ving hem op. Het is dezelfde val die
  --    die functie in haar eigen derde tak beschrijft.
  insert into group_members (group_id, user_id, role, status)
  values (target.id, auth.uid(), 'member', 'active')
  on conflict (group_id, user_id) do nothing;

  update groups
  set status = 'active', last_activity_at = now()
  where id = target.id;

  return jsonb_build_object('ok', true, 'group_id', target.id);
end;
$$;

comment on function public.join_group_with_code(text) is
  'Toetreden met een uitnodigingscode. Een bestaand actief lidmaatschap is een '
  'no-op (on conflict do nothing) en een uitgezet lid krijgt reason = removed. '
  'De uitzondering van 0187 (app.hervat_lidmaatschap, voor de overgang '
  'paused -> active) is met 0204 vervallen: die stand bestaat niet meer — '
  'QS8-325.';

revoke all on function public.join_group_with_code(text) from public, anon, authenticated;
grant execute on function public.join_group_with_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. De guard verliest twee takken die over een niet-bestaande stand gingen
-- ---------------------------------------------------------------------------
--
-- Woordelijk 0199, op twee stukken na:
--   * de `pauze_van_een_ander`-grendel in de beheerderstak — die verbood een
--     handeling die de CHECK vanaf nu zelf afwijst;
--   * de `v_toegestaan`-uitzondering onderaan (0187) plus de declaratie ervan.
--
-- ⚠️ **Beide waren must-denies, en ze worden hier niet opgeheven maar door een
--    bredere grendel vervangen.** In plaats van `pauze_van_een_ander` staat er
--    een restweigering: élke statuswaarde buiten `active` en `inactive` wordt
--    geweigerd met `onbekende_lidstatus`. Een PATCH met `status = 'paused'`
--    ketst daar dus nog steeds op af — met een andere naam en een bredere
--    belofte.
--
-- ⚠️ **Voor `service_role` ligt het anders, en dat is waar de CHECK het
--    overneemt.** Die rol loopt door de guard heen op `auth.uid() is null`, dus
--    daar is `group_members_status_valid` (23514) het enige slot. 📏 Beide
--    gevallen staan met hun foutcode in `tests/rls/pauze-bestaat-niet.test.ts`:
--    een must-deny die stil van slot wisselt, bewaakt iets anders dan hij
--    belooft — dat is op deze branch twee keer gebeurd.
create or replace function public.guard_group_member_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_overdracht boolean := false;
  v_besluit    boolean := false;
  v_uitzetting boolean := false;
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
    -- ⚠️⚠️ **De restweigering, en die is er omdat 0204 er een weghaalt.** Tot
    --    hier stond `pauze_van_een_ander` als expliciete tak; die kon weg omdat
    --    de CHECK de waarde niet meer kent. Wat daarmee ook wegviel is het
    --    vángnet: de beheerderstak verbiedt een rolwijziging, een terugzetting
    --    en een uitzetting, en liet élke andere statuswaarde door.
    --
    -- 📏 Gemeten, en dit is een bevinding van de security-review op deze branch:
    --    met een derde waarde in de CHECK schreef een beheerder die stand op de
    --    rij van een ánder — zonder fout en zonder spoor. `meld_uitzetting`
    --    vuurt alleen op `→ inactive` en `meld_nieuw_lid` alleen op
    --    `inactive → active`, dus er blijft niets van over.
    --
    -- ⚠️ Vandaag onbereikbaar, morgen het slot. Drie rijen in
    --    `docs/ENGINEER-REVIEW.md` noemen "er komt een derde lidstatus bij" als
    --    reëel scenario; dan is dit de regel die er vanaf dag één staat in
    --    plaats van de regel die er dan bij had gemoeten.
    --
    -- ⚠️ Hij staat vóór de vroege uitgang voor de eigen rij, want die uitgang
    --    laat een beheerder ook zijn éígen stand vrij zetten. De twee bekende
    --    waarden komen er niet aan: de overgangen daartussen worden hieronder
    --    ieder apart getoetst.
    if new.status is distinct from old.status
       and new.status not in ('active', 'inactive')
    then
      raise exception 'onbekende_lidstatus'
        using hint = 'group_members.status kent active en inactive. Een nieuwe stand '
                     'krijgt zijn eigen weg en zijn eigen spoor, niet een PATCH.';
    end if;

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
    --    schreef alleen de uitzetting een spoor. De derde kan sinds 0204 niet
    --    meer bestaan; de andere drie worden hieronder geweigerd.
    --
    -- ⚠️ **De trigger vuurt óók voor `SECURITY DEFINER`-functies**, want
    --    `auth.uid()` blijft daarbinnen de aanroeper. `verwijder_lid()`,
    --    `verlaat_groep()` en `beslis_lidmaatschapsverzoek()` lopen dus door
    --    precies deze tak. Vandaar de benoemde uitzonderingen hieronder: een
    --    `set local` die alleen binnen die transactie geldt en die niemand
    --    anders zet.
    -- ⚠️⚠️ **`coalesce(..., false)` en dat is geen overdaad.** Een ongezette
    --    sleutel geeft `null`, en `null = <tekst>` is `null` en niet `false`.
    --    Zonder de coalesce wordt `not (v_overdracht or v_besluit)` dus `null`,
    --    vuurt de `if` níét, en laat de guard alles door — 📏 gemeten: met de
    --    drie regels erin bleven de promotie, de degradatie en het terugzetten
    --    gewoon landen.
    v_overdracht := coalesce(
      nullif(current_setting('app.beheer_overgedragen', true), '') = old.group_id::text,
      false
    );
    v_besluit := coalesce(
      nullif(current_setting('app.lidmaatschap_besloten', true), '') = old.group_id::text,
      false
    );
    v_uitzetting := coalesce(
      nullif(current_setting('app.lid_uitgezet', true), '') = old.group_id::text,
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

    -- ⚠️⚠️ **Uitzetten loopt óók maar langs één weg, en dat is een correctie uit
    --    de security-review op de branch van QS8-356.** Hier stond eerst dat
    --    `* → inactive` een gewone beheerdershandeling blijft. Dat klopte niet:
    --    `verwijder_lid()` doet méér dan de status zetten — het ruimt
    --    `goal_group_links` op en zet openstaande `deadline_requests` op
    --    `withdrawn`. Een kale PATCH slaat dat over.
    --
    -- 📏 Gemeten wat er dan blijft staan: het openstaande deadline-verzoek van
    --    het uitgezette lid blijft `open`, en `beslis_deadline_verzoek()` toetst
    --    alleen het lidmaatschap van de **beslisser** en niet van de aanvrager.
    --    Een lid dat nog wél in de groep zit, verzet daarmee de streefdatum van
    --    het doel van iemand die er niet meer in zit — en zet via
    --    `update commitments … set status = 'set' where status = 'due'` een
    --    verschuldigde straf terug. Dat raakt domeinregel 5 en 11.
    if new.status = 'inactive' and old.status is distinct from 'inactive'
       and not v_uitzetting
    then
      raise exception 'lid_uitgezet_buiten_de_rpc'
        using hint = 'Een lid uitzetten loopt via verwijder_lid(). Die ruimt ook de '
                     'gedeelde doelen en openstaande verzoeken op; een rechtstreekse '
                     'PATCH doet dat niet.';
    end if;

    -- ⚠️ Hier stond `pauze_van_een_ander`. Met 0204 kent
    --    `group_members_status_valid` de waarde niet meer, dus deze weigering
    --    komt nu uit de CHECK en niet uit een tak die de trigger zelf draagt.

    return new;
  end if;

  -- -------------------------------------------------------------------------
  -- Vanaf hier: geen actieve beheerder van deze groep.
  -- -------------------------------------------------------------------------
  --
  -- ⚠️ Hier stond de uitzondering van 0187: je eigen rij van `paused` terug naar
  --    `active` mocht, mits `join_group_with_code()` `app.hervat_lidmaatschap`
  --    op het groeps-id had gezet. Met 0204 bestaat `paused` niet meer, dus is
  --    er niets om door te laten en zet niemand die sleutel nog.
  --
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
$$;

-- ---------------------------------------------------------------------------
-- 6. Het sleutelregister verliest een sleutel die niemand meer zet
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Het register draagt zichzelf in zijn lichaam, dus een `replace` vervangt
--    het geheel.** Dat is precies de val die 0199 in zijn eigen commentaar
--    beschrijft. Hieronder staat het register van 0200 mét `app.rem_*`, mínus
--    `app.hervat_lidmaatschap`. Blijft die regel staan terwijl niemand de
--    sleutel nog zet, dan meldt de teller niets — hij telt alleen functies die
--    een sleutel noemen zonder er recht op te hebben — maar dan staat er een
--    afspraak in het register over een sleutel die niet bestaat, en dat is
--    precies het soort halve toestand waar QS8-325 over gaat.
create or replace function public.sleutelzetters()
returns table(naam text, bezwaar text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with sleutel(instelling, toegestaan) as (
    values
      ('app.heropent_groep',      array['heropen_groep', 'archief_blijft_archief']),
      -- ⚠️ **Deze drie komen uit 0199 (QS8-356) en staan hier omdat een
      --    `create or replace` het hele register vervangt.** Ze zijn er bij het
      --    samenvoegen bijna uit gevallen: de RLS-suite meldde na de merge drie
      --    ongeregistreerde sleutels — `verlaat_groep`,
      --    `beslis_lidmaatschapsverzoek` en `verwijder_lid` — omdat mijn versie
      --    het register van vóór die migratie kopieerde.
      --
      --    Dat is de val van een teller die zijn eigen register in zijn lichaam
      --    draagt: twee branches breiden hem uit, de laatste `replace` wint, en
      --    de ander verdwijnt zonder een woord. Hier ving de teller zichzelf op
      --    doordat hij de weggevallen sleutels meteen als ongeregistreerd meldde.
      ('app.beheer_overgedragen',   array['verlaat_groep', 'guard_group_member_update']),
      ('app.lidmaatschap_besloten', array['beslis_lidmaatschapsverzoek', 'guard_group_member_update']),
      ('app.lid_uitgezet',          array['verwijder_lid', 'guard_group_member_update']),
      -- De tellers van 0200. Elke rem mag alleen zijn eigen instelling zetten.
      ('app.rem_weekdoelen',         array['rem_weekdoelen']),
      ('app.rem_berichten',          array['rem_berichten']),
      ('app.rem_dagafvinkingen',     array['rem_dagafvinkingen']),
      ('app.rem_weekreacties',       array['rem_weekreacties']),
      ('app.rem_weekplanstappen',    array['rem_weekplanstappen']),
      ('app.rem_doelen',             array['rem_doelen']),
      ('app.rem_mijlpalen',          array['rem_mijlpalen']),
      ('app.rem_doelgebeurtenissen', array['rem_doelgebeurtenissen']),
      ('app.rem_goedkeuringen',      array['rem_goedkeuringen'])
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
$$;

-- ---------------------------------------------------------------------------
-- 7. Het objectcommentaar dat een stand belooft die er niet is
-- ---------------------------------------------------------------------------
--
-- ⚠️ Alleen het commentaar, niet het lichaam: `shares_group_with_user()` trekt
--    de grens op `<> 'inactive'` en dat blijft precies goed.
comment on function public.shares_group_with_user(uuid) is
  'Deelt de huidige gebruiker een groep met deze persoon? Beide kanten moeten '
  'er nog bij horen: een uitgezet lid (status inactive) is geen groepsgenoot '
  'meer, in geen van beide richtingen — 0160, QS8-146. De grens staat op '
  '<> inactive en niet op = active; sinds 0204 (QS8-325) vallen die twee samen, '
  'want group_members.status kent nog maar twee waarden. Een gearchiveerde '
  'groep telt óók mee: deze functie staat aan de leeskant, net als '
  'mag_groep_lezen() (0153). SECURITY DEFINER tegen RLS-recursie. Het volledige '
  'model van de zeven hulpfuncties staat in '
  'docs/decisions/2026-09-04-het-model-van-de-hulpfuncties.md.';
