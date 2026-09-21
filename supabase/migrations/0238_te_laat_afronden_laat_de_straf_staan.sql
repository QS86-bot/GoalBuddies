-- 0238_te_laat_afronden_laat_de_straf_staan.sql — een straf volgt dezelfde
-- tijdigheidstoets als de beloning, zodat afronden ná de deadline geen uitweg
-- meer is (QS8-322, besluit van Quinten 08-09-2026).
--
-- ROLLBACK-PAD:
--   Herstel de drie objecten uit hun vorige definitie:
--     - `wikkel_commitments_af(uuid)` uit **0134** — de penalty-update buiten de
--       if/else, en een returnwaarde zonder `blijft_staan`;
--     - `maak_straffen_verschuldigd(uuid, date)` uit **0184** — mét de regel
--       `and g.status <> 'completed'`;
--     - policy `commitments_insert` uit 0172 — zonder de eis `g.status = 'active'`;
--     - `zet_doelstatus(uuid, boolean)` uit 0035 — zonder de weigering op een
--       afgerond doel.
--   Er verandert geen enkele kolom en geen enkele rij; terugdraaien is dus
--   `create or replace` plus `drop policy` / `create policy`, en verder niets.
--   Grants hoeven daarbij niet opnieuw uitgedeeld te worden — `create or
--   replace` laat ze staan, en de handtekening verandert niet. 📏 Nagemeten na
--   het toepassen: beide functies houden `postgres=X | service_role=X`, dus
--   `authenticated` erft niets. Zelfde redenering als de kop van 0184.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Gelezen uit `pg_get_functiondef('wikkel_commitments_af')`, dus uit wat er
--    draait en niet uit een bestand:
--
--      v_op_tijd := v_vandaag <= v_doel.target_date + 1;
--
--      if v_op_tijd then    reward   set → unlocked
--      else                 reward   set → cancelled
--      (buiten de if/else)  penalty  set → cancelled
--
--    De beloning hangt aan `v_op_tijd`, de straf niet. Te laat afronden kostte
--    dus je beloning en bespaarde je je straf — precies andersom dan domeinregel
--    11 belooft.
--
-- ---------------------------------------------------------------------------
-- Waarom dit drie wijzigingen zijn en geen één
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Alleen de tak verzetten repareert niets, en dat is gemeten.**
--    `rond_doel_af()` zet `goals.status = 'completed'` en roept dáárna
--    `wikkel_commitments_af()` aan; `maak_straffen_verschuldigd()` filtert op
--    `g.status <> 'completed'`. Laat je de straf op `set` staan zonder die
--    filter te herzien, dan pakt de job hem nooit meer op en staat er een straf
--    die eeuwig `set` blijft. Het issue waarschuwde er zelf voor; de meting
--    bevestigt het.
--
--    Vandaar §2. En daarom zet §1 de straf **niet** zelf op `due`: de job draagt
--    twee grendels die daar niet nog een keer nagebouwd moeten worden — het
--    wachtvenster van 24 uur (0171/0172) en het open deadline-verzoek
--    (0174/QS8-307). Een tweede kopie van die logica is precies hoe elke
--    definer-functie in dit project een kopie van de vorige werd.
--
-- ⚠️ **§3 sluit de enige deur die §2 anders openzet.** Zonder de filter op
--    `completed` gaat élke `set`-straf op een afgerond doel alsnog `due` zodra de
--    streefdatum passeert. Naast de late afronding is er precies één andere
--    manier om in die toestand te komen, en 📏 die is nagemeten als gewone
--    ingelogde eigenaar:
--
--      doel met status='completed' en target_date = current_date + 20
--      insert into commitments (... type='penalty' ...)   → GELUKT
--
--    `commitments_insert` toetste de eigenaar en de streefdatum, maar niet of
--    het doel nog lóópt. Dat was vandaag onschadelijk omdat zo'n straf toch
--    nergens heen kon; met §2 erbij is het een straf die verschuldigd wordt op
--    een doel dat al af is. Die deur gaat hier dicht, in dezelfde migratie,
--    omdat §2 hem opent.
--
-- ⚠️ **De respijtdag verandert niet.** `target_date + 1` staat er sinds 0173 en
--    blijft; dit gaat alleen over wat er ná die dag gebeurt.
--
-- ---------------------------------------------------------------------------
-- 1. De straf volgt de tijdigheidstoets
-- ---------------------------------------------------------------------------

