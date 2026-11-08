/**
 * The image pipeline. Run with `npm run images` after adding or replacing
 * pictures; commit what it writes.
 *
 *  1. Import: anything in images-incoming/ (the works) and assets/c1.png (the
 *     portrait) becomes a master under originals/: rotated upright, sRGB,
 *     at most MASTER_MAX px on the long edge, JPEG, and with NO metadata.
 *     Camera photos carry GPS coordinates, camera model and dates in EXIF,
 *     and this repo is public, so nothing of that may reach git. The source
 *     file is then removed from the incoming folder ("moved").
 *  2. Derivatives: every master is written to public/img at several widths in
 *     AVIF, WebP and JPEG. File names carry a content hash, so the server can
 *     cache them for a year and a replaced picture still reaches everyone.
 *  3. content/images.json records sizes, widths, hash and a muted dominant
 *     colour (painted behind each picture while it loads).
 *  4. The favicon set is rendered from public/favicon.svg.
 *
 * Deterministic: re-running with nothing changed rewrites nothing.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';

const ROOT = path.join(__dirname, '..');
const INCOMING = path.join(ROOT, 'images-incoming');
const PORTRAIT_IN = path.join(ROOT, 'assets', 'c1.png');
const ORIGINALS = path.join(ROOT, 'originals');
const WORKS_DIR = path.join(ORIGINALS, 'works');
const PORTRAIT = path.join(ORIGINALS, 'artist.jpg');
const OUT = path.join(ROOT, 'public', 'img');
const MANIFEST = path.join(ROOT, 'content', 'images.json');
const PUBLIC = path.join(ROOT, 'public');

const MASTER_MAX = 3200;
const WORK_WIDTHS = [480, 800, 1200, 1800, 2400];
const PORTRAIT_WIDTHS = [400, 700, 1000];
const QUALITY = { avif: 52, webp: 78, jpeg: 80 };
/** Bump to regenerate every derivative after changing the settings above. */
const SETTINGS_VERSION = 1;

const IMAGE_EXT = /\.(jpe?g|png|webp|tiff?|heic|avif)$/i;

export type ImageEntry = {
  width: number;
  height: number;
  widths: number[];
  hash: string;
  color: string;
};
export type ImageManifest = { works: Record<string, ImageEntry>; artist: ImageEntry | null };

/** Upright, sRGB, bounded, metadata-free JPEG. sharp writes no EXIF, XMP or
 *  IPTC unless asked to (withMetadata / keepExif), and none is asked for. */
async function toMaster(src: string, dest: string): Promise<void> {
  const buf = await sharp(src)
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize({ width: MASTER_MAX, height: MASTER_MAX, fit: 'inside', withoutEnlargement: true })
    .toColorspace('srgb')
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
}

