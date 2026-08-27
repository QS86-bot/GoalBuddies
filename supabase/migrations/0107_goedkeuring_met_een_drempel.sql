-- ---------------------------------------------------------------------------
-- 0107 — De goedkeuringsregel per groep krijgt een drempel (QS8-65, PRD 6.4)
-- ---------------------------------------------------------------------------
--
-- ROLLBACK-PAD (in deze volgorde, en lees de waarschuwing eronder):
--
--   drop trigger if exists completions_drempel on public.completions;
--   drop function if exists public.bevries_goedkeuringsdrempel();
--   drop function if exists public.goedkeuringsdrempel_gehaald(uuid);
--   drop function if exists public.vereiste_goedkeuringen(uuid, uuid);
--   drop table if exists public.completion_approval_rules;
--   alter table public.groups drop constraint if exists groups_quorum_bij_regel;
--   alter table public.groups drop constraint if exists groups_approval_quorum_bereik;
--   alter table public.groups drop column if exists approval_quorum;
--   alter table public.groups drop constraint groups_approval_rule_valid;
--   alter table public.groups add constraint groups_approval_rule_valid
--     check (approval_rule in ('any', 'majority'));
--   -- en de drie functies terug naar hun vorige vorm, elk uit zijn eigen bestand
--   -- (nagemeten, niet uit het hoofd):
--   --   award_points_on_approval()   → 0094_een_reviewpunt_per_buddy_per_cyclus.sql
--   --   meld_goedkeuring()           → 0059_systeemberichten_met_parameters.sql
--   --   trek_goedkeuring_in(uuid)    → 0099_het_intrekvenster_heeft_een_bron.sql
--   -- en, met een `drop function` ervoor omdat de returntabel verandert:
--   drop function if exists public.openstaande_beoordelingen(integer, integer);
--   --   openstaande_beoordelingen(int, int) → 0054_te_beoordelen_voor.sql
--
-- ⚠️ **Neem uit die drie bestanden alléén het `create or replace function`-blok,
--    en draai ze niet in hun geheel.** Dat is op 27-08 uitgeprobeerd en het
--    faalt: 0094 doet `create unique index points_ledger_review_dedupe_idx`
--    zonder `if not exists` (regel 127) en 0059 doet `create function
--    plaats_systeembericht_in_doelgroepen` zonder `or replace` (regel 203). Beide
--    breken af vóór de functie die je nodig hebt, en dan staat de helft terug.
--    Dat is een bredere bevinding dan deze migratie — zie de rij van 27-08 in
--    `docs/ENGINEER-REVIEW.md` — maar wie hier terugrolt, loopt er als eerste
--    tegenaan.
--
-- ⚠️ **Terugrollen kan alleen zolang geen enkele groep `quorum` heeft gekozen.**
--    De CHECK terugdraaien naar twee waarden faalt op elke rij die `quorum`
--    draagt. Zet die eerst terug op `majority` — dat is een productbesluit en
--    geen migratiestap, dus het staat hier met opzet niet als kant-en-klare
--    `update`.
--
-- ---------------------------------------------------------------------------
-- Waarom deze migratie bestaat
-- ---------------------------------------------------------------------------
--
-- `groups.approval_rule` staat sinds 0001 in het schema, met een CHECK op
-- `('any', 'majority')` en sinds 0019 een kolomgrant. **Er heeft nooit iets naar
-- gekeken.** `dode-keten-controle` kende hem als bewust dode waarde met de reden
-- "Wacht op de goedkeuringsregels" — dit is die goedkeuringsregels.
--
-- Dat is dezelfde vorm als QS8-113: een kolom met een grant en een policy die
-- niemand ooit kon gebruiken. Het verschil is dat deze bewust en gedocumenteerd
-- dood lag, met een controle die het wist.
--
-- ---------------------------------------------------------------------------
-- 1. Drie regels, en waarom de drempel een gétal wordt en geen regel
-- ---------------------------------------------------------------------------
--
-- De PRD vraagt drie standen: één lid, meerderheid, quorum. Het tweede
-- acceptatiecriterium van QS8-65 vraagt iets scherpers: **wijzigen raakt lopende
-- goedkeuringen niet met terugwerkende kracht.**
--
-- Dat kan niet met een regel die bij het goedkeuren wordt uitgelezen. Zou
-- `award_points_on_approval()` live in `groups.approval_rule` kijken, dan tilt
-- een beheerder die midden in een week op `quorum 4` zet de lat op onder een
-- week die al twee bevestigingen had. De gebruiker heeft dan niets fout gedaan
-- en zijn week gaat toch niet door.
--
-- ⚠️ **En het is niet alleen de regel die schuift: bij `majority` schuift het
--    getal ook zonder dat iemand iets instelt.** Een meerderheid van vier is
--    drie; komt er een lid bij, dan is het van vijf nog steeds drie, maar bij
--    zes wordt het vier. Iemand die zich aanmeldt verhoogt dus de lat van een
--    week die al loopt. Dat is dezelfde verrassing met een andere oorzaak.
--
-- Daarom bevriest deze migratie **het getal en niet de regel**, op het moment
-- dat de voltooiing wordt ingediend, per groep waar het doel dan aan hangt. Eén
-- mechanisme dekt allebei de gevallen.
--
-- ---------------------------------------------------------------------------
-- 2. Per groep, en niet het strengste over alle groepen
-- ---------------------------------------------------------------------------
--
-- Een doel kan sinds QS8-56 in meer dan één groep staan, en dan is "de regel"
-- meervoud. Twee modellen waren denkbaar:
--
--   (a) **Het strengste van alle gekoppelde groepen wint**, zoals
--       `enforce_evidence_policy` dat voor de bewijseis doet.
--   (b) **Elke groep oordeelt met zijn eigen regel**, en de week is bevestigd
--       zodra één groep zijn eigen drempel haalt.
--
-- **Gekozen: (b).** Deze module zegt op elke andere plek dat elke groep een
-- aparte toestemming is — `goal_group_links_delete` kijkt naar één rij, het
-- doelscherm geeft per groep een knop, en de zin over wat je deelt staat per
-- groep. Model (a) zou de strengheid van groep B laten bepalen of de vrienden
-- in groep A elkaar mogen geloven, en dat is een ander sociaal contract dan zij
-- gekozen hebben.
--
-- ⚠️ Waarom de bewijseis wél het strengste neemt en dit niet: die gaat over wat
--    de índiener moet leveren, en hij levert het één keer voor alle groepen
--    tegelijk. Een bevestiging is van één groep en telt daar.
--
-- ---------------------------------------------------------------------------
-- 3. Eén bron voor de drempel, want dit is een naad
-- ---------------------------------------------------------------------------
--
-- De drempel wordt op twee plekken gelezen: bij het góedkeuren
-- (`award_points_on_approval`) en bij het intrekken (`trek_goedkeuring_in`,
-- die vandaag `nog_geldig > 0` doet). Zouden die twee elk hun eigen som maken,
-- dan bestaat er een stand waarin een week bevestigd blijft die de regel niet
-- haalt — of andersom.
--
-- `goedkeuringsdrempel_gehaald()` is daarom de enige plek waar geteld wordt, en
-- beide paden roepen hem aan. Onwrikbare regel 18: de belofte is een eigenschap
-- van het geheel, dus de toets hoort op één plek te staan.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- De kolommen op `groups`
-- ---------------------------------------------------------------------------

