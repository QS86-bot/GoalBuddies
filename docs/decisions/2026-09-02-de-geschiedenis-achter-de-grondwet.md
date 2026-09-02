# De geschiedenis achter de grondwet

**Datum:** 02-09-2026 · **Aanleiding:** tokenaudit · **Raakt:** `CLAUDE.md`

`CLAUDE.md` woog 13.348 tokens en werd bij élke turn en bij élke subagent-start
opnieuw ingelezen. Ongeveer een kwart daarvan was geen regel maar de uitgeschreven
geschiedenis eronder: de incidenten die een regel hebben opgeleverd, met datum,
issuenummer en migratie.

Die verhalen zijn waardevol — ze zijn de reden dat de regels niet willekeurig
zijn — maar ze horen niet in het bestand dat je duizend keer betaalt. Dit is de
toepassing van de eigen eigendomsregel uit `CLAUDE.md`: **dat bestand bezit de
regels, niet de stand en niet de geschiedenis.**

Alles hieronder staat **verbatim** zoals het in `CLAUDE.md` stond. Er is niets
herschreven en niets weggelaten; de regel zelf is in `CLAUDE.md` blijven staan,
vaak korter geformuleerd, met een verwijzing hierheen waar het verhaal ertoe doet.

⚠️ **Dit document is een archief, geen agenda.** Staat hier iets dat nog openstaat,
dan hoort het in `docs/ENGINEER-REVIEW.md` of in Linear — niet hier.

---


## 1. Domeinregel 7 — A17: de derde verruiming, en waarom hij is teruggedraaid

   ⚠️ **A17 was de derde en is op 20-08-2026 teruggedraaid.** De groep zag je
   risicostatus, en het beslisdocument had zelf al opgeschreven dat dat
   herbevestigd moest worden vóór EPIC 12 — want vanaf het moment dat de
   Risico-radar draait, ís `risk_status` een afgeleide van andermans gemiste
   weken. Bij die herbevestiging is het dichtgezet: migratie 0050 verhuisde de
   kolommen naar `goal_risk`, eigenaar-only. **Dit is het bewijs dat "herbevestigen
   vóór X" werkt — schrijf zo'n aantekening op zodra een besluit aan een
   toekomstige feature hangt.**

## 2. Regel 19 — waarom de security-reviewer nooit wacht

⚠️ **Waarom de security-reviewer nooit wacht.** Drie redenen, alle drie op
19–20 augustus in de praktijk gezien:

1. **Wat je uitstelt groeit mee met wat je erop bouwt.** De vier routes naar een
   weggepoetste week (0043 t/m 0046) zijn gevonden doordat er direct gereviewd
   werd. Waren ze blijven liggen, dan stond EPIC 11, 12 en 9 bovenop een reeks
   die te verzinnen was — en dan is het niet één migratie maar alles wat erop
   leunt opnieuw nakijken.
2. **Fouten worden gekopieerd.** De `auth.uid()`-NULL-val kostte veertig regels
   omdat er precies één functie was die hem had. Elke definer-functie daarna is
   een kopie van de vorige.
3. **De database is nu leeg, en dat is tijdelijk.** Vandaag kun je testrijen
   aanmaken, verifiëren en weggooien. Zodra er één echte gebruiker is, is een
   vervalste reeks échte data die gemigreerd of gecorrigeerd moet worden.

## 3. Regel 18 — de zeven keer dat elk onderdeel klopte en het geheel lekte

Drie keer in één week was de duurste fout dezelfde fout, en alle drie de keren
was er een uitgebreide, groene testsuite die er niets van zag.

