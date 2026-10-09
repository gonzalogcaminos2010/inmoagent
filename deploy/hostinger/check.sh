#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DEMO_VERSION:?Required immutable local version}"
: "${DEMO_ORIGIN:?Required HTTPS origin}"
: "${DEMO_AUTH_FILE:?Required approved credential file}"
[[ "$DEMO_ORIGIN" =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]] || { echo 'Origin must be exact HTTPS origin without path'; exit 1; }
[[ -r "$DEMO_AUTH_FILE" && -s "$DEMO_AUTH_FILE" ]] || { echo 'Protection file missing/empty'; exit 1; }
# bcrypt/Apache MD5/crypt hashes only; no plaintext password generation here.
awk -F: 'NF!=2 || $1 !~ /^[a-zA-Z0-9_-]+$/ || $2 !~ /^\$(2[aby]|apr1|5|6)\$/ {bad=1} END {exit bad}' "$DEMO_AUTH_FILE" || { echo 'Protection file must contain supported password hashes'; exit 1; }
docker compose -f deploy/hostinger/compose.yaml config --quiet
printf 'Configuration valid. No build/start/deploy performed.\n'
