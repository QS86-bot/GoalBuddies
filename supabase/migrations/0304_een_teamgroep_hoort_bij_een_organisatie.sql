-- 0304_een_teamgroep_hoort_bij_een_organisatie.sql — de organisatiekolom op
-- groepen, een organisatiebeheerder als teambeheerder zonder lid te zijn, en de
-- vertrek-cascade (QS8-653, epic QS8-650).
--
-- ⚠️ **Voorlopig nummer.** Deze migratie bouwt op 0299 van QS8-652, en productie
--    draagt al 0299–0302 van QS8-233 (QS8-641). Wie als tweede landt
--    hernummert (`npm run migratie:hernummer`); de inhoud hangt niet aan het
--    nummer.
--
-- ROLLBACK-PAD (`groups.organization_id` is bij het landen overal leeg; met
-- teamgroepen erin is dit grens 2 en vraagt het eerst een `pg_dump`):
--   drop trigger if exists organization_members_vertrek_cascade on public.organization_members;
--   drop function if exists public.ruim_teamlidmaatschappen_op();
--   drop trigger if exists group_members_teamlid on public.group_members;
--   drop function if exists public.bewaak_teamlidmaatschap();
--   drop trigger if exists groups_organisatie_vast on public.groups;
--   drop function if exists public.pin_groepsorganisatie();
--   drop function if exists public.maak_teamgroep(uuid, text, smallint, text, text);
--   -- daarna is_group_admin(), guard_group_member_update(), join_group_with_code(),
--   -- beslis_lidmaatschapsverzoek() en sleutelzetters() terugzetten uit
--   -- 0160, 0204, 0204, 0145 en 0276 (de lichamen hieronder zijn die, plus de
--   -- gemarkeerde QS8-653-takken);
--   drop function if exists public.ledenplafond(uuid);
--   drop function if exists public.is_teambeheerder(uuid);
--   drop function if exists public.actief_organisatielid(uuid, uuid);
--   alter table public.groups drop constraint if exists groups_team_niet_ontdekbaar;
--   drop index if exists public.groups_organisatie_idx;
--   alter table public.groups drop column if exists organization_id;
--
-- ---------------------------------------------------------------------------
-- Wat dit doet, en waar het vandaan komt
-- ---------------------------------------------------------------------------
--
-- Besluit 9, 13, 18, 26, 27, 34 en 36 in
-- `docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`,
-- en de keuzes van deze migratie in
-- `docs/decisions/2026-11-17-een-teamgroep-hoort-bij-een-organisatie.md`.
--
-- 1. `groups.organization_id`, nullable, met een partiële index. Geen client
--    schrijft hem: er is geen kolomgrant, en `groups_organisatie_vast` pint hem
--    voor iedereen, ook `service_role`. Een groep krijgt hem alleen bij het
--    aanmaken via `maak_teamgroep()`; later aanhangen kan niet (besluit 9).
--    ⚠️ **Een eigen trigger en geen extra tak in `guard_group_update()`**: de
--    tak van QS8-233 herdefinieert die functie ook (pin op `automatisch`), en
--    twee herdefinities van één lichaam verliezen stil elkaars register zodra
--    ze allebei landen (QS8-358).
-- 2. `groups_team_niet_ontdekbaar`: een teamgroep is nooit vindbaar (0144).
-- 3. `group_members_teamlid`: wie actief lid wordt van een teamgroep, moet
--    actief lid zijn van de organisatie (criterium 8), langs élke route.
-- 4. `is_group_admin()` krijgt `is_teambeheerder()`: een organisatiebeheerder
--    beheert elk team van zijn organisatie zonder lid te zijn (besluit 34, 36).
--    Lezen blijft aan `mag_groep_lezen()` en dus aan het lidmaatschap.
--    `guard_group_member_update()` krijgt dezelfde tak, anders weigert hij
--    elke lidmaatschapswijziging van zo'n beheerder.
-- 5. De vertrek-cascade: wordt een organisatielid inactief, dan wordt hij dat
--    in elke teamgroep van die organisatie, met dezelfde opruiming als
--    `verwijder_lid()` (verzoeken ingetrokken, koppelingen weg).
-- 6. Het ledenplafond: 25 voor een teamgroep (besluit 27, niet gemeten), 12
--    voor elke andere groep. Eén functie, `ledenplafond()`, op beide routes.

