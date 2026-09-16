# De kaart die bleef hangen na het vertrek

**Datum:** 16-09-2026
**Issue:** QS8-502
**Migratie:** 0277 — `invite_preview()`
**Raakt:** 0019 (één antwoord voor drie gevallen), 0128 (`avatar_url` eruit),
0131 (de teller), 0145 (blokkeren is stil), QS8-232 (de blokkade bij
`vraag_lidmaatschap_aan()`)

---

## 1. Wat er gemeten is

📏 Opstelling op de lokale stack: een groep op `zichtbaarheid = 'beschermd'`,
een eigenaar met het doel `Stoppen met drinken` gekoppeld aan die groep, en een
tweede gebruiker die **op `inactive` staat** (weggestuurd) én **geblokkeerd** is
door de eigenaar. Die tweede, ingelogd, met de oude code:

```
invite_preview('M3CODE123456') -> members[0].goal_title   = 'Stoppen met drinken'
                                  members[0].display_name = 'Eigenaar Vandenberg'
```

De volledige naam, niet de voornaam, en de **actuele** doeltitel — tot 60× per
uur. 📏 En `blokkade_met_groep(groep, hem)` gaf in diezelfde opstelling `t`: de
toets bestond al en werd alleen niet aangeroepen.

## 2. De naad: de schrijfkant was dicht en de leeskant niet

⚠️⚠️ Dit is het deel dat het onthouden waard is. 📏 `join_group_with_code()`
draagt allebei de toetsen die hier ontbraken — `blokkade_met_groep()` geeft
`invalid`, een `inactive`-lidmaatschap geeft `removed`. **Terugkomen kon hij dus
al niet.** Alleen de kaart erbóven bleef alles tonen.

Dat is onwrikbare regel 18 vraag 1 in zijn zuiverste vorm: twee correcte
onderdelen, en geen test op de knoop ertussen. Wie naar `join_group_with_code()`
keek zag een dichte deur; wie naar `invite_preview()` keek zag een functie die
"alleen maar een voorbeeldje" toont. De belofte — *wie eruit is, kijkt niet meer
naar binnen* — was van geen van beide een eigenschap.

⚠️ **Waarom het zwaarder weegt dan een voorbeeldkaart klinkt.** Domeinregel 4
zegt dat een lid andermans doelen alleen ziet *voor zover de groepsinstellingen
dat toestaan*. Hier kreeg een **niet-lid** ze, langs een `security definer` die
`goals_select` overslaat, en er was géén instelling die eroverheen ging — ook
`zichtbaarheid` niet. Het moment waarop dat pijn doet is precies het moment
waarop de meld- en blokkeerstroom van 0145 gebruikt wórdt.

📏 0128 haalde `avatar_url` uit dézelfde functie met het argument *"een
uitnodigingscode verloopt nooit en is bedoeld om doorgestuurd te worden"*. Dat
argument is nooit op `goal_title` toegepast, terwijl een doeltitel een orde van
grootte gevoeliger is dan een avatarpad.

## 3. De keuze: richting 2, verbreed

Het issue bood drie richtingen. Deze migratie doet de tweede, verbreed met een
tak op `status = 'inactive'`.

| Richting | Gedaan? | Waarom |
|---|---|---|
| 1 · `verwijder_lid()` roteert de code | nee | De prijs staat in het issue: een rotatie maakt **élke** uitstaande link ongeldig, ook die van mensen die nog niet gereageerd hebben. Dát is waarom roteren vandaag een handmatige beheerdersactie is. ⚠️ En het lost het geval niet eens op: een geblokkeerde die nooit lid was, wordt door geen rotatie geraakt. |
| 2 · `invite_preview()` toetst de blokkade | **ja, verbreed** | Goedkoop en precies, en het gebruikt een toets die er al is. ⚠️ Maar de blokkade alleen dekt het acceptatiecriterium niet — zie hieronder. |
| 3 · `goal_title` alleen bij `zichtbaarheid = 'open'` | nee | Een productbesluit, geen beveiligingsfix. `beschermd` is de standaard (A41), dus dit haalt de titels van vrijwel élke uitnodigingskaart — en acceptatiecriterium 2 zegt met zoveel woorden dat een gewone genodigde ze móét blijven zien, *"want daar staan ze voor"*. Wie die richting wil, verandert wat de kaart belóóft en niet wie hem mag zien. |

⚠️⚠️ **Waarom richting 2 verbreed moest worden, en dat is een meting en geen
voorzichtigheid.** Acceptatiecriterium 1 zegt *weggestuurd óf geblokkeerd*.
📏 Gemeten bij een weggestuurd lid dat **niet** geblokkeerd is:
`blokkade_met_groep()` geeft `f`. Richting 2 letterlijk genomen laat dat geval
dus staan. Dat staat vast als IJKING B in
`tests/rls/uitnodigingskaart-na-vertrek.test.ts`.

## 4. `null`, en niet een eigen antwoord

