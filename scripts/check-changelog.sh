#!/usr/bin/env bash
# Refuse to release notes that have already been published.
#
# Release notes are whatever sits under `## [Unreleased]` in CHANGELOG.md,
# followed by the commits since the last release. deploy-production.yml reads
# that section and never writes to it, so nothing empties it: unless a person
# does, the next release republishes the last one's notes word for word.
#
# In the art repo, where this script comes from, that happened five times
# despite being written down twice, which is the argument for checking it here
# instead of asking people to remember.
#
#     scripts/check-changelog.sh            # against the newest release
#     scripts/check-changelog.sh v2026.09.09.1
set -euo pipefail

cd "$(dirname "$0")/.."

# The same script deploy-production.yml publishes from, so this checks what
# actually ships rather than something that resembles it.
unreleased=$(scripts/unreleased-notes.sh)

if [ -z "$unreleased" ]; then
  echo "check-changelog: Unreleased is empty — nothing to republish."
  exit 0
fi

tag="${1:-}"
if [ -z "$tag" ]; then
  tag=$(gh release list --limit 1 --json tagName -q '.[0].tagName' 2>/dev/null || true)
fi
if [ -z "$tag" ]; then
  # No releases yet, or no network. Not a reason to block a deploy.
  echo "check-changelog: no previous release to compare against — skipping."
  exit 0
fi

previous=$(gh release view "$tag" --json body -q .body 2>/dev/null || true)
if [ -z "$previous" ]; then
  echo "check-changelog: could not read $tag — skipping."
  exit 0
fi

# A line of prose repeated verbatim from the last release's notes is the
# signature of the section never having been cleared. Bullets are matched
# whole, so an incidental short line in common is not enough.
repeats=0
while IFS= read -r line; do
  [ ${#line} -ge 24 ] || continue
  if printf '%s' "$previous" | grep -Fqx -- "$line"; then
    repeats=$((repeats + 1))
    [ "$repeats" -le 3 ] && echo "    $line"
  fi
done <<< "$unreleased"

if [ "$repeats" -gt 0 ]; then
  echo "::error::CHANGELOG.md [Unreleased] still holds notes already published in ${tag} (${repeats} lines match)."
  echo "Emptying that section is part of promoting to production — see CLAUDE.md."
  exit 1
fi

echo "check-changelog: Unreleased says nothing that ${tag} already said — ok."
