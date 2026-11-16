// "See what I have left": the student brings their transcript PDF, checks what was read,
// and goes on. The upload panel is the approved design's; the review step is made of its
// pieces (rows, buttons, type, colors). After "Continue" comes the result: the credits left
// and the checklist (src/checklist.ts).
//
// Text printed on a transcript is shown as text. Nothing here says a course counts.
import { checklistOf, legacyChanges, legacyOnTranscript, overviewHtml, requirementsHtml, type Unchecked } from './checklist';
import { normalizeCode, type Curriculum } from './curriculum';
import { code, esc, eyebrow, icons, marks } from './html';
import { LEGACY_NO, LEGACY_QUESTION, LEGACY_YES, type LegacyAnswer } from './legacy';
import { type Problem } from './reader';
import { byTerm, gradeChoices, leaveOut, putBack, reviewRows, reviewedStandings, stillToFix, takenOn, type Correction, type ReviewRow, type Transcript } from './review';
import { FLOW_NAME, foot, top } from './shell';
import { type Refusal } from './upload';
import { ANOTHER_FORGETS, CHANGE, LEGACY_LINE, PRIVACY, USE_ANOTHER, notCurrent, transcriptHasLegacy } from './wording';

/** Where the student is in this flow. */
export interface LeftState {
  transcript: Transcript | null;
  /** The reviewed rows have been handed on. */
  continued: boolean;
  /** Why the last file was not taken, if it was not. */
  refusal: Refusal | null;
  /** The row being edited, by its line. */
  editing: number | null;
  /** What the student has typed in the open edit, kept while the page is drawn again. */
  draft: Correction | null;
  /** Where "Continue" leads: "Check my courses" when the transcript was asked for there. */
  returnTo: 'left' | 'check';
}
export const emptyLeft = (): LeftState => ({ transcript: null, continued: false, refusal: null, editing: null, draft: null, returnTo: 'left' });

const TEXT = {
  drop: 'Drag & drop your transcript PDF here',
  or: 'or',
  browse: 'Browse files',
  reviewHeading: 'Check what was read',
  reviewIntro: (name: string): string => `This is what PathCheck read from ${name}. Correct anything that was misread before you continue.`,
  noTerm: 'Term not read',
  columns: ['Course', 'Credits', 'Grade and what it means'],
  passed: 'Passed',
  inProgress: 'In progress',
  inProgressHint: 'No grade was read. Edit this row if the course already has one.',
  transfer: 'Transfer credit',
  below: (lowest: string): string => `Doesn’t count — below ${lowest}`,
  never: (mark: string): string => `Doesn’t count — ${mark}`,
  outside: 'Not in the CIS curriculum',
  needsFixing: 'Needs fixing',
  unreadable: 'This line could not be read',
  notMine: 'Not on my transcript',
  putBack: 'Put back',
  edit: 'Edit',
  save: 'Save',
  cancel: 'Cancel',
  fields: { term: 'Term', prefix: 'Prefix', number: 'Number', attempted: 'Credits', grade: 'Grade', noGrade: 'No grade yet', transfer: 'Transfer credit' },
  nothingRead: 'No courses were read from this transcript.',
  continue: 'Continue',
  another: USE_ANOTHER,
  anotherNote: ANOTHER_FORGETS,
  returns: `You’ll go back to “${FLOW_NAME.check}”.`,
  uploadHeading: FLOW_NAME.left,
  // The result (docs/design/DESIGN.md "Page 3").
  resultEyebrow: 'What I have left',
  resultHeading: 'Your degree, in focus.',
  pill: 'Synthetic transcript result',
  toFix: (rows: number): string => `${rows} ${rows === 1 ? 'row of your transcript still needs' : 'rows of your transcript still need'} fixing and ${rows === 1 ? 'counts' : 'count'} nothing. A requirement, or the sequence, may show as still needed because of ${rows === 1 ? 'it' : 'them'}.`,
  fix: (rows: number): string => (rows === 1 ? 'Fix it' : 'Fix them'),
  noRows: 'No row of your transcript was taken on, so there is nothing to show yet.',
  reviewAgain: 'Check what was read',
};

