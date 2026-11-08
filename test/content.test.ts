import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, onTestFinished } from 'vitest';
import sharp from 'sharp';
import { CONTENT_DIR, loadSite, splitExhibitions } from '../src/content';
import { dateRange } from '../src/views/page';

const ROOT = path.join(__dirname, '..');

/** A copy of content/ with site.json edited, for the failure cases. */
function contentWith(edit: (site: Record<string, unknown>) => void): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'christina-content-'));
  onTestFinished(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.copyFileSync(path.join(CONTENT_DIR, 'images.json'), path.join(dir, 'images.json'));
  const site = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'site.json'), 'utf8'));
  edit(site);
  fs.writeFileSync(path.join(dir, 'site.json'), JSON.stringify(site));
  return dir;
}

describe('content/site.json', () => {
  it('loads, and every work has its pictures on disk', () => {
    const site = loadSite();
    expect(site.works.length).toBeGreaterThan(0);
    for (const w of site.works) {
      for (const width of w.image.widths) {
        for (const ext of ['avif', 'webp', 'jpg']) {
          const file = path.join(ROOT, 'public', 'img', `${w.slug}-${width}.${w.image.hash}.${ext}`);
          expect(fs.existsSync(file), file).toBe(true);
        }
      }
    }
    expect(site.portrait).not.toBeNull();
  });

  it('refuses a work whose picture does not exist', () => {
    const dir = contentWith((s) => {
      (s.works as Record<string, unknown>[])[0].image = 'missing';
    });
    expect(() => loadSite(dir)).toThrow(/missing/);
  });

  it('refuses an exhibition date that is not YYYY-MM-DD', () => {
    const dir = contentWith((s) => {
      (s.exhibitions as Record<string, unknown>[])[0].from = 'March 2027';
    });
    expect(() => loadSite(dir)).toThrow(/YYYY-MM-DD/);
  });
});

describe('exhibitions', () => {
  const list = [
    { title: 'A', kind: 'Solo', venue: 'V', city: 'C', from: '2027-03-12', to: '2027-04-25' },
    { title: 'B', kind: 'Solo', venue: 'V', city: 'C', from: '2026-05-08', to: '2026-06-14' },
    { title: 'C', kind: 'Group', venue: 'V', city: 'C', from: '2025-10-03', to: '2025-11-09' },
    { title: 'Now', kind: 'Group', venue: 'V', city: 'C', from: '2026-11-01', to: '2026-11-30' },
  ];

  it('splits upcoming (soonest first) from past (latest first)', () => {
    const { upcoming, past } = splitExhibitions(list, new Date('2026-11-08T12:00:00Z'));
    expect(upcoming.map((e) => e.title)).toEqual(['Now', 'A']);
    expect(past.map((e) => e.title)).toEqual(['B', 'C']);
  });

  it('moves a show to Past the day after it closes', () => {
    expect(splitExhibitions(list, new Date('2027-04-25T12:00:00Z')).upcoming.map((e) => e.title)).toEqual(['A']);
    expect(splitExhibitions(list, new Date('2027-04-26T12:00:00Z')).upcoming).toEqual([]);
  });

  it('formats date ranges without repeating what both ends share', () => {
    expect(dateRange('2027-03-12', '2027-04-25')).toBe('12 March – 25 April 2027');
    expect(dateRange('2026-05-08', '2026-05-30')).toBe('8 – 30 May 2026');
    expect(dateRange('2026-12-04', '2027-01-15')).toBe('4 December 2026 – 15 January 2027');
  });
});

describe('pictures in the repository', () => {
  // The repo is public and camera photos carry GPS coordinates, the camera and
  // the time in EXIF. Every picture committed must be clean.
  const files = ['originals', 'public/img']
    .map((d) => path.join(ROOT, d))
    .filter((d) => fs.existsSync(d))
    .flatMap((d) => fs.readdirSync(d, { recursive: true }).map((f) => path.join(d, String(f))))
    .filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f));

  it('there are pictures to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('carry no EXIF, XMP or IPTC (so no GPS, camera or dates)', async () => {
    for (const f of files) {
      const m = await sharp(f).metadata();
      expect(m.exif, `${path.relative(ROOT, f)} has EXIF`).toBeUndefined();
      expect(m.xmp, `${path.relative(ROOT, f)} has XMP`).toBeUndefined();
      expect(m.iptc, `${path.relative(ROOT, f)} has IPTC`).toBeUndefined();
    }
  });
});
