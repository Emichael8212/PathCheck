// F10: a reader's answer is untrusted (docs/sprints/F10.md; docs/BRIEF.md §7; the owner's
// transcript format of 2026-11-15 and the transfer rule of 2026-11-16). Every student and
// transcript here is made up.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The script is plain JavaScript, with no type declarations.
import { MARK, STUDENT, STUDENT_ID, linesFor, pdfFor, transcripts } from '../scripts/make-synthetic-transcripts.mjs';
import sampleA from '../synthetic/transcripts/sample-a.json';
import sampleB from '../synthetic/transcripts/sample-b.json';
import { curriculum } from '../src/curriculum';
import { placeCourses, type Placement } from '../src/placement';
import { MOST_ATTEMPTED, ReaderError, readRows, standingsOf, type Reading } from '../src/reader';

const repo = join(import.meta.dirname, '..');
type Row = Record<string, unknown>;
const good = (over: Row = {}): Row => ({ term: 'Fall 2025', transfer: false, prefix: 'MGT', number: '321', description: 'Prin of Management', attempted: 3, earned: 3, grade: 'B', points: 9, ...over });
const without = (key: string, over: Row = {}): Row => { const row = good(over); delete row[key]; return row; };
const read = (...rows: unknown[]): Reading => readRows({ rows }, curriculum);
const place = (reading: Reading, legacy: boolean | null = null): Placement => placeCourses(standingsOf(reading, curriculum.grades), curriculum, { legacy });
const credits = (reading: Reading, legacy: boolean | null = null): number[] => { const { done, inProgress, remaining } = place(reading, legacy).credits; return [done, inProgress, remaining]; };
const codes = (reading: Reading): string[] => reading.rows.map(one => one.row.code);

describe('a clean answer', () => {
  it('reads a clean answer row by row', () => {
    const reading = readRows(sampleA, curriculum);
    expect(reading.toFix).toEqual([]);
    expect(reading.thrownAway).toBe(0);
    expect(reading.rows).toHaveLength(sampleA.rows.length);
    expect(reading.rows.map(one => one.line)).toEqual(sampleA.rows.map((_, i) => i));
    expect(reading.rows[0]).toEqual({ line: 0, row: { code: 'ORI 100', term: 'Fall 2025', credits: 1, grade: 'A', transfer: false }, description: 'First Year Experience', match: 'listed' });
    expect(reading.rows[3]?.row).toEqual({ code: 'BIOL 127', term: 'Fall 2025', credits: 1, grade: 'A', transfer: false });
    // A row still in progress has no grade.
    expect(reading.rows[12]?.row).toEqual({ code: 'ECO 251', term: 'Fall 2026', credits: 3, grade: null, transfer: false });
    expect(codes(reading)).toEqual(sampleA.rows.map(row => `${row.prefix} ${row.number}`));
  });

  it('places the made-up student of the design', () => {
    const reading = readRows(sampleA, curriculum);
    // By hand: 27 done, 13 in progress, 81 left (docs/sprints/F10.md).
    expect(credits(reading)).toEqual([27, 13, 81]);
    const placement = place(reading);
    expect(placement.unplaced).toEqual([]);
    expect(placement.sequence.state).toBe('needed');
    // ECO 251: the D does not count; the repeat is in progress.
    const standings = standingsOf(reading, curriculum.grades);
    expect(standings.find(one => one.code === 'ECO 251')?.standing).toBe('in-progress');
    expect(standings).toHaveLength(16);
  });
});

