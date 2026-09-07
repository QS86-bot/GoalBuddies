-- 0175_een_verzoek_dat_niemand_kan_beslissen_is_geen_verzoek.sql — een deadline-verzoek in een groep van één is een schild dat niemand kan wegnemen (QS8-309)
--
-- ROLLBACK-PAD:
--   `create or replace` op `vraag_deadline_verschuiving()` zonder de
--   `geen_beslisser`-tak (definitie in 0170) en op
--   `maak_straffen_verschuldigd()` zonder de `beslisser`-voorwaarde in de
--   `not exists` (definitie in 0174).
--   ⚠️ Deze migratie voegt alleen weigeringen toe; er gaat bij een terugzet
--   niets verloren behalve de bescherming zelf.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- De security-ronde op QS8-307. `vraag_deadline_verschuiving()` eist dat je de
-- eigenaar van het doel bent, lid van de groep, en dat er een
-- `goal_group_links`-rij tussen die twee staat. Wat het niet eist is dat er in
-- die groep iémand is die het verzoek kán beslissen.
--
-- Een doel mag aan meerdere groepen hangen (QS8-56, PRD 5.5), en welke groep
-- over de streefdatum gaat kiest de eigenaar zelf — dat is een besluit en geen
-- omissie, zie `beslissendeGroep()` in `src/modules/buddies/deling.ts`. De
-- eigenaar kan dus een groep aanwijzen waar hij het enige lid van is.
--
-- Gemeten, als gewone `authenticated`-gebruikers, in één transactie:
--
--   A1 verzoek in soloclub | ok: true
--   A2 alice beslist zelf  | ok: false, reason: not_yourself
--   A3 bob beslist         | ok: false, reason: not_found
--   A4 bob ziet verzoeken  | 0
--
-- ⚠️ **Regel A2 is de kern, en hij is scherper dan "de begunstigde ziet het
--    niet".** `beslis_deadline_verzoek()` weigert de aanvrager met zoveel
--    woorden, dus in een groep van één is er per constructie niemand die het
--    verzoek kan beslissen. Zo'n verzoek is geen verzoek: het kan alleen
--    verlopen. De app accepteert het vandaag wel en zegt daarna dat je op je
--    groep wacht.
--
-- ⚠️ **En sinds 0174 is dat oppervlak dragend geworden.** Een open verzoek
--    houdt een straf tegen. Een verzoek dat niemand kan beslissen is daarmee
--    een schild dat niemand kan wegnemen — voor de begunstigde onzichtbaar, en
--    hij is niet eens lid van die groep. 0174 kapt de schade af op een week
--    (de grens hangt aan `goals.target_date`), maar binnen die week klopt het
--    niet.
--
-- ---------------------------------------------------------------------------
-- Twee plekken, en dat is de naad
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De toets bij het indienen is niet genoeg**, en dat is regel 18 vraag 1
--    in zijn zuiverste vorm: de twee onderdelen zijn allebei correct en de
--    toestand ertussen verandert. Een groep kan één lid worden nádat het
--    verzoek is ingediend — iemand vertrekt, wordt uitgezet of gaat op
--    `inactive`. Dan is het verzoek alsnog onbeslisbaar en houdt het alsnog een
--    straf tegen. Er staan daarom twee grendels:
--
--    1. `vraag_deadline_verschuiving()` weigert met `geen_beslisser`. Dat is
--       de eerlijke melding: het zegt de gebruiker meteen dat hier niemand is
--       die ja kan zeggen, in plaats van hem een week te laten wachten.
--    2. `maak_straffen_verschuldigd()` laat een verzoek alleen schild zijn
--       zolang er nog een beslisser ís. Die dekt de rijen die vóór deze
--       migratie zijn aangemaakt én het vertrek halverwege.
--
-- ⚠️ **`m.user_id <> r.requester_id` en niet `<> auth.uid()`** in de rollover:
--    die draait onder `service_role` en niet als de eigenaar. De aanvrager
--    staat in de rij zelf, en dat is ook de persoon die
--    `beslis_deadline_verzoek()` weigert.
--
-- ⚠️ **`status <> 'inactive'` en niet `= 'active'`**, want dat is precies wat
--    `beslis_deadline_verzoek()` toetst. Een lid op `paused` mag daar
--    beslissen, dus hier telt hij ook mee. Twee opvattingen over wie er mag
--    beslissen, is een naad die stilvalt zodra iemand er één bijwerkt.
--
-- ⚠️ Wat deze migratie **niet** oplost: wie alléén in een groep zit en zijn
--    doel eraan gekoppeld heeft, kan zijn streefdatum nu helemaal niet meer
--    verzetten — `zet_streefdatum()` weigert bij elk gekoppeld doel
--    (`needs_group_approval`, 0110) en een verzoek kan hij niet meer indienen.
--    Dat was vóór deze migratie ook zo, alleen liep het toen dood op een
--    verzoek dat eeuwig open bleef staan in plaats van op een melding. Het
--    staat als QS8-311.
--
-- ---------------------------------------------------------------------------

