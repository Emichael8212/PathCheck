// PDF renderer on the maintained pdf-lib library (DEP-002). Standard Type 1 fonts
// (Helvetica / Helvetica-Bold, WinAnsi), library-measured word wrap, pagination with
// "Page i of N" footers, a classic cross-reference table and minimal metadata.
// pdf-lib is imported lazily so it ships as a separate chunk, loaded only on export.
import type { PDFFont } from 'pdf-lib';

export type BlockKind = 'title' | 'heading' | 'text' | 'small' | 'bullet' | 'spacer';
export interface Block { kind: BlockKind; text: string }
export interface PdfDocumentInput { title: string; creationDate: string; blocks: Block[]; footer: string }

export const PAGE_W = 612, PAGE_H = 792, MARGIN = 54, FOOTER_Y = 30;
const FOOTER_SIZE = 7.5;
const STYLE: Record<Exclude<BlockKind, 'spacer'>, { size: number; bold: boolean; indent: number; before: number }> = {
  title: { size: 18, bold: true, indent: 0, before: 0 },
  heading: { size: 12.5, bold: true, indent: 0, before: 10 },
  text: { size: 10, bold: false, indent: 0, before: 2 },
  small: { size: 8.5, bold: false, indent: 0, before: 1 },
  bullet: { size: 10, bold: false, indent: 14, before: 2 },
};
const BULLET = '•';

/** Width of `text` in points at `size`; supplied by the embedded font. */
export type Measure = (text: string, size: number, bold: boolean) => number;

export interface PlacedLine { kind: BlockKind | 'marker'; y: number; x: number; size: number; bold: boolean; text: string; maxWidth: number }

/**
 * Makes text drawable with a WinAnsi standard font: NFC-normalizes (so combining marks
 * compose where possible), turns control characters into spaces and any character the
 * font cannot encode into '?'. Standard fonts would otherwise throw while drawing.
 */
export function sanitizer(canEncode: (char: string) => boolean): (text: string) => string {
  const cache = new Map<string, string>();
  return (text: string) => {
    let out = '';
    for (const ch of text.normalize('NFC')) {
      let mapped = cache.get(ch);
      if (mapped === undefined) {
        const cp = ch.codePointAt(0)!;
        mapped = cp < 0x20 || (cp >= 0x7f && cp <= 0x9f) ? ' ' : canEncode(ch) ? ch : '?';
        cache.set(ch, mapped);
      }
      out += mapped;
    }
    return out;
  };
}

/** Greedy word wrap on spaces; words wider than a line are hard-split without losing characters. */
export function wrap(text: string, maxWidth: number, size: number, bold: boolean, measure: Measure): string[] {
  const fits = (candidate: string) => measure(candidate, size, bold) <= maxWidth;
  const lines: string[] = [];
  let line = '';
  for (const raw of text.split(' ')) {
    if (raw === '') continue;
    let word = raw;
    const joined = line ? `${line} ${word}` : word;
    if (fits(joined)) { line = joined; continue; }
    if (line) lines.push(line);
    while (!fits(word)) {
      const chars = Array.from(word);
      let n = chars.length - 1;
      while (n > 1 && !fits(chars.slice(0, n).join(''))) n--;
      lines.push(chars.slice(0, n).join(''));
      word = chars.slice(n).join('');
    }
    line = word;
  }
  if (line || lines.length === 0) lines.push(line);
  return lines;
}

/** Positions every line on Letter pages; keeps each heading with at least two following lines. */
export function layout(blocks: readonly Block[], measure: Measure): PlacedLine[][] {
  const pages: PlacedLine[][] = [[]];
  let y = PAGE_H - MARGIN;
  const bottom = MARGIN + 10;
  for (const block of blocks) {
    if (block.kind === 'spacer') { y -= 8; continue; }
    const st = STYLE[block.kind];
    const lead = st.size * 1.35;
    const width = PAGE_W - 2 * MARGIN - st.indent;
    const lines = wrap(block.text, width, st.size, st.bold, measure);
    y -= st.before;
    if (block.kind === 'heading' && y - lead * 3 < bottom) { pages.push([]); y = PAGE_H - MARGIN; }
    lines.forEach((text, i) => {
      if (y - lead < bottom) { pages.push([]); y = PAGE_H - MARGIN; }
      y -= lead;
      const page = pages[pages.length - 1]!;
      if (block.kind === 'bullet' && i === 0) page.push({ kind: 'marker', y, x: MARGIN + 4, size: st.size, bold: false, text: BULLET, maxWidth: st.indent });
      page.push({ kind: block.kind, y, x: MARGIN + st.indent, size: st.size, bold: st.bold, text, maxWidth: width });
    });
  }
  return pages;
}

export function footerText(footer: string, page: number, total: number): string {
  return `${footer} — Page ${page} of ${total}`;
}

function canEncodeWith(font: PDFFont): (char: string) => boolean {
  return (char: string) => {
    try { font.encodeText(char); return true; } catch { return false; }
  };
}

/** Renders blocks to PDF bytes with pdf-lib. Rejects (never returns partial bytes) on failure. */
export async function renderPdf(input: PdfDocumentInput): Promise<Uint8Array> {
  const created = new Date(input.creationDate);
  if (Number.isNaN(created.getTime())) throw new Error('invalid creation date');
  const lib = await import('pdf-lib');
  const { PDFDocument, PDFName, StandardFonts } = lib;
  // updateMetadata:false: no library default Producer/Creator/dates; we set only what is listed below.
  const doc = await PDFDocument.create({ updateMetadata: false });
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const clean = sanitizer(canEncodeWith(regular));
  const measure: Measure = (text, size, isBold) => (isBold ? bold : regular).widthOfTextAtSize(text, size);
  const pages = layout(input.blocks.map(b => ({ kind: b.kind, text: clean(b.text) })), measure);
  const total = pages.length;
  const footer = clean(input.footer);
  // page.drawText names font resources with random suffixes, which would make output
  // nondeterministic; register fixed /F1 /F2 resources and emit text operators directly.
  const F1 = PDFName.of('F1'), F2 = PDFName.of('F2');
  const show = (text: string, x: number, y: number, size: number, isBold: boolean) => [
    lib.beginText(),
    lib.setFontAndSize(isBold ? F2 : F1, size),
    lib.moveText(x, y),
    lib.showText((isBold ? bold : regular).encodeText(text)),
    lib.endText(),
  ];
  pages.forEach((lines, i) => {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.node.setFontDictionary(F1, regular.ref);
    page.node.setFontDictionary(F2, bold.ref);
    page.pushOperators(
      lib.pushGraphicsState(),
      lib.setFillingGrayscaleColor(0),
      ...lines.flatMap(line => show(line.text, line.x, line.y, line.size, line.bold)),
      ...show(footerText(footer, i + 1, total), MARGIN, FOOTER_Y, FOOTER_SIZE, false),
      lib.popGraphicsState(),
    );
  });
  // Metadata: title, producer/creator and dates only. Never author, subject or keywords.
  doc.setTitle(clean(input.title));
  doc.setProducer('PathCheck');
  doc.setCreator('PathCheck');
  doc.setCreationDate(created);
  doc.setModificationDate(created);
  // Classic xref table (no object streams) so every offset is independently verifiable.
  return doc.save({ useObjectStreams: false });
}
