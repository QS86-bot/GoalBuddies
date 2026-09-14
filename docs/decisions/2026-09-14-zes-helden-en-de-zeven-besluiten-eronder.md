# Zes helden en de zeven besluiten eronder

**Datum:** 14-09-2026 · **Issue:** QS8-468 · **Raakt:** `docs/superhelden-archetypes.md`, `docs/helden-codex.html`, CLAUDE.md, `src/shared/theme`, `app/onboarding/vragenlijst.tsx`, `src/modules/notifications/regels.ts`

## Waar dit document voor is

De zes superhelden-archetypes zijn in augustus 2026 uitgewerkt in twee documenten
die tot 14-09-2026 alleen lokaal bestonden, buiten elke git-werkmap. Bij het
inbrengen ervan bleek dat het rooster op zeven punten botste met regels die dit
project al heeft, of een gat liet dat niemand kon invullen zonder te gokken.

Die zeven zijn op 14-09-2026 aan Quinten voorgelegd en door hem beslist.
**Dit document is de bron van die besluiten.** De brondocumenten zijn een
gedateerd verslag van augustus; waar ze iets anders zeggen, wint dit document.

⚠️ **Dat is geen vormkwestie.** De vorm waarop dit project al eens een issue
verkeerd gebouwd heeft, is precies deze: een besluit stond ergens anders dan de
oudste tekst, de bouwsessie las de oudste tekst, bouwde het tegenovergestelde,
**onderbouwde** die keuze in de migratiekop, en het is gemerged (QS8-408,
10-09-2026). Een afwijking die je uitschrijft leest de volgende persoon als een
reden om er niet aan te twijfelen.

## De zeven

### 1. De helden krijgen eigen namen

Strix, Ignis, Meridian, Forge, Lucerna, Quip.

De vraag die voorlag was of de app de historische figuren bij naam noemt —
Marcus Aurelius, Muhammad Ali, Amelia Earhart, Leonardo da Vinci, Florence
Nightingale, Mark Twain. Er lagen drie opties op tafel (wel, niet, of alleen bij
de publiek-domein-figuren). Quinten koos een vierde: **eigen namen**.

Dat is de sterkste van de vier en niet alleen de veiligste. Het rooster had één
open risico — Ali's nalatenschap bewaakt naam en beeltenis actief commercieel, en
het brondocument waarschuwt daar zelf twee keer voor — en een eigen naam haalt
dat bij de wortel weg in plaats van het te omzeilen. Wat er overblijft is
bovendien eigen, beschermbaar app-IP in plaats van een verwijzing.

De namen volgen het symbool: `strix` is Latijn voor uil, `ignis` voor vuur,
`lucerna` voor olielamp (en daarmee Nightingales bijnaam *The Lady with the
Lamp*), `meridian` verwijst naar het kompas, `forge` naar de blauwdruk, `quip`
naar Twains droge opmerking.

⚠️ **Ze zijn deels Latijn en deels Engels, in een Nederlandse app.** Dat is
besloten en geen slordigheid, maar het heeft een technisch gevolg: in `en.ts`
zijn de namen gelijk aan `nl.ts` en verschilt alleen de ondertitel. Een
catalogustest die eist dat elke sleutel tussen de twee talen verschilt, valt
hierop om.

### 2. Naam én archetype in de UI

"Strix" als naam, "De Wijze" als ondertitel. Twee i18n-sleutels per held.

De afweging: alleen de eigennaam is het sterkste merk maar dwingt een nieuwe
gebruiker zes namen te leren zonder houvast; alleen het archetype is meteen
begrijpelijk maar te generiek om je aan te hechten. Bij introductie van een held
staat er `Strix — De Wijze`; daarna volstaat de naam.

### 3. Quotes dragen hun bron, ook die van Ali

Onder elke quote staat wie het gezegd heeft en waaruit.

Correct attribueren is het eerlijkste, en het voorkomt dat een echt citaat als
verzonnen app-copy leest. Dat besluit 1 de naam uit de hoofd-UI haalt, verandert
daar niets aan: de bronvermelding onder een citaat is iets anders dan een
personage vernoemen.

