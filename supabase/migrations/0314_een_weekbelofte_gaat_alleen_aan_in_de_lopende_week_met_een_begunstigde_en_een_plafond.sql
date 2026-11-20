-- 0314_een_weekbelofte_gaat_alleen_aan_in_de_lopende_week_met_een_begunstigde_en_een_plafond.sql
-- — de eerste schrijfweg voor een weekbelofte, dicht in de database: de client
-- mag `periode_start` inserten, een trigger eist de lopende week en zet het
-- einde, en `commitments_insert` eist een bekende begunstigde, een plafond van
-- drie en geen doelstraf ernaast (QS8-760, x.3 van de poort QS8-744).
--
-- ROLLBACK-PAD:
--   revoke insert (periode_start) on public.commitments from authenticated;
--   drop trigger if exists commitments_zone_belofteperiode on public.commitments;
--   drop function if exists public.bevries_belofteperiode();
--   drop function if exists public.belofteperiode_klopt(date, smallint, text, timestamptz);
--   drop policy if exists commitments_insert on public.commitments;
--   create policy commitments_insert ...     -- woordelijk de vorm van 0238 (r.213)
--   drop function if exists public.weekbelofte_begunstigde_bekend(uuid, uuid);
--   (eerst de policy terugzetten: hij roept de functie aan.)
--
-- ⚠️ Raakt geen kolom, index of rij en wist niets. Terugdraaien sluit de
--    schrijfweg weer; beloftes die intussen bestaan blijven staan en worden door
--    0313 gewoon beslist.
--
-- ⚠️ **Wacht op Quintens "backup gedaan"** (docs/PROMPT-SESSIE.md §12d): deze
--    migratie vervangt een INSERT-policy op het strafpad. Volgorde: 0312, 0313,
--    0314. De bundel die `periode_start` opvraagt (QS8-760) pas ná 0312 op
--    productie, zie `docs/DEPLOY.md` §2.5c.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Besluit van Quinten (19-11-2026, poort QS8-744); de splitsing en x.3 staan in
-- `docs/decisions/2026-11-20-de-belofte-is-een-commitment-met-een-getuige.md`,
-- wat deze bouw erbij koos in
-- `docs/decisions/2026-11-20-een-weekbelofte-gaat-aan-in-de-lopende-week.md`.
--
-- 📏 Gemeten op de lokale stack (stand 0313), en het bepaalt de vorm:
--
--   * `commitments` heeft alleen kolomgrants (0172, 0057, 0280, 0312). INSERT
--     voor `authenticated` op zeven kolommen, niet op `periode_start`,
--     `periode_einde`, `status`, `tz` of `created_at`.
--   * BEFORE-triggers vuren op naam: `commitments_begunstigde`,
--     `commitments_rem`, `commitments_zone`. Een `with check` van RLS draait
--     ná alle BEFORE ROW-triggers. Een trigger die iets weigert, antwoordt dus
--     vóór de policy, ook aan wie de rij helemaal niet mag schrijven.
--   * `commitments_insert` (0238) heeft een straftak `g.target_date >=
--     mijn_datum() and g.status = 'active'`. Die blijft, ook voor een belofte:
--     zie het beslisdocument, punt 4.
--
-- ---------------------------------------------------------------------------
-- 1. De client mag de start van de week opgeven, het einde niet
-- ---------------------------------------------------------------------------
--
-- SQL kent geen cyclusberekening (correctheidsregel 7): de client rekent de
-- start uit met `userCycle()` en de database accepteert alleen die ene waarde.
-- `periode_einde` krijgt géén grant: de trigger hieronder zet hem, en een
-- client die hem meestuurt krijgt 42501 van de kolomgrant (die controle draait
-- vóór elke trigger).

grant insert (periode_start) on public.commitments to authenticated;

