// Page 2, "Check my courses": the student enters next semester's courses and each gets one
// answer (docs/design/DESIGN.md). The page is drawn once; after that only the suggestions,
// the filters and the list are redrawn, so the field the student is typing in is never
// replaced.
//
// What the student types is never put into the page as it is: only a course code worked
// out from it.
import { answersFor, legacyMatters, reminderFor, type Answer, type TranscriptUse } from './answers';
import { checklistOf, legacyOnTranscript } from './checklist';
import { FULL_TIME, MOST_UNKNOWN_CREDITS, USUAL_MOST, creditsOf, noteFor, totalsOf } from './credits';
import { type Course, type Curriculum } from './curriculum';
import { addCourse, removeCourse, setCredits, suggest, type Entry } from './entries';
import { code, esc, icons, marks, withCodes } from './html';
import { LEGACY_NO, LEGACY_QUESTION, LEGACY_YES, browserStorage, clearLegacyAnswer, writeLegacyAnswer, type LegacyAnswer } from './legacy';
import { NO_CREDITS_LEFT, PACE_UNREADABLE, defaultSettings, latestTermOf, paceLineOf, readTerm, termName, type PaceLine, type PaceSettings, type Term } from './pace';
import { FLOW_NAME, foot, top } from './shell';
import { countsExample } from './start';
import { type CourseStanding, type JudgedRow } from './transcript';
import { ANOTHER_FORGETS, CAVEAT, CHANGE, COUNT_CONDITION, LEGACY_LINE, transcriptHasLegacy, COUNT_TOWARD, DO_NOT_COUNT, PRIVACY, TOTAL_CREDITS, USE_ANOTHER, WAITING_FOR_LEGACY, belowFullTime, overUsualMost } from './wording';

const TEXT = {
  addLabel: 'Add a course',
  placeholder: 'Course code or title',
  add: 'Add',
  suggestions: 'Suggestions',
  empty: 'Add the courses you plan to take next semester.',
  table: 'Your courses',
  columns: ['Course', 'Credits', 'Does it count?', 'Remove'],
  filterLabel: 'Filter courses',
  all: 'All courses',
  onlyNo: 'Doesn’t count',
  noneMarkedNo: 'No course in your list is marked “Doesn’t count”.',
  legacyLine: LEGACY_LINE,
  change: CHANGE,
  summary: 'Credits',
  noTranscript: 'No transcript added',
  transcriptAdded: 'Transcript added',
  exactTitle: 'Add your transcript for an exact answer',
  choose: 'Choose transcript PDF',
  waiting: 'Your transcript is waiting to be checked.',
  review: 'Check what was read',
  uses: (name: string): string => `Your answers use your transcript (${name}).`,
  notUsed: (name: string): string => `No row of your transcript (${name}) was taken on, so these answers don’t use it.`,
  notExact: (rows: number): string => `${rows} ${rows === 1 ? 'row of your transcript still needs' : 'rows of your transcript still need'} fixing, so these answers are not exact yet. The pace may change too.`,
  // The pace line (the owner's sentence of 2026-11-16).
  credits: (count: number): string => `${count} ${count === 1 ? 'credit' : 'credits'}`,
  ofYour: (counting: number, total: number): string => `${counting} of your ${total} ${total === 1 ? 'credit' : 'credits'}`,
  inTerm: 'in',
  countToward: 'count toward CIS',
  atThisPace: 'at this pace you finish',
  yourTarget: 'your target',
  inYourTarget: 'in your target semester',
  semesters: (count: number): string => (count === 1 ? 'one semester' : `${count} semesters`),
  termLabel: 'Term for these courses',
  targetLabel: 'Target semester',
  noneCount: 'None of these credits counts toward CIS, so this list doesn’t bring you closer to finishing.',
  answerFirst: `Answer “${LEGACY_QUESTION}” to see your pace.`,
  fix: (rows: number): string => (rows === 1 ? 'Fix it' : 'Fix them'),
};
const creditsFor = (courseCode: string): string => `Credits for ${courseCode}`;
// The example code in this message is the Start page's example course, from the curriculum.
export const notACourse = (curriculum: Curriculum): string => `Type a course code like ${countsExample(curriculum).course.code}, or pick a course from the list.`;
export const alreadyThere = (courseCode: string): string => `${courseCode} is already in your list.`;
const added = (courseCode: string): string => `${courseCode} added.`;
const removed = (courseCode: string): string => `${courseCode} removed.`;

