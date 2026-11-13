// Dependency-free PDF 1.4 writer: standard Type 1 fonts (Helvetica / Helvetica-Bold,
// WinAnsiEncoding), uncompressed text content streams, exact cross-reference offsets,
// automatic word wrap and pagination. Produces a complete, openable document.

export type BlockKind = 'title' | 'heading' | 'text' | 'small' | 'bullet' | 'spacer';
export interface Block { kind: BlockKind; text: string }
export interface PdfDocumentInput { title: string; creationDate: string; blocks: Block[]; footer: string }

const PAGE_W = 612, PAGE_H = 792, MARGIN = 54, FOOTER_Y = 30;
const STYLE: Record<Exclude<BlockKind, 'spacer'>, { size: number; bold: boolean; indent: number; before: number }> = {
  title: { size: 18, bold: true, indent: 0, before: 0 },
  heading: { size: 12.5, bold: true, indent: 0, before: 10 },
  text: { size: 10, bold: false, indent: 0, before: 2 },
  small: { size: 8.5, bold: false, indent: 0, before: 1 },
  bullet: { size: 10, bold: false, indent: 14, before: 2 },
};

// Helvetica AFM advance widths for 0x20..0x7E (per 1000 em).
const HELVETICA = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
// Helvetica-Bold AFM advance widths for 0x20..0x7E.
const HELVETICA_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

// Unicode -> WinAnsi byte for common punctuation outside Latin-1.
const WIN_ANSI: Record<number, number> = { 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2026: 0x85, 0x20ac: 0x80 };
const EXTRA_WIDTH: Record<number, number> = { 0x95: 350, 0x96: 556, 0x97: 1000, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x85: 1000, 0x80: 556 };

/** Encodes text to WinAnsi bytes; unrepresentable characters become '?'. Control chars become spaces. */
export function encodeWinAnsi(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0x09 || cp === 0x0a || cp === 0x0d) out.push(0x20);
    else if (cp >= 0x20 && cp <= 0x7e) out.push(cp);
    else if (cp >= 0xa0 && cp <= 0xff) out.push(cp);
    else if (WIN_ANSI[cp] !== undefined) out.push(WIN_ANSI[cp]);
    else out.push(0x3f);
  }
  return out;
}

function byteWidth(b: number, bold: boolean): number {
  if (b >= 0x20 && b <= 0x7e) return (bold ? HELVETICA_BOLD : HELVETICA)[b - 0x20]!;
  return EXTRA_WIDTH[b] ?? 556;
}

export function textWidth(bytes: readonly number[], size: number, bold: boolean): number {
  return bytes.reduce((w, b) => w + byteWidth(b, bold), 0) * size / 1000;
}

/** Greedy word wrap; words longer than a line are hard-split. */
export function wrap(bytes: number[], maxWidth: number, size: number, bold: boolean): number[][] {
  const words: number[][] = [];
  let cur: number[] = [];
  for (const b of bytes) {
    if (b === 0x20) { if (cur.length) words.push(cur); cur = []; } else cur.push(b);
  }
  if (cur.length) words.push(cur);
  const lines: number[][] = [];
  let line: number[] = [];
  const fits = (candidate: number[]) => textWidth(candidate, size, bold) <= maxWidth;
  for (let word of words) {
    const joined = line.length ? [...line, 0x20, ...word] : word;
    if (fits(joined)) { line = joined; continue; }
    if (line.length) lines.push(line);
    while (!fits(word)) {
      let n = word.length - 1;
      while (n > 1 && !fits(word.slice(0, n))) n--;
      lines.push(word.slice(0, n));
      word = word.slice(n);
    }
    line = word;
  }
  if (line.length || lines.length === 0) lines.push(line);
  return lines;
}

function pdfString(bytes: readonly number[]): string {
  let s = '(';
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) s += '\\' + String.fromCharCode(b);
    else if (b < 0x20 || b > 0x7e) s += '\\' + b.toString(8).padStart(3, '0');
    else s += String.fromCharCode(b);
  }
  return s + ')';
}

const num = (n: number): string => (Math.round(n * 100) / 100).toString();

interface Line { y: number; x: number; size: number; bold: boolean; bytes: number[] }

export function layout(blocks: readonly Block[]): Line[][] {
  const pages: Line[][] = [[]];
  let y = PAGE_H - MARGIN;
  const bottom = MARGIN + 10;
  for (const block of blocks) {
    if (block.kind === 'spacer') { y -= 8; continue; }
    const st = STYLE[block.kind];
    const lead = st.size * 1.35;
    const prefix = block.kind === 'bullet' ? 0x95 : null;
    const width = PAGE_W - 2 * MARGIN - st.indent;
    const lines = wrap(encodeWinAnsi(block.text), width, st.size, st.bold);
    y -= st.before;
    // Keep headings with at least two following lines.
    if (block.kind === 'heading' && y - lead * 3 < bottom) { pages.push([]); y = PAGE_H - MARGIN; }
    lines.forEach((bytes, i) => {
      if (y - lead < bottom) { pages.push([]); y = PAGE_H - MARGIN; }
      y -= lead;
      const page = pages[pages.length - 1]!;
      if (prefix !== null && i === 0) page.push({ y, x: MARGIN + 4, size: st.size, bold: false, bytes: [prefix] });
      page.push({ y, x: MARGIN + st.indent, size: st.size, bold: st.bold, bytes });
    });
  }
  return pages;
}

function pdfDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

/** Serializes blocks to PDF bytes. Every byte is < 0x100 so string length == byte length. */
export function renderPdf(input: PdfDocumentInput): Uint8Array {
  const pages = layout(input.blocks);
  const total = pages.length;
  const objects: string[] = [];
  // 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, 5 info, then (page, content) pairs.
  const pageIds = pages.map((_, i) => 6 + i * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${total} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objects[5] = `<< /Title ${pdfString(encodeWinAnsi(input.title))} /Producer (PathCheck) /CreationDate (${pdfDate(input.creationDate)}) >>`;
  pages.forEach((lines, i) => {
    const footer = encodeWinAnsi(`${input.footer} — Page ${i + 1} of ${total}`);
    const ops = [...lines, { y: FOOTER_Y, x: MARGIN, size: 7.5, bold: false, bytes: footer }]
      .map(l => `BT /${l.bold ? 'F2' : 'F1'} ${num(l.size)} Tf ${num(l.x)} ${num(l.y)} Td ${pdfString(l.bytes)} Tj ET`)
      .join('\n');
    const content = `0 g\n${ops}\n`;
    objects[pageIds[i]!] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[i]! + 1} 0 R >>`;
    objects[pageIds[i]! + 1] = `<< /Length ${content.length} >>\nstream\n${content}endstream`;
  });
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i);
  return bytes;
}
