import { useId } from 'react';
import type { TermId } from '../../contracts';
import { ATTEMPT_STATUSES, STATUS_LABEL, validateRow } from '../rows';
import type { ManualRowDraft } from '../rows';
import { termKey, termLabel } from '../terms';

function RowEditor({ row, index, terms, courseCodes, showErrors, onChange, onRemove }: { row: ManualRowDraft; index: number; terms: TermId[]; courseCodes: string[]; showErrors: boolean; onChange: (row: ManualRowDraft) => void; onRemove: () => void }) {
  const base = useId();
  const errors = showErrors ? validateRow(row) : {};
  const set = <K extends keyof ManualRowDraft>(k: K, v: ManualRowDraft[K]) => onChange({ ...row, [k]: v });
  const field = (k: keyof ManualRowDraft) => ({ id: `${base}-${k}`, 'aria-invalid': errors[k] ? true : undefined, 'aria-describedby': errors[k] ? `${base}-${k}-err` : undefined });
  const err = (k: keyof ManualRowDraft) => errors[k] && <span className="field-error" id={`${base}-${k}-err`}>{errors[k]}</span>;
  return (
    <fieldset className="record-row" data-testid="record-row">
      <legend>Course attempt {index + 1}</legend>
      <div className="field"><label htmlFor={`${base}-courseCode`}>Course code</label>
        <input {...field('courseCode')} list={`${base}-codes`} value={row.courseCode} autoComplete="off" autoCapitalize="characters" spellCheck={false} translate="no" onChange={e => set('courseCode', e.target.value)} />
        <datalist id={`${base}-codes`}>{courseCodes.map(c => <option key={c} value={c} />)}</datalist>{err('courseCode')}</div>
      <div className="field"><label htmlFor={`${base}-title`}>Title (optional)</label><input {...field('title')} value={row.title} onChange={e => set('title', e.target.value)} /></div>
      <div className="field"><label htmlFor={`${base}-termKey`}>Term</label>
        <select {...field('termKey')} value={row.termKey} onChange={e => set('termKey', e.target.value)}>
          <option value="">Unknown</option>
          {terms.map(t => <option key={termKey(t)} value={termKey(t)}>{termLabel(t)}</option>)}
        </select></div>
      <div className="field"><label htmlFor={`${base}-status`}>Status</label>
        <select {...field('status')} value={row.status} onChange={e => set('status', e.target.value as ManualRowDraft['status'])}>
          <option value="">Choose…</option>
          {ATTEMPT_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>{err('status')}</div>
      <div className="field"><label htmlFor={`${base}-grade`}>Grade (optional)</label><input {...field('grade')} value={row.grade} onChange={e => set('grade', e.target.value)} />{err('grade')}</div>
      <div className="field"><label htmlFor={`${base}-attemptedCredits`}>Attempted credits</label><input {...field('attemptedCredits')} inputMode="decimal" value={row.attemptedCredits} onChange={e => set('attemptedCredits', e.target.value)} />{err('attemptedCredits')}</div>
      <div className="field"><label htmlFor={`${base}-earnedCredits`}>Earned credits</label><input {...field('earnedCredits')} inputMode="decimal" value={row.earnedCredits} onChange={e => set('earnedCredits', e.target.value)} />{err('earnedCredits')}</div>
      <div className="field"><label htmlFor={`${base}-institution`}>Transfer institution (blank if taken here)</label><input {...field('institution')} value={row.institution} onChange={e => set('institution', e.target.value)} /></div>
      <button type="button" className="danger" onClick={onRemove}>Remove attempt {index + 1}</button>
    </fieldset>
  );
}

export function ManualRecordEditor({ rows, terms, courseCodes, showErrors, onChange, onAdd }: { rows: ManualRowDraft[]; terms: TermId[]; courseCodes: string[]; showErrors: boolean; onChange: (rows: ManualRowDraft[]) => void; onAdd: () => void }) {
  return (
    <section aria-labelledby="manual-title" className="manual-entry" data-testid="manual-entry">
      <h2 id="manual-title">Enter courses manually</h2>
      <p className="meta">Add each attempt separately, including repeats. Unverified transfers and unknown grades stay unresolved — they are never counted silently.</p>
      {rows.map((row, i) => (
        <RowEditor key={row.rowId} row={row} index={i} terms={terms} courseCodes={courseCodes} showErrors={showErrors}
          onChange={next => onChange(rows.map(r => (r.rowId === row.rowId ? next : r)))}
          onRemove={() => onChange(rows.filter(r => r.rowId !== row.rowId))} />
      ))}
      <div className="button-row"><button type="button" className="secondary" onClick={onAdd}>Add course attempt</button></div>
    </section>
  );
}
