// "Does it count?" for each course a student typed, with or without a transcript.
//
// The typed courses are placed with the same code as a transcript, so the two flows cannot
// disagree. They are planned courses: the weakest state, in typed order, taking only the
// places that the transcript's courses leave open. Each course then gets exactly one
// answer, in the owner's words (src/wording.ts).
//
// Without a transcript every "Counts" carries its condition. With one the answers are
// exact, and the condition goes — unless rows of the transcript still need fixing: an
// unchecked row may be the very course that was typed.
import { findCourse, type Curriculum } from './curriculum';
import { type Entry } from './entries';
import { LEGACY_QUESTION } from './legacy';
import { countsByElectiveRule, placeCourses } from './placement';
import { type CourseStanding } from './transcript';
import {
  ALREADY_PASSED, CONDITION, COUNTS_AS_LEGACY_ELECTIVE, IN_PROGRESS_AGAIN, LEGACY_STUDENTS_ONLY, NOT_IN_CURRICULUM, SLOT_FILLED, countsAsElective, countsToward,
  electivePlacesFilled, neededForSequence, notInCurrentCurriculum, sameRequirement, sameSlotTake, sequenceReminder, transcriptHasLegacy, waitingFor,
} from './wording';

/** The student's reviewed transcript, as the answers use it. */
export interface TranscriptUse {
  /** One standing per course, from the rows the review handed on. */
  readonly standings: readonly CourseStanding[];
  /** No row still needs fixing: the answers can be called exact. */
  readonly exact: boolean;
}

export type Answer =
  /** It counts. The condition goes with every "Counts" unless the transcript makes the answer exact. */
  | { readonly kind: 'counts'; readonly text: string; readonly condition: string | null }
  | { readonly kind: 'no'; readonly text: string }
  /**
   * The legacy question takes the answer's place. `because` says why it is asked on a row
   * that is not a legacy course: legacy courses on the transcript.
   */
  | { readonly kind: 'ask'; readonly because: string | null }
  /** Another course whose answer depends on the legacy answer: no verdict yet. */
  | { readonly kind: 'waiting'; readonly text: string }
  /**
   * A sequence course that is still needed although other courses hold every sequence pick:
   * it fills the sequence requirement only, with extra credits. Neither "Counts" nor "Doesn't count".
   */
  | { readonly kind: 'needed'; readonly text: string };

type Verdict = Extract<Answer, { kind: 'counts' | 'no' | 'needed' }>;

const no = (text: string): Verdict => ({ kind: 'no', text });

/** The level text of the elective rule: one hundred for each hundred of its number range, joined by "/". */
export function levelOf(curriculum: Curriculum): string {
  const { minNumber, maxNumber } = curriculum.electives;
  const hundreds: number[] = [];
  for (let level = Math.floor(minNumber / 100) * 100; level <= maxNumber; level += 100) hundreds.push(level);
  return `${hundreds.join('/')}-level`;
}

const isLegacyOnly = (curriculum: Curriculum, code: string): boolean => findCourse(curriculum, code).some(place => place.kind === 'legacy-elective');

/** The courses of the transcript that hold their standing as passed or in progress. */
const heldOn = (transcript: TranscriptUse | null): Map<string, 'passed' | 'in-progress'> =>
  new Map((transcript?.standings ?? []).flatMap(one => (one.standing === 'passed' || one.standing === 'in-progress' ? [[one.code, one.standing] as const] : [])));

/** For each sequence, its courses that sit in a pick. (The others are required anyway.) */
const sequencePicks = (curriculum: Curriculum): { name: string; courses: string[] }[] =>
  curriculum.sequence.alternatives.map(alternative => ({
    name: alternative.name,
    courses: alternative.courses.filter(code => findCourse(curriculum, code).some(found => found.kind === 'pick')),
  }));

