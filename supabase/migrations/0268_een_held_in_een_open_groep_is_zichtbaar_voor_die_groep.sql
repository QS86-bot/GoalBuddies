-- 0268_een_held_in_een_open_groep_is_zichtbaar_voor_die_groep.sql — één RPC die
-- een open groep laat zien welke held er bij elk lid het laatst langs is
-- geweest. Besluit 5 van QS8-468, gebouwd in QS8-477.
--
-- ROLLBACK-PAD:
--   drop function if exists public.groep_helden(uuid, integer, integer);
--
-- ⚠️ Deze migratie voegt alleen een functie toe en raakt geen enkele tabel, rij
--    of policy. Er is dus niets te verliezen bij een terugzet; grens 2 van de
--    beslisbevoegdheid is hier niet in beeld.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten in QS8-471 en vastgelegd in 0264: `hero_profiles` en
-- `hero_appearances` staan allebei op `user_id = auth.uid()`, voor alle vier de
-- werkwoorden. Er is vandaag dus geen enkel pad waarlangs een groepslid ook maar
-- iets over de held van een ander leest. Dat was met opzet: besluit 5 van
-- QS8-468 zegt dat de zichtbaarheid A41 volgt, en 0264 hield de tabellen dicht
-- tot dit issue de éne route bouwt die daarop een uitzondering is.
--
-- ---------------------------------------------------------------------------
-- Waarom dit een functie is en geen vierde tak op een policy
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **RLS kan geen kolommen beperken.** Een `or lid_van_open_groep(...)` op
--    `hero_appearances_select` geeft de hele rij weg, en die rij draagt
--    `shown_at` — het exacte tijdstip waarop Ignis langskwam. Wie dat tijdstip
--    heeft, heeft de dag waarop iemand iets miste, tot op de seconde.
--
--    Dit is letterlijk de fout die `straffen_bij_uitstelverzoek()` (0218) moest
--    vermijden en die `getuigenissen()` (0169) als eerste in deze vorm oploste:
--    een SECURITY DEFINER-functie met een expliciete kolomlijst. De kolommen die
--    er niet uit mogen, bestáán niet in de handtekening — dan hoeft geen enkel
--    component de belofte te kennen, en verhuist ze niet mee met dat component.
--
-- ---------------------------------------------------------------------------
-- Wat er wél uit komt en wat niet
-- ---------------------------------------------------------------------------
--
-- **Wel:** wie, welke held, welke trigger. **Niet:** het tijdstip, het
-- rij-`id`, de quote die getoond is, en niets over een lid van een ándere groep.
--
-- ⚠️ **`hero_profiles` gaat hier niet mee, en dat is een keuze en geen omissie.**
--    De hoofdheld is de uitslag van een persoonlijkheidsvragenlijst en geen
--    gebeurtenis; QS8-477 noemt hem in de "wel"-lijst niet. Voor élk nieuw
--    oppervlak is beschermd het antwoord tot iemand het tegendeel besluit
--    (CLAUDE.md, domeinregel 7), en niemand heeft dit besloten.
--
--    ⚠️⚠️ **Maar hij lekt langs een zijpad en dat hoort hier te staan in plaats
--       van netjes weggeredeneerd te worden.** `heldVoorTrigger()` is een
--       bijectie: `misser` ⇔ ignis, `stilte` ⇔ lucerna, `mijlpaal` ⇔ strix. Bij
--       vijf van de zes triggers is `hero_key` dus af te leiden uit `trigger` en
--       andersom. Bij de zesde niet: `tussendoor` is de trigger die QS8-475 zet
--       als er géén gebeurtenis is en de **hoofdheld** spreekt. Een rij met
--       `trigger = 'tussendoor'` geeft daarmee de hoofdheld van dat lid prijs.
--
--       Dat is aanvaard en het is smaller dan `hero_profiles` erbij joinen: het
--       geldt alleen voor leden die in het venster hieronder daadwerkelijk een
--       hoofdheld-verschijning hadden, en niet voor iedereen met een rij in die
--       tabel. Wie de hoofdheld ooit bewust wil tonen, doet dat als eigen besluit
--       en niet als bijvangst van deze functie.
--
-- ---------------------------------------------------------------------------
-- De twee vragen die CLAUDE.md bij elk nieuw groepsoppervlak voorschrijft
-- ---------------------------------------------------------------------------
--
-- **1. Kan hieruit iemands gemiste week worden afgeleid?** Ja, en dat is precies
-- wat dit oppervlak doet. `trigger = 'misser'` betekent dat er iets openstond,
-- `trigger = 'stilte'` dat er drie dagen niets gebeurde. In een **open** groep is
-- dat wat besluit A41 toestaat — dat is de hele keuze die zo'n groep gemaakt
-- heeft. In een **beschermde** groep is het de kern van domeinregel 7, en daar
-- geeft deze functie nul rijen.
--
-- **2. Kan iemand dat met één API-verzoek uitlezen buiten de UI om?** Alleen
-- langs deze functie, en die draagt `lid_van_open_groep()` in zijn `where`. De
-- tabellen zelf blijven eigenaar-only; er komt geen policytak bij.
--
-- ⚠️ **Dit oppervlak is grover dan oppervlak 2 en 3, en dat is een echte
--    verruiming die je moet weten.** Een gemiste week is daar per **doel**
--    zichtbaar, via `deelt_open_groep_met_doel()`: wie een doel alleen met een
--    beschermde groep deelt, houdt die misser daar. Een verschijning draagt geen
--    doel en kán dat niet dragen — 📏 `laatsteActiviteitDatum()` in de
--    meldingenjob leest `daily_moves` én `completions` over álles wat iemand
--    doet, en `heeftOpenWeekdoel()` telt evenmin per doel. `stilte` is per
--    definitie een uitspraak over de persoon en niet over een doel.
--
--    Gevolg: een open groep leest dat een lid *iets* gemist heeft, ook als het
--    enige gemiste doel alleen met een beschermde groep gedeeld is. Wat die groep
--    niet leert is wát — geen doel, geen titel, geen week. Aanvaard onder A41: wie
--    in een open groep zit, heeft afgesproken dat die groep zijn tegenslag ziet,
--    en `invite_preview()` (0080) noemt de stand vóór de knop. Uitgeschreven in
--    `docs/decisions/2026-09-14-een-held-verraadt-geen-doel.md` §2.
--
-- ---------------------------------------------------------------------------
-- Het venster van zeven dagen, en de rand die op een dag valt
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Zonder venster is "Ignis is langs geweest" een permanent merkteken.**
--    De functie geeft geen tijdstip, dus één aanroep kan vers niet van oud
--    onderscheiden: een misser van vijf maanden geleden staat er dan even stellig
--    als die van gisteren. Een tegenslagsignaal dat nooit vervalt is zwaarder dan
--    het signaal zelf, en dat is precies de schade waar domeinregel 7 tegen
--    beschermt.
--
-- ⚠️ **Zeven dagen, en dat getal is afgeleid en niet gekozen.** De week is in
--    deze app de enige eenheid die telt (domeinregel 9 en 10). Een held spreekt
--    hoogstens twee keer per dag (`magVerschijnen()`, QS8-475), dus binnen een
--    week zijn er ruim voldoende gelegenheden: wie actief is, heeft er een
--    recente. Wie er geen heeft, verschijnt niet in de lijst — en dat is het
--    juiste antwoord, want dan is er niets recents te melden.
--
-- ⚠️⚠️ **De rand van het venster is zélf een klok, en dáárom staat er
--    `date_trunc` omheen.** Gevonden in de security-review op dit issue, en het
--    is de omkering van de reden hierboven: een aanroeper die deze functie
--    herhaald opvraagt, ziet een rij **verdwijnen**, en dat moment ligt precies
--    zeven dagen na `shown_at`. Met een kale `now() - interval '7 days'` leest
--    hij daarmee het tijdstip terug tot op zijn polinterval — juist de kolom die
--    hierboven de reden is dat dit een RPC is en geen policytak.
--
--    `date_trunc('day', now(), 'UTC')` zet die rand op middernacht UTC. Alles
--    van één UTC-dag valt daarmee tegelijk weg, dus wat er uit een verdwijning
--    te lezen valt is een **datum** en geen tijdstip. Dat is geen nul — een open
--    groep ziet via oppervlak 3 al van welke week iemand een doel miste — maar
--    het tijdstip van de dag is wél weg, en dat is het scherpste deel: wanneer
--    iemands nudge afgaat, zegt iets over zijn ritme en zijn tijdzone.
--
--    ⚠️ **Wat dit níet repareert, en dat hoort hier te staan in plaats van
--       weggeredeneerd te worden.** Wie élke dag opvraagt, ziet ook elke níeuwe
--       verschijning binnenkomen en bouwt zo alsnog een chronologie op. Dat is
--       geen eigenschap van dit venster maar van elk levend groepsoppervlak —
--       `groep_klassement()` geeft op dezelfde manier zijn deltas prijs aan wie
--       hem twee keer opvraagt, en dat is daar bij besluit A54 aanvaard. **De
--       belofte van deze functie is dus: één antwoord draagt geen tijd, en de
--       rand draagt hoogstens een datum.** Niet: een groepsgenoot kan geen
--       tijdlijn bijhouden. Rij in `docs/ENGINEER-REVIEW.md` van 14-09-2026.
--
-- ⚠️ **Dit is een leeftijdsfilter en geen dagberekening.** Correctheidsregel 7
--    gaat over "vandaag" en "deze week": grenzen die van de tijdzone en de
--    week-startdag van een gebruiker afhangen, en die horen in `shared/time`.
--    Deze rand hangt van geen van beide af — hij staat vást op UTC, voor iedere
--    gebruiker dezelfde, en dat is precies wat hem géén dagbepaling maakt.
--    De driearguments-`date_trunc` is er om die reden: `date_trunc('day', now())`
--    zou de `TimeZone` van de sessie volgen, en dan hangt het antwoord af van een
--    instelling in plaats van van het schema.
--
-- ⚠️ **Het venster staat niet in een parameter.** Een aanroeper die hem kan
--    verzetten, kan hem ook op tien jaar zetten, en dan is de grens een
--    suggestie. Zelfde reden als de harde bovengrens op `p_limit`.
--
-- ---------------------------------------------------------------------------
-- Welke triggers eruit mogen — een allowlist en geen doorgeefluik
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **`hero_appearances_trigger_geldig` laat zes waarden toe en er worden er
--    vandaag vier geschreven.** 📏 Nagemeten over `supabase/functions/`, `src/`
--    en `app/`: `misser` en `stilte` (nudge), `mijlpaal` (cycle_summary) en
--    `tussendoor` (de hoofdheld zonder gebeurtenis). Niets schrijft ooit
--    `nieuw_doel` of `vastlopen`.
--
--    Zou deze functie `trigger` ongefilterd doorgeven, dan verbreedt dit
--    oppervlak zichzelf op de dag dat daar iets aan verandert: de open groep
--    leest dan *dat dit lid een doel heeft aangemaakt* — geen tegenslag, dus
--    niet wat A41 opent, en per persoon in plaats van per doel, wat botst met
--    domeinregel 4. Niets zou daar rood van worden.
--
--    CLAUDE.md is hier expliciet: *"Voor élk níeuw oppervlak is beschermd het
--    antwoord tot iemand het tegendeel besluit. Bouw niets vast open."* De
--    allowlist maakt van de volgende trigger een besluit met een migratie
--    eronder, zelfde vorm als `chat_messages_system_event_bekend`.
--
--    ⚠️ De filter staat in de CTE en niet erna, dus `distinct on` kiest de
--       nieuwste verschijning **die deze groep mag zien**. Een lid met een verse
--       `nieuw_doel` valt daardoor niet uit de lijst maar houdt zijn vorige
--       zichtbare held. Dat is de conservatieve kant: eruit vallen zou een
--       níeuw afwezigheidssignaal maken, en de belofte is "de laatste held die
--       deze groep mag zien" en niet "de laatste held".
--
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- groep_helden() — welke held er bij elk lid het laatst langs is geweest
-- ---------------------------------------------------------------------------
--
-- ⚠️ **SECURITY DEFINER is hier noodzaak en geen gemak**, net als bij
--    `groep_klassement()` (0141). `hero_appearances_select` staat op
--    `user_id = auth.uid()`; een INVOKER-functie zou voor elk ánder lid nul rijen
--    zien en dus een lijst van één persoon opleveren — groen in elke test die
--    alleen de eigenaar gebruikt.
--
-- ⚠️ **De gate geeft nul rijen en geen fout**, en dat onderscheid is er een dat
--    je niet mag verliezen: een functie die in een beschermde groep wél een fout
--    geeft, vertelt een buitenstaander dat die groep beschermd is. Nul rijen is
--    ook het antwoord aan een niet-lid, aan een uitgezet lid en aan een lid van
--    een gearchiveerde groep — `lid_van_open_groep()` (0102) draagt die hele
--    toets.
--
-- ⚠️ **`distinct on` heeft een deterministische tiebreaker nodig.** Twee
--    verschijningen met dezelfde `shown_at` zijn mogelijk — de meldingenjob mag
--    er op één dag twee schrijven (hoofdheld plus Strix) en `shown_at` staat op
--    `now()`, dat binnen één transactie niet opschuift. Zonder `a.id` erachter
--    kiest Postgres er willekeurig een en geeft dezelfde groep bij twee
--    aanroepen twee antwoorden. Onwrikbare regel 18, vraag 6: dit is de plek waar
--    "er is er precies één" een aanname is.
--
-- ⚠️ **`status <> 'inactive'` en niet `= 'active'`**, precies als in
--    `groep_klassement()`. Een uitgezet lid in de lijst laten staan is een naam
--    tonen die verder nergens meer op het scherm voorkomt; een lid in adempauze
--    is aangekondigd en blijft staan (oppervlak 21).
--
-- ⚠️ **Een `join` en geen `left join`, en de reden is smaller dan ze lijkt.**
--    Een lid zonder recente verschijning valt uit de lijst in plaats van er met
--    lege kolommen in te staan: de handtekening belooft een held en een trigger,
--    en een rij waarin allebei `null` zijn is geen antwoord maar een vorm.
--
--    ⚠️⚠️ **Wat dit níet is, is bescherming — en dat stond hier eerst wél.**
--       📏 Gemeten in de security-review op dit issue: `groep_klassement()`
--       draagt dezelfde poort (`lid_van_open_groep`) en dezelfde ledenfilter
--       (`status <> 'inactive'`), dus het complement is één query — de leden uit
--       het klassement die niet in deze lijst staan, zijn exact de leden zonder
--       recente verschijning. `group_members` is via `mag_groep_lezen()` sowieso
--       leesbaar. Wie hier een `left join` van maakt, geeft dus niets weg dat een
--       aanroeper niet al kon uitrekenen.
--
--       Het stond er als een reden om er niet aan te twijfelen, en dat is in dit
--       project de duurste vorm van een fout (CLAUDE.md: *"een afwijking die je
--       onderbouwt is duurder dan een die je vergeet"*). Wat de afwezigheid
--       daadwerkelijk verraadt — dat iemand geen meldingen krijgt — staat als
--       Laag-rij in `docs/ENGINEER-REVIEW.md` en niet als opgelost.
create or replace function public.groep_helden(
  p_group_id uuid,
  p_limit    integer default 20,
  p_offset   integer default 0
)
  returns table (
    user_id      uuid,
    display_name text,
    hero_key     text,
    trigger      text,
    totaal       bigint
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with leden as (
    select m.user_id as user_id, p.display_name as display_name
    from group_members m
    join profiles p on p.id = m.user_id
    where m.group_id = p_group_id
      and m.status <> 'inactive'
  ),
  laatste as (
    select distinct on (a.user_id)
      a.user_id  as user_id,
      a.hero_key as hero_key,
      a.trigger  as trigger
    from hero_appearances a
    where a.user_id in (select l.user_id from leden l)
      and a.trigger = any (array['misser', 'stilte', 'mijlpaal', 'tussendoor'])
      and a.shown_at >= date_trunc('day', now(), 'UTC') - interval '7 days'
    order by a.user_id, a.shown_at desc, a.id desc
  ),
  samen as (
    select
      l.user_id                    as user_id,
      l.display_name               as display_name,
      h.hero_key                   as hero_key,
      h.trigger                    as trigger,
      -- ⚠️ Het aantal léden met een zichtbare verschijning, en niet het aantal
      --    leden van de groep. De paginering telt wat er in deze lijst staat;
      --    dat tweede getal staat in `groep_klassement()` en hoort daar.
      count(*) over ()             as totaal
    from leden l
    join laatste h on h.user_id = l.user_id
  )
  select s.user_id, s.display_name, s.hero_key, s.trigger, s.totaal
  from samen s
  where lid_van_open_groep(p_group_id)
  -- ⚠️ Op naam en niet op tijd. Een sortering op `shown_at` geeft het tijdstip
  --    niet prijs maar wél de volgorde, en dat is "wie miste het laatst iets" —
  --    een kolom die met opzet niet in de handtekening staat, alsnog afleidbaar
  --    uit de rijvolgorde. `user_id` erachter houdt de paginering deterministisch
  --    bij gelijke namen, zelfde reden als in `groep_klassement()`.
  order by s.display_name asc, s.user_id asc
  limit greatest(0, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.groep_helden(uuid, integer, integer) is
  'Welke held er de afgelopen zeven dagen bij elk lid van een OPEN groep het '
  'laatst langs is geweest, van de vier triggers die deze groep mag zien: naam, '
  'held en trigger, meer niet (besluit 5 van '
  'QS8-468). Geen tijdstip en geen rij-id — die kolommen bestaan niet, zodat de '
  'belofte niet in een component hoeft te staan. Geeft nul rijen in een '
  'beschermde groep, aan een niet-lid en aan een uitgezet lid.';

-- ⚠️ De volledige vorm van onwrikbare regel 4. `from public, anon` alléén houdt
--    precies de rol over waaronder iedere ingelogde gebruiker draait; in Supabase
--    deelt `alter default privileges` élke nieuwe functie uit aan alle drie.
--    `tests/rls/functiegrants.test.ts` legt elk uitvoerrecht naast een grant-regel.
revoke all  on function public.groep_helden(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.groep_helden(uuid, integer, integer) to authenticated;

commit;
