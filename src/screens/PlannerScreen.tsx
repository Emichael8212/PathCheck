import { useEffect, useId, useRef, useState } from 'react';
import type { AnalysisResult, CandidatePreview, CatalogModel, Plan, Result, TermId, UndoCheckpoint } from '../contracts';
import { AvailabilityControl, FindingList, OutlookCard } from '../ui/components/Display';
import type { AvailabilityAnswer } from '../ui/components/Display';
import { CandidateList, DraftPanel, PreviewPanel } from '../ui/components/Proposals';
import type { DraftState } from '../ui/components/Proposals';
import { Timeline } from '../ui/components/Timeline';
import type { TimelineHandlers } from '../ui/components/Timeline';
import { courseCode, failureText } from '../ui/labels';
import type { CapacityAssumption } from '../ui/scenario';
import { termKey, termLabel } from '../ui/terms';

export interface PlannerProps {
  catalog: CatalogModel;
  plan: Plan;
  terms: TermId[];
  horizonTruncated: boolean;
  path: 'selected' | 'generated' | null;
  analysis: Result<AnalysisResult> | null;
  scenarioError: string | null;
  stale: boolean;
  currentFingerprint: string | null;
  draft: DraftState;
  preview: CandidatePreview | null;
  candidates: CandidatePreview[];
  undo: UndoCheckpoint | null;
  capacity: CapacityAssumption;
  includeSummer: boolean;
  assumeFuturePass: boolean;
  busy: boolean;
  onChoosePath(path: 'selected' | 'generated'): void;
  onAdd(courseId: string, term: TermId): void;
  timeline: TimelineHandlers;
  onReport(courseId: string, term: TermId, answer: AvailabilityAnswer, notes: string): void;
  onPreviewCandidate(c: CandidatePreview): void;
  onApply(acks: string[]): void;
  /** Cancel dispatches L's existing rejectPreview command. */
  onReject(): void;
  onUndo(): void;
  onGenerate(): void;
  onAdopt(acks: string[]): void;
  onDiscardDraft(): void;
  onCapacity(c: CapacityAssumption): void;
  onIncludeSummer(v: boolean): void;
  onRefresh(): void;
  onExport(): void;
  onBack(): void;
}

function AddCourse({ catalog, terms, busy, onAdd }: { catalog: CatalogModel; terms: TermId[]; busy: boolean; onAdd: (courseId: string, term: TermId) => void }) {
  const courseId = useId(), termId = useId();
  const courses = Object.values(catalog.courses).sort((a, b) => a.courseId.localeCompare(b.courseId));
  const [course, setCourse] = useState('');
  const [term, setTerm] = useState(terms[0] ? termKey(terms[0]) : '');
  const t = terms.find(x => termKey(x) === term);
  return (
    <form className="add-course" aria-label="Add a course to your plan" data-testid="add-course" onSubmit={e => { e.preventDefault(); if (course && t) { onAdd(course, t); setCourse(''); } }}>
      <div className="field"><label htmlFor={courseId}>Course</label>
        <select id={courseId} value={course} onChange={e => setCourse(e.target.value)}>
          <option value="">Choose a course…</option>
          {courses.map(c => <option key={c.courseId} value={c.courseId}>{c.displayCode} {c.title}{c.status === 'pending' ? ' (pending)' : ''}</option>)}
        </select></div>
      <div className="field field-term"><label htmlFor={termId}>Term</label>
        <select id={termId} value={term} onChange={e => setTerm(e.target.value)}>
          {terms.map(x => <option key={termKey(x)} value={termKey(x)}>{termLabel(x)}</option>)}
        </select></div>
      <button type="submit" disabled={busy || !course || !t}>Add course</button>
    </form>
  );
}

