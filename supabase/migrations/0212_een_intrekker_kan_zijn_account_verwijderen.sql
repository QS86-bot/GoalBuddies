-- 0212_een_intrekker_kan_zijn_account_verwijderen.sql — `approval_withdrawals
-- .approver_id` stond op NO ACTION en hield het profiel van de intrekker vast
-- (QS8-371)
--
-- ROLLBACK-PAD:
--   alter table public.approval_withdrawals
--     drop constraint approval_withdrawals_approver_id_fkey;
--   update public.approval_withdrawals set approver_id = '<een uuid>'
--    where approver_id is null;   -- alleen nodig als er al een leeg spoor staat
--   alter table public.approval_withdrawals alter column approver_id set not null;
--   alter table public.approval_withdrawals
--     add constraint approval_withdrawals_approver_id_fkey
--     foreign key (approver_id) references public.profiles (id);
--
--   En voor de tweede helft: zet `trek_goedkeuring_in()` terug op `<>` in plaats
--   van `is distinct from`. ⚠️ Dat zou de eigendomstoets weer openzetten zodra een
--   goedkeurder vertrekt — draai die helft dus niet terug zonder de reden te
--   kennen. Zie de meting hieronder.
--
--   ⚠️ Die middelste regel is het bewijs dat dit geen vrije terugweg is: zodra
--      één intrekker zijn account verwijderd heeft, staat er een `null` waar
--      `not null` weer op moet. Er is dan geen waarde om terug te zetten — de
--      persoon bestaat niet meer. Terugdraaien kan alleen zolang dat niet
--      gebeurd is.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Gevonden door de security-ronde op de branch van QS8-335 en daarna zelf
-- nagespeeld op `main`. **Ouder dan die branch** en er niet door veroorzaakt:
-- migratie 0030 declareert `approver_id uuid not null references profiles (id)`
-- zonder `on delete`-clausule, en dat is NO ACTION.
--
-- 📏 Gemeten, end-to-end tegen het schema van `main`: Alice keurt de week van Bob
--    goed, trekt dat weer in, en verwijdert daarna haar eigen account.
--
--      intrekken:   {"ok": true, "reverted": true}
--      verwijderen: ERROR: update or delete on table "profiles" violates foreign
--                   key constraint "approval_withdrawals_approver_id_fkey"
--                   CONTEXT: SQL statement "delete from auth.users where id = mij"
--
-- De twee andere foreign keys van die tabel cascaderen wél, maar ze wijzen naar
-- de voltooiing van **Bob** — die rijen blijven staan. Alleen de verwijzing naar
-- Alice als *intrekker* blokkeert. Wie ooit `trek_goedkeuring_in()` gebruikt
-- heeft, houdt dus een rij die zijn eigen profiel vasthoudt.
--
-- ⚠️ **Dat is een AVG-verplichting (art. 17) en dit is de enige route naar
--    accountverwijdering in de app.** `verwijderMijnAccount()` vangt de fout en
--    toont `auth.verwijder.mislukt`; er is geen tweede poging die wél werkt.
--
-- ---------------------------------------------------------------------------
-- Waarom `set null` en niet cascade of opruimen in de functie
-- ---------------------------------------------------------------------------
--
-- Het issue noemde drie richtingen.
--
-- **`on delete cascade`** haalt met de intrekker ook het bewijs weg *dát* er
-- ingetrokken is. Dat botst met domeinregel 6 — voltooiingen en hun correcties
-- zijn append-only — en het raakt Bob, die niets verkeerd deed.
--
-- **Opruimen in `verwijder_mijn_account()`** houdt het schema zoals het is en
-- verplaatst de kennis naar een functie. Dan loopt de volgende tabel met dezelfde
-- omissie er opnieuw tegenaan, en dat is precies wat hier gebeurd is: niets
-- bewaakte deze klasse.
--
-- **`on delete set null` op een nullable kolom**, en dat is wat hieronder staat.
-- 📏 Het is niet de uitzondering maar de regel in dit schema: van de 37 foreign
--    keys naar `profiles` stonden er 21 op cascade en 15 op set null — die
--    vijftien allemaal op een kolom die `null` toestaat, want een `set null` op
--    een `not null`-kolom blokkeert net zo hard als NO ACTION.
--    `approval_withdrawals.approver_id` was de enige op NO ACTION, en na deze
--    migratie zijn het er 21 en 16.
--
-- ⚠️ **En de directe buur doet het al zo:** `completion_approvals.approver_id`
--    staat op set null terwijl `subject_id` cascadeert. De goedkeuring zelf
--    overleeft het vertrek van de goedkeurder dus al zonder naam; de intrekking
--    ervan deed dat niet, en dat verschil was geen besluit maar een omissie.
--
-- ⚠️ **Wat de rij nog waard is zonder naam.** `approval_id`, `completion_id` en
--    `created_at` blijven staan, en dat is alles waar de zes lezers op steunen:
--    📏 `bevestigingsstand`, `openstaande_beoordelingen`, `trek_goedkeuring_in`,
--    `vastgelopen_goedkeuringen`, `verdien_badges` en `verwachte_weekdoelstatus`
--    vragen allemaal `where x.approval_id = …` of `x.completion_id = …`. Geen
--    enkele functie leest `approver_id` van deze tabel.
--
-- ⚠️ **De policy blijft kloppen, en de nul valt aan de goede kant.**
--    `approval_withdrawals_select` luidt `approver_id = auth.uid() or <eigenaar
--    van het doel>`. Met `approver_id is null` is de eerste tak `null` en dus
--    niet waar — de rij blijft zichtbaar voor Bob, de persoon die hij aangaat, en
--    niemand kan hem opeisen. Een `null` op de toesta-kant sluit; op de
--    weiger-kant zou hij openen. Hier is het de eerste.
--
-- ---------------------------------------------------------------------------
-- De tweede helft: dezelfde nul, aan de andere kant
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Gevonden in de security-ronde op déze branch, en het is een echte
--    bevinding.** Hierboven staat dat een `null` op de toesta-kant sluit. Dat
--    klopt voor `approval_withdrawals_select` — nagemeten: de doeleigenaar houdt
--    zijn rij, een ander groepslid ziet niets. Maar er is óók een weiger-kant, en
--    daar opent dezelfde nul.
--
-- `trek_goedkeuring_in()` toetst eigendom met `if a.approver_id <> auth.uid()`.
-- `a` komt uit `completion_approvals`, en díé `approver_id` staat al langer op
-- `on delete set null`. Zodra de goedkeurder zijn account verwijdert is de waarde
-- `null`, is `null <> auth.uid()` gelijk aan `null`, en slaat plpgsql de
-- `then`-tak over. De toets weigert dan niemand meer.
--
-- 📏 End-to-end gemeten, met Mallory als willekeurig ander actief lid van de
--    groep. Zij komt langs `not_yours`, langs de lidmaatschapstoets, langs het
--    venster en langs `already_withdrawn`. Waar ze strandt hangt af van deze
--    migratie:
--
--      vóór 0212   23502 null value in column "approver_id" of relation
--                  "approval_withdrawals"
--      na 0212     23502 null value in column "user_id" of relation
--                  "points_ledger"
--
-- ⚠️ **Er is vandaag geen toestandswijziging mogelijk** — beide keren blijft de
--    teller op nul intrekkingen. Maar 0212 haalt de eerste van twee muren weg, en
--    de muur die overblijft staat er om een heel andere reden: hij hoort bij de
--    puntenboeking en niet bij deze belofte. Wordt `points_ledger.user_id` ooit
--    nullable of verhuist die boeking, dan kan een willekeurig groepslid de
--    bevestigde week van een ander terugzetten naar `pending` — domeinregel 3 en
--    domeinregel 10.
--
-- **Daarom hoort de reparatie in déze migratie en niet in een volgende.** Het is
-- dezelfde nul: de kolom die hierboven nullable wordt en de vergelijking die er
-- niet tegen kan, zijn één besluit.
--
-- 📏 Alle definer-functies gescand op een `<>` tegen een persoonskolom: zestien
--    treffers, en dit is de enige waar de linkerkant nullable is. De andere
--    vergelijken met `group_members.user_id` of `completions.user_id`, allebei
--    `not null`.
--
-- ---------------------------------------------------------------------------

