// F11: taking a transcript PDF (docs/sprints/F11.md; docs/BRIEF.md §7). At this milestone
// only the two made-up transcripts can be "read", in the browser, and nothing is sent.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error The script is plain JavaScript, with no type declarations.
import { forbiddenText, leaksIn } from '../scripts/check-build.mjs';
// @ts-expect-error The script is plain JavaScript, with no type declarations.
import { fingerprintOf as scriptFingerprint, manifestFor, transcripts } from '../scripts/make-synthetic-transcripts.mjs';
import manifest from '../synthetic/transcripts/manifest.json';
import sampleA from '../synthetic/transcripts/sample-a.json';
import sampleB from '../synthetic/transcripts/sample-b.json';
import { LARGEST_FILE, fingerprintOf, isPdf, readFile, type ChosenFile } from '../src/upload';

const folder = join(import.meta.dirname, '..', 'synthetic', 'transcripts');
const pdf = (name: string): Uint8Array => new Uint8Array(readFileSync(join(folder, `${name}.pdf`)));
/** A chosen file, counting how often it is read. */
const fileOf = (bytes: Uint8Array, name = 'transcript.pdf', size = bytes.length) => {
  const file = { name, size, reads: 0, arrayBuffer: async (): Promise<ArrayBuffer> => { file.reads++; return bytes.slice().buffer as ArrayBuffer; } };
  return file;
};
const text = (words: string): Uint8Array => new TextEncoder().encode(words);

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe('taking a file', () => {
  it('recognises only the made-up transcripts', async () => {
    expect(await readFile(fileOf(pdf('sample-a'), 'whatever-it-is-called.pdf'))).toEqual({ ok: true, name: 'sample-a.pdf', answer: sampleA });
    expect(await readFile(fileOf(pdf('sample-b')))).toEqual({ ok: true, name: 'sample-b.pdf', answer: sampleB });

    // The same PDF with one byte changed, at the start, the middle and the end; and another PDF.
    const bytes = pdf('sample-a');
    for (const at of [9, 1500, bytes.length - 2]) {
      const changed = bytes.slice();
      changed[at] = (changed[at] ?? 0) ^ 1;
      expect(await readFile(fileOf(changed)), String(at)).toEqual({ ok: false, refusal: 'not-made-up' });
    }
    expect(await readFile(fileOf(text('%PDF-1.7\nsomething else entirely\n%%EOF\n')))).toEqual({ ok: false, refusal: 'not-made-up' });
    expect(await readFile(fileOf(new Uint8Array([...bytes, 0x0a])))).toEqual({ ok: false, refusal: 'not-made-up' });

    // Not a PDF, whatever it is called: it goes by the first bytes.
    for (const notPdf of [text('ENG 131 B\nMGT 321 A\n'), new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), new Uint8Array([]), text(' %PDF-1.4'), text('%PD')]) {
      expect(await readFile(fileOf(notPdf, 'transcript.pdf'))).toEqual({ ok: false, refusal: 'not-a-pdf' });
    }
    expect(isPdf(text('%PDF-1.4'))).toBe(true);
    expect(isPdf(text('pdf'))).toBe(false);

    // Too large: refused before it is read.
    expect(LARGEST_FILE).toBe(10 * 1024 * 1024);
    const huge = fileOf(pdf('sample-a'), 'huge.pdf', LARGEST_FILE + 1);
    expect(await readFile(huge)).toEqual({ ok: false, refusal: 'too-large' });
    expect(huge.reads).toBe(0);
    const justFits = fileOf(pdf('sample-a'), 'fits.pdf', LARGEST_FILE);
    expect((await readFile(justFits)).ok).toBe(true);
    expect(justFits.reads).toBe(1);
  });

  it('works without the browser\'s cryptography', async () => {
    // A phone that opens the development server over the local network has none.
    vi.stubGlobal('crypto', undefined);
    expect((await readFile(fileOf(pdf('sample-b')))).ok).toBe(true);
    expect(fingerprintOf(pdf('sample-a'))).toMatch(/^[0-9a-f]{8}-[0-9a-f]{8}$/);
    expect(fingerprintOf(new Uint8Array([]))).toBe('811c9dc5-00000001');
    expect(fingerprintOf(text('a'))).not.toBe(fingerprintOf(text('b')));
    expect(fingerprintOf(text('ab'))).not.toBe(fingerprintOf(text('ba')));
  });

  it('keeps the fingerprints in step with the PDFs', () => {
    const made = transcripts() as { name: string; pdf: Buffer }[];
    expect(manifest).toEqual(manifestFor(made));
    expect(Object.keys(manifest)).toEqual(['sample-a', 'sample-b']);
    for (const { name, pdf: written } of made) {
      const entry = (manifest as Record<string, { bytes: number; fingerprint: string }>)[name];
      // The committed PDF, the script's fingerprint and the app's all agree.
      expect(entry).toEqual({ bytes: pdf(name).length, fingerprint: fingerprintOf(pdf(name)) });
      expect(scriptFingerprint(written)).toBe(fingerprintOf(new Uint8Array(written)));
    }
    // The manifest says nothing about a student or a course.
    expect(JSON.stringify(manifest)).toMatch(/^[\w":,{}\s-]+$/);
  });

  it('sends nothing', async () => {
    const refuse = (): never => { throw new Error('a request was made'); };
    vi.stubGlobal('fetch', refuse);
    vi.stubGlobal('XMLHttpRequest', class { constructor() { refuse(); } });
    vi.stubGlobal('WebSocket', class { constructor() { refuse(); } });
    expect((await readFile(fileOf(pdf('sample-a')))).ok).toBe(true);
    expect((await readFile(fileOf(text('%PDF-1.4 other')))).ok).toBe(false);
  });

  it('leaves the made-up answers out of the built site', async () => {
    // Outside a development server there is nothing to read with: the upload is not available.
    vi.stubEnv('DEV', false);
    vi.resetModules();
    const built = await import('../src/upload');
    expect(await built.readFile(fileOf(pdf('sample-a')))).toEqual({ ok: false, refusal: 'unavailable' });
    expect(await built.readFile(fileOf(text('not a pdf')))).toEqual({ ok: false, refusal: 'not-a-pdf' });
    expect(await built.readFile(fileOf(pdf('sample-a'), 'huge.pdf', LARGEST_FILE + 1))).toEqual({ ok: false, refusal: 'too-large' });
  });

  it('fails the check of the built site when made-up data is in it', () => {
    // `npm run check` runs scripts/check-build.mjs on the real build; this is what it looks for.
    const root = join(folder, '..', '..');
    const forbidden = forbiddenText(folder, readFileSync(join(root, 'docs', 'curriculum', 'provisional-current.json'), 'utf8')) as { fingerprints: string[]; descriptions: string[] };
    expect(forbidden.fingerprints).toEqual(Object.values(manifest).map(one => one.fingerprint));
    expect(forbidden.descriptions.length).toBeGreaterThan(10);
    expect(leaksIn('const page = "PathCheck";', forbidden)).toEqual([]);
    expect(leaksIn(`var a="${forbidden.fingerprints[1]}"`, forbidden)).toEqual([forbidden.fingerprints[1]]);
    expect(leaksIn(`var rows=${JSON.stringify(sampleB)}`, forbidden).length).toBeGreaterThan(5);
    // The check runs after the build, every time.
    const scripts = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
    expect(scripts.check).toMatch(/npm run build && node scripts\/check-build\.mjs$/);
  });

  it('does not take a file\'s word for its size', async () => {
    const big = new Uint8Array(LARGEST_FILE + 1);
    big.set(text('%PDF-1.4'));
    expect(await readFile(fileOf(big, 'small.pdf', 10))).toEqual({ ok: false, refusal: 'too-large' });
  });
});

export type { ChosenFile };
