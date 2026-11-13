import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { fingerprint, term } from '../../src/contracts';
import type { AnalysisResult } from '../../src/contracts';
import { buildPlanReport, createPdfExportService, exportFileName, exportPdfBytes, renderPdf, reportConditions } from '../../src/export';
import { layout, MARGIN, PAGE_W, sanitizer, wrap } from '../../src/export/pdfRender';
import type { Measure } from '../../src/export/pdfRender';
import type { Block } from '../../src/export/pdfWriter';
import { inspectPdf, libraryPageCount } from './pdfInspect';
import { syntheticPlan, syntheticScenarioAndAnalysis } from '../fixtures/ui/scenarioFixtures';

const flat = (s: string) => s.replace(/\s+/g, ' ');
const AT = '2026-11-12T16:00:00.000Z';

async function realFonts(): Promise<{ measure: Measure; canEncode: (c: string) => boolean }> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return {
    measure: (t, s, b) => (b ? bold : regular).widthOfTextAtSize(t, s),
    canEncode: c => { try { regular.encodeText(c); return true; } catch { return false; } },
  };
}

async function exported(opts?: Parameters<typeof syntheticScenarioAndAnalysis>[0]) {
  const { scenario, analysis } = syntheticScenarioAndAnalysis(opts);
  const r = await exportPdfBytes(scenario, analysis, AT);
  if (!r.ok) throw new Error(`export failed: ${r.code}`);
  return { scenario, analysis, bytes: r.value, pdf: inspectPdf(r.value) };
}