const WHAT: Record<Exclude<Problem, 'not-a-row'>, string> = {
  term: 'the term', transfer: 'whether it is transfer credit', code: 'the course code', credits: 'the credits',
  earned: 'the earned credits', points: 'the points', grade: 'the grade', description: 'the description',
};
const REFUSALS: Record<Refusal, string> = {
  'not-made-up': 'PathCheck can only read its two made-up transcripts for now. Nothing from this file was kept or sent.',
  'not-a-pdf': 'That file is not a PDF. Choose the unofficial transcript PDF from the portal.',
  'too-large': 'That file is too large to be a transcript. Nothing from it was read.',
  unreadable: 'That file could not be opened. Choose it again.',
  unavailable: 'Upload isn’t available right now — try again tomorrow',
};
export const refusalText = (refusal: Refusal): string => REFUSALS[refusal];
/** Said when a file arrives while a transcript is already there: it is not read. */
export const ANOTHER_FIRST = 'To use another transcript, choose “Use another transcript” first.';
const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** How many rows go on, and how many are left out and why. */
export function countLine(transcript: Transcript): string {
  const fixing = stillToFix(transcript).length;
  const mine = transcript.leftOut.size;
  return [
    `${plural(takenOn(transcript).length, 'row', 'rows')} taken on.`,
    fixing > 0 ? `${fixing} left out because ${fixing === 1 ? 'it still needs' : 'they still need'} fixing.` : '',
    mine > 0 ? `${mine} left out as not on your transcript.` : '',
  ].filter(Boolean).join(' ');
}
export const fixingLine = (transcript: Transcript): string => {
  const fixing = stillToFix(transcript).length;
  return fixing === 0 ? '' : `${plural(fixing, 'row still needs', 'rows still need')} fixing. ${fixing === 1 ? 'It counts' : 'They count'} nothing until fixed.`;
};

/** The upload panel: the drop zone, "Browse files" and the sentence about what happens to the PDF. */
export const uploadPanel = (refusal: Refusal | null = null): string => `<div class="drop" data-drop>
      <span class="upload-icon">${icons.upload()}</span>
      <p class="drop-title">${esc(TEXT.drop)}</p>
      <span class="drop-or">${esc(TEXT.or)}</span>
      <button type="button" class="btn secondary" data-browse>${esc(TEXT.browse)} ${icons.arrow()}</button>
      <p class="privacy">${icons.doc(20)}${esc(PRIVACY)}</p>
    </div>
    <p class="field-message" data-refusal>${refusal ? esc(refusalText(refusal)) : ''}</p>`;

const whatIsWrong = (problems: readonly Problem[]): string => problems.filter((one): one is Exclude<Problem, 'not-a-row'> => one !== 'not-a-row').map(one => WHAT[one]).join(', ');
/** A row by its course and its term: a course can be on a transcript twice. */
const nameOf = (row: ReviewRow): string => [row.code || TEXT.unreadable, row.term].filter(Boolean).join(', ');

/** The words that say how a row stands, each on its own line. */
function stateLines(row: ReviewRow, curriculum: Curriculum): string {
  const lines: string[] = [];
  if (row.state === 'unreadable') lines.push(`<p class="answer is-no">${esc(TEXT.unreadable)}</p>`);
  else if (row.state === 'to-fix') lines.push(`<p class="answer is-no">${esc(TEXT.needsFixing)}: ${esc(whatIsWrong(row.problems))}</p>`);
  else {
    if (row.transfer) lines.push(`<p class="answer">${esc(TEXT.transfer)}</p>`);
    if (row.state === 'passed') lines.push(`<p class="answer">${esc(TEXT.passed)}</p>`);
    if (row.state === 'in-progress') lines.push(`<p class="answer">${esc(TEXT.inProgress)}</p>`, `<p class="condition">${esc(TEXT.inProgressHint)}</p>`);
    if (row.state === 'below') lines.push(`<p class="answer is-no">${esc(TEXT.below(curriculum.grades.minimumCounting))}</p>`);
    if (row.state === 'never') lines.push(`<p class="answer is-no">${esc(TEXT.never(row.grade))}</p>`);
    if (row.outside === 'none') lines.push(`<p class="condition">${esc(TEXT.outside)}</p>`);
    if (row.outside === 'never') lines.push(`<p class="condition">${esc(notCurrent(row.code))}</p>`);
  }
  return lines.join('\n          ');
}

