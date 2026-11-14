import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { AnalysisResult, CandidatePreview, CatalogModel, Plan, PlanPlacement, Result, RuleFinding, TermId } from '../contracts';
import { AvailabilityControl, CatalogSummary, FindingCard, FindingItems, OutlookCard } from '../ui/components/Display';
import type { AvailabilityAnswer } from '../ui/components/Display';
import { CandidateFix, DraftPanel, PreviewPanel } from '../ui/components/Proposals';
import { useNarrowLayout } from '../ui/previewText';
import type { DraftState } from '../ui/components/Proposals';
import { Timeline } from '../ui/components/Timeline';
import type { RowContext, TimelineHandlers } from '../ui/components/Timeline';
import { catalogEdition, catalogStatus, courseCode, failureText } from '../ui/labels';
import { describeChanges, findingDelta } from '../ui/planView';
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
  onGenerate(): void;
  onAdopt(acks: string[]): void;
  onDiscardDraft(): void;
  onCapacity(c: CapacityAssumption): void;
  onIncludeSummer(v: boolean): void;
  onRefresh(): void;
  onExport(): void;
  onBack(): void;
  onChangeTarget(): void;
}

function AddCourse({ catalog, terms, busy, onAdd }: { catalog: CatalogModel; terms: TermId[]; busy: boolean; onAdd: (courseId: string, term: TermId) => void }) {
  const courseId = useId(), termId = useId();
  const courses = Object.values(catalog.courses).sort((a, b) => a.courseId.localeCompare(b.courseId));
  const [course, setCourse] = useState('');
  const [chosenTerm, setTerm] = useState(terms[0] ? termKey(terms[0]) : '');
  // A remembered term can leave the modeled horizon; use the option the select displays.
  const t = terms.find(x => termKey(x) === chosenTerm) ?? terms[0];
  const term = t ? termKey(t) : '';
  return (
    <form className="add-course" aria-label="Add a course to your plan" data-testid="add-course" onSubmit={e => { e.preventDefault(); if (course && t) { onAdd(course, t); setCourse(''); } }}>
      <div className="field field-course"><label htmlFor={courseId}>Course</label>
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
  // When the workflow replaces the capacity (e.g. opening a saved plan resets it), show it.
  const [shown, setShown] = useState(capacity);
  if (shown !== capacity) { setShown(capacity); setValue(String(capacity.maximum)); }
  const valid = /^\d{1,2}$/.test(value) && Number(value) > 0;
  return (
    <details className="insp-disclosure" data-testid="assumptions">
      <summary>Planning assumptions<span className="summary-meta">{capacity.maximum} cr/term{capacity.source === 'student' ? ' (yours)' : ''}, {includeSummer ? 'with summer' : 'no summer'}</span></summary>
      <form onSubmit={e => { e.preventDefault(); if (valid) onCapacity({ maximum: Number(value), source: 'student' }); }}>
        <div className="field"><label htmlFor={capId}>Maximum credits per term</label>
          <div className="inline-field">
            <input id={capId} inputMode="numeric" autoComplete="off" value={value} aria-invalid={!valid || undefined} aria-describedby={valid ? undefined : errId} onChange={e => setValue(e.target.value)} />
            <button type="submit" className="secondary" disabled={!valid}>Use this load</button>
          </div>
          {!valid && <span className="field-error" id={errId}>Enter a whole number from 1 to 99.</span>}
        </div>
      </form>
      <p className="small">{capacity.source === 'student' ? 'Your value.' : 'A planning assumption, not a university limit.'}</p>
      <label className="check" htmlFor={sumId}><input id={sumId} type="checkbox" checked={includeSummer} onChange={e => onIncludeSummer(e.target.checked)} /> <span>Model summer terms (summer offerings stay unknown unless reported)</span></label>
      <p className="small">Planned courses {assumeFuturePass ? 'are assumed to be passed' : 'are not assumed to be passed'}.</p>
    </details>
  );
}

const sameFinding = (a: RuleFinding, b: RuleFinding) => a.findingId === b.findingId
  || (a.code === b.code && a.courseIds.join() === b.courseIds.join() && a.termIds.map(t => t.sortIndex).join() === b.termIds.map(t => t.sortIndex).join());

/** One engine availability question at a time; answers are recorded through L as student reports. */
function AvailabilityQuestions({ analysis, catalog, plan, busy, onReport }: { analysis: AnalysisResult; catalog: CatalogModel; plan: Plan; busy: boolean; onReport: PlannerProps['onReport'] }) {
  const questions = analysis.availabilityQuestions;
  const [index, setIndex] = useState(0);
  const pendingFocus = useRef(false);
  const i = questions.length === 0 ? 0 : Math.min(index, questions.length - 1);
  const q = questions[i];
  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    (document.getElementById('avail-q') ?? document.getElementById('avail-title'))?.focus();
  }, [analysis, index]);
  if (!q) return null;
  const answer = (a: AvailabilityAnswer, notes: string) => {
    pendingFocus.current = true;
    // Skip records nothing, so the same question would stay; move on to the next one.
    if (a === 'skip' && questions.length > 1) setIndex((i + 1) % questions.length);
    onReport(q.courseId, q.termId, a, notes);
  };
  return (
    <section className="insp-section" aria-labelledby="avail-title" data-testid="availability-questions">
      <h2 id="avail-title" className="insp-title" tabIndex={-1}>Confirm availability{questions.length > 1 && <span className="count">{i + 1} of {questions.length}</span>}</h2>
      <AvailabilityControl key={q.questionId} compact hintInSection legendId="avail-q" courseLabel={courseCode(catalog, q.courseId)} term={q.termId} disabled={busy}
        existing={plan.availabilityEvidence.find(e => e.courseId === q.courseId && e.termId.sortIndex === q.termId.sortIndex)} onAnswer={answer} />
      {questions.length > 1 && (
        <div className="stepper">
          <button type="button" className="link" disabled={i === 0} onClick={() => setIndex(i - 1)}>Previous</button>
          <button type="button" className="link" disabled={i === questions.length - 1} onClick={() => setIndex(i + 1)}>Next question</button>
        </div>
      )}
      <p className="small">Saved as student-reported, with the date. Check the public class schedule; PathCheck never asks for portal passwords.</p>
    </section>
  );
}