alter table public.groups
  add column if not exists organization_id uuid
    references public.organizations (id) on delete restrict;

-- Onwrikbare regel 11: de vertrek-cascade en de beheerdersvraag filteren hierop.
create index if not exists groups_organisatie_idx
  on public.groups (organization_id)
  where organization_id is not null;

alter table public.groups drop constraint if exists groups_team_niet_ontdekbaar;
alter table public.groups
  add constraint groups_team_niet_ontdekbaar
  check (organization_id is null or not ontdekbaar);

-- ⚠️ Er is geen kolomgrant om in te trekken; dit staat er zodat het een besluit
--    is en geen toeval (onwrikbare regel 4: met `authenticated` erbij).
revoke insert (organization_id), update (organization_id)
  on public.groups from public, anon, authenticated;

create or replace function public.pin_groepsorganisatie()
returns trigger
language plpgsql
set search_path = public, pg_catalog, pg_temp
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'De organisatie van een groep ligt vast'
      using errcode = 'check_violation',
            hint = 'Een team wordt aangemaakt met maak_teamgroep(); een bestaande groep wordt nooit later aan een organisatie gehangen (besluit 9).';
  end if;
  return new;
end;
$$;

drop trigger if exists groups_organisatie_vast on public.groups;
create trigger groups_organisatie_vast
  before update on public.groups
  for each row execute function public.pin_groepsorganisatie();

revoke all on function public.pin_groepsorganisatie() from public, anon, authenticated;

