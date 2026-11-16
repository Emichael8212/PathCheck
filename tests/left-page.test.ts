// @vitest-environment happy-dom
// F11: "See what I have left" in a simulated browser: choosing and dropping a transcript,
// the review step, correcting and leaving out rows, and continuing (docs/sprints/F11.md).
// A real file picker and a real drag and drop are checked by the evaluator in a browser.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startApp, type App, type AppWindow } from '../src/app';
import { curriculum } from '../src/curriculum';
import { openTranscript, reviewedStandings } from '../src/review';

const folder = join(import.meta.dirname, '..', 'synthetic', 'transcripts');
const fileOf = (bytes: Uint8Array, name = 'transcript.pdf') => ({ name, size: bytes.length, arrayBuffer: async (): Promise<ArrayBuffer> => bytes.slice().buffer as ArrayBuffer });
const madeUp = (name: string) => fileOf(new Uint8Array(readFileSync(join(folder, `${name}.pdf`))), `${name}.pdf`);
const tidy = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim();
const $ = <T extends HTMLElement>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`nothing matches ${selector}`);
  return found;
};
const heading = (): string => tidy($('h1').textContent);
// What a screen reader is told: one line beside the page, which the page being drawn again does not replace.
const said = (): string => tidy($('#pathcheck-status').textContent);
const rows = (): string[] => [...document.querySelectorAll('.review-row')].map(row => tidy(row.textContent));
const rowOf = (line: number): string => tidy($(`[data-line="${line}"]`).textContent);
const go = (hash: string): void => {
  window.history.replaceState(null, '', hash);
  window.dispatchEvent(new Event('hashchange'));
};
type Row = Record<string, unknown>;
const good = (over: Row = {}): Row => ({ term: 'Fall 2025', transfer: false, prefix: 'MGT', number: '321', description: 'Prin of Management', attempted: 3, earned: 3, grade: 'B', points: 9, ...over });
const codesHandedOn = (): string[] => (app.left.transcript ? reviewedStandings(app.left.transcript, curriculum.grades).map(one => one.code) : []);
const setField = (line: number, name: string, value: string): void => { $<HTMLInputElement>(`[data-editing="${line}"] [data-field="${name}"]`).value = value; };
// Opens a row's edit. (The simulated browser does not honour the selected option of a list
// made from HTML text, so the grade read is put into the list as a real browser shows it.)
const openEdit = (line: number): void => {
  $(`[data-edit="${line}"]`).click();
  const grade = $<HTMLSelectElement>(`#row-${line}-grade`);
  grade.value = grade.querySelector('option[selected]')?.getAttribute('value') ?? '';
};
/** The grade an open edit shows as chosen, put into the list as a real browser has it. */
const gradeShown = (line: number): string => {
  const grade = $<HTMLSelectElement>(`#row-${line}-grade`);
  grade.value = grade.querySelector('option[selected]')?.getAttribute('value') ?? '';
  return grade.value;
};
/** A file dragged over, or dropped on, a part of the page. */
const drag = (type: 'dragover' | 'drop', target: Element, types: string[], files: unknown[] = []): { prevented: boolean; effect: string } => {
  const dataTransfer = { types, files, dropEffect: '' };
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  target.dispatchEvent(event);
  return { prevented: event.defaultPrevented, effect: dataTransfer.dropEffect };
};

let app: App;
/** Opens the review step on a prepared reader's answer, as if its PDF had been read. */
const review = (...answerRows: unknown[]): void => {
  Object.assign(app.left, { transcript: openTranscript('made-up.pdf', { rows: answerRows }, curriculum), continued: false, refusal: null, editing: null, draft: null });
  go('#/left');
};
beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  window.history.replaceState(null, '', '#/left');
  app = startApp(window as unknown as AppWindow);
});
// Each test's app stops listening to the window, so that it takes no part in the next test.
afterEach(() => { app.stop(); });