alter table public.groups
  add column if not exists approval_quorum smallint;

alter table public.groups drop constraint if exists groups_approval_rule_valid;
alter table public.groups add constraint groups_approval_rule_valid
  check (approval_rule in ('any', 'majority', 'quorum'));

-- ⚠️ Bovengrens 12 omdat een groep bij twaalf actieve leden vol is (0016). Een
--    quorum dat hoger ligt dan het aantal mensen dat kán bevestigen is een week
--    die nooit doorgaat; `vereiste_goedkeuringen()` kapt daar bovendien op af,
--    zodat een groep die krimpt geen doodlopende weken achterlaat.
alter table public.groups drop constraint if exists groups_approval_quorum_bereik;
alter table public.groups add constraint groups_approval_quorum_bereik
  check (approval_quorum is null or approval_quorum between 2 and 12);

-- ⚠️ Het getal hoort bij precies één regel. Zonder deze constraint blijft er een
--    quorum staan nadat de groep terug naar `any` gaat, en dan betekent dezelfde
--    rij twee dingen tegelijk.
alter table public.groups drop constraint if exists groups_quorum_bij_regel;
alter table public.groups add constraint groups_quorum_bij_regel
  check ((approval_rule = 'quorum') = (approval_quorum is not null));

grant update (approval_quorum) on public.groups to authenticated;

