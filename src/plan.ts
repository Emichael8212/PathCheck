// The draft plan: the courses still to take, laid out semester by semester
// (docs/BRIEF.md §4 Flow B step 5; docs/design/DESIGN.md "Page 3"; docs/sprints/F16.md).
// A starting point only: nothing here checks prerequisites or what is offered when, and
// nothing is adopted. The order is by course level; the portal checks the rest.
//
// What is planned is exactly what the checklist says is still to take, and the semesters
// follow the pace settings. No course code is written here: the course that belongs in
// the final semester is named by the curriculum.
import { sequencePicks } from './answers';
import { checklistOf } from './checklist';
import { type Curriculum } from './curriculum';
import { code, esc, eyebrow, icons, withCodes } from './html';
import { paceOf, termAfter, termName, type Pace, type PaceSettings, type Term } from './pace';
import { placeCourses } from './placement';
import { type CourseStanding } from './transcript';

/** One thing to take: a course, or a place the student still has to choose a course for. */
export interface PlanEntry {
  /** What a move is kept under: the course's code, or the open place itself. */
  readonly key: string;
  readonly credits: number;
  /** The hundred of the course number it is planned at. */
  readonly level: number;
  /** A course: its code and title. */
  readonly course: { readonly code: string; readonly title: string } | null;
  /** An open choice: what it is for. */
  readonly choice: string | null;
  /** Among entries that read the same: which one this is, and of how many. */
  readonly nth: { readonly n: number; readonly of: number } | null;
  /** The course that always goes last. */
  readonly final: boolean;
}

export interface PlanSemester {
  readonly term: Term;
  readonly credits: number;
  readonly entries: readonly PlanEntry[];
}

export interface Plan {
  readonly semesters: readonly PlanSemester[];
  /** The plan ends later than the pace answer implies, and why: a course did not fit, or the student moved courses. */
  readonly late: { readonly term: Term; readonly why: 'split' | 'moved' } | null;
}

/** For each moved entry, the earliest term it may go in. */
export type Moves = Readonly<Record<string, Term>>;

const sum = (numbers: readonly number[]): number => numbers.reduce((total, n) => total + n, 0);
const hundred = (courseCode: string): number => Math.floor(Number(courseCode.split(' ')[1] ?? 0) / 100) * 100;
const SEASONS = ['Spring', 'Summer', 'Fall'];
const when = (term: Term): number => term.year * SEASONS.length + SEASONS.indexOf(term.season);
/** "A", "A or B", "A, B or C". */
const either = (codes: readonly string[]): string => (codes.length <= 1 ? codes.join('') : `${codes.slice(0, -1).join(', ')} or ${codes[codes.length - 1]}`);

const TEXT = {
  eyebrow: 'A starting point, not a schedule',
  title: 'Draft plan',
  label: 'Draft — Order not checked — your portal checks prerequisites',
  note: 'Pace settings estimate credits only. “Move later” changes this draft; prerequisites are not checked.',
  choice: 'Open choice',
  move: 'Move later',
  // The name starts with the words on the button, so that saying them reaches it.
  moveNamed: (what: string): string => `Move later: ${what}`,
  counted: (what: string, n: number, of: number): string => `${what}, ${n} of ${of}`,
  final: 'Always the final semester',
  pick: (block: string): string => `${block} pick`,
  another: (courseCode: string): string => `${courseCode} or another`,
  elective: (name: string): string => name.replace(/s$/, ''),
  forSequence: (codes: readonly string[], kinds: readonly string[]): string => `${either(codes)}, for the ${kinds.join(' or ')} sequence`,
  credits: (count: number): string => `${count} cr`,
  late: (term: string, why: 'split' | 'moved'): string =>
    `This draft ends in ${term}, later than the pace estimate above: ${why === 'moved' ? 'you moved courses later.' : 'courses can’t be split across semesters.'}`,
  // A name with a comma in it closes with one, so that it is heard as one thing.
  moved: (what: string, term: string): string => `${what}${what.includes(',') ? ',' : ''} moved to ${term}.`,
};