0019 maakte `null` één antwoord voor "ingetrokken, verlopen of nooit bestaan",
juist zodat deze functie geen orakel is. QS8-232 deed hetzelfde bij
`vraag_lidmaatschap_aan()`: de blokkade kreeg er géén eigen `reason` maar werd
aan het bestaande `not_open` gehangen, met in de bron *"drie antwoorden zouden
van deze functie een aftastinstrument maken"*.

0277 hangt er een vierde geval aan. Een eigen `reason` zou van blokkeren — dat
stil hoort te zijn (0145: *"hij krijgt geen bericht en kan het nergens zien"*) —
iets maken dat je kunt aflezen.

## 4a. De eerste versie sloot de leden buiten die er nog in zaten

⚠⚠ **Dit is de duurste fout van dit issue en hij was van mij.** De eerste versie
van de wachttak weigerde ook **actieve leden van de groep zelf**. Gevonden in de
security-review, daarna zelf nagemeten.

📏 Gemeten: Anna is actief admin, `mag_groep_lezen() = t`, `status = 'active'`.
Bram — ook actief lid — roept `blokkeer(anna)` aan. Daarna geeft
`invite_preview()` aan Anna `null` voor de code van haar **eigen** groep.

De oorzaak is dat `blokkade_met_groep()` niet vraagt *"is deze persoon eruit
gezet"* maar *"zit er ergens in deze groep een blokkade tussen deze persoon en
een actief lid"* — symmetrisch en groepsbreed. En blokkeren beéindigt geen
lidmaatschap: in `app/groep/leden/[id].tsx` zijn `blokkeerLid()` en `zetEruit()`
twee knoppen. Twee leden van dézelfde groep kúnnen dus een blokkade tussen zich
hebben.

⚠️ **Het misbruikpad was hoofdgedrag, geen randgeval.** Eén lid blokkeert in het
ledenscherm de andere elf — geen beheerdersrecht nodig, en `blokkades_plafond()`
staat sinds QS8-496 op 500 per dag — en vanaf dat moment ziet **niemand** in die
groep zijn eigen uitnodigingskaart nog. Het scherm meldt dan dat de uitnodiging
is ingetrokken of verlopen, wat onwaar is. Blokkeren is stil (0145), dus de
oorzaak is niet te vinden, en alleen de blokkeerder kan het opheffen.

**De reparatie is één voorwaarde:** `not mag_groep_lezen(g.id)` vóór de rest van
de tak. Die helper is precies *"heeft een actief lidmaatschap"*, dus een
weggestuurd lid (`false`) en een nooit-lid (`false`) lopen nog steeds in de tak,
en een actief lid niet. Een actief lid dat de kaart wél krijgt lekt niets: alles
erop leest hij toch al via de gewone, `mag_groep_lezen()`-afgeschermde
oppervlakken.

⚠⚠ **Waarom mijn eigen ijkingen dit niet vonden.** A, B en C braken alle drie
de wéigering en keken of die omviel. Geen van drieën vroeg of de weigering te
brééd was. En de twee must-allows die er stonden gingen allebei over iemand die
géén lid is — de genodigde en de anonieme bezoeker — dus ze bleven groen terwijl
de kaart voor elk actief lid weg was. **Een ijking bevestigt dat je grendel doet
wat je dacht; hij zegt niets over of je de goede grendel hebt.** Dat is dezelfde
les als bij QS8-496, en dit is de derde keer in drie issues.

IJKING D legt het nu vast.

## 5. De toets staat vóór de teller — en de eerste reden die hier stond was onwaar

⚠⚠ **Hier stond: *"anders legt een weggestuurd lid het uitnodigen van de hele
groep een uur stil"*. Dat is aantoonbaar onjuist**, gevonden in de
security-review. 📏 Gemeten: de wachttak begint met `auth.uid() is not null`, en
`invite_preview()` is `anon`-uitvoerbaar — over HTTP bevestigd, `POST
/rpc/invite_preview` zonder `Authorization` geeft 200. Dezelfde weggestuurde
persoon, uitgelogd, krijgt de kaart **én** hoogt de teller op:

| | kaart | teller |
|---|---|---|
| ingelogd | `null` | geen rij |
| uitgelogd, zelfde persoon, zelfde code | volledige kaart | 1, daarna 4 |

Die DoS bestaat dus nog, maar hij is niet van 0277: hij hoort bij 0131 en geldt
voor iedereen die de code heeft. Hij staat nu als rij in
`docs/ENGINEER-REVIEW.md`.

**De volgorde blijft staan, om een reden die wél houdt.** Een ongeldige code
keert terug vóór de `insert … on conflict` en laat géén tellerrij achter. Stond
de wachttak eráchter, dan liet een géldige code wél een rij achter — ook voor wie
uitgesloten is — en dan is het verschil tussen *"deze code bestaat niet"* en
*"jij bent eruit"* af te lezen aan de teller. Nu lijken die twee ook in wat ze
achterlaten op elkaar, en dat is precies waar het ééne antwoord van §4 voor is.

