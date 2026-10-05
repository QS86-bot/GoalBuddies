-- 0300_de_koppelfunctie_die_groepen_vormt_uit_de_wachtrij.sql — de matcher die uit
-- de wachtrij van 0299 groepen van drie tot vijf vormt, plus de grendel die zo'n
-- groep voorgoed beschermd houdt.
--
-- ROLLBACK-PAD:
--   drop function if exists public.vorm_buddygroepen(date, integer);
--   drop function if exists public.vorm_een_buddygroep(uuid[]);
--   drop function if exists public.verloop_buddyzoekopdrachten(timestamptz);
--   -- blokkade_met_groep(uuid, uuid) woordelijk terug uit 0145 §2  ⚠️ eerst
--   drop function if exists public.blokkade_tussen(uuid, uuid);     --  dan deze
--   -- guard_group_update() woordelijk terug uit 0265
--   -- zet_groepszichtbaarheid(uuid, text, boolean) woordelijk terug uit 0076/0265
--   -- zet_groepsontdekbaarheid(uuid, boolean, boolean) woordelijk terug uit 0144
--   alter table public.groups drop constraint if exists groups_automatisch_niet_ontdekbaar;
--   alter table public.groups drop constraint if exists groups_automatisch_is_beschermd;
--   alter table public.groups drop column if exists automatisch;
--
--   ⚠️ De volgorde is bindend: eerst de constraints, dan de kolom. Andersom
--      weigert Postgres, en `idempotent:controle` speelt elke migratie direct ná
--      zichzelf af — dat is de klasse van 0252.
--
--   ⚠️⚠️ **En de twee blokkadefuncties staan in deze volgorde om de omgekeerde
--      reden: Postgres weigert hier níets.** De `blokkade_met_groep()` van deze
--      migratie róept `blokkade_tussen()` aan, en plpgsql zoekt een functie pas
--      op bij uitvoering — dus de drop slaagt en het gat is stil. 📏 Gemeten op
--      05-10-2026 met de drop vóór de terugzet: `ontdek_groepen`,
--      `invite_preview`, `join_group_with_code` en `vraag_lidmaatschap_aan`
--      geven alle vier `function public.blokkade_tussen(uuid, uuid) does not
--      exist` waar ze er ervóór een antwoord gaven. `beslis_lidmaatschapsverzoek`
--      is de vijfde aanroeper; die kwam in de meting niet tot de aanroep, dus
--      over hém staat hier niets.
--
--      De les is de reden dat dit in de kop staat en niet in een comment ergens
--      verderop: een rollback-pad dat je volgorde-fout *meldt* is te herstellen,
--      een dat hem doorlaat laat vijf routes achter die pas rood worden als een
--      gebruiker ze aanraakt.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-233. 0299 zette de wachtrij neer; dit is de kant die er groepen uit vormt.
--
-- ⚠️⚠️ **De kern is één zin uit CLAUDE.md: een automatisch gevormde groep is
--    beschermd, altijd, als constraint.** Niet als default en niet als keuze in
--    een scherm. Besluit A41 — een groep mag zichzelf `open` zetten — is genomen
--    voor groepen van **vrienden**. Een groep die uit deze wachtrij komt bestaat
--    per definitie uit mensen die elkaar niet gekozen hebben, en CLAUDE.md zegt
--    bij domeinregel 7 met zoveel woorden dat dat de regel **zwaarder** maakt.
--
--    Dat verschil bestond nergens in de database: `groups.zichtbaarheid` was al
--    niet client-schrijfbaar, maar `zet_groepszichtbaarheid()` is een legitieme
--    route die een beheerder mág gebruiken. `automatisch` maakt het verschil een
--    kolom, en de CHECK maakt er een eigenschap van in plaats van een gewoonte.

-- ---------------------------------------------------------------------------
-- 1. De kolom, en de twee CHECKs die hem aan iets vastknopen
-- ---------------------------------------------------------------------------
--
-- Woordelijk de vorm van `groups_ontdekbaar_is_beschermd` uit 0144.

alter table public.groups add column if not exists automatisch boolean not null default false;