comment on column public.groups.approval_quorum is
  'Het aantal bevestigingen bij approval_rule = quorum. NULL bij elke andere '
  'regel — zie groups_quorum_bij_regel.';

-- ---------------------------------------------------------------------------
-- Hoeveel bevestigingen vraagt deze groep?
-- ---------------------------------------------------------------------------

create or replace function public.vereiste_goedkeuringen(p_group_id uuid, p_owner uuid)
  returns smallint
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  -- ⚠️ `beoordelaars` telt de actieve leden **minus de eigenaar**. Hij mag zijn
  --    eigen week niet bevestigen (domeinregel 3, afgedwongen door de CHECK op
  --    `subject_id`), dus meetellen zou een meerderheid opleveren die niemand
  --    kan halen.
  with beoordelaars as (
    select count(*)::int as n
    from group_members m
    where m.group_id = p_group_id
      and m.status  <> 'inactive'
      and m.user_id <> p_owner
  )
  select greatest(
    1,
    least(
      case g.approval_rule
        when 'majority' then (b.n / 2) + 1
        when 'quorum'   then coalesce(g.approval_quorum, 1)::int
        else 1
      end,
      -- ⚠️ Nooit meer vragen dan er mensen zijn die het kúnnen. Een groep die
      --    krimpt nadat er een quorum is ingesteld, zou anders weken achterlaten
      --    die per definitie niet meer doorgaan.
      greatest(b.n, 1)
    )
  )::smallint
  from groups g cross join beoordelaars b
  where g.id = p_group_id;
$$;

revoke all on function public.vereiste_goedkeuringen(uuid, uuid) from public, anon;
grant execute on function public.vereiste_goedkeuringen(uuid, uuid) to authenticated, service_role;

comment on function public.vereiste_goedkeuringen(uuid, uuid) is
  'Het aantal bevestigingen dat deze groep nú van deze eigenaar vraagt. Wordt '
  'bij het indienen bevroren in completion_approval_rules — QS8-65.';

-- ---------------------------------------------------------------------------
-- De bevroren drempel per voltooiing per groep
-- ---------------------------------------------------------------------------

create table if not exists public.completion_approval_rules (
  completion_id      uuid        not null references completions (id) on delete cascade,
  group_id           uuid        not null references groups (id)      on delete cascade,
  approvals_required smallint    not null check (approvals_required >= 1),
  created_at         timestamptz not null default now(),

  primary key (completion_id, group_id)
);

create index if not exists completion_approval_rules_group_idx
  on public.completion_approval_rules (group_id);

alter table public.completion_approval_rules enable row level security;

-- ⚠️ Leesbaar voor wie de voltooiing zelf ook mag zien — dezelfde kring als
--    `completions_select`. Een beoordelaar moet kunnen zien dat hij de tweede
--    van drie is; zonder dat lijkt bevestigen kapot.
drop policy if exists completion_approval_rules_select on public.completion_approval_rules;
create policy completion_approval_rules_select on public.completion_approval_rules
  for select to authenticated
  using (exists (
    select 1
    from completions c
    join weekly_goals w on w.id = c.weekly_goal_id
    join goals        g on g.id = w.goal_id
    where c.id = completion_approval_rules.completion_id
      and (g.owner_id = auth.uid() or shares_group_with_goal(g.id))
  ));

-- ⚠️ Géén INSERT-, UPDATE- of DELETE-policy, en dat is de hele bescherming. Een
--    client die zijn eigen drempel mag schrijven, zet hem op 1. De trigger
--    hieronder is de enige schrijver en draait als DEFINER.
drop policy if exists completion_approval_rules_insert on public.completion_approval_rules;
drop policy if exists completion_approval_rules_update on public.completion_approval_rules;
drop policy if exists completion_approval_rules_delete on public.completion_approval_rules;

