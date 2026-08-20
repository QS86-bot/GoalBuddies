# Antwoord op de groene notities

> Quinten heeft in `docs/GoalBuddies — spelregels en motivatie.docx` vijftien
> passages groen gemarkeerd. Dit bestand loopt ze alle vijftien langs, zegt per
> stuk wat ik ermee gedaan heb, en geeft antwoord op de vragen die aan mij
> gesteld zijn.
>
> **Opgesteld:** 20-08-2026.

---

## 0. Waar het groen staat, en waar niet

Eerst een correctie op de opdracht, want hij verandert wat er te doen valt.

**`Q-TODO.docx` bevat geen groene tekst.** Ik heb het bestand uitgepakt en alle
tekstkleuren geteld: `000000`, `FFFFFF`, `141E3C` (navy) en `55607A`
(grijsblauw). Ook geen groene arcering, geen groene celvulling, geen groene
themakleur. De arceringen zijn `141E3C`, `EEF0F5` en `FDF3E0`.

Al het groen — 64 tekstfragmenten in kleur `00B050` — staat in **`GoalBuddies —
spelregels en motivatie.docx`**, verdeeld over vijftien alinea's.

Ze vallen uiteen in drie soorten, en die soorten vragen om verschillende
behandeling:

| Soort | Alinea's | Wat ik ermee gedaan heb |
|---|---|---|
| **A. Instemming en verduidelijking** | 7, 8, 125 | Verwerkt als tekstvoorstel — §1 |
| **B. Bezwaar tegen een vastgelegde regel** | 9, 55, 57, 129 | **Niet uitgevoerd.** Besluit nodig — §2 |
| **C. Vragen aan mij en nieuwe ideeën** | 75, 76, 143–151 | Beantwoord en omgezet in issues — §3 en §4 |

---

## 1. Soort A — instemming, met één verduidelijking die klopt

Drie notities zijn geen vraag maar een aanvulling in de kantlijn. Alle drie
kloppen met wat er gebouwd is, en alle drie maken de tekst beter:

* **p7** — *"Jij kan zelf aangeven dat jij jouw weekdoel hebt gehaald en
  vervolgens kunnen jouw buddies dit bevestigen."* Klopt precies, en het is een
  nuttige aanvulling: de regel "een buddy bevestigt je week, jij niet" leest
  anders alsof jij zélf niets mag aangeven. Je dient in, een ander bevestigt.
* **p8** — *"Wanneer je niet gewerkt hebt aan jouw weekdoelen, dan heb je dus
  geen voortgang."* Klopt. Voortgang staat stil, hij gaat niet omlaag; de punten
  gaan wél omlaag. Dat is nu juist het verschil tussen de twee balken.
* **p125** — *"Kleine stapjes is beter dan geen progressie."* Dat is de zin
  waarmee die alinea had moeten eindigen.

**Aanbeveling:** neem alle drie op in het spelregels-document als lopende tekst.
Ik heb ze niet zelf ingevoegd, omdat dat document jouw stem is en geen
codeartefact.

---

## 2. Soort B — vier notities die tegen een vastgelegde regel in gaan

Dit is de kern van de opdracht en hier ben ik gestopt. Vier notities vragen om
iets dat botst met een regel die in `CLAUDE.md` staat, in
`docs/decisions/002-domeinregel7-oppervlakken.md` is onderbouwd, en in de
database met tientallen migraties is afgedwongen. Ik heb ze **niet uitgevoerd**
en ik licht per stuk toe waarom, met de prijs van beide kanten.

Je bent de producteigenaar en je mag deze regels veranderen. Maar niet zonder
dat je weet wat eraan hangt — en zeker niet doordat ik een aantekening in een
Word-bestand als opdracht lees.

### 2a. p9 en p129 — "de groep mag ook zien wat er fout gaat"

Je schrijft het twee keer, en de tweede keer met een argument:

> *"De groep mag ook zien wat er fout gaat, want dan kunnen ze die persoon
> accountable houden, interesse tonen, vragen stellen waarom en motiveren om
> verder te meer inzet te tonen."* (p9)

> *"Sociale druk moet inderdaad van de goede kant komen, maar wanneer iemand
> anders ook jouw tegenslagen kan zien, kan hij juist helpen door vragen te
> stellen, te motiveren en tips te geven."* (p129)

