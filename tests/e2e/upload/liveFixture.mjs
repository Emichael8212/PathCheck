import { createHash } from 'node:crypto';
import { PDFDocument, PDFName, StandardFonts, beginText, endText, setFontAndSize, moveText, showText } from 'pdf-lib';

export const fixtureId = 'live-upload-syn101-v1';
// Independent labeled input, never substituted for a provider response.
export const expectedAttempt = Object.freeze({ rawCourseCode: 'SYN 101', rawTitle: 'Synthetic Foundations',
  rawTerm: 'Fall 2026', rawAttemptedCredits: '3', rawEarnedCredits: '3', rawGrade: 'B', rawStatus: 'completed' });
export async function createLiveFixture() {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setCreationDate(new Date('2026-01-01T00:00:00Z')); doc.setModificationDate(new Date('2026-01-01T00:00:00Z'));
  doc.setTitle('SYNTHETIC PathCheck academic record - no student data');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([792, 612]);
  const fontName = PDFName.of('F1'); page.node.setFontDictionary(fontName, font.ref);
  const text = (value, x, y, size = 10) => page.pushOperators(beginText(), setFontAndSize(fontName, size), moveText(x, y), showText(font.encodeText(value)), endText());
  text('SYNTHETIC ACADEMIC RECORD - NOT A UNIVERSITY TRANSCRIPT', 28, 565, 14);
  text(`Fixture: ${fixtureId} | Page 1 of 1 | No student identifiers`, 28, 540);
  text('Exactly one course attempt. Blank institution is unknown. Preserve printed values.', 28, 520);
  const headings = ['Course', 'Title', 'Term', 'Attempted', 'Earned', 'Grade', 'Status'];
  const positions = [28, 102, 270, 365, 445, 515, 570];
  headings.forEach((value, i) => text(value, positions[i], 475));
  Object.values(expectedAttempt).forEach((value, i) => text(value, positions[i], 447));
  const bytes = await doc.save({ useObjectStreams: false });
  return { bytes, digest: createHash('sha256').update(bytes).digest('hex'), fixtureId };
}
