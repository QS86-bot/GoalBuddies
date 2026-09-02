# scripts — de gereedschapskist

Overgenomen uit GoalBuddies op 02-09-2026. **De geschiedenis in de koppen is van
daar** (de datums, de `QS8-`-nummers, de migratienummers): die is bewust blijven
staan, want de kop van een script vertelt waaróm het bestaat, en dat waarom is
precies wat je kwijtraakt als je hem "opschoont".

| Script | Commando | Bewaakt |
|---|---|---|
| `poort.mjs` | `npm run poort` | alles wat groen moet zijn vóór een push, in één keer; telt *ongemeten* apart van groen |
| `conflictmarkeringen-controle.mjs` | `npm run markeringen:controle` | geen `<<<<<<<` in de repo |
| `docs-controle.mjs` | `npm run docs:controle` | de overdrachtsdocumenten spreken elkaar niet tegen; prijs en doelen staan op één plek |
| `emoji-controle.mjs` | `npm run emoji:controle` | geen emoji in app-tekst (content is uitgezonderd) |
| `json-controle.mjs` | `npm run json:controle` | geen dubbele sleutels in JSON — het enige vangnet dat JSON heeft |
| `review-controle.mjs` | `npm run review:controle` | elke open Laag-bevinding zegt wanneer hij zwaarder wordt |
| `migraties-controle.mjs` | `npm run migraties:controle` | nummering aaneengesloten, rollback-pad in elke kop, geen gat aan de bovenkant |
| `migratie-nieuw.mjs` | `npm run migratie:nieuw -- "naam"` | een migratienummer dat geen andere branch claimt (fetcht eerst zelf) |
| `migratie-hernummer.mjs` | `npm run migratie:hernummer -- 0004 0006` | hernummeren mét elke verwijzing, ook de kopregel |
| `stand.mjs` | `npm run stand` | het migratieblok in `docs/WERKVOORRAAD.md` genereren in plaats van overtypen |
| `verbindingen-controle.mjs` | `npm run verbindingen:controle` | niemand opent zelf een Postgres-verbinding (60 verbindingen voor de hele gratis tier) |
| `persoon-in-jsonb-controle.mjs` | `npm run persoon:controle` | geen verwijzing naar een persoon in een jsonb-veld |
| `paden.mjs`, `migratiebranches.mjs`, `letterversies.mjs`, `migratieregister-omgeving.mjs` | — | hulpmodules |

Elke `*:controle` in `package.json` draait automatisch mee in de poort. **Elk
script heeft een geëxporteerde functie en een test in `tests/scripts/`** die hem
élke vorm los aanbiedt: een controle die je niet kunt voeden, kun je niet ijken.

**Wat er níét is meegenomen** en waarom: alles wat aan Expo, de PWA, de Edge
Functions of de RLS-suite van GoalBuddies hing. De RLS-suite komt terug zodra er
een schema is (zie `docs/WERKVOORRAAD.md`), en dan als stap met `database: true`
in `poort.mjs`.
