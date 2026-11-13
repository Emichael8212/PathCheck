import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import type { AnalysisResult, AvailabilityEvidence, CatalogModel, RuleFinding, TermId } from '../../contracts';
import {
  APPROVAL_LABEL, OUTLOOK_UI, REPORT_LABEL, REPORT_UI, RULESET_LABEL, SOURCE_KIND_LABEL, VERIFICATION_LABEL,
  assumptionText, catalogStatus, catalogYearLabel, constraintText, courseCode, courseTitle, findingMark, findingParams, findingScope, findingTitle,
  formatTimestamp, groupTitle, humanizeCode, programLabel, sourceLookup, withTarget,
} from '../labels';
import { groupFindings } from '../planView';
import { termLabel } from '../terms';

export type NoticeState = { tone: 'ok' | 'error' | 'info'; text: string } | null;

/**
 * Status (polite) live region inside the floating glass capsule. The region stays mounted
 * so screen readers reliably announce confirmations; `action` adds a contextual control (Undo).
 */
export function NoticeCapsule({ notice, action, onDismiss }: { notice: NoticeState; action?: ReactNode; onDismiss: () => void }) {
  const status = notice && notice.tone !== 'error' ? notice : null;
  const visible = Boolean(status || action);
  return (
    <div className={`capsule-dock${visible ? '' : ' is-empty'}`}>
      <div className="capsule glass">
        <div className="notice-region" role="status" aria-live="polite" data-testid="notice-status">
          {status && <p className={`notice notice-${status.tone}`}>{status.text}</p>}
        </div>
        {action}
        {status && <button type="button" className="capsule-close" aria-label="Dismiss message" onClick={onDismiss}><span aria-hidden="true">×</span></button>}
      </div>
    </div>
  );
}

/** Assertive live region for failures. Errors stay inline and opaque, never on glass. */
export function NoticeAlert({ notice }: { notice: NoticeState }) {
  return (
    <div className="notice-region" role="alert" aria-live="assertive" data-testid="notice-alert">
      {notice?.tone === 'error' && <p className="notice notice-error">{notice.text}</p>}
    </div>
  );
}

/** Persistent catalog identification; the toolbar shows it on every screen. */
export function CatalogChip({ catalog }: { catalog: CatalogModel }) {
  const s = catalogStatus(catalog.catalogRef, catalog.approval);
  return <span className={`catalog-chip catalog-chip-${s.tone}`} data-testid="catalog-chip" title={s.message}>{s.short}<span className="visually-hidden">. {s.message}</span></span>;
}

/** Catalog rows for the setup card: status banner always visible, provenance on demand. */
export function CatalogSummary({ catalog }: { catalog: CatalogModel }) {
  const ref = catalog.catalogRef;
  const status = catalogStatus(ref, catalog.approval);
  const blocking = catalog.policyGaps.filter(g => g.blocksConclusions).length;
  return (
    <div className="catalog-summary" role="group" aria-label="Catalog and source status" data-testid="catalog-summary">
      {status.tone === 'warn' && <p className="banner banner-warn" data-testid="catalog-banner"><span aria-hidden="true">⚠ </span>{status.message}</p>}
      <div className="setup-row">
        <span className="setup-label">Catalog year</span>
        <span className="setup-value" data-testid="catalog-year">{catalogYearLabel(ref)}</span>
      </div>
      <details className="disclosure-row">
        <summary>Catalog details{catalog.policyGaps.length > 0 && <span className="summary-meta">{catalog.policyGaps.length} unresolved {catalog.policyGaps.length === 1 ? 'policy' : 'policies'}{blocking ? `, ${blocking} blocking` : ''}</span>}</summary>
        <dl className="facts">
          <dt>Program</dt><dd>{programLabel(ref)}</dd>
          <dt>Catalog version</dt><dd translate="no">{ref.catalogVersion}</dd>
          <dt>Rule set</dt><dd>{RULESET_LABEL[ref.ruleSetStatus]}</dd>
          <dt>Approval</dt><dd>{APPROVAL_LABEL[catalog.approval]}</dd>
        </dl>
        <ul className="sources" aria-label="Sources">
          {ref.sources.map(s => <li key={s.sourceId}>{SOURCE_KIND_LABEL[s.kind]}: {s.description} <span className="muted">({VERIFICATION_LABEL[s.verificationStatus]})</span></li>)}
        </ul>
        {catalog.policyGaps.length > 0 && (
          <div className="policy-gaps">
            <p>Unresolved policies stay unknown and can prevent conclusions:</p>
            <ul className="plain-list">{catalog.policyGaps.map(g => <li key={g.policyId}>{g.description}{g.blocksConclusions ? ' (blocks conclusions)' : ''}</li>)}</ul>
          </div>
        )}
      </details>
    </div>
  );
}

