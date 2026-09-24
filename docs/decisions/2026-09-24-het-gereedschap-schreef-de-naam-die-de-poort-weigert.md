# Het gereedschap schreef de naam die de poort weigert

**Datum:** 24-09-2026
**Issue:** QS8-584
**Raakt:** `scripts/migratie-nieuw.mjs`, `scripts/migratie-hernummer.mjs`,
`scripts/migraties-controle.mjs`, `tests/scripts/migratie-naam.test.ts`

## Wat er gebeurde

📏 Op 22-09-2026, bij QS8-461:

```
npm run migratie:nieuw -- "leesroute_bewaking toetst elke bovenste or-tak apart"
→ ✓ supabase/migrations/0295_leesroute_bewaking_toetst_elke_bovenste_or-tak_apart.sql
```

Die naam is ongeldig. `migraties:controle` weigert hem — *"Onleesbare
bestandsnaam — verwacht NNNN[a-z]\_kleine\_letters.sql"* — en
`tests/scripts/migratie-hernummer.test.ts` wordt er rood van.

`migratie:nieuw` zette spaties om in liggende streepjes en liet al het andere
staan. Een koppelteken in de titel kwam er dus ongewijzigd in.

⚠️ **Het gereedschap bestaat om een geldige migratie te beginnen, en leverde
een ongeldige op.** Dezelfde vorm als QS8-247 (hij fetchte niet) en QS8-365 (hij
deelde een nummer uit dat CI weigert), en het argument van QS8-247 is hier
woordelijk van toepassing: *een gereedschap dat bestaat om een botsing te
voorkomen, mag zijn juistheid niet laten afhangen van een handeling die het zelf
niet doet.* Die handeling was hier *"denk eraan geen koppelteken te typen"*, en
die stond nergens.

⚠️ **En de fout kwam pas boven in de poort** — dus ná de kop, het
beslisdocument en de commit. Bij QS8-461 kostte het twee handelingen om terug
te draaien (het bestand én de kopregel die zijn eigen naam noemt). Met één
padverwijzing erbij waren het er meer geweest, en `padverwijzing:controle` was
er dan pás ná de hernoeming rood van geworden.

## Wat er gebouwd is, en in welke volgorde het telt

### 1. De normalisatie is de gewoonte, niet de reparatie

`normaliseerTitel()` maakt van alles buiten `[a-z0-9]` één liggend streepje,
haalt accenten via NFD weg en zet alles in kleine letters.

⚠️ **Vervangen en niet weglaten.** `or-tak` → `ortak` leest als een tikfout en
is stil; `or_tak` is wat de schrijver bedoelde. En één streepje per gróépje
leestekens, niet per teken — anders geeft `"a — b"` er drie achter elkaar.

⚠️⚠️ **Maar dit alleen was het issue niet.** Een normalisatie dekt de vormen
waar iemand aan gedacht heeft en faalt stil op de vorm waar niemand aan dacht.
Dat is precies de klasse die dit project als schuld telt.

### 2. De grendel: het script leest zijn eigen uitvoer

`keurBestandsnaam()` legt de naam die weggeschreven gaat worden náást
`ontleedNaam()` — de functie waarmee `migraties:controle` datzelfde bestand
straks leest — en weigert te schrijven als die `null` geeft. Exitcode 1, geen
bestand.

⚠️ **Vóór `--droog`, niet erna.** Een droge run die een naam goedkeurt die de
echte run daarna weigert, is een gereedschap dat over zichzelf liegt.

### 3. Eén regel in plaats van twee die het eens zijn

Het issue zegt *"toetst zijn eigen uitvoer met dezelfde functie die
`migraties:controle` gebruikt (`basisUit()`)"*. 📏 Nagemeten: dat was niet waar.
`migraties:controle` had een eigen `NAAM`-regex en `scripts/migratie-hernummer.mjs`
had er een in `basisUit()`.

📏 Differentieel gemeten op 24-09-2026 — 301 echte bestandsnamen plus 20
randgevallen (koppelteken, hoofdletter, accent, lege slug, twee letters achter
het nummer, spatie eromheen): **nul** verschillen. De twee waren het vandaag
eens.

