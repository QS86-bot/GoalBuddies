-- 0174_een_bovengrens_op_wat_een_pushtoken_mag_zijn.sql — drie kolommen op push_tokens droegen een waarde die de client kiest en die onbegrensd mocht groeien (QS8-297)
--
-- ROLLBACK-PAD:
--   alter table public.push_tokens drop constraint if exists push_tokens_token_len;
--   alter table public.push_tokens drop constraint if exists push_tokens_sleutels_len;
--   ⚠️ Voegt alleen weigeringen toe; een terugzet verliest niets behalve de
--   bescherming zelf.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-154 zette veertien tekstkolommen dicht. Bij het nalopen van de rest bleef
-- `push_tokens.token` over. 📏 Opnieuw gemeten op de draaiende database, over
-- élke `text`-kolom van élke basistabel in `public` (views tellen niet mee, die
-- dragen geen constraint):
--
--   ai_jobs.error            geen grens   — door de server geschreven
--   ai_jobs.input_hash       geen grens   — een hash, begrensd van vorm
--   ai_jobs.model            geen grens   — door de server geschreven
--   notifications_sent.ref_type  geen grens — door de server geschreven
--   points_ledger.ref_type   geen grens   — door de server geschreven
--   push_tokens.token        geen grens   — ⚠️ **de waarde komt van de client**
--
-- ⚠️ **Het waren er zes en niet twee**, en dat verschil zit niet in
-- slordigheid: het issue telde de kolommen die een mens zou noemen, deze query
-- telt wat er staat. Vijf ervan worden door de server geschreven en zijn een
-- andere vraag (kan een foutmelding onbegrensd groeien?); één is de klasse van
-- dit issue.
--
-- ---------------------------------------------------------------------------
-- Het zijn drie kolommen en niet één, en dat is geen verbreding
-- ---------------------------------------------------------------------------
--
-- `p256dh` en `auth` staan in de bovenstaande lijst niet als "geen grens", want
-- ze dragen wél een CHECK — maar die zegt alleen *bij web zijn ze allebei
-- gevuld*, en niets over hun lengte. Ze komen uit dezelfde RPC, uit hetzelfde
-- INSERT-statement, van dezelfde client.
--
-- **Alleen `token` begrenzen is daarom een lek dat verplaatst.** Wie een
-- megabyte kwijt wil, zet hem in `p256dh`. Dat is de vorm van regel 18: elk
-- onderdeel klopt en het geheel lekt.
--
-- ---------------------------------------------------------------------------
-- De getallen, en waarom ze niet gegokt zijn
-- ---------------------------------------------------------------------------
--
-- ⚠️ Een grens die een geldige token weigert is erger dan geen grens, dus eerst
-- meten wat er werkelijk langskomt:
--
--   web endpoint-URL   FCM ~150–200 tekens, Mozilla ~180, Apple ~250
--   Expo-pushtoken     `ExponentPushToken[…]`, 41 tekens
--   FCM-registratie    ~163–200 tekens
--   APNs device token  64 hex
--   p256dh             65 octetten ongecomprimeerd → 87–88 tekens base64url
--                      (RFC 8291; `webpush-crypto.ts` werpt bij afwijking)
--   auth               16 octetten → 22–24 tekens base64url
--
-- **1000 voor `token`** is de grens die dit project al voor elke URL gebruikt
-- (`attachment_url`, `image_url`, `avatar_url`) en ruim vier keer de langste
-- echte waarde. **255 voor de twee sleutels** is bijna drie keer de langste;
-- die twee liggen bovendien vast in RFC 8291 en kunnen niet groeien zonder dat
-- de crypto meeverandert.
--
-- ---------------------------------------------------------------------------
-- ⚠️ Wat dit níét repareert
-- ---------------------------------------------------------------------------
--
-- `is_pushdienst()` draait **alleen voor `platform = 'web'`** — nagemeten in
-- `pg_get_functiondef(registreer_push_token)`. Voor `ios` en `android` staat er
-- geen enkele vormtoets op de token: acht tekens is genoeg. Deze migratie zet
-- daar een bovengrens op en niets meer; of een native token ook een vórm hoort
-- te hebben, is een eigen vraag en een eigen issue (QS8-305).
--
-- Ook níét: de vijf server-geschreven kolommen uit de meting hierboven. Of een
-- foutmelding in `ai_jobs.error` onbegrensd kan groeien is een andere vraag met
-- een ander antwoord — daar is de schrijver de server, en een grens die een
-- foutmelding afkapt kan een diagnose kosten.
--
-- ---------------------------------------------------------------------------
-- ⚠️ De grens hoort op de kolom en niet in de functie
-- ---------------------------------------------------------------------------
--
-- `registreer_push_token()` is vandaag de enige schrijver, en dat is een
-- toestand en geen grendel — dezelfde les als bij domeinregel 3 en dezelfde als
-- bij 0172. Een grens die alleen in de RPC staat, verdwijnt bij de volgende
-- schrijver, en `service_role` loopt overal langsheen. Een CHECK op de kolom
-- niet.

alter table public.push_tokens
  drop constraint if exists push_tokens_token_len;

alter table public.push_tokens
  add constraint push_tokens_token_len check (char_length(token) <= 1000);

alter table public.push_tokens
  drop constraint if exists push_tokens_sleutels_len;

alter table public.push_tokens
  add constraint push_tokens_sleutels_len check (
    (p256dh is null or char_length(p256dh) <= 255)
    and (auth is null or char_length(auth) <= 255)
  );

comment on constraint push_tokens_token_len on public.push_tokens is
  'De client kiest deze waarde en geeft hem als RPC-argument mee. 1000 is de '
  'grens die dit project voor elke URL gebruikt en ruim vier keer de langste '
  'echte token. Zie 0174 en QS8-297.';

comment on constraint push_tokens_sleutels_len on public.push_tokens is
  'p256dh is 65 octetten en auth 16 (RFC 8291); 255 is bijna drie keer de '
  'langste. Zonder deze grens verplaatst de grens op `token` het lek alleen. '
  'Zie 0174 en QS8-297.';

-- ---------------------------------------------------------------------------
-- En een net antwoord ernaast — twee sloten, en ze doen niet hetzelfde
-- ---------------------------------------------------------------------------
--
-- De CHECK is de grendel; hij blijft staan als er ooit een tweede schrijver
-- komt. Maar in zijn eentje geeft hij de gebruiker een ruwe 23514 waar de
-- client niets mee kan — precies de klacht die 0067 voor `geen_websleutels`
-- oploste. Dus ook hier een tak met een `reason`.
--
-- ⚠️ **Dit is geen tweede grens maar een tweede laag.** Ze staan hier met
--    hetzelfde getal, en dat is een kopie die uit elkaar kan lopen. De test
--    `tests/rls/pushtokengrens.test.ts` toetst ze daarom apart: de RPC-tak via
--    de gewone weg, de CHECK via een schrijver die de RPC overslaat. Gaat er
--    één weg, dan is er precies één test rood.

create or replace function public.registreer_push_token(
  p_token    text,
  p_platform text,
  p_p256dh   text default null,
  p_auth     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  if char_length(trim(p_token)) > 1000 then
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
    if char_length(v_p256dh) > 255 or char_length(v_auth) > 255 then
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
    v_p256dh := null;
    v_auth   := null;
  end if;

  delete from push_tokens where token = p_token and user_id <> v_uid;

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
$$;

revoke execute on function public.registreer_push_token(text, text, text, text)
  from public, anon, authenticated;
grant  execute on function public.registreer_push_token(text, text, text, text)
  to authenticated;
