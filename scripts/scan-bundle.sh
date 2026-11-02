#!/usr/bin/env bash
# Fails the build if the shipped artifact contains something it must never contain.
#
# Two classes:
#   1. code-execution and tracker smells (eval, new Function, document.write, analytics hosts)
#   2. private-key material (xprv/yprv/zprv/WIF-shaped strings) — a watch-only app that
#      ships one has already lost the argument
#
# Usage: bash scripts/scan-bundle.sh [dist/index.html]

set -uo pipefail
FILE="${1:-dist/index.html}"
[[ -f "$FILE" ]] || { echo "scan-bundle: $FILE not found — build first" >&2; exit 2; }

fail=0
report() { echo "FAIL  $1" >&2; fail=1; }

# 1. Forbidden constructs. Each is a real incident class, not a style opinion.
for pattern in 'eval(' 'new Function(' 'document.write' 'googletagmanager' 'google-analytics' 'segment.io' 'sentry.io' 'hotjar' 'fullstory'; do
  if grep -qiF -- "$pattern" "$FILE"; then report "forbidden construct present: $pattern"; fi
done

# 2. Private key material. Shapes only — this must never match, ever.
if grep -qE '\b(xprv|yprv|zprv|tprv|uprv|vprv|Ltpv|Mtpv|ttpv)[1-9A-HJ-NP-Za-km-z]{20,}' "$FILE"; then
  report 'extended PRIVATE key material found in the bundle'
fi

# 3. No third-party fetch targets (inert namespace strings are allowed).
hosts=$(grep -oE 'https?://[a-zA-Z0-9.-]+' "$FILE" | sort -u | grep -vE '^http://www\.w3\.org$|^https://reactjs\.org$' || true)
if [[ -n "$hosts" ]]; then
  echo "external hosts referenced (verify each is inert, not a fetch target):" >&2
  echo "$hosts" | sed 's/^/    /' >&2
fi

# 4. The honesty gate: the till does not exist, so the shipped copy may not claim it does.
for claim in 'payment received' 'paid ✓' 'payment confirmed'; do
  if grep -qiF -- "$claim" "$FILE"; then report "claims a payment the engine cannot observe: $claim"; fi
done

# 5. The offline shell must be named for this build, or a device stays pinned forever.
sw="$(dirname "$FILE")/sw.js"
if [[ -f "$sw" ]]; then
  if grep -qF '__BUILD__' "$sw"; then
    report 'service worker cache name is not versioned — a device would stay pinned to one build'
  fi
  version=$(grep -oE '<meta name="slip-version" content="[0-9][^"]*" />' "$FILE" | head -1 | cut -d'"' -f4)
  if [[ -n "$version" ]] && ! grep -qF "slip-${version}" "$sw"; then
    report "service worker cache does not carry the build version (expected slip-${version})"
  fi
fi

if [[ "$fail" -ne 0 ]]; then
  echo "scan-bundle: FAILED" >&2
  exit 1
fi
echo "scan-bundle: clean ($(wc -c < "$FILE") bytes)"
