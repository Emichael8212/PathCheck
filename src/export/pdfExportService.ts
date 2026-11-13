import { validateAnalysisForScenario } from '../contracts';
import type { AnalysisResult, ExportService, PlanningScenario, Result } from '../contracts';
import { buildPlanReport } from './planReport';
import { renderPdf } from './pdfWriter';

export async function exportPdfBytes(scenario: PlanningScenario, analysis: AnalysisResult, generatedAt: string): Promise<Result<Uint8Array>> {
  // Refuse stale analyses and any analysis overclaiming under blocking policy gaps.
  const checked = validateAnalysisForScenario(scenario, analysis);
  if (!checked.ok) return checked;
  try {
    return { ok: true, value: await renderPdf(buildPlanReport(scenario, checked.value, generatedAt)) };
  } catch {
    // Renderer, lazy-import or date failures: typed failure, no partial document.
    return { ok: false, code: 'validation_error', reasonCode: 'pdf_render_failed' };
  }
}

/** Client-side ExportService implementation producing a downloadable application/pdf Blob. */
export function createPdfExportService(options: { now: () => string }): ExportService {
  return Object.freeze({
    async exportPdf(scenario: PlanningScenario, analysis: AnalysisResult): Promise<Result<Blob>> {
      const bytes = await exportPdfBytes(scenario, analysis, options.now());
      if (!bytes.ok) return bytes;
      const buffer = new ArrayBuffer(bytes.value.byteLength);
      new Uint8Array(buffer).set(bytes.value);
      return { ok: true, value: new Blob([buffer], { type: 'application/pdf' }) };
    },
  });
}

export function exportFileName(generatedAt: string): string {
  return `pathcheck-plan-${generatedAt.slice(0, 10)}.pdf`;
}
