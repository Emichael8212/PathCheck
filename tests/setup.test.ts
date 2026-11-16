// Guards features.json, the checklist the whole project is driven by. The curriculum data
// has its own tests in tests/curriculum.test.ts.
import { describe, expect, it } from 'vitest';
import featureList from '../features.json';

describe('features.json', () => {
  const milestoneIds = featureList.milestones.map(milestone => milestone.id);

  it('has unique ids and the required fields on every entry', () => {
    const ids = featureList.features.map(feature => feature.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const feature of featureList.features) {
      expect(feature.id).toMatch(/^F\d{2}$/);
      expect(feature.description.length, feature.id).toBeGreaterThan(0);
      expect(feature.steps.length, feature.id).toBeGreaterThan(0);
      expect(typeof feature.passes, feature.id).toBe('boolean');
      expect(typeof feature.evidence, feature.id).toBe('string');
      expect(Array.isArray(feature.tests), feature.id).toBe(true);
    }
  });

  it('is ordered by milestone M0 to M3', () => {
    expect(milestoneIds).toEqual(['M0', 'M1', 'M2', 'M3']);
    const order = featureList.features.map(feature => milestoneIds.indexOf(feature.milestone));
    expect(order).not.toContain(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('only passes a feature that names its tests and evidence', () => {
    for (const feature of featureList.features.filter(entry => entry.passes)) {
      expect(feature.tests.length, feature.id).toBeGreaterThan(0);
      expect(feature.evidence.length, feature.id).toBeGreaterThan(0);
    }
  });
});
