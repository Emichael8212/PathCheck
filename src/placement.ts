// Which requirement each course fills.
//
// Takes what a student has passed or is taking (one standing per course) and the
// curriculum, and places every course in at most one requirement. A passed course fills a
// place as done; a course in progress fills it as in progress: it is assumed to pass, so
// the place is taken, but it is never done. Anything else fills nothing.
//
// Courses the student only means to take can be placed too, as planned: the weakest
// state. A planned course takes only a place that no passed and no in-progress course
// holds, and it adds nothing to the credits done or in progress.
//
// Credits always come from the curriculum, never from a transcript row.
import { findCourse, normalizeCode, type Block, type Course, type Curriculum } from './curriculum';
import { type CourseStanding } from './transcript';

export type FillState = 'done' | 'in-progress' | 'planned';

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
  /** Planned courses are in neither `done` nor `inProgress`: their places are still `needed`. */
  readonly credits: Credits;
}

/** How a course comes to be an elective: named, by the subject-and-number rule, or only for a legacy student. */
export type ElectiveBy = 'name' | 'rule' | 'legacy';

export interface FilledElective extends Filled {
  readonly by: ElectiveBy;
}

export interface ElectivePlacement {
  readonly filled: readonly FilledElective[];
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

/** A course that was passed, is in progress or is planned but fills nothing, and why. */
export type Unplaced =
  | { readonly code: string; readonly state: FillState; readonly reason: 'not-in-curriculum' | 'not-current' | 'electives-full' | 'legacy-only' }
  | {
    readonly code: string;
    readonly state: FillState;
    readonly reason: 'pick-filled';
    /** The pick group it belongs to, and the course or courses that hold it. */
    readonly blockId: string;
    readonly group: number;
    readonly filledBy: readonly string[];
  };

export interface Placement {
  readonly blocks: readonly BlockPlacement[];
  readonly electives: ElectivePlacement;
  /**
   * The sequence is separate from the credits: every credit can be done while the sequence
   * is still needed, when other courses hold the two picks. Nothing is complete until both are.
   */
  readonly sequence: SequenceResult;
  readonly unplaced: readonly Unplaced[];
  readonly credits: { readonly done: number; readonly inProgress: number; readonly remaining: number; readonly degree: number };
}

/** A course that can fill a place, with where it stands in the transcript. */
interface Claim {
  readonly course: Course;
  readonly state: FillState;
  readonly order: number;
}

const sum = (numbers: readonly number[]): number => numbers.reduce((total, n) => total + n, 0);

const creditsOf = (filled: readonly Filled[], state: FillState): number =>
  sum(filled.filter(one => one.state === state).map(one => one.course.credits));

/**
 * Is this course an elective by the rule: one of the subjects, a number in the range, and
 * not one of the rule's exceptions? Only a course that is listed nowhere is ever asked. A
 * course listed in a block fills (or loses) its own place and is never also an elective,
 * which is what the curriculum's "not already required" says; the loader only accepts
 * data that says so.
 */
export function countsByElectiveRule(curriculum: Curriculum, code: string): boolean {
  const [subject = '', number = ''] = code.split(' ');
  const n = Number(number);
  const { subjects, minNumber, maxNumber, except } = curriculum.electives;
  return subjects.includes(subject) && n >= minNumber && n <= maxNumber && !except.includes(code);
}

/**
 * The input must be one standing per course, each with its code in normal form, which is
 * what `courseStandings` returns. Anything else would be counted twice or lost, so it is
 * refused outright.
 */
function checkInput(standings: readonly CourseStanding[]): void {
  const seen = new Set<string>();
  for (const { code } of standings) {
    if (normalizeCode(code) !== code) throw new TypeError(`placeCourses was given a course code that is not in its normal form: ${JSON.stringify(code)}`);
    if (seen.has(code)) throw new TypeError(`placeCourses was given the same course twice: ${code}`);
    seen.add(code);
  }
}

export interface PlaceOptions {
  /**
   * The student's answer to the legacy question. Only a Yes (true) lets a legacy-only course
   * fill an elective place; No, or no answer yet, never does.
   */
  readonly legacy?: boolean | null;
  /**
   * Courses the student means to take, by code in its normal form, in the order given. One
   * that is already passed or in progress is left to its standing.
   */
  readonly planned?: readonly string[];
}

/** The credits of the planned courses that hold a place. */
const plannedCredits = (placement: Placement): number => sum([
  ...placement.blocks.flatMap(one => [...one.required.filter(place => place.state === 'planned'), ...one.picks.flatMap(pick => pick.filled.filter(filled => filled.state === 'planned'))]),
  ...placement.electives.filled.filter(filled => filled.state === 'planned'),
].map(one => one.course.credits));

/** Does `a` count more than `b`: more credits done; then more in progress; then more planned? */
const countsMore = (a: Placement, b: Placement): boolean => {
  if (a.credits.done !== b.credits.done) return a.credits.done > b.credits.done;
  if (a.credits.inProgress !== b.credits.inProgress) return a.credits.inProgress > b.credits.inProgress;
  return plannedCredits(a) > plannedCredits(b);
};

/** The planned courses to place: checked like the standings, without those the transcript already has. */
function plannedOf(standings: readonly CourseStanding[], planned: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const code of planned) {
    if (normalizeCode(code) !== code) throw new TypeError(`placeCourses was given a planned course code that is not in its normal form: ${JSON.stringify(code)}`);
    if (seen.has(code)) throw new TypeError(`placeCourses was given the same planned course twice: ${code}`);
    seen.add(code);
  }
  const has = new Set(standings.filter(one => one.standing === 'passed' || one.standing === 'in-progress').map(one => one.code));
  return planned.filter(code => !has.has(code));
}

