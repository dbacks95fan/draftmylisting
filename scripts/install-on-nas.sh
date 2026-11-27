#!/bin/bash
# Copyright (c) 2026 DPSystems, LLC.
# Runs on the Synology NAS: checks the settings, puts an unpacked release in
# place, starts the DraftMyListing container and waits for its health check.
#
#   bash install-on-nas.sh <unpacked-release-folder>
#
# Called by scripts/deploy-synology.ps1. Three folders on /volume2, none inside
# another, so a deploy can replace the code without touching settings or data:
#   code      /volume2/docker/draftmylisting
#   data      /volume2/docker/draftmylisting-data        (database, logs)
#   settings  /volume2/docker/draftmylisting-config/runtime.env
set -euo pipefail

STAGING="${1:?usage: install-on-nas.sh <unpacked-release-folder>}"
APP="${DML_ROOT:-/volume2/docker/draftmylisting}"
DATA="${DML_DATA:-/volume2/docker/draftmylisting-data}"
SETTINGS="${DML_SETTINGS:-/volume2/docker/draftmylisting-config/runtime.env}"
# DSM 7.1 has the standalone docker-compose v1 and no `docker compose`.
COMPOSE="${COMPOSE:-/usr/local/bin/docker-compose}"
DOCKER="${DOCKER:-/usr/local/bin/docker}"
# docker needs root here; the deploy user has passwordless sudo for it.
SUDO="${SUDO-sudo -n}"
HEALTH_TRIES="${HEALTH_TRIES:-40}"
HEALTH_WAIT="${HEALTH_WAIT:-3}"

trap 'rm -rf "$STAGING"' EXIT

fail() {
	echo "FAIL  $*" >&2
	exit 1
}
warn() { echo "WARN  $*" >&2; }

# --- settings: checked before anything changes ------------------------------
[ -f "$SETTINGS" ] || fail "settings file $SETTINGS is missing. Create it from .env.example, or deploy with -SettingsFile."
# It holds the household password and eBay keys: owner-only, whatever it arrived as.
chmod 600 "$SETTINGS"

value_of() { # name -> value after the first '=' (last occurrence wins)
	sed -n "s/^$1=//p" "$SETTINGS" | tail -n 1
}

url=$(value_of DRAFTMYLISTING_PUBLIC_URL)
case "$url" in
https://*) ;;
"") fail "DRAFTMYLISTING_PUBLIC_URL is not set in $SETTINGS" ;;
*) fail "DRAFTMYLISTING_PUBLIC_URL must start with https:// (got '$url')" ;;
esac
password=$(value_of DRAFTMYLISTING_HOUSEHOLD_PASSWORD)
[ "${#password}" -ge 12 ] || fail "DRAFTMYLISTING_HOUSEHOLD_PASSWORD must be at least 12 characters"
host=$(value_of DRAFTMYLISTING_HOST)
case "${host:-127.0.0.1}" in
127.0.0.1 | localhost) ;;
*) fail "DRAFTMYLISTING_HOST must be loopback (127.0.0.1); DSM's reverse proxy is the only way in" ;;
esac
for name in EBAY_APP_ID EBAY_CLIENT_SECRET EBAY_REFRESH_TOKEN; do
	# The skeleton runs without eBay; dml health will report it.
	[ -n "$(value_of "$name")" ] || warn "$name is not set; DraftMyListing will start but cannot reach eBay"
done
if grep -q '/volume1' "$SETTINGS"; then
	fail "$SETTINGS points at /volume1; everything for DraftMyListing lives on /volume2"
fi
health_port=$(value_of DRAFTMYLISTING_HEALTH_PORT)
health_port="${health_port:-8431}"
echo "PASS  settings are complete"

# --- code --------------------------------------------------------------------
[ -f "$STAGING/docker-compose.yml" ] || fail "$STAGING does not look like a release"
mkdir -p "$APP"
# git archive shipped tracked files only, so the code folder holds nothing else
# except the .env written below, which is protected from --delete.
rsync -a --checksum --delete --filter='P /.env' --exclude=.git "$STAGING/" "$APP/"
echo "PASS  release in place at $APP"

# --- data and compose values ------------------------------------------------
mkdir -p "$DATA"
chmod 700 "$DATA"
# The container runs as this user (docker-compose.yml `user:`), so the data
# folder can stay private to it. Compose reads these from .env in its folder;
# sudo would drop them from the environment.
cat >"$APP/.env" <<EOF
DRAFTMYLISTING_DATA_HOST_DIR=$DATA
DRAFTMYLISTING_ENV_HOST_FILE=$SETTINGS
DRAFTMYLISTING_UID=$(id -u)
DRAFTMYLISTING_GID=$(id -g)
EOF
echo "PASS  data folder $DATA (owner only)"

# --- start -------------------------------------------------------------------
cd "$APP"
# shellcheck disable=SC2086 # SUDO and COMPOSE may be commands with arguments.
$SUDO $COMPOSE -f "$APP/docker-compose.yml" -p draftmylisting up -d --build

# --- verify ------------------------------------------------------------------
code=""
for ((i = 1; i <= HEALTH_TRIES; i++)); do
	code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$health_port/healthz" || true)
	[ "$code" = "200" ] && break
	sleep "$HEALTH_WAIT"
done
if [ "$code" != "200" ]; then
	echo "FAIL  DraftMyListing did not answer its health check with 200 (last: ${code:-none})" >&2
	# shellcheck disable=SC2086
	$SUDO $COMPOSE -f "$APP/docker-compose.yml" -p draftmylisting logs --tail 40 >&2 || true
	exit 1
fi
echo "PASS  DraftMyListing answers its health check"

# Server and eBay together; an eBay problem is reported, not fatal.
# shellcheck disable=SC2086
$SUDO $DOCKER exec draftmylisting dml health || warn "dml health reported a problem (see above)"
echo "DONE  MCP endpoint: ${url%/}/mcp (reachable once DSM's reverse proxy entry exists)"
