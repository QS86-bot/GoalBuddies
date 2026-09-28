# Vier besluiten van 22-09-2026, en twee ervan zijn een regel — QS8-590

**Datum:** 22-09-2026
**Besluitnemer:** Quinten, via een ingevulde besluitenlijst
**Aanleiding:** tweeëntwintig issues stonden geblokkeerd op één mens; twaalf vragen zijn in één ronde beantwoord.

> Dit document draagt de vier keuzes die **architecturaal** zijn. De overige acht
> antwoorden zijn vastgelegd als reactie op hun eigen issue en staan hier niet;
> ze veranderen geen structuur.

---

## 1. Ook onbekenden, en nu — QS8-230

**Besloten:** GoalBuddies wordt óók een app voor groepen die elkaar niet kennen,
en dat werk begint nu in plaats van boven een gebruikersdrempel.

⚠️ **Dit wijkt af van het advies**, dat *later, met een drempel* was. De
onderbouwing daarvan blijft geldig en staat hieronder, want een verworpen
argument hoort leesbaar te blijven.

### Wat het weghaalt

Tot vandaag rustte er een aanname onder het hele privacymodel: **elke groep
bestaat uit mensen die elkaar hebben uitgenodigd.** Er was één weg naar binnen,
een uitnodigingscode van de server (`0016`), en dat maakte de groep zelf de
moderatie — `reports_select` toont een melding binnen de groep, en de groep kent
de gemelde.

Die aanname vervalt. De regel die erop leunt niet: **domeinregel 7 blijft
onverkort**, en een groep met onbekenden hoort **beschermd** te zijn. Dat is geen
schermkeuze maar een eigenschap van `groups`.

### Wat ervoor in de plaats moet

📏 Gemeten op `main` bij dit besluit, en het is minder dan gevreesd: QS8-231
(*ontdekken*) en QS8-232 (*melden en blokkeren*) zijn allebei geland.
`public.reports` en `public.user_blocks` bestaan met RLS, indexen, kolomgrants
(`0173`) en spoofing-grendels (`0284`); `src/modules/buddies/veiligheid.ts` is de
schrijfkant.

📏 Wat ontbreekt is één schakel: **nul leespaden** op `reports` buiten de
migraties. Een melding wordt netjes weggeschreven en niemand kijkt ernaar. Dat is
QS8-586, en het blokkeert dit epic.

⚠️ **De eerste inschatting bij dit besluit was dat moderatie helemaal niet
bestond.** Dat was overgenomen uit de beschrijving van QS8-397 in plaats van
gemeten, en het is rechtgezet. Het verschil is de moeite waard: *moderatie
bouwen* is een epic, *de lezer die er niet is* is een ronde. Dit is de klasse van
onwrikbare regel 19 — **verifieer elke bevinding zelf** — en hij kostte hier
bijna een verkeerd geplande sprint.

### Het verworpen argument

📏 **1 gebruiker en 0 doelen** op productie. Een ontdekkingsfunctie werkt per
definitie pas bij aantal; met deze stand levert hij lege lijsten op en is hij niet
te toetsen op de eigenschap die ertoe doet. Dat argument is afgewogen en niet
gevolgd.

### Wat hierdoor open kwam te staan

**Blijft het klassement per lid bestaan in een groep van onbekenden?** Sinds A54
toont een open groep een klassement. Bij vrienden is dat speels; bij vreemden is
het een ranglijst van mensen die je niets schuldig bent. De drie grendels onder
A54 blijven staan — `cycle_missed` boekt zonder `group_id`, `groep_klassement()`
geeft geen delta en geen datum, een beschermde groep geeft nul rijen — dus het
lekt niet. De vraag is of het het juiste product is, en die is onbeantwoord.

⚠️ **Tot die vraag beantwoord is wordt er aan QS8-230 niets gebouwd**, want het
antwoord bepaalt het oppervlak van het eerste scherm.

---

## 2. De server mag een gedeelde foto lezen — QS8-397