describe('pdf-lib renderer: actual bytes', () => {
  it('U1 structure: classic xref offsets, trailer, %%EOF; pdf-lib reload agrees on page count', async () => {
    const bytes = await renderPdf({ title: 'T', creationDate: AT, footer: 'F', blocks: [{ kind: 'title', text: 'Hello (world) \\ ok' }] });
    const pdf = inspectPdf(bytes); // throws on any structural defect
    expect(pdf.pageCount).toBe(1);
    expect(await libraryPageCount(bytes)).toBe(1);
    expect(pdf.text).toContain('Hello (world) \\ ok');
    expect(pdf.text).toContain('F — Page 1 of 1');
    const raw = new TextDecoder('latin1').decode(bytes);
    expect(raw).toMatch(/\/Filter \/FlateDecode/); // content really is compressed, so raw search alone proves nothing
    expect(raw).not.toContain('Hello (world)');
  });

  it('U1 inspector rejects a corrupted xref offset', async () => {
    const bytes = await renderPdf({ title: 'T', creationDate: AT, footer: 'F', blocks: [{ kind: 'text', text: 'x' }] });
    const raw = new TextDecoder('latin1').decode(bytes);
    const at = raw.lastIndexOf(' 00000 n');
    const broken = Uint8Array.from(bytes);
    broken[at - 1] = broken[at - 1] === 0x30 ? 0x31 : 0x30;
    expect(() => inspectPdf(broken)).toThrow(/xref offset/);
  });

  it('U2 metadata: title, producer/creator PathCheck, creation date = generatedAt; no author/subject/keywords', async () => {
    const { pdf } = await exported();
    expect(pdf.info.Title).toBe('PathCheck conditional graduation plan');
    expect(pdf.info.Producer).toBe('PathCheck');
    expect(pdf.info.Creator).toBe('PathCheck');
    expect(pdf.info.CreationDate).toBe('D:20261112160000Z');
    expect(pdf.info.ModDate).toBe('D:20261112160000Z');
    expect(Object.keys(pdf.info).sort()).toEqual(['CreationDate', 'Creator', 'ModDate', 'Producer', 'Title']);
  });

  it('U6 pagination: 160 bullets span >3 pages, every page numbered, last line present', async () => {
    const blocks = Array.from({ length: 160 }, (_, i) => ({ kind: 'bullet' as const, text: `Line ${i} with enough words to occupy a reasonable amount of horizontal space on the page` }));
    const bytes = await renderPdf({ title: 'Long', creationDate: AT, footer: 'Footer', blocks });
    const pdf = inspectPdf(bytes);
    expect(pdf.pageCount).toBeGreaterThan(3);
    expect(await libraryPageCount(bytes)).toBe(pdf.pageCount);
    pdf.pageTexts.forEach((t, i) => expect(t).toContain(`Footer — Page ${i + 1} of ${pdf.pageCount}`));
    expect(flat(pdf.text)).toContain('Line 159 with enough words');
  });

  it('U6 no heading is stranded: each heading keeps two following lines on its page', async () => {
    const { measure } = await realFonts();
    // Sweep the heading through every vertical position near the first page bottom.
    let pushed = 0;
    for (let filler = 30; filler <= 60; filler++) {
      for (const sectionLines of [1, 2, 3]) {
        const blocks: Block[] = [
          ...Array.from({ length: filler }, (_, i) => ({ kind: 'text' as const, text: `Filler ${i}` })),
          { kind: 'heading', text: 'Section' },
          ...Array.from({ length: sectionLines }, (_, i) => ({ kind: 'bullet' as const, text: `Item ${i}` })),
        ];
        const pages = layout(blocks, measure);
        const flatLines = pages.flatMap((page, p) => page.filter(l => l.kind !== 'marker').map(l => ({ ...l, p })));
        const k = flatLines.findIndex(l => l.kind === 'heading');
        const need = Math.min(2, sectionLines);
        expect(flatLines.slice(k + 1, k + 1 + need).every(x => x.p === flatLines[k]!.p), `filler ${filler}, ${sectionLines} lines`).toBe(true);
        if (flatLines[k]!.p === 1 && pages[1]![0]!.kind === 'heading') pushed++;
      }
    }
    expect(pushed).toBeGreaterThan(0); // the keep-with-next rule actually fired
  });

  it('U7 wrapping: every laid-out line fits the printable width by font metrics; long tokens hard-split losslessly', async () => {
    const { measure } = await realFonts();
    const long = 'x'.repeat(400);
    const lines = wrap(long, 200, 10, false, measure);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe(long);
    lines.forEach(l => expect(measure(l, 10, false)).toBeLessThanOrEqual(200));
    const blocks: Block[] = (['title', 'heading', 'text', 'small', 'bullet'] as const).map(kind => ({ kind, text: `${'W'.repeat(120)} and many ordinary words that must wrap across several lines of the page ${'M'.repeat(90)}` }));
    for (const page of layout(blocks, measure)) {
      for (const l of page) {
        if (l.kind === 'marker') continue;
        expect(measure(l.text, l.size, l.bold)).toBeLessThanOrEqual(l.maxWidth);
        expect(l.x + measure(l.text, l.size, l.bold)).toBeLessThanOrEqual(PAGE_W - MARGIN + 0.001);
      }
    }
  });

  it('U8 encoding: symbols, emoji, CJK, combining marks and controls never throw; WinAnsi punctuation round-trips', async () => {
    const { canEncode } = await realFonts();
    const clean = sanitizer(canEncode);
    expect(clean('A✓😀漢\u0007B')).toBe('A??? B');
    expect(clean('é')).toBe('é'); // NFC composes before encoding
    const bytes = await renderPdf({ title: 'Ünïcode ✓', creationDate: AT, footer: 'F', blocks: [{ kind: 'text', text: 'Dash — bullet • quote ’ é € ✓ 😀 漢字 é tab\there' }] });
    const pdf = inspectPdf(bytes);
    expect(pdf.text).toContain('Dash — bullet • quote ’ é € ? ? ?? é tab here');
    expect(pdf.title).toBe('Ünïcode ?');
  });

  it('U10 determinism: same input and time give byte-identical output', async () => {
    const { scenario, analysis } = syntheticScenarioAndAnalysis();
    const a = await exportPdfBytes(scenario, analysis, AT);
    const b = await exportPdfBytes(scenario, analysis, AT);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(Buffer.from(a.value).equals(Buffer.from(b.value))).toBe(true);
  });

  it('renderer failure (invalid date) maps to a typed failure with no bytes', async () => {
    const { scenario, analysis } = syntheticScenarioAndAnalysis();
    expect(await exportPdfBytes(scenario, analysis, 'not-a-date')).toEqual({ ok: false, code: 'validation_error', reasonCode: 'pdf_render_failed' });
  });
});

