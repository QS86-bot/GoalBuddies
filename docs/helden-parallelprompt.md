# Parallel bouwen aan de zes helden

Startprompt voor QS8-468 en zijn zes deelissues. Plak de prompt hieronder in een
nieuwe sessie en vervang `<ISSUE>` door het issuenummer.

> Dit bestand gaat alleen over dit epic. De algemene startprompt staat in
> `docs/VOLGENDE-SESSIE.md`, de stand in `docs/WERKVOORRAAD.md` en de regels in
> CLAUDE.md. Dit bestand herhaalt geen van drieën — het zegt alleen wat er bij
> **parallel** werken aan dít epic misgaat.

## Wat er nu tegelijk kan

| Ronde | Issues | Tegelijk |
| -- | -- | -- |
| 1 | QS8-469 (rooster als data), QS8-470 (palet) | 2 sessies |
| 2 | QS8-471 (datamodel) | 1 sessie, wacht op QS8-469 |
| 3 | QS8-474 (quiz), QS8-475 (stem), QS8-477 (open groep) | 3 sessies |

De blokkeerrelaties staan in Linear. Ronde 2 kan starten zodra QS8-469 gemerged
is — niet zodra hij "bijna af" is, want het zijn juist de sleutels waar de rest
op leunt.

## De prompt

```
Werk QS8-<ISSUE> af tot een pushbare branch.

Lees eerst, in deze volgorde:
1. CLAUDE.md — de regels.
2. docs/WERKVOORRAAD.md sectie 0 — de stand.
3. docs/decisions/2026-09-14-zes-helden-en-de-zeven-besluiten-eronder.md — de
   zeven besluiten van 14-09-2026 waar dit epic op staat. Dit is de bron. Waar
   docs/superhelden-archetypes.md iets anders zegt, wint dit document: dat
   brondocument is een verslag van augustus.
4. Het issue QS8-<ISSUE> in Linear, én zijn reacties. Niet alleen de
   beschrijving — bij een issue dat dagen openstaat terwijl er parallel gewerkt
   wordt, is de reactie precies de plek waar een besluit landt.

Claim daarna met `npm run claim -- <branchnaam van Linear>` en zet het issue op
In Progress. Er werken meerdere sessies tegelijk aan dit epic; de claim is de
enige rem die er is, en hij is een afspraak en geen slot.

Bouw het issue af volgens zijn acceptatiecriteria. Draai `npm run poort` — die
draait alles, en niet een greep eruit. Draai de reviewagents die bij de
wijziging horen: raakt dit auth, RLS, punten, goedkeuring, commitments of een
groepszichtbaar oppervlak, dan is security-reviewer verplicht en wacht hij
nooit. Verifieer elke bevinding zelf voordat je hem verwerkt.

Push naar de branch van het issue en open een PR. Werk docs/WERKVOORRAAD.md bij
voordat je afsluit.
```

## De vier plekken waar parallel werken hier misgaat

Deze staan hier omdat ze **specifiek** zijn voor dit epic. De algemene regels
staan in CLAUDE.md en worden hier niet herhaald.

### 1. Twee issues maken een migratie

QS8-471 en QS8-477 schrijven allebei een migratie, en in ronde 3 kunnen ze naast
elkaar lopen. Migratienummers zijn in dit project al vier keer gebotst.

Vraag je nummer op met `npm run migratie:nieuw -- "naam"` — die fetcht zelf en
kijkt naar élke remote branch. **En controleer vlak vóór het mergen opnieuw of je
nummer nog vrij is:** het venster tussen de laatste groene CI en de merge bestaat
per definitie, want het nummer wás vrij toen het uitgedeeld werd. Draagt de
andere PR hetzelfde nummer, dan hernummert wie als tweede merget.

### 2. Drie issues schrijven in dezelfde i18n-catalogus

QS8-469 zet de zes helden in `src/shared/i18n/nl.ts` en `en.ts`; QS8-474 en
QS8-475 voegen er teksten aan toe. Dat is drie schrijvers in twee bestanden.

⚠️ De gevaarlijke uitkomst is niet het merge-conflict — dat zie je. Het is de
**dubbele sleutel** die een merge overleeft. Dat is hier één keer eerder gebeurd
(QS8-115) en de testsuite zag het niet: een duplicaat dat dezelfde parameters
draagt laat alle tests groen. Wat het wél vindt is `tsc` met `TS1117` en ESLint
met `no-dupe-keys` — twee onafhankelijke netten, allebei in de poort. Reken op
die twee en niet op de tests.

### 3. Twee issues raken CLAUDE.md

QS8-470 herschrijft de kleurregel; QS8-474 noteert de wijziging aan besluit A56.
`npm run docs:controle` wordt rood zodra CLAUDE.md, `docs/WERKVOORRAAD.md` en
`docs/VOLGENDE-SESSIE.md` hetzelfde feit gaan dragen.

Wie het eerst merget heeft geen werk; de tweede rebaset en leest zijn eigen
alinea na. Een blinde merge van twee CLAUDE.md-wijzigingen heeft in dit project
al eens een dossierrij van een ánder issue overschreven.

### 4. Twee groene PR's kunnen samen rood zijn

Draai **`npm run hoofdrun:stand` na élke merge.** Twee PR's die allebei terecht
groen zijn, kunnen samen `main` rood maken — dat is hier op 09-09-2026 gebeurd en
`main` stond vijfentwintig minuten rood terwijl CI het al om 11:51 gemeld had.
Wat ontbrak was dat iemand keek.

Rood op `main` is werk nu, en het is van wie als laatste mergede.

## Wat geen sessie zelf beslist

- **De Ziggle-loops en de Higgsfield-video.** Betaalde externe tools; grens 1 van
  *Beslisbevoegdheid*. De briefs staan in `docs/superhelden-archetypes.md`, het
  uitvoeren is werk voor Quinten.
- **De juridische eindcheck op de quotes.** Het brondocument raadt hem zelf aan
  vóór productie.
- **Een nieuw zichtbaar heldenoppervlak.** Deze ronde is datamodel, quiz en stem.
  Een heldenkaart op het overzicht is een eigen besluit, met de twee vragen van
  domeinregel 7 erbij.
- **Een held in een systeembericht.** Zie besluit 5 en beslisdocument 002 §3.
