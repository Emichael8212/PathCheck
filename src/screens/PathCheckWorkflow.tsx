import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AcademicRecord, AnalysisResult, CandidatePreview, CatalogModel, ChangeSet, GuestDraft, Plan, PlanPlacement, Result,
  SavedPlan, TermId, TypedFailure, UndoCheckpoint, ValidatedExtractedRows,
} from '../contracts';
import { exportFileName } from '../export/pdfExportService';
import { AccountPanel } from '../ui/components/AccountPanel';
import type { SyncState } from '../ui/components/AccountPanel';
import type { AvailabilityAnswer, NoticeState } from '../ui/components/Display';
import { CatalogChip, NoticeAlert, NoticeCapsule } from '../ui/components/Display';
import type { RowMatch } from '../ui/components/ManualRecordEditor';
import type { DraftState } from '../ui/components/Proposals';
import { failureText } from '../ui/labels';
import { attemptToRow, emptyRow, toProposedRow, validateRow } from '../ui/rows';
import type { ManualRowDraft } from '../ui/rows';
import type { ProposedRecord } from './AcademicRecordScreen';
import { EMPTY_RECORD, buildScenario, evaluateChecked, guard, guardAsync, makeAction, scenarioFingerprint } from '../ui/scenario';
import type { CapacityAssumption } from '../ui/scenario';
import type { WorkflowServices } from '../ui/services';
import { planningHorizon, termFromIndex, termKey, termSequence, upcomingTerm } from '../ui/terms';
import { downloadBlob } from '../ui/upload';
import { AcademicRecordScreen } from './AcademicRecordScreen';
import { GetStartedScreen } from './GetStartedScreen';
import { PlannerScreen } from './PlannerScreen';
import '../styles/pathcheck.css';

type Screen = 'start' | 'record' | 'planner';
const STEPS: Array<{ id: Screen; label: string }> = [{ id: 'start', label: 'Get started' }, { id: 'record', label: 'Academic record' }, { id: 'planner', label: 'Graduation planner' }];
const DEFAULT_CAPACITY: CapacityAssumption = { maximum: 15, source: 'scenario_assumption' };

/**
 * PathCheck three-screen guest workflow. Lead composes `services` (frozen) in src/app.
 * All academic results come from services.academic (E); every Plan/record change goes
 * through services.commands (L). The UI only holds the latest values those ports return.
 */
