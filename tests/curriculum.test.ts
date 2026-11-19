// F02: the curriculum is data (docs/sprints/F02.md, docs/BRIEF.md §5, owner answers of
// 2026-11-15). These tests run against the real data file on every `npm test`, so an edit
// that breaks a rule fails CI. The expected table is the brief's own, read from
// docs/BRIEF.md (F25): the data file must equal the approved statement of the curriculum.
// It is not derived from the data file.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import rawData from '../docs/curriculum/provisional-current.json';
import madeUp from './fixtures/made-up-program.json';
import { briefCourses, briefTable } from './brief';
import { CurriculumError, curriculum, findCourse, loadCurriculum, normalizeCode, programs } from '../src/curriculum';

const repo = join(import.meta.dirname, '..');
// Every file of the app that can hold text shown to a student: all of src/, the page that
// loads it, and public/ if there is one.
const sourceFiles = (dir: string): string[] =>
  !existsSync(dir) ? [] : readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : /\.(tsx?|jsx?|css|json|html|svg|txt|md)$/.test(entry.name) ? [join(dir, entry.name)] : []);
const sources = [...sourceFiles(join(repo, 'src')), join(repo, 'index.html'), ...sourceFiles(join(repo, 'public'))]
  .map(file => ({ file, text: readFileSync(file, 'utf8') }));
// The one file that may name course codes, and only codes (tests/start.test.ts checks that).
const EXAMPLES = join(repo, 'src', 'examples.json');

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
/** Every value stored under `key`, at any depth. */
const keyed = (value: unknown, key: string): unknown[] =>
  Array.isArray(value) ? value.flatMap(child => keyed(child, key))
    : value && typeof value === 'object' ? Object.entries(value).flatMap(([name, child]) => (name === key ? [child] : keyed(child, key))) : [];
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

const codes = (list: readonly { code: string }[]): string[] => list.map(course => course.code).sort();

describe('the curriculum comes from the data file', () => {
  it('builds the curriculum from the data file', () => {
    expect(curriculum).toEqual(loadCurriculum(rawData));
    expect(curriculum.id).toBe(rawData.id);
    expect(readFileSync(join(repo, 'src', 'curriculum.ts'), 'utf8')).toContain("from '../docs/curriculum/provisional-current.json'");
  });

  it('keeps curriculum facts out of the code', () => {
    expect(sources.length).toBeGreaterThan(8);
    for (const needed of ['curriculum.ts', 'start.ts', 'style.css', 'examples.json', 'index.html']) expect(sources.map(one => one.file).filter(name => name.endsWith(needed)), needed).toHaveLength(1);
    const blockNames = rawData.blocks.map(block => block.name);
    const titles = [...new Set(textsOf([rawData.blocks, rawData.electives.namedCourses, rawData.electives.legacyOnlyCourses].map(part => keyed(part, 'title'))))].filter(title => title.length > 0);
    expect(titles.length).toBeGreaterThan(50);
    for (const { file, text } of sources) {
      // In capitals or not, and with a letter after the number (a lab section, say).
      if (file !== EXAMPLES) expect(text.match(/\b[A-Z]{2,4}[ -]?\d{3}[A-Z]?\b/gi) ?? [], `${file}: text shaped like a course code`).toEqual([]);
      expect(titles.filter(title => text.includes(title) || text.includes(title.replace(/&/g, '&amp;'))), `${file}: a course title`).toEqual([]);
      // A stylesheet is full of numbers and words that are sizes and names, not facts.
      if (file.endsWith('.css')) continue;
      // Exact and case-sensitive, and not inside a longer word (CompositionEvent is fine).
      const named = (name: string): boolean => new RegExp(`(?<![A-Za-z])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`).test(text);
      expect(blockNames.filter(named), `${file}: a block name`).toEqual([]);
      expect(text.match(/\b121\b|\b42\b/g) ?? [], `${file}: the degree or core credit total`).toEqual([]);
    }
  });

  it('recognises a block name in code only as a whole word', () => {
    const named = (name: string, text: string): boolean => new RegExp(`(?<![A-Za-z])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`).test(text);
    expect(named('Composition', 'input.addEventListener("compositionend", (e: CompositionEvent) => {})')).toBe(false);
    expect(named('Orientation', 'screen.orientation; ScreenOrientation')).toBe(false);
    expect(named('Composition', 'const label = "Composition";')).toBe(true);
    expect(named('Major (CIS)', 'title: "Major (CIS)"')).toBe(true);
  });

  it('cannot be changed once loaded', () => {
    const place = findCourse(curriculum, 'MGT 321')[0];
    expect(place).toBeDefined();
    expect(() => { (place as { course: { title: string } }).course.title = 'changed'; }).toThrow(TypeError);
    expect(() => { (curriculum.blocks as unknown[]).push({}); }).toThrow(TypeError);
    expect(() => { (curriculum.blocks[6]?.required as unknown[]).reverse(); }).toThrow(TypeError);
    expect(() => { (curriculum as { degreeCredits: number }).degreeCredits = 1; }).toThrow(TypeError);
    expect(() => { (findCourse(curriculum, 'PSY 251') as unknown[]).pop(); }).toThrow(TypeError);
    expect(() => { (programs as unknown[]).push({}); }).toThrow(TypeError);
    // Removing an exception would make that course count.
    expect(() => { (curriculum.electives.except as string[]).splice(0, 1); }).toThrow(TypeError);
    expect(Object.isFrozen(loadCurriculum(madeUp).electives.subjects)).toBe(true);
    expect(findCourse(curriculum, 'MGT 321')[0]?.course.title).toBe('Principles of Management');
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
    expect(other.electives.except).toEqual(['XC 350']);
    // It is a test fixture only: it is not one of the app's majors.
    expect(programs.map(program => program.id)).not.toContain(other.id);
    expect(findCourse(curriculum, 'XAA 101')).toEqual([]);
  });
});