/** What the student has entered and chosen on this page. It is kept while they move between pages. */
export interface CourseList {
  entries: readonly Entry[];
  /** The answer to the legacy question, or null when it has not been given. */
  legacy: LegacyAnswer;
  /** Which rows are listed: all of them, or only those that don't count. */
  filter: 'all' | 'no';
  /** The term these courses are for, once the student has chosen one for the pace line. */
  term?: Term | null;
}
export const emptyList = (legacy: LegacyAnswer = null): CourseList => ({ entries: [], legacy, filter: 'all', term: null });

/** Where the student's transcript stands, as this page needs it. */
export type OnCheck =
  /** None yet. `refusal` is why the last file chosen here was not taken. */
  | { readonly state: 'none'; readonly refusal: string | null }
  /** Uploaded, and waiting in the review step. */
  | { readonly state: 'reviewing' }
  /**
   * Reviewed. `use` is what the answers use, or null when no row was taken on; `counts` is
   * the review's line of counts; `toFix` is how many rows still need fixing.
   */
  | { readonly state: 'added'; readonly name: string; readonly use: TranscriptUse | null; readonly counts: string; readonly toFix: number; readonly pace?: PaceSettings };
export const NO_TRANSCRIPT: OnCheck = { state: 'none', refusal: null };
const useOf = (transcript: OnCheck): TranscriptUse | null => (transcript.state === 'added' ? transcript.use : null);

/** The note at the right of the heading. */
export const statusText = (transcript: OnCheck): string => (useOf(transcript) ? TEXT.transcriptAdded : TEXT.noTranscript);

/** The card under the list: add a transcript, go and check it, or what the answers use. */
export function transcriptCard(transcript: OnCheck): string {
  const card = (title: string, lines: string, action: string): string => `<section class="exact" aria-labelledby="exact-title">
    <div class="exact-text">
      ${icons.doc(20)}
      <div>
        <h2 id="exact-title">${esc(title)}</h2>${lines}
      </div>
    </div>
    <div class="exact-action">${action}
    </div>
  </section>`;
  if (transcript.state === 'none') {
    return `${card(TEXT.exactTitle, `
        <p>${esc(PRIVACY)}</p>`, `
      <button type="button" class="btn primary" data-choose>${esc(TEXT.choose)} ${icons.arrow()}</button>`)}
  <p class="field-message" data-refusal>${transcript.refusal ? esc(transcript.refusal) : ''}</p>`;
  }
  if (transcript.state === 'reviewing') {
    return card(TEXT.waiting, '', `
      <button type="button" class="btn secondary" data-review>${esc(TEXT.review)} ${icons.arrow()}</button>`);
  }
  return card(transcript.use ? TEXT.uses(transcript.name) : TEXT.notUsed(transcript.name), `
        <p>${esc(transcript.counts)}</p>${transcript.use && transcript.toFix > 0 ? `
        <p class="exact-warning">${esc(TEXT.notExact(transcript.toFix))}</p>
        <button type="button" class="text-link" data-review>${esc(TEXT.fix(transcript.toFix))}</button>` : ''}`, `
      <button type="button" class="btn secondary" data-another>${esc(USE_ANOTHER)}</button>
      <p>${esc(ANOTHER_FORGETS)}</p>`);
}


export const suggestionsHtml = (courses: readonly Course[], active: number): string =>
  courses.map((course, i) => `
        <li id="suggestion-${i + 1}" role="option" aria-selected="${i === active}" aria-posinset="${i + 1}" aria-setsize="${courses.length}" data-index="${i}">${code(course.code, 'strong')} <span class="truncate">${esc(course.title)}</span></li>`).join('');

