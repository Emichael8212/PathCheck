// Strict raw extraction accuracy; no interpretation of grades, credits or academic eligibility.
export const criticalFields = ['rawCourseCode', 'rawTerm', 'rawAttemptedCredits', 'rawEarnedCredits', 'rawGrade', 'rawStatus', 'rawInstitution'];
export function scoreRows(expected, actual) {
  const remaining = [...actual];
  let correct = 0;
  let fieldErrors = 0;
  let missing = 0;
  const unmatched = [];
  // Match the entire exact multiset first so a partial repeated attempt cannot
  // consume a later exact match. Diagnostics must not depend on row ordering.
  for (const row of expected) {
    const exact = remaining.findIndex(other => criticalFields.every(field => other[field] === row[field]));
    if (exact >= 0) { remaining.splice(exact, 1); correct++; continue; }
    unmatched.push(row);
  }
  for (const row of unmatched) {
    const sameKey = other => other.rawCourseCode === row.rawCourseCode && other.rawTerm === row.rawTerm;
    const sameAttempt = unmatched.filter(sameKey).length === 1 && remaining.filter(sameKey).length === 1
      ? remaining.findIndex(sameKey) : -1;
    if (sameAttempt >= 0) {
      const other = remaining.splice(sameAttempt, 1)[0];
      fieldErrors += criticalFields.filter(field => other[field] !== row[field]).length;
    } else missing++;
  }
  return { pass: correct === expected.length && actual.length === expected.length,
    expected: expected.length, extracted: actual.length, exactAttempts: correct,
    alignedCriticalFieldErrors: fieldErrors, missingAttempts: missing, unexpectedAttempts: remaining.length,
    unalignableMismatchAttempts: Math.min(missing, remaining.length) };
}
