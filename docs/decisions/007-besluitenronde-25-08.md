# 007 — Besluitenronde 25-08-2026: A48, A49, A50, A51, A52

**Datum:** 25-08-2026
**Issues:** QS8-110 (A48), QS8-136 (A49), en A50 uit de bevindingenronde
**Besluitnemer:** Quinten

Twee besluiten die allebei uit de review-ronde op EPIC 13 kwamen, en die
allebei op hetzelfde patroon rusten: **een bestaande primitieve handeling waar
een nieuw besluit stilzwijgend op is gaan leunen.**

---

## A48 — wat krijg je bij een gehaalde week ✅ gebouwd (variant 3)

**Besluit: variant 3 nu, variant 2 erbovenop zodra er mijlpalen zijn.**

Een vaste, handgeschreven set van vijf korte regels per doelcategorie, gekozen
op de startdatum van de cyclus. `src/shared/ui/tips.ts`, catalogus
`weektip.<categorie>.<n>` in beide talen, getoond op de weekdoelkaart zodra de
status `approved` is.

### Waarom er iets moest komen

Tot nu toe kreeg je één weekpas na je eerste voltooide week en daarna één per
zes (A32). Tussen week één en week zes vijf keer niets — en dat zijn precies de
weken waarin iemand afhaakt. Het spelregels-document beloofde "cadeaus" in het
meervoud; de app deed er één.

### Waarom gefaseerd en niet variant 2 ineens

Variant 2 — een tip van de Doelcoach per mijlpaal — is de sterkere beloning: er
is een coach die je doel, je mijlpalen en je weekdoelen kent, en dat kan geen
andere app. Maar hij heeft twee problemen die variant 3 niet heeft:

1. **Elke AI-call kost geld** (onwrikbare regel 6). Eén tip per gebruiker per
   week is bij 100k gebruikers 100k calls per week. Per mijlpaal genereren en
   hergebruiken lost dat op, maar pas zodra mijlpalen er zijn.
2. **Iemand zonder mijlpalen krijgt niets.** Dat is elke nieuwe gebruiker in
   zijn eerste week — de gebruiker die deze beloning nou juist moest vasthouden.

Variant 3 is daarmee geen tussenoplossing die later weggegooid wordt, maar de
**terugval** waar variant 2 bovenop komt. Dat is de reden dat de volgorde
andersom is dan de sterkte van de varianten.

### Twee dingen die in geen enkele variant mogen

- **Geen extra punten.** Punten zijn een meeteenheid, geen valuta. Het
  puntenplafond per doel is de som van de plafondpunten van zijn weekdoelen
  (domeinregel 10); een bonus uit een andere bron breekt die som, en dan zegt
  een dalend totaal niets meer. Het zou bovendien de enige plek in het model
  zijn waar je punten verdient zonder een week te halen.
- **Geen wijze quote van een dood iemand.** Dat was het oorspronkelijke idee en
  het is afgevallen: willekeurige wijsheid wordt binnen drie weken herkend als
  opvulling, en slecht getimede wijsheid voelt als een preek. Deze regels gaan
  over de wéék die je net gehaald hebt.

### Vier keuzes in de uitvoering die niet vanzelf spreken

1. **Deterministisch op de cyclusdatum, niet willekeurig.** `Math.random()` zou
   bij elke render een andere regel geven — dan flikkert de tekst tijdens de
   viering, en twee schermen die hetzelfde moment tonen spreken elkaar tegen.
2. **De tip blijft staan en verdwijnt niet met het feestje.** Dat duurt 2,2
   seconden, te kort om een zin te lezen die de moeite waard is. Hij hangt ook
   niet aan `vieringenAan`: wie de confetti uitzette, zette geen tekst uit.
3. **Aan `approved` en niet aan het indienen.** Zelf afvinken is geen
   goedkeuring (domeinregel 3) — dezelfde grens als bij het feestmoment.
4. **De categorie komt uit dezelfde `fetchDoelen()` als de doeltitels.** Een
   query per kaart zou hier de N+1 zijn die onwrikbare regel 12 met naam noemt,
   en dat voor één regel tekst.

### ⚠️ Twee naden, want elk onderdeel klopte al

