-- 0271_een_onzichtbaar_teken_midden_in_een_naam_telt_niet.sql — tekens die als
-- nul pixels renderen, gaan ook midden uit een weergavenaam. QS8-495.
--
-- ROLLBACK-PAD:
--   -- `schone_naam()` terug naar de versie van 0269 (zonder de middenin-stap):
--   create or replace function public.schone_naam(p_ruw text)
--   returns text language sql immutable set search_path to 'pg_catalog', 'pg_temp'
--   as $$
--     select regexp_replace(
--       regexp_replace(public.zonder_bidi(coalesce(p_ruw, '')), '^[' || rand || ']+', ''),
--       '[' || rand || ']+$', ''
--     )
--     from (
--       select U&'\0001-\0020\007F-\00A0\00AD\034F\061C\115F-\1160\1680\17B4-\17B5\180B-\180E\2000-\200F\2028-\202F\205F-\2064\2066-\206F\2800\3000\3164\FEFF\FFA0\FFF9-\FFFB\+0E0000-\+0E007F' as rand
--     ) s;
--   $$;
--   alter table public.profiles
--     drop constraint if exists profiles_display_name_geen_onzichtbaar_middenin;
--   drop function if exists public.zonder_onzichtbaar_middenin(text);
--
-- ⚠️ Deze migratie raakt geen rij en geen policy — ze herdefinieert één functie
--    en voegt er één toe. Grens 2 van de beslisbevoegdheid is niet in beeld.
--
--    ⚠️⚠️ **Maar ze verandert wél wat er met bestáánde namen gebeurt.** De
--       trigger op `profiles` draait `schone_naam()` bij elke schrijfactie, dus
--       een naam met een ZWSP erin wordt bij de eerstvolgende wijziging stil
--       schoongemaakt. Dat is de bedoeling en het is dezelfde afspraak als in
--       0256 en 0269: de database bepaalt de vorm, niet de client. 📏 Er zijn
--       vandaag geen echte gebruikers (WERKVOORRAAD §0, regel 2), dus er is geen
--       bestaande naam die hierdoor verandert.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten in de security-review op QS8-450 en nagemeten op 14-09-2026, als
-- gewone ingelogde gebruiker via de gewone weg:
--
--   update public.profiles set display_name = U&'Ja\200Bn' where id = <eigen id>;
--   UPDATE 1
--
--          geval        | uit  | len | haalt_bidi_check | haalt_zichtbaar_check
--   --------------------+------+-----+------------------+-----------------------
--    ZWSP midden        | Ja​n  |   4 | t                | t
--    BOM midden         | Ja﻿n  |   4 | t                | t
--    soft hyphen midden | Ja­n  |   4 | t                | t
--    ZWNJ midden        | Ja‌n  |   4 | t                | t
--
-- Vier tekens, rendert als `Jan`, haalt béíde CHECKs. Twee leden in dezelfde
-- groep konden dus een **pixel-identieke** naam dragen — zonder bidi en zonder
-- homoglyph.
--
-- ⚠️ **Waarom dat erger is dan het klinkt.** Domeinregel 3: peer-goedkeuring is
--    een autorisatiegrens. De lezer leidt uit de **naam** af wie hij
--    autoriseert, in de ledenlijst, in `openstaande_beoordelingen()` en in de
--    groepschat. Twee keer "Jan" betekent dat een buddy de week van de verkeerde
--    persoon goedkeurt.
--
-- ---------------------------------------------------------------------------
-- De scheidslijn: nul pixels tegenover witruimte
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De voor de hand liggende reparatie is de verkeerde.** De randenlijst
--    van 0256 met een `g`-vlag toepassen lost dit niet op, het breekt het: die
--    lijst bevat de **spatie**, en `Jan de Vries` wordt dan `JandeVries`. Ze
--    bevat ook `U+200D`, de lijm in `👨‍👩‍👧‍👦`.
--
--    De vraag is dus niet "is dit onzichtbaar" maar **"rendert dit als nul
--    pixels, en heeft een schrift het nodig"**. Een spatie is onzichtbaar en
--    tóch betekenisvol: hij scheidt. Wat hieronder staat scheidt niet en bindt
--    niet — het is er gewoon niet, en daarmee is `Ja<X>n` niet van `Jan` te
--    onderscheiden.
--
-- ⚠️ **Wat er met reden blíjft staan**, en elk met een eigen reden en niet als
--    restpost: de spaties (`U+0020`, `U+00A0`, `U+2000`–`U+200A`, `U+202F`,
--    `U+205F`, `U+1680`, `U+3000`), de emoji-lijm `U+200D`, de orthografisch
--    verplichte `U+200C` (Perzisch, Hindi, Bengaals), de combining grapheme
--    joiner `U+034F`, de richtingsmarkeringen `U+061C`/`U+200E`/`U+200F`, en de
--    schriftgebonden `U+17B4`–`U+17B5` (Khmer) en `U+180B`–`U+180E` (Mongools).
--
-- ⚠️⚠️ **ZWJ en ZWNJ blijven daarmee een collisievector, en dat is een besluit
--    en geen omissie.** `Ja<U+200C>n` rendert nog steeds als `Jan`. Van de vier
--    gemeten gevallen sluit deze migratie er **drie**; de vierde vraagt een
--    **contextregel** ("weg tussen twee ASCII-letters") in plaats van een lijst
--    van codepunten, en die past niet in de vorm die de naadtest vergelijkt —
--    die legt SQL en TypeScript codepunt voor codepunt naast elkaar, los van hun
--    buren. Acceptatiecriterium 2 van QS8-495 zegt bovendien met zoveel woorden
--    dat de must-allow hier zwaarder weegt dan de weigering. Uitgeschreven in
--    `docs/decisions/2026-09-14-onzichtbaar-in-het-midden.md` §4, met een rij in
--    `docs/ENGINEER-REVIEW.md` en een vervolgissue.
--
-- ⚠️ **De bidi-tekens staan hier niet in**, want `zonder_bidi()` (0269) haalt ze
--    al overal weg. Eén vraag, één lijst: een teken dat in twee lijsten staat,
--    maakt bij de volgende wijziging onduidelijk welke van de twee hem draagt.
--
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- zonder_onzichtbaar_middenin() — de derde lijst
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Als escapes en niet als letterlijke tekens**, net als in `zonder_bidi()`.
--    Een `.sql` met een echte ZERO WIDTH SPACE erin is niet te reviewen: je ziet
--    niet wat er staat, en de volgende lezer kan het verschil tussen deze regel
--    en een lege regel niet zien.
--
-- ⚠️ **`immutable` en niet `stable`.** De uitkomst hangt alleen van de invoer af;
--    dat is wat een CHECK-constraint eist, en `volatiliteit:controle` bewaakt
--    het. Zelfde keuze als `zonder_bidi()` en `schone_naam()`.
create or replace function public.zonder_onzichtbaar_middenin(p_ruw text)
returns text
language sql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $$
  select regexp_replace(
    coalesce(p_ruw, ''),
    '[' || U&'\0001-\001F\007F-\009F\00AD\115F-\1160\200B\2028-\2029\2060-\2064\206A-\206F\2800\3164\FEFF\FFA0\FFF9-\FFFB\+0E0000-\+0E007F' || ']',
    '',
    'g'
  );
