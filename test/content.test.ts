import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, onTestFinished } from 'vitest';
import sharp from 'sharp';
import { CONTENT_DIR, isCalendarDate, loadSite, splitExhibitions } from '../src/content';
import { dateRange, renderHome } from '../src/views/page';
import { derivativeSlug } from '../scripts/images';

const ROOT = path.join(__dirname, '..');

/** A copy of content/ with one file edited, for the failure cases. */
function contentWith(file: string, edit: (data: Record<string, unknown>) => void): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'christina-content-'));
  onTestFinished(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const name of ['bio.json', 'works.json', 'exhibitions.json', 'images.json']) {
    fs.copyFileSync(path.join(CONTENT_DIR, name), path.join(dir, name));
  }
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  edit(data);
  fs.writeFileSync(path.join(dir, file), JSON.stringify(data));
  return dir;
}

describe('content/*.json', () => {
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
    expect(site.about.length).toBeGreaterThan(0);
  });

  it('refuses a work whose picture does not exist', () => {
    const dir = contentWith('works.json', (d) => {
      (d.works as Record<string, unknown>[])[0].image = 'missing';
    });
    expect(() => loadSite(dir)).toThrow(/works\.json.*missing/);
  });

  it('refuses an exhibition date that is not YYYY-MM-DD', () => {
    const dir = contentWith('exhibitions.json', (d) => {
      (d.exhibitions as Record<string, unknown>[])[0].from = 'March 2027';
    });
    expect(() => loadSite(dir)).toThrow(/exhibitions\.json.*YYYY-MM-DD/);
  });

  it('refuses a day that does not exist, and a show that ends before it opens', () => {
    for (const bad of ['2027-13-05', '2027-04-31', '2026-02-29', '2027-00-10']) {
      expect(isCalendarDate(bad), bad).toBe(false);
      const dir = contentWith('exhibitions.json', (d) => {
        (d.exhibitions as Record<string, unknown>[])[0].to = bad;
      });
      expect(() => loadSite(dir), bad).toThrow(/exhibitions\.json.*real days/);
    }
    expect(isCalendarDate('2028-02-29')).toBe(true);
    const dir = contentWith('exhibitions.json', (d) => {
      const e = (d.exhibitions as Record<string, unknown>[])[0];
      [e.from, e.to] = ['2027-05-01', '2027-04-01'];
    });
    expect(() => loadSite(dir)).toThrow(/exhibitions\.json.*ends \(2027-04-01\) before it opens/);
  });

  it('refuses a year that is not a year, and two works with one picture', () => {
    for (const year of ['c. 2025', '', 25, 2026.5]) {
      const dir = contentWith('works.json', (d) => {
        (d.works as Record<string, unknown>[])[0].year = year;
      });
      expect(() => loadSite(dir), String(year)).toThrow(/works\.json.*not a year/);
    }
    const dir = contentWith('works.json', (d) => {
      const w = d.works as Record<string, unknown>[];
      w[1].image = w[0].image;
    });
    expect(() => loadSite(dir)).toThrow(/works\.json.*used by two works/);
  });

  it('refuses a bio without an email', () => {
    const dir = contentWith('bio.json', (d) => {
      delete d.email;
    });
    expect(() => loadSite(dir)).toThrow(/bio\.json.*email/);
  });

  it('names the file when one is not valid JSON', () => {
    const dir = contentWith('bio.json', () => {});
    fs.writeFileSync(path.join(dir, 'bio.json'), '{ not json');
    expect(() => loadSite(dir)).toThrow(/content\/bio\.json/);
  });

  it('is a demo while any one file is still placeholder data', () => {
    expect(loadSite().demo).toBe(true);
    let dir = contentWith('works.json', (d) => {
      d.placeholder = false;
    });
    expect(loadSite(dir).demo).toBe(true);
    // All three real: no sash.
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'christina-real-'));
    onTestFinished(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.copyFileSync(path.join(CONTENT_DIR, 'images.json'), path.join(dir, 'images.json'));
    for (const name of ['bio.json', 'works.json', 'exhibitions.json']) {
      const d = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, name), 'utf8'));
      delete d.placeholder;
      fs.writeFileSync(path.join(dir, name), JSON.stringify(d));
    }
    expect(loadSite(dir).demo).toBe(false);
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

  it('keeps a show Upcoming through the evening of its last day (Central time)', () => {
    // 2027-04-26T03:00Z is still 25 April, 22:00 in Chicago: the show's last day.
    expect(splitExhibitions(list, new Date('2027-04-26T03:00:00Z')).upcoming.map((e) => e.title)).toEqual(['A']);
    // 2027-04-26T06:00Z is 26 April, 01:00 in Chicago: it has closed.
    expect(splitExhibitions(list, new Date('2027-04-26T06:00:00Z')).upcoming).toEqual([]);
  });

  it('moves a show to Past the day after it closes', () => {
    expect(splitExhibitions(list, new Date('2027-04-25T12:00:00Z')).upcoming.map((e) => e.title)).toEqual(['A']);
    expect(splitExhibitions(list, new Date('2027-04-26T12:00:00Z')).upcoming).toEqual([]);
  });

  it('dates the © by the site\'s day too (Chicago, not UTC)', () => {
    const site = loadSite();
    const assets = { css: 'x', js: 'y' };
    // 31 December, 9 pm in Chicago, already 1 January in UTC.
    expect(renderHome(site, assets, new Date('2027-01-01T03:00:00Z'))).toContain('© 2026 ');
    expect(renderHome(site, assets, new Date('2027-01-01T07:00:00Z'))).toContain('© 2027 ');
  });

  it('formats date ranges without repeating what both ends share', () => {
    expect(dateRange('2027-03-12', '2027-04-25')).toBe('12 March – 25 April 2027');
    expect(dateRange('2026-05-08', '2026-05-30')).toBe('8 – 30 May 2026');
    expect(dateRange('2026-12-04', '2027-01-15')).toBe('4 December 2026 – 15 January 2027');
  });
});

describe('the picture pipeline', () => {
  it('knows whose derivative a file is, even when one slug starts another', () => {
    expect(derivativeSlug('poppies-480.0123abcd45.avif')).toBe('poppies');
    expect(derivativeSlug('poppies-2-480.0123abcd45.avif')).toBe('poppies-2');
    expect(derivativeSlug('003-b-1200.0123abcd45.jpg')).toBe('003-b');
    expect(derivativeSlug('artist-400.0123abcd45.webp')).toBe('artist');
    expect(derivativeSlug('notes.txt')).toBeNull();
    expect(derivativeSlug('poppies-480.avif')).toBeNull();
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
