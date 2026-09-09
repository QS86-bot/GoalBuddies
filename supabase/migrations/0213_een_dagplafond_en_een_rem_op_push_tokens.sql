-- 0213_een_dagplafond_en_een_rem_op_push_tokens.sql — veertien tabellen kregen in 0200/0203/0207 een dagplafond en push_tokens is er als enige langs geglipt (QS8-369)
--
-- ROLLBACK-PAD:
--   drop trigger if exists pushtokens_rem on public.push_tokens;
--   drop trigger if exists pushtokens_dagplafond on public.push_tokens;
--   drop function if exists public.rem_pushtokens();
--   drop function if exists public.begrens_pushtokens();
--   drop function if exists public.pushtokens_plafond();
--   -- en `sleutelzetters()` terugzetten op de definitie uit **0207**: die kent
--   -- `app.rem_pushtokens` niet. Lees hem uit de dráaiende database en kopieer
--   -- hem niet uit een migratiebestand — zie QS8-358 en het blok onderaan.
--   -- ⚠️ En `registreer_push_token()` terug naar de body van **0211**; deze
--   -- migratie voegt daar één tak aan toe die zonder plafond nergens op slaat.
--   -- ⚠️⚠️ **0211 en niet 0209, en dat is bijna misgegaan.** Deze migratie is
--   -- geschreven toen 0211 (QS8-367) nog niet geland was, en droeg dus de body
--   -- van 0209 mee — mét de `delete` die 0211 er net uit had gehaald. Bij het
--   -- hernummeren naar 0213 is de body opnieuw uit de dráaiende database
--   -- gelezen, ná 0211 en 0212. Dezelfde val als bij `sleutelzetters()`
--   -- hieronder (QS8-358), maar dan op een functie die er niet om bekend staat:
--   -- elke `create or replace` draagt een momentopname van het hele lichaam.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten op de lokale stack: `push_tokens` heeft géén enkele niet-interne
-- trigger, terwijl veertien andere tabellen er sinds 0200/0203/0207 een
-- `*_dagplafond` én een `*_rem` dragen. Eén `authenticated`-gebruiker kan in een
-- lus over `registreer_push_token()` rijen blijven maken; de review op QS8-367
-- kwam op 2000 rijen en 80 kB → 2720 kB.
--
-- ⚠️ **De rij ís begrensd, de tabel niet.** `push_tokens_token_len` (0179),
-- `push_tokens_sleutels_len` (0179) en `push_tokens_native_vorm` (0209) zeggen
-- allemaal iets over één rij. Onwrikbare regel 18 in het klein: elk onderdeel
-- klopt en het geheel lekt.
--
-- ---------------------------------------------------------------------------
-- ⚠️ Waarom 20 en niet 200
-- ---------------------------------------------------------------------------
--
-- De veertien bestaande plafonds staan op 100 tot 1000, en dat past bij wat ze
-- tellen: berichten, doelen, afvinkingen — dingen die een gebruiker de hele dag
-- door maakt. Een pushtoken is geen handeling maar een **apparaat**. Een telefoon,
-- een tablet, een browser op de laptop, een tweede browser op het werk: vier. Met
-- herinstallaties en een browser die zijn abonnement vernieuwt erbij is twintig
-- per etmaal ruim vijf keer de werkelijke bovenkant.
--
-- ⚠️ **Wat dit plafond niet is: een grens op het totaal.** Het telt het laatste
-- etmaal, net als de andere veertien. Wie elke dag twintig nieuwe apparaten
-- registreert, komt er over een jaar alsnog. Dat is een andere vraag — een
-- opruimpad voor tokens die niets meer ontvangen — en die staat als dossierrij.
--
-- ⚠️ **Het hérregistreren van hetzelfde apparaat telt niet mee**, en dat is de
-- reden dat twintig kan. `registreer_push_token()` doet
-- `on conflict (token) do update`, en Postgres stuurt een rij die op de conflict
-- terechtkomt naar de UPDATE-tak — die komt dus niet in de transitietabel van een
-- `after insert`-trigger. `Pushwacht` in `app/_layout.tsx` registreert bij élke
-- start opnieuw; zonder dat gedrag zou twintig krap zijn.
--
-- ---------------------------------------------------------------------------
-- Twee lagen, en een derde die de gebruiker een antwoord geeft
-- ---------------------------------------------------------------------------
--
-- Dezelfde vorm als 0179 en 0209 op dezelfde tabel:
--
--   1. `pushtokens_dagplafond` — de grendel. `after insert … for each statement`
--      met een transitietabel, zodat een batch als geheel telt.
--   2. `pushtokens_rem` — de noodstop van 0200. Een transitietabel bestaat alleen
--      in `AFTER`, dus zonder deze `before insert … for each row` schrijft
--      Postgres een geweigerde batch eerst fysiek weg. Drempel op
--      `plafond * 2`, zodat de rem de grendel niet inhaalt en zijn melding niet
--      overstemt.
--   3. Een tak in `registreer_push_token()` met een `reason`. Zonder die tak
--      krijgt de gebruiker een ruwe 23514 door PostgREST heen — precies de klacht
--      die 0067 voor `geen_websleutels` oploste en 0179 voor `token_te_lang`.
--
-- ⚠️ **Laag 1 en 3 dragen hetzelfde getal op twee plekken en kunnen uit elkaar
-- lopen.** `tests/rls/pushtokenplafond.test.ts` legt ze daarom naast elkaar in
-- plaats van ze los te toetsen — dezelfde constructie als mutatie G in
-- `pushtokengrens.test.ts`.
--
-- ---------------------------------------------------------------------------
-- 📏 Waarom dit nú kan
-- ---------------------------------------------------------------------------
--
-- Op productie staat `push_tokens` op **0 rijen**, op elk platform (gemeten
-- 08-09-2026). Er is dus niets op te ruimen voordat het plafond erop kan, en
-- niemand die er vandaag overheen zit.
--
-- ---------------------------------------------------------------------------
-- Verder lezen
-- ---------------------------------------------------------------------------
--
-- `docs/decisions/2026-09-09-een-test-die-maar-een-kant-op-kijkt.md` — waarom
-- `remdekking.test.ts` deze tabel niet kón zien, waarom de meting van de
-- groeibare tabellen bijna op `has_table_privilege` strandde, en het
-- bestaansorakel dat de eerste versie van de RPC-tak zelf binnenbracht.

