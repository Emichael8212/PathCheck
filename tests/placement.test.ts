// F04: placing courses into requirement blocks (docs/sprints/F04.md; docs/BRIEF.md §5;
// owner answers of 2026-11-15 on electives, picks and the sequence, and of 2026-11-16 on
// transfer credit). Every student here is made up.
import { describe, expect, it } from 'vitest';
import madeUp from './fixtures/made-up-program.json';
import { curriculum, loadCurriculum, type Curriculum } from '../src/curriculum';
import { placeCourses, type Placement } from '../src/placement';
import { courseStandings, type TranscriptRow } from '../src/transcript';

/** A made-up row: "ENG 131" is passed with a B; "ENG 131:D" has that grade; ":-" is in progress; ":T" is transfer credit. */
const rowOf = (entry: string, i = 0): TranscriptRow => {
  const [code = '', mark = 'B'] = entry.split(':');
  if (mark === 'T') return { code, term: 'Transfer credit', credits: 3, grade: 'T', transfer: true };
  return { code, term: `Term ${i + 1}`, credits: 3, grade: mark === '-' ? null : mark, transfer: false };
};
const place = (entries: string[], program: Curriculum = curriculum): Placement =>
  placeCourses(courseStandings(entries.map(rowOf), program.grades), program);
const blockOf = (result: Placement, id: string) => {
  const found = result.blocks.find(one => one.block.id === id);
  if (!found) throw new Error(`no block ${id}`);
  return found;
};
const requiredState = (result: Placement, code: string) =>
  result.blocks.flatMap(one => one.required).find(one => one.course.code === code)?.state;
const filledIn = (result: Placement, id: string, group: number) =>
  blockOf(result, id).picks[group]?.filled.map(one => `${one.course.code} ${one.state}`);
const electivesOf = (result: Placement) => result.electives.filled.map(one => `${one.course.code} ${one.state}`);

const inBlocks = curriculum.blocks.flatMap(block => [...block.required, ...block.picks.flatMap(group => group.courses)]);
const requiredCodes = curriculum.blocks.flatMap(block => block.required.map(course => course.code));
const firstOfEachPick = curriculum.blocks.flatMap(block => block.picks.map(group => group.courses[0]!.code));

describe('required courses', () => {
  it('places a passed required course in its block', () => {
    const result = place(['MGT 321', 'CIS 300:-', 'ORI 100:A']);
    expect(requiredState(result, 'MGT 321')).toBe('done');
    expect(requiredState(result, 'CIS 300')).toBe('in-progress');
    expect(requiredState(result, 'ORI 100')).toBe('done');
    expect(blockOf(result, 'business-core').credits).toEqual({ done: 3, inProgress: 0, needed: 24 });
    expect(blockOf(result, 'major').credits).toEqual({ done: 0, inProgress: 3, needed: 21 });
    expect(blockOf(result, 'orientation').credits).toEqual({ done: 1, inProgress: 0, needed: 0 });
    expect(result.unplaced).toEqual([]);
  });

  it('keeps a course that was not passed as needed', () => {
    const result = place(['MGT 321:D', 'CIS 300:F', 'CIS 302:W', 'CIS 310:I', 'CIS 341:B+']);
    for (const code of ['MGT 321', 'CIS 300', 'CIS 302', 'CIS 310', 'CIS 341', 'CIS 351']) expect(requiredState(result, code), code).toBe('needed');
    expect(result.credits).toEqual({ done: 0, inProgress: 0, remaining: 121, degree: 121 });
    // A course that was not passed is not "left over" either: it simply is not there.
    expect(result.unplaced).toEqual([]);
  });
});

