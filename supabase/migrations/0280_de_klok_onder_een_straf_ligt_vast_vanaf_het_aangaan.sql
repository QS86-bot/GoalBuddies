-- 0280_de_klok_onder_een_straf_ligt_vast_vanaf_het_aangaan.sql —
-- `wikkel_commitments_af()` besliste over een straf met `eigenaarsdatum(owner)`,
-- en dat is de zone die de gestrafte zelf kan verzetten.
--
-- ROLLBACK-PAD:
--   drop trigger if exists commitments_zone on public.commitments;
--   drop function if exists public.bevries_commitmentzone();
--   alter table public.commitments drop column if exists tz;
--   Zet daarna `wikkel_commitments_af()` terug op de versie van 0238: één
--   `v_op_tijd` uit `eigenaarsdatum(v_doel.owner_id)`, voor beloningen én
--   straffen.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 **Gemeten op 16-09-2026 op de lokale stack.** `v_op_tijd` rekende met
--    `eigenaarsdatum(owner)` = `(now() at time zone profiles.tz)::date`, en `tz`
--    staat in de UPDATE-kolomgrant van `authenticated`. Een westelijke zone kocht
--    daarmee een extra dag: `v_op_tijd` bleef waar tot `target_date + 2`.
--
-- ⚠️⚠️ **Hier stond dat de spreiding over álle zones "op elk moment precies twee
--    datums" is en dus één extra dag — rechtgezet op 17-09-2026 (QS8-529).** De
--    offsets in `pg_timezone_names` lopen van −12:00 tot +14:00: 📏 **26 uur**
--    spreiding, en 26 past niet in 24. Van **10:00 tot 12:00 UTC** bestaan er
--    drie datums tegelijk, en in dat venster kocht een zonesprong **twee** dagen.
--    De meting van 16-09 klopte op haar moment en is opgeschreven als een
--    eigenschap van élk moment; de tegenmeting stond in dezelfde tabel. Dat deze
--    migratie de klok bevriest maakt de bovengrens onbelangrijk, maar de zin niet
--    juist — en de toets die haar bewaakte maakte CI twee uur per dag rood.
--
-- ⚠️⚠️ **"De bovengrens is onbelangrijk" geldt over deze migratie en niet over
--    de codebase** — nagemeten op 17-09-2026 (QS8-530). `eigenaarsdatum()` heeft
--    meer aanroepers dan `wikkel_commitments_af()`, en twee ervan lezen de
--    **levende** `profiles.tz`: de verlooppoort van `beslis_deadline_verzoek()`
--    (QS8-531) en het zevendaagse schild in `maak_straffen_verschuldigd()`
--    (QS8-533). Daar is het getal wél dragend, en daar is de klok níet bevroren.
--    Uitleg en de metingen in
--    `docs/decisions/2026-09-17-geen-gat-in-0280-is-niet-geen-gat.md`.
--
-- ⚠️ **Dit was geen nieuwe bug maar een nieuwe consequentie.** 0057 koos die
--    coulante toets bewust, met als motivering dat *"de fout zo altijd de goede
--    kant op valt — een beloning is iets dat je jezelf hebt beloofd"*. Dat
--    argument is geldig voor een **beloning** en draait om voor een **straf**,
--    want daar ís te mild de ontsnapping. Dezelfde klasse als wat 0172 met
--    `created_at` deed en 0184 met `target_date`: een consequentie ophangen aan
--    een getal dat de gestrafte zelf zet.
--
-- ⚠️⚠️ **Besluit van Quinten, 16-09-2026: de zone wordt bevroren bij het
--    aangaan.** Niet UTC, en niet laten staan. Dat is de enige van de drie
--    opties die níemands belofte verandert: je houdt precies de coulance die je
--    had toen je je vastlegde, en je kunt hem achteraf niet meer verschuiven.
--    UTC zou speling afnemen van wie in een oostelijke zone zit zonder dat hij
--    iets fout deed. Afweging in
--    `docs/decisions/2026-09-16-de-klok-die-de-gestrafte-zelf-zet.md`.
--
-- ⚠️ **De beloningstak blijft ongewijzigd**, en dat is met opzet: daar geldt het
--    argument van 0057 onverkort. Alleen de straf verhuist naar de bevroren
--    klok. Een migratie die allebei de takken verzet, verandert meer dan de
--    bevinding vraagt.
--
-- ---------------------------------------------------------------------------

alter table public.commitments
  add column if not exists tz text;

-- ⚠️ **Een trigger en geen kolomgrant.** `authenticated` INSERT rechtstreeks in
--    `commitments` (kolomgrant, geen RPC). Zou `tz` in die grant komen, dan mag
--    de gestrafte zijn eigen klok kiezen — precies wat deze migratie wegneemt.
--    De kolom staat daarom in géén enkele grant aan `authenticated`.
create or replace function public.bevries_commitmentzone()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tz text;
begin
  if tg_op = 'UPDATE' then
    -- ⚠️ `old.tz is not null` staat erbij, anders blokkeert deze grendel zijn
    --    eigen terugvulling verderop in deze migratie: daar gaat `null` naar
    --    een waarde, en dat is per definitie een wijziging.
    --
    -- ⚠️ Luid en niet stil terugzetten. Een zone die je stilzwijgend herstelt,
    --    laat de schrijver denken dat zijn wijziging gelukt is.
    if new.tz is distinct from old.tz and old.tz is not null then
      raise exception
        'De tijdzone van een commitment ligt vast vanaf het aangaan en is niet te wijzigen'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  select p.tz into v_tz
    from goals g
    join profiles p on p.id = g.owner_id
   where g.id = new.goal_id;

  -- ⚠️ `new.tz` staat vooraan, zodat een `pg_restore` zijn eigen zone terugzet
  --    in plaats van de zone van vandaag — de klasse uit DEPLOY.md §2.9a. De
  --    client komt hier niet langs, en dát is de grens: `tz` staat niet in zijn
  --    INSERT-kolomgrant. Deze regel is een gemak voor herstel, geen grendel.
  --
  -- ⚠️ `UTC` als laatste terugval en niet `null`: een straf zonder klok is een
  --    straf zonder grens, en dan valt de beslissing terug op precies de klok
  --    die de gestrafte zelf zet.
  new.tz := coalesce(new.tz, v_tz, 'UTC');
  return new;