-- ⚠️ Idempotent langs de constraintnaam en niet langs `if exists` op de kolom:
--    de naam is wat 0030 uitdeelde en wat de rollback weer terugzet.
do $migratie$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.approval_withdrawals'::regclass
      and conname  = 'approval_withdrawals_approver_id_fkey'
      and confdeltype = 'a'
  ) then
    alter table public.approval_withdrawals
      drop constraint approval_withdrawals_approver_id_fkey;

    alter table public.approval_withdrawals
      alter column approver_id drop not null;

    alter table public.approval_withdrawals
      add constraint approval_withdrawals_approver_id_fkey
      foreign key (approver_id) references public.profiles (id) on delete set null;
  end if;
  -- ⚠️ **Een naconditie, want de guard hierboven kan stilzwijgend niets doen.**
  --    📏 Gemeten: hernoem de constraint en deze migratie draait met exitcode 0
  --    terwijl het schema onaangeroerd blijft op NO ACTION. De naam is
  --    deterministisch uit 0030, dus het risico is klein — maar een migratie die
  --    zwijgt als ze haar doel mist, is precies wat dit project elders met een
  --    grendel afvangt.
  if (
    select c.confdeltype
    from pg_constraint c
    where c.conrelid = 'public.approval_withdrawals'::regclass
      and c.conname  = 'approval_withdrawals_approver_id_fkey'
  ) is distinct from 'n'::"char" then
    raise exception 'approval_withdrawals.approver_id staat niet op ON DELETE SET NULL'
      using hint = '0212 heeft zijn doel niet bereikt. Staat de constraint onder een '
                   'andere naam? Kijk in pg_constraint voor conrelid '
                   '= approval_withdrawals::regclass.';
  end if;
