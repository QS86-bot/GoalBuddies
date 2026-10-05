# `schedule:` is best-effort, en de hartslag van de uurjobs is de runlijst van GitHub — QS8-637

Besloten 05-10-2026. Valt onder *Beslisbevoegdheid* (een afweging, geen gate) met
één kanttekening: de twee alternatieven die geld of een extern vertrouwen kosten
(`pg_cron`, een externe planner) zijn hier **niet** gekozen, juist omdat ze onder
grens 1 vallen. Wil je er een, dan is dat een besluit voor Quinten.

## 1. Wat gemeten is

📏 Gemeten op 05-10-2026 om 07:40 UTC met de runlijst van GitHub
(`GET /repos/QS86-bot/GoalBuddies/actions/workflows/<naam>/runs?event=schedule`),
venster **zeven dagen**: 28-09 07:40 → 05-10 07:40 UTC. Verwacht bij elk uur: ~168.

| workflow | geplande runs | ritme | gemiddeld interval | mediaan | grootste gat | gaten > 6 u | gaten > 12 u | conclusie van alle runs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `rollover.yml` | **31** | 18,5% | 5,38 u | 5,41 u | **9,01 u** | 10 | 0 | allemaal `success` |
| `notificaties.yml` | **31** | 18,5% | 5,32 u | 5,64 u | **7,39 u** | 13 | 0 | allemaal `success` |

Dat is acceptatiecriterium 1, voor **beide** workflows. Het issue noemde 30 runs in
152 uur voor alleen de rollover; dit is dezelfde stand een dag later en over beide.

⚠️ **Wat dit wel en niet zegt.** Het is één venster van zeven dagen: een
waarneming en geen frequentie over weken. Het ritme kan morgen beter of slechter
zijn. Dat is precies waarom er een grendel komt en geen gok op een ander getal.

## 2. Waarom dit geen workflowfout is

Alle 62 runs zijn `success`, de `run_number`s zijn aaneensluitend (GitHub maakt de
overgeslagen runs niet eens aan) en de minuten liggen willekeurig in plaats van
op :00 en :30. Dat past bij de throttling die GitHub op `schedule:` toepast.
Beide jobs vuren bovendien gepaard (het functielog van de issue: uur 1/1, 8/9,
14/15, 18/19, 22/22) — twee onafhankelijke workflows met hetzelfde patroon wijzen
naar de planner. Dat laatste heb ik niet opnieuw gemeten (het functielog vraagt de
Supabase-MCP en dat is hier niet herhaald).

## 3. De afweging

| optie | wat het oplost | wat het kost | uitkomst |
| --- | --- | --- | --- |
| **`schedule:` houden, getolereerde vertraging uitschrijven en een hartslag toevoegen** | de job blijft zoals Quinten hem op 19-08-2026 koos (sleutel in GitHub Secrets); het gebrek wordt zichtbaar | de vertraging blijft; de hartslag meet alleen als hij draait | ✅ **gekozen** |
| `pg_cron` aanzetten | een planner met een eigen garantie, in de database zelf | een Edge Function aanroepen vanuit de database vraagt `pg_net` plus de service-role-key *in* de database — dat is wat `rollover.yml` op 19-08-2026 bewust vermeed (CLAUDE.md beveiligingsregel 4). De issue noemt het ook een raak aan de gratis tier. **Grens 1.** Ik heb niet nagemeten wat de tier precies toestaat | niet gekozen; wel de eerste kandidaat, zie §6 |
| een externe planner (cron-job.org e.d.) | dezelfde garantie zonder de database | een derde partij die een bearer-token met service-role-rechten of een aanroep-URL beheert; mogelijk een abonnement. **Grens 1** | niet gekozen |
| de job zichzelf laten herplannen (`workflow_dispatch` aan het eind van de run) | geen throttling van `schedule:` | vraagt een token met `actions: write` in de job die minpunten uitdeelt; één gebroken schakel stopt de ketting stil — precies het gebrek dat hier opgelost moet worden | niet gekozen |
| een eigen hartslag in de database (de job schrijft `laatste_run_at`) | bewijst dat de *functie* gelopen heeft, niet alleen de workflow | een migratie (een nieuwe tabel met deny-all RLS draagt ook nog een adviseurregel), een wijziging in beide functies en een **deploy** — en die kan vanuit een bouwsessie niet (QS8-243) | niet nu; zie §4 |