function slugOf(file: string): string {
  return path
    .basename(file, path.extname(file))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function importIncoming(): Promise<void> {
  if (fs.existsSync(INCOMING)) {
    for (const name of fs.readdirSync(INCOMING).sort()) {
      if (!IMAGE_EXT.test(name)) continue;
      const src = path.join(INCOMING, name);
      const dest = path.join(WORKS_DIR, `${slugOf(name)}.jpg`);
      await toMaster(src, dest);
      fs.rmSync(src);
      console.log(`imported ${name} -> ${path.relative(ROOT, dest)}`);
    }
    if (!fs.readdirSync(INCOMING).length) fs.rmdirSync(INCOMING);
  }
  if (fs.existsSync(PORTRAIT_IN)) {
    await toMaster(PORTRAIT_IN, PORTRAIT);
    fs.rmSync(PORTRAIT_IN);
    console.log(`imported assets/c1.png -> ${path.relative(ROOT, PORTRAIT)}`);
    const assets = path.dirname(PORTRAIT_IN);
    if (!fs.readdirSync(assets).length) fs.rmdirSync(assets);
  }
}

/** Pulled toward a warm grey, so the loading backdrop never shouts. */
function mutedHex(r: number, g: number, b: number): string {
  const mix = (c: number, to: number) => Math.round(c * 0.55 + to * 0.45);
  const hex = (c: number) => c.toString(16).padStart(2, '0');
  return `#${hex(mix(r, 200))}${hex(mix(g, 194))}${hex(mix(b, 186))}`;
}

async function derive(master: string, slug: string, widthsWanted: number[]): Promise<ImageEntry> {
  const bytes = fs.readFileSync(master);
  const meta = await sharp(bytes).metadata();
  const width = meta.width!;
  const height = meta.height!;
  const hash = crypto
    .createHash('sha256')
    .update(bytes)
    .update(JSON.stringify({ SETTINGS_VERSION, QUALITY, widthsWanted }))
    .digest('hex')
    .slice(0, 10);
  // Never upscale; if the master is narrower than the smallest wanted width,
  // its own width is the only one.
  let widths = widthsWanted.filter((w) => w <= width);
  if (!widths.length || (widths[widths.length - 1] < width && width < widthsWanted[widthsWanted.length - 1])) {
    widths = [...widths, width];
  }

  const keep = new Set<string>();
  for (const w of widths) {
    const base = `${slug}-${w}.${hash}`;
    const resized = () => sharp(bytes).resize({ width: w, withoutEnlargement: true });
    const jobs: [string, () => Promise<Buffer>][] = [
      [`${base}.avif`, () => resized().avif({ quality: QUALITY.avif, effort: 6 }).toBuffer()],
      [`${base}.webp`, () => resized().webp({ quality: QUALITY.webp, effort: 6 }).toBuffer()],
      [`${base}.jpg`, () => resized().jpeg({ quality: QUALITY.jpeg, mozjpeg: true, progressive: true }).toBuffer()],
    ];
    for (const [name, make] of jobs) {
      keep.add(name);
      const file = path.join(OUT, name);
      if (!fs.existsSync(file)) fs.writeFileSync(file, await make());
    }
  }
  // Drop this picture's derivatives from earlier settings or an older master.
  for (const name of fs.readdirSync(OUT)) {
    if (name.startsWith(`${slug}-`) && !keep.has(name)) fs.rmSync(path.join(OUT, name));
  }

  const { dominant } = await sharp(bytes).stats();
  return { width, height, widths, hash, color: mutedHex(dominant.r, dominant.g, dominant.b) };
}

/** An .ico holding PNG images: valid for every browser since IE Vista-era. */
function ico(pngs: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)]);
}

async function favicons(): Promise<void> {
  const svg = fs.readFileSync(path.join(PUBLIC, 'favicon.svg'));
  const png = (size: number) => sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  const small = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(size) })));
  fs.writeFileSync(path.join(PUBLIC, 'favicon.ico'), ico(small));
  fs.writeFileSync(path.join(PUBLIC, 'apple-touch-icon.png'), await png(180));
  fs.writeFileSync(path.join(PUBLIC, 'icon-512.png'), await png(512));
}

async function main(): Promise<void> {
  await importIncoming();
  fs.mkdirSync(OUT, { recursive: true });

  const manifest: ImageManifest = { works: {}, artist: null };
  const masters = fs.existsSync(WORKS_DIR) ? fs.readdirSync(WORKS_DIR).filter((n) => n.endsWith('.jpg')).sort() : [];
  for (const name of masters) {
    const slug = slugOf(name);
    manifest.works[slug] = await derive(path.join(WORKS_DIR, name), slug, WORK_WIDTHS);
    console.log(`works/${slug}: ${manifest.works[slug].widths.join(', ')}`);
  }
  if (fs.existsSync(PORTRAIT)) {
    manifest.artist = await derive(PORTRAIT, 'artist', PORTRAIT_WIDTHS);
    console.log(`artist: ${manifest.artist.widths.join(', ')}`);
  }
  // Remove derivatives whose master no longer exists.
  const slugs = new Set([...Object.keys(manifest.works), 'artist']);
  for (const name of fs.readdirSync(OUT)) {
    const slug = name.replace(/-\d+\.[0-9a-f]{10}\.(avif|webp|jpg)$/, '');
    if (!slugs.has(slug)) fs.rmSync(path.join(OUT, name));
  }

  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  await favicons();
  console.log(`wrote ${path.relative(ROOT, MANIFEST)} and the favicon set`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
