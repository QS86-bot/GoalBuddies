# De titel van een merge is vrij, de claim-commit niet

**Datum:** 24-09-2026 · **Issue:** QS8-611 · **Raakt:** `scripts/claim.mjs`

## Wat er misging

📏 Op 24-09-2026 gaf `npm run claim` **QS8-606** vrij en pushte een claim-commit,
terwijl dat issue al af en gemerged was: `b5c8ecc6 Merge pull request #603 — een
uitzondering die niet over een uitzondering ging`. Dat is dezelfde fout als bij
QS8-437 en QS8-438 op 13-09, en die branch krijgt een cloudsessie net zo min weg
(QS8-240).

## Waarom de claim het niet zag

QS8-449 gaf de claim een tweede bron naast de branchlijst: de geschiedenis van
`origin/main`. Die las alleen het **onderwerp** van een landing, in twee vormen
(`Merge pull request #N …` en een squash met `(#N)`), en zocht daarin het
issuenummer.

Het onderwerp van een merge is de PR-titel, en een PR-titel is vrij. De kop van
het script noemde dat een grens en geen gat: *"De elf gelande regels zonder
issuenummer zijn alle elf `docs/`-PR's zonder issue."* Die meting van 13-09 klopt
niet meer:

| Merges op de eerste-oudertak sinds 13-09-2026 | aantal |
| -- | -- |
| alle merges | 167 |
| `Merge pull request …` zonder `QS8-NNN` in het onderwerp | 24 |
| daarvan met een `claim: QS8-NNN` in de tweede ouder | **8** |

Die acht (QS8-589, 595, 596, 597, 598, 599, 606 en 608) waren voor de claim alle
acht vrij.

## Het besluit: de claim-commit is het derde signaal

Elke branch die met `npm run claim` begon, draagt als eerste commit
`claim: QS8-NNN — …`. `zetClaim()` maakt die op een eigen branch vanaf
`origin/main`, dus hij komt alleen op `main` als die branch daar landt, en een
merge-commit neemt hem mee. `git log origin/main` loopt ook door de tweede ouder,
dus de regel staat in de lijst die de claim al las. Er komt geen extra
git-aanroep bij.

`claimVoor()` herkent hem. Twee grenzen:

- **Alleen het nummer direct na `claim: `.** Een gestapelde claim noemt ook de
  branch waar hij op staat (`claim: QS8-381 — bezet, gestapeld op QS8-380`); dat is
  geen claim op 380.
- **Alleen aan het begin van de regel.** Commit-teksten in dit project citeren
  volop andere commits.

## Wat dat meet

📏 Over de hele geschiedenis van `main` (299 issuenummers met een claim-commit)
voegt deze bron **precies die acht** toe aan wat de onderwerpregels al vonden. Alle
acht landden met werk: de merge die de claim meenam, veranderde 2 tot 13
bestanden. Er is geen claim-commit op `main` van een issue waarvoor niets
geland is.

Van de issues met een open PR op het moment van meten (QS8-600 tot en met 604,
QS8-607 en QS8-611 zelf) geeft er geen een treffer. Dat hoort zo: hun werk is nog
niet geland.

## Wat blind blijft

- **Een squash- of rebase-merge** laat geen claim-commit op `main` achter. Dan is
  het onderwerp weer de enige bron, en noemt de titel het nummer niet, dan ziet de
  claim niets. Dit project mergt met een merge-commit (CLAUDE.md, *Versiebeheer*).
- **Een branch die niet met `npm run claim` begon** draagt geen claim-commit.

## IJking

Per grendel één mutatie, en telkens gekeken wélke toets omviel (38 toetsen in
`tests/scripts/claim.test.ts` en `tests/scripts/claim-gelande-geschiedenis.test.ts`,
ervóór alle 38 groen):

| mutatie | rood |
| -- | -- |
| A — `claimVoor()` uit `gelandVoor()` | de unit-toets op QS8-606 én de integratietoets met de echte merge |
| B — het anker `^` weg | *laat een claim die middenin geciteerd wordt met rust* |
| C — de rechtergrens `(?![0-9])` weg | *laat een langer nummer met rust* |
| D — elk nummer in de claimregel telt | beide toetsen op de gestapelde claim |