describe('the curriculum matches brief section 5', () => {
  // Brief §5, read from docs/BRIEF.md itself (tests/brief.ts). Order of blocks matters; order of courses does not.
  const brief = briefTable();

  it('matches the table in brief section 5', () => {
    // The table as approved has eight blocks and the electives; a table that lost its rows proves nothing.
    expect(brief.blocks.length).toBeGreaterThanOrEqual(8);
    expect(curriculum.blocks.map(block => [block.name, block.credits])).toEqual(brief.blocks.map(block => [block.name, block.credits]));
    curriculum.blocks.forEach((block, i) => {
      const { name, required, picks } = brief.blocks[i] ?? { name: '', required: [], picks: [] };
      expect(codes(block.required), `${name}: required`).toEqual([...required].sort());
      expect(block.picks.map(group => group.choose), `${name}: how many of each group`).toEqual(picks.map(group => group.choose));
      expect(block.picks.map(group => codes(group.courses)), `${name}: picks`).toEqual(picks.map(group => [...group.courses].sort()));
    });
    expect([curriculum.electives.name, curriculum.electives.credits, curriculum.electives.courseCount]).toEqual([brief.electives.name, brief.electives.credits, brief.electives.courses]);
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
    // As many as the brief's table names in its blocks, and the named electives (brief §5: FIN 201).
    expect(briefCourses(brief).length, 'the brief\'s table names no course at all').toBeGreaterThan(0);
    expect(listed).toHaveLength(briefCourses(brief).length + curriculum.electives.named.length);
    expect(curriculum.electives.named.map(course => course.code)).toEqual(['FIN 201']);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('carries the elective rule and the legacy-only courses', () => {
    const { electives } = curriculum;
    expect(electives.named).toEqual([{ code: 'FIN 201', title: 'Personal Finance', credits: 3 }]);
    expect([...electives.subjects].sort()).toEqual(['ACT', 'CIS', 'ECO', 'FIN', 'MGT', 'MKT']);
    expect([electives.minNumber, electives.maxNumber, electives.creditsPerCourse]).toEqual([300, 499, 3]);
    expect(electives.excludeRequired).toBe(true);
    // Two courses match the rule but never count (owner, 2026-11-16).
    expect(electives.except).toEqual(['CIS 304', 'CIS 415']);
    expect(electives.legacyOnly).toEqual([
      { code: 'PSY 251', title: 'General Psychology', credits: 3 },
      { code: 'FLS 161', title: 'Spanish I', credits: 3 },
      { code: 'MGT 220', title: 'Systems Approach to Business', credits: 3 },
      { code: 'MGT 203', title: 'Special Topics: Business Communications', credits: 3 },
    ]);
  });

  it('names the final-semester course', () => {
    // The brief (§4 Flow B step 5): "MGT 462 Business Policies in the final semester". It is written in the file, not in the code.
    expect(rawData.finalSemesterCourse).toBe('MGT-462');
    expect(curriculum.finalSemester).toBe('MGT 462');
    expect(findCourse(curriculum, curriculum.finalSemester ?? '').map(place => [place.kind, place.course.title])).toEqual([['required', 'Business Policies']]);
    // Another program names its own; a program may name none.
    expect(loadCurriculum(madeUp).finalSemester).toBe('XBBB 202');
    const without = copy();
    delete without.finalSemesterCourse;
    expect(loadCurriculum(without).finalSemester).toBeNull();
    // It must be a course code, and a required course of a block: not a pick, an elective or a course that is nowhere.
    expect(broken(data => { data.finalSemesterCourse = 'MGT 462'; })).toThrow(/finalSemesterCourse \(MGT 462\): must be 2 to 4 capital letters, a hyphen and 3 digits/);
    expect(broken(data => { data.finalSemesterCourse = null; })).toThrow(/finalSemesterCourse/);
    for (const other of ['ENG-131', 'FIN-201', 'ZZZ-999', 'FLS-161']) {
      expect(broken(data => { data.finalSemesterCourse = other; }), other).toThrow(new RegExp(`finalSemesterCourse \\(${other}\\): is not a required course of any block`));
    }
  });

  it('carries the last-reviewed date', () => {
    // The owner, 2026-11-16: "I reviewed the curriculum on 2026-11-15. Store it in the curriculum file".
    expect(rawData.lastReviewed).toBe('2026-11-18');
    expect(curriculum.lastReviewed).toBe('2026-11-18');
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
    // Owner, 2026-11-16: the two courses are named in one place only, as exceptions to the
    // elective rule, so that they never count. They are not courses of the curriculum.
    expect(rawData.electives.subjectRule.exceptCourses).toEqual(['CIS-304', 'CIS-415']);
    const rest = structuredClone(rawData) as { electives: { subjectRule: { exceptCourses?: string[] } } };
    delete rest.electives.subjectRule.exceptCourses;
    for (const value of [...keysOf(rest), ...textsOf(rest)]) expect(value).not.toMatch(REMOVED);
    expect(curriculum.electives.except).toEqual(['CIS 304', 'CIS 415']);
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

  it('refuses something that is not a data file at all', () => {
    for (const notAFile of [null, undefined, [], 'text', 7]) expect(() => loadCurriculum(notAFile), JSON.stringify(notAFile)).toThrow(/Curriculum data: the file: must be an object/);
    expect(() => loadCurriculum(null)).toThrow(CurriculumError);
  });

  it('refuses a data file with a different schema version', () => {
    expect(broken(data => { data.schemaVersion = 3; })).toThrow(/schemaVersion/);
    expect(broken(data => { data.schemaVersion = 3; })).toThrow(CurriculumError);
  });

  it('refuses a data file with a missing field', () => {
    // Every line of the file is needed, but one: a program may name no final-semester course.
    for (const key of Object.keys(rawData).filter(one => one !== 'finalSemesterCourse')) {
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
    expect(broken(data => { blocksOf(data)[3]!.id = 'humanities'; })).toThrow(/blocks\[3\] \(humanities\): the same block id is listed twice/);
    expect(broken(data => { (blocksOf(data)[3] as unknown as { name: string }).name = 'Humanities'; })).toThrow(/blocks\[3\] \(Humanities\): the same block name is listed twice/);
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
    expect(broken(data => { blocksOf(data)[7]!.required[0]!.courseId = 'MGT-321'; })).toThrow(/MGT-321: the same course is listed twice: in blocks\[6\] \(business-core\) and in blocks\[7\] \(major\)/);
    expect(broken(data => { (part(data, 'electives').namedCourses as { [key: string]: Json }[])[0]!.courseId = 'CIS-205'; })).toThrow(/CIS-205: the same course is listed twice: in blocks\[5\] \(pre-professional\) and in electives\.namedCourses/);
    // A legacy-only elective may also be a pick in a block, as PSY 251 is.
    expect(findCourse(curriculum, 'PSY 251')).toHaveLength(2);
  });

  it('refuses a data file whose legacy-only list contradicts the rest', () => {
    const legacy = (data: ReturnType<typeof copy>) => part(data, 'electives').legacyOnlyCourses as { [key: string]: Json }[];
    // Twice in the legacy list.
    expect(broken(data => { legacy(data)[2]!.courseId = 'FLS-161'; })).toThrow(/FLS-161: the same course is listed twice: in electives\.legacyOnlyCourses and in electives\.legacyOnlyCourses/);
    // Twice in the legacy list when the course is also a pick: the pick is the one allowed
    // overlap, and it does not excuse a second legacy entry.
    expect(broken(data => { legacy(data).push({ courseId: 'PSY-251', title: 'General Psychology', credits: 3 }); })).toThrow(/PSY-251: the same course is listed twice: in electives\.legacyOnlyCourses and in electives\.legacyOnlyCourses/);
    // A second pick that is also a legacy-only elective is fine when both entries agree.
    expect(broken(data => { legacy(data).push({ courseId: 'SOC-110', title: 'Introduction to Sociology', credits: 3 }); })).not.toThrow();
    // The same as the named elective, or as a required course.
    expect(broken(data => { legacy(data)[1]!.courseId = 'FIN-201'; })).toThrow(/FIN-201: the same course is listed twice: in electives\.namedCourses and in electives\.legacyOnlyCourses/);
    expect(broken(data => { legacy(data)[1]!.courseId = 'MGT-321'; })).toThrow(/MGT-321: the same course is listed twice: in blocks\[6\] \(business-core\) and in electives\.legacyOnlyCourses/);
    // The same as a pick is allowed, but only if both entries agree.
    expect(broken(data => { legacy(data)[0]!.title = 'Psychology'; })).toThrow(/PSY-251: has a different title or credits in blocks\[3\] \(social-sciences\) and in electives\.legacyOnlyCourses/);
  });

  it('refuses a data file with an elective that is not worth the elective credits', () => {
    expect(broken(data => { (part(data, 'electives').namedCourses as { [key: string]: Json }[])[0]!.credits = 4; })).toThrow(/electives\.namedCourses\[0\] \(FIN-201\)\.credits: is 4 but an elective is 3 credits/);
    expect(broken(data => { (part(data, 'electives').legacyOnlyCourses as { [key: string]: Json }[])[1]!.credits = 1; })).toThrow(/electives\.legacyOnlyCourses\[1\] \(FLS-161\)\.credits: is 1 but an elective is 3 credits/);
  });

  it('refuses a data file whose total is not the degree credits', () => {
    expect(broken(data => { data.degreeCredits = 120; })).toThrow(/degreeCredits: is 120 but the blocks and electives add up to 121/);
  });

  it('refuses a data file with an elective rule that does not add up', () => {
    expect(broken(data => { part(data, 'electives').credits = 12; })).toThrow(/electives\.credits: is 12 but 3 courses of 3 credits is 9/);
    expect(broken(data => { (part(data, 'electives').subjectRule as { [key: string]: Json }).minCourseNumber = 500; })).toThrow(/electives\.subjectRule\.minCourseNumber: is above maxCourseNumber/);
    expect(broken(data => { ((part(data, 'electives').subjectRule as { [key: string]: Json }).prefixes as Json[])[0] = 'mgt'; })).toThrow(/prefixes\[0\] \(mgt\): must be 2 to 4 capital letters/);
    const rule = (data: ReturnType<typeof copy>) => part(data, 'electives').subjectRule as { [key: string]: Json };
    expect(broken(data => { rule(data).prefixes = []; })).toThrow(/electives\.subjectRule\.prefixes: must list at least one subject/);
    // "Not already required" is not optional: a course listed in a block is never also an elective.
    for (const bad of [false, 'true', null]) expect(broken(data => { part(data, 'electives').excludeRequiredCourses = bad; }), String(bad)).toThrow(/electives\.excludeRequiredCourses: must be true/);
    expect(broken(data => { (rule(data).prefixes as Json[])[1] = 'MGT'; })).toThrow(/prefixes\[1\] \(MGT\): the same subject is listed twice/);
    expect(broken(data => { rule(data).maxCourseNumber = 4999; })).toThrow(/electives\.subjectRule\.maxCourseNumber: must be a three-digit course number/);
    expect(broken(data => { rule(data).minCourseNumber = 30; })).toThrow(/electives\.subjectRule\.minCourseNumber: must be a three-digit course number/);
  });

  it('refuses a data file whose exceptions to the elective rule make no sense', () => {
    const rule = (data: ReturnType<typeof copy>) => part(data, 'electives').subjectRule as { [key: string]: Json };
    expect(broken(data => { delete rule(data).exceptCourses; })).toThrow(/electives\.subjectRule\.exceptCourses: missing/);
    expect(broken(data => { rule(data).exceptCourses = 'CIS-304'; })).toThrow(/electives\.subjectRule\.exceptCourses: must be a list/);
    expect(broken(data => { (rule(data).exceptCourses as Json[])[0] = 'CIS304'; })).toThrow(/exceptCourses\[0\] \(CIS304\): must be 2 to 4 capital letters, a hyphen and 3 digits/);
    expect(broken(data => { (rule(data).exceptCourses as Json[]).push('CIS-304'); })).toThrow(/exceptCourses\[2\] \(CIS-304\): the same course is listed twice/);
    // An exception is only for a course the rule would otherwise let in...
    expect(broken(data => { (rule(data).exceptCourses as Json[])[0] = 'BIO-230'; })).toThrow(/exceptCourses\[0\] \(BIO-230\): does not match the elective rule/);
    expect(broken(data => { (rule(data).exceptCourses as Json[])[0] = 'CIS-250'; })).toThrow(/exceptCourses\[0\] \(CIS-250\): does not match the elective rule/);
    // ...and never for a course the curriculum lists.
    expect(broken(data => { (rule(data).exceptCourses as Json[])[0] = 'MGT-321'; })).toThrow(/exceptCourses\[0\] \(MGT-321\): never counts, but is also listed in blocks\[6\] \(business-core\)/);
    // An empty list is fine: a program may have no exceptions.
    expect(broken(data => { rule(data).exceptCourses = []; })).not.toThrow();
  });

  it('refuses a data file whose sequence does not sit inside the core blocks', () => {
    expect(broken(data => { (part(data, 'sequence').coreBlocks as Json[])[1] = 'writing'; })).toThrow(/sequence\.coreBlocks\[1\] \(writing\): is not a block/);
    expect(broken(data => { part(data, 'sequence').coreCredits = 40; })).toThrow(/sequence\.coreCredits: is 40 but the core blocks add up to 42/);
    expect(broken(data => { ((part(data, 'sequence').alternatives as { courses: Json[] }[])[0]!.courses)[1] = 'MGT-321'; })).toThrow(/history: MGT-321\): is not a course in a core block/);
    expect(broken(data => { ((part(data, 'sequence').alternatives as { courses: Json[] }[])[1]!.courses)[1] = 'ENG-999'; })).toThrow(/literature: ENG-999\): is not a course in a core block/);
  });

  it('refuses a data file with a sequence that is empty, repeats itself or is listed twice', () => {
    const alternatives = (data: ReturnType<typeof copy>) => part(data, 'sequence').alternatives as { id: Json; courses: Json[] }[];
    // An empty sequence would always be complete.
    expect(broken(data => { alternatives(data)[0]!.courses = []; })).toThrow(/sequence\.alternatives\[0\] \(history\)\.courses: a sequence needs at least two courses/);
    expect(broken(data => { alternatives(data)[0]!.courses = ['HIS-131']; })).toThrow(/history\)\.courses: a sequence needs at least two courses/);
    expect(broken(data => { alternatives(data)[0]!.courses = ['HIS-131', 'HIS-131']; })).toThrow(/history\)\.courses\[1\] \(HIS-131\): the same course is listed twice/);
    expect(broken(data => { alternatives(data)[1]!.id = 'history'; })).toThrow(/sequence\.alternatives\[1\] \(history\): the same sequence id is listed twice/);
    expect(broken(data => { (part(data, 'sequence').coreBlocks as Json[]).push('orientation'); })).toThrow(/sequence\.coreBlocks\[5\] \(orientation\): the same block is listed twice/);
  });

  it('refuses a data file whose lowest counting grade is not one of its letters', () => {
    expect(broken(data => { part(data, 'grades').minimumCounting = 'C-'; })).toThrow(/grades\.minimumCounting: "C-" is not one of the letters/);
  });

  it('refuses a data file whose grade scale repeats or contradicts itself', () => {
    expect(broken(data => { (part(data, 'grades').letters as Json[]).push('A'); })).toThrow(/grades\.letters\[5\] \(A\): the same grade is listed twice/);
    // A mark cannot both be a grade that may count and a mark that never counts.
    expect(broken(data => { (part(data, 'grades').neverCounting as Json[]).push('C'); })).toThrow(/grades\.neverCounting\[2\] \(C\): is also one of the letters/);
    expect(broken(data => { part(data, 'grades').letters = []; })).toThrow(/grades\.letters: must list at least one grade/);
    // The letters are listed best first; the real file's order is pinned here.
    expect(curriculum.grades.letters).toEqual(['A', 'B', 'C', 'D', 'F']);
  });

  it('refuses a data file with a last-reviewed value that is not a date', () => {
    for (const bad of ['Nov 2026', '2026-13-01', '2026-02-30', '2026-11', 20261115, '', '0000-01-01', '1999-12-31']) {
      expect(broken(data => { data.lastReviewed = bad; }), String(bad)).toThrow(/lastReviewed: must be null or a date written YYYY-MM-DD/);
    }
    expect(loadCurriculum({ ...copy(), lastReviewed: '2026-11-15' }).lastReviewed).toBe('2026-11-15');
  });
});

describe('looking a course up', () => {
  it('finds a course by code however it is typed', () => {
    const management = [{ kind: 'required', blockId: 'business-core', course: { code: 'MGT 321', title: 'Principles of Management', credits: 3 } }];
    for (const typed of ['MGT 321', 'mgt321', 'MGT-321', ' Mgt 321 ', 'mgt  321', 'MGT\t321', 'MGT\u00A0321']) expect(findCourse(curriculum, typed), typed).toEqual(management);
    // What a phone's autocorrect or a pasted PDF produces: other dashes, full-width
    // characters, and characters that take no room.
    const pasted = { 'en dash': 'MGT\u2013321', 'em dash': 'MGT\u2014321', 'non-breaking hyphen': 'MGT\u2011321', 'minus sign': 'MGT\u2212321', 'small hyphen': 'MGT\uFE63321', 'full-width hyphen': 'MGT\uFF0D321', 'zero-width space': '\u200BMGT 321', 'soft hyphen': 'MGT\u00AD321', 'byte-order mark': '\uFEFFMGT 321', 'full-width letters': '\uFF2D\uFF27\uFF34\uFF13\uFF12\uFF11' };
    for (const [what, typed] of Object.entries(pasted)) {
      expect(typed, what).not.toBe('MGT-321');
      expect(normalizeCode(typed), what).toBe('MGT 321');
      expect(findCourse(curriculum, typed), what).toEqual(management);
    }
    expect(findCourse(curriculum, 'biol127')).toEqual([{ kind: 'required', blockId: 'science-math', course: { code: 'BIOL 127', title: 'General Biology Lab', credits: 1 } }]);
    expect(findCourse(curriculum, 'BIOL 128')).toMatchObject([{ kind: 'required', blockId: 'science-math', course: { code: 'BIOL 128', credits: 1 } }]);
    expect(findCourse(curriculum, 'eng 140')).toEqual([{ kind: 'pick', blockId: 'composition', group: 0, course: { code: 'ENG 140', title: 'English Composition Honors I', credits: 3 } }]);
    // A block can have two pick groups; the place says which one a course belongs to.
    expect(findCourse(curriculum, 'ENG 131')).toMatchObject([{ kind: 'pick', blockId: 'composition', group: 0 }]);
    expect(findCourse(curriculum, 'ENG 132')).toMatchObject([{ kind: 'pick', blockId: 'composition', group: 1 }]);
    expect(findCourse(curriculum, 'ENG 141')).toMatchObject([{ kind: 'pick', blockId: 'composition', group: 1 }]);
    expect(findCourse(curriculum, 'MUS 121')).toMatchObject([{ kind: 'pick', blockId: 'humanities', group: 0 }]);
    expect(findCourse(curriculum, 'PHL 201')).toMatchObject([{ kind: 'pick', blockId: 'humanities', group: 1 }]);
    expect(findCourse(curriculum, 'fin201')).toEqual([{ kind: 'named-elective', course: { code: 'FIN 201', title: 'Personal Finance', credits: 3 } }]);
    expect(findCourse(curriculum, 'FLS 161')).toEqual([{ kind: 'legacy-elective', course: { code: 'FLS 161', title: 'Spanish I', credits: 3 } }]);
    expect(normalizeCode(' cis-206 ')).toBe('CIS 206');
  });

  it('finds both places of a course listed twice', () => {
    expect(findCourse(curriculum, 'PSY 251')).toEqual([
      { kind: 'pick', blockId: 'social-sciences', group: 0, course: { code: 'PSY 251', title: 'General Psychology', credits: 3 } },
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
