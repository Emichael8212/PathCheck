// F05: legacy electives (docs/sprints/F05.md; docs/BRIEF.md §5 "Legacy electives" and "No
// double counting", §4 "Remembering"; owner answer of 2026-11-16 on transfer credit).
// Every student here is made up.
import { afterEach, describe, expect, it } from 'vitest';
import rawData from '../docs/curriculum/provisional-current.json';
import madeUp from './fixtures/made-up-program.json';
import { curriculum, loadCurriculum, type Curriculum } from '../src/curriculum';
import {
  LEGACY_KEY, LEGACY_NO, LEGACY_QUESTION, LEGACY_YES, browserStorage, clearLegacyAnswer, legacyQuestionNeeded, readLegacyAnswer, writeLegacyAnswer,
  type AnswerStorage, type LegacyAnswer,
} from '../src/legacy';
import { placeCourses, type Placement } from '../src/placement';
import { courseStandings, type TranscriptRow } from '../src/transcript';

/** A made-up row: "FLS 161" is passed with a B; "FLS 161:D" has that grade; ":-" is in progress; ":T" is transfer credit. */
const rowOf = (entry: string, i = 0): TranscriptRow => {
  const [code = '', mark = 'B'] = entry.split(':');
  if (mark === 'T') return { code, term: 'Transfer credit', credits: 3, grade: 'T', transfer: true };
  return { code, term: `Term ${i + 1}`, credits: 3, grade: mark === '-' ? null : mark, transfer: false };
};
const standingsOf = (entries: string[], program: Curriculum = curriculum) => courseStandings(entries.map(rowOf), program.grades);
const place = (entries: string[], legacy?: LegacyAnswer, program: Curriculum = curriculum): Placement =>
  placeCourses(standingsOf(entries, program), program, { legacy });
const YES = true;
const NO = false;
const NOT_ANSWERED = null;

const socialPick = (result: Placement) =>
  result.blocks.find(one => one.block.id === 'social-sciences')?.picks[0]?.filled.map(one => `${one.course.code} ${one.state}`);
const electivesOf = (result: Placement) => result.electives.filled.map(one => `${one.course.code} ${one.state}`);
const leftOver = (result: Placement) => result.unplaced.map(one => `${one.code} ${one.reason}${one.reason === 'pick-filled' ? ` by ${one.filledBy.join('+')}` : ''}`);

/** A curriculum made from the real data with one change, for comparing arrangements. */
type Data = { blocks: { id: string; choices: { courses: { courseId: string }[] }[] }[]; electives: { legacyOnlyCourses: { courseId: string; title: string; credits: number }[] } };
const changed = (edit: (data: Data) => void): Curriculum => {
  const data = structuredClone(rawData) as unknown as Data;
  edit(data);
  return loadCurriculum(data);
};

