import { describe, expect, it } from 'vitest';
import { fingerprint, term } from '../../src/contracts';
import type { AnalysisResult } from '../../src/contracts';
import { buildPlanReport, createPdfExportService, exportFileName, exportPdfBytes, renderPdf, reportConditions } from '../../src/export';
import { encodeWinAnsi, wrap } from '../../src/export/pdfWriter';
import { inspectPdf } from './pdfInspect';
import { syntheticPlan, syntheticScenarioAndAnalysis } from '../fixtures/ui/scenarioFixtures';

const flat = (s: string) => s.replace(/\s+/g, ' ');
const AT = '2026-11-12T16:00:00.000Z';

describe('PDF writer', () => {
  it('produces a structurally valid single-page PDF with exact xref offsets', () => {
    const bytes = renderPdf({ title: 'T', creationDate: AT, footer: 'F', blocks: [{ kind: 'title', text: 'Hello (world) \\ ok' }] });
    const pdf = inspectPdf(bytes);
    expect(pdf.pageCount).toBe(1);
    expect(pdf.text).toContain('Hello (world) \\ ok');
    expect(pdf.text).toContain('F — Page 1 of 1');
  });

  it('paginates long content and numbers every page', () => {
    const blocks = Array.from({ length: 160 }, (_, i) => ({ kind: 'bullet' as const, text: `Line ${i} with enough words to occupy a reasonable amount of horizontal space on the page` }));
    const pdf = inspectPdf(renderPdf({ title: 'Long', creationDate: AT, footer: 'Footer', blocks }));
    expect(pdf.pageCount).toBeGreaterThan(3);
    pdf.pageTexts.forEach((t, i) => expect(t).toContain(`Page ${i + 1} of ${pdf.pageCount}`));
    expect(flat(pdf.text)).toContain('Line 159 with enough words');
  });

  it('wraps text to the line width and hard-splits overlong tokens', () => {
    const lines = wrap(encodeWinAnsi('x'.repeat(400)), 200, 10, false);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.flat().length).toBe(400);
  });

  it('maps non-Latin text to WinAnsi or "?" without throwing', () => {
    expect(encodeWinAnsi('A—•é✓')).toEqual([0x41, 0x97, 0x95, 0xe9, 0x3f]);
  });
});

