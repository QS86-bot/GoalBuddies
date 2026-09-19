# Een citaat is geen verwijzing — vijf regels voor administratiedrift, en waarom de vijfde het haalt

**18-09-2026 · QS8-452**

## De vraag

QS8-452 wilde een grendel onder twee handregels uit `CLAUDE.md`: *"controleer bij
het afsluiten van een issue of Linear en de documenten hetzelfde zeggen"* en
*"kijk bij een issue zonder branch eerst of het werk er al staat"*. 📏 Op
13-09-2026 ging dat drie keer mis op één dag.

Het issue stond sinds die dag op `wacht-op-Quinten` met een reden die klopte
voor de vorm die er toen lag: beide voorgestelde richtingen bevragen Linear, dus
de controle zou hier permanent **ongemeten** zijn — en ongemeten is in dit
project uitdrukkelijk niet groen.

## Wat er vóór dit besluit al gemeten was

Vier kandidaatregels, door drie sessies, allemaal op de open dossierrijen met
risico Kritiek/Hoog/Middel:

| | regel | vuurt |
|---|---|---|
| A | "de rij noemt een issue dat Done is" | 48/55 — **87%** |
| B | "de rij noemt een issue dat ná de rijdatum Done ging" | 27/49 — **55%** |
| — | richting 1, "er is een gelande PR voor dit issue" | 7/18 — **39%** |
| C | "de gemeten objecten zijn sindsdien aangeraakt" | 19/43 — **44%** |

Alle vier ver boven wat een grendel mag melden. `CLAUDE.md` zegt waarom dat
fataal is en niet alleen vervelend: *"een controle die alles meldt, leer je te
negeren"*.

⚠️⚠️ **Regel B faalde bovendien omgekeerd.** 📏 Met `git blame` per rij gemeten:
de rijen die B vlagde waren mediaan op 13-09 bijgewerkt tegen 10-09 voor de
rijen die hij liet staan, en 12 van de 27 in de laatste vier dagen tegen 5 van
de 22. **B mat onderhoud en las dat als verval** — een rij die een vers
vervolgissue noemt, is hoe een verzórgde rij eruitziet.

## De diagnose die alle vier deelt

**In dit project is een issuenummer een citaat en geen structurele verwijzing.**
Migratiekoppen, testkoppen, beslisdocumenten en dossierrijen noemen issues als
bronvermelding, en die dichtheid is hier hoog met opzet. Elke detector die
*"issuenummer staat in de buurt van X"* leest, erft die dichtheid.

Vrijwel elke dossierrij noemt het issue **waarin hij gevonden is**, en dat issue
is per definitie Done zodra de rij bestaat. Daar is geen drempel tegen bestand.

## Regel C, en waarom hij op een andere as valt

Regel C vraagt niet naar een issuenummer maar naar het **object**: draagt deze
rij een 📏-meting over iets dat sindsdien herschreven is? Dat is semantisch de
goede vraag — een meting is een uitspraak over een versie.

Dezelfde structurele toets die B velde, op C: 📏 mediane rijdatum **2026-09-07**
voor de rijen die vuren tegen **2026-09-08** voor de rijen die niet vuren, met
in allebei de groepen 2026-08-15 als oudste. **C is geen verkapte
ouderdomsmeter.** Dat is het verschil met B, en het is de reden dat hij verder
mocht.

## De twee verfijningen — uit de valse meldingen, niet uit een drempel

Ruw vuurt C op 44%. Twee verfijningen brengen dat naar 9%, en allebei komen ze
uit het met de hand nalopen van wat er fout gevlagd werd:

1. **Alleen objecten die de rij in zijn titel noemt.** De rompkolom noemt van
   alles in het voorbijgaan; de titel zegt waar de rij óver gaat. 19 → 6.
2. **Een migratie die de rij zelf noemt, is geen drift.** 📏 Het zuiverste geval
   is r650: de titel eindigt op *"(QS8-333, 0244)"* en de aanraking wás `0244`.
   De rij beschrijft die migratie, hij loopt er niet op achter. 6 → 4.

⚠️ Dat onderscheid is het hele besluit: een verfijning die uit een tegenvoorbeeld
komt, beschrijft de fout; een verfijning die uit een getal komt, beschrijft de
steekproef.

### De derde verfijning is gemeten en afgewezen

De Datum-kolom is wanneer de bevinding **gevonden** is; latere hermetingen staan
als datum in de tekst. Peilen op de jongste datum in de rij brengt 4 → 1.