create or replace function public.pushtokens_plafond()
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$ select 20 $$;

comment on function public.pushtokens_plafond() is
  'Hoeveel nieuwe pushtokens één gebruiker per etmaal mag registreren. 20 is '
  'ruim vijf keer een echt apparatenpark; herregistratie van hetzelfde apparaat '
  'loopt via de on-conflict-tak en telt niet mee. Zie 0213 en QS8-369.';

-- ⚠️ Onwrikbare regel 4: `authenticated` staat er met zoveel woorden bij. Deze
--    drie worden alleen aangeroepen vanuit een trigger of een definer-functie,
--    dus er komt geen grant terug — zelfde afweging als bij `is_pushdienst()`.
revoke execute on function public.pushtokens_plafond()
  from public, anon, authenticated;

create or replace function public.begrens_pushtokens()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_totaal integer; v_batch integer;
begin
  if (select auth.uid()) is null then return null; end if;

  select count(*) into v_batch from nieuw;

  -- ⚠️⚠️ **Een statement dat niets toevoegde, kan het plafond niet doorbroken
  --    hebben.** Zonder deze regel telt de trigger de tabel ook als de
  --    transitietabel leeg is, en dat is niet theoretisch: een `insert … on
  --    conflict do update` die volledig op de UPDATE-tak landt, ís een
  --    INSERT-statement en vuurt deze `after insert … for each statement`-trigger
  --    dus gewoon af — met nul rijen in `nieuw`.
  --
  -- 📏 Gemeten: zet een gebruiker met een bevoorrechte schrijver op 21 rijen, en
  --    daarna valt élke herregistratie van een bestaand apparaat om met
  --    `Te veel pushtokens in één dag (0 erbij, 21 in het laatste etmaal,
  --    plafond 20)`. Die `0 erbij` is de hele diagnose.
  --
  -- ⚠️ Dat is precies de must-allow waar dit plafond op rust: `Pushwacht` in
  --    `app/_layout.tsx` herregistreert bij élke start, dus zo iemand zit
  --    blijvend zonder meldingen op een fout die hij zelf niet kan opheffen. De
  --    RPC-tak houdt hem via de gewone weg op 20, maar een backfill, een tweede
  --    schrijver of een later verlaagd plafond brengt hem er alsnog boven.
  --
  -- ⚠️ En hij verzwakt de grendel niet: nul toegevoegde rijen betekent dat de
  --    telling van deze gebruiker door dit statement niet gestegen is.
  if v_batch = 0 then return null; end if;

  select count(*) into v_totaal from push_tokens t
   where t.user_id = (select auth.uid()) and t.created_at > now() - interval '1 day';

  if v_totaal > pushtokens_plafond() then
    raise exception 'Te veel pushtokens in één dag (% erbij, % in het laatste etmaal, plafond %)',
      v_batch, v_totaal, pushtokens_plafond()
      using errcode = 'check_violation',
            hint = 'Het dagplafond geldt per gebruiker en telt ook de rijen uit dit verzoek.';
  end if;

  return null;
