-- 0145_melden_en_blokkeren.sql — een meldknop en een blokkade (QS8-232)
--
-- ROLLBACK-PAD:
--   drop function if exists public.verwijder_lid(uuid, uuid, boolean);
--   drop function if exists public.mijn_blokkades();
--   drop function if exists public.blokkeer(uuid);
--   drop function if exists public.deblokkeer(uuid);
--   drop function if exists public.meld(uuid, uuid, uuid, text, text);
--   drop function if exists public.meldingen_over();
--   -- ⚠️ **De revoke hoort er ook bij een triggerfunctie te staan**, en dat was hier
--    vergeten. `alter default privileges` deelt élke nieuwe functie in `public`
--    uit aan `anon`, `authenticated` én `service_role`; zonder dit blok staat de
--    triggerfunctie als RPC in de API en kan iedereen hem aanroepen. Drie tests
--    werden er rood van (`functiegrants`, `hulpfuncties`, `epic7`) — precies
--    waarvoor ze in 0115 gebouwd zijn.
--
-- ⚠️ Géén `grant execute` terug: een trigger draait als zijn eigenaar en heeft
--    geen enkel uitvoerrecht van een client nodig.
revoke all on function public.meld_uitzetting() from public, anon, authenticated;

drop trigger if exists group_members_uitzetting on public.group_members;
--   drop function if exists public.meld_uitzetting();
--   drop function if exists public.blokkade_met_groep(uuid, uuid);
--   drop table if exists public.reports;
--   drop table if exists public.user_blocks;
--   alter table public.group_events drop constraint if exists group_events_type_valid;
--   -- en die terug op de lijst van 0144 (zonder `member_removed`).
--   -- join_group_with_code(), vraag_lidmaatschap_aan(), beslis_lidmaatschapsverzoek()
--   -- en ontdek_groepen() terug uit 0017/0144 — zie sectie 6.
--
--   ⚠️ `reports` en `user_blocks` gaan in hun geheel weg, en dat kost meldingen
--      die iemand gedaan heeft en blokkades die iemand nodig had. Op een gevulde
--      database is dat dus geen rollback maar een besluit.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Migratie 0144 heeft er gisteren voor gezorgd dat onbekenden bij elkaar in een
-- groep kunnen komen. Tot die dag was er geen meldknop nodig: elke groep bestond
-- uit mensen die elkaar kenden, en wie zich misdroeg werd daar buiten de app op
-- aangesproken. Die rem is nu weg en de app heeft er zelf niets voor.
--
-- ⚠️ **Dit issue loopt dus achter op een feature die al gebouwd is**, en dat is
--    de reden dat het meteen volgt en niet ergens in het epic.
--
-- ---------------------------------------------------------------------------
-- Wat er al bleek te bestaan, en wat er ontbrak
-- ---------------------------------------------------------------------------
--
-- QS8-232 punt 3 vroeg na te kijken of het uitzetten van een lid er al deels is.
-- Gemeten met `pg_policies` en `pg_get_functiondef()`, niet gelezen:
--
--   * **De handeling bestaat.** `group_members_update` laat `is_group_admin()`
--     door en `guard_group_member_update()` (0029) laat een beheerder de rij van
--     een ander wijzigen. Een beheerder kan vandaag `status = 'inactive'` zetten
--     met één verzoek aan PostgREST.
--   * **De afhandeling bestaat niet.** Er komt geen rij in `group_events`, de
--     doelen van de uitgezette blijven aan de groep hangen, en zijn openstaande
--     deadline-verzoeken blijven `open` staan — precies het autorisatiegat dat
--     `verlaat_groep()` (0102) met zoveel woorden dichtzet: de groep die je net
--     verlaten hebt, mag geen streefdatum meer verzetten.
--   * **En er is geen scherm.** De knop bestond dus alleen voor wie zelf een
--     verzoek kan opstellen.
--
-- ⚠️ **De audit hangt daarom aan een trigger en niet aan de RPC.** Dat is de les
--    van §7 in WERKVOORRAAD: zoek álle routes naar een effect. Zou het spoor in
--    `verwijder_lid()` staan, dan is het spoor precies zo betrouwbaar als de
--    belofte dat niemand de kale UPDATE gebruikt — en die belofte is geen
--    grendel. `meld_uitzetting()` schrijft de rij ongeacht waar de wijziging
--    vandaan komt.
--
-- ---------------------------------------------------------------------------
-- De gemelde persoon merkt niets — en dat is meer dan één policy
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Dit is de gevoeligste eis van dit issue.** Wie weet dát hij gemeld is,
--    weet in een groep van drie ook dóór wie. Drie plekken volgen daaruit:
--
--    1. `reports_select` noemt de melder en de beheerder van de groep — en sluit
--       de gemelde persoon met zoveel woorden uit. Zonder die derde voorwaarde
--       leest een beheerder die zélf gemeld wordt zijn eigen melding, en dat is
--       precies het geval waarin het gevaarlijk is.
--    2. Er komt géén systeembericht en geen `group_events`-rij van een melding.
--       Het spoor van een melding is de melding zelf.
--    3. `user_blocks_select` noemt alleen de blokkeerder. Niet
--       `or blocked_id = auth.uid()` — dat leest als symmetrie en is een
--       mededeling.
--
-- ---------------------------------------------------------------------------
-- Een blokkade werkt in twee richtingen, en zegt dat nooit
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Symmetrisch in werking, eenzijdig in zicht.** Blokkeert A B, dan mag ook
--    B niet in een groep komen waar A in zit. Zou de blokkade alleen de ene kant
--    op werken, dan beschermt hij tegen benaderd worden en niet tegen samen in
--    een groep zitten — en dat tweede is wat QS8-232 punt 4 vraagt.
--
-- ⚠️ **En de weigering verraadt niets.** Elke route geeft het antwoord dat hij
--    toch al gaf voor "die groep bestaat niet voor jou": `invalid` bij een code,
--    `not_open` bij een aanvraag. Een eigen reden (`blocked`) zou de geweigerde
--    vertellen dat iemand in díe groep hem geblokkeerd heeft, en in een groep van
--    drie is dat een naam.
--
-- ⚠️ **Een blokkade werkt vooruit en zet niemand uit een groep waar hij al in
--    zit.** Dat is een besluit en geen omissie: zou blokkeren iemand
--    verwijderen, dan ís de blokkade een luide mededeling aan de geblokkeerde —
--    hij vliegt eruit op het moment dat jij op de knop drukt. Wie iemand kwijt
--    wil met wie hij al in een groep zit, verlaat de groep of vraagt de
--    beheerder. Dat staat ook zo in de tekst bij de knop.
--
-- ---------------------------------------------------------------------------
-- Wat er met een melding gebeurt, en wat we daarover beloven
-- ---------------------------------------------------------------------------
--
-- Er is geen moderatieproces — dat staat als `phase:v3` op het bord. De eerlijke
-- afhandeling is dus: de beheerder van de groep ziet hem, en Quinten kan ze
-- uitlezen. **De copy belooft precies dat en niets meer.** Een melding die
-- "wordt beoordeeld" terwijl er niemand kijkt, is erger dan geen meldknop.

