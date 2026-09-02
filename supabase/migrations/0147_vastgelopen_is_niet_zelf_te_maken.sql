-- 0147_vastgelopen_is_niet_zelf_te_maken.sql — de auto-goedkeuring is niet meer
-- door de eigenaar zelf op te roepen (QS8-186)
--
-- ROLLBACK-PAD:
--   drop function if exists public.vastgelopen_goedkeuringen();  -- daarna 0109 opnieuw
--   drop trigger if exists group_members_beoordelaar_weg on public.group_members;
--   drop trigger if exists groups_beoordelaar_weg        on public.groups;
--   drop function if exists public.noteer_beoordelaar_weg_lid();
--   drop function if exists public.noteer_beoordelaar_weg_groep();
--   alter table public.goals drop column if exists beoordelaar_weggehaald_op;
--   grant insert on public.completions to authenticated;
--   -- plus `vastgelopen_goedkeuringen()` en `noteer_ontkoppeling()` uit 0109/0110.
--
--   ⚠️ Terugdraaien zet zes gemeten routes terug naar een goedgekeurde week met
--      punten en nul goedkeuringen. Doe het alleen als er iets kapotgaat dat
--      zwaarder weegt dan domeinregel 3.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Dossierrij van 17-08-2026, risico **Laag**, met als voorwaarde: *"wordt
-- zwaarder als een beslissing op de koppelstand gaat leunen."* Die voorwaarde is
-- nu **drie keer** ingetreden: 0064 (scoregat, gedicht in 0066), 0110
-- (`zet_streefdatum()`), en hier — bij de goedkeuring zelf.
--
-- `keur_vastgelopen_goedkeuringen_goed()` (0135) keurt een week waar niemand
-- meer op kan reageren na de termijn alsnog goed, mét punten. Dat is een
-- terechte uitzondering op domeinregel 3: wie geen buddy heeft, moet niet eeuwig
-- op `pending` blijven hangen.
--
-- ⚠️ **De onderbouwing onder die uitzondering was dat alle routes handelingen
--    van een ánder zijn.** `supabase/functions/rollover/index.ts` schrijft dat met
--    zoveel woorden op. Dat is op 01-09 weerlegd: in de standaardopstelling — je
--    maakt zélf een groep aan en bent daarmee `role = 'admin'` — zijn er zes
--    routes en zijn er vijf handelingen van de eigenaar.
--
-- **Alle zes nagespeeld op een opgebouwd schema**, elk met dezelfde uitkomst:
-- week `approved`, twee punten, **nul goedkeuringen van een buddy**.
--
--   1. ontkoppelen → afronden → de termijn uitzitten
--   2. **afronden → wachten of je buddy reageert → dán ontkoppelen.** Dit is de
--      natuurlijkere volgorde, en er is niet eens een wachttijd: `submitted_at`
--      is dan al ouder dan de termijn.
--   3. `submitted_at` zelf meesturen — de kolom stond in de INSERT-kolomgrant, en
--      de termijn wordt daaraan afgemeten. Nul dagen wachten.
--   4. één koppeling naar een zelfgemaakte lege groep laten staan
--   5. `archiveer_groep()` op je eigen groep
--   6. je enige beoordelaar op `inactive` zetten
--
-- ⚠️ **Een eerdere versie van deze migratie sloot alleen 1 en 3, met een venster
--    van zeven dagen tussen `losgekoppeld_op` en `submitted_at`.** Dat is bij de
--    security-review omvergehaald, en de les daaruit staat in de kop van sectie
--    2: zolang het oordeel op de tóestand leunt, is elke afgedichte route een
--    nieuwe lijst waar de volgende omheen loopt.
--
-- ---------------------------------------------------------------------------
-- 1. `submitted_at` is geen mededeling van de client
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De kolom houdt zijn default en verliest alleen het recht.** `now()` staat
--    er sinds 0004 op; niets in `src/` of `app/` stuurde hem ooit mee (gemeten
--    met de schrijfkant van `kolomrechten:controle`, QS8-258).
--
-- ⚠️ **Eerst de tabelbrede grant intrekken, en dat is geen omslachtigheid maar
--    de enige manier waarop het wérkt.** Een tabelrecht impliceert élke kolom —
--    ook een kolom die je er daarna uit probeert te halen. Gemeten: na een kale
--    `revoke insert (submitted_at)` gaf `has_column_privilege(…)` nog steeds
--    `true`. Dezelfde vorm als de `revoke ... from public, anon`-val uit
--    beveiligingsregel 4: het zíet eruit als dichtgezet en is het niet. 0043 en
--    0044 deden dit voor `weekly_goals` al goed.
--
-- ⚠️ **`superseded_by` gaat mee**: `src/modules/completions/api.ts` schrijft hem
--    nergens, en `dien_opnieuw_in()` is `security definer` en heeft het recht
--    niet nodig. **`id`** ook niet: PostgREST vult hem uit de default.
--    **`attachment_url`** blíjft er wél in staan — die hoort bij een bewijsregel
--    die in het schema bestaat; zie QS8-261.