const editForm = (row: ReviewRow, start: Correction, curriculum: Curriculum): string => {
  const id = (name: string): string => `row-${row.line}-${name}`;
  const text = (name: 'term' | 'prefix' | 'number' | 'attempted', more = ''): string => `<div class="field">
            <label for="${id(name)}">${esc(TEXT.fields[name])}</label>
            <input id="${id(name)}" type="text" data-field="${name}" value="${esc(start[name])}" autocomplete="off" spellcheck="false"${more}>
          </div>`;
  const grades = gradeChoices(curriculum.grades);
  // The whole form is one cell of the row, across its width.
  return `<div role="cell" aria-colspan="${TEXT.columns.length}" class="row-edit-cell">
        <div class="row-edit" role="group" aria-label="${esc(`${TEXT.edit} ${nameOf(row)}`)}" data-editing="${row.line}">
          ${text('term')}
          ${text('prefix', ' autocapitalize="characters" maxlength="8"')}
          ${text('number', ' inputmode="numeric" maxlength="8"')}
          ${text('attempted', ' inputmode="decimal" maxlength="8"')}
          <div class="field">
            <label for="${id('grade')}">${esc(TEXT.fields.grade)}</label>
            <select id="${id('grade')}" data-field="grade">
              <option value=""${start.grade === '' ? ' selected' : ''}>${esc(TEXT.fields.noGrade)}</option>${grades.map(grade => `
              <option value="${esc(grade)}"${grade === start.grade ? ' selected' : ''}>${esc(grade)}</option>`).join('')}${start.grade !== '' && !grades.includes(start.grade) ? `
              <option value="${esc(start.grade)}" selected>${esc(start.grade)}</option>` : ''}
            </select>
          </div>
          <label class="tick" for="${id('transfer')}"><input id="${id('transfer')}" type="checkbox" data-field="transfer"${start.transfer ? ' checked' : ''}> ${esc(TEXT.fields.transfer)}</label>
          <div class="row-actions">
            <button type="button" class="btn primary" data-save="${row.line}">${esc(TEXT.save)}</button>
            <button type="button" class="btn secondary" data-cancel="${row.line}">${esc(TEXT.cancel)}</button>
          </div>
        </div>
      </div>`;
};

/** One row. `open` is the edit that is open, if it is this row's; `busy` says another row is being edited. */
const rowHtml = (row: ReviewRow, open: Correction | null, busy: boolean, curriculum: Curriculum): string => {
  const flagged = row.state === 'to-fix' || row.state === 'unreadable';
  const named = nameOf(row);
  return `
    <div role="row" class="row review-row${row.leftOut ? ' is-left-out' : flagged ? ' is-no' : ''}" data-line="${row.line}">
      <div role="cell" class="cell-name">
        ${row.code ? code(row.code, 'strong') : ''}${row.description ? `
        <p>${esc(row.description)}</p>` : ''}
      </div>
      <span role="cell" class="cell-cr num">${esc(row.credits)}${row.credits === '' ? '' : '<span class="cr-unit"> cr</span>'}</span>
      <div role="cell" class="cell-answer">
        ${flagged && !row.leftOut ? marks.no(20) : ''}
        <div>
          ${row.leftOut ? `<p class="answer">${esc(TEXT.notMine)}</p>` : `${row.grade && !flagged ? `<p class="grade-read">${esc(row.grade)}</p>
          ` : ''}${stateLines(row, curriculum)}`}
          <div class="row-actions">${row.leftOut
    ? `<button type="button" class="text-link" data-back="${row.line}" aria-label="${esc(`${TEXT.putBack} ${named}`)}">${esc(TEXT.putBack)}</button>`
    // One edit at a time: while one is open, the other rows offer none.
    : `${row.editable && !open && !busy ? `<button type="button" class="text-link" data-edit="${row.line}" aria-label="${esc(`${TEXT.edit} ${named}`)}">${esc(TEXT.edit)}</button>` : ''}
            <button type="button" class="text-link" data-out="${row.line}" aria-label="${esc(`${TEXT.notMine}: ${named}`)}">${esc(TEXT.notMine)}</button>`}</div>
        </div>
      </div>${open && row.editable && !row.leftOut ? `
      ${editForm(row, open, curriculum)}` : ''}
    </div>`;
};

