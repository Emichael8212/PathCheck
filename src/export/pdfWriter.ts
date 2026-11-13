// PDF writer entry point. The renderer (./pdfRender) and the maintained pdf-lib library
// (DEP-002) are loaded lazily on export, so both ship in one separate chunk and none of
// the layout/rendering code sits in the main chunk. Keep this module free of value
// imports from ./pdfRender or pdf-lib.

export type BlockKind = 'title' | 'heading' | 'text' | 'small' | 'bullet' | 'spacer';
export interface Block { kind: BlockKind; text: string }
export interface PdfDocumentInput { title: string; creationDate: string; blocks: Block[]; footer: string }

/** Renders blocks to PDF bytes with pdf-lib. Rejects (never returns partial bytes) on failure. */
export async function renderPdf(input: PdfDocumentInput): Promise<Uint8Array> {
  const created = new Date(input.creationDate);
  if (Number.isNaN(created.getTime())) throw new Error('invalid creation date');
  const { renderWithPdfLib } = await import('./pdfRender');
  return renderWithPdfLib(input, created);
}