describe('pick groups', () => {
  it('fills a pick with one course only', () => {
    const result = place(['ENG 140', 'ENG 131']);
    expect(filledIn(result, 'composition', 0)).toEqual(['ENG 140 done']);
    expect(result.unplaced).toEqual([{ code: 'ENG 131', state: 'done', reason: 'pick-filled', blockId: 'composition', group: 0, filledBy: ['ENG 140'] }]);
    // The other Composition pick is untouched.
    expect(blockOf(result, 'composition').picks[1]).toMatchObject({ filled: [], open: 1 });
    expect(blockOf(result, 'composition').picks[0]?.open).toBe(0);
    expect(blockOf(result, 'composition').credits).toEqual({ done: 3, inProgress: 0, needed: 3 });
  });

  it('places a passed course before one in progress', () => {
    for (const entries of [['ENG 140:-', 'ENG 131'], ['ENG 131', 'ENG 140:-']]) {
      const result = place(entries);
      expect(filledIn(result, 'composition', 0), entries.join()).toEqual(['ENG 131 done']);
      expect(result.unplaced).toEqual([{ code: 'ENG 140', state: 'in-progress', reason: 'pick-filled', blockId: 'composition', group: 0, filledBy: ['ENG 131'] }]);
      // The course in progress fills nothing, so it adds nothing to "in progress".
      expect(result.credits).toMatchObject({ done: 3, inProgress: 0 });
    }
  });

  it('uses transcript order between equals', () => {
    expect(filledIn(place(['ENG 131', 'ENG 140']), 'composition', 0)).toEqual(['ENG 131 done']);
    expect(filledIn(place(['ENG 140', 'ENG 131']), 'composition', 0)).toEqual(['ENG 140 done']);
    expect(filledIn(place(['ENG 140:-', 'ENG 131:-']), 'composition', 0)).toEqual(['ENG 140 in-progress']);
    expect(filledIn(place(['ART 131', 'MUS 121', 'THE 111']), 'humanities', 0)).toEqual(['ART 131 done']);
    // Order is where the course first appears, even if that first row was a D.
    expect(filledIn(place(['ENG 140:D', 'ENG 131', 'ENG 140']), 'composition', 0)).toEqual(['ENG 140 done']);
  });

  it('fills a choose-2 pick with two courses', () => {
    const program = loadCurriculum(madeUp);
    const basics = (entries: string[]) => {
      const result = place(entries, program);
      const found = result.blocks.find(one => one.block.id === 'basics')!;
      return { result, pick: found.picks[0]!, credits: found.credits };
    };
    const all = basics(['XAA 110', 'XAA 120', 'XAA 130']);
    expect(all.pick.filled.map(one => one.course.code)).toEqual(['XAA 110', 'XAA 120']);
    expect(all.pick.open).toBe(0);
    expect(all.credits).toEqual({ done: 4, inProgress: 0, needed: 4 });
    expect(all.result.unplaced).toEqual([{ code: 'XAA 130', state: 'done', reason: 'pick-filled', blockId: 'basics', group: 0, filledBy: ['XAA 110', 'XAA 120'] }]);

    const one = basics(['XAA 130']);
    expect(one.pick).toMatchObject({ open: 1, filled: [{ course: { code: 'XAA 130' }, state: 'done' }] });
    expect(one.credits).toEqual({ done: 2, inProgress: 0, needed: 6 });

    for (const entries of [['XAA 110', 'XAA 120:-'], ['XAA 120:-', 'XAA 110']]) {
      const both = basics(entries);
      expect(both.pick.filled.map(filled => `${filled.course.code} ${filled.state}`), entries.join()).toEqual(['XAA 110 done', 'XAA 120 in-progress']);
      expect(both.pick.open).toBe(0);
      expect(both.credits).toEqual({ done: 2, inProgress: 2, needed: 4 });
      expect(both.result.unplaced).toEqual([]);
    }
    // In progress first on the transcript, then two passed: the two passed take the places.
    expect(basics(['XAA 110:-', 'XAA 120', 'XAA 130']).pick.filled.map(filled => filled.course.code)).toEqual(['XAA 120', 'XAA 130']);
  });

  it('leaves a pick open when no course for it was passed', () => {
    const result = place(['ENG 131:D', 'ENG 140:W']);
    expect(blockOf(result, 'composition').picks[0]).toMatchObject({ filled: [], open: 1 });
    expect(blockOf(result, 'composition').credits).toEqual({ done: 0, inProgress: 0, needed: 6 });
    expect(result.unplaced).toEqual([]);
  });
});

describe('courses outside the curriculum, and transfer credit', () => {
  it('does not count a course outside the curriculum', () => {
    const result = place(['BIO 230', 'XYZ 101:A']);
    expect(result.unplaced).toEqual([
      { code: 'BIO 230', state: 'done', reason: 'not-in-curriculum' },
      { code: 'XYZ 101', state: 'done', reason: 'not-in-curriculum' },
    ]);
    expect(result.credits).toEqual({ done: 0, inProgress: 0, remaining: 121, degree: 121 });
    // A transfer row for a course outside the curriculum does not count either.
    const transferred = placeCourses(courseStandings([{ code: 'BIO 230', term: 'Transfer credit', credits: 4, grade: 'T', transfer: true }], curriculum.grades), curriculum);
    expect(transferred.unplaced).toEqual([{ code: 'BIO 230', state: 'done', reason: 'not-in-curriculum' }]);
    expect(transferred.credits.done).toBe(0);
  });

  it('places transfer credit like any passed course', () => {
    // Whatever the grade column of a transfer row shows, it fills its course's place as done.
    for (const shown of [null, 'T', 'TR', 'D']) {
      const rows: TranscriptRow[] = [
        { code: 'ENG 131', term: 'Transfer credit', credits: 3, grade: shown, transfer: true },
        { code: 'MAT 137', term: 'Transfer credit', credits: 3, grade: shown, transfer: true },
      ];
      const result = placeCourses(courseStandings(rows, curriculum.grades), curriculum);
      expect(filledIn(result, 'composition', 0), String(shown)).toEqual(['ENG 131 done']);
      expect(requiredState(result, 'MAT 137'), String(shown)).toBe('done');
      expect(result.credits.done).toBe(6);
    }
    // The same D on an ordinary row does not count.
    expect(place(['MAT 137:D']).credits.done).toBe(0);
    // No double counting for transfer credit: a second pick course still fills nothing.
    expect(place(['ENG 131:T', 'ENG 140:T']).unplaced).toEqual([{ code: 'ENG 140', state: 'done', reason: 'pick-filled', blockId: 'composition', group: 0, filledBy: ['ENG 131'] }]);
  });

  it('counts a transfer elective by the rule', () => {
    const result = placeCourses(courseStandings([{ code: 'MKT 410', term: 'Transfer credit', credits: 4, grade: 'TR', transfer: true }], curriculum.grades), curriculum);
    expect(electivesOf(result)).toEqual(['MKT 410 done']);
    expect(result.electives.credits).toEqual({ done: 3, inProgress: 0, needed: 6 });
    expect(result.unplaced).toEqual([]);
  });
});