describe('a row that fails the check', () => {
  const faults: [string, unknown, string[]][] = [
    ['text', 'ENG 131 B', ['not-a-row']],
    ['a number', 131, ['not-a-row']],
    ['null', null, ['not-a-row']],
    ['a list', ['ENG', '131'], ['not-a-row']],
    ['no term', without('term'), ['term']],
    ['an empty term', good({ term: '  ' }), ['term']],
    ['a term that is a number', good({ term: 2025 }), ['term']],
    ['no transfer flag', without('transfer'), ['transfer']],
    ['transfer "yes"', good({ transfer: 'yes' }), ['transfer']],
    ['transfer "no"', good({ transfer: 'no' }), ['transfer']],
    ['transfer 1', good({ transfer: 1 }), ['transfer']],
    ['transfer null', good({ transfer: null }), ['transfer']],
    ['prefix ENGL1', good({ prefix: 'ENGL1' }), ['code']],
    ['number 13', good({ number: '13' }), ['code']],
    ['number 131A', good({ number: '131A' }), ['code']],
    ['an empty number', good({ number: '' }), ['code']],
    ['number 13.5', good({ number: 13.5 }), ['code']],
    ['the code in the prefix', good({ prefix: 'ENG131', number: '' }), ['code']],
    ['a one-letter prefix', good({ prefix: 'E' }), ['code']],
    // Letters that only become plain letters in capitals are not a prefix.
    ['a dotless i in the prefix', good({ prefix: 'c\u0131s', number: '205' }), ['code']],
    ['a long s in the prefix', good({ prefix: '\u017ftat', number: '101' }), ['code']],
    ['a sharp s as the prefix', good({ prefix: '\u00df', number: '101' }), ['code']],
    ['full-width letters', good({ prefix: '\uff2d\uff27\uff34' }), ['code']],
    ['full-width digits', good({ number: '\uff13\uff12\uff11' }), ['code']],
    ['no prefix', without('prefix'), ['code']],
    ['attempted ""', good({ attempted: '' }), ['credits']],
    ['attempted "3 cr"', good({ attempted: '3 cr' }), ['credits']],
    ['attempted "1e1"', good({ attempted: '1e1' }), ['credits']],
    ['attempted "0x3"', good({ attempted: '0x3' }), ['credits']],
    ['attempted "Infinity"', good({ attempted: 'Infinity' }), ['credits']],
    ['attempted -3', good({ attempted: -3 }), ['credits']],
    ['attempted 31', good({ attempted: 31 }), ['credits']],
    ['attempted 3.005', good({ attempted: 3.005 }), ['credits']],
    ['attempted "3.005"', good({ attempted: '3.005' }), ['credits']],
    ['attempted "3.000000000001"', good({ attempted: '3.000000000001' }), ['credits']],
    ['attempted "3."', good({ attempted: '3.' }), ['credits']],
    ['attempted ".5"', good({ attempted: '.5' }), ['credits']],
    ['attempted "+3"', good({ attempted: '+3' }), ['credits']],
    ['attempted true', good({ attempted: true }), ['credits']],
    ['attempted NaN', good({ attempted: Number.NaN }), ['credits']],
    ['no attempted', without('attempted'), ['credits']],
    ['earned as words', good({ earned: 'three' }), ['earned']],
    ['points as words', good({ points: 'nine' }), ['points']],
    ['a grade that is a number', good({ grade: 4 }), ['grade']],
    ['grade B+', good({ grade: 'B+' }), ['grade']],
    ['grade P', good({ grade: 'P' }), ['grade']],
    ['grade X', good({ grade: 'X' }), ['grade']],
    ['grade T on an ordinary row', good({ grade: 'T' }), ['grade']],
    ['a description that is a number', good({ description: 42 }), ['description']],
    ['several faults', good({ term: '', transfer: 'no', number: '1', attempted: 'x', grade: 'Z', description: 7 }), ['term', 'transfer', 'code', 'description', 'credits']],
    ['a bad code and a bad grade', good({ number: '1', grade: 'Z' }), ['code', 'grade']],
  ];

  it('sets aside a row that fails the check', () => {
    for (const [name, row, problems] of faults) {
      const reading = read(row);
      expect(reading.rows, name).toEqual([]);
      expect(reading.thrownAway, name).toBe(0);
      expect(reading.toFix.map(one => one.problems), name).toEqual([problems]);
      expect(reading.toFix[0]?.line, name).toBe(0);
    }
    // What was read is kept as text, to be shown and fixed.
    expect(read(good({ grade: 'B+', attempted: '3.00' })).toFix[0]?.seen).toEqual({ term: 'Fall 2025', transfer: false, prefix: 'MGT', number: '321', description: 'Prin of Management', attempted: '3.00', grade: 'B+' });
    expect(read(good({ transfer: 'yes', number: 13 })).toFix[0]?.seen).toMatchObject({ transfer: null, number: '13' });
    expect(read('ENG 131 B').toFix[0]?.seen).toEqual({ term: '', transfer: null, prefix: '', number: '', description: '', attempted: '', grade: '' });
    expect(MOST_ATTEMPTED).toBe(30);
    // The edges of the range pass.
    for (const attempted of [0, 30, 0.5, 2.25, '0', '30', '1.50']) expect(read(good({ attempted })).toFix, String(attempted)).toEqual([]);
    // No negative zero comes out of it.
    expect(Object.is(read(good({ attempted: -0 })).rows[0]?.row.credits, 0)).toBe(true);
    // A hole in the list is a row that is not a row, like any other.
    const holed: unknown[] = [good()];
    holed.length = 3;
    expect(readRows({ rows: holed }, curriculum).toFix.map(one => [one.line, one.problems])).toEqual([[1, ['not-a-row']], [2, ['not-a-row']]]);
  });

  it('counts nothing from a row that failed', () => {
    const clean = readRows(sampleA, curriculum);
    for (const [name, row] of faults) {
      // Mixed into the made-up transcript, at the start, the middle and the end.
      for (const at of [0, 7, sampleA.rows.length]) {
        const rows: unknown[] = [...sampleA.rows];
        rows.splice(at, 0, row);
        const reading = readRows({ rows }, curriculum);
        expect(reading.toFix.map(one => one.line), name).toEqual([at]);
        expect(reading.rows.map(one => one.row), name).toEqual(clean.rows.map(one => one.row));
        expect(place(reading), name).toEqual(place(clean));
      }
    }
    // A row that would have counted, with one fault, counts nothing.
    expect(credits(read(good()))).toEqual([3, 0, 118]);
    expect(credits(read(good({ transfer: 'no' })))).toEqual([0, 0, 121]);
    expect(credits(read(good({ grade: 'B+' })))).toEqual([0, 0, 121]);
  });
});