**Dit is de omkering van domeinregel 7**, de regel die `CLAUDE.md` "de
belangrijkste regel" noemt. Wat eraan hangt:

* **Vier migraties in deze week alleen.** 0043 t/m 0046 dichtten vier routes
  waarlangs een gemiste week uit de groep te houden was. Daarvoor 0019, 0020,
  0023. De hele kolomstructuur van `weekly_goals` staat er nu op.
* **De allowlist `chat_messages_system_event_bekend`** laat uitsluitend positieve
  gebeurtenissen door, in de database én in `src/modules/buddies/chat-schemas.ts`,
  met een test die de twee gelijkstelt.
* **`points_ledger` is privé** juist omdat een dalend totaal een gemiste week
  verraadt.
* **Het verbod op `REPLICA IDENTITY FULL`** op drie realtime-tabellen bestaat
  alleen om deze reden.

Je argument is niet gek — het is precies het argument waar Habit Huddle op
gebouwd is. En de teardown in `docs/research/habit-huddle-teardown.md` noemt
juist dát als de vondst waarom die app in kleine groepen doodloopt: in een groep
van drie vrienden doodt één schaamtemoment de hele groep. Dat is de reden dat de
regel er staat.

Er zit bovendien een spanning in je eigen twee notities. In p129 schrijf je
"sociale druk moet inderdaad van de goede kant komen" — en de zin ervoor legt uit
dat dat alleen werkt als je bevestiger je tegenslag níét ziet, want anders wordt
hij een controleur. Je beaamt de premisse en trekt de omgekeerde conclusie.

**Waar het middenveld al ligt.** Er zijn nu al drie routes waarlangs tegenslag de
groep bereikt, en alle drie lopen via jou zelf: vraag 2 van de weekafsluiting,
de knop "vraag je groep om hulp" van de Risico-radar (QS8-95), en het verzoek om
je streefdatum te verschuiven (A7). Plus drie benoemde verruimingen die je op
18-08 zelf besloten hebt: de groep ziet je reeks (A15), je risicostatus (A17) en
je deadline-verschuiving (A7).

Met andere woorden: **de groep kan je al helpen bij tegenslag — jij drukt op de
knop.** Het verschil tussen wat er nu staat en wat p9 vraagt is niet "hulp ja of
nee", maar "wie besluit dat je groep het ziet".

**Drie varianten, met de prijs erbij:**

| | Wat het is | Kosten |
|---|---|---|
| **1. Laten zoals het is** | De gebruiker deelt zelf; drie routes bestaan al | Niets. Wel: p9 en p129 blijven onbeantwoord in het document |
| **2. Opt-in per groep** | Bij het aanmaken van een groep kies je "open" of "beschermd". In een open groep zien leden elkaars gemiste weken | Fors. RLS moet per groep gaan variëren op een kolom die nu categorisch dicht zit; de allowlist krijgt een tweede tak; beslisdocument 002 moet volledig herzien. Schat: één epic |
| **3. Regel 7 afschaffen** | De groep ziet alles | Zeer fors, en het maakt de vier migraties van deze week zinloos |

**Mijn advies is variant 1, en anders 2 — nooit 3.** Variant 2 houdt de
bescherming als standaard en maakt het zichtbaar maken een bewuste keuze van de
hele groep vooraf, niet van het systeem achteraf. Dat is dezelfde vorm als
commitment devices (domeinregel 5): een consequentie is toegestaan zolang hij
expliciet vooraf bevestigd is.

**Ik heb hier niets aan gedaan en wacht op je besluit.**

### 2b. p55 — "waarom zou je de punten privé houden? Is het niet competitiever?"

> *"Waarom zou je de punten privé houden? Is het niet competitiever om het
> puntentotaal in de groep te delen?"*

Ja, het is competitiever. En het is het directe gevolg van 2a, niet een losse
keuze: een puntentotaal dat daalt is zichtbaar bewijs van een gemiste week. Wie
het totaal deelt, deelt het missen — alleen met een omweg.

Dat staat zo in domeinregel 10 in `CLAUDE.md`, en het is de reden dat
`points_ledger` alleen voor de eigenaar leesbaar is.