end
$migratie$;

comment on column public.approval_withdrawals.approver_id is
  'Wie de goedkeuring introk. `null` zodra die persoon zijn account verwijderd '
  'heeft — QS8-371, en dezelfde behandeling als `completion_approvals.approver_id`. '
  'De intrekking zelf blijft staan: dat is bewijs voor de eigenaar van het doel '
  '(domeinregel 6, append-only). Geen enkele functie leest deze kolom; '
  '`approval_withdrawals_select` valt met een null terug op de eigenaar van het '
  'doel, wat de bedoelde lezer is.';

CREATE OR REPLACE FUNCTION public.trek_goedkeuring_in(p_approval_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- ⚠️⚠️ **`is distinct from` en niet `<>`, en dat is een reparatie** (QS8-371).
  --    `completion_approvals.approver_id` staat op `on delete set null`, dus zodra
  --    de goedkeurder zijn account verwijdert is dit `null`. `null <> auth.uid()`
  --    is `null` en niet `true`, dus plpgsql sloeg de `then`-tak over en deze
  --    eigendomstoets weigerde niemand meer.
  --
  -- 📏 Gemeten: Alice bevestigt de week van Bob en verwijdert haar account;
  --    Mallory, een willekeurig ander actief lid van de groep, komt daarna langs
  --    `not_yours`, langs de lidmaatschapstoets, langs het venster en langs
  --    `already_withdrawn`. Wat haar tegenhield was een `not null` in een ándere
  --    tabel — eerst `approval_withdrawals.approver_id`, en na 0212 nog alleen
  --    `points_ledger.user_id`. Een toevallige muur, geen slot.
  --
  -- ⚠️ **Dit is de weiger-kant.** Op de toesta-kant sluit een `null`; hier opent
  --    hij. Dezelfde nul, tegengestelde uitwerking, en dat verschil is de reden
  --    dat deze regel in dezelfde migratie hoort als de kolom die de nul mogelijk
  --    maakt.
  if a.approver_id is distinct from auth.uid() then
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
$function$
