-- 0214_de_sleutelteller_kijkt_per_sleutel.sql — de derde tak van
-- `sleutelzetters()` keek per functie in plaats van per sleutel, en liet daarmee
-- de meest waarschijnlijke route ongemoeid (QS8-376)
--
-- ROLLBACK-PAD:
--   Zet `sleutelzetters()` en `guard_group_member_update()` terug naar hun vorm
--   van 0213. Allebei een `create or replace`, dus grants en
--   `comment on function` blijven staan en er valt verder niets terug te draaien.
--
--   ⚠️ Draai je alleen de teller terug, dan blijft de tekst in
--      `guard_group_member_update()` staan zonder de sleutelnaam. Dat is geen
--      probleem — die naam voegde niets toe — maar het is wel het omgekeerde
--      paar: de tekst is aangepast omdát de teller strenger werd.
--
-- ---------------------------------------------------------------------------
-- Wat er niet gevangen werd
-- ---------------------------------------------------------------------------
--
-- `sleutelzetters()` bewaakt dat elke transactielokale `app.`-sessiesleutel bij
-- precies één functie hoort. De derde tak is degene die een **nieuwe, nergens
-- geregistreerde** sleutel moet vangen, en die luidde:
--
--   and not exists (
--     select 1 from sleutel s where p.prosrc like '%' || s.instelling || '%'
--   )
--
-- Die `not exists` gaat over de **functie** en niet over de **sleutel**. Zodra een
-- functie ook maar één geregistreerde sleutel noemt, valt ze buiten deze tak —
-- inclusief elke onbekende sleutel die ze daarnaast zet.
--
-- ⚠️⚠️ **Dat is precies de route die in onderhoud voorkomt**, en daarmee de
--    gevaarlijkste van de drie: een functie die de éigenaar is van een
--    geregistreerde sleutel en er een onbekende bij zet. Wie een nieuwe rem
--    schrijft doet dat naar het voorbeeld van een bestaande, en wie een bestaande
--    uitbreidt raakt deze tak.
--
-- 📏 Gemeten door `rem_doelen()` — die `app.rem_doelen` legitiem bezit — uit te
--    breiden met `perform set_config('app.stiekeme_nieuwe_sleutel', '1', true)`:
--
--      noemt de nieuwe sleutel:  t
--      sleutelzetters meldt:     NIETS
--
--    Tak 1 zwijgt terecht (de functie mag haar eigen sleutel noemen), tak 3
--    zwijgt omdat de functie een geregistreerde sleutel noemt. De teller bestaat
--    om te vangen dat er een sessiesleutel bijkomt die niemand besloten heeft, en
--    op de meest waarschijnlijke route deed hij dat niet.
--
-- ⚠️ **De andere twee vormen wérden wél gemeld**, en dat is een correctie op hoe
--    de bevinding oorspronkelijk gelezen werd. Een vreemde functie die
--    `app.rem_doelen` noemt wordt door de **eerste** tak gepakt. De derde tak
--    zweeg daar ook, maar de teller als geheel sprak.
--
-- ---------------------------------------------------------------------------
-- Wat er nu staat
-- ---------------------------------------------------------------------------
--
-- De tak haalt met `regexp_matches(..., 'g')` élke `app.<naam>` uit `prosrc` en
-- meldt elke waarde die in geen enkele registerrij voorkomt. `distinct`, want een
-- functie die dezelfde onbekende sleutel twee keer noemt is één bevinding.
--
-- ⚠️ De melding noemt nu de **sleutel**, niet alleen de functie. Dat scheelt de
--    lezer een grep, en het is de enige manier waarop een functie met twee
--    onbekende sleutels twee bruikbare regels oplevert.
--
-- ⚠️ **De naam van de teller zelf staat nog steeds niet in de meldtekst.**
--    `keten:controle` telt een functienaam in de bron als een aanroeper, en
--    strippen doet hij alleen commentaar. Die eis is ongewijzigd.
--
-- ---------------------------------------------------------------------------
-- Hoofdletters en cijfers, en waarom die erbij horen
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De eerste versie van deze migratie sloot het gat alleen voor
--    kleine letters, en wat er overbleef had precies dezelfde vorm.** Gevonden in
--    de security-ronde op deze branch.
--
-- 📏 **Een GUC-naam is in Postgres hoofdletterongevoelig**, en dat is de kern:
--
--      select set_config('app.REM_DOELEN', 'ja', true);
--      select current_setting('app.rem_doelen', true);   →  ja
--
--    Een vreemde functie die `app.REM_DOELEN` zet, schrijft dus de échte
--    rem-teller van `rem_doelen()`. Tak 1 zag dat niet, want `like` is
--    hoofdlettergevoelig; tak 3 zag het niet, want `[a-z_]+` matcht na de punt
--    geen `R` — er was niet eens een treffer. Dat is de klasse waar tak 1 juist
--    voor bestaat.
--
-- 📏 En een cijfersuffix ontsnapte op de naad tussen de twee takken:
--
--      app.rem_doelen2  gezet door rem_doelen() zelf  →  NIETS
--
--    `[a-z_]+` kapt greedy af op de `2`, houdt `app.rem_doelen` over, en dát
--    staat in het register — dus `not in` is onwaar. Tak 1 zwijgt omdat
--    `rem_doelen` de toegestane eigenaar is. Twee correcte onderdelen, gat op de
--    naad; onwrikbare regel 18 in het klein, en `app.rem_doelen2` is precies hoe
--    iemand een tweede teller op dezelfde tabel zou noemen.
--
-- Daarom `[A-Za-z0-9_]+`, een vergelijking op `lower()`, en `ilike` in tak 1.
-- 📏 Nul valse meldingen op een schoon schema: de meldtekst schrijft zelf
--    `app.-sessiesleutel`, en die streep valt buiten de tekenklasse — laat hem dus
--    staan waar hij staat.
--
-- ⚠️ **`guard_group_member_update()` gaat mee, en dat is geen bijvangst.**
--    📏 Er is vandaag precies één `app.`-sleutel die nergens geregistreerd staat:
--    `app.hervat_lidmaatschap`, in commentaar in die functie, bewust vervallen met
--    0204. De strengere tak meldt hem — terecht, want de teller leest `prosrc`
--    inclusief commentaar, net als zijn eerste tak altijd al deed. De
--    geschiedenis blijft in dat commentaar staan; alleen de sleutelnaam is eruit.
--
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
      ('app.rem_doelinterviews',     array['rem_doelinterviews'])
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
$function$

