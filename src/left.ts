// "See what I have left": the student brings their transcript PDF, checks what was read,
// and goes on. The upload panel is the approved design's; the review step is made of its
// pieces (rows, buttons, type, colors). The checklist that follows is another feature.
//
// Text printed on a transcript is shown as text. Nothing here says a course counts.
import { type Curriculum } from './curriculum';
import { code, esc, icons, marks } from './html';
import { type Problem } from './reader';
import { byTerm, gradeChoices, leaveOut, putBack, reviewRows, stillToFix, takenOn, type Correction, type ReviewRow, type Transcript } from './review';
import { FLOW_NAME, foot, top } from './shell';
import { type Refusal } from './upload';
import { PRIVACY, notCurrent } from './wording';

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
}
export const emptyLeft = (): LeftState => ({ transcript: null, continued: false, refusal: null, editing: null, draft: null });

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
  another: 'Use another transcript',
  anotherNote: 'Choosing another transcript forgets your corrections.',
  resultHeading: FLOW_NAME.left,
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
  return `<div role="cell" class="row-edit-cell">
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
    <button type="button" class="btn primary" data-continue>${esc(TEXT.continue)} ${icons.arrow()}</button>
    ${another}
  </div>`;
}

export function leftPage(curriculum: Curriculum, state: LeftState = emptyLeft()): string {
  const { transcript } = state;
  const heading = transcript && !state.continued ? TEXT.reviewHeading : TEXT.resultHeading;
  const body = !transcript
    ? `<div class="upload" data-upload>
    ${uploadPanel(state.refusal)}
  </div>`
    : state.continued
      ? `<p class="review-count" data-handed-on>${esc(countLine(transcript))}</p>
  <div class="review-foot">
    <button type="button" class="btn secondary" data-another>${esc(TEXT.another)}</button>
  </div>`
      : `<p class="review-intro">${esc(TEXT.reviewIntro(transcript.name))}</p>
  <div data-review>${reviewHtml(state, curriculum)}</div>`;
  return `${top('left')}
<main class="left wrap">
  <div class="page-head">
    <div>
      <h1 tabindex="-1">${esc(heading)}</h1>
    </div>
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
  // The page is drawn again after an action on another row: what is being typed is kept.
  const redrawKeepingEdit = (): void => {
    if (state.editing !== null) change({ draft: typed(state.editing) ?? state.draft });
    hooks.redraw();
  };

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
    if (target?.closest('[data-continue]')) {
      change({ continued: true, editing: null, draft: null });
      hooks.redraw();
      focus('h1');
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
      redrawKeepingEdit();
      hooks.say(`${named(out)}: ${TEXT.notMine}.`);
      focus(`[data-back="${out}"]`);
      return;
    }
    const back = lineOf('back');
    if (back !== null) {
      change({ transcript: putBack(transcript, back) });
      redrawKeepingEdit();
      hooks.say(`${named(back)}: ${TEXT.putBack}.`);
      focus(`[data-out="${back}"]`);
    }
  });
}