describe('the CIS electives', () => {
  it('fills electives by the rule', () => {
    const result = place(['FIN 201', 'MKT 410', 'CIS 499:-']);
    expect(electivesOf(result)).toEqual(['FIN 201 done', 'MKT 410 done', 'CIS 499 in-progress']);
    expect(result.electives).toMatchObject({ open: 0, credits: { done: 6, inProgress: 3, needed: 0 } });
    // The named elective carries its title; a rule-matched one has none in the curriculum.
    expect(result.electives.filled.map(one => one.course.title)).toEqual(['Personal Finance', '', '']);
    expect(result.electives.filled.map(one => one.by)).toEqual(['name', 'rule', 'rule']);
    // The edges of the rule.
    expect(electivesOf(place(['MGT 300', 'ACT 499']))).toEqual(['MGT 300 done', 'ACT 499 done']);
    for (const code of ['MKT 299', 'ECO 500', 'BIO 310', 'MGT 100', 'CISX 310']) {
      expect(place([code]).unplaced, code).toEqual([{ code, state: 'done', reason: 'not-in-curriculum' }]);
    }
    for (const subject of ['MGT', 'FIN', 'CIS', 'MKT', 'ACT', 'ECO']) expect(electivesOf(place([`${subject} 498`])), subject).toEqual([`${subject} 498 done`]);
  });

  it('does not treat a required course as an elective', () => {
    // These match the rule's subjects and range but are required in a block.
    const result = place(['MGT 321', 'FIN 321', 'CIS 300', 'MGT 422']);
    expect(electivesOf(result)).toEqual([]);
    expect(result.unplaced).toEqual([]);
    expect(result.electives.credits).toEqual({ done: 0, inProgress: 0, needed: 9 });
    expect(['MGT 321', 'FIN 321', 'CIS 300', 'MGT 422'].map(code => requiredState(result, code))).toEqual(['done', 'done', 'done', 'done']);
    // In this curriculum no pick course matches the rule, so "not already required" needs no reading.
    const matches = (code: string): boolean => {
      const [subject = '', number = ''] = code.split(' ');
      return curriculum.electives.subjects.includes(subject) && Number(number) >= curriculum.electives.minNumber && Number(number) <= curriculum.electives.maxNumber;
    };
    expect(curriculum.blocks.flatMap(block => block.picks.flatMap(group => group.courses)).filter(course => matches(course.code))).toEqual([]);
  });

  it('reads the elective rule from the curriculum', () => {
    // The made-up program's rule is different: subject XC, 300 to 399, 2 credits, 3 courses.
    const program = loadCurriculum(madeUp);
    const result = place(['XC 300', 'XC 399:-', 'XC 400', 'MKT 410'], program);
    expect(electivesOf(result)).toEqual(['XC 300 done', 'XC 399 in-progress']);
    expect(result.electives).toMatchObject({ open: 1, credits: { done: 2, inProgress: 2, needed: 2 } });
    expect(result.unplaced.map(one => `${one.code} ${one.reason}`)).toEqual(['XC 400 not-in-curriculum', 'MKT 410 not-in-curriculum']);
  });

  it('gives no elective for a course that was not passed', () => {
    for (const mark of ['D', 'F', 'I', 'W', 'B+']) {
      const result = place([`MKT 410:${mark}`]);
      expect(electivesOf(result), mark).toEqual([]);
      expect(result.electives.credits).toEqual({ done: 0, inProgress: 0, needed: 9 });
      expect(result.unplaced).toEqual([]);
    }
  });

  it('stops at three electives', () => {
    const four = place(['MKT 410', 'CIS 499', 'ECO 301', 'ACT 350']);
    expect(electivesOf(four)).toEqual(['MKT 410 done', 'CIS 499 done', 'ECO 301 done']);
    expect(four.unplaced).toEqual([{ code: 'ACT 350', state: 'done', reason: 'electives-full' }]);
    expect(four.electives.credits).toEqual({ done: 9, inProgress: 0, needed: 0 });
    // Passed before in progress, then transcript order.
    const mixed = place(['MKT 410:-', 'CIS 499', 'ECO 301:-', 'ACT 350', 'FIN 201']);
    expect(electivesOf(mixed)).toEqual(['CIS 499 done', 'ACT 350 done', 'FIN 201 done']);
    expect(mixed.unplaced.map(one => `${one.code} ${one.state} ${one.reason}`)).toEqual(['MKT 410 in-progress electives-full', 'ECO 301 in-progress electives-full']);
    expect(mixed.electives.credits).toEqual({ done: 9, inProgress: 0, needed: 0 });
    expect(place(['MKT 410', 'CIS 499', 'ECO 301', 'ACT 350', 'FIN 310', 'MGT 499']).electives.credits.done).toBe(9);
  });

  it('does not count legacy-only courses as electives', () => {
    const result = place(['FLS 161', 'MGT 220', 'MGT 203:-']);
    expect(result.unplaced).toEqual([
      { code: 'FLS 161', state: 'done', reason: 'legacy-only' },
      { code: 'MGT 220', state: 'done', reason: 'legacy-only' },
      { code: 'MGT 203', state: 'in-progress', reason: 'legacy-only' },
    ]);
    expect(electivesOf(result)).toEqual([]);
    expect(result.credits.done).toBe(0);
    // The fourth legacy-only course is also a pick: it fills that pick like any other, never an elective.
    const psychology = place(['PSY 251']);
    expect(filledIn(psychology, 'social-sciences', 0)).toEqual(['PSY 251 done']);
    expect(electivesOf(psychology)).toEqual([]);
    expect(psychology.unplaced).toEqual([]);
    expect(place(['GEO 206', 'PSY 251']).unplaced).toEqual([{ code: 'PSY 251', state: 'done', reason: 'pick-filled', blockId: 'social-sciences', group: 0, filledBy: ['GEO 206'] }]);
  });
});