-- ---------------------------------------------------------------------------
-- 2. De klokregel, los en met een vaste klok te toetsen
-- ---------------------------------------------------------------------------
--
-- Valt `p_start` op de startdag, en is het de start van de cyclus waarin
-- `p_nu` in zone `p_tz` ligt? Dit rekent geen cyclus uit (correctheidsregel 7):
-- het toetst één waarde die de client met `userCycle()` uitrekende.
--
-- ⚠️ **Een eigen functie met `p_nu`, zodat de suite hem met een vaste klok kan
--    voeden** ("Auckland zondag 23:30" laat zich met `now()` niet neerzetten).
--    Een klok die de aanroeper zet is precies de vorm die 0294 wegnam, dus:
--    invoker, en uitvoerbaar voor niemand dan de eigenaar (`postgres`). De
--    trigger, definer met eigenaar `postgres`, roept hem aan met `now()`.
--    Zelfde vorm als `beslis_weekbeloftes(uuid, timestamptz)` in 0313.
create or replace function public.belofteperiode_klopt(
  p_start    date,
  p_startdag smallint,
  p_tz       text,
  p_nu       timestamptz
)
returns text
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_vandaag date;
begin
  if extract(dow from p_start)::smallint <> p_startdag then
    return 'startdag';
  end if;
  -- De kalender in de zone van de eigenaar, niet die van de server (UTC).
  v_vandaag := (p_nu at time zone p_tz)::date;
  if v_vandaag < p_start or v_vandaag >= p_start + 7 then
    return 'week';
  end if;
  return null;
end;
$function$;

revoke all on function public.belofteperiode_klopt(date, smallint, text, timestamptz)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. De trigger: klok, plafond en uitsluiting, achter de eigenaarstoets
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Zwijgen zodra de invoerder niet de eigenaar is**, de vorm van
--    `weekdoel_cyclus_klopt()` (0198). Deze trigger draait vóór
--    `commitments_insert` (RLS `with check` komt ná alle BEFORE ROW-triggers).
--    Zou hij B met het `goal_id` van A iets anders dan niets zeggen, dan leest
--    B daaruit `profiles.week_start_day` van A (de klok), of dát A een belofte
--    of doelstraf heeft (de uitsluiting). De policy weigert die rij toch met
--    42501, dus er gaat niets verloren. **Elke `raise` hieronder staat ná die
--    toets**, en een nieuwe hoort daar ook.
--
-- ⚠️ **Zwijgen zonder `auth.uid()`** (service_role, de suite als `postgres`):
--    de bestaande suites zetten bewust weken in het verleden neer om het
--    beslispad van 0313 te toetsen, en de CHECK van 0312 houdt de vorm toch.
--    Het einde wordt dan niet aangevuld: wie zonder JWT schrijft, schrijft beide
--    kolommen zelf, en de CHECK toetst dat (x.1, criterium 5).
--
-- ⚠️ **Het plafond en de uitsluiting staan hier en niet in de policy**, anders
--    dan het issue ze plaatste. 📏 Twee redenen, allebei uit de spec-ronde:
--    een bulk-insert via PostgREST zet meerdere rijen in één statement, en een
--    telling in een `with check` ziet de eerder verwerkte rijen van dat
--    statement niet zeker; en twee gelijktijdige verzoeken tellen allebei
--    "twee lopend". Een `volatile` rijtrigger ná een rijslot ziet beide. De
--    eigenaarstoets ervoor houdt het antwoord bij de eigenaar.
--
-- ⚠️ **De sloten.** De profielrij `for no key update`: dat botst met het
--    `for update` van `zet_week_startdag()` (0313 weigert met
--    `weekbelofte_loopt` zolang er een belofte loopt; zonder slot kon die
--    wijziging tussen deze toets en de commit door), en met een tweede insert
--    van dezelfde eigenaar (het plafond). De doelrij `for no key update`: een
--    belofte en een doelstraf op hetzelfde doel serialiseren, want er is geen
--    unieke index die over beide heen gaat.
--
-- ⚠️⚠️ **Na `commitments_zone`, en dat is de naam.** Triggers van dezelfde soort
--    vuren op alfabet; `commitments_zone_belofteperiode` komt ná
--    `commitments_zone`, zodat `new.tz` al de bevroren zone is waarmee 0313
--    beslist. Lopende week en beslismoment meten zo aan één klok. Is `new.tz`
--    hier toch leeg, dan is die volgorde omgedraaid, en dat is luid en niet
--    stil: een terugval op `profiles.tz` zou het verschil verbergen.
--
-- ⚠️ **Ook bij UPDATE:** `periode_start` en `periode_einde` liggen vast vanaf
--    het aangaan, zoals `tz` in 0280. Vandaag heeft geen client er een
--    UPDATE-grant op, maar dat is erfenis en geen besluit, en 0313 beslist op
--    `periode_einde`. Geldt ook voor `service_role`.