## 4. De hartslag is de runlijst, en waarom dat genoeg is

`rollover.yml` en `notificaties.yml` eindigen allebei op een controle van `HTTP 200`
**en** `"ok":true`. Een workflow met `conclusion: success` ís dus het bewijs dat de
functie gelopen heeft en gezegd heeft dat het goed ging. Dat is de hartslag die een
database-regel zou geven, zonder migratie, zonder functiewijziging en zonder deploy.

Wat dat **niet** vangt, met opzet opgeschreven:

* **Een functie die `ok:true` zegt en niets deed.** Dat is een ander gebrek dan dit
  issue (niet draaien) en wordt door de acceptatietests van de functie gedekt.
* **Dat de bewaker zelf een `schedule:` is.** `uurjobs.yml` vuurt op :47 en is net
  zo best-effort als wat hij bewaakt. Wie bewaakt de bewaker? **Niemand.** Dat is een
  gemeten grens en geen vergeten stap: een derde laag lost het niet op, het
  verplaatst het. Wat hem wel waardevol maakt: de kans dat *beide* tegelijk een
  halve dag zwijgen is kleiner dan dat één dat doet, en een rode run wordt door
  GitHub gemaild.
* **Een private repo.** De runlijst van een publieke repo is openbaar. Wordt de
  repo privé (QS8-126), dan leest het `GITHUB_TOKEN` van de workflow hem met
  `actions: read`; lokaal heeft `npm run uurjobs:controle` dan een token nodig.

De vervalvoorwaarde van de keuze voor de runlijst: **zodra er een tweede reden is om
de jobs een eigen hartslag te geven**, bijvoorbeeld een migratie waar die toch bij
past, wint de database-hartslag.

## 5. De getolereerde vertraging, en `GRACE_HOURS`

`GETOLEREERDE_VERTRAGING_UUR = 12` in `scripts/uurjobs-controle.mjs`. 📏 Het grootste
gemeten gat is 9,01 uur; twaalf laat drie uur marge en laat een gat van een halve
dag niet onopgemerkt. Het is een drempel op de **leeftijd van de laatste geslaagde
run**, niet op elk gat in het verleden: een gat dat hersteld is, is niet meer te
repareren en zou de controle zeven dagen lang rood houden.

**`GRACE_HOURS` (12) en deze vertraging zijn twee budgetten, en ze tellen op in
plaats van uit één pot te komen.** `GRACE_HOURS` is er voor de gebruiker die zijn week
te laat afsluit (QS8-51, *Night Owl Checkins*). De rollover mag een cyclus pas
afschrijven nadat die 12 uur verstreken is: `closableUserCycle()` in
`shared/time/cycle.ts` zegt het met zoveel woorden, en de rollover importeert die
functie. Een trage job schuift het afschrijven dus **later** en nooit **eerder**; de
coulance van de gebruiker wordt er niet door opgegeten. Het laatste moment waarop een
gemiste week is afgeschreven ligt hoogstens `GRACE_HOURS` + de vertraging na de
cyclusgrens: bij de drempel van 12 uur dus 24 uur, bij het gemeten maximum 21 uur.