end $$;

revoke execute on function public.begrens_pushtokens()
  from public, anon, authenticated;

create or replace function public.rem_pushtokens()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  if (select auth.uid()) is null then return new; end if;

  v_n := coalesce(nullif(current_setting('app.rem_pushtokens', true), ''), '0')::integer + 1;
  perform set_config('app.rem_pushtokens', v_n::text, true);

  if v_n > pushtokens_plafond() * 2 then
    raise exception 'Te veel pushtokens in één verzoek (% rijen, noodgrens %)',
      v_n, pushtokens_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit verzoek schrijft er te veel in één keer. Verdeel het over meerdere verzoeken.';
  end if;

  return new;
end $$;

revoke execute on function public.rem_pushtokens()
  from public, anon, authenticated;

drop trigger if exists pushtokens_dagplafond on public.push_tokens;
create trigger pushtokens_dagplafond
  after insert on public.push_tokens
  referencing new table as nieuw
  for each statement execute function public.begrens_pushtokens();

drop trigger if exists pushtokens_rem on public.push_tokens;
create trigger pushtokens_rem
  before insert on public.push_tokens
  for each row execute function public.rem_pushtokens();

-- ---------------------------------------------------------------------------
-- Een net antwoord ernaast — de derde laag
-- ---------------------------------------------------------------------------
--
-- ⚠️ De body hieronder komt uit de dráaiende database (0209) met één tak erbij,
--    en niet uit een migratiebestand. Zie QS8-358.

