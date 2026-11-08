/**
 * Build step: read content/bio.json, works.json, exhibitions.json and the
 * generated images.json, check them (src/content.ts), and write the merged
 * result to dist/content.json, which is all the server reads.
 *
 * Runs in `npm run build`, so in the Docker build of every deploy: content
 * fed in from elsewhere ahead of a deploy is validated there, and bad data
 * fails the build before anything rolls out. The running site never reads
 * content/ again.
 */
import fs from 'fs';
import path from 'path';
import { loadSite } from '../src/content';

const out = path.join(__dirname, '..', 'dist', 'content.json');
const site = loadSite();
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(site));
console.log(
  `content: ${site.works.length} works, ${site.exhibitions.length} exhibitions, ` +
    `${site.about.length} bio paragraphs${site.demo ? ', DEMO (placeholder data)' : ''} -> dist/content.json`,
);
