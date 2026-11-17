// F11 and F21: taking a transcript PDF (docs/sprints/F11.md, F21.md; docs/BRIEF.md §7). On a
// development server only the two made-up transcripts can be "read", in the browser, and
// nothing is sent. On the built site the PDF goes to PathCheck's reader, and nothing else does.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error The script is plain JavaScript, with no type declarations.
import { SERVER_ONLY, forbiddenText, leaksIn, serverPiecesIn } from '../scripts/check-build.mjs';
// @ts-expect-error The script is plain JavaScript, with no type declarations.
import { fingerprintOf as scriptFingerprint, manifestFor, transcripts } from '../scripts/make-synthetic-transcripts.mjs';
import { GEMINI, LARGEST_BODY } from '../netlify/functions/read-transcript.mjs';
import manifest from '../synthetic/transcripts/manifest.json';
import sampleA from '../synthetic/transcripts/sample-a.json';
import sampleB from '../synthetic/transcripts/sample-b.json';
import { curriculum } from '../src/curriculum';
import { ReaderError, readRows } from '../src/reader';
import { openTranscript } from '../src/review';
import { LARGEST_FILE, READER, fingerprintOf, isPdf, readFile, type ChosenFile } from '../src/upload';

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
    expect(LARGEST_FILE).toBe(4 * 1024 * 1024);
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

  it('sends nothing on a development server', async () => {
    const sent: unknown[] = [];
    vi.stubGlobal('fetch', (...call: unknown[]) => { sent.push(call); return Promise.reject(new Error('nothing may be sent')); });
    expect((await readFile(fileOf(pdf('sample-a')))).ok).toBe(true);
    expect(await readFile(fileOf(text('%PDF-1.4 somebody else')))).toEqual({ ok: false, refusal: 'not-made-up' });
    expect(await readFile(fileOf(text('not a pdf')))).toEqual({ ok: false, refusal: 'not-a-pdf' });
    expect(sent).toEqual([]);
  });
});