function Assumptions({ capacity, includeSummer, assumeFuturePass, onCapacity, onIncludeSummer }: Pick<PlannerProps, 'capacity' | 'includeSummer' | 'assumeFuturePass' | 'onCapacity' | 'onIncludeSummer'>) {
  const capId = useId(), sumId = useId(), errId = useId();
  const [value, setValue] = useState(String(capacity.maximum));
  const valid = /^\d{1,2}$/.test(value) && Number(value) > 0;
  return (
    <details className="assumptions-panel" data-testid="assumptions">
      <summary>Planning assumptions</summary>
      <form onSubmit={e => { e.preventDefault(); if (valid) onCapacity({ maximum: Number(value), source: 'student' }); }}>
        <div className="field"><label htmlFor={capId}>Maximum credits per term</label>
          <input id={capId} inputMode="numeric" autoComplete="off" value={value} aria-invalid={!valid || undefined} aria-describedby={valid ? undefined : errId} onChange={e => setValue(e.target.value)} />
          {!valid && <span className="field-error" id={errId}>Enter a whole number from 1 to 99.</span>}
        </div>
        <button type="submit" className="secondary" disabled={!valid}>Use this load</button>
      </form>
      <p className="meta">{capacity.source === 'student' ? `Modeled with up to ${capacity.maximum} credits per term (your value).` : `Modeled with up to ${capacity.maximum} credits per term. This is a planning assumption, not a university limit.`}</p>
      <label className="check" htmlFor={sumId}><input id={sumId} type="checkbox" checked={includeSummer} onChange={e => onIncludeSummer(e.target.checked)} /> <span>Model summer terms (summer offerings stay unknown unless reported)</span></label>
      <p className="meta">Future planned courses {assumeFuturePass ? 'are assumed to be passed' : 'are not assumed to be passed'} by the engine configuration.</p>
    </details>
  );
}

