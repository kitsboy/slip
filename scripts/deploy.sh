#!/usr/bin/env bash
# slip deploy — version bump, build, publish, verify, record.
#
# Every deploy carries a version. This script is the only supported way to publish:
# it bumps package.json, builds, deploys to Cloudflare Pages, proves the LIVE page
# reports that version, and appends a CHANGELOG entry. A deploy that cannot prove
# itself is reported as failed (exit 1) even if wrangler said "success".
#
# Usage:
#   bash scripts/deploy.sh            # bump patch (0.4.0 -> 0.4.1) and deploy
#   bash scripts/deploy.sh minor      # bump minor
#   bash scripts/deploy.sh --no-bump  # deploy the current version (hotfix of a typo)
#
# Requires CF_FAMILY_OPS_TOKEN + CF_ACCOUNT_ID, normally read from
# /root/.hermes/cf-credentials.env.

set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="${SLIP_PAGES_PROJECT:-slip}"
BRANCH="${SLIP_PAGES_BRANCH:-main}"
CREDS="${CF_CREDS_FILE:-/root/.hermes/cf-credentials.env}"

if [[ -f "$CREDS" && -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  CLOUDFLARE_API_TOKEN="$(grep '^CF_FAMILY_OPS_TOKEN' "$CREDS" | cut -d= -f2- | tr -d '"')"
  CLOUDFLARE_ACCOUNT_ID="$(grep '^CF_ACCOUNT_ID' "$CREDS" | cut -d= -f2- | tr -d '"')"
  export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
fi
: "${CLOUDFLARE_API_TOKEN:?missing CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?missing CLOUDFLARE_ACCOUNT_ID}"

BUMP="${1:-patch}"
if [[ "$BUMP" != "--no-bump" ]]; then
  npm version "$BUMP" --no-git-tag-version >/dev/null
fi
VERSION="$(node -p "require('./package.json').version")"

echo "── slip v${VERSION} ──"
echo "1/4  typecheck + tests"
npx tsc --noEmit
npx vitest run --reporter=dot

echo "2/4  build"
npm run build

echo "3/4  deploy"
npx wrangler pages deploy dist --project-name "$PROJECT" --branch "$BRANCH" \
  --commit-dirty=true 2>&1 | tail -3

echo "4/4  verify the LIVE page reports v${VERSION}"
# The proxied custom domain can carry edge-injected markup, so verify against the
# project's own origin (byte-identical to the build) and then the vanity host.
ORIGIN="https://${PROJECT}-6d6.pages.dev/"
VANITY="https://slip.giveabit.io/"
ok=0
for attempt in 1 2 3 4 5 6; do
  for host in "$ORIGIN" "$VANITY"; do
    meta="$(curl -s --max-time 20 "${host}?cb=$(date +%s)" | grep -o "name=\"slip-version\" content=\"[^\"]*\"" || true)"
    if [[ "$meta" == *"\"$VERSION\""* ]]; then
      echo "     $( [[ "$host" == "$ORIGIN" ]] && echo origin || echo vanity ) serves v${VERSION}"
      [[ "$host" == "$ORIGIN" ]] && ok=1
    fi
  done
  [[ "$ok" == "1" ]] && break
  sleep 6
done

if [[ "$ok" != "1" ]]; then
  echo "FAILED: the live origin never reported v${VERSION}. Not recording this as shipped." >&2
  exit 1
fi

SHA="$(cut -d' ' -f1 dist/SHA256SUMS)"
DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ENTRY="- **v${VERSION}** — ${DATE} — \`${SHA:0:12}\` — ${SLIP_NOTE:-deploy}"

# Newest first, but BELOW the header — an entry above "# Changelog" breaks markdown.
if [[ -f CHANGELOG.md ]]; then
  python3 - "$ENTRY" <<'PY'
import sys
entry = sys.argv[1]
lines = open('CHANGELOG.md', encoding='utf-8').read().splitlines()
# Keep everything up to the first entry (lines starting with '- **v').
head = []
i = 0
while i < len(lines) and not lines[i].startswith('- **v'):
    head.append(lines[i])
    i += 1
tail = lines[i:]
body = [ln for ln in head if ln.strip()]
while body and not body[-1].startswith('#'):
    body.pop()
out = body + ['', entry, ''] + tail
open('CHANGELOG.md', 'w', encoding='utf-8').write('\n'.join(out).rstrip() + '\n')
PY
else
  printf '# Changelog\n\nEvery published build, newest first.\n\n%s\n' "$ENTRY" > CHANGELOG.md
fi

echo
echo "shipped v${VERSION} (${SHA:0:12})"
echo "  origin : ${ORIGIN}"
echo "  vanity : ${VANITY}"