alter table public.groups drop constraint if exists groups_automatisch_is_beschermd;
alter table public.groups add  constraint groups_automatisch_is_beschermd
  check (not automatisch or zichtbaarheid = 'beschermd');

-- ⚠️ Een automatisch gevormde groep is ook nooit **ontdekbaar**. Hij is door de
--    app samengesteld en niet door iemand gekozen; er een etalage van maken is
--    een ander besluit dan dit.
alter table public.groups drop constraint if exists groups_automatisch_niet_ontdekbaar;
alter table public.groups add  constraint groups_automatisch_niet_ontdekbaar
  check (not automatisch or not ontdekbaar);

comment on column public.groups.automatisch is
  'Is deze groep door de matcher van QS8-233 samengesteld in plaats van door een '
  'mens opgericht? Zo ja, dan is hij permanent beschermd en nooit ontdekbaar — '
  'twee CHECKs, een pin in guard_group_update() en een tak in beide zet-RPCs.';

-- ---------------------------------------------------------------------------
-- 2. De derde pin in de guard
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Zonder deze pin zijn de twee CHECKs hierboven decoratie.** Ze koppelen
--    `automatisch` aan `zichtbaarheid` en `ontdekbaar`; kon een beheerder
--    `automatisch` zelf op false zetten, dan vallen ze daarna weg en staat de weg
--    naar `open` alsnog open — in twee stappen in plaats van één. Een constraint
--    die je zelf kunt uitzetten is geen constraint.
--
-- ⚠️ De tak staat **ná** de vroege uitgang voor niet-`authenticated` rollen, want
--    de matcher draait als `service_role` en moet de kolom kunnen zetten.
--
-- ⚠️ Hieronder staat de volledige, ongewijzigde definitie van 0265 met precies
--    deze ene tak erbij. 📏 Programmatisch samengesteld en gedift: 12 regels
--    erbij, 0 regels weg. Dat is met opzet gemeten en niet overgetypt — een
--    `create or replace` die stilletjes een regel laat vallen is de klasse die
--    `registerdrift:controle` bestaat om te vangen.

