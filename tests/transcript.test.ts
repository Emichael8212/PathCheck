// F03: which transcript rows count (docs/sprints/F03.md; docs/BRIEF.md §4 Flow B step 2 and
// §5 "Rules"; owner answers: 2026-11-15, letters only and C or better counts; 2026-11-16,
// a transfer, AP or CLEP row counts whatever its grade column shows).
// Every row here is made up. No real student's transcript is in this repository.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { curriculum, type Grades } from '../src/curriculum';
import { courseStandings, rowStanding, type Standing, type TranscriptRow } from '../src/transcript';

const { grades } = curriculum;
const row = (code: string, grade: string | null, more: Partial<TranscriptRow> = {}): TranscriptRow =>
  ({ code, term: 'Fall 2024', credits: 3, grade, transfer: false, ...more });
const transfer = (code: string, grade: string | null): TranscriptRow => row(code, grade, { transfer: true, term: 'Transfer credit' });
const standing = (grade: string | null, scale: Grades = grades): Standing => rowStanding(row('ECO 251', grade), scale);
const transferStanding = (grade: string | null): Standing => rowStanding(transfer('ECO 251', grade), grades);
/** The standing of one course given the grades of its rows, in order. */
const course = (...marks: (string | null)[]) => {
  const results = courseStandings(marks.map((mark, i) => row('ECO 251', mark, { term: `Term ${i + 1}` })), grades);
  expect(results).toHaveLength(1);
  return results[0]!;
};