/** The "Does it count?" cell: a verdict with its mark, the legacy question, or a line that waits for it. */
const answerCell = (answer: Answer): string => {
  if (answer.kind === 'ask') {
    return `
        <div class="legacy-ask" role="group" aria-label="${esc(LEGACY_QUESTION)}">
          <p>${esc(LEGACY_QUESTION)}</p>
          <div class="legacy-buttons">
            <button type="button" class="btn secondary" data-legacy="yes">${esc(LEGACY_YES)}</button>
            <button type="button" class="btn secondary" data-legacy="no">${esc(LEGACY_NO)}</button>
          </div>${answer.because ? `
          <p class="condition">${withCodes(answer.because)}</p>` : ''}
        </div>`;
  }
  // Needed, but adding nothing: neither mark.
  if (answer.kind === 'needed') {
    return `
        <div>
          <p class="answer">${esc(answer.text)}</p>
        </div>`;
  }
  if (answer.kind === 'waiting') {
    return `
        <div>
          <p class="answer is-waiting">${esc(answer.text)}</p>
        </div>`;
  }
  return `
        ${answer.kind === 'counts' ? marks.counts(20) : marks.no(20)}
        <div>
          <p class="answer ${answer.kind === 'counts' ? 'is-counts' : 'is-no'}">${withCodes(answer.text)}</p>${answer.kind === 'counts' && answer.condition ? `
          <p class="condition">${esc(answer.condition)}</p>` : ''}
        </div>`;
};

// A course PathCheck knows shows its credits. One it doesn't know starts at the default and
// the student can change it: a dropdown, which cannot hold a wrong value.
const creditsCell = (entry: Entry): string => (entry.kind !== 'unknown' ? String(entry.credits)
  : `<select class="credits-select" aria-label="${esc(creditsFor(entry.code))}" data-credits="${esc(entry.code)}">${
    Array.from({ length: MOST_UNKNOWN_CREDITS + 1 }, (_, credits) => `<option value="${credits}"${credits === entry.credits ? ' selected' : ''}>${credits}</option>`).join('')}</select>`);

const row = (entry: Entry, answer: Answer): string => `
    <div role="row" class="row${answer.kind === 'no' ? ' is-no' : ''}">
      <div role="cell" class="cell-name">
        ${code(entry.code, 'strong')}${entry.title ? `
        <p>${esc(entry.title)}</p>` : ''}
      </div>
      <span role="cell" class="cell-cr num">${creditsCell(entry)}<span class="cr-unit"> cr</span></span>
      <div role="cell" class="cell-answer">${answerCell(answer)}
      </div>
      <div role="cell" class="cell-remove">
        <button type="button" class="remove" aria-label="Remove ${esc(entry.code)}" data-remove="${esc(entry.code)}">${icons.x()}</button>
      </div>
    </div>`;

/** The neutral note that goes with the list's total, or nothing. */
export function noteText(list: CourseList): string | null {
  if (list.entries.length === 0) return null;
  const note = noteFor(creditsOf(list.entries));
  return note === 'under' ? belowFullTime(FULL_TIME) : note === 'over' ? overUsualMost(USUAL_MOST) : null;
}

/**
 * The three numbers above the list: total credits, those that count and those that don't.
 * Nothing for an empty list. The count is conditional, and says so, unless a transcript
 * makes the answers exact.
 */
export function summaryHtml(list: CourseList, curriculum: Curriculum, transcript: OnCheck = NO_TRANSCRIPT): string {
  if (list.entries.length === 0) return '';
  const use = useOf(transcript);
  const totals = totalsOf(list.entries, answersFor(list.entries, curriculum, list.legacy, use));
  const note = noteText(list);
  // Under both counts for the eye; read out once.
  const waiting = (heard: boolean): string => (totals.pending ? `<span class="summary-condition"${heard ? '' : ' aria-hidden="true"'}>${esc(WAITING_FOR_LEGACY)}</span>` : '');
  return `<div class="summary" role="group" aria-label="${esc(TEXT.summary)}">
    <div><span class="num">${totals.total}</span><span class="summary-label">${esc(TOTAL_CREDITS)}</span>${note ? `<span class="summary-condition">${esc(note)}</span>` : ''}</div>
    <div><span class="num is-counts">${totals.counts}</span><span class="summary-label">${esc(COUNT_TOWARD)}</span>${use?.exact ? '' : `<span class="summary-condition">${esc(COUNT_CONDITION)}</span>`}${waiting(true)}</div>
    <div><span class="num is-no">${totals.doesNotCount}</span><span class="summary-label">${esc(DO_NOT_COUNT)}</span>${waiting(false)}</div>
  </div>${paceLineHtml(paceLineFor(list, curriculum, transcript))}`;
}

