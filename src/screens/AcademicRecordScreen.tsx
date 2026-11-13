import type { AcademicRecord, CatalogModel, TermId, ValidatedExtractedRows } from '../contracts';
import { ManualRecordEditor } from '../ui/components/ManualRecordEditor';
import type { CatalogOption, RowMatch } from '../ui/components/ManualRecordEditor';
import { TranscriptPanel } from '../ui/components/TranscriptPanel';
import { validateRow } from '../ui/rows';
import type { ManualRowDraft } from '../ui/rows';
import type { TranscriptPorts } from '../ui/services';

export interface ProposedRecord { record: AcademicRecord; unmatched: string[]; warnings: string[] }

export interface AcademicRecordProps {
  catalog: CatalogModel;
  record: AcademicRecord;
  rows: ManualRowDraft[];
  recordTerms: TermId[];
  showErrors: boolean;
  /** Increments each time an Accept is refused for invalid rows. */
  errorSignal: number;
  dirty: boolean;
  /** Latest automatic normalization of the current rows by E; null while pending or invalid. */
  proposed: ProposedRecord | null;
  matchFor(row: ManualRowDraft): RowMatch;
  extracted: ValidatedExtractedRows | null;
  transcript: TranscriptPorts | null;
  busy: boolean;
  onRows(rows: ManualRowDraft[]): void;
  onAddRow(): void;
  /** Explicit acceptance (L acceptRecord) followed by navigation to the planner. */
  onAcceptAndContinue(): void;
  onExtracted(rows: ValidatedExtractedRows): void;
  onDiscardExtraction(): void;
  onBack(): void;
  onContinue(): void;
}

const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** One-line status for the action bar, built only from validation and E's normalization output. */
function recordSummary(p: AcademicRecordProps): string {
  if (!p.dirty) {
    const accepted = p.record.courseAttempts.length;
    if (accepted === 0) return 'No courses in your record. Starting fresh? Continue with an empty record.';
    const unresolved = p.record.unresolvedItems.length;
    return `${n(accepted, 'course')} in your record.${unresolved ? ` ${n(unresolved, 'item')} unresolved and not counted.` : ''}`;
  }
  const invalid = p.rows.filter(r => Object.keys(validateRow(r)).length > 0).length;
  if (invalid > 0) return `Complete ${n(invalid, 'course')} to continue.`;
  if (!p.proposed) return 'Checking your courses…';
  const total = p.proposed.record.courseAttempts.length;
  const unmatched = p.proposed.unmatched.length;
  if (total === 0) return 'Your record will be empty.';
  return `${n(total, 'course')} checked. ${unmatched === 0 ? 'All match this catalog.' : `${unmatched} ${unmatched === 1 ? 'isn’t' : 'aren’t'} in this catalog and won’t count until resolved.`}`;
}

export function AcademicRecordScreen(p: AcademicRecordProps) {
  const options: CatalogOption[] = Object.values(p.catalog.courses).map(c => ({ code: c.displayCode, title: c.title })).sort((a, b) => a.code.localeCompare(b.code));
  return (
    <section className="screen record" aria-labelledby="record-title" data-testid="screen-record">
      <header className="screen-head">
        <h1 id="record-title">Academic record</h1>
        <p className="lede">Courses you’ve taken, including repeats and transfers.</p>
      </header>
      <div className="record-grid">
        <div className="record-main">
          <ManualRecordEditor rows={p.rows} terms={p.recordTerms} options={options} showErrors={p.showErrors} errorSignal={p.errorSignal} matchFor={p.matchFor} onChange={p.onRows} onAdd={p.onAddRow} />
          {p.extracted && <p className="small" data-testid="extraction-included">{n(p.extracted.extraction.rows.length, 'extracted row')} will be checked together with your manual rows.</p>}
          <div className="action-bar glass" role="region" aria-label="Record status">
            <p className="action-summary" data-testid="record-summary">{recordSummary(p)}</p>
            <div className="button-row">
              <button type="button" className="link" onClick={p.onBack}>Back</button>
              {p.dirty
                ? <button type="button" disabled={p.busy} onClick={p.onAcceptAndContinue}>Accept and continue</button>
                : <button type="button" disabled={p.busy} onClick={p.onContinue}>Continue to planner</button>}
            </div>
          </div>
        </div>
        <aside className="record-side" aria-label="Transcript import and counting rules">
          <TranscriptPanel ports={p.transcript} catalog={p.catalog} hasExtraction={p.extracted !== null} onValidated={p.onExtracted} onDiscard={p.onDiscardExtraction} />
          <section className="side-card" aria-labelledby="count-title">
            <h2 id="count-title" className="insp-title">How courses count</h2>
            <p className="small">Unverified transfers, unmatched codes and unknown grades stay unresolved and don’t count automatically.</p>
          </section>
        </aside>
      </div>
    </section>
  );
}