describe('one row', () => {
  it('passes C or better', () => {
    expect(['A', 'B', 'C'].map(grade => standing(grade))).toEqual(['passed', 'passed', 'passed']);
  });

  it('flags D and F as must repeat', () => {
    expect(['D', 'F'].map(grade => standing(grade))).toEqual(['must-repeat', 'must-repeat']);
  });

  it('reads the scale it is given', () => {
    // A made-up scale whose lowest counting grade is B: now C must be repeated.
    const strict: Grades = { letters: ['A', 'B', 'C', 'D', 'F'], minimumCounting: 'B', neverCounting: ['W', 'I'] };
    expect(['A', 'B', 'C', 'D'].map(grade => standing(grade, strict))).toEqual(['passed', 'passed', 'must-repeat', 'must-repeat']);
    // A made-up scale with other letters and another mark that never counts.
    const other: Grades = { letters: ['X', 'Y', 'Z'], minimumCounting: 'Y', neverCounting: ['Q'] };
    expect(['X', 'Y', 'Z', 'Q', 'A', 'W'].map(grade => standing(grade, other))).toEqual(['passed', 'passed', 'must-repeat', 'no-credit', 'unrecognised', 'unrecognised']);
    // No grade is written in the code: no quoted single capital letter anywhere in it.
    const source = readFileSync(join(import.meta.dirname, '..', 'src', 'transcript.ts'), 'utf8');
    expect(source.match(/(['"`])[A-Za-z]{1,2}[+-]?\1/g)).toBe(null);
    expect(source.match(/\[[A-Za-z]-[A-Za-z]\]|\[[A-Z]{3,}\]/g)).toBe(null);
  });

  it('does not pass a grade that is not on the scale', () => {
    for (const mark of ['B+', 'C-', 'A-', 'A+', 'P', 'S', 'CR', 'T', 'TR', 'C*', 'C (R)', 'CC', 'E', '3.0', 'PASS', '?']) {
      expect(standing(mark), mark).toBe('unrecognised');
    }
  });

  it('gives no credit for W and I', () => {
    expect([standing('W'), standing('I')]).toEqual(['no-credit', 'no-credit']);
  });

  it('reads a grade whatever its case and spacing', () => {
    expect([' c ', 'c', 'C ', '\tb\n', 'a'].map(grade => standing(grade))).toEqual(['passed', 'passed', 'passed', 'passed', 'passed']);
    expect([' d ', 'f'].map(grade => standing(grade))).toEqual(['must-repeat', 'must-repeat']);
    expect([' w ', ' i ', 'w', 'i'].map(grade => standing(grade))).toEqual(['no-credit', 'no-credit', 'no-credit', 'no-credit']);
  });

  it('treats an empty grade column as no grade', () => {
    for (const none of [null, '', ' ', '   ', '\t', undefined as unknown as null]) {
      expect(standing(none), JSON.stringify(none)).toBe('in-progress');
      expect(transferStanding(none), `transfer ${JSON.stringify(none)}`).toBe('passed');
    }
  });

  it('treats a row with no grade as in progress, not as passed', () => {
    expect(standing(null)).toBe('in-progress');
    expect(standing(null)).not.toBe('passed');
    // A transfer row is never in progress, whatever its grade column holds.
    for (const mark of [null, '', 'A', 'C', 'D', 'F', 'W', 'I', 'TR', 'B+']) expect(transferStanding(mark), String(mark)).not.toBe('in-progress');
    // An ordinary row with D does not count.
    expect(standing('D')).toBe('must-repeat');
  });

  it('passes transfer credit whatever its grade column shows', () => {
    // Owner, 2026-11-16: transfer credit was only recorded after the grade check, so the
    // grade column of a transfer, AP or CLEP row is ignored.
    for (const shown of [null, '', '  ', 'T', 'TR', 'CR', 'XYZ', '?', 'A', 'B', 'C', ' c ', 'D', 'F', ' d ', 'W', 'I', 'B+', 'P']) {
      expect(transferStanding(shown), JSON.stringify(shown)).toBe('passed');
    }
  });

  it('takes a row as transfer credit only when its flag is exactly true', () => {
    // Reader output is not typed. A flag that is merely truthy must not make a D count.
    for (const flag of ['false', 'no', 'true', 1, {}, [], 'transfer']) {
      const loose = row('ECO 251', 'D', { transfer: flag as unknown as boolean });
      expect(rowStanding(loose, grades), JSON.stringify(flag)).toBe('must-repeat');
    }
    for (const flag of [false, 0, '', null, undefined]) {
      expect(rowStanding(row('ECO 251', 'D', { transfer: flag as unknown as boolean }), grades), JSON.stringify(flag)).toBe('must-repeat');
    }
    expect(rowStanding(row('ECO 251', 'D', { transfer: true }), grades)).toBe('passed');
  });

  it('keeps the normal grade rules for rows outside the transfer section', () => {
    expect(['A', 'B', 'C'].map(grade => standing(grade))).toEqual(['passed', 'passed', 'passed']);
    expect(['D', 'F'].map(grade => standing(grade))).toEqual(['must-repeat', 'must-repeat']);
    expect(['W', 'I'].map(grade => standing(grade))).toEqual(['no-credit', 'no-credit']);
    expect(['T', 'TR'].map(grade => standing(grade))).toEqual(['unrecognised', 'unrecognised']);
    expect(standing(null)).toBe('in-progress');
    // The same marks, one row in the transfer section and one outside it.
    for (const shown of ['D', 'W', 'TR', null]) {
      expect(transferStanding(shown), String(shown)).toBe('passed');
      expect(standing(shown), String(shown)).not.toBe('passed');
    }
  });
});

describe('one course, after repeats', () => {
  it('takes the highest grade of a repeated course', () => {
    expect(course('D', 'B')).toMatchObject({ standing: 'passed', deciding: { row: { grade: 'B', term: 'Term 2' } } });
    // A later, lower grade does not undo an earlier pass.
    expect(course('B', 'D')).toMatchObject({ standing: 'passed', deciding: { row: { grade: 'B', term: 'Term 1' } } });
    expect(course('F', 'D', 'C')).toMatchObject({ standing: 'passed', deciding: { row: { grade: 'C' } } });
    expect(course('C', 'A', 'B')).toMatchObject({ standing: 'passed', deciding: { row: { grade: 'A' } } });
    expect(course('D', 'F')).toMatchObject({ standing: 'must-repeat', deciding: { row: { grade: 'D', term: 'Term 1' } } });
    expect(course('F', 'D')).toMatchObject({ standing: 'must-repeat', deciding: { row: { grade: 'D', term: 'Term 2' } } });
    // A tie goes to the first row in transcript order.
    expect(course('B', 'B')).toMatchObject({ deciding: { row: { term: 'Term 1' } } });
    expect(course('W', 'W')).toMatchObject({ standing: 'no-credit', deciding: { row: { term: 'Term 1' } } });
    // The flag for a grade below C is not removed by a later withdrawal.
    expect(course('D', 'W')).toMatchObject({ standing: 'must-repeat', deciding: { row: { grade: 'D' } } });
    expect(course('W', 'F')).toMatchObject({ standing: 'must-repeat', deciding: { row: { grade: 'F' } } });
  });

  it('keeps a repeat in progress as in progress', () => {
    const repeat = course('D', null);
    expect(repeat.standing).toBe('in-progress');
    expect(repeat.deciding.row.term).toBe('Term 2');
    // The earlier D is still there, so the checklist can say it doesn't count.
    expect(repeat.rows.map(one => [one.row.grade, one.standing])).toEqual([['D', 'must-repeat'], [null, 'in-progress']]);
    expect(course('W', null).standing).toBe('in-progress');
    expect(course(null, 'F').standing).toBe('in-progress');
    expect(course(null, null).standing).toBe('in-progress');
  });

  it('keeps a passed course as passed while it is retaken', () => {
    expect(course('C', null)).toMatchObject({ standing: 'passed', deciding: { row: { grade: 'C' } } });
    expect(course(null, 'C').standing).toBe('passed');
    // Transfer credit, and the same course running now: already passed.
    expect(courseStandings([row('ECO 251', 'D'), transfer('ECO 251', 'TR')], grades)).toMatchObject([{ standing: 'passed', deciding: { row: { transfer: true } } }]);
    // The grade column of a transfer row is not read when choosing the deciding row either:
    // an ordinary C decides ahead of transfer credit, whatever that row's column shows.
    for (const shown of ['A', 'D', 'TR', null]) {
      expect(courseStandings([transfer('ECO 251', shown), row('ECO 251', 'C')], grades), String(shown)).toMatchObject([{ standing: 'passed', deciding: { row: { transfer: false, grade: 'C' } } }]);
    }
    expect(courseStandings([transfer('ECO 251', 'A'), transfer('ECO 251', null)], grades)).toMatchObject([{ deciding: { row: { grade: 'A' } } }]);
    const both = courseStandings([transfer('ECO 251', null), row('ECO 251', null)], grades);
    expect(both).toMatchObject([{ standing: 'passed', deciding: { row: { transfer: true } } }]);
  });

  it('keeps each row\'s own standing', () => {
    const mixed = course('B', 'B+');
    expect(mixed.standing).toBe('passed');
    expect(mixed.deciding.row.grade).toBe('B');
    expect(mixed.rows.map(one => one.standing)).toEqual(['passed', 'unrecognised']);
    // An unreadable grade keeps the outcome open: the course is not called "must repeat".
    expect(course('D', 'B+').standing).toBe('unrecognised');
    expect(course('B+', 'W').standing).toBe('unrecognised');
    expect(course('B+', null).standing).toBe('in-progress');
  });

  it('never passes a course unless one of its rows passes', () => {
    const marks = ['A', 'B', 'C', 'D', 'F', 'W', 'I', null, 'B+', 'P', 'TR'];
    const kinds = marks.flatMap(mark => [row('ECO 251', mark), transfer('ECO 251', mark)]);
    expect(kinds).toHaveLength(22);
    const own = (one: TranscriptRow): Standing => rowStanding(one, grades);
    const sameRows = (rows: TranscriptRow[]): string => rows.map(one => `${one.transfer}:${one.grade}`).sort().join('|');
    const seen = new Map<string, Standing>();
    let combinations = 0;
    const check = (rows: TranscriptRow[]): void => {
      combinations++;
      const result = courseStandings(rows, grades)[0]!;
      const each = rows.map(own);
      const label = sameRows(rows);
      expect(result.standing === 'passed', label).toBe(each.includes('passed'));
      expect(result.standing === 'in-progress', label).toBe(!each.includes('passed') && each.includes('in-progress'));
      if (result.standing === 'must-repeat') {
        expect(each.some(one => one === 'passed' || one === 'in-progress' || one === 'unrecognised'), label).toBe(false);
      }
      expect(result.standing === 'unrecognised', label).toBe(!each.includes('passed') && !each.includes('in-progress') && each.includes('unrecognised'));
      expect(courseStandings(rows, grades), label).toHaveLength(1);
      // The deciding row has the course's standing, is one of its rows, and no other row
      // with that standing has a better grade on the scale.
      expect(result.deciding.standing, label).toBe(result.standing);
      expect(rows).toContain(result.deciding.row);
      const onScale = (one: TranscriptRow): number => { const at = one.transfer ? -1 : grades.letters.indexOf(one.grade ?? ''); return at < 0 ? Infinity : at; };
      const sameStanding = rows.filter(one => own(one) === result.standing);
      expect(onScale(result.deciding.row), label).toBe(Math.min(...sameStanding.map(onScale)));
      // ...and of equally good rows it is the first.
      expect(result.deciding.row, label).toBe(sameStanding.find(one => onScale(one) === onScale(result.deciding.row)));
      // The same rows in any order give the same standing.
      const before = seen.get(label);
      if (before) expect(result.standing, label).toBe(before);
      else seen.set(label, result.standing);
    };
    for (const a of kinds) {
      check([a]);
      for (const b of kinds) {
        check([a, b]);
        for (const c of kinds) check([a, b, c]);
      }
    }
    expect(combinations).toBe(22 + 22 ** 2 + 22 ** 3);
  });
});

describe('a whole transcript', () => {
  it('gives one result per course', () => {
    const results = courseStandings([
      row('ENG 131', 'B', { term: 'Fall 2023' }),
      row('ECO 251', 'D', { term: 'Fall 2023' }),
      transfer('ORI 100', null),
      row('ECO 251', null, { term: 'Fall 2024' }),
      row('MGT 201', 'W', { term: 'Spr 2024' }),
      row('BIOL 127', 'A', { term: 'Spr 2024', credits: 1 }),
    ], grades);
    expect(results.map(one => [one.code, one.standing])).toEqual([
      ['ENG 131', 'passed'], ['ECO 251', 'in-progress'], ['ORI 100', 'passed'], ['MGT 201', 'no-credit'], ['BIOL 127', 'passed'],
    ]);
    expect(results.map(one => one.rows.length)).toEqual([1, 2, 1, 1, 1]);
    expect(results[4]?.deciding.row.credits).toBe(1);
    expect(courseStandings([], grades)).toEqual([]);
  });

  it('does not change the rows it is given', () => {
    const rows = Object.freeze([row('ECO 251', 'D'), row('eco251', null), transfer('ORI 100', null)].map(one => Object.freeze(one)));
    const before = JSON.stringify(rows);
    const results = courseStandings(rows, grades);
    expect(JSON.stringify(rows)).toBe(before);
    // The result points at the very rows it was given, so a screen can map back to them.
    expect(results[0]?.rows[0]?.row).toBe(rows[0]);
    expect(results[1]?.deciding.row).toBe(rows[2]);
  });

  it('does not let one course affect another', () => {
    const alone = courseStandings([row('ECO 251', 'D')], grades)[0];
    const together = courseStandings([row('ECO 252', 'A'), row('ECO 251', 'D'), row('ECO 252', null)], grades);
    expect(together.find(one => one.code === 'ECO 251')).toEqual(alone);
    expect(together.find(one => one.code === 'ECO 252')?.standing).toBe('passed');
  });

  it('groups rows by course code however it is written', () => {
    const results = courseStandings([row('ECO 251', 'D'), row('eco251', 'B'), row(' Eco-251 ', 'F')], grades);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ code: 'ECO 251', standing: 'passed', deciding: { row: { code: 'eco251', grade: 'B' } } });
    expect(results[0]?.rows).toHaveLength(3);
  });

  it('refuses a row whose code is not a course code', () => {
    for (const bad of ['', 'ECO', '251', 'Term GPA', 'ECO 25', 'Academic Standing']) {
      expect(() => courseStandings([row('ECO 251', 'A'), row(bad, 'A')], grades), bad).toThrow(new RegExp(`not a course code: ${JSON.stringify(bad).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    }
  });
});
