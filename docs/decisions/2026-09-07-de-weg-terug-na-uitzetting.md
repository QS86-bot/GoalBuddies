# Een aangenomen verzoek maakt je ook echt lid

**Datum:** 07-09-2026 · **Issue:** QS8-328 · **Migratie:** 0188 ·
**Volgt op:** QS8-314 (0187), en op 0102

## Wat er stond

`beslis_lidmaatschapsverzoek()` deed bij aannemen:

```sql
insert into group_members (group_id, user_id, role, status)
values (…, 'member', 'active')
on conflict do nothing;
```

Lag er al een rij voor die gebruiker, dan deed de insert niets. De
`group_events`-rij en het antwoord `{"ok": true, "status": "accepted"}` volgden
daarna **onvoorwaardelijk**.

## De meting

⚠️ **Het issue vroeg met zoveel woorden om dit eerst te méten en niet uit de bron
te concluderen**, en dat is hier gedaan: een lokale stack, echte JWT's, een echte
fixture. Anna zet Cor uit de groep, Cor vraagt lidmaatschap aan, Anna neemt aan.

| Wat | Vóór 0188 |
| -- | -- |
| `beslis_lidmaatschapsverzoek` | `{"ok": true, "status": "accepted"}` |
| `group_members.status` van Cor | `inactive` — **onveranderd** |
| `group_events` | een rij `join_request_decided` |

De test die dat vastlegt viel om op precies één regel: *expected 'inactive' to be
'active'*. Dat is de meting, en niet de redenering die eraan voorafging.

## Waarom dit geen randgeval is maar de normale weg terug

De eerste lezing was dat dit een race is — iemand kwam intussen via een
uitnodigingscode binnen, en dan is de gewenste toestand toch al bereikt. Dat
staat ook zo in het oude commentaar. 📏 Bij het meten bleek er een tweede,
gewóne route te zijn, en die is de belangrijke:

- `vraag_lidmaatschap_aan()` weigert een aanvraag van een bestaand lid, maar
  toetst `m.status <> 'inactive'`. **Een uitgezet lid mág dus aanvragen.**
- `join_group_with_code()` weigert datzelfde lid met `removed` (0029).

Dat betekent dat de aanvraag **de enige weg terug is** voor iemand die uit een
groep gezet is. En die weg liep dood in een `on conflict do nothing`, terwijl de
beheerder te horen kreeg dat het gelukt was.

⚠️ **Twee functies die elk op zich klopten, en samen een dood pad vormden.** Dat
is regel 18 vraag 1 in zijn zuiverste vorm: de fout zat niet in een onderdeel
maar op de naad, en beide kanten hadden tests.

## Het besluit

De bestaande rij wordt gelezen in plaats van weggeslikt:

| Wat er ligt | Wat er gebeurt |
| -- | -- |
| geen rij | invoegen, zoals hiervoor |
| `active` | niets — de gewenste toestand is al bereikt (de echte race) |
| `inactive` | heractiveren: dit is de terugkeer waar het verzoek om vroeg |
| `paused` | idem; de tak bestaat, de toestand vandaag nog niet (QS8-325) |

**In alle drie de aangenomen gevallen geldt daarna: zegt de functie `ok`, dan is
de aanvrager ook echt actief lid.** Dat is de belofte waar de test op staat, en
niet de tak.

### Waarom heractiveren en niet weigeren

Denkrichting 1 en 3 uit het issue kwamen uit op een eigen `reason` voor een
uitgezet lid — de beheerder hoort te weten dat hij iemand terughaalt. Dat is niet
gekozen, om één reden die pas bij het meten zichtbaar werd: **weigeren maakt de
terugweg definitief dood.** `join_group_with_code()` is al dicht voor een
uitgezet lid; zou het verzoek ook geweigerd worden, dan komt iemand die er een
keer uit gezet is nóóit meer binnen, en is de uitzondering `m.status <>
'inactive'` in `vraag_lidmaatschap_aan()` zinloze code.

Het signaal dat de beheerder iemand terughaalt gaat wél mee, maar in het
**antwoord aan de aanroeper** (`teruggekeerd: true`), niet in de geschiedenis —
zie hieronder.

### Waarom `role` mee terug moet naar `member`

⚠️ **Dit is een beveiligingskwestie en geen netheid.** `verwijder_lid()` zet
alléén `status` op `inactive` en laat `role` staan. De rij van een uitgezette
beheerder draagt dus nog `role = 'admin'`. Alleen de status omzetten zou die
rechten stilzwijgend teruggeven aan precies de persoon die er uit gezet was.

De invoegtak schrijft al `'member'`; de terugkeertak doet nu hetzelfde. De test
zet Cor daarom eerst op `admin` vóór hij verwijderd wordt — zonder die stap
toetst hij een rij die toch al `member` was, en dan bewaakt hij niets.

### Waarom de auditrij ongewijzigd blijft