| Wanneer | Wat er klopte | Wat er lekte |
|---|---|---|
| Migratie 0032/0034 | `SYSTEEM_GEBEURTENISSEN` en de CHECK, elk voor zich | De test vergeleek de app-lijst met **zichzelf**. 0032 zette `deadline_requested` op de CHECK, de app bleef op acht staan, en er werd niets rood |
| QS8-115 / PR #9 | `deadlineVerzoekSchema` c.s. waren netjes vertaald | Ze verhuisden naar een eigen bestand (QS8-120/121) en de Nederlandse zinnen kwamen terug. De schematests toetsen de **inhoud** van de melding, niet de **herkomst** |
| QS8-24 | `scrubMessage()` en `scrubContext()`, allebei uitgebreid getest | `reportError()` nam de geschoonde melding en zette de **ruwe stack** ernaast. De eerste regel van een stack ís de melding, dus alles ging er alsnog uit |
| QS8-85 / QS8-115 | De test greep in `app/doel/[id].tsx` naar de letterlijke zin "De app rekent niets af" | De zin verhuisde naar de catalogus. De test bewaakte daarna nog steeds íets — een bestand — maar niet meer de belofte, en bleef groen tot hij per ongeluk rood werd |
| QS8-113 / QS8-115 | Kolom, CHECK, kolomgrant, leeskant en catalogus: elk stuk af en getest | Er was geen schrijfpad naar `profiles.locale`. De héle keten was dood hout en geen enkele test kon dat zien, want er was niets kapot |
| QS8-56 | `vraag_deadline_verschuiving()`, `beslis_deadline_verzoek()` en `deadline_requests_select` toetsten alle drie de goede groep, en alle drie waren gemeten | Het scherm koos die groep met `groepen[0]`, uit een lijst zonder `order by`. **Er was geen test die groen bleef terwijl de belofte brak — er was geen test die de belofte kón raken**, want tot PRD 5.5 was "een doel in twee groepen" een onbereikbare toestand |
| QS8-115 / `tekst:controle` | Zeven heuristieken, elk met een uitgeschreven ijking in het commentaar | De controle zelf stond nooit onder test. Zeven vormen kwamen er niet doorheen — één woord op een prop, een prop over meerdere regels, een sleutel in een objectliteraal, een zin in `setMelding()`, JSX-tekst met een accolade. 23 zinnen door de app, en `npm run tekst:controle` meldde nul |

## 4. Een weggezette bevinding — de rij van 17-08 en het scoregat van 0064

⚠️ **Waarom dit ertoe doet.** Die rij van 17-08 was terecht Laag — zelfbedrog,
geen autorisatiegrens. Vier dagen later liet 0064 het minpunt van precies die
handeling afhangen, en werd het een scoregat dat 0066 moest dichten. **Vraag bij
elke nieuwe beslissing die op een bestaande primitieve handeling leunt: staat
daar een weggelegde bevinding over?**

## 5. Regel 19 — de formulering die hieraan voorafging

Stond eerst als "geen merge zonder code-critic, security-reviewer en
critical-user", op elke epic. Dat was te grof: het draaide drie agents koud over
dezelfde bestanden, ook bij een wijziging waar twee van de drie niets te zoeken
hadden.

## 6. Regel 19 — verifieer elke bevinding zelf

⚠️ **Verifieer elke bevinding zelf voordat je hem verwerkt.** Ze hebben het ook
mis: in de ronde van 20-08 was de zwaarste bevinding aantoonbaar onjuist (ze las
een migratiebestand waar de gedéployde functie strenger was), terwijl twee andere
kritieke bevindingen wél klopten. `pg_get_functiondef()` is de waarheid.

## 7. Regel 18 — de zes vragen met hun oorspronkelijke voorbeelden

1. **Waar knopen twee correcte onderdelen aan elkaar?** Daar hoort een test, en
   niet alleen op weerszijden ervan. Bij QS8-24 werd dat `rapport.test.ts`: die
   toetst wat `reportError()` daadwerkelijk aan een sink geeft.
2. **Toetst deze test de belofte, of een eigenschap van het onderdeel?** "De
   melding is duidelijk" is het onderdeel. "Er gaat geen gebruikerstekst de deur
   uit" is de belofte. Alleen de tweede blijft kloppen als iemand de code
   verplaatst.
3. **Kan deze test groen blijven terwijl de belofte breekt?** Als het antwoord ja
   is, bewaakt hij niets.
