-- 0273_een_dagplafond_op_blokkades_dat_niemand_raakt_die_misbruik_ontvlucht.sql
-- — `user_blocks` krijgt een dagplafond. QS8-496.
-- Afweging, metingen en ijkingen:
-- `docs/decisions/2026-09-15-een-plafond-dat-een-uitweg-niet-versperd.md`
--
-- ROLLBACK-PAD:
--   drop trigger if exists blokkades_dagplafond on public.user_blocks;
--   drop trigger if exists blokkades_rem on public.user_blocks;
--   drop function if exists public.rem_blokkades();
--   create or replace function public.blokkeer(uuid) … -- terug naar 0145,
--     zónder de `rate_limited`-tak. ⚠️ Dat zet het bestaansorakel terug zodra
--        er nog een plafond staat; doe het alleen samen met de trigger.
--   create or replace function public.sleutelzetters() … -- terug naar de
--     definitie uit 0248 (QS8-381), zónder de regel voor `app.rem_blokkades`.
--     ⚠️ Kopieer dat lichaam uit de database of uit 0248 en niet uit deze
--        migratie; zie QS8-358.
--   drop function if exists public.begrens_blokkades();
--   drop function if exists public.blokkades_plafond();
--   ⚠️ Zet `blokkades_plafond()` niet terug op `immutable`: dat is route A uit
--      0254 en `volatiliteit:controle` wordt er rood van.
--
-- ⚠️ Deze migratie raakt geen bestaande rij: ze voegt twee functies en één
--    trigger toe. De trigger vuurt pas bij een nieuwe INSERT.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt: een voorwaarde die intreedt, geen nieuwe bevinding
-- ---------------------------------------------------------------------------
--
-- 0203 gaf tien tabellen een dagteller en liet `user_blocks` er met zoveel
-- woorden buiten:
--
--   **`user_blocks` — bewust geen plafond, en dat is een veiligheidskeuze.**
--     Een rem op blokkeren zit iemand in de weg die misbruik ontvlucht […]
--     **Wordt zwaarder als:** profiel-id's in bulk op te vragen worden.
--
-- `zoek_mensen()` (QS8-476) **is** dat: tot 50 profiel-id's per aanroep, en elk
-- teruggegeven `id` is een geldige `blocked_id`. De begrenzing *"door wie je
-- kent"* is daarmee weg; wat overblijft is *"hoeveel accounts er zijn"*.
--
-- ⚠️ Dit is dus precies de vraag die CLAUDE.md voorschrijft bij een nieuwe
--    beslissing die op een bestaande primitieve handeling leunt: *staat daar een
--    weggelegde bevinding over?* Hier stond die er, mét zijn voorwaarde.
--
-- ---------------------------------------------------------------------------
-- De spanning wordt opgelost en niet weggenomen
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De reden dat er géén plafond stond is goed en blijft goed.** Een rem op
--    blokkeren zit iemand in de weg die misbruik ontvlucht, en dat is de
--    verkeerde kant om te falen. Deze migratie draait dat niet om: het plafond
--    ligt zo hoog dat wie in paniek vijf of vijftig mensen blokkeert er nooit
--    tegenaan loopt. Wat het begrenst is uitsluitend de bulkvorm.
--
-- ⚠️ **Twee dingen zorgen ervoor dat een échte gebruiker dit nooit merkt**, en
--    het tweede is er een die je makkelijk over het hoofd ziet:
--
--    1. Het getal (zie hieronder).
--    2. `blokkeer()` (0145) doet `insert … on conflict do nothing`, dus iemand
--       die al geblokkeerd is levert **nul** toegevoegde rijen op. De
--       lege-batchtak hieronder laat zo'n statement ongemoeid, dus herhaald
--       blokkeren van dezelfde persoon verbruikt geen quotum. Zonder die tak
--       zou een app die bij elke start opnieuw blokkeert iemand blijvend
--       vastzetten op een fout die hij zelf niet kan opheffen — dat is de
--       must-allow die 0214 voor pushtokens met zoveel woorden beschrijft.
--
-- ---------------------------------------------------------------------------
-- Het getal: 500, en dat is afgeleid en niet rond
-- ---------------------------------------------------------------------------
--
-- Het huis rekent een plafond uit als *een veelvoud van een zware
-- gebruiksdag* (0203, "De zes plafonds, en waarom ze zo hoog staan"). Voor
-- blokkades:
--
--   ⚠⚠ **Hier stond eerst 110, en dat was de verkeerde eenheid.** Gevonden in de
--      security-review. De redenering was: een groep is vol bij **twaalf** en je
--      zit in hoogstens **tien** groepen, dus 10 × 11 = 110 en *"meer kán hij er
--      via groepen niet kennen"*. Die twee plafonds kloppen — 📏 nagemeten:
--      `join_group_with_code()` en `beslis_lidmaatschapsverzoek()` toetsen allebei
--      12 én 10, `create_group()` toetst 10, en `authenticated` heeft **geen**
--      INSERT op `group_members`, dus die definer-functies zijn de enige weg.
--
--      ⚠️ **Maar 110 is een momentopname en dit plafond telt een etmaal.**
--      Lidmaatschap is geen dagplafond: `verlaat_groep()` **verwijdert** de rij
--      (📏 nagemeten: een `delete from group_members`, geen status op
--      `inactive`), dus vertrekken maakt de plek meteen vrij en je kunt de
--      volgende in.
--
--   📏 het ergste echte  wat een etmaal wél begrenst zijn de dagbudgetten om
--      geval           überhaupt ergens binnen te komen, en die zijn gemeten:
--                      `join_group_with_code()` weigert vanaf **20** pogingen per
--                      etmaal en `lidmaatschapsverzoeken_over()` geeft er **10**.
--                      Dat is 30 keer een groep in, met telkens hoogstens 11
--                      anderen erin: **~330** verschillende mensen op één dag.
--   het plafond      **500**, ruim anderhalf keer dat getal.
--
--   ⚠️ **Dat is afgeleid uit gemeten constanten en niet end-to-end gedraaid** —
--      dertig groepen volbouwen en weer verlaten is geen toets die hier
--      thuishoort. De constanten (20, 10, 12, 10, en de `delete` bij vertrek)
--      zijn stuk voor stuk uit de draaiende database gelezen.
--
--   ⚠⚠ **De marge is dus anderhalf en niet vier en een half, en dat verandert
--      wat je in de gaten houdt.** Niet de leden- en groepsplafonds zijn de
--      gevoelige knop maar die twee dágbudgetten: gaan 20 en 10 omhoog, dan
--      schuift dit getal mee zonder dat iemand naar 500 kijkt.
--
--   ⚠️ Die bovengrens geldt alleen voor het **legitieme** geval. `zoek_mensen()`
--      laat je juist mensen blokkeren die je nooit ontmoet hebt, en dat is
--      precies waarom er een plafond nodig is: daar bindt de groepsroute niets
--      meer, niet 110 en niet 330.
--
-- ⚠️ **Het faalt naar de veilige kant, en dat is hier de hele opdracht.** Te
--    laag betekent dat iemand die misbruik ontvlucht tegen een muur loopt; te
--    hoog betekent dat een tabel harder groeit dan nodig. Die tweede is
--    begrensd, omkeerbaar en kost opslag; de eerste kost een mens zijn uitweg.
--    Bij twijfel dus omhoog. 500 zit in dezelfde band als
--    `voltooiingen_plafond()` en `dagzetten_plafond()`.
--
-- ⚠️ **En het bindt de lus wél.** `zoek_mensen()` geeft 50 id's per aanroep, dus
--    de bulkvorm gaat van onbegrensd naar tien aanroepen per etmaal.
--
-- ---------------------------------------------------------------------------

