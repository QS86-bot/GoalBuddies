# Een vaste uuid in een fixture is geen identiteit maar een gedeelde sleutel

**Datum:** 07-09-2026 · **Issue:** QS8-336 · **Volgt op:** QS8-329

## Waar dit vandaan komt

QS8-329 repareerde de wezenbewaker, en repareerde onderweg één fixture die zijn
groep op **naam** terugzocht en verwijderde: twee runs trokken elkaars rij weg.
Wat er daarna overbleef bij twee gelijktijdige suite-runs was dezelfde vorm met
een ander gezicht — een **vaste uuid**.

## De meting, en waarom de dossierrij te laag telde

De rij van QS8-329 noemde drie bestanden. 📏 Met een scan geteld:

| | aantal |
| -- | --: |
| bestanden met een uuid-literal in `tests/rls/` | 13 |
| daarvan met een literal die ook echt geschreven wordt | 8 |
| losse literals | 33 |

⚠️ **Dat is de vorm die dit project al twee keer eerder heeft gehaald**: QS8-206
telde twee `console.error` en het waren er elf, QS8-315 telde twee `meld()` en
het waren er drie. Niemand was slordig; er kwam code bij en niets bewaakte de
regel. **Een dossierrij is een momentopname en geen inventaris.**

En daar bleef het niet bij. Nadat de literals weg waren, vond een tweede regel in
dezelfde scan er nog eens twee bestanden bij — zie hieronder.

## Het besluit: de identiteit blijft vast, de wáárde niet

Een test die zijn eigen id kiest doet dat met een reden: om een volgorde af te
dwingen, of om in een `psql`-regel te kunnen interpoleren zonder eerst een
`returning` te lezen. Die wens is geldig; het probleem zat in *hoe vast* de
waarde was.

`proefId(n)` in `tests/rls/proefid.ts` geeft een uuid die

- **vaststaat binnen één testbestand** — dezelfde aanroep geeft dezelfde waarde;
- **tussen runs nooit botst** — de prefix komt uit `randomUUID()` bij het laden;
- **de volgorde bewaart** — gelijke prefix, volgnummer achteraan, dus sorteren op
  de uuid is sorteren op het volgnummer.

⚠️ **De prefix is per bestand en niet per run, en dat is geen slordigheid maar de
enige mogelijkheid.** Vitest isoleert de modules per testbestand, dus modulestaat
leeft niet langer dan één bestand — dat is bij QS8-329 al een keer gemeten, toen
een geheugen in de harness bleek te resetten. Voor deze vraag is het precies
genoeg: de botsing is er een tússen runs.

## De grendel

`npm run gedeelde-identiteit:controle` wordt rood zodra er een vaste uuid in
`tests/rls/` bij komt. Hij draait mee in de poort en in CI.

⚠️ **Hij meldt níét élke uuid-literal.** Een id dat alleen bewijst dát iets niet
bestaat, botst met niemand; die staan in een register **op waarde** — niet op
bestand, want dan zou de uuid die er morgen in datzelfde bestand bij komt gratis
meeliften. Elke uitzondering draagt een reden, en een reden van minder dan twintig
tekens is geen reden.

## Drie dingen die de meting corrigeerde en het denken niet

### 1. De scan meldde zijn eigen uitleg

De eerste versie las ook commentaar. `proefid.ts` citeert de foutmelding waar dit
issue mee begon — mét de botsende uuid erin — en werd zo zijn eigen bevinding.
Een controle die de documentatie over zichzelf rood maakt, leer je uitzetten.

⚠️ En de reparatie daarvan had een eigen fout: commentaar **wegknippen** schuift
alle regelnummers op. Hij meldde `regel 14` voor iets dat op 44 stond. Nu worden
comments vervangen door evenveel regeleindes. **Een melding zonder plek is een
melding die je overslaat**, en een melding met de verkeerde plek is erger.

### 2. Drie van de vier id's in één bestand waren onzichtbaar

