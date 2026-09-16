-- 0284_de_randstap_staat_in_een_check_en_niet_alleen_in_een_trigger.sql — de
-- randstap van `schone_naam()` stond in geen enkele constraint (QS8-508)
--
-- ROLLBACK-PAD:
--   alter table public.profiles drop constraint if exists profiles_display_name_schoon;
--   alter table public.groups   drop constraint if exists groups_name_schoon;
--
--   Verder niets: deze migratie voegt alleen toe. De vier bestaande
--   gelijkheids-CHECKs per kolom blijven staan — zie "Waarom erbij en niet
--   ervoor in de plaats" hieronder.
--
--   ⚠️ Terugdraaien zet het gat terug dat dit issue sluit: de rand van een naam
--      staat dan weer nergens afgedwongen, en `profiles_display_name_zichtbaar`
--      dekt hem niet — die vraagt of er iets óverblijft, niet of er iets áf moet.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- `profiles.display_name` en `groups.name` droegen elk vier gelijkheids-CHECKs:
-- `zonder_bidi`, `zonder_onzichtbaar_middenin`, `zonder_onzichtbaar_tussen_letters`
-- en `zonder_losse_tags`. `schone_naam()` is precies díe vier plus een vijfde
-- stap: de randen strippen. Die vijfde stond in geen enkele constraint — hij
-- woonde in `handle_new_user()` en in `profielSchema`, en dat schema zegt in zijn
-- eigen kop dat het geen grens is (het zit in de bundel).
--
-- ⚠️ De weg erheen vraagt geen aanmelding: `authenticated` mag `display_name`
--    schrijven en `profiles_update` toetst alleen `id = auth.uid()`. Een
--    rechtstreekse `PATCH /rest/v1/profiles` werd dus niet genormaliseerd. Dat is
--    exact de redenering waarmee QS8-448 destijds besloot dát er een CHECK moest
--    komen in plaats van alleen een trigger.
--
-- 📏 **Gemeten op de lokale stack, stand 0283**, met de vier CHECK-expressies
--    letterlijk nagerekend naast `v = schone_naam(v)`:
--
--      geval                        komt er nu langs   na deze migratie
--      ---------------------------  ----------------   ----------------
--      'Quinten'                    ja                 ja
--      ' Quinten'  (spatie vóór)    ja                 NEE
--      'Quinten '  (spatie ná)      ja                 NEE
--      U+200C + 'می'                ja                 NEE
--      U+200D / U+061C / U+034F     ja                 NEE
--      'می' + U+180E / U+200E       ja                 NEE
--      NBSP + 'Quinten'             ja                 NEE
--      U+FEFF + 'Quinten'           nee                nee
--      'Quin' + U+200B + 'ten'      nee                nee
--
--    De tien nul-pixeltekens uit het issue zitten allemaal in de bovenste groep:
--    `<teken>می` en `می` waren twee opslaanbare waarden die identiek renderen.
--
-- 📏 **En op `groups.name` sluit het een tweede gat**, dat daar openstond omdat
--    die kolom geen tegenhanger van `profiles_display_name_zichtbaar` heeft:
--
--      'ㅤㅤ'  (alleen U+3164)      nee                nee
--      NBSP NBSP                    JA                 NEE
--      'De donderdagclub'           ja                 ja
--
--    Een groepsnaam van alleen NBSP haalde `groups_name_len` (char_length >= 1)
--    en alle vier de gelijkheden. Nu niet meer: `schone_naam()` strijkt hem tot
--    de lege string en dan is de gelijkheid weg.
--
-- ---------------------------------------------------------------------------
-- Wat deze migratie kost, en dat is gemeten en niet aangenomen
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Eén geval erbij dat geen aanval is: een spatie aan de rand.** Dat is een
--    typefout, en hij wordt nu geweigerd met `23514`.
--
--    📏 Nagemeten dat de gewone gebruiker daar niet tegenaan loopt:
--    `profielSchema` doet `.transform(schoneNaam)` vóór de validatie, en
--    `schoneNaam()` in `src/shared/tekst/index.ts` heeft de randstap als stap 5
--    (regels 666-675). Wie via de app een naam met een spatie erachter opslaat,
--    stuurt hem getrimd de deur uit. Alleen een rechtstreekse `PATCH` raakt deze
--    CHECK — en dat is precies wie we wilden weigeren.
--
--    `tests/rls/naamnormalisatie.test.ts` legt beide definities over het hele
--    codepuntbereik naast elkaar, dus die twee kunnen niet uiteen lopen.
--
-- ⚠️ **`validate` scant elke bestaande rij en breekt af bij de eerste die faalt**
--    (meting in de kop van 0271). Vóór de uitrol te draaien:
--
--      select count(*) from public.profiles where display_name <> public.schone_naam(display_name);
--      select count(*) from public.groups   where name         <> public.schone_naam(name);
--
--    📏 Op 16-09-2026 read-only op productie: `profiles` 1 rij, 0 die zou breken;
--    `groups` leeg. ⚠️ Momentopname — er komen gebruikers bij, dus meet opnieuw.
--
-- ---------------------------------------------------------------------------
-- ⚠️⚠️ Waarom erbij en niet ervoor in de plaats — een afwijking van QS8-508
-- ---------------------------------------------------------------------------
--
-- Het issue stelt voor om de vier losse gelijkheden te **vervangen** door deze
-- ene, met als argument dat er anders "vijf plekken zijn die dezelfde vraag
-- stellen en die elk apart bijgewerkt moeten worden zodra er een teken bij
-- komt". Dat argument klopt hier niet: alle vijf verwijzen naar een **functie**.
-- Een teken erbij is een wijziging in `zonder_onzichtbaar_middenin()` en de vijf
-- CHECKs volgen vanzelf. Er is dus geen onderhoudslast om weg te nemen.
--
-- 📏 **En vervangen zou ook geen regel laten vallen** — dat is gemeten en niet
--    aangenomen. Over het volledige codepuntbereik (1 t/m 1114111, surrogaten
--    overgeslagen), in drie posities (teken alleen, vooraan, middenin):
--
--      vorm       gevallen waar x = schone_naam(x) én één van de vier faalt
--      --------   --------------------------------------------------------
--      alleen     0
--      vooraan    0
--      middenin   0
--
--    De vier zijn dus logisch geïmpliceerd. Vervangen was veilig geweest.
--
-- ⚠️⚠️ **De reden om het tóch niet te doen is de toetsresolutie, en die weegt in
--    dit project zwaar.** Vier bestaande RLS-toetsen pinnen de constraintnáám in
--    de foutmelding — `profielschrijven`, `aanmelding`,
--    `een-naam-rendert-niet-als-een-andere` en `groepsnaam-keert-niet-om`. Dat
--    doen ze met zoveel woorden omdat de security-ronde op QS8-450 mat dat een
--    kale `23514` een toets groen houdt terwijl juist de bedoelde CHECK weg is:
--    `groups` draagt er twintig, en een ándere weigert dezelfde invoer.
--
--    Klap je de vijf samen tot één, dan melden al die toetsen voortaan dezelfde
--    naam. De belofte blijft afgedwongen, maar ze kunnen niet meer onderscheiden
--    of de **bidi**-regel weg is of de **tag**-regel. Dat is precies de
--    resolutie die die ronde opleverde, en die geef je dan op voor het opruimen
--    van vier CHECK-aanroepen per schrijfactie.
--
-- ⚠️ Wat dat kost: vijf functieaanroepen per write in plaats van één. Op een
--    tabel met één rij en een schrijfactie per profielwijziging is dat niets.
--    Wordt het ooit wél iets, dan is samenklappen een migratie van vier regels —
--    met de meting hierboven al gedaan.
--
-- ⚠️ Dit is een besluit onder *Beslisbevoegdheid*: de vorm wijkt af van wat
--    QS8-508 voorstelt, het doel niet. Het staat ook in het issue en in
--    `docs/decisions/2026-09-16-de-rand-van-een-naam.md`.
-- ---------------------------------------------------------------------------