end $function$;

drop trigger if exists commitments_zone on public.commitments;
create trigger commitments_zone
  before insert or update on public.commitments
  for each row execute function public.bevries_commitmentzone();

update public.commitments c
   set tz = coalesce(
         (select p.tz from goals g join profiles p on p.id = g.owner_id where g.id = c.goal_id),
         'UTC')
 where c.tz is null;

alter table public.commitments alter column tz set not null;

-- ---------------------------------------------------------------------------
-- De afwikkeling: de straf krijgt zijn eigen klok, de beloning houdt de oude
-- ---------------------------------------------------------------------------

create or replace function public.wikkel_commitments_af(p_goal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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

  -- De beloningsklok: ongewijzigd sinds 0057, met het argument van 0057.
  v_vandaag := coalesce(eigenaarsdatum(v_doel.owner_id), current_date);
  v_op_tijd := v_vandaag <= v_doel.target_date + 1;

  if v_op_tijd then
    update commitments
       set status = 'unlocked'
     where goal_id = p_goal_id and type = 'reward' and status = 'set';
    get diagnostics v_vrij = row_count;
  else
    update commitments
       set status = 'cancelled'
     where goal_id = p_goal_id and type = 'reward' and status = 'set';
    get diagnostics v_verlopen = row_count;
  end if;

  -- ⚠️ **De straf wordt per commitment beoordeeld, met de zone die bij het
  --    aangaan is vastgelegd.** Niet met `v_op_tijd` hierboven: die hangt aan de
  --    zone van vandaag, en dat is de klok die de gestrafte zelf zet.
  --
  -- ⚠️ **Op tijd afgerond laat de straf vervallen, en dat blijft zo.** Dat is
  --    het besluit van 21-08-2026 dat in `rondDoelAf()` staat: afronden is de
  --    handeling die je straf laat vervallen. Wat er verandert is uitsluitend
  --    wélke klok bepaalt of je op tijd was.
  update commitments c
     set status = 'cancelled'
   where c.goal_id = p_goal_id
     and c.type = 'penalty'
     and c.status = 'set'
     and (now() at time zone c.tz)::date <= v_doel.target_date + 1;
  get diagnostics v_vervallen = row_count;

  -- ⚠️ Wat blijft staan, blijft op `set` en wordt hier níet verschuldigd
  --    gemaakt. `maak_straffen_verschuldigd()` doet dat zodra zijn eigen
  --    grendels het toelaten; een commitment device treedt nooit stilzwijgend
  --    in werking (domeinregel 5). `v_blijft` telt alleen — het is wat het
  --    scherm de gebruiker moet vertellen.
  select count(*) into v_blijft
    from commitments
   where goal_id = p_goal_id and type = 'penalty' and status = 'set';

  return jsonb_build_object(
    'vrijgespeeld', v_vrij,
    'verlopen',     v_verlopen,
    'vervallen',    v_vervallen,
    'blijft_staan', v_blijft
  );
end;
$function$;

comment on function public.bevries_commitmentzone() is
  'Legt de tijdzone van een commitment vast bij het aangaan en houdt hem daarna '
  'onveranderlijk — de klok onder een straf mag niet van de gestrafte zijn (0280).';

revoke all on function public.bevries_commitmentzone() from public, anon, authenticated;
revoke all on function public.wikkel_commitments_af(uuid) from public, anon, authenticated;
grant execute on function public.wikkel_commitments_af(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- De zone is van de eigenaar en niet van de begunstigde groep
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **`commitments` is een groepszichtbaar oppervlak, en `tz` hoort er niet
--    bij.** `groepskolommen:controle` werd rood op deze migratie, en terecht:
--    `commitments_select` geeft leesrecht aan de begunstigde groep zodra een
--    straf `unlocked`, `due` of `resolved` is, en een tabelbrede SELECT laat die
--    groep dan élke nieuwe kolom meelezen. Een tijdzone is geen tegenslag, maar
--    hij is wél een nieuw ding dat de groep te zien krijgt zonder dat iemand dat
--    besloten heeft — en `CLAUDE.md` zegt dat het antwoord dan *beschermd* is.
--
-- ⚠️ **Een `revoke select (tz)` doet hier níets.** 📏 Gemeten: het recht zit
--    tabelbreed (`SELECT, REFERENCES` in `table_privileges`), en Postgres weigert
--    dan stilzwijgend een kolomgewijze intrekking. De enige vorm die werkt is het
--    tabelrecht intrekken en per kolom teruggeven — woordelijk de les die 0236
--    voor `goals` opschreef, en de reden dat die migratie zegt: *wie dat omdraait,
--    krijgt een migratie die groen draait en niets doet.*
--
-- ⚠️ De definer-functies hebben de grant niet nodig: `wikkel_commitments_af()`
--    draait als eigenaar en leest `c.tz` gewoon.
revoke select on public.commitments from public, anon, authenticated;

grant select (
  id,
  goal_id,
  type,
  body,
  image_url,
  beneficiary_group_id,
  beneficiary_user_id,
  status,
  confirmed_at,
  created_at
) on public.commitments to authenticated;
