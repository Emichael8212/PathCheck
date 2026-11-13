import { useSyncExternalStore } from 'react';
import type { CandidatePreview, CatalogModel } from '../contracts';
import { courseCode, findingMark } from './labels';
import type { ChangeRow, FindingDelta } from './planView';
import { termLabel } from './terms';

// Preview wording and layout helpers. Text is selected only from the engine's benefitClass,
// validabilityStatus and before/after findings; nothing is rescored or inferred.

const NARROW = '(max-width: 1023px)';
function subscribeNarrow(cb: () => void) {
  const m = window.matchMedia(NARROW);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
}
/** True below the two-column planner breakpoint, where previews open as a bottom sheet. */
export function useNarrowLayout(): boolean {
  return useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);
}

/** "Move SYN 301 to Fall 2027"; exact course/term wording from the change rows. */
export function changeSummary(rows: ChangeRow[], catalog: CatalogModel): string {
  const swaps = rows.filter(r => r.verb === 'Swap');
  const parts = rows.filter(r => r.verb !== 'Swap').map(r => {
    const code = courseCode(catalog, r.courseId);
    if (r.verb === 'Remove') return `Remove ${code}`;
    return `${r.verb} ${code}${r.after ? ` to ${termLabel(r.after)}` : ''}`;
  });
  for (let i = 0; i < swaps.length; i += 2) {
    const a = swaps[i]!, b = swaps[i + 1];
    parts.push(b ? `Swap ${courseCode(catalog, a.courseId)} and ${courseCode(catalog, b.courseId)}` : `Swap ${courseCode(catalog, a.courseId)}`);
  }
  return parts.join('; ');
}

/** Affected semesters, in term order: every term a change row leaves or enters. */
export function affectedTerms(rows: ChangeRow[]): string[] {
  const terms = new Map<number, string>();
  for (const r of rows) for (const t of [r.before, r.after]) if (t) terms.set(t.sortIndex, termLabel(t));
  return [...terms.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Headline built only from the engine's benefitClass and before/after delta. "No new
 * conflicts" appears only when no introduced finding is a known conflict.
 */
export function previewHeadline(preview: Pick<CandidatePreview, 'benefitClass'>, delta: FindingDelta): string {
  const resolved = delta.resolved.length;
  const newConflicts = delta.introduced.filter(f => findingMark(f).tone === 'conflict').length;
  if (preview.benefitClass === 'no_valid_alternative') return 'PathCheck couldn’t find a better option within its search limits.';
  if (preview.benefitClass === 'tradeoff') return `Tradeoff: resolves ${resolved}, adds ${delta.introduced.length}.`;
  const base = resolved > 0 ? `Resolves ${plural(resolved, 'issue')}` : 'No reported issue changes';
  return newConflicts === 0 ? `${base}. No new conflicts.` : `${base}. Adds ${plural(newConflicts, 'conflict')}.`;
}

export function previewValidity(preview: Pick<CandidatePreview, 'validabilityStatus' | 'assumptions'>): string {
  switch (preview.validabilityStatus) {
    case 'valid': return 'Meets the modeled rules.';
    case 'conditional': return preview.assumptions.length > 0 ? `Depends on ${plural(preview.assumptions.length, 'assumption')}. Confirm below.` : 'Depends on unverified evidence.';
    case 'invalid': return 'Breaks a modeled rule.';
    case 'unresolved': return 'Depends on rules PathCheck can’t verify.';
  }
}

