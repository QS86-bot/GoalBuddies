# Een branch zonder PR is onzichtbaar — QS8-385

**Datum:** 09-09-2026
**Aanleiding:** QS8-384 — tien afgeronde branches op de remote, tot 22 uur oud,
zonder één pull request. Zes ervan droegen een migratienummer dat `main`
intussen aan iets anders vergeven had.

## Het gat

Dit project leest de remote branchlijst op drie plekken, en alle drie lezen ze
de **inhoud** ervan en nooit de **leeftijd**:

| Wie | Waarvoor | Wat hij een branch zonder PR vindt |
|---|---|---|
| `npm run claim` | is dit issuenummer al bezet? | een gezonde claim |
| `migratie:nieuw` | welk nummer is vrij? | een branch die een nummer bezet houdt |
| `migraties:controle` | is er een gat of een botsing? | een botsing, en dus terecht |

Geen van de drie stelt de vraag *gaat deze branch ergens heen*. En CI draait op
de branch zelf, dus een branch waar niemand een PR voor opent, produceert geen
uitslag die iemand leest.

📏 Het is de derde keer van deze soort: QS8-131 (21 commits buiten `main`),
QS8-237 (vijf migraties op een branch zonder PR) en nu QS8-384. **De vorm keert
terug omdat er geen grendel op staat, alleen een gewoonte.**

## De keuze: `git ls-remote refs/pull/<n>/head`, niet de GitHub-API

De eerste opzet vroeg de GitHub-REST-API welke branches een PR hebben. Dat is
📏 gemeten en het werkt hier niet:

| Weg | Uitslag |
|---|---|
| `GITHUB_TOKEN` uit de omgeving | `401 Bad credentials` — het is een proxy-plaatshouder van 14 tekens, geen GitHub-token |
| ongeauthenticeerd | `403 rate limit exceeded` — het proxy-IP is gedeeld en de teller staat op nul |
| `git ls-remote origin 'refs/pull/*/head'` | **332 regels**, met dezelfde credentials waarmee `git push` werkt |

GitHub publiceert elke pull request als een ref op de remote. Die weg heeft geen
sleutel nodig die iemand moet zetten, werkt ook op een privé repository, en
draait op de credentials die er per definitie al zijn — anders kon je niet pushen.

⚠️ **Dit is bewust géén work-around voor een ontbrekende sleutel.** De regel in
`CLAUDE.md` is dat je bij een ontbrekende sleutel stopt en `wacht-op-Quinten`
labelt in plaats van eromheen te bouwen. Hier gaat het niet om een tweede,
zwakkere weg naar hetzelfde antwoord: `refs/pull/<n>/head` **is** de pull
request, gepubliceerd door GitHub zelf. Hij is bovendien de betere weg, want hij
werkt ook op Quintens laptop zonder dat daar een token hoeft te staan.

### De toets is een exacte gelijkheid van de tip

`refs/pull/<n>/head` volgt de kop van de PR zolang die openstaat en bevriest
zodra hij dichtgaat. Een branch waarvan de tip precies een PR-head is, is dus
*besloten* — open, gesloten of gemerged. Alle drie tellen, want over alle drie
is een besluit genomen; ook een gesloten PR is een antwoord.

⚠️ **"Is een PR-head een vóórouder van de tip" is de verkeerde vraag, en dat is
gemeten en niet bedacht.** Elke branch die van `main` afstamt draagt de kop van
elke ooit gemergede PR in zijn geschiedenis. 📏 Die toets wees voor alle vijf de
geprobeerde branches naar `refs/pull/105/head`, een PR van weken terug. Hij zou
nooit iets melden.

Het gevolg van de exacte toets is dat een branch die ná zijn merge nog commits
kreeg, hier weer opduikt. Dat is de bedoeling: die commits staan buiten `main` en
er hoort geen PR bij. 📏 Drie van de elf meldingen van vandaag zijn precies dat
geval — `qs8-287`, `qs8-295` en `qs8-296` — en die had de handmatige ronde van
QS8-384 gemist.