De verleiding was om `teruggekeerd` in `group_events.new_value` te zetten, zodat
de groep ziet dat hier iemand terugkomt. Niet gedaan.

⚠️ **De eerste onderbouwing hiervoor was onjuist, en de security-review heeft hem
gemeten.** Er stond dat zo'n veld een *nieuw* oppervlak zou zijn waarop élk lid
kan lezen dat iemand ooit uit de groep is gezet. Dat oppervlak bestáát al:
`meld_uitzetting()` schrijft een rij `member_removed` mét `subject_id`, en
`group_events_select` is `mag_groep_lezen(group_id)` zonder filter op
`event_type`. De rij blijft ongewijzigd om een saaiere reden: **er is niemand die
het veld leest**, en dit project heeft een eigen issue over backend-werk zonder
aanroeper (QS8-194).

⚠️ **Om diezelfde reden is `teruggekeerd` ook uit het ántwoord gehaald.** Het
stond er als signaal voor de beslissende beheerder — maar `beslisVerzoek()` in
`src/modules/buddies/ontdekken.ts` gooit alles behalve `ok` en `reason` weg, en
het scherm toont in beide gevallen dezelfde zin. Regel 18 vraag 5: elk schakeltje
af en de keten loopt nergens heen. Dat de beheerder bij het beslissen niet ziet
dat het om een oud-lid gaat, is een echte tekortkoming — maar een van het scherm,
en die staat als QS8-331.

## De ijking

Vier mutaties, elk apart toegepast op de échte database en daarna teruggezet,
elk met een controle dat de mutatie ook werkelijk in het bestand stond:

| # | Wat gebroken | Wat rood werd |
| --: | -- | -- |
| 1 | de heractiveringstak (`elsif` altijd onwaar) | *de audit en het lidmaatschap lopen niet uit elkaar* |
| 2 | `role = 'member'` uit de heractivering | *geeft een teruggekeerd lid geen beheerdersrechten terug* |
| 3 | de invoegtak leeg | *schrijft voor een gewone aanvrager wél een auditrij* |
| 4 | `vraag_lidmaatschap_aan()` weigert een uitgezet lid | *laat een uitgezet lid wél aanvragen* |

⚠️ **Mutatie 4 breekt een ándere functie, en dat is met opzet.** De hele
bereikbaarheid van dit geval hangt aan die ene voorwaarde in
`vraag_lidmaatschap_aan()`. Zou iemand die later dichtzetten, dan is het geval
hierboven onbereikbaar en bewaakt dit hele testbestand niets meer — groen zonder
iets te beweren. De test die dat vastlegt staat er daarom als eerste.

⚠️ **Wat níet geijkt is en dat hoort er eerlijk bij: het `for update` op de
lidmaatschapsrij.** Dat slot beschermt tegen twee beheerders die tegelijk
beslissen, en dat is met een enkeldradige suite niet na te bootsen. Het staat er
op dezelfde grond als het bestaande slot op `group_join_requests` — dat ook nooit
onder een race getoetst is — en de kop van de migratie zegt dat erbij.

## Wat hierna nog open staat

- **De beheerder ziet in de UI nog niets van `teruggekeerd`.** Het veld is er;
  wat het scherm ermee doet is een eigen keuze, en die is bewust niet in deze
  migratie meegenomen.
- `paused` blijft een halve toestand die niemand schrijft (QS8-325). De tak
  hierboven behandelt hem alvast als `inactive`, wat de enige zinnige lezing is
  zolang niemand hem zet.


## Wat de security-review vond, en wat de meting ervan zei

Oordeel: **blokkerend**, en op drie punten terecht op een manier die deze
wijziging zonder die ronde slechter had gemaakt dan wat er stond. Elke bevinding
is zelf nagemeten voordat hij verwerkt werd.

### 1 — Kritiek: de nieuwe `for update` gaf een deadlock die er niet was

De eerste versie nam `for update` op de lidmaatschapsrij en schreef daarná in
`group_events` — en die insert neemt via zijn foreign key een `FOR KEY SHARE` op
de **groepsrij**. De slotvolgorde was dus lidmaatschap → groep, terwijl
`verwijder_lid()` en `verlaat_groep()` het andersom doen.

📏 Zelf uitgelokt met twee gelijktijdige psql-sessies tegen de lokale stack:

```
ERROR:  deadlock detected
CONTEXT: while locking tuple (0,8) in relation "group_members"
```

Het scenario is niet exotisch: twee beheerders die het oneens zijn over hetzelfde
lid — precies het geval waarin dit pad gebruikt wordt. Eén van de twee krijgt
40P01, via PostgREST een HTTP 500.

Gerepareerd door de **groepsrij als eerste** te vergrendelen, gelijk aan de twee
buurfuncties. 📏 Daarna dezelfde opstelling opnieuw gedraaid: geen deadlock. En
nagemeten dat de volgorde `group_join_requests` → `groups` veilig is: van de zes
functies die de groepsrij vergrendelen raakt er geen enkele
`group_join_requests` aan.