describe('transfer credit, rows in progress and printed numbers', () => {
  it('does not judge the grade column of transfer credit', () => {
    for (const grade of [null, '', 'T', 'TR', 'AP', 'CR', 'zz', 'B+']) {
      for (const attempted of [undefined, null, '', '3.00', 3]) {
        const row = good({ transfer: true, grade, attempted, term: 'Transfer Credit' });
        if (attempted === undefined) delete row.attempted;
        const reading = read(row);
        expect(reading.toFix, `${grade} / ${attempted}`).toEqual([]);
        expect(reading.rows[0]?.row.transfer).toBe(true);
        expect(reading.rows[0]?.row.credits).toBe(attempted === '3.00' || attempted === 3 ? 3 : 0);
        expect(credits(reading)).toEqual([3, 0, 118]);
      }
    }
    // The same marks on an ordinary row are a fault, and an empty "attempted" too.
    for (const grade of ['T', 'TR', 'AP']) expect(read(good({ grade })).toFix[0]?.problems).toEqual(['grade']);
    expect(read(good({ attempted: null })).toFix[0]?.problems).toEqual(['credits']);
    // An ordinary row with nothing in its grade column is in progress.
    for (const grade of [null, '', '   ']) {
      const reading = read(good({ grade }));
      expect(reading.rows[0]?.row.grade, JSON.stringify(grade)).toBeNull();
      expect(credits(reading)).toEqual([0, 3, 118]);
    }
    const missing = read(without('grade'));
    expect(credits(missing)).toEqual([0, 3, 118]);
    // Below C, W, I and F pass the check and count nothing.
    // The grade is kept as printed, without the spaces around it.
    expect(read(good({ grade: ' b ' })).rows[0]?.row.grade).toBe('b');
    for (const grade of ['D', 'F', 'W', 'I', ' d ', 'w']) {
      const reading = read(good({ grade }));
      expect(reading.toFix, grade).toEqual([]);
      expect(credits(reading), grade).toEqual([0, 0, 121]);
    }
  });

  it('reads numbers the way a transcript prints them', () => {
    for (const printed of ['3', '3.00', ' 3.00 ', '3.0']) {
      const reading = read(good({ attempted: printed, earned: printed, points: '9.00' }));
      expect(reading.toFix, printed).toEqual([]);
      expect(reading.rows[0]?.row.credits).toBe(3);
    }
    expect(read(good({ earned: '', points: null })).toFix).toEqual([]);
    expect(read(without('earned')).toFix).toEqual([]);
    expect(read(good({ points: '108.00' })).toFix).toEqual([]);
  });
});