revoke all on public.completion_approval_rules from anon, authenticated;
grant select on public.completion_approval_rules to authenticated;
grant all on public.completion_approval_rules to service_role;

comment on table public.completion_approval_rules is
  'De drempel zoals hij gold toen deze voltooiing werd ingediend, per groep. '
  'Bevroren zodat een regelwijziging of een nieuw lid een lopende week niet '
  'raakt — QS8-65, acceptatiecriterium 2.';

-- ---------------------------------------------------------------------------
-- Bevriezen bij het indienen
-- ---------------------------------------------------------------------------

create or replace function public.bevries_goedkeuringsdrempel()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  eigenaar uuid;
begin
  select g.owner_id into eigenaar
  from weekly_goals w join goals g on g.id = w.goal_id
  where w.id = new.weekly_goal_id;

  if eigenaar is null then
    return new;
  end if;

  -- ⚠️ Eén rij per groep waar het doel op dít moment aan hangt. Wordt er later
  --    een groep bij gekoppeld, dan heeft die geen bevroren rij en valt
  --    `goedkeuringsdrempel_gehaald()` terug op de regel van nu — zie daar.
  insert into completion_approval_rules (completion_id, group_id, approvals_required)
  select new.id, l.group_id, vereiste_goedkeuringen(l.group_id, eigenaar)
  from goal_group_links l
  join weekly_goals w on w.id = new.weekly_goal_id
  where l.goal_id = w.goal_id
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.bevries_goedkeuringsdrempel() from public, anon, authenticated;

drop trigger if exists completions_drempel on public.completions;
create trigger completions_drempel
  after insert on public.completions
  for each row execute function public.bevries_goedkeuringsdrempel();

-- ---------------------------------------------------------------------------
-- Is de drempel gehaald? — de enige plek waar geteld wordt
-- ---------------------------------------------------------------------------

