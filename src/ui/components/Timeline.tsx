import { useEffect, useId, useRef, useState } from 'react';
import type { AvailabilityEvidence, CatalogModel, PlanPlacement, RuleFinding, TermId } from '../../contracts';
import { ORIGIN_UI, courseCode, courseCredits, findingMark } from '../labels';
import { termLoad, timelineColumns } from '../planView';
import type { ChangeRow } from '../planView';
import { termKey, termLabel } from '../terms';
import { AvailabilityControl, AvailabilityMark } from './Display';
import type { AvailabilityAnswer } from './Display';

export interface TimelineHandlers {
  onMove(placement: PlanPlacement, to: TermId, mode: 'apply' | 'preview'): void;
  onRemove(placement: PlanPlacement, mode: 'apply' | 'preview'): void;
  onReport(courseId: string, term: TermId, answer: AvailabilityAnswer, notes: string): void;
}

/** Engine-derived context for rows; the timeline renders it and never computes academic status. */
export interface RowContext {
  /** Engine findings whose primary course and term are this placement. */
  findingsFor(placement: PlanPlacement): RuleFinding[];
  /** True when the engine reports the offering for this course and term as unknown. */
  offeringUnknown(courseId: string, term: TermId): boolean;
  onShowIssue(findingId: string): void;
}

const termAnchor = (t: TermId) => `term-${termKey(t)}`;

function Credits({ credits }: { credits: number | null }) {
  return <span className="c-cr credits">{credits === null ? 'Credits unknown' : <>{credits}<span className="unit"> cr</span></>}</span>;
}

/** Status cell: one short marker linking to the full explanation in the inspector. */
function RowStatus({ findings, code, onShowIssue }: { findings: RuleFinding[]; code: string; onShowIssue: (id: string) => void }) {
  if (findings.length === 0) return <span className="c-status" />;
  const marks = findings.map(f => ({ f, m: findingMark(f) }));
  const conflicts = marks.filter(x => x.m.tone === 'conflict');
  const lead = conflicts[0] ?? marks.find(x => x.m.tone === 'potential') ?? marks[0]!;
  const text = conflicts.length > 1 ? `${conflicts.length} conflicts` : lead.m.word.replace(' (conditional)', '');
  return (
    <span className="c-status">
      <button type="button" className={`status-link mark-${lead.m.tone}`} aria-label={`${text} for ${code}. Show details`} onClick={() => onShowIssue(lead.f.findingId)}>
        <span aria-hidden="true">{lead.m.icon} </span>{text}
      </button>
    </span>
  );
}

/** Row actions in a glass popover. Escape or a click outside closes it; focus returns to Edit. */
function RowMenu({ placement, code, terms, evidence, busy, handlers }: { placement: PlanPlacement; code: string; terms: TermId[]; evidence: AvailabilityEvidence | undefined; busy: boolean; handlers: TimelineHandlers }) {
  const moveId = useId();
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const others = terms.filter(t => t.sortIndex !== placement.termId.sortIndex);
  const [chosen, setTo] = useState(others[0] ? termKey(others[0]) : '');
  // If the horizon changes (e.g. summer toggled), a remembered choice can vanish from the
  // options; fall back to what the select actually shows, never to the current term.
  const target = others.find(t => termKey(t) === chosen) ?? others[0] ?? null;
  const to = target ? termKey(target) : '';
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false; };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return (
    <details className={`row-menu${up ? ' opens-up' : ''}`} ref={ref} onToggle={e => {
      const el = e.currentTarget;
      setOpen(el.open);
      if (!el.open) return;
      // Open upward when the panel would run under the floating capsule and there is room above.
      const anchor = el.querySelector('summary')!.getBoundingClientRect();
      const height = el.querySelector<HTMLElement>('.row-menu-panel')?.offsetHeight ?? 0;
      setUp(anchor.bottom + height + 104 > window.innerHeight && anchor.top - height - 8 > 64);
    }}
      onKeyDown={e => { if (e.key === 'Escape' && ref.current?.open) { e.stopPropagation(); ref.current.open = false; ref.current.querySelector('summary')?.focus(); } }}>
      <summary aria-label={`Edit ${code}`}>Edit</summary>
      <div className="row-menu-panel glass" role="group" aria-label={`Change ${code}`}>
        {others.length > 0 && (
          <div className="menu-group">
            <label htmlFor={moveId}>Move {code} to</label>
            <div className="move-row">
              <select id={moveId} value={to} onChange={e => setTo(e.target.value)}>
                {others.map(t => <option key={termKey(t)} value={termKey(t)}>{termLabel(t)}</option>)}
              </select>
              <button type="button" disabled={busy || !target} onClick={() => target && handlers.onMove(placement, target, 'apply')}>Move</button>
              <button type="button" className="secondary" disabled={busy || !target} onClick={() => target && handlers.onMove(placement, target, 'preview')}>Preview move</button>
            </div>
          </div>
        )}
        <div className="menu-group button-row">
          <button type="button" className="danger" disabled={busy} onClick={() => handlers.onRemove(placement, 'apply')}>Remove {code}</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => handlers.onRemove(placement, 'preview')}>Preview removal</button>
        </div>
        <AvailabilityControl compact courseLabel={code} term={placement.termId} existing={evidence} disabled={busy} onAnswer={(a, n) => handlers.onReport(placement.courseId, placement.termId, a, n)} />
      </div>
    </details>
  );
}

