// The curriculum as the app uses it. Every academic fact (courses, blocks, credits, the
// elective rule, the sequence, the grade scale) comes from the data file; nothing of the
// kind is written here. `loadCurriculum` checks a raw data object against schema version 2
// and refuses it, naming the bad item, if anything is missing, unknown or does not add up.
import cisData from '../docs/curriculum/provisional-current.json';

export interface Course {
  /** Subject letters, a space, three digits: the way a student reads it. */
  code: string;
  title: string;
  credits: number;
}

/** "Choose N of these courses." */
export interface PickGroup {
  choose: number;
  courses: Course[];
}

export interface Block {
  id: string;
  name: string;
  credits: number;
  required: Course[];
  picks: PickGroup[];
}

export interface Electives {
  id: string;
  name: string;
  credits: number;
  courseCount: number;
  /** Courses that are electives by name. */
  named: Course[];
  /** Any course with one of these subjects and a number in this range is an elective. */
  subjects: string[];
  minNumber: number;
  maxNumber: number;
  creditsPerCourse: number;
  /** A course that is already required somewhere is not also an elective. */
  excludeRequired: boolean;
  /** Electives only for legacy students. */
  legacyOnly: Course[];
}

export interface SequenceAlternative {
  id: string;
  name: string;
  courses: string[];
}

export interface Sequence {
  choose: number;
  alternatives: SequenceAlternative[];
  additionalCredits: number;
  coreBlockIds: string[];
  coreCredits: number;
}

export interface Grades {
  letters: string[];
  minimumCounting: string;
  neverCounting: string[];
}

export interface Curriculum {
  id: string;
  institution: string;
  program: string;
  degreeCredits: number;
  /** YYYY-MM-DD, or null until the owner gives the date of the last review. */
  lastReviewed: string | null;
  grades: Grades;
  blocks: Block[];
  sequence: Sequence;
  electives: Electives;
}

export interface Program {
  id: string;
  name: string;
  curriculum: Curriculum;
}

/** Where a course is listed in a curriculum. */
export type Place =
  | { kind: 'required' | 'pick'; blockId: string; course: Course }
  | { kind: 'named-elective' | 'legacy-elective'; course: Course };

export class CurriculumError extends Error {
  constructor(path: string, problem: string) {
    super(`Curriculum data: ${path}: ${problem}`);
    this.name = 'CurriculumError';
  }
}

const SCHEMA_VERSION = 2;
const DATA_CODE = /^[A-Z]{2,4}-\d{3}$/;
const SUBJECT = /^[A-Z]{2,4}$/;

function fail(path: string, problem: string): never {
  throw new CurriculumError(path, problem);
}

/** An object with exactly these fields: none missing, none unknown. */
function fields<K extends string>(value: unknown, path: string, keys: readonly K[]): Record<K, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'must be an object');
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) {
    if (!(keys as readonly string[]).includes(key)) fail(path ? `${path}.${key}` : key, 'unknown field');
  }
  for (const key of keys) {
    if (!(key in object)) fail(path ? `${path}.${key}` : key, 'missing');
  }
  return object as Record<K, unknown>;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(path, 'must be text');
  return value as string;
}

function positiveWhole(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) fail(path, 'must be a positive whole number');
  return value as number;
}

function wholeFromZero(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) fail(path, 'must be a whole number, zero or more');
  return value as number;
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'must be a list');
  return value as unknown[];
}

function texts(value: unknown, path: string): string[] {
  return list(value, path).map((item, i) => text(item, `${path}[${i}]`));
}

function dataCode(value: unknown, path: string): string {
  const id = text(value, path);
  if (!DATA_CODE.test(id)) fail(`${path} (${id})`, 'must be 2 to 4 capital letters, a hyphen and 3 digits');
  return id;
}

const readable = (id: string): string => id.replace('-', ' ');

function course(value: unknown, path: string): Course {
  const raw = fields(value, path, ['courseId', 'title', 'credits']);
  const id = dataCode(raw.courseId, `${path}.courseId`);
  const where = `${path} (${id})`;
  return { code: readable(id), title: text(raw.title, `${where}.title`), credits: positiveWhole(raw.credits, `${where}.credits`) };
}

function courses(value: unknown, path: string): Course[] {
  return list(value, path).map((item, i) => course(item, `${path}[${i}]`));
}

const sum = (numbers: number[]): number => numbers.reduce((total, n) => total + n, 0);

function pickGroup(value: unknown, path: string): PickGroup {
  const raw = fields(value, path, ['choose', 'courses']);
  const group = { choose: positiveWhole(raw.choose, `${path}.choose`), courses: courses(raw.courses, `${path}.courses`) };
  if (group.choose > group.courses.length) fail(`${path}.choose`, `asks for ${group.choose} of ${group.courses.length} courses`);
  if (new Set(group.courses.map(c => c.credits)).size > 1) fail(`${path}.courses`, 'courses in one pick group must have the same credits');
  return group;
}

