// F02: the curriculum is data (docs/sprints/F02.md, docs/BRIEF.md §5, owner answers of
// 2026-11-15). These tests run against the real data file on every `npm test`, so an edit
// that breaks a rule fails CI. The expected table is written out here from the brief; it
// is not derived from the file.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import rawData from '../docs/curriculum/provisional-current.json';
import madeUp from './fixtures/made-up-program.json';
import { CurriculumError, curriculum, findCourse, loadCurriculum, normalizeCode, programs } from '../src/curriculum';

const repo = join(import.meta.dirname, '..');
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(dir, entry.name)] : []);
const sources = sourceFiles(join(repo, 'src')).map(file => ({ file, text: readFileSync(file, 'utf8') }));

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const keysOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.flatMap(keysOf)
    : value && typeof value === 'object' ? Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]) : [];
const textsOf = (value: unknown): string[] =>
  typeof value === 'string' ? [value]
    : Array.isArray(value) ? value.flatMap(textsOf)
      : value && typeof value === 'object' ? Object.values(value).flatMap(textsOf) : [];
const copy = (): { [key: string]: Json } => structuredClone(rawData) as { [key: string]: Json };
type Edit = (data: ReturnType<typeof copy>) => void;
const broken = (edit: Edit): (() => unknown) => () => { const data = copy(); edit(data); return loadCurriculum(data); };
// Reaching into the raw data in the tests that break it on purpose.
const blocksOf = (data: ReturnType<typeof copy>) => data.blocks as { id: string; credits: Json; required: { [key: string]: Json }[]; choices: { choose: Json; courses: { [key: string]: Json }[] }[] }[];
const part = (data: ReturnType<typeof copy>, key: string) => data[key] as { [key: string]: Json };

const codes = (list: { code: string }[]): string[] => list.map(course => course.code).sort();

describe('the curriculum comes from the data file', () => {
  it('builds the curriculum from the data file', () => {
    expect(curriculum).toEqual(loadCurriculum(rawData));
    expect(curriculum.id).toBe(rawData.id);
    expect(readFileSync(join(repo, 'src', 'curriculum.ts'), 'utf8')).toContain("from '../docs/curriculum/provisional-current.json'");
  });

  it('keeps curriculum facts out of the code', () => {
    expect(sources.length).toBeGreaterThan(0);
    const blockNames = rawData.blocks.map(block => block.name);
    for (const { file, text } of sources) {
      expect(text.match(/\b[A-Z]{2,4}[ -]?\d{3}\b/g) ?? [], `${file}: text shaped like a course code`).toEqual([]);
      expect(blockNames.filter(name => text.includes(name)), `${file}: a block name`).toEqual([]);
      expect(text.match(/\b121\b|\b42\b/g) ?? [], `${file}: the degree or core credit total`).toEqual([]);
    }
  });

  it('lists exactly one major, named by the data file', () => {
    expect(programs).toHaveLength(1);
    expect(programs[0]?.name).toBe('B.S. Computer Information Systems');
    expect(programs[0]?.name).toBe(rawData.program);
    expect(programs[0]?.curriculum).toBe(curriculum);
    expect(JSON.stringify(programs)).not.toMatch(/coming soon|disabled/i);
  });

  it('loads a made-up second program through the same loader', () => {
    const other = loadCurriculum(madeUp);
    expect(other.program).toBe('B.S. Made-up Studies');
    expect(other.degreeCredits).toBe(20);
    expect(other.blocks.map(block => [block.name, block.credits])).toEqual([['Basics', 8], ['Depth', 6]]);
    // A pick group can ask for more than one course, and a subject can have four letters.
    expect(other.blocks[0]?.picks[0]?.choose).toBe(2);
    expect(findCourse(other, 'xbbb201')).toEqual([{ kind: 'required', blockId: 'depth', course: { code: 'XBBB 201', title: 'Deeper Things', credits: 3 } }]);
    expect(other.lastReviewed).toBe('2026-01-15');
    // It is a test fixture only: it is not one of the app's majors.
    expect(programs.map(program => program.id)).not.toContain(other.id);
    expect(findCourse(curriculum, 'XAA 101')).toEqual([]);
  });
});