begin;

-- ⚠️ `not valid` en dan apart `validate`, zoals 0271 en 0283: zo houdt de
--    tabelscan geen ACCESS EXCLUSIVE lock vast terwijl hij loopt.
alter table public.profiles drop constraint if exists profiles_display_name_schoon;

alter table public.profiles
  add constraint profiles_display_name_schoon
    check (display_name = public.schone_naam(display_name)) not valid;

alter table public.profiles validate constraint profiles_display_name_schoon;

comment on constraint profiles_display_name_schoon on public.profiles is
  'De naam is al genormaliseerd, inclusief de randen — QS8-508. De vier '
  'gelijkheden ernaast (bidi, middenin, tussen letters, losse tags) zijn hier '
  'logisch door geimpliceerd en blijven staan omdat vier RLS-toetsen hun '
  'constraintnaam pinnen; zie de kop van migratie 0284.';

alter table public.groups drop constraint if exists groups_name_schoon;

alter table public.groups
  add constraint groups_name_schoon
    check (name = public.schone_naam(name)) not valid;

alter table public.groups validate constraint groups_name_schoon;

comment on constraint groups_name_schoon on public.groups is
  'Zelfde regel als profiles_display_name_schoon. Sluit hier bovendien de '
  'groepsnaam van alleen onzichtbare tekens, die groups_name_len haalde omdat '
  'char_length die tekens meetelt (QS8-508).';

commit;
