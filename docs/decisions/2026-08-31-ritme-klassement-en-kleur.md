# Ritme, klassement en kleur — vier besluiten van 31-08-2026

*Besluiten A53 t/m A56 · QS8-252 en zijn kinderen*

Quinten vroeg om twaalf extra focuscategorieën, een korte vragenlijst, een
kleurrijkere app, en een dashboard met grafieken, een kalender, een individuele
score, een groepsscore en vooral de dag- en weekreeks. Bij het uitwerken bleken
vier van die wensen te botsen met besluiten die er al lagen. Dit document legt
vast wat er toen gekozen is en wat dat kost.

⚠️ **Dit document is de beslissing. Hóé het gebouwd is, staat bij de bouw** — dat
scheelt twee plekken die hetzelfde feit beschrijven en op een dag uit elkaar
lopen.

| Besluit | Onderwerp | Gebouwd | Bouwverslag |
|---|---|---|---|
| A53 | Een doel krijgt een ritme | 01-09-2026, migratie 0140 | `2026-09-01-het-weekdoel-draagt-zijn-eigen-regel.md` |
| A54 | Een klassement per lid | 01-09-2026, migratie 0141 | §2 hieronder |
| A55 | Kleur codeert de familie | nee | — |
| A56 | De vragenlijst komt na het aanmelden | nee | — |

---

## 1. A53 — een doel krijgt een ritme

