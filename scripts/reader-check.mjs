#!/usr/bin/env node
// The reader check (docs/sprints/F21.md, check 8): does the function, with the real Gemini,
// read the made-up transcripts as the rows prepared for them?
//
// It posts each made-up PDF to the function at the given address, puts the answer through
// the same checks as the browser does (`readRows`), and compares it with
// synthetic/transcripts/<name>.json. It sends the made-up PDFs and nothing else, uses no
// key (the key is in Netlify), and prints only made-up data. Each run costs a fraction of
// a cent of the owner's Gemini balance, so it is run by hand and never by CI.
//
// usage: node scripts/reader-check.mjs https://deploy-preview-<n>--<name>.netlify.app [runs]
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Text as it is compared when it decides nothing: spaces collapsed, capitals ignored. */
const loosely = value => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
/** A figure as printed ("3.00", 3) or nothing where the column is empty. */
const figure = value => (value === '' || value === null || value === undefined ? null : Number(value));

/**
 * Every difference between a reader's answer and the rows prepared for the same PDF, as
 * sentences; none when the answer reads as exactly those rows. `readRows` and `curriculum`
 * are the app's own (src/reader.ts, src/curriculum.ts).
 */
export function differences(prepared, answer, readRows, curriculum) {
  const found = [];
  let expected;
  let got;
  try {
    expected = readRows(prepared, curriculum);
    got = readRows(answer, curriculum);
  } catch {
    return ['the answer is not a list of rows'];
  }
  for (const row of got.toFix) found.push(`row ${row.line + 1} needs fixing (${row.problems.join(', ')}): ${row.seen.prefix} ${row.seen.number} in ${row.seen.term}`);
  // (A totals line returned as a row is thrown away by the app's checks and is no difference: it is not among the rows.)
  if (got.rows.length !== expected.rows.length) found.push(`${got.rows.length} rows were taken on; ${expected.rows.length} are prepared`);
  const raw = Array.isArray(answer?.rows) ? answer.rows : [];
  for (const [at, want] of expected.rows.entries()) {
    const have = got.rows[at];
    if (!have) continue;
    const name = `row ${at + 1} (${want.row.code}, ${want.row.term})`;
    // The fields that decide something: exactly the same.
    for (const field of ['code', 'term', 'transfer', 'credits', 'grade']) {
      if (have.row[field] !== want.row[field]) found.push(`${name}: ${field} is ${JSON.stringify(have.row[field])}, prepared ${JSON.stringify(want.row[field])}`);
    }
    for (const field of ['earned', 'points']) {
      const [mine, theirs] = [figure(raw[have.line]?.[field]), figure(prepared.rows[want.line]?.[field])];
      if (mine !== theirs) found.push(`${name}: ${field} is ${JSON.stringify(mine)}, prepared ${JSON.stringify(theirs)}`);
    }
    // The description is only shown: spaces and capitals may differ, and nothing else.
    if (loosely(have.description) !== loosely(want.description)) found.push(`${name}: description is ${JSON.stringify(have.description)}, prepared ${JSON.stringify(want.description)}`);
  }
  return found;
}

/** Cloudflare's published test token: taken by its test secret, which PathCheck's function uses on a Deploy Preview only. */
export const TEST_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

/** The address of a Netlify deploy, and nothing else: the made-up PDFs go to the owner's site only. */
export const isDeploy = address => /^https:\/\/[a-z0-9-]+\.netlify\.app\/?$/.test(String(address));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [address, times = '3'] = process.argv.slice(2);
  // (At most three runs: a browser's number is read three times a day.)
  if (!isDeploy(address) || !/^[1-3]$/.test(times)) {
    console.error('usage: node scripts/reader-check.mjs https://<deploy>.netlify.app [runs, 1 to 3]');
    process.exit(2);
  }
  const root = fileURLToPath(new URL('..', import.meta.url));
  const folder = join(root, 'synthetic', 'transcripts');
  // The app's own checks, loaded the way the app's code is.
  const { createServer } = await import('vite');
  // (No port is opened: no live-reload socket, no server.)
  const vite = await createServer({ root, server: { middlewareMode: true, ws: false, hmr: false }, appType: 'custom', logLevel: 'silent' });
  let failed = 0;
  try {
    const { readRows } = await vite.ssrLoadModule('/src/reader.ts');
    const { curriculum } = await vite.ssrLoadModule('/src/curriculum.ts');
    for (const name of Object.keys(JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8')))) {
      const prepared = JSON.parse(readFileSync(join(folder, `${name}.json`), 'utf8'));
      const pdf = readFileSync(join(folder, `${name}.pdf`));
      // The limits (F22): a preview takes Cloudflare's test token, and reads three uploads a day for one
      // browser number. Each made-up PDF is sent under a number of its own.
      const browser = randomBytes(16).toString('hex');
      for (let run = 1; run <= Number(times); run++) {
        const response = await fetch(new URL('/api/read-transcript', address), { method: 'POST', headers: { 'Content-Type': 'application/pdf', 'x-turnstile-token': TEST_TOKEN, 'x-pathcheck-browser': browser }, body: pdf, redirect: 'error' });
        if (!response.ok) {
          failed++;
          console.log(`${name}.pdf, run ${run}: FAIL (the function answered ${response.status})`);
          continue;
        }
        const answer = await response.json();
        const found = differences(prepared, answer, readRows, curriculum);
        if (found.length > 0) failed++;
        const taken = found.length === 0 ? readRows(answer, curriculum).rows.length : 0;
        console.log(`${name}.pdf, run ${run}: ${found.length === 0 ? `PASS (${taken} course rows, as prepared)` : 'FAIL'}; model ${answer.model ?? 'not named'}`);
        for (const one of found) console.log(`  ${one}`);
      }
    }
  } finally {
    await vite.close();
  }
  console.log(failed === 0 ? 'reader-check: every run read the made-up transcripts as prepared.' : `reader-check: ${failed} run(s) differed.`);
  process.exit(failed === 0 ? 0 : 1);
}
