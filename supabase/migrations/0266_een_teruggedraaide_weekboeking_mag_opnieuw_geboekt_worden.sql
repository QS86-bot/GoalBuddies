-- 0266_een_teruggedraaide_weekboeking_mag_opnieuw_geboekt_worden.sql — een week die
-- na een ingetrokken goedkeuring alsnog door de termijn wordt goedgekeurd, levert
-- weer punten op in plaats van netto nul.
--
-- ROLLBACK-PAD:
--   ⚠️⚠️ **In één transactie en met ON_ERROR_STOP, en dat is geen stijlregel.**
--   📏 Gemeten in de security-ronde op dit issue: de drie statements los in psql
--   geplakt (autocommit, geen ON_ERROR_STOP) geeft `DROP INDEX` committed,
--   dán een unique violation op het opnieuw aanmaken, en dán `ALTER TABLE`
--   committed. Eindstand: `points_ledger` **zonder enige dedupe-index** en
--   zonder `ronde`. Vanaf dat moment is elke `on conflict do nothing` een
--   gewone insert en boekt élke herhaalde goedkeuring opnieuw uit — één
--   foutregel in de scrollback is het enige signaal.
--
--   STAP 0, en hij is verplicht: deze query moet leeg zijn.
--     select user_id, reason, ref_type, ref_id, count(*)
--     from points_ledger
--     where ref_id is not null and reason <> 'review_given'
--     group by 1,2,3,4 having count(*) > 1;
--
--   Geeft hij rijen, dan heeft de reparatie gewerkt en bestaan er meerdere
--   rondes. Wat daarmee moet gebeuren — de latere rondes weggooien (de eigenaar
--   verliest punten die hij verdiend heeft) of de rijen samenvoegen — is een
--   productbeslissing en hoort hier beantwoord te zijn vóór stap 1, niet als
--   unique violation naar boven te komen.
--
--   psql -v ON_ERROR_STOP=1 <<'SQL'
--   begin;
--     drop index if exists points_ledger_dedupe_idx;
--     create unique index points_ledger_dedupe_idx on public.points_ledger
--       (user_id, reason, ref_type, ref_id)
--       where ref_id is not null and reason <> 'review_given';
--     alter table public.points_ledger drop column if exists ronde;
--   commit;
--   SQL
--
--   En de drie functies terug naar hun vorm van vóór deze migratie:
--   `keur_vastgelopen_goedkeuringen_goed()` (0194), `award_points_on_approval()`
--   en `trek_goedkeuring_in()` — alle drie zonder rondebepaling.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten pad (QS8-456), een gewone volgorde en geen randgeval:
--
--   1. je buddy keurt je week goed        -> completion_approved_ceiling  +2
--   2. je buddy trekt het in              -> correction                   -2
--                                            weekly_goals.status -> pending
--   3. je buddy verlaat de groep
--   4. de termijn draait                  -> afgehandeld = 1
--                                            weekstatus -> approved
--                                            totaal punten -> 0
--
-- De week staat op `approved` en de eigenaar heeft er **netto nul punten** voor.
-- De +2-rij uit stap 1 bezet `points_ledger_dedupe_idx` op
-- `(user_id, reason, ref_type, ref_id)`, dus het `on conflict do nothing` in
-- `keur_vastgelopen_goedkeuringen_goed()` slikt de boeking van stap 4.
--
-- ---------------------------------------------------------------------------
-- Waarom "opnieuw uitbetalen" en niet "de week niet goedkeuren"
-- ---------------------------------------------------------------------------
--
-- Het issue laat beide open. De doorslag gaf een meting en niet een redenering:
-- 📏 `intrekvenster_minuten()` geeft **15**. Intrekken kan dus alleen binnen een
-- kwartier na goedkeuren.
--
-- ⚠️ **Een venster van vijftien minuten is een ongedaan-maken-knop en geen
--    oordeel.** Niemand herweegt andermans week veertien minuten later op de
--    inhoud en draait zichzelf terug; en gebeurt dat tóch, dan staat de week
--    weer op `pending` en kan elke groepsgenoot hem alsnog goedkeuren. Er is hier
--    dus geen menselijk oordeel dat een termijn zou overrulen — dat was het
--    argument vóór de andere optie, en het houdt geen stand.
--
-- ⚠️⚠️ **En de andere optie heeft een misbruikvorm die deze niet heeft.** Sluit
--    je een ingetrokken week permanent uit van de termijn, dan kost één misklik
--    plus een vertrekkende buddy de eigenaar zijn punten voorgoed — en dan is
--    goedkeuren-intrekken-vertrekken een manier om iemands week onbetaalbaar te
--    maken. De termijn bestaat juist voor "de eigenaar heeft het werk gedaan en
--    niemand keurde op tijd goed", en dat is precies deze situatie.
--
-- Zie `docs/decisions/2026-09-14-een-kwartier-is-een-ongedaanmaken-knop.md`.
--
-- ---------------------------------------------------------------------------
-- Wat dit NIET is
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Geen reparatie van QS8-454.** Die gaat over dezelfde index maar een andere
--    vraag: dat een week een vloer- **én** een plafondboeking kan dragen, omdat
--    `reason` in de sleutel zit. Die blijft hier onveranderd in de sleutel staan,
--    dus dat gat blijft precies zoals het was — dat is een eigen issue met een
--    eigen besluit over die sleutel. `ronde` staat die reparatie niet in de weg.
--
-- ⚠️ **Geen nieuw groepszichtbaar oppervlak.** `points_ledger` is eigenaar-only
--    (domeinregel 10) en `ronde` verandert daar niets aan.
--
-- ⚠️ **Geen herschrijving van geschiedenis.** De +2 en de −2 uit stap 1 en 2
--    blijven staan; er komt een rij bíj. Domeinregel 6, append-only.

