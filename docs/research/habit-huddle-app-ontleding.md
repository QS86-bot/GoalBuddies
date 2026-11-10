# Habit Huddle — ontleding van de app (onder /app)

> Status 10-11-2026: het **publieke deel** is ontleed (de aanmeldflow op `/app/start`),
> na een bewuste keuze van Quinten tegen de voorwaarden in (§2). Het **ingelogde deel**
> is niet gedaan en wacht op schermafbeeldingen van Quinten (§6).
> Aanvulling op `docs/research/habit-huddle-teardown.md` (publieke pagina's, 15-08-2026).
> Alle beschrijvingen zijn in eigen woorden; niets van hun tekst, code of beeld staat in de repo.

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

Niet gemeten (dus niets hierover is in dit document geschreven): de stappen, vragen en volgorde
van `/app/start`; alles onder `/app`; de netwerkaanroepen; huddles, check-ins, de chain,
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

Quinten besluit (a) of hij het materiaal uit §4 aanlevert, en (b) of hij Habit Huddle om
schriftelijke toestemming voor onderzoek wil vragen. Zonder (a) is er geen ingelogd werk te doen;
zonder (b) blijft elke geautomatiseerde stap uitgesloten.

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