$$;

comment on function public.zonder_onzichtbaar_middenin(text) is
  'Een tekst zonder de tekens die overal als nul pixels renderen — QS8-495. '
  'Spiegelt `zonderOnzichtbaarMiddenin()` uit `src/shared/tekst`. ⚠️ Bewust '
  'níét de spaties en níét `U+200C`/`U+200D`: die scheiden respectievelijk '
  'binden, en overal weghalen breekt `Jan de Vries`, het Perzisch en de '
  'gezinsemoji. `tests/rls/naamnormalisatie.test.ts` loopt het hele '
  'codepuntbereik af met een teken in het midden en legt de twee oordelen '
  'naast elkaar.';

-- ⚠️ **`from public, anon, authenticated` en niet `from public`.** In Supabase
--    deelt `alter default privileges` élke nieuwe functie uit aan alle drie, en
--    `revoke ... from public` houdt precies de rol over waaronder iedere
--    ingelogde gebruiker draait (beveiligingsregel 4).
revoke all  on function public.zonder_onzichtbaar_middenin(text) from public, anon, authenticated;
grant execute on function public.zonder_onzichtbaar_middenin(text) to authenticated;

-- ---------------------------------------------------------------------------
-- schone_naam() krijgt de derde stap ertussen
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Drie stappen, elk met een eigen reden, in deze volgorde:** eerst de
--    bidi-overrides overal weg (0269), dán de tekens die overal als niets
--    renderen (hier), dán de randen (0256). De uitkomst is dezelfde als je de
--    eerste twee omdraait, maar zo leest het als drie besluiten en niet als
--    toeval.
--
-- ⚠️ De randenlijst is woordelijk die uit 0256 en 0269 en mag niet afwijken —
--    `tests/rls/naamnormalisatie.test.ts` legt hem codepunt voor codepunt naast
--    `ONZICHTBARE_BEREIKEN` in `src/shared/tekst/index.ts`.
create or replace function public.schone_naam(p_ruw text)
returns text
language sql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $$
  select regexp_replace(
    regexp_replace(
      public.zonder_onzichtbaar_middenin(public.zonder_bidi(coalesce(p_ruw, ''))),
      '^[' || rand || ']+', ''
    ),
    '[' || rand || ']+$', ''
  )
  from (
    select U&'\0001-\0020\007F-\00A0\00AD\034F\061C\115F-\1160\1680\17B4-\17B5\180B-\180E\2000-\200F\2028-\202F\205F-\2064\2066-\206F\2800\3000\3164\FEFF\FFA0\FFF9-\FFFB\+0E0000-\+0E007F' as rand
  ) s;
