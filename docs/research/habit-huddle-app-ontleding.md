# Habit Huddle — ontleding van de app (onder /app)

> Status 16-11-2026: het **publieke deel** (aanmeldflow, §7) is ontleed na een bewuste keuze
> van Quinten tegen de voorwaarden in (§6). Het **ingelogde deel** is ontleed op basis van 19
> schermafbeeldingen van Quinten (§12 t/m §16). Wat daarop niet te zien is, staat in §17.
> Aanvulling op `docs/research/habit-huddle-teardown.md` (publieke pagina's, 15-08-2026).
> Alle beschrijvingen zijn in eigen woorden; niets van hun tekst, code of beeld staat in de repo.

## 0. Ontbrekende schermen — lijst om na te lopen (17-11-2026)

Dit is de lijst van wat in dit bestand **niet gemeten** is. Quinten kan nalopen of het de juiste
lijst is. Geen van deze schermen is zonder account te zien; er is geen nieuw verkeer naar
habithuddle.com gemaakt voor deze lijst, en er is niets omzeild. Status van elke regel:
**niet zichtbaar zonder account**, tenzij anders vermeld.

| # | Scherm | Wat er wél van gemeten is (bron) | Waarom het ertoe doet |
|---|---|---|---|
| 1 | **Nudges en waves** (versturen, ontvangen) | Alleen dat ze bestaan: een meldingsoptie "nudges en waves" (s19), tellers "nudges 0 gegeven / 0 ontvangen" (s5) en "wave streaks" (s1). Niet: wie ze kan sturen, aan wie, wat de ontvanger leest. | Domeinregel 7: een nudge richting iemand die nog niet heeft ingecheckt zegt iets over een gemiste dag. Tot dit gezien is: **niet overnemen**. Quinten meldt op 18-11-2026 dat hij dit niet kan tonen omdat het een betaald account vraagt; dat is zijn mededeling, door mij niet gecontroleerd. |
| 2 | **De check-in zelf**, ook de flexibele | Alleen de uitkomst: een kalenderlegenda "Floor" en een teller "ceiling days" (s5), en vloer/plafond als twee regels (s14). Niet: het scherm waar je kiest, en wat er daarna gebeurt. | Het kernmoment van hun retentie; regel 8 en regel 9. Quinten kan de flexibele variant niet tonen (zelfde reden als rij 1, niet door mij gecontroleerd). |
| 3 | **Een groep met meerdere leden**, ledenlijst, wat een ander lid van jou ziet | Alleen een groep met één lid (s1, s14). | Regel 4 en 7: welke velden een lid van een ander ziet. |
| 4 | **Uitnodigen en toetreden** | Alleen de knoppen "Invite" en "Join" (s1, s3). Een deel van de aanmeldflow staat publiek in §7. | Uitnodigingen zijn een spamvector (regel 5 van de beveiliging). |
| 5 | **Gewoonte aanmaken** en het opgeslagen plan met "Saved" nadat je ingelogd bent | De bewaarlijst als begrip staat publiek in §7; het scherm erna niet. | Vergelijking met onze doelopsplitsing. |
| 6 | **De Checkin Chain** als scherm | Alleen een teller in de groep (s1) en per persoon in de feed (s2). | Onze Ketting telt alleen op (regel 7). |
| 7 | **Trofeeëntab** op het profiel | Alleen dat de tab bestaat (s4). | Mogelijk een publiek oppervlak van prestaties. |
| 8 | **Plan & Billing** (prijzen) | Alleen de niveaus, zonder prijzen (s18). Hun publieke prijzen staan in `habit-huddle-teardown.md` §1. | Geen overname (regel 5: nooit geld); alleen voor het volledige beeld. |
| 9 | **Leaderboards, Hall of Fame, bibliotheek** | Alleen de ingangen (s3). | Publieke rangorde botst met regel 7. |
| 10 | **Seizoenen** (maandelijkse standen) | Alleen de term "season results" in de meldingstekst (s19) en de publieke tekst in `habit-huddle-teardown.md` §2.5. | Seizoensrecap bestaat bij ons al. |
| 11 | **Rest van de meldingenpagina** | Het onderste deel van s19 is afgesneden. | Welke meldingen over anderen gaan. |
| 12 | **Connected Accounts** | Alleen de titel (s13). | Geen relevantie gevonden. |

Een toets aan de domeinregels voor deze schermen staat **niet** in dit bestand, omdat ik ze niet
gezien heb. §16 bevat alleen een oordeel over wat wél gezien is.

**Gevolg voor het voorstel:** `docs/research/voorstel-bescherming-bij-een-gemiste-week.md` leunt
op de freeze-pagina (s16, s17), die wél gezien is. Het hangt niet af van de schermen in deze lijst,
behalve dat een groepsgenoot misschien kan zien dat een freeze is ingezet (rij 1 en 3).

## 1. Voorwaarden en privacyverklaring — GEMETEN

Bronnen: `https://habithuddle.com/tos` en `https://habithuddle.com/privacy`, op 10-11-2026
opgehaald (de links zijn gevonden in de footer van `https://habithuddle.com/`). Beide pagina's
dragen in de tekst geen versiedatum. Letterlijke citaten:

| Onderwerp | Letterlijk (ToS) |
|---|---|
| Geautomatiseerde toegang | §10 Prohibited Uses: *"Use automated systems to access the Service without permission"* |
| Verzamelen van persoonsgegevens | §10: *"Collect or harvest any personally identifiable information from the Service"* |
| Commercieel gebruik | §10: *"Use the Service for any commercial purpose without our written consent"* |
| Reverse engineering | §7: *"You may not copy, modify, distribute, sell, or lease any part of our Service or included software, nor may you reverse engineer or attempt to extract the source code of that software."* |
| Merk en uiterlijk | §7: *"Our trademarks and trade dress may not be used in connection with any product or service without our prior written consent."* |
| Scrapen / crawlen | het woord komt in beide documenten niet voor (gezocht op scrap, crawl, spider, robot, harvest) |

`https://habithuddle.com/robots.txt` (gemeten): `Allow: /app/`, `Disallow: /api/` en `/admin/`,
`Crawl-delay: 1`. Robots.txt is geen toestemming in de zin van de ToS: de ToS vraagt om
*permission*, en robots.txt zegt alleen wat crawlers mogen.

## 2. Eerste besluit (gestopt) — AFGELEID

> **Stand vóór het besluit van §6 (10-11-2026), met opzet niet herschreven.** §2, §4 en §5
> beschrijven wat er gold op het moment van stoppen. §6 en §7 zijn de stand erna: `/app/start`
> en `onboarding-funnel.js` zijn daarna wél opgehaald en lokaal geanalyseerd (REA bleef
> ongedraaid). Waar §4 "niet gemeten" zegt over `/app/start`, is dat door §7 achterhaald;
> voor alles ingelogd blijft het onverkort waar (zie §10).

De opdracht zei: staat geautomatiseerde toegang erin als verboden, stop dan met dat onderdeel
en meld het. Het staat erin, onder voorbehoud van toestemming. Daarom:

- **REA niet gedraaid.** Het is een geautomatiseerde browser die structuur, scripts en
  netwerkverkeer van de site uitleest; dat valt onder "automated systems" en het
  scriptonderzoek schuurt aan §7 (broncode van de software).
- **`/app/start` niet automatisch doorlopen.** Elke stap is een verzoek van een script aan
  de dienst. Een mens die de stappen zelf doorloopt is geen geautomatiseerde toegang.
- **Geen ingelogde schermen**, zoals afgesproken.

Wat wel gebeurd is, voor de volledigheid: vier GET-verzoeken met `curl` — de landingspagina
(alleen om de footerlinks te vinden), `/tos`, `/privacy` en `/robots.txt`. Dat zijn de
documenten die de opdracht zelf als eerste stap voorschreef. Of dat onder "zonder permission"
valt is een uitleg die Quinten mag maken; er is daarna niets meer opgehaald.

**Een vraag voor Quinten (grens 1: wat we extern beweren of riskeren):** de eerdere teardown
(15-08-2026) is met Firecrawl gemaakt, een geautomatiseerde tool. Daar is toen niet naar de
voorwaarden gekeken. Dat is geen reden om het document te verwijderen — het beschrijft
functionaliteit in eigen woorden — maar het is wel iets dat hij weet.

## 3. Wat in de privacyverklaring staat dat voor ons telt — GEMETEN

Bron: `https://habithuddle.com/privacy`, §4.1:

- *"Your habit check-ins are publicly visible to all users of the Service"*
- *"Leaderboards and streak information are visible within your huddles and may be publicly displayed"*
- §2.1 noemt als verzamelde habitdata o.a. *"floor and ceiling targets, checkin responses, streak information"*.
- §2.3: *"Habit creation prompts sent to AI providers for Pro users"* — prompts gaan naar een externe AI-aanbieder.

**Overdraagbaar? Nee, op de eerste twee.** Publiek zichtbare check-ins en streaks botsen met
domeinregel 7 (falen is nooit publiek) en met de uitsluiting van publieke groepen in de PRD. Dit
bevestigt wat `habit-huddle-teardown.md` §5 al afwees, nu met hun eigen tekst erbij. Let op: een
publiek zichtbare streak maakt een gebroken streak ook publiek afleidbaar — precies de omweg
waar domeinregel 7 voor waarschuwt.

## 4. Wat blijft liggen en wat Quinten kan aanleveren — AANNAME vs. NIET GEMETEN

*Stand vóór 10-11-2026 (zie de kop bij §2); `/app/start` is sindsdien gemeten in §7. Quinten
koos daarna schermafbeeldingen en geen HAR.*

Niet gemeten (dus niets hierover is in dit document geschreven): de stappen, vragen en volgorde
van `/app/start` *(achterhaald, zie §7)*; alles onder `/app` behalve die flow; de netwerkaanroepen
*(de API-paden zijn alleen uit de code genoemd, nooit aangeroepen)*; huddles, check-ins, de chain,
instellingen. Ik verzin ze niet.

Quinten kan zelf, in zijn eigen browser en met zijn eigen account, aanleveren:

1. Schermafbeeldingen van `/app/start`, stap voor stap, met de vraagtekst zichtbaar.
2. Schermafbeeldingen van een check-in (floor/ceiling-keuze), de huddle-weergave, de chain en
   de instellingen (`/app/settings-profile`).
3. Zijn eigen HAR (alleen van wat hij zelf doorloopt; sessiecookies en tokens eruit laten voordat
   hij hem deelt).

Op basis daarvan beschrijf ik elk mechanisme in eigen woorden en toets ik het aan de
domeinregels, met als vaste vragen: toont het iets over een gemiste dag of week van een ander
(regel 7)? Levert een persoonlijke notitie of dagregel iets op dat de groep ziet (regel 9)?
Rekent het zelf met een week of dag buiten `shared/time` (regel 1)?

## 5. Volgende afgebakende stap

*Stand vóór 10-11-2026.* Quinten besluit (a) of hij het materiaal uit §4 aanlevert, en (b) of hij
Habit Huddle om schriftelijke toestemming voor onderzoek wil vragen. Zonder (a) is er geen
ingelogd werk te doen; zonder (b) blijft elke geautomatiseerde stap uitgesloten.
*Bijgewerkt: Quinten koos (b) niet maar ging bewust door (§6); (a) loopt via schermafbeeldingen,
zie §11.*

## 6. Besluit van Quinten, 10-11-2026 — de keuze tegen de voorwaarden in

Quinten heeft hier, in het gesprek, gezegd dat hij de werking van Habit Huddle wil laten
reverse-engineeren om concrete verbeteringen aan GoalBuddies te kunnen doorvoeren. Eerder,
via een doorgegeven bericht, koos hij voor "toch geautomatiseerd, op eigen risico", nadat de
twee citaten uit §1 (ToS §7 en §10) hem voorgelegd waren. Het is dus **bewust tegen de
voorwaarden in**, en het risico is het zijne. Grenzen waaronder ik het deed:

- alleen publieke pagina's op habithuddle.com, nooit ingelogd, geen cookies of tokens;
- niets opgehaald onder een pad dat in `robots.txt` op Disallow staat (`/api/`, `/admin/`);
- maximaal 40 verzoeken, minstens een seconde ertussen; geen blokkade tegengekomen;
- zijn Google-sessie is **niet** gebruikt. Ingelogd materiaal komt alleen via schermafbeeldingen.

**Wat er daadwerkelijk is opgehaald: 6 verzoeken** (GET, standaard `curl`, geen aangepaste User-Agent):
`/` (landing), `/tos`, `/privacy`, `/robots.txt`, `/app/start`,
`/app/assets/js/onboarding-funnel.js`. De analyse daarna is lokaal gedaan op die twee
opgehaalde bestanden. REA is niet gedraaid: de HTML bleek de hele flow te bevatten
en een browser had extra verzoeken gekost zonder iets toe te voegen. De API-paden die de
code noemt zijn **niet** aangeroepen (Disallow); hun bestaan staat in de code, hun gedrag
is dus onbekend.

## 7. De aanmeldflow op /app/start — GEMETEN

Bron: de HTML van `https://habithuddle.com/app/start` en `onboarding-funnel.js`.
De flow is één pagina met schermen (stap-ids in de bron, in documentvolgorde):
`hello, invite, fade, floor_explain, cheer, huddle_explain, areas, feel, tries, stops, time,
reminder, push, who, heard, become, build, floor, ceiling, plan, save, ready, transform,
lead, proof, science, friends, commit, huddle, own, place, app, saving, decline`.

Wat elk deel doet (eigen woorden):

1. **Uitleg met herkenning.** Twee keer een stelling ("herken je dit?") met ja/nee, daarna
   een korte uitleg: eerst het idee van een lage en hoge versie (vloer en plafond), dan de
   groep met eigen streak per persoon en een gezamenlijke keten.
2. **Zeven korte vragen** voordat er iets gebouwd wordt: levensgebieden (zes), gewenst
   gevoel, hoe vaak eerder geprobeerd, wat meestal stopt (vijf antwoorden, waaronder
   "één gemiste dag en ik stop"), beschikbare tijd (vier niveaus), herinneringsmoment en
   -tijd (stappen van 15 min), wie je in de groep wilt, en een vrij tekstveld "wie wil je worden".
3. **Een voorbeeld van de pushmelding** vóórdat de toestemming gevraagd wordt.
4. **"Plan bouwen"** met wachtscherm; de code stuurt de antwoorden naar een
   server-aanroep (`onboarding-build`) en krijgt gewoonten terug. Twee wetenschappelijke
   verwijzingen staan op dat wachtscherm.
5. **Vloer en plafond per gewoonte** worden daarna apart gevraagd (twee schermen).
6. **Plan van drie**: de rest wacht in een bewaarlijst; de gebruiker bevestigt.
7. **Pas daarna de aanmeldmuur** (Google, Apple, Discord). Het plan is dus vóór het account gemaakt.
8. **Na opslaan**: een aanbod voor betaald (gratis = één gewoonte per groep), bewijs
   (getuigenissen, onderzoeksverwijzingen, eigen cijfers), een **ondertekende belofte**
   (met de vinger) voor 7, 14, 30 of 90+ dagen, en dan een groep kiezen: in een bestaande
   groep geplaatst worden op basis van vergelijkbare gewoonten, of een eigen groep
   starten (optioneel "stuur mensen mijn kant op"). Daarna uitnodigen en de app-download.
9. **Afwijzen van het aanbod** vraagt één keer bevestiging en laat één gewoonte over als hoofdgewoonte.

Wat de code in het opslagverzoek meestuurt (benoemd in `onboarding-funnel.js`): de
antwoorden, de gewoonten, welke aangevinkt zijn, het aantal beloofde dagen, of er getekend is,
en het herinneringsmoment.

## 8. Wat ik hieruit afleid — AFGELEID

- Retentie wordt hier voor de aanmelding gewonnen: de gebruiker investeert in antwoorden
  en een gebouwd plan voordat hij een account maakt (sunk cost, zonder dat ze dat zo noemen).
- De herinneringsvoorvertoning vóór de toestemming is een bekende manier om meer
  pushtoestemmingen te krijgen. De opkomst of conversie is niet gemeten.
- Hun cijfers ("terugkomst dag 2 in een groep tegenover alleen") zijn eigen
  aanspraken op de pagina. **Niet geverifieerd**, en ik neem ze nergens over.
- De server-aanroep vóór aanmelding betekent dat anonieme bezoekers een (waarschijnlijk
  AI-)bouwactie kunnen starten. Dat het AI is, is een afleiding uit hun privacyverklaring §2.3
  en uit de naam van het hulpmiddel in de pagina; ik heb het niet kunnen zien.

## 9. Overdraagbaar naar GoalBuddies?

| Mechanisme | Overdraagbaar | Toets aan de domeinregels |
|---|---|---|
| Zeven vragen vóór het bouwen, met "wat stopt je meestal" en "hoeveel tijd echt" | **Ja** | Eigen antwoorden, privé. Geen groepsoppervlak. Past op de AI-decompositielaag; AI-kosten per gebruiker begrenzen (onwrikbare regel 6) en rate limiting (regel 5), zeker als dit vóór een account draait. |
| Herkenningsstellingen met korte uitleg | **Ja** | Eigen tekst schrijven. Geen emoji in app-tekst (emoji-regel). |
| Plan van drie, de rest in een bewaarlijst | **Ja** | Past bij onafhankelijke doelen per lid. Bewaarlijst is privé. |
| Vloer en plafond apart vragen na het plan | **Ja, bestaat al** | Domeinregel 8: de vloer is optioneel en de UI moedigt aan. Hier de volgorde en de nudge overnemen. |
| Plan bouwen vóór de aanmeldmuur | **Voorwaardelijk** | Werkt alleen met servervalidatie (regel 3), rate limiting en geen opslag van persoonsgegevens zonder account. |
| Herinneringsvoorvertoning vóór de pushvraag | **Ja** | Eerste uitgaande stroom naar echte mensen is grens 1; de vraag zelf niet. Tekst moet vrij zijn van falen (regel 7). |
| Ondertekende belofte (7 t/m 90 dagen) | **Voorwaardelijk** | Een belofte aan jezelf zonder gevolg past; zodra er een gevolg aan hangt is het een commitment device (regel 5: expliciet bevestigd, auditeerbaar, nooit geld). Een dagelijkse belofte past niet bij onze week; **een wekelijkse formulering is een eigen ontwerp**. |
| Plaatsing bij onbekenden op basis van gelijkende gewoonten, met zichtbare vloer van anderen | **Voorwaardelijk** | QS8-230: groepen met onbekenden zijn **beschermd** (regel 7). Welke velden een ander ziet (hier de vloer) hoort bij domeinregel 4 en moet de database afdwingen. Niet bouwen zonder besluit. |
| Eigen groep starten met optie "stuur mensen mijn kant op" | **Voorwaardelijk** | Zelfde als hierboven; open ontdekking botst met de PRD (publieke groepen buiten scope). |
| Betaalaanbod in de flow, gratis = één gewoonte per groep | **Nee** | Grens 1 (kost/vastlegging); geld-commitments zijn uitgesloten. |
| Bewijsschermen met eigen cijfers en getuigenissen | **Nee** | Wij hebben die gegevens niet; een percentage claimen dat we niet gemeten hebben is een belofte aan mensen. |
| Check-ins publiek zichtbaar (privacyverklaring §4.1) | **Nee** | Regel 7. |
| De Dagzet (regel 9) | **Niet gemeten** | Er is in de publieke flow geen equivalent. Wat Habit Huddle ervoor heeft staat in het ingelogde deel. |

## 10. Welke schermen ik nog mis (ingelogd, via Quinten)

Niet gemeten en dus niet beschreven: `/app/settings-profile`; een gewoonte aanmaken met
vloer en plafond; het plan met "Saved" nadat het is opgeslagen; een check-in (ook de flexibele);
de Checkin Chain; een groep met leden; uitnodigen of toetreden; meldingen; elk scherm waar
een betaalde tier wordt aangeboden; en hoe de belofte uit §7 later terugkomt. Quinten levert
schermafbeeldingen met één regel per stap. Behandel ze als gemeten met bron
"schermafbeelding + zijn regel"; namen, e-mailadressen en profielgegevens op de
afbeeldingen komen niet in dit bestand.

## 11. Volgende afgebakende stap

Quinten levert de schermen uit §10. Daarna schrijf ik ze uit en trek ik de conclusies voor één
afgebakend issue (bijvoorbeeld de vraagvolgorde van onze doelopsplitsing), niet voor alles tegelijk.

## 12. Het ingelogde deel — bron en werkwijze

Bron: 19 schermafbeeldingen uit Quintens eigen browser op 16-11-2026, zonder zijn account of
sessie aan mij af te staan. Elke bewering hieronder is **GEMETEN: schermafbeelding + het
schermnummer van Quinten** (genoemd als *s1* t/m *s19*, in uploadvolgorde), tenzij er
AFGELEID bij staat. Namen, e-mailadressen en profielgegevens op de afbeeldingen (van
Quinten en van anderen) zijn niet overgenomen. Quinten gaf geen regel per scherm; wat een
scherm doet, lees ik alleen af van wat erop staat.

Navigatie (s1): Today, Checkins, Discover, Profile, Stats, Achievements, Subscribe,
Style Studio, Settings. Bovenin altijd een streakteller, een abonnementsster, zoeken en
meldingen. Links bovenaan een niveau met XP-balk.

## 13. Dagritme en vergevingsmechanismen — GEMETEN

- **Vandaag (s1):** een weekstrook van zeven dagen die **eindigt op vandaag** (dinsdag t/m
  maandag), dus een rollende week en niet een week met een vaste startdag. Daaronder drie
  tellers: streak freezes, "wave streaks" en XP vandaag (0 van 30). Dan de gewoonte met eigen
  streak en een afvinkcirkel, en de groep met kettinglengte en ledenaantal.
- **Stats (s5):** over 30 dagen, 90 dagen, jaar of altijd. Een kalender "dagen dat je kwam
  opdagen" waarvan de kolommen op **zondag** beginnen, een verdeling over ochtend, middag,
  avond en nacht, en een teller "ceiling days". Een dag zonder check-in is een **lege, neutrale
  tegel**, niet rood of doorgestreept. Een legenda onderscheidt "Floor" van het plafond.
- **Weekstart (s13):** in de profielinstellingen een veld "Week Starts On", hier op zondag,
  naast een tijdzoneveld. De kalender op s5 begint op die dag. De rollende strook op s1 doet
  dat niet. **AFGELEID:** de weekstart stuurt hier de weergave (de kalender), en ik zie niet
  dat hij streaks of tellingen bepaalt. Dat is niet vast te stellen op deze afbeeldingen.
- **Streak freezes (s16, s17):** een eigen instellingenpagina. Ze werken zo, in eigen woorden:
  vanaf een reeks van zeven wordt na een gemiste dag 's nachts automatisch een freeze verbruikt,
  en één freeze dekt die dag in álle groepen. Heb je een kortere reeks, of kwam de freeze na de
  gemiste dag, dan toont de check-inpagina vanaf 08:00 de volgende dag een knop om gisteren
  alsnog te dekken. Je krijgt er één na je tweede check-indag, daarna verdien je er per 30
  check-indagen één bij; een betaald abonnement start met 3 (jaar) of 1 (maand). Maximaal 5.
- **Vakantiemodus (s16, s17):** tot 14 dagen pauze voor alle groepen tegelijk, met behoud van je
  streaks. Gemarkeerd met een ster (betaald, **AFGELEID** uit het symbool).
- **Pauze per groep (s14):** knoppen "Take a break" en "Leave huddle" naast elkaar, plus een
  dempknop die joins, gewoontewijzigingen, mijlpalen en samenvattingen stopt maar reacties en
  applaus op je eigen check-ins laat doorkomen.

## 14. De gewoonte en de groep — GEMETEN

- **Gewoonte met twee niveaus (s14):** een regel voor de vloer en een voor het plafond, met
  knoppen om te bewerken of te vervangen. Een oog-pictogram achter "Current Habit" wijst op een
  zichtbaarheidskeuze (**AFGELEID**, de werking niet gezien).
- **Groep (s1):** één gewoonte per groep, ledenaantal, een kettingteller en een uitnodigknop.
  De groep in de afbeeldingen heeft één lid; een groep met meerdere leden is **niet** gezien.
- **Feed (s2):** een globale lijst van check-ins van anderen. Per item: wie, bij welke groep (of
  "Solo"), een Join-link, applaus, reactie, delen, en per persoon een streak- en kettingcijfer.
  Een deel van de teksten is automatisch ("joined today").
- **Discover (s3):** mensen zoeken, uitnodigcode, leaderboards, Hall of Fame, bibliotheek,
  topgroepen (deels als "Sponsored" gemarkeerd, met ledenaantal, gewoonte en een zin over
  identiteit en doel), en een lijst van 184 open groepen.
- **Profiel (s4):** publiek profiel met dagstreak, beste streak, aantal ingecheckte dagen, aantal
  groepen, freeze-tegoed, en tabs voor check-ins, groepen, stats en trofeeën. De trofeeëntab is
  niet gezien.

## 15. Beloningslaag en commercie — GEMETEN

- **Achievements (s6, s7, s9, s10):** groepen per soort: streak-mijlpalen (eerste check-in tot
  een jaar), totaal aantal check-ins (5 tot 750), sociaal (applaus geven, reageren),
  groepen (meedoen, aanmaken, ledenaantal van je eigen groep: 5, 10, 25), tijdstip (vóór 07:00,
  na 23:00), een geheime groep (een freeze gebruiken) en "Bonus" zonder XP. Elk heeft een
  zeldzaamheidsniveau en XP; een behaalde toont de datum en een deelknop.
  Een deel hangt aan abonnees: een Pro-lid laten joinen, drie Pro-leden in je groep.
- **Style Studio (s8, s11, s12, s15):** cosmetica per onderdeel (profielflair dat elke bezoeker
  ziet, check-inconfetti, avatarkader dat iedereen in feed en leaderboards ziet, achtergrond
  achter de check-inkaart, groepsbanners). Bijna alles is vergrendeld op een abonnementsniveau.
- **Abonnement (s18):** drie niveaus: een middenniveau voor jezelf; een aanbevolen niveau
  waarin elke groep die je start betaald wordt plus drie waar je lid van bent; en een
  hoogste niveau voor jezelf en tien anderen met "claim links". Het aanbod toont een
  proefperiode voor nul euro; prijzen zijn op de afbeelding niet te zien.
- **Meldingen (s19):** push (op dit apparaat uit, met een knop om aan te zetten) en e-mail.
  Persoonlijke interacties (reacties, applaus, vermeldingen, directe berichten, "nudges en
  waves", uitnodigingen) en groepsactiviteit (gewoontewijzigingen, check-ins in je groepen
  alleen als push met maximaal één per groep per dag plus een melding bij een "full house",
  mijlpalen, een wekelijks overzicht). Het onderste deel van de pagina is niet gezien.

## 16. Overdraagbaarheid van het ingelogde deel

| Mechanisme | Overdraagbaar | Toets aan de domeinregels |
|---|---|---|
| Lege neutrale tegel voor een dag zonder check-in | **Ja, bevestigt** | Regel 7 voor je eigen overzicht: geen rood, geen "gemist". Wij tonen de week; dezelfde neutraliteit voor een gemiste week. |
| Dempen van groepsgeluid met behoud van directe steun | **Ja** | Past bij regel 7; verandert niets aan wat de groep over jou ziet. |
| Pauze los van weggaan | **Ja** | Raakt `shared/time` (regel 1) als het over perioden gaat. De pauze moet de wekelijkse klok respecteren. Wat het voor de groep betekent is een eigen besluit (regel 7). |
| Automatische bescherming bij een gemiste dag, met een achteraf-venster | **Voorwaardelijk** | Onze weekpas bestaat al (regel 10: beschermt de reeks, niet het punt). Het achteraf-venster tot de volgende ochtend is een idee om te overwegen; de automatiek vraagt een besluit, omdat een straf of gevolg nooit stilzwijgend gaat (regel 5). |
| Weekstart als instelling | **Bestaat al, sterker bij ons** | Regel 1: bij ons stuurt hij tellingen en weekafsluiting, bij hen (aantoonbaar) de kalender. |
| Vloer en plafond als twee zichtbare regels per gewoonte | **Ja, bestaat al** | Regel 8. |
| Prestaties op totaal aantal voltooiingen | **Voorwaardelijk** | Alleen op de week als eenheid en alleen positief; geen prestaties op een verbruikte freeze of weekpas, want dat maakt een gemiste week afleidbaar (regel 7). |
| Prestaties of kaders die aan betaalde leden of groepsgrootte hangen | **Nee** | Commerciële prikkel op een groepsoppervlak; grens 1 en geen geld (regel 5). |
| Flair, kaders en banners die iedereen ziet | **Nee** | Commercieel oppervlak zonder doel; nieuw groepsoppervlak, dus beschermd (regel 7). |
| Globale feed, Discover, leaderboards, Hall of Fame, sponsored groepen | **Nee** | PRD sluit publieke groepen uit; regel 7 en QS8-230. |
| Meldingen met een melding bij een "full house" | **Ja** | Alleen positief; één per groep per dag is een nette rem. |
| Meldingen "nudges en waves" | **Niet te toetsen** | Zie §17: wat dit doet en voor wie het zichtbaar is, is niet gezien. Tot dan geen overname. |
| Betaaltiers met proefperiode | **Nee** | Grens 1. |

## 17. Wat ik niet kon meten

- **De check-in zelf**, ook de flexibele (vloer of plafond kiezen), en wat erna op het scherm
  gebeurt. Dit is het kernmoment en het ontbreekt.
- **Een gewoonte aanmaken**, **het opgeslagen plan** met de bewaarlijst, en **de Checkin Chain**
  als scherm.
- **Een groep met meerdere leden**, de ledenlijst, uitnodigen en toetreden (alleen een groep
  van één lid en de knop "Invite").
- **Nudges en waves**: wat de handeling is, wie het ziet, en of het iets zegt over wie niet
  heeft ingecheckt. Dat is precies wat domeinregel 7 raakt.
- De **trofeeëntab**, **Plan & Billing** (prijzen), de **leaderboards**, de **Hall of Fame**, de
  **bibliotheek**, de rest van de meldingenpagina en **Connected Accounts**.
- **Seizoenen** (hun maandelijkse standen): alleen genoemd in de meldingstekst ("season results").
- Of de **weekstart** iets anders stuurt dan de kalender.
- Of een groepsgenoot kan zien dat **een freeze is ingezet**, wat op de achievements-pagina als
  prestatie bestaat.

## 18. Volgende afgebakende stap

Niet de hele lijst. Eén afgebakend issue ligt voor de hand: **bescherming bij een gemiste week**
(het gedrag van onze weekpas naast de freeze-regels van Habit Huddle, §13), omdat het scherm
daarvoor het volledigst is. De open vraag voor Quinten: levert hij nog schermafbeeldingen van
de check-in (flexibel), de gewoonte aanmaken, nudges en een groep met meerdere leden? Zonder
nudges geen oordeel erover.

## 19. Aanvulling 18-11-2026: Discover in detail (s20) en de grens van wat Quinten kan tonen

**Wat Quinten meldt (niet door mij gecontroleerd):** hij kan de schermen van nudges en van de
flexibele check-in niet maken, omdat hij geen betaald account heeft. Dat past bij rij 1 en 2 in §0,
die daarmee op "niet zichtbaar zonder betaald account" staan, niet alleen "zonder account".
Ik leid daar niet uit af dat nudges of de flexibele check-in betaald zijn; het is wat hij ziet.

**Wat s20 laat zien (GEMETEN, schermafbeelding + zijn uitleg).** Een scherm van Discover, uitgebreider
dan s3:
- Een **groepenlijst met rangorde** (topgroepen met kettinglengte), waarvan een deel een label
  "sponsored" draagt, en een **community-lijst** met "176 groepen om aan mee te doen".
- Per groep op de lijst: een naam, de gewoonte, een zin over wie de groep wil zijn (identiteit), een
  doelzin, het ledenaantal, een label "looking for members" en een knop om mee te doen.
- Een **consistentiepercentage per groep** op de community-lijst (in het voorbeeld uiteenlopend,
  van 45 tot 100 procent) en een kettingteller.
- De lijst verschilt van s3: de kettingcijfers bij de topgroepen zijn anders. De lijst is dus
  levend en er is geen vaste rangorde.

**AFGELEID:** het consistentiepercentage is een groepsgemiddelde dat aan **iedere bezoeker** getoond
wordt, niet alleen aan leden. Een percentage onder de honderd betekent dat er dagen gemist zijn,
ook al noemt het scherm geen persoon. Dat is een afgeleide naam-loze versie van "wie faalt".

**Overdraagbaar?**
| Mechanisme | Overdraagbaar | Toets |
|---|---|---|
| Groepskaart met gewoonte, identiteitszin en doelzin | **Voorwaardelijk** | Alleen binnen een eigen of uitgenodigde groep; een publiek overzicht is uitgesloten (PRD, QS8-230). De opbouw van de kaart (gewoonte, wie wil ik zijn, doel) past wel bij onze doelen. |
| Consistentiepercentage per groep, publiek | **Nee** | Regel 7: een publiek getal onder 100 maakt gemiste dagen afleidbaar. Een teller die alleen oploopt (de Ketting) is wel toegestaan. |
| Rangorde van groepen, "sponsored", "looking for members" | **Nee** | Commercieel oppervlak en publieke ontdekking (regel 5 en QS8-230). |

**Volgende stap voor dit bestand:** niets nieuws meten zonder meer materiaal. Voor rij 1 en 2 in §0 zijn er
twee wegen: Quinten vindt een betaald account de moeite waard (grens 1: dat is een besluit dat hem
geld kost), of die rijen blijven bewust ongemeten, en nudges worden niet overgenomen.
