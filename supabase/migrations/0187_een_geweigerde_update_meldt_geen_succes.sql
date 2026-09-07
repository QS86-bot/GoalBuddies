-- 0187_een_geweigerde_update_meldt_geen_succes.sql — `guard_group_member_update()` gooide weg en meldde succes (QS8-314)
--
-- ROLLBACK-PAD:
--   `guard_group_member_update()` terugzetten uit 0102 (r.722) — `create or
--   replace` zonder handtekeningwijziging, dus de grants blijven staan en de
--   trigger `group_members_guard` hoeft niet opnieuw gehangen te worden.
--   Deze migratie schrijft geen enkele rij en verandert geen enkel schema-object
--   behalve die ene functie.
--
-- ---------------------------------------------------------------------------
-- Wat er stuk was
-- ---------------------------------------------------------------------------
--
-- `guard_group_member_update()` heeft twee takken. Allebei zetten ze gewijzigde
-- kolommen terug op `old` en geven de rij door. Postgres telt dat als een
-- geslaagde update, en PostgREST antwoordt met 200 en de óude rij.
--
-- 📏 Gemeten op de lokale stack als gewoon lid met echte claims, via PostgREST —
-- niet uit het migratiebestand gelezen:
--
--   lid zet eigen status=inactive   error: GEEN   rij terug: status=active
--   lid zet eigen role=admin        error: GEEN   rij terug: role=member
--   lid zet joined_at               error: 42501  (kolomgrant, niet de trigger)
--   beheerder zet lid inactive      error: GEEN   status daarna: inactive  ← moet
--
-- Er lekt niets en er verandert niets wat niet mocht. Het gaat om wat de
-- aanroeper terugkrijgt: een geweigerd verzoek dat zich voordoet als een
-- geslaagd verzoek.
--
-- ---------------------------------------------------------------------------
-- Waarom "misschien hoort het zo" hier niet opgaat
-- ---------------------------------------------------------------------------
--
-- QS8-314 hield één verdediging open: de stille terugzet houdt `group_members`
-- schrijfbaar voor kolommen die een lid wél mag zetten, zonder per kolom een
-- policy. 📏 Die verdediging is gemeten en hij is onwaar.
--
--   `\d group_members`                    vijf kolommen, meer zijn er niet
--   column_privileges / authenticated     UPDATE op group_id, user_id, role,
--                                         status — `joined_at` heeft er geen
--   de niet-beheerderstak pint            alle vijf
--
-- Elke kolom die `authenticated` mag bijwerken, pint deze tak terug. Er is dus
-- geen kolom die deze tak openhoudt, en er kan er ook geen zijn: de tak heeft
-- vandaag precies één mogelijke uitkomst, en dat is niets doen en succes melden.
--
-- 📏 En er is geen enkel clientschrijfpad naar deze tabel:
-- `grep -rn "from('group_members')" src/ app/` geeft drie treffers, alle drie
-- `.select()`. De drie functies die de tabel wél bijwerken zijn
-- `verlaat_groep()`, `verwijder_lid()` en `join_group_with_code()` — zie onder.
--
-- ---------------------------------------------------------------------------
-- Dit heeft dit project al één keer geld gekost
-- ---------------------------------------------------------------------------
--
-- 0102 §"deze toets ontbrak" beschrijft het geval: `verlaat_groep()` deed een
-- overdracht-`update` die voor een gewoon lid stil geneutraliseerd werd, terwijl
-- de `group_events`-rij ernaast wél geschreven werd en de functie `ok: true` gaf
-- met `overgedragen_aan` erin. Een bewering over iemand ánders in de
-- onveranderlijke groepsgeschiedenis, over een overdracht die nooit gebeurd is.
--
-- Diezelfde migratie schrijft de regel op die deze migratie nu uitvoert:
--
--   ⚠️ Nooit vertrouwen op het feit dat een trigger de UPDATE toevallig
--      tegenhoudt. Dat is een deur die alleen dichtzit omdat er verderop een
--      `if` staat.
--
-- En 0102 koos voor de `last_admin`-tak bewust een `raise` boven een pin, met
-- precies deze reden erbij: *"Pinnen weigert stil (valkuil 5): de client krijgt
-- 204 en denkt dat het gelukt is."* Deze migratie trekt die keuze door naar de
-- twee takken die toen zijn blijven staan.
--
-- Het kostte bovendien een meting: de eerste meting van QS8-306 las "Bob verliet
-- de groep" uit een `UPDATE 1` die niets gedaan had.
--
-- ---------------------------------------------------------------------------
-- Wat er nu gebeurt
-- ---------------------------------------------------------------------------
--
-- **De belofte is niet "de niet-beheerderstak werpt".** Dat is een eigenschap van
-- een tak. De belofte is een eigenschap van het gehéél:
--
--   Geen enkele UPDATE op `group_members` meldt succes terwijl deze trigger de
--   wijziging heeft weggegooid.
--
-- Daarom werpt óók de beheerderstak, die `group_id` en `user_id` net zo stil
-- terugzette, en daarom staat de toets op *wat er zou veranderen* en niet op
-- *welke tak je bent*.
--
-- ⚠️ **`is distinct from` en niet "de tak is bereikt".** Een update die niets
--    verandert, is geen geweigerd verzoek — het is een no-op, en `UPDATE 1` is
--    daar een eerlijk antwoord op. Dit onderscheid is niet cosmetisch: het is
--    precies wat `join_group_with_code()` overeind houdt. Die doet een upsert met
--    `do update set status = case when paused then 'active' else status end`, en
--    voor elk lid dat níet `paused` is levert dat dezelfde waarde op. 📏 Gemeten:
--    toetreden met de code blijft `{"ok": true}` geven.
--
-- ⚠️ **De `paused`-tak van die upsert is een apart geval en deze migratie maakt
--    hem zichtbaar in plaats van stil.** 📏 Gemeten vóór deze migratie: een lid
--    op `paused` dat toetreedt met een geldige code krijgt `{"ok": true}` terug
--    en blijft op `paused` staan — de niet-beheerderstak pinde `status` al
--    onvoorwaardelijk terug. Terugkomen was dus al kapot, en niets kon er rood
--    van worden.
--
--    📏 En het is vandaag dormant: `paused` op `group_members` wordt door geen
--    enkele functie en geen enkele regel client-code geschreven — `verlaat_groep()`
--    verwijdert de rij, `verwijder_lid()` zet `inactive`. De waarde staat in de
--    CHECK en verder nergens.
--
--    Daarom krijgt die ene overgang hier een uitzondering met een naam, in
--    plaats van dat hij van een `if` verderop afhangt. De vorm is die van
--    `archief_blijft_archief()` (0153): een sessie-instelling die het id draagt
--    van precies de rij waar het om gaat, gezet door precies één functie.
--    Vergeet die functie de instelling, dan valt hij hier hoorbaar om — wat vóór
--    deze migratie het bezwaar was tegen zo'n vlag (zie
--    `scripts/pinuitzonderingen-controle.mjs`) en er nu dus niet meer is.
--
-- ⚠️ **Een uitzondering is pas een uitzondering als niemand anders hem kan
--    zetten, en dat is gemeten en niet aangenomen.** Drie vragen, drie
--    metingen:
--
--    1. Kan een client `set_config()` aanroepen? 📏 Nee. PostgREST stelt alleen
--       het `public`-schema beschikbaar en `set_config`/`current_setting` staan
--       in `pg_catalog`:
--         POST /rpc/set_config      -> HTTP 404 PGRST202
--         POST /rpc/current_setting -> HTTP 404 PGRST202
--       (`has_function_privilege` geeft wél `true` — dat recht erft iedereen van
--       PUBLIC. Bereikbaar is iets anders dan uitvoerbaar, en alleen het eerste
--       telt hier.)
--    2. Is er een andere functie die deze instelling zet? 📏 Nee. In `public`
--       gebruiken precies twee functies `set_config`: `heropen_groep()` — die
--       zet `app.heropent_groep`, een andere naam — en deze.
--    3. Lekt de instelling naar een volgend verzoek op dezelfde poolverbinding?
--       📏 Nee: `set_config(..., true)` ís `set local` en valt weg aan het eind
--       van de transactie. PostgREST geeft elk verzoek zijn eigen transactie.
--
--    En de must-deny staat als test: zonder die instelling weigert dezelfde
--    overgang hoorbaar (`stille-weigering.test.ts`, "alleen mét de code").
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. De trigger weigert hoorbaar
-- ---------------------------------------------------------------------------