describe('matching to the curriculum', () => {
  it('matches by course code and never by title', () => {
    const reading = read(
      good({ prefix: 'ORI', number: '100', description: 'First Year Experience' }),
      good({ prefix: 'CIS', number: '206', description: 'Bus Programming Languages' }),
      good({ prefix: 'BIOL', number: '127', description: 'Gen Biology I Lab' }),
      good({ prefix: 'BIO', number: '127', description: 'General Biology I' }),
      // The exact title of a curriculum course, under a code that is not one.
      good({ prefix: 'XYZ', number: '101', description: 'Principles of Management' }),
      // A course of the curriculum under the title of another one: the code decides.
      good({ prefix: 'CIS', number: '205', description: 'Principles of Management' }),
      // The right code with a wrong description, and with none.
      good({ prefix: 'MGT', number: '321', description: 'Basket Weaving' }),
      without('description', { prefix: 'ENG', number: '131' }),
    );
    expect(reading.toFix).toEqual([]);
    expect(reading.rows.map(one => `${one.row.code} ${one.match}`)).toEqual(['ORI 100 listed', 'CIS 206 listed', 'BIOL 127 listed', 'BIO 127 listed', 'XYZ 101 none', 'CIS 205 listed', 'MGT 321 listed', 'ENG 131 listed']);
    expect(reading.rows[7]?.description).toBe('');
    // The title placed nothing: CIS 205 filled its own place, and MGT 321's is filled by MGT 321's own row.
    expect(place(reading).blocks.flatMap(one => one.required).filter(one => one.state === 'done').map(one => one.course.code).sort()).toEqual(['BIO 127', 'BIOL 127', 'CIS 205', 'CIS 206', 'MGT 321', 'ORI 100']);
    // The lab and the lecture are two courses.
    const placed = place(read(good({ prefix: 'BIOL', number: '127' })));
    expect(placed.credits.done).toBe(1);
    // Letter case and spaces around the two parts do not matter; a number may be a number.
    for (const [prefix, number] of [['eng', '131'], ['ENG ', ' 131'], [' Eng', 131], ['ENG', '131 ']] as const) {
      expect(codes(read(good({ prefix, number }))), `${prefix}+${number}`).toEqual(['ENG 131']);
    }
  });

  it('lets an unmatched row fill nothing', () => {
    const reading = read(
      good({ prefix: 'BIO', number: '230', grade: 'A' }), good({ prefix: 'XYZ', number: '101', grade: 'A' }),
      good({ prefix: 'MKT', number: '410', grade: 'A' }), good({ prefix: 'CIS', number: '304', grade: 'A' }),
      good({ prefix: 'CIS', number: '415', grade: 'A' }),
    );
    expect(reading.toFix).toEqual([]);
    expect(reading.rows.map(one => `${one.row.code} ${one.match}`)).toEqual(['BIO 230 none', 'XYZ 101 none', 'MKT 410 elective', 'CIS 304 none', 'CIS 415 none']);
    const placement = place(reading);
    expect(placement.credits.done).toBe(3);
    expect(placement.electives.filled.map(one => one.course.code)).toEqual(['MKT 410']);
    expect(placement.blocks.every(one => one.credits.done === 0)).toBe(true);
    expect(placement.unplaced.map(one => one.code)).toEqual(['BIO 230', 'XYZ 101', 'CIS 304', 'CIS 415']);
    // "Listed" is not "counts": a legacy course, and a listed course that was not passed, fill nothing.
    const listed = read(good({ prefix: 'FLS', number: '161', grade: 'A' }), good({ prefix: 'CIS', number: '300', grade: 'D' }));
    expect(listed.rows.map(one => one.match)).toEqual(['listed', 'listed']);
    expect(credits(listed)).toEqual([0, 0, 121]);
  });
});

describe('lines that are not courses', () => {
  it('throws away the GPA, standing and transfer-totals lines', () => {
    const line = (over: Row): Row => ({ term: 'Fall 2025', transfer: false, prefix: '', number: '', description: '', attempted: '', earned: '', grade: '', points: '', ...over });
    const lines = [
      line({ description: 'Term GPA 3.20' }), line({ prefix: 'Term GPA', number: '3.20' }), line({ description: 'Transfer Term GPA 0.00' }),
      line({ prefix: 'TRANSFER TERM GPA' }), line({ description: 'combined gpa 2.79' }), line({ prefix: 'Combined GPA', attempted: '14.00', points: '39.00' }),
      line({ prefix: 'Academic Standing', description: 'Good Standing' }), line({ description: 'Academic Standing: Probation' }),
      line({ prefix: 'Transfer Totals', earned: '9.00', transfer: true, term: 'Transfer Credit' }), line({ description: 'transfer totals' }),
    ];
    for (const one of lines) expect(read(one), JSON.stringify(one)).toEqual({ rows: [], toFix: [], thrownAway: 1 });
    expect(read(...lines, good())).toMatchObject({ toFix: [], thrownAway: lines.length });
    // The second made-up transcript, with these lines and without them: the same reading otherwise.
    const without = { rows: sampleB.rows.filter(row => /^[A-Z]{2,4}$/.test(row.prefix) && row.number !== '') };
    const full = readRows(sampleB, curriculum);
    const bare = readRows(without, curriculum);
    expect(full.thrownAway).toBe(sampleB.rows.length - without.rows.length);
    expect(full.thrownAway).toBe(13);
    expect(bare.thrownAway).toBe(0);
    expect(full.rows.map(one => one.row)).toEqual(bare.rows.map(one => one.row));
    expect(full.toFix).toEqual([]);
    // The words with more words after them are not a totals line, with a code or without.
    expect(read(line({ prefix: 'ORI', description: 'Academic Standing Seminar' }))).toMatchObject({ thrownAway: 0, toFix: [{ problems: ['code', 'credits'] }] });
    // A row that carries such words but is a course is kept and checked like any row.
    const seminar = read(good({ prefix: 'ORI', number: '100', description: 'Academic Standing Seminar' }));
    expect(seminar).toMatchObject({ thrownAway: 0, toFix: [] });
    expect(codes(seminar)).toEqual(['ORI 100']);
    expect(read(good({ description: 'Academic Standing Seminar', grade: 'Z' }))).toMatchObject({ thrownAway: 0, rows: [] });
    // Only the phrases themselves, as whole words: anything else without a code is a row to fix.
    for (const description of ['Academic Writing', 'Academic Advising Hold', 'Midterm GPA Review', 'Longterm GPAX', 'Standing Committee', 'Totals']) {
      expect(read(line({ description })), description).toMatchObject({ thrownAway: 0, rows: [], toFix: [{ problems: ['code', 'credits'], seen: { description } }] });
    }
    // A real course is never thrown away, and a line that only looks odd is a row to fix.
    expect(codes(read(good({ description: 'Academic Writing' })))).toEqual(['MGT 321']);
    expect(read(line({ description: 'Dean\'s List' }))).toMatchObject({ thrownAway: 0, toFix: [{ problems: ['code', 'credits'] }] });
  });
});

