#!/bin/bash
# Copyright (c) 2026 DPSystems, LLC.
# Tests scripts/install-on-nas.sh with stub docker-compose, docker and curl, in
# throwaway folders: what a deploy refuses, writes, replaces and checks.
#
#   bash scripts/tests/test-install-on-nas.sh
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
INSTALL="$HERE/../install-on-nas.sh"
FAILS=0

check() { # name, command...
	local name="$1"
	shift
	if "$@"; then echo "  ok    $name"; else
		echo "  FAIL  $name"
		FAILS=$((FAILS + 1))
	fi
}

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
BIN="$TMP/bin"
mkdir -p "$BIN"
CALLS="$TMP/calls.log"
export CALLS

cat >"$BIN/docker-compose" <<'EOF'
#!/bin/bash
echo "compose $*" >>"$CALLS"
EOF
cat >"$BIN/docker" <<'EOF'
#!/bin/bash
echo "docker $*" >>"$CALLS"
EOF
# curl stub: prints STUB_HEALTH (default 200) as the status code.
cat >"$BIN/curl" <<'EOF'
#!/bin/bash
echo "curl ${*: -1}" >>"$CALLS"
printf '%s' "${STUB_HEALTH:-200}"
EOF
chmod +x "$BIN"/*

no_compose() { ! grep -q "^compose" "$CALLS"; }

APP="$TMP/app"
DATA="$TMP/data"
SETTINGS="$TMP/config/runtime.env"

good_settings() {
	mkdir -p "$TMP/config"
	cat >"$SETTINGS" <<'EOF'
DRAFTMYLISTING_PUBLIC_URL=https://listings.example.net:1519
DRAFTMYLISTING_HOUSEHOLD_PASSWORD=a-long-household-password
DRAFTMYLISTING_HEALTH_PORT=8431
EBAY_APP_ID=id
EBAY_CLIENT_SECRET=secret
EBAY_REFRESH_TOKEN=token
EOF
	chmod 644 "$SETTINGS"
}

make_release() { # files to include beyond docker-compose.yml
	local d="$TMP/staging"
	rm -rf "$d"
	mkdir -p "$d/src"
	echo "services: {}" >"$d/docker-compose.yml"
	for f in "$@"; do echo "$f" >"$d/$f"; done
	echo "$d"
}

run_install() { # extra env assignments...
	: >"$CALLS"
	env "$@" PATH="$BIN:$PATH" SUDO="" COMPOSE="$BIN/docker-compose" DOCKER="$BIN/docker" \
		DML_ROOT="$APP" DML_DATA="$DATA" DML_SETTINGS="$SETTINGS" HEALTH_TRIES=2 HEALTH_WAIT=0 \
		bash "$INSTALL" "$STAGING" >"$TMP/out.log" 2>&1
}

echo "refuses bad settings before changing anything"
rm -rf "$APP" "$TMP/config"
STAGING=$(make_release src/server.ts)
run_install
check "missing settings file fails" [ $? -ne 0 ]
check "  and says how to fix it" grep -q "settings file .* is missing" "$TMP/out.log"
check "  and installs nothing" [ ! -e "$APP" ]

for bad in "DRAFTMYLISTING_PUBLIC_URL=http://listings.example.net" \
	"DRAFTMYLISTING_HOUSEHOLD_PASSWORD=short" \
	"DRAFTMYLISTING_HOST=0.0.0.0"; do
	good_settings
	echo "$bad" >>"$SETTINGS"
	STAGING=$(make_release src/server.ts)
	run_install
	check "refuses $bad" [ $? -ne 0 ]
	check "  and starts nothing" no_compose
done

echo "a good deploy"
rm -rf "$APP" "$DATA"
good_settings
STAGING=$(make_release src/server.ts src/old.ts)
run_install
check "succeeds" [ $? -eq 0 ]
check "puts the release in place" [ -f "$APP/src/server.ts" ]
check "removes the staging folder" [ ! -e "$STAGING" ]
check "makes the settings file owner-only" [ "$(stat -c %a "$SETTINGS")" = "600" ]
check "makes the data folder owner-only" [ "$(stat -c %a "$DATA")" = "700" ]
check "writes the data path for compose" grep -qx "DRAFTMYLISTING_DATA_HOST_DIR=$DATA" "$APP/.env"
check "writes the settings path for compose" grep -qx "DRAFTMYLISTING_ENV_HOST_FILE=$SETTINGS" "$APP/.env"
check "runs the container as this user" grep -qx "DRAFTMYLISTING_UID=$(id -u)" "$APP/.env"
check "starts it with compose" grep -q "^compose -f $APP/docker-compose.yml -p draftmylisting up -d --build" "$CALLS"
check "polls the health port from the settings" grep -q "^curl http://127.0.0.1:8431/healthz" "$CALLS"
check "runs dml health in the container" grep -q "^docker exec draftmylisting dml health" "$CALLS"

echo "a redeploy"
STAGING=$(make_release src/server.ts)
run_install
check "succeeds" [ $? -eq 0 ]
check "deletes a file the release no longer has" [ ! -e "$APP/src/old.ts" ]
check "keeps the compose values" [ -f "$APP/.env" ]

echo "missing eBay keys"
good_settings
sed -i '/^EBAY_/d' "$SETTINGS"
STAGING=$(make_release src/server.ts)
run_install
check "still deploys" [ $? -eq 0 ]
check "  and warns about eBay" grep -q "WARN  EBAY_APP_ID is not set" "$TMP/out.log"

echo "a server that never becomes healthy"
good_settings
STAGING=$(make_release src/server.ts)
run_install STUB_HEALTH=000
check "fails" [ $? -ne 0 ]
check "  and shows the container logs" grep -q "^compose .* logs --tail 40" "$CALLS"

if [ "$FAILS" -eq 0 ]; then
	echo "all checks passed"
else
	echo "$FAILS check(s) failed"
	exit 1
fi