describe('when to ask the legacy question', () => {
  it('asks only when one of the four courses appears', () => {
    for (const code of ['PSY 251', 'FLS 161', 'MGT 220', 'MGT 203', 'psy251', 'FLS-161', ' mgt  220 ', 'Mgt203']) {
      expect(legacyQuestionNeeded([code], curriculum), code).toBe(true);
      expect(legacyQuestionNeeded(['ENG 131', code, 'BIO 230'], curriculum), code).toBe(true);
    }
    expect(legacyQuestionNeeded([], curriculum)).toBe(false);
    expect(legacyQuestionNeeded(['ENG 131', 'GEO 206', 'MKT 410', 'CIS 300', 'FIN 201'], curriculum)).toBe(false);
    // Look-alikes are not the four courses.
    expect(legacyQuestionNeeded(['PSY 250', 'PSY 252', 'MGT 204', 'MGT 221', 'FLS 162', 'FLS 16', 'PSY 2511'], curriculum)).toBe(false);
    // Junk never asks, and never fails.
    for (const junk of ['', 'hello', 'PSY', 'PSY 2511', '251', '   ']) expect(legacyQuestionNeeded([junk], curriculum), JSON.stringify(junk)).toBe(false);
    expect(legacyQuestionNeeded(['', 'hello', 'GEO 206', 'PSY'], curriculum)).toBe(false);
    expect(legacyQuestionNeeded([null, undefined, 251] as unknown as string[], curriculum)).toBe(false);
    // Junk beside one of the four still asks.
    expect(legacyQuestionNeeded(['hello', '', 'mgt-203'], curriculum)).toBe(true);
  });

  it('reads the legacy courses from the curriculum', () => {
    // The same data with a different legacy list: the answer follows that list.
    const other = changed(data => { data.electives.legacyOnlyCourses = [{ courseId: 'ART-101', title: 'Made-up Art', credits: 3 }]; });
    expect(legacyQuestionNeeded(['art101'], other)).toBe(true);
    expect(legacyQuestionNeeded(['PSY 251', 'FLS 161', 'MGT 220', 'MGT 203'], other)).toBe(false);
    expect(legacyQuestionNeeded(['ART 101'], curriculum)).toBe(false);
    // A program with no legacy courses never asks.
    const none = loadCurriculum(madeUp);
    expect(none.electives.legacyOnly).toEqual([]);
    expect(legacyQuestionNeeded(['PSY 251', 'FLS 161', 'XC 351'], none)).toBe(false);
  });

  it("uses the brief's wording", () => {
    expect(LEGACY_QUESTION).toBe('Are you a legacy CIS student?');
    expect(LEGACY_YES).toBe('Yes');
    expect(LEGACY_NO).toBe('No');
  });
});

