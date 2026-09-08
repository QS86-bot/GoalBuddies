-- 0208_een_native_pushtoken_heeft_ook_een_vorm.sql — is_pushdienst() draaide alleen voor web, dus een ios- of android-token had acht tekens nodig en verder niets (QS8-305)
--
-- ROLLBACK-PAD:
--   alter table public.push_tokens drop constraint if exists push_tokens_native_vorm;
--   drop function if exists public.is_expo_pushtoken(text);
--   plus `create or replace` op `registreer_push_token(text, text, text, text)`
--   met de body uit 0179 — deze migratie herschrijft die functie ook, en zonder
--   die stap blijft de RPC `geen_expotoken` teruggeven terwijl er geen CHECK
--   meer is. ⚠️ In díé volgorde: de CHECK leunt op de functie, dus de drop van
--   de functie faalt zolang de constraint er nog staat.
--   ⚠️ Voegt alleen weigeringen toe; een terugzet verliest niets behalve de
--   bescherming zelf.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 0179 zette een bovengrens op `push_tokens.token` en schreef er in zijn eigen
-- kop bij wat het níét repareerde: `is_pushdienst()` draait alleen in de
-- web-tak. Voor `ios` en `android` was de enige eis `length(trim(p_token)) >= 8`
-- plus die bovengrens van 1000 — geen enkele toets op de vórm.
--
-- ⚠️ **De reden dat `is_pushdienst()` bestaat, geldt hier niet.** Een web-token
-- ís de endpoint-URL waar de meldingenjob elk uur een `fetch()` op doet, onder
-- `service_role`, vanuit het Supabase-netwerk — een SSRF-primitief (0117). Een
-- native token is geen adres: hij gaat als string in het veld `to` naar Expo's
-- eigen endpoint (`stuurExpo()` in `supabase/functions/notificaties/index.ts`,
-- `https://exp.host/--/api/v2/push/send`). Er is hier dus geen server die een
-- door de client gekozen adres bezoekt.
--
-- Wat er wél overblijft is stiller en niet nul: **een rij die nooit iets
-- ontvangt ziet er precies zo uit als een goede rij.** De job stuurt elke ronde
-- een verzoek aan Expo voor een token die per definitie niet bestaat, en er is
-- geen enkel signaal dat dat gebeurt.
--
-- ---------------------------------------------------------------------------
-- 📏 Eerst gemeten wat de app werkelijk aanlevert, en pas daarna een patroon
-- ---------------------------------------------------------------------------
--
-- Het issue noemde drie mogelijkheden — een Expo-token, een kale
-- FCM-registratietoken, of een APNs device token — en zei er terecht bij dat een
-- patroon dat een geldige token weigert erger is dan geen patroon. Dus eerst de
-- keten nagelopen in plaats van gekozen:
--
--   src/modules/notifications/expo-bron.ts   Notifications.getExpoPushTokenAsync()
--   node_modules/expo-notifications 57.0.13  levert `ExponentPushToken[…]`
--   supabase/functions/notificaties          POST naar exp.host, veld `to`
--
-- Het is er dus **één van de drie en niet drie**: de app vraagt nooit een
-- device-token op (`getDevicePushTokenAsync` komt in dit project niet voor), en
-- de ontvanger is Expo. Een kale FCM- of APNs-token zou aan de andere kant van
-- die keten ook nergens aankomen.
--
-- ---------------------------------------------------------------------------
-- Het patroon, en waarom het bewust ruim is
-- ---------------------------------------------------------------------------
--
--   ^Expo(nent)?PushToken\[[^][:space:]]+\]$
--
-- `ExpoPushToken[…]` staat erbij omdat Expo beide vormen uitdeelt en accepteert;
-- weigeren wat de eigen bibliotheek uitgeeft is precies de fout die het issue
-- benoemt.
--
-- ⚠️ **Wat er binnen de haken staat wordt niet begrensd** — niet op alfabet,
-- niet op lengte. Alleen: minstens één teken, geen `]`, geen witruimte. Een Expo
-- token is vandaag 41 tekens met een base64-achtige romp, maar dat is een
-- eigenschap van hun uitgifte en geen belofte aan ons. De haken zijn het deel
-- dat Expo's eigen parser nodig heeft; de romp is voor ons ondoorzichtig.
--
-- 📏 Geijkt tegen veertien vormen vóór het schrijven van deze migratie; de tabel
-- staat in `tests/rls/pushtokengrens.test.ts`. De drie Expo-vormen komen door,
-- een kale FCM-registratie (157 tekens), een APNs device token (64 hex), een
-- web-endpoint, lege haken, witruimte of een `]` in de romp, en rommel vóór of
-- ná de haken niet.
--
-- ---------------------------------------------------------------------------
-- ⚠️ Waarom web géén CHECK krijgt, en dat geen vergetelheid is
-- ---------------------------------------------------------------------------
--
-- `is_pushdienst()` staat sinds 0117 in de RPC en nergens anders. De verleiding
-- is om hem hier meteen in een CHECK te zetten, en dat is de verkeerde ruil: dat
-- is een **allowlist van hostnamen**, en die verandert buiten ons om — een
-- browser die van pushdienst wisselt, een nieuwe Mozilla-regio. Een allowlist in
-- een CHECK betekent een migratie per keer dat de buitenwereld schuift, en
-- ondertussen weigert de database geldige abonnementen.
--
-- De vórm van een Expo-token is een ander soort feit: hij is van Expo's parser
-- en niet van een netwerktopologie. Vandaar hier wel een CHECK en daar niet.
--
-- ---------------------------------------------------------------------------
-- 📏 Waarom dit nú goedkoop is
-- ---------------------------------------------------------------------------
--
-- `add constraint … check` valideert bestaande rijen. Gemeten op de dráaiende
-- database op 08-09-2026, vóór het schrijven van deze migratie:
--
--   select platform, count(*) from public.push_tokens group by platform;  -- 0 rijen
--
-- De tabel is leeg, op elk platform. Er is dus niets te valideren en niets te
-- breken. **Tel het opnieuw vóór je dit toepast**, met dezelfde query plus:
--
--   select count(*) from public.push_tokens
--    where platform <> 'web' and not public.is_expo_pushtoken(token);
--
-- Is die niet nul, dan zijn dat dode rijen: een token die niet aan Expo's vorm
-- voldoet kán daar niets ontvangen. Ze horen weg en het apparaat registreert
-- zich bij de volgende start opnieuw.
--
-- ⚠️ Het issue schreef die leegte toe aan "`expo-notifications` staat nog niet
-- in de app". Dat klopt niet meer: de bibliotheek staat in `package.json`
-- (~57.0.13) en `app/_layout.tsx` zet `expoPush` op native. Wat wél waar is, is
-- dat er geen native build uitgerold is — productie is de webbundel op
-- Hostinger, en daar loopt `Platform.OS === 'web'`. De uitkomst is dezelfde, de
-- reden niet, en die tweede is degene die verandert zodra er een build komt.
-- De verouderde kop in `src/modules/notifications/tokens.ts` staat los hiervan.

