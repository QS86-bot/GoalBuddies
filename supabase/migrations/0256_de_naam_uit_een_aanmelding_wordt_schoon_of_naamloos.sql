-- 0256_de_naam_uit_een_aanmelding_wordt_schoon_of_naamloos.sql — de trigger en
-- `profielSchema` worden het eens over wat witruimte is, zodat een aanmelding
-- geen groepszichtbaar lid zonder leesbare naam meer oplevert (QS8-448).
--
-- ROLLBACK-PAD:
--   create or replace function public.handle_new_user() ... (de versie uit 0154,
--   met `nullif(trim(...), '')`), gevolgd door:
--   drop function if exists public.schone_naam(text);
--   Geen kolom, geen policy, geen CHECK gewijzigd.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Twee Middel-rijen uit `docs/ENGINEER-REVIEW.md` (03-09-2026), op 13-09
--    nagemeten tegen de dráaiende database en de echte `profielSchema`. De
--    trigger deed `nullif(trim(...), '')`, het schema `.trim().min(1)`:
--
--      invoer          Postgres trim()        JS .trim()
--      E'\n\n'         2 tekens, niet leeg    '' (leeg)
--      E'\t\t'         2 tekens, niet leeg    ''
--      U+00A0 (NBSP)   1 teken,  niet leeg    ''
--      U+200B (ZWSP)   1 teken,  niet leeg    U+200B  ← allebei door
--
--    Postgres' `trim()` strijkt namelijk alleen de spatie. De eerste drie
--    leverden een profiel op dat het eigen schema afwijst; het vierde kwam langs
--    **beide** poorten en is daarmee het enige geval dat niets ving.
--
-- ⚠️ **`display_name` is groepszichtbaar** (`profiles_select` deelt hem met
--    iedereen die een groep met je deelt), en één `POST /auth/v1/signup` met de
--    anon-sleutel is genoeg. De uitkomst is een lid in het groepsoverzicht
--    zonder leesbare naam.
--
-- ---------------------------------------------------------------------------
-- Waarom alleen de randen, en waarom een eigen bereikenlijst
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Alleen aan de rand, en nooit in het midden.** 📏 `👨‍👩‍👧‍👦` is
--    `U+1F468 U+200D U+1F469 U+200D U+1F467 U+200D U+1F466` — de zero-width
--    joiner ís de lijm. Wie U+200D overal wegknipt, houdt vier losse mensen over
--    in plaats van één gezin. Daarom twee verankerde vervangingen (`^…` en `…$`)
--    en nooit een `g`-vlag, en het is precies het teken dat CLAUDE.md aan
--    `telTekens()` laat voeren.
--
-- ⚠️ **Dezelfde bereiken staan in `src/shared/tekst/index.ts` als
--    `ONZICHTBARE_BEREIKEN`, en dat is een naad.** Er is geen manier om één
--    definitie in twee talen te hebben; wat er wél is, is een toets die het
--    **hele codepuntbereik** afloopt en beide oordelen naast elkaar legt —
--    `tests/rls/naamnormalisatie.test.ts`. Haal je hier één teken weg, dan wordt
--    die toets rood, in beide richtingen.
--
--    📏 Dat stond hier eerst ook, en het was onwaar: de toets vergeleek zestien
--    vaste invoeren en dekte daarmee 8 van de 29 codepunten. Met U+205F uit de
--    SQL-kant gehaald bleef hij groen op vier tests. Een bron die bewéért dat er
--    een grendel op staat, is erger dan een ontbrekende grendel — die valt op.
--
-- ---------------------------------------------------------------------------

