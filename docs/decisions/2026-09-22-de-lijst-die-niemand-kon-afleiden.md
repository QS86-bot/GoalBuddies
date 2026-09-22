# De lijst die niemand kon afleiden

**22-09-2026 · QS8-585 · `tests/scripts/hulpscripts.ts` en de zes integratieharnassen**

## Wat er stuk was

Zes integratiesuites draaien een script in een tijdelijke git-kloon. Elk van de
zes typte zelf een lijst van scripts die mee moesten in die kloon. Niets leidde
die lijst af uit de imports.

📏 Gereproduceerd op 22-09-2026 tegen `origin/main` = `2d77db03`, met één regel
erbij in `scripts/paden.mjs` (dat in álle lijsten staat) die uit
`zonder-commentaar.mjs` importeert (dat in géén enkele stond):

| | geslaagd | rood | skipped |
| --- | --- | --- | --- |
| ervóór | **36** | 0 | 0 |
| erna | 9 | 14 | **13** |

| suite | status | rood | skipped |
| --- | --- | --- | --- |
| `migratie-fetch` | failed | 7 | 0 |
| `migratie-gelande-branch` | failed | 5 | 0 |
| `migratie-nummerbotsing` | failed | 2 | 0 |
| `migratie-hernummer-botsing` | failed | **0** | **8** |
| `migratie-hernummer-dossier` | failed | **0** | **5** |

⚠️ **Dertien is het gevaarlijke getal, niet veertien.** Twee suites melden nul
rode toetsen en dertien die nooit gedraaid hebben: valt het om in `beforeAll`,
dan heeft geen enkele assertie gelopen en telt vitest ze als `skipped`. Dezelfde
klasse als de OVERGESLAGEN-poort (QS8-268) en de suite die zichzelf stil oversloeg
(QS8-270) — **ongemeten is niet groen.**

📏 **Wat vandaag níet reproduceerde, en dat hoort erbij.** De dossierrij van
21-09 zegt dat zo'n run *"geen enkele rode"* geeft. Alle vijf de bestanden kwamen
hier terug als `failed`, dus de run als gehéél was rood. Wat wél reproduceert is
dat het aantal toetsen dát draaide stil met dertien daalt. De rij overdreef op
dat ene punt; de klasse klopt.

## Waarom dit een mechanisme is en geen incident

Dit is de vierde keer. `migratieregister-omgeving.mjs` ontbrak tot QS8-365,
`rollbackpad.mjs` tot QS8-405, `paden.mjs` tot QS8-580 — en elke keer zijn de
instanties opgeruimd en is het mechanisme blijven staan. CLAUDE.md zegt wat
daarvan komt: *een reparatie die de instanties opruimt en het mechanisme laat
staan, groeit terug — en hij doet dat onder een rij die "opgelost" zegt.*

## Wat er nu staat

`tests/scripts/hulpscripts.ts` leidt de **transitieve importsluiting** af uit de
entry-scripts en kopieert die.

⚠️ **De entries blijven met de hand opgeschreven, en dat is geen
inconsequentie.** Welk script een harnas drááit, is waar die test over gaat — dat
hoort in de test te staan. Wat dat script nódig heeft, is een eigenschap van het
script, en die hoort niet overgetypt te worden.

📏 De afgeleide sluiting reproduceerde op 22-09-2026 alle vijf de handgetypte
lijsten exact: **8, 7, 7, 4 en 4** scripts. Dat is het bewijs dat de omzetting
niets verloor.

⚠️ **Die meting staat hier en niet als toets, en dat is met de ijking verdiend.**
De eerste versie pinde die acht namen vast in een assertie. Mutatie 1 van de
ijking — één import erbij in `scripts/paden.mjs` — liet alle zes de harnassen
groen zoals beloofd, en maakte precies díe toets rood. Een toets die de volgende
persoon dwingt een handgetypte lijst `.mjs`-namen bij te werken zodra hij een
import toevoegt, is het probleem van dit issue terug in een assertie. Wat er nu
staat is de **eigenschap**: elke entry en zijn directe imports zitten erin, de
sluiting gaat dieper dan één niveau, en het is niet de hele map.