begin;

-- ---------------------------------------------------------------------------
-- 1. Blokkades
-- ---------------------------------------------------------------------------

create table if not exists public.user_blocks (
  blocker_id uuid        not null references public.profiles (id) on delete cascade,
  blocked_id uuid        not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (blocker_id, blocked_id),
  constraint user_blocks_niet_jezelf check (blocker_id <> blocked_id)
);

-- ⚠️ De omgekeerde richting krijgt een eigen index, want `blokkade_met_groep()`
--    zoekt hem uit béide kanten. De primaire sleutel dekt alleen `blocker_id`
--    voorop (onwrikbare regel 11).
create index if not exists user_blocks_geblokkeerde_idx
  on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

-- ⚠️ **Alleen de blokkeerder, en dat is de hele policy.** Geen tak voor
--    `blocked_id = auth.uid()`: die zou van een stille maatregel een mededeling
--    maken, en dan is blokkeren iets wat je je twee keer bedenkt.
drop policy if exists user_blocks_select on public.user_blocks;
create policy user_blocks_select on public.user_blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));

drop policy if exists user_blocks_insert on public.user_blocks;
create policy user_blocks_insert on public.user_blocks
  for insert to authenticated
  with check (blocker_id = (select auth.uid()));

-- ⚠️ Deblokkeren moet kunnen. Een blokkade die je niet terug kunt draaien, is
--    een straf en geen instelling.
drop policy if exists user_blocks_delete on public.user_blocks;
create policy user_blocks_delete on public.user_blocks
  for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- ⚠️ `using (false)` en niet "geen policy": onwrikbare regel 1 wil op elke tabel
--    alle vier de werkwoorden, zodat er staat dát erover nagedacht is. Aan een
--    blokkade valt niets bij te stellen — je hebt hem of je hebt hem niet.
drop policy if exists user_blocks_update on public.user_blocks;
create policy user_blocks_update on public.user_blocks
  for update to authenticated
  using (false);

revoke all on public.user_blocks from anon;
grant select, insert, delete on public.user_blocks to authenticated;

comment on table public.user_blocks is
  'Wie wil wie niet tegenkomen (QS8-232). ⚠️ Werkt in twee richtingen — zie '
  'blokkade_met_groep() — maar is maar voor één kant zichtbaar: de '
  'geblokkeerde hoort er nooit iets over.';