4. **Grijpt deze test naar een plek in plaats van naar de belofte?** Een test die
   een letterlijke zin in een schérmbestand zoekt, verhuist niet mee als die zin
   verhuist. Hij wordt dan niet rood — hij bewaakt gewoon iets anders. Toets de
   sleutel én de catalogus, niet het bestand waar de zin vandaag toevallig staat.
5. **Is de keten ergens onderbroken terwijl elk schakeltje af is?** Dat is de
   variant zonder kapot onderdeel, en dus de variant die geen enkele test vindt.
   Vraag bij een feature die "klaar" heet: kan een gebruiker hier daadwerkelijk
   bij, en langs welke knop? Bij QS8-113 lag er een kolom met een grant en een
   policy die niemand ooit kon vullen.
6. **Tilt deze feature een aanname van "er is er altijd precies één" naar "er
   kunnen er meer zijn"?** Dan staat de fout er waarschijnlijk al, en heeft
   niemand hem kunnen zien — er is dan niet "een test die groen bleef terwijl de
   belofte brak", er is geen test die de belofte kón raken. Grep op `[0]`,
   `.find(`, `first`, `single()` en `maybeSingle()` in alles wat die zaak
   aanraakt, vóór je de feature bouwt. Bij QS8-56 kostte dat vijf minuten en
   leverde het één echte vondst op.

## 8. Regel 18 — de ijking van tekst:controle, twee keer misgegaan

⚠️ **Breek de grendel die de ijking noemt, niet zomaar iets — anders is de ijking
zelf de aanname.** Een controle heeft meestal meer dan één grendel achter elkaar,
en een ijking die zijn geval door een pad voert dat een éérdere grendel al
tegenhoudt, blijft groen als je de grendel uit zijn eigen naam weghaalt. Op 28-08
stond er zo een in `tekst:controle`: de ijking heette "een generic die op een regel
eindigt met een punthaak" en voerde zijn fragment aan als `.ts`, waar de
JSX-grens hem al afvangt. Hij bewaakte niets van wat hij beloofde, en dat bleek
niet uit lezen maar uit de mutatie. **Mutatie per grendel, en niet één mutatie
voor de hele controle.**

⚠️ **En dat geldt óók voor de controlescripts zelf, wat op 24-08 pijnlijk bleek.**
`npm run tekst:controle` bewaakt de belofte "er staat nergens meer UI-tekst hard
in de code" en meldde maandenlang nul, terwijl er in één scherm zeven
onvertaalde zinnen stonden. De heuristieken waren niet slecht; ze zijn nooit
tegen een bekend geval gelegd, want er wás geen manier om te zien wat het script
wél vindt zonder de hele codebase te wijzigen.

**Een controle die je niet kunt voeden, kun je niet ijken.** Sinds QS8-115 heeft
elk script dat een regel bewaakt daarom een geëxporteerde functie en een test die
hem élke vorm los aanbiedt — de vormen die hij moet vinden én de vormen die hij
met rust moet laten. Die tweede helft is even belangrijk: een controle die alles
meldt, leert je hem te negeren. Zie `tests/scripts/tekst-controle.test.ts` en
`tests/scripts/migratieregister.test.ts`.