-- ⚠️ `immutable`: hij hangt alleen van zijn invoer af. Dat moet ook, want de
--    CHECK onderaan dit bestand roept hem aan.
--
-- ⚠️ Géén `security definer`. Hij leest niets en schrijft niets; de rechten van
--    de aanroeper zijn precies goed. Dat scheelt een rij in `definers:controle`
--    en het is de juiste keuze, geen bezuiniging.
--
-- ⚠️⚠️ **`'pg_temp'` staat er met zoveel woorden bij, en achteraan.** 📏 Zonder
--    werden drie grendels rood in dezelfde run — `zoekpadschaduw`,
--    `hulpfuncties` en `definer-aanroepertoets`. Noemt een `search_path`
--    `pg_temp` niet, dan zet Postgres hem **vooraan**.
--
--    ⚠️ **De reden is níet dat iemand anders `regexp_replace` kan kapen.** Dat
--       stond hier eerst, en het is nagemeten onwaar: Postgres raadpleegt
--       `pg_temp` nooit voor functie- of operatornamen. Met een eigen
--       `pg_temp.btrim(text,text)` aanwezig én `pg_temp` expliciet vooraan gaf
--       `btrim('  Jan  ')` gewoon `Jan`. Wat `pg_temp` wél vooraan pakt zijn
--       **relatie- en typenamen**, en dáárvoor hoort hij achteraan te staan.
--       De maatregel is goed; de oude onderbouwing was het niet, en een
--       uitgeschreven reden wordt gekopieerd naar de volgende functie.
create or replace function public.schone_naam(p_ruw text)
returns text
language sql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $$
  -- ⚠️⚠️ **Bereiken en geen opsomming, en dat is een correctie binnen dit
  --    issue.** 📏 De eerste versie somde 29 codepunten op. Nagemeten kwamen er
  --    tóch twaalf andere tekens langs beide poorten die als niets renderen:
  --    hangul filler (U+3164), braille blank (U+2800), soft hyphen (U+00AD),
  --    de C0- en C1-stuurtekens, de tags. Een opsomming dekt wat je bedacht
  --    hebt; een bereik dekt de klasse.
  --
  -- ⚠️ **U+FE00–U+FE0F staat er met opzet niet in.** Dat zijn de
  --    variatieselectors: een naam die op `❤️` eindigt is `U+2764 U+FE0F`, en
  --    wie die staart afknipt verandert hoe het teken rendert. Gemeten: gezin,
  --    regenboogvlag, landsvlag, huidskleur en keycap blijven heel.
  --
  -- ⚠️ **`regexp_replace` op de randen en geen `btrim`.** `btrim` neemt een
  --    verzameling losse tekens en kent geen bereiken; deze vorm is dezelfde
  --    belofte in een twintigste van de tekens. Twee vervangingen — kop en
  --    staart — want één patroon met `|` zou de staart alleen pakken als de kop
  --    leeg bleef.
  --
  -- ⚠️ De bereiken staan als escapes en niet als letterlijke tekens. Een `.sql`
  --    met een echte zero-width space erin is niet te reviewen en overleeft geen
  --    editor die witruimte opruimt — je ziet niet wat er staat, en een diff die
  --    hem weghaalt leest als "geen wijziging".
  --
  -- ⚠️ U+0000 ontbreekt met reden: `text` kan in Postgres geen NUL bevatten, dus
  --    dat geval bestaat hier niet.
  select regexp_replace(
    regexp_replace(coalesce(p_ruw, ''), '^[' || rand || ']+', ''),
    '[' || rand || ']+$', ''
  )
  from (
    select U&'\0001-\0020\007F-\00A0\00AD\034F\061C\115F-\1160\1680\17B4-\17B5\180B-\180E\2000-\200F\2028-\202F\205F-\2064\2066-\206F\2800\3000\3164\FEFF\FFA0\FFF9-\FFFB\+0E0000-\+0E007F' as rand
  ) s;
$$;

comment on function public.schone_naam(text) is
  'Een naam zonder onzichtbare randen — QS8-448. Spiegelt `schoneNaam()` uit '
  '`src/shared/tekst`; `tests/rls/naamnormalisatie.test.ts` loopt het hele '
  'codepuntbereik af en legt de twee oordelen naast elkaar.';

-- ⚠️ **`from public, anon, authenticated` en niet `from public`.** In Supabase
--    deelt `alter default privileges` élke nieuwe functie uit aan alle drie, en
--    `revoke ... from public` houdt precies de rol over waaronder iedere
--    ingelogde gebruiker draait (beveiligingsregel 4).
--
-- ⚠️⚠️ **En daarna een `grant` aan `authenticated`, want anders breekt élke
--    profielschrijving.** 📏 Gemeten: met de CHECK onderaan dit bestand en
--    zónder deze grant faalt een doodgewone `insert` van `authenticated` op
--    `permission denied for function schone_naam` — Postgres toetst EXECUTE op
--    een functie in een CHECK op het moment van schrijven. Het alternatief is de
--    bereikenlijst een derde keer uitschrijven in de CHECK zelf, en dan bewaakt
--    de naadtest twee van de drie kopieën.
revoke execute on function public.schone_naam(text) from public, anon, authenticated;
grant execute on function public.schone_naam(text) to authenticated;

