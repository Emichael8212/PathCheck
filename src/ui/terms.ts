import { term } from '../contracts';
import type { TermId } from '../contracts';

const SEASONS = ['spring', 'summer', 'fall'] as const;
const SEASON_LABEL: Record<TermId['season'], string> = { spring: 'Spring', summer: 'Summer', fall: 'Fall' };

/** Canonical contract ordering: Gregorian year * 3 + spring=0/summer=1/fall=2. */
export function termFromIndex(sortIndex: number): TermId {
  const year = Math.floor(sortIndex / 3);
  return term(year, SEASONS[((sortIndex % 3) + 3) % 3]!);
}

export function termLabel(t: TermId): string {
  return `${SEASON_LABEL[t.season]} ${t.academicYear}`;
}

export function termKey(t: TermId): string {
  return String(t.sortIndex);
}

export function sameTerm(a: TermId, b: TermId): boolean {
  return a.sortIndex === b.sortIndex;
}

function nextIndex(index: number, includeSummer: boolean): number {
  let next = index + 1;
  if (!includeSummer && next % 3 === 1) next += 1;
  return next;
}

/**
 * UI planning assumption, not an academic rule: the first term a student can still
 * plan is the one after the term in progress at `nowIso`.
 */
export function upcomingTerm(nowIso: string, includeSummer: boolean): TermId {
  const date = new Date(nowIso);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const current = month <= 4 ? year * 3 : month <= 7 ? year * 3 + 1 : year * 3 + 2;
  return termFromIndex(nextIndex(current, includeSummer));
}

export function termSequence(start: TermId, count: number, includeSummer: boolean): TermId[] {
  const out: TermId[] = [];
  let index = start.sortIndex;
  if (!includeSummer && index % 3 === 1) index += 1;
  while (out.length < count) {
    out.push(termFromIndex(index));
    index = nextIndex(index, includeSummer);
  }
  return out;
}

export interface Horizon { terms: TermId[]; truncated: boolean }

/**
 * Modeled terms from start through target, bounded by the frozen search horizon.
 * A target beyond the bound stays user intent; the engine reports the horizon gap.
 */
export function planningHorizon(start: TermId, target: TermId, maxTerms: number, includeSummer: boolean, mustInclude: readonly TermId[] = []): Horizon {
  const first = Math.min(start.sortIndex, ...mustInclude.map(t => t.sortIndex));
  const all = termSequence(termFromIndex(first), maxTerms, includeSummer);
  const indexes = new Set(all.filter(t => t.sortIndex <= Math.max(target.sortIndex, first)).map(t => t.sortIndex));
  for (const t of mustInclude) indexes.add(t.sortIndex);
  const terms = [...indexes].sort((a, b) => a - b).map(termFromIndex);
  const truncated = target.sortIndex > (all.at(-1)?.sortIndex ?? target.sortIndex);
  return { terms: terms.slice(0, maxTerms), truncated: truncated || terms.length > maxTerms };
}