/** The review step: the rows under their terms, then what "Continue" will take on. */
export function reviewHtml(state: LeftState, curriculum: Curriculum): string {
  const { transcript } = state;
  if (!transcript) return '';
  const rows = reviewRows(transcript, curriculum);
  const another = `<button type="button" class="btn secondary" data-another>${esc(TEXT.another)}</button>
    <p class="condition">${esc(TEXT.anotherNote)}</p>`;
  if (rows.length === 0) {
    return `<p class="empty-hint">${esc(TEXT.nothingRead)}</p>
  <div class="review-foot">
    ${another}
  </div>`;
  }
  const editing = rows.find(row => row.line === state.editing && row.editable && !row.leftOut);
  return `${byTerm(rows).map((group, i) => `<section class="term" aria-labelledby="term-${i}">
    <h2 id="term-${i}" class="term-name">${esc(group.term || TEXT.noTerm)}</h2>
    <div class="table" role="table" aria-label="${esc(group.term || TEXT.noTerm)}">
      <div class="table-head" role="row">
        ${TEXT.columns.map(heading => `<span role="columnheader">${esc(heading)}</span>`).join('\n        ')}
      </div>${group.rows.map(row => rowHtml(row, row === editing ? state.draft ?? row.editable : null, editing !== undefined, curriculum)).join('')}
    </div>
  </section>`).join('\n  ')}
  <div class="review-foot">
    <p class="review-count">${esc(fixingLine(transcript))}</p>
    <button type="button" class="btn primary" data-continue>${esc(TEXT.continue)} ${icons.arrow()}</button>${state.returnTo === 'check' ? `
    <p class="condition" data-returns>${esc(TEXT.returns)}</p>` : ''}
    ${another}
  </div>`;
}

/**
 * The result: the credits left and the checklist of the reviewed rows. When the legacy
 * answer would change any of it and has not been given, the question takes its place:
 * nothing that the answer could change is shown before it.
 */
export function resultHtml(transcript: Transcript, curriculum: Curriculum, legacy: LegacyAnswer): string {
  const standings = reviewedStandings(transcript, curriculum.grades);
  const fixing = stillToFix(transcript);
  const toFix = fixing.length;
  // The courses that also have a row still to fix. A row whose code could not be read
  // could be any course: then no failed attempt is called final.
  const codes = fixing.map(row => normalizeCode(`${row.seen.prefix} ${row.seen.number}`));
  const unchecked: Unchecked = codes.includes(null) ? 'any' : new Set(codes.flatMap(one => one ?? []));
  const warning = toFix === 0 ? '' : `<div class="note" data-to-fix>
    <p>${icons.doc(20)}${esc(TEXT.toFix(toFix))}</p>
    <button type="button" class="text-link" data-review-again>${esc(TEXT.fix(toFix))}</button>
  </div>
  `;
  const foot = `<p class="review-count" data-handed-on>${esc(countLine(transcript))}</p>
  <div class="review-foot">
    <button type="button" class="btn secondary" data-review-again>${esc(TEXT.reviewAgain)}</button>
    <button type="button" class="btn secondary" data-another>${esc(TEXT.another)}</button>
    <p class="condition">${esc(TEXT.anotherNote)}</p>
  </div>`;
  if (takenOn(transcript).length === 0) return `${warning}<p class="empty-hint" data-no-rows>${esc(TEXT.noRows)}</p>
  ${foot}`;
  const asks = legacyChanges(standings, curriculum, unchecked);
  if (asks && legacy === null) {
    const because = legacyOnTranscript(standings, curriculum);
    return `${warning}<div class="note legacy-first" data-legacy-first>
    <div class="legacy-ask" role="group" aria-label="${esc(LEGACY_QUESTION)}">
      <p>${esc(LEGACY_QUESTION)}</p>
      <div class="legacy-buttons">
        <button type="button" class="btn secondary" data-legacy="yes">${esc(LEGACY_YES)}</button>
        <button type="button" class="btn secondary" data-legacy="no">${esc(LEGACY_NO)}</button>
      </div>${because.length > 0 ? `
      <p class="condition">${esc(transcriptHasLegacy(because))}</p>` : ''}
    </div>
  </div>
  ${foot}`;
  }
  const checklist = checklistOf(standings, curriculum, legacy === true, unchecked);
  return `${warning}${asks ? `<p class="legacy-line">${esc(LEGACY_LINE)} <strong>${esc(legacy ? LEGACY_YES : LEGACY_NO)}</strong> <button type="button" class="text-link" data-legacy-change>${esc(CHANGE)}</button></p>
  ` : ''}${overviewHtml(checklist)}
  ${requirementsHtml(checklist)}
  ${foot}`;
}