describe('the three courses that are only legacy electives', () => {
  it('counts legacy-only courses as electives for a legacy student', () => {
    const result = place(['FLS 161', 'MGT 220', 'MGT 203'], YES);
    expect(electivesOf(result)).toEqual(['FLS 161 done', 'MGT 220 done', 'MGT 203 done']);
    expect(result.electives.filled.map(one => one.by)).toEqual(['legacy', 'legacy', 'legacy']);
    // Titles and credits are the curriculum's.
    expect(result.electives.filled.map(one => one.course)).toEqual(curriculum.electives.legacyOnly.filter(course => course.code !== 'PSY 251'));
    expect(result.electives.credits).toEqual({ done: 9, inProgress: 0, needed: 0 });
    expect(result.credits).toMatchObject({ done: 9, inProgress: 0, remaining: 112 });
    expect(result.unplaced).toEqual([]);

    const running = place(['MGT 220:-', 'MKT 410'], YES);
    expect(electivesOf(running)).toEqual(['MKT 410 done', 'MGT 220 in-progress']);
    expect(running.electives.credits).toEqual({ done: 3, inProgress: 3, needed: 3 });
  });

  it('does not count them for a student who is not legacy', () => {
    const result = place(['FLS 161', 'MGT 220', 'MGT 203:-'], NO);
    expect(electivesOf(result)).toEqual([]);
    expect(leftOver(result)).toEqual(['FLS 161 legacy-only', 'MGT 220 legacy-only', 'MGT 203 legacy-only']);
    expect(result.credits).toMatchObject({ done: 0, inProgress: 0, remaining: 121 });
  });

  it('treats no answer as No', () => {
    for (const entries of [['FLS 161', 'MGT 220', 'MGT 203:-'], ['PSY 251', 'GEO 206', 'FLS 161:T'], ['PSY 251', 'HIS 131', 'HIS 132:-', 'MGT 203'], []]) {
      const standings = standingsOf(entries);
      const no = placeCourses(standings, curriculum, { legacy: false });
      expect(placeCourses(standings, curriculum, { legacy: null }), entries.join()).toEqual(no);
      expect(placeCourses(standings, curriculum, { legacy: undefined }), entries.join()).toEqual(no);
      expect(placeCourses(standings, curriculum, {}), entries.join()).toEqual(no);
      expect(placeCourses(standings, curriculum), entries.join()).toEqual(no);
      // Only a real Yes counts: nothing that merely looks like one.
      for (const almost of ['yes', 'Yes', 1, {}]) expect(placeCourses(standings, curriculum, { legacy: almost as unknown as boolean }), entries.join()).toEqual(no);
    }
    expect(leftOver(place(['FLS 161'], NOT_ANSWERED))).toEqual(['FLS 161 legacy-only']);
  });

  it('does not count a legacy course that was not passed', () => {
    const entries = ['FLS 161:D', 'MGT 220:W', 'MGT 203:I', 'PSY 251:D'];
    const result = place(entries, YES);
    expect(electivesOf(result)).toEqual([]);
    expect(socialPick(result)).toEqual([]);
    expect(result.unplaced).toEqual([]);
    expect(result.credits).toMatchObject({ done: 0, inProgress: 0, remaining: 121 });
    expect(standingsOf(entries).map(one => `${one.code} ${one.standing}`)).toEqual(['FLS 161 must-repeat', 'MGT 220 no-credit', 'MGT 203 no-credit', 'PSY 251 must-repeat']);
    expect(place(entries, YES)).toEqual(place(entries, NO));
  });

  it('asks the legacy question of transfer credit too', () => {
    const standings = courseStandings([{ code: 'FLS 161', term: 'Transfer credit', credits: 3, grade: 'TR', transfer: true }], curriculum.grades);
    const yes = placeCourses(standings, curriculum, { legacy: true });
    expect(electivesOf(yes)).toEqual(['FLS 161 done']);
    expect(yes.credits.done).toBe(3);
    for (const answer of [false, null]) {
      const result = placeCourses(standings, curriculum, { legacy: answer });
      expect(leftOver(result)).toEqual(['FLS 161 legacy-only']);
      expect(result.credits.done).toBe(0);
    }
    expect(legacyQuestionNeeded(standings.map(one => one.code), curriculum)).toBe(true);
  });

  it('still stops at three electives', () => {
    const result = place(['FLS 161', 'MGT 220', 'MGT 203', 'FIN 201', 'MKT 410'], YES);
    expect(electivesOf(result)).toEqual(['FLS 161 done', 'MGT 220 done', 'MGT 203 done']);
    expect(leftOver(result)).toEqual(['FIN 201 electives-full', 'MKT 410 electives-full']);
    expect(result.electives.credits).toEqual({ done: 9, inProgress: 0, needed: 0 });
    expect(result.credits.done).toBe(9);
    // A passed elective goes before a legacy course still in progress, as for any elective.
    const mixed = place(['FLS 161:-', 'FIN 201', 'MKT 410', 'CIS 499'], YES);
    expect(electivesOf(mixed)).toEqual(['FIN 201 done', 'MKT 410 done', 'CIS 499 done']);
    expect(leftOver(mixed)).toEqual(['FLS 161 electives-full']);
  });
});

