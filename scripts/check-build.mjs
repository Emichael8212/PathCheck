#!/usr/bin/env node
// After `vite build`: the built site must hold nothing of the made-up transcripts — not
// their fingerprints, not a description printed on them. They are for a development
// server only. Run by `npm run check`, so CI fails if they ever ship.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** What must not be in the built site: every fingerprint, and every description that is not also a curriculum title. */
export function forbiddenText(folder, curriculumText) {
  const manifest = JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8'));
  const fingerprints = Object.values(manifest).map(one => one.fingerprint);
  const descriptions = Object.keys(manifest).flatMap(name => JSON.parse(readFileSync(join(folder, `${name}.json`), 'utf8')).rows
    .map(row => row.description)
    .filter(description => typeof description === 'string' && description.length >= 8 && !curriculumText.includes(description)));
  return { fingerprints, descriptions: [...new Set(descriptions)] };
}

/**
 * What also must not be in the built site: anything of the server piece (docs/sprints/F21.md).
 * The key lives in Netlify, and only the function knows its variable's name, Gemini's
 * address and the header the key travels in.
 */
export const SERVER_ONLY = ['GEMINI_API_KEY', 'generativelanguage.googleapis.com', 'x-goog-api-key'];
/** The pieces of the server found in a built file's text. */
export const serverPiecesIn = text => SERVER_ONLY.filter(piece => text.toLowerCase().includes(piece.toLowerCase()));

/** The forbidden pieces of text found in a built file's text. */
export const leaksIn = (text, forbidden) => [...forbidden.fingerprints, ...forbidden.descriptions].filter(piece => text.includes(piece));

const filesUnder = folder => readdirSync(folder).flatMap(name => {
  const path = join(folder, name);
  return statSync(path).isDirectory() ? filesUnder(path) : [path];
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const dist = join(root, 'dist');
  if (!existsSync(dist)) { console.error('check-build: there is no built site (dist/). Run `npm run build` first.'); process.exit(1); }
  const forbidden = forbiddenText(join(root, 'synthetic/transcripts'), readFileSync(join(root, 'docs/curriculum/provisional-current.json'), 'utf8'));
  if (forbidden.fingerprints.length < 2 || forbidden.descriptions.length < 5) { console.error('check-build: too little to look for; the check would prove nothing.'); process.exit(1); }
  const found = filesUnder(dist).flatMap(path => leaksIn(readFileSync(path, 'latin1'), forbidden).map(piece => `${path}: "${piece}"`));
  if (found.length > 0) { console.error(`check-build: the built site holds made-up transcript data:\n${found.join('\n')}`); process.exit(1); }
  const server = filesUnder(dist).flatMap(path => serverPiecesIn(readFileSync(path, 'latin1')).map(piece => `${path}: "${piece}"`));
  if (server.length > 0) { console.error(`check-build: the built site holds a piece of the server:\n${server.join('\n')}`); process.exit(1); }
  console.log(`check-build: the built site holds none of the made-up transcripts (${forbidden.fingerprints.length} fingerprints, ${forbidden.descriptions.length} descriptions looked for) and nothing of the server piece (${SERVER_ONLY.length} pieces looked for).`);
}
