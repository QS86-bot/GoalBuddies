# Twee groene PR's, samen rood — detectie boven preventie

**Datum:** 09-09-2026 · **Issue:** QS8-390 · **Aanleiding:** QS8-388 / QS8-389

## Wat er gebeurde

Twee pull requests landden binnen twee minuten van elkaar. Ze kenden elkaar niet:
toen de CI van de een groen werd, bestond de wijziging van de ander nog niet.

📏 De runs op `main`, opgehaald uit de GitHub-API:

| Tijd (UTC) | Run | Commit | PR | Uitslag |
|---|---|---|---|---|
| 11:44:07 | 1700 | `97555d5` | #337 (QS8-229) — voegt een kale `await` toe | success |
| 11:46:32 | 1702 | `3697305` | #338 (QS8-350) — laat de grendel die vorm herkennen | **failure**, klaar 11:51:06 |
| 12:11:08 | 1709 | `90812f6` | #340 (QS8-389) — de reparatie | success |

**`main` stond vijfentwintig minuten rood.** Beide sessies zagen het los van
elkaar en schreven er een issue over (QS8-388 en QS8-389), binnen enkele minuten
van elkaar.

## De meting die de keuze bepaalt

Het issue schetst twee richtingen: een handmatige regel (1) of GitHub's *"Require
branches to be up to date before merging"* (2). Er is een derde, en die volgt uit
één waarneming:

📏 **Detectie was er al, en gratis.** CI draait op `push: branches: ['**']`, dus
élke merge naar `main` levert een uitslag op `main` op. Run 1702 was om **11:51:06**
klaar en rood. Wat ontbrak, was niet een meting maar iemand die keek: twintig van
de vijfentwintig minuten was `main` **aantoonbaar en onopgemerkt** rood.

⚠️ **En preventie zou dit geval niet gevangen hebben.** De "goedkope vorm" uit het
issue — de suite nog eens draaien tegen de huidige `main` vlak vóór de merge —
kost vier minuten. #337 merde om 11:45, #338 om 11:46. Wie om 11:44 begon te
verifiëren, merde om 11:48 op een beeld van 11:44. Preventie **versmalt** het
venster; ze sluit het niet, en op dit geval had ze verloren.

## Het besluit

**Detectie, als commando, meteen na het mergen.** `npm run hoofdrun:stand` vraagt
de nieuwste CI-uitslag op `main` en zegt groen, rood, draait nog, of ongemeten.

Waarom een commando en niet een zin in `CLAUDE.md`: dit project heeft twee keer
gemeten dat een gewoonte wegzakt — QS8-294 (drie keer hetzelfde issue gebouwd,
"claimen is een gewoonte en moet een commando zijn") en QS8-384 (tien branches
zonder PR). De zin staat er ook, maar hij wijst naar een commando.

⚠️ **Alleen groen is groen.** Draait de run nog, is hij afgebroken, of is de API
onbereikbaar, dan is dat ONGEMETEN of DRAAIT en de exitcode is niet nul. Dezelfde
doctrine als het OVERGESLAGEN-onderscheid in de poort, en om dezelfde reden: wie
een niet-meting als geslaagd telt, meldt "alles groen" over een toestand die
niemand heeft aangeraakt. Een afgebroken run is precies het geval van QS8-318.

## De prijs, eerlijk opgeschreven

| | Wat het kost | Wat het niet doet |
|---|---|---|
| **Dit besluit** | ~4 minuten wachten ná elke merge, en de gewoonte om het commando te draaien | Het **voorkomt** niets. `main` gaat nog steeds rood; hij staat alleen minuten rood in plaats van tientallen minuten. |
| **Optie 2** (branches up-to-date) | Elke merge maakt elke andere open PR ongeldig; met twee sessies die de hele dag mergen is dat een serialisatie van het werk | Sluit het venster wél volledig |

**Optie 2 blijft de enige echte grendel, en hij is niet afgeschreven.** Hij is een
dashboardinstelling en dus `wacht-op-Quinten`; de afweging is aan hem, want de
prijs (serialisatie) betaalt hij in doorlooptijd. Zolang die niet gezet is, is dit
besluit wat er is.

⚠️ **Wat dit besluit expliciet níet is:** een reden om de reparatie uit te
stellen. Rood op `main` is werk nu, en het is van wie als laatste merde — dezelfde
afspraak als bij migratienummers in QS8-318.

## De vondst onderweg

📏 **Node's globale `fetch` honoreert `HTTPS_PROXY` niet.** Dezelfde URL geeft
vanuit dit project twee antwoorden: `curl` → 200, `node fetch` → 403. De
uitgaande verbindingen van deze omgeving lopen door een proxy die de
GitHub-credentials meegeeft; `curl` gebruikt hem, `fetch` gaat er rechtstreeks
langs en is dan ongeauthenticeerd. Te zien aan `/rate_limit`: via de proxy staat
de limiet op 15000, rechtstreeks op 60.

Dat verklaart waarschijnlijk de aantekening in `scripts/branches-controle.mjs`
dat de GitHub-API hier "niet te bereiken" is. Voor díé controle blijft
`git ls-remote` de betere keuze — hij heeft geen API nodig. Hier wel: een
CI-uitslag staat in geen enkele git-ref.

⚠️ Op een machine zónder die proxy en zonder token zegt `hoofdrun:stand` eerlijk
ONGEMETEN. Dat is de enige uitkomst die hier niet mag liegen.
