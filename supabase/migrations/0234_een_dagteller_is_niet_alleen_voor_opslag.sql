-- 0234_een_dagteller_is_niet_alleen_voor_opslag.sql — de vorm van 0233 wordt
-- gedeeld met `push_tokens`, en heet daarom niet langer naar opslag.
--
-- ROLLBACK-PAD:
--   -- de tellers van 0233 en 0214 terugzetten uit die twee bestanden, en:
--   drop function if exists public.dagteller_stand(text, text, text, interval);
--   drop function if exists public.tel_dagteller(text, text, text, integer, interval, text, integer);
--   alter table dagtellers rename column domein to bucket_id;
--   alter table dagtellers rename to opslag_dagtellers;
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten op de lokale stack, 09-09-2026, via `registreer_push_token()` als
--    een ingelogde gebruiker:
--
--      na 20: 20 rijen
--      nr 21 -> {"ok": false, "reason": "te_veel_tokens"}
--      na wissen: 0 rijen
--      opnieuw   -> {"ok": true}          <-- de bug
--
--    `begrens_pushtokens()` (0214) telt `push_tokens` zelf binnen een venster van
--    een etmaal, en de voorcontrole in `registreer_push_token()` doet dat
--    nóg een keer. Wie zijn tokens wist, mag weer twintig.
--
-- ⚠️ Dat is dezelfde vorm als QS8-399, en QS8-401 legt uit waarom die daar
--    bewust buiten bleef: hier verdwijnt de rij écht bij een `delete` en de rij
--    *ís* het adres, dus het is een snelheidsrem en geen opslagrem. Wat het niet
--    minder maakt: onwrikbare regel 5 vraagt een limiet per gebruiker per dag, en
--    een limiet die je met een `delete` reset is dat niet.
--
-- ---------------------------------------------------------------------------
-- 1. De naam draagt niet langer één gebruiker
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **`opslag_dagtellers` heette naar zijn eerste gebruiker, en dat is precies
--    hoe een vorm níét gedeeld wordt.** Wie hier een teller voor iets anders dan
--    opslag bij wil zetten, leest die naam en bouwt een tweede tabel — en dan
--    staat de familie weer uiteen. Dat is de fout die 0233 kwam repareren
--    (0130 → 0226 → 0228, elke keer gekopieerd), één laag hoger.
--
-- ⚠️ **Nu kan het nog gratis:** 0233 staat op `main` maar nog niet op productie
--    (die staat op `0221`), dus er is geen gevulde tabel om te verhuizen. Over
--    een maand is dit een migratie op data.
--
-- ⚠️ De hernoemingen staan in een `do`-blok met een bestaanstoets, zodat deze
--    migratie tegen zijn eigen uitgangstoestand idempotent is (onwrikbare regel
--    20). Draait hij twee keer, dan doet de tweede keer niets.

do $$
begin
  if to_regclass('public.opslag_dagtellers') is not null then
    alter table opslag_dagtellers rename to dagtellers;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'dagtellers' and column_name = 'bucket_id'
  ) then
    alter table dagtellers rename column bucket_id to domein;
  end if;
end $$;

comment on table dagtellers is
  'Eén rij per domein, soort en sleutel: hoeveel handelingen er in het lopende '
  'venster wáren. Alleen geschreven door tel_dagteller() (0234). '
  '⚠️ Bewust géén rij per handeling: dat zou de teller zelf een groeivector '
  'maken — zelfde afweging als invite_preview_limits (0131).';

-- ⚠️ De allowlist krijgt er een soort bij. Zonder `gebruiker` zou de teller van
--    `push_tokens` op de CHECK vallen — en dat is precies wat die CHECK moet
--    doen: een nieuwe soort komt er met een regel in, niet stilzwijgend.
alter table dagtellers drop constraint if exists opslag_dagtellers_soort_check;
alter table dagtellers drop constraint if exists dagtellers_soort_check;
alter table dagtellers add constraint dagtellers_soort_check
  check (soort in ('uploader', 'groep', 'gebruiker'));

-- ---------------------------------------------------------------------------
-- 2. Tellen, en apart: stand opvragen
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Twee functies en niet één, en dat is de kern van criterium 3.** De
--    trigger hoogt op; `registreer_push_token()` wil alleen *kijken* of er nog
--    ruimte is, zodat hij een nette `{ok:false, reason}` kan geven in plaats van
--    de gebruiker een ruwe 23514 te laten zien. Met alleen een ophoogfunctie zou
--    die voorcontrole zijn eigen telling moeten doen — en dan lopen de twee weer
--    uiteen, wat dit issue nu juist opheft.
--
-- ⚠️ `p_erbij` is nieuw: `begrens_pushtokens()` is een statement-trigger met een
--    transitietabel en voegt er meerdere tegelijk toe. De drie emmertellers laten
--    hem op de standaardwaarde 1 staan.