describe('the two courses that never count', () => {
  // Owner, 2026-11-16: CIS 304 and CIS 415 do not count, not even as electives. They are an
  // exception to the 300/400-level CIS elective rule.
  it('does not count CIS 304 or CIS 415, on a transcript or as transfer credit', () => {
    for (const entries of [['CIS 304', 'CIS 415'], ['CIS 304:-', 'CIS 415:-'], ['CIS 304:T', 'CIS 415:T'], ['cis304:A', 'CIS-415:A']]) {
      const result = place(entries);
      expect(electivesOf(result), entries.join()).toEqual([]);
      expect(result.electives.credits).toEqual({ done: 0, inProgress: 0, needed: 9 });
      expect(result.credits).toMatchObject({ done: 0, inProgress: 0, remaining: 121 });
      expect(result.unplaced.map(one => `${one.code} ${one.reason}`)).toEqual(['CIS 304 not-current', 'CIS 415 not-current']);
    }
    // They take no elective place from courses that do count.
    const mixed = place(['CIS 304', 'MKT 410', 'CIS 415', 'CIS 499', 'FIN 201']);
    expect(electivesOf(mixed)).toEqual(['MKT 410 done', 'CIS 499 done', 'FIN 201 done']);
    expect(mixed.electives.credits.done).toBe(9);
  });

  it('still counts another 300/400-level CIS course that is not required', () => {
    for (const code of ['CIS 303', 'CIS 305', 'CIS 414', 'CIS 416', 'CIS 399', 'CIS 499']) {
      const result = place([code]);
      expect(electivesOf(result), code).toEqual([`${code} done`]);
      expect(result.electives.filled[0]?.by).toBe('rule');
      expect(result.unplaced).toEqual([]);
    }
  });

  it('reads the exceptions from the curriculum', () => {
    // The made-up program has its own exception to its own rule.
    const program = loadCurriculum(madeUp);
    const result = place(['XC 350', 'XC 351', 'CIS 304'], program);
    expect(electivesOf(result)).toEqual(['XC 351 done']);
    expect(result.unplaced.map(one => `${one.code} ${one.reason}`)).toEqual(['XC 350 not-current', 'CIS 304 not-in-curriculum']);
  });
});