-- ---------------------------------------------------------------------------
-- 1. De ronde
-- ---------------------------------------------------------------------------

-- ⚠️ **Wat `ronde` betekent: de hoeveelste keer deze (gebruiker, reden, ding)
--    geboekt is.** Ronde 1 is de normale boeking. Een hogere ronde bestaat
--    alleen doordat een eerdere ronde is teruggedraaid — de week zou anders niet
--    op `pending` staan en de termijn zou er niet aan toekomen.
--
-- ⚠️ Hij zit in de dedupe-sleutel en niet ernaast: binnen één ronde is dubbel
--    boeken nog steeds onmogelijk, en dát is waar die index voor bestaat.
alter table public.points_ledger
  add column if not exists ronde smallint not null default 1;

alter table public.points_ledger
  drop constraint if exists points_ledger_ronde_positief;
alter table public.points_ledger
  add constraint points_ledger_ronde_positief check (ronde >= 1);

comment on column public.points_ledger.ronde is
  'De hoeveelste boeking van deze (user_id, reason, ref_type, ref_id). Ronde 1 is '
  'normaal; hoger kan alleen nadat een eerdere ronde is teruggedraaid (QS8-456).';

drop index if exists points_ledger_dedupe_idx;

create unique index points_ledger_dedupe_idx
  on public.points_ledger (user_id, reason, ref_type, ref_id, ronde)
  where ref_id is not null and reason <> 'review_given';

-- ---------------------------------------------------------------------------
-- 2. De termijn boekt in de volgende ronde
-- ---------------------------------------------------------------------------