drop function if exists public.tel_opslag_upload(text, text, text, integer, interval, text);

create or replace function public.tel_dagteller(
  p_domein  text,
  p_soort   text,
  p_sleutel text,
  p_plafond integer,
  p_venster interval,
  p_wat     text,
  p_erbij   integer default 1
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_aantal integer;
begin
  -- ⚠️ **Een handeling die niets toevoegde, kan het plafond niet doorbroken
  --    hebben.** Zelfde tak en dezelfde reden als in 0214: een
  --    `insert … on conflict do update` die volledig op de UPDATE-tak landt, ís
  --    een INSERT-statement en vuurt de trigger dus af — met nul rijen.
  if p_erbij <= 0 then
    return 0;
  end if;

  insert into dagtellers as t (domein, soort, sleutel, venster_start, aantal)
  values (p_domein, p_soort, p_sleutel, now(), p_erbij)
  on conflict (domein, soort, sleutel) do update
    set venster_start = case
          when t.venster_start < now() - p_venster then now()
          else t.venster_start
        end,
        aantal = case
          when t.venster_start < now() - p_venster then p_erbij
          else t.aantal + p_erbij
        end
  returning t.aantal into v_aantal;

  if v_aantal > p_plafond then
    raise exception 'Te veel % (%).', p_wat, v_aantal
      using errcode = 'check_violation';
  end if;

  return v_aantal;
end;
$$;

revoke execute on function public.tel_dagteller(text, text, text, integer, interval, text, integer)
  from public, anon, authenticated;

-- ⚠️ Leest alleen. Geeft 0 als er geen rij is óf als het venster verlopen is —
--    dan begint `tel_dagteller()` immers ook opnieuw. Zou hij de oude stand
--    teruggeven, dan weigert de voorcontrole terwijl de trigger doorlaat.
create or replace function public.dagteller_stand(
  p_domein  text,
  p_soort   text,
  p_sleutel text,
  p_venster interval
)
returns integer
language sql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $$
  select coalesce(
    (select t.aantal from dagtellers t
      where t.domein = p_domein and t.soort = p_soort and t.sleutel = p_sleutel
        and t.venster_start >= now() - p_venster),
    0);
$$;

revoke execute on function public.dagteller_stand(text, text, text, interval)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. De drie emmertellers volgen de nieuwe naam
-- ---------------------------------------------------------------------------
--
-- ⚠️ Woordelijk de lichamen van 0233, met alleen de functienaam vervangen. De
--    zinnen blijven per emmer — zie de aantekening daar over regel 18 vraag 4.

create or replace function public.bewaak_bewijsfoto_aantal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  uploader text := (storage.foldername(new.name))[2];
begin
  if new.bucket_id <> 'bewijsfotos' or uploader is null then
    return new;
  end if;

  -- TODO(paid-tier): tien per etmaal is een rem tegen het vollopen van de
  -- gratis tier en geen productkeuze.
  perform tel_dagteller('bewijsfotos', 'uploader', uploader, 10, interval '1 day',
                        'bewijsfoto''s vandaag');

  return new;
end;
$$;

revoke execute on function public.bewaak_bewijsfoto_aantal() from public, anon, authenticated;

create or replace function public.bewaak_chatfoto_aantal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  groep    text := (storage.foldername(new.name))[1];
  uploader text := (storage.foldername(new.name))[2];
begin
  if new.bucket_id <> 'chatfotos' or groep is null then
    return new;
  end if;

  -- TODO(paid-tier): twintig per groep per etmaal is een rem tegen het vollopen
  -- van de gratis tier en geen productkeuze.
  perform tel_dagteller('chatfotos', 'groep', groep, 20, interval '1 day',
                        'foto''s in deze groep vandaag');

  if uploader is not null then
    -- TODO(paid-tier): idem. Acht is lager dan twintig zodat één lid de groep
    -- niet kan stilleggen.
    perform tel_dagteller('chatfotos', 'uploader', groep || '/' || uploader, 8,
                          interval '1 day', 'foto''s van deze persoon vandaag');
  end if;

  return new;
end;
$$;

revoke execute on function public.bewaak_chatfoto_aantal() from public, anon, authenticated;

create or replace function public.bewaak_avatar_aantal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  map    text := (storage.foldername(new.name))[1];
  aantal integer;
begin
  if new.bucket_id <> 'avatars' or map is null then
    return new;
  end if;

  -- De grens van 0130: hoeveel er tegelijk stáán. Zonder venster, met opzet.
  select count(*) into aantal
  from storage.objects o
  where o.bucket_id = 'avatars'
    and (storage.foldername(o.name))[1] = map;

  if aantal >= 10 then
    raise exception 'Te veel avatars voor deze gebruiker (%).', aantal
      using errcode = 'check_violation';
  end if;

  -- TODO(paid-tier): en hoeveel er per etmaal bíj zijn gekomen — de grens die
  -- 0130 niet had.
  perform tel_dagteller('avatars', 'uploader', map, 10, interval '1 day',
                        'avatars van deze gebruiker vandaag');

  return new;
end;
$$;

revoke execute on function public.bewaak_avatar_aantal() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. `push_tokens` telt voortaan hetzelfde
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De transitietabel blijft, en dat is geen restant.** Deze trigger is
--    `after insert … for each statement` met `referencing new table as nieuw`,
--    want hij moet weten hoevéél rijen dit statement toevoegde. Bij de emmers is
--    dat er altijd één (rijtrigger); hier kan het een batch zijn.
--
-- ⚠️ De noodgrens `rem_pushtokens` (0214) blijft ongemoeid. Die telt binnen één
--    verzoek en niet binnen een etmaal, en `remdekking.test.ts` bewaakt dat elke
--    dagteller er een heeft.

create or replace function public.begrens_pushtokens()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_batch integer;
begin
  if (select auth.uid()) is null then return null; end if;

  select count(*) into v_batch from nieuw;

  -- ⚠️ De lege-batchtak zit sinds 0234 in `tel_dagteller()` zelf, maar hij staat
  --    hier ook: zonder deze regel schrijft een statement dat niets toevoegde
  --    wél een tellerrij aan (met `aantal = 0`), en dat is rommel in een tabel
  --    die anders alleen bestaat waar er iets gebeurd is.
  if v_batch = 0 then return null; end if;

  perform tel_dagteller('push_tokens', 'gebruiker', (select auth.uid())::text,
                        pushtokens_plafond(), interval '1 day',
                        'pushtokens in één dag', v_batch);

  return null;
end $$;

revoke execute on function public.begrens_pushtokens()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. De voorcontrole leest dezelfde teller
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Het lichaam hieronder komt uit de dráaiende database** (`pg_get_functiondef()`)
--    en niet uit een migratiebestand. CLAUDE.md zegt dat die eerste de waarheid
--    is; de tweede loopt achter zodra er een `create or replace` tussen zat.
--    Alleen de voorcontrole is vervangen.

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
  -- ⚠️⚠️ **Sinds 0234 leest deze voorcontrole dezelfde bron als de trigger, en
  --    dat ís het punt van QS8-401.** Hier stond een eigen `count(*)` over
  --    `push_tokens`; `begrens_pushtokens()` deed dezelfde telling nog een keer.
  --    Twee tellingen naast elkaar lopen uiteen zodra er één verandert, en dan
  --    zegt deze functie `ok` terwijl de trigger een ruwe 23514 werpt — precies
  --    de nette weigering die 0179, 0209 en 0369 kwamen bouwen.
  --
  -- ⚠️ En het repareert de bug zelf: een `count(*)` telt de rijen die er stáán,
  --    dus wie zijn tokens wist mocht er weer twintig. 📏 Gemeten vóór 0234:
  --    twintig registreren, alles wissen, opnieuw registreren → `{"ok": true}`.
  --
  -- ⚠️⚠️ **`greatest` van de teller én de werkelijkheid, en die tweede helft is
  --    door een bestaande test afgedwongen.** 📏 `pushtokenplafond.test.ts` zet
  --    een gebruiker met een bevoorrechte schrijver op `plafond + 1` rijen — geen
  --    kunstgreep, maar een backfill, een tweede schrijver of een later verláágd
  --    plafond. Die rijen komen binnen zónder claim, dus `begrens_pushtokens()`
  --    keert bovenaan om en de teller weet er niets van. Met alleen
  --    `dagteller_stand()` liet deze functie daarna een échte nieuwe token door,
  --    en dat is precies de grendel die die test bewaakt.
  --
  --    De blijvende teller doet wat hij moet doen — een `delete` verlaagt hem
  --    niet — en de telling van de tabel vangt wat er buiten de teller om
  --    binnenkwam. De hoogste van de twee wint.
  --
  -- ⚠️ **Deze voorcontrole is daarmee nooit soepeler dan de trigger**, en dat is
  --    de richting die telt: hij weigert eerder, dus de gebruiker krijgt een
  --    `reason` en nooit een ruwe 23514. Andersom zou het een gat zijn.
  if not exists (select 1 from push_tokens
                  where token = trim(p_token) and user_id = v_uid)
     and greatest(
           dagteller_stand('push_tokens', 'gebruiker', v_uid::text, interval '1 day'),
           (select count(*)::integer from push_tokens t
             where t.user_id = v_uid and t.created_at > now() - interval '1 day')
         ) >= pushtokens_plafond() then
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