revoke insert on public.completions from public, anon, authenticated;

grant insert (
  weekly_goal_id,
  user_id,
  achieved_level,
  note,
  attachment_url,
  cycle_start_date
) on public.completions to authenticated;

comment on column public.completions.submitted_at is
  'Wanneer deze voltooiing is ingediend. Zet de database, niet de client: '
  '`keur_vastgelopen_goedkeuringen_goed()` meet de termijn hieraan af, en een '
  'client die hem terugdateert keurt zijn eigen week meteen goed. Zie 0147.';

-- ---------------------------------------------------------------------------
-- 2. Eén stempel: wanneer de eigenaar zélf zijn beoordelaars weghaalde
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Niet de toestand maar de handeling, en dat is de hele les van deze ronde.**
--    De eerste versie vroeg *"is dit doel nu ontkoppeld?"* en werd langs vijf
--    kanten omzeild, want de eigenaar bestuurt die toestand. Deze versie vraagt
--    *"heeft de eigenaar zélf iets gedaan waardoor er niemand meer kan
--    beoordelen?"* — en dat is een gebeurtenis, geen stand.
--
-- ⚠️ **De stempels staan op de tábellen en niet in de functies.** Ontkoppelen kan
--    via `verlaat_groep()`, via `verwijder_doel()` en via een kale DELETE door de
--    eigenaar; een groep slapen leggen kan via `archiveer_groep()` en via
--    `slaap_stille_groepen()`. Drie plekken die hetzelfde moeten doen, is de
--    fout van de vier routes naar een weggepoetste week (0043–0046) en van 0110.
--
-- ⚠️ **`auth.uid()` is hier precies de goede toets, óók waar hij NULL is.**
--    `slaap_stille_groepen()` draait in de rollover onder `service_role` zonder
--    JWT, dus `auth.uid()` is NULL en er wordt niets gestempeld. Dat is juist:
--    een groep die vanzelf in slaap valt, is geen handeling van de eigenaar en
--    hoort de auto-goedkeuring níet te blokkeren.

alter table public.goals
  add column if not exists beoordelaar_weggehaald_op timestamptz;

comment on column public.goals.beoordelaar_weggehaald_op is
  'Wanneer de eigenaar zélf voor het laatst iets deed waardoor er niemand meer '
  'kon beoordelen: ontkoppelen, zijn eigen groep archiveren, of zijn enige '
  'beoordelaar op inactive zetten. Zie 0147. Wordt nooit gewist — een oude '
  'stempel is vanzelf onschadelijk, en wissen zou de volgende handeling de '
  'reparatie van de vorige maken.';