-- ---------------------------------------------------------------------------
-- 2. Zit er een blokkade tussen deze persoon en deze groep?
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Eén functie, en élke route naar een lidmaatschap roept hem aan.** Dat is
--    letterlijk wat QS8-232 punt 4 vraagt: zet de blokkade in de database, niet
--    in de koppelquery alleen — anders is er één route die hem respecteert en
--    één die hem vergeet. Vandaag zijn dat er vier (sectie 6); het automatisch
--    koppelen van QS8-233 wordt de vijfde en hoort dezelfde functie te gebruiken.
--
-- ⚠️ **Beide richtingen in één `exists`.** Wie hier ooit één kant weghaalt,
--    verandert de betekenis van blokkeren zonder dat er iets stukgaat.
--
-- ⚠️ Uitgezette leden tellen niet mee: `status <> 'inactive'`. Een blokkade met
--    iemand die er niet meer is, mag je niet buitenhouden.

create or replace function public.blokkade_met_groep(p_group_id uuid, p_user uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from group_members m
    join user_blocks b
      on (b.blocker_id = m.user_id and b.blocked_id = p_user)
      or (b.blocker_id = p_user    and b.blocked_id = m.user_id)
    where m.group_id = p_group_id
      and m.status  <> 'inactive'
      and m.user_id <> p_user
  );
$$;

comment on function public.blokkade_met_groep(uuid, uuid) is
  'Zit er een blokkade — in welke richting dan ook — tussen p_user en een actief '
  'lid van deze groep? (QS8-232) ⚠️ Élke route naar een lidmaatschap toetst dit. '
  'Wie een route toevoegt zonder deze functie, maakt de blokkade een halve.';

revoke all on function public.blokkade_met_groep(uuid, uuid) from public, anon, authenticated;

-- ⚠️ Géén `grant execute` aan `authenticated`, en dat is met opzet. De functie
--    beantwoordt precies de vraag die niemand mag kunnen stellen: "zit er iemand
--    in die groep die mij geblokkeerd heeft?" Hij is er voor de RPC's hieronder,
--    die als DEFINER draaien en hem dus mogen aanroepen.

-- ---------------------------------------------------------------------------
-- 3. Blokkeren en deblokkeren
-- ---------------------------------------------------------------------------
--
-- ⚠️ Een RPC en niet de kale insert die de policy ook toelaat. Reden: de
--    zelftoets, een eenduidig antwoord bij een dubbele blokkade, en één plek waar
--    dit ooit een limiet kan krijgen. De policy blijft eronder liggen als tweede
--    slot.