CREATE OR REPLACE FUNCTION public.registreer_push_token(p_token text, p_platform text, p_p256dh text DEFAULT NULL::text, p_auth text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid    uuid := auth.uid();
  v_p256dh text;
  v_auth   text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  if p_token is null or length(trim(p_token)) < 8 then
    return jsonb_build_object('ok', false, 'reason', 'geen_token');
  end if;

  -- ⚠️ QS8-297. Boven de grens van `push_tokens_token_len`, dus dit is een
  --    nette weigering van iets dat de CHECK sowieso zou tegenhouden.
  if octet_length(trim(p_token)) > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'token_te_lang');
  end if;

  if p_platform not in ('ios', 'android', 'web') then
    return jsonb_build_object('ok', false, 'reason', 'onbekend_platform');
  end if;

  -- Alleen web draagt sleutels. Voor de rest hard op NULL, zie de kop.
  if p_platform = 'web' then
    v_p256dh := nullif(trim(coalesce(p_p256dh, '')), '');
    v_auth   := nullif(trim(coalesce(p_auth, '')), '');

    -- ⚠️ Dit is de reden dat 0067 bestaat: zonder deze tak wordt dit een
    --    CHECK-schending en krijgt de gebruiker een ruwe Postgres-fout in
    --    plaats van een antwoord waar de client iets mee kan.
    if v_p256dh is null or v_auth is null then
      return jsonb_build_object('ok', false, 'reason', 'geen_websleutels');
    end if;

    -- ⚠️ QS8-297, en dezelfde reden als hierboven bij de token.
    if octet_length(v_p256dh) > 255 or octet_length(v_auth) > 255 then
      return jsonb_build_object('ok', false, 'reason', 'sleutel_te_lang');
    end if;

    -- ⚠️ 0117. Dit veld ís de endpoint-URL waar de meldingenjob elk uur een
    --    fetch() op doet, onder service_role, vanuit het Supabase-netwerk. Tot
    --    daar stond er geen enkele toets op, en een ingelogde gebruiker kon er
    --    dus elk willekeurig adres in zetten — een SSRF-primitief met een
    --    bestaat-of-niet-orakel eraan vast, want 404 en 410 ruimen de rij op.
    if not is_pushdienst(trim(p_token)) then
      return jsonb_build_object('ok', false, 'reason', 'geen_pushdienst');
    end if;
  else
    -- ⚠️ QS8-305. Dit is de tak die tot 0209 leeg was op alles behalve het op
    --    NULL zetten van de sleutels: acht tekens was genoeg om een rij te
    --    krijgen die er goed uitziet en nooit iets ontvangt. De vorm is die van
    --    `push_tokens_native_vorm`; loopt deze regel weg bij die constraint, dan
    --    krijgt de gebruiker weer een ruwe 23514.
    if not is_expo_pushtoken(trim(p_token)) then
      return jsonb_build_object('ok', false, 'reason', 'geen_expotoken');
    end if;

    v_p256dh := null;
    v_auth   := null;
  end if;

  -- ⚠️⚠️ **Hier stond een `delete`, en die is met 0211 weg** (QS8-367). Hij
  --    luidde `delete from push_tokens where token = p_token and user_id <> v_uid`
  --    en las als het slot op het gedeelde-apparaatgeval — zo staat hij ook in
  --    de dossierrij van 21-08 beschreven. Dat was hij niet.
  --
  -- 📏 Twee dingen gemeten. Ten eerste vergeleek hij met `p_token` en niet met
  --    `trim(p_token)`, als enige regel in deze functie; met spaties eromheen
  --    miste hij dus. Ten tweede — en dat is de eigenlijke vondst — gebeurde de
  --    overname daarna alsnog, via de `on conflict` hieronder. De `delete` was
  --    een tweede mechanisme naast een mechanisme dat het werk al deed.
  --
  -- ⚠️ **Weghalen kan omdat deze tabel één schrijver heeft, en dat is gemeten.**
  --    `authenticated` heeft op `push_tokens` geen INSERT en geen UPDATE (wel
  --    SELECT, DELETE en REFERENCES) en er is geen insert-policy. Deze functie
  --    is de enige weg naar binnen en trimt altijd. Dat er dan ook langs geen
  --    enkele ándere weg een rij met spaties komt, is sinds deze migratie geen
  --    aanname meer maar `push_tokens_token_getrimd` — zie de kop.
  --
  -- ⚠️ Wat er verandert is één waarneembaar ding: bij een overname houdt de rij
  --    nu haar `id` en `created_at` in plaats van dat er een verse rij komt.
  --    📏 Niets leest die twee — geen foreign key wijst naar `push_tokens.id`,
  --    geen andere functie noemt de tabel, en de meldingenjob selecteert
  --    `token, platform, p256dh, auth`. Dat staat nu wél onder test, want het
  --    was het enige verschil tussen de twee paden en niets toetste het.

  -- ⚠️ QS8-369. Boven het dagplafond van `pushtokens_dagplafond`, dus dit is een
  --    nette weigering van iets dat de trigger sowieso zou tegenhouden — zelfde
  --    vorm als `token_te_lang` (0179) en `geen_expotoken` (0209).
  --
  -- ⚠️ **Alleen als deze rij nog niet van mij is.** Herregistreren van hetzelfde
  --    apparaat loopt via de on-conflict-tak hieronder en maakt geen rij bij; dat
  --    mag het plafond nooit raken, want `Pushwacht` doet het bij élke start.
  --
  -- ⚠️⚠️ **`and user_id = v_uid` is geen detail — zonder die helft stond hier een
  --    bestaansorakel.** De vraag die deze tak stelt is "voegt dit verzoek een rij
  --    toe aan míjn telling?", en de eerste versie toetste `where token = …` over
  --    de héle tabel. Dat is precies verkeerd om: een token van iemand ánders
  --    wordt door de `on conflict … do update` hieronder naar jou toe geschreven
  --    (`user_id = excluded.user_id`), dus die rij **verhuist** en telt wél mee.
  --
  --    📏 Gemeten op de lokale stack, 09-09-2026, met een aanvaller op zijn eigen
  --    plafond van 20:
  --
  --      bestaat niet -> {"ok": false, "reason": "te_veel_tokens"}
  --      bestaat wel  -> ERROR 23514: Te veel pushtokens in één dag
  --                      (0 erbij, 21 in het laatste etmaal, plafond 20)
  --
  --    Twee dingen tegelijk fout. De ruwe 23514 is terug in precies het geval
  --    waarvoor deze tak bestaat — `0 erbij` bewijst dat de transitietabel leeg
  --    was en de telling tóch op 21 stond, dus de rij was verhuisd. En het
  --    verschil tussen die twee antwoorden leest van een wíllekeurige
  --    tokenstring af óf hij bestaat. Zonder plafond bestaat dat onderscheid
  --    niet: dan geeft élke aanroep `ok: true`.
  --
  --    ⚠️ Dezelfde vorm die `blokkeer()` en `vraag_lidmaatschap_aan()` met
  --    zoveel woorden dichtzetten — één antwoord voor "bestaat niet" en
  --    "bestaat wel", anders is de functie een aftastinstrument. Met
  --    `user_id = v_uid` erbij geven beide gevallen `te_veel_tokens` en is er
  --    niets meer af te lezen.
  if not exists (select 1 from push_tokens
                  where token = trim(p_token) and user_id = v_uid)
     and (select count(*) from push_tokens t
           where t.user_id = v_uid and t.created_at > now() - interval '1 day')
         >= pushtokens_plafond() then
    return jsonb_build_object('ok', false, 'reason', 'te_veel_tokens');
  end if;

  insert into push_tokens (user_id, token, platform, p256dh, auth, last_seen_at)
  values (v_uid, trim(p_token), p_platform, v_p256dh, v_auth, now())
  on conflict (token) do update
    set user_id      = excluded.user_id,
        platform     = excluded.platform,
        p256dh       = excluded.p256dh,
        auth         = excluded.auth,
        last_seen_at = now();

  return jsonb_build_object('ok', true);