### De grendel tegen terugkomen kijkt naar de handeling

⚠️⚠️ **De eerste versie zocht een array met twee of meer `.mjs`-namen** en meldde
daarmee ook de `ENTRIES` van een harnas dat juist wél omgezet was. De regel is
niet *typ geen lijst* maar **kopieer zelf geen scripts naar een kloon** —
dezelfde vorm als bij `psqlArgumenten()`, waar de regel ook niet *gebruik deze
functie* luidt maar *bouw je eigen aanroep niet*.

📏 **En dat onderscheid vond meteen een zesde harnas.** De dossierrij van 21-09
én de eerste inventarisatie van deze ronde telden er allebei **vijf**. Het zijn er
**zes**: `claim-gelande-geschiedenis.test.ts` draagt zijn lijst op één regel
(`const HULPSCRIPTS = ['claim.mjs', 'migratiebranches.mjs'];`) en ontsnapte
daarmee aan een grep die op een meerregelige array zocht. Zijn lijst was
toevallig compleet — `claim.mjs` importeert precies die ene — dus hij was niet
stuk, alleen onzichtbaar.

⚠️ Woordelijk de les van QS8-414: *een regel die je met de hand handhaaft,
handhaaf je op de vorm die je toevallig intypt.* Twee onafhankelijke tellingen
kwamen op vijf omdat ze dezelfde vorm aannamen.

## De ijking

📏 **Ervóór: 61 geslaagd, 0 rood, 0 skipped** over de zes harnassen plus de
ijking, op commit `f623acd9`. Eén mutatie per grendel, telkens teruggedraaid, en
na afloop opnieuw 61/0/0.

| # | mutatie | rood |
| --- | --- | --- |
| 1 | **de belofte**: één import erbij in `scripts/paden.mjs` | **niets** — 61/0/0, waar dezelfde mutatie ervóór 14 rood en 13 skipped gaf |
| 2 | `lokaleImports` knipt geen commentaar | *laat een uitgecommentarieerde import liggen* |
| 3 | `importsluiting` volgt alleen directe imports | *volgt twee niveaus diep* + *gaat dieper dan één niveau* + 14 toetsen in de harnassen |
| 4 | `lokaleImports` pakt ook bare specifiers | *laat een bare specifier liggen* + 5 andere |
| 5 | een harnas kopieert weer zelf | *vindt geen kopieeractie uit scripts/ in de testboom* |
| 6 | de grendel knipt geen commentaar | *laat een uitgecommentarieerde kopieeractie liggen* |

⚠️⚠️ **Mutatie 6 gaf de eerste keer nul rood, en dat is de vondst van deze
ijking.** De grendel tegen terugkomen las de bron zonder dat iets vasthield dát
hij knipte: een uitgecommentarieerde `cpSync(… 'scripts' …)` was voor hem niet te
onderscheiden van een echte, en niemand zou dat gemerkt hebben. Woordelijk
QS8-412: *de knip die een controle scherp houdt, is zelf een grendel.* De
detectie staat daarom nu als `kopieeracties()` in de helper en niet als regex in
de toets — **een controle die je niet kunt voeden, kun je niet ijken.**

## Wat dit niet is

Geen kopie van `scripts/` in zijn geheel. Dat werkt en het is korter, maar dan
draait het script in een omgeving waar álles staat — en juist de krappe kloon is
wat deze harnassen bewijzen: een script dat in CI op een verse checkout draait,
heeft alleen wat hij importeert.

En geen belofte dat een harnas nooit meer omvalt. `kopieerHulpscripts()` dekt de
`.mjs`-imports; een script dat een JSON-bestand inleest of een binary aanroept
heeft nog steeds iets nodig wat niemand afleidt. Wat er wél is, is dat de
faalvorm die dit vier keer opleverde — een import erbij — er niet meer bij hoort.