create or replace function public.guard_group_member_update()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_toegestaan boolean := false;
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
$$;

comment on function public.guard_group_member_update() is
  'Weigert sinds 0187 hoorbaar in plaats van stil terug te zetten (QS8-314): de '
  'sleutel van een lidmaatschap verandert voor niemand, rol/status/joined_at '
  'alleen voor een actieve beheerder, en de enige actieve beheerder geeft zijn '
  'adminschap niet op (0102). Een update die niets verandert, blijft een no-op.';

-- ---------------------------------------------------------------------------
-- 2. `join_group_with_code()` zegt wat het doet
-- ---------------------------------------------------------------------------
--
-- ⚠️ Alleen `set local app.hervat_lidmaatschap` erbij; de rest van de functie is
--    letterlijk die uit de vorige definitie. `set local` valt weg aan het eind
--    van de transactie, dus de instelling lekt niet naar een volgend statement
--    in dezelfde verbinding.

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

  -- ⚠️ **Dit is de uitzondering uit §1, en hij staat hier met zoveel woorden.**
  --    Zonder deze regel wordt de `paused`-tak van de upsert hieronder door
  --    `guard_group_member_update()` geweigerd. Vóór 0187 werd hij stil
  --    teruggezet en gaf deze functie `ok: true` over iets dat niet gebeurd was.
  --
  -- ⚠️ `set_config(..., true)` is `set local`: de instelling valt weg aan het
  --    eind van deze transactie en lekt niet naar een volgend verzoek op dezelfde
  --    verbinding uit de pool.
  perform set_config('app.hervat_lidmaatschap', target.id::text, true);

  insert into group_members (group_id, user_id, role, status)
  values (target.id, auth.uid(), 'member', 'active')
  on conflict (group_id, user_id) do update
    set status = case
      when group_members.status = 'paused' then 'active'
      else group_members.status
    end;

  update groups
  set status = 'active', last_activity_at = now()
  where id = target.id;

  return jsonb_build_object('ok', true, 'group_id', target.id);
