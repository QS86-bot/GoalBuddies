# Een lockfile die zichzelf tegenspreekt, ziet `npm audit` niet — 10-11-2026 (QS8-679)

**Beslist door:** de sessie die QS8-679 bouwde, binnen de beslisbevoegdheid van `CLAUDE.md`: een controle, geen nieuwe dependency, geen geld, niets onomkeerbaars. Voortgekomen uit de security-review op QS8-674 (PR #660); het bestond al vóór die wijziging.

## De aanname waar `audit:controle` op rust

`npm audit` leest `package-lock.json` en niet wat `npm ci` installeert. Dat is alleen veilig zolang de lock met zichzelf klopt. Er was in dit project niets dat dat toetste.

## Gemeten

Met echte npm-locks (npm 10.9.9, een scratchmap met `lodash` en `minimist`), telkens `npm audit --omit=dev --json` en `npm ci`:

| Vervalsing | `npm audit` | `npm ci` |
| --- | --- | --- |
| **1. `version` zegt iets anders dan `resolved`** (lock zegt 4.18.1, `resolved` en `integrity` van 4.17.20) | **0** advisories, ook mét `node_modules` | slaagt, **installeert 4.17.20** |
| **2. een aliasregel zonder `name`** (`npm:lodash@4.17.20` onder de naam `wacht`) | **0** in plaats van 4 | slaagt |
| **3. `dev: true` op een transitief productiepakket** (`minimist` onder `mkdirp`) | **0** in plaats van 2, **ook mét `node_modules`** | slaagt |
| **4. een `integrity` die niet bij het tarball past** | 4, ongewijzigd | **faalt met `EINTEGRITY`** |

Twee dingen wijken af van wat de reviewer meldde, en dat is hier opgeschreven omdat ze iets over de aard van het gat zeggen. Vervalsing 3 is ook **mét** `node_modules` gemeten (de review had dat alleen zonder). En mijn eerste poging voor 1 en 3 was slecht opgezet: een directe dependency met een exacte versie laat `npm ci` stoppen op `EUSAGE`, omdat `package.json` en lock elkaar dan tegenspreken. Pas met een bereik (1) en een transitieve afhankelijkheid (3) is het gat echt. Dat is meteen de grens van wat een aanvaller kan: de vervalsing moet de lock laten kloppen met `package.json`, en dat kan alleen bij ranges en transitieve pakketten.

## Gekozen

`npm run lockfile:controle` (`scripts/lockfile-controle.mjs`): een offline script dat alleen `package-lock.json` leest, zonder nieuwe dependency. Per registerregel:

1. de versie moet bij het tarball in `resolved` passen (vangt 1);
2. de naam in `resolved` moet het pad zijn, of de regel moet `name` dragen en dat moet kloppen (vangt 2);
3. er moet een `integrity` zijn;
4. een regel die vanaf de wortel bereikbaar is via `dependencies`, `optionalDependencies` of `peerDependencies` mag geen `dev: true` dragen (vangt 3). De bereikbaarheid volgt Node's zoekvolgorde (`oplossen()`) en volgt een `link` naar zijn bestemming.

De vervalsingen 1 tot en met 3 zijn met de hand nagemaakt op de echte scratchlocks en worden daarop rood met de bedoelde melding. De echte lock is groen op **940** registerregels, zonder één regel van buiten het register.

**Vervalsing 4 vangt dit script niet en hoeft het niet:** `npm ci` toetst de `integrity` tegen het tarball en faalt zelf (gemeten). Het script controleert daarom alleen dát er een `integrity` is, niet de waarde. Dat vraagt wel dat CI `npm ci` draait, en dat doet de hoofdjob.

## Wat afgewogen is en niet gekozen

Niet gemeten: dit zijn ontwerpkeuzes en geen uitslagen.

* **Een bestaand hulpmiddel voor lockfile-controle** (bijvoorbeeld `lockfile-lint`). Een nieuwe dependency voor dit doel; ik heb niet gemeten wat het wel en niet ziet, dus ik kan niet zeggen dat het vervalsing 2 of 3 mist. Een eigen script van ± 180 regels zonder afhankelijkheden was bij gelijke dekking goedkoper dan een afweging van supply-chain-risico voor het gereedschap dat supply-chain bewaakt.
* **Na `npm ci` de versies in `node_modules/*/package.json` naast de lock leggen.** Zou vervalsing 1 vangen, maar niet 2 en 3 (een alias en een vlag zitten in de lock en niet op schijf) en vraagt een installatie.
* **`npm audit signatures`.** Niet geprobeerd. Het toetst registerhandtekeningen van tarballs, een andere vraag dan "spreekt de lock zichzelf tegen".

## Wat de controle niet ziet

* **Een lock die met zichzelf klopt maar naar een ander pakket of een andere host wijst dan bedoeld.** Een kwaadaardig tarball met een eigen, geldige `integrity` valt hierbuiten: dat is een vraag op registerniveau. De host in `resolved` wordt niet gecontroleerd; elke host telt als register.
* **Regels zonder `resolved`** (git, `file:`, gebundelde pakketten) worden overgeslagen, en tellen mee als `overgeslagen` in de melding. In de huidige lock zijn dat er nul.
* **Andere vlaggen dan `dev`** (`optional`, `peer`, `inBundle`): niet toetsbaar zonder dezelfde meting als hierboven, en `audit:controle` draait zonder `--omit=optional`.
* **Een vervalste lock die ook `package.json` laat kloppen** met een ander versiebereik. Dat is een gewone, legitieme wijziging van een dependency en hoort bij de review.

## Terugdraaien

Haal `scripts/lockfile-controle.mjs`, `tests/scripts/lockfile-controle.test.ts` en de rij `lockfile:controle` uit `package.json` weg, en ververs `auditkop` en `poortstand`. Er is geen migratie, geen workflow en geen data bij betrokken.