-- Is deze persoon actief lid van deze (actieve) organisatie? Voor een ander dan
-- `auth.uid()`, en daarom zonder grant: alleen definer-code roept hem aan.
create or replace function public.actief_organisatielid(p_organization_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $$
  select exists (
    select 1
      from organization_members m
      join organizations o on o.id = m.organization_id
     where m.organization_id = p_organization_id
       and m.user_id = p_user_id
       and m.status = 'active'
       and o.status = 'active'
  );
$$;

revoke all on function public.actief_organisatielid(uuid, uuid) from public, anon, authenticated;

-- De tak die `is_group_admin()` erbij krijgt: beheerder van de organisatie van
-- deze (niet gearchiveerde) teamgroep. Altijd onwaar voor een groep zonder
-- organisatie.
create or replace function public.is_teambeheerder(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $$
  select exists (
    select 1
      from groups g
     where g.id = gid
       and g.organization_id is not null
       and g.status <> 'archived'
       and public.is_organisatiebeheerder(g.organization_id)
  );
$$;

revoke all on function public.is_teambeheerder(uuid) from public, anon, authenticated;

create or replace function public.ledenplafond(gid uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $$
  select case when g.organization_id is not null then 25 else 12 end
    from groups g
   where g.id = gid;
$$;

revoke all on function public.ledenplafond(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_group_admin(gid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
    from group_members m
    join groups g on g.id = m.group_id
    where m.group_id = gid
      and m.user_id  = auth.uid()
      and m.role      = 'admin'
      and m.status   <> 'inactive'
      and g.status   <> 'archived'
  )
  -- ⚠️⚠️ QS8-653, besluit 34 en 36: een organisatiebeheerder is beheerder van
  --    elk team van zijn organisatie, zónder lid te zijn. Alleen beheer: wie
  --    leest (chat, overzicht, teambalk) bepaalt `mag_groep_lezen()`, en die
  --    vraagt een lidmaatschap. Voor een groep zonder organisatie is deze tak
  --    altijd onwaar.
  or public.is_teambeheerder(gid);
$function$;

CREATE OR REPLACE FUNCTION public.guard_group_member_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- ⚠️⚠️ **De vertrek-cascade uit een organisatie — QS8-653.** Wie een
  --    organisatie verlaat of eruit gezet wordt, gaat in elke teamgroep van die
  --    organisatie op inactief, en dat zet `ruim_teamlidmaatschappen_op()` in
  --    gang onder de sleutel hieronder. De handelende persoon is daar de
  --    vertrekker zelf (geen beheerder) of een organisatiebeheerder (geen lid),
  --    en voor allebei weigert de rest van deze functie terecht. Daarom staat
  --    deze tak bovenaan, en hij laat alleen de overgang naar inactief door:
  --    geen rol, geen toetredingsmoment, geen weg terug.
  if coalesce(nullif(current_setting('app.organisatie_vertrek', true), '') = old.group_id::text, false)
     and new.status = 'inactive'
     and new.role is not distinct from old.role
     and new.joined_at is not distinct from old.joined_at
  then
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
  -- ⚠️⚠️ **Een organisatiebeheerder telt hier als beheerder, zonder lid te
  --    zijn — QS8-653, besluit 34 en 36.** Deze trigger bepaalt "beheerder" met
  --    een eigen vraag en niet via `is_group_admin()`, en zonder deze tak weigert
  --    hij elke lidmaatschapswijziging van een organisatiebeheerder met
  --    `geen_groepsbeheerder`: uitzetten, en een verzoek beslissen van iemand
  --    die eerder lid was. `is_teambeheerder()` is precies de tak die
  --    `is_group_admin()` erbij kreeg; voor een groep zonder organisatie is hij
  --    altijd onwaar, dus daar verandert niets.
  --
  -- ⚠️⚠️ **Maar nooit op zijn eigen rij** (security-review op QS8-653, H1,
  --    gemeten). Hieronder staat `if old.user_id = auth.uid() then return new`,
  --    en die uitgang was alleen bereikbaar voor een lid-beheerder, wiens enige
  --    wijziging op zijn eigen rij degraderen is (en dat vangt `last_admin`).
  --    Een organisatiebeheerder die óók gewoon teamlid is, bereikte hem via deze
  --    tak, en promoveerde zichzelf met één `update` tot `admin`, of zette
  --    zichzelf na een uitzetting terug op `active`. Op zijn eigen rij geldt
  --    voor hem dus wat voor elk lid geldt: de tak hieronder, `geen_groepsbeheerder`.
  if exists (
    select 1 from group_members m
    where m.group_id = old.group_id
      and m.user_id  = auth.uid()
      and m.role     = 'admin'
      and m.status  <> 'inactive'
  ) or (old.user_id is distinct from auth.uid() and public.is_teambeheerder(old.group_id)) then
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
  --    `active` mocht, mits `join_group_with_code()` een sessiesleutel met het
  --    groeps-id had gezet. Met 0204 bestaat `paused` niet meer, dus is er niets
  --    om door te laten en zet niemand die sleutel nog.
  --
  -- ⚠️ **De naam van die vervallen sleutel staat hier met opzet niet meer**
  --    (QS8-376). De sleutelteller kijkt sinds 0215 per sleutel in plaats van per
  --    functie, en hij leest `prosrc` inclusief commentaar — net als zijn eerste
  --    tak altijd al deed. Een sleutel die nergens meer geregistreerd staat maar
  --    hier nog bij naam genoemd wordt, is dan een terechte melding. De
  --    geschiedenis blijft; alleen de sleutelnaam is eruit.
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
$function$;

CREATE OR REPLACE FUNCTION public.join_group_with_code(code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- ⚠️⚠️ **Een teamgroep is alleen voor leden van zijn organisatie — QS8-653,
  --    criterium 8, ook met de uitnodigingscode.** Het antwoord is `invalid`,
  --    hetzelfde als bij een onbekende code: een eigen reden zou bevestigen dat
  --    de code bij een team hoort, en dan is deze functie een orakel op codes van
  --    organisaties waar je niet in zit. De trigger `group_members_teamlid`
  --    houdt hetzelfde tegen op elke andere route; dit is de nette weigering op
  --    deze.
  if target.organization_id is not null
     and not public.actief_organisatielid(target.organization_id, auth.uid()) then
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

    -- QS8-653: 25 voor een teamgroep (besluit 27), 12 voor elke andere.
    if leden >= public.ledenplafond(target.id) then
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
    -- ⚠️ QS8-653, criterium 8: een teamgroep neemt alleen leden van zijn
    --    organisatie aan. Een eigen reden mag hier: de beslisser is beheerder en
    --    weet al bij welke groep het verzoek hoort.
    if v_bestaand is distinct from 'active'
       and exists (select 1 from groups g where g.id = r.group_id and g.organization_id is not null)
       and not public.actief_organisatielid(
             (select g.organization_id from groups g where g.id = r.group_id), r.user_id) then
      return jsonb_build_object('ok', false, 'reason', 'not_org_member');
    end if;

    if v_bestaand is distinct from 'active' then
      select count(*) into v_leden
      from group_members
      where group_id = r.group_id and status <> 'inactive';

      -- QS8-653: 25 voor een teamgroep (besluit 27), 12 voor elke andere.
      if v_leden >= public.ledenplafond(r.group_id) then
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

      -- ⚠️ Meteen weer leeg — zelfde reden als bij `verlaat_groep()`.
      perform set_config('app.lidmaatschap_besloten', '', true);
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

CREATE OR REPLACE FUNCTION public.sleutelzetters()
 RETURNS TABLE(naam text, bezwaar text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with sleutel(instelling, toegestaan) as (
    values
      ('app.heropent_groep',      array['heropen_groep', 'archief_blijft_archief']),
      -- ⚠️ Uit 0208 (QS8-360). De huddledag verzetten schuift de start van de
      --    lopende periode, en dan gaat de weekafsluiting die erbij hoort mee —
      --    langs de pin van 0206, die `group_id` en `user_id` onverkort gepind
      --    houdt.
      ('app.huddledag_verzet',    array['zet_huddledag', 'pin_week_review']),
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
      ('app.organisatie_vertrek',   array['ruim_teamlidmaatschappen_op', 'guard_group_member_update']),
      -- De tellers van 0200. Elke rem mag alleen zijn eigen instelling zetten.
      ('app.rem_weekdoelen',         array['rem_weekdoelen']),
      ('app.rem_berichten',          array['rem_berichten']),
      ('app.rem_dagafvinkingen',     array['rem_dagafvinkingen']),
      ('app.rem_weekreacties',       array['rem_weekreacties']),
      ('app.rem_weekplanstappen',    array['rem_weekplanstappen']),
      ('app.rem_doelen',             array['rem_doelen']),
      ('app.rem_mijlpalen',          array['rem_mijlpalen']),
      ('app.rem_doelgebeurtenissen', array['rem_doelgebeurtenissen']),
      ('app.rem_goedkeuringen',      array['rem_goedkeuringen']),
      -- ⚠️⚠️ **Deze vijf komen uit 0207 (QS8-361) en waren er bij het samenvoegen
      --    uit gevallen.** Mijn versie kopieerde het register van vóór die
      --    migratie, precies zoals de aantekening bij de drie sleutels van 0199
      --    hierboven beschrijft — de val van een teller die zijn eigen register in
      --    zijn lichaam draagt: twee branches breiden hem uit, de laatste
      --    `replace` wint, en de ander verdwijnt zonder een woord.
      --
      -- 📏 De teller ving zichzelf opnieuw op: `rem_commitments`, `rem_dagzetten`,
      --    `rem_doelinterviews`, `rem_doelkoppelingen` en `rem_voltooiingen`
      --    stonden meteen als ongeregistreerd in de uitslag, en twee RLS-tests
      --    werden er rood van. Dat is de tweede keer op vier dagen; het staat als
      --    QS8-358.
      ('app.rem_commitments',        array['rem_commitments']),
      ('app.rem_voltooiingen',       array['rem_voltooiingen']),
      ('app.rem_dagzetten',          array['rem_dagzetten']),
      ('app.rem_doelkoppelingen',    array['rem_doelkoppelingen']),
      ('app.rem_doelinterviews',     array['rem_doelinterviews']),
      -- ⚠️⚠️ **Uit 0214 (QS8-369), en deze regel is er bijna uit gevallen.**
      --    Die migratie landde op `main` terwijl deze branch openstond en
      --    hernummerde mij van 0214 naar 0215 — dus deze `create or replace`
      --    draait er nu áchteraan. Het register dat ik kopieerde was van vóór hun
      --    migratie, en zonder deze regel had ik `app.rem_pushtokens` er stil
      --    weer uit gehaald.
      --
      --    Dat is exact de val van QS8-358, en de derde keer dat hij toeslaat: een
      --    teller die zijn eigen register in zijn lichaam draagt, twee branches
      --    die hem uitbreiden, en de laatste `replace` wint. 📏 Gevonden door na
      --    het samenvoegen te grepen op wat hún 0214 registreert en dat naast het
      --    mijne te leggen.
      --
      --    ⚠️ **En de teller had zichzelf ook opgevangen**, net als bij 0199 en
      --    0207: `rem_pushtokens()` zet die sleutel nog steeds, dus zonder deze
      --    regel meldt hij hem meteen als ongeregistreerd — 📏 nagemeten, de regel
      --    weghalen geeft `rem_pushtokens: noemt app.rem_pushtokens`. Dat is de
      --    hele reden dat deze grendel bestaat, en het is de derde keer dat hij
      --    zijn eigen register redt.
      ('app.rem_pushtokens',         array['rem_pushtokens']),
      -- ⚠️ Uit 0217 (QS8-374). De zestiende dagteller, en de eerste op een
      --    tabel die niemand rechtstreeks beschrijft: `group_events` is bij
      --    alle zeven schrijvers een neveneffect.
      --
      -- ⚠️⚠️ **En dit register is voor de tweede keer op rij opnieuw uitgelezen
      --    in plaats van gekopieerd.** Toen deze migratie geschreven werd stond
      --    hij op 0215; QS8-376 landde ondertussen op `main` met een 0215 die
      --    déze functie herschrijft — `ilike` in plaats van `like`, en een derde
      --    tak die per sleutel kijkt in plaats van per functie. 📏 Het verschil
      --    is nagemeten met een `diff` tussen wat ik meedroeg en wat er ná hun
      --    migratie in de database stond: mijn kopie had hun hele reparatie
      --    stilzwijgend teruggedraaid. Dat is QS8-358 voor de vierde keer.
      ('app.rem_groepsgebeurtenissen', array['rem_groepsgebeurtenissen']),
      -- ⚠️ Uit 0227 (QS8-379). De Lijst krijgt zijn eigen rem, en dus zijn eigen
      --    sleutel.
      ('app.rem_taken',                array['rem_taken']),
      -- ⚠️ Uit 0248 (QS8-381). `zet_taakzichtbaarheid()` zet hem op het id van
      --    de taak die hij deelt, en `pin_taak()` leest hem om precies díe rij
      --    door te laten. Twee functies, één sleutel: de zetter en de lezer.
      ('app.taak_gedeeld',             array['zet_taakzichtbaarheid', 'pin_taak']),
      -- ⚠️ Uit 0276 (QS8-496). De achttiende dagteller krijgt zijn rem, en dus
      --    zijn sleutel. 📏 Deze regel is er niet uit voorzorg bij gezet maar
      --    omdat de derde tak hieronder rood stond: `rem_blokkades -> noemt
      --    app.rem_blokkades, een app.-sessiesleutel die in geen enkel register
      --    van deze teller staat`, met vier testasserties in drie bestanden
      --    eronder. Precies waar die tak voor gebouwd is.
      ('app.rem_blokkades',            array['rem_blokkades'])
  ),
  bekend as (
    select p.proname::text as naam, s.instelling, s.toegestaan
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join sleutel s
    where n.nspname = 'public'
      and p.prosrc ilike '%' || s.instelling || '%'
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
  select distinct p.proname::text,
         -- ⚠️ De naam van deze functie staat met opzet niet in deze tekst.
         --    `keten:controle` telt een naam in de bron als een aanroeper, en
         --    strippen doet hij alleen commentaar — niet een tekenreeks. Een
         --    functie die zichzelf in een melding noemt, meldt zichzelf dus
         --    levend. Dezelfde klasse als het commentaargeval dat dat script in
         --    zijn eigen kop beschrijft: de tekst óver een functie is geen
         --    gebruik ervan.
         'noemt ' || m.gevonden[1] || ', een app.-sessiesleutel die in geen '
         'enkel register van deze teller staat; een nieuwe sleutel hoort er '
         'met zijn eigen regel in te komen'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral regexp_matches(p.prosrc, 'app\.[A-Za-z0-9_]+', 'g') as m(gevonden)
   where n.nspname = 'public'
     and p.proname <> 'sleutelzetters'
     and lower(m.gevonden[1]) not in (select s.instelling from sleutel s)

   order by 1;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Lid van een teamgroep vereist lid van de organisatie — criterium 8
-- ---------------------------------------------------------------------------
create or replace function public.bewaak_teamlidmaatschap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_org uuid;
begin
  if new.status = 'inactive' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = new.status then
    return new;
  end if;

  select g.organization_id into v_org from groups g where g.id = new.group_id;
  if v_org is null then
    return new;
  end if;

  -- ⚠️⚠️ **`for share` op de lidmaatschapsrij van de organisatie, en dat is de
  --    race-reparatie** (security-review op QS8-653, M1, gemeten met twee
  --    sessies). Zonder lock kon toetreden en tegelijk vertrekken een blijvend
  --    teamlid achterlaten: de cascade zag de nog niet gecommitte insert niet, en
  --    niets ruimt dat later op. Met de lock wacht het vertrek op de toetreding
  --    (en ziet de cascade daarna het teamlid), of wacht de toetreding op het
  --    vertrek (en leest dan `inactive` en weigert).
  perform 1
     from organization_members m
     join organizations o on o.id = m.organization_id
    where m.organization_id = v_org
      and m.user_id = new.user_id
      and m.status = 'active'
      and o.status = 'active'
      for share of m;
  if not found then
    raise exception 'geen_organisatielid'
      using errcode = 'check_violation',
            hint = 'Een teamgroep neemt alleen actieve leden van zijn organisatie op (QS8-653).';
  end if;
  return new;
end;
$$;

drop trigger if exists group_members_teamlid on public.group_members;
create trigger group_members_teamlid
  before insert or update of status on public.group_members
  for each row execute function public.bewaak_teamlidmaatschap();

revoke all on function public.bewaak_teamlidmaatschap() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. De vertrek-cascade — criterium 9
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Een trigger op `organization_members` en geen regel in de twee RPC's
--    van 0299.** Zo vangt hij elke route naar inactief, ook een die later
--    bijkomt, en blijven de lichamen van QS8-652 onaangeroerd.
-- ⚠️ De opruiming is die van `verwijder_lid()`: openstaande deadlineverzoeken
--    ingetrokken, de koppelingen van zijn doelen aan die groep weg, en dan
--    inactief. Zo ziet niemand zijn doel nog via die groep, en ziet hij de groep
--    niet meer (`mag_groep_lezen()` vraagt een actief lidmaatschap).
create or replace function public.ruim_teamlidmaatschappen_op()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_groep uuid;
begin
  if not (old.status = 'active' and new.status = 'inactive') then
    return new;
  end if;

  for v_groep in
    select m.group_id
      from group_members m
      join groups g on g.id = m.group_id
     where g.organization_id = new.organization_id
       and m.user_id = new.user_id
       and m.status <> 'inactive'
     order by m.group_id
  loop
    perform 1 from groups where id = v_groep for update;

    update deadline_requests
       set status = 'withdrawn', decided_at = now()
     where group_id = v_groep and requester_id = new.user_id and status = 'open';

    delete from goal_group_links l
     using goals d
     where l.goal_id = d.id and l.group_id = v_groep and d.owner_id = new.user_id;

    perform set_config('app.organisatie_vertrek', v_groep::text, true);
    update group_members
       set status = 'inactive'
     where group_id = v_groep and user_id = new.user_id;
    perform set_config('app.organisatie_vertrek', '', true);

    -- ⚠️ Een eigen vertrek laat hetzelfde spoor na als `verlaat_groep()`
    --    (security-review op QS8-653, L3). Een uitzetting door een beheerder
    --    schrijft `meld_uitzetting()` al als `member_removed`.
    if (select auth.uid()) = new.user_id then
      insert into group_events (group_id, actor_id, event_type, old_value, new_value)
      values (v_groep, new.user_id, 'member_left',
              jsonb_build_object('status', 'active'),
              jsonb_build_object('via', 'organisatie'));
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists organization_members_vertrek_cascade on public.organization_members;
create trigger organization_members_vertrek_cascade
  after update of status on public.organization_members
  for each row execute function public.ruim_teamlidmaatschappen_op();

revoke all on function public.ruim_teamlidmaatschappen_op() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Een teamgroep aanmaken — besluit 13 en 18
-- ---------------------------------------------------------------------------
--
-- ⚠️ Alleen een organisatiebeheerder, en hij wordt er **geen lid** van (besluit
--    36): leden komen binnen met de uitnodigingscode, en de trigger hierboven
--    eist dat ze lid van de organisatie zijn. De zichtbaarheid kiest hij hier
--    (besluit 18); omzetten gaat daarna zoals bij elke groep (besluit 26).
-- ⚠️ De naam, de huddledag, de tijdzone en de daglimiet volgen `create_group()`
--    (0287), met dezelfde redenen: zie de kop daar.
create or replace function public.maak_teamgroep(
  p_organization_id uuid,
  p_naam text,
  p_huddledag smallint default 0,
  p_tz text default 'Europe/Amsterdam',
  p_zichtbaarheid text default 'beschermd'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_naam      text;
  v_vorig     text;
  v_tz        text;
  v_zicht     text;
  v_beperking text;
  v_groep     uuid;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;
  if not public.is_organisatiebeheerder(p_organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'niet_toegestaan');
  end if;
  if char_length(coalesce(p_naam, '')) > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'name_too_long');
  end if;

  v_naam := coalesce(p_naam, '');
  for i in 1..5 loop
    v_vorig := v_naam;
    v_naam  := public.schone_naam(v_vorig);
    exit when v_naam = v_vorig;
  end loop;
  if length(v_naam) < 2 then
    return jsonb_build_object('ok', false, 'reason', 'name_too_short');
  end if;
  if length(v_naam) > 60 then
    return jsonb_build_object('ok', false, 'reason', 'name_too_long');
  end if;
  if p_huddledag is null or p_huddledag < 0 or p_huddledag > 6 then
    return jsonb_build_object('ok', false, 'reason', 'bad_huddle_day');
  end if;

  v_tz := coalesce(p_tz, 'Europe/Amsterdam');
  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    v_tz := 'Europe/Amsterdam';
  end if;
  v_zicht := coalesce(p_zichtbaarheid, 'beschermd');
  if v_zicht not in ('beschermd', 'open') then
    v_zicht := 'beschermd';
  end if;

  perform 1 from organizations where id = p_organization_id for update;

  -- Dezelfde daglimiet als `create_group()`, over dezelfde rijen: tien groepen
  -- per etmaal per aanmaker, team of niet.
  if (select count(*) from groups
       where created_by = v_uid and created_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'daily_limit');
  end if;

  for poging in 1..3 loop
    begin
      insert into groups (name, created_by, invite_code, huddle_day, tz, zichtbaarheid,
                          organization_id)
      values (v_naam, v_uid, public.generate_invite_code(), p_huddledag, v_tz, v_zicht,
              p_organization_id)
      returning id into v_groep;
      exit;
    exception
      when unique_violation then
        if poging >= 3 then raise; end if;
      when check_violation then
        -- ⚠️ De vraag naar `pg_constraint` en geen patroon op de naam van de
        --    beperking, om de reden die `create_group()` (0287) uitschrijft: een
        --    patroon leest de naamgeving van vandaag en niet de eigenschap.
        get stacked diagnostics v_beperking = constraint_name;
        if exists (
          select 1
            from pg_constraint c
            join pg_attribute a on a.attrelid = c.conrelid and a.attname = 'name'
           where c.conname  = v_beperking
             and c.conrelid = 'public.groups'::regclass
             and c.contype  = 'c'
             and a.attnum   = any (c.conkey)
        ) then
          return jsonb_build_object('ok', false, 'reason', 'name_invalid');
        end if;
        raise;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'group_id', v_groep);
end;
$$;

revoke all on function public.maak_teamgroep(uuid, text, smallint, text, text) from public, anon, authenticated;
grant execute on function public.maak_teamgroep(uuid, text, smallint, text, text) to authenticated;