create or replace function public.bevries_belofteperiode()
returns trigger
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid      uuid := (select auth.uid());
  v_owner    uuid;
  v_startdag smallint;
  v_fout     text;
  c_plafond  constant integer := 3;
begin
  if tg_op = 'UPDATE' then
    if new.periode_start is distinct from old.periode_start
       or new.periode_einde is distinct from old.periode_einde then
      raise exception 'De week van een weekbelofte ligt vast vanaf het aangaan'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if v_uid is null or new.type <> 'penalty' then
    return new;
  end if;

  select g.owner_id into v_owner from goals g where g.id = new.goal_id for no key update;
  if v_owner is distinct from v_uid then
    return new;
  end if;

  -- ---- een doelstraf: geen open belofte op hetzelfde doel ----
  if new.periode_start is null then
    if exists (
         select 1 from commitments c
          where c.goal_id = new.goal_id
            and c.periode_start is not null
            and c.status in ('set', 'due')
       ) then
      raise exception 'Op dit doel loopt een weekbelofte; een straf erbij kan niet'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- ---- een weekbelofte ----
  if new.tz is null then
    raise exception 'bevries_belofteperiode() draait vóór bevries_commitmentzone(): de volgorde van de triggers is omgedraaid'
      using errcode = 'internal_error';
  end if;

  select p.week_start_day into v_startdag from profiles p where p.id = v_owner for no key update;
  if v_startdag is null then
    return new;
  end if;

  v_fout := belofteperiode_klopt(new.periode_start, v_startdag, new.tz, now());
  if v_fout = 'startdag' then
    raise exception 'Een weekbelofte begint op je eigen week-startdag'
      using errcode = 'check_violation',
            hint = 'periode_start moet op profiles.week_start_day vallen; de app rekent hem uit met userCycle().';
  elsif v_fout = 'week' then
    raise exception 'Een weekbelofte geldt voor je lopende week'
      using errcode = 'check_violation',
            hint = 'periode_start is de start van de lopende cyclus, niet van een vorige of volgende.';
  end if;

  new.periode_einde := new.periode_start + 7;

  if exists (
       select 1 from commitments c
        where c.goal_id = new.goal_id
          and c.type = 'penalty'
          and c.periode_start is null
          and c.status in ('set', 'due')
     ) then
    raise exception 'Op dit doel staat een straf; een weekbelofte erbij kan niet'
      using errcode = 'check_violation';
  end if;

  -- N = 3 (aangenomen; regel 5, de spamvector van 0170).
  if (
    select count(*)
      from commitments c
      join goals g on g.id = c.goal_id
     where g.owner_id = v_owner
       and c.periode_start is not null
       and c.status = 'set'
  ) >= c_plafond then
    raise exception 'Je hebt al % lopende weekbeloftes', c_plafond
      using errcode = 'check_violation',
            hint = 'Een nieuwe kan aan zodra er een beslist of ingetrokken is.';
  end if;

  return new;
end;
$function$;

revoke all on function public.bevries_belofteperiode() from public, anon, authenticated;

drop trigger if exists commitments_zone_belofteperiode on public.commitments;
create trigger commitments_zone_belofteperiode
  before insert or update of periode_start, periode_einde on public.commitments
  for each row execute function public.bevries_belofteperiode();