create or replace function vraag_deadline_verschuiving(
  p_goal_id uuid,
  p_group_id uuid,
  p_new_date date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  g        goals%rowtype;
  schoon   text := btrim(coalesce(p_reason, ''));
  nieuw    uuid;
  vandaag  integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select * into g from goals where id = p_goal_id;

  if g.id is null or g.owner_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  if not exists (
    select 1 from group_members m
    where m.group_id = p_group_id and m.user_id = auth.uid() and m.status <> 'inactive'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;

  if not exists (
    select 1 from goal_group_links l
    where l.goal_id = p_goal_id and l.group_id = p_group_id
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_linked');
  end if;

  -- ⚠️ **Is hier iemand die ja kan zeggen?** (QS8-309) `beslis_deadline_verzoek()`
  --    weigert de aanvrager met `not_yourself`, dus in een groep waar jij het
  --    enige actieve lid bent kan niemand dit verzoek beslissen — het kan
  --    alleen verlopen. Sinds 0174 houdt zo'n verzoek bovendien een straf
  --    tegen, en dan is het een schild dat niemand kan wegnemen.
  --
  -- ⚠️ Vóór de datum- en tekstcontroles: dit is een eigenschap van de groep en
  --    niet van wat je invult, dus het is eerlijker om het meteen te zeggen dan
  --    pas nadat iemand twintig tekens motivatie heeft getypt.
  if not exists (
    select 1 from group_members m
    where m.group_id = p_group_id
      and m.user_id <> auth.uid()
      and m.status <> 'inactive'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'geen_beslisser');
  end if;

  if p_new_date is null or p_new_date = g.target_date then
    return jsonb_build_object('ok', false, 'reason', 'bad_date');
  end if;

  -- ⚠️ **Een streefdatum begint niet in het verleden** (QS8-293). `mijn_datum()`
  --    en niet `current_date`: de grens is de dag van de gebruiker en niet die
  --    van de server, anders wordt iemand op UTC-10 geweigerd op zijn eigen
  --    vandaag.
  if p_new_date < mijn_datum() then
    return jsonb_build_object('ok', false, 'reason', 'datum_in_verleden');
  end if;

  if char_length(schoon) < 20 then
    return jsonb_build_object('ok', false, 'reason', 'reason_too_short');
  end if;

  if char_length(schoon) > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'reason_too_long');
  end if;

  if exists (
    select 1 from deadline_requests r where r.goal_id = p_goal_id and r.status = 'open'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_open');
  end if;

  select count(*) into vandaag
  from deadline_requests r
  where r.requester_id = auth.uid()
    and r.created_at > now() - interval '1 day';

  if vandaag >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  insert into deadline_requests
    (goal_id, group_id, requester_id, old_date, new_date, reason)
  values
    (p_goal_id, p_group_id, auth.uid(), g.target_date, p_new_date, schoon)
  returning id into nieuw;

  begin
    perform plaats_systeembericht(
      p_group_id,
      'deadline_requested',
      weergavenaam(auth.uid()) || ' vraagt de groep om een streefdatum te verschuiven.'
    );
  exception
    when others then
      raise warning 'Systeembericht deadline_requested is niet geplaatst: %', sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'request_id', nieuw);
end;
$$;

revoke all on function vraag_deadline_verschuiving(uuid, uuid, date, text) from public, anon, authenticated;
grant execute on function vraag_deadline_verschuiving(uuid, uuid, date, text) to authenticated;

create or replace function maak_straffen_verschuldigd(p_owner_id uuid, p_vandaag date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_aantal integer;
begin
  if p_owner_id is null or p_vandaag is null then
    return 0;
  end if;

  update commitments c
     set status = 'due'
    from goals g
   where g.id = c.goal_id
     and g.owner_id = p_owner_id
     and c.type = 'penalty'
     and c.status = 'set'
     and g.status <> 'completed'
     and g.target_date < p_vandaag
     -- ⚠️ **Serverklok, en met opzet niet `p_vandaag`.** Een straf die je
     --    vastlegt, gaat nooit binnen een dag af. Dat sluit de tz-route uit de
     --    kop van 0171 uit (de aanvaller moet weer een echte dag wachten) en
     --    het is de belofte die domeinregel 5 hier hoort te geven: er zit
     --    altijd een nacht tussen het vastleggen en het afgaan.
     and c.created_at < now() - interval '24 hours'
     -- ⚠️ **En niet zolang de groep er nog over gaat** (QS8-307). Een verzoek
     --    houdt de straf tegen zolang het alle drie de voorwaarden hieronder
     --    haalt; elk van die drie sluit een andere manier af om er eindeloos
     --    onder uit te komen. Zie de kop voor de metingen.
     and not exists (
       select 1
       from deadline_requests r
       where r.goal_id = g.id
         and r.status = 'open'
         and r.new_date >= p_vandaag
         -- ⚠️ **Is er nog iemand die dit verzoek kán beslissen?** (QS8-309)
         --    `beslis_deadline_verzoek()` weigert de aanvrager, dus in een
         --    groep waar hij het enige actieve lid is kan niemand ja zeggen —
         --    het verzoek kan alleen verlopen, en tot die tijd is het een
         --    schild dat niemand kan wegnemen.
         --
         -- ⚠️ **Ook hier en niet alleen bij het indienen**, want de toestand
         --    verandert ertussen: een groep kan één lid worden nádat het
         --    verzoek is ingediend. Deze tak dekt dat én de rijen die vóór
         --    0175 zijn aangemaakt. Regel 18 vraag 1 — twee correcte
         --    onderdelen, en de naad ertussen.
         --
         -- ⚠️ `<> r.requester_id` en niet `<> auth.uid()`: de rollover draait
         --    onder `service_role`. En `<> 'inactive'` en niet `= 'active'`,
         --    want dat is precies wat `beslis_deadline_verzoek()` toetst.
         and exists (
           select 1
           from group_members m
           where m.group_id = r.group_id
             and m.user_id <> r.requester_id
             and m.status <> 'inactive'
         )
         -- ⚠️ **De grens op het uitstel hangt aan de streefdatum en niet aan
         --    het verzoek.** Zie de kop: een eigenaar trekt zijn eigen verzoek
         --    in en dient meteen een nieuw in, dus een grens op
         --    `deadline_requests` verzet hij zelf. `goals.target_date` staat
         --    niet in de UPDATE-grant van `authenticated` en beweegt alleen
         --    met het akkoord van een buddy.
         --
         -- ⚠️ **Bínnen de `not exists` en niet ernaast**, en dat is geen
         --    stijlkeuze: ernaast zou het een voorwaarde op élke straf zijn en
         --    zou een deadline die langer dan een week voorbij is nooit meer
         --    tot een straf leiden — ook zonder dat er ooit een verzoek was.
         --    Hier zegt hij wat hij hoort te zeggen: het verzoek houdt de
         --    straf tegen zolang de deadline nog geen week voorbij is.
         and g.target_date > p_vandaag - 7
         -- ⚠️ **En een "nee" van de groep blijft een nee** (QS8-307, tweede
         --    security-ronde). Zonder deze voorwaarde dient de eigenaar na een
         --    afwijzing meteen een nieuw verzoek in en staat de straf weer
         --    stil: de groep doet precies wat de bedoeling is en houdt er
         --    niets aan over. Gemeten — zie de kop.
         --
         -- ⚠️ **Bínnen deze `not exists` en niet ernaast.** Ernaast is hij een
         --    tweede blokkade in plaats van een grens op de eerste, en dan
         --    houdt het níeuwe open verzoek de straf gewoon tegen — de
         --    afwijzing verandert dan niets. Met de hand gemeten: de test bleef
         --    op `set` staan waar hij `due` hoorde te zien.
         --
         -- ⚠️ **Op `old_date` en niet op een tijdstip**, want dat is exact en
         --    klokloos. `old_date` is bij het indienen gekopieerd uit
         --    `goals.target_date`, dus een afwijzing met
         --    `old_date = g.target_date` is een afwijzing van déze deadline.
         --    Wordt er later wél een verschuiving goedgekeurd, dan verspringt
         --    `target_date` en telt de oude afwijzing niet meer mee — precies
         --    goed, want dan gaat het over een andere datum.
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
$$;

revoke all on function maak_straffen_verschuldigd(uuid, date) from public, anon, authenticated;