De vraag was of er een dagreeks bij moest, en of die domeinregel 9 zou wijzigen
("De Dagzet is aanwezigheid, geen prestatie; een dag overslaan heeft geen enkel
gevolg"). Voorgelegd waren drie opties. Het antwoord was een vierde:

> *Bij het ingeven van het te bereiken doel moet er de keuze komen of het een
> doel is waaraan dagelijks gewerkt wordt, meerdere keren per week, of dat alleen
> gekeken wordt naar het weekresultaat.*

Dat lost het onderliggende probleem op in plaats van de vraag. "Elke dag
mediteren" en "deze week drie klantgesprekken voeren" zijn niet dezelfde soort
belofte, en de app dwong ze tot dan toe in dezelfde vorm.

**Domeinregel 9 wordt hiermee afgebakend, niet geschrapt.** De Dagzet blijft
gevolgloos; wat erbij komt is een ándere handeling — een dagafvinking bij een
doel dat daar zelf om gevraagd heeft.

## 2. A54 — een klassement per lid, en wat dat kost

### De vraag en het bezwaar

Quinten vroeg om een individuele score én een groepsscore. Voorgelegd waren twee
vormen: een optelteller (die besluit A42 al toestond) of een echt klassement per
lid. Hij koos het klassement, met het bezwaar erbij geleverd.

Dat bezwaar is niet vervallen. A42 luidde:

> *Punten zijn privé. Een dalend totaal is zichtbaar bewijs van een gemiste week,
> en dat botst met domeinregel 7.*

In een groep van drie vrienden doodt één schaamtemoment de hele groep — de
belangrijkste vondst uit de Habit Huddle-analyse. En bij zakelijk gebruik weegt
dat zwaarder, niet lichter: zit er een leidinggevende in de buddy-groep, dan
beschermt de regel niet tegen schaamte maar tegen een beoordelingsgesprek.

### De vorm: het klassement volgt `groups.zichtbaarheid`

Er bestaat sinds besluit A41 al een groep die heeft afgesproken elkaars tegenslag
te zien: de **open** groep.

| Groep | Krijgt |
|---|---|
| open | een puntenklassement per lid |
| beschermd | de optelteller — "samen 47 weken afgerond" |

Dat is geen afzwakking maar de goedkoopste uitvoering. De machinerie voor "deze
groep heeft ja gezegd" staat er al, met alle zorgvuldigheid eromheen:
`zet_groepszichtbaarheid()` eist een actieve beheerder, een expliciete
bevestiging, een rij in `group_events` en een systeembericht. Er hoeft geen
tweede, losstaande toestemmingsvorm bij.

⚠️ **Wat hier níét besloten is:** het klassement in béschermde groepen. Dat kan,
en dan vervalt domeinregel 7 voor het puntentotaal in élke groep. Dat is een
grotere stap dan deze en hoort dan apart opgeschreven te worden.

### De keuze die pas bij het bouwen zichtbaar werd

Er zijn twee getallen die allebei "de score van dit lid" heten, en het issue zei
niet welke van de twee:

| | |
|---|---|
| **A. het groepstotaal** | `sum(delta) where group_id = deze groep` |
| **B. het persoonlijke totaal** | `sum(delta)` over alles |

**Gekozen is A**, en dat blijkt de conservatieve én de eerlijke keuze te zijn.
Gemeten in het schema, niet aangenomen:

- `cycle_missed` wordt door de rollover geboekt **zonder `group_id`** — een
  gemiste week is niet aan één groep toe te rekenen, want een doel kan in
  meerdere groepen hangen.
- `completion_approved_*` en `review_given` dragen wél een `group_id`: de
  goedkeuring vond in een specifieke groep plaats.

**Daarmee kan het groepstotaal niet dalen door een gemiste week — precies de
eigenschap waar A42 om vroeg.** Een laag getal betekent "hier weinig verdiend" en
niet "hier weken gemist"; dat tweede is niet af te leiden omdat het cijfer er
niet in zit. Variant B zou dat wél lekken, en zou bovendien de punten uit een
ándere groep in dit scherm zetten.

⚠️ **Dat het klassement een groepstotaal toont en niet je persoonlijke score, is
een besluit dat de gebruiker moet kunnen zien.** De copy zegt daarom "de punten
van deze groep" en niet "jouw punten". Twee getallen die allebei "score" heten en
verschillen, is precies het soort naad waar dit project last van heeft gehad.

### De grendel die deze keuze in stand houdt

Die eigenschap was tot 0141 een **toevalligheid van één Edge Function**. Eén
`group_id` erbij in een latere versie van de rollover is genoeg om dit klassement
stilzwijgend in een tegenslagmeter te veranderen, en geen enkele test die
daarvóór bestond zou daar rood van worden.

Migratie 0141 legt het daarom vast als CHECK:
`points_ledger_gemist_is_niet_van_een_groep`. Rood gemaakt door hem te droppen en
de gemiste week mét groep te boeken: de stand zakte, en geen enkele andere toets
in de suite merkte het.

### Wat er hierdoor wél afleidbaar wordt

Een **ingetrokken goedkeuring** (oppervlak 17) is bewust dicht, óók in een open
groep. Migratie 0030 boekt daarbij twee negatieve `correction`-rijen mét
`group_id`, dus het groepstotaal daalt daar wél van.

Nagelopen en aanvaard, om twee redenen die allebei in de code staan:

1. **Het venster is vijftien minuten.** Wat afleidbaar is, is dus niet "X heeft
   een week gemist" maar "er is zojuist een goedkeuring ingetrokken".
2. **Er is al een luider signaal, en dat is bewust zo gebouwd.** Dezelfde functie
   verwíjdert de aankondiging uit de groepschat. Een regel die verdwijnt uit een
   kanaal dat mensen lezen, valt meer op dan een getal dat terugveert. Het
   klassement is hier dus niet de zwakste schakel.

Opgenomen als **oppervlak 28** in `002-domeinregel7-oppervlakken.md`.

### Wat het klassement structureel niet kan tonen

Het issue verbood drie dingen. Alle drie zijn onmogelijk gemaakt in de
**handtekening** van `groep_klassement()` en niet in een component:

| Verboden | Waarom het niet kán |
|---|---|
| een minpunt in beeld | er is geen kolom voor een `delta` |
| een grafiek per lid over de tijd | er is geen kolom voor een datum |
| nadruk op de laatste plaats | `positie` telt op vanaf 1; er is geen "van" |

Een belofte die alleen in een component staat, verhuist mee met dat component en
verdwijnt bij de tweede schrijver — onwrikbare regel 18. Een kolom die niet
bestaat, is er over een jaar nog steeds niet.

## 3. A55 — kleur codeert de familie, het icoon codeert het gebied

Gevraagd was een app die net zo kleurrijk is als Habit Huddle, "maar dan op mijn
eigen manier". De twaalf focuscategorieën vragen dus twaalf kleuren, en die zijn
er niet.

Gemeten op het navy-stelsel van Q-Projects met de zes gebruikelijke toetsen
(contrast op navy, onderlinge ΔE in OKLab, en beide onder deuteranopie,
protanopie en tritanopie): **drie kleuren komen erdoorheen**. Elke vierde
kandidaat valt om op kleurenblindheid of op onderlinge afstand bij normaal zicht.

Daaruit volgt de regel: **kleur codeert de familie, het icoon codeert het
gebied.** Vijftien gebieden worden vier groepen — drie met een kleur, en één
zonder.

> ⚠️ **De indeling is op 04-09-2026 vervangen — besluit A58**, in
> `2026-09-04-drie-families-en-de-kleuren-die-niet-kunnen.md`. Twaalf gebieden in
> drie families van vier, en geen restgroep meer. De regel hierboven blijft
> onveranderd; wat verandert is dat de vierde groep — die hier ontstond omdat er
> maar drie kleuren waren — is opgeheven in plaats van gedoogd.

### Gebouwd op 01-09-2026, en de meting is scherper geworden

| Familie | donker | licht | Gebieden |
|---|---|---|---|
| Lichaam en rust | `#4f97e8` | `#2a6ec0` | sport · voeding · zelfzorg · rust en aandacht |
| Mensen en maken | `#dd4fa0` | `#b53080` | contact · iets voor een ander · creativiteit |
| Werk en groei | `#8f9c36` | `#4a5410` | productiviteit · orde · leren · vaardigheden · veerkracht |
| *(geen kleur)* | — | — | werk · studie · overig |

⚠️ **De roze is veranderd, en dat is een correctie op deze eigen meting.** Hier
stond `#e0578f`, gemeten op contrast en op onderlinge afstand tussen de drie
families. Wat er níét gemeten was, is de afstand tot de **statuskleuren**: die
was 8.9 tot `red`. Rood betekent in dit stelsel uitsluitend deadline-risico, dus
een roze markering die daar tegenaan ligt leest als een waarschuwing over een
doel waar niets aan de hand is.

Dat is gevonden door de meting in code te zetten in plaats van in dit document:
`src/shared/theme/kleurafstand.ts` met `kleurafstand.test.ts` erop. De nieuwe
waarden liggen op elke as ruimer dan de oude — familie-onderling minimaal 12.1
(donker) en 11.9 (licht), tot de dichtstbijzijnde statuskleur minimaal 12.1 en
11.9.

⚠️ **De vierde groep heeft geen kleur, en dat is geen omissie maar het gevolg van
de meting.** A55 zocht drie kleuren voor twaalf gebieden; `business`, `study` en
`other` vielen buiten die opdracht. Ze krijgen wél een pictogram, in de neutrale
kleur. Wie ze een eigen kleur wil geven, verzint een vierde — en dat is precies
wat de band te smal voor is.

⚠️ Nog open: gaan die drie kleuren het Q-Projects-stelsel in — waar de Status
Tracker ze erft — of blijven ze een uitbreiding van alleen GoalBuddies?

## 4. A56 — de vragenlijst komt na het aanmelden

De korte vragenlijst (vier vragen, vrije tekst, samenvattingsscherm) staat **na**
het aanmelden en niet ervoor.

Een vragenlijst vóór het aanmelden is een drempel vóór er iets te winnen valt; er
staat dan nog geen account tegenover de antwoorden en er is niets om ze op te
slaan. Erna is het de eerste stap ín de app, met een account om aan te hangen.
