# Een suite die iets ouds meet

**Datum:** 11-09-2026 · **Issue:** QS8-426 · **Gevonden in:** de wekelijkse audit

## 1. Wat er mis was

📏 Tijdens de audit stond `goalbuddies_rls` — de database waar `npm run rls:lokaal`
standaard op draait — op ongeveer `0232`, terwijl `supabase/migrations/` op `0252` stond.
Geen `chatdocs`-bucket, geen `todo_items`, geen `opslag_dagtellers`, en nog mét de
`*_update`-policies op `storage.objects` die 0239 juist intrekt.

**De suite werd daar groen op.** Hij zei niet "ik meet iets ouds"; hij zei niets.

Het gevolg is niet dat er een test faalde die had moeten slagen, maar iets vervelenders:
elke uitslag over de bijlagen-epics (0222–0243) en De Lijst (0246–0248) van vóór de
herbouw ging over een schema dat die features niet had. De suite kán daar niets over
bewezen hebben, en zei toch groen.

## 2. Waarom dit de klasse van QS8-270 is, één laag hoger

| | QS8-270 | dit issue |
|---|---|---|
| wat er gebeurde | de suite **sloeg zichzelf over** | de suite **mat iets ouds** |
| exitcode | 0 | 0 |
| wat je ziet | een lager testaantal, als je kijkt | niets |

Die eerste is te zien als je het aantal tests vergelijkt. Deze niet: het aantal klopt,
de namen kloppen, alles is groen. **Bij overslaan mist er een uitslag; hier lijkt er een
te zijn.**

## 3. Waarom `stackBeschikbaarOfFaal()` het niet ving

Die functie wérpt al bij een achterlopend schema — hij heeft er zelfs een uitgewerkte
melding voor. Maar hij komt daar alleen als **de proef van dát testbestand** het gezochte
object mist:

```
stackBeschikbaarOfFaal("select 1 from pg_tables where tablename = 'todo_items'", …)
```

Een bestand dat ouder is dan de ontbrekende migraties vraagt naar objecten die er wél
zijn, en draait vrolijk door. Of een achterstand opvalt, hangt dus af van **wat een
testbestand toevallig opvraagt** — en dat is per bestand een eigen, met de hand geschreven
zin. Honderdveertig losse probes zijn geen grendel op het geheel.

## 4. Wat er nu staat

Eén vraag, één keer, vóór de hele groep: `globalSetup: ['tests/rls/globaal.ts']` op de
`rls`-groep in `vitest.config.mts`. Die legt het register van de doeldatabase naast
`supabase/migrations/`.

⚠️ **Hergebruikt `vergelijk()` uit `scripts/migratieregister-vergelijk.mjs`** — dezelfde
vergelijking die de repo naast *productie* legt, en die al los onder test staat. Een
tweede vergelijking ernaast zou een tweede plek zijn waar de letterversies (`0039a`) en
de tijdstempelvorm vastliggen. `migratiesInMap()` is daarvoor uit
`migratieregister-controle.mjs` gelicht naar diezelfde module, zodat er één lezer van de
map is en niet twee.

### Twee dingen waar hij met opzet zwijgt

- **Zonder `RLS_DOEL`** doet hij niets. Dezelfde afspraak als QS8-270: *zwijgen mag
  alleen als niemand beweerde te meten.*
- **Bij een onbereikbare database** ook. Dat is een andere zaak en heeft al een betere
  melding: `stackBeschikbaarOfFaal()` houdt "geen server" en "wel server, oud schema" uit
  elkaar en zegt per geval wat je moet doen. Allebei laten melden geeft twee teksten voor
  één zaak, en dan wint de eerste in de volgorde — niet de beste.

## 5. De meting die de controle bijna 255 keer rood had gemaakt

📏 De lokale stack schrijft in `schema_migrations.name` de **hele stam**:

```
0252|0252_de_goedkeuring_wijst_naar_de_eigenaar_van_de_voltooiing
```

`migratiesInMap()` geeft alleen het deel ná het eerste liggend streepje. De
naamvergelijking in `vergelijk()` zou dus op **élke** migratie afgaan.

⚠️ Productie doet dat niet zo — `migratieregister()` geeft de naam al zonder nummer terug,
en daarom is `migratieregister-controle` altijd groen geweest. **Dezelfde vergelijking,
twee bronnen met een andere vorm.** Dat is een klasse die je alleen vindt door hem één
keer echt te draaien; geen enkele redenering over de code had hem opgeleverd.

## 6. De ijking

📏 Het register met de hand twintig migraties teruggezet (`delete … where version > '0232'`):

| | uitslag |
|---|---|
| ongemuteerd, mét grendel | groen (4/4) |
| register op `0232`, **zónder** grendel | **groen (4/4)** |
| register op `0232`, mét grendel | rood, met beide standen en `npm run rls:stack` in de melding |

**De tweede rij is de hele rechtvaardiging.** Zonder deze grendel is een database die
twintig migraties achterloopt niet te onderscheiden van een goede.

### En de ijking vond een naad in zijn eigen test

📏 De mutatie op `zonderNummer()` (normaliseer niet meer) maakte eerst **twee** tests rood —
allebei directe tests van die functie. Het samengestelde pad bleef groen, want
`niveauKlachten()` kreeg in de test een register aangeboden dat al genormaliseerd was.
De normalisatie stond namelijk aan de lééskant, en die is alleen mét een echte database te
voeden.

Dat is regel 18 vraag 1 in zuivere vorm: *waar knopen twee correcte onderdelen aan
elkaar?* `zonderNummer()` is idempotent, dus de normalisatie is naar `niveauKlachten()`
verplaatst — daarmee is de hele weg los te voeden. Dezelfde mutatie maakt er nu **drie**
rood, inclusief het geval dat een register mét nummers aanbiedt.

## 7. Wat dit niet is

- **Geen vervanging van de probes in `stackBeschikbaarOfFaal()`.** Die blijven staan en
  zijn nu een tweede net: zij gaan over één object, deze over het register.
- **Geen controle op productie.** Dat is `migratieregister-controle`, en die vraagt
  credentials. Deze gaat uitsluitend over de database waar de suite op meet.
- **Geen garantie dat het schema klópt.** Het register zegt wat er is toegepast, niet of
  het resultaat juist is. Een migratie die zichzelf half toepast, telt hier als aanwezig.