create or replace function public.keur_vastgelopen_goedkeuringen_goed(
  p_termijn_dagen integer default 7,
  p_owner_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rij      record;
  v_week     weekly_goals%rowtype;
  v_voltooid completions%rowtype;
  v_punten   integer;
  v_reden    text;
  v_ronde    smallint;
  v_aantal   integer := 0;
begin
  if p_termijn_dagen is null or p_termijn_dagen < 1 then
    raise exception 'p_termijn_dagen moet minstens 1 zijn, kreeg %', p_termijn_dagen;
  end if;

  -- ⚠️ **`vastgelopen_goedkeuringen()` is de enige definitie van "vastgelopen",
  --    en dat blijft zo.** Die functie spiegelt `te_beoordelen_voor()` met
  --    dezelfde vier voorwaarden; hier een eigen variant naast zetten is precies
  --    de tweede lijst die in 0032/0034 uit elkaar liep.
  for v_rij in
    select * from vastgelopen_goedkeuringen() v
    where p_owner_ids is null or v.owner_id = any (p_owner_ids)
  loop
    -- ⚠️ **De tak van 0147.** Wat de eigenaar zelf heeft gemaakt, wordt wél
    --    gemeld door `vastgelopen_goedkeuringen()` maar hier niet afgehandeld.
    continue when v_rij.beurt_bij_eigenaar;

    select * into v_voltooid from completions where id = v_rij.completion_id;

    -- De termijn loopt vanaf het indienen. Zie de kop van 0194.
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
    --
    -- ⚠️⚠️ **En dat is precies waarom het spoor níet in `reason` zit** — QS8-453.
    --    `reason` bepaalt de punten én zit in `points_ledger_dedupe_idx`; een
    --    eigen waarde hier zou de dedupe per ongeluk opheffen. Zie de kop.
    if v_voltooid.achieved_level = 'ceiling' then
      v_punten := v_week.points_ceiling;
      v_reden  := 'completion_approved_ceiling';
    else
      v_punten := v_week.points_floor;
      v_reden  := 'completion_approved_floor';
    end if;

    -- ⚠️⚠️ **De reparatie van QS8-456.** Stond hier `on conflict do nothing` met
    --    ronde 1, dan slikte de index de boeking zodra er ooit een goedkeuring
    --    voor deze week was die daarna is ingetrokken — en bleef de week
    --    `approved` met netto nul punten.
    --
    -- ⚠️ De hoogste ronde plus één, en niet "ronde 2": een week kan in theorie
    --    meer dan één keer goedgekeurd-en-ingetrokken zijn, en dan is 2 al bezet.
    --
    -- ⚠️ Twee termijnruns tegelijk komen allebei op dezelfde ronde uit; de unieke
    --    index laat er dan één door. Dat is de bedoeling en daarom blijft het
    --    `on conflict do nothing` eronder staan.
    select coalesce(max(p.ronde), 0) + 1 into v_ronde
    from points_ledger p
    where p.user_id  = v_rij.owner_id
      and p.reason   = v_reden
      and p.ref_type = 'weekly_goal'
      and p.ref_id   = v_week.id;

    update weekly_goals set status = 'approved' where id = v_week.id;

    -- ⚠️ `group_id` is `null` en dat is geen omissie: er ís geen groep meer, want
    --    dat is nu juist waarom deze week vastliep. De normale route boekt de
    --    groep van de beoordelaar; die bestaat hier per definitie niet.
    --
    -- ⚠️ `zonder_beoordelaar = true` is het spoor. Dit is de énige plek in het
    --    schema die hem op `true` zet; `award_points_on_approval()` laat de
    --    standaard `false` staan, en dat is de naad die
    --    `tests/rls/vastgelopen.test.ts` bewaakt.
    insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id, ronde, zonder_beoordelaar)
    values (v_rij.owner_id, v_week.goal_id, null, v_punten, v_reden, 'weekly_goal', v_week.id, v_ronde, true)
    on conflict do nothing;

    perform verdien_weekpassen(v_rij.owner_id, v_week.goal_id);
    perform herbereken_reeks(v_rij.owner_id, v_week.goal_id);

    v_aantal := v_aantal + 1;
  end loop;

  return v_aantal;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. De ronde geldt overal, en niet alleen op de termijn
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De eerste versie van deze migratie repareerde één van de twee routes,
--    en niet de waarschijnlijkste.** Gevonden in de security-ronde. 📏 Gemeten,
--    drie handelingen binnen een kwartier en zonder dat er iemand vertrekt of
--    een termijn verstrijkt:
--
--      1. a1 keurt de week goed          -> completion_approved_ceiling +2 (ronde 1)
--      2. a1 trekt in (misklik, <15 min) -> correction -2, week -> pending
--      3. a2, gewoon groepslid, keurt alsnog goed
--
--      week = approved, punten eigenaar = 0
--
--    `award_points_on_approval()` boekte impliciet ronde 1 en botste dus op de
--    rij uit stap 1. Dat is woordelijk de uitkomst die deze migratie zegt op te
--    lossen — en op déze route is er zelfs een échte peer-goedkeuring, dus het
--    argument om uit te betalen is hier sterker dan bij de termijn.
--
-- ⚠️ **En `trek_goedkeuring_in()` kon een tweede intrekking niet meer aan.**
--    📏 Gemeten: a2 die zijn eigen goedkeuring intrekt, botst met `23505` op
--    dezelfde index, en de `approval_withdrawals`-rij rolt mee terug.
--
-- De regel is dus: **de ronde geldt overal of nergens.** Alle drie de
-- schrijfpaden naar `points_ledger` die aan een week hangen, bepalen hem nu op
-- dezelfde manier.

CREATE OR REPLACE FUNCTION public.award_points_on_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c        completions%rowtype;
  w        weekly_goals%rowtype;
  g_owner  uuid;
  punten   integer;
  reden    text;
  v_ronde  smallint;
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

  -- ⚠️⚠️ **Dezelfde rondebepaling als de termijn, en dat is de reparatie van
  --  de security-ronde op QS8-456.** Zonder deze regels boekt deze trigger
  --  impliciet ronde 1, en dán botst hij op de rij van een góedkeuring die
  --  daarna is ingetrokken — 📏 gemeten: week `approved`, netto **nul**.
  --
  --  Dat is bovendien de wáárschijnlijkste vorm van deze bug: hier hoeft
  --  niemand de groep te verlaten en hoeft er geen week termijn te verstrijken,
  --  alleen een tweede groepsgenoot die alsnog goedkeurt.
  select coalesce(max(p.ronde), 0) + 1 into v_ronde
  from points_ledger p
  where p.user_id  = g_owner
    and p.reason   = reden
    and p.ref_type = 'weekly_goal'
    and p.ref_id   = w.id;

  insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id, ronde)
  values (g_owner, w.goal_id, new.group_id, punten, reden, 'weekly_goal', w.id, v_ronde)
  on conflict do nothing;

  perform verdien_weekpassen(g_owner, w.goal_id);

  perform herbereken_reeks(g_owner, w.goal_id);

  return new;