describe('an answer that is no answer', () => {
  it('refuses an answer that is not a list of rows', () => {
    for (const answer of [null, undefined, 'rows', 42, [], [good()], {}, { rows: null }, { rows: 'none' }, { rows: { 0: good() } }, { Rows: [good()] }]) {
      expect(() => readRows(answer, curriculum), JSON.stringify(answer)).toThrow(ReaderError);
      expect(() => readRows(answer, curriculum)).toThrow('The transcript could not be read.');
    }
    expect(readRows({ rows: [] }, curriculum)).toEqual({ rows: [], toFix: [], thrownAway: 0 });
    // Many rows, and many things that are not rows: read one by one, without failing.
    const many = readRows({ rows: Array.from({ length: 10000 }, (_, i) => good({ number: String(100 + (i % 900)) })) }, curriculum);
    expect(many.rows).toHaveLength(10000);
    const junk = readRows({ rows: Array.from({ length: 10000 }, (_, i) => (i % 2 ? i : 'x')) }, curriculum);
    expect(junk.toFix).toHaveLength(10000);
    expect(junk.rows).toEqual([]);
  });

  it('brings in nothing the shape does not name', () => {
    const answer = JSON.parse('{"student":{"name":"Someone Real","id":"123456789"},"rows":[{"term":"Fall 2025","transfer":false,"prefix":"MGT","number":"321","attempted":3,"grade":"B","ssn":"123-45-6789","advisor":"Dr. Who"},{"term":"Fall 2025","transfer":false,"prefix":"MGT","number":"32","attempted":3,"grade":"B","ssn":"123-45-6789"}]}') as unknown;
    const reading = readRows(answer, curriculum);
    expect(reading.rows).toHaveLength(1);
    expect(reading.toFix).toHaveLength(1);
    expect(JSON.stringify(reading)).not.toMatch(/Someone|123456789|123-45|ssn|advisor|Dr\. Who|student/);
    expect(Object.keys(reading.rows[0]!).sort()).toEqual(['description', 'line', 'match', 'row']);
    expect(Object.keys(reading.rows[0]!.row).sort()).toEqual(['code', 'credits', 'grade', 'term', 'transfer']);
    expect(Object.keys(reading.toFix[0]!.seen).sort()).toEqual(['attempted', 'description', 'grade', 'number', 'prefix', 'term', 'transfer']);

    // Keys that mean something to the language mean nothing here.
    const before = Object.getOwnPropertyNames(Object.prototype).sort();
    const hostile = JSON.parse('{"__proto__":{"rows":[{"polluted":true}]},"constructor":{"prototype":{"polluted":true}},"rows":[{"__proto__":{"term":"Fall 2025","transfer":true,"prefix":"MGT","number":"321"},"constructor":"x","prototype":"y"},{"term":"Fall 2025","transfer":false,"prefix":"MGT","number":"321","attempted":3,"grade":"B","__proto__":{"transfer":true},"toString":"x","hasOwnProperty":"y"}]}') as unknown;
    const read2 = readRows(hostile, curriculum);
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    // The first row has no fields of its own that the shape names: every part is at fault.
    expect(read2.toFix.map(one => one.problems)).toEqual([['term', 'transfer', 'code', 'credits']]);
    // The second is read on its own fields: an ordinary row, not transfer credit.
    expect(read2.rows.map(one => one.row)).toEqual([{ code: 'MGT 321', term: 'Fall 2025', credits: 3, grade: 'B', transfer: false }]);
    // An answer that fails while it is being read (impossible from parsed text) is no answer either.
    const failing = { rows: [Object.defineProperty({}, 'term', { enumerable: true, get(): never { throw new TypeError('boom'); } })] };
    expect(() => readRows(failing, curriculum)).toThrow(ReaderError);
    expect(() => readRows({ get rows(): never { throw new RangeError('boom'); } }, curriculum)).toThrow('The transcript could not be read.');
    // An answer whose rows are only inherited is no answer.
    expect(() => readRows(Object.create({ rows: [good()] }), curriculum)).toThrow(ReaderError);
  });
});

