# `audit:controle` blokkeert een PR alleen om wat de PR toevoegt — 05-11-2026 (QS8-674)

**Beslist door:** Quinten, 05-11-2026, op de ontwerpvraag die QS8-618 uitstelde "tot een tweede geval": kies *alleen nieuwe advisories blokkeren*. Uitgewerkt door een bouwsessie. De keuze raakt geen commitment device, kost geen geld en is niet onomkeerbaar; ze verzwakt wel een supply-chain-grendel op PR-niveau, en daarom staat hier wat de controle op een PR niet meer ziet.

## De vijf gevallen

In alle vijf werd `audit:controle` rood op een tak of PR zonder dat een commit eraan had geraakt: npm publiceerde een advisory, het register `NAGEKEKEN` klopte niet meer, en elke tak werd rood.

| Datum | Wat npm erbij zette | Issue |
| --- | --- | --- |
| 09-09-2026 | `js-yaml` | in de `reden` van die rij |
| 24-09-2026 | `image-size`, weg en terug onder nieuwe nummers | QS8-616, QS8-618 |
| 05-10-2026 | `brace-expansion`, `node-forge` | QS8-625 |
| 06-10-2026 | `compression`, `source-map-js` | QS8-648 |
| 05-11-2026 | `shell-quote` (critical), `zod`, `deepmerge`, `glob`, `minimatch`, plus elf advisories op `node-forge` | QS8-669 |

Elke keer kostte het een sessie. 📏 Het vijfde geval liet zien hoe ver het reikt: `main` stond rood op een run van 02-11 waar geen commit bij kwam.

## De gekozen vorm

`audit:controle` kent twee modi. De modus komt uit de omgeving (`GITHUB_EVENT_NAME`, `GITHUB_REF`); `ci.yml` en `.github/` zijn niet aangeraakt.

| Omgeving | Modus | Oordeel |
| --- | --- | --- |
| `pull_request`, en `push` naar een andere branch dan `main` | `pr` | rood alleen om wat de wijziging **toevoegt** ten opzichte van de basis |
| `push` naar `main`, `schedule`, tag, lokaal, onbekend | `strikt` | het volledige register-oordeel van QS8-191, ongewijzigd |

**Wat telt als "toegevoegd":** een paar (pakketnaam, advisory-nummer) dat de PR draagt en de basis niet, en dat niet in `NAGEKEKEN` staat. Daarnaast, apart, elke afwijking van het register die de PR zelf veroorzaakt: een rij die blijft staan terwijl de PR het pakket weghaalt (`npm audit fix`), of een ernst of reparatie die verschuift. Dat staat op de PR-meting van `verschil()` en niet op die van de basis. Tot en met de code-critic stond dit er niet, en was een PR die het register ongeldig maakte groen terwijl `main` er na de merge rood van werd. Daarnaast een extra kwetsbaar exemplaar (`nodes` uit `npm audit`) van een wortel die de basis al had en die het register niet volledig dekt. Een advisory die aan beide kanten staat is "de wereld verandert" en blokkeert niet; de controle zegt wel hoeveel afwijkingen van het register er op de basis ook zijn.

**Hoe de basis gemeten wordt:** `package.json` en `package-lock.json` van het splitspunt (`git merge-base HEAD origin/main`) gaan in een tijdelijke map, de twee bestanden van de PR in een tweede, en in beide draait `npm audit --omit=dev --json`, kort na elkaar. Beide kanten gaan dus op dezelfde manier uit twee bestanden, zonder `node_modules`; anders zou het verschil ook het verschil tussen een echte en een virtuele boom zijn. Het splitspunt en niet de punt van `origin/main`, anders wordt een PR die achterloopt beschuldigd van wat `main` sindsdien repareerde.

**Workspaces:** draagt de `package.json` van de basis of van de PR `workspaces`, dan zijn de deelpakketten in een map met alleen twee bestanden niet te meten (`npm audit` geeft dan een geldig, leeg rapport; door de security-review gemeten). Dat valt onder "basis niet te lezen" en dus terug op strikt, hardop.

**Een mislukte meting is ongemeten en nooit groen** (QS8-563, QS8-565): geen rapport voor de PR of de basis geeft exitcode 1 met `OVERGESLAGEN`.

