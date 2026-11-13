// Independent structural PDF checker for tests (does not use the writer's code paths):
// header, every classic xref offset, startxref, trailer /Size /Root /Info, page tree
// (/Kids vs /Count), stream /Length + endstream, FlateDecode inflation, text extraction
// from hex/literal Tj and TJ operators (WinAnsi), and decoded document-information values.
import { inflateSync } from 'node:zlib';

export interface PdfInspection {
  pageCount: number;
  objectCount: number;
  /** Text-showing operations per page, one per line, decoded as WinAnsi. */
  pageTexts: string[];
  text: string;
  /** Decoded document-information dictionary (keys without the leading slash). */
  info: Record<string, string>;
  title: string | null;
  /** All decoded text plus decoded metadata: what a reader or indexer could see. */
  visible: string;
}

const WIN_HIGH: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž',
  0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};
const winAnsi = (bytes: readonly number[]) => bytes.map(b => WIN_HIGH[b] ?? String.fromCharCode(b)).join('');

function latin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}

function hexBytes(hex: string): number[] {
  const h = hex.replace(/\s+/g, '');
  const padded = h.length % 2 ? h + '0' : h;
  const out: number[] = [];
  for (let i = 0; i < padded.length; i += 2) out.push(parseInt(padded.slice(i, i + 2), 16));
  return out;
}

function literalBytes(raw: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (c !== '\\') { out.push(c.charCodeAt(0)); continue; }
    const n = raw[i + 1]!;
    const oct = raw.slice(i + 1).match(/^[0-7]{1,3}/);
    if (oct) { out.push(parseInt(oct[0], 8)); i += oct[0].length; continue; }
    const esc: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 };
    out.push(esc[n] ?? n.charCodeAt(0));
    i += 1;
  }
  return out;
}

/** Text strings in metadata: UTF-16BE with BOM, otherwise PDFDocEncoding (≈ Latin-1 here). */
function decodeTextString(bytes: readonly number[]): string {
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let s = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i]! << 8) | bytes[i + 1]!);
    return s;
  }
  return String.fromCharCode(...bytes);
}

const STRING_TOKEN = /<([0-9A-Fa-f\s]*)>|\(((?:\\[\s\S]|[^\\)])*)\)/g;
const tokenBytes = (m: RegExpMatchArray) => (m[1] !== undefined ? hexBytes(m[1]) : literalBytes(m[2]!));

function extractText(content: string): string[] {
  const parts: string[] = [];
  const re = /(<[0-9A-Fa-f\s]*>|\((?:\\[\s\S]|[^\\)])*\))\s*Tj|\[((?:[^\]\\]|\\[\s\S])*)\]\s*TJ/g;
  for (const m of content.matchAll(re)) {
    const source = m[1] ?? m[2]!;
    parts.push([...source.matchAll(STRING_TOKEN)].map(t => winAnsi(tokenBytes(t))).join(''));
  }
  return parts;
}

