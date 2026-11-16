// F09: the credit total, the credits that count and those that don't, and the two neutral
// notes (docs/sprints/F09.md; docs/BRIEF.md §4 Flow A step 4; the owner's answer of
// 2026-11-16 on a course PathCheck doesn't know). The rules; the page is in
// tests/check.test.ts and tests/check-page.test.ts.
import { describe, expect, it } from 'vitest';
// @ts-expect-error The approved mockups are plain JavaScript, with no type declarations.
import { left as approvedLeft } from '../mockups/data.js';
import { answersFor } from '../src/answers';
import { summaryHtml } from '../src/check';
import { FULL_TIME, MOST_UNKNOWN_CREDITS, UNKNOWN_COURSE_CREDITS, USUAL_MOST, noteFor, totalsOf, type Totals } from '../src/credits';
import { curriculum, normalizeCode } from '../src/curriculum';
import { entryFor, setCredits, type Entry } from '../src/entries';
import { belowFullTime, overUsualMost } from '../src/wording';

const entries = (codes: readonly string[]): Entry[] => codes.map(code => entryFor(normalizeCode(code) ?? code, curriculum));
const totals = (list: readonly Entry[], legacy: boolean | null = null): Totals => totalsOf(list, answersFor(list, curriculum, legacy));
const numbers = (codes: readonly string[], legacy: boolean | null = null): number[] => {
  const { total, counts, doesNotCount } = totals(entries(codes), legacy);
  return [total, counts, doesNotCount];
};

describe('the total', () => {
  it('adds up the credits of the entered courses', () => {
    // The six courses of the approved design: 18 in all, 12 count, 6 don't.
    expect(numbers(['ACT 215', 'MGT 321', 'MKT 410', 'BIO 230', 'ENG 131', 'ENG 140'])).toEqual([18, 12, 6]);
    expect(numbers(['ORI 100'])).toEqual([1, 1, 0]);
    expect(numbers(['ORI 100', 'MGT 321', 'BIOL 127'])).toEqual([5, 5, 0]);
    expect(numbers([])).toEqual([0, 0, 0]);
    // Credits are the curriculum's, never a flat number per course.
    expect(entries(['ORI 100', 'BIOL 127', 'MGT 321']).map(entry => entry.credits)).toEqual([1, 1, 3]);
  });

  it("adds the rule's credits for an elective by the rule", () => {
    expect(entries(['MKT 410'])[0]).toMatchObject({ kind: 'elective', credits: curriculum.electives.creditsPerCourse });
    expect(numbers(['MKT 410'])).toEqual([3, 3, 0]);
    expect(numbers(['MKT 410', 'CIS 499', 'ECO 301', 'ACT 350'])).toEqual([12, 9, 3]);
  });

  it('splits the total by the answers', () => {
    // A second course for a filled pick; a fourth elective; a course that never counts; one outside the curriculum.
    expect(numbers(['ENG 131', 'ENG 140'])).toEqual([6, 3, 3]);
    expect(numbers(['GEO 206', 'HIS 132'])).toEqual([6, 3, 3]);
    expect(numbers(['CIS 304', 'CIS 303'])).toEqual([6, 3, 3]);
    expect(numbers(['BIO 230', 'XYZ 101'])).toEqual([6, 0, 6]);
    // A legacy course follows the legacy answer.
    expect(numbers(['FLS 161', 'MGT 321'], true)).toEqual([6, 6, 0]);
    expect(numbers(['FLS 161', 'MGT 321'], false)).toEqual([6, 3, 3]);
    expect(() => totalsOf(entries(['MGT 321']), [])).toThrow(/needs its answer/);
  });

  it('leaves a course that waits for the legacy answer out of both counts', () => {
    expect(totals(entries(['FLS 161', 'MGT 321']))).toEqual({ total: 6, counts: 3, doesNotCount: 0, waiting: 3, pending: true });
    // The legacy course asks; the elective after it waits; both are in the total only.
    expect(totals(entries(['FLS 161', 'MKT 410', 'CIS 499', 'ECO 301']))).toEqual({ total: 12, counts: 6, doesNotCount: 0, waiting: 6, pending: true });
    expect(totals(entries(['FLS 161', 'MKT 410', 'CIS 499', 'ECO 301']), true)).toEqual({ total: 12, counts: 9, doesNotCount: 3, waiting: 0, pending: false });
    expect(totals(entries(['FLS 161', 'MKT 410', 'CIS 499', 'ECO 301']), false)).toEqual({ total: 12, counts: 9, doesNotCount: 3, waiting: 0, pending: false });
    expect(totals(entries(['PSY 251', 'GEO 206']))).toEqual({ total: 6, counts: 0, doesNotCount: 0, waiting: 6, pending: true });
    // A waiting course with no credits is still a course that waits.
    const noCredits = [{ credits: 0 }, { credits: 3 }];
    expect(totalsOf(noCredits, [{ kind: 'ask' }, { kind: 'counts' }])).toEqual({ total: 3, counts: 3, doesNotCount: 0, waiting: 0, pending: true });
  });
});