describe('bringing a transcript', () => {
  it('reviews a chosen transcript', async () => {
    expect(heading()).toBe('See what I have left');
    expect(document.querySelector('[data-drop] [data-browse]')).not.toBeNull();
    await app.takeFile(madeUp('sample-a'));
    expect(app.route).toBe('left');
    expect(heading()).toBe('Check what was read');
    // The keyboard is on the heading of the review step.
    expect(document.activeElement).toBe($('h1'));
    expect(document.title).toBe('See what I have left — PathCheck');
    expect([...document.querySelectorAll('.term-name')].map(one => one.textContent)).toEqual(['Fall 2025', 'Spr 2026', 'Fall 2026']);
    expect(rows()).toHaveLength(17);
    expect(rows()[0]).toBe('ORI 100 First Year Experience 1 cr A Passed Edit Not on my transcript');
    expect(document.querySelector('[data-drop]')).toBeNull();
    expect(tidy($('.review-intro').textContent)).toContain('sample-a.pdf');
  });

  it('opens the file picker from "Browse files", here and on Start', async () => {
    const made: HTMLInputElement[] = [];
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const element = create(tag);
      if (tag === 'input') { made.push(element as HTMLInputElement); vi.spyOn(element as HTMLInputElement, 'click').mockImplementation(() => undefined); }
      return element;
    }) as typeof document.createElement);
    $('[data-browse]').click();
    go('#/');
    $('[data-browse]').click();
    expect(made).toHaveLength(2);
    for (const input of made) {
      expect(input.type).toBe('file');
      expect(input.accept).toBe('application/pdf,.pdf');
      expect(input.click).toHaveBeenCalledTimes(1);
      // Made for the moment: no page has a field of its own to fill in.
      expect(input.isConnected).toBe(false);
    }
    expect(document.querySelector('input')).toBeNull();
    // Choosing a file in the picker opened on Start brings the review on the page of this flow.
    Object.defineProperty(made[1], 'files', { value: [madeUp('sample-b')] });
    made[1]!.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(app.route).toBe('left'));
    expect(heading()).toBe('Check what was read');
    expect(window.location.hash).toBe('#/left');
    vi.restoreAllMocks();
  });

  it('takes a transcript dropped on Start', async () => {
    go('#/');
    // Away from the drop zone a file is not opened by the browser, and not taken: the page says so while it is dragged.
    expect(drag('dragover', $('h1'), ['Files'])).toEqual({ prevented: true, effect: 'none' });
    expect(drag('drop', $('h1'), ['Files'], [madeUp('sample-a')]).prevented).toBe(true);
    await Promise.resolve();
    expect(app.route).toBe('start');
    expect(app.left.transcript).toBeNull();
    // On the drop zone it is taken, and the review opens on the page of this flow.
    expect(drag('dragover', $('[data-drop] .drop-title'), ['Files'])).toEqual({ prevented: true, effect: 'copy' });
    expect(drag('drop', $('[data-drop] .drop-title'), ['Files'], [madeUp('sample-a')]).prevented).toBe(true);
    await vi.waitFor(() => expect(app.route).toBe('left'));
    expect(heading()).toBe('Check what was read');
    expect(rows()).toHaveLength(17);
    // During a review a dropped file is not read; the page says how to use another one. The
    // drag is let through (a browser gives no drop where the page refused the drag).
    expect(said()).toBe('');
    expect(drag('dragover', $('main'), ['Files'])).toEqual({ prevented: true, effect: 'copy' });
    drag('drop', $('main'), ['Files'], [{ name: 'x.pdf', size: 1, arrayBuffer: () => { throw new Error('read'); } }]);
    expect(said()).toBe('To use another transcript, choose “Use another transcript” first.');
    expect(rows()).toHaveLength(17);
    // The same after "Continue".
    $('[data-continue]').click();
    expect(drag('dragover', $('main'), ['Files']).effect).toBe('copy');
    // Dragged text is left alone.
    expect(drag('dragover', $('main'), ['text/plain'])).toEqual({ prevented: false, effect: '' });
    expect(drag('drop', $('main'), ['text/plain']).prevented).toBe(false);
  });

  it('takes the same file twice, and another after it', async () => {
    await app.takeFile(madeUp('sample-a'));
    $('[data-another]').click();
    expect(heading()).toBe('See what I have left');
    expect(app.left.transcript).toBeNull();
    expect(document.activeElement).toBe($('[data-browse]'));
    await app.takeFile(madeUp('sample-a'));
    expect(rows()).toHaveLength(17);
    $('[data-another]').click();
    await app.takeFile(madeUp('sample-b'));
    expect([...document.querySelectorAll('.term-name')].map(one => one.textContent)).toEqual(['Transfer Credit', 'Fall 2024', 'Spr 2025', 'Fall 2025']);
    expect(rows()).toHaveLength(16);
    // Transfer credit shows no credits, as on the transcript; its edit starts with none, and saves as it is.
    expect(rowOf(0)).toBe('ENG 131 English Comp I T Transfer credit Passed Edit Not on my transcript');
    openEdit(0);
    expect($<HTMLInputElement>('#row-0-attempted').value).toBe('');
    $('[data-save="0"]').click();
    expect(rowOf(0)).toBe('ENG 131 English Comp I T Transfer credit Passed Edit Not on my transcript');
  });

  it('says why a file was not taken, and stays ready for another', async () => {
    const text = (words: string): Uint8Array => new TextEncoder().encode(words);
    const cases: [ReturnType<typeof fileOf>, string][] = [
      [fileOf(text('%PDF-1.7 some other document')), 'PathCheck can only read its two made-up transcripts for now. Nothing from this file was kept or sent.'],
      [fileOf(text('ENG 131 B'), 'transcript.pdf'), 'That file is not a PDF. Choose the unofficial transcript PDF from the portal.'],
      [{ ...fileOf(text('%PDF-')), size: 11 * 1024 * 1024 }, 'That file is too large to be a transcript. Nothing from it was read.'],
    ];
    for (const [file, sentence] of cases) {
      await app.takeFile(file);
      expect(tidy($('[data-refusal]').textContent)).toBe(sentence);
      // It is also said to a screen reader, in the line beside the page.
      expect(said()).toBe(sentence);
      expect(heading()).toBe('See what I have left');
      expect(document.activeElement).toBe($('[data-browse]'));
      expect(app.left.transcript).toBeNull();
    }
    // From Start, the reason is shown on the page of this flow.
    go('#/');
    await app.takeFile(fileOf(text('nope')));
    expect(app.route).toBe('left');
    expect(tidy($('[data-refusal]').textContent)).toContain('not a PDF');
    // A good file afterwards is taken, and the reason is gone.
    await app.takeFile(madeUp('sample-b'));
    expect(heading()).toBe('Check what was read');
    expect(document.querySelector('[data-refusal]')).toBeNull();
  });

  it('says so when a file cannot be opened', async () => {
    // A file moved away or not downloaded yet: reading it fails. The student is told, and nothing is left unhandled.
    const gone = { name: 'gone.pdf', size: 10, arrayBuffer: (): Promise<ArrayBuffer> => Promise.reject(new DOMException('gone', 'NotReadableError')) };
    await expect(app.takeFile(gone)).resolves.toBeUndefined();
    expect(tidy($('[data-refusal]').textContent)).toBe('That file could not be opened. Choose it again.');
    expect(said()).toBe('That file could not be opened. Choose it again.');
    expect(document.activeElement).toBe($('[data-browse]'));
    await app.takeFile(madeUp('sample-a'));
    expect(heading()).toBe('Check what was read');
  });

  it('reads no other file while a transcript is under review', async () => {
    await app.takeFile(madeUp('sample-b'));
    $('[data-out="8"]').click();
    go('#/');
    // Chosen or dropped on Start: a good file and a bad one alike are not read, and the review stays as it was.
    let reads = 0;
    const counted = (file: ReturnType<typeof fileOf>) => ({ ...file, arrayBuffer: (): Promise<ArrayBuffer> => { reads++; return file.arrayBuffer(); } });
    for (const file of [counted(madeUp('sample-a')), counted(fileOf(new TextEncoder().encode('not a pdf')))]) {
      go('#/');
      await app.takeFile(file);
      expect(reads).toBe(0);
      expect(app.route).toBe('left');
      expect(window.location.hash).toBe('#/left');
      expect(heading()).toBe('Check what was read');
      expect(said()).toBe('To use another transcript, choose “Use another transcript” first.');
      expect(tidy($('.review-intro').textContent)).toContain('sample-b.pdf');
      expect(rows()).toHaveLength(16);
      expect(rowOf(8)).toContain('Put back');
      expect(app.left.refusal).toBeNull();
    }
  });

  it('takes the file chosen last when two are being read', async () => {
    const first = madeUp('sample-a');
    let release = (): void => undefined;
    const slow = { ...first, arrayBuffer: (): Promise<ArrayBuffer> => new Promise(resolve => { release = () => { void first.arrayBuffer().then(resolve); }; }) };
    const waiting = app.takeFile(slow);
    await app.takeFile(madeUp('sample-b'));
    expect(tidy($('.review-intro').textContent)).toContain('sample-b.pdf');
    $('[data-out="0"]').click();
    // The slower file arrives afterwards and changes nothing.
    release();
    await waiting;
    expect(tidy($('.review-intro').textContent)).toContain('sample-b.pdf');
    expect(rows()).toHaveLength(16);
    expect(rowOf(0)).toContain('Put back');
  });
});