⚠️ **De drie afgekeurde quotes blijven afgekeurd.** Het brondocument wijst er
drie aan die niet naar een bron te herleiden zijn of aantoonbaar van iemand
anders: de Earhart-quote *"The most difficult thing is the decision to act"*, de
aan Da Vinci toegeschreven *"I love those who can smile in trouble"* (is van
Thomas Paine, *The American Crisis*, 1776) en twee bekende Twain-nepquotes. Die
horen niet in de catalogus, en er hoort een test onder die dat bewaakt — dit is
een belofte die stil breekt zodra iemand later "een mooie quote" toevoegt.

⚠️ **De juridische eindcheck staat nog open.** Het brondocument raadt hem zelf
aan vóór productie. Dat is geen bouwissue en valt onder grens 1 van
*Beslisbevoegdheid*: het legt Quinten extern vast.

### 4. Een eigen kleurpalet, en CLAUDE.md wordt herschreven

De twaalf kleuren uit `docs/helden-codex.html` komen als eigen tokenset.

📏 Gemeten op 14-09-2026 tegen `src/shared/theme`: **nul** van de twaalf komt voor
in de bestaande tokenset. Twee liggen dichtbij — `#17224a` naast Strix' `#1B2A4A`,
`#cd9d34` naast `#C9A24B` — maar zijn niet gelijk, en bijna-gelijke kleuren naast
elkaar in één stelsel zijn duurder dan duidelijk verschillende.

CLAUDE.md zei tot vandaag: *"Gebruik uitsluitend Q-Projects-kleurstellingen — geen
zelfbedachte kleuren erbij."* Die zin is na dit besluit niet meer waar.

⚠️ **Daarom hoort het herschrijven van die regel bij het bouwissue en niet erna.**
Een regel die niet meer klopt en toch blijft staan, is erger dan geen regel: de
volgende sessie leest hem als verbod en bouwt eromheen, of leest hem als dood en
gaat ook aan de rest twijfelen. De grens die ervoor in de plaats komt is: navy en
goud zijn het stelsel van de app, de heldenkleuren gelden **alleen voor
heldenoppervlakken**.

⚠️ **Dit is geen tweede kleurstelsel.** Zodra een knop of kaart die niets met
helden te maken heeft een heldenkleur krijgt, is de regel niet verruimd maar
afgeschaft — en dat is precies hoe een standaard verschuift zonder dat iemand het
besloten heeft.

### 5. Zichtbaarheid volgt A41 — beschermd of open

Beschermde groep: je held en je verschijningen zijn privé. Open groep: de groep
ziet ze ook.

Er lag ook "volledig privé" op tafel, wat de regel *voor élk nieuw oppervlak is
beschermd het antwoord tot iemand het tegendeel besluit* letterlijk zou volgen.
Quinten koos A41, en dat is de bestaande route in plaats van een nieuw mechanisme
ernaast — één zichtbaarheidsschakelaar per groep in plaats van twee.

⚠️⚠️ **Wat dit besluit níet is.** De triggers `misser` en `stilte` zijn
tegenslagsignalen: wie ziet dat Ignis langs is geweest, weet dat er iets gemist
is. In een open groep is dat wat A41 toestaat. Overal elders is het de kern van
domeinregel 7. Concreet betekent dat:

- De basis is **eigenaar-only**, in RLS. De groepsroute is een aparte RPC met een
  **expliciete kolomlijst** — zelfde vorm en zelfde reden als
  `straffen_bij_uitstelverzoek()` (migratie 0218) en `getuigenissen()` (0169),
  want **RLS kan geen kolommen beperken** en een vierde tak op een select-policy
  geeft de hele rij weg.
- Een beschermde groep krijgt **nul rijen uit de database**, niet een lege lijst
  na filtering in de client. Via `lid_van_open_groep()`, zoals
  `groep_klassement()` (migratie 0141) het doet.
- De zes oppervlakken die óók in een open groep dicht blijven, blijven dicht.
  Loopt de heldenroute langs een ervan, dan is dat een omweg om een gesloten deur
  en geen verruiming.

