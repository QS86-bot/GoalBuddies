# Het weekdoel draagt zijn eigen regel

*01-09-2026 · QS8-253 · besluit A53 · migratie 0140*

Een doel krijgt een ritme: `weekly`, `times_per_week` of `daily`. Dit document
gaat over de drie keuzes die daarbij gemaakt zijn en die geen van drieën voor de
hand lagen.

## 1. Het ritme staat op het doel, het oordeel op de week

De voor de hand liggende bouw is: zet `ritme` op `goals`, en laat de
beoordelingsfunctie dat veld lezen.

**Dat is fout, en de fout is onzichtbaar tot iemand zijn ritme omzet.**

Een week die op vrijdag "drie van de vijf dagen" was, verandert dan met
terugwerkende kracht in een gewoon weekdoel zodra je je doel op `weekly` zet — of
andersom: een afgeronde weekdoel-week wordt ineens een dagenweek die de vloer
niet haalt. Het oordeel over het verleden hangt dan aan een keuze in het heden.

Daarom draagt **`weekly_goals.ceiling_days`** de regel:

> Is `ceiling_days` gevuld, dan telt deze week dagen. Is hij leeg, dan gedraagt
> deze week zich exact zoals vóór deze migratie.

`goals.ritme` is daarmee wat het is: de voorkeur die het scherm gebruikt om het
volgende weekdoel voor te stellen, en straks de vraag of er een dagreeks bestaat.

Dat is dezelfde gedachte als `pin_completion_cycle` uit 0006 en als het
systeembericht in beslisdocument 002 §3: **een rij draagt de regel waaronder hij
is aangemaakt.** Een migratie of een instelling erna verandert daar niets aan.

## 2. Een eigen tabel, en niet een tweede betekenis voor `daily_moves`

`daily_moves` bestond al, met een `local_date` én een `weekly_goal_id`. Er is
niets aan toe te voegen om er afvinkingen in te zetten — behalve `body` nullable
maken.

Drie redenen om het niet te doen, en de tweede is dezelfde die 0138 voor
`weekly_plan_steps` maakte:

1. **`body` is verplicht.** Een afvinking heeft geen tekst. Die kolom nullable
   maken verandert wat een Dagzet ís.
2. **Een Dagzet heeft geen gevolg en een afvinking wel.** Domeinregel 9 zegt met
   zoveel woorden dat een dag overslaan geen gevolg heeft; besluit A53 bakent dat
   af tot doelen met weekritme. Zet je ze in één tabel, dan gaat élke telling
   over `daily_moves` ineens over dingen die meetellen, en is de vraag niet
   "welke tellingen pas ik aan" maar **"welke ben ik vergeten"**.
3. **Ze hebben tegengestelde zichtbaarheidsregels.** Een Dagzet mág je met je
   groep delen (`visibility`); de afwézigheid van een afvinking is tegenslag en
   gaat de groep nooit aan. Eén policy kan die twee niet allebei bedienen.

## 3. Het niveau komt uit de dagen, niet uit het formulier

Bij een gewoon weekdoel kiest de gebruiker of hij zijn vloer of zijn plafond
haalde, en een buddy beoordeelt dat. Bij een ritme-weekdoel staat het antwoord al
in de database: vier van de vijf dagen afgevinkt.

Het formulier laten kiezen zou betekenen dat je **met één dag een plafond kunt
claimen**. Dat is dezelfde fout die 0006 en 0007 vier keer hebben moeten dichten:
een client die de regel meelevert waaraan hij getoetst wordt, is geen regel maar
een verzoek.

`niveau_uit_dagen()` **overschrijft** daarom, en weigert niet — precies zoals
`pin_completion_cycle`: de client heeft hier niets te kiezen, en een foutmelding
zou suggereren dat er iets te kiezen viel. De enige uitzondering is *onder de
vloer*: dan is er geen week om in te dienen, en dat hóórt een weigering te zijn.

⚠️ **Domeinregel 3 blijft onaangeroerd.** De dagen bepalen het *niveau*; een buddy
bepaalt of het waar is. `completions_mark_pending` uit 0023 doet nog steeds zijn
werk en er is geen route naar `approved` bijgekomen.

## 4. De naad die je niet kunt vermijden, en wat je er dan mee doet

Het scherm moet kunnen tonen wát je gaat indienen vóórdat je op de knop drukt.
Anders is "afronden" een gok. Dus staat de afleiding er twee keer:

| | |
|---|---|
| `niveau_uit_dagen()` in 0140 | beslist wat er in `completions` landt |
| `niveauUitDagen()` in `schemas.ts` | vertelt het scherm wat dat gaat worden |

**Twee uitvoeringen van één regel is precies de naad waar onwrikbare regel 18
over gaat**, en het gevaarlijke eraan is dat ze allebei los correct kunnen zijn
en tóch verschillen. Dan ziet de gebruiker "plafond gehaald" staan terwijl er
`floor` geboekt wordt, en geen enkele test op één van de twee kan dat zien.

De grendel staat daarom in `tests/rls/ritme.test.ts`: vijf gevallen gaan door de
database **én** door de TypeScript-functie, en de uitkomsten moeten gelijk zijn.

⚠️ Rood gemaakt door in de SQL `>=` te vervangen door `>`. Bij precies vijf van
de vijf dagen zei TypeScript `ceiling` en de database `floor` — en alle andere
tests bleven groen.

## 5. Wat er bewust níét in zit

**De dagreeks.** Die hoort bij ritme `daily`, en QS8-253 zegt met zoveel woorden
dat hij met zijn vergeving meekomt of niet komt: de nachtuil-marge (tot 08:00
telt gisteren nog) en een dagpas horen in dezelfde migratie. Zonder die twee is
een dagreeks een strafmechanisme, en dat is het enige wat deze app nergens wil
zijn. Dat is een eigen slice.

**Automatisch indienen aan het eind van de week.** Wie vijf van de vijf dagen
afvinkt en vergeet in te dienen, krijgt zondagnacht alsnog `missed` en een
minpunt. Dat voelt hard, en het is een echte vraag.

Het is hier niet opgelost, en dat is een keuze: de rollover zou dan een
`completions`-rij moeten schrijven, en die loopt langs `enforce_evidence_policy`
uit 0021. In een groep die een notitie eist, is er geen notitie om te schrijven.
Dat is een besluit over bewijs en peer-goedkeuring, en dat hoort niet meegesmokkeld
te worden in een migratie over ritme.

⚠️ Wat het vandaag draaglijk maakt is de coulanceperiode die er al is: binnen dat
venster is de vorige week nog af te ronden. Dat dekt het gewone geval — zondag
klaar, maandagochtend gelogd — en niet het geval waarin iemand het echt vergeet.
**Als dit een tweede keer als probleem terugkomt, is dat het signaal om het
alsnog te bouwen.**

## 6. Wat de meting opleverde

Vier grendels in de pure laag apart gebroken, alle vier rood: de ondergrens die
de vloer negeert, een ontbrekende vloer die op 1 terugvalt in plaats van op het
plafond, `>` in plaats van `>=` op het plafond, en `ritme` als vrije string.

In de database-suite is elk geval met de hand rood gemaakt op de manier die bij
het geval zelf staat — de overschrijving weggehaald, de trigger gedropt, de
policy verruimd met een groepstak.
