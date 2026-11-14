export function reusableCases(saved, expected) {
  if (saved.model !== expected.model || saved.corpusHash !== expected.corpusHash || saved.executionHash !== expected.executionHash) return [];
  if (!Array.isArray(saved.cases)) return [];
  const ids = new Set();
  for (const item of saved.cases) {
    const fixture = expected.fixtures.find(f => f.id === item.id);
    if (!fixture || ids.has(item.id) || item.fixtureHash !== fixture.sha256 || !['PASS', 'FAIL'].includes(item.status)) return [];
    if (fixture.expected === 'reject_pdf') {
      if (item.stage !== 'actual_pdf_inspector' || item.noProviderCall !== true) return [];
    } else if (item.actualGeneration !== true || !['model_quality', 'normalization_integration'].includes(item.stage)) return [];
    ids.add(item.id);
  }
  return saved.cases;
}
export function exactCaseSet(cases, fixtures) {
  return cases.length === fixtures.length && new Set(cases.map(c => c.id)).size === fixtures.length
    && fixtures.every(f => cases.some(c => c.id === f.id));
}
export function eligibleComparison(primary, expected) {
  const cases = reusableCases(primary, { ...expected, model: 'gemini-3.5-flash-lite' });
  return primary.status === 'FAIL' && exactCaseSet(cases, expected.fixtures)
    && cases.some(c => c.status === 'FAIL' && c.stage === 'model_quality' && c.actualGeneration === true);
}
export function assessCase(item, score, coverage, normalize) {
  Object.assign(item, score, { coverage, status: 'FAIL', normalizationSafe: false });
  if (!score.pass || !coverage) { item.stage = 'model_quality'; return item; }
  item.stage = 'normalization_integration';
  try {
    item.normalizationSafe = normalize() === true;
    if (item.normalizationSafe) item.status = 'PASS';
  } catch { item.reason = 'normalization_failure'; }
  return item;
}