create or replace function public.goedkeuringsdrempel_gehaald(p_completion_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  -- ⚠️ Per groep tellen en dan `exists`: één groep die zijn eigen drempel haalt
  --    is genoeg. Zie punt 2 in de kop — elke groep oordeelt met zijn eigen
  --    regel, en de strengheid van de een bepaalt niet of de ander mag geloven.
  --
  -- ⚠️ Ingetrokken bevestigingen tellen niet mee. `approval_withdrawals` maakt
  --    een goedkeuring ongedaan zonder hem te wissen (domeinregel 6), dus de
  --    rij staat er nog en mag hier niet meetellen.
  select exists (
    select 1
    from completion_approvals a
    where a.completion_id = p_completion_id
      and a.status        = 'approved'
      and not exists (
        select 1 from approval_withdrawals x where x.approval_id = a.id
      )
    group by a.group_id
    having count(*) >= (
      select coalesce(
        -- De bevroren drempel van het moment van indienen.
        (select r.approvals_required
           from completion_approval_rules r
          where r.completion_id = p_completion_id
            and r.group_id      = a.group_id),
        -- ⚠️ Geen bevroren rij betekent: deze groep is ná het indienen gekoppeld.
        --    Dan is er niets om te beschermen tegen terugwerkende kracht en geldt
        --    de regel van nu. Terugvallen op 1 zou een quorumgroep stilzwijgend
        --    op "één lid" zetten.
        (select vereiste_goedkeuringen(a.group_id, g.owner_id)
           from completions   c
           join weekly_goals  w on w.id = c.weekly_goal_id
           join goals         g on g.id = w.goal_id
          where c.id = p_completion_id),
        1
      )
    )
  );
$$;

revoke all on function public.goedkeuringsdrempel_gehaald(uuid) from public, anon;
grant execute on function public.goedkeuringsdrempel_gehaald(uuid) to authenticated, service_role;

comment on function public.goedkeuringsdrempel_gehaald(uuid) is
  'Haalt minstens één gekoppelde groep zijn eigen bevroren drempel? De enige '
  'plek waar bevestigingen geteld worden — QS8-65.';

-- ---------------------------------------------------------------------------
-- De drie functies die de drempel moeten respecteren
-- ---------------------------------------------------------------------------
--
-- ⚠️ Alle drie zijn ongewijzigd overgenomen op de plek na waar de drempel
--    binnenkomt. Dat is met opzet: de reeks, de punten, de weekpassen en de
--    intrekmelding hangen er alle vier aan, en herschrijven wat niet verandert
--    is de snelste manier om iets kwijt te raken dat er om een reden stond.

create or replace function public.award_points_on_approval()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  c        completions%rowtype;
  w        weekly_goals%rowtype;
  g_owner  uuid;
  punten   integer;
  reden    text;
begin
  select * into c from completions where id = new.completion_id;
  select * into w from weekly_goals where id = c.weekly_goal_id;
  select owner_id into g_owner from goals where id = w.goal_id;

  if c.superseded_by is not null then
    return new;
  end if;

  -- ⚠️ **Eén punt per buddy per cyclus** (besluit A51). De verwijzing is de
  --    eigenaar van het weekdoel — de buddy voor wie je opdaagt — en niet de
  --    voltooiing. Een tweede weekdoel van dezelfde buddy in dezelfde week
  --    levert daarom niets extra's op; een andere buddy of een andere week wel.
  --
  -- ⚠️ De cyclus komt uit `weekly_goals` en wordt hier niet uitgerekend.
  --    Correctheidsregel 7: de database rekent geen weken uit. Het is de cyclus
  --    van de éigenaar, want dat is de week die beoordeeld wordt.
  --
  -- ⚠️ "Vertel me meer" claimt het punt voor die cyclus, en de goedkeuring die er
  --    later op volgt levert niets extra's op. Dat is bedoeld: een echte vraag
  --    stellen ís de aandacht die dit punt beloont, en het haalt de prikkel weg
  --    om snel af te stempelen.
  --
  -- ⚠️ **Dit punt hangt níét aan de drempel** (QS8-65). Wie als eerste van drie
  --    bevestigt heeft dezelfde aandacht gegeven als wie als derde bevestigt.
  --    Zou het punt pas bij het halen van de drempel vallen, dan betaalt alleen
  --    de laatste beoordelaar zich uit en wordt vroeg kijken onaantrekkelijk.
  if w.status = 'pending' and g_owner is not null and w.cycle_start_date is not null then
    insert into points_ledger (
      user_id, goal_id, group_id, delta, reason, ref_type, ref_id, cycle_start_date
    )
    values (
      new.approver_id, null, new.group_id, 1, 'review_given',
      'buddy_cycle', g_owner, w.cycle_start_date
    )
    on conflict do nothing;
  end if;

  if new.status <> 'approved' then
    return new;
  end if;

  if w.status <> 'pending' then
    return new;
  end if;

  -- ⚠️ **De regel van QS8-65, en de enige plek waar hij de week raakt.** Tot deze
  --    migratie bevestigde één goedkeuring de week onvoorwaardelijk. Nu telt
  --    `goedkeuringsdrempel_gehaald()` per groep tegen de drempel die bij het
  --    indienen bevroren is. Bij `approval_rule = 'any'` — de standaard en de
  --    enige stand die vandaag bestaat — is die drempel 1 en verandert er niets.
  if not goedkeuringsdrempel_gehaald(new.completion_id) then
    return new;
  end if;

  if c.achieved_level = 'ceiling' then
    punten := w.points_ceiling;
    reden  := 'completion_approved_ceiling';
  else
    punten := w.points_floor;
    reden  := 'completion_approved_floor';
  end if;

  update weekly_goals set status = 'approved' where id = w.id;

  insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id)
  values (g_owner, w.goal_id, new.group_id, punten, reden, 'weekly_goal', w.id)
  on conflict do nothing;

  perform verdien_weekpassen(g_owner, w.goal_id);

  perform herbereken_reeks(g_owner, w.goal_id);

  return new;
end;
$$;

