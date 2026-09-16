-- 0280_een_onzichtbaar_teken_tussen_twee_letters_en_een_tag_zonder_vlag.sql —
-- de acht uitzonderingen van 0271 krijgen een **contextregel**, en een
-- subdivisievlag aan het eind van een naam blijft heel (QS8-499).
--
-- ROLLBACK-PAD:
--   In één transactie, met ON_ERROR_STOP aan:
--
--     begin;
--     alter table public.profiles
--       drop constraint if exists profiles_display_name_geen_onzichtbaar_tussen_letters;
--     alter table public.profiles
--       drop constraint if exists profiles_display_name_geen_losse_tag;
--     create or replace function public.schone_naam(p_ruw text)
--     returns text language sql immutable
--     set search_path to 'pg_catalog', 'pg_temp'
--     as $$
--       select regexp_replace(
--         regexp_replace(
--           public.zonder_onzichtbaar_middenin(public.zonder_bidi(coalesce(p_ruw, ''))),
--           '^[' || rand || ']+', ''
--         ),
--         '[' || rand || ']+$', ''
--       )
--       from (
--         select U&'\0001-\0020\007F-\00A0\00AD\034F\061C\115F-\1160\1680\17B4-\17B5\180B-\180E\2000-\200F\2028-\202F\205F-\2064\2066-\206F\2800\3000\3164\FEFF\FFA0\FFF9-\FFFB\+0E0000-\+0E007F' as rand
--       ) s;
--     $$;
--     drop function if exists public.zonder_onzichtbaar_tussen_letters(text);
--     drop function if exists public.zonder_losse_tags(text);
--     commit;
--
--   ⚠️⚠️ **De functiedefinitie staat er woordelijk en niet als omschrijving, en
--      dat is een correctie uit de security-review.** Hier stond
--      *"(de versie uit 0271: bidi -> middenin -> randen)"*. `migraties:controle`
--      toetst alleen dát er een rollback-kop staat, niet of hij uitvoerbaar is —
--      en een terugzet gebeurt per definitie onder tijdsdruk. Dit is woordelijk
--      de body uit 0271, inclusief de brede randenlijst.
--
--   ⚠️ **In die volgorde en in één transactie.** De CHECKs roepen de functies
--      aan, dus die kunnen niet weg zolang ze staan; en `schone_naam()` roept ze
--      óók aan. Los in autocommit geeft dat een halve terugzet waarin
--      `schone_naam()` naar een verdwenen functie wijst — en dan faalt élke
--      profielschrijving, want de CHECKs van 0256, 0269 en 0271 roepen hém aan.
--
--   ⚠️ **En de randenlijst moet mee terug.** Deze migratie versmalt
--      `\+0E0000-\+0E007F` naar `\+0E0000-\+0E001F`; de rollback zet dat terug.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 0271 (QS8-495) weigert alles wat Unicode `Default_Ignorable_Code_Point` noemt
-- **min acht benoemde uitzonderingen**. Die acht renderen óók als nul pixels.
--
-- 📏 Gemeten ná 0271, als gewone ingelogde gebruiker via PostgREST: `Ja<ZWNJ>n`,
--    `Ja<ZWJ>n`, `Ja<CGJ>n` en `Ja<MVS>n` landen alle vier als een naam van vier
--    codepunten die als `Jan` rendert. Twee leden in dezelfde groep kunnen dus
--    nog steeds een pixel-identieke naam dragen — en domeinregel 3 zegt dat
--    peer-goedkeuring een autorisatiegrens is: de lezer leidt uit de náám af wie
--    hij autoriseert.
--
-- 📏 En de andere kant: `schone_naam()` strijkt `U+E0000`–`U+E007F` aan de
--    **randen** weg, dus een naam die op 🏴 eindigt verliest zijn vlag — zeven
--    codepunten in, één uit. Dat is ouder dan 0271; de versie van 0269 doet het
--    net zo hard.
--
-- ---------------------------------------------------------------------------
-- Waarom een contextregel en geen lijst
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Deze acht zijn niet per codepunt te beoordelen, en dát is wat ze van
--    0269 en 0271 onderscheidt.** `U+200C` tussen twee ASCII-letters is een
--    collisievector; dezelfde `U+200C` tussen twee Perzische letters is
--    orthografisch **verplicht**. Het teken is niet het probleem — de plek is
--    het.
--
-- ⚠️⚠️ **De grens is "één alfanumerieke buur, en de andere ASCII", en dáár is
--    hij bijgesteld na de security-review.** De eerste versie eiste aan **beide**
--    kanten `[A-Za-z0-9]`. Een spatie is ASCII maar geen alfanumeriek, dus die
--    blokkeerde de regel — en dan doet hij niets op de vorm van vrijwel elke
--    echte naam.
--
--    📏 Gemeten: van de **267** codepunten die de regel tussen twee letters
--    weghaalt, haalde hij er naast een spatie **nul** weg. `Jan<ZWNJ> Jansen`
--    landde ongehinderd naast `Jan Jansen`, en `O<ZWNJ>'Brien` net zo. Dat is
--    letterlijk het scenario waarvoor dit issue bestaat.
--
--    Een rand telt als ASCII: een teken aan het begin of eind van de naam heeft
--    daar geen schrift naast staan. 📏 Dat sluit `Jan<VS16>` aan het eind, dat de
--    randenlijst niet dekt.
--
-- ⚠️ De correctere regel is *"tussen twee letters uit een schrift dat dit teken
--    niet gebruikt"*, en die vraagt Unicode-scriptdata die Postgres niet heeft.
--
--    ⚠️ **De prijs staat in `docs/ENGINEER-REVIEW.md`:** `Ján<ZWNJ>ös` ontsnapt,
--       want `ö` is geen ASCII. De regel vangt het gemeten geval en niet de hele
--       klasse.
--
-- ⚠️⚠️ **Hier stond "ASCII is bewijsbaar veilig: de twee verzamelingen raken
--    elkaar niet", en dat is onwaar.** 📏 De security-review mat het:
--    `c<U+034F>h` wordt `ch`, en dat is de gedocumenteerde Slowaakse en
--    Hongaarse digraafscheiding — `c<CGJ>h` tegenover `ch`, `c<CGJ>s`,
--    `d<CGJ>z`, `z<CGJ>s`. Twee ASCII-letters, aan beide kanten. De regel raakt
--    dus wél een legitiem gebruik.
--
--    **Het besluit blijft staan; de onderbouwing niet.** De CGJ rendert dáár
--    óók als nul pixels, dus `ch` en `c<CGJ>h` zijn visueel identiek — en die
--    collisie weegt zwaarder dan een sorteerhint die niemand ziet. Wat de regel
--    níet raakt zijn de vier must-allows, en dat is met een veeg nagemeten en
--    niet aangenomen.
--
--    ⚠️ Dat verschil is de moeite van het opschrijven waard omdat dit project
--       het zelf duur betaald heeft: *een afwijking die je onderbouwt is duurder
--       dan een die je vergeet.* Wie over een jaar de grens wil verbreden, leest
--       "de verzamelingen raken elkaar niet" en controleert het niet na.
--
-- ⚠️ **Zeven van de acht, en niet alle acht.** De tags (`U+E0020`–`U+E007F`)
--    hebben een ánder patroon: ze horen bij een `U+1F3F4` en niet tussen twee
--    letters. Ze krijgen daarom hun eigen regel hieronder. Een gedeelde regel
--    zou voor allebei de helft van het geval missen.
--
-- ---------------------------------------------------------------------------

