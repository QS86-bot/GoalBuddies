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
#   scripts/schema-opbouwen.sh --dubbel        # elk bestand direct twee keer
#
# ⚠️⚠️ **Wat `--dubbel` toetst, en waarom "direct" het belangrijkste woord is**
#    (QS8-413). Elk migratiebestand wordt tweemaal afgespeeld vóórdat de
#    volgende aan de beurt is. Dat vindt een bestand dat op **zichzelf** botst —
#    0252 kon zijn eigen unieke constraint niet droppen zolang zijn eigen
#    foreign key eraan hing — en laat de uitzonderingsklasse met rust die
#    CLAUDE.md beschermt: een botsing met een **latere** migratie kan hier per
#    definitie niet optreden, want die migratie heeft nog niet gedraaid.
#
#    Een statische regel kan deze klasse niet zien. `bezwarenIn()` toetst per
#    object of er een `drop … if exists` vóór staat, en die stónd er voor
#    allebei de constraints van 0252. De fout zat in de volgorde **tussen twee
#    objecten**, en dat is een eigenschap van het geheel.
#
#    📏 Kost 2 seconden op 255 migraties (23,3 s → 25,3 s), want beide passes
#    gaan in één psql-sessie: de tweede is per definitie bijna helemaal no-op.
#
# Voorwaarde: een draaiende Postgres 16 waarop je superuser bent. Zie
# docs/DEPLOY.md, §"Het schema elders opbouwen".

set -euo pipefail

DUBBEL=0
for arg in "$@"; do
  case "$arg" in
    --dubbel) DUBBEL=1 ;;
    *) echo "onbekende optie: $arg" >&2; exit 2 ;;
  esac
done

WORTEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${DB:-goalbuddies_opbouw}"
PSQL=(psql --quiet --no-psqlrc -v ON_ERROR_STOP=1)

if [[ -n "${PGHOST:-}" ]]; then PSQL+=(-h "$PGHOST"); fi
PSQL+=(-p "${PGPORT:-5433}" -U "${PGUSER:-postgres}")

echo "→ ${DB} opnieuw aanmaken"

# ⚠️ **`drop database` weigert zolang er nog een sessie op staat**, en dat is geen
#    theorie: op 24-08 hield PostgREST er elf open, de drop mislukte, en de
#    RLS-suite draaide zeventien keer tegen een database die niet herbouwd was.
#    Groen op een schema van gisteren is erger dan rood.
#
#    Vandaar dat de mislukking hier hard is en niet als waarschuwing langsglijdt.
# ⚠️ Eerst de verbindingen op déze database afsluiten. Dat mag, en het is geen
#    grofheid: dit script gooit `${DB}` een regel verderop weg, dus alles wat
#    eraan hangt is per definitie iets dat zo meteen toch niets meer heeft. Het
#    alternatief — netjes vragen en falen — laat het script stranden zodra er een
#    PostgREST uit een vorige ronde blijft hangen met een ander werkpad, en dan
#    is de foutmelding "stop wat eraan hangt" niet eens uitvoerbaar.
#
#    De grens blijft die uit de kop: wijs dit nooit naar een database met data.
"${PSQL[@]}" -d postgres -c \
  "select pg_terminate_backend(pid) from pg_stat_activity where datname = '${DB}' and pid <> pg_backend_pid();" \
  >/dev/null 2>&1 || true

if ! "${PSQL[@]}" -d postgres -c "drop database if exists ${DB};" >/dev/null 2>&1; then
  echo "✗ ${DB} kon niet weg." >&2
  "${PSQL[@]}" -d postgres -At -c \
    "select '  nog verbonden: ' || count(*) || ' sessie(s), o.a. ' ||
            coalesce(string_agg(distinct application_name, ', '), '(onbekend)')
     from pg_stat_activity where datname = '${DB}';" >&2 2>/dev/null || true
  exit 1
fi

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
  # ⚠️ Bij `--dubbel` staat het bestand er twee keer, in **één** psql-sessie.
  #    Twee losse aanroepen zouden 255 extra processen kosten voor precies
  #    dezelfde uitslag.
  BESTANDEN=(-f "$bestand")
  if [[ "$DUBBEL" == "1" ]]; then BESTANDEN+=(-f "$bestand"); fi

  if ! "${PSQL[@]}" -d "$DB" "${BESTANDEN[@]}" >/dev/null; then
    if [[ "$DUBBEL" == "1" ]]; then
      echo "✗ ${naam} viel om — draai hem los om te zien of het de eerste of de" >&2
      echo "  tweede ronde was:  psql -v ON_ERROR_STOP=1 -f ${bestand}" >&2
    else
      echo "✗ ${naam} viel om" >&2
    fi
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

# ⚠️ **De major staat er met opzet bij — QS8-177.** Deze opstelling gebruikt de
#    Postgres van het besturingssysteem, en dat hoeft niet de major van productie
#    te zijn. Stond dat er niet, dan is "170 migraties afgespeeld" een regel die
#    net zo groen leest op een versie waar de suite niets over bewijst.
#    `npm run pgversie:controle` legt hem naast productie; deze regel zorgt dat
#    je hem ook ziet zonder die controle te draaien.
major="$("${PSQL[@]}" -At -d "$DB" -c 'show server_version_num' 2>/dev/null | head -1)"
major="${major:0:2}"

if [[ "$DUBBEL" == "1" ]]; then
  echo "✓ ${aantal} migraties elk twee keer afgespeeld op een lege database (Postgres ${major:-?})"
else
  echo "✓ ${aantal} migraties afgespeeld op een lege database (Postgres ${major:-?})"
fi
