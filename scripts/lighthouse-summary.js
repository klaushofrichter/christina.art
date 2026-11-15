// Reads the Lighthouse runs that scripts/lighthouse-gate.sh made, once each,
// and prints the verdict. Exit code 1 when a category is below its floor.
//
//   node scripts/lighthouse-summary.js <report prefix> <runs>
//
// Performance is judged on the median run (Lighthouse's own advice for its
// run-to-run variance); accessibility, best practices and SEO must hold in
// every run, since a drop there is a real defect, never noise. The median
// run's number is printed first, as "median=N", for the caller to keep.
'use strict';

const FLOORS = { performance: 90, accessibility: 100, 'best-practices': 100, seo: 100 };
const [prefix, runsArg] = process.argv.slice(2);
const runs = Array.from({ length: Number(runsArg) }, (_, i) => {
  const n = i + 1;
  return { n, report: require(require('path').resolve(`${prefix}-run${n}.report.json`)) };
});
// A category a run could not score counts as 0, so it fails rather than throws.
const score = (r, cat) => Math.round((r.report.categories[cat]?.score ?? 0) * 100);

const byPerf = [...runs].sort((a, b) => score(a, 'performance') - score(b, 'performance'));
const median = byPerf[Math.floor(byPerf.length / 2)];
console.log(`median=${median.n}`);
console.log(`Lighthouse performance per run: ${runs.map((r) => score(r, 'performance')).join(' ')} (median: run ${median.n})`);

let failed = false;
for (const [cat, floor] of Object.entries(FLOORS)) {
  const value = cat === 'performance' ? score(median, cat) : Math.min(...runs.map((r) => score(r, cat)));
  if (value < floor) {
    console.log(`::error::Lighthouse ${cat} is ${value}, below ${floor}`);
    failed = true;
  } else {
    console.log(`Lighthouse ${cat}: ${value} (floor ${floor})`);
  }
}

// What lost points in the median run, so nobody has to open the report to start fixing.
const audits = median.report.audits ?? {};
for (const [id, a] of Object.entries(audits)) {
  if (a.score !== null && a.score < 0.9 && !['informative', 'notApplicable', 'manual'].includes(a.scoreDisplayMode)) {
    console.log(`  below 90: ${id} ${a.displayValue || ''}`);
  }
}
for (const k of ['first-contentful-paint', 'largest-contentful-paint', 'cumulative-layout-shift', 'total-blocking-time', 'total-byte-weight']) {
  console.log(`  ${k}: ${audits[k]?.displayValue ?? 'not measured'}`);
}
process.exitCode = failed ? 1 : 0;
