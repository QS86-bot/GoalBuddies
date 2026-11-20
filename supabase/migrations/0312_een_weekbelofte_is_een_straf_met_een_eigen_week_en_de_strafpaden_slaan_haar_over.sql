-- 0312_een_weekbelofte_is_een_straf_met_een_eigen_week_en_de_strafpaden_slaan_haar_over.sql
-- — `commitments` krijgt een eigen week voor een weekbelofte (`periode_start`,
-- `periode_einde`), en de vijf bestaande strafpaden slaan zo'n rij over vóórdat
-- er ooit één bestaat (QS8-758, x.1 van de poort QS8-744).
--
-- ROLLBACK-PAD:
--   drop index if exists public.commitments_een_lopende_weekbelofte_per_doel;
--   drop index if exists public.commitments_een_weekbelofte_per_week;
--   drop index if exists public.commitments_een_open_per_soort;
--   create unique index commitments_een_open_per_soort on public.commitments (goal_id, type)
--     where status in ('set', 'unlocked', 'due');                        -- de vorm van 0170
--   de vijf functies terug uit hun vorige definitie:
--     maak_straffen_verschuldigd(uuid)       0294
--     beslis_deadline_verzoek(uuid, boolean, text)  0288
--     straffen_bij_uitstelverzoek(uuid[])   0218
--     doeldatum(uuid, uuid)                 0288
--     zet_streefdatum(uuid, date)           0184
--   revoke select (periode_start, periode_einde) on public.commitments from authenticated;
--   alter table public.commitments drop constraint if exists commitments_belofteperiode_vorm;
--   alter table public.commitments drop column if exists periode_einde;
--   alter table public.commitments drop column if exists periode_start;
--
-- ⚠️ De kolommen zijn bij deze migratie leeg: geen enkele client kan ze schrijven
--    (er is geen INSERT- of UPDATE-grant op), en de eerste schrijfweg komt pas in
--    x.3. Wordt dit teruggedraaid nádat er beloftes bestaan, dan valt het droppen
--    onder grens 2 van de beslisbevoegdheid en hoort er een `pg_dump` vóór.
--    De oude index terugzetten botst dan bovendien zodra er een belofte én een
--    doelstraf op hetzelfde doel open staan — dat is correct gedrag.
--
-- ⚠️ **Wacht op Quintens "backup gedaan"** (docs/PROMPT-SESSIE.md §12d): deze
--    migratie wijzigt een bestaande tabel, een unieke index en vijf functies, en
--    wordt dus niet door een bouwsessie op productie gezet.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Besluit van Quinten (19-11-2026, poort QS8-744): de belofte is een commitment
-- van het type `penalty` in de bestaande tabel, met een eigen week van de
-- gebruiker. Uitleg en de zeven bevindingen van de spec-ronde in
-- `docs/decisions/2026-11-20-de-belofte-is-een-commitment-met-een-getuige.md`.
--
-- 📏 Gelezen, en de reden dat deze migratie vóór elke schrijfweg komt: vijf
-- functies pakken elke `type = 'penalty'`, en zouden een belofte behandelen als
-- een doelstraf:
--
--   * `maak_straffen_verschuldigd()` zou haar `due` maken op `goals.target_date`
--     in plaats van op het einde van haar eigen week;
--   * `beslis_deadline_verzoek()` zou een verschuldigde belofte terugzetten naar
--     `set` bij een goedgekeurde verschuiving van het doel;
--   * `straffen_bij_uitstelverzoek()` zou de gevraagde groep laten weten dát er
--     een belofte loopt (rij 31 van 002 is "dát er een straf staat", niet meer);
--   * `doeldatum()` zou de bevroren zone van een belofte als klok van het doel
--     nemen;
--   * de grendel `straf_staat_open` van `zet_streefdatum()` zou de streefdatum
--     vasthouden voor een belofte die er niet aan meet.
--
-- Elk krijgt `periode_start is null`: **"doelstraf" betekent vanaf hier
-- `type = 'penalty' and periode_start is null`.** De lichamen zijn overgenomen
-- uit `pg_get_functiondef()` op een database die tot en met 0311 is opgebouwd
-- (= `main` op 3148ff6); per functie verandert er precies één conjunct plus zijn
-- commentaar. Geen handtekening verandert, dus de ACL blijft; de grant-regels
-- staan er woordelijk zoals op `main`.
--
-- ⚠️ **Niet in deze migratie, met opzet:** `wikkel_commitments_af()` annuleert bij
--    op tijd afronden elke straf op `set`, ook een belofte. Of dat "gehouden"
--    betekent is een vraag voor x.2 (QS8-759), en tot x.3 bestaat er geen
--    belofterij die het kan raken.
--
-- ---------------------------------------------------------------------------
-- 1. De kolommen en hun vorm
-- ---------------------------------------------------------------------------
--
-- `periode_start` is de eerste dag van de cyclus van de eigenaar
-- (`userCycle()` uit `src/shared/time/cycle.ts`, correctheidsregel 7 — SQL kent
-- geen cyclusberekening). `periode_einde` is `periode_start + 7` en wordt in x.3
-- door een trigger gezet, nooit door de client. Een `date` en geen
-- `timestamptz`: de dag wordt gelezen in de bevroren `commitments.tz` (0280).

