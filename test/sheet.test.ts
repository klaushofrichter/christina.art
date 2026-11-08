import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { jsonToTables, parseCsv, tablesToJson, toCsv, Tables } from '../scripts/sheet-format';

const CONTENT = path.join(__dirname, '..', 'content');
const files = {
  'bio.json': fs.readFileSync(path.join(CONTENT, 'bio.json'), 'utf8'),
  'works.json': fs.readFileSync(path.join(CONTENT, 'works.json'), 'utf8'),
  'exhibitions.json': fs.readFileSync(path.join(CONTENT, 'exhibitions.json'), 'utf8'),
};

/** Through CSV text, as the sheet would hand it back. */
function viaCsv(t: Tables): Tables {
  return {
    meta: parseCsv(toCsv(t.meta)),
    bio: parseCsv(toCsv(t.bio)),
    works: parseCsv(toCsv(t.works)),
    exhibitions: parseCsv(toCsv(t.exhibitions)),
  };
}

describe('sheet <-> content files', () => {
  it('reproduces the current files byte for byte after a round trip through CSV', () => {
    const back = tablesToJson(viaCsv(jsonToTables(files)));
    expect(back['bio.json']).toBe(files['bio.json']);
    expect(back['works.json']).toBe(files['works.json']);
    expect(back['exhibitions.json']).toBe(files['exhibitions.json']);
  });

  it('reads what Google Sheets exports: CRLF, quoted commas and quotes, a stray empty row', () => {
    const t = jsonToTables(files);
    const csv = toCsv(t.exhibitions).replace(/\r\n$/, '\r\n,,,,,\r\n');
    expect(tablesToJson({ ...t, exhibitions: parseCsv(csv) })['exhibitions.json']).toBe(files['exhibitions.json']);
    expect(parseCsv('a,"b, ""c"""\r\n"line\nbreak",d\r\n')).toEqual([['a', 'b, "c"'], ['line\nbreak', 'd']]);
  });

  it('refuses a renamed or reordered column instead of shifting the data', () => {
    const t = jsonToTables(files);
    t.works[0] = ['title', 'image', 'year', 'medium', 'size'];
    expect(() => tablesToJson(t)).toThrow(/header must be image \| title/);
  });

  it('refuses a date the sheet turned into a display format', () => {
    const t = jsonToTables(files);
    t.exhibitions[1][4] = '4/9/2027';
    expect(() => tablesToJson(t)).toThrow(/YYYY-MM-DD.*plain text/);
  });

  it('refuses a year that is not a year, and an empty title', () => {
    let t = jsonToTables(files);
    t.works[1][2] = '2026a';
    expect(() => tablesToJson(t)).toThrow(/year "2026a"/);
    t = jsonToTables(files);
    t.works[1][1] = ' ';
    expect(() => tablesToJson(t)).toThrow(/title is empty/);
  });

  it('turns the demo off when the meta tab says FALSE, and drops it when blank', () => {
    const t = jsonToTables(files);
    t.meta[1][1] = 'FALSE';
    expect(JSON.parse(tablesToJson(t)['bio.json']).placeholder).toBe(false);
    t.meta[1][1] = '';
    expect(JSON.parse(tablesToJson(t)['bio.json'])).not.toHaveProperty('placeholder');
  });

  it('keeps the bio paragraphs in the sheet order', () => {
    const t = jsonToTables(files);
    const rows = t.bio.filter((r) => r[0] === 'bio');
    expect(rows.length).toBeGreaterThan(1);
    const swapped = [...t.bio.filter((r) => r[0] !== 'bio'), ...rows.reverse()];
    const bio = JSON.parse(tablesToJson({ ...t, bio: swapped })['bio.json']).bio;
    expect(bio[0]).toBe(rows[0][1]);
  });
});
