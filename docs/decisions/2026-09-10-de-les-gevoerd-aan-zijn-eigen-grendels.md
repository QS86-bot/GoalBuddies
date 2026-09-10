# De les van QS8-194, gevoerd aan zijn eigen grendels

**Datum:** 10-09-2026 · **Issue:** QS8-194 · **Migratie:** geen

## Wat dit issue was

Drie backend-issues op rij bleken geen enkele aanroeper te hebben — QS8-47,
QS8-112 en EPIC 9. Bij dat laatste lag het twee lagen diep: `meld_commitment()`
wachtte op een status die niets ooit zette, en dááronder kon `goals.status`
helemaal geen `completed` worden, dus `meld_doel_af()` had evenmin ooit
gedraaid. **Twee triggers die maandenlang in de database stonden zonder één keer
af te gaan, allebei met tests eromheen die het losse gedrag wél bewezen.**

De vorm is elke keer dezelfde: het onderdeel is getest, de keten niet. Deze rij
heeft vraag 5 van onwrikbare regel 18 opgeleverd.

## Wat er sindsdien op gebouwd is

Drie controles, elk uit dit issue voortgekomen:

| | Wat er misging | Wie het zou vangen |
|---|---|---|
| A | een databasefunctie die niemand aanroept (QS8-47) | `keten:controle` (QS8-156) |
| B | een datalaagfunctie zonder scherm (QS8-112) | `exports:controle` (QS8-150) |
| C | een CHECK-waarde die niets ooit schrijft (EPIC 9) | `keten:controle` |

Daarnaast dekt `schermingang:controle` (QS8-383) de route-kant: een scherm in
`app/` dat nergens vandaan geopend wordt.

⚠️ **Het Linear-issue liep achter op de werkelijkheid.** Het noemde QS8-150 nog
als open en zei dat *"kan een gebruiker hier daadwerkelijk bij"* een handeling van
een mens was. Allebei is inmiddels een controle. De dossierrij was wél bij.

## Wat er gemeten is, en wat dat opleverde

De vraag die telt is niet *"bestaan die controles"* maar *"zouden ze de drie
gevallen vangen"*. Dat is een eigenschap van het geheel, en die beantwoord je
niet door erover na te denken — regel 18, vraag 3. De gevallen zijn dus echt
aan de lezers gevóerd.

**A en B worden gevangen.** Beide met een must-allow ernaast, zodat het niet een
controle is die alles meldt.

**C wordt gevangen als de waarde in één tabel staat — en gemist in de vorm
waarin het echt gebeurde.**

📏 `waardenZonderSchrijver()` zoekt de string `'completed'` in álle bronbestanden
zonder te weten bij welke tabel de treffer hoort. `goals.status` kende die waarde
en niets schreef hem; `goal_events.event_type` kent hem óók en dáár schrijft de
app hem wél. Eén treffer, dus de controle zwijgt — over precies het geval waar
dit issue over gaat.

`completed` staat om die reden in `GEDEELDE_WAARDEN`, blind over
`goal_events` en `goals`. Er staan er 29 op die lijst.

## De reparatie is afgewezen op de meting

`dode-keten-controle.mjs` schrijft in zijn kop: *"de echte reparatie is een
tabelbewuste toets, en die kan niet: de bron zegt niet bij welke tabel een
stringliteraal hoort."*

⚠️ **Dat leek te pessimistisch, want `kolomrechten-controle.mjs` leest de tabel
wél uit dezelfde `.from()`-keten.** Dus is het geprototypeerd in plaats van
aangenomen: een lezer die `.from('X').insert/.update/.upsert({…})` uit de
TypeScript leest én `update <tabel> set …` en `insert into <tabel> …` uit de
migraties.

📏 **Uitkomst: 47 van de 78 tabel/waarde-paren zouden gemeld worden.**

Dat is geen controle maar ruis. De oorzaak is dat een waarde langs veel meer
wegen in een kolom komt dan een `.from()`-keten: een kolomdefault
(`default 'todo'`), een Zod-enum, een functieparameter, of een toewijzing in een
triggerlichaam (`new.status := …`). Geen daarvan is aan een tabel te koppelen
zonder de hele keten te typeren.

**De aantekening in het script klopt dus, en staat nu op een meting in plaats van
op een vermoeden.** Dat is de winst hier: niet een nieuwe grendel, maar een
bewering die van "aangenomen" naar "nagemeten" gaat.

## Wat er nu vastligt

`tests/beloftes/de-les-van-de-onbereikbare-keten.test.ts` pint alle vier de
uitkomsten: A, B en C1 als must-find met een must-allow ernaast, en **C2 als
bekend gat**.

⚠️ **Dat laatste blok is met opzet een test die groen staat op een tekortkoming,
en rood worden is daar goed nieuws.** Wordt hij rood, dan is
`waardenZonderSchrijver()` tabelbewust geworden of is `completed` uit
`GEDEELDE_WAARDEN` verdwenen — en dan hoort de dossierrij bijgewerkt te worden en
deze test omgezet naar een gewone must-find.

Zonder die test is het gat alleen een zin in een commentaarblok, en dat is in dit
project precies de vorm die stil verrot — QS8-187 en QS8-204 gingen daarover.

## De ijking, inclusief de mislukte poging

Drie mutaties, één per grendel. De derde is de tweede poging, en de eerste staat
in de kop van de test omdat hij de fout laat zien waar CLAUDE.md voor
waarschuwt: eerst is de zoektocht door de migratie-romp uitgezet, en de test
bleef groen. Terecht — een zoektocht uitzetten meldt **méér** waarden en niet
minder, en die test leunt op de ándere zoektocht.

**Breek de grendel die de ijking noemt, niet zomaar iets**, anders is de ijking
zelf de aanname.

## Wat open blijft

De conclusie van de dossierrij verandert niet: **een dode keten op waarde-niveau
binnen een functie is statisch niet af te leiden**, en vraag 5 van regel 18 blijft
een handeling van een mens. Wat er verandert is de onderbouwing — die stond op
een redenering en staat nu op twee metingen.
