# Business tips van sprekers: onderzoek voor de app

> Onderzoek van 19-11-2026. Vraag van Quinten: hoe laten we korte, regelmatige
> businesstips tevoorschijn komen bij doelen in de categorie *business*, gebaseerd
> op de tactieken van een aantal sprekers.
>
> **Dit document is een onderzoek en geen besluit.** Er is geen code veranderd.
> Wat een aanname is, staat als aanname opgeschreven, met wat wél gemeten is
> ernaast.

## 0. De stand in tien regels

1. **Eén van de drie sprekers is vastgesteld: Daniel Priestley** (door Quinten
   bevestigd; "Daniel Christ" in de vraag was dus Daniel Priestley).
2. **"Daan Smit" en "Veronique Prins" zijn niet geïdentificeerd.** Een zoekronde
   gaf geen businessspreker onder die namen. Er is niets over hen onderzocht en
   dus ook niets verzonnen. Zie §2.
3. **Priestleys kaders zijn te destilleren tot vijf bruikbare tactieken** voor
   een gebruiker met een business-doel (§3).
4. **Letterlijke tekst hergebruiken mag niet zomaar.** De gebruiksvoorwaarden
   van Dent Global (§7 *Intellectual Property*) verbieden kopiëren, aanpassen,
   verspreiden en exploiteren van onder meer "text, video, audio, slides,
   frameworks, methodologies, branding, and trademarks" (§4).
5. **Daarom is de gekozen vorm: eigen tips, in eigen woorden**, geïnspireerd
   door de tactiek. Dat is de keuze die Quinten maakte; §4 zegt wat ze wel en
   niet oplost.
6. **De app heeft al een `business`-weektip-set** (`weektip.business.1` t/m `.5`,
   `src/shared/ui/tips.ts`). Nieuwe tips sluiten daar het best op aan en zijn
   geen nieuw systeem (§5).
7. **Geen AI-call per gebruiker.** Een vaste set blijft het antwoord
   (onwrikbare regel 6, besluit A48).
8. **Acht conceptteksten staan klaar** in §6, alle acht door de
   tegenvaller-zeef gehaald.
9. **Wat niet gemeten is**: Priestleys eigen boeken zijn niet gelezen, alleen
   zijn sites en samenvattingen van anderen (§1).
10. **Wat ik van Quinten nodig heb**: wie Smit en Prins zijn, en of er PDF's
    zijn (§8).

## 1. Wat gedaan is en wat dat waard is

| Bron | Wat het is | Gelezen? | Gewicht |
|---|---|---|---|
| `danielpriestley.com` (home) | Eigen site van de spreker | Ja, via `curl` | Primair, maar vooral marketing |
| `dent.global` (home, about, resources, **terms-of-service**) | Zijn bedrijf | Ja, via `curl` | Primair |
| ManageMagazine, *How to Become a Key Person of Influence According to Daniel Priestley* | Artikel van een derde | Ja, volledig | **Secundair**: interpretatie, niet de bron |
| Samenvattingen van *Oversubscribed* en *24 Assets* (Blinkist, Shortform, blogs) | Commerciële samenvattingen | Alleen de zoekresultaten, niet de pagina's | **Zwak** |
| Podcastomschrijvingen (Diary of a CEO e.a.) | Titels en blurbs | Alleen de blurbs | **Zwak** |
| Zijn boeken zelf | | **Nee** | Ontbreekt |

⚠️ **De grootste beperking:** het onderzoek rust op secundaire bronnen. Een
specifiek getal in een secundaire bron kan van de samenvatter komen en niet van
Priestley (zie §3, kolom *Zekerheid*). Wie dit leest als "Priestley zegt X",
leest meer dan er gemeten is.

📏 **Praktisch:** `WebFetch` kon de sites in deze sessie niet bereiken
(`getaddrinfo ENOTFOUND`), `curl` via de proxy wel. De paginatekst is daarom
met `curl` opgehaald. Vijf hosts moesten bovendien op de allowlist van de
omgeving `goalbuddies-marktbronnen`: `www.dent.global`, `www.danielpriestley.com`,
`www.managemagazine.com`, en na een redirect ook `dent.global` en
`danielpriestley.com`. Dat is een persoonlijke omgeving en alleen leesverkeer.

## 2. De twee sprekers die niet gevonden zijn

Gezocht op *"Daan Smit spreker ondernemer business tips"* en *"Veronique Prins
spreker ondernemer"*. Er kwam geen spreker onder die namen uit. De
dichtstbijzijnde treffers waren andere mensen:

- **Meiny Prins** (CEO Priva), geen Veronique.
- **Kenneth Smit**, **Piet Hein Smit**, **Daan Schmidt** (StoryBrand-podcast).