describe('the history or literature sequence', () => {
  it('completes the history or the literature sequence', () => {
    expect(place(['HIS 131', 'HIS 132']).sequence.state).toBe('done');
    expect(place(['ENG 209', 'ENG 210']).sequence.state).toBe('done');
    expect(place(['HIS 131', 'HIS 132', 'ENG 209']).sequence).toMatchObject({ state: 'done', alternatives: [{ id: 'history', state: 'done', missing: [] }, { id: 'literature', state: 'needed', missing: ['ENG 210'] }] });
    // One course from each does not make a sequence.
    expect(place(['HIS 131', 'ENG 210']).sequence.state).toBe('needed');
    expect(place(['HIS 132', 'ENG 209']).sequence.state).toBe('needed');
    // The sequence adds no credits: these four courses are worth their own 12.
    expect(place(['HIS 131', 'HIS 132', 'ENG 209', 'ENG 210']).credits.done).toBe(12);
  });

  it('keeps a sequence in progress when its course is running', () => {
    expect(place(['HIS 131', 'HIS 132:-']).sequence.state).toBe('in-progress');
    expect(place(['HIS 131:-', 'HIS 132:-']).sequence.state).toBe('in-progress');
    expect(place(['ENG 209:-', 'ENG 210']).sequence.state).toBe('in-progress');
    // A complete sequence beats one in progress.
    expect(place(['HIS 131', 'HIS 132', 'ENG 209', 'ENG 210:-']).sequence.state).toBe('done');
    // The sequence course is running while another passed course holds the pick.
    const result = place(['HIS 131', 'GEO 206', 'HIS 132:-']);
    expect(filledIn(result, 'social-sciences', 0)).toEqual(['GEO 206 done']);
    expect(result.unplaced).toEqual([{ code: 'HIS 132', state: 'in-progress', reason: 'pick-filled', blockId: 'social-sciences', group: 0, filledBy: ['GEO 206'] }]);
    expect(result.sequence.state).toBe('in-progress');
    expect(result.credits).toMatchObject({ done: 6, inProgress: 0 });
  });

  it('says which courses a sequence still needs', () => {
    expect(place([]).sequence).toEqual({ state: 'needed', alternatives: [
      { id: 'history', name: 'history sequence', state: 'needed', missing: ['HIS 131', 'HIS 132'] },
      { id: 'literature', name: 'literature sequence', state: 'needed', missing: ['ENG 209', 'ENG 210'] },
    ] });
    expect(place(['HIS 131', 'ENG 209']).sequence.alternatives.map(one => one.missing)).toEqual([['HIS 132'], ['ENG 210']]);
    // A course that was taken but not passed is still missing.
    expect(place(['HIS 131', 'HIS 132:D']).sequence).toMatchObject({ state: 'needed', alternatives: [{ missing: ['HIS 132'] }, { missing: ['ENG 209', 'ENG 210'] }] });
    expect(place(['HIS 131', 'HIS 132:W']).sequence.state).toBe('needed');
  });

  it('places a sequence course in its pick', () => {
    const history = place(['HIS 131', 'GEO 206', 'HIS 132']);
    expect(filledIn(history, 'social-sciences', 0)).toEqual(['HIS 132 done']);
    expect(history.unplaced).toEqual([{ code: 'GEO 206', state: 'done', reason: 'pick-filled', blockId: 'social-sciences', group: 0, filledBy: ['HIS 132'] }]);
    expect(history.sequence.state).toBe('done');
    // The same credits as with the other pick course alone.
    expect(blockOf(history, 'social-sciences').credits).toEqual(blockOf(place(['HIS 131', 'GEO 206']), 'social-sciences').credits);

    const literature = place(['ENG 209', 'HUM 101', 'ENG 210']);
    expect(filledIn(literature, 'humanities', 1)).toEqual(['ENG 210 done']);
    expect(literature.unplaced).toEqual([{ code: 'HUM 101', state: 'done', reason: 'pick-filled', blockId: 'humanities', group: 1, filledBy: ['ENG 210'] }]);
    expect(literature.sequence.state).toBe('done');
    // Both in progress: the sequence course is still the one placed.
    expect(filledIn(place(['GEO 206:-', 'HIS 132:-']), 'social-sciences', 0)).toEqual(['HIS 132 in-progress']);
  });
});

