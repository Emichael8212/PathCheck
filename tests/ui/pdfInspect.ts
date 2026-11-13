// Independent structural PDF checker for tests: header, every xref offset, startxref,
// trailer, page tree count, stream /Length values and text extraction from Tj operators.
export interface PdfInspection { pageCount: number; objectCount: number; text: string; pageTexts: string[]; title: string | null }

function latin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}

const WIN = new Map<number, string>([[0x95, '•'], [0x96, '–'], [0x97, '—'], [0x91, '‘'], [0x92, '’'], [0x93, '“'], [0x94, '”'], [0x85, '…'], [0x80, '€']]);

function unescapePdfString(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (c !== '\\') { out += c; continue; }
    const n = raw[i + 1]!;
    if (/[0-7]/.test(n)) {
      const oct = raw.slice(i + 1, i + 4);
      const code = parseInt(oct, 8);
      out += WIN.get(code) ?? String.fromCharCode(code);
      i += 3;
    } else { out += n; i += 1; }
  }
  return out;
}

export function inspectPdf(bytes: Uint8Array): PdfInspection {
  const s = latin1(bytes);
  const fail = (m: string): never => { throw new Error(`Invalid PDF: ${m}`); };
  if (!s.startsWith('%PDF-1.')) fail('missing header');
  if (!/%%EOF\s*$/.test(s)) fail('missing %%EOF');
  const sx = s.match(/startxref\s+(\d+)\s+%%EOF\s*$/);
  if (!sx) fail('missing startxref');
  const xrefAt = Number(sx![1]);
  if (s.slice(xrefAt, xrefAt + 4) !== 'xref') fail('startxref does not point at xref');
  const head = s.slice(xrefAt).match(/^xref\s+0\s+(\d+)\s+/);
  if (!head) fail('bad xref header');
  const count = Number(head![1]);
  const entries = s.slice(xrefAt + head![0].length).split('\n').slice(0, count);
  if (!entries[0]!.startsWith('0000000000 65535 f')) fail('bad free entry');
  for (let id = 1; id < count; id++) {
    const off = Number(entries[id]!.slice(0, 10));
    if (!s.startsWith(`${id} 0 obj`, off)) fail(`xref offset for object ${id} is wrong`);
  }
  const trailer = s.match(/trailer\s*<<([\s\S]*?)>>\s*startxref/);
  if (!trailer || !trailer[1]!.includes(`/Size ${count}`) || !/\/Root \d+ 0 R/.test(trailer[1]!)) fail('bad trailer');
  const pagesCount = s.match(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/);
  if (!pagesCount) fail('missing page tree');
  const pageObjs = s.match(/\/Type \/Page /g) ?? [];
  if (pageObjs.length !== Number(pagesCount![1])) fail('page count mismatch');
  const pageTexts: string[] = [];
  const streamRe = /<< \/Length (\d+) >>\nstream\n/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(s))) {
    const len = Number(m[1]);
    const start = m.index + m[0].length;
    if (s.slice(start + len, start + len + 9) !== 'endstream') fail('stream length mismatch');
    const content = s.slice(start, start + len);
    const parts: string[] = [];
    for (const t of content.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)) parts.push(unescapePdfString(t[1]!));
    pageTexts.push(parts.join('\n'));
  }
  if (pageTexts.length !== pageObjs.length) fail('content stream count mismatch');
  const title = s.match(/\/Title \(((?:\\.|[^\\)])*)\)/);
  return { pageCount: pageObjs.length, objectCount: count, pageTexts, text: pageTexts.join('\n'), title: title ? unescapePdfString(title[1]!) : null };
}