Dit is de vorm uit onwrikbare regel 18: de regels zijn goed, de catalogus is
compleet, de functie is getest — en het geheel kan alsnog een sleutel op het
scherm zetten.

- `TIP_CATEGORIEEN` is een **kopie** van `CATEGORIEEN` uit `modules/goals`, want
  `shared` mag niet van een module afhangen. Elke andere test loopt over die
  kopie en blijft dus groen als er een categorie bijkomt waar geen regels voor
  bestaan. Eén test legt beide lijsten naast elkaar.
- `Doel.category` is een `string` en geen `Categorie`: de database kan een
  waarde bevatten die deze build niet kent. `t()` geeft bij een ontbrekende
  sleutel **de sleutel zelf** terug, en dat is deze maand al twee keer als tekst
  op het scherm beland. `weektip()` zeeft daarom zelf en valt terug op `other`.

Allebei met de hand gebroken om te zien dat ze rood worden — de standaard voor
elke controle in dit project.

⚠️ **De categorieën zijn `business`, `study` en `other`**, niet de
`business, health, …` uit het oorspronkelijke voorstel. Dat is wat `CATEGORIEEN`
werkelijk bevat; komt er een categorie bij, dan wordt de naadtest rood.

⚠️ **Geen regel noemt een tegenvaller.** Geen "je loopt achter", geen "volgende
keer beter". Domeinregel 7 gaat over wat de groep ziet, maar de toon geldt ook
voor tekst die alleen jij leest. Alle vijftien regels in beide talen staan onder
die test, niet alleen de regel die deze week gekozen wordt.

---

## A49 — een bewaarde uitnodigingscode verloopt ✅ gebouwd

**Besluit: variant 2 én 3.** Een bewaarde code wordt na **24 uur** niet meer
vanzelf verzilverd, en een **open** groep wordt nooit automatisch betreden.

### Waarom dit een besluit werd en geen bugfix

`bewaarOpenstaandeUitnodiging()` is gebouwd voor het hoofdpad van QS8-59: je
tikt een uitnodigingslink aan, maakt een account, bevestigt je e-mail en landt
in een verse app-sessie waar het scherm met de code allang weg is. Zonder die
opslag kom je dan níét in de groep, terwijl de uitnodigingspagina letterlijk
belooft dat dat wél gebeurt.

Die opslag is gebouwd toen meedoen aan een groep **geen privacygevolgen had**.
Sinds besluit A41 heeft het die wel: toetreden tot een **open** groep maakt je
gemiste weken zichtbaar voor de anderen — dezelfde overgang als het ópenzetten,
waar een beheerder een volledig bevestigingsblok voor doorloopt.

Dat is exact het patroon waar `CLAUDE.md` voor waarschuwt bij weggelegde
bevindingen: **vraag bij elke nieuwe beslissing die op een bestaande primitieve
handeling leunt of daar iets over is weggelegd.** Hier was dat niet gebeurd, en
de critical-user-ronde vond het.

### Wat er precies gebeurt

| Situatie | Wat de app doet |
| -- | -- |
| Code jonger dan 24 uur, groep **beschermd** | Vanzelf toetreden, zoals voorheen |
| Code jonger dan 24 uur, groep **open** | Naar `/uitnodiging/<code>` — jij drukt |
| Code ouder dan 24 uur | Naar `/uitnodiging/<code>` — jij drukt |
| Groep niet op te halen | Naar `/uitnodiging/<code>` — dát scherm legt het uit |
| Opslagvorm van vóór A49 (kale code, geen tijdstip) | Telt als verlopen |

⚠️ **Een verlopen code wordt niet weggegooid maar getóónd.** Weggooien zou de
uitnodiging doodmaken, en dat is precies wat deze opslag moest voorkomen. De
gebruiker landt op het uitnodigingsscherm en kan zelf drukken.

⚠️ **Zonder tijdstip is de leeftijd onbekend, en onbekend is hier de kant waar
niets vanzelf gebeurt.** Dat is waarom de oude opslagvorm als verlopen telt en
niet als vers.

### Waarom 24 uur

