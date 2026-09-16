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

## 5. De toets staat vóór de teller, en dat is gemeten

⚠️⚠️ Geen stijlkeuze. De teller van 0131 is **per groep**: raakt hij vol, dan
krijgt iedereen met die code `{limiet_bereikt: true}`.

📏 Gemeten vóór 0277: een weggestuurd lid maakte de teller met 61 aanroepen vol,
waarna een échte genodigde de kaart niet meer kreeg. Wie de kaart niet mag zien,
kon het uitnodigen van de héle groep een uur lang stilleggen.

De wachttak staat daarom vóór de `insert … on conflict`. 📏 Na 0277 laten
dezelfde 61 aanroepen de teller onaangeroerd en ziet de genodigde de groep nog.

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

| IJKING | Gebroken | Wat er omviel (van 5) |
|---|---|---|
| A | de hele wachttak | 3 — beide weigeringen én de teller; de must-allows bleven groen |
| B | alleen de `inactive`-tak (blokkade blijft) | **2** — de weggestuurde én de teller; de geblokkeerde bleef groen |
| C | de wachttak ná de teller | 1 — de teller-toets, op zijn eigen belofte |

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