end;
$$;

comment on function public.join_group_with_code(text) is
  'Toetreden met een uitnodigingscode. Zet sinds 0187 `app.hervat_lidmaatschap` '
  'zodat guard_group_member_update() de overgang paused->active van de eigen rij '
  'doorlaat in plaats van hem stil terug te zetten (QS8-314).';

-- ---------------------------------------------------------------------------
-- 3. De teller onder de tweede sleutel
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`app.hervat_lidmaatschap` is de tweede ontgrendelsleutel van dit project,
--    en hij kwam er bijna zonder teller in.** 0153 bouwde voor de eerste
--    (`app.heropent_groep`) `sleutelzetters()` met deze reden erbij: *"Een nieuw
--    bypass-mechanisme zonder eigen teller zou de uitzondering zijn."* Deze
--    migratie máákte zo'n mechanisme; de teller hoort er dus bij.
--
-- 📏 Aangewezen door de security-ronde en zelf nagemeten: een derde functie die
--    `set_config('app.hervat_lidmaatschap', …)` doet en élke projectregel volgt
--    (definer, `search_path`, `revoke … from public, anon, authenticated`, alleen
--    `service_role`) liet de volledige suite groen. Niets werd er rood van.
--    Precies de deur die alleen dichtzit omdat er verderop een `if` staat.
--
-- ⚠️ **Uitgebreid en niet gekloond, en met een derde tak erbij.** Twee losse
--    tellers zijn twee lijsten die uit elkaar lopen — de fout van 0032/0034
--    (QS8-261). En een teller per sleutel dekt alleen de sleutels die iemand
--    erin heeft gezet: de derde sleutel die ooit bedacht wordt, staat in geen
--    enkel register en zou door beide tellers heen glippen. Daarom meldt deze
--    functie óók élke functie die een `app.`-instelling noemt die hier niet
--    geregistreerd staat.
--
-- 📏 Vandaag zijn het er precies twee sleutels en vijf functies, gemeten aan
--    `pg_proc` en niet aan de bestanden — dus de derde tak meldt vandaag niets
--    en is geen ruis:
--
--      archief_blijft_archief     app.heropent_groep
--      heropen_groep              app.heropent_groep
--      sleutelzetters             app.heropent_groep   (de teller zelf)
--      guard_group_member_update  app.hervat_lidmaatschap
--      join_group_with_code       app.hervat_lidmaatschap
--
-- ⚠️ De handtekening blijft `returns table (naam text, bezwaar text)`, dus dit is
--    een `create or replace` zonder drop en `tests/rls/archief-leesbaar.test.ts`
--    en `scripts/dode-keten-controle.mjs` blijven werken zoals ze zijn.

create or replace function public.sleutelzetters()
  returns table (naam text, bezwaar text)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with sleutel(instelling, toegestaan) as (
    values
      ('app.heropent_groep',      array['heropen_groep', 'archief_blijft_archief']),
      ('app.hervat_lidmaatschap', array['join_group_with_code', 'guard_group_member_update'])
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

comment on function public.sleutelzetters() is
  'Functies die een ontgrendelsleutel van dit project noemen. Hoort leeg te zijn. '
  'Sinds 0187 twee sleutels in plaats van een: app.heropent_groep (0153) en '
  'app.hervat_lidmaatschap (0187), plus een derde tak die elke ongeregistreerde '
  'app.-instelling meldt. Een functie te veel is een tweede sleutel op een slot '
  'dat voor iedereen dichtzit.';

revoke all on function public.sleutelzetters() from public, anon, authenticated;
grant execute on function public.sleutelzetters() to service_role;

-- ⚠️ De grants staan al op deze functie (0011 en verder) en `create or replace`
--    zonder handtekeningwijziging laat ze staan. Toch opnieuw uitgeschreven,
--    want een `revoke` die `authenticated` niet noemt is in Supabase geen revoke
--    (CLAUDE.md, onwrikbare regel 4).
revoke all on function public.join_group_with_code(text) from public, anon, authenticated;
grant execute on function public.join_group_with_code(text) to authenticated;
