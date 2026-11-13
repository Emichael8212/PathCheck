import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { TermId } from '../../contracts';
import { GRADE_NOTE_CODES, recordNote } from '../labels';
import { ATTEMPT_STATUSES, STATUS_LABEL, validateRow } from '../rows';
import type { ManualRowDraft } from '../rows';
import { termFromIndex, termKey, termLabel } from '../terms';

const gradeNotes = (m: RowMatch) => m.notes.filter(n => GRADE_NOTE_CODES.has(n));

/** Per-row result of E's normalization, as shown in the Match column. */
export type RowMatch = { state: 'matched' | 'unmatched' | 'pending' | 'incomplete'; notes: string[] };
export interface CatalogOption { code: string; title: string }

/**
 * Catalog search for the Course code field (ARIA 1.2 combobox). Free text stays allowed:
 * transfer and unknown codes are raw input that E keeps unresolved; the list only helps typing.
 */
function CourseCodeInput({ id, value, options, invalid, describedBy, onChange, onBlur }: { id: string; value: string; options: CatalogOption[]; invalid: boolean; describedBy: string | undefined; onChange: (v: string) => void; onBlur: () => void }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const q = value.trim().toLowerCase();
  const hits = q.length === 0 ? [] : options.filter(o => o.code.toLowerCase().includes(q) || o.title.toLowerCase().includes(q)).slice(0, 8);
  const exact = hits.length === 1 && hits[0]!.code.toLowerCase() === q;
  const shown = open && hits.length > 0 && !exact;
  const pick = (o: CatalogOption) => { onChange(o.code); setOpen(false); setActive(-1); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(hits.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && shown && active >= 0 && hits[active]) { e.preventDefault(); pick(hits[active]!); }
    else if (e.key === 'Escape' && shown) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  };
  return (
    <div className="combo">
      <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={shown} aria-controls={listId} aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined} aria-describedby={describedBy} value={value} autoComplete="off" autoCapitalize="characters" spellCheck={false} translate="no"
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(-1); }} onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); onBlur(); }} onKeyDown={onKey} />
      <ul id={listId} role="listbox" aria-label="Catalog courses" className="combo-list glass" hidden={!shown}>
        {hits.map((o, i) => (
          <li key={o.code} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={i === active ? 'is-active' : undefined}
            onMouseDown={e => e.preventDefault()} onClick={() => pick(o)}>
            <span className="code">{o.code}</span> <span className="muted">{o.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MatchCell({ match, showErrors }: { match: RowMatch; showErrors: boolean }) {
  const notes = match.notes.length > 0 ? ` · ${match.notes.length} note${match.notes.length === 1 ? '' : 's'}` : '';
  switch (match.state) {
    case 'matched': return <span className="match match-ok" title="The course code was found in this catalog. This doesn’t confirm a passing grade, credit or degree requirement."><span aria-hidden="true">✓ </span>In catalog{notes}</span>;
    case 'unmatched': return <span className="match match-warn"><span aria-hidden="true">⚠ </span>Not in this catalog{notes}</span>;
    case 'pending': return <span className="match match-pending">Checking…</span>;
    default: return <span className={`match ${showErrors ? 'match-error' : 'match-pending'}`}><span aria-hidden="true">◌ </span>{showErrors ? 'Needs a fix' : 'Incomplete'}</span>;
  }
}

function RowEditor({ row, index, terms, options, showErrors, focusFirstError, match, onChange, onRemove, onDone }: { row: ManualRowDraft; index: number; terms: TermId[]; options: CatalogOption[]; showErrors: boolean; focusFirstError: number; match: RowMatch; onChange: (row: ManualRowDraft) => void; onRemove: () => void; onDone: () => void }) {
  const base = useId();
  const ref = useRef<HTMLDivElement>(null);
  // A field's error shows after the student has typed in it and left it, or after a refused Accept.
  const [touched, setTouched] = useState<Set<keyof ManualRowDraft>>(new Set());
  const [edited, setEdited] = useState<Set<keyof ManualRowDraft>>(new Set());
  const all = validateRow(row);
  const visible = (k: keyof ManualRowDraft) => (showErrors || (touched.has(k) && edited.has(k))) && all[k];
  const set = <K extends keyof ManualRowDraft>(k: K, v: ManualRowDraft[K]) => { setEdited(e => (e.has(k) ? e : new Set(e).add(k))); onChange({ ...row, [k]: v }); };
  const blur = (k: keyof ManualRowDraft) => () => setTouched(t => (t.has(k) ? t : new Set(t).add(k)));
  const field = (k: keyof ManualRowDraft) => ({ id: `${base}-${k}`, 'aria-invalid': visible(k) ? true : undefined, 'aria-describedby': visible(k) ? `${base}-${k}-err` : undefined, onBlur: blur(k) });
  const err = (k: keyof ManualRowDraft) => visible(k) && <span className="field-error" id={`${base}-${k}-err`}>{all[k]}</span>;
  useEffect(() => {
    if (focusFirstError > 0) ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusFirstError]);
  const label = row.courseCode.trim() || `course attempt ${index + 1}`;
  return (
    <div className="row-editor" ref={ref} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onDone(); } }}>
      <div className="editor-grid">
        <div className="field field-code"><label htmlFor={`${base}-courseCode`}>Course code</label>
          <CourseCodeInput id={`${base}-courseCode`} value={row.courseCode} options={options} invalid={Boolean(visible('courseCode'))} describedBy={visible('courseCode') ? `${base}-courseCode-err` : undefined}
            onChange={v => set('courseCode', v)} onBlur={blur('courseCode')} />{err('courseCode')}</div>
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
        <div className="field"><label htmlFor={`${base}-attemptedCredits`}>Attempted credits</label><input {...field('attemptedCredits')} inputMode="decimal" value={row.attemptedCredits} onChange={e => set('attemptedCredits', e.target.value)} />{err('attemptedCredits')}</div>
        <div className="field"><label htmlFor={`${base}-earnedCredits`}>Earned credits</label><input {...field('earnedCredits')} inputMode="decimal" value={row.earnedCredits} onChange={e => set('earnedCredits', e.target.value)} />{err('earnedCredits')}</div>
        <div className="field"><label htmlFor={`${base}-grade`}>Grade (optional)</label><input {...field('grade')} value={row.grade} onChange={e => set('grade', e.target.value)} />{err('grade')}</div>
      </div>
      <details className="disclosure-row" open={row.institution !== '' || row.title !== '' || undefined}>
        <summary>Transfer course or title</summary>
        <div className="editor-grid editor-grid-2">
          <div className="field"><label htmlFor={`${base}-institution`}>Transfer institution</label><input {...field('institution')} aria-describedby={`${base}-inst-hint`} value={row.institution} onChange={e => set('institution', e.target.value)} /><span className="hint" id={`${base}-inst-hint`}>Leave blank if taken here.</span></div>
          <div className="field"><label htmlFor={`${base}-title`}>Title (optional)</label><input {...field('title')} value={row.title} onChange={e => set('title', e.target.value)} /></div>
        </div>
      </details>
      {match.notes.length > 0 && <ul className="row-notes" aria-label="Notes from matching">{match.notes.map(n => <li key={n}>{recordNote(n)}</li>)}</ul>}
      <div className="button-row">
        <button type="button" className="secondary" onClick={onDone}>Done</button>
        <button type="button" className="danger" aria-label={`Remove ${label}`} onClick={onRemove}>Remove</button>
      </div>
    </div>
  );
}

/**
 * Compact record list: one line per attempt, one inline editor at a time. Values stay raw;
 * E's normalizeAttempts alone interprets them (see rows.ts).
 */
export function ManualRecordEditor({ rows, terms, options, showErrors, errorSignal, matchFor, onChange, onAdd }: { rows: ManualRowDraft[]; terms: TermId[]; options: CatalogOption[]; showErrors: boolean; errorSignal: number; matchFor: (row: ManualRowDraft) => RowMatch; onChange: (rows: ManualRowDraft[]) => void; onAdd: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [focusSignal, setFocusSignal] = useState(0);
  const [seenCount, setSeenCount] = useState(rows.length);
  const [seenSignal, setSeenSignal] = useState(errorSignal);
  const [focusRow, setFocusRow] = useState<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  // State adjusted during render (React's documented pattern), not in effects:
  // a newly added attempt opens for editing...
  if (rows.length !== seenCount) {
    setSeenCount(rows.length);
    const last = rows.at(-1);
    if (rows.length > seenCount && last) { setOpenId(last.rowId); setFocusRow(last.rowId); }
  }
  // ...and a refused Accept opens the first invalid attempt and focuses its first invalid field.
  if (errorSignal !== seenSignal) {
    setSeenSignal(errorSignal);
    const bad = rows.find(r => Object.keys(validateRow(r)).length > 0);
    if (bad) { setOpenId(bad.rowId); setFocusSignal(s => s + 1); }
  }
  useEffect(() => {
    if (focusRow) document.querySelector<HTMLElement>(`[data-row="${focusRow}"] [role="combobox"]`)?.focus();
  }, [focusRow]);

  return (
    <section aria-labelledby="manual-title" className="record-card" data-testid="manual-entry">
      <div className="card-head">
        <h2 id="manual-title">Your courses{rows.length > 0 && <span className="count"><span className="visually-hidden">: </span>{rows.length}</span>}</h2>
        {rows.length > 0 && <button type="button" className="secondary" ref={addRef} onClick={onAdd}>Add course attempt</button>}
      </div>
      {rows.length === 0 ? (
        <div className="empty" data-testid="record-empty">
          <h3>No courses entered</h3>
          <p>Add each course you’ve taken, including repeats and transfers. Just starting? You can continue with an empty record.</p>
          <button type="button" ref={addRef} onClick={onAdd}>Add course attempt</button>
        </div>
      ) : (
        <>
          <div className="record-cols" aria-hidden="true"><span>Course</span><span>Term</span><span>Status</span><span>Grade</span><span className="r">Credits</span><span>Catalog match</span><span /></div>
          <ul className="record-list">
            {rows.map((row, i) => {
              const open = openId === row.rowId;
              const match = matchFor(row);
              const code = row.courseCode.trim();
              const label = code || `course attempt ${i + 1}`;
              const option = options.find(o => o.code.toLowerCase() === code.toLowerCase());
              return (
                <li key={row.rowId} className={`record-row${open ? ' is-open' : ''}`} data-testid="record-row" data-row={row.rowId}>
                  <div className="record-line">
                    <span className="r-course"><span className="code" translate="no">{code || 'New course'}</span>{(row.title || option?.title) && <span className="muted"> {row.title || option?.title}</span>}{row.institution && <span className="small"> · Transfer · {row.institution}</span>}</span>
                    <span className="r-term">{row.termKey ? termLabel(termFromIndex(Number(row.termKey))) : 'Term unknown'}</span>
                    <span className="r-status">{row.status ? STATUS_LABEL[row.status] : '—'}</span>
                    <span className="r-grade">{gradeNotes(match).length > 0
                      ? <span className="grade-warn" title={gradeNotes(match).map(recordNote).join(' ')}><span aria-hidden="true">⚠ </span>{row.grade || '—'}<span className="visually-hidden">: {gradeNotes(match).map(recordNote).join(' ')}</span></span>
                      : (row.grade || '—')}</span>
                    <span className="r-credits tabular">{row.attemptedCredits || '—'} / {row.earnedCredits || '—'}</span>
                    <span className="r-match"><MatchCell match={match} showErrors={showErrors} /></span>
                    <span className="r-edit">
                      <button type="button" className="link" aria-expanded={open} aria-label={`${open ? 'Close' : 'Edit'} ${label}`} onClick={() => setOpenId(open ? null : row.rowId)}>{open ? 'Close' : 'Edit'}</button>
                    </span>
                  </div>
                  {open && (
                    <RowEditor row={row} index={i} terms={terms} options={options} showErrors={showErrors} focusFirstError={focusSignal} match={match}
                      onChange={next => onChange(rows.map(r => (r.rowId === row.rowId ? next : r)))}
                      onRemove={() => { onChange(rows.filter(r => r.rowId !== row.rowId)); setOpenId(null); addRef.current?.focus(); }}
                      onDone={() => { setOpenId(null); setTimeout(() => document.querySelector<HTMLElement>(`[data-row="${row.rowId}"] .r-edit button`)?.focus(), 0); }} />
                  )}
                </li>
              );
            })}
          </ul>
          <p className="record-note">“In catalog” means the course code was found in this catalog. It doesn’t confirm a passing grade, credit or degree requirement; the planner checks those.</p>
        </>
      )}
    </section>
  );
}