end;
$function$

;

revoke execute on function public.registreer_push_token(text, text, text, text)
  from public, anon, authenticated;
grant  execute on function public.registreer_push_token(text, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Het register van sleutelzetters(), uit de draaiende database
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Uitgelezen met `pg_get_functiondef()` en niet gekopieerd uit 0207.**
--    Dat is twee keer misgegaan (QS8-358): een register in een
--    `create or replace`-lichaam is een merge-conflict dat git niet ziet, en
--    de laatste replace wint. De teller ving zichzelf beide keren op.

CREATE OR REPLACE FUNCTION public.sleutelzetters()
 RETURNS TABLE(naam text, bezwaar text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with sleutel(instelling, toegestaan) as (
    values
      ('app.heropent_groep',      array['heropen_groep', 'archief_blijft_archief']),
      -- ⚠️ Uit 0208 (QS8-360). De huddledag verzetten schuift de start van de
      --    lopende periode, en dan gaat de weekafsluiting die erbij hoort mee —
      --    langs de pin van 0206, die `group_id` en `user_id` onverkort gepind
      --    houdt.
      ('app.huddledag_verzet',    array['zet_huddledag', 'pin_week_review']),
      -- ⚠️ **Deze drie komen uit 0199 (QS8-356) en staan hier omdat een
      --    `create or replace` het hele register vervangt.** Ze zijn er bij het
      --    samenvoegen bijna uit gevallen: de RLS-suite meldde na de merge drie
      --    ongeregistreerde sleutels — `verlaat_groep`,
      --    `beslis_lidmaatschapsverzoek` en `verwijder_lid` — omdat mijn versie
      --    het register van vóór die migratie kopieerde.
      --
      --    Dat is de val van een teller die zijn eigen register in zijn lichaam
      --    draagt: twee branches breiden hem uit, de laatste `replace` wint, en
      --    de ander verdwijnt zonder een woord. Hier ving de teller zichzelf op
      --    doordat hij de weggevallen sleutels meteen als ongeregistreerd meldde.
      ('app.beheer_overgedragen',   array['verlaat_groep', 'guard_group_member_update']),
      ('app.lidmaatschap_besloten', array['beslis_lidmaatschapsverzoek', 'guard_group_member_update']),
      ('app.lid_uitgezet',          array['verwijder_lid', 'guard_group_member_update']),
      -- De tellers van 0200. Elke rem mag alleen zijn eigen instelling zetten.
      ('app.rem_weekdoelen',         array['rem_weekdoelen']),
      ('app.rem_berichten',          array['rem_berichten']),
      ('app.rem_dagafvinkingen',     array['rem_dagafvinkingen']),
      ('app.rem_weekreacties',       array['rem_weekreacties']),
      ('app.rem_weekplanstappen',    array['rem_weekplanstappen']),
      ('app.rem_doelen',             array['rem_doelen']),
      ('app.rem_mijlpalen',          array['rem_mijlpalen']),
      ('app.rem_doelgebeurtenissen', array['rem_doelgebeurtenissen']),
      ('app.rem_goedkeuringen',      array['rem_goedkeuringen']),
      -- ⚠️⚠️ **Deze vijf komen uit 0207 (QS8-361) en waren er bij het samenvoegen
      --    uit gevallen.** Mijn versie kopieerde het register van vóór die
      --    migratie, precies zoals de aantekening bij de drie sleutels van 0199
      --    hierboven beschrijft — de val van een teller die zijn eigen register in
      --    zijn lichaam draagt: twee branches breiden hem uit, de laatste
      --    `replace` wint, en de ander verdwijnt zonder een woord.
      --
      -- 📏 De teller ving zichzelf opnieuw op: `rem_commitments`, `rem_dagzetten`,
      --    `rem_doelinterviews`, `rem_doelkoppelingen` en `rem_voltooiingen`
      --    stonden meteen als ongeregistreerd in de uitslag, en twee RLS-tests
      --    werden er rood van. Dat is de tweede keer op vier dagen; het staat als
      --    QS8-358.
      ('app.rem_commitments',        array['rem_commitments']),
      ('app.rem_voltooiingen',       array['rem_voltooiingen']),
      ('app.rem_dagzetten',          array['rem_dagzetten']),
      ('app.rem_doelkoppelingen',    array['rem_doelkoppelingen']),
      ('app.rem_doelinterviews',     array['rem_doelinterviews']),
      -- ⚠️ Uit 0213 (QS8-369). `push_tokens` is de vijftiende tabel met een
      --    dagplafond en de enige die er nooit een kreeg; deze sleutel hoort bij
      --    zijn rem. Het register hieronder komt uit de dráaiende database en
      --    niet uit een oudere migratie — zie de twee aantekeningen hierboven en
      --    QS8-358.
      ('app.rem_pushtokens',         array['rem_pushtokens'])
  ),
  bekend as (
    select p.proname::text as naam, s.instelling, s.toegestaan
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join sleutel s
    where n.nspname = 'public'
      and p.prosrc like '%' || s.instelling || '%'
      and p.proname <> 'sleutelzetters'
  )
  select naam,
         'noemt ' || instelling || '; alleen ' ||
         array_to_string(toegestaan, '() en ') || '() horen die sleutel te kennen'
    from bekend
   where naam <> all (toegestaan)

  union all

  -- ⚠️ De derde tak: een `app.`-instelling die in geen enkel register hierboven
  --    staat. Zonder deze tak dekt de teller alleen de sleutels die iemand er al
  --    in heeft gezet, en is de vólgende sleutel weer ongeteld.
  select p.proname::text,
         -- ⚠️ De naam van deze functie staat met opzet niet in deze tekst.
         --    `keten:controle` telt een naam in de bron als een aanroeper, en
         --    strippen doet hij alleen commentaar — niet een tekenreeks. Een
         --    functie die zichzelf in een melding noemt, meldt zichzelf dus
         --    levend. Dezelfde klasse als het commentaargeval dat dat script in
         --    zijn eigen kop beschrijft: de tekst óver een functie is geen
         --    gebruik ervan.
         'noemt een app.-sessiesleutel die in geen enkel register van deze '
         'teller staat; een nieuwe sleutel hoort er met zijn eigen regel in '
         'te komen'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname <> 'sleutelzetters'
     and p.prosrc ~ 'app\.[a-z_]+'
     and not exists (
       select 1 from sleutel s where p.prosrc like '%' || s.instelling || '%'
     )

   order by 1;
$function$

;

revoke execute on function public.sleutelzetters()
  from public, anon, authenticated;
