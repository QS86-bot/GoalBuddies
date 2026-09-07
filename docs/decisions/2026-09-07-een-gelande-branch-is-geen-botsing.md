# Een gelande branch is geen botsing — QS8-313

**Datum:** 07-09-2026
**Raakt:** `scripts/migratiebranches.mjs`, `migraties:controle` stap 4 en 4b
**Komt uit:** QS8-191, tijdens `npm run poort`

## Wat er misging

📏 Gemeten op `origin/main` (16b7c16) in een verse worktree:
`node scripts/migraties-controle.mjs` gaf **exitcode 1**, met zes meldingen die
alle zes dezelfde vorm hadden:

```
- origin/quintenstrijdonk/qs8-303-… draagt 1 migratienummer(s) onder een andere naam:
  0174: hier 0174_een_open_deadline_verzoek_houdt_de_straf_tegen.sql,
        daar 0174_auditspoor_met_een_eigen_volgordesleutel.sql.
```

De genoemde branches — `qs8-176`, `qs8-295`, `qs8-296`, `qs8-297`, `qs8-298`,
`qs8-303` — waren **allemaal geland**. Hun migraties stonden gewoon in de map,
alleen onder een ánder nummer, want wie als tweede mergede had hernummerd. Wat er
nog stond was de remote *branch*, met de nummering van vóór dat hernummeren.

## Waarom dit erger is dan een valse melding

Twee dingen, en de tweede is de erge.

* **De poort stond rood op een schone `main`.** Wie een sessie begint, draait
  `npm run poort`, krijgt rood, en dat rood gaat niet over haar werk.
* ⚠️ **Het is een controle die zichzelf opeet.** Deze controle bestaat om
  nummerbotsingen te vinden. Botsingen met een gelande branch zijn per definitie
  vals alarm, en die klasse groeit bij élke merge. **Hoe beter het project
  draait, hoe luider hij loog.** Dat is dezelfde vorm die QS8-304 al gekost
  heeft: een rode uitslag die niet over jouw wijziging gaat, leert je de uitslag
  te negeren — en die gewoonte vangt de volgende échte rode op als ruis.

## De reparatie, en waarom niet de andere

Het issue noemde twee richtingen.

**Gekozen: de branch overslaan zodra hij volledig in `origin/main` zit**
(`git merge-base --is-ancestor`). Dat is precies de voorwaarde waaronder de
melding onzin is: zit de branch in `main`, dan staan zijn migraties al in de map
die de controle als *hier* leest.

**Afgewezen als reparatie: gemergede remote branches opruimen.** Dat maakt de
controle vandaag groen zonder dat er iets veranderd is aan wanneer hij rood
wordt — over een week staat het er weer. En het haalt een signaal wég: `npm run
claim` leest diezelfde branchlijst.

## Drie helften, en ze bewaken elkaar niet

De filter zit in `remoteTakken()`, dat nu de enige plek is waar de branchlijst
gelezen wordt. Daarvóór hadden `nummersPerBranch()` en `namenPerBranch()` er elk
een eigen kopie van — twee lijsten die het oneens kunnen worden, en de reparatie
had er dan twee keer in gemoeten.

| Helft | Waarom hij er is |
|---|---|
| gelande zijtak valt af | de reparatie zelf |
| **open** zijtak blijft gemeld | anders is dit niet te onderscheiden van de controle uitzetten |
| **de stam blijft meetellen** | `origin/main` is trivialiter een voorouder van zichzelf |

⚠️ **Die derde is de subtiele.** Zonder uitzondering neemt de filter `origin/main`
mee, en dan verdwijnt de melding *main draagt migraties die hier ontbreken* —
precies het geval waarvoor stap 4 gebouwd is (QS8-238): je branch loopt achter en
moet `main` binnenhalen.

📏 Alle drie apart geijkt in `tests/scripts/migratie-gelande-branch.test.ts`, met
een échte remote op schijf: drie mutaties, drie verschillende rode tests.

## Er waren twee klassen, niet één

De filter hierboven maakte drie van de zes meldingen stil. De andere drie hadden
dezelfde vórm en een andere oorzaak, en het werd meteen zichtbaar toen 📏 een
verse zusterbranch (`qs8-317`) een botsing meldde op een migratie die van mij
was:

```
origin/…/qs8-317-… draagt 1 migratienummer(s) onder een andere naam:
  0182: hier 0182_het_dagquotum_telt_cent_en_niet_jobs.sql,
        daar 0182_het_oppervlak_van_de_getuige_volgt_de_groepsband.sql
```

Die tweede naam is mijn eigen migratie, die op `main` net van 0182 naar 0183 was
hernummerd. `qs8-317` vertakte daarvóór en draagt hem dus nog onder zijn oude
nummer. Op nummer én naam is dat een botsing; in werkelijkheid valt er niets te
hernummeren — die branch hoeft alleen `main` binnen te halen, en dan lost het
zichzelf op.

**Dus telt de romp van de bestandsnaam mee.** Draag ik `het_oppervlak….sql` al
onder een ánder nummer, dan kijk ik naar hetzelfde bestand en niet naar een
tweede claim op dat nummer.

⚠️ **Twee grendels, twee verschillende vragen.** `remoteTakken()` vraagt of de
**branch** geland is; de rompvergelijking vraagt of het **bestand** hier al
staat. Een open branch met een oud nummer voor mijn bestand is geland noch
afwezig — hij valt door beide vragen heen als je er maar één stelt. 📏 Apart
geijkt: de rompvergelijking eruit maakt twee unit-tests rood, `romp()` platslaan
maakt zeven tests in drie suites rood.

## Wat er ná deze twee grendels overblijft

📏 Op de branch van dit issue meldt de controle nog twee branches, en dat zijn
allebei **echte** botsingen: `qs8-147` en `qs8-295` dragen ieder een níeuwe
migratie op een nummer dat `main` intussen heeft uitgegeven. Daar is de melding
precies goed, en de weg terug ook: wie als tweede merget, hernummert.

Van zes meldingen op een schone `main` naar nul, en van drie ruis-meldingen op
een werkbranch naar twee terechte. Dat is wat criterium 1 en 2 samen vragen.

## Waar deze filter op leunt

⚠️ **Op de merge-commit.** `CLAUDE.md` schrijft voor dat werk landt met een
merge-commit en niet met een squash, omdat de commit-berichten hier het waaróm
dragen. Een squash-merge maakt een níeuwe commit, en dan is de branch géén
voorouder van `main` — de filter zou hem dan blijven melden.

Dat is de veilige kant om op te falen (een melding te veel, niet te weinig), maar
het is het opschrijven waard: **verandert die conventie ooit, dan wordt deze
controle weer luidruchtig** en is dat geen defect maar een gevolg.

## Wat het kost

📏 Eén `merge-base`-aanroep per remote branch. Gemeten met 22 branches:

| | tijd |
|---|---|
| met filter | 493 / 500 / 526 ms |
| zonder filter | 195 / 196 / 195 ms |

Ongeveer 14 ms per branch. Dat is te dragen voor een controle die in de poort
draait, en er is geen netwerkaanroep bij — `migraties:controle` fetcht met opzet
niet (zie de grens tussen uitdelende en controlerende scripts in `CLAUDE.md`).

## `npm run claim` heeft dezelfde blinde vlek, en daar hoort het zo

Criterium 4 van het issue. 📏 Gemeten:

```
$ npm run claim -- QS8-306          # QS8-306 is Done en gemerged
✗ claim: QS8-306 is al bezet — 1 branch(es):
    hotfix/qs8-306-hernummer-naar-0183
```

`claim.mjs` leest `git ls-remote --heads origin` en matcht op het issuenummer,
zonder te kijken of die branch geland is. **Dat blijft zo, en met reden:** de
vraag die `claim` stelt is een ándere. Hij vraagt niet *"botst dit nummer"* maar
*"heeft iemand dit issue al gebouwd"*, en op die vraag is een gelande branch juist
het **sterkste** ja dat er is. Blijkt er iets aan dat werk te ontbreken, dan is
dat een vervolgissue en geen tweede branch op hetzelfde issue — zo is QS8-290
ontstaan.

⚠️ Het verschil in één regel: **de controle vraagt naar de mígratiemap van nu, de
claim naar de geschiedenis van een issue.** De map vergeet een gelande branch
(zijn bestand staat er onder een ander nummer); de geschiedenis niet.