describe('the curriculum matches brief section 5', () => {
  // Brief §5, written out by hand. Order of blocks matters; order of courses does not.
  const brief: [name: string, credits: number, required: string[], picks: string[][]][] = [
    ['Orientation', 1, ['ORI 100'], []],
    ['Composition', 6, [], [['ENG 131', 'ENG 140'], ['ENG 132', 'ENG 141']]],
    ['Humanities', 12, ['HUM 103', 'ENG 209'], [['ART 131', 'THE 111', 'MUS 121'], ['ENG 210', 'HUM 101', 'HUM 102', 'CMS 200', 'CMS 205', 'PHL 201']]],
    ['Social sciences', 12, ['HIS 131', 'ECO 251', 'ECO 252'], [['HIS 132', 'GEO 206', 'ANT 113', 'POS 207', 'PSY 251', 'SOC 110']]],
    ['Science & math', 11, ['BIO 127', 'BIOL 127', 'BIO 128', 'BIOL 128', 'MAT 137'], []],
    ['Pre-professional', 19, ['CIS 205', 'ACT 214', 'ACT 215', 'MGT 202', 'MGT 252', 'MGT 255'], [['PED 114', 'PED 122']]],
    ['Business core', 27, ['MGT 201', 'CIS 206', 'MGT 204', 'FIN 321', 'MGT 321', 'MKT 321', 'CIS 329', 'MGT 422', 'MGT 462'], []],
    ['Major (CIS)', 24, ['CIS 300', 'CIS 302', 'CIS 310', 'CIS 341', 'CIS 351', 'CIS 404', 'CIS 410', 'CIS 461'], []],
  ];

  it('matches the table in brief section 5', () => {
    expect(curriculum.blocks.map(block => [block.name, block.credits])).toEqual(brief.map(([name, credits]) => [name, credits]));
    curriculum.blocks.forEach((block, i) => {
      const [name, , required, picks] = brief[i] ?? ['', 0, [], []];
      expect(codes(block.required), `${name}: required`).toEqual([...required].sort());
      expect(block.picks.map(group => group.choose), `${name}: choose 1 of each group`).toEqual(picks.map(() => 1));
      expect(block.picks.map(group => codes(group.courses)), `${name}: picks`).toEqual(picks.map(group => [...group].sort()));
    });
    expect([curriculum.electives.name, curriculum.electives.credits, curriculum.electives.courseCount]).toEqual(['CIS electives', 9, 3]);
  });

  it('adds up to 121', () => {
    const blockTotal = curriculum.blocks.reduce((total, block) => total + block.credits, 0);
    expect(blockTotal + curriculum.electives.credits).toBe(121);
    expect(curriculum.degreeCredits).toBe(121);
    for (const block of curriculum.blocks) {
      const required = block.required.reduce((total, course) => total + course.credits, 0);
      const picked = block.picks.reduce((total, group) => total + group.choose * (group.courses[0]?.credits ?? 0), 0);
      expect(required + picked, block.name).toBe(block.credits);
      for (const group of block.picks) expect(new Set(group.courses.map(course => course.credits)).size, block.name).toBe(1);
    }
  });

  it('lists each course once', () => {
    const listed = [...curriculum.blocks.flatMap(block => [...block.required, ...block.picks.flatMap(group => group.courses)]), ...curriculum.electives.named].map(course => course.code);
    // Brief §5: 1 + 4 + 11 + 9 + 5 + 8 + 9 + 8 courses in the blocks, and one named elective.
    expect(listed).toHaveLength(56);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('carries the elective rule and the legacy-only courses', () => {
    const { electives } = curriculum;
    expect(electives.named).toEqual([{ code: 'FIN 201', title: 'Personal Finance', credits: 3 }]);
    expect([...electives.subjects].sort()).toEqual(['ACT', 'CIS', 'ECO', 'FIN', 'MGT', 'MKT']);
    expect([electives.minNumber, electives.maxNumber, electives.creditsPerCourse]).toEqual([300, 499, 3]);
    expect(electives.excludeRequired).toBe(true);
    expect(electives.legacyOnly).toEqual([
      { code: 'PSY 251', title: 'General Psychology', credits: 3 },
      { code: 'FLS 161', title: 'Spanish I', credits: 3 },
      { code: 'MGT 220', title: 'Systems Approach to Business', credits: 3 },
      { code: 'MGT 203', title: 'Special Topics: Business Communications', credits: 3 },
    ]);
  });

  it('carries the last-reviewed date', () => {
    expect(rawData.lastReviewed).toBe(null);
    expect(curriculum.lastReviewed).toBe(null);
  });

  it('carries the sequence alternatives inside the 42 core hours', () => {
    const { sequence } = curriculum;
    expect(sequence.choose).toBe(1);
    expect(sequence.alternatives.map(alternative => alternative.courses)).toEqual([['HIS 131', 'HIS 132'], ['ENG 209', 'ENG 210']]);
    expect(sequence.additionalCredits).toBe(0);
    const core = curriculum.blocks.filter(block => sequence.coreBlockIds.includes(block.id));
    expect(core.map(block => block.name)).toEqual(['Orientation', 'Composition', 'Humanities', 'Social sciences', 'Science & math']);
    expect(core.reduce((total, block) => total + block.credits, 0)).toBe(42);
    expect(sequence.coreCredits).toBe(42);
    // Each sequence is a required course plus a pick in the same core block.
    expect(findCourse(curriculum, 'HIS 131')).toMatchObject([{ kind: 'required', blockId: 'social-sciences' }]);
    expect(findCourse(curriculum, 'HIS 132')).toMatchObject([{ kind: 'pick', blockId: 'social-sciences' }]);
    expect(findCourse(curriculum, 'ENG 209')).toMatchObject([{ kind: 'required', blockId: 'humanities' }]);
    expect(findCourse(curriculum, 'ENG 210')).toMatchObject([{ kind: 'pick', blockId: 'humanities' }]);
  });

  it('carries the grade scale', () => {
    expect(curriculum.grades).toEqual({ letters: ['A', 'B', 'C', 'D', 'F'], minimumCounting: 'C', neverCounting: ['W', 'I'] });
  });
});

describe('what must not be in the curriculum', () => {
  const REMOVED = /CIS[- ]?304|CIS[- ]?415|\breplacement|\bold(er)?[ _-]?codes?\b|\bformerly\b|\bsupersed|not[- ]?offered|nonOffer|\bhistorical\b|\bunresolved\b/i;

  it('has no CIS 304, CIS 415, replacement, older-code or not-offered entry', () => {
    for (const value of [...keysOf(rawData), ...textsOf(rawData)]) expect(value).not.toMatch(REMOVED);
    for (const { file, text } of sources) expect(text.match(REMOVED), file).toBe(null);
    expect(findCourse(curriculum, 'CIS 304')).toEqual([]);
    expect(findCourse(curriculum, 'CIS 415')).toEqual([]);
  });

  it('checks for removed entries without tripping over ordinary code', () => {
    for (const ordinary of ['code.replace(/-/g, " ")', '<input placeholder="Course code or title">', 'const holder = folder;', 'the history sequence', 'legacyOnlyCourses']) {
      expect(ordinary).not.toMatch(REMOVED);
    }
    for (const removed of ['CIS-304', 'cis 415', 'replacementFor', 'older code', 'oldCode', 'formerly', 'supersededBy', 'not offered', 'nonOffering', 'historical', 'unresolved']) {
      expect(removed).toMatch(REMOVED);
    }
  });

  it('has no catalog-year or start-year field', () => {
    const YEAR_KEY = /catalog|startYear|start_year|year/i;
    for (const key of [...keysOf(rawData), ...keysOf(curriculum)]) expect(key).not.toMatch(YEAR_KEY);
    expect(keysOf(rawData).length).toBeGreaterThan(200);
  });

  it('says nothing about GPA, residency or the suspended exams', () => {
    const NOT_CHECKED = /\bGPA\b|residen|Nelson|Denny|proficiency|comprehensive exam|competency/i;
    for (const value of [...keysOf(rawData), ...textsOf(rawData), ...keysOf(curriculum), ...textsOf(curriculum)]) expect(value).not.toMatch(NOT_CHECKED);
  });
});

describe('the loader refuses a broken data file, naming what is wrong', () => {
  it('accepts the real file, so every refusal below is caused by its one edit', () => {
    expect(broken(() => {})).not.toThrow();
  });

  it('refuses a data file with a different schema version', () => {
    expect(broken(data => { data.schemaVersion = 3; })).toThrow(/schemaVersion/);
    expect(broken(data => { data.schemaVersion = 3; })).toThrow(CurriculumError);
  });

  it('refuses a data file with a missing field', () => {
    for (const key of Object.keys(rawData)) {
      expect(broken(data => { delete data[key]; }), key).toThrow(new RegExp(`${key}: missing`));
    }
    // lastReviewed may be null, but it must be there.
    expect(Object.keys(rawData)).toContain('lastReviewed');
    expect(broken(data => { delete (blocksOf(data)[2] as { credits?: Json }).credits; })).toThrow(/blocks\[2\]\.credits: missing/);
    expect(broken(data => { delete blocksOf(data)[6]?.required[4]?.title; })).toThrow(/blocks\[6\] \(business-core\)\.required\[4\]\.title: missing/);
    expect(broken(data => { delete part(data, 'electives').subjectRule; })).toThrow(/electives\.subjectRule: missing/);
  });

  it('refuses a data file with an unknown field, at any level', () => {
    expect(broken(data => { data.catalogYear = '2019-2021'; })).toThrow(/catalogYear: unknown field/);
    expect(broken(data => { (blocksOf(data)[0] as unknown as { [key: string]: Json }).note = 'x'; })).toThrow(/blocks\[0\]\.note: unknown field/);
    expect(broken(data => { (blocksOf(data)[0]?.required[0] as { [key: string]: Json }).replacementFor = 'ORI-101'; })).toThrow(/replacementFor: unknown field/);
    expect(broken(data => { part(data, 'grades').minimumAverage = 2; })).toThrow(/grades\.minimumAverage: unknown field/);
  });

  it('refuses a data file with two blocks of the same id', () => {
    expect(broken(data => { blocksOf(data)[3]!.id = 'humanities'; })).toThrow(/blocks\[3\] \(humanities\): the same block id is used twice/);
  });

  it('refuses a data file with credits that are not a positive whole number', () => {
    expect(broken(data => { blocksOf(data)[2]!.credits = 0; })).toThrow(/blocks\[2\] \(humanities\)\.credits/);
    expect(broken(data => { blocksOf(data)[2]!.credits = 12.5; })).toThrow(/blocks\[2\] \(humanities\)\.credits/);
    expect(broken(data => { blocksOf(data)[2]!.credits = '12'; })).toThrow(/blocks\[2\] \(humanities\)\.credits/);
    expect(broken(data => { blocksOf(data)[6]!.required[4]!.credits = -3; })).toThrow(/MGT-321\)\.credits: must be a positive whole number/);
  });

  it('refuses a data file with a course that has no title', () => {
    expect(broken(data => { blocksOf(data)[6]!.required[4]!.title = ''; })).toThrow(/MGT-321\)\.title: must be text/);
    expect(broken(data => { blocksOf(data)[6]!.required[4]!.title = null; })).toThrow(/MGT-321\)\.title/);
  });

  it('refuses a data file with a course code in the wrong shape', () => {
    for (const bad of ['MGT321', 'mgt-321', 'MGT-32', 'MGT-3210', 'MANGT-321', 'M-321', 'MGT 321']) {
      expect(broken(data => { blocksOf(data)[6]!.required[4]!.courseId = bad; }), bad).toThrow(new RegExp(`\\(${bad}\\): must be 2 to 4 capital letters, a hyphen and 3 digits`));
    }
    // Four letters is a real shape: the lab courses use it.
    expect(codes(curriculum.blocks[4]?.required ?? [])).toContain('BIOL 127');
  });

  it('refuses a data file whose block credits do not match its courses', () => {
    expect(broken(data => { blocksOf(data)[2]!.credits = 15; })).toThrow(/blocks\[2\] \(humanities\)\.credits: is 15 but its courses add up to 12/);
    expect(broken(data => { blocksOf(data)[2]!.required.pop(); })).toThrow(/humanities\)\.credits: is 12 but its courses add up to 9/);
    // `choose` multiplies: asking for two of a group counts both.
    expect(broken(data => { blocksOf(data)[2]!.choices[0]!.choose = 2; })).toThrow(/humanities\)\.credits: is 12 but its courses add up to 15/);
  });

  it('refuses a data file with a pick group that cannot be satisfied or does not add up', () => {
    expect(broken(data => { blocksOf(data)[1]!.choices[0]!.choose = 0; })).toThrow(/blocks\[1\] \(composition\)\.choices\[0\]\.choose: must be a positive whole number/);
    expect(broken(data => { blocksOf(data)[1]!.choices[0]!.choose = 3; })).toThrow(/composition\)\.choices\[0\]\.choose: asks for 3 of 2 courses/);
    expect(broken(data => { blocksOf(data)[1]!.choices[0]!.courses[1]!.credits = 4; })).toThrow(/composition\)\.choices\[0\]\.courses: courses in one pick group must have the same credits/);
  });

  it('refuses a data file that lists the same course twice', () => {
    expect(broken(data => { blocksOf(data)[7]!.required[0]!.courseId = 'MGT-321'; })).toThrow(/MGT-321: the same course is listed twice/);
    expect(broken(data => { (part(data, 'electives').namedCourses as { [key: string]: Json }[])[0]!.courseId = 'CIS-205'; })).toThrow(/CIS-205: the same course is listed twice/);
    // A legacy-only elective may also be a pick in a block, as PSY 251 is.
    expect(findCourse(curriculum, 'PSY 251')).toHaveLength(2);
  });

  it('refuses a data file whose total is not the degree credits', () => {
    expect(broken(data => { data.degreeCredits = 120; })).toThrow(/degreeCredits: is 120 but the blocks and electives add up to 121/);
  });

  it('refuses a data file with an elective rule that does not add up', () => {
    expect(broken(data => { part(data, 'electives').credits = 12; })).toThrow(/electives\.credits: is 12 but 3 courses of 3 credits is 9/);
    expect(broken(data => { (part(data, 'electives').subjectRule as { [key: string]: Json }).minCourseNumber = 500; })).toThrow(/electives\.subjectRule\.minCourseNumber: is above maxCourseNumber/);
    expect(broken(data => { ((part(data, 'electives').subjectRule as { [key: string]: Json }).prefixes as Json[])[0] = 'mgt'; })).toThrow(/prefixes\[0\] \(mgt\): must be 2 to 4 capital letters/);
  });

  it('refuses a data file whose sequence does not sit inside the core blocks', () => {
    expect(broken(data => { (part(data, 'sequence').coreBlocks as Json[])[1] = 'writing'; })).toThrow(/sequence\.coreBlocks\[1\] \(writing\): is not a block/);
    expect(broken(data => { part(data, 'sequence').coreCredits = 40; })).toThrow(/sequence\.coreCredits: is 40 but the core blocks add up to 42/);
    expect(broken(data => { ((part(data, 'sequence').alternatives as { courses: Json[] }[])[0]!.courses)[1] = 'MGT-321'; })).toThrow(/history: MGT-321\): is not a course in a core block/);
    expect(broken(data => { ((part(data, 'sequence').alternatives as { courses: Json[] }[])[1]!.courses)[1] = 'ENG-999'; })).toThrow(/literature: ENG-999\): is not a course in a core block/);
  });

  it('refuses a data file whose lowest counting grade is not one of its letters', () => {
    expect(broken(data => { part(data, 'grades').minimumCounting = 'C-'; })).toThrow(/grades\.minimumCounting: "C-" is not one of the letters/);
  });

  it('refuses a data file with a last-reviewed value that is not a date', () => {
    for (const bad of ['Nov 2026', '2026-13-01', '2026-02-30', '2026-11', 20261115, '']) {
      expect(broken(data => { data.lastReviewed = bad; }), String(bad)).toThrow(/lastReviewed: must be null or a date written YYYY-MM-DD/);
    }
    expect(loadCurriculum({ ...copy(), lastReviewed: '2026-11-15' }).lastReviewed).toBe('2026-11-15');
  });
});