/**
 * Everything still to take, in the plan's one order: by level, then the curriculum's
 * order; the final-semester course last. The same reading of the transcript as the
 * checklist's: a course that is passed or in progress is not here.
 */
export function planEntries(standings: readonly CourseStanding[], curriculum: Curriculum, legacy: boolean): PlanEntry[] {
  const placement = placeCourses(standings, curriculum, { legacy });
  const checklist = checklistOf(standings, curriculum, legacy);
  const { electives, finalSemester } = curriculum;
  const entries: (PlanEntry & { order: number })[] = [];
  let order = 0;
  const add = (entry: Omit<PlanEntry, 'nth' | 'final'> & { final?: boolean }): void => { entries.push({ ...entry, nth: null, final: entry.final === true, order: order++ }); };

  // The first open pick, in the curriculum's order, through which a sequence can still be completed names that course.
  let namedSequence = false;
  for (const { block, required, picks } of placement.blocks) {
    for (const place of required) {
      if (place.state !== 'needed') continue;
      const { code: courseCode, title, credits } = place.course;
      add({ key: courseCode, credits, level: hundred(courseCode), course: { code: courseCode, title }, choice: null, final: courseCode === finalSemester });
    }
    for (const pick of picks) {
      const left = pick.options.filter(option => !pick.filled.some(one => one.course.code === option.code));
      const through = left.find(option => checklist.sequenceThrough.includes(option.code));
      for (let n = 0; n < pick.open; n++) {
        const names = left.length <= 3 ? either(left.map(option => option.code)) : through && !namedSequence ? TEXT.another(through.code) : '';
        if (through) namedSequence = true;
        add({
          key: `pick:${block.id}:${pick.group}:${n}`, credits: left[0]?.credits ?? 0, level: Math.min(...left.map(option => hundred(option.code))),
          course: null, choice: names ? `${TEXT.pick(block.name)} (${names})` : TEXT.pick(block.name),
        });
      }
    }
  }
  // The sequence can still be completed, but through no open pick: its course would take a pick that a
  // course of the transcript holds, and that course would then fill an open elective place instead. So
  // one of the elective places is planned as the sequence course, with the place's credits.
  const throughHeld = checklist.sequence.kind === 'open' && !namedSequence ? checklist.sequenceThrough : [];
  // An open elective place: the student chooses; it is planned with the rule's highest level.
  for (let n = 0; n < placement.electives.open; n++) {
    if (n === 0 && throughHeld.length > 0) {
      const kinds = sequencePicks(curriculum).filter(alternative => alternative.courses.some(courseCode => throughHeld.includes(courseCode))).map(alternative => alternative.name.replace(/ sequence$/, ''));
      add({ key: 'sequence', credits: electives.creditsPerCourse, level: Math.min(...throughHeld.map(hundred)), course: null, choice: TEXT.forSequence(throughHeld, kinds) });
      continue;
    }
    add({ key: `elective:${n}`, credits: electives.creditsPerCourse, level: Math.floor(electives.maxNumber / 100) * 100, course: null, choice: TEXT.elective(electives.name) });
  }
  // Both sequence picks are held by other courses: one sequence course is still to take, with its extra credits.
  if (checklist.sequence.kind === 'extra') {
    const alternatives = sequencePicks(curriculum).filter(alternative => alternative.courses.length > 0);
    const codes = alternatives.flatMap(alternative => alternative.courses);
    add({
      key: 'sequence', credits: checklist.extraLeft, level: Math.min(...codes.map(hundred)), course: null,
      choice: TEXT.forSequence(codes, alternatives.map(alternative => alternative.name.replace(/ sequence$/, ''))),
    });
  }

  const sorted = [...entries].sort((a, b) => Number(a.final) - Number(b.final) || a.level - b.level || a.order - b.order);
  // Entries that read the same are counted, so that each can be told apart.
  return sorted.map(one => {
    const entry: PlanEntry = { key: one.key, credits: one.credits, level: one.level, course: one.course, choice: one.choice, nth: null, final: one.final };
    const alike = sorted.filter(other => other.choice !== null && other.choice === entry.choice);
    return alike.length > 1 ? { ...entry, nth: { n: alike.findIndex(other => other.key === entry.key) + 1, of: alike.length } } : entry;
  });
}