**Dit besluit hangt aan 2a en moet er samen mee genomen worden.** Kies je voor
open groepen (variant 2 hierboven), dan is een gedeeld puntentotaal daar
vanzelfsprekend. Kies je variant 1, dan blijft het privé — anders lek je via de
achterdeur wat je bij de voordeur tegenhoudt.

**Alternatief dat wél competitief is en niets lekt:** een groepsscore die alleen
optelt. De Ketting doet dit al. Een teller "deze groep heeft samen 47 weken
afgerond" gaat nooit omlaag en verraadt niemand.

### 2c. p57 — minpunten bij het zelfstandig verschuiven van een deadline

> *"Betaal je met punten wanneer je de deadline verschuift? Misschien is het een
> idee om minpunten in rekening te brengen wanneer je het zelfstandig zonder
> goedkeuring verschuift. En wanneer je de deadline met een door jouw buddies
> goedgekeurde reden verschuift, dat het dan geen punten kost?"*

**Dit is exact A29 uit `Q-TODO.docx`, en het is nog steeds open.** Daar staat het
zo: je schreef op 18-08 "wanneer de groep akkoord is, dan kost het je geen
punten", wat twee dingen kon betekenen. Ik heb variant (1) gebouwd — verschuiven
kán alleen mét akkoord, dus een straf is overbodig. Deze notitie vraagt om
variant (2): verschuiven mag altijd, zonder akkoord kost het een punt.

Nu is er een tweede stem voor (2), dus ik neem het serieus. Wat het kost:

* Een nieuwe reden in `points_ledger` — dat is een wijziging aan domeinregel 10 in
  `CLAUDE.md`, en die zegt met zoveel woorden dat het puntenmodel niet zonder jou
  verandert.
* `beslis_deadline_verzoek()` en het pad eromheen worden een stuk ingewikkelder:
  er komt een route "verschuif zonder te vragen" naast de bestaande.
* De rem verdwijnt. Nu blijft je datum staan als je buddy nee zegt. Bij (2) schuif
  je gewoon op en betaal je een punt — en een punt is goedkoper dan een gesprek.
  Dat is precies het gedrag dat A7 wilde tegengaan.

**Mijn advies: houd (1).** Niet omdat (2) fout is, maar omdat het de enige plek
in het model zou zijn waar je je uit een afspraak kunt kópen. Wil je (2) toch,
zeg het en ik bouw het — het is ongeveer een dag met migratie en tests.

---

## 3. Soort C, deel 1 — vragen die aan mij gesteld zijn

### 3a. p75 en p76 — wat zijn de cadeaus, en wat krijg je bij het halen van je week?

> *"Wat zijn de cadeaus? Extra punten en een goede business tip die bij jouw doel
> hoort?"* / *"En wat krijg je bij het behalen van je week? Een wijze quote van een
> legendarisch persoon zoals Einstein, Marcus Aurelius ofzo?"*

Wat er vandaag echt is: **één weekpas cadeau na je eerste voltooide week**, en
daarna één per zes voltooide weken (A32, maximum voorraad twee). Verder niets.
Het meervoud "cadeaus" belooft dus meer dan de app doet.

Op je twee voorstellen:

**Extra punten als cadeau: niet doen.** Punten zijn in dit model een meeteenheid,
geen valuta. Zodra er punten uit een andere bron dan je eigen weken bijkomen,
zegt het totaal niet meer wat het meet — en dan verliest ook het minpunt zijn
betekenis. Het puntenplafond per doel (domeinregel 10) is precies berekend als de
som van de plafondpunten van de weekdoelen; een bonus breekt die som.

**Een quote van Marcus Aurelius: doe dit heel voorzichtig.** Een willekeurige
wijsheid van een dood iemand is de goedkoopste vorm van beloning die er is, en
gebruikers herkennen dat binnen drie weken als opvulling. Erger: hij landt op het
moment dat het goed gaat, en de kans dat een stoïcijnse quote toevallig past bij
"ik heb mijn offerte de deur uit gekregen" is klein. Slecht getimede wijsheid
voelt als een preek.

**Wat ik in plaats daarvan zou doen — jouw eigen eerste idee is het sterkste.**
*"Een goede business tip die bij jouw doel hoort"* is precies goed, en het is de
enige beloning in dit rijtje die de app iets laat doen wat een andere app niet
kan: er is een Doelcoach die je doel, je mijlpalen en je weekdoelen kent.