export function leftPage(curriculum: Curriculum, state: LeftState = emptyLeft(), legacy: LegacyAnswer = null): string {
  const { transcript } = state;
  const result = transcript !== null && state.continued;
  const heading = !transcript ? TEXT.uploadHeading : result ? TEXT.resultHeading : TEXT.reviewHeading;
  const body = !transcript
    ? `<div class="upload" data-upload>
    ${uploadPanel(state.refusal)}
  </div>`
    : result
      ? resultHtml(transcript, curriculum, legacy)
      : `<p class="review-intro">${esc(TEXT.reviewIntro(transcript.name))}</p>
  <div data-review>${reviewHtml(state, curriculum)}</div>`;
  return `${top('left')}
<main class="left wrap">
  <div class="page-head">
    <div>${result ? `
      ${eyebrow(TEXT.resultEyebrow)}` : ''}
      <h1 tabindex="-1">${esc(heading)}</h1>
    </div>${result ? `
    <span class="pill">${icons.doc(15)}${esc(TEXT.pill)}</span>` : ''}
  </div>
  ${body}
</main>
${foot(curriculum, `PathCheck: ${FLOW_NAME.left}`)}`;
}

/** What the page asks of the app. */
export interface LeftHooks {
  /** Opens the file picker. */
  browse(): void;
  /** Draws the page again from the state. */
  redraw(): void;
  /** Puts a correction in the place of a row and checks it again. */
  correct(line: number, correction: Correction): void;
  /** Says something to a screen reader, in a place the page being drawn again does not replace. */
  say(text: string): void;
  /** "Continue" was pressed: the reviewed rows are handed on. */
  continued(): void;
  /** The legacy question was answered, or the answer is to be asked again (null). */
  legacy(answer: boolean | null): void;
}