-- ---------------------------------------------------------------------------
-- 4. De begunstigde van een belofte is een bekende
-- ---------------------------------------------------------------------------
--
-- Een groep is geen automatisch gevormde groep (onbekenden, QS8-230). Een
-- getuige deelt met de aanroeper een niet-automatische, niet gearchiveerde groep
-- waarin beiden actief zijn: een vreemde uit een automatische groep is dezelfde
-- onbekende als die groep zelf, en anders liep de regel via één getuige om.
-- ⚠️ Die tweede helft is een [AANNAME] van deze bouw, alleen voor beloftes; zie
--    het beslisdocument.
--
-- ⚠️ **Fail-closed geschreven:** `exists (… and not automatisch)` en niet
--    `not exists (… automatisch)`. Die tweede vorm laat een rij die niet te
--    lezen is stil door.
--
-- ⚠️ **"Een begunstigde is verplicht" staat hier níet.** `bewaak_begunstigde()`
--    (0168) eist dat al vóór de policy, ook voor `service_role`; een conjunct
--    die daarachter staat is niet los rood te maken (regel 18 vraag 3).
--
-- Definer, omdat `groups` en `group_members` anders onder de RLS van de
-- aanroeper gelezen worden. Antwoordt alleen over de aanroeper: geen
-- uid-argument, `auth.uid()` binnenin (`definer_bewaking()`, 0167).
create or replace function public.weekbelofte_begunstigde_bekend(p_groep uuid, p_getuige uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select (
    p_groep is null
    or exists (
      select 1
        from group_members m
        join groups gr on gr.id = m.group_id
       where m.group_id = p_groep
         and m.user_id  = (select auth.uid())
         and m.status  <> 'inactive'
         and gr.status <> 'archived'
         and not gr.automatisch
    )
  ) and (
    p_getuige is null
    or exists (
      select 1
        from group_members mijn
        join group_members hun on hun.group_id = mijn.group_id
        join groups gr on gr.id = mijn.group_id
       where mijn.user_id = (select auth.uid())
         and hun.user_id  = p_getuige
         and mijn.status <> 'inactive'
         and hun.status  <> 'inactive'
         and gr.status   <> 'archived'
         and not gr.automatisch
    )
  );
$function$;

revoke all on function public.weekbelofte_begunstigde_bekend(uuid, uuid) from public, anon, authenticated;
grant execute on function public.weekbelofte_begunstigde_bekend(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 5. De policy
-- ---------------------------------------------------------------------------
--
-- Alles van 0238 woordelijk, plus één conjunct onderaan voor een belofte.

drop policy if exists commitments_insert on public.commitments;
create policy commitments_insert on public.commitments
  for insert to authenticated
  with check (
    exists (
      select 1 from goals g
      where g.id = commitments.goal_id and g.owner_id = (select auth.uid())
    )
    and status = 'set'
    and (beneficiary_group_id is null or is_group_member(beneficiary_group_id))
    and (beneficiary_user_id is null or shares_group_with_user(beneficiary_user_id))
    and (
      type <> 'penalty'
      or exists (
        select 1 from goals g
        where g.id = commitments.goal_id
          and g.target_date >= mijn_datum()
          -- ⚠️ QS8-322 §3. Zie de kop van 0238: zonder deze regel wordt een
          --    straf op een afgerond doel verschuldigd. Geldt ook voor een
          --    weekbelofte (QS8-760; beslisdocument punt 4).
          and g.status = 'active'
      )
    )
    and created_at between now() - interval '5 minutes' and now() + interval '5 minutes'
    and confirmed_at between now() - interval '5 minutes' and now() + interval '5 minutes'
    -- QS8-760: de begunstigde van een weekbelofte is een bekende.
    and (
      periode_start is null
      or weekbelofte_begunstigde_bekend(beneficiary_group_id, beneficiary_user_id)
    )
  );
