#!/usr/bin/env bash
#
# Bouwt het schema op een lege database uit `supabase/migrations/` — QS8-122.
#
# ⚠️ **Dit is het bewijs onder acceptatiecriterium 5, en het is de reden dat
#    QS8-122 bestaat.** Een lokale stack en een tweede cloudproject werken
#    allebei op één manier: de migraties opnieuw afspelen op een lege database.
#    Kan dat niet, dan toetst een RLS-suite daar een ánder schema dan productie —
#    groen zonder iets te bewijzen, en dat is erger dan tegen productie draaien.
#
# ⚠️ Draait tegen een **lokale** Postgres en raakt het echte project nooit aan.
#    De databasenaam wordt eerst weggegooid en opnieuw aangemaakt; geef dus nooit
#    een verbinding op naar iets waar data in staat.
#
# Gebruik:
#   scripts/schema-opbouwen.sh                 # lokale server op poort 5433
#   PGPORT=5432 scripts/schema-opbouwen.sh
#
# Voorwaarde: een draaiende Postgres 16 waarop je superuser bent. Zie
# docs/DEPLOY.md, §"Het schema elders opbouwen".

set -euo pipefail

WORTEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${DB:-goalbuddies_opbouw}"
PSQL=(psql --quiet --no-psqlrc -v ON_ERROR_STOP=1)

if [[ -n "${PGHOST:-}" ]]; then PSQL+=(-h "$PGHOST"); fi
PSQL+=(-p "${PGPORT:-5433}" -U "${PGUSER:-postgres}")

echo "→ ${DB} opnieuw aanmaken"
"${PSQL[@]}" -d postgres -c "drop database if exists ${DB};" >/dev/null
"${PSQL[@]}" -d postgres -c "create database ${DB};" >/dev/null

echo "→ de steiger (supabase/shim)"
"${PSQL[@]}" -d "$DB" -f "$WORTEL/supabase/shim/0000_supabase_shim.sql" >/dev/null

aantal=0
for bestand in "$WORTEL"/supabase/migrations/*.sql; do
  naam="$(basename "$bestand")"
  versie="${naam%%_*}"

  # ⚠️ Elke migratie in zijn eigen transactie, precies zoals Supabase hem heeft
  #    toegepast. Alles in één transactie zou een fout in migratie 60 laten
  #    lijken op een fout in migratie 1.
  if ! "${PSQL[@]}" -d "$DB" -f "$bestand" >/dev/null; then
    echo "✗ ${naam} viel om" >&2
    exit 1
  fi

  # Het register vullen zoals het op productie staat: de versie is het
  # bestandsnummer. Zie docs/decisions/003-migratieregister.md.
  "${PSQL[@]}" -d "$DB" -c \
    "insert into supabase_migrations.schema_migrations (version, name)
     values ('${versie}', '${naam%.sql}')
     on conflict (version) do nothing;" >/dev/null

  aantal=$((aantal + 1))
done

echo "✓ ${aantal} migraties afgespeeld op een lege database"