end;
$function$

;

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
  treffers integer;
  v_ronde  smallint;
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

  -- ⚠️⚠️ **Ook hier de ronde, en zonder haar kon een tweede intrekking niet.**
  --    📏 Gemeten in de security-ronde op QS8-456: keurt a1 goed en trekt hij in,
  --    keurt a2 daarna goed en wil hij ook intrekken, dan botste deze insert op
  --    `points_ledger_dedupe_idx` met `23505` — de RPC wierp, en de
  --    `approval_withdrawals`-rij rolde mee terug. Een databasefout op een
  --    ongedaan-maken-knop.
  select coalesce(max(p.ronde), 0) + 1 into v_ronde
  from points_ledger p
  where p.user_id  = g_owner
    and p.reason   = 'correction'
    and p.ref_type = 'weekly_goal'
    and p.ref_id   = w.id;

  insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id, ronde)
  values (g_owner, w.goal_id, a.group_id, -punten, 'correction', 'weekly_goal', w.id, v_ronde);

  perform herbereken_reeks(g_owner, w.goal_id);

  -- ⚠️⚠️ **Hier stond `and m.body = tekst`, en dat is met 0213 weg** (QS8-372).
  --    Deze functie bouwde de zin opnieuw op — `weergavenaam(approver) ||
  --    ' bevestigde de week van ' || weergavenaam(subject)` — en zocht het
  --    bericht daarmee terug. De zin wás het identificatiemiddel.
  --
  -- 📏 Dat werkte alleen doordat er een naam in stond en de zin dus toevallig
  --    uniek genoeg was. 0213 haalt de naam uit elke systeemberichtzin, en dan
  --    dragen twee bevestigingen van dezelfde beoordelaar voor dezelfde persoon
  --    in dezelfde groep exact dezelfde tekst. `treffers` wordt dan 2, de `if`
  --    slaat over, en er blijft een bericht staan dat zegt dat een week
  --    bevestigd is terwijl de bevestiging is ingetrokken.
  --
  -- ⚠️ **Een zin is geen sleutel.** Het bericht draagt sinds 0213 de
  --    `completion_id` in zijn `payload`, en dáár wordt op gezocht.
  --
  -- ⚠️⚠️ **Plus `actor_id`, en dat is een reparatie uit de security-ronde op deze
  --    branch.** De zin codeerde twee dingen: de voltooiing én de beoordelaar
  --    (zijn naam stond erin). `completion_id` codeert alleen het eerste, en
  --    `completion_approvals_one_vote` is `unique (completion_id, approver_id)` —
  --    bij een drempel boven één bevestigen dus meerdere mensen dezelfde
  --    voltooiing, en `meld_goedkeuring()` plaatst een bericht bij élke
  --    bevestiging die de drempel haalt.
  --
  -- 📏 Zonder `actor_id` gaat dat twee kanten op fout, allebei nagespeeld:
  --      * Alice trekt haar eigen bevestiging in en wist daarmee het bericht van
  --        Carol, wiens bevestiging gewoon geldig blijft. Dit draait als
  --        `security definer`, dus langs `chat_messages_delete` heen: een
  --        gebruiker wist een rij die aan een ander is toegeschreven.
  --      * Bij drie beoordelaars blijven na het intrekken twéé berichten staan
  --        die zeggen dat een week bevestigd is, terwijl de week op `pending`
  --        staat — precies de uitkomst die deze migratie zegt te repareren.
  --
  --    De sleutel is dus het paar, net als de zin dat was: `completion_id` uit
  --    `payload` én `actor_id`. Zie `completion_approvals_one_vote`.
  --
  -- ⚠️ De telling blijft staan en blijft `= 1` eisen: liever een bericht laten
  --    staan dan er twee weghalen. `treffers` is nu wel een bewering die kan
  --    kloppen in plaats van een die van de tekst afhangt.
  select count(*) into treffers
  from chat_messages m
  where m.group_id     = a.group_id
    and m.type         = 'system'
    and m.system_event = 'completion_approved'
    and m.payload->>'completion_id' = a.completion_id::text
    and m.actor_id     = a.approver_id
    and m.created_at  >= a.created_at;

  if treffers = 1 then
    delete from chat_messages m
    where m.group_id     = a.group_id
      and m.type         = 'system'
      and m.system_event = 'completion_approved'
      and m.payload->>'completion_id' = a.completion_id::text
      and m.actor_id     = a.approver_id
      and m.created_at  >= a.created_at;
  end if;

  return jsonb_build_object('ok', true, 'reverted', true);
end;
$function$

;
