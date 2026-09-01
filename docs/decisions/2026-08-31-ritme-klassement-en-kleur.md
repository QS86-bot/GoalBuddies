# Ritme, klassement en kleur — vier besluiten na de Habit Huddle-ronde

*31-08-2026 · besluiten A53 t/m A56 · Quinten*

Aanleiding: Quinten liep de onboarding van Habit Huddle opnieuw door — twaalf
focusgebieden, vier vragen, een samenvattingsscherm en een aanmeldmuur — en vroeg
om vier dingen: meer categorieën, groepen vinden op categorie en taal, een korte
vragenlijst, en een kleurrijker dashboard met grafieken, een kalender, een
individuele score, een groepsscore en een dag- en weekreeks.

Onderzoek stond deels al in `docs/research/habit-huddle-teardown.md` (15-08). Wat
daaraan toegevoegd is, staat in het voorstel dat aan deze besluiten voorafging.
Drie van de vier vragen botsten met een besluit dat eerder bewust genomen is.
Hieronder wat er van elk geworden is.

---

## A53 — Een doel krijgt een ritme: dagelijks, een aantal keer per week, of alleen het weekresultaat

**Dit is Quintens eigen antwoord op de dagreeks-vraag, en het is beter dan alle
drie de opties die ik voorlegde.**

Ik vroeg of er een dagreeks bij moest, en of die dan domeinregel 9 zou wijzigen.
Het antwoord was een derde ding: *bij het ingeven van het doel kies je of het een
doel is waaraan dagelijks gewerkt wordt, meerdere keren per week, of dat alleen
naar het weekresultaat gekeken wordt.*

Dat lost het onderliggende probleem op in plaats van de vraag. "Elke dag mediteren"
en "deze week drie klantgesprekken" zijn niet dezelfde soort belofte, en de app
dwong ze tot nu toe in dezelfde vorm.

### Wat het betekent per ritme

| Ritme | De week is gehaald als | Dagreeks | Domeinregel 9 |
|---|---|---|---|
| `weekly` | het weekdoel gehaald is, zoals nu | nee | onveranderd |
| `times_per_week` | je het afgesproken aantal dagen haalt | nee | de dag telt mee |
| `daily` | je (bijna) elke dag hebt opgedaagd | ja | de dag telt mee |

⚠️ **De vloer en het plafond blijven, en ze veranderen van vorm.** Bij een
weekdoel zijn ze tekst ("1 gesprek ingepland" / "3 gesprekken gevoerd"). Bij een
ritme-doel worden ze **aantallen dagen**: vloer 3, plafond 5. Dat is geen nieuw
mechanisme maar hetzelfde mechanisme op een andere eenheid — en het is precies wat
domeinregel 8 belooft: de vloer is de versie die je op je slechtste week nog haalt.

### Wat dit met domeinregel 9 doet

Domeinregel 9 zegt vandaag: *De Dagzet is standaard privé en levert nooit punten
of goedkeuring op. Een dag overslaan heeft geen enkel gevolg.*

**Die regel blijft onverkort gelden voor een doel met weekritme.** Wat verandert
is dat er nu een tweede soort dag bestaat: bij een doel met dag- of
weekritme-met-aantal is een dag een **eenheid die meetelt**, en dan is overslaan
per definitie een gevolg.

De regel wordt dus niet afgeschaft maar **afgebakend**:

> De Dagzet is aanwezigheid en geen prestatie. Bij een doel met ritme `daily` of
> `times_per_week` telt een dagafvinking wél mee — maar uitsluitend voor de vraag
> of de week gehaald is, en nooit als losse punteneenheid.

⚠️ **Punten blijven per week geboekt.** Zeven dagen afvinken levert geen zeven
keer `+2` op; het levert de week op. Anders is het puntenmodel uit domeinregel 10
in één klap zeven keer zo groot voor wie een dagdoel kiest, en dan zegt een score
niets meer over doelen onderling.

### De vergeving hoort er meteen bij

Een dagreeks zonder vergeving is een strafmechanisme, en dat is het enige wat deze
app nergens wil zijn. De teardown schrijft op waarom Habit Huddle's reeksen zo lang
worden, en het is niet de reeks maar wat eromheen staat:

- **de nachtuil-marge** — tot 08:00 telt gisteren nog;
- **een dagpas** — een gemiste dag verbruikt een pas in plaats van je reeks.