function PlacementRow({ placement, catalog, terms, evidence, highlighted, leaving, busy, handlers, context }: { placement: PlanPlacement; catalog: CatalogModel; terms: TermId[]; evidence: AvailabilityEvidence | undefined; highlighted: boolean; leaving: ChangeRow | null; busy: boolean; handlers: TimelineHandlers; context: RowContext }) {
  const course = catalog.courses[placement.courseId];
  const code = courseCode(catalog, placement.courseId);
  const origin = ORIGIN_UI[placement.origin];
  return (
    <li className={`placement origin-${placement.origin}${highlighted ? ' highlighted' : ''}${leaving ? ' leaving' : ''}`} data-course={placement.courseId} data-origin={placement.origin} data-testid="placement" tabIndex={-1}>
      <span className="c-code code" translate="no">{code}</span>
      <span className="c-title">
        <span className="course-name">{course ? course.title : placement.courseId}{course?.status === 'pending' ? ' (pending)' : ''}</span>
        {origin.tag ? <span className={`tag tag-${placement.origin}`}>{origin.tag}<span className="visually-hidden">: {origin.sr}</span></span> : <span className="visually-hidden">. {origin.sr}</span>}
        {leaving && <span className="preview-note" data-testid="preview-leaving">{leaving.after ? `Moves to ${termLabel(leaving.after)} in preview` : 'Removed in preview'}</span>}
      </span>
      <Credits credits={courseCredits(catalog, placement.courseId)} />
      <span className="c-avail"><AvailabilityMark evidence={evidence} unknown={context.offeringUnknown(placement.courseId, placement.termId)} /></span>
      <RowStatus findings={context.findingsFor(placement)} code={code} onShowIssue={context.onShowIssue} />
      <span className="c-edit"><RowMenu placement={placement} code={code} terms={terms} evidence={evidence} busy={busy} handlers={handlers} /></span>
    </li>
  );
}