Concreet voorstel, in drie lagen:

| Moment | Wat je krijgt | Waarom |
|---|---|---|
| **Week gehaald (plafond of vloer)** | Een korte, specifieke tip die op je eigen volgende mijlpaal slaat, gegenereerd door de Doelcoach | Het bewijst dat de app meekijkt. Kost een AI-call, dus cachen per mijlpaal en niet per gebruiker |
| **Mijlpaal gehaald** | Het feestelijke moment van QS8-76, plus de terugblik "dit heeft zes weken geduurd" | Een mijlpaal is zeldzaam genoeg om iets groters te verdienen |
| **Zes weken op rij** | De weekpas, zoals nu | Dit werkt al |

Twee harde randvoorwaarden bij die tip, en ze volgen uit regels die er al staan:

* **Elke AI-call kost geld** (onwrikbare regel 6). Een tip per gebruiker per week
  is bij 100k gebruikers 100k calls per week. Dus: genereer per mijlpaal één keer
  en hergebruik, of maak er een vaste tekstenset van per doelcategorie.
* **De tip mag nooit een tegenvaller noemen.** Geen "je bent achter op schema".
  Dat is domeinregel 7, en die geldt ook voor tekst die alleen jij ziet — daar
  niet als lek, wel als toon.

**Actie:** dit is een productbeslissing en ik heb er een issue van gemaakt
(zie §4). Ik heb niets gebouwd.

### 3b. p147 — drie ideeën voor een mascotte of avatar van de Doelcoach

> *"Doelencoach — Bedenk 3 unieke ideeën van een mascotte/avatar van hoe die
> doelencoach eruit kan zien. Het moet bij deze app passen. Mogelijk dat hij/zij
> jou ook tips en tricks kan geven tijdens het gebruik van de app?"*

Eerst de randvoorwaarden, want die snijden de helft van de mogelijkheden weg:

1. **Navy als ondergrond, goud als accent.** Uitsluitend Q-Projects-kleuren
   (`CLAUDE.md`), dus de mascotte moet werkbaar zijn in goud op navy én in het
   lichte thema, waar het goud donkerder is (`#a87a22`).
2. **Zakelijke doelen zijn de hoofdrichting** (p146, zie §4a). Wat in een
   fitness-app charmant is, is in een gesprek over je jaarplan kinderachtig.
3. **⚠️ De coach mag nooit teleurgesteld zijn.** Dit is de belangrijkste en de
   minst voor de hand liggende. De Doelcoach is het enige onderdeel van de app dat
   je gemiste weken kent. Een figuur met een gezicht dat kan kijken, kán
   teleurgesteld kijken — en dan heb je domeinregel 7 omzeild via een illustratie.
   De Duolingo-uil is precies dit, en het is precies wat deze app niet wil zijn.
4. **Eén tekenaar, geen animatiestudio.** Wat je kiest moet in een handvol standen
   te maken zijn en daarna nooit meer.

Drie richtingen, van veiligst naar warmst:

---

**Idee 1 — "Koers": een kompasroos, geen wezen**

Een gouden kompasroos op navy, geometrisch, opgebouwd uit dezelfde vormen als de
Status Tracker. Geen gezicht, geen ledematen, geen naam die een persoon suggereert.
De naald wijst naar je eerstvolgende mijlpaal. Dat is de hele animatiewoordenschat:
de naald draait, en als hij stilstaat ben je aangekomen.

* **Waarom het past:** het is het enige idee dat regel 3 hierboven *onmogelijk*
  maakt te overtreden. Een kompas kan niet teleurgesteld kijken. Het sluit ook
  naadloos aan op het Q-Projects-stelsel — dit zou zo in de Status Tracker kunnen
  staan, wat meehelpt bij het weggeven-bij-abonnement uit p145.
* **Waar het aan tekortschiet:** het is koel. Een kompas feliciteert je niet. De
  emotionele lading van een mijlpaal moet dan volledig uit de tekst en de
  beweging komen.
* **Kosten:** het laagst van de drie. Eén SVG, vier rotatiestanden.

---

**Idee 2 — "Vonk": een lantaarn met een vlam die meebeweegt**

