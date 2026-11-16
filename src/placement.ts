// Which requirement each course fills.
//
// Takes what a student has passed or is taking (one standing per course) and the
// curriculum, and places every course in at most one requirement. A passed course fills a
// place as done; a course in progress fills it as in progress: it is assumed to pass, so
// the place is taken, but it is never done. Anything else fills nothing.
//
// Credits always come from the curriculum, never from a transcript row.
import { findCourse, type Block, type Course, type Curriculum } from './curriculum';
import { type CourseStanding } from './transcript';

export type FillState = 'done' | 'in-progress';

/** A course that fills a place. */
export interface Filled {
  readonly course: Course;
  readonly state: FillState;
}

export interface RequiredPlace {
  readonly course: Course;
  readonly state: FillState | 'needed';
}

/** "Choose N of these": the courses that fill it, and how many picks are still open. */
export interface PickPlace {
  /** The pick group's position in its block. */
  readonly group: number;
  readonly choose: number;
  readonly options: readonly Course[];
  readonly filled: readonly Filled[];
  readonly open: number;
}

export interface Credits {
  readonly done: number;
  readonly inProgress: number;
  readonly needed: number;
}

export interface BlockPlacement {
  readonly block: Block;
  readonly required: readonly RequiredPlace[];
  readonly picks: readonly PickPlace[];
  readonly credits: Credits;
}

export interface ElectivePlacement {
  readonly filled: readonly Filled[];
  readonly open: number;
  readonly credits: Credits;
}

export type SequenceState = 'done' | 'in-progress' | 'needed';

export interface SequenceAlternativeResult {
  readonly id: string;
  readonly name: string;
  readonly state: SequenceState;
  /** Courses of this alternative that are neither passed nor in progress. */
  readonly missing: readonly string[];
}

export interface SequenceResult {
  readonly state: SequenceState;
  readonly alternatives: readonly SequenceAlternativeResult[];
}

/** A course that was passed or is in progress but fills nothing, and why. */
export type Unplaced =
  | { readonly code: string; readonly state: FillState; readonly reason: 'not-in-curriculum' | 'electives-full' | 'legacy-only' }
  | { readonly code: string; readonly state: FillState; readonly reason: 'pick-filled'; readonly filledBy: readonly string[] };

export interface Placement {
  readonly blocks: readonly BlockPlacement[];
  readonly electives: ElectivePlacement;
  readonly sequence: SequenceResult;
  readonly unplaced: readonly Unplaced[];
  readonly credits: { readonly done: number; readonly inProgress: number; readonly remaining: number; readonly degree: number };
}

/** A course that can fill a place, with where it stands in the transcript. */
interface Claim {
  readonly code: string;
  readonly state: FillState;
  readonly order: number;
}

const sum = (numbers: readonly number[]): number => numbers.reduce((total, n) => total + n, 0);

const creditsOf = (filled: readonly Filled[], state: FillState): number =>
  sum(filled.filter(one => one.state === state).map(one => one.course.credits));

/** Does this code match the elective rule: one of the subjects, a number in the range? */
function matchesElectiveRule(curriculum: Curriculum, code: string): boolean {
  const [subject = '', number = ''] = code.split(' ');
  const n = Number(number);
  const { subjects, minNumber, maxNumber } = curriculum.electives;
  return subjects.includes(subject) && n >= minNumber && n <= maxNumber;
}

/**
 * Places every course a student has passed or is taking.
 *
 * When more courses could fill a place than it has room for, they are taken in this
 * order: passed before in progress; in a pick group, a course that belongs to a sequence
 * before one that does not; then the order of the transcript.
 */
