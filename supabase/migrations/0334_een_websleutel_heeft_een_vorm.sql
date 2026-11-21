-- 0334_een_websleutel_heeft_een_vorm.sql — `registreer_push_token()` weigert een
-- web-abonnement waarvan `p256dh` geen punt op P-256 is of `auth` geen 16 octetten.
--
-- ⚠️ NUMMER VOORLOPIG (QS8-696). Opnieuw gebouwd op `main` van 21-11-2026 (besluit Quinten
--    20-11-2026: toch bouwen, op een nieuwe tak vanaf `main`; de oude tak is verouderd en
--    dient alleen als bron). QS8-233, QS8-641 en QS8-643 staan intussen op `main`. Wie als
--    tweede merget, hernummert (QS8-318), met `npm run migratie:hernummer`.
--
-- ROLLBACK-PAD:
--   -- 1. `registreer_push_token()` terug naar de vorm van 0234: voer het blok
--   --    `CREATE OR REPLACE FUNCTION public.registreer_push_token` uit
--   --    `0234_een_dagteller_is_niet_alleen_voor_opslag.sql` opnieuw uit, met de
--   --    `revoke`/`grant` erna.
--   -- 2. Pas dán de twee hulpfuncties weg (de RPC roept ze aan):
--   drop function if exists public.is_p256_punt(bytea);
--   drop function if exists public.websleutel_octetten(text);
--   -- Er verandert geen data: deze migratie schrijft geen rij en raakt geen tabel.
--
-- ---------------------------------------------------------------------------
-- Waarom
-- ---------------------------------------------------------------------------
--
-- 📏 Op productie (17-11-2026, QS8-690, alleen gelezen): 16 web-tokens, waarvan
--    9 structureel onbruikbaar — 3 met eerste octet `E`, 3 met `T`, 3 van precies
--    255 tekens. QS8-690 ruimt zulke rijen op bij het versturen, maar een client
--    met dezelfde fout zette ze na elke opruiming terug, want deze RPC nam ze aan.
--
-- 📏 De definitie op productie is byte-gelijk aan die van 0234 (md5
--    `f81dda1bc2e6c8c17a5141be7fc149f1` voor allebei, 18-11-2026). Het lichaam
--    hieronder is daarom programmatisch uit 0234 overgenomen, met alleen de
--    nieuwe toets erin — een register of tak die hier stil wegvalt, ziet git niet
--    (`registerdrift:controle`, QS8-358).
--
-- ⚠️ **De curvetoets staat ook hier, en niet alleen in de client.** 📏 In Deno
--    2.9.6 slaagt `importKey()` op een punt buiten de curve (QS8-690), dus de
--    pushjob kan het niet aan WebCrypto overlaten. `pgcrypto` heeft geen
--    elliptische-krommetoets; `numeric` rekent met willekeurige precisie, en
--    `y² ≡ x³ − 3x + b (mod p)` is daarmee een handvol regels. Lengte en prefix
--    alleen zouden het geval `ligt niet op de curve` doorlaten, en dat was
--    precies de melding die op productie het vaakst stond (6 van 11).
--
-- ⚠️ **Geen CHECK op `push_tokens`.** Er staan op productie kapotte rijen, en een
--    CHECK zou deze migratie laten omvallen of ze eerst moeten wissen (grens 2).
--    De RPC is de enige schrijver (0211: `authenticated` heeft geen INSERT of
--    UPDATE op de tabel), dus de toets hier dekt elke nieuwe rij. De bestaande
--    ruimt QS8-690 op bij het versturen.