describe('PSY 251, which is a pick and a legacy elective', () => {
  it('keeps PSY 251 in its pick when the pick is free', () => {
    for (const entry of ['PSY 251', 'PSY 251:-', 'PSY 251:T']) {
      const yes = place([entry], YES);
      expect(socialPick(yes), entry).toEqual([`PSY 251 ${entry.endsWith(':-') ? 'in-progress' : 'done'}`]);
      expect(electivesOf(yes)).toEqual([]);
      expect(yes.unplaced).toEqual([]);
      expect(yes).toEqual(place([entry], NO));
      expect(yes).toEqual(place([entry], NOT_ANSWERED));
    }
  });

  it('moves PSY 251 to an elective place when that counts more', () => {
    // Two passed courses for one pick: the other keeps the pick, PSY 251 becomes an elective.
    for (const entries of [['PSY 251', 'GEO 206'], ['GEO 206', 'PSY 251']]) {
      const yes = place(entries, YES);
      expect(socialPick(yes), entries.join()).toEqual(['GEO 206 done']);
      expect(electivesOf(yes)).toEqual(['PSY 251 done']);
      expect(yes.electives.filled[0]?.by).toBe('legacy');
      expect(yes.unplaced).toEqual([]);
      expect(yes.credits.done).toBe(6);
      expect(place(entries, NO).credits.done).toBe(3);
    }

    // With the history sequence passed, HIS 132 holds the pick.
    const history = place(['PSY 251', 'HIS 131', 'HIS 132'], YES);
    expect(socialPick(history)).toEqual(['HIS 132 done']);
    expect(electivesOf(history)).toEqual(['PSY 251 done']);
    expect(history.credits.done).toBe(9);
    expect(history.sequence.state).toBe('done');

    // PSY 251 in progress beside a passed pick course: one more place in progress.
    const running = place(['PSY 251:-', 'GEO 206'], YES);
    expect(socialPick(running)).toEqual(['GEO 206 done']);
    expect(electivesOf(running)).toEqual(['PSY 251 in-progress']);
    expect(running.credits).toMatchObject({ done: 3, inProgress: 3 });

    // PSY 251 passed, HIS 132 still running: moving PSY 251 lets HIS 132 take the pick.
    const entries = ['PSY 251', 'HIS 131', 'HIS 132:-'];
    const yes = place(entries, YES);
    expect(socialPick(yes)).toEqual(['HIS 132 in-progress']);
    expect(electivesOf(yes)).toEqual(['PSY 251 done']);
    expect(yes.unplaced).toEqual([]);
    expect(yes.credits).toMatchObject({ done: 6, inProgress: 3 });
    const no = place(entries, NO);
    expect(socialPick(no)).toEqual(['PSY 251 done']);
    expect(leftOver(no)).toEqual(['HIS 132 pick-filled by PSY 251']);
    expect(no.credits).toMatchObject({ done: 6, inProgress: 0 });
    expect(yes.sequence.state).toBe('in-progress');
    expect(no.sequence.state).toBe('in-progress');
  });

  it('leaves PSY 251 in its pick when moving it gains nothing', () => {
    const full = ['FIN 201', 'MKT 410', 'CIS 499'];
    const threeElectives = ['FIN 201 done', 'MKT 410 done', 'CIS 499 done'];

    const first = place(['PSY 251', 'GEO 206', ...full], YES);
    expect(socialPick(first)).toEqual(['PSY 251 done']);
    expect(leftOver(first)).toEqual(['GEO 206 pick-filled by PSY 251']);
    expect(electivesOf(first)).toEqual(threeElectives);
    expect(first.credits).toMatchObject({ done: 12, inProgress: 0 });

    const second = place(['GEO 206', 'PSY 251', ...full], YES);
    expect(socialPick(second)).toEqual(['GEO 206 done']);
    expect(leftOver(second)).toEqual(['PSY 251 pick-filled by GEO 206']);
    expect(electivesOf(second)).toEqual(threeElectives);
    expect(second.credits).toMatchObject({ done: 12, inProgress: 0 });

    // A done course is never traded for one in progress.
    for (const entries of [['PSY 251', 'GEO 206:-', ...full], ['GEO 206:-', ...full, 'PSY 251']]) {
      const result = place(entries, YES);
      expect(socialPick(result), entries.join()).toEqual(['PSY 251 done']);
      expect(leftOver(result)).toEqual(['GEO 206 pick-filled by PSY 251']);
      expect(electivesOf(result)).toEqual(threeElectives);
      expect(result.credits).toMatchObject({ done: 12, inProgress: 0 });
    }

    const running = place(['PSY 251:-', 'GEO 206', ...full], YES);
    expect(socialPick(running)).toEqual(['GEO 206 done']);
    expect(leftOver(running)).toEqual(['PSY 251 pick-filled by GEO 206']);
    expect(electivesOf(running)).toEqual(threeElectives);
    expect(running.credits).toMatchObject({ done: 12, inProgress: 0 });

    // In each case nothing differs from a legacy student whose PSY 251 is only a pick course.
    const pickOnly = changed(data => { data.electives.legacyOnlyCourses = data.electives.legacyOnlyCourses.filter(course => course.courseId !== 'PSY-251'); });
    for (const entries of [['PSY 251', 'GEO 206', ...full], ['GEO 206', 'PSY 251', ...full], ['PSY 251', 'GEO 206:-', ...full], ['PSY 251:-', 'GEO 206', ...full]]) {
      expect(place(entries, YES).unplaced, entries.join()).toEqual(place(entries, YES, pickOnly).unplaced);
      expect(place(entries, YES).credits).toEqual(place(entries, YES, pickOnly).credits);
    }
  });
});