⚠️ **De les zit in wat de eerste versie dacht te doen.** Het `for update` was er
juist bijgezet om een race te sluiten. Een slot toevoegen is nooit gratis: het
verandert de volgorde waarin sloten genomen worden, en die volgorde is een
eigenschap van het gehéél — niet van de functie waar je in zit.

### 2 — Kritiek: `for update` op een rij die niet bestaat vergrendelt niets

De kop beloofde dat de tak niet op een verouderde toestand gekozen kon worden.
Voor de null-tak klopt dat niet: `select … for update` dat nul rijen oplevert
neemt geen enkel slot. En ik had in diezelfde versie `on conflict do nothing` van
de insert gehaald — dus een aanvrager die intussen via een uitnodigingslink
binnenkomt, laat de hele transactie omvallen met 23505, waarna het verzoek op
`pending` blijft staan en de beheerder een serverfout ziet. Dat was een
regressie: de oude code hád die clausule. Teruggezet.

### 3 — Kritiek: beide grenzen werden op dit pad niet geteld

📏 Het plafond van 12 actieve leden en de grens van 10 groepen per gebruiker
staan uitsluitend in `join_group_with_code()` en `create_group()` — geen CHECK,
geen trigger. Gemeten: een groep met 12 actieve leden groeide via dit pad naar
13.

Dat gold al voor de invoegtak sinds 0144, maar de terugkeertak verbreedt het:
een uitgezet lid telt in `status <> 'inactive'` **niet** mee, dus zijn terugkeer
duwt de groep er per definitie overheen. Beide grenzen worden nu geteld met
precies dezelfde predicaten als in `join_group_with_code()`, en beide staan onder
test — de tweede met tien groepen die rechtstreeks ingevoegd worden, want
`create_group()` zou bij de elfde zelf al weigeren.

### 4 — De scherpste: de terugkeer was stil, en de stilte is zelf het signaal

`group_members_systeembericht` stond op **AFTER INSERT**. Een eerste toetreder
werd aangekondigd, een teruggekeerd lid niet.

⚠️ Dat is precies de constructie die beslisdocument 002 rij 22 vermijdt bij een
vertrek, in spiegelbeeld. Die rij zegt letterlijk: *"dan wordt **de afwezigheid
van het bericht het signaal**"*. Een naam die in de ledenlijst verschijnt zónder
regel in de chat is per constructie iemand die er eerder al was, en élk lid kan
dat aflezen.

De trigger vuurt nu ook op de overgang `inactive` → `active`, met precies
hetzelfde bericht — geen letter meer. `member_joined` staat al in de CHECK en in
`chat-schemas.ts`, dus er komt geen nieuw type systeembericht bij.

⚠️ De `paused`-overgang krijgt bewust géén bericht: zo iemand telt al mee in
`status <> 'inactive'` en staat dus al in de ledenlijst. Daar is geen gat om te
vullen, en een bericht zou er juist iets zeggen wat de lijst niet zegt.

### 5 — Het rollback-pad rolde meer terug dan de wijziging

De kop wees naar `0145_melden_en_blokkeren.sql`. Dat bestand herdefinieert óók
`join_group_with_code()` — en 0187 heeft die functie vier dagen geleden
gerepareerd. Wie dit pad onder tijdsdruk zou volgen, zet die reparatie terug en
herstelt daarmee een beveiligingsdefect.

Het pad noemt nu de **functie** die teruggezet moet worden, met de waarschuwing
erbij om 0145 niet als geheel af te spelen. ⚠️ Een rollback-pad dat naar een
bestand wijst in plaats van naar een object is een belofte over iets grovers dan
wat je hebt gewijzigd.

### Wat er als agendarij of issue blijft staan

- Terugkeer geeft met terugwerkende kracht volledig leesrecht op de chat over de
  periode van uitsluiting, en één beheerder volstaat zonder bevestigingsstap.
  Agendarij; dit is een productbeslissing en geen defect.
- Niets ruimt een openstaand verzoek op wanneer het lidmaatschap langs een andere
  weg hersteld wordt. Agendarij.
- `joined_at` blijft staan bij een terugkeer — bewust, het is de datum waarop
  iemand voor het eerst lid werd. Bijeffect: `group_overview()` pagineert op
  `(joined_at, user_id)`, dus een teruggekeerd lid verschijnt midden in een
  lopende cursor. Agendarij.
- De beslissende beheerder ziet in het scherm niet dat hij een oud-lid terughaalt
  (QS8-331).

### Wat de review meldde en de meting niet droeg

Niets van betekenis — op één na: de onderbouwing die ik zélf in de kop had gezet
over `group_events` was onjuist, en de review wees dat aan met een meting. Dat
staat hierboven bij *Waarom de auditrij ongewijzigd blijft*.