describe('plan report contents', () => {
  it('exports active placements with provenance, catalog year status, evidence and uncertainty — no grades', () => {
    const { scenario, analysis } = syntheticScenarioAndAnalysis();
    const r = exportPdfBytes(scenario, analysis, AT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const text = flat(inspectPdf(r.value).text);
    expect(text).toContain('PathCheck conditional graduation plan');
    expect(text).toContain('not an official degree audit');
    expect(text).toContain(`Generated: ${AT}`);
    expect(text).toContain('Catalog version: syn-ui-v1');
    expect(text).toContain('Synthetic (test only)');
    expect(text).toContain('Target term: Fall 2028');
    expect(text).toContain('SYN 201 Synthetic Systems (3 cr) — Student-selected');
    expect(text).toContain('SYN 301 Synthetic Capstone (3 cr) — PathCheck suggestion (adopted)');
    expect(text).toContain('Listed — student-reported, unverified');
    expect(text).toContain('Not a seat or enrollment confirmation');
    expect(text).toContain('2 course attempts entered; 1 matched to the catalog.');
    expect(text).toContain('1 not matched to the catalog; credit toward requirements is unresolved.');
    expect(text).toContain('1 transfer or equivalency-pending; applicability is not assumed.');
    expect(text).toContain('1 record item flagged for review in PathCheck.');
    expect(text).toContain('scenario assumption, not a university limit');
    expect(text).not.toContain('SECRET-GRADE-A');
    expect(text).not.toMatch(/guaranteed|graduation_guaranteed/i);
  });

  it('minimum-data policy: no transcript history, free text, identifiers or fingerprint in text, metadata or raw bytes', () => {
    const base = syntheticPlan();
    const plan = syntheticPlan({ availabilityEvidence: base.availabilityEvidence.map(e => ({ ...e, notes: 'SECRET-STUDENT-NOTE' })) });
    const { scenario, analysis } = syntheticScenarioAndAnalysis({ plan });
    const r = exportPdfBytes(scenario, analysis, AT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pdf = inspectPdf(r.value);
    const text = flat(pdf.text);
    const raw = new TextDecoder('latin1').decode(r.value);
    const forbidden = [
      'SECRET-GRADE-A', 'SECRET-STUDENT-NOTE', // grade and student free text
      'XFR 100', 'Synthetic College', 'Spring 2026', // raw code, institution and term of attempts
      'plan-1', 'draft-1', 'sr-1', 'unmatched-r2', 'Unmatched r2', // plan/draft/source/E-internal IDs
      analysis.inputFingerprint, 'sha256', 'fingerprint',
    ];
    for (const value of forbidden) {
      expect(text, value).not.toContain(value);
      expect(raw, value).not.toContain(value);
    }
    expect(pdf.title).toBe('PathCheck conditional graduation plan');
    expect(raw).not.toMatch(/\/(Author|Subject|Keywords)\b/);
    expect(text).toContain('Grades, course-by-course history and transcript contents are intentionally omitted');
  });

  it('shows only the conditions that apply to the scenario', () => {
    const { scenario, analysis } = syntheticScenarioAndAnalysis();
    const synthetic = reportConditions(scenario, analysis).join('\n');
    expect(synthetic).toContain('SYNTHETIC TEST DATA');
    expect(synthetic).toContain('PathCheck suggestion (adopted)');
    expect(synthetic).toContain('student-reported are unverified');
    expect(synthetic).toContain('planning assumption, not a university limit');
    expect(synthetic).toContain('assumed to be passed');
    expect(synthetic).not.toContain('catalog year is unresolved');
    expect(synthetic).not.toContain('after the last modeled term');

    // Test-only variant (never exported through exportPdfBytes): a verified rule set, student load,
    // only student selections, no offering reports and future passes not assumed -> no conditions.
    const verified = {
      ...scenario,
      catalog: { ...scenario.catalog, approval: 'reviewed' as const, catalogRef: { ...scenario.catalog.catalogRef, ruleSetStatus: 'verified' as const } },
      plan: { ...scenario.plan, acceptedDraft: null, availabilityEvidence: [], activePlacements: scenario.plan.activePlacements.map(p => ({ ...p, origin: 'student_selected' as const })) },
      assumptions: { ...scenario.assumptions, assumeFuturePass: false, creditCapacity: scenario.assumptions.creditCapacity.map(c => ({ ...c, source: 'student' as const })) },
    };
    const plainAnalysis = { ...analysis, degreeAudit: { ...analysis.degreeAudit, requirements: analysis.degreeAudit.requirements.map(x => ({ ...x, conditional: false })) } };
    expect(reportConditions(verified, plainAnalysis)).toEqual([]);
    const blocks = buildPlanReport(verified, plainAnalysis, AT).blocks.map(b => b.text);
    expect(blocks).not.toContain('Important conditions');

    const beyond = { ...verified, plan: { ...verified.plan, targetTerm: term(2030, 'fall') } };
    expect(reportConditions(beyond, plainAnalysis).join('\n')).toContain('after the last modeled term (Fall 2028)');
  });

  it('flags an unresolved catalog year and blocking policies as conditions', () => {
    const { scenario, analysis } = syntheticScenarioAndAnalysis({ blockingGap: true });
    const conditions = reportConditions(scenario, analysis).join('\n');
    expect(conditions).toContain('governing catalog year is unresolved');
    expect(conditions).toContain('1 unresolved academic policy blocks definitive conclusions');
  });

  it('labels an unconfirmed catalog year and blocking policy gaps', () => {
    const { scenario, analysis } = syntheticScenarioAndAnalysis({ blockingGap: true });
    expect(analysis.outlook.kind).toBe('insufficient_evidence');
    const r = exportPdfBytes(scenario, analysis, AT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const text = flat(inspectPdf(r.value).text);
    expect(text).toContain('Not confirmed — governing catalog year unresolved');
    expect(text).toContain('Unresolved policy (blocks conclusions): Synthetic blocking policy gap');
  });

  it('never lists projected (unadopted) placements as plan selections', () => {
    const { scenario, analysis } = syntheticScenarioAndAnalysis();
    const report = buildPlanReport(scenario, analysis, AT);
    const all = report.blocks.map(b => b.text).join('\n');
    expect(all).not.toContain('Unadopted projection —');
    expect(all).toContain('Unadopted PathCheck projections and previews are not included as selections.');
  });

  it('refuses a stale analysis (fingerprint mismatch) and an overclaiming analysis', () => {
    const { scenario, analysis } = syntheticScenarioAndAnalysis();
    const other = syntheticScenarioAndAnalysis({ plan: syntheticPlan({ targetTerm: term(2028, 'spring') }) });
    expect(fingerprint(other.scenario)).not.toBe(analysis.inputFingerprint);
    expect(exportPdfBytes(other.scenario, analysis, AT)).toMatchObject({ ok: false, code: 'stale_preview' });
    const blocked = syntheticScenarioAndAnalysis({ blockingGap: true });
    const overclaim: AnalysisResult = { ...blocked.analysis, outlook: { ...blocked.analysis.outlook, kind: 'conditional_path_found' } };
    expect(exportPdfBytes(blocked.scenario, overclaim, AT)).toMatchObject({ ok: false, code: 'unresolved' });
    void scenario;
  });

  it('ExportService returns an application/pdf Blob and a dated file name', async () => {
    const { scenario, analysis } = syntheticScenarioAndAnalysis();
    const svc = createPdfExportService({ now: () => AT });
    expect(Object.isFrozen(svc)).toBe(true);
    const r = await svc.exportPdf(scenario, analysis);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.type).toBe('application/pdf');
    const pdf = inspectPdf(new Uint8Array(await r.value.arrayBuffer()));
    expect(pdf.title).toBe('PathCheck conditional graduation plan');
    expect(exportFileName(AT)).toBe('pathcheck-plan-2026-11-12.pdf');
  });
});