describe('the notes', () => {
  it('notes a total under 12', () => {
    expect(FULL_TIME).toBe(12);
    for (const total of [0, 1, 3, 9, 11]) expect(noteFor(total), String(total)).toBe('under');
    expect(belowFullTime(FULL_TIME)).toBe('Below 12 credits: below full-time; may affect scholarships.');
    // The brief's words, inside the approved design's sentence.
    expect(belowFullTime(FULL_TIME)).toContain('below full-time; may affect scholarships');
    expect(belowFullTime(FULL_TIME)).toBe(approvedLeft.controls.fewest.note);
  });

  it('notes a total over 18', () => {
    expect(USUAL_MOST).toBe(18);
    for (const total of [19, 21, 40]) expect(noteFor(total), String(total)).toBe('over');
    expect(overUsualMost(USUAL_MOST)).toBe('Over 18 credits: may cost extra.');
    expect(overUsualMost(USUAL_MOST)).toContain('may cost extra');
    expect(overUsualMost(USUAL_MOST)).toBe(approvedLeft.controls.most.note);
  });

  it('has no note from 12 to 18', () => {
    for (const total of [12, 13, 15, 17, 18]) expect(noteFor(total), String(total)).toBeNull();
  });
});

describe("a course PathCheck doesn't know", () => {
  it('starts an unknown course at 3 credits', () => {
    expect(UNKNOWN_COURSE_CREDITS).toBe(3);
    for (const code of ['BIO 230', 'CIS 304', 'CIS 415', 'XYZ 101']) expect(entries([code])[0], code).toMatchObject({ kind: 'unknown', credits: 3 });
    expect(numbers(['BIO 230'])).toEqual([3, 0, 3]);
  });

  it("changes only an unknown course's credits, to a whole number in range", () => {
    const list = entries(['MGT 321', 'BIO 230', 'MKT 410', 'ORI 100', 'FLS 161']);
    const changed = setCredits(list, 'BIO 230', 4);
    expect(changed.map(entry => entry.credits)).toEqual([3, 4, 3, 1, 3]);
    expect(list.map(entry => entry.credits)).toEqual([3, 3, 3, 1, 3]);
    // Courses PathCheck knows keep the curriculum's credits.
    for (const code of ['MGT 321', 'MKT 410', 'ORI 100', 'FLS 161', 'XYZ 999']) expect(setCredits(list, code, 5), code).toBe(list);
    // Nothing but a whole number from 0 to the most allowed.
    expect(MOST_UNKNOWN_CREDITS).toBe(12);
    for (const bad of [-1, 13, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(setCredits(list, 'BIO 230', bad), String(bad)).toBe(list);
    expect(setCredits(list, 'BIO 230', 0).map(entry => entry.credits)).toEqual([3, 0, 3, 1, 3]);
    expect(setCredits(list, 'BIO 230', 12).map(entry => entry.credits)).toEqual([3, 12, 3, 1, 3]);
    expect(setCredits(list, 'BIO 230', 3)).toBe(list);
  });

  it("never counts an unknown course's credits", () => {
    const list = entries(['MGT 321', 'BIO 230']);
    expect(totals(list)).toMatchObject({ total: 6, counts: 3, doesNotCount: 3 });
    expect(totals(setCredits(list, 'BIO 230', 9))).toMatchObject({ total: 12, counts: 3, doesNotCount: 9 });
    expect(totals(setCredits(list, 'BIO 230', 0))).toMatchObject({ total: 3, counts: 3, doesNotCount: 0 });
    // An edited value moves the notes.
    const nine = entries(['MGT 321', 'ENG 131', 'ACT 215', 'BIO 230']);
    expect(noteFor(totals(nine).total)).toBeNull();
    expect(noteFor(totals(setCredits(nine, 'BIO 230', 2)).total)).toBe('under');
    expect(noteFor(totals(setCredits(nine, 'BIO 230', 12)).total)).toBe('over');
    const fifteen = entries(['MGT 321', 'ENG 131', 'ACT 215', 'MKT 321', 'CIS 300', 'BIO 230']);
    expect(totals(fifteen).total).toBe(18);
    expect(noteFor(totals(fifteen).total)).toBeNull();
    expect(noteFor(totals(setCredits(fifteen, 'BIO 230', 4)).total)).toBe('over');
  });
});

describe('whatever the list', () => {
  const SEED = 20261116;
  const random = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = ['PSY 251', 'FLS 161', 'MGT 220', 'HIS 132', 'GEO 206', 'ENG 131', 'ENG 140', 'ORI 100', 'BIOL 127', 'MGT 321', 'FIN 201', 'MKT 410', 'CIS 499', 'ECO 301', 'ACT 350', 'CIS 304', 'BIO 230', 'XYZ 101'];

  it('adds up for any list', () => {
    const next = random(SEED);
    let waited = 0;
    for (let i = 0; i < 500; i++) {
      const codes = [...new Set(Array.from({ length: 1 + Math.floor(next() * 9) }, () => pool[Math.floor(next() * pool.length)] as string))];
      let list: readonly Entry[] = entries(codes);
      // Some unknown courses get other credits.
      for (const entry of list) if (entry.kind === 'unknown' && next() < 0.5) list = setCredits(list, entry.code, Math.floor(next() * 13));
      const label = `seed ${SEED}, list ${i}: ${list.map(entry => `${entry.code}=${entry.credits}`).join(', ')}`;
      for (const legacy of [true, false, null]) {
        const answers = answersFor(list, curriculum, legacy);
        const sums = totalsOf(list, answers);
        const of = (kinds: string[]): number => list.reduce((credits, entry, at) => (kinds.includes(answers[at]?.kind ?? '') ? credits + entry.credits : credits), 0);
        expect(sums.total, label).toBe(list.reduce((credits, entry) => credits + entry.credits, 0));
        expect(sums.total, label).toBe(sums.counts + sums.doesNotCount + sums.waiting);
        expect(sums.counts, label).toBe(of(['counts']));
        expect(sums.doesNotCount, label).toBe(of(['no']));
        // Rows wait only while the legacy answer is missing.
        const pending = answers.some(answer => answer.kind === 'ask' || answer.kind === 'waiting');
        if (legacy !== null) expect(pending, label).toBe(false);
        expect(sums.pending, label).toBe(pending);
        expect(sums.waiting > 0, label).toBe(pending);
        expect(sums.waiting, label).toBe(of(['ask', 'waiting']));
        // The page says it is waiting exactly when a row is.
        expect(summaryHtml({ entries: list, legacy, filter: 'all' }, curriculum).includes('Waiting for your legacy answer.'), label).toBe(pending);
        if (pending) waited++;
        // An unknown course's credits are never among those that count.
        for (const entry of list) {
          if (entry.kind !== 'unknown') continue;
          expect(totalsOf(setCredits(list, entry.code, (entry.credits + 5) % 13), answers).counts, label).toBe(sums.counts);
        }
      }
    }
    expect(waited).toBeGreaterThan(30);
  });
});
