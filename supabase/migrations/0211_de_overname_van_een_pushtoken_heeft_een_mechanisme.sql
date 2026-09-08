-- 0211_de_overname_van_een_pushtoken_heeft_een_mechanisme.sql — de `delete` uit
-- `registreer_push_token()` gaat weg; de `on conflict` is het overnamemechanisme
-- en was dat al (QS8-367)
--
-- ROLLBACK-PAD:
--   Zet `registreer_push_token()` terug naar de vorm van 0209, dat wil zeggen
--   met `delete from push_tokens where token = p_token and user_id <> v_uid;`
--   vóór de insert. Het is een `create or replace`, dus grants en
--   `comment on function` blijven staan. Daarnaast:
--     alter table public.push_tokens drop constraint push_tokens_token_getrimd;
--
--   ⚠️ Draai die twee samen terug of geen van beide. De constraint bestaat
--      precies om te dragen wat het weghalen van de `delete` aanneemt; laat je
--      hem staan zonder de `delete`, dan klopt het nog steeds — laat je hem
--      wég mét de `delete` terug, dan sta je weer waar 0209 stond.
--
--   ⚠️ Wat níét terug te draaien is: de `id` en `created_at` van rijen die
--      tussen deze migratie en de rollback van eigenaar gewisseld zijn. Die
--      dragen dan de waarden van de eerste registreerder in plaats van van de
--      laatste. 📏 Niets leest die twee kolommen, dus er hangt geen gedrag aan —
--      maar het is geen herstelbare toestand en dat hoort hier te staan.
--
-- ---------------------------------------------------------------------------
-- Wat er stuk was — en vooral wat er níét stuk was
-- ---------------------------------------------------------------------------
--
-- Gevonden in de security-review op QS8-305. **Geen autorisatiegat.** Het is een
-- regel die als grendel leest en er geen is.
--
-- 📏 `registreer_push_token()` schrijft overal `trim(p_token)`, behalve op één
--    plek — de `delete`. Die staat er zo sinds 0055 en is nooit meeveranderd,
--    ook niet toen de lengtetoetsen (0179) en de vormtoets (0209) erbij kwamen.
--
-- Met `'   ExponentPushToken[X]   '` miste de `delete` dus. De overname gebeurde
-- daarna alsnog: de `insert` trimt wél, botst op de bestaande rij, en
-- `on conflict (token) do update set user_id = excluded.user_id` zet hem om.
--
-- ⚠️ **De uitkomst is in beide gevallen identiek** — het token belandt bij de
--    laatste registreerder. Het verschil zit in welke kolommen de overname
--    overleven: langs de `delete` komt er een verse rij, langs de `on conflict`
--    blijven `id` en `created_at` van de vorige eigenaar staan.
--
-- ---------------------------------------------------------------------------
-- Waarom weghalen en niet trimmen
-- ---------------------------------------------------------------------------
--
-- Het issue noemt twee opties: de `delete` laten trimmen, of hem weghalen.
--
-- **Weghalen**, en de reden is meetbaar: er is geen bereikbaar geval waarin de
-- `delete` iets doet dat de `on conflict` niet doet.
--
-- 📏 `authenticated` heeft op `push_tokens` SELECT, DELETE en REFERENCES — geen
--    INSERT en geen UPDATE — en er is geen insert-policy. Deze
--    `SECURITY DEFINER`-functie is de enige weg naar binnen, en ze trimt altijd.
--
-- Trimmen zou het verschil ook wegnemen, maar laat twee mechanismen staan die
-- voor altijd hetzelfde moeten blijven doen. Dat is een naad (onwrikbare regel
-- 18) op een plek waar er geen hoeft te zijn.
--
-- ---------------------------------------------------------------------------
-- De premisse is nu een grendel en niet langer een toestand
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ De eerste versie van deze migratie schreef "er kán dus geen rij bestaan
--    met spaties eromheen". 📏 Dat was voor **native** waar en voor **web**
--    niet, en de security-review heeft het nagespeeld: `push_tokens_native_vorm`
--    roept `is_expo_pushtoken()` aan en die is geankerd, dus zelfs
--    `service_role` krijgt `23514` op `'  ExponentPushToken[x]  '`. Maar die
--    CHECK luidt `platform = 'web' or is_expo_pushtoken(token)` — voor web toetst
--    hij niets, en `is_pushdienst()` staat alléén in de RPC. `service_role` kon
--    er dus `'  https://fcm.googleapis.com/fcm/send/…  '` in zetten, en dán
--    maakte deze functie er twee rijen van waar de oude `delete` er één van
--    maakte. Beide adressen werken bij `fetch()`; het slachtoffer bleef
--    meldingen krijgen op een overgenomen toestel.
--
-- Vandaag is dat onbereikbaar — er bestaat geen enkele `service_role`-schrijver,
-- de meldingenjob doet alleen `select` en `delete`. Maar 0209 schreef zelf op
-- waarom dat te weinig is: **dat is een toestand en geen grendel.** Daarom staat
-- de constraint hieronder. Hij kost niets, hij maakt de onderbouwing van deze
-- migratie waar in plaats van waarschijnlijk, en hij hoort bij dit besluit —
-- niet bij een volgend.
--
-- 📏 `btrim(x)` en `trim(x)` doen in Postgres exact hetzelfde: allebei strippen
--    ze alléén spaties, geen tabs en geen regeleindes. De constraint is dus
--    precies de normalisatie die de functie zelf toepast, en de RPC kan geen
--    waarde produceren die hij weigert. Een token mét een tab komt sowieso niet
--    binnen: `is_expo_pushtoken()` en `is_pushdienst()` zijn allebei geankerd én
--    sluiten `[:space:]` uit.
--
-- 📏 Op productie (`wehgocadxehottiiyvsc`) staan 0 rijen in `push_tokens`, dus
--    er valt niets te normaliseren voordat dit erop staat.
--
-- ⚠️ **De dossierrij van 21-08 is nagelopen, zoals het issue vraagt.** Die
--    beschrijft de overname als "haalt een token weg bij de vorige eigenaar en
--    zet hem op de aanroeper", en dat blijft precies zo — alleen doet de
--    `on conflict` het, en deed hij het al. De rij is bijgewerkt zodat hij niet
--    langer naar een regel wijst die er niet meer staat.
--
-- Volledige afweging: docs/decisions/2026-09-08-een-tweede-mechanisme-is-geen-slot.md
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- De grendel onder de premisse
-- ---------------------------------------------------------------------------

do $migratie$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.push_tokens'::regclass
      and conname  = 'push_tokens_token_getrimd'
  ) then
    alter table public.push_tokens
      add constraint push_tokens_token_getrimd check (token = btrim(token));
  end if;
end
$migratie$;

comment on constraint push_tokens_token_getrimd on public.push_tokens is
  'QS8-367. Draagt de aanname onder 0211: de overname loopt sinds die migratie '
  'alleen nog via `on conflict (token)`, en die matcht op de exacte string. Een '
  'ongetrimde rij zou een tweede rij voor hetzelfde apparaat opleveren, en dan '
  'blijft de vorige eigenaar meldingen ontvangen. `registreer_push_token()` '
  'trimt zelf, dus deze CHECK raakt alleen een schrijver die daarbuiten om gaat.';

create or replace function public.registreer_push_token(p_token text, p_platform text, p_p256dh text DEFAULT NULL::text, p_auth text DEFAULT NULL::text)
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