export function PlannerScreen(p: PlannerProps) {
  const [highlight, setHighlight] = useState<string | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const hadPreview = useRef(false);
  const analysis = p.analysis && p.analysis.ok ? p.analysis.value : null;
  const projected = p.draft?.kind === 'draft' ? p.draft.draft.placements : [];
  const draftStale = p.draft?.kind === 'draft' && p.draft.draft.baseFingerprint !== p.currentFingerprint;
  const previewStale = p.preview !== null && p.preview.baseFingerprint !== p.currentFingerprint;

  // Focus returns to the control that opened the preview, or to the nearest stable heading.
  useEffect(() => {
    if (p.preview) { hadPreview.current = true; return; }
    if (!hadPreview.current) return;
    hadPreview.current = false;
    const back = returnTo.current;
    returnTo.current = null;
    if (back?.isConnected) { back.focus(); return; }
    document.querySelector<HTMLElement>('#cand-title, #timeline-title')?.focus();
  }, [p.preview]);
  const remember = () => { returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; };

  const viewInPlan = (courseId: string) => {
    setHighlight(courseId);
    const el = document.querySelector<HTMLElement>(`[data-testid="placement"][data-course="${courseId}"]`);
    if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); }
  };
  const timeline: TimelineHandlers = {
    onMove: (pl, to, mode) => { if (mode === 'preview') remember(); p.timeline.onMove(pl, to, mode); },
    onRemove: (pl, mode) => { if (mode === 'preview') remember(); p.timeline.onRemove(pl, mode); },
    onReport: p.timeline.onReport,
  };

  if (p.path === null) {
    return (
      <section className="screen" aria-labelledby="planner-title" data-testid="screen-planner">
        <h1 id="planner-title">Graduation planner</h1>
        <p className="lede">Target {termLabel(p.plan.targetTerm)}. Choose how to start. You can switch later.</p>
        <div className="entry-actions">
          <button type="button" className="entry" disabled={p.busy} onClick={() => p.onChoosePath('selected')}>
            <strong>I already selected courses</strong><span>Enter the upcoming courses you chose. PathCheck checks them and the requirements you haven&apos;t selected.</span>
          </button>
          <button type="button" className="entry" disabled={p.busy} onClick={() => p.onChoosePath('generated')}>
            <strong>Help me build a plan</strong><span>Get one preliminary, conditional draft. Nothing is adopted until you choose.</span>
          </button>
        </div>
        <div className="button-row"><button type="button" className="secondary" onClick={p.onBack}>Back to academic record</button></div>
      </section>
    );
  }

  return (
    <section className="screen planner" aria-labelledby="planner-title" data-testid="screen-planner">
      <div className="planner-head">
        <div>
          <h1 id="planner-title">Graduation planner</h1>
          <p className="meta">Target {termLabel(p.plan.targetTerm)}. Plan revision <span className="tabular">{p.plan.planRevision}</span>.</p>
        </div>
        <div className="button-row">
          {/* Utility actions stay secondary; solid blue is reserved for plan workflow steps. */}
          <button type="button" className="secondary" disabled={p.busy} onClick={p.onRefresh}>Re-run analysis</button>
          <button type="button" className="secondary" disabled={p.busy || !analysis || p.stale} onClick={p.onExport}>Export PDF</button>
        </div>
      </div>
      {p.scenarioError && <p className="notice notice-error" role="alert">{p.scenarioError}</p>}
      {p.horizonTruncated && <p className="notice warning" role="note">Your target is beyond the modeled horizon of {p.terms.length} terms. Terms after {termLabel(p.terms.at(-1)!)} are not modeled, so no path through them is claimed.</p>}
      {p.analysis && !p.analysis.ok && <p className="notice notice-error" role="alert" data-testid="analysis-failure">No analysis is shown: {failureText(p.analysis)}</p>}
      <div className="planner-grid">
        <div className="planner-main">
          {analysis && <OutlookCard analysis={analysis} targetTerm={p.plan.targetTerm} stale={p.stale} />}
          {analysis && <FindingList title="Priority issues" testId="issues" findings={analysis.topFindings} catalog={p.catalog} empty="The engine reported no priority issues for this scenario." onViewInPlan={viewInPlan}
            canLocate={id => p.plan.activePlacements.some(x => x.courseId === id)} />}
          <div className="timeline-block">
            {p.undo && <div className="undo-bar" role="region" aria-label="Undo"><span>Last change applied.</span> <button type="button" className="secondary" disabled={p.busy} onClick={p.onUndo}>Undo</button></div>}
            <Timeline catalog={p.catalog} terms={p.terms} active={p.plan.activePlacements} projected={projected} evidence={p.plan.availabilityEvidence} capacity={p.capacity.maximum} highlightCourse={highlight} busy={p.busy} handlers={timeline} />
            <AddCourse catalog={p.catalog} terms={p.terms} busy={p.busy} onAdd={p.onAdd} />
            {!p.draft && <div className="button-row"><button type="button" className="secondary" disabled={p.busy} onClick={p.onGenerate}>Help me build a plan</button></div>}
          </div>
        </div>
        <aside className="planner-side" aria-label="Changes, offerings and unknowns">
          {p.preview && <PreviewPanel key={p.preview.previewId + p.preview.baseFingerprint} preview={p.preview} catalog={p.catalog} active={p.plan.activePlacements} stale={previewStale} busy={p.busy} onApply={p.onApply} onCancel={p.onReject} />}
          {p.draft && <DraftPanel key={p.draft.kind === 'draft' ? p.draft.draft.draftId + p.draft.draft.baseFingerprint : p.draft.kind} state={p.draft} catalog={p.catalog} stale={draftStale} busy={p.busy} onAdopt={p.onAdopt} onDiscard={p.onDiscardDraft} onRegenerate={p.onGenerate} />}
          {analysis && <CandidateList candidates={p.candidates} catalog={p.catalog} active={p.plan.activePlacements} busy={p.busy} onPreview={c => { remember(); p.onPreviewCandidate(c); }} />}
          {analysis && analysis.availabilityQuestions.length > 0 && (
            <section aria-labelledby="avail-title" data-testid="availability-questions">
              <h2 id="avail-title">Check offerings</h2>
              <p className="meta">Answers are student-reported, timestamped and unverified. Check the public schedule yourself; PathCheck never asks for portal passwords.</p>
              {analysis.availabilityQuestions.map(q => (
                <AvailabilityControl key={q.questionId} compact hintInSection courseLabel={courseCode(p.catalog, q.courseId)} term={q.termId} disabled={p.busy}
                  existing={p.plan.availabilityEvidence.find(e => e.courseId === q.courseId && e.termId.sortIndex === q.termId.sortIndex)}
                  onAnswer={(a, n) => p.onReport(q.courseId, q.termId, a, n)} />
              ))}
            </section>
          )}
          {analysis && <FindingList title="Evidence gaps and unknowns" testId="evidence-gaps" findings={[...analysis.evidenceGaps, ...analysis.bottlenecks]} catalog={p.catalog} empty="No evidence gaps reported." />}
          <Assumptions capacity={p.capacity} includeSummer={p.includeSummer} assumeFuturePass={p.assumeFuturePass} onCapacity={p.onCapacity} onIncludeSummer={p.onIncludeSummer} />
        </aside>
      </div>
    </section>
  );
}
