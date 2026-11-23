-- 0342_een_teamcode_toont_buitenstaanders_geen_namen_of_doelen.sql — `invite_preview()` geeft bij een teamcode alleen aan een actief organisatielid namen en doelen. QS8-807.
--
-- ⚠️ Nummer 0342 uit `npm run migratie:nieuw` (23-11-2026). Het lichaam is gekopieerd van 0341 (QS8-801, PR #813), de
--    nieuwste definitie; alleen de tak voor een teamcode komt erbij.
--
-- ROLLBACK-PAD:
--   create or replace function public.invite_preview(text) … -- terug naar de definitie uit 0341: hetzelfde lichaam
--     zónder de variabelen `teamlid` en `kaal` en zónder het blok `if kaal then … end if;`, en met
--     `'teamgroep', g.organization_id is not null and ingelogd and public.actief_organisatielid(…)`. Kopieer dat
--     lichaam uit 0341. Er gaat niets verloren: dit raakt geen rij en geen kolom. ⚠️ Terugdraaien zet het lek weer open.
--
-- laat bewust vallen: 'teamgroep', g.organization_id is not null
-- laat bewust vallen: and actief_organisatielid(g.organization_id, (select auth.uid())),
--   (dezelfde uitdrukking staat nu één keer in de variabele `teamlid`, en `'teamgroep', teamlid` leest die; de
--   uitkomst is gelijk aan 0341)
--
-- ⚠️ Eén `create or replace`, geen `drop`: de handtekening (`code text`) en het returntype (`jsonb`) blijven gelijk,
--    dus de grant van 0131 (anon, authenticated) blijft staan en er komt geen functie bij. Het adviseurplafond voor
--    `anon_security_definer_function_executable` (1) verandert niet. Idempotent: opnieuw draaien geeft dezelfde functie.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten door de security-reviewer bij QS8-801 (#813), lokale stack, 23-11-2026: een ingelogde buitenstaander
--    (`actief_organisatielid = f`) met een doorgestuurde teamcode kreeg `detailed = true` en zag
--    `{"display_name":"Anna de Vries","goal_title":"Teamdoel van Anna"}`. Aandeeldoelen hangen via
--    `goal_group_links` aan de teamgroep (0319), dus aandeeltitels gingen naar iemand die de groep niet eens kan
--    joinen. Dat botst met domeinregel 7 (teamgroepen) en besluit 21 van
--    `docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`. Anon kreeg voornamen.
--
-- ---------------------------------------------------------------------------
-- Het besluit (Quinten, 23-11-2026, via de hoofdorchestrator)
-- ---------------------------------------------------------------------------
--
-- Voor een teamcode:
--   * ingelogd, actief organisatielid  → de volle kaart, zoals in 0341;
--   * ingelogde buitenstaander en anon → een kale kaart: dezelfde tien sleutels, `members = []`,
--     `detailed = false`, `teamgroep = false`. Groepsnaam, icoon, huddledag, zichtbaarheid, klassement,
--     aantal leden en group_id blijven (keuze A). Het scherm toont de bestaande zin "Waar ze aan werken zie je
--     zodra je meedoet…" (keuze a); het scherm verandert niet.
--
-- ⚠️⚠️ **Het restant-orakel, door Quinten geaccepteerd als aanname.** Aan de vórm is een teamcode nog te
--    herkennen: `members` is leeg terwijl `member_count` > 0, waar een gewone groep anon voornamen geeft. Wat er
--    níet meer uitgaat: namen, doelen en de organisatie. Dicht krijg je het alleen door ook gewone groepen te
--    veranderen, en dat valt buiten QS8-807. Staat in rij 7 van `docs/decisions/002-domeinregel7-oppervlakken.md`.
--
-- ⚠️ Het blok staat ná de wachttak van 0277 en ná de limiet van 0131, dus wie uitgesloten is krijgt nog steeds
--    `null` en de teller telt zoals hij telde. De grendel is `tests/rls/uitnodiging-teamcode.test.ts`.
-- ---------------------------------------------------------------------------

begin;

CREATE OR REPLACE FUNCTION public.invite_preview(code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  g          groups%rowtype;
  aantal     integer;
  leden      jsonb;
  teller     integer;
  ingelogd   boolean := auth.uid() is not null;
  -- QS8-807 (0342): wie mag de leden van deze groep zien? Zie de kop.
  teamlid    boolean;
  kaal       boolean;
begin
  select * into g
  from groups
  where invite_code = code
    and invite_revoked = false
    and status <> 'archived';

  if g.id is null then
    return null;
  end if;

  -- ⚠️⚠️ **Wie eruit gezet is of geblokkeerd, krijgt dezelfde `null` — 0277,
  --    QS8-502.** `join_group_with_code()` draagt deze twee toetsen al (blokkade
  --    -> `invalid`, `inactive` -> `removed`); alleen de lééskant miste ze, en
  --    dat is de naad: toetreden was dicht, de kaart erboven niet.
  --
  --    📏 Gemeten vóór deze migratie, met een lid op `inactive` én geblokkeerd
  --    door de eigenaar: `invite_preview()` gaf `goal_title` = 'Stoppen met
  --    drinken' en de volledige `display_name`, in een groep op `beschermd`.
  --
  -- ⚠️ **`null` en niet een eigen antwoord, en dat is de vorm van dit huis.**
  --    0019 maakte `null` één antwoord voor "ingetrokken, verlopen of nooit
  --    bestaan", juist zodat deze functie geen orakel is; QS8-232 voegde bij
  --    `vraag_lidmaatschap_aan()` de blokkade toe aan één bestaand antwoord om
  --    dezelfde reden. Een eigen `reason` hier zou van blokkeren — dat stil
  --    hoort te zijn (0145: *"hij krijgt geen bericht en kan het nergens zien"*)
  --    — iets maken dat je kunt aflezen.
  --
  -- ⚠️⚠️ **En de toets staat vóór de teller, niet erna — om de teller zelf geen
  --    orakel te laten zijn.** Een ongeldige code keert terug vóór de
  --    `insert … on conflict` en laat dus géén tellerrij achter. Stond de
  --    wachttak eráchter, dan liet een géldige code wél een rij achter, ook voor
  --    wie uitgesloten is — en dan is het verschil tussen *"deze code bestaat
  --    niet"* en *"jij bent eruit"* af te lezen aan de teller. Nu lijken die twee
  --    ook in wat ze achterlaten op elkaar, en dat is de hele bedoeling van het
  --    ééne antwoord hierboven.
  --
  --    ⚠⚠ **Hier stond een ánder argument, en dat was aantoonbaar onwaar.** Er
  --    stond dat een weggestuurd lid anders de teller van 0131 zou kunnen
  --    volstoken en zo het uitnodigen van de hele groep een uur kon stilleggen.
  --    📏 Gemeten in de security-review: dat kan hij nog steeds — hij logt uit.
  --    De wachttak begint met `auth.uid() is not null`, en `invite_preview()` is
  --    `anon`-uitvoerbaar (over HTTP bevestigd: 200 zonder `Authorization`).
  --    Dezelfde persoon, uitgelogd, krijgt de kaart én hoogt de teller op.
  --
  --    Die DoS is dus echt maar niet van deze migratie: hij hoort bij 0131 en
  --    bestaat voor íedereen met de code. Hij staat als rij in
  --    `docs/ENGINEER-REVIEW.md`. De volgorde blijft staan om de reden hierboven,
  --    die wél houdt.
  -- ⚠⚠ **`not mag_groep_lezen()` staat er om een gemeten reden en niet uit
  --    voorzichtigheid.** Zonder die voorwaarde sluit deze tak ook **actieve
  --    leden** buiten hun éégen groep, en dat is met één stille handeling over de
  --    hele groep af te dwingen:
  --
  --    📏 Gemeten (gevonden in de security-review): Anna is actief admin met
  --    `mag_groep_lezen() = t` en `status = 'active'`. Bram, ook actief lid,
  --    roept `blokkeer(anna)` aan. Daarna geeft `invite_preview()` aan Anna
  --    `null` voor de code van haar éigen groep.
  --
  --    De oorzaak is dat `blokkade_met_groep()` niet vraagt *"is deze persoon
  --    eruit gezet"* maar *"zit er ergens in deze groep een blokkade tussen deze
  --    persoon en een actief lid"* — symmetrisch en groepsbreed. En blokkeren
  --    beéindigt geen lidmaatschap (0145; `blokkeerLid()` en `zetEruit()` zijn in
  --    `app/groep/leden/[id].tsx` twee knoppen), dus twee leden van dézelfde
  --    groep kúnnen een blokkade tussen zich hebben.
  --
  --    ⚠️ Het misbruikpad is gewoon hoofdgedrag: één lid blokkeert in het
  --    ledenscherm de andere elf — geen beheerdersrecht nodig, en
  --    `blokkades_plafond()` staat op 500 per dag — waarna niemand in die groep
  --    zijn eigen uitnodigingskaart nog ziet. Het scherm meldt dan dat de
  --    uitnodiging is ingetrokken, wat onwaar is, en blokkeren is stil, dus de
  --    oorzaak is niet te vinden. Alleen de blokkeerder kan het opheffen.
  --
  --    Een actief lid dat de kaart wél krijgt lekt niets: alles erop — namen en
  --    doeltitels van zijn groepsgenoten — leest hij toch al via de gewone,
  --    `mag_groep_lezen()`-afgeschermde oppervlakken.
  if (select auth.uid()) is not null
     and not mag_groep_lezen(g.id)
     and (
       blokkade_met_groep(g.id, (select auth.uid()))
       or exists (
         select 1 from group_members m
         where m.group_id = g.id
           and m.user_id = (select auth.uid())
           and m.status = 'inactive'
       )
     )
  then
    return null;
  end if;

  -- ⚠️ Eén statement, en dat is de hele afdwinging. Lezen-dan-schrijven laat
  --    twee gelijktijdige aanroepen allebei dezelfde stand zien en allebei
  --    doorlopen; `on conflict do update` neemt de rijvergrendeling en telt
  --    daarbinnen op. Het venster schuift in dezelfde uitdrukking mee, zodat er
  --    geen tweede statement is dat ertussen kan vallen.
  insert into invite_preview_limits as l (group_id, venster_start, aantal)
  values (g.id, now(), 1)
  on conflict (group_id) do update
    set venster_start = case
          when l.venster_start < now() - interval '1 hour' then now()
          else l.venster_start
        end,
        aantal = case
          when l.venster_start < now() - interval '1 hour' then 1
          else l.aantal + 1
        end
  returning l.aantal into teller;

  -- ⚠️ Een eigen antwoord, en niet `null`. `null` betekent hier sinds 0019
  --    "ingetrokken, verlopen of nooit bestaan" — dat is met opzet één antwoord
  --    voor drie gevallen, zodat de functie geen orakel is. Zou een bereikte
  --    limiet óók `null` geven, dan krijgt een échte genodigde te horen dat zijn
  --    uitnodiging niet meer geldt, terwijl hij morgen gewoon werkt. Dat is een
  --    ander soort fout dan het orakel dat 0019 wilde voorkomen: het verraadt
  --    niets over welke codes bestaan, want je bent hier alleen als je code
  --    klopte.
  if teller > 60 then
    return jsonb_build_object('limiet_bereikt', true);
  end if;

  select count(*) into aantal
  from group_members
  where group_id = g.id and status <> 'inactive';

  -- ⚠️⚠️ QS8-807 (0342), besluit Quinten 23-11-2026. Bij een teamcode krijgt
  --    alleen een ingelogd, actief lid van díe organisatie namen en doelen. Anon
  --    en elke ingelogde buitenstaander (ook een uitgezet organisatielid) krijgen
  --    een kale kaart: dezelfde sleutels, `members` leeg, `detailed` false.
  --    `actief_organisatielid(org, null)` is false, dus anon valt er vanzelf onder.
  --    Een gewone groep (`organization_id is null`) verandert niet.
  teamlid := g.organization_id is not null
             and ingelogd
             and public.actief_organisatielid(g.organization_id, (select auth.uid()));
  kaal := g.organization_id is not null and not teamlid;

  if kaal then
    return jsonb_build_object(
      'group_id',       g.id,
      'group_name',     g.name,
      'icon',           g.icon,
      'huddle_day',     g.huddle_day,
      'zichtbaarheid',  g.zichtbaarheid,
      'klassement_aan', g.klassement_aan,
      'teamgroep',      false,
      'member_count',   aantal,
      'detailed',       false,
      'members',        '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(rij), '[]'::jsonb) into leden
  from (
    select jsonb_build_object(
      'display_name', case
        when ingelogd then p.display_name
        else split_part(btrim(p.display_name), ' ', 1)
      end,
      -- ⚠️ Altijd null, ook voor een ingelogde aanroeper — migratie 0128.
      --    Sinds 0126 is dit een pad waarvan het eerste segment de auth.uid()
      --    van dat lid is. Een uitnodigingslink verloopt nooit en wordt
      --    doorgestuurd; hem meesturen geeft de interne id's van acht mensen weg
      --    aan iemand die geen lid is. Ondertekenen helpt niet — het pad zit in
      --    de signed URL. Het scherm toont initialen, en dat is de terugval waar
      --    `Avatar` voor gemaakt is.
      'avatar_url', null,
      'goal_title', case
        when ingelogd then (
          select gg.title
          from goals gg
          join goal_group_links l on l.goal_id = gg.id
          where l.group_id = g.id
            and gg.owner_id = m.user_id
            and gg.status = 'active'
          order by gg.target_date asc
          limit 1
        )
        else null
      end
    ) as rij
    from group_members m
    join profiles p on p.id = m.user_id
    where m.group_id = g.id and m.status <> 'inactive'
    order by m.joined_at asc
    limit 8
  ) t;

  return jsonb_build_object(
    'group_id',      g.id,
    'group_name',    g.name,
    'icon',          g.icon,
    'huddle_day',    g.huddle_day,
    'zichtbaarheid', g.zichtbaarheid,
    -- QS8-801 (0341): staat het klassement in díe groep aan? Eén boolean over
    -- de groep, ook zonder account; zie de kop van 0341 voor de twee vragen
    -- van domeinregel 7.
    'klassement_aan', g.klassement_aan,
    -- QS8-801 (0341), besluit Quinten 23-11: een teamgroep krijgt een eigen tekst
    -- ("heeft geen klassement"). ⚠️ Alleen `true` voor een ingelogd, actief lid
    -- van díe organisatie; voor anon en elk ander `false`. Zie de kop: anders
    -- bevestigt de kaart wat `join_group_with_code()` (0317) met `invalid` verbergt.
    -- Sinds 0342 dezelfde uitkomst via `teamlid`: hier is de groep gewoon of is de
    -- aanroeper een actief organisatielid, dus `teamlid` is precies het veld.
    'teamgroep', teamlid,
    'member_count',  aantal,
    'detailed',      ingelogd,
    'members',       leden
  );
end;
$function$;

commit;