create or replace function public.wikkel_commitments_af(p_goal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_doel        record;
  v_vandaag     date;
  v_op_tijd     boolean;
  v_vrij        integer := 0;
  v_verlopen    integer := 0;
  v_vervallen   integer := 0;
  v_blijft      integer := 0;
begin
  select g.id, g.target_date, g.status, g.owner_id
    into v_doel
    from goals g
   where g.id = p_goal_id;

  if v_doel.id is null then
    return jsonb_build_object(
      'vrijgespeeld', 0, 'verlopen', 0, 'vervallen', 0, 'blijft_staan', 0
    );
  end if;

  v_vandaag := coalesce(eigenaarsdatum(v_doel.owner_id), current_date);

  v_op_tijd := v_vandaag <= v_doel.target_date + 1;

  if v_op_tijd then
    update commitments
       set status = 'unlocked'
     where goal_id = p_goal_id and type = 'reward' and status = 'set';
    get diagnostics v_vrij = row_count;

    -- ⚠️ **Op tijd afgerond laat de straf vervallen, en dat blijft zo.** Dat is
    --    het besluit van 21-08-2026 dat in `rondDoelAf()` staat: afronden is de
    --    handeling die je straf laat vervallen. Wat er verandert is dat "te
    --    laat" niet meer meetelt als afronden.
    update commitments
       set status = 'cancelled'
     where goal_id = p_goal_id and type = 'penalty' and status = 'set';
    get diagnostics v_vervallen = row_count;
  else
    update commitments
       set status = 'cancelled'
     where goal_id = p_goal_id and type = 'reward' and status = 'set';
    get diagnostics v_verlopen = row_count;

    -- ⚠️ **Hier wordt niets geschreven, en dat is de hele reparatie.** De straf
    --    blijft op `set` staan en `maak_straffen_verschuldigd()` maakt hem
    --    verschuldigd zodra zijn eigen grendels dat toelaten. `v_blijft` telt
    --    alleen; het is wat het scherm de gebruiker moet vertellen, want een
    --    commitment device treedt nooit stilzwijgend in werking (domeinregel 5).
    select count(*) into v_blijft
      from commitments
     where goal_id = p_goal_id and type = 'penalty' and status = 'set';
  end if;

  return jsonb_build_object(
    'vrijgespeeld', v_vrij,
    'verlopen',     v_verlopen,
    'vervallen',    v_vervallen,
    'blijft_staan', v_blijft
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Een afgerond doel houdt de straf niet meer tegen
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De regel `and g.status <> 'completed'` is weg en niet vervangen.** Hij
--    deed twee dingen tegelijk: hij hield een straf tegen op een doel dat op
--    tijd af was — dat doet §1 nu zelf, door hem te annuleren — en hij hield hem
--    tegen op een doel dat te laat af was, wat precies het gat van dit issue is.
--    Een filter die twee gevallen dekt waarvan er één moet blijven en één weg
--    moet, is niet te versmallen: hij hoort weg, en de andere helft hoort waar
--    hij thuis is.

create or replace function public.maak_straffen_verschuldigd(p_owner_id uuid, p_vandaag date)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
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
     and g.target_date < p_vandaag
     and c.created_at < now() - interval '24 hours'
     and not exists (
       select 1
       from deadline_requests r
       where r.goal_id = g.id
         and r.status = 'open'
         and r.new_date >= p_vandaag
         and exists (
           select 1
           from group_members m
           where m.group_id = r.group_id
             and m.user_id <> r.requester_id
             and m.status <> 'inactive'
         )
         and g.target_date > p_vandaag - 7
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

-- ---------------------------------------------------------------------------
-- 3. Een straf hoort bij een doel dat nog loopt
-- ---------------------------------------------------------------------------

drop policy if exists commitments_insert on commitments;
create policy commitments_insert on commitments
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
          -- ⚠️ QS8-322 §3. Zie de kop: zonder deze regel wordt een straf op een
          --    afgerond doel verschuldigd zodra §2 de completed-filter loslaat.
          and g.status = 'active'
      )
    )
    and created_at between now() - interval '5 minutes' and now() + interval '5 minutes'
    and confirmed_at between now() - interval '5 minutes' and now() + interval '5 minutes'
  );