describe('the review step', () => {
  it('counts nothing from a row that still needs fixing', () => {
    review(good(), good({ prefix: 'ENG', number: '131', grade: 'B+' }), good({ prefix: 'CIS', number: '30' }), 'not a row');
    expect(rows().map(row => row.replace(/ ?Edit ?| ?Not on my transcript/g, ''))).toEqual([
      'MGT 321 Prin of Management 3 cr B Passed', 'ENG 131 Prin of Management 3 cr Needs fixing: the grade', 'CIS 30 Prin of Management 3 cr Needs fixing: the course code', 'This line could not be read',
    ]);
    expect(tidy($('.review-count').textContent)).toBe('3 rows still need fixing. They count nothing until fixed.');
    expect(codesHandedOn()).toEqual(['MGT 321']);
    // A line that could not be read has no "Edit".
    expect(document.querySelector('[data-edit="3"]')).toBeNull();
    expect(document.querySelectorAll('[data-edit]')).toHaveLength(3);
  });

  it('fixes a misread row', () => {
    review(good(), good({ prefix: 'ENG', number: '131', grade: 'B+' }));
    openEdit(1);
    expect($<HTMLInputElement>('#row-1-prefix').value).toBe('ENG');
    expect($<HTMLInputElement>('#row-1-number').value).toBe('131');
    expect($<HTMLInputElement>('#row-1-term').value).toBe('Fall 2025');
    expect([...$<HTMLSelectElement>('#row-1-grade').options].map(option => option.value)).toEqual(['', 'A', 'B', 'C', 'D', 'F', 'W', 'I', 'B+']);
    setField(1, 'grade', 'B');
    $('[data-save="1"]').click();
    expect(rowOf(1)).toBe('ENG 131 Prin of Management 3 cr B Passed Edit Not on my transcript');
    expect(document.querySelector('.review-count')?.textContent).toBe('');
    expect(codesHandedOn()).toEqual(['MGT 321', 'ENG 131']);
    expect(said()).toBe('ENG 131 saved.');
    // A row that passed can be corrected too: its code, its grade, or whether it is transfer credit.
    openEdit(0);
    setField(0, 'number', '422');
    setField(0, 'grade', 'D');
    $('[data-save="0"]').click();
    expect(rowOf(0)).toBe('MGT 422 Prin of Management 3 cr D Doesn’t count — below C Edit Not on my transcript');
    openEdit(0);
    $<HTMLInputElement>('#row-0-transfer').checked = true;
    $('[data-save="0"]').click();
    expect(rowOf(0)).toBe('MGT 422 Prin of Management 3 cr D Transfer credit Passed Edit Not on my transcript');
    expect(codesHandedOn()).toEqual(['MGT 422', 'ENG 131']);
  });

  it('fixes a row whose term was not read', () => {
    review(good(), good({ prefix: 'ENG', number: '131', term: '' }));
    expect([...document.querySelectorAll('.term-name')].map(one => one.textContent)).toEqual(['Fall 2025', 'Term not read']);
    expect(rowOf(1)).toContain('Needs fixing: the term');
    openEdit(1);
    setField(1, 'term', 'Spr 2026');
    $('[data-save="1"]').click();
    expect([...document.querySelectorAll('.term-name')].map(one => one.textContent)).toEqual(['Fall 2025', 'Spr 2026']);
    expect(rowOf(1)).toBe('ENG 131 Prin of Management 3 cr B Passed Edit Not on my transcript');
    expect(codesHandedOn()).toEqual(['MGT 321', 'ENG 131']);
  });

  it('keeps a row to fix when the correction is faulty', () => {
    review(good({ grade: 'B+' }), good({ prefix: 'ENG', number: '131' }));
    openEdit(0);
    setField(0, 'grade', 'B');
    setField(0, 'number', '32');
    setField(0, 'attempted', 'three');
    $('[data-save="0"]').click();
    expect(rowOf(0)).toBe('MGT 32 Prin of Management three cr Needs fixing: the course code, the credits Edit Not on my transcript');
    expect(said()).toBe('MGT 32 still needs fixing: the course code, the credits.');
    expect(codesHandedOn()).toEqual(['ENG 131']);
    // What was typed is back in the fields, to be corrected again.
    openEdit(0);
    expect($<HTMLInputElement>('#row-0-number').value).toBe('32');
    expect($<HTMLInputElement>('#row-0-attempted').value).toBe('three');
  });

  it('keeps what is being typed while another row is left out or put back', () => {
    review(good(), good({ prefix: 'ENG', number: '131' }), good({ prefix: 'CIS', number: '300' }));
    openEdit(0);
    // One edit at a time: while it is open the other rows offer none, so nothing typed is lost to a second one.
    expect(document.querySelectorAll('[data-edit]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-out]')).toHaveLength(3);
    setField(0, 'term', 'Spr 2026');
    setField(0, 'number', '422');
    setField(0, 'attempted', '4');
    setField(0, 'grade', 'C');
    $<HTMLInputElement>('#row-0-transfer').checked = true;
    const typed = (): unknown[] => [$<HTMLInputElement>('#row-0-term').value, $<HTMLInputElement>('#row-0-prefix').value, $<HTMLInputElement>('#row-0-number').value, $<HTMLInputElement>('#row-0-attempted').value, gradeShown(0), $<HTMLInputElement>('#row-0-transfer').checked];
    $('[data-out="1"]').click();
    expect(rowOf(1)).toContain('Put back');
    expect(typed()).toEqual(['Spr 2026', 'MGT', '422', '4', 'C', true]);
    $('[data-back="1"]').click();
    expect(typed()).toEqual(['Spr 2026', 'MGT', '422', '4', 'C', true]);
    // Nothing is saved until "Save".
    expect(codesHandedOn()).toEqual(['MGT 321', 'ENG 131', 'CIS 300']);
    $('[data-save="0"]').click();
    expect(rowOf(0)).toBe('MGT 422 Prin of Management 4 cr C Transfer credit Passed Edit Not on my transcript');
    expect(document.querySelectorAll('[data-edit]')).toHaveLength(3);
    // A later edit starts from what is saved, not from an earlier draft.
    openEdit(1);
    expect($<HTMLInputElement>('#row-1-number').value).toBe('131');
    // Leaving out the row that is being edited closes its edit.
    $('[data-out="1"]').click();
    expect(document.querySelector('.row-edit')).toBeNull();
    expect(app.left).toMatchObject({ editing: null, draft: null });
    expect(document.querySelectorAll('[data-edit]')).toHaveLength(2);
  });

  it('cancels an edit', () => {
    review(good({ grade: 'B+' }));
    const before = rowOf(0);
    openEdit(0);
    setField(0, 'grade', 'A');
    setField(0, 'prefix', 'XYZ');
    $('[data-cancel="0"]').click();
    expect(rowOf(0)).toBe(before);
    expect(document.querySelector('.row-edit')).toBeNull();
    expect(codesHandedOn()).toEqual([]);
  });

  it('leaves out a row that is not on the transcript', () => {
    review(good(), good({ prefix: 'CIS', number: '300', grade: 'A' }), good({ prefix: 'ENG', number: '131', grade: 'B+' }));
    expect(codesHandedOn()).toEqual(['MGT 321', 'CIS 300']);
    $('[data-out="1"]').click();
    expect(rowOf(1)).toBe('CIS 300 Prin of Management 3 cr Not on my transcript Put back');
    expect($('[data-line="1"]').className).toBe('row review-row is-left-out');
    expect(codesHandedOn()).toEqual(['MGT 321']);
    expect(said()).toBe('CIS 300: Not on my transcript.');
    expect(document.activeElement).toBe($('[data-back="1"]'));
    // A row to fix can be left out as well: it is then no longer among those to fix.
    $('[data-out="2"]').click();
    expect(document.querySelector('.review-count')?.textContent).toBe('');
    $('[data-back="1"]').click();
    expect(codesHandedOn()).toEqual(['MGT 321', 'CIS 300']);
    expect(document.activeElement).toBe($('[data-out="1"]'));
    $('[data-back="2"]').click();
    expect(tidy($('.review-count').textContent)).toBe('1 row still needs fixing. It counts nothing until fixed.');
  });

  it('moves the keyboard through an edit', () => {
    review(good(), good({ prefix: 'ENG', number: '131', grade: 'B+' }));
    openEdit(1);
    // Into the first field of the row; every field is labelled.
    expect(document.activeElement).toBe($('#row-1-term'));
    for (const field of document.querySelectorAll<HTMLElement>('[data-editing="1"] [data-field]')) {
      expect(document.querySelector(`label[for="${field.id}"]`), field.id).not.toBeNull();
    }
    expect($('[data-editing="1"]').getAttribute('aria-label')).toBe('Edit ENG 131, Fall 2025');
    $('[data-cancel="1"]').click();
    expect(document.activeElement).toBe($('[data-edit="1"]'));
    openEdit(1);
    setField(1, 'grade', 'B');
    $('[data-save="1"]').click();
    expect(document.activeElement).toBe($('[data-edit="1"]'));
    // Edit and Not on my transcript are buttons that name their course.
    expect($('[data-edit="0"]').getAttribute('aria-label')).toBe('Edit MGT 321, Fall 2025');
    expect($('[data-out="0"]').getAttribute('aria-label')).toBe('Not on my transcript: MGT 321, Fall 2025');
    // The edit is one cell of its row, as a table allows.
    openEdit(0);
    expect($('[data-editing="0"]').parentElement?.getAttribute('role')).toBe('cell');
    expect($('[data-editing="0"]').parentElement?.parentElement).toBe($('[data-line="0"]'));
    $('[data-cancel="0"]').click();
    // What happened is said in one polite line that stays in the page while the rest is drawn again.
    const status = $('#pathcheck-status');
    expect([status.getAttribute('role'), status.getAttribute('aria-live'), status.className]).toEqual(['status', 'polite', 'sr-only']);
    expect($('#app').contains(status)).toBe(false);
    $('[data-out="0"]').click();
    expect($('#pathcheck-status')).toBe(status);
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);
    // The terms are headings.
    expect($('.term-name').tagName).toBe('H2');
  });
});