Niets hiervan is bevestigd als de bedoelde persoon, en ik heb er niets over
opgeschreven. De spelling kan afwijken, of het gaat om sprekers met weinig
publiek vindbaar materiaal. Dat laatste is voor dit onderzoek een probleem op
zich: **zonder een leesbaar bronnenpakket is er geen tactiek te destilleren.**

## 3. Daniel Priestley: kaders en tactieken

Priestley (Dent Global, ScoreApp, Key Person of Influence) schreef volgens zijn
eigen site zeven businessboeken. De sites noemen onder meer *Key Person of
Influence* (2014), *Oversubscribed*, *24 Assets*, *Lifestyle Business Playbook*
en *Scorecard Marketing*. Dent beweert *"5000+ Business Owners"* te hebben
geholpen. Dat is een marketingbewering op zijn eigen site, niet getoetst.

| # | Kader / tactiek | Kern in één zin | Bron | Zekerheid |
|---|---|---|---|---|
| 1 | **Micro-niche** | Domineer een smal terrein in plaats van een brede markt. | ManageMagazine | Kader klopt met alle bronnen; *"binnen 12 maanden te winnen"* komt alleen uit dit artikel |
| 2 | **Pitch (P1)** | Zeg voor wie je werkt, welk probleem je oplost en wat het oplevert. | ManageMagazine | Kader is breed bevestigd; de **zinsformule** *"I work with … to solve … so that they can …"* is de uitwerking van de artikelschrijver |
| 3 | **Publish (P2)** | Zet je ideeën op een openbaar spoor, ideaal uiteindelijk in een boek. | ManageMagazine | Kader bevestigd; *"10 tot 12 opinion pieces"* komt alleen uit dit artikel |
| 4 | **Product (P3)** | Ontkoppel tijd en inkomen met een aanbod van instap tot vlaggenschip. | ManageMagazine | Kader bevestigd; *"5 tot 7 stappen"* alleen uit dit artikel |
| 5 | **Profile (P4)** | Word zichtbaar bij de juiste duizend mensen, niet bij iedereen. | ManageMagazine | Kader bevestigd; *"12 maanden, één gastoptreden per maand"* alleen uit dit artikel |
| 6 | **Partnership (P5)** | Werk samen met mensen die al hebben wat jij nog opbouwt. | ManageMagazine | Kader bevestigd; *"Power List van 10 tot 20"* alleen uit dit artikel |
| 7 | **Volgorde van de vijf P's** | De stappen horen in volgorde: Profile bouwen zonder Pitch is zinloos. | ManageMagazine | Eén bron zegt dit expliciet |
| 8 | **Oversubscribed** | Laat vraag groter worden dan aanbod; een wachtlijst is een teken van waarde, geen probleem. | Samenvattingen (Blinkist, Shortform, blogs) | Zwak: alleen secundair, boek niet gelezen |
| 9 | **24 Assets** | Waarde zit in een ecosysteem van assets en niet in één factor; kies je twee kernassets. | Samenvattingen | Zwak: alleen secundair |
| 10 | **Scorecard-marketing** | Een korte vragenlijst laat zien wie klaar is om te kopen. | `dent.global` home | Primair, maar als productbeschrijving van ScoreApp |
| 11 | *"7-11-4"* en de *"90-dagenregel"* | Alleen als **titel** van een podcastaflevering gezien. | Podcastblurb | **Niet onderzocht en niet bruikbaar** zonder de inhoud |
| 12 | *"Lage verwachtingen als geheim van succes"* | Eén samenvatting zegt dit. | Podcastblurb | **Te zwak om op te bouwen** |

📏 **De les uit kolom 4:** de getallen en formules die er het concreetst uitzien
zijn in dit onderzoek net degene die het minst zeker zijn. Een tip die
*"schrijf er twaalf"* zegt en die aan Priestley toeschrijft, belooft iets wat
alleen een artikel van een derde zegt.

## 4. Rechten: wat mag en wat niet

**Wat de bron zelf zegt.** De *Terms of Service* van Dent (§7) zeggen dat alle
inhoud, *"text, video, audio, slides, frameworks, methodologies, branding, and
trademarks"*, eigendom is van of in licentie is bij Dent Accelerators UK
Limited. Verboden is onder meer *"copy, modify, distribute, resell, or exploit
our content"*, en het opnemen of reproduceren van webinars zonder schriftelijke
toestemming. Toegestaan is *"limited personal, non-commercial use"*.

**Wat dat betekent voor de drie vormen die we overwogen:**