-- ---------------------------------------------------------------------------
-- 4. Een afgerond doel gaat niet meer open
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Dit is de achterdeur naast de voordeur die §1 dichtdeed, en hij komt
--    uit de security-ronde op deze branch.** Zelf nagemeten, als gewone
--    ingelogde eigenaar, in één transactie:
--
--      s1. rond_doel_af (5 dagen te laat)   straf=set   doel=completed   ← §1 werkt
--      s2. zet_doelstatus(doel, false)      {"ok": true}   doel=active
--      s3. rond_doel_af opnieuw             straf=cancelled
--
--    `zet_doelstatus()` schreef onvoorwaardelijk
--    `case when p_gearchiveerd then 'archived' else 'active' end` en keek nooit
--    naar de stand die er stond. Een afgerond doel ging daarmee weer open, en
--    dan is de tweede afronding "op tijd" zodra de streefdatum vooruit staat —
--    waarna §1 de straf alsnog annuleert via de op-tijd-tak.
--
-- ⚠️ **Waarom dit hier landt en geen eigen issue wordt.** Het is dezelfde
--    klasse als QS8-322 zelf — *afronden laat je straf vervallen terwijl de
--    afspraak niet gehaald is* — en het besluit van 08-09-2026 zegt dat een
--    bevinding van dezelfde klasse op de branch landt waar hij gevonden is.
--    Een issue ervan maken zou betekenen dat 0238 merget met een gat waar
--    precies zijn eigen belofte doorheen loopt.
--
-- ⚠️ **De weigering geldt in béide richtingen, en dat is met opzet ruimer dan
--    het lek.** Alleen het terughálen weigeren laat de route open via twee
--    stappen: een afgerond doel archiveren en het daarna uit het archief halen
--    levert `active` op. Zonder een kolom die onthoudt wat de vorige stand was,
--    is "een afgerond doel is af" de enige toets die beide dekt.
--
--    Dat is bovendien wat de app al belóófde: `bevestiging.doel_afronden.uitleg`
--    zegt met zoveel woorden *"Terugzetten kan niet"*, en `rond_doel_af()`
--    weigert zelf al met `already_completed`. De RPC sprak die belofte tegen.
--    Het scherm toont de archiveerkaart daarom niet meer op een afgerond doel.
--
-- ⚠️ **Archiveren en terughalen blijven verder ongemoeid**, want dat is waar
--    deze functie voor bestaat (QS8-32) — alleen een `completed` doel valt
--    erbuiten.

create or replace function public.zet_doelstatus(p_goal_id uuid, p_gearchiveerd boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
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

  -- ⚠️ Zie de kop, §4. Dezelfde reden als `rond_doel_af()` teruggeeft, zodat het
  --    scherm er één melding voor heeft en niet twee.
  if g.status = 'completed' then
    return jsonb_build_object('ok', false, 'reason', 'already_completed');
  end if;

  update goals
     set status = case when p_gearchiveerd then 'archived' else 'active' end
   where id = p_goal_id;

  return jsonb_build_object('ok', true);
end;
$$;