export function PathCheckWorkflow({ services }: { services: WorkflowServices }) {
  const { academic, commands, clock, config, exporter } = services;
  const [initialNow] = useState(() => clock.now());
  const [catalogs] = useState<Result<import('../contracts').CatalogRef[]>>(() => guard(() => academic.listCatalogs(), 'catalog_list_failed'));
  const [screen, setScreen] = useState<Screen>('start');
  const [selectedVersion, setSelectedVersion] = useState('');
  const [catalog, setCatalog] = useState<CatalogModel | null>(null);
  const [catalogError, setCatalogError] = useState<TypedFailure | null>(null);
  const [targetKey, setTargetKey] = useState('');
  const [includeSummer, setIncludeSummer] = useState(false);
  const [capacity, setCapacity] = useState<CapacityAssumption>(DEFAULT_CAPACITY);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [record, setRecord] = useState<AcademicRecord>(EMPTY_RECORD);
  const [rows, setRows] = useState<ManualRowDraft[]>([]);
  const [showRowErrors, setShowRowErrors] = useState(false);
  const [recordDirty, setRecordDirty] = useState(false);
  const [proposed, setProposed] = useState<ProposedRecord | null>(null);
  // Last successful normalization, kept after acceptance so accepted rows keep their Match status.
  const [lastNormalized, setLastNormalized] = useState<ProposedRecord | null>(null);
  const [errorSignal, setErrorSignal] = useState(0);
  const [extracted, setExtracted] = useState<ValidatedExtractedRows | null>(null);
  const [evaluatedAt, setEvaluatedAt] = useState(initialNow);
  const [path, setPath] = useState<'selected' | 'generated' | null>(null);
  const [draft, setDraft] = useState<DraftState>(null);
  const [preview, setPreview] = useState<CandidatePreview | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);
  const [undo, setUndo] = useState<UndoCheckpoint | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busy, setBusy] = useState(false);
  const [cloud, setCloud] = useState<{ id: string; revision: number } | null>(null);
  const [sync, setSync] = useState<SyncState>('local');
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  // Move focus to the new screen's heading after navigation (not on first load, so the
  // skip link stays the first tab stop).
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const h1 = mainRef.current?.querySelector<HTMLElement>('h1');
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus(); }
  }, [screen, path]);

  const start = useMemo(() => upcomingTerm(initialNow, includeSummer), [initialNow, includeSummer]);
  const targetOptions = useMemo(() => termSequence(start, 16, includeSummer), [start, includeSummer]);
  const recordTerms = useMemo(() => termSequence(termFromIndex(start.sortIndex - 24), 24, true).filter(t => t.sortIndex < start.sortIndex).reverse(), [start]);
  const horizon = useMemo(() => (plan ? planningHorizon(start, plan.targetTerm, config.searchOptions.horizonTerms, includeSummer, plan.activePlacements.map(p => p.termId)) : null), [plan, start, includeSummer, config]);
  const scenarioResult = useMemo(() => (catalog && plan && horizon ? buildScenario({ catalog, record, plan, terms: horizon.terms, capacity, config, evaluatedAt }) : null), [catalog, record, plan, horizon, capacity, config, evaluatedAt]);
  const scenario = scenarioResult?.ok ? scenarioResult.value : null;
  const currentFp = useMemo(() => (scenario ? scenarioFingerprint(scenario) : null), [scenario]);
  const analysis = useMemo<Result<AnalysisResult> | null>(() => (scenario && path ? evaluateChecked(academic, scenario) : null), [academic, scenario, path]);
  const stale = Boolean(analysis?.ok && analysis.value.inputFingerprint !== currentFp);
  const candidates = analysis?.ok ? analysis.value.candidates.filter(c => !rejected.includes(`${c.previewId}|${c.baseFingerprint}`)) : [];

  const say = (tone: 'ok' | 'error' | 'info', text: string) => setNotice({ tone, text });
  const touched = () => setSync(s => (cloud && s !== 'conflict' ? 'unsynced' : s));
  const failed = (f: TypedFailure) => say('error', failureText(f));

  function resetPlanning() {
    setPath(null); setDraft(null); setPreview(null); setRejected([]); setUndo(null);
  }

  // ---- Screen 1 -------------------------------------------------------------
  function selectCatalog(version: string) {
    setSelectedVersion(version); setCatalog(null); setCatalogError(null);
    if (!catalogs.ok || version === '') return;
    const ref = catalogs.value.find(r => r.catalogVersion === version);
    if (!ref) return;
    const loaded = guard(() => academic.loadValidatedCatalog(ref), 'catalog_load_failed');
    if (loaded.ok) setCatalog(loaded.value); else setCatalogError(loaded);
  }

  function continueFromStart() {
    if (!catalog || targetKey === '') return;
    const target = termFromIndex(Number(targetKey));
    if (!plan) {
      const r = guard(() => commands.createGuestPlan(catalog.catalogRef, target, makeAction(clock, 'create')), 'create_failed');
      if (!r.ok) return failed(r);
      setPlan(r.value);
    } else if (plan.targetTerm.sortIndex !== target.sortIndex) {
      if (!scenario) return say('error', 'The current plan inputs are invalid, so the target cannot be changed.');
      const r = guard(() => commands.setTargetTerm(scenario, target, makeAction(clock, 'set_target')), 'set_target_failed');
      if (!r.ok) return failed(r);
      setPlan(r.value.plan); setUndo(null); touched();
      say('info', 'Target changed. Projections and previews were recalculated.');
    }
    setNotice(null);
    setScreen('record');
  }

  function startOver() {
    setPlan(null); setRecord(EMPTY_RECORD); setRows([]); setProposed(null); setLastNormalized(null); setExtracted(null); setRecordDirty(false);
    setCatalog(null); setSelectedVersion(''); setTargetKey(''); setCloud(null); setSync('local'); setCapacity(DEFAULT_CAPACITY);
    resetPlanning(); setScreen('start'); say('info', 'Started over. Nothing was saved.');
  }

  // ---- Screen 2 -------------------------------------------------------------
  function editRows(next: ManualRowDraft[]) { setRows(next); setRecordDirty(true); setProposed(null); }

  const rowsInvalid = (list: ManualRowDraft[]) => list.some(r => Object.keys(validateRow(r)).length > 0);

  /** E-owned normalization of the current raw rows (manual plus any validated extraction). */
  function normalize(): Result<ProposedRecord> | null {
    if (!catalog) return null;
    const manualRows = rows.map(toProposedRow);
    const input = extracted ? { kind: 'mixed_rows' as const, extracted, manualRows } : { kind: 'manual_rows' as const, rows: manualRows };
    return guard(() => academic.normalizeAttempts(input, catalog), 'normalize_failed');
  }

  // Matching runs automatically shortly after edits to valid rows. It is pure, saves nothing
  // and never accepts: the record changes only through the explicit Accept below.
  useEffect(() => {
    if (!catalog || !recordDirty || rowsInvalid(rows)) return;
    const timer = setTimeout(() => {
      const r = normalize();
      if (r?.ok) { setProposed(r.value); setLastNormalized(r.value); }
      else if (r) failed(r);
    }, 250);
    return () => clearTimeout(timer);
  }, [rows, extracted, catalog, recordDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The one required explicit step: L's acceptRecord with an accept_record action, then the planner. */
  function acceptAndContinue() {
    if (rowsInvalid(rows)) {
      setShowRowErrors(true); setErrorSignal(x => x + 1);
      return say('error', 'Some courses need corrections before you can continue.');
    }
    const normalized = normalize();
    if (!normalized) return;
    if (!normalized.ok) return failed(normalized);
    setProposed(normalized.value); setLastNormalized(normalized.value);
    if (!scenario) return say('error', 'The record cannot be accepted because the plan inputs are invalid.');
    const r = guard(() => commands.acceptRecord(scenario, normalized.value.record, makeAction(clock, 'accept_record')), 'accept_failed');
    if (!r.ok) return failed(r);
    setRecord(r.value.record); setProposed(null); setRecordDirty(false); setShowRowErrors(false); setUndo(null); touched();
    say('ok', 'Record accepted. Your plan is checked against it.');
    setScreen('planner');
  }

  function matchFor(row: ManualRowDraft): RowMatch {
    const errors = validateRow(row);
    if (Object.keys(errors).length > 0) return { state: 'incomplete', notes: [], needs: Object.keys(errors).map(k => ({ courseCode: 'code', status: 'status', attemptedCredits: 'credits', earnedCredits: 'credits', grade: 'grade' } as Record<string, string>)[k] ?? k).filter((v, i, a) => a.indexOf(v) === i) };
    const source = proposed ?? (recordDirty ? null : lastNormalized);
    const notes = (source?.warnings ?? []).filter(w => w.endsWith(`:${row.rowId}`)).map(w => w.slice(0, -(row.rowId.length + 1)));
    if (source) return { state: source.unmatched.includes(row.rowId) ? 'unmatched' : 'matched', notes };
    if (recordDirty) return { state: 'pending', notes: [] };
    // Reopened saved work: rows were created from accepted attempts (rowId = attemptId).
    const attempt = record.courseAttempts.find(a => a.attemptId === row.rowId);
    return { state: attempt && attempt.normalizedCourseId === null ? 'unmatched' : 'matched', notes: [] };
  }

  // ---- Screen 3 -------------------------------------------------------------
  function changeSet(operations: ChangeSet['operations']): ChangeSet | null {
    return currentFp ? { baseFingerprint: currentFp, operations } : null;
  }

  function studentEdit(operations: ChangeSet['operations'], done: string) {
    const cs = changeSet(operations);
    if (!scenario || !cs) return say('error', 'The plan inputs are invalid; no change was made.');
    const r = guard(() => commands.recordStudentSelections(scenario, cs, makeAction(clock, 'student_edit')), 'student_edit_failed');
    if (!r.ok) return failed(r);
    // L clears its single-use undo checkpoint on every other successful command.
    setPlan(r.value.plan); setUndo(null); touched(); say('ok', done);
  }

  function previewChange(operations: ChangeSet['operations']) {
    const cs = changeSet(operations);
    if (!scenario || !cs) return say('error', 'The plan inputs are invalid; nothing to preview.');
    const r = guard(() => academic.preview(scenario, cs), 'preview_failed');
    if (!r.ok) return failed(r);
    setPreview(r.value); say('info', 'Preview ready. Your active plan has not changed.');
  }

  function addCourse(courseId: string, term: TermId) {
    const placement: PlanPlacement = { placementId: clock.newId('placement'), courseId, termId: term, origin: 'student_selected', active: true };
    studentEdit([{ kind: 'add', placement }], 'Course added to your plan.');
  }

  function report(courseId: string, termId: TermId, answer: AvailabilityAnswer, notes: string) {
    if (!scenario) return;
    const action = makeAction(clock, 'availability');
    const input = answer === 'skip'
      ? { kind: 'skip' as const, courseId, termId }
      : { courseId, termId, report: answer, sourceKind: 'student_report' as const, sourceRef: clock.newId('student-report'), observedAt: action.occurredAt, notes: notes.trim() === '' ? null : notes.trim() };
    const r = guard(() => commands.recordAvailability(scenario, input, action), 'availability_failed');
    if (!r.ok) return failed(r);
    // L returns a re-parsed (non-identical) plan for Skip; only a new revision is a change.
    if (r.value.plan.planRevision !== scenario.plan.planRevision) { setPlan(r.value.plan); setUndo(null); touched(); }
    say('ok', answer === 'skip' ? 'Skipped. The offering stays unknown.' : 'Offering report saved as student-reported, unverified evidence.');
  }

  function applyPreview(acks: string[]) {
    if (!scenario || !preview) return;
    const r = guard(() => commands.applyPreview(scenario, preview, makeAction(clock, 'apply', acks)), 'apply_failed');
    if (!r.ok) return failed(r);
    setPlan(r.value.plan); setUndo(r.value.undo); setPreview(null); touched();
    say('ok', 'Change applied. You can undo it.');
  }

  function rejectPreview() {
    if (!plan || !preview) return;
    const session = guard(() => ({ ok: true as const, value: commands.rejectPreview({ plan, previews: [preview, ...candidates] }, preview.previewId) }), 'reject_failed');
    if (!session.ok) return failed(session);
    setRejected(x => [...x, `${preview.previewId}|${preview.baseFingerprint}`]);
    setPreview(null); say('info', 'Change cancelled. Your plan is unchanged.');
  }

  function undoLast() {
    if (!scenario || !undo) return;
    const r = guard(() => commands.undoLast(scenario, undo, makeAction(clock, 'undo')), 'undo_failed');
    setUndo(null);
    if (!r.ok) return failed(r);
    setPlan(r.value.plan); touched(); say('ok', 'Undone. The earlier placements were restored as a new revision.');
  }

  function generate() {
    if (!scenario) return say('error', 'The plan inputs are invalid; no draft was generated.');
    const r = guard(() => academic.generateDraft(scenario), 'generate_failed');
    if (!r.ok) setDraft({ kind: 'failed', failure: r });
    else if ('kind' in r.value) setDraft({ kind: 'no_valid_draft', expansions: r.value.expansions });
    else setDraft({ kind: 'draft', draft: r.value });
  }

  function adopt(acks: string[]) {
    if (!scenario || draft?.kind !== 'draft') return;
    const r = guard(() => commands.adoptDraft(scenario, draft.draft, makeAction(clock, 'adopt', acks)), 'adopt_failed');
    if (!r.ok) return failed(r);
    setPlan(r.value.plan); setUndo(r.value.undo); setDraft(null); touched();
    say('ok', 'Draft adopted as PathCheck suggestions. You can edit or undo.');
  }

  function choosePath(next: 'selected' | 'generated') {
    setPath(next);
    if (next === 'generated') generate();
  }

  async function exportPdf() {
    if (!scenario || !analysis?.ok) return;
    setBusy(true);
    const r = await guardAsync(() => exporter.exportPdf(scenario, analysis.value), 'export_failed');
    setBusy(false);
    if (!r.ok) return say('error', `The PDF was not created and nothing was downloaded. ${failureText(r)}`);
    downloadBlob(r.value, exportFileName(clock.now()));
    say('ok', 'PDF exported with your active plan only.');
  }

  // ---- Account / recovery ---------------------------------------------------
  function loadWork(input: { record: AcademicRecord; plan: Plan }, cloudRef: { id: string; revision: number } | null) {
    const loaded = guard(() => academic.loadValidatedCatalog(input.plan.catalogRef), 'catalog_load_failed');
    if (!loaded.ok) return failed(loaded);
    setCatalog(loaded.value); setSelectedVersion(input.plan.catalogRef.catalogVersion); setCatalogError(null);
    setPlan(input.plan); setRecord(input.record); setRows(input.record.courseAttempts.map(attemptToRow));
    setTargetKey(termKey(input.plan.targetTerm)); setProposed(null); setLastNormalized(null); setExtracted(null); setRecordDirty(false);
    setEvaluatedAt(clock.now()); resetPlanning(); setPath('selected'); setScreen('planner');
    setCloud(cloudRef); setSync(cloudRef ? 'saved' : 'local');
  }

  const work = plan ? { record, plan } : null;
  // Undo is offered only on the planner while the scenario still matches the checkpoint
  // (capacity, summer or re-evaluation changes would make L refuse it as stale_undo).
  const undoAvailable = screen === 'planner' && path !== null && undo !== null && undo.afterFingerprint === currentFp;
  // A screen is reachable only when its inputs exist; the planner also needs an accepted,
  // unedited record so no unreviewed rows silently feed the analysis.
  const reachable: Record<Screen, boolean> = { start: true, record: plan !== null && catalog !== null, planner: plan !== null && catalog !== null && !recordDirty && proposed === null };
  function goTo(next: Screen) {
    if (!reachable[next] || next === screen) return;
    if (screen === 'start' && plan) setTargetKey(termKey(plan.targetTerm)); // unconfirmed target edits are dropped
    setNotice(null); setScreen(next);
  }

  return (
    <div className="pathcheck">
      <a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); mainRef.current?.focus(); }}>Skip to main content</a>
      <header className="app-header glass-bar">
        <div className="header-inner">
          <p className="brand" translate="no">PathCheck</p>
          {catalog && <CatalogChip catalog={catalog} />}
          <nav aria-label="PathCheck steps" className="steps-nav">
            <ol className="steps">
              {STEPS.map(s => (
                <li key={s.id}>
                  <button type="button" className="step" aria-current={screen === s.id ? 'step' : undefined} disabled={!reachable[s.id]} onClick={() => goTo(s.id)}>{s.label}</button>
                </li>
              ))}
            </ol>
          </nav>
          <AccountPanel ports={services.account} clock={clock} work={work} cloud={cloud} sync={sync} onSync={setSync}
            onSaved={(saved: SavedPlan) => { setPlan(saved.plan); setCloud({ id: saved.id, revision: saved.revision }); setSync('saved'); }}
            onOpen={(saved: SavedPlan) => loadWork(saved, { id: saved.id, revision: saved.revision })}
            onRestoreDraft={(d: GuestDraft) => loadWork(d, null)}
            onSignedOut={() => { setCloud(null); setSync('local'); }} />
        </div>
      </header>
      <main ref={mainRef} id="main-content" className="content" tabIndex={-1}>
          <NoticeAlert notice={notice} />
          {screen === 'start' && (
            <GetStartedScreen catalogs={catalogs.ok ? catalogs.value : catalogs} selectedVersion={selectedVersion} catalog={catalog} catalogError={catalogError}
              locked={plan !== null} targetOptions={targetOptions} targetKey={targetKey} busy={busy}
              onSelectCatalog={selectCatalog} onTarget={setTargetKey} onContinue={continueFromStart} onStartOver={startOver} />
          )}
          {screen === 'record' && catalog && (
            <AcademicRecordScreen catalog={catalog} record={record} rows={rows} recordTerms={recordTerms} showErrors={showRowErrors} errorSignal={errorSignal} dirty={recordDirty} proposed={proposed}
              matchFor={matchFor} extracted={extracted} transcript={services.transcript} busy={busy}
              onRows={editRows} onAddRow={() => editRows([...rows, emptyRow(clock.newId('row'))])} onAcceptAndContinue={acceptAndContinue}
              onExtracted={x => { setExtracted(x); setRecordDirty(true); setProposed(null); }}
              onDiscardExtraction={() => { setExtracted(null); setProposed(null); setRecordDirty(rows.length > 0 || record.courseAttempts.length > 0); }}
              onBack={() => setScreen('start')} onContinue={() => { setNotice(null); setScreen('planner'); }} />
          )}
          {screen === 'planner' && catalog && plan && horizon && (
            <PlannerScreen catalog={catalog} plan={plan} terms={horizon.terms} horizonTruncated={horizon.truncated} path={path} analysis={analysis}
              scenarioError={scenarioResult && !scenarioResult.ok ? 'Current plan inputs are invalid for the modeled horizon (for example a course outside the modeled terms). No analysis is shown.' : null}
              stale={stale} currentFingerprint={currentFp} draft={draft} preview={preview} candidates={candidates}
              capacity={capacity} includeSummer={includeSummer} assumeFuturePass={config.assumeFuturePass} busy={busy}
              onChoosePath={choosePath} onAdd={addCourse}
              timeline={{
                onMove: (p, to, mode) => (mode === 'apply' ? studentEdit([{ kind: 'move', placementId: p.placementId, termId: to }], 'Course moved.') : previewChange([{ kind: 'move', placementId: p.placementId, termId: to }])),
                onRemove: (p, mode) => (mode === 'apply' ? studentEdit([{ kind: 'remove', placementId: p.placementId }], 'Course removed.') : previewChange([{ kind: 'remove', placementId: p.placementId }])),
                onReport: report,
              }}
              onReport={report} onPreviewCandidate={c => { setPreview(c); say('info', 'Preview ready. Your active plan has not changed.'); }}
              onApply={applyPreview} onReject={rejectPreview} onGenerate={generate} onAdopt={adopt} onDiscardDraft={() => { setDraft(null); say('info', 'Draft discarded. Your plan is unchanged.'); }}
              onCapacity={c => { setCapacity(c); say('info', `Now modeled with up to ${c.maximum} credits per term. Earlier previews are stale.`); }} onIncludeSummer={v => setIncludeSummer(v)}
              onRefresh={() => { setEvaluatedAt(clock.now()); say('info', 'Analysis re-run with a new evaluation time. Earlier previews are now stale.'); }}
              onExport={exportPdf} onBack={() => setScreen('record')} onChangeTarget={() => goTo('start')} />
          )}
      </main>
      <NoticeCapsule notice={notice} onDismiss={() => setNotice(null)}
        action={undoAvailable ? <button type="button" className="capsule-action" disabled={busy} onClick={undoLast}>Undo</button> : undefined} />
    </div>
  );
}