/** What the pace line shows: a line with its two lists; a sentence; or the legacy question in its place. */
export type LineView =
  | { readonly kind: 'line'; readonly line: Extract<PaceLine, { kind: 'line' }> }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'ask'; readonly because: string | null };

/** The transcript's courses with these typed courses taken as well: in progress, as they will be in their term. */
function withTaken(standings: readonly CourseStanding[], codes: readonly string[]): CourseStanding[] {
  const taken = (courseCode: string): JudgedRow => ({ row: { code: courseCode, term: '', credits: 0, grade: null, transfer: false }, standing: 'in-progress' });
  const known = new Set(standings.map(one => one.code));
  return [
    ...standings.map(one => (codes.includes(one.code) ? { ...one, standing: 'in-progress' as const, deciding: taken(one.code), rows: [...one.rows, taken(one.code)] } : one)),
    ...codes.filter(courseCode => !known.has(courseCode)).map(courseCode => ({ code: courseCode, standing: 'in-progress' as const, deciding: taken(courseCode), rows: [taken(courseCode)] })),
  ];
}

/**
 * The pace line for the list, or nothing: only with a reviewed transcript that is used,
 * and at least one course. The pace uses the credits that count toward the degree; a
 * course that doesn't count brings the finish no closer.
 */
export function paceLineFor(list: CourseList, curriculum: Curriculum, transcript: OnCheck): LineView | null {
  const use = useOf(transcript);
  if (!use || transcript.state !== 'added' || list.entries.length === 0) return null;
  const answers = answersFor(list.entries, curriculum, list.legacy, use);
  // The typed courses that count, and what is still to take now and once they are taken.
  // Taking them is worked out on the checklist itself: a course that fills the last pick a
  // sequence could have gone through makes a sequence course necessary, with extra credits.
  const counted = list.entries.filter((_, at) => answers[at]?.kind === 'counts' || answers[at]?.kind === 'needed').map(entry => entry.code);
  const toTake = (asLegacy: boolean): { left: number; after: number } => {
    const now = checklistOf(use.standings, curriculum, asLegacy);
    const then = checklistOf(withTaken(use.standings, counted), curriculum, asLegacy);
    return { left: now.credits.left + now.extraLeft, after: then.credits.left + then.extraLeft };
  };
  if (list.legacy === null) {
    // No finish before a legacy answer that could change it: asked on a row, or here.
    if (answers.some(answer => answer.kind === 'ask')) return { kind: 'text', text: TEXT.answerFirst };
    const [yes, no] = [toTake(true), toTake(false)];
    if (yes.left !== no.left || yes.after !== no.after) {
      const because = legacyOnTranscript(use.standings, curriculum);
      return { kind: 'ask', because: because.length > 0 ? transcriptHasLegacy(because) : null };
    }
  }
  const totals = totalsOf(list.entries, answers);
  const line = paceLineOf({
    ...toTake(list.legacy === true), counting: totals.counts + totals.needed, total: totals.total,
    latest: latestTermOf(use.standings), term: list.term ?? null, settings: transcript.pace ?? defaultSettings(),
  });
  if (line.kind === 'line') return { kind: 'line', line };
  return { kind: 'text', text: line.kind === 'none' ? NO_CREDITS_LEFT : line.kind === 'unreadable' ? PACE_UNREADABLE : TEXT.noneCount };
}

const lineParts = (line: Extract<PaceLine, { kind: 'line' }>): { before: string; middle: string; after: string } => {
  const credits = line.counting === line.total ? `${TEXT.credits(line.counting)} ${TEXT.inTerm}` : `${TEXT.ofYour(line.counting, line.total)} ${TEXT.inTerm}`;
  const counted = line.counting === line.total ? '' : ` ${TEXT.countToward}`;
  const { compare } = line;
  return compare.kind === 'on'
    ? { before: credits, middle: `${counted} — ${TEXT.atThisPace} ${TEXT.inYourTarget}`, after: '.' }
    : { before: credits, middle: `${counted} — ${TEXT.atThisPace} ${termName(line.finish)}, ${TEXT.semesters(compare.semesters)} ${compare.kind} ${TEXT.yourTarget}`, after: '.' };
};

