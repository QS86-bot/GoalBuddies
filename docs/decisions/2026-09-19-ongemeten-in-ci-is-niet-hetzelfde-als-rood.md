# Ongemeten in CI is niet hetzelfde als rood — QS8-563

**19-09-2026.** `main` stond rood op een regel die niets met de commit eronder te
maken had:

```
✗ audit-controle gaf exit 1:
⚠ audit-controle: OVERGESLAGEN — `npm audit` gaf geen rapport met `vulnerabilities`.
  Reden van npm: 400 Bad Request - POST .../-/npm/v1/security/audits/quick
```

📏 En een paar regels hoger in hetzelfde log, van npm zelf:

> `npm notice This endpoint is being retired. Use the bulk advisory endpoint instead.`

## Wat er werkelijk aan de hand was

Niets. `audit-controle` deed precies het goede: hij weigerde een **ongemeten**
uitslag groen te noemen, schreef `OVERGESLAGEN`, en gaf exitcode 1.

De poort kent drie uitkomsten — groen, ongemeten, rood — en `beoordeel()` in
`scripts/poort.mjs` bepaalt welke het is. De lus in `ci.yml` kende er **twee**,
want die keek alleen naar de exitcode. Dezelfde uitslag heette daardoor op twee
plekken iets anders: in de poort *ongemeten*, in CI *rood*.

📏 De prijs, gemeten: een half uur om vast te stellen dat mijn merge er niets mee
te maken had — inclusief een verkeerd spoor naar `dossierdrift:controle` en een
`git fetch --unshallow` die niets met de zaak te maken had.

## ⚠️ En het is intermitterend, wat het erger maakt

📏 Gemeten op 19-09-2026:

| run | tijd | uitslag |
|---|---|---|
| 2822, branch QS8-541 | 17:28 | rood |
| `main`, `771ef5c` | 17:28 | rood |
| 2824, branch QS8-321 | **17:45** | **groen** |
| 2825, branch QS8-541 | 17:46 | rood |
| lokaal | 17:55 | exit 0 |
| `main`, `6821c82` | 18:05 | groen |

Twee runs binnen één minuut gaven een verschillende uitslag. Een storing die
constant is, merk je en wacht je uit; een die per run wisselt, laat een rode
`main` achter waarvan de volgende sessie niet kan zien of het aan de diff lag.

## De keuze

Het issue bood drie richtingen. De gekozen vorm is een vierde, en de andere drie
zijn afgewogen:

| vorm | waarom niet |
|---|---|
| **1. Ongemeten wordt exitcode 0** | Dan is `audit:controle` in CI stil groen bij een storing. Dat is de *stille doorlaat* die dit project al drie keer duur betaald heeft — en het maakt het verschil onzichtbaar in plaats van juist. |
| **2. Uit de CI-baan halen** | Dan meet hij daar nooit meer. Dat draait QS8-417 terug, dat er juist voor zorgde dat een nieuwe grendel niet automatisch búiten CI belandt. |
| **3. Retry met uitstel** | ⚠️ De endpoint wordt **uitgefaseerd**. Een 400 is dan geen storing maar een aankondiging, en wachten lost niets op. |
| **4. CI krijgt dezelfde classificatie als de poort** | gekozen |

`scripts/ci-controle-draai.mjs` draait één controle en beoordeelt hem met
`beoordeel()` **uit de poort** — geen tweede kopie van het
`OVERGESLAGEN`-patroon, want twee classificaties die uit elkaar kunnen lopen
zijn precies wat hier misging.

## ⚠️⚠️ Waarom ongemeten in CI níet faalt en in de poort wél

Dat is een verschil, en criterium 1 vraagt het op te schrijven.

De **poort** draait op de machine van een mens. Daar is *"ik heb geen database"*
of *"ik heb geen productiesleutel"* een toestand die die mens kan verhelpen.
Falen is dan het juiste signaal: ga het halen.

In **CI** staat in de baan per definitie alleen wat er kán meten — dat is wat
`ZONDER_CI` garandeert. Komt zo'n controle tóch ongemeten terug, dan is dat een
storing **buiten** de commit. De committer kan er niets aan doen, en de build
rood maken schrijft andermans storing op zijn naam.

⚠️ **Maar stil doorlaten is het óók niet.** Een ongemeten controle krijgt een
`::warning::`-annotatie — die verschijnt bovenaan de run, niet ergens in een
log — en de stap telt ze apart op: *"N groen, M ongemeten, K rood"*. De poort
blijft er lokaal hard op falen.

## De helft die deze reparatie eerlijk houdt

⚠️⚠️ Zonder die helft is dit *"zet de melder uit"*. Een **échte** bevinding draagt
geen `OVERGESLAGEN` in zijn uitvoer, dus `beoordeel()` noemt hem rood en de
runner geeft exitcode 1. Dat staat onder toets met de vorm uit QS8-375 — de keer
dat `audit:controle` daadwerkelijk iets vond (`js-yaml` nieuw, `@xmldom/xmldom`
van moderate naar high).

## Geijkt — drie grendels, en de tweede was er geen

| mutatie | rood |
|---|---|
| ongemeten laten falen (het oude gedrag) | 1 — *faalt niet op ongemeten* |
| alleen `stdout` lezen | **0** ⚠️ |
| de `::warning::` weghalen | 1 — *als waarschuwing, niet als kruis* |

⚠️⚠️ **De tweede regel is de leerzame, en het is vandaag de derde keer.** Mijn
toets *"leest OVERGESLAGEN ook als het naar stderr ging"* voedde een eigen
uitvoerder aan `draaiControle()` en kwam daarmee nooit langs `voerUit()` — de
functie die stdout en stderr samenvoegt. Hij zette een `\n` voor de melding en
toetste verder niets. 📏 Met alleen `stdout` in `voerUit` bleven alle twaalf
toetsen groen.

Dat is geen detail: `audit-controle` schrijft zijn `OVERGESLAGEN` met
`console.error`, dus **stderr is precies de plek waar de melding staat die deze
hele reparatie moet herkennen**. De samenvoeging is de dragende regel, en ze was
onbewaakt.

`voerUit` neemt nu een injecteerbare spawner, en de toets voert de melding
uitsluitend op stderr aan. Mutatie 2 gaat daarmee van 0 naar 1 rood.

## Wat dit niet oplost

📏 De endpoint van `npm audit` wordt uitgefaseerd. Zodra hij helemaal weg is,
meldt `audit-controle` structureel `OVERGESLAGEN` — en dan is hij een controle
die nooit meer meet, zichtbaar als waarschuwing maar zonder waarde.

⚠️ Dat is een **eigen** vraag: draait er een npm-versie die de bulk-endpoint
gebruikt, en zo niet, wanneer wel? 📏 Vandaag (npm 10.9.7) geeft
`npm audit --omit=dev --json` gewoon een rapport, dus de storing is voorbij — en
dat is precies de reden die QS8-563 zelf noemt om hem **niet** te sluiten.
