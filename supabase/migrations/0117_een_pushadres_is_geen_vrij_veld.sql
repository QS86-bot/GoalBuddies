-- 0117 — Het pushadres van een webabonnement wordt gecontroleerd
--
-- ROLLBACK-PAD:
--   Herstel `registreer_push_token()` uit 0067 (die versie toetst voor
--   `platform = 'web'` alleen dat er sleutels meekomen) en:
--     drop function if exists public.is_pushdienst(text);
--   Er is geen datamigratie. Bestaande rijen blijven staan; zie hieronder
--   waarom er bewust níét opgeschoond wordt.
--
-- ---------------------------------------------------------------------------
-- Waarom dit bestaat
-- ---------------------------------------------------------------------------
--
-- Bij een webabonnement ís het veld `push_tokens.token` de endpoint-URL van de
-- browserleverancier. `verstuurWebPush()` doet daar elk uur een `fetch()` op,
-- onder `service_role`, vanuit het Supabase-netwerk.
--
-- ⚠️ **En niemand keek naar dat adres.** `registreer_push_token()` toetste voor
--    `platform = 'web'` alleen dát er een `p256dh` en een `auth` meekwamen. Een
--    ingelogde gebruiker kon er elk willekeurig adres in zetten. Gemeten op de
--    lokale stack, als gewone gebruiker:
--
--      registreer_push_token('http://169.254.169.254/latest/meta-data/',
--                            'web', 'p', 'a')  →  {"ok": true}
--
--    Dat is een SSRF-primitief: de meldingenjob wordt de aanvrager. En omdat
--    404 en 410 de rij opruimen terwijl elke andere uitkomst hem laat staan, is
--    het bovendien een orakel — de aanvaller leest via zijn eigen
--    `push_tokens`-SELECT af of het doel bestond.
--
-- ⚠️ **Vandaag gebeurt er niets, en dat is precies het probleem.** `stuur()`
--    slaat webtokens over zolang `vapidUitOmgeving()` `null` geeft. Dit
--    bewapent zichzelf op de dag dat `VAPID_PRIVATE_KEY` gezet wordt — en dat
--    is blijkens `.env.example` en QS8-124 het eerstvolgende wapenfeit. Dat is
--    de verkeerde volgorde om dit in te ontdekken.
--
-- ---------------------------------------------------------------------------
-- De vorm van de grendel
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Een allowlist en geen blocklist.** Een blocklist op RFC1918 en
--    169.254.169.254 laat DNS-namen door die naar diezelfde adressen wijzen, en
--    laat elke cloud-metadatadienst door die je niet kent. De verzameling
--    echte pushdiensten is klein en bekend; de verzameling gevaarlijke adressen
--    is dat niet.
--
-- ⚠️ **`https` verplicht.** Web Push kent geen `http`-endpoints, en zonder deze
--    eis is `http://fcm.googleapis.com.aanvaller.test` een geldige host.
--
-- ⚠️ **Bestaande rijen worden níét opgeschoond.** Er staat er vandaag geen één
--    met `platform = 'web'` op productie, dus er is niets om te wissen — en een
--    `delete` in een migratie die morgen wél rijen raakt, is precies het soort
--    ding dat je niet terugdraait. Wie later wil opruimen, doet dat met een
--    gerichte query nadat hij geteld heeft.
--
-- Zie docs/decisions/2026-08-28-een-pushadres-is-geen-vrij-veld.md.

create or replace function public.is_pushdienst(p_endpoint text)
  returns boolean
  language sql
  immutable
  set search_path = public, pg_temp
as $$
  -- De host loopt van na `https://` tot de eerste `/`, `?` of `:`. Een
  -- poortnummer of userinfo (`user@host`) maakt het geen geldige pushdienst,
  -- dus die vormen vallen er hier uit in plaats van genegeerd te worden.
  select p_endpoint ~ '^https://[a-z0-9.-]+(/[^[:space:]]*)?$'
     and (
       -- Google (FCM)
       substring(p_endpoint from 9 for position('/' in substring(p_endpoint from 9) || '/') - 1)
         in ('fcm.googleapis.com', 'android.googleapis.com', 'web.push.apple.com')
       or substring(p_endpoint from 9 for position('/' in substring(p_endpoint from 9) || '/') - 1)
            like '%.push.services.mozilla.com'
       or substring(p_endpoint from 9 for position('/' in substring(p_endpoint from 9) || '/') - 1)
            like '%.notify.windows.com'
     );
$$;

comment on function public.is_pushdienst(text) is
  'Of een endpoint-URL van een bekende webpushdienst is. Allowlist en geen '
  'blocklist: de verzameling echte pushdiensten is klein en bekend, de '
  'verzameling gevaarlijke adressen niet. Zie 0117.';

-- ---------------------------------------------------------------------------
-- De registratie toetst het adres
-- ---------------------------------------------------------------------------

create or replace function public.registreer_push_token(
  p_token    text,
  p_platform text,
  p_p256dh   text default null,
  p_auth     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
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

  if p_platform not in ('ios', 'android', 'web') then
    return jsonb_build_object('ok', false, 'reason', 'onbekend_platform');
  end if;

  -- Alleen web draagt sleutels. Voor de rest hard op NULL, zie de kop.
  if p_platform = 'web' then
    v_p256dh := nullif(trim(coalesce(p_p256dh, '')), '');
    v_auth   := nullif(trim(coalesce(p_auth, '')), '');

    -- ⚠️ Dit is de reden dat deze migratie bestaat: zonder deze tak wordt dit
    --    een CHECK-schending en krijgt de gebruiker een ruwe Postgres-fout in
    --    plaats van een antwoord waar de client iets mee kan.
    if v_p256dh is null or v_auth is null then
      return jsonb_build_object('ok', false, 'reason', 'geen_websleutels');
    end if;

    -- ⚠️ 0117. Dit veld ís de endpoint-URL waar de meldingenjob elk uur een
    --    fetch() op doet, onder service_role, vanuit het Supabase-netwerk. Tot
    --    hier stond er geen enkele toets op, en een ingelogde gebruiker kon er
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

-- De grants staan al sinds 0067 en veranderen niet; hier voor de duidelijkheid,
-- want `create or replace` laat ze staan en een lezer mag dat niet hoeven weten.
revoke all on function public.registreer_push_token(text, text, text, text)
  from public, anon;
grant execute on function public.registreer_push_token(text, text, text, text)
  to authenticated;

revoke all on function public.is_pushdienst(text) from public, anon, authenticated;
grant execute on function public.is_pushdienst(text) to service_role;
