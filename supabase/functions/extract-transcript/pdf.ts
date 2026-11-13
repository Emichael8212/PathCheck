import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef, ParseSpeeds } from 'pdf-lib';
import { ADMISSION_LIMITS } from '../../../src/contracts';
import type { PdfInspector } from './handler';

const invalid = (reasonCode: string) => ({ ok: false, code: 'validation_error', reasonCode } as const);
const name = PDFName.of;

/**
 * Structural preflight, not rendering, malware scanning or proof of extraction recall.
 * pdf-lib can repair broken files; require a complete envelope and validate its parsed
 * page tree independently rather than trusting /Count or recursive getPageCount().
 * The caller still owns the inspection deadline and an isolated runtime resource cap.
 */
export function createPdfInspector(): PdfInspector {
  return { async inspect(bytes) {
    if (bytes.byteLength === 0 || bytes.byteLength > ADMISSION_LIMITS.maxPdfBytes) return invalid('pdf_size_limit');
    const decoder = new TextDecoder('latin1');
    const header = decoder.decode(bytes.subarray(0, 16));
    if (!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(header)) return invalid('invalid_pdf_signature');
    const tail = decoder.decode(bytes.subarray(Math.max(0, bytes.length - 1024)));
    // PDF whitespace includes NUL; it is intentional in these byte-envelope checks.
    // eslint-disable-next-line no-control-regex
    const trailer = /startxref[\x00\t\n\f\r ]+(\d+)[\x00\t\n\f\r ]+%%EOF[\x00\t\n\f\r ]*$/.exec(tail);
    if (!trailer) return invalid('pdf_incomplete_envelope');
    const xrefOffset = Number(trailer[1]);
    if (!Number.isSafeInteger(xrefOffset) || xrefOffset < 9 || xrefOffset >= bytes.length) return invalid('pdf_invalid_xref');
    const xref = decoder.decode(bytes.subarray(xrefOffset, xrefOffset + 40));
    // eslint-disable-next-line no-control-regex -- PDF permits NUL whitespace.
    if (!/^(?:xref[\x00\t\n\f\r ]|\d+[\x00\t\n\f\r ]+\d+[\x00\t\n\f\r ]+obj\b)/.test(xref)) return invalid('pdf_invalid_xref');
    try {
      const document = await PDFDocument.load(bytes, {
        ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false, parseSpeed: ParseSpeeds.Slow,
      });
      if (document.isEncrypted || document.context.trailerInfo.Encrypt !== undefined) return invalid('pdf_encrypted');
      const context = document.context;
      const catalog = context.lookup(context.trailerInfo.Root);
      if (!(catalog instanceof PDFDict) || catalog.lookup(name('Type')) !== name('Catalog')) return invalid('pdf_invalid_catalog');
      const root = catalog.get(name('Pages'));
      const visited = new Set<PDFDict>();
      let pageCount = 0;
      let pageLimit = false;
      function countPages(ref: unknown, parent: PDFDict | null, depth: number): number {
        if (!(ref instanceof PDFRef) || depth > 32 || visited.size >= 256) throw new Error('page_tree_invalid');
        const node = context.lookup(ref);
        if (!(node instanceof PDFDict) || visited.has(node)) throw new Error('page_tree_invalid');
        visited.add(node);
        const parentRef = node.get(name('Parent'));
        if (parent ? !(parentRef instanceof PDFRef) || context.lookup(parentRef) !== parent : parentRef !== undefined) throw new Error('page_parent_invalid');
        const type = node.lookup(name('Type'));
        if (type === name('Page')) {
          if (!parent || node.has(name('Kids'))) throw new Error('page_tree_invalid');
          pageCount += 1;
          if (pageCount > ADMISSION_LIMITS.maxPages) { pageLimit = true; throw new Error('page_limit'); }
          return 1;
        }
        if (type !== name('Pages')) throw new Error('page_tree_invalid');
        const kids = node.lookup(name('Kids'));
        const declared = node.lookup(name('Count'));
        if (!(kids instanceof PDFArray) || !(declared instanceof PDFNumber)) throw new Error('page_tree_invalid');
        const expected = declared.asNumber();
        if (!Number.isSafeInteger(expected) || expected < 0) throw new Error('page_tree_invalid');
        if (expected > ADMISSION_LIMITS.maxPages || kids.size() > 256) { pageLimit = true; throw new Error('page_limit'); }
        let actual = 0;
        for (let i = 0; i < kids.size(); i += 1) actual += countPages(kids.get(i), node, depth + 1);
        if (actual !== expected) throw new Error('page_count_mismatch');
        return actual;
      }
      try {
        const rootNode = context.lookup(root);
        if (!(rootNode instanceof PDFDict) || rootNode.lookup(name('Type')) !== name('Pages')) return invalid('pdf_invalid_page_tree');
        countPages(root, null, 0);
      } catch { return invalid(pageLimit ? 'pdf_page_limit' : 'pdf_invalid_page_tree'); }
      if (pageCount === 0) return invalid('pdf_page_limit');
      return { ok: true, value: { pageCount } };
    } catch {
      // Never expose parser errors: exception text may contain input-derived data.
      return invalid('pdf_malformed_or_encrypted');
    }
  } };
}