/** How many terms the pace answer implies: to the target when on pace; where the fewest or the most finish otherwise. */
const impliedTerms = (pace: Extract<Pace, { kind: 'on' | 'off' }>): number =>
  (pace.detail.kind === 'after' ? pace.terms + pace.detail.semesters : pace.detail.kind === 'before' ? pace.terms - pace.detail.semesters : pace.terms);

/**
 * Lays the entries out over the semesters after the transcript's latest term. Each
 * semester aims at the credits still to place ÷ the semesters left to the end the pace
 * answer implies, within the range; it takes the entries that may go there, in order,
 * each one that still fits under the most. Courses cannot be split.
 */
export function layOut(entries: readonly PlanEntry[], pace: Extract<Pace, { kind: 'on' | 'off' }>, settings: PaceSettings, moves: Moves = {}): Plan {
  const most = Math.max(1, Math.floor(settings.most));
  const fewest = Math.max(1, Math.min(Math.floor(settings.fewest), most));
  const { summers } = settings;
  const implied = impliedTerms(pace);
  const final = entries.find(entry => entry.final) ?? null;
  let waiting = entries.filter(entry => !entry.final);
  const mayGo = (entry: PlanEntry, term: Term): boolean => { const earliest = moves[entry.key]; return earliest === undefined || when(earliest) <= when(term); };
  const semesters: { term: Term; entries: PlanEntry[] }[] = [];

  let term = pace.start;
  // It ends: every entry may go somewhere from its earliest term on, and a term with an entry that may go there always takes one.
  for (let passed = 0; waiting.length > 0; passed++, term = termAfter(term, summers)) {
    const here = term;
    const eligible = waiting.filter(entry => mayGo(entry, here));
    const toPlace = sum(waiting.map(entry => entry.credits)) + (final?.credits ?? 0);
    const aim = Math.min(most, Math.max(fewest, Math.ceil(toPlace / Math.max(1, implied - passed))));
    let taken: PlanEntry[] = [];
    let credits = 0;
    for (const entry of eligible) {
      if (credits >= aim) break;
      // One that does not fit is passed over for the next one that does.
      if (credits + entry.credits > most) continue;
      taken.push(entry);
      credits += entry.credits;
    }
    // A course bigger than the most cannot be split: it gets the semester to itself.
    if (taken.length === 0 && eligible.length > 0) taken = [eligible[0] as PlanEntry];
    // A semester with no entry is not drawn (only moves can leave one).
    if (taken.length > 0) semesters.push({ term: here, entries: taken });
    waiting = waiting.filter(entry => !taken.includes(entry));
  }

  // The final-semester course: the last entry of the last semester when it fits; else a semester of its own.
  if (final) {
    const last = semesters[semesters.length - 1];
    const earliest = moves[final.key];
    if (last && (earliest === undefined || when(earliest) <= when(last.term)) && sum(last.entries.map(entry => entry.credits)) + final.credits <= most) {
      last.entries.push(final);
    } else {
      let own = last ? termAfter(last.term, summers) : pace.start;
      while (earliest !== undefined && when(own) < when(earliest)) own = termAfter(own, summers);
      semesters.push({ term: own, entries: [final] });
    }
  }

  // Where the pace answer implies the end is; later than that is said, with why.
  let end = pace.start;
  for (let n = 1; n < implied; n++) end = termAfter(end, summers);
  const lastTerm = semesters[semesters.length - 1]?.term;
  const isLate = lastTerm !== undefined && when(lastTerm) > when(end);
  // "You moved courses later" only when the moves are the cause: without them the plan would end earlier.
  let why: 'split' | 'moved' = 'split';
  if (isLate && entries.some(entry => moves[entry.key] !== undefined)) {
    const unmoved = layOut(entries, pace, settings).semesters;
    const unmovedLast = unmoved[unmoved.length - 1]?.term;
    if (unmovedLast && when(unmovedLast) < when(lastTerm)) why = 'moved';
  }
  return {
    semesters: semesters.map(one => ({ term: one.term, credits: sum(one.entries.map(entry => entry.credits)), entries: one.entries })),
    late: isLate ? { term: lastTerm, why } : null,
  };
}