Een strakke, bijna technische lantaarn in navy met een gouden vlam erin. De vlam
brandt feller naarmate je dichter bij een mijlpaal komt, en hij gaat **nooit
uit** — bij stilstand krimpt hij tot een rustige, stabiele pit. Dat laatste is de
hele truc: er is geen stand die "je hebt gefaald" betekent, alleen "het is nu
rustig".

* **Waarom het past:** het geeft warmte zonder een gezicht, en dus zonder de val
  van regel 3. De metafoor klopt bovendien met domeinregel 8 en met wat je zelf
  in p125 schreef: er is altijd een kleinere versie van winnen. De vloer is de
  pit die blijft branden.
* **Waar het aan tekortschiet:** een lantaarn heeft geen handen, dus tips geven
  gebeurt in een tekstballon ernaast en niet "door" hem. En de vlam-metafoor is
  niet uniek — je moet het echt hebben van de uitvoering.
* **Kosten:** middel. Drie tot vier vlamstanden, liefst met een zachte lus.

---

**Idee 3 — "Gids": een geabstraheerde berggids, van achteren gezien**

Een silhouet in navy met een gouden randlicht, altijd **van achteren of van
opzij** getekend, kijkend in dezelfde richting als jij. Bij een mijlpaal staat hij
een stuk hoger op de helling en wijst vooruit. Nooit frontaal, nooit met een
gezicht naar de gebruiker toe.

* **Waarom het past:** dit is de enige van de drie die de rol echt vertolkt. Een
  gids loopt vóór je uit op een route die hij kent, en dat is precies wat een
  Doelcoach doet die je doel in mijlpalen opknipt. Voor zakelijke doelen is de
  gids-metafoor bovendien volwassen: het is geen huisdier, het is een collega.
  De rug-aanzicht-regel is niet toevallig — het is dezelfde bescherming als bij
  idee 1, maar dan met een menselijke vorm.
* **Waar het aan tekortschiet, en dit is een echt risico:** zodra er een mens
  staat, staan er keuzes over geslacht, leeftijd en huidskleur. Een silhouet
  zonder gezicht dempt dat, maar haalt het niet weg. En de rug-regel is een
  afspraak die iemand over een jaar vergeet, waarna er een vrolijk zwaaiend
  figuurtje in de app staat dat morgen teleurgesteld kan kijken. Dat is precies
  de valkuil "een reflexvalkuil werkt niet als tekst" uit de overdracht — je zou
  er een controle op moeten hebben, niet een zin.
* **Kosten:** het hoogst. Een figuur vraagt meer standen en meer tekenwerk.

---

**Mijn advies: idee 2 ("Vonk"), met de opbouw van idee 1.**

Vonk geeft de warmte die een coach nodig heeft en houdt de deur naar
teleurstelling dicht *doordat het object geen gezicht heeft*, niet doordat er een
afspraak over gemaakt is. Idee 3 is het mooiste concept en het gevaarlijkste in
uitvoering; ik zou het pas doen als er een ontwerper aan tafel zit.

Op je vervolgvraag — **ja, tips tijdens het gebruik kan.** Maar dan met een
harde grens: de coach spreekt alleen wanneer er iets te vieren is of wanneer jij
hem aanspreekt. Nooit ongevraagd bij stilstand. Een coach die uit zichzelf begint
te praten als je een week overslaat, is een controleur — en dat is dezelfde fout
als in 2a, alleen met een tekenfilmfiguur.

### 3c. p149 — talen, en welke ik zou aanraden

> *"Talen — Maak de GoalBuddies app ook in het Engels, Duits, Frans, Spaans,
> Pools, Portugees. Zijn er nog aan te bevelen talen?"*

**Eerst het belangrijkste, want het is dringender dan de talenkeuze.**

Ik heb de codebase nagekeken: **er is geen enkele vertaalinfrastructuur.** Geen
`i18n`, geen `i18next`, geen `lingui`, geen berichtencatalogus. Er staan
**56 bestanden met Nederlandse tekst hard in de code**, plus alle
foutmeldingen in de Zod-schema's, plus de Doelcoach-prompt die letterlijk
`'Schrijf in het Nederlands, in de je-vorm.'` zegt.

