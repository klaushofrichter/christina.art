/**
 * The Google Sheet "content" and the three content files, in both directions.
 *
 * The sheet has four tabs, each read as CSV:
 *
 *   meta         file | placeholder | _note
 *                one row each for bio, works, exhibitions
 *   bio          key | value
 *                artist, tagline, description, email: one row each;
 *                bio: one row per paragraph, in order
 *   works        image | title | year | medium | size
 *                one row per work, in page order; size may be empty
 *   exhibitions  title | kind | venue | city | from | to
 *                one row per exhibition; dates YYYY-MM-DD
 *
 * Header rows are required and checked, so a renamed or reordered column is
 * an error rather than a silently shifted file. Rows that are entirely empty
 * are ignored. A tab named "Info" (or any other) is left alone.
 *
 * The JSON comes out byte for byte as the repository has it:
 * JSON.stringify(value, null, 2) plus a final newline, keys in a fixed order.
 */

export type Table = string[][];
export type Tables = { meta: Table; bio: Table; works: Table; exhibitions: Table };
export type ContentFiles = { 'bio.json': string; 'works.json': string; 'exhibitions.json': string };

export const TABS = ['meta', 'bio', 'works', 'exhibitions'] as const;

const HEADERS: Record<keyof Tables, string[]> = {
  meta: ['file', 'placeholder', '_note'],
  bio: ['key', 'value'],
  works: ['image', 'title', 'year', 'medium', 'size'],
  exhibitions: ['title', 'kind', 'venue', 'city', 'from', 'to'],
};

// ---------- CSV (RFC 4180, as Google Sheets exports it) ----------

export function parseCsv(text: string): Table {
  const rows: Table = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1; // a BOM, if a tool added one
  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (quoted) throw new Error('CSV: a quoted field is never closed');
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function toCsv(table: Table): string {
  const cell = (v: string) => (/[",\r\n]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v);
  return table.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

// ---------- sheet tables -> JSON files ----------

function body(name: keyof Tables, table: Table): string[][] {
  const [header, ...rows] = table;
  const want = HEADERS[name];
  const got = (header ?? []).map((h) => h.trim()).slice(0, want.length);
  if (got.join('|') !== want.join('|')) {
    throw new Error(`tab "${name}": header must be ${want.join(' | ')}, found ${got.join(' | ') || '(nothing)'}`);
  }
  return rows
    .map((r) => want.map((_, i) => r[i] ?? ''))
    .filter((r) => r.some((v) => v.trim() !== ''));
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function bool(v: string, where: string): boolean {
  const t = v.trim().toUpperCase();
  if (t === 'TRUE') return true;
  if (t === 'FALSE' || t === '') return false;
  throw new Error(`${where}: placeholder must be TRUE or FALSE, found "${v}"`);
}

function text(v: string, where: string): string {
  const t = v.trim();
  if (!t) throw new Error(`${where} is empty`);
  return t;
}

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

/** Meta fields go first, in the order the files have always had them:
 *  _note, then placeholder (only if TRUE, or if the sheet says FALSE
 *  explicitly), then the content. */
function head(meta: Map<string, string[]>, file: string): Record<string, unknown> {
  const row = meta.get(file);
  if (!row) throw new Error(`tab "meta": no row for ${file}`);
  const [, placeholder, note] = row;
  const out: Record<string, unknown> = {};
  if (note.trim()) out._note = note.trim();
  if (placeholder.trim()) out.placeholder = bool(placeholder, `meta ${file}`);
  return out;
}

export function tablesToJson(t: Tables): ContentFiles {
  const meta = new Map(body('meta', t.meta).map((r) => [r[0].trim(), r] as const));

  // bio
  const bioRows = body('bio', t.bio);
  const one = (key: string) => {
    const rows = bioRows.filter((r) => r[0].trim() === key);
    if (rows.length !== 1) throw new Error(`tab "bio": needs exactly one "${key}" row, found ${rows.length}`);
    return text(rows[0][1], `bio ${key}`);
  };
  const known = new Set(['artist', 'tagline', 'description', 'email', 'bio']);
  const stray = bioRows.find((r) => !known.has(r[0].trim()));
  if (stray) throw new Error(`tab "bio": unknown key "${stray[0]}"`);
  const paragraphs = bioRows.filter((r) => r[0].trim() === 'bio').map((r, i) => text(r[1], `bio paragraph ${i + 1}`));
  if (!paragraphs.length) throw new Error('tab "bio": no "bio" paragraph rows');
  const bio = {
    ...head(meta, 'bio'),
    artist: one('artist'),
    tagline: one('tagline'),
    description: one('description'),
    email: one('email'),
    bio: paragraphs,
  };

  // works
  const works = body('works', t.works).map((r, i) => {
    const where = `works row ${i + 2}`;
    const year = Number(r[2].trim());
    if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new Error(`${where}: year "${r[2]}" is not a year`);
    const w: Record<string, unknown> = {
      image: text(r[0], `${where} image`),
      title: text(r[1], `${where} title`),
      year,
      medium: text(r[3], `${where} medium`),
    };
    if (r[4].trim()) w.size = r[4].trim();
    return w;
  });
  if (!works.length) throw new Error('tab "works": no works');

  // exhibitions
  const exhibitions = body('exhibitions', t.exhibitions).map((r, i) => {
    const where = `exhibitions row ${i + 2}`;
    const [title, kind, venue, city, from, to] = r.map((v) => v.trim());
    for (const [k, v] of [['from', from], ['to', to]] as const) {
      if (!DATE.test(v)) {
        throw new Error(`${where}: ${k} "${v}" must be YYYY-MM-DD (format the column as plain text in the sheet)`);
      }
    }
    if (from > to) throw new Error(`${where}: from ${from} is after to ${to}`);
    return {
      title: text(title, `${where} title`),
      kind: text(kind, `${where} kind`),
      venue: text(venue, `${where} venue`),
      city: text(city, `${where} city`),
      from,
      to,
    };
  });

  return {
    'bio.json': stringify(bio),
    'works.json': stringify({ ...head(meta, 'works'), works }),
    'exhibitions.json': stringify({ ...head(meta, 'exhibitions'), exhibitions }),
  };
}

// ---------- JSON files -> sheet tables (to fill the sheet from the repo) ----------

export function jsonToTables(files: ContentFiles): Tables {
  const bio = JSON.parse(files['bio.json']);
  const works = JSON.parse(files['works.json']);
  const ex = JSON.parse(files['exhibitions.json']);
  const metaRow = (file: string, f: Record<string, unknown>) => [
    file,
    f.placeholder === undefined ? '' : f.placeholder ? 'TRUE' : 'FALSE',
    String(f._note ?? ''),
  ];
  return {
    meta: [HEADERS.meta, metaRow('bio', bio), metaRow('works', works), metaRow('exhibitions', ex)],
    bio: [
      HEADERS.bio,
      ['artist', bio.artist],
      ['tagline', bio.tagline],
      ['description', bio.description],
      ['email', bio.email],
      ...(bio.bio as string[]).map((p) => ['bio', p]),
    ],
    works: [
      HEADERS.works,
      ...(works.works as Record<string, unknown>[]).map((w) => [
        String(w.image),
        String(w.title),
        String(w.year),
        String(w.medium),
        w.size ? String(w.size) : '',
      ]),
    ],
    exhibitions: [
      HEADERS.exhibitions,
      ...(ex.exhibitions as Record<string, string>[]).map((e) => [e.title, e.kind, e.venue, e.city, e.from, e.to]),
    ],
  };
}