**Kan de basis niet gelezen worden** (geen `origin/main` en een fetch die mislukt, of geen `package-lock.json` op het splitspunt), dan valt de controle terug op het strikte oordeel en zegt dat hardop, met de reden. Eén fetch wordt geprobeerd en alleen als `origin/main` ontbreekt (ondiepe checkout); dat is een toevoeging op de acceptatie, nodig omdat de Windows-job in CI geen volledige kloon heeft.

### Eén afwijking van de letterlijke acceptatie

Acceptatie 2 zegt "bij `GITHUB_EVENT_NAME` ongelijk aan `pull_request` blijft het oordeel zoals het was". Het issue zegt ook "Op een PR of tak". Beide kunnen niet waar zijn: `ci.yml` draait op elke `push` naar elke branch (`branches: ['**']`), en die run hangt naast de PR-run aan dezelfde commit. Bleef de push-run strikt, dan bleef de PR rood om dezelfde advisory en was er niets gewonnen. Gekozen is de bedoeling: een `push` naar een andere branch dan `main` krijgt de PR-modus.

Terugdraaien kan in één regel: de `push`-tak van `modusUit()`. Dan is de push-run van een branch weer strikt en moet je de PR-run apart lezen.

## Wat de controle op een PR niet meer ziet

1. **Een advisory die al in `main` zat en die de PR niet aanraakt.** Dat is het besluit zelf. Het signaal verhuist naar `main` en het wekelijkse schema, waar het wel rood wordt.
2. **Een versiewissel binnen dezelfde advisory.** Gaat een PR van een kwetsbare versie van een pakket naar een andere kwetsbare versie met dezelfde advisory-nummers, dan is het paar gelijk en blijft het groen.
3. **Een extra exemplaar van een pakket dat het register volledig dekt.** Dat dekte strikt ook; de teller bestaat voor het pakket dat het register níet dekt.
4. **Een eigen register-rij in dezelfde PR.** `NAGEKEKEN` is het register van de PR zelf: een PR die een dependency met een advisory toevoegt mét een rij komt door, zodat zo'n PR groen kan worden. De weging van die rij (staat de marker echt niet in `dist/`) is de review, niet deze controle. Ernst en reparatie van die rij worden wél gelezen (`registerSchade`), maar alleen voor wat de PR *verschuift*; een rij voor een pakket dat op de PR en de basis allebei hetzelfde meldt, wordt niet opnieuw getoetst.
5. **Een wijziging aan de controle zelf of aan `ci.yml`.** Een PR die `modusUit()` verbreedt of de basis naar zichzelf laat wijzen verzwakt de grendel zonder dat de grendel het ziet. Dat is review-gebied, en het is de reden dat dit issue `security-reviewer` krijgt.
6. **Ontwikkelafhankelijkheden.** `--omit=dev` aan beide kanten, zoals voorheen.
7. **Een met de hand vervalste lockfile** (versie, naam of `dev`-vlag die niet bij `resolved` hoort): `npm audit` leest de lockfile en niet wat er op schijf staat, in beide modi, dus ook op `main`. Dat bestond al; er is geen lockfile-integriteitscontrole. Door de security-review gemeten, niet hier opgelost.
8. **Een nieuw pad naar een al gedekte kwetsbare kopie** (bijvoorbeeld de bundel in): geen advisory en geen exemplaar erbij, dus onzichtbaar; `in_bundel` in het register kan zo stil onwaar worden. Strikt was hier even blind.
9. **De PR draait zijn eigen controle en zijn eigen `ci.yml`.** Dat gold al; de PR-modus verandert er niets aan, maar wie op deze grendel leunt moet weten dat hij tegen een eerlijke vergissing beschermt en niet tegen een PR die de grendel zelf wijzigt. Wat de grendel echt tegenhoudt is de strikte run op `main` en op het schema.

## Wat gemeten is, en wat niet

Gemeten in een cloudsessie op `origin/main` `059f73ff`, met echte `npm audit`-aanroepen:

