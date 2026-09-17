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

-- ⚠️⚠️ **`not valid` en dan apart `validate`, en dat wint hier géén locktijd.**
--    Er stond eerst dat het "de tabelscan geen ACCESS EXCLUSIVE lock laat
--    vasthouden, zoals 0271 en 0283". Beide helften waren onwaar, gemeten in de
--    security-ronde op deze PR en daarna zelf nagelopen:
--
--      * De `ACCESS EXCLUSIVE` van de `add constraint` wordt tot de `commit`
--        vastgehouden. Binnen één transactie levert de splitsing dus niets op;
--        daarvoor zouden het twee migratiebestanden moeten zijn.
--      * 📏 `0271` doet dit helemaal niet zo (nul treffers op `not valid` én op
--        `validate constraint`), en `0283` heeft wel `not valid` maar géén
--        `validate`. De precedenten die het wél zo doen zijn 0068, 0123, 0252,
--        0256 en 0260.
--
--    De vorm blijft staan omdat hij de huisvorm van 0256 en 0260 aanhoudt en
--    omdat `begin;`/`commit;` hier zwaarder weegt dan locktijd: `profiles` telt
--    één rij op productie, en een migratie die halverwege blijft staan is duurder
--    dan een lock van milliseconden. **Wordt de tabel ooit groot, dan is dit twee
--    bestanden en niet dit comment.**
--
--    ⚠️ Een comment dat een veiligheidseigenschap belooft die de code niet heeft,
--       is duurder dan geen comment — hij wordt gekopieerd naar de volgende
--       migratie. Dat is dezelfde vorm als "elke definer-functie is een kopie van
--       de vorige" uit CLAUDE.md.
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

-- ---------------------------------------------------------------------------
-- ⚠️⚠️ En de aanmeldtrigger moet de nieuwe CHECK ook kúnnen halen
-- ---------------------------------------------------------------------------
--
-- `handle_new_user()` normaliseert eerst en kapt daarna af:
--
--     left(coalesce(nullif(schone_naam(...), ''), ...), 80)
--
-- `schone_naam()` strijkt de randen van de **volledige** naam; `left(…, 80)`
-- maakt daarna een **nieuwe** rand. Staat op codepunt 80 een teken uit de
-- randenlijst — een gewone spatie is genoeg — dan is het resultaat niet langer
-- genormaliseerd en weigert `profiles_display_name_schoon` het.
--
-- 📏 Gemeten op de lokale stack met `repeat('a',79) || ' Jansen'` (86 codepunten):
--
--     volledig is al schoon            : ja
--     left(schone_naam(…), 80) eindigt op een spatie : ja
--     haalt profiles_display_name_schoon            : NEE
--
--    Gevolg: de insert op `profiles` rolt terug, en daarmee de insert op
--    `auth.users`. De gebruiker krijgt `Database error saving new user` en komt
--    de app niet in. Dat is geen aangepaste naam maar een gemiste registratie.
--
-- ⚠️ **Dit is regel 18 vraag 1 woordelijk**: twee correcte onderdelen —
--    `schone_naam()` klopt, `left()` klopt — en de naad ertussen was van
--    niemand. Gevonden door de security-reviewer op deze PR, en daarna zelf
--    nagemeten; `tests/rls/aanmelding.test.ts` stond er toen al rood van, want
--    dat bestand toetst sinds QS8-448 met zoveel woorden dat *een lange naam
--    nooit een account mag kosten*. Die grendel dééd zijn werk.
--
-- ⚠️ De `nullif`/`coalesce` eromheen is verdediging en geen noodzaak: de
--    binnenste waarde is al genormaliseerd, dus zijn eerste codepunt zit niet in
--    de randenlijst en het resultaat kan niet leeg worden. Hij staat er omdat de
--    belofte hier "een aanmelding mislukt nooit op de naam" is, en dat is geen
--    plek voor een redenering die net klopt.
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
    -- ⚠️⚠️ **`schone_naam()` eromheen én erbinnen, en dat is sinds QS8-508 geen
    --    dubbelop.** Binnen: een naam van twee newlines of één zero-width space
    --    moet als leeg gelden zodat de terugval naar `'Naamloos'` aanslaat
    --    (QS8-448). Buiten: `left(…, 80)` maakt een nieuwe rand, en
    --    `profiles_display_name_schoon` weigert die. Zie de kop.
    --
    -- ⚠️ Er zijn **vier** CHECKs op de kolommen die deze trigger schrijft:
    --    `profiles_display_name_len`, `profiles_display_name_zichtbaar`,
    --    `profiles_avatar_url_len` en sinds 0284
    --    `profiles_display_name_schoon`. Die laatste stond er niet in toen deze
    --    kop "drie" zei — een telling in een comment veroudert stil.
    coalesce(
      nullif(
        schone_naam(
          left(
            coalesce(
              nullif(schone_naam(new.raw_user_meta_data ->> 'full_name'), ''),
              nullif(schone_naam(new.raw_user_meta_data ->> 'name'), ''),
              nullif(schone_naam(split_part(coalesce(new.email, ''), '@', 1)), ''),
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

commit;