describe('credits and totals', () => {
  it('counts 42 credits for the complete core', () => {
    const core = curriculum.blocks.filter(block => curriculum.sequence.coreBlockIds.includes(block.id));
    expect(core).toHaveLength(5);
    // Everything in the core blocks, every alternative of every pick included.
    const everything = core.flatMap(block => [...block.required, ...block.picks.flatMap(group => group.courses)]).map(course => course.code);
    const result = place(everything);
    const coreDone = result.blocks.filter(one => curriculum.sequence.coreBlockIds.includes(one.block.id)).reduce((total, one) => total + one.credits.done, 0);
    expect(coreDone).toBe(42);
    expect(coreDone).toBe(curriculum.sequence.coreCredits);
    expect(result.credits.done).toBe(42);
  });

  it('adds credits up from the curriculum, not from the rows', () => {
    const rows: TranscriptRow[] = [
      { code: 'MGT 321', term: 'Fall 2024', credits: 4, grade: 'A', transfer: false },
      { code: 'ORI 100', term: 'Fall 2024', credits: 3, grade: 'A', transfer: false },
      { code: 'MKT 410', term: 'Fall 2024', credits: 4, grade: 'B', transfer: false },
      { code: 'CIS 300', term: 'Fall 2024', credits: 3, grade: 'W', transfer: false },
      { code: 'BIOL 127', term: 'Spr 2025', credits: 0, grade: null, transfer: false },
    ];
    const result = placeCourses(courseStandings(rows, curriculum.grades), curriculum);
    // 3 for the required course, 1 for orientation, 3 for the elective; the lab in progress is 1.
    expect(result.credits).toEqual({ done: 7, inProgress: 1, remaining: 113, degree: 121 });
  });

  it('keeps every block adding up', () => {
    const check = (result: Placement): void => {
      for (const one of result.blocks) expect(one.credits.done + one.credits.inProgress + one.credits.needed, one.block.id).toBe(one.block.credits);
      const { credits } = result.electives;
      expect(credits.done + credits.inProgress + credits.needed).toBe(curriculum.electives.credits);
      expect(result.credits.done).toBe(result.blocks.reduce((total, one) => total + one.credits.done, 0) + credits.done);
      expect(result.credits.inProgress).toBe(result.blocks.reduce((total, one) => total + one.credits.inProgress, 0) + credits.inProgress);
      expect(result.credits.remaining).toBe(121 - result.credits.done - result.credits.inProgress);
    };
    check(place([]));
    check(place(['ENG 131', 'ENG 140:-', 'MGT 321:-', 'MKT 410', 'BIO 230', 'HIS 131', 'HIS 132:-', 'PED 114']));
    check(place(inBlocks.map(course => course.code)));
  });

  it('handles an empty transcript', () => {
    const result = place([]);
    expect(result.credits).toEqual({ done: 0, inProgress: 0, remaining: 121, degree: 121 });
    expect(result.blocks.flatMap(one => one.required).every(one => one.state === 'needed')).toBe(true);
    expect(result.blocks.flatMap(one => one.picks).every(one => one.filled.length === 0 && one.open === one.choose)).toBe(true);
    expect(result.electives).toEqual({ filled: [], open: 3, credits: { done: 0, inProgress: 0, needed: 9 } });
    expect(result.sequence.state).toBe('needed');
    expect(result.unplaced).toEqual([]);
  });

  it('reaches 121 with everything passed', () => {
    const result = place([...inBlocks.map(course => course.code), 'MKT 410', 'CIS 499', 'ECO 301']);
    expect(result.credits).toEqual({ done: 121, inProgress: 0, remaining: 0, degree: 121 });
    expect(result.sequence.state).toBe('done');
    // What fills nothing is exactly the pick alternatives that were not needed.
    const filled = new Set(result.blocks.flatMap(one => one.picks.flatMap(pick => pick.filled.map(f => f.course.code))));
    const spare = curriculum.blocks.flatMap(block => block.picks.flatMap(group => group.courses.map(course => course.code))).filter(code => !filled.has(code));
    expect(result.unplaced.map(one => one.code).sort()).toEqual([...spare].sort());
    // Brief §5: 21 courses in the six pick groups, six of them placed.
    expect(spare).toHaveLength(21 - 6);
    for (const one of result.unplaced) {
      expect(one.reason).toBe('pick-filled');
      if (one.reason !== 'pick-filled') continue;
      // It names the pick it lost and the course that really holds it.
      const pick = blockOf(result, one.blockId).picks[one.group]!;
      expect(pick.options.map(course => course.code)).toContain(one.code);
      expect(one.filledBy).toEqual(pick.filled.map(filled => filled.course.code));
      expect(one.filledBy).toHaveLength(1);
    }
    // The shortest way to 121: every required course, one course per pick, three electives.
    const shortest = place([...requiredCodes, ...firstOfEachPick, 'FIN 201', 'MKT 410', 'CIS 499']);
    expect(shortest.credits).toEqual({ done: 121, inProgress: 0, remaining: 0, degree: 121 });
    expect(shortest.unplaced).toEqual([]);
  });

  it('keeps the sequence apart from the credits', () => {
    // Every credit done, with other courses holding the two picks: the sequence is still needed.
    const picks = ['ENG 131', 'ENG 132', 'ART 131', 'HUM 101', 'GEO 206', 'PED 114'];
    const result = place([...requiredCodes, ...picks, 'FIN 201', 'MKT 410', 'CIS 499']);
    expect(result.credits).toEqual({ done: 121, inProgress: 0, remaining: 0, degree: 121 });
    expect(result.sequence).toMatchObject({ state: 'needed', alternatives: [{ id: 'history', missing: ['HIS 132'] }, { id: 'literature', missing: ['ENG 210'] }] });
    expect(result.unplaced).toEqual([]);
    // Passing the sequence course then takes the pick, and adds no credits.
    const after = place([...requiredCodes, ...picks, 'FIN 201', 'MKT 410', 'CIS 499', 'HIS 132']);
    expect(after.sequence.state).toBe('done');
    expect(after.credits).toEqual(result.credits);
    expect(after.unplaced).toEqual([{ code: 'GEO 206', state: 'done', reason: 'pick-filled', blockId: 'social-sciences', group: 0, filledBy: ['HIS 132'] }]);
  });

  it('matches the approved mockup\'s student', () => {
    const result = place([
      'ORI 100', 'ENG 131', 'ENG 132', 'BIO 127', 'BIOL 127', 'BIO 128', 'BIOL 128', 'MAT 137', 'HIS 131', 'CIS 205', 'CIS 206',
      'ECO 251:D', 'ECO 251:-', 'HUM 103:-', 'ACT 214:-', 'MGT 202:-', 'PED 114:-',
    ]);
    expect(Object.fromEntries(result.blocks.map(one => [one.block.name, [one.credits.done, one.credits.inProgress, one.credits.needed]]))).toEqual({
      'Orientation': [1, 0, 0],
      'Composition': [6, 0, 0],
      'Humanities': [0, 3, 9],
      'Social sciences': [3, 3, 6],
      'Science & math': [11, 0, 0],
      'Pre-professional': [3, 7, 9],
      'Business core': [3, 0, 24],
      'Major (CIS)': [0, 0, 24],
    });
    expect(result.electives.credits).toEqual({ done: 0, inProgress: 0, needed: 9 });
    expect(result.credits).toEqual({ done: 27, inProgress: 13, remaining: 81, degree: 121 });
    expect(requiredState(result, 'ECO 251')).toBe('in-progress');
    expect(result.sequence).toMatchObject({ state: 'needed', alternatives: [{ id: 'history', missing: ['HIS 132'] }, { id: 'literature', missing: ['ENG 209', 'ENG 210'] }] });
    expect(result.unplaced).toEqual([]);
  });
});