/**
 * Places every course a student has passed or is taking.
 *
 * When more courses could fill a place than it has room for, they are taken in this
 * order: passed before in progress, and both before planned; in a pick group, a course
 * that belongs to a sequence before one that does not; then the order of the transcript,
 * and for planned courses the order given.
 *
 * A legacy-only elective that is also a pick course has two places it could go. It stays
 * a pick course unless, for a legacy student, treating it as an elective counts more.
 * (The curriculum has one such course. Were there several, each is tried once, in
 * transcript order, on top of the moves already kept.)
 */
export function placeCourses(standings: readonly CourseStanding[], curriculum: Curriculum, options: PlaceOptions = {}): Placement {
  checkInput(standings);
  const planned = plannedOf(standings, options.planned ?? []);
  const legacy = options.legacy === true;
  let best = arrange(standings, planned, curriculum, legacy, new Set());
  if (!legacy) return best;

  const twoPlaces = [...standings.filter(one => one.standing === 'passed' || one.standing === 'in-progress').map(one => one.code), ...planned]
    .filter(code => {
      const places = findCourse(curriculum, code);
      return places.some(place => place.kind === 'legacy-elective') && places.some(place => place.kind === 'pick');
    });
  const asElective = new Set<string>();
  for (const code of twoPlaces) {
    const moved = arrange(standings, planned, curriculum, legacy, new Set([...asElective, code]));
    if (countsMore(moved, best)) {
      asElective.add(code);
      best = moved;
    }
  }
  return best;
}

/**
 * Would this course, planned on top of everything else, take a place in a pick? Asked of a
 * sequence course: whether its sequence can still go through its pick. (For a legacy
 * student a legacy course of the transcript may give up the pick for an elective place.)
 */
export function wouldTakePick(standings: readonly CourseStanding[], curriculum: Curriculum, options: PlaceOptions, code: string): boolean {
  const planned = [...(options.planned ?? []).filter(one => one !== code), code];
  return placeCourses(standings, curriculum, { ...options, planned }).blocks
    .some(one => one.picks.some(pick => pick.filled.some(filled => filled.state === 'planned' && filled.course.code === code)));
}