/** Compact outlook: headline and one line; dependencies on demand; stale state stays an alert. */
export function OutlookCard({ analysis, targetTerm, stale, catalog, capacity, onShowUnknowns }: { analysis: AnalysisResult; targetTerm: TermId; stale: boolean; catalog: CatalogModel; capacity: number; onShowUnknowns?: () => void }) {
  const o = OUTLOOK_UI[analysis.outlook.kind];
  const target = termLabel(targetTerm);
  const deps = analysis.outlook.assumptionRefs;
  // Unknowns stay visible at the top: an outlook is only as good as the evidence behind it.
  const unknowns = analysis.evidenceGaps.length + analysis.bottlenecks.length;
  return (
    <section className={`outlook outlook-${o.tone}`} aria-labelledby="outlook-title" data-testid="outlook" data-kind={analysis.outlook.kind}>
      <div className="outlook-text">
        <h2 id="outlook-title">{withTarget(o.title, target)}</h2>
        <p className="outlook-detail">{withTarget(o.detail, target)}</p>
        {unknowns > 0 && (
          <p className="outlook-unknowns" data-testid="outlook-unknowns"><span aria-hidden="true">? </span>{unknowns} unknown{unknowns === 1 ? '' : 's'} affect{unknowns === 1 ? 's' : ''} this result.{onShowUnknowns && <> <button type="button" className="link" onClick={onShowUnknowns}>Review unknowns</button></>}</p>
        )}
        {stale && <p className="stale" role="alert">This analysis is out of date for the current inputs.</p>}
      </div>
      {deps.length > 0 && (
        <details className="outlook-deps">
          <summary>Depends on {deps.length} assumption{deps.length === 1 ? '' : 's'}</summary>
          <ul className="plain-list">{deps.map(a => <li key={a}>{assumptionText(a, catalog, capacity)}</li>)}</ul>
        </details>
      )}
    </section>
  );
}

const CLASS_TEXT = { conflict: 'Known conflict', unresolved: 'Unresolved', info: 'Note' } as const;

/**
 * One issue row: mark, plain title, where it applies. The sourced rationale, next step,
 * parameters and assumptions sit behind "Why and sources"; nothing is removed.
 */
