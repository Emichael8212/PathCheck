import { describe, expect, it } from 'vitest';
import { fingerprint, term } from '../../src/contracts';
import type { AnalysisResult } from '../../src/contracts';
import { buildPlanReport, createPdfExportService, exportFileName, exportPdfBytes, renderPdf } from '../../src/export';
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
    expect(text).toContain('XFR 100 (unmatched to catalog)');
    expect(text).toContain('scenario assumption, not a university limit');
    expect(text).not.toContain('SECRET-GRADE-A');
    expect(text).not.toMatch(/guaranteed|graduation_guaranteed/i);
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