-- ⚠️ `immutable` en zonder `security definer`, om dezelfde reden als
--    `zonder_bidi()` en `zonder_onzichtbaar_middenin()`: de CHECK onderaan roept
--    hem aan, hij hangt alleen van zijn invoer af, en hij leest niets.
--
-- ⚠️ `'pg_temp'` achteraan in het zoekpad — anders zet Postgres hem vooraan.
create or replace function public.zonder_onzichtbaar_tussen_letters(p_ruw text)
returns text
language sql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $$
  -- ⚠️⚠️ **Lookbehind én lookahead, en dat is hier de hele functie.** 📏
  --    Nagemeten dat Postgres ze ondersteunt, en dat de `g`-vlag ermee óók
  --    opeenvolgende gevallen pakt: `a<Z>b<Z>c<Z>d` wordt `abcd`. Zonder
  --    lookaround zou de eerste treffer zijn rechterbuur opeten en het volgende
  --    geval zijn linkerbuur kwijt zijn.
  --
  -- ⚠️⚠️ **Twee alternatieven en niet één, na de security-review.** Het patroon
  --    eist niet langer aan beide kanten een alfanumeriek maar aan één kant, met
  --    ASCII aan de andere. `(?![^ascii])` slaagt óók aan het eind van de tekst
  --    en `(?<![^ascii])` aan het begin — een rand telt dus als ASCII, want daar
  --    staat geen schrift naast.
  --
  --    ⚠️ Er ontstaan geen deeltreffers door terugkrabbelen: elk codepunt in
  --       `tussen` ligt boven `U+007F`, dus een ingekorte reeks laat een
  --       niet-ASCII teken over en de lookahead faalt alsnog.
  --
  -- ⚠️ De TypeScript-kant doet hetzelfde **zonder** lookbehind, met een lus over
  --    de codepunten. Dat is met opzet: Hermes (React Native) kent lookbehind
  --    niet, en een regex die daar bij het laden al omvalt is een witte app.
  --    De twee vormen mogen verschillen zolang de naadtest bewijst dat ze
  --    hetzelfde oordelen — en die vergelijkt sinds dit issue in context.
  --
  -- ⚠️ `[A-Za-z0-9]` en niet `\w`: die laatste is in Postgres locale-afhankelijk
  --    en zou in een andere collatie letters met accenten mee kunnen nemen. Dan
  --    schuift de grens mee met een instelling in plaats van met een besluit.
  select regexp_replace(
    coalesce(p_ruw, ''),
    -- links alfanumeriek, rechts ASCII of het eind van de naam
    '(?<=[A-Za-z0-9])[' || tussen || ']+(?![^' || asciibereik || '])' ||
    -- of andersom: links ASCII of het begin, rechts alfanumeriek
    '|(?<![^' || asciibereik || '])[' || tussen || ']+(?=[A-Za-z0-9])',
    '',
    'g'
  )
  from (
    select U&'\034F\061C\180B-\180F\200C-\200F\FE00-\FE0F\+0E0100-\+0E01EF' as tussen,
           U&'\0001-\007F' as asciibereik
  ) s;