describe('going on', () => {
  it('hands on the reviewed rows', () => {
    review(good(), good({ prefix: 'ENG', number: '131', grade: 'B+' }), good({ prefix: 'CIS', number: '300', grade: 'A' }), good({ prefix: 'CIS', number: '30' }));
    openEdit(1);
    setField(1, 'grade', 'B');
    $('[data-save="1"]').click();
    $('[data-out="2"]').click();
    $('[data-continue]').click();
    expect(app.left.continued).toBe(true);
    // The corrected course is handed on; the one left out and the one still to fix are not.
    expect(codesHandedOn()).toEqual(['MGT 321', 'ENG 131']);
    expect(heading()).toBe('See what I have left');
    expect(document.activeElement).toBe($('h1'));
    expect(tidy($('[data-handed-on]').textContent)).toBe('2 rows taken on. 1 left out because it still needs fixing. 1 left out as not on your transcript.');
    expect(document.querySelector('.review-row')).toBeNull();
  });

  it('starts again with another transcript', async () => {
    await app.takeFile(madeUp('sample-a'));
    expect(tidy($('.review-foot').textContent)).toContain('Choosing another transcript forgets your corrections.');
    $('[data-out="0"]').click();
    $('[data-continue]').click();
    expect(tidy($('[data-handed-on]').textContent)).toBe('16 rows taken on. 1 left out as not on your transcript.');
    $('[data-another]').click();
    expect(app.left).toMatchObject({ transcript: null, continued: false, editing: null });
    expect(document.querySelector('[data-drop]')).not.toBeNull();
    await app.takeFile(madeUp('sample-a'));
    // The earlier corrections are forgotten.
    expect(rows()).toHaveLength(17);
    expect(document.querySelector('.is-left-out')).toBeNull();
  });

  it('keeps the review while the student moves between pages', async () => {
    await app.takeFile(madeUp('sample-b'));
    $('[data-out="8"]').click();
    openEdit(7);
    setField(7, 'grade', 'C');
    $('[data-save="7"]').click();
    const before = rows();
    go('#/');
    go('#/check');
    expect(document.querySelector('.review-row')).toBeNull();
    go('#/left');
    expect(heading()).toBe('Check what was read');
    expect(rows()).toEqual(before);
    expect(rowOf(8)).toContain('Put back');
    expect(rowOf(7)).toContain('C Passed');
    // A new visit starts without a transcript.
    document.body.innerHTML = '<div id="app"></div>';
    const fresh = startApp(window as unknown as AppWindow);
    expect(fresh.left.transcript).toBeNull();
    expect(document.querySelector('[data-drop]')).not.toBeNull();
    fresh.stop();
  });
});
