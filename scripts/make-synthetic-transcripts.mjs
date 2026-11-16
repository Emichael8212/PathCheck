#!/usr/bin/env node
// Writes the made-up transcript PDFs in synthetic/transcripts/ from the reader's answer
// kept beside each one, so that a PDF and its answer cannot drift apart.
//
// The layout copies the real unofficial transcript and none of its data: term headings,
// one line per course (prefix, number, description, attempted, earned, grade, points),
// the GPA totals and "Academic Standing" line under each term, and a transfer-credit
// section with its own totals. The student does not exist.
//
// Plain code, no dependency. The same answer always gives the same bytes: the PDF holds
// no date and no identifier, and its text is not compressed, so it can be read as text.
//
// usage: node scripts/make-synthetic-transcripts.mjs
import { Buffer } from 'node:buffer';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const MARK = 'SYNTHETIC - not a real transcript';
export const STUDENT = 'Sample Student';
export const STUDENT_ID = '000000000';
const DETAILS = 'PathCheck synthetic';
const LINES_PER_PAGE = 54;

const money = value => (value === '' || value === null || value === undefined ? '' : Number(value).toFixed(2));
const isCourse = row => /^[A-Za-z]{2,4}$/.test(String(row.prefix).trim()) && /^\d{3}$/.test(String(row.number).trim());
const sum = (rows, name) => rows.reduce((total, row) => total + (Number(row[name]) || 0), 0);

/** The lines of a transcript, as printed, from a reader's answer. */
export function linesFor(answer) {
  const courses = answer.rows.filter(isCourse);
  const terms = [...new Set(courses.map(row => row.term))];
  const lines = ['Unofficial Transcript', `Student: ${STUDENT}    ID: ${STUDENT_ID}`, ''];
  let points = 0;
  let hours = 0;
  for (const term of terms) {
    const rows = courses.filter(row => row.term === term);
    const transfer = rows.every(row => row.transfer === true);
    lines.push(term, 'Prefix Number Description                     Attempted  Earned  Grade  Points');
    for (const row of rows) {
      lines.push([
        String(row.prefix).trim().padEnd(6), String(row.number).trim().padEnd(6), String(row.description).padEnd(31),
        money(row.attempted).padStart(9), money(row.earned).padStart(8), `  ${String(row.grade ?? '').padEnd(5)}`, money(row.points).padStart(8),
      ].join(' ').trimEnd());
    }
    if (transfer) {
      lines.push(`Transfer Totals                                         ${money(sum(rows, 'earned')).padStart(8)}`, '');
      continue;
    }
    // A made-up grade point average: points over the hours that carry a letter grade.
    const graded = rows.filter(row => /^[A-F]$/.test(String(row.grade ?? '').trim()));
    const termHours = sum(graded, 'attempted');
    const termPoints = sum(graded, 'points');
    hours += termHours;
    points += termPoints;
    const average = (p, h) => (h === 0 ? 0 : p / h).toFixed(2);
    lines.push(
      `Term GPA ${average(termPoints, termHours)}`, 'Transfer Term GPA 0.00', `Combined GPA ${average(points, hours)}`,
      'Academic Standing: Good Standing', '',
    );
  }
  return lines;
}

const escaped = text => text.replace(/[\\()]/g, found => `\\${found}`);

/** A PDF of the transcript: one text block per page, in Courier, every page marked as synthetic. */
export function pdfFor(answer) {
  const lines = linesFor(answer);
  for (const line of lines) if (/[^\x20-\x7e]/.test(line)) throw new Error(`Only plain ASCII can be printed: ${line}`);
  const pages = [];
  for (let at = 0; at < lines.length; at += LINES_PER_PAGE) pages.push([MARK, '', ...lines.slice(at, at + LINES_PER_PAGE)]);

  // Objects: 1 catalog, 2 pages, 3 font, 4 details, then a page and its content for each page.
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
    `<< /Title (${DETAILS}) /Author (${DETAILS}) /Producer (${DETAILS}) /Creator (${DETAILS}) >>`,
  ];
  for (const [i, page] of pages.entries()) {
    const text = `BT\n/F1 9 Tf\n12 TL\n40 752 Td\n${page.map(line => `(${escaped(line)}) Tj T*`).join('\n')}\nET\n`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${6 + i * 2} 0 R >>`,
      `<< /Length ${text.length} >>\nstream\n${text}endstream`,
    );
  }

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const table = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${table}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const folder = new URL('../synthetic/transcripts/', import.meta.url);

/** Every made-up transcript: its name, its answer and the PDF that goes with it. */
export function transcripts() {
  return readdirSync(folder).filter(name => name.endsWith('.json')).sort().map(name => {
    const answer = JSON.parse(readFileSync(new URL(name, folder), 'utf8'));
    return { name: name.replace(/\.json$/, ''), answer, pdf: pdfFor(answer) };
  });
}

// Only when this file itself is what was run, never when it is imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const { name, pdf } of transcripts()) {
    writeFileSync(new URL(`${name}.pdf`, folder), pdf);
    console.log(`wrote synthetic/transcripts/${name}.pdf (${pdf.length} bytes)`);
  }
}