create or replace function public.meld_goedkeuring()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  begin
    if new.status <> 'approved' then return new; end if;

    -- ⚠️ **Pas melden als de week het ook echt gehaald heeft** (QS8-65). Zonder
    --    deze regel verschijnt "bevestigde de week van X" in de groepschat op de
    --    eerste van drie bevestigingen, en dan staat er iets in de feed dat niet
    --    waar is. Bij `approval_rule = 'any'` is de drempel 1 en gedraagt hij
    --    zich precies als voorheen.
    --
    -- ⚠️ Bewust `gehaald` en niet "de bevestiging die hem tipte": wie als vierde
    --    bevestigt op een week die er drie nodig had, hééft die week bevestigd.
    --    Dat is een positief signaal en domeinregel 7 gunt de groep die.
    if not goedkeuringsdrempel_gehaald(new.completion_id) then return new; end if;

    -- De enige gebeurtenis met twee personen: `subject_id` is degene wiens week
    -- bevestigd is, `actor_id` de buddy die het deed.
    perform plaats_systeembericht(
      new.group_id,
      'completion_approved',
      weergavenaam(new.approver_id) || ' bevestigde de week van '
        || weergavenaam(new.subject_id) || '.',
      new.subject_id,
      new.approver_id
    );
  exception
    when others then
      raise warning 'Systeembericht completion_approved is niet geplaatst: %', sqlerrm;
  end;

  return new;
end;
$$;

create or replace function public.trek_goedkeuring_in(p_approval_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  a        completion_approvals%rowtype;
  c        completions%rowtype;
  w        weekly_goals%rowtype;
  g_owner  uuid;
  punten   integer;
  tekst    text;
  treffers integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select * into a from completion_approvals where id = p_approval_id;

  if a.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if a.approver_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_yours');
  end if;

  if not exists (
    select 1 from group_members m
    where m.group_id = a.group_id and m.user_id = auth.uid() and m.status <> 'inactive'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;

  if a.created_at <= now() - (intrekvenster_minuten() || ' minutes')::interval then
    return jsonb_build_object('ok', false, 'reason', 'window_closed');
  end if;

  if exists (select 1 from approval_withdrawals x where x.approval_id = a.id) then
    return jsonb_build_object('ok', false, 'reason', 'already_withdrawn');
  end if;

  insert into approval_withdrawals (approval_id, completion_id, approver_id)
  values (a.id, a.completion_id, a.approver_id);

  insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id)
  values (a.approver_id, null, a.group_id, -1, 'correction', 'completion', a.completion_id);

  if a.status <> 'approved' then
    return jsonb_build_object('ok', true, 'reverted', false);
  end if;

  select * into c from completions   where id = a.completion_id;
  select * into w from weekly_goals  where id = c.weekly_goal_id;
  select owner_id into g_owner from goals where id = w.goal_id;

  -- ⚠️ **Hier stond `nog_geldig > 0`, en dat was dezelfde som op een tweede
  --    plek** (QS8-65). Met een drempel boven één zou die som "nog iemand
  --    anders is akkoord" hebben gelezen als "de regel is nog gehaald", en dan
  --    blijft een week bevestigd die de meerderheid niet meer heeft.
  --
  --    De intrekking staat hierboven al in `approval_withdrawals`, dus de telling
  --    hieronder ziet hem niet meer meetellen. Eén bron, twee aanroepers.
  if goedkeuringsdrempel_gehaald(a.completion_id) then
    return jsonb_build_object('ok', true, 'reverted', false);
  end if;

  if c.achieved_level = 'ceiling' then
    punten := w.points_ceiling;
  else
    punten := w.points_floor;
  end if;

  update weekly_goals set status = 'pending' where id = w.id;

  insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id)
  values (g_owner, w.goal_id, a.group_id, -punten, 'correction', 'weekly_goal', w.id);

  perform herbereken_reeks(g_owner, w.goal_id);

  tekst := weergavenaam(a.approver_id) || ' bevestigde de week van '
        || weergavenaam(a.subject_id) || '.';

  select count(*) into treffers
  from chat_messages m
  where m.group_id     = a.group_id
    and m.type         = 'system'
    and m.system_event = 'completion_approved'
    and m.body         = tekst
    and m.created_at  >= a.created_at;

  if treffers = 1 then
    delete from chat_messages m
    where m.group_id     = a.group_id
      and m.type         = 'system'
      and m.system_event = 'completion_approved'
      and m.body         = tekst
      and m.created_at  >= a.created_at;
  end if;

  return jsonb_build_object('ok', true, 'reverted', true);
end;
$$;

