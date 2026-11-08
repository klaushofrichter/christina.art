#!/usr/bin/env bash
# Print what sits under `## [Unreleased]` in CHANGELOG.md, blank lines dropped.
#
# The one definition of "the curated release notes": deploy-production.yml
# publishes what this prints, and check-changelog.sh refuses a promotion when
# it repeats the last release. They each carried their own copy of this awk
# before, and the gate was only right for as long as the two stayed identical.
set -euo pipefail
cd "$(dirname "$0")/.."
awk '
  /^## \[Unreleased\]/ { grab = 1; next }
  grab && /^## /        { exit }
  grab                  { print }
' CHANGELOG.md | sed '/^[[:space:]]*$/d'