describe('whatever the transcript', () => {
  // A small repeatable source of made-up transcripts.
  const SEED = 20261116;
  const random = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const four = ['PSY 251', 'FLS 161', 'MGT 220', 'MGT 203'];
  const others = ['HIS 131', 'HIS 132', 'ENG 209', 'ENG 210', 'GEO 206', 'SOC 110', 'ANT 113', 'FIN 201', 'MKT 410', 'CIS 499', 'ECO 301', 'ACT 350', 'ENG 131', 'CIS 300', 'BIO 230', 'CIS 304'];
  const marks = ['A', 'B', 'C', 'D', 'W', 'I', '-', '-', 'T'];
  const transcripts = (pool: string[], count: number): { label: string; entries: string[] }[] => {
    const next = random(SEED);
    return Array.from({ length: count }, (_, i) => {
      const entries = Array.from({ length: Math.floor(next() * 13) }, () => `${pool[Math.floor(next() * pool.length)]}:${marks[Math.floor(next() * marks.length)]}`);
      return { label: `seed ${SEED}, transcript ${i}: ${entries.join(' ')}`, entries };
    });
  };

  // The two arrangements a legacy student's PSY 251 can have, each as its own curriculum.
  const pickOnly = changed(data => { data.electives.legacyOnlyCourses = data.electives.legacyOnlyCourses.filter(course => course.courseId !== 'PSY-251'); });
  const electiveOnly = changed(data => {
    const pick = data.blocks.find(block => block.id === 'social-sciences')!.choices[0]!;
    pick.courses = pick.courses.filter(course => course.courseId !== 'PSY-251');
  });
  const summary = (result: Placement) => ({
    credits: result.credits,
    required: result.blocks.map(one => one.required.map(place => `${place.course.code} ${place.state}`)),
    picks: result.blocks.map(one => one.picks.map(pick => pick.filled.map(filled => `${filled.course.code} ${filled.state}`))),
    electives: result.electives.filled.map(filled => `${filled.course.code} ${filled.state} ${filled.by}`),
    sequence: result.sequence,
    unplaced: result.unplaced,
  });

  it('never counts less for a legacy student', () => {
    let moved = 0;
    let stayed = 0;
    for (const { label, entries } of transcripts([...four, ...four, ...others], 600)) {
      const standings = standingsOf(entries);
      const no = placeCourses(standings, curriculum, { legacy: false });
      const yes = placeCourses(standings, curriculum, { legacy: true });
      // No answer, and no option at all, are the same as No.
      expect(placeCourses(standings, curriculum, { legacy: null }), label).toEqual(no);
      expect(placeCourses(standings, curriculum), label).toEqual(no);
      // Yes never counts less.
      expect(yes.credits.done, label).toBeGreaterThanOrEqual(no.credits.done);
      expect(yes.credits.done + yes.credits.inProgress, label).toBeGreaterThanOrEqual(no.credits.done + no.credits.inProgress);

      // Yes is the better of the two arrangements: PSY 251 only a pick, unless PSY 251 only
      // an elective gives strictly more done, or the same done and strictly more in progress.
      const asPick = placeCourses(standings, pickOnly, { legacy: true });
      const asElective = placeCourses(standings, electiveOnly, { legacy: true });
      const better = asElective.credits.done > asPick.credits.done
        || (asElective.credits.done === asPick.credits.done && asElective.credits.inProgress > asPick.credits.inProgress);
      expect(summary(yes), label).toEqual(summary(better ? asElective : asPick));
      if (better) moved++; else if (standings.some(one => one.code === 'PSY 251' && (one.standing === 'passed' || one.standing === 'in-progress'))) stayed++;

      // No course fills two places; none is both placed and left over; three electives at most.
      const fills = [
        ...yes.blocks.flatMap(one => one.required.filter(place => place.state !== 'needed').map(place => place.course.code)),
        ...yes.blocks.flatMap(one => one.picks.flatMap(pick => pick.filled.map(filled => filled.course.code))),
        ...yes.electives.filled.map(filled => filled.course.code),
      ];
      expect(new Set(fills).size, label).toBe(fills.length);
      for (const one of yes.unplaced) expect(fills, label).not.toContain(one.code);
      const active = standings.filter(one => one.standing === 'passed' || one.standing === 'in-progress').map(one => one.code).sort();
      expect([...fills, ...yes.unplaced.map(one => one.code)].sort(), label).toEqual(active);
      expect(yes.electives.filled.length, label).toBeLessThanOrEqual(3);
      expect(yes.electives.credits.done + yes.electives.credits.inProgress, label).toBeLessThanOrEqual(9);
      expect(yes.electives.credits.needed, label).toBeGreaterThanOrEqual(0);
      expect(yes.credits.done + yes.credits.inProgress + yes.credits.remaining, label).toBe(121);
      // With Yes, nothing is ever left over for being legacy-only; the exceptions still never count.
      expect(yes.unplaced.map(one => one.reason), label).not.toContain('legacy-only');
      expect(fills, label).not.toContain('CIS 304');
    }
    // The transcripts really did reach both outcomes.
    expect(moved).toBeGreaterThan(20);
    expect(stayed).toBeGreaterThan(20);
  });

  it('changes nothing for a student without the four courses', () => {
    for (const { label, entries } of transcripts(others, 300)) {
      const standings = standingsOf(entries);
      const no = placeCourses(standings, curriculum, { legacy: false });
      expect(placeCourses(standings, curriculum, { legacy: true }), label).toEqual(no);
      expect(placeCourses(standings, curriculum, { legacy: null }), label).toEqual(no);
      expect(legacyQuestionNeeded(standings.map(one => one.code), curriculum), label).toBe(false);
    }
  });

  it('does not change its input', () => {
    const standings = standingsOf(['PSY 251', 'GEO 206', 'FLS 161:-']);
    const before = structuredClone(standings);
    const options = Object.freeze({ legacy: true });
    placeCourses(standings, curriculum, options);
    expect(standings).toEqual(before);
  });
});