⚠️⚠️ **En dat is de reden om ze nú samen te voegen en niet om het te laten.**
De belofte van punt 2 gaat over wat de póórt van die naam vindt. Meet de tool
met een eigen kopie van de regel, dan is de overeenkomst een toevalligheid die
niemand rood ziet worden zodra er één van de twee verschuift — en
`scripts/migraties-controle.mjs` zegt dat zelf al over `kopNummer()`: *"zou deze
controle een eigen versie hebben, dan kunnen die twee het oneens worden en
bewaakt de bewaker iets anders dan de schrijver schrijft."* Het patroon staat nu
één keer, als `ontleedNaam()`.

### 4. De spiegelzijde in `migratie:hernummer`

Punt 4 van het issue vroeg of de hernummeraar dezelfde blinde vlek heeft. 📏
Gemeten, en het antwoord is tweeledig:

| kant | stand |
| -- | -- |
| het nummer dat hij **schrijft** (`naar`) | bewaakt — `beoordeelHernummering()` eist `/^\d{4}$/` |
| de naam die hij **leest** (het bronbestand) | onbewaakt |

`kiesBron()` koos `0295_…_or-tak_apart.sql` gewoon (hij leest alleen de eerste
vier tekens), `basisUit()` gaf daarna `null`, en de regel erna viel om met
`TypeError: Cannot read properties of null (reading 'slice')`. **Een stacktrace
in plaats van een melding, op precies het bestand dat je komt repareren.**

Er staat nu een poort met een melding die zegt wat de vorm moet zijn en dat dit
script het nummer verzet, niet de vorm.

## IJking

Stand ervóór gemeten: `tests/scripts/` groen op **112** bestanden en **2464**
toetsen.

| mutatie | uitkomst |
| -- | -- |
| A — `[^a-z0-9]+` terug naar `\s+` in `normaliseerTitel()` | **6 rood** |
| B — `keurBestandsnaam()` altijd `null`, normalisatie intact | **8 rood** |
| C — de aanroep van `keurBestandsnaam()` uit `hoofd()` | **2 rood** |
| D — de `oudeBasis === null`-poort uit de hernummeraar | **1 rood**, mét de `TypeError` in de uitvoer |

⚠️⚠️ **B is de mutatie die het issue vraagt en A is hem niet.** A zet de
gewoonte uit; dan is er niets meer te weigeren, óók als de grendel werkt. B doet
het omgekeerde — normalisatie aan, grendel uit — en dan blijft precies de toets
rood die zegt dat het script zijn eigen uitvoer leest.

📏 **En de bestaande mapcontrole werd bij géén van de vier rood.**
`tests/scripts/migratie-hernummer.test.ts` toetst de échte migratiemap, en die
is schoon. Hij kan pas iets vinden nádat een kapotte naam geschreven én bewaard
is — de te late detectie die dit issue vervangt. Dat het issue vroeg om te
kijken wélke toets omvalt, is hier het hele verschil: had ik alleen A gedraaid
en "er wordt iets rood" genoteerd, dan had ik de gewoonte geijkt en de grendel
niet.

## Wat dit niet is

- **Geen belofte dat elke denkbare titel een mooie naam geeft.** `ø` en `ß`
  decomponeren niet en worden een streepje. De uitkomst is geldig, niet fraai.
- **Geen tweede detector naast `migraties:controle`.** Het is dezelfde regel,
  één keer vroeger toegepast.
- **Geen vervanging van de mapcontrole.** Die blijft staan voor de bestanden die
  er al zijn, en voor alles wat buiten `migratie:nieuw` om in die map belandt.

## Aannames

- Dat de twee regexen vandaag dezelfde taal accepteerden is **gemeten**; dat ze
  dat morgen nog doen is geen aanname meer, want het is er één.
- De titel van een migratie is vrije tekst van de schrijver. Er is geen toets
  die zegt dat de genormaliseerde naam nog *leesbaar* is — alleen dat hij
  geldig is. Een titel die volledig uit leestekens bestaat wordt daarom
  geweigerd en niet stilzwijgend tot `0299_.sql` gemaakt.
