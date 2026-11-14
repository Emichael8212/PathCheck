// Catalog identity presentation (PR9 human-acceptance defect): the two approved configurations share
// institution, program, provisional status and an unresolved year, so the UI must name which
// curriculum is selected. Presentation only; no academic content is asserted here.
import { describe, expect, it } from 'vitest';
import { listCatalogs } from '../../src/catalog';
import { buildPlanReport } from '../../src/export/planReport';
import { catalogEdition, catalogOptionLabels, catalogYearLabel } from '../../src/ui/labels';
import { syntheticScenarioAndAnalysis } from '../fixtures/ui/scenarioFixtures';
import { CURRENT_VERSION, HISTORICAL_VERSION, SYNTHETIC_REF, identityPairCatalogs } from '../fixtures/ui/syntheticCatalog';

const realRefs = () => {
  const r = listCatalogs();
  if (!r.ok) throw new Error('catalog listing failed');
  return r.value;
};

describe('catalog identity labels', () => {
  it('gives the two approved catalog refs distinct, human-readable option labels', () => {
    const refs = realRefs();
    expect(refs.map(r => r.catalogVersion)).toEqual([CURRENT_VERSION, HISTORICAL_VERSION]);
    const labels = catalogOptionLabels(refs);
    expect(labels.get(CURRENT_VERSION)).toBe('B.S. Computer Information Systems — Current departmental curriculum · Provisional catalog');
    expect(labels.get(HISTORICAL_VERSION)).toBe('B.S. Computer Information Systems — Historical 2019–2021 curriculum guide · Provisional catalog');
    expect(new Set(labels.values()).size).toBe(2);
    for (const l of labels.values()) expect(l).not.toMatch(/asu-cis|-v1/);
  });

  it('never presents the printed guide years as the governing catalog year', () => {
    for (const ref of realRefs()) {
      expect(ref.catalogYearId).toBeNull();
      expect(catalogYearLabel(ref)).toBe('Not confirmed — governing catalog year unresolved');
    }
    expect(catalogEdition(realRefs()[1]!)!.detail).toMatch(/printed guide years are not a confirmed catalog year/);
  });

  it('synthetic rule sets never receive an institutional curriculum name, even with an approved version id', () => {
    const pair = identityPairCatalogs({ synthetic: true }).map(c => c.catalogRef);
    for (const ref of pair) expect(catalogEdition(ref)).toBeNull();
    const labels = [...catalogOptionLabels(pair).values()];
    expect(labels).toEqual(['B.S. Computer Information Systems · Test catalog (option 1 of 2)', 'B.S. Computer Information Systems · Test catalog (option 2 of 2)']);
    for (const l of labels) expect(l).not.toMatch(/departmental|2019|curriculum guide/i);
    expect([...catalogOptionLabels([SYNTHETIC_REF]).values()]).toEqual(['B.S. Computer Information Systems · Test catalog']);
  });

  it('unknown non-synthetic versions get no invented name and are still distinguishable', () => {
    const refs = realRefs().map((r, i) => ({ ...r, catalogVersion: `unmapped-${i}` }));
    for (const ref of refs) expect(catalogEdition(ref)).toBeNull();
    const labels = [...catalogOptionLabels(refs).values()];
    expect(new Set(labels).size).toBe(2);
    for (const l of labels) expect(l).not.toMatch(/unmapped/);
  });

  it('PDF report states which curriculum the plan uses alongside the unresolved year', () => {
    const { scenario, analysis } = syntheticScenarioAndAnalysis();
    const [current, historical] = identityPairCatalogs();
    const text = (c: typeof current) => buildPlanReport({ ...scenario, catalog: c! }, analysis, '2026-11-12T16:00:00.000Z').blocks.map(b => b.text).join('\n');
    expect(text(current)).toContain('Curriculum: Current departmental curriculum.');
    expect(text(historical)).toContain('Curriculum: Historical 2019–2021 curriculum guide.');
    expect(text(historical)).toContain('Catalog year: Not confirmed — governing catalog year unresolved');
    expect(buildPlanReport(scenario, analysis, '2026-11-12T16:00:00.000Z').blocks.some(b => b.text.startsWith('Curriculum:'))).toBe(false);
  });
});