Dit valt precies onder wat `CLAUDE.md` "greenfield — de eerste beslissingen zijn
de duurste" noemt. Elke week die we doorbouwen maakt dit duurder, en de kosten
groeien met het aantal schermen — niet met het aantal talen.

**Er is één plek waar het straks helemaal niet meer kan.** Systeemberichten
worden opgeslagen met zowel een `system_event` als een uitgeschreven Nederlandse
zin in `body`. Een chatbericht is een onveranderlijke kopie (beslisdocument 002
§3), dus die zin is er over een jaar niet meer uit te krijgen. Wie dan Duits
aanzet, krijgt een Duitse app met Nederlandse systeemberichten in de
geschiedenis. **De oplossing is goedkoop zolang de tabel leeg is:** laat de app
renderen uit `system_event` plus parameters en gebruik `body` alleen als
noodterugval. Dat is nu een halve dag; met echte gebruikers erin is het een
migratie over data die niet meer klopt.

**Dan de talen zelf.** Je lijst is goed, maar de volgorde is belangrijker dan de
lijst — elke taal kost onderhoud bij elke tekstwijziging, en dit project heeft
één ontwikkelaar.

| Fase | Talen | Waarom |
|---|---|---|
| **1** | Nederlands, **Engels** | Engels is niet-onderhandelbaar zodra het buiten Nederland komt, en het is de terugvaltaal voor elke taal die je niet hebt |
| **2** | **Duits**, **Frans** | Duitsland is de grootste zakelijke markt naast de deur. Frans is nodig zodra je België serieus neemt — en dat is bij een Nederlands B2B-product waarschijnlijker dan Spanje |
| **3** | **Spaans**, **Portugees**, **Pools** | Grote sprekersaantallen, maar verder van de eerste klanten af |

Op je vraag of er nog talen aan te bevelen zijn — **ja, twee, en om verschillende
redenen:**

* **Italiaans.** Als je fase 3 doet vanwege de omvang van de taalgroep, is
  Italiaans binnen Europa de logische zesde, en zakelijk dichterbij dan
  Portugees.
* **Turks, en dit is de interessantere.** Als p145 doorgaat — de app weggeven bij
  het Status Tracker-abonnement, gebruikt dóór werknemers van je klanten — dan is
  de vraag niet "welke landen" maar "wie werkt er bij die bedrijven". Voor de
  Nederlandse arbeidsmarkt zijn Pools en Turks dan relevanter dan Spaans of
  Portugees. Dat maakt jouw eigen keuze voor Pools trouwens beter onderbouwd dan
  hij op het eerste gezicht lijkt.

**Twee dingen om nu al vast te leggen, want ze zijn later duur:**

* **Portugees en Spaans zijn geen enkelvoud.** `pt-BR` en `pt-PT` verschillen in
  toon en woordkeuze, `es-ES` en `es-419` ook. Kies de variant vooraf; twee
  varianten van één taal is twee talen aan onderhoud.
* **De je-vorm is een keuze die niet in elke taal bestaat.** Deze app tutoyeert.
  In het Duits is `du`/`Sie` een echte beslissing, in het Frans `tu`/`vous`. Voor
  een accountability-app tussen vrienden is `du`/`tu` juist; voor een app die
  binnen een bedrijf wordt uitgedeeld is dat minder vanzelfsprekend. Leg het per
  taal vast in de berichtencatalogus, niet in het hoofd van de vertaler.

### 3d. p150 — emoticons

> *"Emoticons — In de teksten kan men ook emoticons gebruiken. Worden er op andere
> plaatsen ook emoticons gebruikt?"*

Op je vraag: **nee, nergens.** Ik heb `src/` en `app/` afgezocht op het volledige
emoji-bereik. Er staat geen enkele emoji in de app — niet in knoppen, niet in
statuslabels, niet in systeemberichten, niet in de zeventien UI-componenten. De
enige emoji in dit project staan in de documentatie (de ⚠️ in `CLAUDE.md`).

Dat is nu nog toeval en geen afspraak. Twee dingen die je moet weten voordat je
ze toelaat:

* **In tekst die de gebruiker zelf typt, kan het gewoon.** Chatberichten en
  weekafsluitingen zijn `text` in Postgres, dat is UTF-8, en emoji passen daarin.
  De enige zorg is de tekenlimiet: `BERICHT_MAX` is 4000 en telt in tekens, dus
  een emoji met huidskleur-modifier telt voor meerdere. Dat is geen bug, maar het
  verklaart wel waarom een bericht eerder "vol" is dan de gebruiker verwacht.
