-- 0290_een_bovengrens_op_wat_handle_new_user_normaliseert.sql — `handle_new_user()`
-- normaliseerde `raw_user_meta_data` zonder bovengrens (QS8-546)
--
-- ROLLBACK-PAD:
--   `create or replace` op `handle_new_user()` met de versie van **0286**:
--   dezelfde body, maar zonder de drie `left(…, c_ruwe_grens)` om de binnenste
--   `schone_naam()`-aanroepen. Er verandert geen tabel, geen kolom, geen
--   constraint, geen policy en geen grant — alleen het lichaam van één functie.
--   Bestaande rijen worden niet aangeraakt; deze trigger draait alleen op een
--   nieuwe `auth.users`-rij.
--
-- ---------------------------------------------------------------------------
-- Wat er mis was
-- ---------------------------------------------------------------------------
--
-- `schone_naam()` liep op `raw_user_meta_data ->> 'full_name'` en `->> 'name'`
-- zónder bovengrens, in een `security definer`-trigger die bij élke aanmelding
-- draait — op een pad dat per definitie voor niet-ingelogde gebruikers
-- openstaat. `create_group()` heeft zo'n grens wél sinds 0287.
--
-- ⚠️⚠️ **Het is een kleiner gat dan QS8-546 dacht, en dat is gemeten.** Dat
--    issue rekende met acht miljoen codepunten en kwam op 7146 ms. Die invoer
--    kan niet: 📏 GoTrue begrenst het héle verzoeklichaam op **1 MB**
--    (`limitRequestBody(1 << 20)` in `internal/api/api.go`, via de middleware in
--    `internal/api/middleware.go`). Acht miljoen losse tags zijn 32 MB.
--
-- 📏 Hermeten op 18-09-2026 op het bedrag dat een aanvaller wérkelijk heeft —
--    1 MB ruwe bytes, dus per tekenklasse een ander aantal codepunten
--    (`octet_length` nagerekend, alle vier precies 1048576):
--
--   | klasse                   | codepunten | zonder grens | met grens |
--   |--------------------------|-----------:|-------------:|----------:|
--   | `U+E0020` losse tag      |    262.144 |   **392 ms** |    5,1 ms |
--   | `U+FFF3`                 |    349.525 |       163 ms |    2,7 ms |
--   | `U+1BCA0`                |    262.144 |       123 ms |         — |
--   | `a` (inert)              |  1.048.576 |        55 ms |    4,3 ms |
--   | `U+200B` (randklasse)    |    349.525 |       6,2 ms |         — |
--
-- De losse tag is niet alleen per codepunt maar ook **per byte** het duurst, en
-- dat is wat telt zodra het budget in bytes staat. Wat overblijft is dus
-- ~392 ms CPU per aanmelding in plaats van zeven seconden — geen ontploffing,
-- wel een goedkope manier om connecties bezet te houden op een open pad, en
-- `max_connections` is **60** voor de héle database op de gratis tier.
--
-- ⚠️ De bovengrens maakt de kosten bovendien **onafhankelijk van de invoer**, en
--    dat is de eigenschap die hier telt. Zonder hem schaalt het werk met wat een
--    vreemde opstuurt; met hem niet. Dat blijft waar als GoTrue zijn 1 MB ooit
--    verruimt — en die 1 MB is gelezen uit de bron van `master`, niet uit de
--    gedeployde versie van dít project. Dat is een **aanname**: de gemeten
--    bescherming hieronder hangt er niet van af, de omvang van het gat wél.
--
-- ---------------------------------------------------------------------------
-- Afkappen en niet weigeren — de reden dat de vorm afwijkt van `create_group()`
-- ---------------------------------------------------------------------------
--
-- `create_group()` **weigert**: `return jsonb_build_object('ok', false, 'reason',
-- 'name_too_long')`. Dat kan daar, want het is een RPC en een aanroeper leest
-- die uitslag.
--
-- ⚠️⚠️ **Hier kan dat niet, en dat is geen smaak maar een geleerd geval.** Dit
--    is een trigger op `auth.users`; de enige manier om te weigeren is werpen,
--    en dan **mislukt de aanmelding**. Precies dat is eerder gebeurd: migratie
--    `0154` bestaat omdat `handle_new_user()` botste met de profielconstraints
--    en aanmelden via een OAuth-provider daardoor stukliep op de trigger in
--    plaats van op de configuratie. Een naam die te lang is, hoort geen account
--    te blokkeren.
--
-- Afkappen verandert wél iets, en dat hoort opgeschreven: een `full_name` van
-- meer dan `c_ruwe_grens` codepunten waarvan de eerste 1000 allemaal wegvallen
-- bij normalisatie, valt nu terug op `name`, dan op het deel vóór de `@`, en
-- dan op `'Naamloos'` — waar hij vóór deze migratie de zichtbare tekens ná die
-- duizend nog gevonden had. Zo'n naam is adversarieel van vorm (duizend
-- onzichtbare tekens vóór je naam), en de terugval is niet stuk maar milder.
--
-- ⚠️ 1000 is hetzelfde getal als in `create_group()` (0287), met opzet: twee
--    grenzen op dezelfde handeling met verschillende getallen is een verschil
--    dat niemand kan uitleggen. Het is ruim twaalf keer de 80 die er uiteindelijk
--    overblijft.
--
-- ⚠️ **De grens staat om de bínnenste aanroepen en de `left(…, 80)` blijft
--    staan.** Die twee doen verschillend werk: 1000 begrenst wat er genormaliseerd
--    wordt, 80 begrenst wat er opgeslagen wordt. En de buitenste `schone_naam()`
--    blijft nodig om de rand te strijken die `left()` maakt — bij 1000 net zo goed
--    als bij 80 (QS8-508, en QS8-526 voor de reden dat die randstap nu tot een
--    vast punt doorloopt).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  -- ⚠️ Een lokale constante en geen functie: een `immutable` functie zonder
  --    argumenten kan uit een PostgREST-plan gevouwen worden, en dan komt de
  --    EXECUTE-toets er nooit meer aan te pas (QS8-433, `0254`). Hier draait het
  --    weliswaar in een trigger, maar de vorm houden we gelijk.
  c_ruwe_grens constant int := 1000;
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    -- ⚠️ `left(..., 80)` telt codepunten, net als `char_length` in
    --    `profiles_display_name_len`. Zou hier `substring` op bytes staan, dan
    --    knipt een naam met een emoji of een accent middenin een teken.
    --
    -- ⚠️⚠️ **`schone_naam()` eromheen én erbinnen, en dat is sinds QS8-508 geen
    --    dubbelop.** Binnen: een naam van twee newlines of één zero-width space
    --    moet als leeg gelden zodat de terugval naar `'Naamloos'` aanslaat
    --    (QS8-448). Buiten: `left(…, 80)` maakt een nieuwe rand, en
    --    `profiles_display_name_schoon` weigert die. Zie de kop.
    --
    -- ⚠️ Er zijn **vier** CHECKs op de kolommen die deze trigger schrijft:
    --    `profiles_display_name_len`, `profiles_display_name_zichtbaar`,
    --    `profiles_avatar_url_len` en sinds 0286
    --    `profiles_display_name_schoon`. Die laatste stond er niet in toen deze
    --    kop "drie" zei — een telling in een comment veroudert stil.
    --
    -- ⚠️⚠️ **`left(…, c_ruwe_grens)` om elk van de drie ruwe bronnen (QS8-546).**
    --    `coalesce` kortsluit, dus normaal wordt alleen de eerste genormaliseerd —
    --    maar een `full_name` die naar leeg normaliseert dwingt `name` er
    --    alsnog bij, en dan telt het werk op. Alle drie begrensd, zodat het
    --    totaal niet van de invoer afhangt.
    coalesce(
      nullif(
        schone_naam(
          left(
            coalesce(
              nullif(schone_naam(left(new.raw_user_meta_data ->> 'full_name', c_ruwe_grens)), ''),
              nullif(schone_naam(left(new.raw_user_meta_data ->> 'name', c_ruwe_grens)), ''),
              nullif(schone_naam(left(split_part(coalesce(new.email, ''), '@', 1), c_ruwe_grens)), ''),
              'Naamloos'
            ),
            80
          )
        ),
        ''
      ),
      'Naamloos'
    ),
    -- ⚠️ Alleen een pad dat aan `profiles_avatar_url_eigen_pad` voldoet. Een
    --    provider stuurt hier een `https://`-URL, en die hoort niet in deze
    --    kolom. Alles wat niet past, wordt `null`.
    case
      when new.raw_user_meta_data ->> 'avatar_url' ~ ('^' || new.id::text || '/[A-Za-z0-9._-]{1,200}$')
        then new.raw_user_meta_data ->> 'avatar_url'
      else null
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$function$;