describe('remembering the answer', () => {
  /** A stand-in for the browser's storage that also records every key it is asked about. */
  const fakeStorage = (start: Record<string, string> = {}) => {
    const items = new Map(Object.entries(start));
    const keys: string[] = [];
    const storage: AnswerStorage = {
      getItem: key => { keys.push(key); return items.get(key) ?? null; },
      setItem: (key, value) => { keys.push(key); items.set(key, value); },
      removeItem: key => { keys.push(key); items.delete(key); },
    };
    return { storage, items, keys };
  };

  it('remembers the answer and lets it be changed', () => {
    const { storage, items, keys } = fakeStorage({ 'another-key': 'kept' });
    expect(readLegacyAnswer(storage)).toBeNull();
    writeLegacyAnswer(storage, true);
    expect(readLegacyAnswer(storage)).toBe(true);
    writeLegacyAnswer(storage, false);
    expect(readLegacyAnswer(storage)).toBe(false);
    writeLegacyAnswer(storage, true);
    writeLegacyAnswer(storage, true);
    expect(readLegacyAnswer(storage)).toBe(true);

    // After a reload the page has nothing but what the storage holds.
    const reloaded = fakeStorage(Object.fromEntries(items));
    expect(readLegacyAnswer(reloaded.storage)).toBe(true);
    writeLegacyAnswer(reloaded.storage, false);
    expect(readLegacyAnswer(fakeStorage(Object.fromEntries(reloaded.items)).storage)).toBe(false);

    clearLegacyAnswer(storage);
    expect(readLegacyAnswer(storage)).toBeNull();
    clearLegacyAnswer(storage);
    expect(readLegacyAnswer(storage)).toBeNull();

    // One key only, and nothing else in the storage is touched.
    expect(LEGACY_KEY).toBe('pathcheck.legacy');
    expect(new Set(keys)).toEqual(new Set(['pathcheck.legacy']));
    expect(Object.fromEntries(items)).toEqual({ 'another-key': 'kept' });
  });

  it('keeps only a real Yes or No', () => {
    // A screen might hand over a button's text or value by mistake. "No" must never be kept as a Yes.
    const starts: Record<string, string>[] = [{}, { 'pathcheck.legacy': 'no' }, { 'pathcheck.legacy': 'yes' }];
    for (const start of starts) {
      for (const wrong of ['No', 'Yes', 'no', 'yes', 'true', 'false', 1, 0, null, undefined, {}, []]) {
        const { storage, items } = fakeStorage(start);
        writeLegacyAnswer(storage, wrong as unknown as boolean);
        expect(Object.fromEntries(items), JSON.stringify(wrong)).toEqual(start);
      }
    }
  });

  it('ignores a stored value it does not recognise', () => {
    for (const stored of ['', 'true', 'false', 'YES', 'Yes', 'No', '1', '0', 'null', 'maybe', ' yes', '{"legacy":true}']) {
      expect(readLegacyAnswer(fakeStorage({ 'pathcheck.legacy': stored }).storage), JSON.stringify(stored)).toBeNull();
    }
    // The answer is not read from a key that only looks like the right one.
    expect(readLegacyAnswer(fakeStorage({ legacy: 'yes', 'pathcheck.Legacy': 'yes', 'pathcheck.legacy ': 'yes' }).storage)).toBeNull();
    expect(readLegacyAnswer(fakeStorage({ 'pathcheck.legacy': 'yes' }).storage)).toBe(true);
    expect(readLegacyAnswer(fakeStorage({ 'pathcheck.legacy': 'no' }).storage)).toBe(false);
  });

  it('works without storage', () => {
    const refuse = (): never => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
    const blocked: AnswerStorage = { getItem: refuse, setItem: refuse, removeItem: refuse };
    for (const storage of [blocked, null, undefined]) {
      expect(readLegacyAnswer(storage)).toBeNull();
      expect(() => writeLegacyAnswer(storage, true)).not.toThrow();
      expect(() => writeLegacyAnswer(storage, false)).not.toThrow();
      expect(() => clearLegacyAnswer(storage)).not.toThrow();
      expect(readLegacyAnswer(storage)).toBeNull();
    }
    // A storage that is full: reading still works, writing is simply not remembered.
    const full = fakeStorage({ 'pathcheck.legacy': 'no' });
    const quota: AnswerStorage = { ...full.storage, setItem: () => { throw new DOMException('Quota exceeded.', 'QuotaExceededError'); } };
    expect(() => writeLegacyAnswer(quota, true)).not.toThrow();
    expect(readLegacyAnswer(quota)).toBe(false);
  });

  describe('finding the browser\'s storage', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const stub = (descriptor: PropertyDescriptor): void => { Object.defineProperty(globalThis, 'localStorage', { configurable: true, ...descriptor }); };
    afterEach(() => {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    });

    it('works when the browser refuses any mention of its storage', () => {
      // With site data blocked, reading `localStorage` itself throws.
      stub({ get: () => { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
      expect(() => globalThis.localStorage).toThrow();
      expect(browserStorage()).toBeNull();
      expect(readLegacyAnswer(browserStorage())).toBeNull();
      expect(() => writeLegacyAnswer(browserStorage(), true)).not.toThrow();
      expect(() => clearLegacyAnswer(browserStorage())).not.toThrow();

      // No storage at all.
      stub({ value: undefined });
      expect(browserStorage()).toBeNull();
      stub({ value: null });
      expect(browserStorage()).toBeNull();
    });

    it('uses the browser\'s storage when there is one', () => {
      const { storage, items } = fakeStorage();
      stub({ value: storage });
      expect(browserStorage()).toBe(storage);
      writeLegacyAnswer(browserStorage(), true);
      expect(Object.fromEntries(items)).toEqual({ 'pathcheck.legacy': 'yes' });
      expect(readLegacyAnswer(browserStorage())).toBe(true);
    });
  });
});