-- Route 1, 2 en 4 lopen alle drie langs het ontkoppelen.
-- ---------------------------------------------------------------------------
-- 2a. Stempelen is alleen eerlijk als er ook écht een beoordelaar wegviel
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Dit is de reparatie van de tweede reviewronde, en de bevinding was
--    terecht en vervelend.** De eerste versie stempelde bij élke handeling van
--    de eigenaar in een groep waar zijn doel aan hangt. Gemeten met een gewoon
--    scenario: je bent beheerder van je eigen groep met buddy B en lid C, je zet
--    C eruit omdat hij spamt, en B kan je week nog gewoon beoordelen.
--
--      C eruit                                    → {"ok": true}
--      stempel gezet terwijl B nog kan beoordelen → true
--      vastgelopen?                               → (nee)
--
--    Er was niets vastgelopen en er stond een stempel. En omdat de stempel
--    alleen vooruit schuift en `submitted_at` vaststaat, blijft hij waar: toen
--    B twee weken later **uit zichzelf** vertrok — precies de gebruiker
--    waarvoor 0135 gebouwd is — bleef de week op `pending` staan met nul punten.
--
-- **De reparatie: stempel alleen wanneer er ná de handeling niemand meer over
-- is die dit doel mag beoordelen.** Dat is dezelfde spiegel die
-- `vastgelopen_goedkeuringen()` gebruikt, en hij hoort op één plek te staan —
-- twee lijsten die hetzelfde horen te zeggen lopen uiteen (0032/0034).

create or replace function public.heeft_nog_beoordelaar(p_goal_id uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1
    from goal_group_links l
    join groups        gr on gr.id = l.group_id
    join group_members m  on m.group_id = l.group_id
    where l.goal_id  = p_goal_id
      and gr.status  = 'active'
      and m.status   = 'active'
      and m.user_id <> p_owner
  );
$$;

comment on function public.heeft_nog_beoordelaar(uuid, uuid) is
  'Is er na deze handeling nog iemand die dit doel mag beoordelen? De spiegel '
  'van vastgelopen_goedkeuringen(), zodat de drie stempeltriggers niet stempelen '
  'wanneer er niets wegviel.';

revoke all on function public.heeft_nog_beoordelaar(uuid, uuid) from public, anon, authenticated;

create or replace function public.noteer_ontkoppeling()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  update goals
     set losgekoppeld_op = now(),
         -- ⚠️ Alleen als de eigenaar het zelf doet én er niemand meer over is
         --    die dit doel mag beoordelen. `verlaat_groep()` van een ánder lid
         --    ontkoppelt diens eigen doelen, niet die van jou; en ontkoppelen
         --    van één groep terwijl een tweede groep nog beoordelaars heeft, is
         --    geen verlies (zie sectie 2a).
         beoordelaar_weggehaald_op =
           case
             when auth.uid() = owner_id and not heeft_nog_beoordelaar(id, owner_id)
               then now()
             else beoordelaar_weggehaald_op
           end
   where id = old.goal_id;

  return old;
end;
$$;

revoke all on function public.noteer_ontkoppeling() from public, anon, authenticated;

-- Route 5: je eigen groep archiveren of in slaap leggen.
create or replace function public.noteer_beoordelaar_weg_groep()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null or new.status = 'active' or old.status <> 'active' then
    return new;
  end if;

  update goals g
     set beoordelaar_weggehaald_op = now()
   where g.owner_id = auth.uid()
     and exists (select 1 from goal_group_links l
                  where l.goal_id = g.id and l.group_id = new.id)
     -- ⚠️ Zie sectie 2a: een tweede groep met actieve leden houdt het doel
     --    beoordeelbaar, en dan viel er niets weg.
     and not heeft_nog_beoordelaar(g.id, g.owner_id);

  return new;
end;
$$;

revoke all on function public.noteer_beoordelaar_weg_groep() from public, anon, authenticated;

drop trigger if exists groups_beoordelaar_weg on public.groups;
create trigger groups_beoordelaar_weg
  after update of status on public.groups
  for each row execute function public.noteer_beoordelaar_weg_groep();

-- Route 6: je enige beoordelaar op inactive zetten, of hem eruit gooien.
create or replace function public.noteer_beoordelaar_weg_lid()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_lid   uuid := coalesce(new.user_id, old.user_id);
  v_groep uuid := coalesce(new.group_id, old.group_id);