export function FindingCard({ finding, catalog, onViewInPlan, children }: { finding: RuleFinding; catalog: CatalogModel | null; onViewInPlan?: (courseId: string) => void; children?: ReactNode }) {
  const mark = findingMark(finding);
  const src = sourceLookup(catalog);
  const params = findingParams(finding, catalog);
  const scope = findingScope(finding, catalog);
  const first = finding.courseIds[0];
  return (
    <li className={`finding finding-${mark.tone}`} data-testid="finding" data-tone={mark.tone} id={`issue-${finding.findingId}`} tabIndex={-1}>
      <div className="finding-head">
        <span className={`mark mark-${mark.tone}`} aria-hidden="true">{mark.icon}</span>
        <div className="finding-main">
          <p className="finding-title"><span className="visually-hidden">{mark.word}: </span><strong>{findingTitle(finding.code)}</strong></p>
          {(scope || (onViewInPlan && first)) && (
            <p className="finding-scope">{scope}{onViewInPlan && first && <> <button type="button" className="link finding-locate" aria-label={`Show in plan: ${courseCode(catalog, first)}`} onClick={() => onViewInPlan(first)}>Show in plan</button></>}</p>
          )}
        </div>
      </div>
      {children}
      <details className="finding-details">
        <summary data-testid="finding-summary">Why and sources</summary>
        <div className="finding-why" data-testid="finding-why">
          <p>{mark.tone === 'potential' ? (finding.status.conditional ? 'Possible issue, conditional on future completion.' : 'Possible issue.') : `${CLASS_TEXT[mark.tone]}.`}</p>
          {finding.nextAction && <p className="next-action">Suggested next step: {humanizeCode(finding.nextAction)}.</p>}
          <p>Rule status: {constraintText(finding)}.</p>
          {finding.courseIds.length > 0 && <p>{finding.courseIds.map(id => courseTitle(catalog, id)).join('; ')}</p>}
          {params.length > 0 && <ul>{params.map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul>}
          {finding.sourceRefs.length > 0 && <ul className="sources" aria-label="Sources">{finding.sourceRefs.map(r => <li key={r}>{src(r)}</li>)}</ul>}
          {finding.assumptions.length > 0 && <p>Assumptions: {finding.assumptions.map(a => assumptionText(a, catalog)).join(' ')}</p>}
          {finding.requirementIds.length > 0 && <p>Requirements: {finding.requirementIds.map(humanizeCode).join(', ')}</p>}
        </div>
      </details>
    </li>
  );
}

/**
 * Summary row for repeated same-kind findings. The course list stays visible; each finding,
 * with its own severity, rationale and sources, stays one click away.
 */
export function FindingGroup({ code, findings, catalog }: { code: string; findings: RuleFinding[]; catalog: CatalogModel | null }) {
  const mark = findingMark(findings[0]!);
  const scopes = findings.map(f => findingScope(f, catalog)).filter(Boolean);
  return (
    <li className={`finding finding-group finding-${mark.tone}`} data-testid="finding-group" data-code={code}>
      <div className="finding-head">
        <span className={`mark mark-${mark.tone}`} aria-hidden="true">{mark.icon}</span>
        <div className="finding-main">
          <p className="finding-title"><span className="visually-hidden">{mark.word}: </span><strong>{groupTitle(code, findings.length)}</strong></p>
          {scopes.length > 0 && <p className="finding-scope">{scopes.join(' · ')}</p>}
        </div>
      </div>
      <details className="finding-details group-details">
        <summary data-testid="group-summary">Show each ({findings.length})</summary>
        <ul className="findings nested">{findings.map(f => <FindingCard key={f.findingId} finding={f} catalog={catalog} />)}</ul>
      </details>
    </li>
  );
}

/** Findings in engine order, with repeated non-conflict findings grouped (see groupFindings). */
export function FindingItems({ findings, catalog, extra, single }: { findings: RuleFinding[]; catalog: CatalogModel | null; extra?: (f: RuleFinding) => ReactNode | null; single?: (f: RuleFinding) => ReactNode }) {
  // Known conflicts and findings carrying a suggested fix are never grouped.
  const items = groupFindings(findings, f => findingMark(f).tone, f => findingMark(f).tone !== 'conflict' && !extra?.(f));
  return (
    <ul className="findings">
      {items.map(it => it.kind === 'single'
        ? (single ? single(it.finding) : <FindingCard key={it.finding.findingId} finding={it.finding} catalog={catalog}>{extra?.(it.finding)}</FindingCard>)
        : <FindingGroup key={`g-${it.code}-${it.findings[0]!.findingId}`} code={it.code} findings={it.findings} catalog={catalog} />)}
    </ul>
  );
}

export function FindingList({ title, findings, catalog, empty, onViewInPlan, canLocate, testId, renderExtra, children }: { title: string; findings: RuleFinding[]; catalog: CatalogModel | null; empty: string; onViewInPlan?: (courseId: string) => void; canLocate?: (courseId: string) => boolean; testId: string; renderExtra?: (f: RuleFinding) => ReactNode; children?: ReactNode }) {
  const id = useId();
  // "Show in plan" only where the course is actually placed, so the control never does nothing.
  const locatable = (f: RuleFinding) => Boolean(onViewInPlan && f.courseIds[0] && (!canLocate || canLocate(f.courseIds[0])));
  return (
    <section aria-labelledby={id} data-testid={testId} className="insp-section">
      <h2 id={id} className="insp-title">{title}{findings.length > 0 && <span className="count"><span className="visually-hidden">: </span>{findings.length}</span>}</h2>
      {findings.length === 0 ? <p className="muted small">{empty}</p> : (
        <ul className="findings">{findings.map(f => <FindingCard key={f.findingId} finding={f} catalog={catalog} {...(onViewInPlan && locatable(f) ? { onViewInPlan } : {})}>{renderExtra?.(f)}</FindingCard>)}</ul>
      )}
      {children}
    </section>
  );
}

export type AvailabilityAnswer = AvailabilityEvidence['report'] | 'skip';

/** Compact evidence for a course row's availability column: one marker, never color alone. */
export function AvailabilityMark({ evidence, unknown }: { evidence: AvailabilityEvidence | undefined; unknown: boolean }) {
  if (evidence) {
    const r = REPORT_UI[evidence.report];
    return <span className={`avail avail-${evidence.report}`} data-testid="availability-mark" title={`Student-reported, unverified. ${formatTimestamp(evidence.observedAt)}.`}><span aria-hidden="true">{r.icon} </span>{r.text}<span className="visually-hidden">, {formatTimestamp(evidence.observedAt)}, unverified</span></span>;
  }
  if (unknown) return <span className="avail avail-none" data-testid="availability-mark">Not checked</span>;
  return null;
}

/**
 * Student offering report. `compact` tucks the optional note behind a disclosure;
 * `hintInSection` leaves the "check it yourself" hint to a surrounding section that shows it once.
 */
export function AvailabilityControl({ courseLabel, term, existing, onAnswer, disabled, compact = false, hintInSection = false, legendId }: { courseLabel: string; term: TermId; existing: AvailabilityEvidence | undefined; onAnswer: (answer: AvailabilityAnswer, notes: string) => void; disabled: boolean; compact?: boolean; hintInSection?: boolean; legendId?: string }) {
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
      <legend id={legendId} tabIndex={legendId ? -1 : undefined}>Is {courseLabel} listed for {termLabel(term)}?</legend>
      {existing ? (
        <p className="evidence" data-testid="availability-evidence">{REPORT_UI[existing.report].text}. {existing.sourceKind === 'student_report' ? 'Student-reported, unverified' : SOURCE_KIND_LABEL[existing.sourceKind]}, <time dateTime={existing.observedAt}>{formatTimestamp(existing.observedAt)}</time>. Not a seat confirmation.</p>
      ) : <p className="evidence">Not checked. Availability stays unknown until you answer.</p>}
      <div className="button-row">
        {(['listed', 'not_listed', 'unknown'] as const).map(r => (
          <button key={r} type="button" className="secondary" disabled={disabled} aria-pressed={existing?.report === r} onClick={() => onAnswer(r, notes)}>{REPORT_LABEL[r]}</button>
        ))}
        <button type="button" className="link" disabled={disabled} onClick={() => onAnswer('skip', notes)}>Skip</button>
      </div>
      {compact ? <details className="note-toggle"><summary>Add a note</summary>{note}</details> : note}
      {!hintInSection && <p className="hint">Check the public class schedule. PathCheck never asks for portal passwords.</p>}
    </fieldset>
  );
}
