#!/usr/bin/env bash
# Run Lighthouse (the engine behind Google's PageSpeed Insights) against a URL,
# in its default mobile mode, and fail if any category drops below its floor.
#
#   scripts/lighthouse-gate.sh http://localhost:8080/      # the image a PR ships
#   scripts/lighthouse-gate.sh https://christinaschwarz.art/  # the live site
#
# Needs a Chrome: CHROME_PATH, or google-chrome on PATH (GitHub's runners have
# one). Writes the full report to lighthouse-report.html beside the JSON.
#
# Floors, measured 2026-11-08 on this site (98/100/100/100 locally, 100 live):
# performance has room for slower shared runners; the others must be perfect,
# because a drop there is always a real defect (a contrast slip, a missing
# robots.txt, a console error), never noise.
#
# Lighthouse runs LH_RUNS times (default 3). Performance is judged on the
# MEDIAN run, as Lighthouse's own docs advise for its run-to-run variance: on
# 2026-11-08 one live run on a busy GitHub runner measured 830 ms of blocking
# time (score 81) while three runs from elsewhere measured 0-60 ms (100).
# Every other category must hold in EVERY run. The reports kept are the
# median run's.
set -euo pipefail

URL="${1:?usage: lighthouse-gate.sh URL}"
OUT="${LH_OUT:-lighthouse-report}"
declare -A FLOOR=([performance]=90 [accessibility]=100 [best-practices]=100 [seo]=100)

CHROME_PATH="${CHROME_PATH:-$(command -v google-chrome || command -v chromium || true)}"
[ -n "$CHROME_PATH" ] || { echo "::error::no Chrome found for Lighthouse"; exit 1; }
export CHROME_PATH

RUNS="${LH_RUNS:-3}"
for n in $(seq 1 "$RUNS"); do
  npx --yes lighthouse@12 "$URL" \
    --quiet \
    --chrome-flags="--headless=new --no-sandbox" \
    --only-categories=performance,accessibility,best-practices,seo \
    --output=json --output=html --output-path="./$OUT-run$n"
done

# One pass over the reports: scores against the floors, what lost points.
status=0
summary=$(node "$(dirname "$0")/lighthouse-summary.js" "./$OUT" "$RUNS") || status=$?
printf '%s\n' "$summary" | grep -v '^median='
median=$(printf '%s\n' "$summary" | sed -n 's/^median=//p')

# The median run becomes the report; the rest are dropped.
cp "$OUT-run$median.report.json" "$OUT.report.json"
cp "$OUT-run$median.report.html" "$OUT.report.html"
for n in $(seq 1 "$RUNS"); do rm -f "$OUT-run$n.report.json" "$OUT-run$n.report.html"; done
exit $status