/** The pace line as one sentence, as it is read out: the term by name, the target not repeated. */
export function paceLineSentence(view: LineView | null): string {
  if (!view) return '';
  if (view.kind === 'text') return view.text;
  if (view.kind === 'ask') return LEGACY_QUESTION;
  const parts = lineParts(view.line);
  return `${parts.before} ${termName(view.line.term)}${parts.middle}${parts.after}`;
}

const termList = (label: string, marker: string, terms: readonly Term[], chosen: Term): string => `<select class="line-select" aria-label="${esc(label)}" ${marker}>${
  terms.map(term => `<option value="${esc(termName(term))}"${termName(term) === termName(chosen) ? ' selected' : ''}>${esc(termName(term))}</option>`).join('')}</select>`;

/** The pace line under the numbers; nothing without a transcript. A finish is never named without the caveat. */
export function paceLineHtml(view: LineView | null): string {
  if (!view) return '';
  if (view.kind === 'text') return `<p class="pace-line" data-pace-line>${esc(view.text)}</p>`;
  if (view.kind === 'ask') {
    return `<div class="pace-line" data-pace-line>
    <div class="legacy-ask" role="group" aria-label="${esc(LEGACY_QUESTION)}">
      <p>${esc(LEGACY_QUESTION)}</p>
      <div class="legacy-buttons">
        <button type="button" class="btn secondary" data-legacy="yes">${esc(LEGACY_YES)}</button>
        <button type="button" class="btn secondary" data-legacy="no">${esc(LEGACY_NO)}</button>
      </div>${view.because ? `
      <p class="condition">${withCodes(view.because)}</p>` : ''}
    </div>
  </div>`;
  }
  const { line } = view;
  const parts = lineParts(line);
  return `<div class="pace-line" data-pace-line>
    <p>${esc(parts.before)} ${termList(TEXT.termLabel, 'data-line-term', line.terms, line.term)}${esc(parts.middle)} ${termList(TEXT.targetLabel, 'data-line-target', line.targets, line.target)}${esc(parts.after)}</p>
    <p class="caveat">${esc(CAVEAT)}</p>
  </div>`;
}

/** The two filter buttons; nothing while the list is empty. */
export const filtersHtml = (list: CourseList): string => (list.entries.length === 0 ? '' : `<div class="filters" role="group" aria-label="${esc(TEXT.filterLabel)}">
      <button type="button" aria-pressed="${list.filter === 'all'}" data-filter="all">${esc(TEXT.all)}</button>
      <button type="button" aria-pressed="${list.filter === 'no'}" data-filter="no">${marks.no(16)}${esc(TEXT.onlyNo)}</button>
    </div>`);

/** The list of entered courses with their answers, and what goes under it; or the line that says there are none yet. */
export function entriesHtml(list: CourseList, curriculum: Curriculum, transcript: OnCheck = NO_TRANSCRIPT): string {
  const { entries, legacy, filter } = list;
  if (entries.length === 0) return `<p class="empty-hint">${esc(TEXT.empty)}</p>`;
  const use = useOf(transcript);
  const answers = answersFor(entries, curriculum, legacy, use);
  const rows = entries.map((entry, i) => ({ entry, answer: answers[i] as Answer })).filter(one => filter === 'all' || one.answer.kind === 'no');
  const reminder = reminderFor(entries, curriculum, use);
  return `${rows.length === 0 ? `<p class="empty-hint">${esc(TEXT.noneMarkedNo)}</p>` : `<div class="table" role="table" aria-label="${esc(TEXT.table)}">
    <div class="table-head" role="row">
      ${TEXT.columns.map((heading, i) => `<span role="columnheader"${i === 3 ? ' class="sr-only"' : ''}>${esc(heading)}</span>`).join('\n      ')}
    </div>${rows.map(one => row(one.entry, one.answer)).join('')}
  </div>`}${legacy !== null && (legacyMatters(entries, curriculum, use) || paceLineFor({ ...list, legacy: null }, curriculum, transcript)?.kind === 'ask') ? `
  <p class="legacy-line">${esc(TEXT.legacyLine)} <strong>${esc(legacy ? LEGACY_YES : LEGACY_NO)}</strong> <button type="button" class="text-link" data-legacy-change>${esc(TEXT.change)}</button></p>` : ''}${reminder ? `
  <p class="note">${icons.doc(20)}${withCodes(reminder)}</p>` : ''}`;
}