export function inspectPdf(bytes: Uint8Array): PdfInspection {
  const s = latin1(bytes);
  const fail = (m: string): never => { throw new Error(`Invalid PDF: ${m}`); };
  if (!s.startsWith('%PDF-1.')) fail('missing header');
  const sx = s.match(/startxref\s+(\d+)\s+%%EOF\s*$/);
  if (!sx) fail('missing startxref / %%EOF');
  const xrefAt = Number(sx![1]);
  if (s.slice(xrefAt, xrefAt + 4) !== 'xref') fail('startxref does not point at a classic xref table');
  const head = s.slice(xrefAt).match(/^xref\s+0\s+(\d+)\s+/);
  if (!head) fail('bad xref header');
  const count = Number(head![1]);
  const entries = s.slice(xrefAt + head![0].length).split(/\r?\n/).slice(0, count);
  if (!entries[0]!.startsWith('0000000000 65535 f')) fail('bad free entry');
  const objects = new Map<number, string>();
  for (let id = 1; id < count; id++) {
    const entry = entries[id] ?? '';
    if (!/^\d{10} \d{5} n/.test(entry)) fail(`bad xref entry ${id}`);
    const off = Number(entry.slice(0, 10));
    if (!s.startsWith(`${id} 0 obj`, off)) fail(`xref offset for object ${id} is wrong`);
    const end = s.indexOf('endobj', off);
    if (end < 0) fail(`object ${id} has no endobj`);
    objects.set(id, s.slice(off + `${id} 0 obj`.length, end));
  }
  const trailer = s.slice(xrefAt).match(/trailer\s*<<([\s\S]*?)>>\s*startxref/);
  if (!trailer) fail('missing trailer');
  const tr = trailer![1]!;
  if (!new RegExp(`/Size ${count}\\b`).test(tr)) fail('trailer /Size does not match xref');
  const ref = (dict: string, key: string) => { const m = dict.match(new RegExp(`/${key}\\s+(\\d+) 0 R`)); return m ? Number(m[1]) : null; };
  const obj = (id: number | null, what: string) => (id !== null && objects.get(id)) || fail(`missing ${what}`);
  const catalog = obj(ref(tr, 'Root'), 'catalog');
  if (!/\/Type\s*\/Catalog\b/.test(catalog)) fail('root is not a catalog');
  const tree = obj(ref(catalog, 'Pages'), 'page tree');
  const kids = [...(tree.match(/\/Kids\s*\[([^\]]*)\]/)?.[1] ?? fail('missing /Kids')).matchAll(/(\d+) 0 R/g)].map(m => Number(m[1]));
  const declared = Number(tree.match(/\/Count\s+(\d+)/)?.[1] ?? fail('missing /Count'));
  if (kids.length !== declared) fail('page count mismatch');

  const streamData = (id: number): string => {
    const body = obj(id, `stream ${id}`);
    const st = body.match(/^\s*<<([\s\S]*?)>>\s*stream\r?\n/);
    if (!st) fail(`object ${id} is not a stream`);
    const len = Number(st![1]!.match(/\/Length\s+(\d+)/)?.[1] ?? fail('missing direct /Length'));
    const data = body.slice(st![0].length, st![0].length + len);
    if (!/^\r?\n?endstream/.test(body.slice(st![0].length + len))) fail(`stream ${id} length mismatch`);
    if (/\/Filter\s*\/FlateDecode/.test(st![1]!)) return latin1(inflateSync(Buffer.from(data, 'latin1')));
    if (/\/Filter/.test(st![1]!)) fail(`unsupported filter in stream ${id}`);
    return data;
  };

  const pageTexts = kids.map(id => {
    const page = obj(id, `page ${id}`);
    if (!/\/Type\s*\/Page\b/.test(page)) fail(`kid ${id} is not a page`);
    const contents = page.match(/\/Contents\s*(\[[^\]]*\]|\d+ 0 R)/)?.[1] ?? fail(`page ${id} has no contents`);
    const ids = [...contents.matchAll(/(\d+) 0 R/g)].map(m => Number(m[1]));
    return ids.flatMap(c => extractText(streamData(c))).join('\n');
  });

  const info: Record<string, string> = {};
  const infoId = ref(tr, 'Info');
  if (infoId !== null) {
    const dict = obj(infoId, 'info dictionary');
    for (const m of dict.matchAll(/\/(\w+)\s*(<[0-9A-Fa-f\s]*>|\((?:\\[\s\S]|[^\\)])*\))/g)) {
      const tok = [...m[2]!.matchAll(STRING_TOKEN)][0]!;
      info[m[1]!] = decodeTextString(tokenBytes(tok));
    }
  }
  const text = pageTexts.join('\n');
  return { pageCount: kids.length, objectCount: count, pageTexts, text, info, title: info.Title ?? null, visible: `${text}\n${Object.values(info).join('\n')}` };
}

/** Second, library-based opinion on page count (pdf-lib parser, separate from the writer path). */
export async function libraryPageCount(bytes: Uint8Array): Promise<number> {
  const { PDFDocument } = await import('pdf-lib');
  return (await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount();
}