$$;

comment on function public.zonder_onzichtbaar_tussen_letters(text) is
  'Een tekst zonder de zeven uitzonderingen van 0271 op de plek waar ze niets '
  'kunnen betekenen: tussen twee ASCII-alfanumerieken — QS8-499. Spiegelt '
  '`zonderOnzichtbaarTussenLetters()` uit `src/shared/tekst`. ⚠️ Bewust niet de '
  'tags: die horen bij een U+1F3F4 en hebben hun eigen regel in '
  'zonder_losse_tags().';

revoke all  on function public.zonder_onzichtbaar_tussen_letters(text) from public, anon, authenticated;
grant execute on function public.zonder_onzichtbaar_tussen_letters(text) to authenticated;

-- ---------------------------------------------------------------------------
-- De tags: alleen geldig ná een U+1F3F4
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Deze regel maakt de randenlijst van 0256 op één punt onnodig, en dat is
--    de reparatie.** 🏴 is `U+1F3F4` plus zes tagtekens; de randenlijst strijkt
--    `U+E0000`–`U+E007F` en at de staart dus op. Nu blijft een tag staan als hij
--    bij een vlag hoort, en verdwijnt hij overal anders — óók aan de rand, want
--    een losse tag is daar net zo goed nul pixels.
--
-- ⚠️ **Eén `regexp_replace` met twee alternatieven, en geen lookbehind.** De
--    eerste tak vangt een héle vlagreeks en zet hem terug via `\1`; de tweede
--    vangt een losse tag en vervangt hem door niets, want `\1` is dan leeg. De
--    motor scant van links naar rechts, dus een tag die bij een vlag hoort wordt
--    al door de eerste tak opgegeten voordat de tweede hem ziet.
--
-- ⚠️⚠️ **De eerste tak toetst de vórm van de reeks en niet alleen de vlagbasis
--    ervóór, en dat is de reparatie uit de security-review.** Hier stond
--    `U+1F3F4` gevolgd door `[tag]*` — élke tag mocht blijven zodra er ergens
--    een vlagbasis vóór stond.
--
--    📏 Gemeten: `U+E0020`–`U+E007E` is een 1-op-1 afbeelding van ASCII
--    `0x20`–`0x7E`. Achter één zichtbare 🏴 pasten dus ~75 tekens **willekeurige
--    onzichtbare tekst** binnen de grens van 80 codepunten — in een kolom die
--    groepszichtbaar is en die als platte tekst in systeemberichten wordt
--    ingebakken. En `🏴` plus één losse sluittag rendert als de kále 🏴, dus het
--    was ook gewoon een collisievector.
--
--    ⚠️ **Aan de rand was het bovendien een regressie.** De randenlijst streek
--       die staart vóór deze migratie wél weg; de versmalling hieronder haalde
--       dat weg zonder dat de nieuwe regel de vorm toetste. Er ging dus méér
--       open dan er dicht ging.
--
--    De vorm is die van UTS #51: de basis, 2 t/m 6 tekens uit
--    `U+E0030`–`U+E0039` / `U+E0061`–`U+E007A` (de tag-varianten van `0`–`9` en
--    `a`–`z`), en `U+E007F` als sluiter. 📏 Nagemeten dat 🏴󠁧󠁢󠁳󠁣󠁴󠁿, 🏴󠁧󠁢󠁷󠁬󠁳󠁿 en 🏴󠁧󠁢󠁥󠁮󠁧󠁿 alle
--    drie hun zeven codepunten houden, en dat een reeks zonder sluiter of met
--    een tag buiten dat bereik terugvalt op de kale vlagbasis.
--
--    📏 Geijkt vóór het schrijven: de Schotse vlag houdt zijn **7** codepunten,
--    en `Jan` plus één losse tag wordt **3**.
create or replace function public.zonder_losse_tags(p_ruw text)
returns text
language sql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $$
  select regexp_replace(
    coalesce(p_ruw, ''),
    -- een wélgevormde vlagreeks: de basis, 2 t/m 6 vlagletters, de sluiter
    '(' || U&'\+01F3F4' || '[' || U&'\+0E0030-\+0E0039\+0E0061-\+0E007A' ||
      ']{2,6}' || U&'\+0E007F' || ')' ||
    -- al het andere tagteken, waar het ook staat
    '|[' || U&'\+0E0020-\+0E007F' || ']',
    '\1',
    'g'
  );
