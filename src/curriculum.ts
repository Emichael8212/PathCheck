// The curriculum as the app uses it. Every academic fact (courses, blocks, credits, the
// elective rule, the sequence, the grade scale) comes from the data file; nothing of the
// kind is written here. `loadCurriculum` checks a raw data object against schema version 2
// and refuses it, naming the bad item, if anything is missing, unknown, contradictory or
// does not add up. What it returns is frozen: no code can change the curriculum at runtime.
import cisData from '../docs/curriculum/provisional-current.json';

export interface Course {
  /** Subject letters, a space, three digits: the way a student reads it. */
  readonly code: string;
  readonly title: string;
  readonly credits: number;
}

/** "Choose N of these courses." */
export interface PickGroup {
  readonly choose: number;
  readonly courses: readonly Course[];
}

export interface Block {
  readonly id: string;
  readonly name: string;
  readonly credits: number;
  readonly required: readonly Course[];
  readonly picks: readonly PickGroup[];
}

export interface Electives {
  readonly id: string;
  readonly name: string;
  readonly credits: number;
  readonly courseCount: number;
  /** Courses that are electives by name. */
  readonly named: readonly Course[];
  /** Any course with one of these subjects and a number in this range is an elective. */
  readonly subjects: readonly string[];
  readonly minNumber: number;
  readonly maxNumber: number;
  readonly creditsPerCourse: number;
  /** A course that is already required somewhere is not also an elective. */
  readonly excludeRequired: boolean;
  /** Electives only for legacy students. */
  readonly legacyOnly: readonly Course[];
}

export interface SequenceAlternative {
  readonly id: string;
  readonly name: string;
  readonly courses: readonly string[];
}

export interface Sequence {
  readonly choose: number;
  readonly alternatives: readonly SequenceAlternative[];
  readonly additionalCredits: number;
  readonly coreBlockIds: readonly string[];
  readonly coreCredits: number;
}

export interface Grades {
  /** Best first. "This grade or better" means this letter or one listed before it. */
  readonly letters: readonly string[];
  readonly minimumCounting: string;
  /** Marks that are not grades and never count. */
  readonly neverCounting: readonly string[];
}

export interface Curriculum {
  readonly id: string;
  readonly institution: string;
  readonly program: string;
  readonly degreeCredits: number;
  /** YYYY-MM-DD, or null until the owner gives the date of the last review. */
  readonly lastReviewed: string | null;
  readonly grades: Grades;
  readonly blocks: readonly Block[];
  readonly sequence: Sequence;
  readonly electives: Electives;
}

export interface Program {
  readonly id: string;
  readonly name: string;
  readonly curriculum: Curriculum;
}

/** Where a course is listed in a curriculum. `group` is the pick group's position in its block. */
export type Place =
  | { readonly kind: 'required'; readonly blockId: string; readonly course: Course }
  | { readonly kind: 'pick'; readonly blockId: string; readonly group: number; readonly course: Course }
  | { readonly kind: 'named-elective' | 'legacy-elective'; readonly course: Course };

export class CurriculumError extends Error {
  constructor(path: string, problem: string) {
    super(`Curriculum data: ${path || 'the file'}: ${problem}`);
    this.name = 'CurriculumError';
  }
}

const SCHEMA_VERSION = 2;
const DATA_CODE = /^[A-Z]{2,4}-\d{3}$/;
const SUBJECT = /^[A-Z]{2,4}$/;
// Course numbers have three digits.
const LOWEST_NUMBER = 100;
const HIGHEST_NUMBER = 999;
const EARLIEST_REVIEW = '2000-01-01';

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
    if (!Object.hasOwn(object, key)) fail(path ? `${path}.${key}` : key, 'missing');
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

/** Refuses a list that names the same thing twice. */
function distinct(values: readonly string[], path: string, what: string): void {
  values.forEach((value, i) => {
    if (values.indexOf(value) !== i) fail(`${path}[${i}] (${value})`, `the same ${what} is listed twice`);
  });
}

function dataCode(value: unknown, path: string): string {
  const id = text(value, path);
  if (!DATA_CODE.test(id)) fail(`${path} (${id})`, 'must be 2 to 4 capital letters, a hyphen and 3 digits');
  return id;
}

const readable = (id: string): string => id.replace('-', ' ');
const asWritten = (code: string): string => code.replace(' ', '-');

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
  distinct(result.letters, `${path}.letters`, 'grade');
  distinct(result.neverCounting, `${path}.neverCounting`, 'mark');
  if (!result.letters.includes(result.minimumCounting)) fail(`${path}.minimumCounting`, `"${result.minimumCounting}" is not one of the letters`);
  result.neverCounting.forEach((mark, i) => {
    if (result.letters.includes(mark)) fail(`${path}.neverCounting[${i}] (${mark})`, 'is also one of the letters');
  });
  return result;
}

function courseNumber(value: unknown, path: string): number {
  const number = positiveWhole(value, path);
  if (number < LOWEST_NUMBER || number > HIGHEST_NUMBER) fail(path, 'must be a three-digit course number');
  return number;
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
    minNumber: courseNumber(rule.minCourseNumber, `${path}.subjectRule.minCourseNumber`),
    maxNumber: courseNumber(rule.maxCourseNumber, `${path}.subjectRule.maxCourseNumber`),
    creditsPerCourse: positiveWhole(rule.creditsPerCourse, `${path}.subjectRule.creditsPerCourse`),
    excludeRequired: raw.excludeRequiredCourses as boolean,
    legacyOnly: courses(raw.legacyOnlyCourses, `${path}.legacyOnlyCourses`),
  };
  if (result.subjects.length === 0) fail(`${path}.subjectRule.prefixes`, 'must list at least one subject');
  result.subjects.forEach((subject, i) => {
    if (!SUBJECT.test(subject)) fail(`${path}.subjectRule.prefixes[${i}] (${subject})`, 'must be 2 to 4 capital letters');
  });
  distinct(result.subjects, `${path}.subjectRule.prefixes`, 'subject');
  if (result.minNumber > result.maxNumber) fail(`${path}.subjectRule.minCourseNumber`, 'is above maxCourseNumber');
  if (result.credits !== result.courseCount * result.creditsPerCourse) {
    fail(`${path}.credits`, `is ${result.credits} but ${result.courseCount} courses of ${result.creditsPerCourse} credits is ${result.courseCount * result.creditsPerCourse}`);
  }
  // The total above only holds if every elective is worth the same.
  for (const [name, group] of [['namedCourses', result.named], ['legacyOnlyCourses', result.legacyOnly]] as const) {
    group.forEach((c, i) => {
      if (c.credits !== result.creditsPerCourse) fail(`${path}.${name}[${i}] (${asWritten(c.code)}).credits`, `is ${c.credits} but an elective is ${result.creditsPerCourse} credits`);
    });
  }
  return result;
}

function sequence(value: unknown, path: string, blocks: readonly Block[]): Sequence {
  const raw = fields(value, path, ['choose', 'alternatives', 'additionalCredits', 'coreBlocks', 'coreCredits']);
  const result: Sequence = {
    choose: positiveWhole(raw.choose, `${path}.choose`),
    alternatives: list(raw.alternatives, `${path}.alternatives`).map((item, i) => {
      const at = `${path}.alternatives[${i}]`;
      const alternative = fields(item, at, ['id', 'name', 'courses']);
      const id = text(alternative.id, `${at}.id`);
      const listed = list(alternative.courses, `${at}.courses`).map((code, j) => dataCode(code, `${at}.courses[${j}]`));
      // A sequence is at least two different courses; an empty one would always be "complete".
      if (listed.length < 2) fail(`${at} (${id}).courses`, 'a sequence needs at least two courses');
      distinct(listed, `${at} (${id}).courses`, 'course');
      return { id, name: text(alternative.name, `${at}.name`), courses: listed.map(readable) };
    }),
    additionalCredits: wholeFromZero(raw.additionalCredits, `${path}.additionalCredits`),
    coreBlockIds: texts(raw.coreBlocks, `${path}.coreBlocks`),
    coreCredits: positiveWhole(raw.coreCredits, `${path}.coreCredits`),
  };
  if (result.choose > result.alternatives.length) fail(`${path}.choose`, `asks for ${result.choose} of ${result.alternatives.length} sequences`);
  distinct(result.alternatives.map(alternative => alternative.id), `${path}.alternatives`, 'sequence id');
  distinct(result.coreBlockIds, `${path}.coreBlocks`, 'block');

  const core = result.coreBlockIds.map((id, i) => blocks.find(b => b.id === id) ?? fail(`${path}.coreBlocks[${i}] (${id})`, 'is not a block'));
  const coreTotal = sum(core.map(b => b.credits));
  if (coreTotal !== result.coreCredits) fail(`${path}.coreCredits`, `is ${result.coreCredits} but the core blocks add up to ${coreTotal}`);
  const inCore = new Set(core.flatMap(b => [...b.required, ...b.picks.flatMap(group => group.courses)]).map(c => c.code));
  for (const alternative of result.alternatives) {
    for (const code of alternative.courses) {
      if (!inCore.has(code)) fail(`${path}.alternatives (${alternative.id}: ${asWritten(code)})`, 'is not a course in a core block');
    }
  }
  return result;
}

function reviewDate(value: unknown, path: string): string | null {
  if (value === null) return null;
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || (value as string) < EARLIEST_REVIEW) {
    fail(path, 'must be null or a date written YYYY-MM-DD');
  }
  return value as string;
}

/** Every listing of a course, with a description of where it is for error messages. */
function listings(blocks: readonly Block[], chosen: Electives): { place: Place; where: string }[] {
  const found: { place: Place; where: string }[] = [];
  blocks.forEach((b, i) => {
    const where = `blocks[${i}] (${b.id})`;
    for (const c of b.required) found.push({ place: { kind: 'required', blockId: b.id, course: c }, where });
    b.picks.forEach((group, g) => {
      for (const c of group.courses) found.push({ place: { kind: 'pick', blockId: b.id, group: g, course: c }, where });
    });
  });
  for (const c of chosen.named) found.push({ place: { kind: 'named-elective', course: c }, where: 'electives.namedCourses' });
  for (const c of chosen.legacyOnly) found.push({ place: { kind: 'legacy-elective', course: c }, where: 'electives.legacyOnlyCourses' });
  return found;
}

/**
 * A course fills one requirement, so it is listed once. The one exception: a legacy-only
 * elective may also be a pick in a block (for a legacy student it can go either way, which
 * is decided when courses are placed), and then both entries must say the same thing.
 */
function checkListedOnce(all: { place: Place; where: string }[]): void {
  all.forEach((entry, i) => {
    const before = all.slice(0, i).filter(other => other.place.course.code === entry.place.course.code);
    const earlier = before.at(-1);
    if (!earlier) return;
    const id = asWritten(entry.place.course.code);
    // Every earlier listing counts, not just the first: one pick, then one legacy entry.
    const allowed = before.length === 1 && entry.place.kind === 'legacy-elective' && earlier.place.kind === 'pick';
    if (!allowed) fail(id, `the same course is listed twice: in ${earlier.where} and in ${entry.where}`);
    if (entry.place.course.title !== earlier.place.course.title || entry.place.course.credits !== earlier.place.course.credits) {
      fail(id, `has a different title or credits in ${earlier.where} and in ${entry.where}`);
    }
  });
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
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
  distinct(blocks.map(b => b.id), 'blocks', 'block id');
  distinct(blocks.map(b => b.name), 'blocks', 'block name');

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
  checkListedOnce(listings(blocks, curriculum.electives));

  const total = sum(blocks.map(b => b.credits)) + curriculum.electives.credits;
  if (total !== curriculum.degreeCredits) fail('degreeCredits', `is ${curriculum.degreeCredits} but the blocks and electives add up to ${total}`);
  return deepFreeze(curriculum);
}

// Anything a keyboard, a phone's autocorrect or a pasted document puts between the letters
// and the digits: spaces of any kind, hyphens and dashes, and characters that take no room.
const SEPARATORS = /[\s\u00AD\u200B-\u200D\u2060\uFEFF\u2010-\u2015\u2212\uFE58\uFE63\uFF0D-]+/g;

/** A course code the way a student might type or paste it, as subject, space, number; or null. */
export function normalizeCode(input: string): string | null {
  const match = /^([A-Z]{2,4})(\d{3})$/.exec(input.normalize('NFKC').toUpperCase().replace(SEPARATORS, ''));
  return match ? `${match[1]} ${match[2]}` : null;
}

const indexes = new WeakMap<Curriculum, Map<string, readonly Place[]>>();
const NOWHERE: readonly Place[] = Object.freeze([]);

function indexOf(curriculum: Curriculum): Map<string, readonly Place[]> {
  let index = indexes.get(curriculum);
  if (!index) {
    const places = new Map<string, Place[]>();
    for (const { place } of listings(curriculum.blocks, curriculum.electives)) {
      places.set(place.course.code, [...(places.get(place.course.code) ?? []), place]);
    }
    index = new Map([...places].map(([code, found]) => [code, deepFreeze(found)]));
    indexes.set(curriculum, index);
  }
  return index;
}

/**
 * Every place a course is listed, however the code is typed. An empty list means the code
 * is not a listed course; whether it still counts by the elective rule is decided elsewhere.
 */
export function findCourse(curriculum: Curriculum, input: string): readonly Place[] {
  const code = normalizeCode(input);
  return code ? (indexOf(curriculum).get(code) ?? NOWHERE) : NOWHERE;
}

/** The curriculum the app runs on. */
export const curriculum: Curriculum = loadCurriculum(cisData);

/** The majors the app knows. Another major is another data file added to this list. */
export const programs: readonly Program[] = deepFreeze([curriculum].map(c => ({ id: c.id, name: c.program, curriculum: c })));