export function Timeline({ catalog, terms, targetTerm, active, projected, evidence, capacity, highlightCourse, busy, handlers, context, changes }: { catalog: CatalogModel; terms: TermId[]; targetTerm: TermId; active: PlanPlacement[]; projected: PlanPlacement[]; evidence: AvailabilityEvidence[]; capacity: number; highlightCourse: string | null; busy: boolean; handlers: TimelineHandlers; context: RowContext; changes: ChangeRow[] | null }) {
  const columns = timelineColumns(terms, active, projected);
  const creditsOf = (id: string) => courseCredits(catalog, id);
  const evidenceFor = (p: PlanPlacement) => evidence.find(e => e.courseId === p.courseId && e.termId.sortIndex === p.termId.sortIndex);
  // Preview presentation only: arithmetic over the exact change rows, no re-evaluation.
  const leavingRow = (p: PlanPlacement) => changes?.find(c => c.courseId === p.courseId && c.before?.sortIndex === p.termId.sortIndex) ?? null;
  const arrivals = (t: TermId) => changes?.filter(c => c.after?.sortIndex === t.sortIndex) ?? [];
  const delta = (t: TermId) => {
    if (!changes) return 0;
    let d = 0;
    for (const c of changes) {
      const cr = creditsOf(c.courseId) ?? 0;
      if (c.before?.sortIndex === t.sortIndex) d -= cr;
      if (c.after?.sortIndex === t.sortIndex) d += cr;
    }
    return d;
  };
  const affected = (t: TermId) => Boolean(changes?.some(c => c.before?.sortIndex === t.sortIndex || c.after?.sortIndex === t.sortIndex));
  const jump = (t: TermId) => {
    const h = document.getElementById(termAnchor(t));
    if (h) { h.scrollIntoView({ block: 'start' }); h.focus({ preventScroll: true }); }
  };

  return (
    <section className="timeline" aria-labelledby="timeline-title" data-testid="timeline">
      <nav className="term-strip" aria-label="Jump to semester" data-testid="term-strip">
        <ul>
          {columns.map(col => {
            const load = termLoad(col.active, creditsOf);
            const conflict = col.active.some(p => context.findingsFor(p).some(f => findingMark(f).tone === 'conflict'));
            const target = col.term.sortIndex === targetTerm.sortIndex;
            return (
              <li key={termKey(col.term)}>
                <button type="button" className={`strip-term${affected(col.term) ? ' is-affected' : ''}`} onClick={() => jump(col.term)}>
                  <span className="strip-name">{termLabel(col.term)}</span>
                  <span className="strip-load">{target && col.active.length === 0 ? 'Target' : `${load.known}/${capacity}`}{conflict && <span className="strip-conflict"><span aria-hidden="true"> ⛔</span><span className="visually-hidden">, has conflicts</span></span>}</span>
                  <span className="meter" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.round((load.known / Math.max(capacity, 1)) * 100))}%` }} /></span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="col-head" aria-hidden="true"><span>Course</span><span>Title</span><span className="r">Credits</span><span>Availability</span><span>Status</span><span /></div>
      <div className="terms">
        {columns.map(col => {
          const load = termLoad(col.active, creditsOf);
          const over = load.known > capacity;
          const d = delta(col.term);
          const arriving = arrivals(col.term);
          const isTarget = col.term.sortIndex === targetTerm.sortIndex;
          const empty = col.active.length === 0 && col.projected.length === 0 && arriving.length === 0;
          return (
            <section key={termKey(col.term)} className={`term${empty ? ' term-empty' : ''}${affected(col.term) ? ' is-affected' : ''}`} data-testid="term" data-term={termKey(col.term)} aria-labelledby={termAnchor(col.term)}>
              <header className="term-head">
                <h3 className="term-name" id={termAnchor(col.term)} tabIndex={-1}>{termLabel(col.term)}{isTarget && <span className="term-target"> · Graduation target</span>}</h3>
                <span className={`load${over ? ' load-over' : ''}`} data-testid="term-load">
                  {empty ? 'No courses planned' : <>
                    {changes && d !== 0 ? <>{load.known} → {load.known + d}</> : load.known} of {capacity} credits{load.unknown > 0 ? `, ${load.unknown} unknown` : ''}{over ? ', over the limit' : ''}{col.projected.length ? `, ${col.projected.length} draft` : ''}
                  </>}
                </span>
              </header>
              {!empty && (
                <ul className="placements">
                  {col.active.map(p => (
                    <PlacementRow key={p.placementId} placement={p} catalog={catalog} terms={terms} busy={busy} handlers={handlers} context={context}
                      highlighted={highlightCourse === p.courseId} leaving={leavingRow(p)} evidence={evidenceFor(p)} />
                  ))}
                  {col.projected.map(p => (
                    <li key={p.placementId} className="placement origin-system_projection" data-testid="projected-placement" data-course={p.courseId} data-origin={p.origin}>
                      <span className="c-code code" translate="no">{courseCode(catalog, p.courseId)}</span>
                      <span className="c-title"><span className="course-name">{catalog.courses[p.courseId]?.title ?? p.courseId}</span><span className="tag tag-system_projection">{ORIGIN_UI.system_projection.tag}<span className="visually-hidden">: {ORIGIN_UI.system_projection.sr}</span></span></span>
                      <Credits credits={creditsOf(p.courseId)} />
                      <span className="c-avail" /><span className="c-status" /><span className="c-edit" />
                    </li>
                  ))}
                  {arriving.map((c, i) => (
                    <li key={`arrive-${c.courseId}-${i}`} className="placement arriving" data-testid="preview-arrival" data-course={c.courseId}>
                      <span className="c-code code" translate="no">{courseCode(catalog, c.courseId)}</span>
                      <span className="c-title"><span className="course-name">{catalog.courses[c.courseId]?.title ?? c.courseId}</span><span className="preview-note">{c.before ? `Arrives from ${termLabel(c.before)} in preview` : 'Added in preview'}</span></span>
                      <Credits credits={creditsOf(c.courseId)} />
                      <span className="c-avail" /><span className="c-status" /><span className="c-edit" />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      <ul className="legend" aria-label="Course markers">
        <li><span className="swatch swatch-student" aria-hidden="true" />Your selection</li>
        <li><span className="swatch swatch-adopted" aria-hidden="true" /><span className="tag tag-adopted_suggestion">Suggested</span> adopted from PathCheck</li>
        <li><span className="swatch swatch-draft" aria-hidden="true" /><span className="tag tag-system_projection">Draft</span> not adopted</li>
      </ul>
    </section>
  );
}
