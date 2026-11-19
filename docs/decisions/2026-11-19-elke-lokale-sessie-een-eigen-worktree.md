# Elke lokale sessie een eigen worktree (QS8-717)

**Rollback:** `git revert` van de commits van QS8-717; geen migratie. Wie een
worktree heeft staan, ruimt hem op met `git worktree remove <pad>`.

## Wat er was

Gemeld door de bouwsessie van QS8-700 (18-11-2026): halverwege het bouwen zette
een parallelle sessie haar werkmap om naar een andere tak, en haar ongecommitte
wijzigingen verdwenen uit de map. Alles is hersteld en de remote klopt.

📏 Op `origin/main` van 19-11-2026 noemden `docs/PROMPT-SESSIE.md`, `CLAUDE.md`,
`.claude/commands/*.md`, `docs/VOLGENDE-SESSIE.md` en `scripts/claim.mjs` het
woord *worktree* nergens. PROMPT-SESSIE §1 deelt het werk over **bomen**, en zei
niets over een eigen map per sessie.

⚠️ **Het mechanisme is een vermoeden en geen meting.** `zetClaim()` deed
`checkout -b … origin/main`; in één gedeelde map zet een claim van sessie B dus
de tak van sessie A om. Welk commando het op 18-11 werkelijk was, staat in de
`git reflog` van Quintens werkmap. Quinten draait die op zijn machine en zet de
uitvoer op QS8-717 (AC1).

## Besluit (Quinten, 19-11-2026)

**Lokaal krijgt elke sessie een eigen `git worktree`**, en `npm run claim` maakt
die zelf aan. Een tussenvorm ("afspreken wie wanneer") laat het gat staan.

| stand | wat `npm run claim -- <naam>` doet |
| -- | -- |
| lokaal, in de hoofdmap | `git worktree add -b <naam> <repo>-werk/qs8-<n> origin/main`, claim-commit en push dáár; de hoofdmap blijft op zijn tak, met zijn ongecommitte werk |
| lokaal, in een worktree die al van één sessie is | de gewone weg in die map (`checkout -b`) — de map is al van één sessie |
| cloud (`CLAUDE_CODE_REMOTE=true`) | de gewone weg in de map zelf; elke cloudsessie heeft een eigen container, en een map buiten de werkmap is voor de app niet te openen |
| `--hier` | de claim op de tak waar je staat, overal (QS8-620) |

- **Pad:** naast de repo, nooit erin (`werkboomPad()`): een worktree ín de map
  zou door elke `git status`, linter en testglob van de hoofdmap meetellen.
- **`.env` gaat niet mee.** Sinds QS8-702 heeft `npm test` geen sleutels nodig, en
  een gekopieerde `.env` is hoe het productieslot in werkbomen terechtkwam
  (QS8-700).
- **Opruimen**, vanuit de hoofdmap, na de merge: `git worktree remove <pad>`
  (de claim noemt het pad en het commando).
- **Cloud herkennen aan `CLAUDE_CODE_REMOTE=true`.** Een aanname over het
  platform: staat die variabele er niet, dan gaat ook een cloudsessie de
  worktree-weg — veilig, maar onhandig. Gemeten: in deze cloudsessie staat hij
  op `true`.

## De grendel en zijn ijking

`tests/scripts/claim-gelande-geschiedenis.test.ts` bootst het incident na met een
echte repository en remote op schijf: sessie A staat op haar tak met een
ongecommit bestand in de hoofdmap, sessie B claimt lokaal. De belofte: A's tak en
bestand staan er nog, en B heeft een eigen map op een eigen tak met de claim
gepusht, zonder `.env`. Een tweede geval claimt vanuit die worktree en blijft
daar. `tests/scripts/claim.test.ts` toetst `claimWijze()` en `werkboomPad()` los.

⚠️ **De helper van de bestaande claimtests zet `CLAUDE_CODE_REMOTE` nu
expliciet.** Geërfd liep die suite in de cloud de ene weg en in CI de andere;
gemeten: met en zonder de variabele in de ouder 62/62 groen.

**Geijkt per grendel, ervoor en erna 62/62:**

| mutatie | wat omviel |
| -- | -- |
| `claimWijze()` geeft altijd de oude weg | de `werkboom`-rij en beide lokale gevallen |
| de worktree-weg zet tóch de hoofdmap om | *"laat de tak én het ongecommitte werk van de hoofdmap staan…"* |
| de cloud niet herkend | de cloudrij, *"gaat wél door met --vervolg"* en *"weigert de gewone weg"* |
| een worktree telt als hoofdmap | *"in een worktree die al van één sessie is…"* |

## Wat niet gedaan is

- **AC1** (de reflog): op Quintens machine; open op QS8-717.
- **`docs/VOLGENDE-SESSIE.md`** (AC5): een bouwsessie raakt dat document niet
  aan (PROMPT-SESSIE §12); de batchsessie neemt de verwijzing mee.
  `/verder`, `/orkestrator` en `/batch` verwijzen wél.
- **Niet gemeten:** Windows (`git worktree` en het pad met backslashes).
  `werkboomPad()` gebruikt `node:path`, dus het scheidingsteken volgt het
  platform.