$$;

comment on function public.schone_naam(text) is
  'Een naam zonder onzichtbare randen, zonder bidi-stuurtekens en zonder tekens '
  'die overal als nul pixels renderen — QS8-448, uitgebreid in QS8-450 en '
  'QS8-495. Spiegelt `schoneNaam()` uit `src/shared/tekst`; '
  '`tests/rls/naamnormalisatie.test.ts` loopt het hele codepuntbereik af en '
  'legt de twee oordelen naast elkaar, aan de rand én in het midden.';

-- ⚠️ `schone_naam()` bestond al en had zijn grant al; `create or replace`
--    behoudt die, dus hier hoort geen tweede `grant`. Zie de noot in 0269 over
--    hóé `tests/rls/functiegrants.test.ts` dat dekt — hij noemt geen enkele
--    functie bij naam maar leest de migratiebestanden van schijf.

-- ---------------------------------------------------------------------------
-- De grens zelf — en dit is de helft die bijna ontbrak
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **`schone_naam()` aanpassen is niet de reparatie, en dat is met de hand
--    gemeten.** 📏 Er is géén trigger op `profiles` die de naam normaliseert —
--    `pg_trigger` geeft er vier en geen ervan raakt `display_name`. Wat een
--    schrijfactie tegenhoudt zijn de twee CHECKs, en die **weigeren**; ze
--    normaliseren niet. De eerste versie van deze migratie herdefinieerde alleen
--    de functie, en `Ja\u200Bn` landde daarna nog steeds ongehinderd via
--    PostgREST.
--
--    Dat is precies de vorm van onwrikbare regel 18: elk onderdeel klopte — de
--    functie deed in `psql` exact wat ze moest doen, en de naadtest tussen SQL
--    en TypeScript was groen op 225 codepunten — terwijl het gehéél lekte. De
--    toets die het vond is `tests/rls/een-naam-rendert-niet-als-een-andere.test.ts`,
--    die de naam door de eigen deur van de app stuurt in plaats van de functie
--    aan te roepen.
--
-- ⚠️ **Weigeren en niet normaliseren, zelfde vorm als `..._geen_bidi` (0269).**
--    De reden dat dat hier niemand hindert: `profielSchema` in
--    `src/modules/auth/schemas.ts` doet `.transform(schoneNaam)` vóór het
--    versturen, dus een eerlijke client raakt deze grens nooit. Wie hem wél
--    raakt, stuurt buiten de app om — en dat is exact de aanvaller uit het
--    scenario.
--
-- ⚠️ **De CHECK noemt de functie en niet de bereiken.** Eén lijst, één plek:
--    staat het bereik hier óók, dan is er een tweede die stil uit de pas kan
--    lopen. Dat is de fout van 0032/0034.
--
-- ⚠️ **`drop … if exists` eerst, want de migratie moet idempotent zijn.**
--    `npm run idempotent:controle` speelt elke migratie direct na zichzelf nog
--    een keer af op een eigen lege database.
alter table public.profiles
  drop constraint if exists profiles_display_name_geen_onzichtbaar_middenin;

alter table public.profiles
  add constraint profiles_display_name_geen_onzichtbaar_middenin
  check (display_name = public.zonder_onzichtbaar_middenin(display_name));

comment on constraint profiles_display_name_geen_onzichtbaar_middenin on public.profiles is
  'Een weergavenaam draagt geen teken dat als nul pixels rendert — QS8-495. '
  'Weigert in plaats van te normaliseren, net als profiles_display_name_geen_bidi: '
  'de eerlijke client normaliseert al met `schoneNaam()`, dus wie deze grens '
  'raakt stuurt buiten de app om.';

commit;
