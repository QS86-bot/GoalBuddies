# Habit Huddle — ontleding van de app (onder /app)

> Status 10-11-2026: **onderdeel 1 en 2 (automatisch lezen van /app/start, REA) niet uitgevoerd**,
> omdat de voorwaarden van Habit Huddle geautomatiseerde toegang verbieden. Zie §1.
> Dit bestand legt vast wat er gemeten is, waarom er gestopt is, en wat Quinten kan
> aanleveren om verder te komen. Aanvulling op `docs/research/habit-huddle-teardown.md`
> (publieke pagina's, 15-08-2026); dat werk is niet herhaald.

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

## 2. Besluit — AFGELEID

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