## 9. Domeinregel 7 — wat besluit A41 niet is, en hoe het gebouwd werd

   Wat dat besluit **niet** is:

   - Geen verruiming van bestaande groepen. Alles wat vandaag dicht zit, blijft
     dicht tot de epic gebouwd is, en bestaande groepen zijn **beschermd**.
   - Geen tweede pad naast RLS. De keuze wordt een kolom op `groups` waar de
     policies op variëren; hij mag nooit alleen in de UI bestaan.
   - Geen keuze die je later stilzwijgend omzet. Een groep die van beschermd naar
     open gaat, verandert met terugwerkende kracht wat er over ándere leden
     zichtbaar wordt — dus dat is een handeling met dezelfde zorgvuldigheid als
     een commitment device (domeinregel 5).

   ⚠️ **Gebouwd op 24-08-2026 (QS8-132, migraties 0076 t/m 0079).** De kolom
   `groups.zichtbaarheid` bestaat en is voor geen enkele client schrijfbaar; het
   omzetten loopt via `zet_groepszichtbaarheid()` — actieve beheerder, expliciet
   bevestigd, een rij in `group_events`, een systeembericht. Alle twintig
   oppervlakken zijn beoordeeld en alles wat om moest is om: weekdoelen (0077),
   de beste reeks en de laatste cyclus (0078), De Ketting (0079).

   ⚠️ **"Open" betekent nooit "alles open", en zes oppervlakken bewijzen dat.**
   Systeemberichten over tegenslag, realtime, ingetrokken goedkeuringen, de
   weekpassen, de teller van De Ketting en de mijlpaalaankondiging blijven dicht,
   óók in een open groep. Wie er ooit een wil verruimen, leest eerst de rij en de
   reden in `docs/decisions/002-domeinregel7-oppervlakken.md` §6b.

   ⚠️ **Het waren er zeven tot 01-09-2026.** Punten stonden erbij, en besluit A54
   heeft ze er in een open groep uit gehaald — maar alléén het **groepstotaal per
   lid**, niet het persoonlijke totaal en niet de deltas. De precieze grens staat
   bij domeinregel 10 hieronder; hem uit het hoofd naspelen gaat mis.

## 10. Domeinregel 7 — de varianten van QS8-128

   ⚠️ **Besluit A41, 24-08-2026: er komt een keuze per groep — en de standaard
   blijft beschermd.** Bij het aanmaken kiest een groep tussen **beschermd**
   (zoals nu, en de standaard) en **open** (de groep ziet ook tegenslag). Dat is
   variant 2 van QS8-128; variant 3, de regel afschaffen, is afgewezen.

## 11. Domeinregel 7 — het waarom, en zakelijk gebruik

   *Waarom:* in een groep van drie vrienden doodt één schaamtemoment de hele groep.
   Dit is de belangrijkste vondst uit de Habit Huddle-analyse.

   ⚠️ **En juist bij zakelijk gebruik weegt dat zwaarder, niet lichter.** Zit er
   een leidinggevende in een buddy-groep, dan beschermt deze regel niet meer tegen
   schaamte maar tegen een beoordelingsgesprek. Dat is een zwaardere reden om hem
   te houden dan de reden waarom hij er staat.

## 12. Domeinregel 10 — besluit A42 en de smalle uitzondering A54

      ⚠️ **Besluit A42, 24-08-2026: zo houden** — de vraag was of een gedeeld
      puntentotaal niet competitiever is. Dat is het, en het lekt: wie het totaal
      deelt, deelt het missen via een omweg. Wat wél mag is een teller die **alleen
      optelt**, zoals De Ketting en zijn mijlpalen (0070).

      ⚠️ **Besluit A54, 31-08-2026, gebouwd op 01-09-2026 (QS8-254, migratie
      0141): er is één uitzondering, en die is smal.** Een **open** groep (A41)
      krijgt een klassement per lid. Wat dat toont is niet je persoonlijke totaal
      maar de punten die je **in díe groep** verdiend hebt, en dat verschil draagt
      de hele regel:

      - `cycle_missed` wordt zónder `group_id` geboekt — een gemiste week is niet
        aan één groep toe te rekenen. **Het klassement kan dus niet dalen van een
        gemiste week**, en dat is precies wat A42 beschermde.
      - Dat was een toevalligheid van de rollover en is sinds 0141 een grendel:
        `points_ledger_gemist_is_niet_van_een_groep`. Wie die CHECK weghaalt,
        verandert een klassement in een tegenslagmeter.
      - `groep_klassement()` geeft **geen delta en geen datum** terug. Die kolommen
        bestaan niet, zodat de belofte niet in een component staat.
      - In een **beschermde** groep geeft de RPC nul rijen. De grens is
        `lid_van_open_groep()` en staat in de database, niet in het scherm.

      De redenering staat in `docs/decisions/2026-08-31-ritme-klassement-en-kleur.md`
      §2 en de oppervlakteanalyse als rij 28 in beslisdocument 002.