/** Wires up the page once it is drawn. */
export function setupLeft(root: ParentNode, state: LeftState, curriculum: Curriculum, hooks: LeftHooks, change: (next: Partial<LeftState>) => void): void {
  const main = root.querySelector<HTMLElement>('main.left');
  if (!main) throw new Error('The "See what I have left" page is missing a part it needs.');
  const focus = (selector: string): void => root.querySelector<HTMLElement>(selector)?.focus();
  const rowAt = (line: number): ReviewRow | undefined => (state.transcript ? reviewRows(state.transcript, curriculum).find(one => one.line === line) : undefined);
  const named = (line: number): string => rowAt(line)?.code || TEXT.unreadable;
  /** What is typed in the open edit, read from its fields. */
  const typed = (line: number): Correction | null => {
    const form = root.querySelector<HTMLElement>(`[data-editing="${line}"]`);
    if (!form) return null;
    const value = (name: string): string => form.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-field="${name}"]`)?.value ?? '';
    return { term: value('term'), prefix: value('prefix'), number: value('number'), attempted: value('attempted'), grade: value('grade'), transfer: form.querySelector<HTMLInputElement>('[data-field="transfer"]')?.checked === true };
  };
  // What is typed in the open edit is kept as it is typed, so that it is still there
  // whenever the page is drawn again: after another row is left out, or on coming back.
  const keepTyped = (): void => {
    const draft = state.editing === null ? null : typed(state.editing);
    if (draft) change({ draft });
  };
  main.addEventListener('input', keepTyped);
  main.addEventListener('change', keepTyped);

  main.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    const lineOf = (name: string): number | null => {
      const value = target?.closest<HTMLElement>(`[data-${name}]`)?.dataset[name];
      return value === undefined || value === '' ? null : Number(value);
    };
    if (target?.closest('[data-browse]')) { hooks.browse(); return; }
    if (target?.closest('[data-another]')) {
      change({ transcript: null, continued: false, refusal: null, editing: null, draft: null });
      hooks.redraw();
      focus('[data-browse]');
      return;
    }
    const { transcript } = state;
    if (!transcript) return;
    // On the result: back to the review, as it was left.
    if (target?.closest('[data-review-again]')) {
      change({ continued: false, editing: null, draft: null });
      hooks.redraw();
      focus('h1');
      return;
    }
    // "All" or "Not done": the done requirements are hidden or shown. Nothing is drawn
    // again, so whatever the student opened stays open.
    const filter = target?.closest<HTMLElement>('[data-reqs]');
    if (filter) {
      const notDone = filter.dataset.reqs === 'not-done';
      for (const button of main.querySelectorAll<HTMLElement>('[data-reqs]')) button.setAttribute('aria-pressed', String(button === filter));
      for (const card of main.querySelectorAll<HTMLElement>('.req[data-status]')) card.hidden = notDone && card.dataset.status === 'Done';
      return;
    }
    // The legacy question, before the result; and the line that lets the student change the answer.
    const answer = target?.closest<HTMLElement>('[data-legacy]')?.dataset.legacy;
    if (answer === 'yes' || answer === 'no') {
      hooks.legacy(answer === 'yes');
      hooks.say(`${LEGACY_LINE} ${answer === 'yes' ? LEGACY_YES : LEGACY_NO}`);
      focus('[data-legacy-change]');
      return;
    }
    if (target?.closest('[data-legacy-change]')) {
      hooks.legacy(null);
      hooks.say(LEGACY_QUESTION);
      focus('[data-legacy="yes"]');
      return;
    }
    if (target?.closest('[data-continue]')) {
      change({ continued: true, editing: null, draft: null });
      hooks.redraw();
      focus('h1');
      hooks.continued();
      return;
    }
    const edit = lineOf('edit');
    if (edit !== null) {
      change({ editing: edit, draft: null });
      hooks.redraw();
      focus(`[data-editing="${edit}"] [data-field]`);
      return;
    }
    const cancel = lineOf('cancel');
    if (cancel !== null) {
      change({ editing: null, draft: null });
      hooks.redraw();
      focus(`[data-edit="${cancel}"]`);
      return;
    }
    const save = lineOf('save');
    if (save !== null) {
      const correction = typed(save);
      if (!correction) return;
      hooks.correct(save, correction);
      change({ editing: null, draft: null });
      hooks.redraw();
      const after = rowAt(save);
      const fixing = state.transcript ? fixingLine(state.transcript) : '';
      hooks.say(after && after.state === 'to-fix'
        ? `${named(save)} still needs fixing: ${whatIsWrong(after.problems)}.`
        : `${named(save)} saved.${fixing ? ` ${fixing}` : ''}`);
      focus(`[data-edit="${save}"]`);
      return;
    }
    const out = lineOf('out');
    if (out !== null) {
      const wasOpen = state.editing === out;
      change({ transcript: leaveOut(transcript, out), ...(wasOpen ? { editing: null, draft: null } : {}) });
      hooks.redraw();
      hooks.say(`${named(out)}: ${TEXT.notMine}.`);
      focus(`[data-back="${out}"]`);
      return;
    }
    const back = lineOf('back');
    if (back !== null) {
      change({ transcript: putBack(transcript, back) });
      hooks.redraw();
      hooks.say(`${named(back)}: ${TEXT.putBack}.`);
      focus(`[data-out="${back}"]`);
    }
  });
}