begin;

-- ⚠️⚠️ **`stable` en niet `immutable`, en dat is route A uit 0254.** Een
--    `immutable` functie met nul argumenten wordt bij het plannen uitgerekend;
--    PostgREST hergebruikt dat plan per poolverbinding, en dan komt de
--    EXECUTE-toets er nooit meer aan te pas — één aanroep door een bevoorrechte
--    rol en de grant is weg voor iedereen op die verbinding. `set search_path`
--    helpt daar niet tegen; dat sluit route B. 0214 zette `pushtokens_plafond()`
--    nog op `immutable` en 0254 heeft dat rechtgezet — dit is dezelfde vorm, dus
--    hier meteen goed. `npm run volatiliteit:controle` is de grendel.
create or replace function public.blokkades_plafond()
returns integer
language sql
stable
set search_path = public, pg_temp
as $$ select 500 $$;

comment on function public.blokkades_plafond() is
  'Hoeveel mensen één gebruiker per etmaal kan blokkeren. 500 is ruim anderhalf '
  'keer het zwaarste legitieme etmaal: 20 toetredingen via een code plus 10 via '
  'een verzoek, elk in een groep van hoogstens twaalf, is ~330 verschillende '
  'mensen op één dag. Bewust hoog: te laag zit iemand in de weg die misbruik '
  'ontvlucht, en dat is de verkeerde kant om te falen. De gevoelige knop zijn '
  'die twee dagbudgetten, niet de leden- of groepsplafonds. Zie 0273 en '
  'QS8-496.';

