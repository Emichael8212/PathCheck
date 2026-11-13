import { useId, useState } from 'react';
import type { AnalysisResult, AvailabilityEvidence, CatalogModel, RuleFinding, TermId } from '../../contracts';
import {
  APPROVAL_LABEL, OUTLOOK_TEXT, REPORT_LABEL, RULESET_LABEL, SOURCE_KIND_LABEL, VERIFICATION_LABEL,
  catalogYearLabel, constraintText, courseCode, courseTitle, findingClass, findingScope, formatTimestamp, humanizeCode, programLabel, sourceLookup,
} from '../labels';
import { termLabel } from '../terms';

/**
 * Two persistent live regions: confirmations are polite, failures are assertive.
 * Both stay mounted so screen readers reliably announce changes.
 */
export function Notice({ notice }: { notice: { tone: 'ok' | 'error' | 'info'; text: string } | null }) {
  const isError = notice?.tone === 'error';
  return (
    <>
      <div className="notice-region" role="status" aria-live="polite" data-testid="notice-status">
        {notice && !isError && <p className={`notice notice-${notice.tone}`}>{notice.text}</p>}
      </div>
      <div className="notice-region" role="alert" aria-live="assertive" data-testid="notice-alert">
        {notice && isError && <p className="notice notice-error">{notice.text}</p>}
      </div>
    </>
  );
}