create or replace function public.is_expo_pushtoken(p_token text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  -- Zie de kop: de haken zijn de vorm die Expo's parser nodig heeft, de romp is
  -- voor ons ondoorzichtig en wordt daarom niet begrensd. Wél: minstens één
  -- teken, geen `]` (dan is de vorm dubbelzinnig) en geen witruimte.
  select p_token ~ '^Expo(nent)?PushToken\[[^][:space:]]+\]$';
$$;

comment on function public.is_expo_pushtoken(text) is
  'Of een string de vorm van een Expo-pushtoken heeft. Bewust ruim: alleen de '
  'haken, niet het alfabet of de lengte van de romp. Zie 0208 en QS8-305.';

-- ⚠️ Onwrikbare regel 4: `authenticated` staat er met zoveel woorden bij. In
--    Supabase deelt `alter default privileges` élke nieuwe functie in `public`
--    uit aan `anon`, `authenticated` én `service_role`, en `from public, anon`
--    houdt precies de rol over waaronder iedere ingelogde gebruiker draait.
--
-- ⚠️ `authenticated` krijgt niets terug. `is_pushdienst()` is daarvoor het
--    precedent: die wordt alleen aangeroepen ván binnen een `security
--    definer`-functie, en dan geldt het recht van de eigenaar.
--    `tests/rls/functiegrants.test.ts` legt elke functie die `authenticated` mag
--    uitvoeren naast de grant-regels; een functie zonder grant hoort daar niet
--    in te staan.
revoke execute on function public.is_expo_pushtoken(text)
  from public, anon, authenticated;

-- ⚠️⚠️ **`service_role` wél, en met zoveel woorden — dit is waar het precedent
--    níét draagt.** `is_pushdienst()` staat alleen in een functielichaam; deze
--    staat óók in een CHECK hieronder, en een CHECK wordt geëvalueerd als de
--    **schrijvende** rol. Wie in `push_tokens` schrijft, moet deze functie dus
--    kunnen uitvoeren.
--
--    📏 Gemeten met `revoke execute … from service_role`: `update push_tokens
--    set last_seen_at = now()` als `service_role` geeft dan `permission denied
--    for function is_expo_pushtoken` — op een UPDATE die `token` noch
--    `platform` aanraakt. (`delete` overleeft het, want een CHECK draait niet
--    op DELETE; dat is het opruimpad van `stuurWeb()`.)
--
--    Zonder deze regel werkt dat vandaag toch, en dát is het probleem:
--    `service_role` erft EXECUTE uit Supabase's `alter default privileges`.
--    Onwrikbare regel 4 gaat precies daarover — *een recht zonder grant-regel
--    is geërfd en niet besloten*. Gevonden in de security-review op deze
--    branch, zelf nagemeten.
grant execute on function public.is_expo_pushtoken(text)
  to service_role;

-- ---------------------------------------------------------------------------
-- De grendel op de kolom
-- ---------------------------------------------------------------------------
--
-- ⚠️ Dezelfde redenering als in 0179: `registreer_push_token()` is vandaag de
--    enige schrijver, en dat is een toestand en geen grendel. `service_role`
--    loopt langs de RPC heen. Een CHECK op de kolom niet.

alter table public.push_tokens
  drop constraint if exists push_tokens_native_vorm;

alter table public.push_tokens
  add constraint push_tokens_native_vorm check (
    platform = 'web' or public.is_expo_pushtoken(token)
  );

comment on constraint push_tokens_native_vorm on public.push_tokens is
  'Een ios- of android-token gaat naar Expo en moet dus Expo''s vorm hebben; '
  'anders staat er een rij die nooit iets ontvangt en er wel goed uitziet. '
  'Web draagt een endpoint-URL en heeft zijn eigen toets in de RPC. Zie 0208 '
  'en QS8-305.';

-- ---------------------------------------------------------------------------
-- En een net antwoord ernaast — twee lagen, en ze doen niet hetzelfde
-- ---------------------------------------------------------------------------
--
-- De CHECK is de grendel; hij blijft staan als er ooit een tweede schrijver
-- komt. In zijn eentje geeft hij de gebruiker een ruwe 23514 waar de client
-- niets mee kan — precies de klacht die 0067 voor `geen_websleutels` oploste en
-- 0179 voor `token_te_lang`. Dus ook hier een tak met een `reason`.
--
-- ⚠️ **Dit is geen tweede grens maar een tweede laag**, en dus een kopie die uit
--    elkaar kan lopen. `tests/rls/pushtokengrens.test.ts` toetst ze apart: de
--    RPC-tak via de gewone weg, de CHECK via een schrijver die de RPC overslaat,
--    plus een test die vastpint dat ze op dezelfde vormen ja en nee zeggen.
--
-- ⚠️ **De volgorde van de takken is niet vrij.** De lengtegrens van 0179 staat
--    vóór de platformtoets en dus vóór deze; dat blijft zo. Een token van 5000
--    tekens hoort `token_te_lang` te heten en niet `geen_expotoken` — de
--    gebruiker leest de reden, en de eerste is de bruikbare.

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
    -- ⚠️ QS8-305. Dit is de tak die tot 0208 leeg was op alles behalve het op
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
