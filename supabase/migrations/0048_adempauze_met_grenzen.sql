-- 0048_adempauze_met_grenzen.sql — QS8-82 (EPIC 8)
--
-- ROLLBACK-PAD:
--   drop function if exists plan_adempauze(uuid, date, date);
--   drop function if exists annuleer_adempauze(uuid);
--   grant insert, update, delete on public.breathers to authenticated;
--   create policy breathers_write on public.breathers for all to authenticated
--     using (user_id = auth.uid()) with check (user_id = auth.uid());
--
-- ⚠️ Waarom deze migratie bestaat. De tabel `breathers` staat er sinds 0001 en de
--    rollover gebruikt hem al: loopt er een adempauze over een cyclus, dan krijgt
--    het weekdoel `excused` in plaats van `missed` en wordt het minpunt niet
--    geboekt. Wat ontbrak was de **invoerkant**, en die was helemaal open:
--    `breathers_write` stond op `user_id = auth.uid()` en verder niets. Geen
--    CHECK, geen index die overlap tegenhoudt, geen bovengrens.
--
--    Met een gewoon API-verzoek kon je dus een adempauze van tien jaar over al je
--    doelen leggen en nooit meer een minpunt krijgen. Dat is exact het patroon
--    van A35: de regel stond in de issue ("maximaal twee cycli") en nergens in de
--    database.
--
-- ⚠️ **Eén ding is strenger dan QS8-82 letterlijk vraagt, en dat is met opzet.**
--    De issue zegt "vooraf aangekondigd". Deze functie eist dat de adempauze in
--    een cyclus begint die **nog niet begonnen is**. Mocht hij ook over de
--    lopende cyclus mogen, dan is dit op zondagavond een gratis uitweg uit het
--    minpunt: je weet dat je je week niet haalt, je kondigt een adempauze aan, en
--    de rollover zet je weekdoel op `excused` in plaats van `missed`.
--
--    Dat is dezelfde ontsnapping als A39 (doorschuiven vóórdat de job langskomt)
--    en A40 (wissen vóór de rollover), en die hebben samen vier migraties gekost.
--    Praktisch gevolg dat Quinten moet weten: "ik ben nu ziek" kan niet met
--    terugwerkende kracht — je plant hem voor de week die komt. Wil je dat
--    anders, dan is dat een besluit over wat een reeks betekent, en dat is niet
--    aan mij.
--
-- ⚠️ De datums moeten écht cyclusstarts zijn. Daarom de toets op de weekdag
--    tegen `profiles.week_start_day`. Zonder die controle kun je een adempauze
--    van woensdag tot woensdag leggen en dekt hij twee halve cycli in plaats van
--    twee hele — en dan verschilt wat de rollover doet van wat het scherm toont.
--
--    ⚠️ Hier wordt bewust géén cyclus uitgerekend in SQL. Dat zou een tweede
--       kopie van `shared/time` zijn, en twee kopieën zijn in dit project al een
--       keer geruisloos uit elkaar gelopen (zie `weekpas_maximum()`, A32). De
--       client rékent de cyclus uit; deze functie controleert alleen dat wat er
--       binnenkomt een geldige cyclusstart vóór hem is.
--
-- ⚠️ Geeft een resultaat terug in plaats van te gooien. In een SECURITY
--    DEFINER-RPC overleeft niets een `raise exception` — PostgREST draait elke
--    RPC in zijn eigen transactie en rolt hem volledig terug (de les van 0017).

begin;

-- ---------------------------------------------------------------------------
-- 1. Het tabelrecht eraf: de RPC wordt de enige weg naar binnen
-- ---------------------------------------------------------------------------
--
-- ⚠️ Nagelopen vóór het intrekken (valkuil: een ingetrokken recht breekt de app
--    stil, en typecheck en lint blijven groen): er is vandaag geen enkele
--    `.insert(`, `.update(` of `.delete(` op `breathers` in `src/`, `app/` of
--    `tests/`. De rollover draait als `service_role` en raakt de tabel alleen
--    lezend. SELECT blijft dus staan — dat is de aankondiging aan de groep.

drop policy if exists breathers_write on public.breathers;

revoke insert, update, delete on public.breathers from authenticated;

-- ---------------------------------------------------------------------------
-- 2. Overlap onmogelijk maken
-- ---------------------------------------------------------------------------
--
-- Twee adempauzes over dezelfde cyclus op hetzelfde doel is geen geldige
-- toestand: de rollover pakt er dan willekeurig één en het maximum van twee
-- cycli is te omzeilen door er drie naast elkaar te leggen.

create unique index if not exists breathers_geen_dubbele_start
  on public.breathers (user_id, goal_id, starts_cycle);

-- ---------------------------------------------------------------------------
-- 3. De grenzen als constraint, niet alleen in de functie
-- ---------------------------------------------------------------------------
--
-- ⚠️ Dubbel met de controles in `plan_adempauze()`, en dat is de bedoeling. De
--    functie geeft een bruikbare reden terug; de constraint is wat er overblijft
--    als iemand ooit een tweede schrijfpad maakt. `service_role` komt hier ook
--    langs, dus de rollover kan de regel niet per ongeluk breken.