alter table public.commitments
  add column if not exists periode_start date,
  add column if not exists periode_einde date;

-- ⚠️ Eén CHECK met drie eisen, en hij geldt ook voor `service_role`:
--    allebei of geen van beide; het einde is precies zeven dagen na de start;
--    en alleen een straf heeft een periode — een beloning met een week bestaat
--    niet. Bestaande rijen hebben allebei `null` en valideren meteen.
alter table public.commitments drop constraint if exists commitments_belofteperiode_vorm;
alter table public.commitments
  add constraint commitments_belofteperiode_vorm check (
    (periode_start is null) = (periode_einde is null)
    and (periode_start is null
         or (type = 'penalty' and periode_einde = periode_start + 7))
  );

-- ---------------------------------------------------------------------------
-- 2. Rechten: lezen wel, schrijven niet
-- ---------------------------------------------------------------------------
--
-- `commitments` heeft sinds 0172 (INSERT), 0057 (UPDATE) en 0280 (SELECT)
-- uitsluitend kolomgrants. Een nieuwe kolom krijgt daarmee vanzelf géén INSERT-
-- of UPDATE-recht: er is niets in te trekken, en `tests/rls/weekbelofte.test.ts`
-- toetst dat met `has_column_privilege` én met een echte insert (42501).
--
-- SELECT wel: de eigenaar leest zijn eigen week. Wie verder de rij ziet, bepaalt
-- `commitments_select` (0183): de begunstigde pas vanaf `unlocked`/`due`/`resolved`.
-- ⚠️ Een kolomgrant onderscheidt eigenaar en groepslid niet — beide zijn
--    `authenticated` — dus na `due` ziet de begunstigde ook de week. Dat is de
--    keuze uit §5 van het beslisdocument, niet een bijvangst.
grant select (periode_start, periode_einde) on public.commitments to authenticated;

-- ---------------------------------------------------------------------------
-- 3. De indexen: één open doelstraf per soort, één lopende belofte per doel
-- ---------------------------------------------------------------------------
--
-- 📏 `commitments_een_open_per_soort` (0170) is uniek op `(goal_id, type)` bij
-- `set`, `unlocked` en `due`, en uit `due` kom je niet meer. Na één gebroken
-- belofte kon er op dat doel dus nooit meer een belofte of doelstraf bij. Hij
-- wordt versmald tot doelcommitments, onder dezelfde naam omdat tests en koppen
-- die naam noemen.
--
-- ⚠️ Volgorde voor de idempotentie: eerst de oude droppen en opnieuw aanmaken,
--    dan de nieuwe; elke index met zijn eigen `drop … if exists`. Er hangt geen
--    constraint of foreign key aan, dus de botsing van 0252 kan hier niet.
drop index if exists public.commitments_een_open_per_soort;
create unique index commitments_een_open_per_soort
  on public.commitments (goal_id, type)
  where status in ('set', 'unlocked', 'due')
    and periode_start is null;

-- Eén lopende belofte per doel, ongeacht de week. Een tweede belofte gaat pas aan
-- als de vorige beslist of ingetrokken is; dat sluit ook uit dat twee weken van
-- hetzelfde doel tegelijk lopen.
drop index if exists public.commitments_een_lopende_weekbelofte_per_doel;
create unique index commitments_een_lopende_weekbelofte_per_doel
  on public.commitments (goal_id)
  where periode_start is not null
    and status = 'set';

