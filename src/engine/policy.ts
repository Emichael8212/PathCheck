import type { CatalogModel } from '../contracts';

// Engine-recognized policy-gap identifiers (match docs/curriculum `unresolvedPolicies`).
// A gap listed in `CatalogModel.policyGaps` makes the corresponding policy explicitly
// unresolved. The ABSENCE of a gap is NOT evidence that a policy was sourced: contracts-v1
// has no field that can carry a sourced repeat-credit rule or a requirement-level minimum
// grade, so the engine never infers either one from silence. It fails closed instead:
//  - any repeated attempt of one course leaves that course's credit/satisfaction unresolved;
//  - for any non-synthetic catalog, requirement-level grade/repeat rules are treated as
//    unmodeled, so the degree total can never be reported `satisfied`.
// Synthetic fixtures are exempt from the second rule only because their (invented) rules
// are defined to be exactly what the fixture encodes; they make no ASU claim.
export const POLICY = Object.freeze({
  repeatCredit: 'repeat-credit-policy',
  transfer: 'transfer-policy',
  historicalEquivalency: 'historical-course-equivalency',
  overlapPermissions: 'requirement-overlap-permissions',
  minimumGrade: 'minimum-grade-current-applicability',
  prerequisiteCoverage: 'prerequisite-corequisite-coverage',
  offerings: 'term-specific-offerings',
  legacyElectives: 'legacy-elective-eligibility',
});

/** Policies contracts-v1 cannot represent as sourced rules (requested contract gap). */
export const UNMODELED_REQUIREMENT_POLICIES = Object.freeze(['requirement-minimum-grade', 'repeat-credit-rule'] as const);

/** True when requirement-level grade/repeat policy cannot be sourced through the contract. */
export function requirementPoliciesUnmodeled(catalog: CatalogModel): boolean {
  return catalog.approval !== 'synthetic';
}

/** Raw institution strings treated as the home institution. Anything else is transfer work. */
export function isHomeInstitution(raw: string | null): boolean {
  if (raw === null) return true;
  const s = raw.trim().toLowerCase();
  return s === '' || s === 'asu' || s === 'alabama state university' || s === 'alabama state';
}

export type InstitutionClass = 'home' | 'home_unverified' | 'external';
/**
 * Manual rows keep the blank/ASU = home convention (the student is entering their own
 * home-institution work). Extracted rows carry no such authority: a missing institution is
 * unknown provenance, and "ASU" is an ambiguous abbreviation (several institutions use it),
 * so both are only an UNVERIFIED home candidate that can never yield a definite match.
 */
export function classifyInstitution(raw: string | null, source: 'manual' | 'extracted'): InstitutionClass {
  if (!isHomeInstitution(raw)) return 'external';
  if (source === 'manual') return 'home';
  const s = (raw ?? '').trim().toLowerCase();
  return s === 'alabama state university' || s === 'alabama state' ? 'home' : 'home_unverified';
}