describe('the second made-up transcript, repeats and text', () => {
  it('reads the second made-up transcript', () => {
    const reading = readRows(sampleB, curriculum);
    expect(reading.toFix).toEqual([]);
    expect(reading.rows.map(one => `${one.row.term}: ${one.row.code} ${one.row.transfer ? 'transfer' : one.row.grade ?? 'in progress'}`)).toEqual([
      'Transfer Credit: ENG 131 transfer', 'Transfer Credit: MAT 137 transfer', 'Transfer Credit: HIS 131 transfer',
      'Fall 2024: ORI 100 A', 'Fall 2024: ENG 132 B', 'Fall 2024: BIO 127 W', 'Fall 2024: BIOL 127 B', 'Fall 2024: CIS 205 F', 'Fall 2024: BIO 230 A',
      'Spr 2025: CIS 205 B', 'Spr 2025: CIS 206 I', 'Spr 2025: FLS 161 B', 'Spr 2025: MKT 410 A', 'Spr 2025: HUM 103 C',
      'Fall 2025: CIS 206 in progress', 'Fall 2025: ECO 251 in progress',
    ]);
    // By hand (docs/sprints/F10.md): 23 done, 6 in progress, 92 left; with the legacy answer Yes, 26, 6 and 89.
    expect(credits(reading)).toEqual([23, 6, 92]);
    expect(credits(reading, false)).toEqual([23, 6, 92]);
    expect(credits(reading, true)).toEqual([26, 6, 89]);
    const standing = Object.fromEntries(standingsOf(reading, curriculum.grades).map(one => [one.code, one.standing]));
    // Transfer credit passes whatever its mark; W, I and F count nothing; a repeat counts once.
    expect(standing).toMatchObject({ 'ENG 131': 'passed', 'MAT 137': 'passed', 'HIS 131': 'passed', 'BIO 127': 'no-credit', 'CIS 205': 'passed', 'CIS 206': 'in-progress', 'BIOL 127': 'passed' });
    expect(Object.keys(standing)).toHaveLength(14);
    const placement = place(reading);
    expect(placement.unplaced.map(one => `${one.code} ${one.reason}`)).toEqual(['BIO 230 not-in-curriculum', 'FLS 161 legacy-only']);
    expect(place(reading, true).unplaced.map(one => one.code)).toEqual(['BIO 230']);
    expect(place(reading, true).electives.filled.map(one => `${one.course.code} ${one.by}`)).toEqual(['FLS 161 legacy', 'MKT 410 rule']);
    expect(reading.rows.filter(one => one.match !== 'listed').map(one => `${one.row.code} ${one.match}`)).toEqual(['BIO 230 none', 'MKT 410 elective']);
  });

  it('counts a repeated course once, in any order', () => {
    // The same row twice in a term, and the same course in two terms.
    expect(credits(read(good(), good()))).toEqual([3, 0, 118]);
    expect(credits(read(good({ term: 'Fall 2024', grade: 'D' }), good({ term: 'Spr 2025', grade: 'B' })))).toEqual([3, 0, 118]);
    expect(credits(read(good({ term: 'Spr 2025', grade: 'B' }), good({ term: 'Fall 2024', grade: 'D' })))).toEqual([3, 0, 118]);
    expect(read(good(), good()).rows).toHaveLength(2);
    // Rows out of term order are read in the order given, and place the same.
    const shuffled = { rows: [...sampleB.rows].reverse() };
    const reading = readRows(shuffled, curriculum);
    expect(reading.rows.map(one => one.row.code)).toEqual(readRows(sampleB, curriculum).rows.map(one => one.row.code).reverse());
    expect(credits(reading)).toEqual([23, 6, 92]);
    expect(credits(readRows({ rows: [...sampleA.rows].reverse() }, curriculum))).toEqual([27, 13, 81]);
  });

  it('treats text fields as text', () => {
    const odd = ['<img src=x onerror=alert(1)>', '"><script>alert(1)</script>', 'x'.repeat(10000), 'line\nbreak\ttab\u0000nul', 'MGT 321 A', 'CIS 300'];
    for (const text of odd) {
      const reading = read(good({ description: text, term: text }));
      expect(reading.toFix, text.slice(0, 20)).toEqual([]);
      expect(reading.rows[0]).toMatchObject({ description: text, row: { term: text, code: 'MGT 321' }, match: 'listed' });
    }
    // A code is never made from a description.
    const reading = read(good({ prefix: '', number: '', description: 'MGT 321 Principles of Management' }));
    expect(reading.rows).toEqual([]);
    expect(reading.toFix[0]?.problems).toEqual(['code']);
    expect(reading.toFix[0]?.seen.description).toBe('MGT 321 Principles of Management');
  });
});