### 6. Eén vragenlijst van acht vragen

De vier heldenvragen komen in `app/onboarding/vragenlijst.tsx` erbij, niet in een
tweede scherm ernaast.

⚠️ **Dit raakt besluit A56 (QS8-257) en heropent het deels.** Dat issue ging er
expliciet over dat het samenvattingsscherm het punt was en niet de vier vragen:
*"Dit heb je me verteld — tik een antwoord aan om het te wijzigen"* maakt het plan
van de gebruiker in plaats van van de app. Acht vragen met één samenvatting houdt
dat overeind; acht vragen met twee samenvattingen niet.

Het gedrag van A56 geldt onverkort voor de vier nieuwe vragen: **overslaan mag en
wist niets**. Wie alle vier de heldenvragen overslaat, krijgt geen hoofdheld en
geen foutmelding — de contextuele triggers werken dan gewoon.

### 7. Gelijkspel toont álle gedeelde koplopers

Niet "de top 2", zoals het brondocument zegt.

Vier vragen over zes helden geeft een maximum van 4 punten. **Een uitslag van
1-1-1-1 over vier verschillende helden is geen randgeval maar een normale
uitkomst**, en "de top 2" is dan niet gedefinieerd. De gebruiker krijgt alle
gedeelde koplopers te zien en kiest er zelf een.

⚠️⚠️ **Dit is regel 18 vraag 6 in zijn zuiverste vorm** — een feature die een
aanname van *er is er altijd precies één* optilt naar *er kunnen er meer zijn*.
De fout staat bij dit soort werk meestal al in de eerste opzet van de
scoringscode. Grep op `[0]`, `.find(`, `first`, `single()` en `maybeSingle()`
vóór je bouwt, niet erna.

Het brondocument is op dit punt **niet** stilzwijgend aangepast: de oude zin staat
er nog, met een gedateerde noot eronder die naar dit document wijst. Een
brondocument is een verslag van wat er toen besloten was; het herschrijven zou het
verslag onwaar maken.

## Wat er bewust buiten deze ronde valt

- **De Ziggle-loops en de Higgsfield-introductievideo.** Allebei betaalde externe
  tools. Dat is grens 1 van *Beslisbevoegdheid* — het kost Quinten geld en legt
  hem extern vast — en dus werk voor hem, niet voor een sessie. De briefs staan
  kant-en-klaar in `docs/superhelden-archetypes.md`.
- **Een eigen heldenscherm of heldenkaart op het overzicht.** Deze ronde is
  datamodel, quiz en stem in de meldingen die er al zijn. Een nieuw zichtbaar
  oppervlak is een eigen besluit, met de twee vragen van domeinregel 7 erbij.
- **Een held in een systeembericht.** De CHECK `chat_messages_system_event_bekend`
  is een allowlist die ook voor `service_role` geldt, en een systeembericht is een
  onveranderlijke kopie die de autorisatie overleeft waaronder hij gemaakt is. Dat
  is een besluit met de zwaarte van beslisdocument 002 §3, geen bijvangst.
- **Een zevende gastheld voor seizoensgebonden content.** Staat als openstaand
  punt in het brondocument.

## Wat hiervan getoetst wordt en wat niet

| Besluit | Wordt rood bij een schending |
| -- | -- |
| 3 — afgekeurde quotes | een test in het rooster-issue (QS8-469) |
| 4 — contrast van de twaalf | `src/shared/theme/contrast.ts` in QS8-470 |
| 5 — beschermde groep geeft nul rijen | RLS-tests in `tests/rls/` bij QS8-477 |
| 7 — alle koplopers, niet twee | een test die een vier-weg-gelijkspel voedt, QS8-474 |

⚠️ Besluit 1, 2 en 6 hebben geen eigen grendel. Ze zijn zichtbaar in de UI en in
de i18n-catalogus; een schending valt bij het lezen op. Dat is hier bewust — een
controle die niet te ijken is, is een aanname met een groen vinkje.