function block(value: unknown, path: string): Block {
  const raw = fields(value, path, ['id', 'name', 'credits', 'required', 'choices']);
  const id = text(raw.id, `${path}.id`);
  const where = `${path} (${id})`;
  const result: Block = {
    id,
    name: text(raw.name, `${where}.name`),
    credits: positiveWhole(raw.credits, `${where}.credits`),
    required: courses(raw.required, `${where}.required`),
    picks: list(raw.choices, `${where}.choices`).map((item, i) => pickGroup(item, `${where}.choices[${i}]`)),
  };
  const listed = sum(result.required.map(c => c.credits)) + sum(result.picks.map(group => group.choose * (group.courses[0]?.credits ?? 0)));
  if (listed !== result.credits) fail(`${where}.credits`, `is ${result.credits} but its courses add up to ${listed}`);
  return result;
}

function grades(value: unknown, path: string): Grades {
  const raw = fields(value, path, ['letters', 'minimumCounting', 'neverCounting']);
  const result = {
    letters: texts(raw.letters, `${path}.letters`),
    minimumCounting: text(raw.minimumCounting, `${path}.minimumCounting`),
    neverCounting: texts(raw.neverCounting, `${path}.neverCounting`),
  };
  if (result.letters.length === 0) fail(`${path}.letters`, 'must list at least one grade');
  if (!result.letters.includes(result.minimumCounting)) fail(`${path}.minimumCounting`, `"${result.minimumCounting}" is not one of the letters`);
  return result;
}

function electives(value: unknown, path: string): Electives {
  const raw = fields(value, path, ['id', 'name', 'credits', 'courseCount', 'namedCourses', 'subjectRule', 'excludeRequiredCourses', 'legacyOnlyCourses']);
  const rule = fields(raw.subjectRule, `${path}.subjectRule`, ['prefixes', 'minCourseNumber', 'maxCourseNumber', 'creditsPerCourse']);
  if (typeof raw.excludeRequiredCourses !== 'boolean') fail(`${path}.excludeRequiredCourses`, 'must be true or false');
  const result: Electives = {
    id: text(raw.id, `${path}.id`),
    name: text(raw.name, `${path}.name`),
    credits: positiveWhole(raw.credits, `${path}.credits`),
    courseCount: positiveWhole(raw.courseCount, `${path}.courseCount`),
    named: courses(raw.namedCourses, `${path}.namedCourses`),
    subjects: texts(rule.prefixes, `${path}.subjectRule.prefixes`),
    minNumber: positiveWhole(rule.minCourseNumber, `${path}.subjectRule.minCourseNumber`),
    maxNumber: positiveWhole(rule.maxCourseNumber, `${path}.subjectRule.maxCourseNumber`),
    creditsPerCourse: positiveWhole(rule.creditsPerCourse, `${path}.subjectRule.creditsPerCourse`),
    excludeRequired: raw.excludeRequiredCourses as boolean,
    legacyOnly: courses(raw.legacyOnlyCourses, `${path}.legacyOnlyCourses`),
  };
  result.subjects.forEach((subject, i) => {
    if (!SUBJECT.test(subject)) fail(`${path}.subjectRule.prefixes[${i}] (${subject})`, 'must be 2 to 4 capital letters');
  });
  if (result.minNumber > result.maxNumber) fail(`${path}.subjectRule.minCourseNumber`, 'is above maxCourseNumber');
  if (result.credits !== result.courseCount * result.creditsPerCourse) {
    fail(`${path}.credits`, `is ${result.credits} but ${result.courseCount} courses of ${result.creditsPerCourse} credits is ${result.courseCount * result.creditsPerCourse}`);
  }
  return result;
}

function sequence(value: unknown, path: string, blocks: Block[]): Sequence {
  const raw = fields(value, path, ['choose', 'alternatives', 'additionalCredits', 'coreBlocks', 'coreCredits']);
  const result: Sequence = {
    choose: positiveWhole(raw.choose, `${path}.choose`),
    alternatives: list(raw.alternatives, `${path}.alternatives`).map((item, i) => {
      const at = `${path}.alternatives[${i}]`;
      const alternative = fields(item, at, ['id', 'name', 'courses']);
      return {
        id: text(alternative.id, `${at}.id`),
        name: text(alternative.name, `${at}.name`),
        courses: list(alternative.courses, `${at}.courses`).map((code, j) => readable(dataCode(code, `${at}.courses[${j}]`))),
      };
    }),
    additionalCredits: wholeFromZero(raw.additionalCredits, `${path}.additionalCredits`),
    coreBlockIds: texts(raw.coreBlocks, `${path}.coreBlocks`),
    coreCredits: positiveWhole(raw.coreCredits, `${path}.coreCredits`),
  };
  if (result.choose > result.alternatives.length) fail(`${path}.choose`, `asks for ${result.choose} of ${result.alternatives.length} sequences`);

  const core = result.coreBlockIds.map((id, i) => blocks.find(b => b.id === id) ?? fail(`${path}.coreBlocks[${i}] (${id})`, 'is not a block'));
  const coreTotal = sum(core.map(b => b.credits));
  if (coreTotal !== result.coreCredits) fail(`${path}.coreCredits`, `is ${result.coreCredits} but the core blocks add up to ${coreTotal}`);
  const inCore = new Set(core.flatMap(b => [...b.required, ...b.picks.flatMap(group => group.courses)]).map(c => c.code));
  for (const alternative of result.alternatives) {
    for (const code of alternative.courses) {
      if (!inCore.has(code)) fail(`${path}.alternatives (${alternative.id}: ${code.replace(' ', '-')})`, 'is not a course in a core block');
    }
  }
  return result;
}

function reviewDate(value: unknown, path: string): string | null {
  if (value === null) return null;
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail(path, 'must be null or a date written YYYY-MM-DD');
  return value as string;
}

/** Checks a raw data object and returns the curriculum, or throws a CurriculumError. */
export function loadCurriculum(data: unknown): Curriculum {
  const raw = fields(data, '', ['schemaVersion', 'id', 'institution', 'program', 'degreeCredits', 'lastReviewed', 'sources', 'grades', 'blocks', 'sequence', 'electives']);
  if (raw.schemaVersion !== SCHEMA_VERSION) fail('schemaVersion', `must be ${SCHEMA_VERSION}`);
  list(raw.sources, 'sources').forEach((item, i) => {
    const source = fields(item, `sources[${i}]`, ['id', 'description']);
    text(source.id, `sources[${i}].id`);
    text(source.description, `sources[${i}].description`);
  });

  const blocks = list(raw.blocks, 'blocks').map((item, i) => block(item, `blocks[${i}]`));
  blocks.forEach((b, i) => {
    if (blocks.findIndex(other => other.id === b.id) !== i) fail(`blocks[${i}] (${b.id})`, 'the same block id is used twice');
  });

  const curriculum: Curriculum = {
    id: text(raw.id, 'id'),
    institution: text(raw.institution, 'institution'),
    program: text(raw.program, 'program'),
    degreeCredits: positiveWhole(raw.degreeCredits, 'degreeCredits'),
    lastReviewed: reviewDate(raw.lastReviewed, 'lastReviewed'),
    grades: grades(raw.grades, 'grades'),
    blocks,
    sequence: sequence(raw.sequence, 'sequence', blocks),
    electives: electives(raw.electives, 'electives'),
  };

  // A course fills one requirement, so it is listed once. A legacy-only elective may also
  // be a pick in a block: for a legacy student it can go either way (decided when placing).
  const seen = new Set<string>();
  const listedOnce = [...blocks.flatMap(b => [...b.required, ...b.picks.flatMap(group => group.courses)]), ...curriculum.electives.named];
  for (const c of listedOnce) {
    if (seen.has(c.code)) fail(c.code.replace(' ', '-'), 'the same course is listed twice');
    seen.add(c.code);
  }

  const total = sum(blocks.map(b => b.credits)) + curriculum.electives.credits;
  if (total !== curriculum.degreeCredits) fail('degreeCredits', `is ${curriculum.degreeCredits} but the blocks and electives add up to ${total}`);
  return curriculum;
}

/** A course code the way a student might type it, as subject, space, number; or null. */
export function normalizeCode(input: string): string | null {
  const match = /^([A-Z]{2,4})(\d{3})$/.exec(input.toUpperCase().replace(/[\s-]+/g, ''));
  return match ? `${match[1]} ${match[2]}` : null;
}

const indexes = new WeakMap<Curriculum, Map<string, Place[]>>();

function indexOf(curriculum: Curriculum): Map<string, Place[]> {
  let index = indexes.get(curriculum);
  if (!index) {
    index = new Map<string, Place[]>();
    const add = (place: Place): void => {
      index?.set(place.course.code, [...(index.get(place.course.code) ?? []), place]);
    };
    for (const b of curriculum.blocks) {
      for (const c of b.required) add({ kind: 'required', blockId: b.id, course: c });
      for (const group of b.picks) for (const c of group.courses) add({ kind: 'pick', blockId: b.id, course: c });
    }
    for (const c of curriculum.electives.named) add({ kind: 'named-elective', course: c });
    for (const c of curriculum.electives.legacyOnly) add({ kind: 'legacy-elective', course: c });
    indexes.set(curriculum, index);
  }
  return index;
}

/**
 * Every place a course is listed, however the code is typed. An empty list means the code
 * is not a listed course; whether it still counts by the elective rule is decided elsewhere.
 */
export function findCourse(curriculum: Curriculum, input: string): Place[] {
  const code = normalizeCode(input);
  return code ? (indexOf(curriculum).get(code) ?? []) : [];
}

/** The curriculum the app runs on. */
export const curriculum: Curriculum = loadCurriculum(cisData);

/** The majors the app knows. Another major is another data file added to this list. */
export const programs: readonly Program[] = [curriculum].map(c => ({ id: c.id, name: c.program, curriculum: c }));