describe('the made-up transcripts', () => {
  const folder = join(repo, 'synthetic', 'transcripts');
  const made = transcripts() as { name: string; answer: { rows: Row[] }; pdf: Buffer }[];
  const textOf = (pdf: Buffer): string[] => [...pdf.toString('latin1').matchAll(/\((.*)\) Tj T\*/g)].map(found => (found[1] ?? '').replace(/\\([\\()])/g, '$1'));

  it('keeps each made-up PDF in step with its answer', () => {
    expect(made.map(one => one.name)).toEqual(['sample-a', 'sample-b']);
    for (const { name, answer, pdf } of made) {
      const file = join(folder, `${name}.pdf`);
      expect(existsSync(file), file).toBe(true);
      // Byte for byte what the script writes from the answer; and the same when written again.
      expect(readFileSync(file).equals(pdf), `${name}.pdf differs from its answer: run node scripts/make-synthetic-transcripts.mjs`).toBe(true);
      expect((pdfFor(answer) as Buffer).equals(pdf)).toBe(true);
      const raw = pdf.toString('latin1');
      expect(raw.startsWith('%PDF-1.4\n')).toBe(true);
      expect(raw.endsWith('%%EOF\n')).toBe(true);
      // No date, no identifier, nothing compressed.
      expect(raw).not.toMatch(/CreationDate|ModDate|\/ID\s*\[|FlateDecode|\/Filter/);
      // Well formed: the cross-reference table points at each object, and each stream is as long as it says.
      const table = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(raw)?.[1]);
      expect(raw.slice(table, table + 5)).toBe('xref\n');
      const offsets = [...raw.slice(table).matchAll(/^(\d{10}) 00000 n $/gm)].map(found => Number(found[1]));
      expect(offsets.length).toBeGreaterThanOrEqual(6);
      offsets.forEach((offset, i) => expect(raw.slice(offset, offset + `${i + 1} 0 obj\n`.length), `${name} object ${i + 1}`).toBe(`${i + 1} 0 obj\n`));
      expect(raw).toContain(`/Size ${offsets.length + 1} /Root 1 0 R`);
      for (const [, length, body] of raw.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)endstream/g)) expect(body?.length, name).toBe(Number(length));
      expect(raw).toMatch(/\/Type \/Font \/Subtype \/Type1 \/BaseFont \/Courier/);
    }
  });

  it('lays the made-up transcripts out like the real one', () => {
    for (const { name, answer, pdf } of made) {
      const lines = textOf(pdf);
      expect(lines.slice(2), name).toEqual(linesFor(answer));
      const courses = answer.rows.filter(row => /^[A-Z]{2,4}$/.test(String(row.prefix)) && String(row.number) !== '');
      const terms = [...new Set(courses.map(row => String(row.term)))];
      // Each term heading as printed, with its column headings.
      for (const term of terms) expect(lines, `${name}: ${term}`).toContain(term);
      expect(lines.filter(line => line === 'Prefix Number Description                     Attempted  Earned  Grade  Points')).toHaveLength(terms.length);
      // Each course line: prefix, number, description, attempted, earned, grade, points.
      for (const row of courses) {
        const number = (value: unknown): string => (value === '' || value === null || value === undefined ? '' : Number(value).toFixed(2));
        const wanted = [row.prefix, row.number, row.description, number(row.attempted), number(row.earned), row.grade ?? '', number(row.points)].map(String).filter(part => part !== '');
        const printed = lines.find(line => line.startsWith(`${String(row.prefix).padEnd(6)} ${row.number}`) && line.includes(String(row.description)) && wanted.every(part => line.includes(part)));
        expect(printed, `${name}: ${row.term} ${row.prefix} ${row.number}`).toBeDefined();
      }
      // The totals under each ordinary term, and the standing line.
      const ordinary = terms.filter(term => term !== 'Transfer Credit');
      for (const phrase of [/^Term GPA \d\.\d\d$/, /^Transfer Term GPA \d\.\d\d$/, /^Combined GPA \d\.\d\d$/, /^Academic Standing: Good Standing$/]) {
        expect(lines.filter(line => phrase.test(line)), `${name}: ${phrase}`).toHaveLength(ordinary.length);
      }
    }
    const [a, b] = made.map(one => textOf(one.pdf));
    expect(a).toEqual(expect.arrayContaining(['Fall 2025', 'Spr 2026', 'Fall 2026']));
    expect(a).not.toContain('Transfer Credit');
    // The transfer section of the second: its own heading and totals, rows under ASU course codes.
    expect(b).toEqual(expect.arrayContaining(['Transfer Credit', 'Fall 2024', 'Spr 2025', 'Fall 2025']));
    const from = b!.indexOf('Transfer Credit');
    expect(b!.slice(from + 2, from + 5).map(line => line.slice(0, 10))).toEqual(['ENG    131', 'MAT    137', 'HIS    131']);
    expect(b![from + 5]?.startsWith('Transfer Totals')).toBe(true);
    expect(b!.find(line => line.startsWith('Transfer Totals'))).toMatch(/9\.00$/);
    // No summer term: the owner has given no heading for one.
    for (const lines of [a!, b!]) expect(lines.join('\n')).not.toMatch(/\bSum(mer)?\b/);
  });

  it('marks every page of a long transcript, and keeps its pages in order', () => {
    const rows = Array.from({ length: 130 }, (_, i) => ({ term: `Fall ${2000 + Math.floor(i / 10)}`, transfer: false, prefix: 'XYZ', number: String(100 + i), description: `Made-up course ${i}`, attempted: 3, earned: 3, grade: 'B', points: 9 }));
    const pdf = pdfFor({ rows }) as Buffer;
    const raw = pdf.toString('latin1');
    const pages = raw.split('/Type /Page /Parent').length - 1;
    expect(pages).toBeGreaterThan(3);
    expect(raw).toContain(`/Count ${pages} >>`);
    expect(textOf(pdf).filter(line => line === MARK)).toHaveLength(pages);
    // Every course line is there, once, in the order given.
    expect(textOf(pdf).filter(line => line.startsWith('XYZ    ')).map(line => line.slice(7, 10))).toEqual(rows.map(row => row.number));
    const table = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(raw)?.[1]);
    const offsets = [...raw.slice(table).matchAll(/^(\d{10}) 00000 n $/gm)].map(found => Number(found[1]));
    expect(offsets).toHaveLength(4 + pages * 2);
    offsets.forEach((offset, i) => expect(raw.slice(offset, offset + `${i + 1} 0 obj\n`.length)).toBe(`${i + 1} 0 obj\n`));
  });

  it('prints the totals the careless reader returned', () => {
    // The totals lines kept as rows in the second answer are the ones on its PDF.
    const lines = textOf(made[1]!.pdf);
    const totals = sampleB.rows.filter(row => row.number === '' && !/^[A-Z]{2,4}$/.test(row.prefix));
    expect(totals).toHaveLength(13);
    for (const row of totals) {
      const printed = row.prefix === 'Academic Standing' ? `Academic Standing: ${row.description}` : row.prefix === 'Transfer Totals' ? lines.find(line => line.startsWith('Transfer Totals') && line.endsWith(row.earned)) : row.description;
      expect(lines, JSON.stringify(row)).toContain(printed);
    }
  });

  it('holds no real student data', () => {
    for (const { name, pdf } of made) {
      const raw = pdf.toString('latin1');
      const lines = textOf(pdf);
      // Every page says it is synthetic; the student is the made-up one.
      const pages = raw.split('/Type /Page /Parent').length - 1;
      expect(lines.filter(line => line === MARK), name).toHaveLength(pages);
      expect(MARK).toBe('SYNTHETIC - not a real transcript');
      expect(lines).toContain(`Student: ${STUDENT}    ID: ${STUDENT_ID}`);
      expect([STUDENT, STUDENT_ID]).toEqual(['Sample Student', '000000000']);
      // The PDF's own details say only what it is.
      expect(raw.match(/\/(Title|Author|Producer|Creator) \(([^)]*)\)/g)).toEqual(['/Title (PathCheck synthetic)', '/Author (PathCheck synthetic)', '/Producer (PathCheck synthetic)', '/Creator (PathCheck synthetic)']);
    }
    for (const answer of [sampleA, sampleB]) expect(answer.note).toMatch(/^SYNTHETIC - not a real transcript\. .*The student does not exist\./);
    // Nothing else in the folder, and nothing in it that looks like a person.
    expect(readdirSync(folder).sort()).toEqual(['manifest.json', 'sample-a.json', 'sample-a.pdf', 'sample-b.json', 'sample-b.pdf']);
    for (const file of readdirSync(folder)) {
      const text = readFileSync(join(folder, file), 'latin1').replaceAll(STUDENT_ID, '').replaceAll(STUDENT, '');
      expect(text, file).not.toMatch(/\b\d{9}\b|\b\d{3}-\d{2}-\d{4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|@|\b(Street|Avenue|Montgomery|Date of Birth|DOB)\b/i);
    }
    expect(readFileSync(join(repo, 'synthetic', 'README.md'), 'utf8')).toMatch(/Never put a\s+real transcript/);
  });

  it('reaches nothing outside', () => {
    for (const file of [join(repo, 'src', 'reader.ts'), join(repo, 'scripts', 'make-synthetic-transcripts.mjs')]) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/fetch\(|https?:|XMLHttpRequest|process\.env|import\.meta\.env|GEMINI|API_KEY|node:https?|node:net|child_process/i);
    }
    // The reader's code names no letter of the grade scale: the scale is the curriculum's.
    expect(readFileSync(join(repo, 'src', 'reader.ts'), 'utf8')).not.toMatch(/['"][A-FWI]['"]/);
  });
});