describe('plan report contents', () => {
  it('U3 exports active placements with provenance, catalog year status, evidence and uncertainty', async () => {
    const { pdf } = await exported();
    const text = flat(pdf.text);
    expect(text).toContain('PathCheck conditional graduation plan');
    expect(text).toContain('not an official degree audit');
    expect(text).toContain('Important conditions');
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
    pdf.pageTexts.forEach((t, i) => expect(t).toContain(`Page ${i + 1} of ${pdf.pageCount}`));
    expect(text).not.toMatch(/guaranteed|graduation_guaranteed/i);
  });

  it('U4 minimum data: no grades, free text, attempt details, identifiers or fingerprint in decompressed text, metadata or raw bytes', async () => {
    const base = syntheticPlan();
    const plan = syntheticPlan({ availabilityEvidence: base.availabilityEvidence.map(e => ({ ...e, notes: 'SECRET-STUDENT-NOTE' })) });
    const { analysis, bytes, pdf } = await exported({ plan });
    expect(flat(pdf.visible)).toContain('PathCheck conditional graduation plan'); // positive control for the decoder
    const raw = new TextDecoder('latin1').decode(bytes);
    const forbidden = [
      'SECRET-GRADE-A', 'SECRET-STUDENT-NOTE', // grade and student free text
      'XFR 100', 'Synthetic College', 'Spring 2026', // raw code, institution and term of attempts
      'plan-1', 'draft-1', 'sr-1', 'unmatched-r2', 'Unmatched r2', // plan/draft/source/E-internal IDs
      analysis.inputFingerprint, 'sha256', 'fingerprint',
    ];
    for (const value of forbidden) {
      expect(flat(pdf.visible), value).not.toContain(value);
      expect(raw, value).not.toContain(value);
    }
    expect(flat(pdf.text)).toContain('Grades, course-by-course history and transcript contents are intentionally omitted');
  });

  it('U5 never lists projected (unadopted) placements as plan selections', async () => {
    const { scenario, analysis } = syntheticScenarioAndAnalysis();
    const all = buildPlanReport(scenario, analysis, AT).blocks.map(b => b.text).join('\n');
    expect(all).not.toContain('Unadopted projection —');
    expect(all).toContain('Unadopted PathCheck projections and previews are not included as selections.');
    const { pdf } = await exported();
    expect(flat(pdf.text)).not.toContain('Unadopted projection —');
  });

  it('U12 shows only the conditions that apply to the scenario', () => {
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

  it('U12 flags an unresolved catalog year and blocking policies as conditions', () => {
    const { scenario, analysis } = syntheticScenarioAndAnalysis({ blockingGap: true });
    const conditions = reportConditions(scenario, analysis).join('\n');
    expect(conditions).toContain('governing catalog year is unresolved');
    expect(conditions).toContain('1 unresolved academic policy blocks definitive conclusions');
  });

  it('U3 labels an unconfirmed catalog year and blocking policy gaps in the bytes', async () => {
    const { analysis, pdf } = await exported({ blockingGap: true });
    expect(analysis.outlook.kind).toBe('insufficient_evidence');
    const text = flat(pdf.text);
    expect(text).toContain('Not confirmed — governing catalog year unresolved');
    expect(text).toContain('Unresolved policy (blocks conclusions): Synthetic blocking policy gap');
  });

  it('U9 refuses a stale analysis (fingerprint mismatch) and an overclaiming analysis with no bytes', async () => {
    const { analysis } = syntheticScenarioAndAnalysis();
    const other = syntheticScenarioAndAnalysis({ plan: syntheticPlan({ targetTerm: term(2028, 'spring') }) });
    expect(fingerprint(other.scenario)).not.toBe(analysis.inputFingerprint);
    const stale = await exportPdfBytes(other.scenario, analysis, AT);
    expect(stale).toMatchObject({ ok: false, code: 'stale_preview' });
    expect('value' in stale).toBe(false);
    const blocked = syntheticScenarioAndAnalysis({ blockingGap: true });
    const overclaim: AnalysisResult = { ...blocked.analysis, outlook: { ...blocked.analysis.outlook, kind: 'conditional_path_found' } };
    const refused = await exportPdfBytes(blocked.scenario, overclaim, AT);
    expect(refused).toMatchObject({ ok: false, code: 'unresolved' });
    expect('value' in refused).toBe(false);
  });

  it('U11 ExportService returns an application/pdf Blob and a dated file name', async () => {
    const { scenario, analysis } = syntheticScenarioAndAnalysis();
    const svc = createPdfExportService({ now: () => AT });
    expect(Object.isFrozen(svc)).toBe(true);
    const r = await svc.exportPdf(scenario, analysis);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.type).toBe('application/pdf');
    const bytes = new Uint8Array(await r.value.arrayBuffer());
    const pdf = inspectPdf(bytes);
    expect(pdf.title).toBe('PathCheck conditional graduation plan');
    expect(await libraryPageCount(bytes)).toBe(pdf.pageCount);
    expect(exportFileName(AT)).toBe('pathcheck-plan-2026-11-12.pdf');
  });
});
