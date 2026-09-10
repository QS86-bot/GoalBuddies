# De microfoon staat op web, en de uitleg staat ervóór

**Datum:** 09-09-2026 · **Issue:** QS8-250 · **Status:** gebouwd

Vier keuzes die niet vanzelf spreken, met de reden erbij. De acceptatiecriteria
van het issue staan er niet in — die staan in Linear.

---

## 1. Alleen op web, en dat is een besluit en geen omissie

`spraakBeschikbaar()` geeft op iOS en Android onvoorwaardelijk `false`.

Het systeemtoetsenbord van beide platformen heeft al een dicteerknop. Wie daar
typt, kan vandaag inspreken zonder dat deze app één regel code draait. Zelf een
herkenner inbouwen zou daar kosten: een dependency (`expo-speech-recognition` of
vergelijkbaar), een microfoontoestemming in de app-configuratie, en een tweede
implementatie van dezelfde belofte die uit elkaar kan lopen met de eerste.

Wat het oplevert is een knop naast een knop die er al staat.

⚠️ **En het gat zit ook echt op web.** `goalbuddies.q-projects.tech` is op dit
moment het enige adres waar iemand de app gebruikt; er is geen native build.

**Wordt zwaarder als:** er een native build komt én blijkt dat gebruikers de
dicteerknop van het toetsenbord niet vinden. Dan is dit opnieuw een afweging, en
dan pas is de dependency het waard.

---

## 2. Een uitsluitlijst, en niet de toelaatlijst die dit project gewend is

`magSpraak()` geeft standaard `true` en somt op wat er *geen* microfoon krijgt:
wachtwoord, e-mail, telefoon, getal, URL, eenmalige code, postcode.

Dat is tegen de gewoonte in. Domeinregel 7 zegt "beschermd is het antwoord tot
iemand het tegendeel besluit", en dit project bouwt zijn grenzen bijna overal
fail-closed.

📏 De reden om hier af te wijken is geteld: van de **48** `Field`-aanroepen in
deze app zijn er **8** geen vrije tekst — drie wachtwoorden, drie getalvelden,
één e-mailadres en één naam. Een toelaatlijst zou dus veertig velden moeten
opsommen, en bij elk nieuw formulier stil achterlopen. Dan staat de microfoon er
niet, en wordt niets daar rood van.

⚠️ **Het verschil met domeinregel 7 is de aard van de fout.** Daar is de fout een
lek: iemands gemiste week wordt zichtbaar. Hier is de fout een ongemak: een
microfoon bij een postcodeveld is hinderlijk. De acceptatie van dit issue vraagt
bovendien letterlijk "bij **elk** vrijetekstveld".

⚠️ **Eén uitzondering is wél fail-closed gebouwd, en met opzet dubbel:** een veld
met `autoComplete="new-password"` krijgt geen microfoon, óók zonder de
`wachtwoord`-vlag van `Field`. Dat is een wachtwoordveld dat iemand vergeten is
te markeren, en dat is precies het geval waarin een microfoon het ergst is.

---

## 3. Wat je inspreekt verlaat je toestel, en dat hoor je vóóraf

De `SpeechRecognition`-API van de browser is geen lokale herkenner. In Chrome en
Edge gaat de opname naar een server van de browsermaker.

In deze app is dat geen voetnoot. Wat er in een vrijetekstveld gaat is de
identiteitszin, de omschrijving van een doel, het antwoord op "wat ging er niet
goed", het argument bij een uitstelverzoek — precies het soort tekst dat
domeinregel 7 beschermt tegen de eigen groep.

**Daarom staat de mededeling vóór de eerste opname en niet in een
privacyverklaring**, één keer, in gewone taal, met de knop "toch typen" ernaast
als volwaardige tweede uitweg.

⚠️ **De vlag staat op het apparaat en niet in `profiles`** (`voorkeuren.ts`).
Gevolg dat je moet weten: op een nieuwe browser komt de uitleg opnieuw. Dat is
hier juist goed — het is een andere browser met een andere dienst erachter.

⚠️ **De onbekende waarde valt de andere kant op dan bij de vieringen.** Een lege
of kapotte opslag betekent "nog niet gezien", dus de uitleg komt nog een keer.
Twee keer uitleg is hinderlijk; nul keer is een belofte die niet nagekomen is.

⚠️ **De voorkeur uit QS8-108 — een herkenner die op het toestel draait — is
hiermee niet ingelost.** De browser-API is wat er vandaag is. Zodra Chrome zijn
on-device-modus breed beschikbaar maakt, is dit de plek om het te herzien; de
mededeling is dan niet meer waar en hoort dus mee te veranderen.

---

## 4. Een blok in het scherm, geen `Alert`

Zelfde keuze en zelfde reden als bij `Bevestiging` (zie de kop van dat
component): een `Alert` gedraagt zich op web anders dan op native, en dat is
precies het platformverschil dat CLAUDE.md uit de gedeelde UI wil houden. Het
blok klapt open op de plek van de knop, werkt overal hetzelfde en is met een
schermlezer gewoon te lezen.

⚠️ **De luisterstand is gewone tekst en geen goud.** `theme/contrast.test.ts`
legt vast dat goud een accent is en geen tekstkleur. Dát er tekst staat is het
signaal.

---

## Wat dit niet is

* **Geen tweede weg naar de microfoon.** Er is één plek die weet hoe
  spraakherkenning werkt (`useSpraak.ts`), en
  `tests/beloftes/spraakveld.test.ts` wordt rood zodra een scherm er zelf een
  bouwt. Een tweede herkenner is een tweede route die de uitleg van §3 overslaat.
* **Geen nieuwe lengtegrens.** Ingesproken tekst gaat door hetzelfde veld, dus
  door dezelfde `telTekens()`-grenzen als getypte tekst. `voegAan()` gebruikt
  daarom geen `slice`, geen `charAt` en geen `[0]` — een samengestelde emoji kost
  elf UTF-16-eenheden en snijden daarop rendert als een vervangingsteken.
* **Geen schoning van de herkende tekst.** Herkende tekst is gebruikersinvoer.
  De app schrijft zelf geen emoji; de gebruiker mag ze overal typen, en dus ook
  inspreken.