describe('whatever the transcript', () => {
  // A small repeatable source of made-up transcripts.
  const random = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = [...inBlocks.map(course => course.code), 'FIN 201', 'FLS 161', 'MGT 220', 'MGT 203', 'MKT 410', 'CIS 499', 'ECO 301', 'ACT 350', 'MGT 499', 'BIO 230', 'XYZ 101', 'CIS 304', 'CIS 415'];
  const marks = ['A', 'B', 'C', 'D', 'F', 'W', 'I', '-', 'B+', 'T'];

  const invariants = (entries: string[]): void => {
    const standings = courseStandings(entries.map(rowOf), curriculum.grades);
    const result = placeCourses(standings, curriculum);
    const label = entries.join(' ');
    const standingOf = new Map(standings.map(one => [one.code, one.standing]));
    const fills = [
      ...result.blocks.flatMap(one => one.required.filter(place => place.state !== 'needed').map(place => ({ code: place.course.code, state: place.state }))),
      ...result.blocks.flatMap(one => one.picks.flatMap(pick => pick.filled.map(f => ({ code: f.course.code, state: f.state })))),
      ...result.electives.filled.map(f => ({ code: f.course.code, state: f.state })),
    ];
    // No course fills more than one place, and none is both placed and left over.
    expect(new Set(fills.map(one => one.code)).size, label).toBe(fills.length);
    for (const one of result.unplaced) expect(fills.map(f => f.code), label).not.toContain(one.code);
    // A pick group holds at most as many courses as it asks for, and only its own courses.
    for (const pick of result.blocks.flatMap(one => one.picks)) {
      expect(pick.filled.length, label).toBeLessThanOrEqual(pick.choose);
      expect(pick.open, label).toBe(pick.choose - pick.filled.length);
      for (const filled of pick.filled) expect(pick.options, label).toContain(filled.course);
    }
    // A required place is only ever filled by its own course (it is keyed by that course).
    // An elective is the named one, or matches the rule and is listed in no block.
    expect(result.electives.filled.length, label).toBeLessThanOrEqual(3);
    for (const elective of result.electives.filled) {
      const [subject = '', number = ''] = elective.course.code.split(' ');
      const byRule = ['MGT', 'FIN', 'CIS', 'MKT', 'ACT', 'ECO'].includes(subject) && Number(number) >= 300 && Number(number) <= 499;
      expect(elective.by === 'name' ? elective.course.code === 'FIN 201' : byRule, `${label} / ${elective.course.code}`).toBe(true);
      expect(inBlocks.map(course => course.code), label).not.toContain(elective.course.code);
      expect(['CIS 304', 'CIS 415'], label).not.toContain(elective.course.code);
    }
    // A course left over by a full pick names that pick and the courses that hold it.
    for (const one of result.unplaced) {
      if (one.reason !== 'pick-filled') continue;
      const pick = result.blocks.find(b => b.block.id === one.blockId)?.picks[one.group];
      expect(pick?.options.map(course => course.code), label).toContain(one.code);
      expect(one.filledBy, label).toEqual(pick?.filled.map(filled => filled.course.code));
    }
    // Only a passed or in-progress course fills anything, and only a passed course is done.
    for (const one of [...fills, ...result.unplaced]) {
      expect(standingOf.get(one.code), `${label} / ${one.code}`).toBe(one.state === 'done' ? 'passed' : 'in-progress');
    }
    // Every passed or in-progress course is either placed or left over, exactly once.
    const active = standings.filter(one => one.standing === 'passed' || one.standing === 'in-progress').map(one => one.code).sort();
    expect([...fills.map(one => one.code), ...result.unplaced.map(one => one.code)].sort(), label).toEqual(active);
    // When the sequence is done, both courses of an alternative that completes it fill a place.
    if (result.sequence.state === 'done') {
      const complete = curriculum.sequence.alternatives.filter(alternative => alternative.courses.every(code => fills.some(f => f.code === code && f.state === 'done')));
      expect(complete.length, label).toBeGreaterThanOrEqual(1);
    }
    // Credits always add up, and never go past the degree.
    expect(result.credits.done + result.credits.inProgress + result.credits.remaining, label).toBe(121);
    expect(result.credits.remaining, label).toBeGreaterThanOrEqual(0);
    // ...and are the curriculum's credits for exactly the courses that are placed.
    const worth = (code: string): number => inBlocks.find(course => course.code === code)?.credits ?? curriculum.electives.creditsPerCourse;
    const total = (state: string): number => fills.filter(one => one.state === state).reduce((sum, one) => sum + worth(one.code), 0);
    expect(result.credits.done, label).toBe(total('done'));
    expect(result.credits.inProgress, label).toBe(total('in-progress'));
  };

  it('never counts a course twice', () => {
    invariants(inBlocks.map(course => course.code));
    invariants(pool);
    const next = random(20261116);
    let transcripts = 0;
    for (let i = 0; i < 400; i++) {
      const length = Math.floor(next() * 40);
      const entries = Array.from({ length }, () => `${pool[Math.floor(next() * pool.length)]}:${marks[Math.floor(next() * marks.length)]}`);
      invariants(entries);
      transcripts++;
    }
    expect(transcripts).toBe(400);
  });

  it('refuses the same course twice, or a code that is not in its normal form', () => {
    const [marketing] = courseStandings([rowOf('MKT 410')], curriculum.grades);
    const [english] = courseStandings([rowOf('ENG 131')], curriculum.grades);
    const [management] = courseStandings([rowOf('MGT 321')], curriculum.grades);
    if (!marketing || !english || !management) throw new Error('no standings');
    // One course handed over three times must not become three electives.
    expect(() => placeCourses([marketing, marketing, marketing], curriculum)).toThrow(/the same course twice: MKT 410/);
    expect(() => placeCourses([english, management, english], curriculum)).toThrow(/the same course twice: ENG 131/);
    expect(() => placeCourses([management, { ...management, standing: 'in-progress' }], curriculum)).toThrow(TypeError);
    // A code that is not written the normal way would be lost or misplaced.
    for (const code of ['mgt321', 'MGT-321', 'mgt 321', ' MGT 321', 'eng-131', 'MKT-410', '', 'MGT']) {
      expect(() => placeCourses([{ ...management, code }], curriculum), JSON.stringify(code)).toThrow(/not in its normal form/);
    }
    // What courseStandings returns is always accepted, however the rows were written.
    const rows = ['mgt321', 'MGT-321:D', ' eng 131 ', 'mkt–410'].map((entry, i) => rowOf(entry, i));
    const result = placeCourses(courseStandings(rows, curriculum.grades), curriculum);
    expect(result.credits.done).toBe(9);
  });

  it('does not change its input', () => {
    const rows = Object.freeze(['ENG 140:-', 'ENG 131', 'MKT 410', 'HIS 131', 'HIS 132', 'GEO 206', 'BIO 230'].map((entry, i) => Object.freeze(rowOf(entry, i))));
    const standings = courseStandings(rows, curriculum.grades);
    const frozen = Object.freeze(standings.map(one => Object.freeze(one)));
    const before = JSON.stringify(frozen);
    const first = placeCourses(frozen, curriculum);
    const second = placeCourses(frozen, curriculum);
    expect(JSON.stringify(frozen)).toBe(before);
    expect(second).toEqual(first);
    // The curriculum is frozen, so placing courses cannot have changed it either.
    expect(Object.isFrozen(curriculum.blocks)).toBe(true);
  });
});