export function CatalogSummary({ catalog }: { catalog: CatalogModel }) {
  const ref = catalog.catalogRef;
  return (
    <section className="catalog-summary panel" aria-label="Catalog and source status" data-testid="catalog-summary">
      <p className="program">{programLabel(ref)}</p>
      <dl className="facts">
        <dt>Catalog year</dt><dd data-testid="catalog-year">{catalogYearLabel(ref)}</dd>
        <dt>Catalog version</dt><dd translate="no">{ref.catalogVersion}</dd>
        <dt>Rule set</dt><dd><span className={`badge badge-${ref.ruleSetStatus}`}>{RULESET_LABEL[ref.ruleSetStatus]}</span></dd>
        <dt>Approval</dt><dd>{APPROVAL_LABEL[catalog.approval]}</dd>
      </dl>
      <ul className="sources" aria-label="Sources">
        {ref.sources.map(s => (
          <li key={s.sourceId}>{SOURCE_KIND_LABEL[s.kind]}: {s.description} <span className="muted">({VERIFICATION_LABEL[s.verificationStatus]})</span></li>
        ))}
      </ul>
      {catalog.policyGaps.length > 0 && (
        <div className="policy-gaps">
          <p><strong>Unresolved policies.</strong> These stay unknown and can prevent conclusions.</p>
          <ul className="plain-list">{catalog.policyGaps.map(g => <li key={g.policyId}>{g.description}{g.blocksConclusions ? ' (blocks conclusions)' : ''}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

/** Compact outlook strip: verdict line, the engine's caveat and dependencies stay visible. */
export function OutlookCard({ analysis, targetTerm, stale }: { analysis: AnalysisResult; targetTerm: TermId; stale: boolean }) {
  const o = OUTLOOK_TEXT[analysis.outlook.kind];
  return (
    <section className={`outlook outlook-${analysis.outlook.kind}`} aria-labelledby="outlook-title" data-testid="outlook">
      <h2 id="outlook-title">{o.title} for {termLabel(targetTerm)}</h2>
      <p className="outlook-detail">{o.detail}{analysis.outlook.assumptionRefs.length > 0 && <> <span className="outlook-deps">Depends on: {analysis.outlook.assumptionRefs.map(humanizeCode).join('; ')}.</span></>}</p>
      {stale && <p className="stale" role="alert">This analysis is out of date for the current inputs.</p>}
    </section>
  );
}

/**
 * One compact row per engine finding. The summary line names the class, the rule and where
 * it applies; the sourced rationale, next step, assumptions and requirements sit in the
 * expandable details so they stay available without repeating on every row.
 */
export function FindingCard({ finding, catalog, onViewInPlan }: { finding: RuleFinding; catalog: CatalogModel | null; onViewInPlan?: (courseId: string) => void }) {
  const cls = findingClass(finding);
  const src = sourceLookup(catalog);
  const params = Object.entries(finding.explanationParams);
  const scope = findingScope(finding, catalog);
  const first = finding.courseIds[0];
  return (
    <li className={`finding finding-${cls.tone}`} data-testid="finding" data-tone={cls.tone}>
      <details className="finding-details">
        <summary data-testid="finding-summary">
          <span className="finding-text"><span className={`badge badge-${cls.tone}`}>{cls.label}</span> <strong>{humanizeCode(finding.code)}</strong>{scope && <span className="finding-scope"> {scope}</span>}</span>
        </summary>
        <div className="finding-why" data-testid="finding-why">
          {finding.nextAction && <p className="next-action">Suggested next step: {humanizeCode(finding.nextAction)}.</p>}
          <p>Rule status: {constraintText(finding)}.</p>
          {finding.courseIds.length > 0 && <p>{finding.courseIds.map(id => courseTitle(catalog, id)).join('; ')}</p>}
          {params.length > 0 && <ul>{params.map(([k, v]) => <li key={k}>{humanizeCode(k)}: {String(v)}</li>)}</ul>}
          {finding.sourceRefs.length > 0 && <ul className="sources" aria-label="Sources">{finding.sourceRefs.map(r => <li key={r}>{src(r)}</li>)}</ul>}
          {finding.assumptions.length > 0 && <p>Assumptions: {finding.assumptions.map(humanizeCode).join('; ')}</p>}
          {finding.requirementIds.length > 0 && <p>Requirements: {finding.requirementIds.map(humanizeCode).join(', ')}</p>}
        </div>
      </details>
      {onViewInPlan && first && <button type="button" className="link finding-locate" aria-label={`Show in plan: ${courseCode(catalog, first)}`} onClick={() => onViewInPlan(first)}>Show in plan</button>}
    </li>
  );
}

export function FindingList({ title, findings, catalog, empty, onViewInPlan, canLocate, testId }: { title: string; findings: RuleFinding[]; catalog: CatalogModel | null; empty: string; onViewInPlan?: (courseId: string) => void; canLocate?: (courseId: string) => boolean; testId: string }) {
  const id = useId();
  // "Show in plan" only where the course is actually placed, so the control never does nothing.
  const locatable = (f: RuleFinding) => Boolean(onViewInPlan && f.courseIds[0] && (!canLocate || canLocate(f.courseIds[0])));
  return (
    <section aria-labelledby={id} data-testid={testId} className="section-block">
      <h2 id={id}>{title}</h2>
      {findings.length === 0 ? <p className="muted">{empty}</p> : (
        <ul className="findings">{findings.map(f => <FindingCard key={f.findingId} finding={f} catalog={catalog} {...(onViewInPlan && locatable(f) ? { onViewInPlan } : {})} />)}</ul>
      )}
    </section>
  );
}

export type AvailabilityAnswer = AvailabilityEvidence['report'] | 'skip';

/**
 * Student offering report. `compact` tucks the optional note behind a disclosure;
 * `hintInSection` leaves the "check it yourself" hint to a surrounding section that shows it once.
 */
export function AvailabilityControl({ courseLabel, term, existing, onAnswer, disabled, compact = false, hintInSection = false }: { courseLabel: string; term: TermId; existing: AvailabilityEvidence | undefined; onAnswer: (answer: AvailabilityAnswer, notes: string) => void; disabled: boolean; compact?: boolean; hintInSection?: boolean }) {
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const notesId = useId();
  const note = (
    <div className="field">
      <label htmlFor={notesId}>Note (optional)</label>
      <input id={notesId} value={notes} maxLength={200} autoComplete="off" onChange={e => setNotes(e.target.value)} />
    </div>
  );
  return (
    <fieldset className={`availability${compact ? ' availability-compact' : ''}`} data-testid="availability-control">
      <legend>Is {courseLabel} listed for {termLabel(term)}?</legend>
      {existing ? (
        <p className="evidence" data-testid="availability-evidence"><span className="badge badge-student">{REPORT_LABEL[existing.report]}</span> {existing.sourceKind === 'student_report' ? 'Student-reported, unverified' : SOURCE_KIND_LABEL[existing.sourceKind]}, observed <time dateTime={existing.observedAt}>{formatTimestamp(existing.observedAt)}</time>. Not a seat or enrollment confirmation.</p>
      ) : <p className="evidence">No report yet. The offering stays unknown.</p>}
      <div className="button-row">
        {(['listed', 'not_listed', 'unknown'] as const).map(r => (
          <button key={r} type="button" className="secondary" disabled={disabled} aria-pressed={existing?.report === r} onClick={() => onAnswer(r, notes)}>{REPORT_LABEL[r]}</button>
        ))}
        <button type="button" className="link" disabled={disabled} onClick={() => onAnswer('skip', notes)}>Skip</button>
      </div>
      {compact ? <details className="note-toggle"><summary>Add a note</summary>{note}</details> : note}
      {!hintInSection && <p className="hint">Check the public schedule yourself. PathCheck never asks for portal passwords.</p>}
    </fieldset>
  );
}