-- ---------------------------------------------------------------------------
-- 1. Base64url naar octetten, of NULL
-- ---------------------------------------------------------------------------
--
-- ⚠️ NULL en geen exceptie bij rommel: de aanroeper wil een weigering met een
--    `reason`, geen ruwe 22023. Dezelfde ruimte als `vanBase64url()` in de
--    client: `-`/`_` én `+`/`/`, padding mag maar hoeft niet.
create or replace function public.websleutel_octetten(p_waarde text)
returns bytea
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  v_schoon text;
begin
  if p_waarde is null or p_waarde !~ '^[A-Za-z0-9+/_-]+={0,2}$' then
    return null;
  end if;

  v_schoon := translate(rtrim(p_waarde, '='), '-_', '+/');
  if length(v_schoon) % 4 = 1 then
    return null;
  end if;

  return decode(rpad(v_schoon, length(v_schoon) + (4 - length(v_schoon) % 4) % 4, '='), 'base64');
exception
  when others then
    return null;
end;
$$;

revoke execute on function public.websleutel_octetten(text) from public, anon, authenticated;

comment on function public.websleutel_octetten(text) is
  'QS8-696: base64url (of base64) naar bytea, NULL bij rommel. Alleen voor registreer_push_token().';

-- ---------------------------------------------------------------------------
-- 2. Ligt dit punt op P-256?
-- ---------------------------------------------------------------------------
--
-- ⚠️ Dezelfde som als `ligtOpP256()` in de client: een ongecomprimeerd punt
--    (`0x04 || x || y`, 65 octetten), x en y kleiner dan p, en
--    `y² ≡ x³ − 3x + b (mod p)`. NULL in is `false` uit, zodat de aanroeper één
--    tak heeft voor "geen base64" en "geen punt".
create or replace function public.is_p256_punt(p_punt bytea)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  -- p en b van NIST P-256 (secp256r1), decimaal.
  c_p constant numeric := 115792089210356248762697446949407573530086143415290314195533631308867097853951;
  c_b constant numeric := 41058363725152142129326129780047268409114441015993725554835256314039467401291;
  v_x numeric := 0;
  v_y numeric := 0;
  v_rechts numeric;
  i integer;
begin
  if p_punt is null or octet_length(p_punt) <> 65 or get_byte(p_punt, 0) <> 4 then
    return false;
  end if;

  for i in 1..32 loop
    v_x := v_x * 256 + get_byte(p_punt, i);
    v_y := v_y * 256 + get_byte(p_punt, i + 32);
  end loop;

  if v_x >= c_p or v_y >= c_p then
    return false;
  end if;

  v_rechts := mod(mod(mod(v_x * v_x, c_p) * v_x - 3 * v_x + c_b, c_p) + c_p, c_p);
  return mod(v_y * v_y, c_p) = v_rechts;
end;
$$;

revoke execute on function public.is_p256_punt(bytea) from public, anon, authenticated;

comment on function public.is_p256_punt(bytea) is
  'QS8-696: ligt dit ongecomprimeerde punt (65 octetten) op P-256? Spiegel van ligtOpP256() in webpush-verzenden.ts.';

-- ---------------------------------------------------------------------------
-- 3. De RPC, met de vormtoets erbij
-- ---------------------------------------------------------------------------
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

    -- ⚠️ QS8-696. Tot hier toetste deze tak alleen de lengte, en dan komt een
    --    abonnement binnen dat nooit iets kan ontvangen. 📏 Op productie waren
    --    het er 9 van de 16 (QS8-690). Dezelfde regels als `abonnementFout()`
    --    in `src/modules/notifications/webpush-verzenden.ts`: een
    --    ongecomprimeerd P-256-punt van 65 octetten dat op de curve ligt, en een
    --    `auth` van 16 octetten. Weigeren en niet stil inkorten: de client krijgt
    --    een `reason` (QS8-377), en er komt geen rij bij.
    if not is_p256_punt(websleutel_octetten(v_p256dh)) then
      return jsonb_build_object('ok', false, 'reason', 'p256dh_ongeldig');
    end if;

    if coalesce(octet_length(websleutel_octetten(v_auth)), 0) <> 16 then
      return jsonb_build_object('ok', false, 'reason', 'auth_ongeldig');
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