revoke all on function public.trek_goedkeuring_in(uuid) from public, anon;
grant execute on function public.trek_goedkeuring_in(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- De wachtrij vertelt hoe ver de week is
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Zonder deze twee kolommen is de feature onzichtbaar, en dan lijkt hij
--    kapot.** In een groep met een meerderheidsregel bevestigt een buddy een
--    week, de rij verdwijnt uit zijn wachtrij, en het weekdoel blijft `pending`.
--    Hij heeft dan geen enkele manier om te weten dát dat klopt.
--
--    Dit is onwrikbare regel 18, vraag 5: de keten is compleet en er is geen
--    knop waarlangs een mens er bij kan. `approvals_done` en
--    `approvals_required` maken de stand zichtbaar op precies het scherm waar
--    iemand de beslissing neemt, en kosten geen tweede verzoek.
--
-- ⚠️ Ze tellen **binnen de groep waarlangs jij kijkt** (`k.group_id`), niet over
--    alle groepen. Anders zou "2 van de 3" een optelsom zijn van twee groepen
--    die elk hun eigen regel hebben, en dat getal betekent niets.
--
-- ⚠️ De rest van deze functie is ongewijzigd overgenomen uit 0054. Alleen de
--    projectie en de `lateral` erbij zijn nieuw.

drop function if exists public.openstaande_beoordelingen(integer, integer);

create or replace function public.openstaande_beoordelingen(
  p_limit  integer default 20,
  p_offset integer default 0
)
  returns table (
    completion_id      uuid,
    weekly_goal_id     uuid,
    group_id           uuid,
    owner_id           uuid,
    owner_name         text,
    owner_avatar       text,
    goal_title         text,
    weekly_title       text,
    floor_text         text,
    ceiling_text       text,
    achieved_level     text,
    note               text,
    submitted_at       timestamptz,
    approvals_done     integer,
    approvals_required integer,
    total_open         bigint
  )
  language sql
  stable
  set search_path = public, pg_temp
as $$
  select
    c.id,
    w.id,
    k.group_id,
    g.owner_id,
    p.display_name,
    p.avatar_url,
    g.title,
    w.title,
    w.floor_text,
    w.ceiling_text,
    c.achieved_level,
    c.note,
    c.submitted_at,
    s.gedaan,
    s.nodig,
    count(*) over ()
  from completions c
  join weekly_goals w on w.id = c.weekly_goal_id
  join goals g on g.id = w.goal_id
  join profiles p on p.id = g.owner_id
  join lateral (
    select l.group_id
    from goal_group_links l
    join group_members m on m.group_id = l.group_id
    where l.goal_id = g.id
      and m.user_id = auth.uid()
      and m.status <> 'inactive'
    order by l.linked_at asc
    limit 1
  ) k on true
  join lateral (
    select
      (select count(*)::int
         from completion_approvals a
        where a.completion_id = c.id
          and a.group_id      = k.group_id
          and a.status        = 'approved'
          and not exists (
            select 1 from approval_withdrawals x where x.approval_id = a.id
          )) as gedaan,
      coalesce(
        (select r.approvals_required::int
           from completion_approval_rules r
          where r.completion_id = c.id
            and r.group_id      = k.group_id),
        vereiste_goedkeuringen(k.group_id, g.owner_id)::int
      ) as nodig
  ) s on true
  where c.superseded_by is null
    and w.status = 'pending'
    and c.user_id <> auth.uid()
    and not exists (
      select 1 from completion_approvals a
      where a.completion_id = c.id
        and a.approver_id = auth.uid()
        -- Een ingetrokken oordeel telt niet als oordeel (Q-TODO A19).
        and not exists (
          select 1 from approval_withdrawals x where x.approval_id = a.id
        )
    )
  order by c.submitted_at asc
  limit greatest(0, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.openstaande_beoordelingen(integer, integer) from public, anon;
grant execute on function public.openstaande_beoordelingen(integer, integer) to authenticated;

comment on function public.openstaande_beoordelingen(integer, integer) is
  'Wat er op jouw oordeel wacht, met de stand van de bevestigingen in de groep '
  'waarlangs jij kijkt — QS8-62, uitgebreid in QS8-65.';