begin
  -- ⚠️ Een lid dat zichzelf terugtrekt is geen handeling van de doel-eigenaar.
  --    Die tak hóórt de auto-goedkeuring open te laten: dat is precies de
  --    gebruiker waar 0135 voor gebouwd is.
  if auth.uid() is null or auth.uid() = v_lid then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' and (new.status = 'active' or old.status <> 'active') then
    return new;
  end if;

  update goals g
     set beoordelaar_weggehaald_op = now()
   where g.owner_id = auth.uid()
     and exists (select 1 from goal_group_links l
                  where l.goal_id = g.id and l.group_id = v_groep)
     -- ⚠️ **De regel die de her-review afdwong** (sectie 2a). Zonder deze
     --    voorwaarde stempelt élke moderatiehandeling in je eigen groep al je
     --    doelen daar, ook wanneer je échte buddy nog gewoon kan beoordelen —
     --    en dat sluit de auto-goedkeuring blijvend voor een verlies dat later
     --    en buiten je schuld komt.
     and not heeft_nog_beoordelaar(g.id, g.owner_id);

  return coalesce(new, old);
end;
$$;

revoke all on function public.noteer_beoordelaar_weg_lid() from public, anon, authenticated;

drop trigger if exists group_members_beoordelaar_weg on public.group_members;
create trigger group_members_beoordelaar_weg
  after update or delete on public.group_members
  for each row execute function public.noteer_beoordelaar_weg_lid();

-- ---------------------------------------------------------------------------
-- 3. Eén conditie, en die dekt alle zes de routes
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`beoordelaar_weggehaald_op > submitted_at - interval '7 days'`**, en dat
--    is met opzet één regel in plaats van een venster per route. Uitgeschreven:
--
--    * **Handeling ná het indienen** (route 2, 5, 6, en 4 zodra de buddygroep
--      eraf gaat). De stempel ligt dan later dan `submitted_at`, dus de conditie
--      is waar. **En hij blijft waar**: elke volgende handeling schuift de
--      stempel alleen maar verder vooruit. Opnieuw koppelen en meteen weer
--      ontkoppelen — de truc die de vórige versie omverhaalde — werkt hier tégen
--      de eigenaar in plaats van vóór hem.
--    * **Handeling vlak vóór het indienen** (route 1). Beide stempels liggen dan
--      vast ten opzichte van elkáár, dus wachten helpt niet. Dat was de fout in
--      de eerste versie, die aan `now()` hing.
--    * **Handeling lang geleden.** Wie een half jaar terug zijn doel ontkoppelde
--      en sindsdien solo werkt, is een solo-gebruiker. Na zeven dagen telt de
--      stempel niet meer mee — dezelfde afkoeling die `zet_streefdatum()` sinds
--      0110 rekent, en om dezelfde reden.
--    * **Handeling van een ánder, of van niemand.** De buddy vertrekt zelf, een
--      andere beheerder archiveert, `slaap_stille_groepen()` doet zijn werk: dan
--      is er geen stempel en gaat de auto-goedkeuring gewoon door. Dat is de
--      belofte van QS8-178 en die blijft heel.
--
-- ⚠️ **En de eerlijke gebruiker loopt niet vast.** Blijft een voltooiing hierdoor
--    op `pending` staan, dan is de weg terug dat een buddy hem alsnog goedkeurt —
--    koppel het doel terug en hij verschijnt normaal in diens lijst. De rollover
--    laat `pending` met rust, dus er valt ook geen minpunt. Er gaat niets
--    verloren (domeinregel 6), er wordt alleen niets weggegeven.

-- ⚠️ **Eerst droppen, want er komt een kolom bij en `or replace` kan een
--    returntype niet wijzigen.** Dat is de uitzondering die onwrikbare regel 20
--    beschrijft. `keur_vastgelopen_goedkeuringen_goed()` roept hem aan en valt
--    hier niet over: plpgsql zoekt de functie pas op bij de eerste aanroep.
drop function if exists public.vastgelopen_goedkeuringen();