* **PR zonder wijziging:** groen, "de PR voegt geen advisory toe".
* **Wereld verandert** (de `deepmerge`-rij uit het register gehaald, `package*.json` ongewijzigd): strikt rood op `deepmerge`, PR-modus groen.
* **PR voegt toe** (`lodash@4.17.20` in `package.json` en lockfile, daarna teruggezet): rood op vier advisories van `lodash`, met de verwijzing naar de bouw-meting.
* **Basis niet te lezen** (remote hernoemd, geen `origin/main`): terugval op strikt met melding; de reden staat in de uitvoer.

Ijking per grendel, elk apart gebroken, met welke test omviel (`tests/scripts/audit.test.ts`, 58 toetsen groen op de ongebroken versie). De namen zijn ingekort.

| Gebroken | Omgevallen |
| --- | --- |
| `bijgekomen()` vindt nooit iets | drie toetsen van grendel 1 |
| exemplaren niet meegeteld | "extra exemplaar" |
| eenheid alleen de naam | "nieuwe advisory op een pakket dat de basis al kende" |
| registerdekking genegeerd | "PR groen met een register-rij" |
| `bijgekomen()` negeert de basis | drie van grendel 1, "dezelfde advisory aan beide kanten" en de cli-toets voor `pull_request` |
| `registerSchade()` negeert de basis | "dezelfde advisory aan beide kanten", "afwijking op de basis rekent de PR niet aan" en de cli-toets |
| schade telt niet mee in het oordeel | "rij blijft staan terwijl de PR het pakket weghaalt" |
| basis onleesbaar telt als groen | "bij die terugval nog steeds rood" |
| terugval zonder melding | "zegt dat hardop" en de tweede |
| meting van PR of basis mislukt telt als groen | elk zijn eigen "ongemeten"-toets |
| workspaces niet gemeld | "valt terug op strikt als de basis workspaces draagt" |
| push-tak strikt / `main` als `pr` / standaard leest de omgeving | elk zijn eigen `modusUit`-toets, en `main` als `pr` ook de cli-toets |
| de CLI geeft `pr` hardgecodeerd door | "blijft op main en in het schema strikt" |
| `merge-base` vervangen door de punt van `origin/main` | "leest de bestanden op het splitspunt" |
| de PR gemeten in de werkmap | "elk in een eigen tijdelijke map, PR eerst" |

**Niet gemeten:**

* **Of `actions/checkout` in de PR-job `origin/main` beschikbaar maakt.** Niet in Actions waargenomen. Wat er staat: de hoofdjob gebruikt `fetch-depth: 0`, wat alle branches ophaalt, en de Windows-job heeft een ondiepe checkout. De code hangt daar niet van af: ontbreekt `origin/main`, dan volgt één fetch, en mislukt die, dan valt hij hardop terug op strikt. Wat de eerste PR-run echt doet staat in de CI-uitvoer van die run, en alleen als hij rood of ongemeten is.
* **De Windows-job en een achterlopende branch.** Die job heeft een ondiepe checkout en neemt dan de punt van `origin/main` als basis. Op een push naar een branch die achterloopt kan Windows daardoor rood zijn terwijl Linux groen is. Niet gemeten.
* **De terugval-melding in CI.** `ci-controle-draai.mjs` toont bij een groene uitslag alleen `✓ naam`; de melding van een terugval of een ondiepe checkout is in CI dus alleen te zien als de uitslag rood of ongemeten is. Lokaal en in de Windows-lus is de uitvoer volledig. Zie de ER-rij.
* **De fetch in de Windows-job.** Dat de checkout een token meegeeft aan `git fetch` is aangenomen, niet gemeten.
* **`push` naar een branch met een `GITHUB_REF` die niet met `refs/heads/` begint.** Valt naar strikt.

## Terugdraaien

Haal `modusUit()`, `exemplarenUit()`, `bijgekomen()`, `basisBestanden()`, `leesBasisEnPr()` en `prOordeel()` uit `scripts/audit-controle.mjs` en geef `hoofd()` zijn oude vorm terug (`strikt()` is zijn oude lichaam). De CLI-regel onderaan roept weer `hoofd()` aan zonder opties. Er is geen migratie, geen workflow en geen data bij betrokken.
