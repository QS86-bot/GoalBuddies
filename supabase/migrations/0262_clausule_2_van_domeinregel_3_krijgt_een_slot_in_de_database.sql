-- 0262_clausule_2_van_domeinregel_3_krijgt_een_slot_in_de_database.sql —
-- domeinregel 3 heeft twee clausules; alleen de eerste had een slot buiten RLS.
--
-- ROLLBACK-PAD:
--   -- fill_approval_subject() terug naar de versie van 0002_functions_triggers.sql
--   -- domeinregel3_bewaking() terug naar de versie van 0122_auth_uid_een_keer_per_query.sql
--   (beide zijn `create or replace`; er wordt niets gedropt en geen kolom geraakt)
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- CLAUDE.md domeinregel 3: *"Alleen een lid van dezelfde buddy-groep mag een
-- voltooiing goedkeuren. Nooit jezelf. Afgedwongen in RLS **én** met een
-- database-constraint, niet alleen in de UI."*
--
-- 0252 sloot **clausule 1** — *nooit jezelf*, via het subject dat de eigenaar van
-- de voltooiing moet zijn. **Clausule 2** — *lid van dezelfde buddy-groep* —
-- stond er onveranderd, en die hangt volledig aan `completion_approvals_insert`.
--
-- 📏 **Gemeten op 14-09-2026 (QS8-480) tegen de lokale stack op 0261**, met de
--    trigger `completion_approvals_subject` uitgezet — de vraag is wat het
--    schéma zelf tegenhoudt:
--
--      A  goedkeurder is groepsgenoot (hoort te mogen)        -> TOEGELATEN
--      B  goedkeurder is geen lid van de groep                -> TOEGELATEN
--      C  group_id is een groep waar het doel niet aan hangt  -> TOEGELATEN
--      D  gelogen subject_id (clausule 1, controlemeting)     -> GEWEIGERD 23503
--
--    **D is het bewijs dat het instrument werkt.** Dezelfde opzet vángt clausule
--    1 en laat clausule 2 er langs allebei de kanten uit; zonder die vierde
--    meting zou "B en C worden toegelaten" net zo goed een kapotte fixture
--    kunnen zijn.
--
-- ⚠️ **C stond niet in de dossierrij en is de bredere van de twee.** De policy
--    eist dat de voltooiing via `goal_group_links` aan `group_id` hangt; het
--    schema vraagt daar niets over. Zonder die helft is "dezelfde buddy-groep"
--    geen grens maar een invulveld: je noemt een groep waar je toevallig in zit.
--
-- 📏 **Het dreigingsmodel is dat van 0252 zelf**, en het is nagemeten:
--    `completions` en `completion_approvals` staan allebei op
--    `relrowsecurity=true` maar `relforcerowsecurity=false` en zijn allebei van
--    `postgres`. Elke `security definer`-functie in dit project draait dus langs
--    de policies heen. 📏 Vandaag schrijft er **nul** functie in
--    `completion_approvals` — de hele schrijfweg is de client door RLS — dus dit
--    is een wachtende fout en geen open deur. Precies de reden dat hij nú dicht
--    moet: CLAUDE.md bij regel 19, *wat je uitstelt groeit mee met wat je erop
--    bouwt*.
--
-- ---------------------------------------------------------------------------
-- Waarom een trigger en geen foreign key — gemeten, niet beredeneerd
-- ---------------------------------------------------------------------------
--
-- De dossierrij stelde een foreign key naar `group_members` voor *"plus een
-- derde kolom"*. Twee dingen kloppen daar niet aan.
--
-- **De kolom bestaat al.** `completion_approvals.group_id` staat er sinds 0001,
-- `not null`, en `group_members` heeft `primary key (group_id, user_id)`. De
-- foreign key is dus niet alleen mogelijk, hij is goedkoop — en juist daarom
-- hoort hier te staan waarom hij toch fout is.
--
-- 📏 **Allebei de referentiële acties breken iets, nagemeten op 14-09-2026 met
--    de FK erin en een goedkeurder die de groep verlaat:**
--
--      on delete cascade   -> de goedkeuring verdwijnt: 1 -> 0 rijen
--      on delete restrict  -> het vertrek wordt geblokkeerd met 23503
--
--    `cascade` laat een week zijn goedkeuring stilzwijgend verliezen en sloopt
--    domeinregel 6 (append-only); `restrict` breekt 0102, dat met zoveel woorden
--    *"een vertrek is een handeling"* heet.
--
-- ⚠️ **De reden eronder is principieel en niet toevallig.** Lidmaatschap is
--    veránderlijk, en de belofte van clausule 2 is een feit van het **moment van
--    goedkeuren**: *deze goedkeuring is gegeven door een groepsgenoot*. Een
--    foreign key dwingt "geldt voor altijd" af, en dat is iets anders — en iets
--    strengers — dan wat domeinregel 3 belooft. Clausule 1 kón wél declaratief,
--    omdat het eigenaarschap van een voltooiing niet verschuift.
--
--    Een trigger toetst op precies het moment dat het feit waar moet zijn, en
--    vuurt óók in een `security definer`-functie. Volledige verantwoording in
--    `docs/decisions/2026-09-14-een-lidmaatschap-is-geen-foreign-key.md`. Dat is hier geen tweede net
--    over een bestaand net — het argument van 0252 (*"nog een trigger die
--    hetzelfde bewaakt maakt het net niet dichter, alleen dikker"*) ging over
--    clausule 1, waar al een trigger stond. Clausule 2 heeft er vandaag nul.
--
-- ⚠️ **Eén trigger en geen tweede.** `fill_approval_subject()` draait al
--    `before insert or update` op deze tabel en werpt er al voor clausule 1. Een
--    tweede trigger zou de volgordevraag introduceren en de tabel twee keer
--    laten lezen voor één rij. De naam onderschrijft de functie sindsdien — hij
--    vulde en bewaakte allang allebei — maar hernoemen kost een drop van de
--    trigger en een aanpassing van `domeinregel3_bewaking()`, en dat is meer
--    beweging dan winst.
--
-- ---------------------------------------------------------------------------
-- ⚠️⚠️ Eén melding voor allebei de helften — anders is het slot een orakel
-- ---------------------------------------------------------------------------
--
-- De eerste versie van deze migratie wierp twee verschillende teksten: één voor
-- het lidmaatschap en één voor de koppeling. Dat leek behulpzaam en was een
-- **lek**, gevonden door de security-ronde op QS8-480 en daarna zelf nagemeten.
--
-- Een BEFORE-trigger draait vóór de RLS `with check`, en hij toetst
-- `new.approver_id` — een waarde die de client zélf meestuurt. Dus:
--
-- 📏 Gemeten als `authenticated`, met een eigen voltooiing, een vreemde
--    `approver_id` en de `group_id` van een groep waar de aanvaller niet in zit:
--
--      controlemeting: select count(*) from group_members
--                      where group_id = <die groep>      -> 0 (RLS weigert)
--
--      is dat profiel lid van die groep?   -> "hoort niet bij de opgegeven groep"
--      is dat profiel géén lid?            -> "alleen een lid van dezelfde ..."
--
--    Twee antwoorden op een vraag die de policy `group_members_select` juist
--    afschermt. 📏 Met de functie van vóór 0262 teruggezet gaven **allebei** de
--    proeven letterlijk *"new row violates row-level security policy"* — het is
--    dus een regressie die deze migratie erbij maakte en geen bestaande stand.
--
-- ⚠️ En er zit geen rem op: `goedkeuringen_rem` en `begrens_goedkeuringen`
--    tellen rijen die er kómen. Een geweigerde probe schrijft niets en telt dus
--    niet mee voor een dagplafond.
--
-- ⚠️ **Dit project heeft precies deze afweging al een keer gemaakt**, in
--    `vraag_lidmaatschap_aan()`: *"Eén antwoord voor 'bestaat niet', 'is niet
--    ontdekbaar' en sinds QS8-232 ook 'er zit een blokkade tussen'. Drie
--    antwoorden zouden van deze functie een aftastinstrument maken."* Zelfde
--    afweging, dus dezelfde uitkomst: **één tekst en één errcode voor allebei de
--    helften.** Welke helft het was, staat in de tests en in dit bestand — niet
--    in wat de deur uit gaat. In `detail` of `hint` zetten is geen uitweg:
--    PostgREST geeft die mee.
--
-- 📏 Na de reparatie geven allebei de proeven `23514` met dezelfde tekst.
--
-- ---------------------------------------------------------------------------
-- 1. De trigger: clausule 2 erbij
-- ---------------------------------------------------------------------------

begin;

-- ⚠️ **Op UPDATE alleen hertoetsen als de rij naar een ánder lidmaatschap gaat
--    wijzen.** Dit is het punt waar deze trigger van een foreign key verschilt,
--    en het is geen detail: hertoetsen bij elke UPDATE zou precies het gedrag
--    van `on delete restrict` teruggeven — een goedkeuring die onaanraakbaar
--    wordt zodra de goedkeurder de groep verlaat. Wat hertoetst moet worden is
--    de bewéring, en die verandert alleen als `group_id` of `approver_id`
--    verandert.
--
-- ⚠️ `old` is bij een INSERT niet toegewezen, dus de vergelijking staat in een
--    aparte tak en niet in één `or`-expressie: PL/pgSQL evalueert die als één
--    SQL-uitdrukking en kort niet af.
--
-- ⚠️⚠️ **En een referentiële actie ís een UPDATE — dat kostte deze migratie
--    bijna het wisrecht.** 📏 Gemeten tijdens het bouwen, door
--    `tests/rls/opruiming.test.ts`: `completion_approvals.approver_id` staat op
--    `on delete set null`, dus `verwijder_mijn_account()` laat Postgres
--    `update only completion_approvals set approver_id = null` doen. Dat
--    verándert `approver_id`, dus de hertoets vuurde, keek naar een lidmaatschap
--    van `null` en wierp — en **niemand die ooit een goedkeuring gaf, kon nog
--    weg**. Precies de vorm van QS8-371, die ging over dezelfde kolom.
--
--    Daarom de `elsif`: een `approver_id` die op `null` gezet wordt is de
--    anonimisering van een vertrokken account en geen nieuwe bewering. Op een
--    INSERT blijft `null` wél weigeren — een goedkeuring zónder goedkeurder is
--    geen goedkeuring, en clausule 2 zou er anders langs kunnen.
--
--    ⚠️⚠️ **En die uitzondering beschrijft de vórm van de referentiële actie en
--    niet alleen zijn uitkomst**, want anders is hij zelf het gat: één UPDATE
--    die `approver_id` op `null` zet **en** tegelijk `group_id` verplaatst,
--    glipt er dan langs met precies de bewering die deze migratie wil toetsen.
--    Vandaar de drie voorwaarden samen: de kolom gaat van gevuld naar leeg, en
--    `group_id` blijft staan. Elke andere vorm loopt door de toets heen, en een
--    lege goedkeurder loopt daar stuk.
--
--    ⚠️ De twee takken die 0252 toevoegt vallen hier netjes buiten: een
--    `on update cascade` op `subject_id` raakt `group_id` noch `approver_id`, en
--    de `else`-tak toetst dan niets. Een tweede UPDATE op een al geanonimiseerde
--    rij ook niet — `null is distinct from null` is onwaar.
--
--    ⚠️ **De dossierrij van QS8-182 had deze klasse al één keer genoteerd**
--    (*"via een referentiële actie en niet via een functie of een policy, wat de
--    oude formulering niet kon zien"*), en hij ontsnapte hier alsnog aan het
--    ontwerp. Bij élke trigger die op UPDATE toetst is de vraag dus: welke
--    `on delete`/`on update`-acties schrijven in deze tabel, en wat zetten ze?
--
-- ⚠️ **`status <> 'inactive'` en niet `is_group_member()`.** Die helper leest
--    `auth.uid()`, en dat is hier juist de verkeerde vraag: een definer-functie
--    schrijft namens iemand anders, en de trigger moet naar `new.approver_id`
--    kijken. Zelfde toets, andere persoon.

create or replace function fill_approval_subject()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  owner uuid;
  toets_clausule2 boolean;
begin
  select c.user_id into owner
  from completions c
  where c.id = new.completion_id;

  if owner is null then
    raise exception 'Voltooiing % bestaat niet', new.completion_id;
  end if;

  -- Nooit de meegestuurde waarde vertrouwen.
  new.subject_id := owner;

  if new.approver_id = owner then
    raise exception 'Je kunt je eigen voltooiing niet goedkeuren';
  end if;

  if tg_op = 'INSERT' then
    toets_clausule2 := true;
  elsif new.approver_id is null
        and old.approver_id   is not null
        and new.group_id      is not distinct from old.group_id
        and new.completion_id is not distinct from old.completion_id then
    -- Precies de vorm van de referentiële actie: één kolom op null, de rest
    -- onaangeroerd. Een UPDATE die de goedkeuring óók verplaatst valt hier niet
    -- onder en gaat gewoon door de toets — waar een lege goedkeurder op stukloopt.
    toets_clausule2 := false;
  else
    toets_clausule2 := new.group_id      is distinct from old.group_id
                    or new.approver_id   is distinct from old.approver_id
                    or new.completion_id is distinct from old.completion_id;
  end if;

  if toets_clausule2 then
    if not exists (
      select 1
      from group_members m
      where m.group_id = new.group_id
        and m.user_id  = new.approver_id
        and m.status  <> 'inactive'
    ) then
      raise exception 'Alleen een lid van dezelfde buddy-groep mag deze voltooiing goedkeuren'
        using errcode = 'check_violation';
    end if;

    if not exists (
      select 1
      from completions c
      join weekly_goals w      on w.id = c.weekly_goal_id
      join goal_group_links l  on l.goal_id = w.goal_id
      where c.id       = new.completion_id
        and l.group_id = new.group_id
    ) then
      raise exception 'Alleen een lid van dezelfde buddy-groep mag deze voltooiing goedkeuren'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function fill_approval_subject() is
  'Domeinregel 3, allebei de clausules, buiten RLS om. Clausule 1: subject_id '
  'wordt onvoorwaardelijk op de eigenaar gezet en de eigenaar mag niet de '
  'goedkeurder zijn. Clausule 2: de goedkeurder is een niet-inactief lid van '
  'group_id, en het doel van de voltooiing hangt via goal_group_links aan die '
  'groep. Clausule 2 is een trigger en geen foreign key omdat lidmaatschap '
  'veranderlijk is en de belofte een feit van het moment van goedkeuren — '
  'QS8-480.';

-- ⚠️ De trigger zelf verandert niet en wordt met opzet niet opnieuw aangemaakt:
--    `create or replace function` houdt hem draaiend, en hem droppen zou een
--    venster openen waarin de tabel onbewaakt is.

-- ⚠️ De grants blijven zoals 0004 ze zette — `create or replace` raakt de ACL
--    niet. Hier voor de zekerheid opnieuw, in de huisvorm die CLAUDE.md eist:
--    `authenticated` wordt met zoveel woorden genoemd, want `alter default
--    privileges` deelt in `public` aan alle drie de rollen uit.
revoke all on function fill_approval_subject() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. De bewaking groeit van drie sloten naar zes
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Twee van de drie nieuwe sloten kijken naar het functielichaam, en dat is
--    een zwakker soort slot dan de andere vier.** QS8-182 schreef die blinde
--    vlek zelf op: staat de trigger er nog maar is zijn inhoud uitgehold, dan
--    meldt een structuurcontrole niets. Dit maakt die vlek kleiner, hij haalt
--    hem niet weg.
--
--    **Wat dit slot wél niet kan zien, opgeschreven in plaats van overschreeuwd:**
--    de knip `--[^\n]*` haalt commentaar weg, maar zou ook een `--` binnen een
--    stringliteral opeten en daarmee de rest van die regel. Vandaag staat er
--    geen `--` in een literal in dit lichaam; zet iemand er ooit een neer, dan
--    kan dit slot ten onrechte "ontbreekt" melden. Dat is de veilige richting —
--    vals alarm en geen stilte — en het is dezelfde klasse als de knip die in
--    QS8-412 een URL opat.
--
-- ⚠️ **Daarom is de gedragstest de echte grendel.** `tests/rls/domeinregel3.test.ts`
--    probeert B en C mét de trigger aan en langs RLS heen (`adminDb()` draait als
--    `service_role`, en die rol heeft BYPASSRLS — precies wat een definer-functie
--    doet). Die test is met geen enkel commentaar om de tuin te leiden.
--
-- ⚠️ **Slot 4 is een gat dat hier boven water kwam en niet in de opdracht stond:**
--    0252 zette een foreign key neer die clausule 1 draagt, en de bewaking die
--    naar de sloten van domeinregel 3 kijkt, noemde hem niet. Een slot dat
--    niemand telt, is een slot dat je stil kwijtraakt.

create or replace function public.domeinregel3_bewaking()
returns table (slot text, ontbreekt text)
language sql
stable
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
  with romp as (
    -- Eén knip, één keer — niet per slot een eigen kopie.
    --
    -- ⚠️ **Twee soorten commentaar en niet één.** De eerste versie knipte alleen
    --    `--` weg, en 📏 de security-ronde op QS8-480 hield slot 5 en 6 groen door
    --    het lichaam uit te hollen en de twee gezochte zinnen in een
    --    `/* … */`-blok te zetten. Dat is de **stille** richting van een te
    --    smalle knip; de kop hieronder redeneerde alleen over de vals-alarmkant.
    select regexp_replace(
             regexp_replace(pg_get_functiondef(p.oid), '/\*.*?\*/', '', 'g'),
             '--[^\n]*', '', 'g') as tekst
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'fill_approval_subject'
  )

  -- 1. De RLS-helft van clausule 1: de clausule die de eigenaar buiten de deur houdt.
  --    ⚠️ Door `zonder_initplan_hijs()` heen, zodat de vorm van 0122 hem niet
  --       ineens laat "ontbreken". De clausule zelf staat er onveranderd.
  select 'rls'::text,
         'completion_approvals_insert mist de clausule c.user_id <> auth.uid()'::text
  where not exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relname = 'completion_approvals'
      and p.polname = 'completion_approvals_insert'
      and public.zonder_initplan_hijs(pg_get_expr(p.polwithcheck, p.polrelid))
            like '%user_id <> auth.uid()%'
  )

  union all

  -- 2. De constraint-helft van clausule 1, op de gedenormaliseerde kolom.
  select 'constraint'::text,
         'completion_approvals_not_self bestaat niet meer'::text
  where not exists (
    select 1 from pg_constraint
    where conrelid = 'public.completion_approvals'::regclass
      and conname = 'completion_approvals_not_self'
      and contype = 'c'
  )

  union all

  -- 3. De trigger die die kolom vult. Zonder hem is de CHECK te omzeilen door
  --    een gelogen `subject_id` mee te sturen, en dan is slot 2 een sierhek.
  --
  -- ⚠️⚠️ **Dit slot toetste tot 0262 alleen de naam, en dat is drie keer te
  --    weinig.** 📏 De security-ronde op QS8-480 hield het groen met: de trigger
  --    uitzetten (`tgenabled = 'D'`), hem naar een lege functie laten wijzen, en
  --    hem opnieuw aanmaken als `before insert` **only** — die derde haalt
  --    precies de UPDATE-tak weg die 0262 zojuist geschreven heeft. Een naam is
  --    geen grendel.
  --
  --    `tgtype = 23` is `ROW|BEFORE|INSERT|UPDATE` (1|2|4|16). Een gelijkheid en
  --    geen masker: erbij komen is ook een verandering die iemand hoort te zien.
  select 'trigger'::text,
         'completion_approvals_subject ontbreekt, staat uit, wijst naar een andere '
         'functie, of vuurt niet meer op BEFORE INSERT OR UPDATE FOR EACH ROW'::text
  where not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.completion_approvals'::regclass
      and tgname = 'completion_approvals_subject'
      and not tgisinternal
      and tgenabled = 'O'
      and tgfoid = 'public.fill_approval_subject()'::regprocedure
      and tgtype = 23
  )

  union all

  -- 4. De declaratieve helft van clausule 1 (0252): het subject ís de eigenaar.
  --    Zonder deze foreign key wordt een `subject_id` die naar een dérde wijst
  --    weer toegelaten zodra de trigger wegvalt — 📏 gemeten in QS8-182.
  select 'eigenaar-fk'::text,
         'completion_approvals_subject_is_eigenaar bestaat niet meer'::text
  where not exists (
    select 1 from pg_constraint
    where conrelid = 'public.completion_approvals'::regclass
      and conname = 'completion_approvals_subject_is_eigenaar'
      and contype = 'f'
  )

  union all

  -- 5. Clausule 2, eerste helft: de goedkeurder is lid van de groep.
  select 'clausule2-lidmaatschap'::text,
         'fill_approval_subject() toetst het lidmaatschap van de goedkeurder niet meer'::text
  where not exists (select 1 from romp where tekst ilike '%from group_members%')

  union all

  -- 6. Clausule 2, tweede helft: de voltooiing hoort bij díe groep.
  select 'clausule2-koppeling'::text,
         'fill_approval_subject() toetst de koppeling doel-groep niet meer'::text
  where not exists (select 1 from romp where tekst ilike '%join goal_group_links%');
$$;

comment on function public.domeinregel3_bewaking() is
  'De zes sloten op peer-goedkeuring. Clausule 1 (nooit jezelf): de RLS-clausule, '
  'de CHECK not_self, de trigger die subject_id vult, en de foreign key van 0252. '
  'Clausule 2 (alleen een groepsgenoot): het lidmaatschap en de koppeling '
  'doel-groep, allebei in het lichaam van fill_approval_subject(). Die laatste '
  'twee kijken naar tekst en niet naar de catalogus — de gedragstests in '
  'tests/rls/domeinregel3.test.ts zijn daar de echte grendel. QS8-480.';

revoke all on function public.domeinregel3_bewaking() from public, anon, authenticated;
grant execute on function public.domeinregel3_bewaking() to service_role;

commit;