Bouw ze in dezelfde migratie of bouw de dagreeks niet.

### Domeinregel 7 blijft leidend en wordt hier scherper

Een dagelijkse afvinking is **fijnmaziger tegenslag** dan een gemiste week. De
groep ziet daarom nooit welke dagen iemand niet afvinkte. Wat de groep wél mag
zien is hetzelfde soort signaal als altijd: dát iemand vandaag heeft opgedaagd.

---

## A54 — Een klassement per lid. Besluit A42 wordt teruggedraaid

**Dit is de zwaarste van de vier en hij hoort met zoveel woorden opgeschreven te
staan, want hij draait een besluit terug dat op 24-08 juist herbevestigd is.**

Quinten vroeg om een individuele score én een groepsscore. Ik legde voor: een
optelteller (die A42 al toestond) of een echt klassement per lid. Hij koos het
klassement.

### Wat A42 zei, en waarom

> *Punten zijn privé. Een dalend totaal is zichtbaar bewijs van een gemiste week,
> en dat botst met domeinregel 7.*

Die redenering is niet vervallen. Punten kunnen dalen — `cycle_missed` boekt `−1`
— dus een zichtbaar totaal per lid maakt een gemiste week afleidbaar voor
iedereen in de groep. Dat is precies het schaamtemoment waarvan de Habit
Huddle-analyse zegt dat het een groep van drie doodt, en CLAUDE.md voegt daaraan
toe dat het bij zakelijk gebruik zwaarder weegt en niet lichter: zit er een
leidinggevende in de groep, dan beschermt de regel niet tegen schaamte maar tegen
een beoordelingsgesprek.

**Dat bezwaar is voorgelegd en het besluit is genomen. Dit document legt vast wat
het kost, niet dat het niet mag.**

### De vorm die ik voorstel, en waarom die

Er bestaat sinds besluit A41 al een groep die heeft afgesproken elkaars tegenslag
te zien: de **open** groep. `groups.zichtbaarheid` is er de kolom voor, hij is
voor geen enkele client schrijfbaar, en omzetten gaat via
`zet_groepszichtbaarheid()` — actieve beheerder, expliciet bevestigd, een rij in
`group_events` en een systeembericht.

**Laat het klassement die kolom volgen.** In een open groep is een puntenklassement
per lid een uitbreiding van iets waar de groep al ja tegen gezegd heeft. In een
beschermde groep blijft het dicht, en ziet de groep de optelteller.

Dat is geen afzwakking van het besluit maar de goedkoopste manier om het uit te
voeren: de machinerie voor "deze groep heeft afgesproken tegenslag te delen"
staat er al, met alle zorgvuldigheid eromheen, en er hoeft geen tweede,
losstaande toestemmingsvorm bij.

⚠️ Wil Quinten het klassement óók in beschermde groepen, dan is dat mogelijk en
dan vervalt domeinregel 7 voor het puntentotaal in élke groep. Dat is een grotere
stap dan deze en hij hoort dan apart opgeschreven te worden.

### Wat er hoe dan ook níét in mag

- **Geen minpunten in beeld.** Een klassement toont een totaal, geen verlies. "−1
  deze week" naast een naam is geen ranglijst maar een aanwijzing.
- **Geen historische grafiek per lid.** Een lijn die daalt is een tijdlijn van
  gemiste weken.
- **Geen laatste plaats benadrukken.** Het klassement toont wie er staan, niet wie
  er onderaan staat.

---

## A55 — Kleur waar het iets betekent, en niet meer dan dat

Quinten wil een kleurrijkere app. Dat botst met twee dingen: `tokens.ts` zegt
*"verzin hier nooit een kleur bij"* omdat het navy-stelsel gedeeld wordt met de
Status Tracker, en het productvoorstel koos in §5 bewust voor *rustig gereedschap*
met het argument dat een app die eruitziet als Duolingo het doel kleiner laat
voelen dan het is.

**Besluit: kleur mag erbij, uitsluitend waar hij iets codeert.** Categorieën
krijgen kleur, data krijgt kleur, de rest blijft navy. De app wordt kleurrijker
doordat er meer betékenis op het scherm staat, niet doordat er meer versiering op
zit.

### Wat de meting opleverde, en waarom er drie kleuren zijn en geen twaalf

