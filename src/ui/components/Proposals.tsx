import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { CandidatePreview, CatalogModel, GeneratedDraft, PlanPlacement, RuleFinding, TypedFailure } from '../../contracts';
import { assumptionText, courseCode, courseCredits, failureText, findingMark, findingScope, findingTitle, humanizeCode } from '../labels';
import { describeChanges, findingDelta, previewApplyBlock, previewNeedsAcknowledgement } from '../planView';
import { affectedTerms, changeSummary, previewHeadline, previewValidity, useNarrowLayout } from '../previewText';
import { termLabel } from '../terms';
import { FindingCard } from './Display';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Acknowledgements({ ids, checked, onChange, prefix, catalog }: { ids: string[]; checked: Set<string>; onChange: (next: Set<string>) => void; prefix: string; catalog: CatalogModel }) {
  if (ids.length === 0) return null;
  return (
    <fieldset className="acks">
      <legend>Confirm before applying</legend>
      {ids.map(a => (
        <label key={a} className="check">
          <input type="checkbox" checked={checked.has(a)} onChange={e => { const next = new Set(checked); if (e.target.checked) next.add(a); else next.delete(a); onChange(next); }} data-testid={`${prefix}-ack`} />
          <span>{assumptionText(a, catalog)}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** Heading that receives focus when its panel opens, so keyboard users land on it. */
function FocusHeading({ id, children }: { id: string; children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return <h2 id={id} ref={ref} tabIndex={-1}>{children}</h2>;
}

/** One engine candidate as a suggested fix with a single Preview control. */
export function CandidateFix({ candidate, catalog, active, onPreview, busy }: { candidate: CandidatePreview; catalog: CatalogModel; active: PlanPlacement[]; onPreview: (c: CandidatePreview) => void; busy: boolean }) {
  const rows = describeChanges(candidate, active);
  const summary = changeSummary(rows, catalog);
  return (
    <div className="fix" data-testid="candidate">
      <p className="fix-label">Suggested fix</p>
      <p className="fix-summary"><strong>{summary}</strong></p>
      <p className="fix-effect">{previewHeadline(candidate, findingDelta(candidate))}</p>
      <button type="button" className="secondary" disabled={busy} aria-label={`Preview: ${summary}`} onClick={() => onPreview(candidate)}>Preview</button>
    </div>
  );
}

function ImpactList({ title, findings, catalog, testId, tone }: { title: string; findings: RuleFinding[]; catalog: CatalogModel; testId: string; tone: 'resolved' | 'introduced' }) {
  if (findings.length === 0) return null;
  return (
    <div data-testid={testId} className={`impact-${tone}`}>
      <h3>{title}</h3>
      <ul>
        {findings.map(f => {
          const scope = findingScope(f, catalog);
          // Terms are part of the finding: a conflict that only moves term appears as
          // "resolved in Spring" and "introduced in Fall", never as two identical lines.
          return <li key={f.findingId}><span aria-hidden="true">{tone === 'resolved' ? '✓ ' : `${findingMark(f).icon} `}</span>{findingTitle(f.code)}{scope ? `: ${scope}` : ''}</li>;
        })}
      </ul>
    </div>
  );
}

/**
 * Wide screens: a non-modal glass panel over the inspector, so the semester list stays in view.
 * Narrow screens: a modal bottom sheet (native dialog: focus contained, background inert,
 * Escape = Cancel). Either way Cancel dispatches the existing reject command.
 */
function PreviewFrame({ sheet, busy, onCancel, headingRef, children }: { sheet: boolean; busy: boolean; onCancel: () => void; headingRef: RefObject<HTMLHeadingElement | null>; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialogRef.current;
    if (sheet && d && !d.open) d.showModal();
    // Desktop: bring the whole panel (including Apply/Cancel) into view, then focus its heading.
    if (!sheet) headingRef.current?.closest<HTMLElement>('[data-testid="preview-panel"]')?.scrollIntoView({ block: 'nearest' });
    headingRef.current?.focus({ preventScroll: !sheet });
  }, [sheet, headingRef]);
  const common = { className: `preview glass-panel${sheet ? ' preview-sheet' : ''}`, 'aria-labelledby': 'preview-title', 'data-testid': 'preview-panel' } as const;
  if (sheet) {
    return (
      <dialog ref={dialogRef} {...common}
        onCancel={e => { e.preventDefault(); if (!busy) onCancel(); }}
        // Chromium may close without a cancel event on a repeated Escape; treat it as Cancel.
        onClose={() => { if (!busy) onCancel(); }}>
        {children}
      </dialog>
    );
  }
  return <section {...common} onKeyDown={e => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onCancel(); } }}>{children}</section>;
}

const BLOCK_TEXT = {
  stale: 'Inputs changed after this preview was calculated, so it can’t be applied.',
  invalid: 'This change breaks a modeled rule, so it can’t be applied. Cancel and try a different change.',
  unresolved: 'This change depends on rules PathCheck can’t verify, so it can’t be applied from a preview. Cancel to keep your plan, or use Move or Remove directly to see what stays unresolved.',
} as const;

export function PreviewPanel({ preview, catalog, active, stale, busy, onApply, onCancel }: { preview: CandidatePreview; catalog: CatalogModel; active: PlanPlacement[]; stale: boolean; busy: boolean; onApply: (acks: string[]) => void; onCancel: () => void }) {
  const [acks, setAcks] = useState<Set<string>>(new Set());
  const sheet = useNarrowLayout();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const delta = findingDelta(preview);
  const ackReady = preview.assumptions.every(a => acks.has(a));
  const rows = describeChanges(preview, active);
  const block = previewApplyBlock(preview, stale);
  const terms = affectedTerms(rows);
  const applyHint = block ? 'preview-block' : !ackReady ? 'preview-ack-hint' : undefined;
  return (
    <PreviewFrame sheet={sheet} busy={busy} onCancel={onCancel} headingRef={headingRef}>
      <div className="preview-body">
        <p className="eyebrow">Preview · not applied</p>
        <h2 id="preview-title" ref={headingRef} tabIndex={-1}>{changeSummary(rows, catalog)}</h2>
        <p className="preview-terms" data-testid="preview-terms">{terms.length > 1 ? `Affects ${terms.slice(0, -1).join(', ')} and ${terms.at(-1)}` : terms.length === 1 ? `Affects ${terms[0]}` : 'Your plan is unchanged until you apply.'}</p>
        <table className="change-table" data-testid="change-table">
          <caption className="visually-hidden">Exact course and term changes</caption>
          <thead><tr><th scope="col">Course</th><th scope="col">Now</th><th scope="col">After</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <th scope="row"><span className="code">{courseCode(catalog, r.courseId)}</span> <span className="course-name">{catalog.courses[r.courseId]?.title ?? ''}</span>{courseCredits(catalog, r.courseId) !== null && <span className="visually-hidden">, {courseCredits(catalog, r.courseId)} credits</span>}</th>
                <td>{r.before ? termLabel(r.before) : 'Not planned'}</td>
                <td className="after">{r.after ? termLabel(r.after) : 'Removed'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="preview-status" data-testid="preview-status">
          <p className={`headline${preview.validabilityStatus === 'invalid' ? ' is-invalid' : ''}`}>{previewHeadline(preview, delta)}</p>
          <p className={preview.validabilityStatus === 'invalid' ? 'status-invalid' : 'muted'}>{previewValidity(preview)}</p>
        </div>
        <div className="impact" data-testid="preview-impact">
          <ImpactList title={`Resolves (${delta.resolved.length})`} findings={delta.resolved} catalog={catalog} testId="impact-resolved" tone="resolved" />
          <ImpactList title={`Adds (${delta.introduced.length})`} findings={delta.introduced} catalog={catalog} testId="impact-introduced" tone="introduced" />
          {delta.persisting.length > 0 && <p className="muted small">{plural(delta.persisting.length, 'issue')} unchanged.</p>}
        </div>
        {previewNeedsAcknowledgement(preview) && preview.assumptions.length === 0 && <p className="warning">This change is conditional on unverified evidence.</p>}
        {block !== 'invalid' && block !== 'unresolved' && <Acknowledgements ids={preview.assumptions} checked={acks} onChange={setAcks} prefix="preview" catalog={catalog} />}
        <p className="muted small">Your outlook updates after you apply.</p>
        {block && <p className="stale" role="alert" id="preview-block" data-testid="preview-block">{BLOCK_TEXT[block]}</p>}
        {!block && !ackReady && <p className="visually-hidden" id="preview-ack-hint">Confirm each assumption to enable Apply.</p>}
      </div>
      <div className="button-row preview-actions">
        <button type="button" disabled={busy || block !== null || !ackReady} aria-describedby={applyHint} onClick={() => onApply([...acks])}>Apply</button>
        <button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </PreviewFrame>
  );
}

export type DraftState =
  | { kind: 'draft'; draft: GeneratedDraft }
  | { kind: 'no_valid_draft'; expansions: number }
  /** A search job is running for `fingerprint`; `jobId` identifies exactly one request. */
  | { kind: 'generating'; jobId: number; fingerprint: string }
  /** Stopped before finishing: nothing was evaluated, no feasibility conclusion. */
  | { kind: 'interrupted'; reason: 'cancelled' | 'input_changed' | 'search_interrupted' }
  | { kind: 'failed'; failure: TypedFailure }
  | null;

const INTERRUPTED_TEXT: Record<Extract<DraftState, { kind: 'interrupted' }>['reason'], string> = {
  cancelled: 'You cancelled the search.',
  input_changed: 'Your plan inputs changed while it was running, so the search was stopped.',
  search_interrupted: 'The search was stopped before it finished.',
};

export function DraftPanel({ state, catalog, stale, busy, onAdopt, onDiscard, onRegenerate, onCancel }: { state: DraftState; catalog: CatalogModel; stale: boolean; busy: boolean; onAdopt: (acks: string[]) => void; onDiscard: () => void; onRegenerate: () => void; onCancel: () => void }) {
  const [acks, setAcks] = useState<Set<string>>(new Set());
  if (!state) return null;
  if (state.kind === 'generating') {
    return (
      <section className="draft insp-section" aria-labelledby="draft-title" aria-busy="true" data-testid="draft-panel">
        <FocusHeading id="draft-title">Building a draft plan…</FocusHeading>
        <p role="status" data-testid="draft-generating">Searching within fixed limits. Your active plan is unchanged; you can keep working or cancel.</p>
        <div className="button-row"><button type="button" className="secondary" onClick={onCancel}>Cancel search</button></div>
      </section>
    );
  }
  if (state.kind === 'interrupted') {
    return (
      <section className="draft insp-section" aria-labelledby="draft-title" data-testid="draft-panel">
        <FocusHeading id="draft-title">Search interrupted</FocusHeading>
        <p role="alert">{INTERRUPTED_TEXT[state.reason]} No draft was evaluated. No feasibility conclusion was drawn and your active plan is unchanged.</p>
        <div className="button-row"><button type="button" disabled={busy} onClick={onRegenerate}>Search again</button></div>
      </section>
    );
  }
  if (state.kind === 'failed') {
    return (
      <section className="draft insp-section" aria-labelledby="draft-title" data-testid="draft-panel">
        <FocusHeading id="draft-title">Draft plan not available</FocusHeading>
        <p role="alert">{failureText(state.failure)}</p>
        <div className="button-row"><button type="button" disabled={busy} onClick={onRegenerate}>Try again</button></div>
      </section>
    );
  }
  if (state.kind === 'no_valid_draft') {
    return (
      <section className="draft insp-section" aria-labelledby="draft-title" data-testid="draft-panel">
        <FocusHeading id="draft-title">No draft found within search limits</FocusHeading>
        <p>The bounded search stopped after <span className="tabular">{state.expansions}</span> expansions without a validated draft. This does not mean no university-approved path exists.</p>
        <div className="button-row"><button type="button" disabled={busy} onClick={onRegenerate}>Search again</button></div>
      </section>
    );
  }
  const { draft } = state;
  const ackReady = draft.assumptions.every(a => acks.has(a));
  const terms = new Set(draft.placements.map(p => p.termId.sortIndex)).size;
  const credits = draft.placements.map(p => courseCredits(catalog, p.courseId));
  const knownCredits = credits.reduce<number>((sum, c) => sum + (c ?? 0), 0);
  const unknownCredits = credits.filter(c => c === null).length;
  return (
    <section className="draft insp-section" aria-labelledby="draft-title" data-testid="draft-panel">
      <p className="eyebrow">Not adopted yet</p>
      <FocusHeading id="draft-title">Draft plan</FocusHeading>
      <p data-testid="draft-summary"><span className="tabular">{draft.placements.length}</span> courses across <span className="tabular">{terms}</span> terms, <span className="tabular">{knownCredits}</span> credits{unknownCredits > 0 ? ` plus ${unknownCredits} with unknown credits` : ''}. Shown as dashed <span className="tag tag-system_projection">Draft</span> rows. Nothing changes until you adopt it.</p>
      {draft.validation.length > 0 && <ul className="findings">{draft.validation.map(f => <FindingCard key={f.findingId} finding={f} catalog={catalog} />)}</ul>}
      <Acknowledgements ids={draft.assumptions} checked={acks} onChange={setAcks} prefix="draft" catalog={catalog} />
      {stale && <p className="stale" role="alert">Inputs changed after this draft was generated. Generate again before adopting.</p>}
      <div className="button-row">
        <button type="button" disabled={busy || stale || !ackReady} onClick={() => onAdopt([...acks])}>Adopt draft</button>
        <button type="button" className="secondary" disabled={busy} onClick={onDiscard}>Discard draft</button>
        {stale && <button type="button" className="secondary" disabled={busy} onClick={onRegenerate}>Generate again</button>}
      </div>
      <details className="disclosure-row">
        <summary>Search details</summary>
        <p className="small">One conditional draft from the bounded search: <span className="tabular">{draft.search.expansions}</span> expansions, stopped at {humanizeCode(draft.search.stopReason).toLowerCase()}. Adopted courses are marked “Suggested” so they stay distinct from your own selections.</p>
      </details>
    </section>
  );
}
