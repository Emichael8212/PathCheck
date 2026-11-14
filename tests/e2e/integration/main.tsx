// Test entry: actual E/U/L modules; catalog/time are synthetic. The upload entry
// additionally uses explicitly simulated Google/bot transport with live local SQL.
// No canned evaluation, normalization, recommendation or command responses.
import { createElement } from 'react';
import type { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { CatalogModelSchema, SEARCH_POLICY, fingerprint } from '../../../src/contracts';
import type { AcademicService, AnalysisResult, CatalogModel, ExportService, PlanningScenario, TranscriptClient, TranscriptService } from '../../../src/contracts';
import { createDraftGenerationService } from '../../../src/app/createDraftGenerationService';
import { createGuestWorkflow } from '../../../src/app/createGuestWorkflow';

const load = (path: string) => import(/* @vite-ignore */ path);
type CatalogPorts = Pick<AcademicService, 'listCatalogs' | 'loadValidatedCatalog'>;
const engine = await load('/src/engine/index.ts') as { createAcademicService(registry: CatalogPorts): AcademicService; createCatalogRegistry(models: CatalogModel[]): CatalogPorts; academicService: AcademicService; ENGINE_VERSION: string };
const exporter = await load('/src/export/index.ts') as { createPdfExportService(options: { now: () => string }): ExportService };
const source = { sourceId: 'integration-synthetic', kind: 'synthetic', urlOrRef: null, observedAt: null, description: 'Invented academic graph for integration testing; not university policy', verificationStatus: 'synthetic' };
const course = (id: string, prerequisite: string | null) => ({ courseId: id, displayCode: id.replace('-', ' '), title: `Synthetic ${id}`, credits: 3, prerequisite: prerequisite ? { kind: 'course', courseId: prerequisite, minGrade: null, timing: 'prior_term' } : { kind: 'all', children: [] }, sourceRefs: [source.sourceId], status: 'supported' });
const base = { sourceRefs: [source.sourceId], uncertainty: 'documented', overlap: { mode: 'forbidden' }, consumesCredits: true };
const catalog = CatalogModelSchema.parse({
  schemaVersion: 1, catalogRef: { institutionId: 'asu', programId: 'bs-cis', catalogYearId: 'synthetic-only', catalogVersion: 'integration-synthetic-v1', ruleSetStatus: 'synthetic', sources: [source] }, approval: 'synthetic',
  courses: Object.fromEntries([course('SYN-101', null), course('SYN-201', 'SYN-101'), course('SYN-301', 'SYN-201')].map(c => [c.courseId, c])),
  requirementGroups: [{ ...base, requirementId: 'root', kind: 'all', requirementIds: ['intro', 'middle', 'advanced', 'total'] }, ...['intro', 'middle', 'advanced'].map((id, i) => ({ ...base, requirementId: id, kind: 'course', courseId: ['SYN-101', 'SYN-201', 'SYN-301'][i] })), { ...base, requirementId: 'total', kind: 'total_degree_credits', minimum: 9 }],
  rootRequirementId: 'root', equivalencies: [], gradeScale: { ordered: ['A', 'B', 'C', 'D', 'F'], sourceRefs: [source.sourceId] }, policyGaps: [], validationResults: [],
});
declare global { interface Window { __integration: { scenario: PlanningScenario | null; analysis: AnalysisResult | null; fingerprint: string | null; evaluations: number; acceptanceCalls: number; acceptedFromRevision: number | null; searchStarted: boolean } } }
window.__integration = { scenario: null, analysis: null, fingerprint: null, evaluations: 0, acceptanceCalls: 0, acceptedFromRevision: null, searchStarted: false };
// Only the isolated upload test may select the actual approved catalog registry.
const actualCatalogUpload = location.pathname === '/tests/e2e/upload/index.html' && new URLSearchParams(location.search).get('catalog') === 'actual';
const realAcademic = actualCatalogUpload ? engine.academicService : engine.createAcademicService(engine.createCatalogRegistry([catalog]));
const academic: AcademicService = {
  ...realAcademic,
  evaluate: scenario => {
    const result = realAcademic.evaluate(scenario);
    window.__integration = { ...window.__integration, scenario, analysis: result.ok ? result.value : null, fingerprint: fingerprint(scenario), evaluations: window.__integration.evaluations + 1 };
    return result;
  },
};
let id = 0;
const realServices = createGuestWorkflow(academic, exporter.createPdfExportService({ now: () => '2026-11-12T12:00:00Z' }), { engineVersion: engine.ENGINE_VERSION, evaluationPolicy: actualCatalogUpload ? 'conservative-v1' : 'integration-synthetic', assumeFuturePass: true, searchOptions: SEARCH_POLICY }, { now: () => '2026-11-12T12:00:00Z', newId: (prefix: string) => `${prefix}-${++id}` });
const liveUploadTest = location.pathname === '/tests/e2e/upload/live.html';
const uploadTest = liveUploadTest || location.pathname === '/tests/e2e/upload/index.html';
const transcript = uploadTest ? {
  client: ((await load('/src/transcript/browser.ts')) as { createTranscriptClient(): TranscriptClient }).createTranscriptClient(),
  validate: ((await load('/src/transcript/validation.ts')) as { validateExtraction: TranscriptService['validate'] }).validateExtraction,
  // Explicit integration-only bot proof. The test server verifies this exact prefix;
  // actual production bot verification remains a separate gate.
  obtainBotAttestation: async () => {
    if (!liveUploadTest) return { ok: true as const, value: `synthetic-browser-${crypto.randomUUID()}` };
    try {
      const response = await fetch('/__live/attestation', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
      const body = await response.json();
      if (response.ok && body.ok === true && typeof body.value === 'string' && body.value.length <= 128) return { ok: true as const, value: body.value };
    } catch { /* Local capability unavailable; no extraction starts. */ }
    return { ok: false as const, code: 'unavailable' as const, reasonCode: 'local_capability_unavailable' };
  },
} : null;
// Test-only controlled continuation stall; engine performs real work before notification.
const generationMode = new URLSearchParams(location.search).get('generation');
const generation = generationMode === 'held' || generationMode === 'watchdog'
  ? createDraftGenerationService({ watchdogMs: generationMode === 'watchdog' ? 5000 : 30000, worker: () => {
    const worker = new Worker('/tests/e2e/integration/generation-held.worker.ts', { type: 'module' });
    worker.addEventListener('message', event => { if (event.data.kind === 'progress' && event.data.expansions > 0) window.__integration.searchStarted = true; });
    return worker;
  } }) : realServices.generation;
const services = Object.freeze({ ...realServices, generation, transcript, commands: Object.freeze({
  ...realServices.commands,
  acceptRecord: ((...args) => {
    window.__integration.acceptanceCalls += 1;
    window.__integration.acceptedFromRevision = args[0].record.recordRevision;
    return realServices.commands.acceptRecord(...args);
  }) as typeof realServices.commands.acceptRecord,
}) });
const ui = await load('/src/screens/index.ts') as { PathCheckWorkflow: ComponentType<{ services: typeof services }> };
createRoot(document.getElementById('root')!).render(createElement(ui.PathCheckWorkflow, { services }));