-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    -- ⚠️ `left(..., 80)` telt codepunten, net als `char_length` in
    --    `profiles_display_name_len`. Zou hier `substring` op bytes staan, dan
    --    knipt een naam met een emoji of een accent middenin een teken.
    --
    -- ⚠️⚠️ **`schone_naam()` en niet `trim()`** — QS8-448. `trim()` strijkt
    --    alleen de spatie, dus een naam van twee newlines of één zero-width
    --    space kwam er als geldige naam uit en `nullif(..., '')` zag hem niet
    --    als leeg. De terugval naar `'Naamloos'` sloeg daardoor over.
    left(
      coalesce(
        nullif(schone_naam(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(schone_naam(new.raw_user_meta_data ->> 'name'), ''),
        nullif(schone_naam(split_part(coalesce(new.email, ''), '@', 1)), ''),
        'Naamloos'
      ),
      80
    ),
    -- ⚠️ Alleen een pad dat aan `profiles_avatar_url_eigen_pad` voldoet. Een
    --    provider stuurt hier een `https://`-URL, en die hoort niet in deze
    --    kolom — zie de kop. Alles wat niet past, wordt `null`.
    -- ⚠️ `{1,200}` en niet `+`. Er zijn **drie** CHECKs op de kolommen die deze
    --    trigger schrijft, en `profiles_avatar_url_len` (maximaal 1000 tekens) is
    --    de derde — die stond niet in de eerste versie van deze kop. Gemeten:
    --    een eigen pad met 1001 tekens erachter laat de `auth.users`-insert
    --    alsnog terugrollen. Vandaag onbereikbaar (je kent je eigen id niet vóór
    --    de aanmelding), maar de bewering "de trigger levert waarden die de
    --    constraints áán kunnen" was daarmee niet waar.
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

-- ---------------------------------------------------------------------------
-- De schrijfroute, en waarom de trigger alleen niet genoeg was
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De aanmelding was de moeilijke deur, niet de enige.** 📏 Gemeten na de
--    eerste versie van deze migratie: een gewone ingelogde gebruiker doet
--    `PATCH /rest/v1/profiles?id=eq.<eigen id>` met `{"display_name":"​"}`
--    en staat als naamloos lid in het groepsoverzicht. `profiles_update` toetst
--    alleen `id = auth.uid()`, `has_column_privilege('authenticated', …,
--    'display_name', 'UPDATE')` is `t`, en de enige inhoudelijke CHECK was
--    `profiles_display_name_len` — één zero-width space is één codepunt en haalt
--    `between 1 and 80` moeiteloos.
--
--    Dat is de **makkelijkere** route: om in een groep zichtbaar te zijn heb je
--    toch al een account. `profielSchema` zit in de bundel en draait in de
--    browser van de aanvaller; die is geen grens. CLAUDE.md: *"De regel is pas
--    afgedwongen als de dátabase hem afdwingt."*
--
-- ⚠️ **Daarom een CHECK en geen policy.** RLS kan geen kolominhoud toetsen — een
--    policy gaat over welke rijen je mag zien en schrijven, niet over wat erin
--    staat. Deze grens hoort bij `profiles_display_name_len` te staan.
--
-- ⚠️ **`not valid` en daarna `validate`.** Op een lege database is dat hetzelfde;
--    op productie (die vandaag op `0221` staat) is het het verschil tussen een
--    migratie die landt en een die afbreekt op een rij die er al stond. De
--    `validate` staat er met zoveel woorden achter, dus de constraint blijft niet
--    stilletjes half aan. Zit er een bestaand profiel met een onzichtbare naam,
--    dan faalt de `validate` en is dát het signaal — geen verrassing achteraf.
alter table public.profiles drop constraint if exists profiles_display_name_zichtbaar;

alter table public.profiles
  add constraint profiles_display_name_zichtbaar
  check (public.schone_naam(display_name) <> '')
  not valid;

alter table public.profiles validate constraint profiles_display_name_zichtbaar;

comment on constraint profiles_display_name_zichtbaar on public.profiles is
  'Een weergavenaam moet minstens één zichtbaar teken hebben — QS8-448. '
  'display_name is groepszichtbaar via profiles_select; zonder deze CHECK zet '
  'elke ingelogde gebruiker zijn eigen naam met een PATCH op onzichtbaar.';