Het dekt het hoofdpad waar de opslag voor bestaat — een bevestigingsmail
aantikken — en laat de rest niet meer stilzwijgend doorlopen. Zonder termijn kon
iemand die de link twee weken geleden opende en toen besloot niet mee te doen,
alsnog in die groep belanden zodra hij een account aanmaakte.

⚠️ **De aftrekking staat in `shared/time`** (`ouderDan()`), niet in de module.
Correctheidsregel 7 kent geen uitzondering voor "het is maar één aftrekking".

---

## A50 — de groep mag de adempauze zien ✅ vastgelegd

**Besluit: de matrix wijkt, niet de code.**

`docs/decisions/001-datamodel.md` zei bij `breathers`: *"groepsleden zien alleen
dat er een pauze loopt"*. `breathers_select` gaf altijd de héle rij, inclusief
`starts_cycle` en `ends_cycle`, en `src/modules/goals/adempauze.ts` beschrijft dat
óók zo — de groep hoort *"Sanne heeft een adempauze van week X tot Y"* te zien,
want dat is het acceptatiecriterium "vooraf aangekondigd" van QS8-82.

Twee documenten zeiden dus iets anders. Quinten heeft op 25-08 beslist welk
document wijkt: de matrix.

### Waarom dat de juiste kant is

⚠️ **Aankondigen is de eigen handeling van de gebruiker, en dat is precies de
uitzondering die domeinregel 7 zelf maakt.** De regel zegt dat tegenslag de groep
alleen bereikt via de gebruiker zelf, en noemt daar drie routes bij: vraag 2 van
de weekafsluiting, "vraag je groep om hulp", en het deadline-verzoek. Een
adempauze vooraf aankondigen is dezelfde vorm — je kiest zelf om het te delen,
vóórdat de week voorbij is.

⚠️ **En een aankondiging vooraf is iets anders dan een gemiste week achteraf.**
Dat onderscheid is de hele reden dat de regel bestaat. "Ik neem twee weken pauze"
is een plan; "hij heeft die twee weken niet gehaald" is een oordeel.

### Wat hierdoor níét opengaat

**Welke weken er in die periode gemist zijn.** Dat staat in
`weekly_goals.status`, en dat is sinds migratie 0047 afgeschermd voor
groepsgenoten — `excused` incluis, en juist die waarde hoort bij een adempauze.
De groep ziet dus de pauze en niet de weken.

### ⚠️ De eigenlijke bevinding was een andere

Dit oppervlak stond **helemaal niet** in `002-domeinregel7-oppervlakken.md`,
terwijl het sinds QS8-82 bestaat en de groep het leest. `CLAUDE.md` zegt
letterlijk: *"Werk dat document bij bij elk nieuw oppervlak."* Dat is hier niet
gebeurd, en daardoor kon de tegenspraak tussen twee documenten maanden blijven
staan zonder dat iemand hem tegenkwam.

Het staat er nu als **oppervlak 21**, in beide tabellen — ook in de A41-tabel van
§6b, waar het niet varieert op `groups.zichtbaarheid`: de eigen handeling van de
gebruiker staat in béide standen open, net als de weekafsluiting (10) en het
deadline-verzoek (16).


---

## A51 — één reviewpunt per buddy per cyclus ✅ gebouwd (migratie 0094)

**De vraag.** `award_points_on_approval()` boekte sinds 0021 één punt
`review_given` per beoordeelde voltooiing. Migratie 0093 zette daar diezelfde dag
een bovengrens van vijftig per etmaal op; dit besluit gaat over de open helft:
blijft het per voltooiing, of wordt het per buddy per cyclus?

**Besloten: per buddy per cyclus.** Twee weekdoelen van dezelfde buddy in
dezelfde week leveren samen één punt op; een andere buddy of een andere week
levert er wél een tweede op.

### Waarom — en waarom niet vanwege het misbruik

De bevinding van 17-08 ging over misbruik: twee accounts die elkaars weken
blijven indienen en beoordelen konden elkaars buddy-bijdrage opblazen. Dat is
**niet** de doorslaggevende reden geweest, en dat is het opschrijven waard.

