import type { AcademicRecord, CatalogModel, TermId, ValidatedExtractedRows } from '../contracts';
import { ManualRecordEditor } from '../ui/components/ManualRecordEditor';
import { TranscriptPanel } from '../ui/components/TranscriptPanel';
import { humanizeCode } from '../ui/labels';
import { STATUS_LABEL } from '../ui/rows';
import type { ManualRowDraft } from '../ui/rows';
import type { TranscriptPorts } from '../ui/services';
import { termLabel } from '../ui/terms';

export interface ProposedRecord { record: AcademicRecord; unmatched: string[]; warnings: string[] }

export interface AcademicRecordProps {
  catalog: CatalogModel;
  record: AcademicRecord;
  rows: ManualRowDraft[];
  recordTerms: TermId[];
  showErrors: boolean;
  dirty: boolean;
  proposed: ProposedRecord | null;
  extracted: ValidatedExtractedRows | null;
  transcript: TranscriptPorts | null;
  busy: boolean;
  onRows(rows: ManualRowDraft[]): void;
  onAddRow(): void;
  onReview(): void;
  onAccept(): void;
  onDiscardProposal(): void;
  onExtracted(rows: ValidatedExtractedRows): void;
  onDiscardExtraction(): void;
  onBack(): void;
  onContinue(): void;
}

const CONFIDENCE_LABEL: Record<AcademicRecord['courseAttempts'][number]['confidence'], string> = { reviewed: 'Reviewed', provisional: 'Provisional match', unresolved: 'Unresolved' };

export function AcademicRecordScreen(p: AcademicRecordProps) {
  const codes = Object.values(p.catalog.courses).map(c => c.displayCode).sort();
  const accepted = p.record.courseAttempts;
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  return (
    <section className="screen screen-narrow" aria-labelledby="record-title" data-testid="screen-record">
      <h1 id="record-title">Academic record</h1>
      <p className="lede">Enter the courses you have attempted, including repeats. You can continue with no courses if you are just starting.</p>
      <p className="meta" data-testid="accepted-record">{accepted.length === 0 ? 'No attempts accepted yet.' : `${n(accepted.length, 'attempt')} accepted (record revision ${p.record.recordRevision}).`}{p.record.unresolvedItems.length > 0 ? ` ${n(p.record.unresolvedItems.length, 'unresolved item')}.` : ''}</p>
      <ManualRecordEditor rows={p.rows} terms={p.recordTerms} courseCodes={codes} showErrors={p.showErrors} onChange={p.onRows} onAdd={p.onAddRow} />
      <TranscriptPanel ports={p.transcript} catalog={p.catalog} hasExtraction={p.extracted !== null} onValidated={p.onExtracted} onDiscard={p.onDiscardExtraction} />
      {p.extracted && <p className="meta" data-testid="extraction-included">{n(p.extracted.extraction.rows.length, 'extracted row')} will be reviewed together with your manual rows.</p>}
      <div className="button-row">
        <button type="button" disabled={p.busy || (p.rows.length === 0 && !p.extracted)} onClick={p.onReview}>Review record</button>
      </div>
      {p.proposed && (
        <section className="proposed" aria-labelledby="proposed-title" data-testid="proposed-record">
          <h2 id="proposed-title">Review before accepting</h2>
          <p>{n(p.proposed.record.courseAttempts.length, 'attempt')}. {p.proposed.unmatched.length > 0 ? `${p.proposed.unmatched.length} not matched to the catalog; kept as unresolved and not counted.` : 'All matched to catalog courses.'}</p>
          {p.proposed.warnings.map(w => <p key={w} className="warning">Warning: {humanizeCode(w)}</p>)}
          <ul className="attempts">
            {p.proposed.record.courseAttempts.map(a => (
              <li key={a.attemptId} data-testid="proposed-attempt">
                <strong translate="no">{a.rawCourseCode}</strong>
                <span>{a.term ? termLabel(a.term) : 'Term unknown'}</span>
                <span className="muted">{STATUS_LABEL[a.status]}</span>
                {a.normalizedCourseId ? <span className="badge">Matched {a.normalizedCourseId}</span> : <span className="badge badge-unresolved">Unmatched, unresolved</span>}
                <span className="badge">{CONFIDENCE_LABEL[a.confidence]}</span>
                {a.origin === 'transcript_proposal' && <span className="badge">From transcript</span>}
                {a.origin === 'transfer' && <span className="badge badge-unresolved">Transfer</span>}
              </li>
            ))}
          </ul>
          <div className="button-row">
            <button type="button" disabled={p.busy} onClick={p.onAccept}>Accept this record</button>
            <button type="button" className="secondary" disabled={p.busy} onClick={p.onDiscardProposal}>Keep editing</button>
          </div>
        </section>
      )}
      {p.dirty && <p className="warning" role="note" data-testid="record-dirty">You have edits that are not reviewed and accepted yet.</p>}
      <div className="button-row actions-end">
        <button type="button" disabled={p.busy || p.dirty || p.proposed !== null} onClick={p.onContinue}>Continue to planner</button>
        <button type="button" className="secondary" onClick={p.onBack}>Back</button>
      </div>
    </section>
  );
}