-- Eén belofte per doel per week, tenzij ingetrokken: een gebroken of verschuldigde
-- week wordt niet overgedaan met een nieuwe belofte voor dezelfde week.
drop index if exists public.commitments_een_weekbelofte_per_week;
create unique index commitments_een_weekbelofte_per_week
  on public.commitments (goal_id, periode_start)
  where periode_start is not null
    and status <> 'cancelled';

-- ---------------------------------------------------------------------------
-- 4. De vijf strafpaden slaan een weekbelofte over
-- ---------------------------------------------------------------------------
--
-- ⚠️ git ziet geen conflict als een parallelle tak een van deze vijf herdefinieert
--    vanuit een ouder lichaam; de uitsluiting valt dan stil weg. De grendel
--    daartegen is `tests/rls/weekbelofte.test.ts`, die het gedrag toetst en niet
--    de tekst.

CREATE OR REPLACE FUNCTION public.maak_straffen_verschuldigd(p_owner_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_aantal integer;
begin
  if p_owner_id is null then
    return 0;
  end if;

  update commitments c
     set status = 'due'
    from goals g
         cross join lateral (
           select public.doeldatum(g.id, g.owner_id) as vandaag
         ) d
   where g.id = c.goal_id
     and g.owner_id = p_owner_id
     and c.type = 'penalty'
     and c.status = 'set'
     -- ⚠️ QS8-758 (0312): alleen een doelstraf. Een weekbelofte
     --    (`periode_start is not null`) hangt niet aan `goals.target_date`
     --    maar aan het einde van haar eigen week; dat beslist x.2.
     and c.periode_start is null
     and g.target_date < d.vandaag
     and c.created_at < now() - interval '24 hours'
     and not exists (
       select 1
       from deadline_requests r
       where r.goal_id = g.id
         and r.status = 'open'
         and r.new_date >= d.vandaag
         and exists (
           select 1
           from group_members m
           where m.group_id = r.group_id
             and m.user_id <> r.requester_id
             and m.status <> 'inactive'
         )
         and g.target_date > d.vandaag - 7
         and not exists (
           select 1
           from deadline_requests eerder
           where eerder.goal_id = g.id
             and eerder.status = 'rejected'
             and eerder.old_date = g.target_date
         )
     );

  get diagnostics v_aantal = row_count;
  return v_aantal;
end;
$function$;

revoke all on function public.maak_straffen_verschuldigd(uuid) from public, anon, authenticated;
grant execute on function public.maak_straffen_verschuldigd(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.beslis_deadline_verzoek(p_request_id uuid, p_akkoord boolean, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r          deadline_requests%rowtype;
  g          goals%rowtype;
  schoon     text := nullif(btrim(coalesce(p_note, '')), '');
  teruggezet integer := 0;
  v_vandaag  date;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select * into r from deadline_requests where id = p_request_id;

  if r.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if r.status <> 'open' then
    return jsonb_build_object('ok', false, 'reason', 'already_decided');
  end if;

  if r.requester_id = auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_yourself');
  end if;

  if not exists (
    select 1 from group_members m
    where m.group_id = r.group_id and m.user_id = auth.uid() and m.status <> 'inactive'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;

  if schoon is not null and char_length(schoon) > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'note_too_long');
  end if;

  -- ⚠️⚠️ **De klok, één keer bepaald** — QS8-531, besluit van Quinten.
  --
  --    Staat er een levende straf op dit doel, dan is de maat de zone die bij
  --    het aangaan is vastgelegd (`commitments.tz`, bevroren sinds 0280). Die
  --    kolom staat in géén enkele grant aan `authenticated`; de zone in zijn
  --    profiel wél, en 📏
  --    `has_column_privilege('authenticated','public.profiles','tz','UPDATE')`
  --    is `t`. Wát die bevriezing vastlegt en wat níet, staat in de kop — lees
  --    dat vóór je hier een geruststelling uit afleidt.
  --
  --    Staat er géén straf, dan blijft de dag van de aanvrager de maat: zonder
  --    commitment device is er geen consequentie om aan te sleutelen, en dat is
  --    de reden die 0171 bij deze poort opschreef. Zie de kop.
  --
  v_vandaag := doeldatum(r.goal_id, r.requester_id);

  -- ⚠️ **Alleen bij een akkoord, en alleen als de gevraagde datum al voorbij
  --    is.** Afwijzen mag altijd — dat verschuift niets en laat niets afgaan.
  --
  -- ⚠️ Vóór de `update` op `deadline_requests`, zodat het verzoek `open` blijft
  --    in plaats van als beslist weggeschreven te worden.
  if p_akkoord and r.new_date < v_vandaag then
    return jsonb_build_object('ok', false, 'reason', 'verzoek_verlopen');
  end if;

  update deadline_requests
  set status        = case when p_akkoord then 'approved' else 'rejected' end,
      decided_by    = auth.uid(),
      decided_at    = now(),
      decision_note = schoon
  where id = r.id;

  if not p_akkoord then
    return jsonb_build_object('ok', true, 'moved', false);
  end if;

  select * into g from goals where id = r.goal_id;

  update goals set target_date = r.new_date where id = r.goal_id;

  -- ⚠️ **De straf komt terug van `due` naar `set`** (QS8-308). Domeinregel 11:
  --    een straf treedt alleen in werking bij een verstreken deadline, en die
  --    is dat na deze verschuiving niet meer. Zonder dit blok blijft hij
  --    verschuldigd terwijl zijn voorwaarde vervallen is.
  --
  -- ⚠️ **Alleen `penalty` en alleen vanaf `due`.** Een `resolved` of
  --    `cancelled` straf is afgehandeld en komt nooit terug; een beloning heeft
  --    met de streefdatum niets te maken.
  --
  -- ⚠️ **En alleen als de nieuwe datum écht in de toekomst ligt.** De verlooptak
  --    hierboven dekt dat al, maar deze voorwaarde staat er zodat het blok op
  --    zichzelf klopt: hij zet niets terug waarvan de reden nog geldt.
  --
  -- ⚠️⚠️ **Dezelfde `v_vandaag` als de poort hierboven, en niet een tweede
  --    aanroep.** Tot 0288 stond hier dezelfde vraag nog een keer los gesteld.
  --    Twee plekken die hetzelfde moeten weten, zijn twee plekken waar de
  --    volgende schrijver er één kan verzetten (QS8-531).
  --
  -- ⚠️ `commitments_update` heeft `using (status = 'set' …)`, dus vanaf `due` is
  --    deze kolom voor geen enkele client te verzetten. Dat dit hier kan, komt
  --    doordat deze functie `security definer` is — en dat is precies waarom
  --    het auditspoor eronder niet optioneel is (domeinregel 6). De trigger
  --    `commitments_audit` schrijft de `reverted`-rij.
  --
  -- ⚠️ **Hier stond "sinds deze migratie heet die overgang ook zo in plaats van
  --    `triggered`". Dat sloeg op 0177 en is met de functie meegekomen uit
  --    `pg_get_functiondef()`; 0288 raakt `noteer_commitment()` niet aan.** 📏 De
  --    `reverted`-tak staat er sinds 0177 en is herhaald in 0220. Een lezer die
  --    0288 terugdraait, zou anders denken dat hij de auditnaam meeneemt — en dat
  --    is precies de kostbare kant van een commentaar dat met code meereist.
  if r.new_date >= v_vandaag then
    update commitments c
       set status = 'set'
     where c.goal_id = r.goal_id
       and c.type = 'penalty'
       and c.status = 'due'
       -- ⚠️ QS8-758 (0312): een weekbelofte heeft geen streefdatum die een
       --    buddy kan opschuiven; een verschoven doel zet haar niet terug.
       and c.periode_start is null;

    get diagnostics teruggezet = row_count;
  end if;

  -- ⚠️ De goedkeurder staat sinds 0085 in `approved_by_id` en niet meer in
  --    `new_value`: een uuid in jsonb heeft geen foreign key en overleeft dus
  --    het verwijderen van dat account.
  insert into goal_events (goal_id, actor_id, event_type, old_value, new_value, approved_by_id)
  values (r.goal_id, r.requester_id, 'deadline_moved',
          jsonb_build_object('target_date', g.target_date),
          jsonb_build_object('target_date', r.new_date, 'request_id', r.id,
                             'straffen_teruggezet', teruggezet),
          auth.uid());

  return jsonb_build_object('ok', true, 'moved', true, 'straffen_teruggezet', teruggezet);
end;
$function$;

revoke all on function public.beslis_deadline_verzoek(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.beslis_deadline_verzoek(uuid, boolean, text) to authenticated;

CREATE OR REPLACE FUNCTION public.straffen_bij_uitstelverzoek(p_goal_ids uuid[])
 RETURNS TABLE(goal_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- ⚠️ **Werpen en niet afkappen** (onwrikbare regel 10). Een `p_goal_ids[1:100]`
  --    faalt stíl: 📏 met het doel op positie 120 van 150 kwamen er nul rijen
  --    terug, zonder fout — en dan verdwijnt de waarschuwing terwijl het scherm
  --    denkt dat het een antwoord heeft. Een exception wordt in
  --    `fetchStrafDoelen()` een `null` en op het scherm "dit konden we niet
  --    ophalen". Fail-closed, zonder één regel schermcode.
  if coalesce(array_length(p_goal_ids, 1), 0) > 100 then
    raise exception 'straffen_bij_uitstelverzoek: hoogstens 100 doelen per aanroep'
      using errcode = 'program_limit_exceeded';
  end if;

  return query
  select distinct c.goal_id
  from commitments c
  where c.type = 'penalty'
    -- ⚠️ **`cancelled` telt niet mee, en dat is een correctie uit de
    --    security-ronde.** Het scherm zegt *"Ga je akkoord, dan schuift de datum
    --    waarop die verschuldigd wordt mee"*, en bij een ingetrokken straf is dat
    --    aantoonbaar onwaar: er schuift niets. Een onjuiste mededeling in een
    --    beslissing over een commitment device is erger dan geen mededeling.
    --
    -- ⚠️ **En dit is de enige stand die eruit mag.** `set`, `due` en `resolved`
    --    tellen alle drie mee, juist zodat de uitkomst níet verandert als een
    --    straf verschuldigd wordt: zou `due` eruit vallen, dan is het
    --    verdwijnen van dit bit het signaal dat iemand zijn streefdatum niet
    --    gehaald heeft (domeinregel 7). Wat hier wél afleidbaar wordt is dat de
    --    eigenaar zijn straf heeft ingetrokken — zijn eigen handeling, en geen
    --    tegenslag.
    and c.status <> 'cancelled'
    -- ⚠️ QS8-758 (0312): **een weekbelofte valt hierbuiten.** Het oppervlak
    --    van 0218 bestaat omdat een akkoord de straf kan verschuiven; een
    --    belofte schuift niet mee, en anders weet de gevraagde groep dát er
    --    een belofte loopt. De client-spiegel `wordtZichtbaarBijUitstelverzoek()`
    --    in `src/modules/commitments/stand.ts` slaat haar ook over.
    and c.periode_start is null
    and c.goal_id = any (p_goal_ids)
    -- ⚠️ **Dezelfde opvatting van "mag ik dit doel zien" als de rest van de
    --    leeskant, en niet een derde.** `shares_group_with_goal()` eist dat de
    --    kíjker nog actief lid is, dat de **eigenaar** dat ook is, en dat de
    --    groep niet gearchiveerd is. 📏 Zonder deze conjunct las een groepslid
    --    het bit terwijl het doel zelf onzichtbaar was — in een gearchiveerde
    --    groep, en ook nadat de eigenaar zichzelf met een kale PATCH op
    --    `inactive` had gezet. Een oppervlak dat langer leeft dan het doel
    --    waar het over gaat, is een oppervlak dat niemand besloten heeft.
    and shares_group_with_goal(c.goal_id)
    and exists (
      select 1
      from deadline_requests r
      join goal_group_links l
        on l.goal_id = r.goal_id
       and l.group_id = r.group_id
      where r.goal_id = c.goal_id
        -- ⚠️ **Een ingetrokken verzoek telt niet.** De onderbouwing van dit
        --    oppervlak is "je hebt deze groep gevraagd je afspraak losser te
        --    maken, dus die mag weten wat eraan hangt". Bij `withdrawn` heeft
        --    niemand ooit iets toegestaan — de aanvrager heeft het zelf
        --    teruggenomen. `rejected` telt wél mee: daar is over besloten, en
        --    wie nee heeft gezegd, hoort te kunnen terugzien waarop.
        and r.status <> 'withdrawn'
        -- ⚠️ De `join` hierboven eist dat het doel nog mét díe groep gedeeld
        --    wordt. Samen met de trigger van sectie 1 sluit dat allebei de
        --    kanten: de waarschuwing én de knop.
        and mag_groep_lezen(r.group_id)
    );
end;
$function$;

revoke all on function public.straffen_bij_uitstelverzoek(uuid[]) from public, anon, authenticated;
grant execute on function public.straffen_bij_uitstelverzoek(uuid[]) to authenticated;

CREATE OR REPLACE FUNCTION public.doeldatum(p_goal_id uuid, p_eigenaar uuid)
 RETURNS date
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
  select coalesce(
    (select max((now() at time zone c.tz)::date)
       from commitments c
      where c.goal_id = p_goal_id
        and c.type    = 'penalty'
        and c.status in ('set', 'due')
        -- ⚠️ QS8-758 (0312): de klok van een doelstraf, nooit die van een
        --    weekbelofte. Ná de statuslijst, die een test letterlijk zoekt.
        and c.periode_start is null),
    eigenaarsdatum(p_eigenaar),
    current_date
  );
$function$;

revoke all on function public.doeldatum(uuid, uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.zet_streefdatum(p_goal_id uuid, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  g goals%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select * into g from goals where id = p_goal_id;

  if g.id is null or g.owner_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  if p_date is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_date');
  end if;

  -- ⚠️ **Een streefdatum begint niet in het verleden** (QS8-293). `mijn_datum()`
  --    en niet `current_date`: de grens is de dag van de gebruiker en niet die
  --    van de server, anders wordt iemand op UTC-10 geweigerd op zijn eigen
  --    vandaag.
  if p_date < mijn_datum() then
    return jsonb_build_object('ok', false, 'reason', 'datum_in_verleden');
  end if;

  -- ⚠️ Gekoppeld aan een groep? Dan loopt het via een verzoek. Dit is het punt
  --    waar het besluit van A7 wordt afgedwongen, en het is geen UI-regel.
  if exists (select 1 from goal_group_links l where l.goal_id = p_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'needs_group_approval');
  end if;

  -- ⚠️ En dit is de tak die de omweg dichtzet. Zonder haar is de regel hierboven
  --    een momentopname, en drie verzoeken zijn genoeg om er langs te lopen.
  --    Zie de kop: gemeten, niet vermoed.
  if g.losgekoppeld_op is not null and g.losgekoppeld_op > now() - interval '7 days' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'recent_ontkoppeld',
      'weer_toegestaan_op', (g.losgekoppeld_op + interval '7 days')
    );
  end if;

  -- ⚠️⚠️ **Een openstaande straf laat de deadline niet vooruit schuiven**
  --    (QS8-317). Zonder deze tak toetst `maak_straffen_verschuldigd()` een
  --    datum die de gestrafte zelf zet, en dan is domeinregel 11 leeg.
  --
  --    `p_date > g.target_date` en niet "er staat een straf": naar vóren halen
  --    maakt de straf eerder verschuldigd en is dus nooit een ontsnapping.
  --    `status = 'set'` en niet elke straf: alleen die stand kan de job nog
  --    omzetten, en vanaf `due` zet alleen een buddy hem terug (0177).
  --
  --    ⚠️ Ná `needs_group_approval`, want bij een gekoppeld doel bestaat de
  --    route via `vraag_deadline_verschuiving()` wél en hoort de gebruiker
  --    díé te lezen.
  if p_date > g.target_date and exists (
    select 1 from commitments c
    where c.goal_id = p_goal_id
      and c.type    = 'penalty'
      and c.status  = 'set'
      -- ⚠️ QS8-758 (0312): alleen een doelstraf houdt de streefdatum vast;
      --    een weekbelofte meet niet aan `target_date`.
      and c.periode_start is null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'straf_staat_open');
  end if;

  if p_date = g.target_date then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  update goals set target_date = p_date where id = p_goal_id;

  insert into goal_events (goal_id, actor_id, event_type, old_value, new_value)
  values (p_goal_id, auth.uid(), 'deadline_moved',
          jsonb_build_object('target_date', g.target_date),
          jsonb_build_object('target_date', p_date));

  return jsonb_build_object('ok', true, 'changed', true);
end;
$function$;

revoke all on function public.zet_streefdatum(uuid, date) from public, anon, authenticated;
grant execute on function public.zet_streefdatum(uuid, date) to authenticated;