-- ⚠️ Onwrikbare regel 4: `authenticated` staat er met zoveel woorden bij. Deze
--    twee worden alleen vanuit een trigger aangeroepen, dus er komt geen grant
--    terug — zelfde afweging als bij `pushtokens_plafond()`.
revoke execute on function public.blokkades_plafond()
  from public, anon, authenticated;

-- ⚠️ **`for each statement` met een transitietabel**, net als de tien van 0203:
--    één vensterquery per verzoek in plaats van één per rij.
create or replace function public.begrens_blokkades()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_batch integer;
begin
  -- ⚠️ De tak beslist op de aanwezigheid van een sessie en niet op een rolnaam
  --    (0083, en uitgeschreven in 0192). Zonder sessie is er geen gebruiker om
  --    tegen af te rekenen; de rollover en de jobs draaien zo.
  if (select auth.uid()) is null then return null; end if;

  select count(*) into v_batch from nieuw;

  -- ⚠️⚠️ **Dit is de must-allow en niet een optimalisatie.** `blokkeer()` doet
  --    `on conflict do nothing`, dus iemand opnieuw blokkeren voegt nul rijen
  --    toe — en die handeling hoort geen quotum te kosten. Zonder deze regel
  --    telt de trigger de teller ook op bij een statement dat niets deed.
  if v_batch = 0 then return null; end if;

  perform tel_dagteller('user_blocks', 'gebruiker', (select auth.uid())::text,
                        blokkades_plafond(), interval '1 day',
                        'blokkades in één dag', v_batch);

  return null;
end $$;

revoke execute on function public.begrens_blokkades()
  from public, anon, authenticated;

-- ⚠️⚠️ **De rem hóórt bij de teller en is geen tweede feature.** Een
--    dagteller is `after insert … for each statement`, want een transitietabel
--    bestaat alleen in `after` — en dus schrijft Postgres de hele batch fysiek
--    weg vóórdat de trigger nee zegt. 0200 heeft dat gemeten: een geweigerde
--    batch van 20.000 kostte 2,9 MB die pas bij een `vacuum full` terugkomt.
--    Deze rem hakt dat af op rijniveau, bij de noodgrens van twee keer het
--    dagplafond.
--
--    📏 **Op deze tabel nagemeten en niet overgenomen uit 0200**, op de lokale
--       stack met één batch van 3000 rijen in één statement, beide keren vanaf
--       een lege tabel (`vacuum full` ertussen) en beide keren teruggerold:
--
--         mét de rem     `pg_relation_size` gaat van 0 naar **73.728** bytes; de
--                        fout komt uit `rem_blokkades()` bij rij **1001**, de
--                        noodgrens van tweemaal het dagplafond.
--         zónder de rem  (`disable trigger blokkades_rem`) van 0 naar **204.800**
--                        bytes; de fout komt dan pas uit `tel_dagteller()`, via
--                        de statement-trigger, nádat alle 3000 rijen geschreven
--                        zijn.
--
--       Nul rijen blijven er in beide gevallen over, en die ruimte komt pas bij
--       een `vacuum full` terug. ⚠️ Het verschil is een factor 2,8 bij 3000 rijen
--       en het groéit met de batch: de rem kapt af op een vast getal, de
--       statement-trigger op geen enkel.
--
--    📏 **Ik had hem niet gebouwd, en `tests/rls/remdekking.test.ts` vond dat.**
--    Dat is precies waar die test voor bestaat: 0203 landde ooit met zes nieuwe
--    dagtellers en géén rem, een paar uur nadat het dossier er letterlijk voor
--    waarschuwde. De waarschuwing was geen grendel; de test is dat wel.
--
-- ⚠️ **`current_setting` met `is_local = true` en niet een tellertabel.** De
--    instelling leeft in de tránsactie, dus hij telt één verzoek en verdwijnt
--    erna vanzelf — ook bij een rollback. Zelfde vorm als de veertien remmen
--    van 0200 en 0207.
create or replace function public.rem_blokkades() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_n integer;
begin
  if (select auth.uid()) is null then return new; end if;
  v_n := coalesce(nullif(current_setting('app.rem_blokkades', true), ''), '0')::integer + 1;
  perform set_config('app.rem_blokkades', v_n::text, true);
  if v_n > blokkades_plafond() * 2 then
    raise exception 'Te veel blokkades in één verzoek (% rijen, noodgrens %)',
      v_n, blokkades_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit verzoek schrijft er te veel in één keer. Verdeel het over meerdere verzoeken.';
  end if;
  return new;
