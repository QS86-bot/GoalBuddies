-- 0275_de_trigger_op_goedkeuringen_toetst_ook_of_de_voltooiing_nog_de_actieve_is.sql
--   — de vierde clausule van `completion_approvals_insert` stond alleen in RLS.
--
-- ROLLBACK-PAD:
--   -- `fill_approval_subject()` terug naar de vorm van 0262 (drie clausules), en
--   -- `domeinregel3_bewaking()` terug naar de vorm van 0262 (zes takken).
--   -- Allebei staan ze daar voluit; deze migratie herdefinieert ze en dropt niets.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-503, uit de rij van 14-09-2026 in `docs/ENGINEER-REVIEW.md` — een
-- bevinding uit de review op QS8-480 die 0262 bewust liet liggen omdat hij die
-- migratie over twee beloftes zou laten gaan.
--
-- `completion_approvals_insert` eist vier dingen. De BEFORE-trigger van 0262
-- neemt er drie over:
--
--   | clausule                                      | policy | trigger (0262) |
--   |-----------------------------------------------|--------|----------------|
--   | goedkeurder is actief lid van de groep        | ja     | ja             |
--   | het doel is aan die groep gekoppeld           | ja     | ja             |
--   | niet je eigen voltooiing                      | ja     | ja             |
--   | **de voltooiing is nog de actieve**           | ja     | **nee**        |
--
-- 📏 Gemeten als tabeleigenaar, in een teruggedraaide transactie: een
--    goedkeuring op een **vervangen** voltooiing komt er gewoon in
--    (`INSERT 0 1`), terwijl dezelfde rij als `authenticated` door de policy
--    geweigerd wordt.
--
-- ---------------------------------------------------------------------------
-- Wat dat kost, en dat is niet wat de agendarij zegt
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De agendarij zei dat dit punten oplevert voor een week die al opnieuw
--    is ingediend. Dat is onwaar, en het is nagemeten.**
--    `award_points_on_approval()` begint met:
--
--      if c.superseded_by is not null then
--        return new;
--      end if;
--
--    📏 `points_ledger` blijft leeg. Het puntenpad heeft zijn eigen grendel.
--
-- ⚠️ **Maar er gebeurt wél iets, en dat stond nergens.** Dezelfde meting:
--
--      systeemberichten in de groep: …, completion_approved
--      badges:                       first_review
--      punten:                       (geen)
--
--    📏 `meld_goedkeuring()`, `risico_na_goedkeuring()` en
--    `badge_na_gebeurtenis()` noemen `superseded` geen van drieën. Er gaat dus
--    een `completion_approved`-systeembericht de groep in over een week die al
--    opnieuw ingediend is — en een systeembericht is een onveranderlijke kopie
--    die de autorisatie overleeft waaronder hij gemaakt is (beslisdocument 002
--    §3). Het gevolg is een groepszichtbaar oppervlak (domeinregel 7) plus een
--    badge, en niet het puntenmodel.
--
-- ⚠️ **Eén reparatie dekt alle drie.** Een BEFORE-trigger die werpt, houdt élke
--    AFTER-trigger tegen. De clausule hieronder hoeft dus niet in
--    `meld_goedkeuring()` en `badge_na_gebeurtenis()` herhaald te worden; dat
--    zou dezelfde regel op drie plekken zetten.
--
-- ---------------------------------------------------------------------------
-- Waarom de clausule in `toets_clausule2` hangt en niet los op INSERT
-- ---------------------------------------------------------------------------
--
-- 0262 heeft daar al een poort voor, met uitzonderingen die doordacht zijn:
--
--   INSERT                                        -> toetsen
--   het intrekken van een goedkeuring             -> niet toetsen
--     (`approver_id` van gevuld naar `null`, met dezelfde groep en voltooiing)
--   een UPDATE die groep, goedkeurder of
--     voltooiing verlegt                          -> toetsen
--
-- ⚠️⚠️ **Die middelste is hier geen detail maar de kern.** Een goedkeuring op
--    een voltooiing die later vervangen is, moet ingetrokken kunnen blijven
--    worden. Zou de vierde clausule óók op dat pad gelden, dan zit die
--    goedkeuring vast — en dat is woordelijk de klasse van QS8-371, waar wie
--    ooit een goedkeuring introk zijn account niet meer kon verwijderen.
--    QS8-456 hangt aan dezelfde tak.
--
-- ---------------------------------------------------------------------------
-- ⚠️ De prijs, en die is groter dan bij de andere drie clausules
-- ---------------------------------------------------------------------------
--
-- 📏 **Een legitieme goedkeuring op een vervangen voltooiing is geen randgeval
--    maar de gewone gang van zaken bij een quorum.** Nagemeten met een groep op
--    `approval_rule = 'quorum'`, `approval_quorum = 2`:
--
--      Bob keurt goed          -> weekstatus blijft `pending` (1 van 2)
--      Alice dient opnieuw in  -> dien_opnieuw_in() geeft {"ok": true}
--      resultaat               -> 1 legitieme goedkeuring op een
--                                 voltooiing met `superseded_by` gevuld
--
--    `dien_opnieuw_in()` weigert alleen bij `status = 'approved'`, en het ruimt
--    oude goedkeuringen niet op — dat hóórt ook niet, want voltooiingen en
--    goedkeuringen zijn append-only (domeinregel 6).
--
-- ⚠️⚠️ **Gevolg: een `pg_restore --data-only` van deze tabel weigert vanaf nu
--    ook die rijen.** Dat verbreedt de beperking die de rij van 14-09-2026 al
--    opschrijft — daar ging het om een goedkeurder die inmiddels `inactive` is,
--    zijn account opzegde, of een doel dat losgekoppeld is. Dit is een vierde
--    geval, en anders dan die drie is het niet zeldzaam.
--
--    Wat er **niet** verandert: een volledige `pg_restore` gaat goed, want
--    triggers zitten in de post-data-sectie en de data is er al als de trigger
--    ontstaat.
--
-- ⚠️ **Waarom dat de prijs waard is, en waarom het een afweging is en geen
--    vanzelfsprekendheid.** 0262 bestaat omdat RLS alleen de client afdekt; een
--    trigger die drie van de vier clausules afdwingt, wekt de indruk dat hij de
--    regel draagt. De asymmetrie zélf is het gevaar: wie deze trigger leest,
--    leest hem als "domeinregel 3 staat hier", en bouwt daarop. De restore-route
--    is een handeling van een mens met een dump ernaast; de trigger is de enige
--    grendel voor élke schrijver die morgen wordt toegevoegd.
--
--    📏 Vandaag schrijft geen enkele `security definer`-functie in
--    `completion_approvals`, dus de praktische winst is nul en de prijs ook.
--    Het verschil ontstaat bij de eerste die erbij komt.

