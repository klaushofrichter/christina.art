/**
 * The other direction: write the current content/*.json as one CSV per tab
 * of the Google Sheet "content" (meta.csv, bio.csv, works.csv,
 * exhibitions.csv), ready for File > Import > Upload > "Insert new sheet(s)".
 * Used to fill the sheet from the repository; sheet-to-json.ts reads it back.
 *
 *   npm run sheet:csv -- --out ~/Desktop/christina-content
 */
import fs from 'fs';
import path from 'path';
import { TABS, jsonToTables, toCsv } from './sheet-format';

const ROOT = path.join(__dirname, '..');
const i = process.argv.indexOf('--out');
const out = path.resolve(i > 0 ? process.argv[i + 1] : 'sheet-csv');

const read = (name: string) => fs.readFileSync(path.join(ROOT, 'content', name), 'utf8');
const tables = jsonToTables({ 'bio.json': read('bio.json'), 'works.json': read('works.json'), 'exhibitions.json': read('exhibitions.json') });

fs.mkdirSync(out, { recursive: true });
for (const tab of TABS) {
  fs.writeFileSync(path.join(out, `${tab}.csv`), toCsv(tables[tab]));
  console.log(`${path.join(out, `${tab}.csv`)}: ${tables[tab].length - 1} rows`);
}