describe('on the built site', () => {
  type Call = { url: unknown; init: RequestInit };
  /** The built site's upload, with a stand-in for the reader. */
  const built = async (reader: () => Response | Promise<Response>) => {
    const calls: Call[] = [];
    vi.stubEnv('DEV', false);
    vi.stubGlobal('fetch', (url: unknown, init: RequestInit) => { calls.push({ url, init }); return Promise.resolve().then(reader); });
    vi.resetModules();
    return { upload: await import('../src/upload'), calls };
  };
  const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('posts the PDF and nothing else', async () => {
    const answer = { rows: sampleA.rows, model: 'gemini-2.5-flash-lite' };
    const { upload, calls } = await built(() => json(answer));
    const bytes = pdf('sample-a');
    expect(await upload.readFile(fileOf(bytes, 'My Transcript (final).pdf'))).toEqual({ ok: true, name: 'My Transcript (final).pdf', answer });
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    // To PathCheck's own function, on the site's own address.
    expect(url).toBe('/api/read-transcript');
    expect(READER).toBe('/api/read-transcript');
    expect(init.method).toBe('POST');
    // The PDF's bytes as they are, and one header that says they are a PDF. No key, nothing of PathCheck's that says who.
    // (To this site only: on a private deploy the browser adds the visitor's Netlify login, without which nobody is answered.)
    expect(init.body).toEqual(bytes);
    expect(init.headers).toEqual({ 'Content-Type': 'application/pdf' });
    // An answer that points to another address is not followed: the PDF goes to this site's function or nowhere.
    expect([init.credentials, init.cache, init.referrerPolicy, init.redirect]).toEqual(['same-origin', 'no-store', 'no-referrer', 'error']);
    // The wait is the page's own timer, so that it works in a browser without a ready-made one; it is put away after the answer.
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect((init.signal as AbortSignal).aborted).toBe(false);
    expect(readFileSync(join(folder, '..', '..', 'src', 'upload.ts'), 'utf8')).not.toContain('AbortSignal.timeout');
    // The file's name stays in the browser, where it is shown; a very long one is cut.
    expect(JSON.stringify([url, init.headers])).not.toMatch(/Transcript|final/);
    const long = await upload.readFile(fileOf(bytes, `${'x'.repeat(300)}.pdf`));
    expect(long.ok && long.name).toBe('x'.repeat(80));
    // The made-up answers are not in the built site: what the reader says is what is used.
    const { upload: other } = await built(() => json({ rows: [] }));
    expect(await other.readFile(fileOf(bytes))).toEqual({ ok: true, name: 'transcript.pdf', answer: { rows: [] } });
  });

  it('refuses in the browser before anything is sent', async () => {
    const { upload, calls } = await built(() => json({ rows: [] }));
    expect(await upload.readFile(fileOf(text('not a pdf')))).toEqual({ ok: false, refusal: 'not-a-pdf' });
    expect(await upload.readFile(fileOf(new Uint8Array([])))).toEqual({ ok: false, refusal: 'not-a-pdf' });
    // Too large by what the file says of itself (it is then not even read), and by its bytes.
    const huge = fileOf(pdf('sample-a'), 'huge.pdf', upload.LARGEST_FILE + 1);
    expect(await upload.readFile(huge)).toEqual({ ok: false, refusal: 'too-large' });
    expect(huge.reads).toBe(0);
    const heavy = new Uint8Array(upload.LARGEST_FILE + 1);
    heavy.set(text('%PDF-1.7'));
    expect(await upload.readFile(fileOf(heavy, 'heavy.pdf', 10))).toEqual({ ok: false, refusal: 'too-large' });
    expect(calls).toEqual([]);
    // The largest that is taken is the largest the function takes.
    expect(upload.LARGEST_FILE).toBe(LARGEST_BODY);
  });

  it('says upload isn’t available', async () => {
    const unavailable = { ok: false, refusal: 'unavailable' };
    const file = (): ChosenFile => fileOf(pdf('sample-b'));
    // The function says so; or anything else that is not an answer.
    for (const status of [503, 500, 502, 404, 405, 429, 401, 403, 400, 302]) {
      const { upload } = await built(() => json({ error: 'unavailable' }, status));
      expect(await upload.readFile(file()), String(status)).toEqual(unavailable);
    }
    // It cannot be reached, or does not answer in time.
    for (const failure of [new TypeError('Failed to fetch'), new DOMException('The operation timed out.', 'TimeoutError')]) {
      const { upload } = await built(() => Promise.reject(failure));
      expect(await upload.readFile(file())).toEqual(unavailable);
    }
    // It never answers: the page stops waiting after 40 seconds, tells the request to stop, and says the same.
    vi.useFakeTimers();
    try {
      const sent: RequestInit[] = [];
      vi.stubEnv('DEV', false);
      // (The stand-in ends, as a browser's request does, when it is told to stop.)
      vi.stubGlobal('fetch', (_url: unknown, init: RequestInit) => {
        sent.push(init);
        return new Promise<Response>((_, reject) => { init.signal?.addEventListener('abort', () => { reject(new DOMException('aborted', 'AbortError')); }); });
      });
      vi.resetModules();
      const slow = await import('../src/upload');
      expect(slow.READER_WAIT).toBe(40_000);
      let result: unknown = 'waiting';
      void slow.readFile(file()).then(read => { result = read; });
      await vi.advanceTimersByTimeAsync(slow.READER_WAIT - 1);
      expect(result).toBe('waiting');
      expect(sent[0]!.signal!.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect(result).toEqual(unavailable);
      expect(sent[0]!.signal!.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
    // An answer that is not JSON (a host's error page with the wrong status).
    const { upload } = await built(() => new Response('<!doctype html><title>Site not available</title>', { status: 200 }));
    expect(await upload.readFile(file())).toEqual(unavailable);
    // The function's own refusals are the sentences the browser already has.
    expect(await (await built(() => json({ error: 'too-large' }, 413))).upload.readFile(file())).toEqual({ ok: false, refusal: 'too-large' });
    expect(await (await built(() => json({ error: 'not-a-pdf' }, 415))).upload.readFile(file())).toEqual({ ok: false, refusal: 'not-a-pdf' });
  });

  it('puts the answer through the same checks as a prepared one', async () => {
    const take = async (answer: unknown) => {
      const { upload } = await built(() => json(answer));
      const read = await upload.readFile(fileOf(pdf('sample-a'), 'mine.pdf'));
      if (!read.ok) throw new Error('refused');
      return openTranscript(read.name, read.answer, curriculum);
    };
    // The reader's answer for a made-up PDF is taken on exactly as its prepared rows are.
    for (const sample of [sampleA, sampleB]) {
      const transcript = await take({ rows: sample.rows, model: 'gemini-2.5-flash-lite' });
      expect(transcript.reading).toEqual(readRows(sample, curriculum));
      expect(transcript.reading.toFix).toEqual([]);
    }
    // What a reader gets wrong counts nothing: each such row is one to fix, and a totals line is thrown away.
    const good = { term: 'Fall 2025', transfer: false, prefix: 'MGT', number: '321', description: 'Prin of Management', attempted: '3.00', earned: '3.00', grade: 'B', points: '9.00' };
    const { reading } = await take({ rows: [
      good,
      { ...good, prefix: 'MGT321', number: '' },
      { ...good, number: '422', attempted: '300' },
      { ...good, number: '462', grade: 'Counts toward CIS' },
      { ...good, prefix: 'Term GPA 3.10', number: '', description: '' },
      {},
      null,
    ] });
    expect(reading.rows.map(row => row.row.code)).toEqual(['MGT 321']);
    expect(reading.toFix.map(row => [row.line, row.problems])).toEqual([[1, ['code']], [2, ['credits']], [3, ['grade']], [5, ['term', 'transfer', 'code', 'credits']], [6, ['not-a-row']]]);
    expect(reading.thrownAway).toBe(1);
    // An answer that is no list of rows is no answer: nothing is taken on (the page then says upload isn't available).
    for (const answer of [{ rows: 'MGT 321 A' }, { error: 'unavailable' }, [], 'rows', null, 7]) {
      await expect(take(answer), JSON.stringify(answer)).rejects.toBeInstanceOf(ReaderError);
    }
  });

  it('holds nothing of the server piece', () => {
    // `npm run check` looks through the built site for these after every build.
    expect(SERVER_ONLY).toEqual(['GEMINI_API_KEY', 'generativelanguage.googleapis.com', 'x-goog-api-key']);
    expect(serverPiecesIn('fetch("/api/read-transcript",{method:"POST"})')).toEqual([]);
    expect(serverPiecesIn('const key=process.env.GEMINI_API_KEY')).toEqual(['GEMINI_API_KEY']);
    expect(serverPiecesIn('headers:{"X-Goog-Api-Key":k}')).toEqual(['x-goog-api-key']);
    expect(serverPiecesIn(`fetch("${GEMINI}")`)).toEqual(['generativelanguage.googleapis.com']);
    // Nothing the browser runs names them: the function is not part of the site's code.
    const src = join(folder, '..', '..', 'src');
    for (const name of readdirSync(src)) expect(serverPiecesIn(readFileSync(join(src, name), 'utf8')), name).toEqual([]);
    const check = readFileSync(join(folder, '..', '..', 'scripts', 'check-build.mjs'), 'utf8');
    expect(check).toContain("serverPiecesIn(readFileSync(path, 'latin1'))");
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