/** The answer for every typed course once the legacy answer is known. */
function verdicts(entries: readonly Entry[], curriculum: Curriculum, legacy: boolean, transcript: TranscriptUse | null): Map<string, Verdict> {
  const held = heldOn(transcript);
  const planned = entries.map(entry => entry.code).filter(code => !held.has(code));
  const placement = placeCourses(transcript?.standings ?? [], curriculum, { legacy, planned });
  const { electives, sequence } = curriculum;
  const condition = transcript?.exact ? null : CONDITION;
  const counts = (text: string): Verdict => ({ kind: 'counts', text, condition });
  const isPlanned = (code: string): boolean => planned.includes(code);
  const answers = new Map<string, Verdict>();
  /** The planned courses that hold a pick. */
  const holdsPick = new Set(placement.blocks.flatMap(one => one.picks.flatMap(pick => pick.filled.filter(filled => filled.state === 'planned').map(filled => filled.course.code))));

  // A course the transcript already has. What the curriculum says no to comes first: it is
  // true with or without a transcript.
  for (const [code, standing] of held) {
    const listed = findCourse(curriculum, code).length > 0 || countsByElectiveRule(curriculum, code);
    answers.set(code, no(listed ? (standing === 'passed' ? ALREADY_PASSED : IN_PROGRESS_AGAIN) : electives.except.includes(code) ? notInCurrentCurriculum(code) : NOT_IN_CURRICULUM));
  }

  for (const { block, required, picks } of placement.blocks) {
    for (const one of required) if (one.state === 'planned') answers.set(one.course.code, counts(countsToward(block.name)));
    for (const pick of picks) for (const one of pick.filled) if (one.state === 'planned') answers.set(one.course.code, counts(countsToward(block.name)));
  }
  for (const one of placement.electives.filled) {
    if (one.state !== 'planned') continue;
    const [subject = ''] = one.course.code.split(' ');
    answers.set(one.course.code, counts(
      one.by === 'name' ? countsToward(electives.name) : one.by === 'legacy' ? COUNTS_AS_LEGACY_ELECTIVE : countsAsElective(levelOf(curriculum), subject),
    ));
  }

  const holdingElectives = placement.electives.filled.map(one => one.course.code);
  const alternatives = sequencePicks(curriculum);
  /**
   * Is a sequence on its way without this course: its pick course passed or in progress,
   * typed and holding its pick, or typed earlier in the list?
   */
  const sequenceOnItsWay = (code: string): boolean => {
    const earlier = planned.slice(0, planned.indexOf(code));
    return alternatives.filter(alternative => alternative.courses.every(one => held.has(one) || holdsPick.has(one) || earlier.includes(one))).length >= sequence.choose;
  };
  /** Do the transcript's own courses leave this course's pick open? */
  const pickOpen = (code: string): boolean => placement.blocks.flatMap(one => one.picks)
    .some(pick => pick.options.some(option => option.code === code) && pick.filled.filter(filled => filled.state !== 'planned').length < pick.choose);
  const creditsOf = (code: string): number => findCourse(curriculum, code)[0]?.course.credits ?? electives.creditsPerCourse;
  for (const one of placement.unplaced) {
    if (one.state !== 'planned') continue;
    let answer: Verdict;
    if (one.reason === 'pick-filled') {
      const ofSequence = alternatives.find(alternative => alternative.courses.includes(one.code));
      // A course of the student's own list holds the pick: it is named. For a student who is
      // not a legacy student a legacy-only course has nowhere else to go, and is told that.
      if (one.filledBy.some(isPlanned)) answer = no(!legacy && isLegacyOnly(curriculum, one.code) ? LEGACY_STUDENTS_ONLY : sameRequirement(one.filledBy));
      // The transcript holds the pick, and no sequence is on its way (the owner's answer of
      // 2026-11-16). While another sequence can still go through an open pick, the student
      // is pointed to that course. When every pick is held, this course is needed for its
      // sequence only: never sent away, and never said to count.
      else if (ofSequence && !sequenceOnItsWay(one.code)) {
        const through = alternatives.filter(alternative => alternative !== ofSequence && alternative.courses.length > 0 && alternative.courses.every(pickOpen)).flatMap(alternative => alternative.courses);
        answer = through.length > 0 ? no(sameSlotTake(one.filledBy, through)) : { kind: 'needed', text: neededForSequence(ofSequence.name, creditsOf(one.code)) };
      }
      // A legacy student's legacy course could still be an elective, were the last place not
      // taken by a course of their own list: that is the reason it is given.
      else if (legacy && isLegacyOnly(curriculum, one.code) && holdingElectives.some(isPlanned)) answer = no(electivePlacesFilled(electives.courseCount, holdingElectives));
      else answer = no(SLOT_FILLED);
    } else if (one.reason === 'electives-full') {
      answer = no(holdingElectives.some(isPlanned) ? electivePlacesFilled(electives.courseCount, holdingElectives) : SLOT_FILLED);
    } else if (one.reason === 'not-in-curriculum') answer = no(NOT_IN_CURRICULUM);
    else if (one.reason === 'not-current') answer = no(notInCurrentCurriculum(one.code));
    else answer = no(LEGACY_STUDENTS_ONLY);
    answers.set(one.code, answer);
  }
  return answers;
}