export const checkPage = (curriculum: Curriculum, list: CourseList = emptyList(), transcript: OnCheck = NO_TRANSCRIPT): string => `${top('check')}
<main class="check">
  <div class="page-head">
    <div>
      <h1 tabindex="-1">${esc(FLOW_NAME.check)}</h1>
    </div>
    <span class="page-status" data-status>${esc(statusText(transcript))}</span>
  </div>

  <div data-summary>${summaryHtml(list, curriculum, transcript)}</div>

  <div class="toolbar">
    <div class="search">
      <label for="add-course">${esc(TEXT.addLabel)}</label>
      <div class="search-row">
        <input id="add-course" type="text" role="combobox" aria-expanded="false" aria-controls="suggestions" aria-autocomplete="list" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" placeholder="${esc(TEXT.placeholder)}">
        <button type="button" class="btn primary add" data-add disabled>${esc(TEXT.add)}</button>
      </div>
      <ul id="suggestions" role="listbox" aria-label="${esc(TEXT.suggestions)}" class="suggestions" hidden></ul>
      <p id="add-message" class="field-message" role="status" aria-live="polite"></p>
    </div>
    <div data-filters>${filtersHtml(list)}</div>
  </div>

  <div data-entries>${entriesHtml(list, curriculum, transcript)}</div>
  <div data-transcript>${transcriptCard(transcript)}</div>
  <p class="sr-only" role="status" aria-live="polite" data-said></p>
</main>
${foot(curriculum, `PathCheck: ${FLOW_NAME.check}`, true)}`;

/** What the page asks of the app about the transcript. */
export interface CheckHooks {
  /** Opens the file picker. */
  browse(): void;
  /** Forgets the transcript. */
  forget(): void;
  /** Opens the review step, to come back here after it. */
  review(): void;
  /** The student chose a target semester: it is the one of "See what I have left" too. */
  target(term: Term): void;
}
/** The page once it is wired up. */
export interface CheckView {
  /** Draws again everything that depends on the transcript. What is typed in the field stays. */
  refresh(): void;
}
const NO_HOOKS: CheckHooks = { browse: () => undefined, forget: () => undefined, review: () => undefined, target: () => undefined };

