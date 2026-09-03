-- 0139_de_week_startdag_verzet_de_lopende_week_mee.sql — je week-startdag verzetten kost geen weekdoel meer (QS8-138)
--
-- ROLLBACK-PAD:
--   drop function if exists public.zet_week_startdag(smallint, date, date);
--   grant update on public.profiles to authenticated;
--
--   ⚠️ Die tweede regel is de belangrijke, en hij moet **tabelbreed** zijn: dit
--   bestand heeft de tabelbrede UPDATE-grant vervangen door tien kolomgrants
--   (zie onderaan). Een `grant update (week_start_day)` alleen zet de oude
--   toestand niet terug maar maakt een elfde kolomgrant — en dan kan de client
--   nog steeds niet schrijven wat hij daarvoor wél kon.
--
--   ⚠️ Zonder deze regel kan niemand zijn week-startdag meer wijzigen, want de
--   client heeft dan geen enkel pad: de RPC is weg en de kolom staat dicht.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- `fetchWeekdoelen()` matcht exact op `cycle_start_date`. Verzet je je
-- week-startdag midden in een cyclus, dan draagt je lopende weekdoel nog de
-- oude datum en valt het uit beeld.
--
-- 📏 Gemeten met de echte klokfuncties: onder een maandagklok valt 28-08 in de
--    cyclus vanaf 24-08, onder een donderdagklok vanaf 20-08. Het weekdoel op
--    24-08 staat daarna in geen enkele lijst — ook niet bij "nog open van
--    eerdere weken", want die haalt bewust alleen `missed` op (0045).
--
-- **Een week later stempelt de rollover het als gemist: een minpunt en een
-- gebroken reeks, voor het wijzigen van een instelling.** Dat is domeinregel 8
-- op zijn kop — de reeks dient de gebruiker, nooit andersom.
--
-- ---------------------------------------------------------------------------
-- Welke weekdoelen verhuizen, en welke met opzet niet
-- ---------------------------------------------------------------------------
--
-- Alleen `todo`. De redenen per status, want dit is het deel dat later niemand
-- meer kan reconstrueren:
--
--   todo       verhuist. Er is niets gebeurd: geen voltooiing, geen boeking,
--              geen goedkeuring. Verhuizen herschrijft dus geen geschiedenis.
--              Dit ís de rij die anders een minpunt oplevert.
--
--   pending    niet. Er hangt een `completions`-rij aan met een eigen
--              `cycle_start_date`; de een verhuizen zonder de ander laat ze uit
--              de pas lopen. En `pending` wordt nooit als gemist gestempeld
--              (rollover, regel 253), dus er is geen schade te voorkomen.
--
--   approved   niet. Domeinregel 6, append-only: `points_ledger` verwijst naar
--              deze rij in díé cyclus.
--
--   cancelled  niet, en dat is de minst vanzelfsprekende. Hij wórdt als gemist
--              gestempeld, maar het minpunt is daar **bedoeld** (A40, 0045): je
--              hebt die week zelf opgegeven. Het zou er ook zonder deze
--              instellingswijziging gekomen zijn, dus verhuizen stelt een
--              gevolg uit dat de gebruiker zelf gekozen heeft.
--
--   missed / carried / excused   niet. Geschiedenis.
--
-- ⚠️ **`cycle_index` verhuist niet mee.** Gemeten: hij wordt in `src/`, `app/`
--    en `supabase/functions/` alleen geschréven en nooit voor logica gelezen —
--    `herbereken_reeks()` noemt hem nul keer en groepeert op
--    `cycle_start_date`. Het is een weekteller voor het scherm. Na een
--    week-startwijziging schuift het hele raster op; één rij herberekenen
--    terwijl alle historische rijen op het oude raster blijven staan, maakt die
--    teller minder consistent in plaats van meer.
--
-- ---------------------------------------------------------------------------
-- Waarom de client de datum meegeeft en dit geen trigger is
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Er is geen SQL-helper die een cyclus uitrekent**, gemeten met
--    `pg_get_functiondef()` over het hele schema: `groepsdatum()` en
--    `eigenaarsdatum()` geven een dátum, `seizoensgrens()` een seizoen. Een
--    trigger op `profiles` zou hier dus een **tweede opvatting van "welke week
--    is het"** in SQL neerzetten, en dat is precies waar correctheidsregel 7
--    tegen is — de kop van 0134 waarschuwde er al voor.
--
-- Daarom rekent de client en schrijft de server, net als bij
-- `schuif_weekdoel_door(p_weekly_goal_id, p_cycle_start_date, p_cycle_index)`.