$$;

comment on function public.zonder_losse_tags(text) is
  'Een tekst zonder tagtekens die niet bij een U+1F3F4 horen — QS8-499. '
  'Spiegelt `zonderLosseTags()` uit `src/shared/tekst`. Een subdivisievlag '
  '(🏴 plus zes tags) blijft daardoor heel, ook aan het eind van een naam, '
  'terwijl een losse tag nergens meer als nul pixels blijft staan.';

revoke all  on function public.zonder_losse_tags(text) from public, anon, authenticated;
grant execute on function public.zonder_losse_tags(text) to authenticated;

-- ---------------------------------------------------------------------------
-- schone_naam() krijgt er twee stappen bij, en de randenlijst wordt versmald
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Vijf stappen, elk met een eigen reden, in deze volgorde:**
--      1. bidi-overrides overal weg          (0269)
--      2. nul-pixeltekens overal weg          (0271)
--      3. losse tags weg, vlaggen heel        (hier)
--      4. de zeven tussen twee ASCII-letters  (hier)
--      5. de randen                           (0256)
--
-- ⚠️⚠️ **Stap 3 staat vóór stap 4, en de reden die hier eerst stond klopte
--    niet.** Er stond: *"daarna is elke overgebleven tag er een die bij een vlag
--    hoort, en dan kan stap 4 hem niet meer per ongeluk raken."* 📏 Nagemeten:
--    de tekenklasse van stap 4 bevat géén enkel codepunt uit
--    `U+E0020`–`U+E007F`, dus stap 4 kan een tag in **geen van beide**
--    volgordes raken. Die reden verdedigde iets wat sowieso niet kon gebeuren.
--
--    De volgorde is wél dragend, maar om de spiegelzijde: **stap 3 kan twee
--    ASCII-letters naast elkaar zetten die dat daarvoor niet waren**, en stap 4
--    vuurt alleen tussen ASCII-buren. 📏 Gemeten op de lokale stack:
--
--      `a<U+E0067><U+200C>b`   stap 3 dan 4  ->  `ab`         (2 codepunten)
--                              stap 4 dan 3  ->  `a<ZWNJ>b`   (3 codepunten)
--
--    Omgekeerd ziet stap 4 links van de ZWNJ een tag in plaats van `a`, vuurt
--    niet, en ruimt stap 3 daarna de tag op — met de ZWNJ er nog tussen. Dat is
--    precies het geval dat deze migratie moet sluiten.
--
--    ⚠️ Dit staat als naadtoets in `tests/rls/naamnormalisatie.test.ts`. Een
--       volgorde die alleen in een comment verdedigd wordt, is een aanname —
--       en een uitgeschreven argument leest de volgende persoon als een reden
--       om er niet aan te twijfelen.
--
-- ⚠️⚠️ **De randenlijst versmalt van `\+0E0000-\+0E007F` naar
--    `\+0E0000-\+0E001F`.** Dat is de helft van acceptatiecriterium 2: zonder
--    deze versmalling eet de randstap de staart van een vlag alsnog op, hoe goed
--    stap 3 ook is. Wat er overblijft (`U+E0000`–`U+E001F`) haalt stap 2 al
--    overal weg; het staat hier nog omdat de lijst woordelijk gelijk moet zijn
--    aan `ONZICHTBARE_BEREIKEN` in `src/shared/tekst/index.ts` — de naadtest
--    legt hem codepunt voor codepunt naast die lijst.
create or replace function public.schone_naam(p_ruw text)
returns text
language sql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $$
  select regexp_replace(
    regexp_replace(
      public.zonder_onzichtbaar_tussen_letters(
        public.zonder_losse_tags(
          public.zonder_onzichtbaar_middenin(public.zonder_bidi(coalesce(p_ruw, '')))
        )
      ),
      '^[' || rand || ']+', ''
    ),
    '[' || rand || ']+$', ''
  )
  from (
    select U&'\0001-\0020\007F-\00A0\00AD\034F\061C\115F-\1160\1680\17B4-\17B5\180B-\180E\2000-\200F\2028-\202F\205F-\2064\2066-\206F\2800\3000\3164\FEFF\FFA0\FFF9-\FFFB\+0E0000-\+0E001F' as rand
  ) s;