## 13. Domeinregel 10 — waarom verschuiven geen punt kost (A43)

    ⚠️ **Een deadline verschuiven kost geen punten** en dat is een besluit, geen
    omissie (Q-TODO A7). **Herbevestigd op 24-08-2026 als besluit A43** (QS8-129):
    er komt géén minpunt op verschuiven zonder akkoord. Dat zou de enige plek in
    het model zijn waar je je uit een afspraak kunt kópen, en een punt is
    goedkoper dan een gesprek. De rem zit ergens anders: verschuiven kán alleen met
    akkoord van een buddy, en zonder akkoord blijft de datum staan. Zou er ook een
    minpunt op staan, dan betaal je twee keer voor één gebeurtenis. Alleen
    `correction` mag verder negatief boeken, en dat is per definitie het
    rechtzetten van iets dat al geboekt was.

## 14. Beveiliging regel 4 — het geval seizoensrecap_cijfers()

   ⚠️ **Elke `revoke` noemt `authenticated` met zoveel woorden.** In Supabase
   deelt `alter default privileges` élke nieuwe functie en tabel in `public` uit
   aan `anon`, `authenticated` én `service_role`. `revoke ... from public, anon`
   ziet eruit als "van iedereen" en houdt precies de rol over waaronder iedere
   ingelogde gebruiker draait. Op 28-08 stond `seizoensrecap_cijfers()` daardoor
   voor elke gebruiker open, op productie, terwijl de migratie hem
   `service_role`-only bedoelde — en honderdtwintig regels verderop deed
   dezelfde migratie het wél goed. De vorm is `from public, anon, authenticated`.

   ⚠️ **Sinds 0115 is dat een grendel en geen zin.**
   `tests/rls/functiegrants.test.ts` legt elke functie die `authenticated` mag
   uitvoeren naast de `grant`-regels in `supabase/migrations/`: een recht zonder
   grant-regel is geërfd en niet besloten. Uitleg in
   `docs/decisions/2026-08-28-revoke-from-public-is-niet-van-iedereen.md`.

## 15. Regel 20 — de meting van 109 migraties, klasse A en klasse B

    ⚠️ **Sinds 24-08 een controle en geen zin meer.** `npm run migraties:controle`
    draait mee in `/audit` en wordt rood bij een gat in de nummering, twee
    migraties met hetzelfde nummer, of een migratie zonder rollback-pad in zijn
    kop. Het gat is de belangrijkste van de drie: de bestanden zijn de enige
    manier om dit schema ergens anders op te bouwen, en ontbreekt er één, dan
    toetst de RLS-suite daar een ánder schema dan productie — groen zonder iets
    te bewijzen. Twee keer met de hand gevonden, beide keren bij toeval.

    ⚠️ **En sinds 28-08 is "idempotent" scherper gesteld, want letterlijk
    gelezen eist die zin iets dat het schema slechter maakt.** Gemeten door het
    schema op een lege database op te bouwen en daarna élk bestand een tweede
    keer af te spelen: zeven van de 109 vielen om, en dat waren twee
    verschillende dingen.

    - **Klasse A — werkelijk niet idempotent.** Drie regels in twee bestanden:
      een `create function` zonder `or replace` en een `create index` zonder
      `if not exists`. Dit is de fout, en die hoort weg.
    - **Klasse B — valt om, en dat is de beveiliging.** Vijf bestanden proberen
      bij een tweede ronde een **oudere** definitie terug te zetten van een
      object dat een latere migratie veranderd heeft. Postgres weigert dat.
      **Die weigering is het enige dat de terugzet tegenhoudt** — bij
      `group_visible_streaks` zou het zelfs een domeinregel-7-besluit
      terugdraaien (0003 laat `last_cycle_start` er bewust uit, 0078 zette hem
      er onder besluit A41 weer in). **Zo'n fout neem je nooit weg.**

    **De regel luidt dus: idempotent tegen de toestand waarvoor de migratie
    geschreven is.** Verandert een latere migratie de vorm van hetzelfde object,
    dan is de botsing bij herhaling correct gedrag en geen defect.

    ⚠️ De grendel staat in `tests/migraties/idempotentie.test.ts` en draait mee
    in `npm test`, dus bij elke push. Hij vindt klasse A en laat klasse B met
    rust; beide helften zijn met de hand geijkt. Hij hoort thuis in
    `migraties:controle` en staat in `tests/` omdat `scripts/` het werkgebied
    van een parallelle sessie was — verhuizen zodra dat vrij is.

