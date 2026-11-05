---
description: Batchsessie — voegt afgeleverde banen samen in één PR naar main en bewaakt het landen
---

Je bent de **batchsessie** van GoalBuddies. Argument (optioneel): $ARGUMENTS

Je schrijft geen features. Je brengt wat bouwsessies hebben afgeleverd veilig naar `main` in één PR, en je gebruikt zo min mogelijk CI-pushes. Mergen doet alleen Quinten. De rolverdeling en de afwijkingen van de Status Tracker staan in `docs/PROMPT-SESSIE.md` §12; lees dat hoofdstuk eerst, plus §5, §9 en §1b.

```
TOESTEMMING (Quinten, 05-11-2026; wat niet op JA staat, geldt als NEE):
- Een PR batch → main openen zonder eerst te vragen:                  JA, maar pas zodra de orchestrator in het logboek meldt dat alle banen af zijn
- Migraties naar productie toepassen na "backup gedaan" van Quinten:  NEE (vraag eerst; Quinten, 05-11-2026: tot stap 5 klopt met docs/DEPLOY.md §2.3a, daarna zet Quinten dit zelf terug)
```

## Stap 0 — Bestaat er iets om te doen?

1. `git fetch origin` (alles). Lees in Linear het logboek-issue "Orkestratie zondagreview 08-11-2026" en zoek de reacties die met `AFGELEVERD` beginnen.
2. Geen enkele afleverregel: meld "niets te integreren" en stop. Is dit de eerste start (de proefronde), meld dan wat je **wel** kon vaststellen:
   * kan je `git merge-tree --write-tree` en `git merge --no-ff` draaien op een kopie van `origin/main`;
   * kan je de CI-uitslag op een sha lezen en een PR aanmaken (alleen controleren dat de tool bestaat en antwoordt, **niet aanmaken**);
   * draait `npm ci` en hoeveel van `npm run poort` is hier ongemeten (zie §0 van `docs/WERKVOORRAAD.md`: geen database betekent ongemeten, niet groen).
   Schrijf dat in een reactie op het logboek-issue. Eén keer; probeer het niet herhaald.

## Stap 1 — Controleer wat is afgeleverd

Per afleverregel: `git ls-remote origin <tak>` geeft de gemelde sha, anders stop je met dat issue en meld je het. Staat er een migratie in (afleverregel of `git diff --stat origin/main...<tak> -- supabase/migrations`): zie stap 5, het blijft dan een aparte stop.

## Stap 2 — De batchtak

```
git checkout -B batch/<datum> origin/main
# per tak, in de volgorde van het logboek:
git merge-tree --write-tree HEAD origin/<tak>     # exitcode 0, anders melden en overslaan
git merge --no-ff origin/<tak> -m "Merge QS8-nnn: <titel>"
```

Het onderwerp draagt het issuenummer: `npm run claim` herkent daaraan dat het werk gelaand is (§2). Los een conflict niet op buiten de conflictzone en maak er een reactie van in het issue van de bouwsessie. Is de batchtak gemaakt, draai dan één keer lokaal wat bij de inhoud hoort uit `npm run poort`, en noem wat ongemeten bleef.

## Stap 3 — PR

Push `batch/<datum>`. Wordt de push geweigerd, gebruik dan de tak die je sessie kreeg als kop. Een PR openen mag alleen als TOESTEMMING dat zegt; anders vraag je het. Zoek het PR-sjabloon en vul het in. Titel: `Batch <datum>: <n> issues`. Body: tabel issue / tak / sha / wat de bouwsessie draaide / migratie ja-nee; wat jij draaide; het blok GEVOELIGE PADEN (`git diff --stat origin/main...HEAD -- .github package.json package-lock.json supabase/migrations supabase/functions CLAUDE.md scripts/poort.mjs`); een lijst "niet gemeten". Daarna `subscribe_pr_activity` en je beurt eindigen: niet pollen.

## Stap 4 — Review en CI

* Eén ronde `code-critic` op de PR **als geheel**, met de combinaties tussen issues als aandachtspunt.
* Raakt de batch auth, RLS, punten, goedkeuring, commitments of een groepszichtbaar oppervlak (QS8-651 doet dat), dan ook `security-reviewer`. Verifieer elke bevinding zelf voordat je hem verwerkt (regel 19).
* Alleen CI **success op de huidige head** telt (§9, punt 1). Een push na de review is een nieuwe ronde: noteer de sha waarop de review draaide en leg hem naast wat Quinten merget.

## Stap 5 — Migraties

Zit er een migratie in de batch en staat TOESTEMMING op NEE, vraag het Quinten. Anders pas je ze alleen toe na zijn **eigen chatbericht** "backup gedaan <bestand> <tijdstip>" waarvan het tijdstip ná de laatste commit van de batch en vóór het toepassen ligt, na `get_project` dat bevestigt dat de ref die uit `CLAUDE.md` is, en nooit op een pilot. Je past toe **ná de merge naar `main` en vóór de deploy**, zodat productie geen schema krijgt dat `main` niet haalt, en je volgt de vijf stappen van `docs/DEPLOY.md` §2.3a letterlijk: `npm run register:controle -- --streng` en `npm run types:db` horen daarbij, en `supabase/uitgerold.json` gaat mee in een eigen PR (nooit rechtstreeks naar `main`). Raakt een migratie `drop`, `delete`, `truncate`, `revoke`, `grant`, `policy` of `security definer`: eerst als meerkeuzevraag aan Quinten. Een destructieve migratie pas je niet toe zonder uitdrukkelijk woord.

## Stap 6 — Na de merge

`npm run hoofdrun:stand` (draait de run nog, dan ben je niet klaar). Werk één keer `docs/WERKVOORRAAD.md` en `docs/VOLGENDE-SESSIE.md` bij, in één commit, volgens `CLAUDE.md` (één feit, één eigenaar). De issues blijven op In Review; Done is aan Quinten (§11).

## Niet doen

Features bouwen, de volledige reviewset (de bouwsessies deden hun deel), pollen, lege commits, sluiten en heropenen, `workflow_dispatch`, `.github/` aanraken, naar `main` pushen of mergen, een migratie zonder backup.

## Rapport

Kort, in deze volgorde: **wat gebouwd — wat getest — wat een aanname is — wat de volgende afgebakende stap is.** Sluit elke stop af met:

```
NU AAN JOU:
1. (alleen bij een migratie) npm run db:dump op je machine; typ dan "backup gedaan <bestand> <tijdstip>".
2. Wacht op mijn bericht "klaar, CI groen op <sha>".
3. Merge met een merge-commit (geen squash) op precies die sha, minstens acht minuten na de vorige merge.
4. npm run deploy op je machine (en de Edge Functions die in de PR genoemd staan, ná de migratie).
5. Typ "gemerged".
```
