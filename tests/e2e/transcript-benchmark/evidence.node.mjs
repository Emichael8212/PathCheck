import { it } from 'node:test';
import assert from 'node:assert/strict';
import { reusableCases, eligibleComparison, exactCaseSet, assessCase } from './evidence.mjs';
const expected = { model: 'gemini-3.5-flash-lite', corpusHash: 'fixture-v1', executionHash: 'implementation-v1',
  fixtures: [{ id: 'one', sha256: 'one-hash', expected: 'rows' }, { id: 'two', sha256: 'two-hash', expected: 'reject_pdf' }] };
const primary = { ...expected, status: 'FAIL', cases: [
  { id: 'one', fixtureHash: 'one-hash', status: 'FAIL', stage: 'model_quality', actualGeneration: true },
  { id: 'two', fixtureHash: 'two-hash', status: 'PASS', stage: 'actual_pdf_inspector', noProviderCall: true },
] };
it('permits comparison only after completed actual primary quality failure', () => {
  assert.equal(eligibleComparison(primary, expected), true);
  assert.equal(eligibleComparison({ ...primary, cases: primary.cases.slice(0, 1) }, expected), false);
});
it('invalidates cached results after code, prompt, schema or corpus fingerprint changes', () => {
  for (const field of ['executionHash', 'corpusHash', 'model']) assert.deepEqual(reusableCases({ ...primary, [field]: 'changed' }, expected), []);
});
it('refuses duplicate, unknown and changed-PDF cases', () => {
  for (const bad of [[primary.cases[0], primary.cases[0]], [{ ...primary.cases[0], id: 'unknown' }], [{ ...primary.cases[0], fixtureHash: 'changed' }]]) {
    assert.deepEqual(reusableCases({ ...primary, cases: bad }, expected), []);
  }
  assert.equal(exactCaseSet([primary.cases[0], primary.cases[0]], expected.fixtures), false);
});
it('does not compare on normalization failure, parser failure or simulated output', () => {
  for (const change of [{ stage: 'normalization_integration' }, { stage: 'actual_pdf_inspector' }, { actualGeneration: false }]) {
    assert.equal(eligibleComparison({ ...primary, cases: [{ ...primary.cases[0], ...change }, primary.cases[1]] }, expected), false);
  }
});
it('a thrown academic integration error cannot trigger model comparison', () => {
  const item = assessCase({ ...primary.cases[0] }, { pass: true }, true, () => { throw new Error('synthetic integration defect'); });
  assert.equal(item.status, 'FAIL');
  assert.equal(item.stage, 'normalization_integration');
  assert.equal(eligibleComparison({ ...primary, cases: [item, primary.cases[1]] }, expected), false);
});
