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
set -euo pipefail

URL="${1:?usage: lighthouse-gate.sh URL}"
OUT="${LH_OUT:-lighthouse-report}"
declare -A FLOOR=([performance]=90 [accessibility]=100 [best-practices]=100 [seo]=100)

CHROME_PATH="${CHROME_PATH:-$(command -v google-chrome || command -v chromium || true)}"
[ -n "$CHROME_PATH" ] || { echo "::error::no Chrome found for Lighthouse"; exit 1; }
export CHROME_PATH

npx --yes lighthouse@12 "$URL" \
  --quiet \
  --chrome-flags="--headless=new --no-sandbox" \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=json --output=html --output-path="./$OUT"

failed=0
for cat in performance accessibility best-practices seo; do
  score=$(node -e "const r=require('./$OUT.report.json'); console.log(Math.round(r.categories['$cat'].score*100))")
  floor=${FLOOR[$cat]}
  if [ "$score" -lt "$floor" ]; then
    echo "::error::Lighthouse $cat is $score, below $floor"
    failed=1
  else
    echo "Lighthouse $cat: $score (floor $floor)"
  fi
done

# Name what lost points, so nobody has to open the report to start fixing.
node -e "
const a=require('./$OUT.report.json').audits;
for (const [id,x] of Object.entries(a))
  if (x.score!==null && x.score<0.9 && !['informative','notApplicable','manual'].includes(x.scoreDisplayMode))
    console.log('  below 90: '+id+' '+(x.displayValue||''));
for (const k of ['first-contentful-paint','largest-contentful-paint','cumulative-layout-shift','total-blocking-time','total-byte-weight'])
  console.log('  '+k+': '+a[k].displayValue);
"
exit $failed
