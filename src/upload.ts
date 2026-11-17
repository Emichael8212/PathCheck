// Taking a transcript PDF from the student.
//
// On a development server there is no reader: the only transcripts PathCheck can "read"
// there are its two made-up ones. A chosen file is looked at in the browser, recognised by
// its length and a fingerprint, and answered with the rows prepared for it. Nothing of any
// file is kept or sent.
//
// On the built site a PDF is posted to PathCheck's one function (docs/sprints/F21.md;
// netlify/functions/read-transcript.mts), which has it read and answers with rows. The
// PDF's bytes go, and nothing else: no file name, no cookie, nothing that says who. The
// answer is not trusted: the caller puts it through the same checks as a prepared one.

/** Files larger than this are refused before they are read or sent: the function takes no more. */
export const LARGEST_FILE = 4 * 1024 * 1024;
/** Where the built site has a PDF read. */
export const READER = '/api/read-transcript';
/** How long the reader is waited for (it gives up on its own before that). */
export const READER_WAIT = 40_000;
/** The longest file name kept to show which file was read. */
const LONGEST_NAME = 80;

export type Refusal = 'too-large' | 'not-a-pdf' | 'not-made-up' | 'unreadable' | 'unavailable';

/** As much of a chosen file as is used. */
export interface ChosenFile {
  readonly name: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type Upload =
  | { readonly ok: true; readonly name: string; readonly answer: unknown }
  | { readonly ok: false; readonly refusal: Refusal };

/**
 * A fingerprint of a file's bytes: two simple checksums, in plain code. It tells the
 * made-up transcripts from other files and nothing more; it is not a security feature,
 * and it works where a browser offers no cryptography (a phone on the local network).
 */
export function fingerprintOf(bytes: Uint8Array): string {
  let first = 0x811c9dc5;
  let low = 1;
  let high = 0;
  for (const byte of bytes) {
    first = Math.imul(first ^ byte, 0x01000193) >>> 0;
    low = (low + byte) % 65521;
    high = (high + low) % 65521;
  }
  const hex = (value: number): string => (value >>> 0).toString(16).padStart(8, '0');
  return `${hex(first)}-${hex(high * 65536 + low)}`;
}

const PDF_START = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
export const isPdf = (bytes: Uint8Array): boolean => PDF_START.every((byte, i) => bytes[i] === byte);

interface Known { readonly bytes: number; readonly fingerprint: string }

// The made-up transcripts and their prepared answers, on a development server only: the
// built site holds none of them. They come with the page, so that choosing a file asks
// the server for nothing.
const madeUp = import.meta.env.DEV
  ? {
    manifest: import.meta.glob<Record<string, Known>>('../synthetic/transcripts/manifest.json', { eager: true, import: 'default' }),
    answers: import.meta.glob<unknown>('../synthetic/transcripts/sample-*.json', { eager: true, import: 'default' }),
  }
  : null;

/** Has the PDF read by the function. Whatever goes wrong, the upload is not available; nothing of the file is kept. */
async function askReader(bytes: Uint8Array, name: string): Promise<Upload> {
  // The wait is a timer of its own: not every browser in use has a ready-made one.
  const stop = new AbortController();
  const timer = setTimeout(() => { stop.abort(); }, READER_WAIT);
  try {
    const response = await fetch(READER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: bytes as BufferSource,
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: stop.signal,
    });
    if (response.status === 413) return { ok: false, refusal: 'too-large' };
    if (response.status === 415) return { ok: false, refusal: 'not-a-pdf' };
    if (!response.ok) return { ok: false, refusal: 'unavailable' };
    return { ok: true, name: name.slice(0, LONGEST_NAME), answer: (await response.json()) as unknown };
  } catch {
    return { ok: false, refusal: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

/** Looks at a chosen file and gives the reader's answer for it, or the reason it is refused. */
export async function readFile(file: ChosenFile): Promise<Upload> {
  if (file.size > LARGEST_FILE) return { ok: false, refusal: 'too-large' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  // The size a file gives for itself is not taken on trust.
  if (bytes.length > LARGEST_FILE) return { ok: false, refusal: 'too-large' };
  if (!isPdf(bytes)) return { ok: false, refusal: 'not-a-pdf' };
  if (!madeUp) return askReader(bytes, file.name);
  const manifest = Object.values(madeUp.manifest)[0] ?? {};
  const fingerprint = fingerprintOf(bytes);
  const name = Object.keys(manifest).find(one => manifest[one]?.bytes === bytes.length && manifest[one]?.fingerprint === fingerprint);
  const answer = name === undefined ? undefined : madeUp.answers[`../synthetic/transcripts/${name}.json`];
  if (name === undefined || answer === undefined) return { ok: false, refusal: 'not-made-up' };
  return { ok: true, name: `${name}.pdf`, answer };
}