**Besloten:** geen versleuteling in de client. QS8-397 vervalt; het epic QS8-394
sluit.

### De belofte die hiermee vastligt

> *Wij bewaren je foto's kort en halen de metadata eruit.*

En uitdrukkelijk **niet** *"wij kunnen je foto's niet lezen"*. Dat is wat er op
`main` staat en het is eerlijk uit te leggen.

### Waarom dit niet los staat van besluit 1

Drie dingen die vandaag al in het product zitten vragen dat de server kan lezen:
een **bewijsfoto bij een commitment** die iets waard is buiten onderling
vertrouwen, de **emmerlimieten** en de **metadata-strip** (`ontdoeVanMetadata()`),
en **moderatie**.

⚠️ Dat laatste was tot vandaag een mogelijkheid en is met besluit 1 een
voorwaarde geworden. **Waren deze twee besluiten andersom gevallen — wél
versleutelen én ook onbekenden — dan waren ze onverenigbaar geweest.** Dat ze
samen kloppen is geen toeval maar wel het noemen waard: het is de enige
combinatie van de vier die een tegenstrijdigheid had kunnen opleveren.

### Het verworpen argument

📏 **0 objecten** in `chatfotos`, `chatdocs` en `bewijsfotos`, en **1 gebruiker**.
Versleuteling invoeren wordt nooit meer zo goedkoop als vandaag: niets te
migreren, niemand die een sleutel kwijt kan, geen bestaande belofte om terug te
nemen. Afgewogen en verworpen.

---

## 3. Nooit geldstraffen — QS8-86

**Besloten**, woordelijk:

> *"Er mogen nooit geldstraffen opgelegd worden op de gebruiker. De gebruiker gaat
> een commitment aan met zijn goalbuddies. Wanneer de gebruiker zijn doel niet
> haalt, zou hij zijn groepsgenoten moeten trakteren of iets anders waarvoor hij
> gekozen heeft. Echter ook dit is vrijblijvend."*

Dit is scherper dan de opties die voorlagen: geen uitstel maar een afwijzing.
**PRD 9.4 vervalt.** Er is geen juridische toetsing nodig, geen provider te
kiezen, geen jurisdictievraag te beantwoorden.

### 📏 Klopt dit met wat er staat?

Nagemeten, want een besluit dat een bestaande grendel tegenspreekt is duurder dan
een dat er een toevoegt:

| | |
|---|---|
| `commitments.body` | vrije tekst — *"ik trakteer op taart"* past er net zo goed in |
| bij een verstreken deadline | de straf gaat naar `due` en wordt **zichtbaar** voor de begunstigde groep of getuige |
| wat de app niet doet | geld innen, een schuld bijhouden, een gevolg afdwingen |

De bestaande stand is dus al *zichtbaarheid als consequentie, niets meer*. Domeinregel 5
en 11 blijven onverkort gelden; er hoeft niets af.

### Wat hieruit volgt en bewust niet meegenomen is

De woorden **"straf"** en **`due`** suggereren een hardere consequentie dan dit
besluit toestaat. Of die taal mee moet veranderen raakt wat de gebruiker te horen
krijgt — grens 1 — en is dus een eigen besluit. Staat als openstaande vraag op
QS8-86.

---

## 4. De held ís de coach — QS8-109

**Besloten:** er komt **geen aparte mascotte** voor de Doelcoach. De zes
heldenarchetypes nemen die rol over; de onboardingvragenlijst wijst de gebruiker
een passend archetype toe, en de coach spreekt met dat gezicht.

### Waarom dit structureel meer waard is dan een tekening

De bindende randvoorwaarde uit `docs/GROENE-NOTITIES.md` §3b was: **de coach mag
nooit teleurgesteld kunnen kijken**, want hij is het enige onderdeel van de app
dat je gemiste weken kent. Een figuur met een gezicht kán teleurgesteld kijken, en
dan is domeinregel 7 omzeild via een illustratie.