⚠️ Dat de rollover alles inhaalt wat te oud is, is de **aanname** waar dit op rust.
Ze staat in de kop van `supabase/functions/rollover/index.ts` (*"een overgeslagen dag
wordt vanzelf ingehaald: alles wat te oud is, wordt bij de volgende run alsnog
gepakt"*) en volgt uit de idempotentie. **Ik heb dit niet gemeten met een gevulde
database**: productie heeft 1 profiel, 1 weekdoel, 0 punten, 0 commitments en 0
groepen, en de lokale stack is niet opgebouwd. De gevolgen van een late run, per
oppervlak:

| oppervlak | wat er later gebeurt bij een gat van 9 uur |
| --- | --- |
| een gemiste week | het minpunt en `missed` komen later; de reeks breekt later zichtbaar |
| een straf (domeinregel 11) | wordt later `due` en dus later zichtbaar voor de begunstigde groep — nooit eerder dan de deadline |
| de seizoensrecap | de groepsgrens kan een run overslaan en wordt bij de volgende gepakt |
| een nudge of weekafsluiting-melding | komt later binnen het uur dat de gebruiker gekozen had |

## 6. Wanneer dit opnieuw gewogen wordt

* De controle wordt **rood**: een uurjob is langer dan 12 uur niet gelopen. Dan is de
  aanname dat `schedule:` voldoende is gemeten onwaar, en is `pg_cron` de eerste
  kandidaat (grens 1: Quinten beslist).
* Er is een **eerste echte groep met een straf of een weekdeadline**. Vandaag gaat er niets
  door de jobs heen, dus een gat van 9 uur kost niemand iets. Dat is de reden dat dit
  nu een Laag-rij is en geen Hoog.
* Het ritme zakt onder wat het nu is (18,5%) — dat vraagt een tweede venster en niet een
  gok.

## 7. Wat er gebouwd is

* `scripts/uurjobs-controle.mjs` en `npm run uurjobs:controle`. De lijst uurjobs wordt
  **afgeleid** uit `.github/workflows/` (een `cron:` die elk uur vuurt) en niet
  opgesomd: een derde uurjob wordt vanzelf bewaakt.
* `.github/workflows/uurjobs.yml`, de bewaker: elk uur op :47, zonder secrets
  (`actions: read`).
* `docs/DEPLOY.md` §2.9: twee plekken beweerden *"elk uur"*; ze zeggen nu wat gemeten is.
* Geijkt met zeven mutaties, één per grendel (tabel hierboven).
  Eén ervan, het uitknippen van commentaarregels, maakte niets rood: de knip was
  dode code, omdat het anker aan het regelbegin een uitgecommentarieerde cron al
  buiten houdt. Hij is verwijderd; wat een anker op het regeleinde wel kapot maakt,
  een commentaar *achter* de cron, heeft nu een eigen toets.

📏 De ijking, met de stand ervóór gemeten op **20 geslaagd / 0 rood** (21 na de
toets op het commentaar achter de cron), in een kopie van de werkboom:

| # | mutatie | wat er rood werd |
| --- | --- | --- |
| 1 | `te-oud` bestaat niet (`oordeel: 'ok'`) | 4 — o.a. *houdt de grens vast* en *wordt rood als alleen de rollover uitblijft* |
| 2 | `hoofd()` wordt nooit rood (`rood \|\|= false`) | 2 — *wordt rood als alleen de rollover uitblijft*, *… notificaties uitblijft* |
| 3 | de bewaker bewaakt zichzelf (de `BEWAKER`-regel weg) | 3 — *bewaakt de bewaker niet*, *vindt precies de twee uurjobs*, *is groen als elke uurjob recent gelopen heeft* |
| 4 | het commentaar-anker `(#.*)?` weg | 1 — *vindt een uurjob met een commentaar achter de cron* |
| 5 | geen sortering op nieuwste | 1 — *kijkt naar de nieuwste run* |
| 6 | een fout bij het ophalen wordt een lege lijst | 1 — *zegt OVERGESLAGEN en geen groen* |
| 7 | een handmatige run telt als gepland | 1 — *telt een handmatige run als hartslag maar niet als gepland ritme* |

⚠️ **Wat niet gedaan kon worden toen dit geschreven werd:** `uurjobs.yml` was nog nooit
gedraaid. Dat is op 05-10-2026 gebeurd, met een rode eerste run als gevolg; zie §8. Een
run vanuit de echte `schedule:` (:47) is nog niet gezien.

## 8. De eerste run werd rood op een lijst die achterliep — QS8-644

📏 **Wat er gebeurde.** Op 05-10-2026 om 09:08 UTC, een paar seconden na de merge van
#636, werd de allereerste run van `uurjobs.yml` rood (`37288102981`): *rollover.yml:
laatste geslaagde run 34,4 u geleden, 23 geplande runs in 7 dagen*. De rollover-runs
360 t/m 367 bestonden en waren allemaal `success`; 34,4 u vóór 09:09 is precies run
359. De lijst miste dus de **nieuwste acht** runs, en alleen voor de rollover (notificaties
gaf 1,8 u en 31 runs). Run 2 (`37292753804`, 09:51) gaf groen: 1,1 u, 31 runs.

**Wat niet vaststaat: de oorzaak.** Kandidaten waren een achterlopende index achter het
`status`-filter, een cache per token of IP, of iets aan het `GITHUB_TOKEN` binnen een run.
Geen van de drie is bewezen. Op afroep zijn ze niet te onderscheiden: de drie vragen
(`?status=success`, zonder filter, `?event=schedule`) gaven op 09:51 hetzelfde antwoord,
en bij de steekproeven die daarna liepen ook (zie hieronder). Eén waarneming is geen
frequentie, en dit document schrijft er geen oorzaak bij die er niet is.

**Wat wél kan: de regel veranderen in plaats van de oorzaak te raden.** *Een run die
bestaat is bewijs; een run die in één lijst ontbreekt is dat niet.* De controle stelt nu
dezelfde vraag in drie varianten (`VARIANTEN` in `scripts/uurjobs-controle.mjs`) en neemt de
**vereniging** van de geslaagde runs:

* Een vals **groen** is daarmee onmogelijk: een run die in een lijst staat, bestaat.
* Een vals **rood** vraagt dat alle drie de lijsten tegelijk achterlopen.
* Loopt er één uiteen, dan blijft de uitslag groen en staat er een `⚠`-regel met de
  variant, het aantal en het moment van de nieuwste gemiste run. Zo bouwt het patroon zich
  op in de runlogs van het uur-voor-uur-schema, in plaats van uit één waarneming.
* Is een variant niet op te halen (rate limit), dan telt ze niet mee en staat dat erbij;
  zijn **alle** drie niet op te halen, dan blijft het `OVERGESLAGEN`.

Een variant hoort alleen te zien wat haar filter toelaat, en een volle pagina (100) is
afgekapt: wat ouder is dan haar oudste run telt niet als gemist.

⚠️ **Wat dit niet kan, en dat staat erbij.** Lopen alle drie de lijsten tegelijk achter,
dan is dat van een echt gat niet te onderscheiden en wordt de controle rood. Het
acceptatiecriterium zei dat een verouderde lijst *ongemeten* moest worden; dat kan alleen als er
een onafhankelijke waarheid is om haar naast te leggen, en die is er niet: `total_count`
loopt mee met dezelfde index. Dit is dus de eerlijke grens, geen oplossing.

⚠️ **De ijking** (zeven mutaties, één per grendel, stand ervóór 30/30): geen vereniging
(alleen het oude filter) → 4 rood; `mist` nooit gemeld → 2; schedule-variant moet ook
handmatige runs zien → 1; een mislukte variant gooit → 2; een mislukte run telt als bewijs
→ 1; niets op te halen is geen overslag meer → 1. **Eén mutatie, het afkappen van een volle
pagina, maakte eerst niets rood**: mijn test bouwde een situatie waarin de oudere run in geen
enkele lijst stond. Hij is herschreven (een lijst met mislukte runs die eerder ophoudt dan de
lijst met alleen geslaagde) en valt nu om op `telt wat ouder is dan het einde van een volle
pagina niet als gemist`.