export function PlannerScreen(p: PlannerProps) {
  const [highlight, setHighlight] = useState<string | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const hadPreview = useRef(false);
  const narrow = useNarrowLayout();
  const analysis = p.analysis && p.analysis.ok ? p.analysis.value : null;
  const projected = p.draft?.kind === 'draft' ? p.draft.draft.placements : [];
  const draftStale = p.draft?.kind === 'draft' && p.draft.draft.baseFingerprint !== p.currentFingerprint;
  const previewStale = p.preview !== null && p.preview.baseFingerprint !== p.currentFingerprint;
  const changes = useMemo(() => (p.preview ? describeChanges(p.preview, p.plan.activePlacements) : null), [p.preview, p.plan.activePlacements]);

  // Focus returns to the control that opened the preview, or to the nearest stable heading.
  useEffect(() => {
    if (p.preview) { hadPreview.current = true; return; }
    if (!hadPreview.current) return;
    hadPreview.current = false;
    const back = returnTo.current;
    returnTo.current = null;
    if (back?.isConnected) {
      // A row popover may have closed meanwhile; then its Edit control takes focus instead.
      const menu = back.closest('details');
      if (menu && !menu.open) menu.querySelector<HTMLElement>('summary')?.focus(); else back.focus();
      return;
    }
    document.querySelector<HTMLElement>('#issues-title, #timeline-title')?.focus();
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
  // Row markers come only from engine findings and evidence gaps; the UI adds no verdicts.
  const context: RowContext = {
    findingsFor: (pl: PlanPlacement) => (analysis?.topFindings ?? []).filter(f => f.courseIds[0] === pl.courseId && (f.termIds.length === 0 || f.termIds.some(t => t.sortIndex === pl.termId.sortIndex))),
    offeringUnknown: (courseId, term) => Boolean(analysis?.evidenceGaps.some(f => f.code === 'offering_unknown' && f.courseIds.includes(courseId) && f.termIds.some(t => t.sortIndex === term.sortIndex))),
    onShowIssue: id => {
      const el = document.getElementById(`issue-${id}`);
      if (el) { el.scrollIntoView({ block: 'nearest' }); el.focus(); }
    },
  };

  if (p.path === null) {
    return (
      <section className="screen screen-choose" aria-labelledby="planner-title" data-testid="screen-planner">
        <h1 id="planner-title">Graduation planner</h1>
        <p className="lede">Target {termLabel(p.plan.targetTerm)}. Choose how to start; you can switch later.</p>
        <div className="entry-actions">
          <button type="button" className="entry" disabled={p.busy} onClick={() => p.onChoosePath('selected')}>
            <strong>I already selected courses</strong><span>Enter the courses you chose. PathCheck checks them and the requirements you haven&apos;t selected.</span>
          </button>
          <button type="button" className="entry" disabled={p.busy} onClick={() => p.onChoosePath('generated')}>
            <strong>Help me build a plan</strong><span>Get one preliminary, conditional draft. Nothing is adopted until you choose.</span>
          </button>
        </div>
        <div className="button-row"><button type="button" className="secondary" onClick={p.onBack}>Back to academic record</button></div>
      </section>
    );
  }

  // Each engine candidate is shown once: under the first priority issue it resolves, else after the issues.
  const top = analysis?.topFindings ?? [];
  const owner = new Map<string, string>();
  for (const c of p.candidates) {
    const resolved = findingDelta(c).resolved;
    const hit = top.find(f => resolved.some(r => sameFinding(r, f)));
    if (hit) owner.set(c.previewId, hit.findingId);
  }
  const unowned = p.candidates.filter(c => !owner.has(c.previewId));
  const previewCandidate = (c: CandidatePreview) => { remember(); p.onPreviewCandidate(c); };
  const fixesFor = (f: RuleFinding) => {
    const own = p.candidates.filter(c => owner.get(c.previewId) === f.findingId);
    const shared = own.length === 0 && p.candidates.some(c => owner.has(c.previewId) && owner.get(c.previewId) !== f.findingId && findingDelta(c).resolved.some(r => sameFinding(r, f)));
    return (
      <>
        {own.map(c => <CandidateFix key={c.previewId} candidate={c} catalog={p.catalog} active={p.plan.activePlacements} busy={p.busy} onPreview={previewCandidate} />)}
        {shared && <p className="small fix-shared">Also resolved by the suggested fix above.</p>}
      </>
    );
  };
  // A finding that owns or shares a suggested fix stays an individual row next to that fix.
  const ownsFix = (f: RuleFinding) => (p.candidates.some(c => findingDelta(c).resolved.some(r => sameFinding(r, f))) ? true : null);
  const gaps = analysis ? analysis.evidenceGaps : [];
  const risks = analysis ? analysis.bottlenecks : [];
  const openDisclosure = (testId: string) => {
    const d = document.querySelector<HTMLDetailsElement>(`[data-testid="${testId}"]`);
    if (!d) return;
    d.open = true;
    const summary = d.querySelector<HTMLElement>(':scope > summary');
    summary?.scrollIntoView({ block: 'nearest' }); summary?.focus();
  };
  const cat = catalogStatus(p.catalog.catalogRef, p.catalog.approval);
  const edition = catalogEdition(p.catalog.catalogRef);
  const covered = Boolean(p.preview) && !narrow;
  // Empty plan: one clear starting point instead of a list of empty semesters.
  const emptyPlan = p.plan.activePlacements.length === 0 && !p.draft;

  return (
    <section className="screen planner" aria-labelledby="planner-title" data-testid="screen-planner">
      <div className="planner-head">
        <div>
          <h1 id="planner-title">Graduation planner</h1>
          <p className="target-line">Target <strong>{termLabel(p.plan.targetTerm)}</strong> <button type="button" className="link" onClick={p.onChangeTarget}>Change</button></p>
        </div>
        <div className="button-row head-actions">
          <button type="button" className="secondary" disabled={p.busy} onClick={p.onRefresh}>Recheck plan</button>
          <button type="button" className="secondary" disabled={p.busy || !analysis || p.stale} onClick={p.onExport}>Export PDF</button>
        </div>
      </div>
      {p.scenarioError && <p className="notice notice-error" role="alert">{p.scenarioError}</p>}
      {p.horizonTruncated && <p className="notice notice-warn" role="note">Your target is beyond the modeled horizon of {p.terms.length} terms. Terms after {termLabel(p.terms.at(-1)!)} are not modeled, so no path through them is claimed.</p>}
      {p.analysis && !p.analysis.ok && <p className="notice notice-error" role="alert" data-testid="analysis-failure">No analysis is shown: {failureText(p.analysis)}</p>}
      {analysis && <OutlookCard analysis={analysis} targetTerm={p.plan.targetTerm} stale={p.stale} catalog={p.catalog} capacity={p.capacity.maximum}
        planState={p.plan.activePlacements.length > 0 ? 'active' : p.draft?.kind === 'draft' ? 'draft_only' : 'empty'}
        onShowUnknowns={() => openDisclosure('evidence-gaps')} onShowRisks={() => openDisclosure('scheduling-risks')} />}
      <div className="planner-grid">
        <div className="planner-main">
          <div className="plan-head">
            <h2 id="timeline-title" tabIndex={-1}>Semester plan</h2>
            <AddCourse catalog={p.catalog} terms={p.terms} busy={p.busy} onAdd={p.onAdd} />
          </div>
          {emptyPlan ? (
            <section className="empty-plan" aria-labelledby="empty-plan-title" data-testid="empty-plan">
              <h3 id="empty-plan-title">No courses planned yet</h3>
              <p>Add the courses you’ve chosen, or let PathCheck draft one preliminary plan for you to review. Nothing is adopted until you choose.</p>
              {p.terms.length > 0 && <p className="small">Planning {p.terms.length} semester{p.terms.length === 1 ? '' : 's'}: {termLabel(p.terms[0]!)} to {termLabel(p.terms.at(-1)!)}.</p>}
              <div className="button-row">
                <button type="button" disabled={p.busy} onClick={() => {
                  const select = document.querySelector<HTMLElement>('[data-testid="add-course"] select');
                  select?.scrollIntoView({ block: 'nearest' }); select?.focus();
                }}>Add a course</button>
                <button type="button" className="secondary" disabled={p.busy} onClick={p.onGenerate}>Help me build a plan</button>
              </div>
            </section>
          ) : (
            <Timeline catalog={p.catalog} terms={p.terms} targetTerm={p.plan.targetTerm} active={p.plan.activePlacements} projected={projected} evidence={p.plan.availabilityEvidence}
              capacity={p.capacity.maximum} highlightCourse={highlight} busy={p.busy} handlers={timeline} context={context} changes={changes} />
          )}
          {!p.draft && !emptyPlan && <div className="button-row"><button type="button" className="secondary" disabled={p.busy} onClick={p.onGenerate}>Help me build a plan</button></div>}
        </div>
        <aside className={`planner-side${covered ? ' has-preview' : ''}`} aria-label="Issues, suggestions and availability">
          {p.preview && <PreviewPanel key={p.preview.previewId + p.preview.baseFingerprint} preview={p.preview} catalog={p.catalog} active={p.plan.activePlacements} stale={previewStale} busy={p.busy} onApply={p.onApply} onCancel={p.onReject} />}
          <div className="inspector">
            {p.draft && <DraftPanel key={p.draft.kind === 'draft' ? p.draft.draft.draftId + p.draft.draft.baseFingerprint : p.draft.kind} state={p.draft} catalog={p.catalog} stale={draftStale} busy={p.busy} onAdopt={p.onAdopt} onDiscard={p.onDiscardDraft} onRegenerate={p.onGenerate} />}
            {analysis && (
              <section className="insp-section" aria-labelledby="issues-title" data-testid="issues">
                <h2 id="issues-title" className="insp-title" tabIndex={-1}>Needs attention{top.length > 0 && <span className="count"><span className="visually-hidden">: </span>{top.length}</span>}</h2>
                {top.length === 0 ? <p className="muted small">No priority issues reported for this plan.</p> : (
                  <FindingItems findings={top} catalog={p.catalog} extra={ownsFix}
                    single={f => (
                      <FindingCard key={f.findingId} finding={f} catalog={p.catalog}
                        {...(f.courseIds[0] && p.plan.activePlacements.some(x => x.courseId === f.courseIds[0]) ? { onViewInPlan: viewInPlan } : {})}>
                        {fixesFor(f)}
                      </FindingCard>
                    )} />
                )}
                {unowned.length > 0 && (
                  <div className="other-fixes" data-testid="candidates">
                    <h3 className="insp-subtitle">{top.length > 0 ? 'Other suggestions' : 'Suggestions'}</h3>
                    {unowned.map(c => <CandidateFix key={c.previewId} candidate={c} catalog={p.catalog} active={p.plan.activePlacements} busy={p.busy} onPreview={previewCandidate} />)}
                  </div>
                )}
              </section>
            )}
            {analysis && <AvailabilityQuestions analysis={analysis} catalog={p.catalog} plan={p.plan} busy={p.busy} onReport={p.onReport} />}
            <div className="insp-section insp-more">
              {analysis && risks.length > 0 && (
                <details className="insp-disclosure" data-testid="scheduling-risks">
                  <summary>Scheduling risks<span className="summary-meta is-warn">{risks.length}</span></summary>
                  <FindingItems findings={risks} catalog={p.catalog} />
                </details>
              )}
              {analysis && (
                <details className="insp-disclosure" data-testid="evidence-gaps">
                  <summary>Unknowns and evidence gaps<span className="summary-meta">{gaps.length}</span></summary>
                  {gaps.length === 0 ? <p className="muted small">No evidence gaps reported.</p> : <FindingItems findings={gaps} catalog={p.catalog} />}
                </details>
              )}
              <Assumptions capacity={p.capacity} includeSummer={p.includeSummer} assumeFuturePass={p.assumeFuturePass} onCapacity={p.onCapacity} onIncludeSummer={p.onIncludeSummer} />
              <details className="insp-disclosure">
                <summary>Catalog<span className={`summary-meta${cat.tone === 'warn' ? ' is-warn' : ''}`}>{edition ? `${edition.short} · ${cat.short}` : cat.short}</span></summary>
                <CatalogSummary catalog={p.catalog} />
              </details>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
