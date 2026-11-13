import type { ProposedRow, TranscriptExtraction } from '../../../src/contracts';
/** Fictional records only. This is not an ASU curriculum guide or a student transcript. */
export function row(overrides: Partial<ProposedRow> = {}): ProposedRow {
  return { rowId: 'row-1', rawCourseCode: 'SYN 101', rawTitle: 'Synthetic Foundations', rawTerm: 'Fall 2024', rawAttemptedCredits: '3', rawEarnedCredits: '3', rawGrade: 'A', rawStatus: 'completed', rawInstitution: 'Synthetic University', provisionalCourseId: null, provenance: [{ field: 'code', page: 1, row: 1, quote: null }], uncertainty: [], ...overrides };
}
export function extraction(overrides: Partial<TranscriptExtraction> = {}): TranscriptExtraction {
  return { schemaVersion: 1, documentPageCount: 1, detectedRowCount: 1, rows: [row()], coveredPages: [1], unrecognizedRows: [], warnings: [], completeness: 'unknown', acceptanceStatus: 'needs_review', modelId: 'synthetic-model', extractionSchemaVersion: 1, ...overrides };
}
/** Distinct labeled raw-row cases; actual PDF/provider benchmark remains separately tracked. */
export const labeledCases = [
  { name: 'completed', rows: [row()] },
  { name: 'failed', rows: [row({ rawGrade: 'F', rawEarnedCredits: '0', rawStatus: 'failed' })] },
  { name: 'withdrawn', rows: [row({ rawGrade: 'W', rawEarnedCredits: '0', rawStatus: 'withdrawn' })] },
  { name: 'in-progress', rows: [row({ rawGrade: null, rawEarnedCredits: null, rawStatus: 'in progress' })] },
  { name: 'incomplete', rows: [row({ rawGrade: 'I', rawEarnedCredits: null, rawStatus: 'incomplete' })] },
  { name: 'unknown-grade', rows: [row({ rawGrade: 'XY', uncertainty: ['grade_unclear'] })] },
  { name: 'ambiguous-credits', rows: [row({ rawAttemptedCredits: '3?', rawEarnedCredits: null })] },
  { name: 'transfer', rows: [row({ rawInstitution: 'Fictional Transfer College', rawCourseCode: 'EXT 209', rawStatus: 'transfer pending' })] },
  { name: 'unmapped', rows: [row({ rawCourseCode: 'ZZZ 999' })] },
  { name: 'repeat', rows: [row({ rawGrade: 'F', rawEarnedCredits: '0' }), row({ rowId: 'repeat-2', rawTerm: 'Spring 2025' })] },
  { name: 'null-term', rows: [row({ rawTerm: null })] },
  { name: 'fractional-credits', rows: [row({ rawAttemptedCredits: '1.5', rawEarnedCredits: '1.5' })] },
  { name: 'attempted-v-earned', rows: [row({ rawAttemptedCredits: '4', rawEarnedCredits: '0', rawGrade: 'W' })] },
  { name: 'order-permutation', rows: [row({ rowId: 'later', rawTerm: 'Spring 2025' }), row({ rowId: 'earlier', rawTerm: 'Fall 2024' })] },
  { name: 'page-two', rows: [row(), row({ rowId: 'page2', provenance: [{ field: 'code', page: 2, row: 1, quote: null }] })] },
];
