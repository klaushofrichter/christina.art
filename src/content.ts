import fs from 'fs';
import path from 'path';

export const CONTENT_DIR = path.join(__dirname, '..', 'content');

export type ImageEntry = {
  width: number;
  height: number;
  widths: number[];
  hash: string;
  color: string;
};

export type Work = {
  slug: string;
  title: string;
  year: number;
  medium: string;
  size?: string;
  image: ImageEntry;
};

export type Exhibition = {
  title: string;
  kind: string;
  venue: string;
  city: string;
  from: string;
  to: string;
};

export type Site = {
  artist: string;
  tagline: string;
  description: string;
  email: string;
  works: Work[];
  about: string[];
  portrait: ImageEntry | null;
  exhibitions: Exhibition[];
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Reads and checks the content. Throws on anything inconsistent, so a bad
 *  edit fails the tests and the readiness probe rather than going live as a
 *  half-rendered page. */
export function loadSite(dir: string = CONTENT_DIR): Site {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'site.json'), 'utf8'));
  const images = JSON.parse(fs.readFileSync(path.join(dir, 'images.json'), 'utf8'));

  for (const key of ['artist', 'tagline', 'description', 'email']) {
    if (typeof raw[key] !== 'string' || !raw[key]) throw new Error(`site.json: "${key}" is missing`);
  }
  if (!Array.isArray(raw.works) || !raw.works.length) throw new Error('site.json: no works');

  const works: Work[] = raw.works.map((w: Record<string, unknown>, i: number) => {
    const slug = String(w.image ?? '');
    const image = images.works?.[slug];
    if (!image) throw new Error(`site.json: work ${i + 1} names image "${slug}", which images.json does not have`);
    if (!w.title) throw new Error(`site.json: work "${slug}" has no title`);
    return {
      slug,
      title: String(w.title),
      year: Number(w.year),
      medium: String(w.medium ?? ''),
      size: w.size ? String(w.size) : undefined,
      image,
    };
  });

  const exhibitions: Exhibition[] = (raw.exhibitions ?? []).map((e: Record<string, unknown>) => {
    for (const key of ['title', 'kind', 'venue', 'city', 'from', 'to']) {
      if (!e[key]) throw new Error(`site.json: an exhibition has no "${key}"`);
    }
    if (!DATE.test(String(e.from)) || !DATE.test(String(e.to))) {
      throw new Error(`site.json: exhibition "${e.title}" dates must be YYYY-MM-DD`);
    }
    return e as unknown as Exhibition;
  });

  return {
    artist: raw.artist,
    tagline: raw.tagline,
    description: raw.description,
    email: raw.email,
    works,
    about: Array.isArray(raw.about) ? raw.about.map(String) : [],
    portrait: images.artist ?? null,
    exhibitions,
  };
}

/** Upcoming (soonest first) and past (latest first), relative to `today`.
 *  An exhibition that is on now counts as upcoming: it is still worth going. */
export function splitExhibitions(list: Exhibition[], today: Date = new Date()) {
  const iso = today.toISOString().slice(0, 10);
  const upcoming = list.filter((e) => e.to >= iso).sort((a, b) => a.from.localeCompare(b.from));
  const past = list.filter((e) => e.to < iso).sort((a, b) => b.from.localeCompare(a.from));
  return { upcoming, past };
}