Van de drie voorgestelde richtingen dekte alleen *Koers* (een kompasroos) die eis
**structureel** af; bij *Gids* was de bescherming een afspraak (*altijd van
achteren getekend*) — en de notitie schreef zelf al op dat iemand die over een
jaar vergeet.

⚠️ **Dit besluit haalt die hele afweging weg.** De zes helden dragen een
**symbool** en een kleurenpaar, geen gezicht. De eis is daarmee gedekt zonder dat
er iets bij getekend hoeft te worden, en zonder dat er een afspraak is die kan
verwateren. Dat is dezelfde vorm als overal elders in dit project: *zoek een
grendel in plaats van een zin.*

Codexprincipe 01 blijft ongewijzigd: *"één systeem, zes gezichten — alleen het
kleurenpaar en symbool verschillen."* Er komt er **geen zevende bij**, dus de
benoemde uitzondering op de Q-Projects-tokenset verbreedt niet.

### De tegenspraak die dit opleverde, en hoe hij is opgelost

De besluitenlijst kreeg twee antwoorden terug die elkaar uitsloten: *"de zes
helden nemen de taak van de Doelcoach over"* (a) en *"buiten het heldenstelsel —
navy en goud"* (b). (a) plaatst de coach binnen het stelsel, (b) erbuiten.

Voorgelegd als twee lezingen; gekozen is **lezing 1**, en daarmee vervalt (b) —
dat antwoord ging over een figuur die er niet komt.

⚠️ **Dit is niet zelf ingevuld, en dat was de juiste keuze.** Het gaat over wie er
tegen de gebruiker praat, en daar heeft *"de conservatiefste optie die het werk áf
maakt"* geen betekenis: er ís geen conservatiefste gezicht.

### Wat eruit volgt en hier niet besloten is

1. **Hoe de coachstem per held klinkt** — zes stemmingen betekent dat de toon kan
   meebewegen. Of dat gebeurt en hoe ver, is een eigen vraag.
2. **Of het symbool meereist** naar de coachoppervlakken, of alleen het kleurenpaar.

📏 En één zin die door dit besluit onwaar werd: de kop van `scripts/maak-iconen.mjs`
noemde het app-icoon een plaatshouder *"zodra QS8-109 een mascotte oplevert"*. Er
komt geen mascotte, dus het is geen plaatshouder meer. Bijgesteld in deze ronde.

---

## Twee besluiten die hierdoor een regel zijn geworden

Besluit 1 en 3 zijn in `CLAUDE.md` opgenomen, want dat document bezit de regels.

⚠️ **Waarom een document alleen niet genoeg is.** Een beslisdocument wordt gelezen
door wie ernaar zoekt; `CLAUDE.md` wordt elke sessie gelezen. Een regel die alleen
hier staat, is de klasse van QS8-412 — *een grendel die alleen in een comment
staat* — en hier zelfs een graad erger: er stáát vandaag nog een PRD-regel die het
tegenovergestelde zegt (9.4, echte-geld-commitments). Zonder een expliciete grens
is er niets dat een volgende sessie ervan weerhoudt daar alsnog aan te beginnen.

## De vervalvoorwaarden uit deze ronde

Twee andere antwoorden dragen een voorwaarde, en die hoort bij het besluit en niet
eronder:

| besluit | vervalt wanneer |
|---|---|
| **QS8-536** — de speling van één kalenderdag op de strafklok blijft | zodra er een **derde** beslissing aan de bevroren strafklok gehangen wordt |
| **QS8-126** — de repo blijft publiek | op de dag dat de **eerste gebruiker die niet Quinten is** een account aanmaakt |

⚠️ Bij QS8-126 hoort één handeling die makkelijk vergeten wordt: privé zetten
maakt de **geschiedenis** niet ongedaan. De repo is publiek sinds 15-08-2026; is er
ooit een sleutel in een commit beland, dan is roteren de reparatie. Er is geen
aanwijzing dat het gebeurd is, en de secret-scan in `scripts/deploy-web.mjs`
bewaakt de bundel en niet de historie.

⚠️ En besluit 1 verplaatst die dag waarschijnlijk naar voren.