$$;

comment on function public.schone_naam(text) is
  'Een naam zonder onzichtbare randen, zonder bidi-stuurtekens, zonder tekens '
  'die als nul pixels renderen, zonder losse tags en zonder de zeven '
  'uitzonderingen tussen twee ASCII-letters — QS8-448, uitgebreid in QS8-450, '
  'QS8-495 en QS8-499. Spiegelt `schoneNaam()` uit `src/shared/tekst`; '
  '`tests/rls/naamnormalisatie.test.ts` legt de twee oordelen naast elkaar, per '
  'codepunt én in context.';

-- ---------------------------------------------------------------------------
-- Staat er al zo een? — en dit blok staat vóór de CHECKs
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De volgorde is de les van 0269 en 0270 en geen stijlkeuze.** 📏 Bij 0269
--    stond dit blok eerst ná de `add constraint`, en dan draait het nooit: de
--    ALTER valt om met `violated by some row`, de transactie is afgebroken, en
--    alles erna wordt overgeslagen. Een `add constraint` **zónder** `not valid`
--    toetst élke bestaande rij en weigert.
do $$
declare
  v_tussen bigint;
  v_tags   bigint;
begin
  select
    count(*) filter (where display_name <> public.zonder_onzichtbaar_tussen_letters(display_name)),
    count(*) filter (where display_name <> public.zonder_losse_tags(display_name))
  into v_tussen, v_tags
  from public.profiles;

  if v_tussen + v_tags > 0 then
    raise notice
      '⚠️ Profielen met een onzichtbaar teken tussen twee letters: %; met een '
      'losse tag: %. De CHECKs hierna gaan daarop om en deze migratie stopt. '
      'Bepaal eerst wat er met die namen gebeurt — dat is een '
      'productbeslissing, geen migratiestap.',
      v_tussen, v_tags;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- De grens zelf
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Weigeren en niet normaliseren**, net als 0269 en 0271: de eerlijke client
--    normaliseert al met `schoneNaam()`, dus wie deze grens raakt stuurt buiten
--    de app om.
--
-- ⚠️ **Twee CHECKs en niet één**, zodat de melding zegt wélke regel hem
--    tegenhoudt. 📏 Dat is de les uit de security-ronde op QS8-450: `23514` zegt
--    alleen "een CHECK weigerde dit" en niet welke, en een toets die alleen op
--    die code let, blijft groen als er een ándere CHECK voor in de plaats komt.
alter table public.profiles
  drop constraint if exists profiles_display_name_geen_onzichtbaar_tussen_letters;

alter table public.profiles
  add constraint profiles_display_name_geen_onzichtbaar_tussen_letters
  check (display_name = public.zonder_onzichtbaar_tussen_letters(display_name));

alter table public.profiles
  drop constraint if exists profiles_display_name_geen_losse_tag;

alter table public.profiles
  add constraint profiles_display_name_geen_losse_tag
  check (display_name = public.zonder_losse_tags(display_name));

comment on constraint profiles_display_name_geen_onzichtbaar_tussen_letters on public.profiles is
  'Een weergavenaam draagt geen ZWNJ, ZWJ, CGJ, richtingsmarkering, '
  'variatieselector of IVS tussen twee ASCII-alfanumerieken — QS8-499. Daar '
  'kunnen ze niets betekenen, en ze renderen als nul pixels: `Ja<ZWNJ>n` '
  'rendert als `Jan`.';

comment on constraint profiles_display_name_geen_losse_tag on public.profiles is
  'Een weergavenaam draagt geen tagteken dat niet bij een U+1F3F4 hoort — '
  'QS8-499. Een subdivisievlag blijft daardoor heel, ook aan het eind van de '
  'naam, terwijl een losse tag nergens als nul pixels blijft staan.';