begin;

-- ---------------------------------------------------------------------------
-- 1. De trigger
-- ---------------------------------------------------------------------------
--
-- ⚠️ Overgenomen uit `pg_get_functiondef()` en niet uit 0262, want de
--    gedeployde functie is de waarheid. De enige wijziging is het vierde blok
--    binnen `if toets_clausule2`.
create or replace function public.fill_approval_subject()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
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

    -- ⚠️ De vierde clausule, en hij staat binnen dezelfde poort als de twee
    --    hierboven: op INSERT en op een verlegging wél, bij het intrekken van
    --    een goedkeuring niet. Zie de kop voor waarom die middelste er is.
    --
    -- ⚠️ Een eigen melding en niet die van clausule 2. Ze zeggen iets anders:
    --    dit gaat niet over wíe mag goedkeuren maar over wélke voltooiing nog
    --    de actieve is, en een lezer die de verkeerde zin krijgt, zoekt in de
    --    verkeerde tabel.
    if exists (
      select 1
      from completions c
      where c.id = new.completion_id
        and c.superseded_by is not null
    ) then
      raise exception 'Deze voltooiing is vervangen door een nieuwere en is niet meer goed te keuren'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.fill_approval_subject() is
  'Vult subject_id en dwingt de vier clausules van completion_approvals_insert '
  'af buiten RLS om — QS8-480 (drie) en QS8-503 (de vierde: de voltooiing is '
  'nog de actieve). De vierde geldt niet bij het intrekken van een '
  'goedkeuring, anders zit een goedkeuring op een vervangen voltooiing vast.';

