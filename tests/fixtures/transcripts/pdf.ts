import { PDFDocument, StandardFonts } from 'pdf-lib';

/** Runtime-only synthetic documents; no student document or personal identifier. */
export async function generatedPdf(pageCount: number, objectStreams = true): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i += 1) {
    const page = doc.addPage([612, 792]);
    page.drawText(`SYNTHETIC PARSER FIXTURE - PAGE ${i + 1}`, { x: 40, y: 740, size: 12, font });
    page.drawText('Not a student record. Not an extraction benchmark.', { x: 40, y: 720, size: 10, font });
  }
  return doc.save({ useObjectStreams: objectStreams, addDefaultPage: false });
}

/** Hand-authored independent PDF 1.4 objects with byte-correct xref offsets. */
export function objectPdf(objects: string[], trailerExtra = ''): Uint8Array {
  let text = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, i) => { offsets.push(text.length); text += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  text += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailerExtra} >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(text);
}

export const basicObjects = () => [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
];

export function encryptedTrailerPdf(): Uint8Array {
  // Standard-security dictionary, with no content streams requiring encryption.
  // This negative tests the encrypted-document marker, not password recovery.
  return objectPdf([...basicObjects(), '<< /Filter /Standard /V 1 /R 2 /O <' + '00'.repeat(32) + '> /U <' + '00'.repeat(32) + '> /P -4 >>'], '/Encrypt 4 0 R /ID [<00112233445566778899aabbccddeeff> <00112233445566778899aabbccddeeff>]');
}