const same = (a: Verdict | undefined, b: Verdict | undefined): boolean => a !== undefined && b !== undefined && a.kind === b.kind && a.text === b.text;

/**
 * One answer per typed course, in the order typed. `legacy` is the student's answer to the
 * legacy question, or null when it has not been given. Until it is given, a course whose
 * answer would differ between Yes and No gets no verdict: a legacy course shows the
 * question, any other course waits. When the answer matters only because of legacy courses
 * on the transcript, no typed legacy course is there to ask: the first course that waits
 * asks, and says why.
 */
export function answersFor(entries: readonly Entry[], curriculum: Curriculum, legacy: boolean | null, transcript: TranscriptUse | null = null): Answer[] {
  const missing = (code: string): never => { throw new Error(`No answer was worked out for ${code}.`); };
  if (legacy !== null) {
    const known = verdicts(entries, curriculum, legacy, transcript);
    return entries.map(entry => known.get(entry.code) ?? missing(entry.code));
  }
  const yes = verdicts(entries, curriculum, true, transcript);
  const not = verdicts(entries, curriculum, false, transcript);
  const answers: Answer[] = entries.map(entry => {
    const either = not.get(entry.code) ?? missing(entry.code);
    if (same(yes.get(entry.code), either)) return either;
    return isLegacyOnly(curriculum, entry.code) ? { kind: 'ask', because: null } : { kind: 'waiting', text: waitingFor(LEGACY_QUESTION) };
  });
  const firstWaiting = answers.findIndex(answer => answer.kind === 'waiting');
  if (firstWaiting >= 0 && !answers.some(answer => answer.kind === 'ask')) {
    const onTranscript = [...heldOn(transcript).keys()].filter(code => isLegacyOnly(curriculum, code));
    answers[firstWaiting] = { kind: 'ask', because: onTranscript.length > 0 ? transcriptHasLegacy(onTranscript) : null };
  }
  return answers;
}

/** Does this list have a course whose answer needs the legacy question? */
export const legacyMatters = (entries: readonly Entry[], curriculum: Curriculum, transcript: TranscriptUse | null = null): boolean =>
  answersFor(entries, curriculum, null, transcript).some(answer => answer.kind === 'ask');

/**
 * The reminder about the history or literature sequence, or nothing: shown when courses
 * are typed and none of the sequence courses that sit in a pick is typed, passed or in
 * progress.
 */
export function reminderFor(entries: readonly Entry[], curriculum: Curriculum, transcript: TranscriptUse | null = null): string | null {
  if (entries.length === 0) return null;
  const held = heldOn(transcript);
  const inPicks = sequencePicks(curriculum).flatMap(alternative => alternative.courses);
  if (inPicks.length === 0 || inPicks.some(code => held.has(code) || entries.some(entry => entry.code === code))) return null;
  return sequenceReminder(inPicks, curriculum.sequence.alternatives.map(alternative => alternative.name.replace(/ sequence$/, '')).join('/'));
}