-- ---------------------------------------------------------------------------
-- 2. En de bewaking meldt het als ze weer uiteen lopen
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Zonder deze tak is de reparatie een momentopname.** `domeinregel3_bewaking()`
--    bestaat precies omdat de policy en de trigger uit elkaar kunnen lopen, en
--    hij had zes takken voor drie clausules. Een vierde clausule zonder zevende
--    tak herhaalt de fout die dit issue is.
create or replace function public.domeinregel3_bewaking()
-- ⚠️ De OUT-namen zijn `slot` en `ontbreekt` en niet iets leesbaarders:
--    `create or replace` kan een returntype niet wijzigen, en dat geldt ook
--    voor de namen van de OUT-parameters. Hernoemen vraagt een `drop` — en
--    die zou de grants meenemen. 📏 Gemeten: `cannot change return type of
--    existing function / Row type defined by OUT parameters is different`.
returns table (slot text, ontbreekt text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with romp as (
    select regexp_replace(
             regexp_replace(pg_get_functiondef(p.oid), '/\*.*?\*/', '', 'g'),
             '--[^\n]*', '', 'g') as tekst
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'fill_approval_subject'
  )

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

  select 'rls-superseded'::text,
         'completion_approvals_insert mist de clausule c.superseded_by is null'::text
  where not exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relname = 'completion_approvals'
      and p.polname = 'completion_approvals_insert'
      -- ⚠️ `ilike` en niet `like`. 📏 `pg_get_expr()` rendert deze clausule als
      --    `(c.superseded_by IS NULL)` — in hoofdletters — waar de clausule
      --    hierboven als `user_id <> auth.uid()` in kleine letters uit komt. Met
      --    `like` meldde deze tak dus de policy die er gewoon stond. De bewaking
      --    vond dat zelf, bij de eerste run na het schrijven.
      and public.zonder_initplan_hijs(pg_get_expr(p.polwithcheck, p.polrelid))
            ilike '%superseded_by is null%'
  )

  union all

  select 'constraint'::text,
         'completion_approvals_not_self bestaat niet meer'::text
  where not exists (
    select 1 from pg_constraint
    where conrelid = 'public.completion_approvals'::regclass
      and conname = 'completion_approvals_not_self'
      and contype = 'c'
  )

  union all

  select 'trigger'::text,
         'completion_approvals_subject ontbreekt, staat uit, wijst naar een andere '
         'functie, of vuurt niet meer op BEFORE INSERT OR UPDATE FOR EACH ROW'::text
  where not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.completion_approvals'::regclass
      and tgname = 'completion_approvals_subject'
      and tgenabled <> 'D'
      and tgfoid = 'public.fill_approval_subject()'::regprocedure
      and tgtype = 23
  )

  union all

  select 'eigenaar-fk'::text,
         'completion_approvals_subject_is_eigenaar bestaat niet meer'::text
  where not exists (
    select 1 from pg_constraint
    where conrelid = 'public.completion_approvals'::regclass
      and conname = 'completion_approvals_subject_is_eigenaar'
      and contype = 'f'
  )

  union all

  select 'clausule2-lidmaatschap'::text,
         'fill_approval_subject() toetst het lidmaatschap van de goedkeurder niet meer'::text
  where not exists (select 1 from romp where tekst ilike '%from group_members%')

  union all

  select 'clausule2-koppeling'::text,
         'fill_approval_subject() toetst de koppeling doel-groep niet meer'::text
  where not exists (select 1 from romp where tekst ilike '%join goal_group_links%')

  union all

  -- ⚠️ De zevende tak — QS8-503. Hij zoekt op `superseded_by is not null` en
  --    niet op het kale `superseded_by`, want dat laatste staat ook in een
  --    kolomlijst of een comment en dan meldt de bewaking niets terwijl de
  --    clausule weg is.
  select 'clausule4-actieve-voltooiing'::text,
         'fill_approval_subject() toetst niet meer of de voltooiing nog de actieve is'::text
  where not exists (select 1 from romp where tekst ilike '%superseded_by is not null%');
$$;

comment on function public.domeinregel3_bewaking() is
  'Meldt het zodra de policy, de constraint, de trigger of de vier clausules '
  'van domeinregel 3 uiteen lopen — QS8-480, uitgebreid met clausule 4 in '
  'QS8-503.';

commit;