/** The draft plan of a reviewed transcript, or null when there is no estimate to plan to (nothing left; no readable term). */
export function planOf(standings: readonly CourseStanding[], curriculum: Curriculum, legacy: boolean, latest: Term | null, settings: PaceSettings, moves: Moves = {}): Plan | null {
  const entries = planEntries(standings, curriculum, legacy);
  const pace = paceOf(sum(entries.map(entry => entry.credits)), latest, settings);
  return pace.kind === 'on' || pace.kind === 'off' ? layOut(entries, pace, settings, moves) : null;
}

/** What "Move later" does to an entry: no earlier than the term after the one it is in. */
export function moveLater(plan: Plan, key: string, settings: PaceSettings, moves: Moves): Moves {
  const semester = plan.semesters.find(one => one.entries.some(entry => entry.key === key));
  return semester ? { ...moves, [key]: termAfter(semester.term, settings.summers) } : moves;
}

// ---- The page ----
const named = (entry: PlanEntry): string => entry.course?.code ?? entry.choice ?? '';
/** The entry as a screen reader hears it on its button: entries that read the same are counted. */
const counted = (entry: PlanEntry): string => (entry.nth ? TEXT.counted(named(entry), entry.nth.n, entry.nth.of) : named(entry));
const buttonName = (entry: PlanEntry): string => TEXT.moveNamed(counted(entry));

const entryHtml = (entry: PlanEntry): string => (entry.course ? `
          <li class="plan-entry">
            <div class="plan-text">
              ${code(entry.course.code, 'strong')}
              <p>${esc(entry.course.title)}</p>${entry.final ? `
              <span class="plan-fixed">${esc(TEXT.final)}</span>` : ''}
            </div>
            <button type="button" class="move no-print" aria-label="${esc(buttonName(entry))}" data-move="${esc(entry.key)}">${icons.move()}<span>${esc(TEXT.move)}</span></button>
          </li>` : `
          <li class="plan-entry is-choice">
            <div class="plan-text">
              <span class="choice-label">${esc(TEXT.choice)}</span>
              <p>${withCodes(entry.choice ?? '')}</p>
            </div>
            <button type="button" class="move no-print" aria-label="${esc(buttonName(entry))}" data-move="${esc(entry.key)}">${icons.move()}<span>${esc(TEXT.move)}</span></button>
          </li>`);

/** The "Draft plan" section; nothing when there is no plan. */
export function planHtml(plan: Plan | null): string {
  if (!plan || plan.semesters.length === 0) return '';
  return `<section class="plan" aria-labelledby="plan-title">
    <div class="section-head">
      <div>
        ${eyebrow(TEXT.eyebrow)}
        <h2 id="plan-title">${esc(TEXT.title)}</h2>
      </div>
    </div>
    <p class="draft-label">${icons.doc(18)}${esc(TEXT.label)}</p>
    <p class="section-note">${esc(TEXT.note)}</p>
    <ol class="semesters">${plan.semesters.map(semester => `
      <li class="semester">
        <header>
          <h3>${esc(termName(semester.term))}</h3>
          <span class="num">${esc(TEXT.credits(semester.credits))}</span>
        </header>
        <ul>${semester.entries.map(entryHtml).join('')}
        </ul>
      </li>`).join('')}
    </ol>${plan.late ? `
    <p class="plan-late">${esc(lateSentence(plan))}</p>` : ''}
  </section>`;
}

/** The line under a plan that ends later than the pace answer implies; nothing otherwise. */
export const lateSentence = (plan: Plan | null): string => (plan?.late ? TEXT.late(termName(plan.late.term), plan.late.why) : '');

/** What is said when an entry has been moved. */
export function movedSentence(plan: Plan, key: string): string {
  const semester = plan.semesters.find(one => one.entries.some(entry => entry.key === key));
  const entry = semester?.entries.find(one => one.key === key);
  return semester && entry ? TEXT.moved(counted(entry), termName(semester.term)) : '';
}