export function placeCourses(standings: readonly CourseStanding[], curriculum: Curriculum): Placement {
  const { blocks, electives, sequence } = curriculum;
  const sequenceCourses = new Set(sequence.alternatives.flatMap(alternative => alternative.courses));
  const stateOf = new Map<string, FillState>();

  const required = new Map<string, FillState>();
  const forPick = new Map<string, Claim[]>();
  const forElective: (Claim & { course: Course })[] = [];
  const unplaced: { order: number; entry: Unplaced }[] = [];
  const pickKey = (blockId: string, group: number): string => `${blockId}#${group}`;

  standings.forEach((standing, order) => {
    if (standing.standing !== 'passed' && standing.standing !== 'in-progress') return;
    const claim: Claim = { code: standing.code, state: standing.standing === 'passed' ? 'done' : 'in-progress', order };
    stateOf.set(claim.code, claim.state);

    const places = findCourse(curriculum, claim.code);
    const inBlock = places.find(place => place.kind === 'required' || place.kind === 'pick');
    if (inBlock?.kind === 'required') {
      required.set(claim.code, claim.state);
    } else if (inBlock?.kind === 'pick') {
      const key = pickKey(inBlock.blockId, inBlock.group);
      forPick.set(key, [...(forPick.get(key) ?? []), claim]);
    } else if (places.some(place => place.kind === 'named-elective')) {
      const named = places.find(place => place.kind === 'named-elective');
      if (named) forElective.push({ ...claim, course: named.course });
    } else if (places.some(place => place.kind === 'legacy-elective')) {
      // Whether a legacy-only course can count depends on the legacy answer.
      unplaced.push({ order, entry: { code: claim.code, state: claim.state, reason: 'legacy-only' } });
    } else if (matchesElectiveRule(curriculum, claim.code)) {
      // An elective by the rule: its title is not in the curriculum, its credits are the rule's.
      forElective.push({ ...claim, course: { code: claim.code, title: '', credits: electives.creditsPerCourse } });
    } else {
      unplaced.push({ order, entry: { code: claim.code, state: claim.state, reason: 'not-in-curriculum' } });
    }
  });

  const doneFirst = (a: Claim, b: Claim): number => Number(a.state !== 'done') - Number(b.state !== 'done');
  const inOrder = (a: Claim, b: Claim): number => a.order - b.order;
  const sequenceFirst = (a: Claim, b: Claim): number => Number(!sequenceCourses.has(a.code)) - Number(!sequenceCourses.has(b.code));

  const blockPlacements: BlockPlacement[] = blocks.map(block => {
    const requiredPlaces: RequiredPlace[] = block.required.map(course => ({ course, state: required.get(course.code) ?? 'needed' }));
    const picks: PickPlace[] = block.picks.map((group, index) => {
      const claims = [...(forPick.get(pickKey(block.id, index)) ?? [])].sort((a, b) => doneFirst(a, b) || sequenceFirst(a, b) || inOrder(a, b));
      const placed = claims.slice(0, group.choose);
      for (const extra of claims.slice(group.choose)) {
        unplaced.push({ order: extra.order, entry: { code: extra.code, state: extra.state, reason: 'pick-filled', filledBy: placed.map(one => one.code) } });
      }
      const filled: Filled[] = placed.map(one => {
        const course = group.courses.find(option => option.code === one.code);
        if (!course) throw new Error(`Placed ${one.code} in a pick group that does not list it`);
        return { course, state: one.state };
      });
      return { group: index, choose: group.choose, options: group.courses, filled, open: group.choose - filled.length };
    });
    const filled: Filled[] = [
      ...requiredPlaces.flatMap(place => (place.state === 'needed' ? [] : [{ course: place.course, state: place.state }])),
      ...picks.flatMap(pick => pick.filled),
    ];
    const done = creditsOf(filled, 'done');
    const inProgress = creditsOf(filled, 'in-progress');
    return { block, required: requiredPlaces, picks, credits: { done, inProgress, needed: block.credits - done - inProgress } };
  });

  const electiveClaims = [...forElective].sort((a, b) => doneFirst(a, b) || inOrder(a, b));
  const electiveFilled: Filled[] = electiveClaims.slice(0, electives.courseCount).map(one => ({ course: one.course, state: one.state }));
  for (const extra of electiveClaims.slice(electives.courseCount)) {
    unplaced.push({ order: extra.order, entry: { code: extra.code, state: extra.state, reason: 'electives-full' } });
  }
  const electiveDone = creditsOf(electiveFilled, 'done');
  const electiveInProgress = creditsOf(electiveFilled, 'in-progress');
  const electivePlacement: ElectivePlacement = {
    filled: electiveFilled,
    open: electives.courseCount - electiveFilled.length,
    credits: { done: electiveDone, inProgress: electiveInProgress, needed: electives.credits - electiveDone - electiveInProgress },
  };

  // The sequence is judged on the courses themselves, not on which course holds a place.
  const alternatives: SequenceAlternativeResult[] = sequence.alternatives.map(alternative => {
    const states = alternative.courses.map(code => stateOf.get(code));
    const state: SequenceState = states.every(one => one === 'done') ? 'done' : states.every(one => one !== undefined) ? 'in-progress' : 'needed';
    return { id: alternative.id, name: alternative.name, state, missing: alternative.courses.filter(code => !stateOf.has(code)) };
  });
  const count = (...states: SequenceState[]): number => alternatives.filter(alternative => states.includes(alternative.state)).length;
  const sequenceState: SequenceState = count('done') >= sequence.choose ? 'done' : count('done', 'in-progress') >= sequence.choose ? 'in-progress' : 'needed';

  const done = sum(blockPlacements.map(one => one.credits.done)) + electiveDone;
  const inProgress = sum(blockPlacements.map(one => one.credits.inProgress)) + electiveInProgress;
  return {
    blocks: blockPlacements,
    electives: electivePlacement,
    sequence: { state: sequenceState, alternatives },
    unplaced: [...unplaced].sort((a, b) => a.order - b.order).map(one => one.entry),
    credits: { done, inProgress, remaining: curriculum.degreeCredits - done - inProgress, degree: curriculum.degreeCredits },
  };
}