/** Wires up the page once it is drawn. `transcript` gives where the transcript stands now. */
export function setupCheck(root: ParentNode, list: CourseList, curriculum: Curriculum, transcript: () => OnCheck = () => NO_TRANSCRIPT, hooks: CheckHooks = NO_HOOKS): CheckView {
  const input = root.querySelector<HTMLInputElement>('#add-course');
  const add = root.querySelector<HTMLButtonElement>('[data-add]');
  const menu = root.querySelector<HTMLElement>('#suggestions');
  const message = root.querySelector<HTMLElement>('#add-message');
  const summary = root.querySelector<HTMLElement>('[data-summary]');
  const filters = root.querySelector<HTMLElement>('[data-filters]');
  const region = root.querySelector<HTMLElement>('[data-entries]');
  const said = root.querySelector<HTMLElement>('[data-said]');
  const status = root.querySelector<HTMLElement>('[data-status]');
  const card = root.querySelector<HTMLElement>('[data-transcript]');
  if (!input || !add || !menu || !message || !summary || !filters || !region || !said || !status || !card) throw new Error('The "Check my courses" page is missing a part it needs.');

  // What is suggested for the text in the field, which of them is highlighted, and whether
  // the list is showing. Leaving the field hides the list but keeps the highlight, so that
  // "Add" still adds the course the student was looking at.
  let suggestions: Course[] = [];
  let active = 0;
  let showing = false;

  const mark = (): void => {
    const open = showing && suggestions.length > 0;
    menu.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    if (open) input.setAttribute('aria-activedescendant', `suggestion-${active + 1}`);
    else input.removeAttribute('aria-activedescendant');
    // Only the highlight moves: the options themselves stay, under the pointer and for a screen reader.
    menu.querySelectorAll('[role="option"]').forEach((option, i) => option.setAttribute('aria-selected', String(i === active)));
  };
  const offer = (courses: Course[]): void => {
    suggestions = courses;
    active = 0;
    showing = true;
    menu.innerHTML = suggestionsHtml(suggestions, active);
    mark();
  };
  const close = (): void => offer([]);
  const highlight = (index: number): void => { active = index; mark(); };
  // A fresh piece of text each time, so that the same sentence is read out again.
  const say = (where: HTMLElement, text: string): void => where.replaceChildren(text);
  // Every answer is worked out again from the whole list.
  const drawList = (): void => {
    // The filters go with the list: an empty list has none, and the next one starts with all its rows.
    if (list.entries.length === 0) list.filter = 'all';
    summary.innerHTML = summaryHtml(list, curriculum, transcript());
    filters.innerHTML = filtersHtml(list);
    region.innerHTML = entriesHtml(list, curriculum, transcript());
  };
  const refresh = (): void => {
    status.textContent = statusText(transcript());
    card.innerHTML = transcriptCard(transcript());
    drawList();
  };
  // What changed is read out; a note about the total is added when it appears or changes,
  // not every time the list changes under it.
  let lastNote = noteText(list);
  // The pace line as it now stands goes into the same message, so that neither is lost.
  const announce = (what: string): void => {
    const note = noteText(list);
    const pace = paceLineSentence(paceLineFor(list, curriculum, transcript()));
    const parts = [what, note !== null && note !== lastNote ? note : '', pace].filter(Boolean);
    say(said, parts.map((part, at) => (at < parts.length - 1 && !/[.!?]$/.test(part) ? `${part}.` : part)).join(' '));
    lastNote = note;
  };

  const addNow = (course: Course | null): void => {
    const result = addCourse(list.entries, course ? '' : input.value, course ?? suggestions[active] ?? null, curriculum);
    if ('added' in result) {
      list.entries = result.entries;
      drawList();
      input.value = '';
      add.disabled = true;
      say(message, '');
      announce(added(result.added.code));
      close();
    } else {
      say(message, result.problem === 'already-there' ? alreadyThere(result.code) : notACourse(curriculum));
    }
    input.focus();
  };

  input.addEventListener('input', () => {
    say(message, '');
    add.disabled = input.value.trim() === '';
    offer(suggest(input.value, curriculum));
  });
  input.addEventListener('keydown', event => {
    // Text still being put together by an input method is not finished: leave its keys alone.
    if (event.isComposing || event.keyCode === 229) return;
    const open = showing && suggestions.length > 0;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (input.value.trim() !== '') addNow(null);
    } else if (event.key === 'Escape') {
      if (open) { event.preventDefault(); close(); }
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && open) {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      highlight((active + step + suggestions.length) % suggestions.length);
    }
  });
  // Leaving the field (Tab, or a press elsewhere) hides the list and keeps the text; coming
  // back shows it again.
  input.addEventListener('blur', () => { showing = false; mark(); });
  input.addEventListener('focus', () => { showing = true; mark(); });

  const optionAt = (target: EventTarget | null): number | null => {
    const option = target instanceof Element ? target.closest<HTMLElement>('[data-index]') : null;
    return option ? Number(option.dataset.index) : null;
  };
  // A press on the list or on "Add" must not take the keyboard out of the field: the list
  // would be gone before the click lands.
  menu.addEventListener('mousedown', event => event.preventDefault());
  add.addEventListener('mousedown', event => event.preventDefault());
  add.addEventListener('click', () => addNow(null));
  // Only a pointer that moves: a list opening under a resting mouse changes nothing.
  menu.addEventListener('mousemove', event => {
    const index = optionAt(event.target);
    if (index !== null && index !== active) highlight(index);
  });
  menu.addEventListener('click', event => {
    const index = optionAt(event.target);
    const course = index === null ? undefined : suggestions[index];
    if (course) addNow(course);
  });

  filters.addEventListener('click', event => {
    const chosen = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-filter]')?.dataset.filter : undefined;
    if (chosen !== 'all' && chosen !== 'no') return;
    list.filter = chosen;
    drawList();
    filters.querySelector<HTMLElement>(`[data-filter="${chosen}"]`)?.focus();
  });

  // The two lists of the pace line, and the legacy question when it stands in the line's
  // place. The numbers and the line are drawn again; the keyboard goes back to the list.
  summary.addEventListener('change', event => {
    const chosen = event.target instanceof HTMLSelectElement ? event.target : null;
    const term = chosen ? readTerm(chosen.value) : null;
    if (!chosen || !term) return;
    const marker = chosen.matches('[data-line-term]') ? '[data-line-term]' : chosen.matches('[data-line-target]') ? '[data-line-target]' : null;
    if (!marker) return;
    if (marker === '[data-line-term]') list.term = term;
    else hooks.target(term);
    summary.innerHTML = summaryHtml(list, curriculum, transcript());
    say(said, paceLineSentence(paceLineFor(list, curriculum, transcript())));
    summary.querySelector<HTMLElement>(marker)?.focus();
  });
  summary.addEventListener('click', event => {
    const answer = (event.target instanceof Element ? event.target : null)?.closest<HTMLElement>('[data-legacy]')?.dataset.legacy;
    if (answer !== 'yes' && answer !== 'no') return;
    list.legacy = answer === 'yes';
    writeLegacyAnswer(browserStorage(), list.legacy);
    drawList();
    announce(`${TEXT.legacyLine} ${list.legacy ? LEGACY_YES : LEGACY_NO}`);
    (region.querySelector<HTMLElement>('[data-legacy-change]') ?? summary.querySelector<HTMLElement>('[data-line-term]') ?? input).focus();
  });

  // The credits of a course PathCheck doesn't know. Only the numbers above the list are
  // drawn again: the row, and the dropdown the student is on, stay as they are.
  region.addEventListener('change', event => {
    const chosen = event.target instanceof HTMLSelectElement && event.target.dataset.credits ? event.target : null;
    if (!chosen) return;
    list.entries = setCredits(list.entries, chosen.dataset.credits ?? '', Number(chosen.value));
    summary.innerHTML = summaryHtml(list, curriculum, transcript());
    // The new total is read out, with the note if one has appeared.
    announce(`${TOTAL_CREDITS}: ${creditsOf(list.entries)}.`);
  });

  region.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    // The legacy question, answered on a row; and the line that lets the student change it.
    const answer = target?.closest<HTMLElement>('[data-legacy]')?.dataset.legacy;
    if (answer === 'yes' || answer === 'no') {
      list.legacy = answer === 'yes';
      writeLegacyAnswer(browserStorage(), list.legacy);
      drawList();
      // Every row has changed: say which answer they now follow.
      announce(`${TEXT.legacyLine} ${list.legacy ? LEGACY_YES : LEGACY_NO}`);
      (region.querySelector<HTMLElement>('[data-legacy-change]') ?? input).focus();
      return;
    }
    if (target?.closest('[data-legacy-change]')) {
      list.legacy = null;
      clearLegacyAnswer(browserStorage());
      drawList();
      announce(LEGACY_QUESTION);
      (region.querySelector<HTMLElement>('[data-legacy]') ?? summary.querySelector<HTMLElement>('[data-legacy]') ?? input).focus();
      return;
    }
    const gone = target?.closest<HTMLElement>('[data-remove]')?.dataset.remove;
    if (!gone) return;
    const shown = [...region.querySelectorAll<HTMLElement>('[data-remove]')].map(button => button.dataset.remove);
    const at = shown.indexOf(gone);
    list.entries = removeCourse(list.entries, gone);
    drawList();
    announce(removed(gone));
    // The keyboard goes to the next course's Remove button, or back to the field.
    const buttons = region.querySelectorAll<HTMLElement>('[data-remove]');
    (buttons[Math.min(at, buttons.length - 1)] ?? input).focus();
  });

  // The transcript card: choose a PDF, go to the review, or forget the transcript.
  card.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-choose]')) hooks.browse();
    else if (target?.closest('[data-review]')) hooks.review();
    else if (target?.closest('[data-another]')) {
      hooks.forget();
      list.term = null;
      refresh();
      say(said, TEXT.noTranscript);
      card.querySelector<HTMLElement>('[data-choose]')?.focus();
    }
  });
  return { refresh };
}