## De grens: twaalf uur, en die is tegen het geval gehouden

⚠️⚠️ **De eerste waarde was 24 uur, en die meldde 📏 nul van de tien branches
waarvoor deze controle gemaakt is.** Hun tips liepen van 12:16 tot 20:18 UTC op
08-09; het was 10:30 UTC op 09-09, dus 14 tot 22 uur oud. De grens miste precies
de zaak die hem liet ontstaan.

Op twaalf uur meldt hij er acht van de tien; de andere twee (`qs8-333`,
`qs8-335`) zijn van vanochtend 05:47 en zijn dus terecht nog stil.

De leeftijd is die van de **laatste commit** en niet van de eerste: een branch
begint hier met een lege claim-commit en krijgt daarna uren werk. Op de
aanmaaktijd zou elke lopende sessie na een halve dag rood staan. De tip beweegt
zolang er gewerkt wordt en staat stil zodra dat ophoudt.

## Waarom hij `branches:stand` heet en niet `branches:controle`

`poort.mjs` leest **elke** `*:controle` uit `package.json` en draait hem — met
zoveel woorden, want die lijst met de hand bijhouden liep achter zodra iemand een
controle toevoegde. Een uitzonderingslijst erbij zou dat gat terugzetten voor
iedereen ná mij. De naamconventie ís de opname; wie er niet in hoort, draagt de
naam niet. Zelfde vorm als `stand`, `poortstand`, `rls:dekking` en
`edge:gedeployd`.

Hij hoort er niet in om twee redenen:

1. **Hij fetcht.** `CLAUDE.md` deelt de scripts in tweeën: wie een antwoord
   uitdeelt fetcht, wie in de poort controleert niet — daar maakt een
   netwerkaanroep de uitslag afhankelijk van bereikbaarheid. Dit script zégt hoe
   oud een branch is, en dat antwoord is verkeerd op een verouderd beeld.
2. 📏 **Hij staat vandaag rood**, met elf branches. In de poort zou dat betekenen
   dat niemand meer kan pushen tot iemand anders zijn branches opruimt.

Hij houdt wél het woord `OVERGESLAGEN` en exitcode 0 aan voor het geval dat hij
niets kán meten — niet omdat de poort dat hier leest, maar omdat dat in dit
project het vaste onderscheid is tussen *groen* en *ongemeten*.

## Het register, en waarom een dode rij ook rood is

⚠️ Zonder register meldt dit script op dag één eenendertig dingen, en dat is de
vorm waarvan `CLAUDE.md` zegt dat je hem leert negeren. In `AANVAARD` staan acht
branches waarover al besloten is dát ze blijven staan, elk met de reden erbij.
Wat er **niet** in hoort is een branch die nog moet landen; die hoort rood te
zijn.

⚠️ **Een rij zonder branch is ook rood.** Anders groeit het register uit tot een
lijst dode uitzonderingen die niemand meer durft op te schonen — en dan
onderdrukt hij op een dag een branch die toevallig dezelfde naam krijgt. Zelfde
afspraak als het register in `tests/scripts/psql-verbinding.test.ts`.

## De ijking

Acht mutaties, één per grendel, elke keer met een `grep -c MUTATIE-<letter>`
bevestigd dat de mutatie in het bestand stond vóór de uitslag geloofd werd.
Nulmeting groen, na afloop opnieuw groen. De tabel staat in de kop van
`scripts/branches-controle.mjs`.

⚠️ **A en B zijn de twee die dit script van ruis onderscheiden**, en ze slaan
allebei de kant op die je niet vanzelf test: A laat een branch mét PR met rust, B
een branch die nog geen halve dag stil staat. Zonder die twee meldt dit ding elke
branch die niet in `main` zit.

## Wat hier niet in zit

* **Besluiten over de elf branches van vandaag.** Dat is QS8-384.
* **Branches opruimen.** Een cloudsessie krijgt 403 op verwijderen — QS8-240,
  `wacht-op-Quinten`.
