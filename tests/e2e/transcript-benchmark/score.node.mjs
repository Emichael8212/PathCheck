import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const expect = actual => ({ toMatchObject(expected) { for (const [key, value] of Object.entries(expected)) assert.deepEqual(actual[key], value); } });
import { scoreRows } from './score.mjs';
const a = { rawCourseCode: 'TEST 101', rawTerm: 'Fall 2025', rawAttemptedCredits: '3', rawEarnedCredits: '0', rawGrade: 'F', rawStatus: 'completed' };
const b = { ...a, rawTerm: 'Spring 2026', rawGrade: 'A', rawEarnedCredits: '3' };
describe('synthetic transcript accuracy scorer', () => {
  it('preserves repeated attempts and ignores presentation order', () => {
    expect(scoreRows([a, b], [b, a])).toMatchObject({ pass: true, exactAttempts: 2 });
  });
  it('fails a silent omission even if the remaining row is correct', () => {
    expect(scoreRows([a, b], [a])).toMatchObject({ pass: false, missingAttempts: 1 });
  });
  it('fails hallucinated and duplicated attempts', () => {
    expect(scoreRows([a], [a, a])).toMatchObject({ pass: false, unexpectedAttempts: 1 });
  });
  for (const field of ['rawGrade', 'rawEarnedCredits', 'rawAttemptedCredits', 'rawStatus']) it(`fails altered ${field}`, () => {
    expect(scoreRows([a], [{ ...a, [field]: 'incorrect' }])).toMatchObject({ pass: false, alignedCriticalFieldErrors: 1 });
  });
  it('does not infer missing values or accept optimistic completion', () => {
    expect(scoreRows([{ ...a, rawGrade: null }], [a])).toMatchObject({ pass: false });
  });
  it('does not collapse two identical attempts into one', () => {
    expect(scoreRows([a, a], [a])).toMatchObject({ pass: false, missingAttempts: 1 });
  });
  it('counts exact repeats before partial matches regardless of expected order', () => {
    const changed = { ...a, rawGrade: 'A' };
    assert.deepEqual(scoreRows([a, changed], [changed]), scoreRows([changed, a], [changed]));
    expect(scoreRows([a, changed], [changed])).toMatchObject({ pass: false, exactAttempts: 1, missingAttempts: 1 });
  });
  for (const field of ['rawCourseCode', 'rawTerm']) it(`reports unalignable changed ${field} without claiming zero errors`, () => {
    expect(scoreRows([a], [{ ...a, [field]: 'changed' }])).toMatchObject({ pass: false, unalignableMismatchAttempts: 1 });
  });
});
