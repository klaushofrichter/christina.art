/**
 * Read the Google Sheet "content" and write content/bio.json, works.json and
 * exhibitions.json, byte for byte in the repository's format. Run by hand
 * before a deploy; nothing calls it automatically.
 *
 *   npm run sheet                     # read the sheet, write content/*.json
 *   npm run sheet -- --check          # report differences, write nothing
 *   npm run sheet -- --csv-dir ~/Downloads/content   # from tabs saved as CSV
 *
 * Reading the sheet, first that applies:
 *   - GOOGLE_ACCESS_TOKEN, a bearer token for an account that can open it;
 *   - an OAuth "authorized_user" credential (client_id, client_secret,
 *     refresh_token), from GWS_CREDENTIALS_JSON or the file named by
 *     GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE: the same credential the
 *     @googleworkspace/cli (gws) uses. A short-lived token is minted from it;
 *   With either, the tabs are read through the Sheets API by name.
 *   - nothing: the CSV export, which works only if the sheet is shared
 *     "anyone with the link can view". It addresses tabs by gid (the number
 *     after "#gid=" in the address bar); those of the tabs created on
 *     2026-11-08 are built in, and --gids or SHEET_GIDS override them.
 *   The credential is never printed or written anywhere.
 *
 * Before writing anything it checks the result exactly as the build will
 * (src/content.ts loadSite, with the current content/images.json), so a sheet
 * that names a missing picture or a bad date never reaches content/.
 * The sheet layout is described in scripts/sheet-format.ts.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { TABS, Tables, parseCsv, tablesToJson } from './sheet-format';
import { loadSite } from '../src/content';

const DEFAULT_SHEET = '1hdMzpoa5A8JrmHo70GWsRPYjOqpItfwZVrvAmQOGS_c';
const DEFAULT_GIDS = 'meta=538870118,bio=532993124,works=838298317,exhibitions=684199705';

/** A bearer token: given directly, or minted from an authorized_user OAuth
 *  credential (the refresh-token exchange). Undefined means anonymous. */
async function accessToken(): Promise<string | undefined> {
  if (process.env.GOOGLE_ACCESS_TOKEN) return process.env.GOOGLE_ACCESS_TOKEN;
  let raw = process.env.GWS_CREDENTIALS_JSON;
  const file = process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE;
  if (!raw && file && fs.existsSync(file)) raw = fs.readFileSync(file, 'utf8');
  if (!raw) return undefined;
  const cred = JSON.parse(raw);
  if (cred.type !== 'authorized_user' || !cred.refresh_token) {
    throw new Error('the Google credential is not an authorized_user OAuth credential with a refresh token');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cred.client_id,
      client_secret: cred.client_secret,
      refresh_token: cred.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const body = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!body.access_token) throw new Error(`Google refused the credential: ${body.error ?? res.status} ${body.error_description ?? ''}`.trim());
  return body.access_token;
}
const ROOT = path.join(__dirname, '..');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function fetchTab(sheet: string, tab: string, gid: string | undefined, token?: string): Promise<string> {
  const url = gid
    ? `https://docs.google.com/spreadsheets/d/${sheet}/export?format=csv&gid=${encodeURIComponent(gid)}`
    : `https://docs.google.com/spreadsheets/d/${sheet}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers, redirect: 'follow' });
  const body = await res.text();
  if (!res.ok || /^\s*<(!doctype|html)/i.test(body)) {
    throw new Error(
      `tab "${tab}": HTTP ${res.status}${res.ok ? ' (a sign-in page, not CSV)' : ''}. ` +
        'Give the script a Google credential (see the header of this file), or share the sheet "anyone with the link can view".',
    );
  }
  return body;
}

async function readTables(): Promise<Tables> {
  const dir = arg('csv-dir');
  if (dir) {
    const read = (tab: string) => {
      const file = path.join(dir, `${tab}.csv`);
      if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
      return parseCsv(fs.readFileSync(file, 'utf8'));
    };
    return { meta: read('meta'), bio: read('bio'), works: read('works'), exhibitions: read('exhibitions') };
  }
  const sheet = arg('sheet') ?? DEFAULT_SHEET;
  const token = await accessToken();

  // With a credential: the Sheets API, tabs by name, values exactly as the
  // sheet displays them (what a CSV export would contain).
  if (token) {
    console.log(`reading sheet ${sheet} through the Sheets API`);
    const q = TABS.map((t) => `ranges=${encodeURIComponent(t)}`).join('&');
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheet}/values:batchGet?${q}&valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body = (await res.json()) as { valueRanges?: { values?: string[][] }[]; error?: { message: string } };
    if (!res.ok || !body.valueRanges) throw new Error(`Sheets API: HTTP ${res.status} ${body.error?.message ?? ''}`.trim());
    const out: Partial<Tables> = {};
    TABS.forEach((tab, i) => (out[tab] = (body.valueRanges![i].values ?? []).map((r) => r.map(String))));
    return out as Tables;
  }

  // Without one: the CSV export, which works only for a sheet shared
  // "anyone with the link can view". Tabs are addressed by gid there.
  const gidSpec = arg('gids') ?? process.env.SHEET_GIDS ?? (sheet === DEFAULT_SHEET ? DEFAULT_GIDS : '');
  const gids = Object.fromEntries(gidSpec.split(',').filter(Boolean).map((p) => p.split('=').map((s) => s.trim())));
  const missing = TABS.filter((t) => !gids[t]);
  if (missing.length) {
    console.warn(
      `warning: no gid for ${missing.join(', ')}; reading by tab name through Google's query endpoint, ` +
        'which guesses column types. Pass --gids for an exact copy.',
    );
  }
  console.log(`reading sheet ${sheet} anonymously (CSV export)`);
  const out: Partial<Tables> = {};
  for (const tab of TABS) out[tab] = parseCsv(await fetchTab(sheet, tab, gids[tab]));
  return out as Tables;
}

async function main(): Promise<void> {
  const outDir = path.resolve(arg('out') ?? path.join(ROOT, 'content'));
  const files = tablesToJson(await readTables());

  // Check it the way the build will, against the pictures that exist.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-content-'));
  try {
    fs.copyFileSync(path.join(ROOT, 'content', 'images.json'), path.join(tmp, 'images.json'));
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(tmp, name), text);
    const site = loadSite(tmp);
    console.log(
      `sheet ok: ${site.works.length} works, ${site.exhibitions.length} exhibitions, ` +
        `${site.about.length} bio paragraphs${site.demo ? ', DEMO (placeholder data)' : ''}`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  let changed = 0;
  for (const [name, text] of Object.entries(files)) {
    const target = path.join(outDir, name);
    const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (before === text) {
      console.log(`  ${name}: unchanged`);
      continue;
    }
    changed++;
    console.log(`  ${name}: ${before === null ? 'new' : 'changed'}`);
    if (!flag('check')) fs.writeFileSync(target, text);
  }
  if (flag('check')) {
    console.log(changed ? `${changed} file(s) would change (--check: nothing written)` : 'content/ matches the sheet');
    process.exitCode = changed ? 1 : 0;
  } else {
    console.log(changed ? `wrote ${changed} file(s) to ${path.relative(process.cwd(), outDir) || '.'}` : 'nothing to write');
  }
}

main().catch((err) => {
  console.error(`sheet-to-json: ${err.message}`);
  process.exit(2);
});