create function public.vastgelopen_goedkeuringen()
returns table (
  completion_id     uuid,
  goal_id           uuid,
  owner_id          uuid,
  cycle_start_date  date,
  reden             text,
  beurt_bij_eigenaar boolean
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    c.id,
    g.id,
    g.owner_id,
    c.cycle_start_date,
    case
      when not exists (select 1 from goal_group_links l where l.goal_id = g.id)
        then 'geen_koppeling'
      when not exists (
        select 1 from goal_group_links l
        join groups gr on gr.id = l.group_id
        where l.goal_id = g.id and gr.status = 'active'
      ) then 'geen_actieve_groep'
      -- ⚠️ **De vierde waarde, en die corrigeert een onwaarheid.** Vroeg een
      --    buddy om toelichting, of trok hij zijn goedkeuring in, dan telt hij
      --    hieronder als "heeft gestemd" en viel deze rij door naar
      --    `geen_beoordelaar` — terwijl er een actieve beoordelaar in een
      --    actieve groep zit die net iets terúg heeft gevraagd. Dat is geen
      --    verloren beoordelaar maar een beurt.
      when exists (
        select 1
        from completion_approvals a
        where a.completion_id = c.id
          and (
            a.status = 'more_info'
            or exists (
              select 1 from approval_withdrawals x where x.completion_id = c.id
            )
          )
      ) then 'wacht_op_indiener'
      else 'geen_beoordelaar'
    end,
    -- ⚠️ **Een kolom erbij en geen rij eruit, en dat is de correctie na de
    --    testsuite.** Deze functie is twee dingen tegelijk: het rapport van 0109
    --    (élke route waarlangs een week zijn beoordelaars kwijtraakt moet
    --    zíchtbaar worden, zodat route zeven opvalt) én de werklijst van 0135.
    --    Een eerdere versie van 0147 filterde de rij wég, en toen viel de halve
    --    suite van 0109 om — terecht: onzichtbaar maken is geen reparatie maar
    --    een tweede probleem. De rij blijft dus staan, met een vlag erbij, en
    --    `keur_vastgelopen_goedkeuringen_goed()` slaat hem over.
    (
      (
        g.beoordelaar_weggehaald_op is not null
        and c.submitted_at is not null
        and g.beoordelaar_weggehaald_op > c.submitted_at - interval '7 days'
      )
      -- ⚠️ **De tweede helft, en die dekt route 8 en 9.** `more_info` en een
      --    ingetrokken goedkeuring laten de rij van de beoordelaar stáán, en
      --    `completion_approvals_one_vote` staat één stem per beoordelaar toe.
      --    Die buddy kán dus niet nog eens stemmen; de weg vooruit is
      --    `dien_opnieuw_in()`, en dat is een handeling van de **eigenaar**.
      --    Zonder deze helft keurt de termijn precies dát af waar de eigenaar
      --    zelf niets mee deed — gemeten, allebei: week `approved`, punten
      --    geboekt, nul geldige goedkeuringen.
      --
      -- ⚠️⚠️ **`m.status = 'active'` is de reparatie van de tweede reviewronde,
      --    en zonder die regel hangt de eerlijke gebruiker voorgoed.** "De beurt
      --    ligt bij de eigenaar" klopt alleen zolang er íemand is die op zijn
      --    antwoord wacht. Vroeg je buddy om toelichting en verliet hij daarna
      --    de groep **uit zichzelf**, dan wachtte er niemand meer — en toch bleef
      --    de vlag staan. Gemeten: geen stempel (de eigenaar deed niets), reden
      --    `wacht_op_indiener`, rollover 0, week `pending`, nul punten, en dat
      --    bleef zo na zestig dagen. Dat is precies het geval waarvoor 0135
      --    bestaat. De beurt ligt dus bij de eigenaar zolang de vrager nog een
      --    **actief** lid is van een actieve groep waar dit doel aan hangt.
      --
      -- ⚠️ **`m.status = 'active'` is vandaag niet te breken, en dat staat hier
      --    in plaats van dat het verzwegen wordt.** `gr.status` wél: de test
      --    *"de buddy vroeg om toelichting en daarna viel de groep in slaap"*
      --    wordt rood zodra je die regel weghaalt. Voor `m.status` is er geen
      --    pad: `verlaat_groep()` **verwijdert** de rij (dan grijpt de join al
      --    mis), en de enige route die hem op `inactive` zet is
      --    `verwijder_lid()` door een beheerder — in de standaardopstelling de
      --    eigenaar zelf, en dan sluit de éérste helft van de vlag hem al.
      --    Er is geen functie om iemand anders tot beheerder te maken, dus een
      --    derde die de vrager deactiveert bestaat niet.
      --    **Wordt toetsbaar zodra er een pad is om een tweede beheerder aan te
      --    stellen** — schrijf dan de test die deze regel breekt. Tot die tijd
      --    is hij verdedigend en geen bewezen grendel (QS8-262, vraag 3).
      or exists (
        select 1
        from completion_approvals a
        join goal_group_links l  on l.goal_id   = g.id
        join groups           gr on gr.id       = l.group_id
        join group_members    m  on m.group_id  = l.group_id
                                and m.user_id   = a.approver_id
        where a.completion_id = c.id
          and gr.status = 'active'
          and m.status  = 'active'
          and (
            a.status = 'more_info'
            or exists (
              select 1 from approval_withdrawals x where x.approval_id = a.id
            )
          )
      )
    )
  from completions  c
  join weekly_goals w on w.id = c.weekly_goal_id
  join goals        g on g.id = w.goal_id
  where c.superseded_by is null
    and w.status = 'pending'
    -- ⚠️ De spiegel van `te_beoordelen_voor()`: bestaat er íémand voor wie die
    --    functie deze voltooiing zou teruggeven? Zo niet, dan ligt hij vast.
    --    Bewust dezelfde vier voorwaarden, want twee lijsten die hetzelfde
    --    horen te zeggen lopen uiteen — dat is de fout die 0032/0034 maakte.
    and not exists (
      select 1
      from goal_group_links l
      join groups        gr on gr.id = l.group_id
      join group_members m  on m.group_id = l.group_id
      where l.goal_id  = g.id
        and gr.status  = 'active'
        and m.status   = 'active'
        and m.user_id <> g.owner_id
        and not exists (
          select 1 from completion_approvals a
          where a.completion_id = c.id and a.approver_id = m.user_id
        )
    )
    ;
$$;

-- ⚠️ **En hier wordt de vlag pas een slot.** `vastgelopen_goedkeuringen()` blíjft
--    melden; deze functie handelt alleen niet af wat aan de eigenaar zelf ligt.
--    Zo houdt 0109 zijn zichtbaarheid en 0135 zijn belofte, zonder dat
--    domeinregel 3 een formaliteit wordt.
--
-- ⚠️ **Wat deze migratie wél en níet belooft — en dat verschil is met opzet
--    opgeschreven, want de eerste versie van deze kop beloofde te veel.** De
--    belofte is: *geen handeling van de eigenaar levert bínnen zeven dagen een
--    goedgekeurde week met punten op zonder goedkeuring van een buddy.* De
--    conditie is een **afkoeling en geen slot**: wie zijn doel ontkoppelt en
--    daarna zeven dagen niets doet, valt terug op het gedrag van 0135 en elke
--    volgende week keurt weer automatisch goed. Dat is het bewuste ontwerp uit
--    sectie 3 — wie al een half jaar solo werkt, ís een solo-gebruiker — maar
--    het is óók de prijs van het verlaten van de peer-goedkeuring, en die prijs
--    is zeven dagen. **Is dat te goedkoop, dan is dat een productbeslissing en
--    geen bug**; hij staat als vraag in `docs/ENGINEER-REVIEW.md`.

create or replace function public.keur_vastgelopen_goedkeuringen_goed(p_termijn_dagen integer DEFAULT 7)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $KVGG$
declare
  v_rij      record;
  v_week     weekly_goals%rowtype;
  v_voltooid completions%rowtype;
  v_punten   integer;
  v_reden    text;
  v_aantal   integer := 0;
begin
  if p_termijn_dagen is null or p_termijn_dagen < 1 then
    raise exception 'p_termijn_dagen moet minstens 1 zijn, kreeg %', p_termijn_dagen;
  end if;

  -- ⚠️ **`vastgelopen_goedkeuringen()` is de enige definitie van "vastgelopen",
  --    en dat blijft zo.** Die functie spiegelt `te_beoordelen_voor()` met
  --    dezelfde vier voorwaarden; hier een eigen variant naast zetten is precies
  --    de tweede lijst die in 0032/0034 uit elkaar liep.
  for v_rij in select * from vastgelopen_goedkeuringen() loop
    -- ⚠️ **De tak van 0147, en de énige regel die hier verandert.** De rest van
    --    deze functie is woordelijk die van 0135; overtypen zou een tweede lijst
    --    maken die uiteenloopt (0032/0034). Wat de eigenaar zelf heeft gemaakt,
    --    wordt wél gemeld door `vastgelopen_goedkeuringen()` maar hier niet
    --    afgehandeld.
    continue when v_rij.beurt_bij_eigenaar;

    select * into v_voltooid from completions where id = v_rij.completion_id;

    -- De termijn loopt vanaf het indienen. Zie de kop.
    continue when v_voltooid.submitted_at is null
              or v_voltooid.submitted_at > now() - make_interval(days => p_termijn_dagen);

    select * into v_week from weekly_goals where id = v_voltooid.weekly_goal_id;

    -- ⚠️ Alleen een week die nog écht wacht. `vastgelopen_goedkeuringen()` filtert
    --    daar al op, maar tussen die query en deze regel kan een goedkeuring
    --    binnenkomen; dan hoort deze functie niets meer te doen.
    continue when v_week.status is distinct from 'pending';

    -- ⚠️ **Dezelfde redenen en dezelfde volgorde als `award_points_on_approval()`.**
    --    Twee paden naar een goedgekeurde week met verschillende gevolgen is hoe
    --    het puntenmodel stil uit elkaar loopt; wat de trigger doet, doet dit ook.
    if v_voltooid.achieved_level = 'ceiling' then
      v_punten := v_week.points_ceiling;
      v_reden  := 'completion_approved_ceiling';
    else
      v_punten := v_week.points_floor;
      v_reden  := 'completion_approved_floor';
    end if;

    update weekly_goals set status = 'approved' where id = v_week.id;

    -- ⚠️ `group_id` is `null` en dat is geen omissie: er ís geen groep meer, want
    --    dat is nu juist waarom deze week vastliep. De normale route boekt de
    --    groep van de beoordelaar; die bestaat hier per definitie niet.
    insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id)
    values (v_rij.owner_id, v_week.goal_id, null, v_punten, v_reden, 'weekly_goal', v_week.id)
    on conflict do nothing;

    perform verdien_weekpassen(v_rij.owner_id, v_week.goal_id);
    perform herbereken_reeks(v_rij.owner_id, v_week.goal_id);

    v_aantal := v_aantal + 1;
  end loop;

  return v_aantal;