describe('looking a course up', () => {
  it('finds a course by code however it is typed', () => {
    const management = [{ kind: 'required', blockId: 'business-core', course: { code: 'MGT 321', title: 'Principles of Management', credits: 3 } }];
    for (const typed of ['MGT 321', 'mgt321', 'MGT-321', ' Mgt 321 ', 'mgt  321', 'MGT–321'.replace('–', '-')]) expect(findCourse(curriculum, typed), typed).toEqual(management);
    expect(findCourse(curriculum, 'biol127')).toEqual([{ kind: 'required', blockId: 'science-math', course: { code: 'BIOL 127', title: 'General Biology Lab', credits: 1 } }]);
    expect(findCourse(curriculum, 'BIOL 128')).toMatchObject([{ kind: 'required', blockId: 'science-math', course: { code: 'BIOL 128', credits: 1 } }]);
    expect(findCourse(curriculum, 'eng 140')).toEqual([{ kind: 'pick', blockId: 'composition', course: { code: 'ENG 140', title: 'English Composition Honors I', credits: 3 } }]);
    expect(findCourse(curriculum, 'fin201')).toEqual([{ kind: 'named-elective', course: { code: 'FIN 201', title: 'Personal Finance', credits: 3 } }]);
    expect(findCourse(curriculum, 'FLS 161')).toEqual([{ kind: 'legacy-elective', course: { code: 'FLS 161', title: 'Spanish I', credits: 3 } }]);
    expect(normalizeCode(' cis-206 ')).toBe('CIS 206');
  });

  it('finds both places of a course listed twice', () => {
    expect(findCourse(curriculum, 'PSY 251')).toEqual([
      { kind: 'pick', blockId: 'social-sciences', course: { code: 'PSY 251', title: 'General Psychology', credits: 3 } },
      { kind: 'legacy-elective', course: { code: 'PSY 251', title: 'General Psychology', credits: 3 } },
    ]);
  });

  it('finds nothing for a code that is not listed', () => {
    // BIO 230 is in no list. MKT 410 is in no list either; whether it counts by the
    // elective rule is not decided here.
    for (const typed of ['BIO 230', 'MKT 410', 'CIS 304', '', 'MGT', '321', 'MGT 32', 'MGT 3210', 'management', 'M 321']) {
      expect(findCourse(curriculum, typed), JSON.stringify(typed)).toEqual([]);
    }
    for (const typed of ['', 'MGT', '321', 'MGT 32', 'management']) expect(normalizeCode(typed), JSON.stringify(typed)).toBe(null);
  });
});
