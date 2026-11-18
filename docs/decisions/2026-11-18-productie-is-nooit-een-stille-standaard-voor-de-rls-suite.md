# Productie is nooit een stille standaard voor de RLS-suite (QS8-702)

**Rollback:** `git revert` van de commits van QS8-702; geen migratie.

## Wat er was
`tests/rls/harness.ts` koos productie bij elke `RLS_DOEL` die niet `lokaal` was,
ook bij een afwezige. `src/lib/test-env.ts` laadt `.env` bij elke `npm test`.
Een machine met productiesleutels maakte dus testaccounts op het echte project
aan, en `removeTestUsers()` zette een mislukte verwijdering om in een
`console.warn` (QS8-692: verwijderen faalt daar). Dat het zo gebeurde is een
gevolgtrekking uit de bron, niet gemeten.

## Besluit
- Doel is uitdrukkelijk: `RLS_DOEL=lokaal` of `RLS_DOEL=productie` (plus het
  bestaande slot `RLS_TEST_ALLOW_PROD=1`). Beslissing in `tests/rls/doel.ts`.
- Zonder doel: met `SUPABASE_SERVICE_ROLE_KEY` in de omgeving faalt het laden
  luid; zonder die sleutel slaat de suite stil over. De publieke URL en anon-key
  tellen niet, anders werd elke app-`.env` rood.
- `guardProductie()` geldt ook voor een lokaal doel.
- Een mislukte accountverwijdering maakt de suite rood met het aantal.
- `RLS_DOEL=productie` laat de psql-delen (lokale database) met rust.

## Niet gedaan (vervolg)
`npm test` draait nog beide vitest-projecten; `package.json`, `scripts/poort.mjs`
en CI vragen een eigen issue (unit-only `test`). Aantal accounts op productie
(AC4) is niet gemeten.
