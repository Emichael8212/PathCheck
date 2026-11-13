import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CandidatePreview, CatalogModel, GeneratedDraft, PlanPlacement, RuleFinding, TypedFailure } from '../../contracts';
import { courseCode, courseCredits, failureText, findingClass, humanizeCode } from '../labels';
import { describeChanges, findingDelta, previewNeedsAcknowledgement } from '../planView';
import { termLabel } from '../terms';
import { FindingCard } from './Display';

const BENEFIT: Record<CandidatePreview['benefitClass'], string> = { improved: 'Resolves known issues', tradeoff: 'Tradeoff: fixes some issues and may introduce others', no_valid_alternative: 'No validated alternative found in bounded search' };
const VALIDITY: Record<CandidatePreview['validabilityStatus'], string> = { valid: 'Valid under modeled rules', conditional: 'Conditional on stated assumptions', invalid: 'Invalid under modeled rules', unresolved: 'Unresolved: depends on unknown policy' };

function Acknowledgements({ ids, checked, onChange, prefix }: { ids: string[]; checked: Set<string>; onChange: (next: Set<string>) => void; prefix: string }) {
  if (ids.length === 0) return null;
  return (
    <fieldset className="acks">
      <legend>Confirm the assumptions this depends on</legend>
      {ids.map(a => (
        <label key={a} className="check">
          <input type="checkbox" checked={checked.has(a)} onChange={e => { const next = new Set(checked); if (e.target.checked) next.add(a); else next.delete(a); onChange(next); }} data-testid={`${prefix}-ack`} />
          <span>{humanizeCode(a)}</span>
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

export function CandidateList({ candidates, catalog, active, onPreview, busy }: { candidates: CandidatePreview[]; catalog: CatalogModel; active: PlanPlacement[]; onPreview: (c: CandidatePreview) => void; busy: boolean }) {
  if (candidates.length === 0) return null;
  return (
    <section aria-labelledby="cand-title" data-testid="candidates">
      <h2 id="cand-title" tabIndex={-1}>Suggested changes</h2>
      <ul className="candidates">
        {candidates.map(c => {
          const rows = describeChanges(c, active);
          const summary = rows.map(r => `${r.verb} ${courseCode(catalog, r.courseId)}${r.after ? ` to ${termLabel(r.after)}` : ''}`).join('; ');
          return (
            <li key={c.previewId} data-testid="candidate">
              <span><strong>{summary}</strong><br /><span className="meta">{BENEFIT[c.benefitClass]}</span></span>
              <button type="button" className="secondary" disabled={busy} aria-label={`Preview: ${summary}`} onClick={() => onPreview(c)}>Preview</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ImpactList({ title, findings, catalog, testId }: { title: string; findings: RuleFinding[]; catalog: CatalogModel; testId: string }) {
  if (findings.length === 0) return null;
  return (
    <div data-testid={testId}>
      <h3>{title}</h3>
      <ul>
        {findings.map(f => {
          const cls = findingClass(f);
          return <li key={f.findingId}><span className={`badge badge-${cls.tone}`}>{cls.label}</span> {humanizeCode(f.code)}{f.courseIds.length > 0 ? `: ${f.courseIds.map(id => courseCode(catalog, id)).join(', ')}` : ''}</li>;
        })}
      </ul>
    </div>
  );
}

export function PreviewPanel({ preview, catalog, active, stale, busy, onApply, onCancel }: { preview: CandidatePreview; catalog: CatalogModel; active: PlanPlacement[]; stale: boolean; busy: boolean; onApply: (acks: string[]) => void; onCancel: () => void }) {
  const [acks, setAcks] = useState<Set<string>>(new Set());
  const delta = findingDelta(preview);
  const ackReady = preview.assumptions.every(a => acks.has(a));
  const rows = describeChanges(preview, active);
  return (
    <section className="preview" aria-labelledby="preview-title" data-testid="preview-panel"
      onKeyDown={e => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onCancel(); } }}>
      <div className="preview-head">
        <FocusHeading id="preview-title">Preview change</FocusHeading>
        <span className="meta">Not applied. Your plan is unchanged.</span>
      </div>
      <table className="change-table" data-testid="change-table">
        <caption className="visually-hidden">Exact course and term changes</caption>
        <thead><tr><th scope="col">Course</th><th scope="col">Now</th><th scope="col">After</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <th scope="row"><span className="code">{courseCode(catalog, r.courseId)}</span> <span className="course-name">{catalog.courses[r.courseId]?.title ?? ''}</span></th>
              <td>{r.before ? termLabel(r.before) : 'Not planned'}</td>
              <td className="after">{r.after ? termLabel(r.after) : 'Removed'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p><strong>{BENEFIT[preview.benefitClass]}.</strong> <span className="muted">{VALIDITY[preview.validabilityStatus]}.</span></p>
      <div className="impact" data-testid="preview-impact">
        <ImpactList title={`Resolves (${delta.resolved.length})`} findings={delta.resolved} catalog={catalog} testId="impact-resolved" />
        <ImpactList title={`Introduces (${delta.introduced.length})`} findings={delta.introduced} catalog={catalog} testId="impact-introduced" />
        {delta.resolved.length === 0 && delta.introduced.length === 0 && <p className="muted">No change to reported issues.</p>}
        {delta.persisting.length > 0 && <p className="meta">{delta.persisting.length} issue{delta.persisting.length === 1 ? '' : 's'} unchanged.</p>}
      </div>
      {previewNeedsAcknowledgement(preview) && preview.assumptions.length === 0 && <p className="warning">This change is conditional on unverified evidence.</p>}
      <Acknowledgements ids={preview.assumptions} checked={acks} onChange={setAcks} prefix="preview" />
      {stale && <p className="stale" role="alert">Inputs changed after this preview was calculated, so it cannot be applied.</p>}
      <div className="button-row">
        <button type="button" disabled={busy || stale || !ackReady} onClick={() => onApply([...acks])}>Apply</button>
        <button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}

export type DraftState =
  | { kind: 'draft'; draft: GeneratedDraft }
  | { kind: 'no_valid_draft'; expansions: number }
  | { kind: 'failed'; failure: TypedFailure }
  | null;

export function DraftPanel({ state, catalog, stale, busy, onAdopt, onDiscard, onRegenerate }: { state: DraftState; catalog: CatalogModel; stale: boolean; busy: boolean; onAdopt: (acks: string[]) => void; onDiscard: () => void; onRegenerate: () => void }) {
  const [acks, setAcks] = useState<Set<string>>(new Set());
  if (!state) return null;
  if (state.kind === 'failed') {
    return (
      <section className="draft" aria-labelledby="draft-title" data-testid="draft-panel">
        <FocusHeading id="draft-title">Draft plan not available</FocusHeading>
        <p role="alert">{failureText(state.failure)}</p>
        <div className="button-row"><button type="button" disabled={busy} onClick={onRegenerate}>Try again</button></div>
      </section>
    );
  }
  if (state.kind === 'no_valid_draft') {
    return (
      <section className="draft" aria-labelledby="draft-title" data-testid="draft-panel">
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
    <section className="draft" aria-labelledby="draft-title" data-testid="draft-panel">
      <div className="preview-head">
        <FocusHeading id="draft-title">Draft plan, not adopted</FocusHeading>
        <span className="meta">Shown with dashed outlines in the timeline.</span>
      </div>
      <p data-testid="draft-summary"><span className="tabular">{draft.placements.length}</span> courses across <span className="tabular">{terms}</span> terms, <span className="tabular">{knownCredits}</span> credits{unknownCredits > 0 ? ` plus ${unknownCredits} with unknown credits` : ''}. One conditional draft from the bounded search; nothing changes until you adopt it.</p>
      <p className="meta">Search: <span className="tabular">{draft.search.expansions}</span> expansions, stopped at {humanizeCode(draft.search.stopReason).toLowerCase()}.</p>
      {draft.validation.length > 0 && <ul className="findings">{draft.validation.map(f => <FindingCard key={f.findingId} finding={f} catalog={catalog} />)}</ul>}
      <Acknowledgements ids={draft.assumptions} checked={acks} onChange={setAcks} prefix="draft" />
      {stale && <p className="stale" role="alert">Inputs changed after this draft was generated. Generate again before adopting.</p>}
      <div className="button-row">
        <button type="button" disabled={busy || stale || !ackReady} onClick={() => onAdopt([...acks])}>Adopt draft</button>
        <button type="button" className="secondary" disabled={busy} onClick={onDiscard}>Discard draft</button>
        {stale && <button type="button" className="secondary" disabled={busy} onClick={onRegenerate}>Generate again</button>}
      </div>
      <p className="meta">Adopted courses are labeled as PathCheck suggestions so they stay distinct from your own selections.</p>
    </section>
  );
}