Punten zijn privé (domeinregel 10, herbevestigd als A42). Wie zijn eigen
reviewpunten opblaast, bedriegt alleen zichzelf — precies de categorie die de rij
van 17-08 in `docs/ENGINEER-REVIEW.md` zelf "zelfbedrog, geen autorisatiegrens"
noemde. Was dat het enige argument geweest, dan had de rem van 0093 volstaan tot
er een ranglijst kwam.

De reden is een **modelleerfout die los staat van misbruik**: met een punt per
voltooiing hangt je buddy-score af van het gedrag van iemand ánders. Wie een
productieve buddy heeft die drie weekdoelen per week indient, verdient drie keer
zoveel als wie een bescheiden buddy heeft — bij precies evenveel aandacht. Dat
meet niet wat het zegt te meten.

Het was ook structureel af te lezen: `review_given` was de énige reden in
`points_ledger` met `goal_id = null`. Elke andere boeking hangt aan een doel van
jou; deze hing aan de voortgang van een ander. Dat was geen toeval maar het
symptoom.

En het sluit aan bij wat dit project elders al gekozen heeft. De Ketting en de
reeks tellen óf je er was, niet hoe vaak. Reviewpunten waren de enige plek waar
volume telde.

### Wat er níét gekozen is

**Variant 3 — `review_given` helemaal uit het grootboek halen** en vervangen door
een optellende teller in de A42-vorm ("je hebt 47 weken van je buddies
bekeken"). Dat is schoner gemodelleerd: bijdragen aan een ander en je eigen
weekresultaat zijn twee dingen, en één score die ze optelt zegt geen van beide
scherp. Afgewezen omdat het een tweede oppervlak oplevert en een breder
productgesprek vraagt dan deze bevinding rechtvaardigt. ⚠️ Blijft een geldige
vraag zodra het puntentotaal ergens zichtbaar gaat worden.

### Gevolgen die je moet kennen

- **"Vertel me meer" claimt het punt voor die cyclus**, en de goedkeuring die er
  later op volgt levert niets extra's op. Dat is bedoeld: een echte vraag stellen
  ís de aandacht die dit punt beloont, en het haalt de prikkel weg om snel af te
  stempelen om het punt binnen te halen.
- **De dagrem van 0093 is weer verwijderd.** Dat is geen terugdraaien maar het
  afmaken: die vijftig per etmaal was de interim-maatregel voor precies dit
  probleem. Nu de oorzaak weg is, is de rem schadelijk — het natuurlijke maximum
  is het aantal buddies (tien groepen maal elf is honderdtien per cyclus), en
  vijftig zou een legitieme uitschieter afknijpen.
- **Er is een kolom bijgekomen**, `points_ledger.cycle_start_date`, vandaag
  uitsluitend gevuld voor `review_given`. Het alternatief was een afgeleide
  `ref_id` (`md5(buddy || cyclusstart)::uuid`) en dat is bewust niet gedaan: zo'n
  waarde is deterministisch maar ondoorzichtig, en over een jaar staat er een
  uuid in het grootboek waarvan niemand meer weet hoe hij gemaakt is.

### De naad die dit besluit zelf opleverde

⚠️ `points_ledger_dedupe_idx` dekte álle redenen. Zou hij zo zijn blijven staan,
dan had hij op de nieuwe vorm uniciteit afgedwongen op (beoordelaar, buddy) — dus
één punt per buddy vóór áltijd in plaats van per cyclus. De tweede cyclus zou
stil zijn weggevallen op `on conflict do nothing`, en geen enkele test zou daar
rood van zijn geworden. De index is daarom versmald tot alles behalve
`review_given`, en die reden kreeg een eigen index mét de cyclus erin.

⚠️ En een unieke index bijt niet op NULL: een `review_given`-rij zonder buddy of
zonder cyclus zou onbeperkt dupliceerbaar zijn, en dan is de index er wel maar
doet hij niets. De CHECK `points_ledger_review_volledig` maakt die situatie
onmogelijk. **De index en de CHECK zijn samen het slot, niet apart.**

### Waarom nu

`points_ledger` stond op nul rijen — nagemeten, niet aangenomen. Na de eerste
gebruiker is dit een migratie op een gevuld grootboek dat append-only is
(domeinregel 6), en dan moet dezelfde wijziging met correctie-records in plaats
van een herdefinitie.

---

## A52 — het vinkje per lid blijft, en het is geen vierde verruiming ✅ vastgelegd

**De vraag stond sinds 19-08 open in `docs/ENGINEER-REVIEW.md` en heette daar de
scherpste bevinding van die reviewronde.** `Ketting.tsx` toont met opzet
aantallen en nooit namen — dat is domeinregel 7 in een component. Twintig pixels
lager toont `MemberRow` per lid, mét naam, of die zijn periode heeft afgesloten.
In een groep van drie is "1 schakel deze week" daarmee geen anonimiteit maar een
rekensom die het scherm zelf al voor je heeft opgelost.

De rij noemde drie richtingen: het vinkje weghalen, de teller accepteren als
samenvatting van iets dat toch al per persoon zichtbaar is, of de per-persoon-
weergave vastleggen als **vierde verruiming** naast A15 en A7.

**Besluit: de tweede. Het vinkje blijft, en het is uitdrukkelijk géén verruiming.**

### Waarom het geen verruiming is

Een verruiming is een plek waar de groep tégenslag ziet. A15 (de reeks) en A7
(het verschoven deadline) zijn dat allebei: een reeks die op 1 staat verraadt een
gebroken reeks, en een verschoven streefdatum is een niet-gehaalde afspraak.

Dit oppervlak is dat niet. Domeinregel 7 somt op wat de groep wél mag zien en
begint de opsomming met *"afgeronde weekdoelen"*. Een gevuld vinkje ís dat
signaal. En het lege vinkje is geen tegenhanger, omdat het scherm nooit iets
anders vraagt dan de lópende periode — waarin "leeg" alleen "nog niet" kan
betekenen.

### Wat de constructie binnen de regel houdt

⚠️ **Niet de discretie van het scherm, maar het venster in de database.** Buiten
de lopende periode geeft `group_overview()` `closed_this_period = false` en geeft
`chain_links_select` geen rijen van een ander (migratie 0037). Zou dat venster
wegvallen, dan is exact dezelfde ledenlijst wél een presentielijst over een
afgesloten week — en dan is een ontbrekend vinkje een publieke gemiste week.

Dat venster is getest in `tests/rls/epic8.test.ts`, en de test is onderscheidend:
er stáát een schakel op de oude periode, dus hij wordt ook rood als het venster
wegvalt in plaats van alleen als er niets te zien is.

### Wat hier níét uit volgt

⚠️ **Dit is geen argument om De Ketting namen te laten tonen**, en geen argument
om het venster van acht dagen op te rekken. *"De ledenlijst laat het toch al
zien"* is precies de redenering waarmee een standaard verschuift zonder dat
iemand hem verschoven heeft — dezelfde vorm als bij A17, dat om die reden op
20-08 is teruggedraaid.

In een **open** groep vervalt het venster wél. Dat is A41 en niet dit besluit.

### ⚠️ Bij het sluiten bleek het signaal alleen in kleur te bestaan

Het vinkje was een `View` van tien bij tien pixels met een achtergrondkleur en
zonder label. Voor wie een schermlezer gebruikt bestond het positieve signaal dus
niet, terwijl naam en reeks eronder wél werden voorgelezen; voor wie kleuren niet
onderscheidt was het een grijs bolletje naast een gekleurd bolletje.

Dat is niet alleen een toegankelijkheidsgat. Domeinregel 7 draait erom dat de
groep ziet wat er áf is — en dat deel van de app werkte voor een deel van de
gebruikers niet. De rij spreekt sinds 25-08 met één stem, uit `ledenrijLabel()`
in `src/shared/ui/metrics.ts`.

De belofte die daar getoetst wordt is niet "de rij is voorleesbaar" maar **"de
afwezigheid blijft stil"**: het label van een lid dat nog niet afrondde is exact
het label van een lid dat dat wél deed, minus die mededeling — er komt niets voor
in de plaats. De test kijkt daarbij naar wat dit label *toevoegt* en niet naar het
label als geheel, want "Nog geen reeks" mag er wél in staan (dat is A15).
Met de hand gebroken door een "nog niet afgerond" toe te voegen; dan vallen er
twee tests om.