end $$;

revoke all on function public.rem_blokkades() from public, anon, authenticated;

-- ⚠️ **De namen zijn een afspraak die `remdekking.test.ts` uitleest**: een teller
--    heet `<domeinwoord>_dagplafond` en zijn rem `<domeinwoord>_rem`, en die rem
--    moet `rem_<domeinwoord>()` aanroepen. De eerste versie hiervan noemde de
--    teller naar de tábel (`user_blocks_dagplafond`) — de enige van achttien die
--    dat deed, en daarmee zou de rem nooit aan zijn teller gekoppeld zijn.
drop trigger if exists user_blocks_dagplafond on public.user_blocks;
drop trigger if exists blokkades_rem on public.user_blocks;
create trigger blokkades_rem before insert on public.user_blocks
  for each row execute function public.rem_blokkades();

drop trigger if exists blokkades_dagplafond on public.user_blocks;
create trigger blokkades_dagplafond
  after insert on public.user_blocks
  referencing new table as nieuw
  for each statement
  execute function public.begrens_blokkades();

-- ---------------------------------------------------------------------------
-- De sleutel meldt zich aan bij het register
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **`rem_blokkades()` zet `app.rem_blokkades`, en elke `app.`-sessiesleutel
--    hoort in `sleutelzetters()`.** Zonder deze herdefinitie meldt de derde tak
--    van die functie hem als onbekend — 📏 gemeten, vóór deze regel er stond:
--
--      rem_blokkades -> noemt app.rem_blokkades, een app.-sessiesleutel die in
--                       geen enkel register van deze teller staat
--
--    met vier rode asserties in drie testbestanden eronder
--    (`tests/rls/sleutelzetters.test.ts`, `tests/rls/stille-weigering.test.ts`,
--    `tests/rls/archief-leesbaar.test.ts`). De teller faalt dicht en deed hier
--    precies zijn werk.
--
-- ⚠️⚠️ **Het lichaam hieronder is uit de dráaiende database gekopieerd met
--    `pg_get_functiondef()`, en niet uit een migratiebestand.** Dat is de regel
--    van QS8-358 en hij is niet vrijblijvend: dit register leeft in een
--    functielichaam, dus twee branches die er allebei een rij bij zetten staan
--    in verschillende bestanden en git ziet geen conflict. Het hoogste nummer
--    wint en het register van de ander verdwijnt zonder een woord. 0199, 0207
--    én 0214 zijn hun rijen alle drie al eens zo kwijtgeraakt.
--
--    ⚠️ De rollback zet dit terug naar de definitie van 0248 (QS8-381), de
--       laatste die dit lichaam vóór deze migratie schreef — niet naar een
--       willekeurige eerdere.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sleutelzetters()
 RETURNS TABLE(naam text, bezwaar text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with sleutel(instelling, toegestaan) as (
    values
      ('app.heropent_groep',      array['heropen_groep', 'archief_blijft_archief']),
      -- ⚠️ Uit 0208 (QS8-360). De huddledag verzetten schuift de start van de
      --    lopende periode, en dan gaat de weekafsluiting die erbij hoort mee —
      --    langs de pin van 0206, die `group_id` en `user_id` onverkort gepind
      --    houdt.
      ('app.huddledag_verzet',    array['zet_huddledag', 'pin_week_review']),
      -- ⚠️ **Deze drie komen uit 0199 (QS8-356) en staan hier omdat een
      --    `create or replace` het hele register vervangt.** Ze zijn er bij het
      --    samenvoegen bijna uit gevallen: de RLS-suite meldde na de merge drie
      --    ongeregistreerde sleutels — `verlaat_groep`,
      --    `beslis_lidmaatschapsverzoek` en `verwijder_lid` — omdat mijn versie
      --    het register van vóór die migratie kopieerde.
      --
      --    Dat is de val van een teller die zijn eigen register in zijn lichaam
      --    draagt: twee branches breiden hem uit, de laatste `replace` wint, en
      --    de ander verdwijnt zonder een woord. Hier ving de teller zichzelf op
      --    doordat hij de weggevallen sleutels meteen als ongeregistreerd meldde.
      ('app.beheer_overgedragen',   array['verlaat_groep', 'guard_group_member_update']),
      ('app.lidmaatschap_besloten', array['beslis_lidmaatschapsverzoek', 'guard_group_member_update']),
      ('app.lid_uitgezet',          array['verwijder_lid', 'guard_group_member_update']),
      -- De tellers van 0200. Elke rem mag alleen zijn eigen instelling zetten.
      ('app.rem_weekdoelen',         array['rem_weekdoelen']),
      ('app.rem_berichten',          array['rem_berichten']),
      ('app.rem_dagafvinkingen',     array['rem_dagafvinkingen']),
      ('app.rem_weekreacties',       array['rem_weekreacties']),
      ('app.rem_weekplanstappen',    array['rem_weekplanstappen']),
      ('app.rem_doelen',             array['rem_doelen']),
      ('app.rem_mijlpalen',          array['rem_mijlpalen']),
      ('app.rem_doelgebeurtenissen', array['rem_doelgebeurtenissen']),
      ('app.rem_goedkeuringen',      array['rem_goedkeuringen']),
      -- ⚠️⚠️ **Deze vijf komen uit 0207 (QS8-361) en waren er bij het samenvoegen
      --    uit gevallen.** Mijn versie kopieerde het register van vóór die
      --    migratie, precies zoals de aantekening bij de drie sleutels van 0199
      --    hierboven beschrijft — de val van een teller die zijn eigen register in
      --    zijn lichaam draagt: twee branches breiden hem uit, de laatste
      --    `replace` wint, en de ander verdwijnt zonder een woord.
      --
      -- 📏 De teller ving zichzelf opnieuw op: `rem_commitments`, `rem_dagzetten`,
      --    `rem_doelinterviews`, `rem_doelkoppelingen` en `rem_voltooiingen`
      --    stonden meteen als ongeregistreerd in de uitslag, en twee RLS-tests
      --    werden er rood van. Dat is de tweede keer op vier dagen; het staat als
      --    QS8-358.
      ('app.rem_commitments',        array['rem_commitments']),
      ('app.rem_voltooiingen',       array['rem_voltooiingen']),
      ('app.rem_dagzetten',          array['rem_dagzetten']),
      ('app.rem_doelkoppelingen',    array['rem_doelkoppelingen']),
      ('app.rem_doelinterviews',     array['rem_doelinterviews']),
      -- ⚠️⚠️ **Uit 0214 (QS8-369), en deze regel is er bijna uit gevallen.**
      --    Die migratie landde op `main` terwijl deze branch openstond en
      --    hernummerde mij van 0214 naar 0215 — dus deze `create or replace`
      --    draait er nu áchteraan. Het register dat ik kopieerde was van vóór hun
      --    migratie, en zonder deze regel had ik `app.rem_pushtokens` er stil
      --    weer uit gehaald.
      --
      --    Dat is exact de val van QS8-358, en de derde keer dat hij toeslaat: een
      --    teller die zijn eigen register in zijn lichaam draagt, twee branches
      --    die hem uitbreiden, en de laatste `replace` wint. 📏 Gevonden door na
      --    het samenvoegen te grepen op wat hún 0214 registreert en dat naast het
      --    mijne te leggen.
      --
      --    ⚠️ **En de teller had zichzelf ook opgevangen**, net als bij 0199 en
      --    0207: `rem_pushtokens()` zet die sleutel nog steeds, dus zonder deze
      --    regel meldt hij hem meteen als ongeregistreerd — 📏 nagemeten, de regel
      --    weghalen geeft `rem_pushtokens: noemt app.rem_pushtokens`. Dat is de
      --    hele reden dat deze grendel bestaat, en het is de derde keer dat hij
      --    zijn eigen register redt.
      ('app.rem_pushtokens',         array['rem_pushtokens']),
      -- ⚠️ Uit 0217 (QS8-374). De zestiende dagteller, en de eerste op een
      --    tabel die niemand rechtstreeks beschrijft: `group_events` is bij
      --    alle zeven schrijvers een neveneffect.
      --
      -- ⚠️⚠️ **En dit register is voor de tweede keer op rij opnieuw uitgelezen
      --    in plaats van gekopieerd.** Toen deze migratie geschreven werd stond
      --    hij op 0215; QS8-376 landde ondertussen op `main` met een 0215 die
      --    déze functie herschrijft — `ilike` in plaats van `like`, en een derde
      --    tak die per sleutel kijkt in plaats van per functie. 📏 Het verschil
      --    is nagemeten met een `diff` tussen wat ik meedroeg en wat er ná hun
      --    migratie in de database stond: mijn kopie had hun hele reparatie
      --    stilzwijgend teruggedraaid. Dat is QS8-358 voor de vierde keer.
      ('app.rem_groepsgebeurtenissen', array['rem_groepsgebeurtenissen']),
      -- ⚠️ Uit 0227 (QS8-379). De Lijst krijgt zijn eigen rem, en dus zijn eigen
      --    sleutel.
      ('app.rem_taken',                array['rem_taken']),
      -- ⚠️ Uit 0248 (QS8-381). `zet_taakzichtbaarheid()` zet hem op het id van
      --    de taak die hij deelt, en `pin_taak()` leest hem om precies díe rij
      --    door te laten. Twee functies, één sleutel: de zetter en de lezer.
      ('app.taak_gedeeld',             array['zet_taakzichtbaarheid', 'pin_taak']),
      -- ⚠️ Uit 0273 (QS8-496). De achttiende dagteller krijgt zijn rem, en dus
      --    zijn sleutel. 📏 Deze regel is er niet uit voorzorg bij gezet maar
      --    omdat de derde tak hieronder rood stond: `rem_blokkades -> noemt
      --    app.rem_blokkades, een app.-sessiesleutel die in geen enkel register
      --    van deze teller staat`, met vier testasserties in drie bestanden
      --    eronder. Precies waar die tak voor gebouwd is.
      ('app.rem_blokkades',            array['rem_blokkades'])
  ),
  bekend as (
    select p.proname::text as naam, s.instelling, s.toegestaan
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join sleutel s
    where n.nspname = 'public'
      and p.prosrc ilike '%' || s.instelling || '%'
      and p.proname <> 'sleutelzetters'
  )
  select naam,
         'noemt ' || instelling || '; alleen ' ||
         array_to_string(toegestaan, '() en ') || '() horen die sleutel te kennen'
    from bekend
   where naam <> all (toegestaan)

  union all

  -- ⚠️ De derde tak: een `app.`-instelling die in geen enkel register hierboven
  --    staat. Zonder deze tak dekt de teller alleen de sleutels die iemand er al
  --    in heeft gezet, en is de vólgende sleutel weer ongeteld.
  select distinct p.proname::text,
         -- ⚠️ De naam van deze functie staat met opzet niet in deze tekst.
         --    `keten:controle` telt een naam in de bron als een aanroeper, en
         --    strippen doet hij alleen commentaar — niet een tekenreeks. Een
         --    functie die zichzelf in een melding noemt, meldt zichzelf dus
         --    levend. Dezelfde klasse als het commentaargeval dat dat script in
         --    zijn eigen kop beschrijft: de tekst óver een functie is geen
         --    gebruik ervan.
         'noemt ' || m.gevonden[1] || ', een app.-sessiesleutel die in geen '
         'enkel register van deze teller staat; een nieuwe sleutel hoort er '
         'met zijn eigen regel in te komen'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral regexp_matches(p.prosrc, 'app\.[A-Za-z0-9_]+', 'g') as m(gevonden)
   where n.nspname = 'public'
     and p.proname <> 'sleutelzetters'
     and lower(m.gevonden[1]) not in (select s.instelling from sleutel s)

   order by 1;
$function$;

-- ---------------------------------------------------------------------------
-- `blokkeer()` toetst het plafond vóór het bestaan, en dat is geen volgordekeuze
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Zonder dit stuk maakt dit plafond een grendel ongedaan die 0145 met
--    zoveel woorden zette en die 0197 een hele migratie kostte.** 0145 schrijft
--    boven de bestaanstoets:
--
--      ⚠️ Eén antwoord voor "bestaat niet" en "bestaat wel". Zou dit onderscheid
--         maken, dan is deze functie een manier om te toetsen of een profiel-id
--         bestaat.
--
--    📏 **Met een volle teller was dat onderscheid terug**, en dat is gemeten op
--    de lokale stack met de teller van de aanroeper op 500 gezet:
--
--      een id dat **niet** bestaat   `{"ok": true}`
--      een id dat **wel** bestaat    `ERROR 23514 Te veel blokkades in één dag (501).`
--
--    Een fout betekent dan *"dit account bestaat én ik heb het nog niet
--    geblokkeerd"*. 📏 En elke probe is gratis: de exception rolt de ophoging
--    mee terug, dus de teller blijft op 500 staan en de aanvaller kan 24 uur
--    lang doorvragen. v4-uuid's zijn niet te raden, dus dit bevestigt alleen
--    id's die hij al heeft — maar dat is precies wat 0197 dichtdeed.
--
-- ⚠️ **De toets staat daarom vóór de bestaanstoets en niet erna.** Een `reason`
--    eráchter laat het orakel juist staan: dan antwoordt een onbestaand id nog
--    steeds anders dan een bestaand. Nu is het antwoord voor allebei
--    `{"ok": false, "reason": "rate_limited"}`.
--
-- ⚠️ **En het lost meteen de tweede helft op: de gebruiker krijgt de waarheid.**
--    Zonder `reason` mapt de client elke fout op *"Dat lukte niet. Probeer het
--    opnieuw."* — en opnieuw proberen werkt tot 24 uur lang niet. Op de knop
--    "blokkeer deze persoon" is dat de verkeerde zin, en dit is de handeling
--    waar 0203 met opzet géén rem op zette. 0214 bouwde om dezelfde reden een
--    derde laag met `{ok:false, reason}`; dit is dat geval.
--
-- ⚠️ **De trigger blijft staan en wordt hierdoor niet overbodig.** Deze toets
--    zit in één RPC; de trigger geldt voor elke schrijver naar `user_blocks`,
--    ook een toekomstige. Een grens die alleen in de aanroeproute staat, is
--    precies wat onwrikbare regel 2 verbiedt.
--
-- ⚠️ Het lichaam hieronder is uit de dráaiende database gekopieerd
--    (`pg_get_functiondef`) en aangevuld; de rollback zet het terug naar 0145.
-- ---------------------------------------------------------------------------

create or replace function public.blokkeer(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Niet ingelogd';
  end if;

  if p_user is null or p_user = (select auth.uid()) then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;

  -- ⚠⚠ **Vóór de bestaanstoets, zie de kop.** Anders verraadt de fout of dit
  --    profiel-id bestaat.
  if dagteller_stand('user_blocks', 'gebruiker', (select auth.uid())::text,
                     interval '1 day') >= blokkades_plafond() then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  -- ⚠️ Eén antwoord voor "bestaat niet" en "bestaat wel". Zou dit onderscheid
  --    maken, dan is deze functie een manier om te toetsen of een profiel-id
  --    bestaat. (0145)
  if not exists (select 1 from profiles p where p.id = p_user) then
    return jsonb_build_object('ok', true);
  end if;

  insert into user_blocks (blocker_id, blocked_id)
  values ((select auth.uid()), p_user)
  on conflict do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

commit;