alter table public.breathers drop constraint if exists breathers_hoogstens_twee_cycli;
alter table public.breathers add constraint breathers_hoogstens_twee_cycli
  check (ends_cycle >= starts_cycle and ends_cycle <= starts_cycle + 7);

alter table public.breathers drop constraint if exists breathers_hele_cycli;
alter table public.breathers add constraint breathers_hele_cycli
  check ((ends_cycle - starts_cycle) % 7 = 0);

-- ---------------------------------------------------------------------------
-- 4. Plannen
-- ---------------------------------------------------------------------------

create or replace function public.plan_adempauze(
  p_goal_id       uuid,
  p_starts_cycle  date,
  p_ends_cycle    date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid        uuid := auth.uid();
  v_tz         text;
  v_startdag   smallint;
  v_vandaag    date;
  v_id         uuid;
begin
  -- ⚠️ De NULL-controle staat vooraan en niet impliciet in een vergelijking.
  --    `x = auth.uid()` met een lege `auth.uid()` is geen bewering maar een
  --    derde antwoord dat zich als "niet waar" gedraagt — dat gaf ooit de
  --    weekpasvoorraad van elk willekeurig doel terug.
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select p.tz, p.week_start_day into v_tz, v_startdag
  from profiles p where p.id = v_uid;

  if v_tz is null then
    return jsonb_build_object('ok', false, 'reason', 'geen_profiel');
  end if;

  if not exists (
    select 1 from goals g where g.id = p_goal_id and g.owner_id = v_uid
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  -- Beide datums moeten cyclusstarts van déze gebruiker zijn.
  if extract(dow from p_starts_cycle)::smallint <> v_startdag
     or extract(dow from p_ends_cycle)::smallint <> v_startdag then
    return jsonb_build_object('ok', false, 'reason', 'geen_cyclusstart');
  end if;

  if p_ends_cycle < p_starts_cycle then
    return jsonb_build_object('ok', false, 'reason', 'omgekeerde_periode');
  end if;

  -- Maximaal twee cycli: begin en eind liggen hoogstens één week uit elkaar.
  if p_ends_cycle > p_starts_cycle + 7 then
    return jsonb_build_object('ok', false, 'reason', 'te_lang');
  end if;

  -- ⚠️ Vooraf. Zie de kop: de lopende cyclus mag niet, anders is dit een
  --    zondagavondontsnapping uit het minpunt.
  v_vandaag := (now() at time zone v_tz)::date;

  if p_starts_cycle <= v_vandaag then
    return jsonb_build_object('ok', false, 'reason', 'niet_vooraf');
  end if;

  -- Geen overlap met een adempauze die er al ligt op ditzelfde doel.
  if exists (
    select 1 from breathers b
    where b.user_id = v_uid
      and b.goal_id = p_goal_id
      and b.starts_cycle <= p_ends_cycle
      and b.ends_cycle   >= p_starts_cycle
  ) then
    return jsonb_build_object('ok', false, 'reason', 'overlapt');
  end if;

  insert into breathers (user_id, goal_id, starts_cycle, ends_cycle)
  values (v_uid, p_goal_id, p_starts_cycle, p_ends_cycle)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Annuleren, zolang hij nog niet begonnen is
-- ---------------------------------------------------------------------------
--
-- ⚠️ Een lopende of verstreken adempauze is geschiedenis (domeinregel 6). Hem
--    weghalen zou de weken die de rollover al op `excused` heeft gezet losmaken
--    van hun reden, en dan staat er een vrijgestelde week zonder verklaring.

create or replace function public.annuleer_adempauze(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid     uuid := auth.uid();
  v_tz      text;
  v_start   date;
  v_vandaag date;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select p.tz into v_tz from profiles p where p.id = v_uid;
  if v_tz is null then
    return jsonb_build_object('ok', false, 'reason', 'geen_profiel');
  end if;

  select b.starts_cycle into v_start
  from breathers b
  where b.id = p_id and b.user_id = v_uid;

  if v_start is null then
    return jsonb_build_object('ok', false, 'reason', 'niet_gevonden');
  end if;

  v_vandaag := (now() at time zone v_tz)::date;

  if v_start <= v_vandaag then
    return jsonb_build_object('ok', false, 'reason', 'al_begonnen');
  end if;

  delete from breathers where id = p_id and user_id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

-- ⚠️ `anon` krijgt hier niets. Een adempauze is niets voor iemand zonder sessie,
--    en een definer-functie die voor `anon` aanroepbaar is, is een open deur.
revoke all on function public.plan_adempauze(uuid, date, date) from public, anon;
revoke all on function public.annuleer_adempauze(uuid) from public, anon;
grant execute on function public.plan_adempauze(uuid, date, date) to authenticated;
grant execute on function public.annuleer_adempauze(uuid) to authenticated;

commit;