**Niet ingevoerd.** 📏 Die ene is niet de scherpste maar de enige die overleeft:
de verfijning liet r788 vallen, en die was aantoonbaar terecht gevlagd — `0289`
herschreef `schone_naam()` op 17-09 en de rij beschreef de stand daarvóór. De
rij was óók op 17-09 bijgewerkt, alleen eerder op de dag. **Datums hebben hier
dagkorrel, en die korrel is grover dan het verschil dat de verfijning moet
zien.** Een verfijning die een bewezen echte melding wegneemt om het getal te
drukken, optimaliseert het getal en niet de bevinding.

## Wat de controle bij het aanzetten vond

Vier rijen, en dat is de eerlijke telling — **drie ervan zijn raak en één vuurt
op een opgeloste helft**:

| rij | object | aangeraakt door | oordeel |
|---|---|---|---|
| r306 | `herbereken_risico` | `0155`, `0157`, `0159`, `0162`, `0163` | raak — meting van 25-08, functie vijf keer herschreven |
| r586 | `beslis_deadline_verzoek` | `0288` | raak — 📏 de bevinding overleeft, nagelezen in `0288` |
| r788 | `schone_naam` | `0289` | raak — de randstap is een dag later idempotent geworden |
| r214 | `maak_seizoensrecaps` | `0158`, `0194` | **vals** — zie hieronder |

**Precisie 3 van 4.** Dat hoort hier te staan en niet afgerond te worden: de
winst tegenover 87% is groot genoeg om geen hulp nodig te hebben.

⚠️ **r214 is een benoembare valse klasse.** Die rij droeg twee bevindingen; deel
1 (*"de gedeployde `rollover` kent `maak_seizoensrecaps()` niet"*) is op 17-09
gesloten, deel 2 (`verify_jwt`, geen `config.toml`) staat nog open. De titel
adverteerde nog de gesloten helft, en dáár staat het object. **Een kop die een
opgeloste bevinding noemt, kost de lezer van de novemberagenda precies de tijd
die dit document moet besparen** — dus de titel is bijgewerkt in plaats van de
controle verzacht. Dat is geen omweg om groen te worden: de kop was onwaar.

## Wat dit voor het issue betekent

**De blokkade is weg.** Deze regel leest alleen `docs/ENGINEER-REVIEW.md` en
`supabase/migrations/` plus `git log` — geen `LINEAR_API_KEY`, geen netwerk, geen
database. Hij draait dus in de poort én in CI, en hij is met de hand te ijken.

Wat hij **niet** vervangt: de audit die Linear naast de code legt. Die blijft
handwerk voor een sessie met de Linear-koppeling, zoals op 17-09 gedaan is. Dit
besluit zegt alleen dat die audit geen grendel kan worden langs een issuenummer —
en dat er langs het **object** wél een grendel bestaat.

## Grenzen die de controle zelf opschrijft

- Alleen objecten in de database. Een rij die `notificaties/index.ts` meet loopt
  net zo goed achter, en daar is een migratie geen signaal voor.
- Alleen objecten tussen backticks. Wie de naam in proza schrijft, ontsnapt.
- Alleen Kritiek/Hoog/Middel. De ~270 Laag-rijen hebben hun eigen grendel.
- Geen tabelnamen: die worden door tientallen migraties aangeraakt, dus
  "sindsdien aangeraakt" is er altijd waar. 📏 Tabellen meetellen: 19 → 24.

## Twee dingen die pas door het ijken goed kwamen

⚠️ **Een mutatie liet de hele suite groen, en de toets die hij moest breken
bleef staan.** De `SCHEMAS`-uitsluiting stond aan beide kanten; hem weghalen uit
`objectenVanMigratie()` veranderde niets, want élk schemavoorvoegsel staat daar
in een niet-vangende groep en er kan dus nooit een schemanaam in een capture
landen. De toets was groen omdat geen enkel patroon matchte — niet omdat de
grendel werkte. Hij is verplaatst naar `objectenInTitel()`, waar hij wél vuurt,
en de dode tak is weg. Dit is `CLAUDE.md`: *"kijk bij een ijking wélke test
omvalt, niet dát er een omvalt"*.

⚠️⚠️ **En de datumlezing faalde open op de gevaarlijkste klasse.** De eerste
versie las `git log --diff-filter=A` en sloeg een migratie zonder datum stil
over. 📏 Elf van de 292 kwamen er zo uit, en het waren precies de **hernummerde**
— `0176`–`0180`, `0236`, `0237`, `0239`, `0245`, `0248`, `0269`. Hernummeren
gebeurt bij een botsing, dus dat is de jóngste klasse: juist de migraties die
drift veroorzaken, waren onzichtbaar. Een aanraking die niemand ziet is een
groene controle. Het is nu de oudste commit die het pad raakt, en een pad zonder
geschiedenis is een harde fout.