`reactiepaginering.test.ts` droeg vier gedeelde id's. De literalscan vond er
**één** — de andere drie stonden als ``` `aaaaaaaa-…-00000000000${i}` ```. Een
uuid die door een lus in elkaar wordt gezet is net zo goed een gedeelde sleutel;
hij ziet er alleen niet zo uit.

📏 Zodra die regel erin zat, vond hij meteen nog twee bestanden die de eerste
telling had gemist. **Tel opnieuw, met een instrument, en de lijst is langer dan
de eerste telling** — voor de derde keer.

⚠️ Dat bestand leverde ook de tegenproef bij `proefId()`: de cursor van 0121
sorteert op `(created_at, id)`, dus de vier id's moesten in dezelfde volgorde
staan als hun tijden. Een kale `randomUUID()` had die test gebroken; het
volgnummer houdt hem heel.

### 3. Een uuid is niet de enige gedeelde identiteit

Toen alle uuid's per run uniek waren, bleven er runs rood — op een **vaste
uitnodigingscode** (`'AVTST1'`, `'RECAPG01'`, `'BEWIJSEISJAJA'`) en een **vast
e-mailadres**. Allebei staan ze onder een UNIQUE-constraint, dus de tweede run
viel om met 23505.

⚠️ Het gevolg landde niet waar de oorzaak zat: in `avatarbucket.test.ts` faalde
niet de insert maar een test drie stuks verderop, waar Bob de avatar van Alice
niet meer mocht zien — `shares_group_with_user()` is onwaar als de groep er niet
is. **Een botsende sleutel meldt zich zelden op zijn eigen regel.**

Datzelfde bestand ruimde bovendien op naam op (`delete from groups where name =
'Avatartest'`), precies de fout die QS8-329 in `policies.test.ts` had gerepareerd.
Nu op id.

⚠️ **De controle dekt die tweede soort niet**, en dat staat hier omdat het anders
als besluit leest: hij toetst uuid's, want dat is een vorm die je met zekerheid
herkent. Een vaste uitnodigingscode of een vast e-mailadres is van een gewone
string niet te onderscheiden zonder te weten welke kolom er onder een unieke
sleutel staat. Die zijn met de hand gevonden en gerepareerd; komt er een derde
bij, dan vindt de suite hem en niet de scan.

## De uitkomst

📏 Twee volledige suites tegelijk, na alle reparaties:

| | run A | run B |
| -- | --: | --: |
| vóór | 5 rode bestanden | 6 rode bestanden |
| na | 1 rood bestand | **105/105 groen** |

## Wat er overblijft is een ándere klasse

Het laatste rode bestand is `seizoensrecap.test.ts`, met tellingen die één te
hoog of één te laag uitkomen. 📏 Nagemeten met `pg_get_functiondef()`:
`maak_seizoensrecaps()` loopt over **élke niet-gearchiveerde groep**, zonder
enige andere grens. Run A maakt dus recaps in de groepen van run B.

⚠️ Dat is geen gedeelde identiteit maar een **globale schrijver** — de klasse van
QS8-145, waar `herstel_weekdoelstatus()` over de hele `weekly_goals`-tabel schreef
en migratie 0137 hem een grens gaf. De kop van `vitest.config.mts` zegt zelf dat
vier van de vijf globale schrijvers vandaag alleen door een aanname over de
fixtures worden tegengehouden; deze meting ís die aanname die vervalt. Eigen
issue: **QS8-339**.

## De ijking

Vijf mutaties op de controle, elk apart, elk rood op de test die hem noemt:

| # | Wat gebroken | Wat rood werd |
| --: | -- | -- |
| 1 | de literalscan vindt niets | vier gevallen |
| 2 | commentaar telt mee | de twee commentaargevallen |
| 3 | regelnummers schuiven op | *noemt de regel waar hij staat* |
| 4 | een register zonder reden mag | *klaagt over een uitzondering zonder reden* |
| 5 | de samengestelde uuid wordt gemist | *een uuid die door een lus in elkaar wordt gezet* |

⚠️ Mutatie 4 is de stille van de vijf: zonder die toets groeit het register
vanzelf, want een waarde toevoegen is altijd sneller dan een fixture repareren.