## 16. Regel 20 — de drop-uitzondering en migratie 0059

    ⚠️ **De drop-uitzondering leest de handtekening en niet alleen de naam.**
    Een migratie die de vorm van een functie verandert móet hem eerst droppen,
    want `or replace` kan een returntype niet wijzigen — dat is goed. Maar 0059
    dropte `plaats_systeembericht(uuid, text, text)` en maakte daarna een versie
    met zés argumenten: een andere functie, dus de drop dekte hem niet. Een
    controle die op naam vergelijkt, laat precies die bug door.

## 17. Emoji — de UTF-16-val uitgeschreven (QS8-118)

⚠️ **Gevolg dat geen zin maar een controle nodig heeft.** Omdat gebruikers ze
overal mogen typen, mag geen enkele plek gebruikerstekst afkappen of het eerste
teken pakken met `charAt(0)`, `[0]` of `.slice(0, n)`. JavaScript telt in
UTF-16-eenheden; een emoji kost er twee en 👨‍👩‍👧‍👦 elf. Snijden op zo'n grens
levert een halve codepoint op en dat rendert als `�`. Gebruik de gedeelde helpers
uit `src/shared`, nooit de kale string-methodes. Zie QS8-118.

⚠️ Zod's `.max()` en `.length` tellen UTF-16-eenheden; `char_length` in
Postgres telt codepunten. Die twee zijn niet dezelfde grens.

**Eén eenheid overal: codepunten, want dat is wat de database telt.** Gebruik
`telTekens()` uit `src/shared/tekst`, ook in een teller onder een invoerveld.
Een teller die in grafemen telt terwijl de grens in codepunten staat, is een
nieuwe fout en geen reparatie: hij zegt "lang genoeg" op een ander moment dan
het schema. `telGrafemen()` bestaat voor waar je écht zichtbare tekens bedoelt,
zoals een preview — nooit voor een grens.

⚠️ Bij een **ondergrens** gaat het verschil de gevaarlijke kant op. `.length` is
altijd ≥ `char_length`, dus een client die in UTF-16 telt laat door wat Postgres
weigert. Tien emoji halen `.length >= 20`, maar `char_length` is dan 10 en de
gebruiker kreeg een storingsmelding nadat het formulier "Lang genoeg" zei. Dat
stond zo in het deadline-argument tot QS8-118.

## 18. Emoji — de nameting van 20-08 en 22-08

Ze vertalen slecht, ze renderen
per platform anders, en een schermlezer leest "gezicht met vreugdetranen" midden
in een zin. Op 20-08 en 22-08 nagemeten: er stond er geen één in `src/` of `app/`.
Deze regel legt vast wat er al was.

## 19. Commando's — vier botsende migratienummers

⚠️ **Een nieuwe migratie begint met `npm run migratie:nieuw -- "naam"`.** Die kijkt
naar élke branch die de remote kent en niet alleen naar je eigen map. Op
28-08-2026 botsten migratienummers **drie keer op één dag**, elke keer omdat er
`max + 1` uit de werkkopie genomen werd terwijl het werk elders al hoger stond.

⚠️ **En sinds 01-09-2026 fetcht dat script zelf, want eerlijk zijn was niet
genoeg** (QS8-247). Op 31-08 botste het nummer een **vierde** keer, mét de tool,
om precies de reden die de tool in zijn eigen commentaar al had opgeschreven:
`refs/remotes/origin` is zo oud als je laatste fetch. **Een gereedschap dat
bestaat om een botsing te voorkomen, mag zijn juistheid niet laten afhangen van
een handeling die het zelf niet doet** — dan is de waarschuwing een disclaimer
en verplaats je het probleem naar de lezer.