| Vorm | Risico | Oordeel |
|---|---|---|
| Letterlijke zinnen uit boeken, webinars of de site in de app | Hoog: kopiëren en exploiteren van beschermde tekst, in een commerciële app | Alleen met toestemming |
| Korte letterlijke citaten uit openbare uitingen, met bron | Middel: in veel rechtsstelsels is een kort citaat toegestaan, maar de voorwaarden van deze sites zijn strenger geformuleerd en een app is commercieel | Niet zonder jurist |
| **Eigen formulering van een idee** | Laag: een idee of werkwijze is als zodanig doorgaans niet auteursrechtelijk beschermd, de tekst ervan wel | **Gekozen vorm** |

⚠️ **Wat eigen formulering níet oplost, en dat zijn twee dingen:**

1. **Handelsmerken en kadernamen.** *Key Person of Influence* en *KPI* als
   merk, en wellicht de namen van de vijf P's als geheel, zijn marketingmerken
   van Dent. Een tip die zegt *"Volg de Key Person of Influence-methode"* gebruikt
   hun merk. Een tip die alleen het idee noemt (*"kies een smalle markt"*) niet.
2. **Het noemen van zijn naam.** *"Geïnspireerd door Daniel Priestley"* in de
   app suggereert dat hij de app kent of steunt. Zijn naam gebruiken is een
   eigen keuze, geen formaliteit, en hij valt onder de vraag van §8.

📏 **Dit is een lezing van de voorwaarden en geen juridisch advies.** De
bestaande vragenlijst voor een jurist, `docs/research/vragen-voor-de-jurist-organisaties-en-teamdoelen.md`,
gaat over een ander onderwerp; de rechtenvraag hier hoort er als aparte vraag bij
als Quinten letterlijke citaten wil.

## 5. Hoe tips tevoorschijn komen: het ontwerp past op wat er al is

**Wat er bestaat** (`src/shared/ui/tips.ts`, besluit A48):

- `TIP_SETS = lichaam, mensen, werk, business, study, other`.
- Een **vaste set** per categorie, gekozen via `tipSetVoor(categorie)` en
  getoond via `weektip(categorie, cycleStart)` en `tipVoorWeek()`.
- Een zeef, `noemtTegenvaller()`, die elke tip weigert die een tegenvaller noemt
  (twee implementaties, TypeScript en SQL, die gelijk moeten blijven).
- `weektip.business.1` t/m `.5` bestaan al en gaan over **de week die je net
  gehaald hebt**.

**Het ontwerpprobleem.** A48 koos er bewust voor om *geen* wijze quotes te
tonen. Willekeurige wijsheid leest binnen drie weken als opvulling, en de kans
dat een spreuk past bij "ik heb mijn offerte de deur uit" is klein. Een
businesstip van een spreker valt precies in die val als hij los van het moment
verschijnt.

**Daarom: de tip hangt aan het moment en niet aan de spreker.**

| Moment | Welke tactiek past | Waarom daar |
|---|---|---|
| Een business-doel wordt aangemaakt | Micro-niche, Pitch | De gebruiker staat op het punt het doel scherp te zetten |
| Een mijlpaal over aanbod, content of partners wordt afgerond | Product, Publish, Partnership | De tip past bij wat net gebeurde |
| Eind van de week (de bestaande weektip) | Oversubscribed, Scorecard | Algemener, mag overal passen |

**Regelmaat.** Quinten noemt "een bepaalde regelmaat". Het voorstel is de
bestaande: **één tip per cyclus** via `tipVoorWeek()`, plus één op de twee
momenten hierboven. Dat blijft binnen wat A48 al kent en voegt geen nieuw
meldingskanaal toe.

**Wat vastligt en dus niet verandert:**

- **Geen AI-call per gebruiker.** Bij 100k gebruikers is een tip per gebruiker
  per week 100k calls per week (onwrikbare regel 6). De Doelcoach-tip per
  mijlpaal bestaat al; de vaste set blijft de terugval.
- **Geen emoji in app-tekst** (`npm run emoji:controle`).
- **Elke tip door `noemtTegenvaller()`**, en een test die dat vasthoudt.
- **Domeinregel 7.** Een tip noemt nooit een gemiste week, ook niet zacht.
- **Twee talen.** Sleutels in `nl.ts` en `en.ts`, voluit en niet samengesteld;
  `catalogus:controle` bewaakt dit.
- **Een tip zonder vervolg.** Een tip die zegt *"stel drie vragen en volg
  degene op"* vraagt iets van de gebruiker. Hij hoort bij een moment waarop dat
  past, niet in de weektip.

