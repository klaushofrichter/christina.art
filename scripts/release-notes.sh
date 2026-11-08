#!/usr/bin/env bash
# Print the release notes for v$VERSION on stdout.
#
# Called by deploy-production.yml after the smoke test, which hands over what
# it observed through the SMOKE_* variables. Kept as a script so the notes can
# be rendered locally with stub values before a deploy depends on them:
#
#   VERSION=2026.11.08.1 SMOKE_SERVED=2026.11.08.1 SMOKE_PAGE=200 \
#   SMOKE_WWW_CODE=301 SMOKE_WWW_LOCATION=https://christinaschwarz.art/x \
#   SMOKE_AT=2026-11-08T20:00:00Z GITHUB_RUN_ID=1 \
#   GITHUB_SERVER_URL=https://github.com GITHUB_REPOSITORY=klaushofrichter/christina.art \
#   scripts/release-notes.sh
set -euo pipefail
cd "$(dirname "$0")/.."

: "${VERSION:?}" "${SMOKE_SERVED:?}" "${SMOKE_PAGE:?}" "${SMOKE_WWW_CODE:?}"
: "${SMOKE_WWW_LOCATION:?}" "${SMOKE_AT:?}" "${GITHUB_RUN_ID:?}"
: "${GITHUB_SERVER_URL:?}" "${GITHUB_REPOSITORY:?}"

TAG="v${VERSION}"
BASE="${BASE:-https://christinaschwarz.art}"
WWW="${WWW:-https://www.christinaschwarz.art}"
IMAGE="${IMAGE:-ghcr.io/klaushofrichter/christina.art}"

# Whatever was curated under [Unreleased], then the commits since the
# previous release.
curated=$(scripts/unreleased-notes.sh)
if [ -n "$curated" ]; then
  printf '%s\n\n' "$curated"
fi

PREV=$(gh release list --repo "$GITHUB_REPOSITORY" --limit 1 \
         --json tagName -q '.[0].tagName' 2>/dev/null || true)
printf '### Changes\n\n'
if [ -n "$PREV" ] && git rev-parse "$PREV" >/dev/null 2>&1; then
  git log --no-merges --pretty='- %s' "${PREV}..HEAD"
  printf '\n**Full diff**: %s/compare/%s...%s\n' "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY" "$PREV" "$TAG"
else
  git log --no-merges --pretty='- %s' -20
fi
printf '\nImage: `%s:%s`\n' "$IMAGE" "$TAG"

# What the deploy saw after the rollout, quoted from the smoke test. The
# release step runs only if every check passed, so this section's presence is
# the claim.
printf '\n### Verified at release\n\n'
printf -- '- Rollout: `ksvc/christina-art` reached Ready\n'
printf -- '- `GET %s/health` -> 200, reported version `%s`, matching the build this run stamped\n' "$BASE" "$SMOKE_SERVED"
printf -- '- `GET %s/` -> %s, with the "Christina Schwarz" heading and the footer showing `v%s`\n' "$BASE" "$SMOKE_PAGE" "$VERSION"
printf -- '- `GET %s/release-check?v=%s` -> %s to `%s`\n' "$WWW" "$VERSION" "$SMOKE_WWW_CODE" "$SMOKE_WWW_LOCATION"
printf -- '- Checked at %s by [run %s](%s/%s/actions/runs/%s)\n' \
  "$SMOKE_AT" "$GITHUB_RUN_ID" "$GITHUB_SERVER_URL" "$GITHUB_REPOSITORY" "$GITHUB_RUN_ID"