create or replace function public.zet_week_startdag(
  p_dag           smallint,
  p_oude_start    date,
  p_nieuwe_start  date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid      uuid := auth.uid();
  v_vandaag  date;
  v_verzet   integer := 0;
begin
  -- ⚠️ Expliciet op null toetsen en niet op `<> `. Zonder sessie is `auth.uid()`
  --    NULL, en `null <> x` is NULL en dus niet waar — de val die veertig regels
  --    kostte en in elke definer-functie sindsdien zo staat.
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_logged_in');
  end if;

  if p_dag is null or p_dag < 0 or p_dag > 6 then
    return jsonb_build_object('ok', false, 'reason', 'ongeldige_dag');
  end if;

  if p_oude_start is null or p_nieuwe_start is null then
    return jsonb_build_object('ok', false, 'reason', 'ongeldige_cyclus');
  end if;

  -- De eigen datum van deze gebruiker, uit de gedeelde helper van 0137. Niet
  -- `current_date`: die is UTC, en dan verschilt de grens per woonplaats.
  v_vandaag := eigenaarsdatum(v_uid);

  -- ⚠️ Een ontbrekend profiel is hier **weigeren** en niet doorlaten. Bij
  --    `wikkel_commitments_af()` viel de terugval de milde kant op omdat de
  --    twijfel daar een beloning kostte; hier zou doorlaten de grens hieronder
  --    uitschakelen, en dat is de kant die geld kost.
  if v_vandaag is null then
    return jsonb_build_object('ok', false, 'reason', 'geen_profiel');
  end if;

  -- ---------------------------------------------------------------------
  -- De grendel, en dit is het deel dat ertoe doet
  -- ---------------------------------------------------------------------
  --
  -- ⚠️ **Een RPC die een cliënt-berekende datum aanneemt, is een route naar een
  --    weggepoetste week.** Zonder deze toets kon je een `todo` die op het punt
  --    staat gemist te worden naar de huidige cyclus schuiven, en dan komt het
  --    minpunt nooit. Dat is dezelfde klasse als de vier routes die 0043 t/m
  --    0046 hebben dichtgezet.
  --
  -- ⚠️ **De toets is een datumbereik en geen weekberekening**, en dat is met
  --    opzet: zo ontstaat er geen tweede opvatting van "welke week is het" in
  --    SQL. Beide cycli moeten vandáág bevatten. Daarmee is het legitieme geval
  --    precies gekarakteriseerd — je verhuist van de cyclus waar je nú in zit
  --    naar de cyclus waar je onder de nieuwe dag nú in zit — en een `todo` uit
  --    een écht voorbije week haalt hem nooit.
  if v_vandaag < p_oude_start or v_vandaag >= p_oude_start + 7
     or v_vandaag < p_nieuwe_start or v_vandaag >= p_nieuwe_start + 7 then
    return jsonb_build_object('ok', false, 'reason', 'cyclus_bevat_vandaag_niet');
  end if;

  update profiles set week_start_day = p_dag where id = v_uid;

  -- ⚠️ Alleen als er iets te verhuizen valt. Bij gelijke data (de onboarding
  --    zet zijn dag terwijl er nog geen weekdoel bestaat) is dit een no-op, en
  --    dan hoort er geen lege `update` te draaien die `updated_at` aanraakt.
  if p_nieuwe_start <> p_oude_start then
    update weekly_goals w
       set cycle_start_date = p_nieuwe_start
      from goals g
     where g.id = w.goal_id
       and g.owner_id = v_uid
       and w.cycle_start_date = p_oude_start
       -- Alleen `todo`. Zie de kop voor de reden per status.
       and w.status = 'todo';

    get diagnostics v_verzet = row_count;
  end if;

  return jsonb_build_object('ok', true, 'verzet', v_verzet);
end;
$$;

-- ⚠️ `from public, anon, authenticated` en niet `from public, anon`. In Supabase
--    deelt `alter default privileges` élke nieuwe functie in `public` uit aan
--    alle drie, en `from public, anon` houdt precies de rol over waaronder
--    iedere ingelogde gebruiker draait. Zie CLAUDE.md beveiligingsregel 4.
revoke all on function public.zet_week_startdag(smallint, date, date)
  from public, anon, authenticated;

-- Dit is wél een clientoppervlak: het is de knop in het profieltabblad.
grant execute on function public.zet_week_startdag(smallint, date, date) to authenticated;

comment on function public.zet_week_startdag(smallint, date, date) is
  'Zet de week-startdag en verhuist de todo-weekdoelen van de lopende cyclus '
  'mee. Beide cycli moeten vandaag bevatten. Zie migratie 0139 (QS8-138).';

-- ---------------------------------------------------------------------------
-- De kolom gaat op slot, en dat is de helft van de reparatie
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Zonder dit is dit een keten die stukgaat bij de volgende schrijver.**
--    Bleef `week_start_day` rechtstreeks schrijfbaar, dan zet de RPC de dag én
--    de weekdoelen, maar kan iedere andere plek in de app de dag zetten zonder
--    de weekdoelen — en dan is de bug terug op een plek waar niemand hem zoekt.
--    Dat is onwrikbare regel 18, vraag 5: een keten waarvan elk schakeltje
--    klopt terwijl het geheel niet verbonden is.
--
--    Vandaag zijn er twee schrijvers — het profieltabblad en de onboarding — en
--    die gaan allebei via de RPC. De intrekking is wat dat afdwingt in plaats
--    van erop te vertrouwen. Zelfde vorm als `groups.zichtbaarheid` (0076) en
--    `goals.target_date` (0110).
--
-- ⚠️ **En dit moest twee keer, want de eerste vorm was een stille no-op.**
--    `revoke update (week_start_day) on profiles from authenticated;` liep
--    zonder fout — en veranderde niets. De reden staat in de ACL:
--
--      relacl:  authenticated=awx/postgres     ← `w` is UPDATE, op tabelniveau
--
--    Een kolom-revoke haalt niets af van een **tabelbrede** grant; Postgres
--    accepteert de opdracht en `information_schema.column_privileges` bleef
--    alle veertien kolommen noemen. Gemeten, niet aangenomen.
--
--    Dit is dezelfde klasse als `revoke ... from public, anon` (beslisdocument
--    28-08): een intrekking die eruitziet alsof hij werkt. **De enige vorm die
--    wél werkt is de tabelbrede grant intrekken en daarna per kolom uitdelen.**
--
-- ⚠️ **De lijst hieronder is gemeten en niet bedacht**: het zijn precies de
--    kolommen die `src/` en `app/` vandaag schrijven —
--    `updateProfiel()` (acht), `rondOnboardingAf()` (twee) en `avatar.ts` (één).
--    Wat er níét in staat en waarom:
--
--      id           de sleutel.
--      week_start_day  gaat vanaf nu via `zet_week_startdag()`. Dit is het punt.
--      created_at   geschiedenis.
--      updated_at   wordt door de trigger `profiles_touch` gezet; een client die
--                   hem zelf schrijft, liegt over wanneer iets gewijzigd is.
--
-- ⚠️ Dit verkleint het schrijfoppervlak van `profiles` van **veertien** kolommen
--    naar tien. Dat is winst die verder gaat dan dit issue, en het is de reden
--    dat de intrekking hier niet met één regel afkon.
revoke update on public.profiles from authenticated;

grant update (
  display_name,
  avatar_url,
  tz,
  reminder_time,
  reminder_enabled,
  reminder_tone,
  share_moves_by_default,
  onboarded_at,
  wants_own_goal,
  locale
) on public.profiles to authenticated;