⚠️ **Wat dit niet is:** geen nieuw datamodel, geen nieuwe tabel, geen RLS. Het
is tekst in de catalogus, met een regel in `TIP_SETS` of een extra rij per
moment. Raakt het ontwerp later de database (bijvoorbeeld "deze tip is al
getoond"), dan is dat een eigen issue met de vragen van onwrikbare regel 17.

## 6. Conceptteksten

Alle acht in eigen woorden, positief van toon, zonder tegenvaller, zonder
emoji, en **getoetst tegen `TEGENVALLER_WOORDEN`**: geen treffer. Lengte 94 tot
140 tekens. Ze zijn een startpunt voor Quinten, geen definitieve tekst.

| # | Tekst | Past bij | Gebaseerd op | Zekerheid van de bron |
|---|---|---|---|---|
| T1 | Zeg in één zin voor wie je werkt, welk probleem je oplost en wat het hen oplevert. Roept die zin geen vervolgvraag op, maak hem dan smaller. | Doel aanmaken | Pitch | Kader breed bevestigd |
| T2 | Een smalle markt win je sneller dan een brede. Kies het stuk waar je binnen een jaar de bekendste kunt zijn. | Doel aanmaken | Micro-niche | Kader breed bevestigd; "een jaar" alleen uit één artikel |
| T3 | Wat je opschrijft blijft voor je werken als je zelf even iets anders doet. Zet vandaag één idee uit je hoofd op papier. | Mijlpaal content | Publish | Kader bevestigd |
| T4 | Bied iets kleins aan om mee te beginnen en iets groters om naartoe te groeien. Dan hoeft niemand in één keer te beslissen. | Mijlpaal aanbod | Product | Kader bevestigd |
| T5 | Zoek iemand die al heeft opgebouwd wat jij nog bouwt, en begin met iets wat hun publiek helpt. | Mijlpaal partners | Partnership | Kader bevestigd |
| T6 | Laat vraag ontstaan voordat je levert. Een lijst met mensen die willen, is meer waard dan een product dat nog niemand kent. | Weektip | Oversubscribed | **Zwak**: alleen samenvattingen |
| T7 | Verkoop je alleen je uren, dan heeft je inkomen een plafond. Pak je werkwijze en maak er iets van dat zonder jou kan worden afgenomen. | Mijlpaal aanbod | Product | Kader bevestigd |
| T8 | Een korte vragenlijst laat zien wie klaar is voor jouw aanbod. Stel er drie en volg degene op die het hoogst scoort. | Mijlpaal aanbod | Scorecard-marketing | Primair, als productbeschrijving |

⚠️ **T6 rust op samenvattingen en staat er daarom met een waarschuwing.** Lees
het boek of laat hem weg. **Er staat geen tip in die een getal of formule uit
de secundaire bron overneemt** (geen "twaalf artikelen", geen "tien tot twintig
partners"), juist omdat die getallen niet bij Priestley vandaan zijn te halen.

## 7. Wat dit nog niet is

- **Geen tweede en derde spreker.** Zonder namen of bronnen is er niets te
  destilleren (§2).
- **Geen boeken gelezen.** Twee van de zes kaders rusten op samenvattingen.
- **Geen toets op "werkt dit?"** Of een tip een gebruiker echt aanzet om door te
  gaan, is niet te weten zonder meting met echte gebruikers. Het PRD zegt
  over positionering en voorbeelden dat die pas na meting met echte gebruikers
  volgen. Dat geldt hier ook.
- **Geen juridische toets** van mijn lezing van §4.

## 8. Wat ik nodig heb, en wat de volgende stap is

**Vragen aan Quinten:**

1. **Wie zijn "Daan Smit" en "Veronique Prins"?** Een link naar hun website,
   LinkedIn, podcast of boek volstaat.
2. **Bronnenpakket.** Zet de PDF's in een nieuwe map `docs/research/bronnen/` in de
   repo (die map bestaat nog niet). Ik kan ze lezen zodra ze er staan. Een aparte PDF-app is niet nodig.
3. **Noemen we namen in de app?** (Zie §4, punt 2.) De veilige route is
   geen naam, alleen de tip. Wil je de naam wel, dan is toestemming van de
   spreker de schone weg. Dat is jouw beslissing en geen technische.
4. **T6 en T8: houden of schrappen?** T6 rust op zwakke bronnen.

**Volgende afgebakende stap**, zodra 1 en 2 beantwoord zijn: een uitwerking
van de vaste set in `tips.ts` met een eigen Linear-issue (claimen met
`npm run claim`), een spec van `spec-planner`, en de vragen van onwrikbare
regel 18 voor de naad tussen tip en moment.

## Bronnen

- `https://danielpriestley.com/` en `https://dent.global/` (home, about, resources)
- `https://dent.global/terms-of-service` (§7 Intellectual Property)
- ManageMagazine, [How to Become a Key Person of Influence According to Daniel Priestley](https://www.managemagazine.com/article-bank/leadership/how-to-become-a-key-person-of-influence-according-to-daniel-priestley/)
- Samenvattingen van *Oversubscribed* en *24 Assets* (Blinkist, Shortform, blogs):
  alleen gezien als zoekresultaat, niet gelezen
- Podcastblurbs rond Priestleys Diary of a CEO-aflevering: alleen als blurb gezien