De kandidaat-categoriekleuren zijn door een validator gehaald die lichtheid,
chroma, contrast en onderling onderscheid bij kleurenblindheid berekent — niet
beoordeeld op het oog.

Op navy is goud vergeven aan het merk, en groen, oranje en rood aan status
(voortgang, wachten, deadline-risico). Wat overblijft is een smalle band. Deze
drie halen alle zes de controles, in donker én licht:

| Familie | Kleur | Gebieden |
|---|---|---|
| Lichaam & rust | `#4f97e8` | Fitness · Voeding · Zelfzorg · Mindfulness |
| Mensen & maken | `#e0578f` | Verbinding · Helpen · Creativiteit |
| Werk & groei | `#8f9c36` | Productiviteit · Organisatie · Leren · Vaardigheden · Veerkracht |

Elke vierde kandidaat viel om:

| Kandidaat | Waarop |
|---|---|
| Violet `#9d6ad8` | ΔE 3.9 tegen blauw (deutan) — en 13.9 bij gewoon kleurenzicht |
| Orchidee `#c96ae0` | ΔE 12.5 tegen magenta bij gewoon kleurenzicht |
| Roest `#b0703a` | ΔE 5.7 tegen olijf (deutan) |
| Cyaan `#33b8cf` | ΔE 10.9 tegen blauw bij gewoon kleurenzicht |

**Daaruit volgt de ontwerpregel: de kleur codeert de familie, het pictogram
codeert het gebied.** Dat is trouwens ook hoe Habit Huddle het doet — hun twaalf
gebieden worden uit elkaar gehouden door een pictogram en niet door een kleur.

⚠️ **Een pictogram is geen emoji in een label.** De emoji-regel (QS8-111) blijft
staan: geen emoji in app-tekst, want een schermlezer leest ze midden in een zin
voor. Een pictogram naast een label is iets anders dan een emoji erin.

⚠️ **Open gebleven:** worden deze drie kleuren opgenomen in het
Q-Projects-stelsel — waarmee de Status Tracker ze erft — of krijgt GoalBuddies een
eigen uitbreiding erop? Dat is een vraag over twee apps en niet over deze; hij
staat in het issue.

---

## A56 — De vragenlijst staat ná de aanmeldmuur

Habit Huddle's Genie staat vóór de muur, uitgelogd bruikbaar, en is daarmee hun
belangrijkste acquisitiekanaal. Ik legde voor om dat over te nemen, omdat we sinds
QS8-201 het scherm hebben dat het mogelijk maakt.

**Besluit: ná het aanmelden.** Dat scheelt een uitgelogd AI-eindpunt met alles wat
daarbij hoort — een limiet per venster, een misbruikvector, en een rekening zonder
gebruiker erachter.

De vragenlijst wordt dus een onboardingstap en geen trechter. Wat er wél uit
overgenomen wordt, is het deel dat het meeste waard is:

**De vraag "wat laat jouw gewoontes normaal gesproken stuklopen" wijst bij ons
naar machinerie die al gebouwd is.** Habit Huddle kan er een prompt mee bijstellen;
wij kunnen er functies mee aanzetten:

| Antwoord | Wat de app aanzet |
|---|---|
| Ik vergeet het gewoon | Notificaties op de huddledag (EPIC 11) |
| Motivatie zakt na week één | Weekpassen, en de vloer prominent (QS8-81, QS8-44) |
| Alles of niets | **De vloer** — letterlijk deze knop (domeinregel 8) |
| Niemand merkt het als ik stop | Peer-goedkeuring (domeinregel 3) |
| Mijn leven wordt chaotisch | Adempauze vooraf aankondigen (QS8-82) |

⚠️ **Twee van de vier vragen bestaan al.** Tijd per week en waar het eerder
vastliep staan in het zes-vragen-interview. Vandaag is QS8-205 gemerged, precies
omdat het interview twee vragen stelde die één scherm eerder al beantwoord waren.
Een nieuwe vragenlijst ernaast zetten zonder die overlap op te lossen, maakt
datzelfde probleem opnieuw en dan groter.

Het samenvattingsscherm — *"dit heb je me verteld, tik een antwoord aan om het te
wijzigen"* — wordt wel overgenomen. Dat is de goedkoopste vertrouwenswinst in de
hele flow en we hebben hem nergens.
