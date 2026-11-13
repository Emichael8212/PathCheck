import { useId, useState } from 'react';
import type { AvailabilityEvidence, CatalogModel, PlanPlacement, TermId } from '../../contracts';
import { ORIGIN_LABEL, REPORT_LABEL, courseCode, courseCredits } from '../labels';
import { termLoad, timelineColumns } from '../planView';
import { termKey, termLabel } from '../terms';
import { AvailabilityControl } from './Display';
import type { AvailabilityAnswer } from './Display';

export interface TimelineHandlers {
  onMove(placement: PlanPlacement, to: TermId, mode: 'apply' | 'preview'): void;
  onRemove(placement: PlanPlacement, mode: 'apply' | 'preview'): void;
  onReport(courseId: string, term: TermId, answer: AvailabilityAnswer, notes: string): void;
}

function CreditText({ credits }: { credits: number | null }) {
  return <span className="credits">{credits === null ? 'credits unknown' : `${credits} cr`}</span>;
}

function PlacementCard({ placement, catalog, terms, evidence, highlighted, busy, handlers }: { placement: PlanPlacement; catalog: CatalogModel; terms: TermId[]; evidence: AvailabilityEvidence | undefined; highlighted: boolean; busy: boolean; handlers: TimelineHandlers }) {
  const moveId = useId();
  const others = terms.filter(t => t.sortIndex !== placement.termId.sortIndex);
  const [to, setTo] = useState(others[0] ? termKey(others[0]) : '');
  const course = catalog.courses[placement.courseId];
  const target = terms.find(t => termKey(t) === to) ?? null;
  const code = courseCode(catalog, placement.courseId);
  return (
    <li className={`placement origin-${placement.origin}${highlighted ? ' highlighted' : ''}`} data-course={placement.courseId} data-origin={placement.origin} data-testid="placement" tabIndex={-1}>
      <p className="placement-title"><span className="code" translate="no">{code}</span> <CreditText credits={courseCredits(catalog, placement.courseId)} /></p>
      {course && <span className="course-name">{course.title}{course.status === 'pending' ? ' (pending)' : ''}</span>}
      <p className="placement-meta">
        <span className={`badge badge-origin-${placement.origin}`}>{ORIGIN_LABEL[placement.origin]}</span>
        {evidence && <span className="badge badge-student">{REPORT_LABEL[evidence.report]}, student-reported</span>}
      </p>
      <details className="placement-actions">
        <summary aria-label={`Edit ${code}`}>Edit</summary>
        {others.length > 0 && (
          <div className="move-row">
            <label htmlFor={moveId}>Move {code} to</label>
            <select id={moveId} value={to} onChange={e => setTo(e.target.value)}>
              {others.map(t => <option key={termKey(t)} value={termKey(t)}>{termLabel(t)}</option>)}
            </select>
            <button type="button" disabled={busy || !target} onClick={() => target && handlers.onMove(placement, target, 'apply')}>Move</button>
            <button type="button" className="secondary" disabled={busy || !target} onClick={() => target && handlers.onMove(placement, target, 'preview')}>Preview move</button>
          </div>
        )}
        <div className="button-row">
          <button type="button" className="danger" disabled={busy} onClick={() => handlers.onRemove(placement, 'apply')}>Remove {code}</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => handlers.onRemove(placement, 'preview')}>Preview removal</button>
        </div>
        <AvailabilityControl courseLabel={code} term={placement.termId} existing={evidence} disabled={busy} onAnswer={(a, n) => handlers.onReport(placement.courseId, placement.termId, a, n)} />
      </details>
    </li>
  );
}

export function Timeline({ catalog, terms, active, projected, evidence, capacity, highlightCourse, busy, handlers }: { catalog: CatalogModel; terms: TermId[]; active: PlanPlacement[]; projected: PlanPlacement[]; evidence: AvailabilityEvidence[]; capacity: number; highlightCourse: string | null; busy: boolean; handlers: TimelineHandlers }) {
  const columns = timelineColumns(terms, active, projected);
  const creditsOf = (id: string) => courseCredits(catalog, id);
  return (
    <section className="timeline" aria-labelledby="timeline-title" data-testid="timeline">
      <div className="timeline-head">
        <h2 id="timeline-title" tabIndex={-1}>Semester plan</h2>
        <ul className="legend" aria-label="Course origin">
          <li><span className="badge badge-origin-student_selected">{ORIGIN_LABEL.student_selected}</span></li>
          <li><span className="badge badge-origin-adopted_suggestion">{ORIGIN_LABEL.adopted_suggestion}</span></li>
          <li><span className="badge badge-origin-system_projection">{ORIGIN_LABEL.system_projection}</span></li>
        </ul>
      </div>
      <div className="terms">
        {columns.map(col => {
          const load = termLoad(col.active, creditsOf);
          const over = load.known > capacity;
          return (
            <details key={termKey(col.term)} className="term" open data-testid="term" data-term={termKey(col.term)}>
              <summary>
                <span className="term-name">{termLabel(col.term)}</span>
                <span className={`load${over ? ' load-over' : ''}`} data-testid="term-load">
                  {load.known} of {capacity} cr{load.unknown > 0 ? `, ${load.unknown} unknown` : ''}{over ? ', over modeled load' : ''}{col.projected.length ? `, ${col.projected.length} projected` : ''}
                </span>
              </summary>
              {col.active.length === 0 && col.projected.length === 0 && <p className="term-empty">No courses planned.</p>}
              {(col.active.length > 0 || col.projected.length > 0) && (
                <ul className="placements">
                  {col.active.map(p => (
                    <PlacementCard key={p.placementId} placement={p} catalog={catalog} terms={terms} busy={busy} handlers={handlers}
                      highlighted={highlightCourse === p.courseId}
                      evidence={evidence.find(e => e.courseId === p.courseId && e.termId.sortIndex === p.termId.sortIndex)} />
                  ))}
                  {col.projected.map(p => (
                    <li key={p.placementId} className="placement origin-system_projection" data-testid="projected-placement" data-course={p.courseId} data-origin={p.origin}>
                      <p className="placement-title"><span className="code" translate="no">{courseCode(catalog, p.courseId)}</span> <CreditText credits={creditsOf(p.courseId)} /></p>
                      {catalog.courses[p.courseId] && <span className="course-name">{catalog.courses[p.courseId]!.title}</span>}
                      <p className="placement-meta"><span className="badge badge-origin-system_projection">{ORIGIN_LABEL.system_projection}</span></p>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}