## 20. Commando's — waarom de fetch-tests een echte remote nodig hadden

⚠️ Beide kanten staan onder test in `tests/scripts/migratie-fetch.test.ts`, met
een echte remote op schijf. Dat kost een fixture en het moet: elke bestaande test
voedde het script zijn éígen `perBranch`-object, en dan is "klopt dat object" niet
te stellen. Die tests bleven groen terwijl de belofte brak omdat ze hem niet
kónden raken — CLAUDE.md-vraag 3 in zijn zuiverste vorm.

## 21. Commando's — PR #100 en de vier van de tweeëntwintig controles

⚠️ **`npm run poort` draait álles: typecheck, lint, beide testsuites en elke
`*:controle`.** Draai die en niet een greep eruit. Op 28-08-2026 ging PR #100 rood
op `klokgrens:controle` omdat er vóór de push **vier van de tweeëntwintig**
controles gedraaid waren — de controle deed precies zijn werk, de poort was de
inschatting van een mens over zijn eigen werk.

## 22. Supabase gratis tier — waarom de verbindingsregel een controle werd

  ⚠️ **Sinds 24-08 een controle en geen zin meer.** `npm run verbindingen:controle`
  draait mee in `/audit` en wordt rood zodra er een Postgres-driver in
  `package.json` staat of een verbindingsstring in `src/`, `app/` of
  `supabase/functions/`. Vandaag klopt de regel omdat álles via PostgREST loopt
  en er niets is dat een socket kan openen — dat is geen instelling maar de
  afwezigheid van iets, en die is stil kwijt te raken. `max_connections` is **60**
  voor de héle database. Wat er moet gebeuren zodra er een langdraaiende
  Node-server bijkomt, staat in `docs/DEPLOY.md` §2.7: transactiepooler op 6543,
  `prepare: false`, kleine pool.

## 23. Wie bezit welk feit — de vijf keer dat de documenten uiteenliepen

Drie documenten beschreven dezelfde stand en liepen op één dag **vijf keer**
uiteen. Twee van die vijf ontstonden tijdens het bijwerken van diezelfde
documenten: één plek bijgewerkt, de andere vergeten. Wie kopieën met de hand
onderhoudt, maakt het probleem groter.

## 24. Wie bezit welk feit — wat een script niet kan vangen

⚠️ **Een script vangt alleen wat een patroon heeft.** "EPIC 3 is nooit gedraaid"
twintig regels boven "EPIC 3 heeft gedraaid" is geen getal, en QS8-77 die op
Done staat terwijl twee documenten hem open noemen al helemaal niet. Daarvoor
geldt de handmatige regel: **werk je iets bij, grep dan op dat feit in alle drie
de bestanden voordat je klaar bent**, en loop bij het afsluiten van een issue na
of de status in Linear en in de documenten hetzelfde zeggen.

## 25. Versiebeheer — PR #1 was één branch voor acht issues

  Dit wint van "één branch per epic", dat tot 23-08 in `docs/VOLGENDE-SESSIE.md`
  stond. Twee documenten die elkaar tegenspraken leverden in de praktijk geen van
  beide op: PR #1 was één branch voor acht issues met een zelfbedachte naam, en
  dus koppelde Linear niets — alle acht statussen zijn met de hand bijgewerkt, en
  bij een gemiste zou het bord hebben gelogen.

## 26. Beslisbevoegdheid — de lijst die hieraan voorafging

> Vervangt de lijst "Wat je NOOIT doet zonder te vragen". Quinten heeft die op
> 22-08-2026 ingeruild voor één grens, omdat de lijst hem vaker ophield dan
> beschermde.

## 27. Beslisbevoegdheid — waarom grens 1 een vertaling nodig had

GoalBuddies heeft nog geen betalende klanten. Zonder vertaling is grens 1 leeg
en staat er in de praktijk "vraag nooit iets". Dit is de vertaling:

## 28. Beslisbevoegdheid — herkomst van de harde regels

Deze stonden in de oude lijst maar waren nooit vragen; het zijn harde regels en
ze blijven staan:
