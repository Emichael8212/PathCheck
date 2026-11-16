// "Does it count?" for each course a student typed, without a transcript.
//
// The typed courses are placed with the same code as a transcript, so the two flows cannot
// disagree: all in one state (in progress: courses the student means to take), in typed
// order. Each course then gets exactly one answer, in the owner's words (src/wording.ts).
import { findCourse, type Curriculum } from './curriculum';
import { type Entry } from './entries';
import { LEGACY_QUESTION } from './legacy';
import { placeCourses, type Placement } from './placement';
import { courseStandings } from './transcript';
import {
  CONDITION, COUNTS_AS_LEGACY_ELECTIVE, LEGACY_STUDENTS_ONLY, NOT_IN_CURRICULUM, countsAsElective, countsToward, electivePlacesFilled,
  notInCurrentCurriculum, sameRequirement, sequenceReminder, waitingFor,
} from './wording';

export type Answer =
  /** It counts, with the condition that goes with every "Counts" when there is no transcript. */
  | { readonly kind: 'counts'; readonly text: string; readonly condition: string }
  | { readonly kind: 'no'; readonly text: string }
  /** A legacy course before the legacy question is answered: the question takes the answer's place. */
  | { readonly kind: 'ask' }
  /** Another course whose answer depends on the legacy answer: no verdict yet. */
  | { readonly kind: 'waiting'; readonly text: string };

type Verdict = Extract<Answer, { kind: 'counts' | 'no' }>;

const counts = (text: string): Verdict => ({ kind: 'counts', text, condition: CONDITION });
const no = (text: string): Verdict => ({ kind: 'no', text });

/** The level text of the elective rule: one hundred for each hundred of its number range, joined by "/". */
export function levelOf(curriculum: Curriculum): string {
  const { minNumber, maxNumber } = curriculum.electives;
  const hundreds: number[] = [];
  for (let level = Math.floor(minNumber / 100) * 100; level <= maxNumber; level += 100) hundreds.push(level);
  return `${hundreds.join('/')}-level`;
}

const isLegacyOnly = (curriculum: Curriculum, code: string): boolean => findCourse(curriculum, code).some(place => place.kind === 'legacy-elective');

function place(entries: readonly Entry[], curriculum: Curriculum, legacy: boolean): Placement {
  const rows = entries.map(entry => ({ code: entry.code, term: '', credits: 0, grade: null, transfer: false }));
  return placeCourses(courseStandings(rows, curriculum.grades), curriculum, { legacy });
}

/** The answer for every typed course once the legacy answer is known. */
function verdicts(entries: readonly Entry[], curriculum: Curriculum, legacy: boolean): Map<string, Verdict> {
  const placement = place(entries, curriculum, legacy);
  const { electives } = curriculum;
  const answers = new Map<string, Verdict>();
  for (const { block, required, picks } of placement.blocks) {
    for (const one of required) if (one.state !== 'needed') answers.set(one.course.code, counts(countsToward(block.name)));
    for (const pick of picks) for (const one of pick.filled) answers.set(one.course.code, counts(countsToward(block.name)));
  }
  for (const one of placement.electives.filled) {
    const [subject = ''] = one.course.code.split(' ');
    answers.set(one.course.code, counts(
      one.by === 'name' ? countsToward(electives.name) : one.by === 'legacy' ? COUNTS_AS_LEGACY_ELECTIVE : countsAsElective(levelOf(curriculum), subject),
    ));
  }
  const holdingElectives = placement.electives.filled.map(one => one.course.code);
  for (const one of placement.unplaced) {
    let text: string;
    // Its pick is held by another typed course. For a student who is not a legacy student
    // a legacy-only course has nowhere else to go, and that is what it is told.
    if (one.reason === 'pick-filled') text = !legacy && isLegacyOnly(curriculum, one.code) ? LEGACY_STUDENTS_ONLY : sameRequirement(one.filledBy);
    else if (one.reason === 'not-in-curriculum') text = NOT_IN_CURRICULUM;
    else if (one.reason === 'not-current') text = notInCurrentCurriculum(one.code);
    else if (one.reason === 'electives-full') text = electivePlacesFilled(electives.courseCount, holdingElectives);
    else text = LEGACY_STUDENTS_ONLY;
    answers.set(one.code, no(text));
  }
  return answers;
}

const same = (a: Verdict | undefined, b: Verdict | undefined): boolean => a !== undefined && b !== undefined && a.kind === b.kind && a.text === b.text;

/**
 * One answer per typed course, in the order typed. `legacy` is the student's answer to the
 * legacy question, or null when it has not been given. Until it is given, a course whose
 * answer would differ between Yes and No gets no verdict: a legacy course shows the
 * question, any other course waits.
 */
export function answersFor(entries: readonly Entry[], curriculum: Curriculum, legacy: boolean | null): Answer[] {
  const missing = (code: string): never => { throw new Error(`No answer was worked out for ${code}.`); };
  if (legacy !== null) {
    const known = verdicts(entries, curriculum, legacy);
    return entries.map(entry => known.get(entry.code) ?? missing(entry.code));
  }
  const yes = verdicts(entries, curriculum, true);
  const not = verdicts(entries, curriculum, false);
  return entries.map(entry => {
    const either = not.get(entry.code) ?? missing(entry.code);
    if (same(yes.get(entry.code), either)) return either;
    return isLegacyOnly(curriculum, entry.code) ? { kind: 'ask' } : { kind: 'waiting', text: waitingFor(LEGACY_QUESTION) };
  });
}

/** Does this list have a course whose answer needs the legacy question? */
export const legacyMatters = (entries: readonly Entry[], curriculum: Curriculum): boolean =>
  answersFor(entries, curriculum, null).some(answer => answer.kind === 'ask');

/**
 * The reminder about the history or literature sequence, or nothing: shown when courses
 * are typed and none of them is a sequence course that sits in a pick.
 */
export function reminderFor(entries: readonly Entry[], curriculum: Curriculum): string | null {
  if (entries.length === 0) return null;
  const { alternatives } = curriculum.sequence;
  const inPicks = alternatives.flatMap(alternative => alternative.courses.filter(code => findCourse(curriculum, code).some(found => found.kind === 'pick')));
  if (inPicks.length === 0 || entries.some(entry => inPicks.includes(entry.code))) return null;
  return sequenceReminder(inPicks, alternatives.map(alternative => alternative.name.replace(/ sequence$/, '')).join('/'));
}
