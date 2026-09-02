# supabase/migrations

Leeg tot `docs/decisions/001-datamodel.md` is vastgesteld. Datamodel eerst, op
papier, met RLS — dan pas hier.

Een nieuwe migratie begint met `npm run migratie:nieuw -- "korte_naam"`. Het
sjabloon zet het rollback-pad in de kop; `npm run migraties:controle` wordt rood
zonder.