/** One placement: `asElective` names the legacy-only courses that give up their pick to be electives. */
function arrange(standings: readonly CourseStanding[], planned: readonly string[], curriculum: Curriculum, legacy: boolean, asElective: ReadonlySet<string>): Placement {
  const { blocks, electives, sequence } = curriculum;
  const sequenceCourses = new Set(sequence.alternatives.flatMap(alternative => alternative.courses));
  const stateOf = new Map<string, FillState>();

  const required = new Map<string, FillState>();
  const forPick = new Map<string, Claim[]>();
  const forElective: (Claim & { by: ElectiveBy })[] = [];
  const unplaced: { order: number; entry: Unplaced }[] = [];
  const pickKey = (blockId: string, group: number): string => `${blockId}#${group}`;

  // Where a course can go, by its code.
  const claim = (code: string, state: FillState, order: number): void => {
    const places = findCourse(curriculum, code);
    const inBlock = places.find(place => place.kind === 'required' || place.kind === 'pick');
    const named = places.find(place => place.kind === 'named-elective');
    const legacyOnly = places.find(place => place.kind === 'legacy-elective');
    if (legacyOnly && asElective.has(code)) {
      forElective.push({ course: legacyOnly.course, state, order, by: 'legacy' });
    } else if (inBlock?.kind === 'required') {
      required.set(code, state);
    } else if (inBlock?.kind === 'pick') {
      const key = pickKey(inBlock.blockId, inBlock.group);
      forPick.set(key, [...(forPick.get(key) ?? []), { course: inBlock.course, state, order }]);
    } else if (named) {
      forElective.push({ course: named.course, state, order, by: 'name' });
    } else if (legacyOnly && legacy) {
      forElective.push({ course: legacyOnly.course, state, order, by: 'legacy' });
    } else if (legacyOnly) {
      // Not a legacy student, or not asked yet: it counts nothing.
      unplaced.push({ order, entry: { code, state, reason: 'legacy-only' } });
    } else if (electives.except.includes(code)) {
      // It would match the elective rule, but the curriculum says it never counts.
      unplaced.push({ order, entry: { code, state, reason: 'not-current' } });
    } else if (countsByElectiveRule(curriculum, code)) {
      // An elective by the rule: its title is not in the curriculum, its credits are the rule's.
      forElective.push({ course: { code, title: '', credits: electives.creditsPerCourse }, state, order, by: 'rule' });
    } else {
      unplaced.push({ order, entry: { code, state, reason: 'not-in-curriculum' } });
    }
  };
  standings.forEach((standing, order) => {
    if (standing.standing !== 'passed' && standing.standing !== 'in-progress') return;
    const state: FillState = standing.standing === 'passed' ? 'done' : 'in-progress';
    // The sequence is judged on what the transcript has, never on a planned course.
    stateOf.set(standing.code, state);
    claim(standing.code, state, order);
  });
  planned.forEach((code, at) => claim(code, 'planned', standings.length + at));

  const RANK: Record<FillState, number> = { 'done': 0, 'in-progress': 1, 'planned': 2 };
  const doneFirst = (a: Claim, b: Claim): number => RANK[a.state] - RANK[b.state];
  const inOrder = (a: Claim, b: Claim): number => a.order - b.order;
  const sequenceFirst = (a: Claim, b: Claim): number => Number(!sequenceCourses.has(a.course.code)) - Number(!sequenceCourses.has(b.course.code));

  const blockPlacements: BlockPlacement[] = blocks.map(block => {
    const requiredPlaces: RequiredPlace[] = block.required.map(course => ({ course, state: required.get(course.code) ?? 'needed' }));
    const picks: PickPlace[] = block.picks.map((group, index) => {
      const claims = [...(forPick.get(pickKey(block.id, index)) ?? [])].sort((a, b) => doneFirst(a, b) || sequenceFirst(a, b) || inOrder(a, b));
      const filled: Filled[] = claims.slice(0, group.choose).map(one => ({ course: one.course, state: one.state }));
      for (const extra of claims.slice(group.choose)) {
        unplaced.push({
          order: extra.order,
          entry: { code: extra.course.code, state: extra.state, reason: 'pick-filled', blockId: block.id, group: index, filledBy: filled.map(one => one.course.code) },
        });
      }
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
  const electiveFilled: FilledElective[] = electiveClaims.slice(0, electives.courseCount).map(one => ({ course: one.course, state: one.state, by: one.by }));
  for (const extra of electiveClaims.slice(electives.courseCount)) {
    unplaced.push({ order: extra.order, entry: { code: extra.course.code, state: extra.state, reason: 'electives-full' } });
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