* **In tekst die de app zelf schrijft, zou ik het niet doen — met één
  uitzondering.** Emoji in systeemberichten en statuslabels lijken vriendelijk en
  zijn het niet: ze vertalen slecht, ze renderen per platform anders, en ze zijn
  slecht voor schermlezers, die "gezicht met vreugdetranen" voorlezen midden in
  een zin. De uitzondering is een **reactie op een bericht** — daar ís de emoji
  de hele boodschap en niet de versiering.

**Aanbeveling:** leg vast dat de app zelf geen emoji gebruikt in tekst, en dat de
gebruiker ze overal mag typen. Reacties op berichten zijn de plek waar emoji
thuishoren; dat sluit aan op A24 uit `Q-TODO.docx`, waar de reacties al genoemd
worden.

### 3e. p151 — mijn eigen ideeën

> *"Heb je zelf nog andere ideeën of aanvullingen? Bijvoorbeeld die de
> GoalBuddies app competitiever maakt, het de gebruiker makkelijker maakt om de
> dagelijkse doelen te behalen, de app professioneler maakt, of anders?"*

Vijf, en ik heb ze op volgorde van wat ik zelf het eerst zou doen. De eerste
twee zijn geen ideeën maar schulden.

**1. De schermen laten inlopen op de datalaag (QS8-106, staat al klaar).** Dit is
geen idee maar het grootste knelpunt van het project, en het maakt de app in één
klap professioneler dan welk nieuw idee ook. Er zijn vier gebouwde en geteste
functies — `schuifDoor()`, `sluitWeekdoelAf()`, `verwijderWeekdoel()`,
`verwijderDoel()` — die door geen enkel scherm aangeroepen worden. Plus de hele
Doelcoach-keten van EPIC 3, waar nog nooit één echte AI-call doorheen is gegaan.
De app kan vandaag dingen die de gebruiker niet kan bereiken.

**2. De vertaalinfrastructuur, nu het nog 56 bestanden zijn.** Zie 3c. Dit is
dezelfde soort beslissing als de week-start: goedkoop op dag één, pijnlijk op dag
honderd.

**3. Een eerlijke onboarding van tien minuten, met één echt doel.** Wat deze app
moeilijk maakt is niet het gebruik maar het begin: je moet een doel bedenken, het
opknippen, weekdoelen kiezen, een vloer instellen, en een groep vinden. Dat zijn
vijf beslissingen voordat er iets gebeurt. De Doelcoach kan daar het meeste werk
van overnemen, en dat is meteen de eerste keer dat de gebruiker ziet wat de app
kan. **Dit is bovendien waar de meeste gebruikers zullen afhaken**, en het is
nergens als issue belegd.

**4. "De week van vijf minuten" — één scherm dat je wekelijkse ronde afmaakt.**
Nu is afronden, indienen, een buddy beoordelen en je week afsluiten verspreid over
verschillende plekken. Eén wekelijkse route die je er in vijf minuten doorheen
loodst — jouw week afsluiten, dan de twee weken van je buddy's beoordelen — maakt
van accountability een gewoonte in plaats van een klus. Dit is de goedkoopste
manier om retentie te kopen die ik in dit product zie, en hij vraagt geen nieuwe
datalaag: alles wat ervoor nodig is bestaat al.

**5. Een groepsteller die alleen optelt.** Het antwoord op je eigen vraag in p55
over competitie, zonder domeinregel 7 te raken. "Deze groep heeft samen 47 weken
afgerond, en 12 mijlpalen." Gaat nooit omlaag, verraadt niemand, en is toch een
getal om trots op te zijn. De Ketting doet dit voor opdagen; dit doet het voor
resultaat.

**En één ding dat ik zou láten:** badges (QS8-78, staat op `phase:v2`). Badges
zijn de standaardreflex voor "competitiever maken" en ze werken slecht in kleine
groepen — met drie mensen is een ranglijst geen wedstrijd maar een aanwijzing wie
de zwakste is. Dat botst met dezelfde regel als 2a. De weekpas is een betere munt
omdat hij iets nuttigs doet in plaats van iets te bewijzen.

