# "Geen database" was de verkeerde reden

**Datum:** 04-09-2026
**Aanleiding:** QS8-268, gemeten tijdens QS8-192 met een draaiende lokale stack.

## Wat er stond

Zes scripts riepen `psql` aan, en alle zes bouwden hun eigen argumentenlijst:

```js
const args = ['--quiet', '--no-psqlrc', '-At', '-d', db, '-c', vraag];
if (process.env.PGHOST) args.unshift('-h', process.env.PGHOST);
```

Geen `-U`. Dan valt psql terug op de **OS-gebruiker**, en in de bouwomgeving is
dat `root` — een rol die niet bestaat. De verbinding faalt, en het script meldt:

```
✗ Geen database om tegen te meten.
Start de lokale stack met `npm run rls:stack`.
```

De stack draaide. `npm run rls:stack` had er net 156 migraties op afgespeeld, en
de RLS-suite mat er wél tegen — die gaat via PostgREST.

De poort telde die vijf daarna bij de vier die écht productiesleutels vragen en
meldde *"9 controle(s) zonder database"*. Die zin leest als een grens van de
omgeving.

## Waarom dit meer was dan een ongemak

**De poort heeft meer overgeslagen dan iemand dacht.** Vijf van de negen waren
met één env-var wél te meten, en `CLAUDE.md` zegt bij de commando's juist dat een
controle zonder database *ongemeten* is en geen bewijs. Dit script maakte precies
die fout één laag lager, door de verkeerde oorzaak te noemen.

⚠️ **Een melding die de verkeerde oorzaak noemt, is duurder dan geen melding.**
"Start de stack" terwijl de stack draait, stuurt de lezer weg van de oplossing.
De logische volgende stap is dan de uitslag accepteren — en dat is wat er
gebeurde.

⚠️ **En het stond al opgeschreven, als leefregel in plaats van als defect.**
`docs/VOLGENDE-SESSIE.md` droeg sinds eind augustus twee passages die zeiden dat
je `PGPORT` en `PGUSER` moet zetten omdat de controles anders omvallen, mét de
`export`-regel erbij. **Een omweg die je opschrijft, houdt op een bug te zijn.**
Dat is de duurste helft van deze bevinding: niet dat niemand het zag, maar dat
iedereen het zag en het als een eigenschap van de omgeving noteerde.

## Wat er gebouwd is

`scripts/psql.mjs` — één aanroep, gedeeld door alle zes. Drie dingen die er niet
vanzelf in staan:

1. **`-U ${PGUSER:-postgres}`.** Dat is de hele reparatie. `schema-opbouwen.sh`
   deed het al zo; de controles waren de uitzondering.
2. **`-w`.** Zonder die vlag vraagt psql interactief om een wachtwoord zodra de
   rol er een nodig heeft, en een `execFileSync` die op een prompt wacht **hangt**
   in plaats van te falen. Een controle die hangt is erger dan een die rood wordt:
   in CI kost hij het hele budget van de job, en de uitslag is "nog bezig" en niet
   "fout".
3. **Geen `-p`.** psql leest `PGPORT` zelf; een eigen standaard hier zou stil
   afwijken van de rest van de omgeving, en dan meet je een andere database dan
   je denkt.

### Vier oorzaken en niet één

`verbindingsoordeel()` deelt een mislukking in: `geen-server`, `geen-database`,
`geweigerd`, `onbekend`. Alleen de eerste twee heten **OVERGESLAGEN** — dat zijn
de gevallen waarin er werkelijk niets te meten valt.

⚠️ **`connection to server ... failed:` staat in géén enkel patroon, en dat is de
hele verdediging.** Élke psql-mislukking begint met die zin, ook die waarbij de
server prima draait. Een indeling die erop aanslaat, noemt een geweigerde
gebruiker een ontbrekende database — en dat *is* deze bug.

### Een geweigerde gebruiker is rood, geen overslag

`beoordeel()` in `poort.mjs` matchte op `connection to server` en noemde het
geval dus "zonder database". Dat is dezelfde onwaarheid één laag hoger: de
database ligt er, alleen mag jij er niet in. Dat is een kapotte instelling en
hoort **rood**, want er valt iets te repareren.

## Wat de ijking opleverde, en dat is de helft van het werk

Drie mutaties bleven groen. Twee daarvan waren bevindingen over mijn eigen
wijziging en geen uitslag:

**De volgorde van de patronen deed er niet toe.** Het commentaar beweerde dat
specifiek-vóór-algemeen nodig was; nagemeten sluiten de drie patronen elkaar
gewoon uit, omdat de gedeelde zin er in geen enkele in staat. Het commentaar is
rechtgezet: de volgorde is een tweede riem en geen slot.

**De `soort === 'controle'`-grens op de `GEWEIGERD`-regel was dode code.** Hij
stond ná `code === 0`, dus een suite die de melding alleen cíteert is dan al
groen, en een suite die zelf faalt is met of zonder die grens rood. Weggehaald.
⚠️ **Een grendel die geen enkel geval verandert, is geen grendel maar een
geruststelling** — en die is duurder dan niets, want hij ziet eruit als dekking.

De derde was een kapotte mutatie (hij brak de syntaxis), opnieuw gedaan en toen
wél rood.

## Hoe het bewaakt wordt

`tests/scripts/psql-verbinding.test.ts`, met de échte psql-meldingen als
invoer — gemeten tegen PostgreSQL 16, niet verzonnen. Zeven mutaties, elk apart
geijkt tegen de echte bestanden:

| Mutatie | Wordt rood |
|---|---|
| `-U` weg | ja |
| `-U` valt terug op de OS-gebruiker | ja |
| `-w` weg | ja |
| een geweigerde gebruiker heet OVERGESLAGEN | ja |
| een geweigerde gebruiker wordt naar de stack gestuurd | ja |
| een onbekende oorzaak gokt op de stack | ja |
| de `GEWEIGERD`-regel uit `poort.mjs` | ja |

⚠️ **En er is een grendel tegen de zevende kopie**, want dat is de eigenlijke
bevinding: de fout zat niet in één script maar in zes, en een gedeelde helper
repareert de zes van vandaag zonder de zevende tegen te houden. `scripts/*.mjs`
mag geen eigen psql-argumentenlijst meer bouwen; `rls-dekking.mjs` staat in het
register mét reden (die schrobt de PG-omgeving juist leeg om een gekozen
bestemming te raken). Tweezijdig: een verdwenen uitzondering maakt het register
ook rood.

## Wat dit niet is

Geen verruiming van wat de poort groen noemt. Vóór en ná deze wijziging blijven
`adviseur`, `functies`, `register` en `wachtwoord` ongemeten zonder
productiesleutels, en blijft de poort daarop terecht weigeren "groen" te zeggen.
