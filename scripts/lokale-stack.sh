#!/usr/bin/env bash
#
# Een lokale opstelling waar de RLS-suite tegenaan kan — QS8-119.
#
# ⚠️ **Dit is geen volledige Supabase-stack en dat is een keuze.** `supabase start`
#    trekt Postgres, PostgREST, GoTrue, Realtime, Storage, Studio en een mailserver
#    binnen. Wat een RLS-suite nodig heeft is de eerste twee: een database met het
#    schema van productie, en de échte PostgREST ervoor — want dat is wat de
#    policies uitvoert en de rol omschakelt op grond van het JWT.
#
#    Voor GoTrue is er `shim_maak_gebruiker()`: dezelfde rij in `auth.users`,
#    dezelfde `handle_new_user`-trigger, hetzelfde profiel. Wat je daarmee opgeeft
#    is het bewijs dat GoTrue zelf correcte claims uitgeeft, en dat toetst
#    `token.test.ts` tegen het echte project.
#
#    Werkt `supabase start` op jouw machine wél, gebruik dat dan — het is meer
#    stack voor minder eigen gedoe. Dit script is er voor de situatie waarin dat
#    niet kan, en dat was hier het geval: Docker Hub is achter de proxy niet
#    bereikbaar.
#
# ⚠️ **Raakt het echte project nooit.** De database wordt weggegooid en opnieuw
#    opgebouwd; geef dus nooit een verbinding op naar iets waar data in staat.
#
# Gebruik:
#   scripts/lokale-stack.sh          # opbouwen en starten
#   RLS_DOEL=lokaal npm test         # de suite ertegenaan
#   scripts/lokale-stack.sh --stop
#
# Voorwaarden: Postgres 16 waarop je superuser bent, en de PostgREST-binary.
# Zie docs/DEPLOY.md §2.6.

set -euo pipefail

WORTEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WERKMAP="${RLS_WERKMAP:-${TMPDIR:-/tmp}/goalbuddies-lokale-stack}"
POORT="${RLS_POORT:-3010}"
PGRST="${POSTGREST_BIN:-$WERKMAP/postgrest}"

# ⚠️ Hetzelfde secret als in `tests/rls/harness.ts`. Het hoort bij een database
#    die dit script zelf net heeft opgebouwd; er valt niets mee te openen dat
#    niet al van jou is.
SECRET="${RLS_LOKAAL_JWT_SECRET:-super-geheim-lokaal-jwt-secret-voor-de-rls-suite}"

mkdir -p "$WERKMAP"

PIDFILE="$WERKMAP/postgrest.pid"

# ⚠️ Een pidbestand en geen `pkill -f`. Dat laatste matcht op de commandoregel,
#    en die verandert zodra iemand het script vanuit een andere map draait of
#    POSTGREST_BIN zet. Dan blijft de oude instantie op de poort zitten en zegt
#    de nieuwe "Address in use" — een foutmelding die nergens naar wijst.
stop_vorige() {
  if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    kill "$(cat "$PIDFILE")" 2>/dev/null || true
    sleep 1
  fi
  rm -f "$PIDFILE"
}

if [[ "${1:-}" == "--stop" ]]; then
  stop_vorige
  echo "✓ PostgREST gestopt"
  exit 0
fi

if [[ ! -x "$PGRST" ]]; then
  echo "✗ PostgREST niet gevonden op $PGRST" >&2
  echo "  Haal de binary van https://github.com/PostgREST/postgrest/releases" >&2
  echo "  en pak hem uit in $WERKMAP, of zet POSTGREST_BIN." >&2
  exit 1
fi

# ⚠️ **Eerst stoppen, dan pas opbouwen.** PostgREST houdt een pool open, en
#    `drop database` weigert zolang er sessies op staan. Stond dit andersom, dan
#    sloeg de herbouw over en draaide de suite tegen de database van de vórige
#    keer — groen op een schema dat niet meer klopt, en dat is precies wat deze
#    hele opstelling moet uitsluiten. Eén keer echt gebeurd op 24-08.
stop_vorige

echo "→ het schema opbouwen"
DB=goalbuddies_rls "$WORTEL/scripts/schema-opbouwen.sh"

# ⚠️ Een libpq-conninfo en geen `postgres://`-URI. Een URI kan geen socketpad in
#    de hostpositie dragen — dat werd `database "tmp/claude-0/..." does not
#    exist`, een foutmelding die naar de database wijst terwijl de verbinding
#    fout stond. Met sleutel=waarde werkt zowel een socketmap als een TCP-host.
cat > "$WERKMAP/pgrst.conf" <<EOF
db-uri = "host=${PGHOST:-127.0.0.1} port=${PGPORT:-5433} user=authenticator password=postgrest dbname=goalbuddies_rls"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "${SECRET}"
server-port = ${POORT}
db-pool = 10
EOF

# ⚠️ **Is de poort vrij?** Deze controle staat hier en niet verderop, en dat is
#    een gerepareerde valse groene. `stop_vorige` kent alleen zijn eigen
#    pidbestand; draait er een PostgREST uit een ronde met een ander werkpad, dan
#    valt de nieuwe om met "Address in use" — en antwoordt de óude keurig met 200
#    op de gereedheidscontrole hieronder. De suite praat dan tegen een instantie
#    die naar een net weggegooide database wijst, en meldt tientallen fouten die
#    geen policyfout zijn.
#
#    Meten of er íéts antwoordt is dus niet genoeg; de vraag is of de poort vrij
#    is voordat we starten. Dat is deterministisch en heeft geen race.
if curl -s --noproxy '*' --max-time 2 "http://127.0.0.1:${POORT}/" >/dev/null 2>&1; then
  echo "✗ Er luistert al iets op poort ${POORT}, en dat is deze opstelling niet." >&2
  echo "  Stop het, of kies een andere poort met RLS_POORT." >&2
  exit 1
fi

nohup "$PGRST" "$WERKMAP/pgrst.conf" > "$WERKMAP/pgrst.log" 2>&1 &
echo $! > "$PIDFILE"

# Wachten tot hij luistert. Een vaste sleep is een gok die op een trage machine
# de eerste test laat omvallen op iets dat geen policyfout is.
#
# ⚠️ **Eerst kijken of ónze instantie nog leeft, en dan pas of er iets antwoordt.**
#    Zonder die volgorde is dit een valse groene: staat er al een PostgREST op
#    deze poort, dan valt de nieuwe om met "Address in use" terwijl `curl` een
#    keurige 200 krijgt van de oude — die naar een database wijst die net
#    weggegooid is. De suite praat dan tegen een schaduw en meldt 29 fouten die
#    geen policyfout zijn. Eén keer echt gebeurd op 24-08.
PID="$(cat "$PIDFILE")"

for _ in $(seq 1 40); do
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "✗ PostgREST is gestopt vlak na het starten. Log:" >&2
    tail -20 "$WERKMAP/pgrst.log" >&2
    echo >&2
    echo "  Staat er al iets op poort ${POORT}? Dan is dit 'Address in use'." >&2
    rm -f "$PIDFILE"
    exit 1
  fi

  if curl -s --noproxy '*' --max-time 2 "http://127.0.0.1:${POORT}/" >/dev/null 2>&1; then
    echo "✓ PostgREST luistert op http://127.0.0.1:${POORT}"
    echo
    echo "  Draai de suite met:  RLS_DOEL=lokaal npm test"
    exit 0
  fi
  sleep 0.5
done

echo "✗ PostgREST kwam niet op. Log:" >&2
tail -20 "$WERKMAP/pgrst.log" >&2
exit 1
