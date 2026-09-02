# Luz de Luna Lera — projectmap

De website en de geautomatiseerde klantreis voor de coachingpraktijk van
Evianne, gebouwd door Quinten met Claude Code. Deze map is opgezet op
02-09-2026 uit de kick-off van die dag en uit alles wat GoalBuddies heeft
geleerd: de agents, de gereedschapskist, de werkwijze en 64 lessen.

**Begin bij `CLAUDE.md`** — de startinstructies staan bovenaan.

## In gebruik nemen

1. Kopieer deze map naar `C:\Users\Quint\.claude\projects\Luz de Luna Lera`
   (of naar een map naar keuze; niets hier hangt aan het pad).
2. Open een terminal in die map en draai:
   ```bash
   npm install
   npm run poort
   ```
   Alles hoort groen te zijn en niets "ongemeten".
3. `git init`, GitHub-repo aanmaken, pushen. Dat is issue LDL-1 in
   `docs/linear/ISSUES.md`.
4. Open Claude Code in de map en plak `docs/VOLGENDE-SESSIE.md`, of typ `/verder`.

⚠️ `C:\Users\Quint\.claude\projects\` is ook de map waarin Claude Code zelf de
gespreksgeschiedenis per project bewaart (mappen als `-home-user-GoalBuddies`).
Een projectmap ernaast werkt, maar een eigen map als `C:\Users\Quint\Projects\`
houdt code en geschiedenis uit elkaar. Dat is een keuze voor Quinten; deze map
werkt op beide plekken.

## Wat erin zit

| Map of bestand | Wat |
|---|---|
| `CLAUDE.md` | de grondwet, met de startinstructies |
| `.claude/agents/` | tien agents: zeven uit GoalBuddies aangepast, drie nieuw (n8n, content, privacy) |
| `.claude/commands/` | `/verder`, `/feature`, `/audit`, `/content`, `/onderzoek` |
| `docs/` | verslag van de kick-off, PRD, werkvoorraad, lessen, besluiten, onderzoeksvragen, issues, Bolt-prompts, contentbriefing, deploy, reviewdossier |
| `scripts/` + `tests/scripts/` | de poort en de controles, elk met ijkingstest |
| `supabase/`, `n8n/`, `web/` | leeg, met een README dat zegt wat erin hoort |
| `.github/workflows/ci.yml` | de poort in CI |

## Wat er nog van mensen moet komen

Staat in `docs/WERKVOORRAAD.md` §6: Eviannes teksten in `docs/content/bron/`,
haar voorbeeldposts, de bevestiging van naam, prijs en termijnen; van Quinten
een Supabase-project, een n8n-keuze en een Hostinger-adres.
