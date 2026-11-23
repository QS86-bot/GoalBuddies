-- 0341_de_uitnodiging_noemt_of_het_klassement_aan_staat.sql — `invite_preview()` noemt of het klassement in díe groep aan staat. QS8-801.
--
-- ⚠️ Nummer 0341 uit `npm run migratie:nieuw`, gemeld aan de hoofdorchestrator (23-11-2026): 0338 t/m 0340 staan op main.
--
-- ROLLBACK-PAD:
--   create or replace function public.invite_preview(text) … -- terug naar de definitie uit 0277: hetzelfde
--     lichaam zónder de regel `'klassement_aan', g.klassement_aan,`. Kopieer dat lichaam uit 0277 of uit de database
--     van vóór deze migratie. Er gaat niets verloren: dit raakt geen rij en geen kolom, en de client valt bij een
--     ontbrekend veld terug op de standaardtekst van QS8-798 (#806).
--
-- ⚠️ Eén `create or replace`, geen `drop`: de handtekening (`code text`) en het returntype (`jsonb`) blijven gelijk,
--    dus de grant van 0131 (`grant execute … to anon, authenticated`) blijven staan en er komt geen tweede functie bij. Het
--    adviseurplafond voor `anon_security_definer_function_executable` (1, `scripts/adviseur-controle.mjs`) verandert
--    niet: het blijft deze ene functie.
--
-- ---------------------------------------------------------------------------
-- Waarom
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten op main 6f2d5ebe, lokale stack: `invite_preview()` gaf acht sleutels terug (`group_id`, `group_name`,
--    `icon`, `huddle_day`, `zichtbaarheid`, `member_count`, `detailed`, `members`), en geen `klassement_aan`. Na
--    #806 (QS8-798) zegt het uitnodigingsscherm daarom alleen dat een groep *standaard* met een klassement begint;
--    of het in díe groep aan staat, kon het niet weten. Sinds A57 (0333) hangt het klassement aan een schakelaar
--    op de groep, en wat een nieuw lid te zien geeft aan de anderen is een belofte (grens 1).
--
-- ---------------------------------------------------------------------------
-- Domeinregel 7: de twee vragen, want dit eindpunt is oningelogd bereikbaar
-- ---------------------------------------------------------------------------
--
-- 1. **Kan iemand hieruit een gemiste week van een ander afleiden?** Nee. Het is één boolean over de gróép, die
--    alleen verandert door een beheerdershandeling (`zet_groepsklassement()`, 0336) of door de groep open te zetten
--    (0333, besluit 45) of ontdekbaar te maken (0336). Geen enkele handeling van één lid over zijn eigen weken zet
--    hem om. Er gaat geen punt, geen positie en geen persoon mee.
-- 2. **Is dit met één API-verzoek te lezen buiten de UI om?** Ja, door iedereen met de code, ook zonder account —
--    precies zoals `zichtbaarheid` sinds 0080. Dat is aanvaardbaar omdat vraag 1 nee is, en omdat het feit vóór de
--    knop "meedoen" hoort te staan: wie meedoet, laat de groep zijn in deze groep verdiende punten zien.
--
-- ⚠️ Wat er níet bij komt: `organization_id`, `automatisch` of iets anders waaruit af te leiden valt wíe er in de
--    groep zit of waarom het klassement uit staat. Het veld staat na de wachttak van 0277 en na de limiet van 0131,
--    dus wie uitgesloten is of de limiet raakt, krijgt het niet. De grendel is `tests/rls/uitnodiging-klassement.test.ts`:
--    die legt de volledige sleutelset vast, zonder en met account.
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
    'member_count',  aantal,
    'detailed',      ingelogd,
    'members',       leden
  );
end;
$function$;

commit;