---

## 4. Soort C, deel 2 — de nieuwe ideeën uit p143 t/m p151

De laatste sectie van het document ("Ideeën en eventuele aanvullingen") bevat vijf
voorstellen die vandaag nergens in Linear staan. Ik heb ze omgezet in issues,
zodat ze niet in een Word-bestand blijven liggen — dat is dezelfde reden waarom
QS8-106 een issuenummer heeft gekregen.

| Groen | Wat het is | Waar het heen is |
|---|---|---|
| p145 | Weggeven bij het Status Tracker-abonnement; gebruik binnen bedrijven voor persoonlijke KPI's | §4a — koerswijziging, geen issue |
| p146 | Zakelijke doelen als hoofdrichting van de app | §4a — koerswijziging, geen issue |
| p147 | Mascotte voor de Doelcoach | §3b beantwoord; issue voor de uitvoering |
| p148 | Spraak naar tekst in de grote tekstvelden | issue |
| p149 | Meertaligheid | issue, met de infrastructuur als eerste stap |
| p150 | Emoji | §3d beantwoord; alleen een afspraak nodig, geen bouwwerk |
| p75/76 | Wat je krijgt bij een gehaalde week | issue |

### 4a. Twee van deze vijf zijn geen feature maar een koerswijziging

p145 en p146 lees ik anders dan de rest, en ik wil dat je weet waarom.

> *"De GoalBuddies app moet er voornamelijk op (in)gericht zijn om zakelijke
> doelen te behalen. Dus de deelnemer moet juist op dat front gemotiveerd worden
> en blijven."* (p146)

Dat is geen aanvulling, dat is de doelgroep. En het staat haaks op wat er nu in
`PRD-accountability-app.md` en `docs/PRODUCT-PROPOSAL.md` staat, waar de app
tussen vrienden speelt. Het raakt:

* **De Doelcoach-prompt**, die nu neutraal is en dan zakelijke mijlpalen zou
  moeten voorstellen.
* **De voorbeelden en de copy** door de hele app heen.
* **En het botst met p145 op één punt dat je moet oplossen voordat er iets
  gebouwd wordt.** Als de app binnen een bedrijf wordt uitgedeeld en over
  persoonlijke KPI's gaat, dan zit er vroeg of laat een leidinggevende in een
  buddy-groep. Domeinregel 7 beschermt je tegen schaamte tussen vrienden; tussen
  werknemer en manager is het geen schaamte maar een beoordelingsgesprek. **Dat
  is een veel zwaardere reden om regel 7 te houden dan de reden waarom hij er
  staat** — en het is precies de omgekeerde conclusie van p9.

Ik heb hier geen issue van gemaakt met een implementatie erin, want dat zou een
koerswijziging zijn die ik zelf invul.

---

## 5. Wat ik gedaan heb en wat er op jou wacht

**Uitgevoerd:**

* Alle vijftien groene passages geïnventariseerd en beantwoord.
* Vastgesteld dat `Q-TODO.docx` geen groene tekst bevat.
* Drie mascotte-ideeën uitgewerkt met randvoorwaarden en een advies (§3b).
* Talenadvies met volgorde, twee extra aanbevelingen en twee valkuilen (§3c).
* Emoji-inventarisatie: nul in de app, met een voorstel voor de afspraak (§3d).
* Vijf eigen voorstellen (§3e).
* De ideeën uit p143–p151 als issues in Linear gezet.

**Wat op jou wacht — en dit gaat vóór de rest, want twee ervan blokkeren elkaar:**

1. **Domeinregel 7: laten, opt-in per groep, of afschaffen?** (§2a) Neem dit samen
   met p146: als de app binnen bedrijven gebruikt gaat worden, verandert het
   antwoord.
2. **Punten privé of gedeeld?** (§2b) Hangt aan 1 en kan er niet los van.
3. **A29 opnieuw: minpunten bij zelfstandig verschuiven?** (§2c) Mijn advies is
   nee, maar je hebt het nu twee keer opgeschreven.
4. **Is "zakelijke doelen" de koers?** (§4a) Zo ja, dan is dat een herziening van
   het PRD en niet een issue.

**Ik heb aan geen van deze vier iets veranderd.**