⚠️ **De les is niet "beter nameten" maar waar dit geld kost.** CLAUDE.md zegt
het met zoveel woorden: *een afwijking die je onderbouwt is duurder dan een die
je vergeet* — een omissie valt op, een uitgeschreven argument leest de volgende
persoon als een reden om er niet aan te twijfelen. Deze paragraaf stond met een
📏-teken erbij terwijl er alleen de ingelogde helft gemeten was.

## 6. Wat dit niet dicht doet

⚠️ **Het vergelijkingskanaal blijft open.** Wie geblokkeerd is krijgt `null`
waar een vriend met dezelfde code een kaart krijgt; wie die twee naast elkaar
legt, weet dat er iets is. Dat geldt woordelijk ook voor
`vraag_lidmaatschap_aan()` sinds QS8-232, en het alternatief — een népkaart
tonen — is erger, want dan lekt hij weer namen en titels. Eén antwoord voor vier
gevallen is de beste vorm die hier bestaat.

⚠️ **De code blijft geldig.** Dit haalt het vénster weg, niet de sleutel.
Terugkomen kon al niet, maar wie de code doorstuurt naar iemand anders geeft nog
steeds een werkende link weg. Dat is de eigenschap van een code die nooit
verloopt; richting 1 is de enige die hem raakt, en die is hierboven afgewogen.

## 7. De ijkingen

📏 Mutatie per grendel, 16-09-2026:

| IJKING | Gebroken | Wat er omviel (van 6) |
|---|---|---|
| A | de hele wachttak | 3 — beide weigeringen én de teller; de must-allows bleven groen |
| B | alleen de `inactive`-tak (blokkade blijft) | **2** — de weggestuurde én de teller; de geblokkeerde bleef groen |
| C | de wachttak ná de teller | 1 — de teller-toets, op zijn eigen belofte |
| D | `not mag_groep_lezen(g.id)` uit de tak | 1 — en precies de must-allow van §4a; de andere vijf bleven groen |

⚠️ **Bij B stond eerst "1 rood", en dat was een voorspelling en geen meting.**
De weggestuurde kijkt dan niet alleen weer naar binnen, hij stookt óók de teller
weer vol. De kop van het testbestand draagt nu het gemeten getal.

⚠️⚠️ **En de teller-toets deugde eerst niet.** Zijn lus beweerde bij elke
aanroep dat de weggestuurde `null` kreeg — iets wat de toets erbóven al
vastlegt. 📏 Gezien bij IJKING C: hij viel om op *"aanroep 57 gaf een kaart"*,
wat over de weigering gaat en niet over de genodigde. De lus toetst nu niets en
de belofte staat er alleen achter. **Een toets die struikelt vóórdat hij toekomt
aan wat hij belooft, bewaakt die belofte niet** — dezelfde les als bij QS8-496,
en dit is de tweede keer in twee issues dat hij zich voordoet.

⚠⚠ **En de opstelling zelf is twee keer fout geweest, allebei gevangen door een
eigen controle erin.** 📏 Eerst riep hij `verwijder_lid()` aan op iemand die
nooit was toegetreden: de RPC gaf géén fout en liet géén rij achter. 📏 Daarna
stelde hij de premisse vast met `mag_groep_lezen()` via `psql()` — dat draait als
superuser zónder JWT, dus `auth.uid()` is null en de helper geeft altijd `f`.
Allebei de keren viel de toets om op zijn eigen opstelling. **Zet in een
opstelling een controle op wat je denkt te hebben neergezet**; dat is hier drie
issues op rij het verschil geweest tussen een toets die meet en een die dat
alleen lijkt te doen.

## 8. Wat de security-review verder vond en wat ermee gebeurd is

| Bevinding | Wat ermee gedaan is |
|---|---|
| **K1** — actieve leden buitengesloten | Gerepareerd, zie §4a, met IJKING D eronder |
| **M2** — de DoS-onderbouwing van de volgorde is onwaar | §5 herschreven; de DoS staat als rij in `ENGINEER-REVIEW.md` |
| **M3** — de opstelling zette `inactive` met de hand | Gaat nu via `join_group_with_code()` + `verwijder_lid()`, zodat de naad zelf getoetst wordt |
| **M4** — geen must-allow voor een actief lid | Toegevoegd en geïjkt met de K1-mutatie (IJKING D) |
| L5 — timing onderscheidt "ingetrokken" van "jij bent eruit" | Rij in `ENGINEER-REVIEW.md` |
| L6 — wat een weggestuurd lid anóniem overhoudt | Rij, en §6 hierboven noemt het |
| L7 — `order by target_date` zonder tiebreaker | Rij; voorbestaand uit 0128 |
| L8 — de guard weigert stil in plaats van luid | Rij; geen gat, wel goed om te weten |
| L9 — `goals` heeft geen expliciete DELETE-policy | Rij; voorbestaand, buiten dit issue |

⚠️ **Wat er níet gerepareerd is, is niet weggeschreven maar weggezet met een
voorwaarde** — elke rij zegt wanneer hij zwaarder wordt.