;

CREATE OR REPLACE FUNCTION public.guard_group_member_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_overdracht boolean := false;
  v_besluit    boolean := false;
  v_uitzetting boolean := false;
begin
  -- ⚠️ **Deze toets staat vóór de vroege uitgang en geldt dus voor élke rol,
  --    `service_role` inbegrepen.** Dat is de keuze die `archief_blijft_archief()`
  --    (0153) ook maakt, en om dezelfde reden: een rolfilter is geen grendel,
  --    want élke SECURITY DEFINER-functie komt er langs. 📏 Stond hij ná de
  --    uitgang, dan verplaatste `service_role` een lidmaatschap naar een andere
  --    groep met HTTP 200 en de verplaatste rij terug — gemeten, en het is de
  --    reden dat hij hier staat en niet drie regels lager.
  --
  --    `group_id` en `user_id` vormen de sleutel van de rij. Er is geen rol en
  --    geen functie die een lidmaatschap verplaatst: dat is verlaten en opnieuw
  --    toetreden. 📏 Nagemeten dat geen enkele schrijver ze aanraakt —
  --    `verlaat_groep()` en `verwijder_lid()` zetten alleen `role` en `status`.
  if new.group_id is distinct from old.group_id
     or new.user_id is distinct from old.user_id
  then
    raise exception 'lidmaatschap_verplaatst'
      using hint = 'group_id en user_id vormen de sleutel van een lidmaatschap. '
                   'Verlaat de ene groep en treed toe tot de andere.';
  end if;

  if auth.uid() is null then
    return new;
  end if;

  -- ⚠️ De grendel van 0102, ongewijzigd. Geeft je eigen rij het beheerderschap
  --    op terwijl jij de enige actieve beheerder bent? Dan is dit een vertrek in
  --    vermomming, en vertrekken loopt via `verlaat_groep()`.
  if old.user_id = auth.uid()
     and old.role = 'admin'
     and old.status <> 'inactive'
     and (new.role <> 'admin' or new.status = 'inactive')
     and not exists (
       select 1 from group_members mede
       where mede.group_id = old.group_id
         and mede.user_id <> auth.uid()
         and mede.role     = 'admin'
         and mede.status  <> 'inactive'
     )
  then
    raise exception 'last_admin'
      using hint = 'Draag het beheer over via verlaat_groep() of promoveer eerst een ander lid.';
  end if;

  -- ⚠️ Rechtstreeks op de tabel en niet via `is_group_admin()`: die geeft sinds
  --    migratie 0029 `false` voor een uitgezette beheerder, en dat is hier ook
  --    precies wat we willen — maar de bedoeling moet leesbaar blijven, dus de
  --    voorwaarde staat er uitgeschreven bij.
  if exists (
    select 1 from group_members m
    where m.group_id = old.group_id
      and m.user_id  = auth.uid()
      and m.role     = 'admin'
      and m.status  <> 'inactive'
  ) then
    -- ⚠️⚠️ **De restweigering, en die is er omdat 0204 er een weghaalt.** Tot
    --    hier stond `pauze_van_een_ander` als expliciete tak; die kon weg omdat
    --    de CHECK de waarde niet meer kent. Wat daarmee ook wegviel is het
    --    vángnet: de beheerderstak verbiedt een rolwijziging, een terugzetting
    --    en een uitzetting, en liet élke andere statuswaarde door.
    --
    -- 📏 Gemeten, en dit is een bevinding van de security-review op deze branch:
    --    met een derde waarde in de CHECK schreef een beheerder die stand op de
    --    rij van een ánder — zonder fout en zonder spoor. `meld_uitzetting`
    --    vuurt alleen op `→ inactive` en `meld_nieuw_lid` alleen op
    --    `inactive → active`, dus er blijft niets van over.
    --
    -- ⚠️ Vandaag onbereikbaar, morgen het slot. Drie rijen in
    --    `docs/ENGINEER-REVIEW.md` noemen "er komt een derde lidstatus bij" als
    --    reëel scenario; dan is dit de regel die er vanaf dag één staat in
    --    plaats van de regel die er dan bij had gemoeten.
    --
    -- ⚠️ Hij staat vóór de vroege uitgang voor de eigen rij, want die uitgang
    --    laat een beheerder ook zijn éígen stand vrij zetten. De twee bekende
    --    waarden komen er niet aan: de overgangen daartussen worden hieronder
    --    ieder apart getoetst.
    if new.status is distinct from old.status
       and new.status not in ('active', 'inactive')
    then
      raise exception 'onbekende_lidstatus'
        using hint = 'group_members.status kent active en inactive. Een nieuwe stand '
                     'krijgt zijn eigen weg en zijn eigen spoor, niet een PATCH.';
    end if;

    -- ⚠️ De eigen rij van de beheerder is hierboven al afgehandeld: de
    --    `last_admin`-grendel is de enige regel die daarover gaat, en die staat
    --    er sinds 0102 ongewijzigd.
    if old.user_id = auth.uid() then
      return new;
    end if;

    -- -----------------------------------------------------------------------
    -- Vanaf hier: een beheerder die de rij van een ÁNDER aanraakt — QS8-356.
    -- -----------------------------------------------------------------------
    --
    -- ⚠️⚠️ **Hier stond alleen `return new`, en dat was het gat.** 📏 Gemeten met
    --    echte JWT's: een beheerder promoveerde een ander tot `admin`,
    --    degradeerde een mede-beheerder — óók de oprichter — zette iemand op
    --    `paused`, en zette een uitgezet lid terug op `active`. Van die vier
    --    schreef alleen de uitzetting een spoor. De derde kan sinds 0204 niet
    --    meer bestaan; de andere drie worden hieronder geweigerd.
    --
    -- ⚠️ **De trigger vuurt óók voor `SECURITY DEFINER`-functies**, want
    --    `auth.uid()` blijft daarbinnen de aanroeper. `verwijder_lid()`,
    --    `verlaat_groep()` en `beslis_lidmaatschapsverzoek()` lopen dus door
    --    precies deze tak. Vandaar de benoemde uitzonderingen hieronder: een
    --    `set local` die alleen binnen die transactie geldt en die niemand
    --    anders zet.
    -- ⚠️⚠️ **`coalesce(..., false)` en dat is geen overdaad.** Een ongezette
    --    sleutel geeft `null`, en `null = <tekst>` is `null` en niet `false`.
    --    Zonder de coalesce wordt `not (v_overdracht or v_besluit)` dus `null`,
    --    vuurt de `if` níét, en laat de guard alles door — 📏 gemeten: met de
    --    drie regels erin bleven de promotie, de degradatie en het terugzetten
    --    gewoon landen.
    v_overdracht := coalesce(
      nullif(current_setting('app.beheer_overgedragen', true), '') = old.group_id::text,
      false
    );
    v_besluit := coalesce(
      nullif(current_setting('app.lidmaatschap_besloten', true), '') = old.group_id::text,
      false
    );
    v_uitzetting := coalesce(
      nullif(current_setting('app.lid_uitgezet', true), '') = old.group_id::text,
      false
    );

    -- ⚠️ **Een rolwijziging van een ander loopt alleen via `verlaat_groep()`.**
    --    Er is geen scherm en geen andere RPC die een rol zet — 📏 nagemeten met
    --    één treffer op `set role` in álle functiedefinities. Promoveren en
    --    degraderen bestaan dus niet als handeling, en dat is het besluit: de
    --    overnameroute gaat dicht in plaats van dat er een auditregel omheen
    --    komt. `beslis_lidmaatschapsverzoek()` zet `role = 'member'` mee en valt
    --    daarom ook onder de uitzondering.
    if new.role is distinct from old.role and not (v_overdracht or v_besluit) then
      raise exception 'rol_van_een_ander'
        using hint = 'Een rol van een ander lid verandert alleen bij de overdracht '
                     'in verlaat_groep(). Promoveren en degraderen bestaan niet.';
    end if;

    -- ⚠️ **Terugkomen loopt via `beslis_lidmaatschapsverzoek()`**, want daar
    --    vraagt het lid er zélf om. Een PATCH van de beheerder is geen
    --    toestemming, en hij slaat de opruiming van `verwijder_lid()` over.
    if old.status = 'inactive' and new.status <> 'inactive' and not v_besluit then
      raise exception 'lid_teruggezet'
        using hint = 'Een uitgezet lid komt terug via een lidmaatschapsverzoek, '
                     'dat het lid zelf indient en een beheerder toewijst.';
    end if;

    -- ⚠️⚠️ **Uitzetten loopt óók maar langs één weg, en dat is een correctie uit
    --    de security-review op de branch van QS8-356.** Hier stond eerst dat
    --    `* → inactive` een gewone beheerdershandeling blijft. Dat klopte niet:
    --    `verwijder_lid()` doet méér dan de status zetten — het ruimt
    --    `goal_group_links` op en zet openstaande `deadline_requests` op
    --    `withdrawn`. Een kale PATCH slaat dat over.
    --
    -- 📏 Gemeten wat er dan blijft staan: het openstaande deadline-verzoek van
    --    het uitgezette lid blijft `open`, en `beslis_deadline_verzoek()` toetst
    --    alleen het lidmaatschap van de **beslisser** en niet van de aanvrager.
    --    Een lid dat nog wél in de groep zit, verzet daarmee de streefdatum van
    --    het doel van iemand die er niet meer in zit — en zet via
    --    `update commitments … set status = 'set' where status = 'due'` een
    --    verschuldigde straf terug. Dat raakt domeinregel 5 en 11.
    if new.status = 'inactive' and old.status is distinct from 'inactive'
       and not v_uitzetting
    then
      raise exception 'lid_uitgezet_buiten_de_rpc'
        using hint = 'Een lid uitzetten loopt via verwijder_lid(). Die ruimt ook de '
                     'gedeelde doelen en openstaande verzoeken op; een rechtstreekse '
                     'PATCH doet dat niet.';
    end if;

    -- ⚠️ Hier stond `pauze_van_een_ander`. Met 0204 kent
    --    `group_members_status_valid` de waarde niet meer, dus deze weigering
    --    komt nu uit de CHECK en niet uit een tak die de trigger zelf draagt.

    return new;
  end if;

  -- -------------------------------------------------------------------------
  -- Vanaf hier: geen actieve beheerder van deze groep.
  -- -------------------------------------------------------------------------
  --
  -- ⚠️ Hier stond de uitzondering van 0187: je eigen rij van `paused` terug naar
  --    `active` mocht, mits `join_group_with_code()` een sessiesleutel met het
  --    groeps-id had gezet. Met 0204 bestaat `paused` niet meer, dus is er niets
  --    om door te laten en zet niemand die sleutel nog.
  --
  -- ⚠️ **De naam van die vervallen sleutel staat hier met opzet niet meer**
  --    (QS8-376). De sleutelteller kijkt sinds 0214 per sleutel in plaats van per
  --    functie, en hij leest `prosrc` inclusief commentaar — net als zijn eerste
  --    tak altijd al deed. Een sleutel die nergens meer geregistreerd staat maar
  --    hier nog bij naam genoemd wordt, is dan een terechte melding. De
  --    geschiedenis blijft; alleen de sleutelnaam is eruit.
  --
  -- ⚠️ **`is distinct from` en niet "je bent geen beheerder".** Een update die
  --    niets van deze kolommen verandert, is geen geweigerd verzoek maar een
  --    no-op; daar is `UPDATE 1` een eerlijk antwoord op. Alleen een verzoek dat
  --    iets zou hebben veranderd en dat niet mag, wordt hier hoorbaar geweigerd.
  if new.role      is distinct from old.role
     or new.status is distinct from old.status
     or new.joined_at is distinct from old.joined_at
  then
    raise exception 'geen_groepsbeheerder'
      using hint = 'Alleen een actieve beheerder van deze groep wijzigt rol, '
                   'status of toetredingsmoment. Vertrekken doe je met verlaat_groep().';
  end if;

  return new;
end;
$function$

;