create or replace function public.guard_group_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- ⚠️⚠️ **`id` en `created_at` staan vóór de vroege uitgang en gelden dus voor
  --    élke rol, `service_role` inbegrepen.** Dat is de vorm van QS8-314: een
  --    rolfilter is geen grendel voor de sleutel en de herkomst van een rij, want
  --    elke definer-functie komt er langs. 📏 Nagemeten dat geen enkele schrijver
  --    ze aanraakt — de elf functies die `groups` bijwerken zetten `status`,
  --    `last_activity_at`, `invite_code`, `invite_revoked`, `zichtbaarheid`,
  --    `ontdekbaar` en `huddle_day`, en verder niets — en er is geen
  --    referentiële actie die op deze twee kolommen wijst.
  if new.id is distinct from old.id then
    raise exception 'Het id van een groep ligt vast'
      using errcode = 'check_violation';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'De aanmaakdatum van een groep ligt vast'
      using errcode = 'check_violation';
  end if;

  -- ⚠️⚠️ **`created_by` hoort hier ook, en de vorm is die van
  --    `bewaak_begunstigde()` op `commitments` — gevonden in de security-ronde.**
  --
  --    📏 `groups_created_by_fkey` is `on delete set null`. Een accountverwijdering
  --    laat Postgres `update groups set created_by = null` doen, en die
  --    referentiële actie draait met `current_user = postgres`. Een kále toets
  --    boven de vroege uitgang breekt daarmee het wisrecht van iedereen die ooit
  --    een groep oprichtte — 📏 geijkt: 2 rode tests in `opruiming.test.ts`.
  --
  --    De eerste versie van deze migratie loste dat op door de toets ónder de
  --    uitgang te zetten. Dat werkt, maar het hangt de bescherming van de
  --    oprichter aan een **rolnaam**, en `docs/ENGINEER-REVIEW.md` heeft daar een
  --    open rij over: *"de deny-list op rolnaam faalt nu pas écht open"*.
  --
  --    De bestaanstoets haalt die afhankelijkheid weg. Tijdens een
  --    `on delete set null` is het ouderprofiel **al verdwenen**, dus de
  --    RI-actie komt er hoe dan ook langs — ongeacht wie hem uitvoert. Een
  --    client die het oprichterschap leegtrekt terwijl de oprichter nog bestaat,
  --    loopt er wél op stuk. Zelfde vorm en dezelfde reden als
  --    `bewaak_begunstigde()`.
  if old.created_by is not null and new.created_by is null
     and exists (select 1 from profiles p where p.id = old.created_by) then
    raise exception 'De oprichter van een groep is niet weg te halen zolang hij bestaat'
      using errcode = 'check_violation';
  end if;

  if new.created_by is distinct from old.created_by
     and new.created_by is not null then
    raise exception 'De oprichter van een groep ligt vast'
      using errcode = 'check_violation';
  end if;

  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- ⚠️ Hieronder staat alles wat een definer-functie wél legitiem verzet, plus
  --    `created_by` en `tz`. Voor die eerste groep is de vroege uitgang de
  --    bedoeling: `zet_groepszichtbaarheid()`, `zet_huddledag()`,
  --    `rotate_invite_code()` en de wekpaden horen erlangs te komen.

  if new.invite_code is distinct from old.invite_code then
    raise exception 'De uitnodigingscode verzet je met rotate_invite_code()'
      using errcode = 'check_violation';
  end if;

  if new.invite_revoked is distinct from old.invite_revoked then
    raise exception 'De uitnodigingscode trek je in met set_invite_revoked()'
      using errcode = 'check_violation';
  end if;

  if new.status is distinct from old.status then
    raise exception 'De status van een groep verzet je met archiveer_groep() of heropen_groep()'
      using errcode = 'check_violation';
  end if;

  if new.last_activity_at is distinct from old.last_activity_at then
    raise exception 'De laatste activiteit van een groep is een servertijdstempel'
      using errcode = 'check_violation';
  end if;

  -- ⚠️ De zichtbaarheid draagt domeinregel 7 en gaat daarom nooit buiten
  --    `zet_groepszichtbaarheid()` om — die heeft de zorgvuldigheid van een
  --    commitment device, want omzetten verandert met terugwerkende kracht wat
  --    er over ándere leden zichtbaar wordt.
  if new.zichtbaarheid is distinct from old.zichtbaarheid then
    raise exception 'De zichtbaarheid van een groep verzet je met zet_groepszichtbaarheid()'
      using errcode = 'check_violation';
  end if;

  if new.ontdekbaar is distinct from old.ontdekbaar then
    raise exception 'De ontdekbaarheid van een groep verzet je met zet_groepsontdekbaarheid()'
      using errcode = 'check_violation';
  end if;

  -- ⚠️⚠️ **De derde pin, en zonder hem zijn de andere twee decoratie.** De CHECKs
  --    `groups_automatisch_is_beschermd` en `groups_automatisch_niet_ontdekbaar`
  --    koppelen `automatisch` aan `zichtbaarheid` en `ontdekbaar`. Kon een
  --    beheerder `automatisch` op false PATCHen, dan vallen die twee CHECKs
  --    daarna weg en staat de weg naar `open` alsnog open — in twee stappen in
  --    plaats van één. Een constraint die je zelf kunt uitzetten is geen
  --    constraint. QS8-233.
  if new.automatisch is distinct from old.automatisch then
    raise exception 'Of een groep automatisch gevormd is, ligt vast'
      using errcode = 'check_violation';
  end if;

  -- ⚠️⚠️ **De groepsklok, sinds QS8-355.** `groups.tz` is de tweede klok van
  --    domeinregel 1: `currentGroupPeriod()` leest hem, en daarmee bepaalt hij de
  --    huddledag, de weekafsluiting, De Ketting en het groepsoverzicht — voor élk
  --    lid. Eén beheerder verschoof daarmee de weekgrens van de hele groep, met
  --    één PATCH, buiten elk scherm om.
  --
  -- 📏 Nagemeten vóór 0208, met een echte sessie van de beheerder:
  --
  --      create_group('Klokgroep')                   -> tz Europe/Amsterdam
  --      update groups set tz = 'Pacific/Kiritimati' -> geaccepteerd
  --      groepsdatum(gid)                            -> 2026-09-09
  --
  --    De serverdatum was 2026-09-08. Eén PATCH, en de groep staat een dag verder.
  --
  -- ⚠️ 📏 Geen enkele functie werkt deze kolom bij; `create_group()` zet hem bij
  --    het aanmaken en daarna ligt hij stil. Hij staat toch ná de vroege uitgang
  --    omdat een beheerderspad om hem te verzetten een productvraag is en geen
  --    defect — en een slot vóór de uitgang zou dat pad later ook voor
  --    `service_role` dichthouden.
  if new.tz is distinct from old.tz then
    raise exception 'De tijdzone van een groep ligt vast'
      using errcode = 'check_violation';
  end if;

  -- ⚠️⚠️ **Nieuw in 0208 (QS8-360), en om dezelfde reden als `tz` erboven.**
  --    De huddledag verschuift de groepsperiode. 📏 Gemeten vóór die migratie:
  --    na een kale PATCH kon een lid zijn openstaande weekafsluiting nooit meer
  --    afronden, bleef het groepsoverzicht daar `false` melden — een gemiste
  --    week van iemand anders — en telde de schakel van wie wél had afgesloten
  --    niet meer mee, zodat hij er een tweede kon leggen voor dezelfde week.
  --
  --    Het verschil met `tz` is dat deze kolom een scherm hééft. Daarom een
  --    RPC ernaast en niet alleen een slot: `zet_huddledag()` verzet de dag én
  --    neemt de lopende periode mee.
  if new.huddle_day is distinct from old.huddle_day then
    raise exception 'De huddledag verzet je met zet_huddledag()'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$