create or replace function public.blokkeer(p_user uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Niet ingelogd';
  end if;

  if p_user is null or p_user = (select auth.uid()) then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;

  -- ⚠️ Eén antwoord voor "bestaat niet" en "bestaat wel". Zou dit onderscheid
  --    maken, dan is deze functie een manier om te toetsen of een profiel-id
  --    bestaat.
  if not exists (select 1 from profiles p where p.id = p_user) then
    return jsonb_build_object('ok', true);
  end if;

  insert into user_blocks (blocker_id, blocked_id)
  values ((select auth.uid()), p_user)
  on conflict do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.deblokkeer(p_user uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Niet ingelogd';
  end if;

  delete from user_blocks
   where blocker_id = (select auth.uid())
     and blocked_id = p_user;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.blokkeer(uuid)   from public, anon, authenticated;
revoke all on function public.deblokkeer(uuid) from public, anon, authenticated;
grant execute on function public.blokkeer(uuid)   to authenticated;
grant execute on function public.deblokkeer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3a. Je eigen blokkadelijst, mét namen
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Zonder deze functie is de lijst onbruikbaar terwijl elke schakel klopt.**
--    `profiles_select` laat `display_name` alleen door voor wie een groep met je
--    deelt, en iemand die je geblokkeerd hebt deelt er vaak geen meer. De tabel,
--    de policy en het scherm zijn dan alle drie in orde en de gebruiker ziet een
--    rij "Iemand" die hij niet kan thuisbrengen — en dus niet durft op te heffen.
--    CLAUDE.md regel 18, vraag 5: is de keten ergens onderbroken terwijl elk
--    schakeltje af is?
--
-- ⚠️ **Dit verruimt niets.** Hij geeft uitsluitend de namen van mensen die jij
--    zélf geblokkeerd hebt — die ken je per definitie, want je hebt ze
--    aangewezen. Er is geen argument mee te vragen; de lijst ís je eigen lijst.
--
-- ⚠️ Een naamkopie op `user_blocks` was het alternatief en is afgewezen:
--    persoonsgegevens verdubbelen om een leesrecht te omzeilen, en een naam die
--    daarna nooit meer meeverandert.

create or replace function public.mijn_blokkades()
  returns table (
    user_id      uuid,
    display_name text,
    created_at   timestamptz
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select b.blocked_id, p.display_name, b.created_at
  from user_blocks b
  join profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc
  limit 200;
$$;

comment on function public.mijn_blokkades() is
  'De blokkades van de ingelogde gebruiker, met de naam erbij (QS8-232). '
  '⚠️ Uitsluitend je eigen lijst — er is geen argument. Bestaat omdat '
  'profiles_select de naam van een geblokkeerde meestal niet doorlaat.';

revoke all on function public.mijn_blokkades() from public, anon, authenticated;
grant execute on function public.mijn_blokkades() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Meldingen
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Altijd een persoon, soms ook een bericht.** Een gemeld bericht ís een
--    melding over degene die het schreef, dus `subject_id` is nooit leeg en
--    `message_id` mag dat wel. Dat scheelt een polymorfe verwijzing zonder
--    foreign key, en het is bovendien wat een lezer wil weten: over wie gaat dit.
--
-- ⚠️ **De tekst van het bericht wordt gekopieerd, en dat is geen gemak.** Wie
--    gemeld wordt kan zijn eigen bericht verwijderen (`chat_messages_delete`), en
--    dan blijft er een melding over die naar niets wijst — of erger, die na een
--    `on delete cascade` helemaal verdwijnt. Een melding is een kopie die zijn
--    onderwerp overleeft; dezelfde gedachte als bij systeemberichten in
--    beslisdocument 002 §3.
--
--    Vandaar ook `on delete set null` op `message_id`: het bericht mag weg, de
--    melding niet.

create table if not exists public.reports (
  id          uuid        primary key default gen_random_uuid(),
  reporter_id uuid        not null references public.profiles (id)      on delete cascade,
  subject_id  uuid        not null references public.profiles (id)      on delete cascade,
  group_id    uuid        not null references public.groups (id)        on delete cascade,
  message_id  uuid                 references public.chat_messages (id) on delete set null,
  -- Een kopie, want het origineel kan weg. Zie de kop.
  bericht_kopie text,
  reden       text        not null,
  toelichting text,
  status      text        not null default 'open',
  created_at  timestamptz not null default now(),

  constraint reports_niet_jezelf check (reporter_id <> subject_id),
  constraint reports_reden_geldig check (
    reden in ('harassment', 'spam', 'inappropriate', 'impersonation', 'other')
  ),
  constraint reports_status_geldig check (status in ('open', 'reviewed', 'dismissed')),
  constraint reports_toelichting_len
    check (toelichting is null or char_length(toelichting) between 1 and 1000)
);

-- ⚠️ **Los en niet in de `create table` hierboven, en dat is een gerepareerde
--    fout.** Een constraint binnen `create table if not exists` wordt bij een
--    tweede ronde overgeslagen samen met de tabel — de regel stond er, de
--    constraint niet, en `tests/rls/tekstgrenzen.test.ts` bleef rood terwijl het
--    bestand er goed uitzag. Een aparte `alter` werkt in beide gevallen.
--
-- ⚠️ De grens is niet dubbelop met `left(…, 1000)` in `meld()`. Tekst zonder
--    grens is opslag van een ander (0123), en die grendel hoort bij de kolom te
--    staan en niet bij de enige functie die er vandaag in schrijft.
alter table public.reports drop constraint if exists reports_kopie_len;
alter table public.reports add constraint reports_kopie_len
  check (bericht_kopie is null or char_length(bericht_kopie) <= 1000);

create index if not exists reports_groep_idx   on public.reports (group_id, status);
create index if not exists reports_melder_idx  on public.reports (reporter_id);
create index if not exists reports_gemelde_idx on public.reports (subject_id);
create index if not exists reports_bericht_idx on public.reports (message_id);

alter table public.reports enable row level security;

-- ⚠️ **De derde voorwaarde is de belangrijkste van de drie.** Zonder
--    `subject_id <> auth.uid()` leest een beheerder die zélf gemeld wordt zijn
--    eigen melding — en dat is precies het geval waarin "de gemelde merkt niets"
--    ertoe doet. Zo'n melding is dan alleen voor de melder en voor Quinten
--    zichtbaar, en dat is de juiste uitkomst en geen gat.
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated
  using (
    reporter_id = (select auth.uid())
    or (is_group_admin(group_id) and subject_id <> (select auth.uid()))
  );

-- ⚠️ Schrijven gaat uitsluitend via `meld()`: die kopieert de berichttekst, leidt
--    de gemelde persoon af uit het bericht en toetst de dagrem. Een kale insert
--    slaat dat alle drie over.
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert to authenticated
  with check (false);

-- ⚠️ Een melding is een waarneming en geen dossier: hij wordt niet bijgesteld en
--    niet ingetrokken. Komt er ooit een moderatieproces (`phase:v3`), dan zet dat
--    de status vanuit `service_role` — niet vanuit een client.
drop policy if exists reports_update on public.reports;
create policy reports_update on public.reports
  for update to authenticated
  using (false);

drop policy if exists reports_delete on public.reports;
create policy reports_delete on public.reports
  for delete to authenticated
  using (false);

revoke all on public.reports from anon;
grant select on public.reports to authenticated;

comment on table public.reports is
  'Meldingen over een persoon of een bericht (QS8-232). ⚠️ De gemelde persoon '
  'mag dit nooit zien — reports_select sluit hem uit, óók als hij beheerder van '
  'de groep is. Schrijven gaat uitsluitend via meld().';

-- ---------------------------------------------------------------------------
-- 5. De dagrem op meldingen
-- ---------------------------------------------------------------------------
--
-- ⚠️ Zelfde vorm en zelfde reden als `weekdoelen_over()` (0091) en
--    `lidmaatschapsverzoeken_over()` (0144) — beveiligingsregel 5. Een meldknop
--    zonder rem is een manier om één beheerder te bedelven, en dat is misbruik
--    van de veiligheidsmaatregel zelf.
--
-- ⚠️ Faalt dicht bij een lege `auth.uid()`: nul, en niet de hele limiet.
--
-- ⚠️ Twintig en geen tien: dit is de knop die iemand indrukt als er écht iets
--    aan de hand is, en die mag niet als eerste opraken. Twintig meldingen op één
--    dag is nog steeds ruim boven wat een gebruiker met een echt probleem doet.

create or replace function public.meldingen_over()
  returns integer
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select case
    when (select auth.uid()) is null then 0
    else greatest(
      0,
      20 - (
        select count(*)::integer
        from reports r
        where r.reporter_id = (select auth.uid())
          and r.created_at > now() - interval '1 day'
      )
    )
  end;
$$;

comment on function public.meldingen_over() is
  'Hoeveel meldingen de ingelogde gebruiker vandaag nog mag doen '
  '(beveiligingsregel 5, vorm uit 0091). Geeft zonder sessie nul terug.';

revoke all on function public.meldingen_over() from public, anon, authenticated;
grant execute on function public.meldingen_over() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Melden
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De aanroeper zegt niet wie hij meldt als hij een bericht meldt.** Dan zou
--    hij een melding over persoon A kunnen hangen aan een bericht van B. De
--    functie leest `sender_id` uit het bericht zelf.

create or replace function public.meld(
  p_group_id    uuid,
  p_subject_id  uuid default null,
  p_message_id  uuid default null,
  p_reden       text default 'other',
  p_toelichting text default null
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_subject uuid;
  v_kopie   text;
  v_type    text;
begin
  if (select auth.uid()) is null then
    raise exception 'Niet ingelogd';
  end if;

  if meldingen_over() <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  -- ⚠️ Alleen over een groep waar je zelf in zit. `is_group_member()` en niet
  --    "de groep bestaat": zonder die eis is dit een manier om over willekeurige
  --    mensen een dossier te openen dat een vreemde beheerder te lezen krijgt.
  if not is_group_member(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;

  if p_message_id is not null then
    select m.sender_id, m.body, m.type
      into v_subject, v_kopie, v_type
    from chat_messages m
    where m.id = p_message_id
      and m.group_id = p_group_id;

    if v_subject is null then
      return jsonb_build_object('ok', false, 'reason', 'unknown_message');
    end if;

    -- ⚠️ Een systeembericht melden slaat nergens op: het is niet door een mens
    --    geschreven. Zou dat wél kunnen, dan hangt de melding aan wie de
    --    handeling deed, en dat is een melding over iets wat de app zelf zei.
    --
    -- ⚠️ **`= 'system'` en niet `<> 'text'`.** `chat_messages_type_valid` kent
    --    vier waarden — `text`, `photo`, `doc` en `system` — en de eerste drie
    --    zijn alle drie door een mens gemaakt. Een toets op één toegestane waarde
    --    zou een foto onmeldbaar maken, en dat is precies het bericht waarvoor
    --    een meldknop bestaat. Hier stond `<> 'user'`, een waarde die niet
    --    bestaat; `tests/rls/veiligheid.test.ts` vond het meteen.
    if v_type = 'system' then
      return jsonb_build_object('ok', false, 'reason', 'unknown_message');
    end if;
  else
    v_subject := p_subject_id;
  end if;

  if v_subject is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_subject');
  end if;

  if v_subject = (select auth.uid()) then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;

  -- De gemelde hoort in dezelfde groep te zitten. Een uitgezet lid mag nog wel
  -- gemeld worden om wat hij dééd — vandaar geen `status`-toets.
  if not exists (
    select 1 from group_members m
    where m.group_id = p_group_id and m.user_id = v_subject
  ) then
    return jsonb_build_object('ok', false, 'reason', 'unknown_subject');
  end if;

  insert into reports (reporter_id, subject_id, group_id, message_id, bericht_kopie, reden, toelichting)
  values (
    (select auth.uid()),
    v_subject,
    p_group_id,
    p_message_id,
    left(v_kopie, 1000),
    coalesce(p_reden, 'other'),
    nullif(btrim(coalesce(p_toelichting, '')), '')
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.meld(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.meld(uuid, uuid, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Een uitzetting is een handeling — en het spoor hangt aan de tabel
-- ---------------------------------------------------------------------------

alter table public.group_events drop constraint if exists group_events_type_valid;
alter table public.group_events add constraint group_events_type_valid check (
  event_type in (
    'admin_transferred', 'group_archived', 'member_left', 'visibility_changed',
    'discoverable_changed', 'join_request_decided',
    -- QS8-232
    'member_removed'
  )
);

-- ⚠️ **Een trigger en geen regel in de RPC, en dat is de kern van dit blok.**
--    Een beheerder kan sinds 0029 `status = 'inactive'` zetten met één verzoek
--    aan PostgREST. Zou het spoor in `verwijder_lid()` staan, dan is het precies
--    zo betrouwbaar als de belofte dat niemand die kale UPDATE gebruikt — en dat
--    is geen grendel maar een afspraak. Hier hangt het aan het effect, dus élke
--    route schrijft de rij.
--
-- ⚠️ **Alleen als een ánder het doet.** Jezelf op `inactive` zetten is geen
--    uitzetting; vertrekken loopt over `verlaat_groep()` en dat schrijft zijn
--    eigen `member_left`. Zonder deze voorwaarde zou elk vertrek twee rijen
--    opleveren die verschillende dingen beweren.
--
-- ⚠️ **Géén systeembericht.** "X is uit de groep gezet" is een uitspraak over
--    een ander die niets positiefs draagt — domeinregel 7 — en bovendien een
--    mededeling waar de uitgezette zelf niet meer op kan reageren. Het spoor is
--    voor de leden leesbaar in `group_events` en dat is genoeg.

create or replace function public.meld_uitzetting()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if new.status = 'inactive'
     and old.status <> 'inactive'
     and (select auth.uid()) is not null
     and (select auth.uid()) <> new.user_id
  then
    insert into group_events (group_id, actor_id, subject_id, event_type, old_value, new_value)
    values (
      new.group_id,
      (select auth.uid()),
      new.user_id,
      'member_removed',
      jsonb_build_object('status', old.status, 'role', old.role),
      jsonb_build_object('status', 'inactive')
    );
  end if;

  return new;
end;
$$;

-- ⚠️ **AFTER en niet BEFORE.** `guard_group_member_update()` draait BEFORE en
--    kan `new.status` terugzetten naar de oude waarde voor wie geen beheerder
--    is. Zou dit ook BEFORE staan, dan hangt het van de triggervolgorde af of er
--    een spoor komt van een wijziging die daarna stil ongedaan wordt gemaakt —
--    een auditregel over iets dat niet gebeurd is.
drop trigger if exists group_members_uitzetting on public.group_members;
create trigger group_members_uitzetting
  after update on public.group_members
  for each row
  execute function public.meld_uitzetting();

-- ---------------------------------------------------------------------------
-- 8. `verwijder_lid()` — de afhandeling eromheen
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Vorm en volgorde overgenomen van `verlaat_groep()` (0102)**, want het is
--    dezelfde gebeurtenis van de andere kant. Wat daar met zoveel woorden staat,
--    geldt hier onverkort:
--
--    * **De openstaande deadline-verzoeken eerst, en dat is geen opruimwerk maar
--      een autorisatiegat.** `beslis_deadline_verzoek()` toetst het lidmaatschap
--      van de *beslisser* en zegt niets over de aanvrager. Blijft het verzoek
--      `open`, dan kan de groep die iemand net heeft uitgezet nog steeds de
--      streefdatum verzetten van zijn doel.
--    * **Alleen déze groep laat los** (`and l.group_id = p_group_id`), en alleen
--      de doelen van de uitgezette.
--
-- ⚠️ **`inactive` en geen `delete`, en dat verschil is een besluit uit 0029.**
--    Vertrekken wist de rij; uitgezet worden laat hem staan. Anders kan iemand
--    die eruit gezet is met dezelfde uitnodigingslink weer binnenlopen — de tak
--    `reason = 'removed'` in `join_group_with_code()` leunt op precies die rij.
--
-- ⚠️ **De laatste beheerder kan niet worden uitgezet**, en dat is niet de
--    beleefdheidsvorm van `last_admin`: het is dezelfde grendel als in 0102. Een
--    groep zonder actieve beheerder houdt zijn uitnodigingscode en laat
--    wildvreemden binnen in iets wat niemand beheert.
--
-- ⚠️ **Het spoor staat hier niet.** Dat schrijft de trigger uit sectie 7.

create or replace function public.verwijder_lid(
  p_group_id  uuid,
  p_user_id   uuid,
  p_bevestigd boolean default false
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_status     text;
  v_rol        text;
  v_ontkoppeld integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Niet ingelogd';
  end if;

  -- Zelfde reden als in `verlaat_groep()`: de beslissing gaat over de rijen van
  -- ánderen, dus de gróép is wat vergrendeld moet worden.
  perform 1 from groups where id = p_group_id for update;

  if not is_group_admin(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  if p_bevestigd is not true then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed');
  end if;

  -- ⚠️ Jezelf uitzetten is vertrekken, en dat heeft zijn eigen functie met een
  --    overdracht erin. Zou dit het toelaten, dan is er een tweede route naar
  --    hetzelfde effect die de overdracht overslaat.
  if p_user_id = (select auth.uid()) then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;

  select m.status, m.role into v_status, v_rol
  from group_members m
  where m.group_id = p_group_id and m.user_id = p_user_id
  for update;

  if v_status is null then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;

  if v_status = 'inactive' then
    return jsonb_build_object('ok', false, 'reason', 'already_removed');
  end if;

  if v_rol = 'admin' and not exists (
    select 1 from group_members m
    where m.group_id = p_group_id
      and m.user_id  not in (p_user_id)
      and m.role     = 'admin'
      and m.status  <> 'inactive'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'last_admin');
  end if;

  update deadline_requests
     set status     = 'withdrawn',
         decided_at = now()
   where group_id     = p_group_id
     and requester_id = p_user_id
     and status       = 'open';

  with weg as (
    delete from goal_group_links l
    using goals d
    where l.goal_id  = d.id
      and l.group_id = p_group_id
      and d.owner_id = p_user_id
    returning 1
  )
  select count(*) into v_ontkoppeld from weg;

  update group_members
     set status = 'inactive'
   where group_id = p_group_id
     and user_id  = p_user_id;

  return jsonb_build_object('ok', true, 'ontkoppelde_doelen', v_ontkoppeld);
end;
$$;

revoke all on function public.verwijder_lid(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.verwijder_lid(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. De vier routes naar een lidmaatschap
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Dit is de sectie waar dit issue aan had kunnen bezwijken, en de reden
--    staat in WERKVOORRAAD §7: zoek álle routes naar een effect, niet de route
--    die je net gevonden hebt.** Eén gat kostte daar vier migraties. Twee mensen
--    kunnen vandaag langs vier wegen in dezelfde groep belanden:
--
--      1. `join_group_with_code()` — een uitnodigingslink (0017).
--      2. `vraag_lidmaatschap_aan()` — zelf aankloppen (0144).
--      3. `beslis_lidmaatschapsverzoek()` — de beheerder neemt aan (0144).
--      4. `ontdek_groepen()` — de zoeklijst, waar route 2 begint (0144).
--
--    En er komt een vijfde: het automatisch koppelen van QS8-233. Die hoort
--    `blokkade_met_groep()` aan te roepen en geen eigen variant te schrijven —
--    dat is letterlijk wat QS8-232 punt 4 vraagt.
--
--    `create_group()` staat er niet bij: daar ben je alleen.
--
-- ⚠️ **Route 3 is de enige met een eigen reden, en dat is een afweging.** Een
--    blokkade die ná de aanvraag ontstaat, komt hier aan het licht. `blocked`
--    vertelt de behérder dat het niet kan; hij leert niet wie er blokkeert en of
--    het zijn eigen blokkade is. Dat is de bodem: hij besluit over toelating en
--    kan niet niets te horen krijgen. Bij de andere drie is er wél een bestaand
--    antwoord dat niets verraadt, en dat wordt hergebruikt.

-- --- Route 1 -----------------------------------------------------------------
--
-- ⚠️ `invalid` en geen eigen reden: precies wat een onbekende code oplevert.
--    Iemand met een geldige link van een vriend krijgt dus "deze link werkt
--    niet". Verwarrend, en het alternatief vertelt hem dat iemand in díe groep
--    hem geblokkeerd heeft — in een groep van drie is dat een naam.
--
-- ⚠️ **Ná de `invite_events`-rij en vóór alles wat over de groep zelf gaat.** De
--    dagrem moet ook voor deze poging tellen: zou hij dat niet doen, dan is dit
--    een gratis manier om codes af te tasten.

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

-- --- Route 2 -----------------------------------------------------------------
--
-- ⚠️ `not_open` en geen eigen reden. Die tak deed in 0144 al dienst voor "die
--    groep bestaat niet" én "die groep is niet vindbaar", precies zodat deze
--    functie geen manier wordt om te toetsen of een groeps-id bestaat. Een
--    blokkade hoort in dezelfde categorie.

create or replace function public.vraag_lidmaatschap_aan(
  p_group_id uuid,
  p_bericht  text default null
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_ontdekbaar boolean;
  v_status     text;
begin
  if (select auth.uid()) is null then
    raise exception 'Niet ingelogd';
  end if;

  if lidmaatschapsverzoeken_over() <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select g.ontdekbaar, g.status into v_ontdekbaar, v_status
  from groups g where g.id = p_group_id;

  -- ⚠️ Eén antwoord voor "bestaat niet", "is niet ontdekbaar" en sinds QS8-232
  --    ook "er zit een blokkade tussen". Drie antwoorden zouden van deze functie
  --    een aftastinstrument maken.
  if v_ontdekbaar is not true
     or v_status = 'archived'
     or blokkade_met_groep(p_group_id, (select auth.uid()))
  then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;

  if exists (
    select 1 from group_members m
    where m.group_id = p_group_id
      and m.user_id = (select auth.uid())
      and m.status <> 'inactive'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_member');
  end if;

  insert into group_join_requests (group_id, user_id, bericht)
  values (p_group_id, (select auth.uid()), nullif(btrim(coalesce(p_bericht, '')), ''))
  on conflict do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

-- --- Route 3 -----------------------------------------------------------------
--
-- ⚠️ **Het venster dat route 2 openlaat.** Een aanvraag kan er al staan wanneer
--    de blokkade ontstaat. Zonder deze toets neemt de beheerder hem daarna
--    gewoon aan en is de blokkade omzeild door te wachten.
--
-- ⚠️ Bij een blokkade wordt de aanvraag **niet** stilletjes afgewezen. Dat zou
--    de beheerder iets laten doen wat hij niet gedaan heeft, en het spoor in
--    `group_events` zou een besluit noemen dat van niemand is.

create or replace function public.beslis_lidmaatschapsverzoek(
  p_request_id uuid,
  p_naar       text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  r group_join_requests;
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
    -- ⚠️ `on conflict do nothing`: iemand kan intussen via een uitnodigingscode
    --    binnen zijn gekomen. Dan is de gewenste toestand al bereikt.
    insert into group_members (group_id, user_id, role, status)
    values (r.group_id, r.user_id, 'member', 'active')
    on conflict do nothing;
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

-- --- Route 4 -----------------------------------------------------------------
--
-- ⚠️ **De zoeklijst laat een groep met een blokkade niet zien, en dat is geen
--    tweede slot maar de eerste.** Route 2 weigert al, maar dan heeft iemand de
--    groep wel gezien en een knop ingedrukt die niets doet — en juist het
--    verschil tussen "de knop doet niets bij deze ene groep" en "hij doet het
--    overal" is de mededeling die we niet willen doen.
--
-- ⚠️ Dat het weglaten van een groep zelf een signaal is, klopt: wie twee
--    accounts naast elkaar legt, ziet het verschil. Dat is de bodem van wat hier
--    haalbaar is, en het is aanzienlijk stiller dan een knop die bij precies één
--    groep weigert.
--
-- ⚠️ De kolomlijst is onveranderd. Wat er niet in staat, bestaat voor een
--    buitenstaander niet — zie 0144.

create or replace function public.ontdek_groepen(
  p_categorie text default null,
  p_taal      text default null,
  p_limit     integer default 20,
  p_offset    integer default 0
)
  returns table (
    group_id     uuid,
    naam         text,
    categorie    text,
    omschrijving text,
    voertaal     text,
    huddle_day   smallint,
    leden        bigint,
    totaal       bigint
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with vindbaar as (
    select
      g.id,
      g.name,
      g.categorie,
      g.omschrijving,
      g.voertaal,
      g.huddle_day,
      (
        select count(*)
        from group_members m
        where m.group_id = g.id
          and m.status <> 'inactive'
      ) as leden
    from groups g
    where g.ontdekbaar
      and g.status <> 'archived'
      and (p_categorie is null or g.categorie = p_categorie)
      and (p_taal is null or g.voertaal = p_taal)
      -- QS8-232, route 4.
      and not blokkade_met_groep(g.id, (select auth.uid()))
  )
  select
    v.id,
    v.name,
    v.categorie,
    v.omschrijving,
    v.voertaal,
    v.huddle_day,
    v.leden,
    count(*) over ()
  from vindbaar v
  order by v.leden desc, v.name asc, v.id asc
  limit greatest(0, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$$;

commit;