end;
$KVGG$;

revoke all on function public.keur_vastgelopen_goedkeuringen_goed(integer) from public, anon, authenticated;

-- ⚠️ **De grants opnieuw zetten, want de drop hierboven nam ze mee.** Een
--    `create function` zonder deze twee regels erft de default privileges van
--    `public` — en die deelt in Supabase élke nieuwe functie uit aan `anon`,
--    `authenticated` én `service_role` (beveiligingsregel 4). Deze functie noemt
--    per doel de eigenaar en zijn cyclusdatum; die hoort geen enkele client te
--    kunnen opvragen. Twee bestaande grendels werden hier meteen rood van
--    (`policies` en `functiegrants`) — precies waarvoor ze bestaan.
revoke all on function public.vastgelopen_goedkeuringen() from public, anon, authenticated;
grant execute on function public.vastgelopen_goedkeuringen() to service_role;

comment on function public.vastgelopen_goedkeuringen() is
  'Voltooiingen waar niemand meer op kan reageren. Sluit sinds 0147 een '
  'voltooiing uit waarvan de eigenaar de beoordelaars zélf heeft weggehaald — '
  'ontkoppelen, zijn eigen groep archiveren, zijn enige beoordelaar op inactive '
  'zetten. Vertrekt de buddy uit zichzelf, dan blijft de auto-goedkeuring van '
  '0135 gewoon werken; dat is de gebruiker waar hij voor bestaat.';