;

-- ---------------------------------------------------------------------------
-- 3. De twee zet-RPC's zeggen waaróm ze weigeren
-- ---------------------------------------------------------------------------
--
-- De CHECK weigert de toestand al. Deze twee takken bestaan zodat de gebruiker
-- een zin leest in plaats van een kale `23514` — dezelfde keuze en dezelfde reden
-- als de `name_invalid`-afhandeling in 0287.
--
-- ⚠️ 📏 Ook deze twee zijn programmatisch samengesteld uit de gedeployde
--    definitie en gedift: 10 regels erbij, 0 weg, per functie.

create or replace function public.zet_groepszichtbaarheid(p_group_id uuid, p_naar text, p_bevestigd boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_oud    text;
  v_recent integer;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  if p_naar is null or p_naar not in ('beschermd', 'open') then
    return jsonb_build_object('ok', false, 'reason', 'unknown_visibility');
  end if;

  if not is_group_admin(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  if p_bevestigd is not true then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed');
  end if;

  -- ⚠️⚠️ **Een automatisch gevormde groep gaat hier niet doorheen, en dat is de
  --    kern van QS8-233.** Zo'n groep bestaat uit mensen die elkaar niet gekozen
  --    hebben; besluit A41 (zichtbaarheid `open`) is genomen voor groepen van
  --    vrienden. De CHECK op `groups` weigert de toestand al — deze tak bestaat
  --    zodat de gebruiker een zin leest in plaats van een kale 23514, precies
  --    zoals de name_invalid-afhandeling van 0287.
  if exists (select 1 from groups g2 where g2.id = p_group_id and g2.automatisch) then
    return jsonb_build_object('ok', false, 'reason', 'automatisch');
  end if;

  -- ⚠️ `for update` en niet een kale select. Twee beheerders die tegelijk
  --    omzetten, zouden anders allebei "was beschermd" lezen en allebei een
  --    bericht plaatsen — en het auditspoor zou twee keer dezelfde overgang
  --    tonen terwijl er één was.
  select g.zichtbaarheid into v_oud
  from groups g
  where g.id = p_group_id
  for update;

  if v_oud is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_group');
  end if;

  if v_oud = p_naar then
    return jsonb_build_object('ok', false, 'reason', 'unchanged');
  end if;

  if p_naar = 'open' then
    select count(*) into v_recent
    from group_events e
    where e.group_id   = p_group_id
      and e.event_type = 'visibility_changed'
      and e.new_value ->> 'zichtbaarheid' = 'open'
      and e.created_at > now() - interval '1 day';

    if v_recent > 0 then
      return jsonb_build_object('ok', false, 'reason', 'too_soon');
    end if;
  end if;

  -- ⚠️ `current_user` is hier de eigenaar van deze functie en niet
  --    `authenticated`, dus `guard_group_update()` laat de kolom staan. Dat is
  --    geen omweg om het slot heen maar precies waar het slot voor bedoeld is:
  --    één route naar deze kolom, en die route toetst zelf.
  update groups set zichtbaarheid = p_naar where id = p_group_id;

  insert into group_events (group_id, actor_id, event_type, old_value, new_value)
  values (
    p_group_id,
    auth.uid(),
    'visibility_changed',
    jsonb_build_object('zichtbaarheid', v_oud),
    jsonb_build_object('zichtbaarheid', p_naar)
  );

  perform plaats_systeembericht(
    p_group_id,
    case when p_naar = 'open' then 'group_opened' else 'group_protected' end,
    case
      when p_naar = 'open'
      then 'Deze groep staat vanaf nu open: leden zien ook elkaars tegenslag.'
      else 'Deze groep is weer beschermd: tegenslag van een ander is niet zichtbaar.'
    end,
    p_subject_id => auth.uid()
  );

  return jsonb_build_object('ok', true, 'van', v_oud, 'naar', p_naar);
end;
$function$

;

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
begin
  if (select auth.uid()) is null then
    raise exception 'Niet ingelogd';
  end if;

  if p_naar is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_state');
  end if;

  if not is_group_admin(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  if p_bevestigd is not true then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed');
  end if;

  -- ⚠️⚠️ **Een automatisch gevormde groep gaat hier niet doorheen, en dat is de
  --    kern van QS8-233.** Zo'n groep bestaat uit mensen die elkaar niet gekozen
  --    hebben; besluit A41 (zichtbaarheid `open`) is genomen voor groepen van
  --    vrienden. De CHECK op `groups` weigert de toestand al — deze tak bestaat
  --    zodat de gebruiker een zin leest in plaats van een kale 23514, precies
  --    zoals de name_invalid-afhandeling van 0287.
  if exists (select 1 from groups g2 where g2.id = p_group_id and g2.automatisch) then
    return jsonb_build_object('ok', false, 'reason', 'automatisch');
  end if;

  select g.ontdekbaar, g.zichtbaarheid, g.categorie
    into v_oud, v_zicht, v_cat
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

  update groups set ontdekbaar = p_naar where id = p_group_id;

  insert into group_events (group_id, actor_id, event_type, old_value, new_value)
  values (
    p_group_id,
    (select auth.uid()),
    'discoverable_changed',
    jsonb_build_object('ontdekbaar', v_oud),
    jsonb_build_object('ontdekbaar', p_naar)
  );

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

  return jsonb_build_object('ok', true, 'ontdekbaar', p_naar);
end;
$function$

;

-- ---------------------------------------------------------------------------
-- 4. Eén definitie van "zit er een blokkade tussen deze twee"
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **0145 §9 schrijft voor dat QS8-233 de vijfde route is en
--    `blokkade_met_groep()` gebruikt "en geen eigen variant schrijft".** Dat kan
--    hier letterlijk niet: die functie vraagt een bestáánde groep, en de matcher
--    moet blokkades beoordelen vóórdat er een groep is. Het alternatief — de
--    groep aanmaken, toetsen en weer weggooien — vraagt een `delete` op `groups`
--    in een pad dat verder alleen archiveert.
--
--    De reparatie is dus geen tweede variant maar een **uitgetrokken kern**:
--    `blokkade_tussen()` is de `exists` over `user_blocks` in beide richtingen,
--    één keer opgeschreven, en `blokkade_met_groep()` leunt er voortaan op. De
--    vier bestaande routes merken niets; er blijft één definitie van de vraag.
--
-- ⚠️ Geen `grant execute` — net als `blokkade_met_groep()` vandaag, en om dezelfde
--    reden die 0145 opschrijft: deze functie beantwoordt precies de vraag die
--    niemand mag kunnen stellen. De definer-functies erboven mogen hem wél
--    aanroepen.

create or replace function public.blokkade_tussen(p_a uuid, p_b uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from user_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

revoke all on function public.blokkade_tussen(uuid, uuid) from public, anon, authenticated;

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
    where m.group_id = p_group_id
      and m.status  <> 'inactive'
      and m.user_id <> p_user
      and public.blokkade_tussen(m.user_id, p_user)
  );
$$;

revoke all on function public.blokkade_met_groep(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Verlopen — één functie, één ding
-- ---------------------------------------------------------------------------

create or replace function public.verloop_buddyzoekopdrachten(p_nu timestamptz)
  returns integer
  language sql
  set search_path = public, pg_temp
as $$
  with verlopen as (
    update goal_match_queue
    set status = 'verlopen', decided_at = p_nu
    where status = 'wachtend' and expires_at <= p_nu
    returning 1
  )
  select count(*)::integer from verlopen;
$$;

revoke all on function public.verloop_buddyzoekopdrachten(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Eén groep vormen uit een lijst kandidaatrijen
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De blokkadetoets staat hier en niet in de query die kandidaten ophaalt,
--    en dat is een expliciete eis uit het issue.** Twee routes naar hetzelfde
--    effect waarvan er één de regel vergeet, is de fout die dit project vier
--    migraties gekost heeft. Hier is het bovendien niet anders te doen: of A bij
--    B mag, hangt af van wie er al gekozen zijn, en dat weet een `where` niet.
--
-- ⚠️ De lus voegt paarsgewijs toe en slaat een kandidaat over die met een
--    reeds gekozen lid een blokkade heeft — in béide richtingen, want
--    `blokkade_tussen()` kijkt beide kanten op.
--
-- ⚠️ `created_by` blijft **null**: er ís geen oprichter. `invite_revoked` staat
--    meteen dicht, want 0145 waarschuwt dat een groep zonder actieve beheerder
--    zijn uitnodigingscode houdt en wildvreemden binnenlaat in iets wat niemand
--    beheert. Zonder oprichter is er niemand die die code beheert.

create or replace function public.vorm_een_buddygroep(p_rijen uuid[])
  returns uuid
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_rij     record;
  v_gekozen uuid[] := '{}';
  v_leden   uuid[] := '{}';
  v_cat     text;
  v_dag     smallint;
  v_tz      text;
  v_groep   uuid;
begin
  for v_rij in
    select q.id, q.user_id, g.category, p.week_start_day
    from goal_match_queue q
    join goals    g on g.id = q.goal_id
    join profiles p on p.id = q.user_id
    where q.id = any(p_rijen)
    order by q.created_at
  loop
    exit when coalesce(array_length(v_leden, 1), 0) >= 5;
    continue when exists (
      select 1 from unnest(v_leden) as gekozen(u)
      where public.blokkade_tussen(gekozen.u, v_rij.user_id)
    );
    v_gekozen := v_gekozen || v_rij.id;
    v_leden   := v_leden   || v_rij.user_id;
    v_cat     := coalesce(v_cat, v_rij.category);
    v_dag     := coalesce(v_dag, v_rij.week_start_day);
  end loop;

  if coalesce(array_length(v_leden, 1), 0) < 3 then
    return null;
  end if;

  -- ⚠️ De tijdzone die de meeste leden delen; bij gelijkspel alfabetisch, zodat
  --    de uitkomst niet van rijvolgorde afhangt en een herhaalde run hetzelfde
  --    doet.
  select p.tz into v_tz
  from profiles p
  where p.id = any(v_leden) and p.tz is not null
  group by p.tz
  order by count(*) desc, p.tz
  limit 1;

  -- ⚠️ De naam komt uit een vaste catalogus en nooit uit gebruikerstekst: hij
  --    moet door alle zeven naam-CHECKs van `groups` en een vast punt van
  --    `schone_naam()` zijn. `create_group()` doet die normalisatie, en dit pad
  --    komt daar niet langs.
  insert into groups (name, created_by, invite_code, invite_revoked,
                      huddle_day, tz, zichtbaarheid, ontdekbaar, automatisch)
  values ('Buddygroep ' || initcap(replace(coalesce(v_cat, 'other'), '_', ' ')),
          null, generate_invite_code(), true,
          coalesce(v_dag, 0), coalesce(v_tz, 'Europe/Amsterdam'),
          'beschermd', false, true)
  returning id into v_groep;

  insert into group_members (group_id, user_id, role, status)
  select v_groep, u, 'member', 'active' from unnest(v_leden) as l(u);

  insert into goal_group_links (goal_id, group_id)
  select q.goal_id, v_groep from goal_match_queue q where q.id = any(v_gekozen);

  update goal_match_queue
  set status = 'gekoppeld', group_id = v_groep, decided_at = now()
  where id = any(v_gekozen);

  return v_groep;
end;
$$;

revoke all on function public.vorm_een_buddygroep(uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. De run: bakken zoeken en er groepen uit vormen
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Twee sloten, en het tweede is er omdat het eerste een afspraak is.**
--    `pg_advisory_xact_lock` serialiseert vormers clusterbreed — een
--    workflow-retry, een handmatige aanroep en een tweede regio lopen niet door
--    elkaar. Maar een advisory lock houdt alleen wie hem vráágt tegen. Daarom
--    leest de kandidaatselectie met `for update skip locked` en gaat elke rij in
--    dezelfde transactie naar `gekoppeld`; de partiële unieke index uit 0299 is
--    de derde.
--
-- ⚠️ **Geen trigger op de insert van een wachtrijrij**, en dat is opzet. Zo'n
--    trigger draait in de transactie van de gebruiker die net instapte én onder
--    diens autorisatie, terwijl de handeling rijen van ánderen aanmaakt. Wie als
--    derde in de bak stapt, zou bovendien de groepsvorming van vijf mensen
--    betalen — onwrikbare regel 8 in zijn algemene vorm.
--
-- ⚠️ Begrensde kandidaatset (onwrikbare regel 10) en één query voor de bakken
--    in plaats van een lus over gebruikers (regel 12).

create or replace function public.vorm_buddygroepen(p_vandaag date, p_max_groepen integer default 20)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_bak      record;
  v_rijen    uuid[];
  v_groep    uuid;
  v_bakken   integer := 0;
  v_gevormd  integer := 0;
  v_leden    integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('vorm_buddygroepen'));

  for v_bak in
    select g.category, public.doelperiode(g.target_date, p_vandaag) as band, p.week_start_day
    from goal_match_queue q
    join goals    g on g.id = q.goal_id
    join profiles p on p.id = q.user_id
    where q.status = 'wachtend'
      and g.status = 'active'
      and g.target_date >= p_vandaag
    group by g.category, public.doelperiode(g.target_date, p_vandaag), p.week_start_day
    having count(distinct q.user_id) >= 3
    order by count(distinct q.user_id) desc
    limit p_max_groepen
  loop
    v_bakken := v_bakken + 1;

    -- ⚠️ Hoogstens één rij per gebruiker: iemand met drie wachtende doelen in
    --    dezelfde bak mag die bak niet in zijn eentje vullen.
    -- ⚠️ Vergrendelen en ontdubbelen zijn twee stappen, en dat moet ook:
    --    Postgres staat `for update` niet toe naast `distinct on`. De CTE neemt
    --    het slot op de wachtrijrijen, de laag erboven houdt er één per persoon
    --    over. Andersom — eerst ontdubbelen, dan vergrendelen — zou het slot
    --    leggen op rijen die je daarna alsnog weggooit.
    with vergrendeld as (
      select q.id, q.user_id, q.created_at
      from goal_match_queue q
      join goals    g on g.id = q.goal_id
      join profiles p on p.id = q.user_id
      where q.status = 'wachtend'
        and g.status = 'active'
        and g.category = v_bak.category
        and public.doelperiode(g.target_date, p_vandaag) = v_bak.band
        and p.week_start_day = v_bak.week_start_day
        and (
          select count(*) from group_members m
          where m.user_id = q.user_id and m.status <> 'inactive'
        ) < 10
      order by q.created_at
      limit 50
      for update of q skip locked
    )
    select array_agg(k.id order by k.created_at) into v_rijen
    from (
      select distinct on (v.user_id) v.id, v.created_at
      from vergrendeld v
      order by v.user_id, v.created_at
    ) k;

    continue when coalesce(array_length(v_rijen, 1), 0) < 3;

    v_groep := public.vorm_een_buddygroep(v_rijen);
    continue when v_groep is null;

    v_gevormd := v_gevormd + 1;
    select v_leden + count(*) into v_leden from group_members where group_id = v_groep;
  end loop;

  return jsonb_build_object(
    'bakken', v_bakken, 'gevormd', v_gevormd, 'leden', coalesce(v_leden, 0)
  );
end;
$$;

revoke all on function public.vorm_buddygroepen(date, integer) from public, anon, authenticated;

comment on function public.vorm_buddygroepen(date, integer) is
  'De matcher van QS8-233. Draait als service_role vanuit een Edge Function op '
  'een schema — nooit als trigger, en nooit in het verzoek van een gebruiker. '
  'Serialiseert met een advisory lock en leest kandidaten met for update skip locked.';

-- ---------------------------------------------------------------------------
-- 8. Een melding in een beheerdersloze groep komt ergens aan
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Dit is geen bijvangst maar een gat dat deze migratie zélf zou slaan.**
--    Een automatisch gevormde groep krijgt uitsluitend `member`-rollen: er was
--    niemand die er eerder was, dus er is niemand die iemand binnenliet, en
--    `guard_group_member_update()` laat ook niemand promoveren omdat daar een
--    beheerder voor nodig is.
--
--    📏 Gemeten vóór deze wijziging: `mag_melding_als_beheerder()` is onwaar
--    voor elk lid (er is geen beheerder), en `mag_melding_als_escalatie()` eist
--    dat het **onderwerp** beheerder is — ook onwaar. Een melding over een lid
--    van zo'n groep kwam dus bij **niemand** aan. Dat is precies het gat dat
--    0296 (QS8-586) dichtte, heropend in de groepssoort waar het het zwaarst
--    weegt: een groep van onbekenden.
--
-- ⚠️ **Waarom niet gewoon iemand beheerder maken.** Dat was de andere uitweg en
--    hij is duurder: dan krijgt één vreemde de macht om andere vreemden te
--    verwijderen en de groep te archiveren. Bij vrienden is dat speels, bij
--    onbekenden een wapen. Niemand macht geven en de melding laten escaleren is
--    de conservatiefste optie die het werk áf maakt.
--
-- ⚠️ De verbreding is zo smal als hij kan: **alleen** een platformbeheerder, en
--    **alleen** bij een groep zonder énige actieve beheerder. Een groep mét
--    beheerder verandert hier niet van, en een gewone gebruiker krijgt er niets
--    bij. Rij 39 in `docs/decisions/002-domeinregel7-oppervlakken.md`.

create or replace function public.mag_melding_als_escalatie(p_group_id uuid, p_subject_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.is_platform_beheerder()
  and (
    -- ⚠️⚠️ **Tweede tak, QS8-233: een groep die helemaal géén actieve beheerder
    --    heeft.** Een automatisch gevormde groep heeft er per constructie geen —
    --    er was niemand die er eerder was, dus er is niemand die iemand
    --    binnenliet. 📏 Zonder deze tak komt een melding over een lid van zo'n
    --    groep bij **niemand** aan: de beheerdersroute is leeg en de tak
    --    hieronder eist dat het onderwerp zélf beheerder is. Dat is het gat dat
    --    0296 net dichtte, heropend in de groepssoort waar het het zwaarst weegt.
    --
    --    De smalte is de bedoeling: alleen een platformbeheerder, alleen bij een
    --    groep zonder énige actieve beheerder. Een groep mét beheerder verandert
    --    hier niet van, en een gewone gebruiker krijgt er niets bij.
    not exists (
       select 1
         from public.group_members m3
        where m3.group_id = p_group_id
          and m3.role     = 'admin'
          and m3.status  <> 'inactive'
     )
     or exists (
       select 1
         from public.group_members m
        where m.group_id = p_group_id
          and m.user_id  = p_subject_id
          and m.role     = 'admin'
          and m.status  <> 'inactive'
     )
     and not exists (
       select 1
         from public.group_members m2
        where m2.group_id = p_group_id
          and m2.role     = 'admin'
          and m2.status  <> 'inactive'
          and m2.user_id <> p_subject_id
     )
  );
$function$

;

revoke all on function public.mag_melding_als_escalatie(uuid, uuid) from public, anon, authenticated;
