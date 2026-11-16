// @vitest-environment happy-dom
// F07: typing, the keyboard and redrawing on "Check my courses", in a simulated browser
// (docs/sprints/F07.md). What a simulated browser models poorly (a click landing after the
// field loses focus, touch, real input methods) is also checked by the evaluator in a real one.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startApp, type AppWindow } from '../src/app';
import { emptyList, setupCheck } from '../src/check';
import { curriculum } from '../src/curriculum';
import { openTranscript } from '../src/review';

const $ = <T extends HTMLElement>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`nothing matches ${selector}`);
  return found;
};
const field = (): HTMLInputElement => $('#add-course');
const menu = (): HTMLElement => $('#suggestions');
const options = (): HTMLElement[] => [...menu().querySelectorAll<HTMLElement>('[role="option"]')];
const optionCodes = (): string[] => options().map(one => one.querySelector('.code')?.textContent ?? '');
const tidy = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim();
const rowElements = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[data-entries] [role="row"].row')];
// A row by its course and credits; its answer is read separately.
// The credits of a row: what it shows, or what its dropdown was drawn with for a course
// PathCheck doesn't know. (The simulated browser does not honour the selected option of a
// dropdown made from HTML text, so the option marked selected is read; a real browser is
// checked by the evaluator.)
const creditsOf = (row: HTMLElement): string => {
  const select = row.querySelector<HTMLSelectElement>('.cell-cr select');
  return select ? `${select.querySelector('option[selected]')?.getAttribute('value')} cr` : tidy(row.querySelector('.cell-cr')?.textContent);
};
const rows = (): string[] => rowElements().map(row => tidy(`${row.querySelector('.cell-name')?.textContent} ${creditsOf(row)}`));
const answers = (): string[] => rowElements().map(row => tidy(row.querySelector('.cell-answer')?.textContent));
const answerOf = (code: string): string => answers()[rows().findIndex(row => row.startsWith(code))] ?? `no row for ${code}`;
const message = (): string => $('#add-message').textContent ?? '';
const said = (): string => $('[data-said]').textContent ?? '';

const type = (text: string, inputType = 'insertText'): void => {
  field().focus();
  field().value = text;
  field().dispatchEvent(new InputEvent('input', { bubbles: true, inputType }));
};
const key = (name: string, more: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...more });
  field().dispatchEvent(event);
  return event;
};
// The address is changed without the simulated browser's own, later, hashchange: the page
// is told once, at once.
const go = (hash: string): void => {
  window.history.replaceState(null, '', hash);
  window.dispatchEvent(new Event('hashchange'));
};
const add = (text: string): void => { type(text); key('Enter'); };

let app: ReturnType<typeof startApp>;
beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  window.history.replaceState(null, '', '#/check');
  app = startApp(window as unknown as AppWindow);
});
// Each test's app stops listening to the window, so that it takes no part in the next test.
afterEach(() => { app.stop(); });

describe('typing in the field', () => {
  it('opens the suggestions with the first one highlighted', () => {
    expect(app.route).toBe('check');
    expect(menu().hidden).toBe(true);
    expect($<HTMLButtonElement>('[data-add]').disabled).toBe(true);
    type('mgt 3');
    expect(menu().hidden).toBe(false);
    expect(optionCodes()).toContain('MGT 321');
    expect(options().map(one => one.getAttribute('aria-selected'))).toEqual(options().map((_, i) => String(i === 0)));
    expect(field().getAttribute('aria-expanded')).toBe('true');
    expect(field().getAttribute('aria-activedescendant')).toBe('suggestion-1');
    expect(document.getElementById('suggestion-1')).toBe(options()[0]);
    expect($<HTMLButtonElement>('[data-add]').disabled).toBe(false);
    // Clearing the field closes the list and dims the button again.
    type('');
    expect(menu().hidden).toBe(true);
    expect(options()).toEqual([]);
    expect(field().getAttribute('aria-expanded')).toBe('false');
    expect(field().hasAttribute('aria-activedescendant')).toBe(false);
    expect($<HTMLButtonElement>('[data-add]').disabled).toBe(true);
    type('   ');
    expect($<HTMLButtonElement>('[data-add]').disabled).toBe(true);
  });

  it('adds the highlighted suggestion with Enter', () => {
    type('mgt 3');
    const first = optionCodes()[0];
    const event = key('Enter');
    expect(event.defaultPrevented).toBe(true);
    expect(rows()).toEqual([`${first} Principles of Management 3 cr`]);
    expect(first).toBe('MGT 321');
    expect(field().value).toBe('');
    expect(menu().hidden).toBe(true);
    expect(document.activeElement).toBe(field());
    expect($<HTMLButtonElement>('[data-add]').disabled).toBe(true);
  });

  it('adds the highlighted suggestion with the Add button', () => {
    // A press on the button must not take the keyboard out of the field...
    type('MGT');
    const mgt = optionCodes()[0]!;
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    $('[data-add]').dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    $('[data-add]').click();
    expect(rows()).toHaveLength(1);
    expect(rows()[0]?.startsWith(mgt)).toBe(true);
    expect(document.activeElement).toBe(field());
    // ...and when it does anyway (a tap, or Tab to the button), the course the student was
    // looking at is still the one that is added.
    type('mgt 3');
    key('ArrowDown');
    key('ArrowUp');
    const looked = optionCodes()[0]!;
    field().blur();
    expect(menu().hidden).toBe(true);
    $('[data-add]').click();
    expect(rows()).toHaveLength(2);
    expect(rows()[1]?.startsWith(looked)).toBe(true);
    expect(message()).toBe('');
    expect(field().value).toBe('');
    expect(document.activeElement).toBe(field());
    // With a second suggestion highlighted, that one.
    type('cis');
    key('ArrowDown');
    const second = optionCodes()[1]!;
    field().blur();
    $('[data-add]').click();
    expect(rows()[2]?.startsWith(second)).toBe(true);
  });

  it('adds a suggestion on click', () => {
    type('cis');
    expect(options().length).toBe(6);
    const third = options()[2]!;
    const wanted = optionCodes()[2]!;
    // The highlight follows the mouse.
    third.querySelector('.truncate')!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(options().map(one => one.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true', 'false', 'false', 'false']);
    expect(field().getAttribute('aria-activedescendant')).toBe('suggestion-3');
    // Pressing on the list does not take the keyboard out of the field.
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    options()[2]!.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    expect(menu().hidden).toBe(false);
    options()[2]!.querySelector<HTMLElement>('.code')!.click();
    expect(rows()).toHaveLength(1);
    expect(rows()[0]?.startsWith(wanted)).toBe(true);
    expect(field().value).toBe('');
    expect(menu().hidden).toBe(true);
    expect(document.activeElement).toBe(field());
  });

  it('closes the list on a click elsewhere', () => {
    type('mgt 3');
    field().blur();
    expect(menu().hidden).toBe(true);
    expect(field().value).toBe('mgt 3');
    expect(rows()).toEqual([]);
    expect(field().getAttribute('aria-expanded')).toBe('false');
    expect(field().hasAttribute('aria-activedescendant')).toBe(false);
    // Back in the field, the list is there again, as it was.
    field().focus();
    expect(menu().hidden).toBe(false);
    expect(field().getAttribute('aria-expanded')).toBe('true');
    expect(optionCodes()).toContain('MGT 321');
    // After Escape it stays closed, also when the field is left and entered again.
    key('Escape');
    field().blur();
    field().focus();
    expect(menu().hidden).toBe(true);
  });

  it('leaves the highlight alone when the list opens under a resting mouse', () => {
    type('cis');
    // The list appears under a pointer that is not moving: the browser says "over", not "moved".
    options()[2]!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    options()[2]!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(field().getAttribute('aria-activedescendant')).toBe('suggestion-1');
    const first = optionCodes()[0]!;
    key('Enter');
    expect(rows()[0]?.startsWith(first)).toBe(true);
  });

  it('fails loudly when a part of the page is missing', () => {
    const broken = document.createElement('div');
    broken.innerHTML = '<input id="add-course"><ul id="suggestions"></ul>';
    expect(() => setupCheck(broken, emptyList(), curriculum)).toThrow(/missing a part/);
    expect(() => setupCheck(document.createElement('div'), emptyList(), curriculum)).toThrow(/missing a part/);
  });

  it('moves the highlight without drawing the list again', () => {
    type('cis');
    const before = options();
    key('ArrowDown');
    before[3]!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    key('ArrowUp');
    // The same six elements: a press that began on one still ends on it.
    expect(options()).toEqual(before);
    options().forEach((option, i) => expect(option).toBe(before[i]));
    expect(options().map(one => one.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true', 'false', 'false', 'false']);
    expect(field().getAttribute('aria-activedescendant')).toBe('suggestion-3');
  });

  it('adds what was typed when it is a whole code', () => {
    add('bio 230');
    add('mkt410');
    add('cis 304');
    expect(rows()).toEqual(['BIO 230 3 cr', 'MKT 410 3 cr', 'CIS 304 3 cr']);
    // A whole code wins over the highlighted suggestion.
    type('cis 30');
    key('ArrowDown');
    const highlighted = optionCodes()[1];
    type('eng 131');
    key('Enter');
    expect(rows()[3]).toBe('ENG 131 English Composition I 3 cr');
    expect(highlighted).not.toBe('ENG 131');
  });

  it('says what to type', () => {
    for (const text of ['basket weaving', 'ZZZ', 'PSY 9', '321', 'MGT 3211', 'MGT 321, CIS 300']) {
      type(text);
      expect(menu().hidden, text).toBe(true);
      expect(message()).toBe('');
      key('Enter');
      expect(message(), text).toBe('Type a course code like MGT 321, or pick a course from the list.');
      expect(rows()).toEqual([]);
      expect(field().value).toBe(text);
      expect(document.activeElement).toBe(field());
    }
    // The line goes at the next keystroke.
    type('MGT 321, CIS 30');
    expect(message()).toBe('');
    expect($('#add-message').getAttribute('aria-live')).toBe('polite');
    // Said twice, it is put on the page twice: a screen reader hears it again.
    type('ZZZ');
    key('Enter');
    const first = $('#add-message').firstChild;
    key('Enter');
    expect(message()).toBe('Type a course code like MGT 321, or pick a course from the list.');
    expect($('#add-message').firstChild).not.toBe(first);
    // Enter in an empty field does nothing at all.
    type('');
    key('Enter');
    expect(message()).toBe('');
  });

  it('does not add a course twice', () => {
    add('mgt 321');
    add('mgt-321');
    expect(rows()).toHaveLength(1);
    expect(message()).toBe('MGT 321 is already in your list.');
    expect(field().value).toBe('mgt-321');
    type('mgt 3');
    expect(optionCodes()).toContain('MGT 321');
    key('Enter');
    expect(rows()).toHaveLength(1);
    expect(message()).toBe('MGT 321 is already in your list.');
  });

  it('moves through the suggestions with the arrow keys', () => {
    type('cis');
    const selected = (): number => options().findIndex(one => one.getAttribute('aria-selected') === 'true');
    expect(selected()).toBe(0);
    expect(key('ArrowDown').defaultPrevented).toBe(true);
    expect(selected()).toBe(1);
    expect(field().getAttribute('aria-activedescendant')).toBe('suggestion-2');
    key('ArrowUp');
    key('ArrowUp');
    // Up from the first wraps to the last, and Down from the last to the first.
    expect(selected()).toBe(5);
    key('ArrowDown');
    expect(selected()).toBe(0);
    key('ArrowDown');
    key('ArrowDown');
    const wanted = optionCodes()[2]!;
    key('Enter');
    expect(rows()[0]?.startsWith(wanted)).toBe(true);
    // With the list closed the arrows are the field's own.
    expect(key('ArrowDown').defaultPrevented).toBe(false);
  });

  it('closes on Escape', () => {
    type('mgt 3');
    expect(key('Escape').defaultPrevented).toBe(true);
    expect(menu().hidden).toBe(true);
    expect(field().value).toBe('mgt 3');
    expect(document.activeElement).toBe(field());
    // Enter now adds nothing that is not a whole code or a highlighted suggestion.
    key('Enter');
    expect(rows()).toEqual([]);
    expect(message()).toBe('Type a course code like MGT 321, or pick a course from the list.');
    // Escape with the list closed is left to the browser.
    expect(key('Escape').defaultPrevented).toBe(false);
  });

  it('keeps the field while the list redraws', () => {
    const before = field();
    type('mgt 32');
    field().setSelectionRange(3, 3);
    field().dispatchEvent(new InputEvent('input', { bubbles: true }));
    key('ArrowDown');
    expect(field()).toBe(before);
    expect(field().value).toBe('mgt 32');
    expect(field().selectionStart).toBe(3);
    key('Enter');
    add('bio 230');
    $('[data-remove="BIO 230"]').click();
    // The same field, from first keystroke to last: it is never drawn again.
    expect(field()).toBe(before);
    expect(document.querySelectorAll('#add-course')).toHaveLength(1);
  });

  it('does not add while text is being composed', () => {
    type('mgt 3');
    const enter = key('Enter', { isComposing: true, keyCode: 229 });
    expect(enter.defaultPrevented).toBe(false);
    expect(rows()).toEqual([]);
    expect(menu().hidden).toBe(false);
    const down = key('ArrowDown', { isComposing: true, keyCode: 229 });
    expect(down.defaultPrevented).toBe(false);
    expect(field().getAttribute('aria-activedescendant')).toBe('suggestion-1');
    // An older browser says only that the key is "in progress".
    key('Enter', { keyCode: 229 });
    expect(rows()).toEqual([]);
    key('Enter');
    expect(rows()).toHaveLength(1);
  });

  it('treats pasted text like typed text', () => {
    type('mgt321', 'insertFromPaste');
    expect(optionCodes()).toEqual(['MGT 321']);
    key('Enter');
    expect(rows()).toEqual(['MGT 321 Principles of Management 3 cr']);
    type('MGT 321, CIS 300', 'insertFromPaste');
    expect(menu().hidden).toBe(true);
    key('Enter');
    expect(rows()).toHaveLength(1);
    expect(message()).toBe('Type a course code like MGT 321, or pick a course from the list.');
  });

  it('does not turn typed markup into elements', () => {
    const before = document.querySelectorAll('*').length;
    for (const text of ['<img src=x onerror=alert(1)>', '<script>document.title="x"</script>', '"><b>bold</b>', 'x'.repeat(500)]) {
      type(text);
      key('Enter');
      $('[data-add]').click();
      expect(rows()).toEqual([]);
      expect(message()).toBe('Type a course code like MGT 321, or pick a course from the list.');
      expect(document.querySelectorAll('img, script, b').length).toBe(0);
      expect(document.querySelectorAll('*').length).toBe(before);
      // The typed text is in the field and nowhere else on the page.
      expect($('main').textContent).not.toContain(text.slice(0, 12));
    }
    expect(document.title).toBe('Check my courses — PathCheck');
  });
});

describe('a dropped file', () => {
  it('is not opened, and changes nothing on this page', () => {
    add('mgt 321');
    for (const type of ['dragover', 'drop']) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'] } });
      window.dispatchEvent(event);
      expect(event.defaultPrevented, type).toBe(true);
    }
    expect(window.location.hash).toBe('#/check');
    expect(rows()).toHaveLength(1);
    // Dragged text is the field's own business.
    const text = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(text, 'dataTransfer', { value: { types: ['text/plain'] } });
    window.dispatchEvent(text);
    expect(text.defaultPrevented).toBe(false);
  });
});

describe('the list', () => {
  it('moves the keyboard after a removal', () => {
    for (const code of ['mgt 321', 'bio 230', 'eng 131']) add(code);
    expect(document.querySelector('.empty-hint')).toBeNull();
    $('[data-remove="BIO 230"]').click();
    expect(rows()).toEqual(['MGT 321 Principles of Management 3 cr', 'ENG 131 English Composition I 3 cr']);
    // The next course's Remove button...
    expect(document.activeElement).toBe($('[data-remove="ENG 131"]'));
    $('[data-remove="ENG 131"]').click();
    // ...the last one when there is no next...
    expect(document.activeElement).toBe($('[data-remove="MGT 321"]'));
    $('[data-remove="MGT 321"]').querySelector('svg')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // ...and the field when the list is empty.
    expect(rows()).toEqual([]);
    expect(document.activeElement).toBe(field());
    expect($('.empty-hint').textContent).toBe('Add the courses you plan to take next semester.');
    expect(document.querySelector('[role="table"]')).toBeNull();
    // A removed course can be added again.
    add('bio 230');
    expect(rows()).toEqual(['BIO 230 3 cr']);
  });

  it('says what was added and removed', () => {
    expect(said()).toBe('');
    add('mgt 321');
    // The first course brings the note about the total with it; it is not repeated after.
    expect(said()).toBe('MGT 321 added. Below 12 credits: below full-time; may affect scholarships.');
    add('bio 230');
    expect(said()).toBe('BIO 230 added.');
    $('[data-remove="MGT 321"]').click();
    expect(said()).toBe('MGT 321 removed.');
    expect($('[data-said]').getAttribute('aria-live')).toBe('polite');
    expect($('[data-said]').className).toBe('sr-only');
    expect($('[data-remove="BIO 230"]').getAttribute('aria-label')).toBe('Remove BIO 230');
  });

  it('keeps the list while the student moves between pages', () => {
    add('mgt 321');
    add('bio 230');
    type('eng 1');
    go('#/');
    expect(app.route).toBe('start');
    expect(document.querySelector('#add-course')).toBeNull();
    go('#/left');
    go('#/check');
    expect(rows()).toEqual(['MGT 321 Principles of Management 3 cr', 'BIO 230 3 cr']);
    expect(field().value).toBe('');
    expect(menu().hidden).toBe(true);
    // The page still works after coming back.
    add('eng 131');
    $('[data-remove="MGT 321"]').click();
    expect(rows()).toEqual(['BIO 230 3 cr', 'ENG 131 English Composition I 3 cr']);
    // A new visit starts with an empty list.
    document.body.innerHTML = '<div id="app"></div>';
    startApp(window as unknown as AppWindow);
    expect(rows()).toEqual([]);
  });
});

// F08: the answers, the legacy question and the filters (docs/sprints/F08.md).
describe('the answers', () => {
  const CONDITION = 'unless you’ve already passed it or filled this slot';
  const QUESTION = 'Are you a legacy CIS student? Yes No';
  const reload = (): void => {
    document.body.innerHTML = '<div id="app"></div>';
    app = startApp(window as unknown as AppWindow);
  };
  afterEach(() => { vi.unstubAllGlobals(); });

  it('gives a course outside the curriculum its answer', () => {
    add('bio 230');
    expect(rows()).toEqual(['BIO 230 3 cr']);
    expect(answers()).toEqual(['Doesn’t count toward CIS — not in the CIS curriculum']);
    expect(rowElements()[0]!.className).toBe('row is-no');
    add('cis 304');
    expect(answerOf('CIS 304')).toBe('Doesn’t count toward CIS — CIS 304 isn’t in the current CIS curriculum.');
    add('mgt 321');
    expect(answerOf('MGT 321')).toBe(`Counts toward CIS — Business core ${CONDITION}`);
    expect(rowElements()[2]!.className).toBe('row');
    expect(tidy($('.note').textContent)).toBe('Remember: you need HIS 132 or ENG 210 for the history/literature sequence.');
  });

  it('re-works the answers when the list changes', () => {
    add('eng 131');
    expect(answerOf('ENG 131')).toBe(`Counts toward CIS — Composition ${CONDITION}`);
    add('eng 140');
    expect(answerOf('ENG 140')).toBe('Doesn’t count — it fills the same requirement as ENG 131.');
    // Removing the first makes the second count; the keyboard moves as before.
    $('[data-remove="ENG 131"]').click();
    expect(rows()).toEqual(['ENG 140 English Composition Honors I 3 cr']);
    expect(answerOf('ENG 140')).toBe(`Counts toward CIS — Composition ${CONDITION}`);
    expect(document.activeElement).toBe($('[data-remove="ENG 140"]'));
    expect(said()).toBe('ENG 131 removed.');
    // The sequence course wins its slot whatever the order, and the reminder goes.
    add('geo 206');
    expect(document.querySelector('.note')).not.toBeNull();
    add('his 132');
    expect(answerOf('GEO 206')).toBe('Doesn’t count — it fills the same requirement as HIS 132.');
    expect(answerOf('HIS 132')).toBe(`Counts toward CIS — Social sciences ${CONDITION}`);
    expect(document.querySelector('.note')).toBeNull();
    expect(said()).toBe('HIS 132 added.');
    $('[data-remove="HIS 132"]').click();
    expect(document.querySelector('.note')).not.toBeNull();
    // A fourth elective is told which three fill the places.
    for (const one of ['mkt 410', 'cis 499', 'eco 301', 'act 350']) add(one);
    expect(answerOf('ACT 350')).toBe('Doesn’t count — your 3 CIS elective places are already filled by MKT 410, CIS 499 and ECO 301.');
    $('[data-remove="CIS 499"]').click();
    expect(answerOf('ACT 350')).toBe(`Counts toward CIS: elective (300/400-level ACT) ${CONDITION}`);
  });

  it('answers the legacy question on the row', () => {
    for (const one of ['fls 161', 'mkt 410', 'cis 499', 'eco 301']) add(one);
    expect(answers()).toEqual([QUESTION, `Counts toward CIS: elective (300/400-level MKT) ${CONDITION}`, `Counts toward CIS: elective (300/400-level CIS) ${CONDITION}`, 'Answer “Are you a legacy CIS student?” to see this.']);
    expect(document.querySelector('.legacy-line')).toBeNull();
    const group = $('.legacy-ask');
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Are you a legacy CIS student?');
    $('[data-legacy="yes"]').click();
    expect(answerOf('FLS 161')).toBe(`Counts toward CIS: elective (legacy) ${CONDITION}`);
    expect(answerOf('ECO 301')).toBe('Doesn’t count — your 3 CIS elective places are already filled by FLS 161, MKT 410 and CIS 499.');
    expect(document.querySelector('.legacy-ask')).toBeNull();
    expect(tidy($('.legacy-line').textContent)).toBe('Legacy CIS student: Yes Change');
  });

  it('lets the student change the legacy answer', () => {
    add('geo 206');
    add('psy 251');
    add('mgt 220');
    expect(answers()).toEqual([`Counts toward CIS — Social sciences ${CONDITION}`, QUESTION, QUESTION]);
    // Either row's buttons answer for all of them.
    document.querySelectorAll<HTMLElement>('[data-legacy="no"]')[1]!.click();
    expect(answers().slice(1)).toEqual(['Doesn’t count toward CIS. Legacy students only.', 'Doesn’t count toward CIS. Legacy students only.']);
    expect(tidy($('.legacy-line').textContent)).toBe('Legacy CIS student: No Change');
    $('[data-legacy-change]').click();
    expect(answers().slice(1)).toEqual([QUESTION, QUESTION]);
    expect(document.querySelector('.legacy-line')).toBeNull();
    $('[data-legacy="yes"]').click();
    expect(answers().slice(1)).toEqual([`Counts toward CIS: elective (legacy) ${CONDITION}`, `Counts toward CIS: elective (legacy) ${CONDITION}`]);
    expect(tidy($('.legacy-line').textContent)).toBe('Legacy CIS student: Yes Change');
  });

  it('keeps the keyboard in place when the question is answered', () => {
    add('fls 161');
    $('[data-legacy="no"]').click();
    expect(document.activeElement).toBe($('[data-legacy-change]'));
    $('[data-legacy-change]').click();
    expect(document.activeElement).toBe($('[data-legacy="yes"]'));
    // Yes, No and Change are buttons.
    for (const selector of ['[data-legacy="yes"]', '[data-legacy="no"]']) expect($(selector).tagName).toBe('BUTTON');
    $('[data-legacy="yes"]').click();
    expect($('[data-legacy-change]').tagName).toBe('BUTTON');
    expect(document.activeElement).toBe($('[data-legacy-change]'));
  });

  it('does not ask again once answered', () => {
    add('fls 161');
    $('[data-legacy="yes"]').click();
    add('mgt 203');
    expect(answerOf('MGT 203')).toBe(`Counts toward CIS: elective (legacy) ${CONDITION}`);
    expect(document.querySelector('.legacy-ask')).toBeNull();
    // The answer stays while the student moves between pages.
    go('#/');
    go('#/check');
    expect(answerOf('FLS 161')).toBe(`Counts toward CIS: elective (legacy) ${CONDITION}`);
    // With no course it matters for, the line to change it is not shown; the answer is kept.
    $('[data-remove="FLS 161"]').click();
    $('[data-remove="MGT 203"]').click();
    add('mgt 321');
    expect(document.querySelector('.legacy-line')).toBeNull();
    add('mgt 220');
    expect(answerOf('MGT 220')).toBe(`Counts toward CIS: elective (legacy) ${CONDITION}`);
  });

  it('remembers the legacy answer across a reload', () => {
    add('fls 161');
    expect(window.localStorage.length).toBe(0);
    $('[data-legacy="yes"]').click();
    // One key, and nothing about the courses.
    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.key(0)).toBe('pathcheck.legacy');
    expect(JSON.stringify(window.localStorage.getItem('pathcheck.legacy'))).not.toMatch(/FLS|161/);
    reload();
    expect(rows()).toEqual([]);
    add('fls 161');
    expect(answers()).toEqual([`Counts toward CIS: elective (legacy) ${CONDITION}`]);
    $('[data-legacy-change]').click();
    expect(window.localStorage.length).toBe(0);
    reload();
    add('fls 161');
    expect(answers()).toEqual([QUESTION]);
    $('[data-legacy="no"]').click();
    reload();
    add('mgt 220');
    expect(answers()).toEqual(['Doesn’t count toward CIS. Legacy students only.']);
  });

  it('works when the answer cannot be stored', () => {
    // A browser with site data blocked: every use of its storage is refused.
    const refuse = (): never => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
    vi.stubGlobal('localStorage', { getItem: refuse, setItem: refuse, removeItem: refuse, clear: refuse, key: refuse, get length(): number { return refuse(); } });
    reload();
    add('fls 161');
    expect(answers()).toEqual([QUESTION]);
    $('[data-legacy="yes"]').click();
    // For this visit the answer holds, also across pages.
    expect(answers()).toEqual([`Counts toward CIS: elective (legacy) ${CONDITION}`]);
    go('#/left');
    go('#/check');
    expect(answers()).toEqual([`Counts toward CIS: elective (legacy) ${CONDITION}`]);
    $('[data-legacy-change]').click();
    expect(answers()).toEqual([QUESTION]);
    $('[data-legacy="yes"]').click();
    // After a reload it has to be asked again.
    reload();
    add('fls 161');
    expect(answers()).toEqual([QUESTION]);
  });

  it("filters the rows that don't count", () => {
    expect(document.querySelector('[data-filter]')).toBeNull();
    for (const one of ['act 215', 'mgt 321', 'mkt 410', 'bio 230', 'eng 131', 'eng 140']) add(one);
    const pressed = (): string[] => [...document.querySelectorAll('[data-filter]')].map(button => `${tidy(button.textContent)}=${button.getAttribute('aria-pressed')}`);
    expect(pressed()).toEqual(['All courses=true', 'Doesn’t count=false']);
    expect(rows()).toHaveLength(6);
    $('[data-filter="no"]').click();
    expect(pressed()).toEqual(['All courses=false', 'Doesn’t count=true']);
    expect(rows()).toEqual(['BIO 230 3 cr', 'ENG 140 English Composition Honors I 3 cr']);
    expect(document.activeElement).toBe($('[data-filter="no"]'));
    // The choice is kept while courses are added and removed.
    add('cis 415');
    add('fin 201');
    expect(rows()).toEqual(['BIO 230 3 cr', 'ENG 140 English Composition Honors I 3 cr', 'CIS 415 3 cr']);
    $('[data-remove="ENG 140"]').click();
    expect(document.activeElement).toBe($('[data-remove="CIS 415"]'));
    $('[data-remove="CIS 415"]').click();
    $('[data-remove="BIO 230"]').click();
    expect(rows()).toEqual([]);
    expect($('.empty-hint').textContent).toBe('No course in your list is marked “Doesn’t count”.');
    expect(document.activeElement).toBe(field());
    $('[data-filter="all"]').click();
    expect(pressed()).toEqual(['All courses=true', 'Doesn’t count=false']);
    expect(rows().map(row => row.slice(0, 7))).toEqual(['ACT 215', 'MGT 321', 'MKT 410', 'ENG 131', 'FIN 201']);
    // An empty list has no filters; the choice starts again with a new visit.
    for (const one of ['ACT 215', 'MGT 321', 'MKT 410', 'ENG 131', 'FIN 201']) document.querySelector<HTMLElement>(`[data-remove="${one}"]`)?.click();
    expect(rows()).toEqual([]);
    expect(document.querySelector('[data-filter]')).toBeNull();
    expect($('.empty-hint').textContent).toBe('Add the courses you plan to take next semester.');
  });

  it('starts a new list with all its rows after one was emptied under the filter', () => {
    add('bio 230');
    $('[data-filter="no"]').click();
    $('[data-remove="BIO 230"]').click();
    expect(document.querySelector('[data-filter]')).toBeNull();
    expect($('.empty-hint').textContent).toBe('Add the courses you plan to take next semester.');
    add('mgt 321');
    expect(rows()).toEqual(['MGT 321 Principles of Management 3 cr']);
    expect($('[data-filter="all"]').getAttribute('aria-pressed')).toBe('true');
    expect($('[data-filter="no"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('says which legacy answer the rows now follow', () => {
    add('fls 161');
    $('[data-legacy="yes"]').click();
    expect(said()).toBe('Legacy CIS student: Yes');
    $('[data-legacy-change]').click();
    expect(said()).toBe('Are you a legacy CIS student?');
    $('[data-legacy="no"]').click();
    expect(said()).toBe('Legacy CIS student: No');
  });
});

// F09: the numbers above the list and the credits of an unknown course (docs/sprints/F09.md).
describe('the numbers', () => {
  const UNDER = 'Below 12 credits: below full-time; may affect scholarships.';
  const OVER = 'Over 18 credits: may cost extra.';
  const numbers = (): number[] => [...document.querySelectorAll('[data-summary] .num')].map(one => Number(one.textContent));
  const stripText = (): string => tidy(document.querySelector('[data-summary]')?.textContent);
  const creditsField = (code: string): HTMLSelectElement => $<HTMLSelectElement>(`[data-credits="${code}"]`);
  const choose = (code: string, credits: number): void => {
    const select = creditsField(code);
    select.focus();
    select.value = String(credits);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };

  it("changes the total when an unknown course's credits are changed", () => {
    expect(document.querySelector('[data-summary] .summary')).toBeNull();
    add('mgt 321');
    add('bio 230');
    expect(numbers()).toEqual([6, 3, 3]);
    const select = creditsField('BIO 230');
    const row = rowElements()[1]!;
    choose('BIO 230', 4);
    // At once, and without drawing the row or the field again.
    expect(numbers()).toEqual([7, 3, 4]);
    expect(creditsField('BIO 230')).toBe(select);
    expect(rowElements()[1]).toBe(row);
    expect(document.activeElement).toBe(select);
    // The new total is read out.
    expect(said()).toBe('Total credits: 7.');
    // An unknown course's credits never count toward CIS.
    choose('BIO 230', 9);
    expect(numbers()).toEqual([12, 3, 9]);
    choose('BIO 230', 0);
    expect(numbers()).toEqual([3, 3, 0]);
    // The highest value.
    add('eng 131');
    add('act 215');
    choose('BIO 230', 12);
    expect(numbers()).toEqual([21, 9, 12]);
    expect(stripText()).toContain(OVER);
    // Courses PathCheck knows have nothing to change.
    expect(document.querySelectorAll('[data-entries] select')).toHaveLength(1);
    // The two courses that never count are unknown courses too.
    add('cis 304');
    expect(creditsField('CIS 304').getAttribute('aria-label')).toBe('Credits for CIS 304');
    choose('CIS 304', 1);
    expect(numbers()).toEqual([22, 9, 13]);
  });

  it("moves the notes when an unknown course's credits are changed", () => {
    for (const one of ['mgt 321', 'eng 131', 'act 215', 'bio 230']) add(one);
    expect(numbers()).toEqual([12, 9, 3]);
    expect(stripText()).not.toMatch(/Below|Over/);
    choose('BIO 230', 2);
    expect(numbers()[0]).toBe(11);
    expect(stripText()).toContain(UNDER);
    // The note is read out when it appears, after the new total...
    expect(said()).toBe(`Total credits: 11. ${UNDER}`);
    choose('BIO 230', 1);
    // ...and not again while it stays.
    expect(said()).toBe('Total credits: 10.');
    choose('BIO 230', 3);
    expect(stripText()).not.toMatch(/Below|Over/);
    expect(said()).toBe('Total credits: 12.');
    add('mkt 321');
    add('cis 300');
    expect(numbers()[0]).toBe(18);
    expect(stripText()).not.toMatch(/Below|Over/);
    choose('BIO 230', 4);
    expect(numbers()[0]).toBe(19);
    expect(stripText()).toContain(OVER);
    expect(stripText()).not.toContain(UNDER);
    expect(said()).toBe(`Total credits: 19. ${OVER}`);
  });

  it('follows the legacy answer in the numbers', () => {
    add('fls 161');
    add('mgt 321');
    expect(numbers()).toEqual([6, 3, 0]);
    expect(stripText()).toContain('Waiting for your legacy answer.');
    $('[data-legacy="yes"]').click();
    expect(numbers()).toEqual([6, 6, 0]);
    expect(stripText()).not.toContain('Waiting');
    $('[data-legacy-change]').click();
    expect(numbers()).toEqual([6, 3, 0]);
    $('[data-legacy="no"]').click();
    expect(numbers()).toEqual([6, 3, 3]);
    expect(stripText()).not.toContain('Waiting');
    // A row that waits is treated the same.
    $('[data-legacy-change]').click();
    for (const one of ['mkt 410', 'cis 499', 'eco 301']) add(one);
    expect(answerOf('ECO 301')).toBe('Answer “Are you a legacy CIS student?” to see this.');
    expect(numbers()).toEqual([15, 9, 0]);
    expect(stripText()).toContain('Waiting for your legacy answer.');
  });

  it('keeps the numbers right as the list changes', () => {
    for (const one of ['act 215', 'mgt 321', 'mkt 410', 'bio 230', 'eng 131', 'eng 140']) add(one);
    expect(numbers()).toEqual([18, 12, 6]);
    expect([...document.querySelectorAll('[data-summary] .summary > div')].map(cell => [...cell.children].map(part => tidy(part.textContent)).join(' | '))).toEqual([
      '18 | Total credits', '12 | Count toward CIS | unless you’ve already passed them or filled their slots', '6 | Don’t count',
    ]);
    // The filter lists fewer rows; the numbers are about the whole list.
    $('[data-filter="no"]').click();
    expect(numbers()).toEqual([18, 12, 6]);
    $('[data-filter="all"]').click();
    // Removing the course that held a pick lets the other count.
    $('[data-remove="ENG 131"]').click();
    expect(numbers()).toEqual([15, 12, 3]);
    choose('BIO 230', 5);
    expect(numbers()).toEqual([17, 12, 5]);
    // Changed credits are kept while the student moves between pages...
    go('#/');
    go('#/check');
    expect(numbers()).toEqual([17, 12, 5]);
    expect(rows()).toContain('BIO 230 5 cr');
    // ...and start again at 3 when the course is removed and added again.
    $('[data-remove="BIO 230"]').click();
    expect(numbers()).toEqual([12, 12, 0]);
    add('bio 230');
    expect(rows()).toContain('BIO 230 3 cr');
    expect(numbers()).toEqual([15, 12, 3]);
    // No list, no numbers; they come back with the first course.
    for (const one of ['ACT 215', 'MGT 321', 'MKT 410', 'ENG 140', 'BIO 230']) $(`[data-remove="${one}"]`).click();
    expect(document.querySelector('[data-summary] .summary')).toBeNull();
    expect(stripText()).toBe('');
    add('ori 100');
    expect(numbers()).toEqual([1, 1, 0]);
    expect(stripText()).toContain(UNDER);
  });
});

// ---- F12: with a transcript (docs/sprints/F12.md) ----
describe('with a transcript', () => {
  const CONDITION = 'unless you’ve already passed it or filled this slot';
  const folder = join(import.meta.dirname, '..', 'synthetic', 'transcripts');
  const fileOf = (bytes: Uint8Array, name = 'transcript.pdf') => ({ name, size: bytes.length, arrayBuffer: async (): Promise<ArrayBuffer> => bytes.slice().buffer as ArrayBuffer });
  const madeUp = (name: string) => fileOf(new Uint8Array(readFileSync(join(folder, `${name}.pdf`))), `${name}.pdf`);
  const heading = (): string => tidy($('h1').textContent);
  const status = (): string => tidy($('[data-status]').textContent);
  const card = (): string => tidy($('[data-transcript]').textContent);
  const spoken = (): string => tidy($('#pathcheck-status').textContent);
  const numbers = (): number[] => [...document.querySelectorAll('[data-summary] .num')].map(one => Number(one.textContent));
  const strip = (): string => tidy(document.querySelector('[data-summary]')?.textContent);
  type Row = Record<string, unknown>;
  const good = (over: Row = {}): Row => ({ term: 'Fall 2025', transfer: false, prefix: 'MGT', number: '321', description: 'Prin of Management', attempted: 3, earned: 3, grade: 'B', points: 9, ...over });
  /** Puts a prepared reader's answer in the review step, as if its PDF had been chosen on this page. */
  const reviewing = (...answerRows: unknown[]): void => {
    Object.assign(app.left, { transcript: openTranscript('made-up.pdf', { rows: answerRows }, curriculum), continued: false, refusal: null, editing: null, draft: null, returnTo: 'check' });
    go('#/left');
  };
  // Sets a grade in an open edit. (The simulated browser does not honour the selected
  // option of a list made from HTML text; a real browser is checked by the evaluator.)
  const setGrade = (line: number, grade: string): void => { $<HTMLSelectElement>(`#row-${line}-grade`).value = grade; };
  afterEach(() => { vi.restoreAllMocks(); });

  it('adds a transcript and comes back', async () => {
    add('mgt 321');
    add('eng 131');
    expect(status()).toBe('No transcript added');
    expect(answers()).toEqual([`Counts toward CIS — Business core ${CONDITION}`, `Counts toward CIS — Composition ${CONDITION}`]);
    // "Choose transcript PDF" opens the same file picker as "Browse files".
    const made: HTMLInputElement[] = [];
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const element = create(tag);
      if (tag === 'input') { made.push(element as HTMLInputElement); vi.spyOn(element as HTMLInputElement, 'click').mockImplementation(() => undefined); }
      return element;
    }) as typeof document.createElement);
    $('[data-choose]').click();
    expect(made).toHaveLength(1);
    expect([made[0]!.type, made[0]!.accept]).toEqual(['file', 'application/pdf,.pdf']);
    expect(made[0]!.click).toHaveBeenCalledTimes(1);
    Object.defineProperty(made[0], 'files', { value: [madeUp('sample-b')] });
    made[0]!.dispatchEvent(new Event('change'));
    // The review step, which says where "Continue" goes.
    await vi.waitFor(() => expect(app.route).toBe('left'));
    expect(heading()).toBe('Check what was read');
    expect(tidy($('[data-returns]').textContent)).toBe('You’ll go back to “Check my courses”.');
    expect(document.querySelectorAll('.review-row')).toHaveLength(16);
    $('[data-continue]').click();
    // Back on "Check my courses": the keyboard on its heading, the typed courses still there.
    expect(app.route).toBe('check');
    expect(window.location.hash).toBe('#/check');
    expect(heading()).toBe('Check my courses');
    expect(document.activeElement).toBe($('h1'));
    expect(rows()).toEqual(['MGT 321 Principles of Management 3 cr', 'ENG 131 English Composition I 3 cr']);
    expect(status()).toBe('Transcript added');
    // Exact answers: no condition on the "Counts", none under the count.
    expect(answers()).toEqual(['Counts toward CIS — Business core', 'You already passed this']);
    expect(document.querySelector('[data-entries] .condition')).toBeNull();
    expect(numbers()).toEqual([6, 3, 3]);
    expect(strip()).not.toContain('unless');
    expect(card()).toBe('Your answers use your transcript (sample-b.pdf). 16 rows taken on. Use another transcript Choosing another transcript forgets your corrections.');
    // The answers stay exact as the list changes.
    add('bio 127');
    add('cis 206');
    expect(answers().slice(2)).toEqual(['Counts toward CIS — Science & math', 'Already in progress.']);
    expect(numbers()).toEqual([12, 6, 6]);
    // The same transcript is there on "See what I have left"; a transcript brought there stays there.
    go('#/left');
    expect(tidy($('[data-handed-on]').textContent)).toBe('16 rows taken on.');
    $('[data-another]').click();
    await app.takeFile(madeUp('sample-a'));
    expect(document.querySelector('[data-returns]')).toBeNull();
    $('[data-continue]').click();
    expect(app.route).toBe('left');
    expect(heading()).toBe('See what I have left');
  });

  it('says on the card why a file was not taken', async () => {
    type('mgt');
    const text = (words: string): Uint8Array => new TextEncoder().encode(words);
    const cases: [ReturnType<typeof fileOf>, string][] = [
      [fileOf(text('ENG 131 B')), 'That file is not a PDF. Choose the unofficial transcript PDF from the portal.'],
      [fileOf(text('%PDF-1.7 some other document')), 'PathCheck can only read its two made-up transcripts for now. Nothing from this file was kept or sent.'],
      [{ ...fileOf(text('%PDF-')), size: 11 * 1024 * 1024 }, 'That file is too large to be a transcript. Nothing from it was read.'],
      [{ name: 'gone.pdf', size: 10, arrayBuffer: (): Promise<ArrayBuffer> => Promise.reject(new Error('gone')) }, 'That file could not be opened. Choose it again.'],
    ];
    for (const [file, sentence] of cases) {
      await app.takeFile(file);
      // The student stays on this page; the reason is on the card and is read out.
      expect(app.route).toBe('check');
      expect(window.location.hash).toBe('#/check');
      expect(tidy($('[data-transcript] [data-refusal]').textContent)).toBe(sentence);
      expect(spoken()).toBe(sentence);
      expect(document.activeElement).toBe($('[data-choose]'));
      expect(app.left.transcript).toBeNull();
      expect(app.left.refusal).toBeNull();
      // What was being typed is still in the field.
      expect(field().value).toBe('mgt');
    }
    // The reason does not follow the student to another page, or wait for them here.
    go('#/left');
    expect(tidy($('[data-refusal]').textContent)).toBe('');
    go('#/check');
    expect(tidy($('[data-transcript] [data-refusal]').textContent)).toBe('');
    // A file refused after the student has left this page brings nobody back to it later.
    let release = (): void => undefined;
    const slow = { name: 'slow.pdf', size: 4, arrayBuffer: (): Promise<ArrayBuffer> => new Promise(resolve => { release = () => resolve(text('nope').slice().buffer as ArrayBuffer); }) };
    const pending = app.takeFile(slow);
    go('#/left');
    release();
    await pending;
    expect(app.left.returnTo).toBe('left');
    go('#/check');
    // A good file afterwards is taken.
    await app.takeFile(fileOf(text('nope')));
    await app.takeFile(madeUp('sample-a'));
    expect(app.route).toBe('left');
    expect(heading()).toBe('Check what was read');
  });

  it('asks the legacy question with a transcript', async () => {
    await app.takeFile(madeUp('sample-b'));
    $('[data-continue]').click();
    expect(app.route).toBe('check');
    add('fin 201');
    add('cis 499');
    add('mgt 321');
    // The transcript's FLS 161 holds an elective place only for a legacy student: the second elective depends on it.
    expect(answers()).toEqual([
      'Counts toward CIS — CIS electives', 'Are you a legacy CIS student? Yes No Your transcript has FLS 161, which counts only for legacy students.', 'Counts toward CIS — Business core',
    ]);
    expect(strip()).toContain('Waiting for your legacy answer.');
    expect(numbers()).toEqual([9, 6, 0]);
    expect(document.querySelector('.legacy-line')).toBeNull();
    $('[data-legacy="yes"]').click();
    expect(answerOf('CIS 499')).toBe('Doesn’t count — your 3 CIS elective places are already filled by FLS 161, MKT 410 and FIN 201.');
    expect(numbers()).toEqual([9, 6, 3]);
    expect(strip()).not.toContain('Waiting');
    // Answered once: remembered, not asked again, and it can be changed.
    expect(window.localStorage.getItem('pathcheck.legacy')).not.toBeNull();
    expect(document.querySelector('.legacy-ask')).toBeNull();
    expect(tidy($('.legacy-line').textContent)).toBe('Legacy CIS student: Yes Change');
    add('eco 301');
    expect(document.querySelector('.legacy-ask')).toBeNull();
    $('[data-remove="ECO 301"]').click();
    $('[data-legacy-change]').click();
    expect(answerOf('CIS 499')).toContain('Are you a legacy CIS student?');
    expect(document.activeElement).toBe($('[data-legacy="yes"]'));
    $('[data-legacy="no"]').click();
    expect(answerOf('CIS 499')).toBe('Counts toward CIS: elective (300/400-level CIS)');
    expect(numbers()).toEqual([9, 9, 0]);
    // A typed legacy course that is already passed says so: no question, whatever the answer.
    $('[data-legacy-change]').click();
    add('fls 161');
    expect(answerOf('FLS 161')).toBe('You already passed this');
    expect(document.querySelectorAll('.legacy-ask')).toHaveLength(1);
  });

  it('forgets the transcript', async () => {
    add('eng 131');
    await app.takeFile(madeUp('sample-b'));
    $('[data-continue]').click();
    expect(answers()).toEqual(['You already passed this']);
    type('mgt');
    $('[data-another]').click();
    expect(app.left.transcript).toBeNull();
    expect(status()).toBe('No transcript added');
    expect(answers()).toEqual([`Counts toward CIS — Composition ${CONDITION}`]);
    expect(strip()).toContain('unless you’ve already passed them or filled their slots');
    expect(card()).toContain('Add your transcript for an exact answer');
    expect(document.activeElement).toBe($('[data-choose]'));
    expect(tidy($('[data-said]').textContent)).toBe('No transcript added');
    // What was being typed stays.
    expect(field().value).toBe('mgt');
    // "See what I have left" has no transcript either.
    go('#/left');
    expect(document.querySelector('[data-drop]')).not.toBeNull();
  });

  it('waits for the review before it uses a transcript', async () => {
    add('eng 131');
    await app.takeFile(madeUp('sample-b'));
    // The student comes back without pressing "Continue".
    go('#/check');
    expect(status()).toBe('No transcript added');
    expect(answers()).toEqual([`Counts toward CIS — Composition ${CONDITION}`]);
    expect(card()).toBe('Your transcript is waiting to be checked. Check what was read');
    $('[data-review]').click();
    expect(app.route).toBe('left');
    expect(heading()).toBe('Check what was read');
    $('[data-continue]').click();
    expect(app.route).toBe('check');
    expect(answers()).toEqual(['You already passed this']);
  });

  it('lets the student fix the remaining rows from the card', () => {
    add('mgt 321');
    add('eng 131');
    add('mgt 422');
    // The student continued although one row (ENG 131, "B+") still needs fixing.
    reviewing(good(), good({ prefix: 'ENG', number: '131', grade: 'B+' }));
    $('[data-continue]').click();
    expect(app.route).toBe('check');
    expect(status()).toBe('Transcript added');
    expect(card()).toContain('1 row of your transcript still needs fixing, so these answers are not exact yet. Fix it');
    // The checked rows are used, but nothing is called exact: the unchecked row is ENG 131 itself.
    expect(answers()).toEqual(['You already passed this', `Counts toward CIS — Composition ${CONDITION}`, `Counts toward CIS — Business core ${CONDITION}`]);
    expect(strip()).toContain('unless you’ve already passed them or filled their slots');
    // "Fix it" opens the review again, as it was left; "Continue" comes back here.
    $('[data-review]').click();
    expect(app.route).toBe('left');
    expect(heading()).toBe('Check what was read');
    expect(tidy($('[data-returns]').textContent)).toBe('You’ll go back to “Check my courses”.');
    expect(tidy($('[data-line="1"]').textContent)).toContain('Needs fixing: the grade');
    $('[data-edit="1"]').click();
    setGrade(1, 'B');
    $('[data-save="1"]').click();
    $('[data-continue]').click();
    expect(app.route).toBe('check');
    expect(answers()).toEqual(['You already passed this', 'You already passed this', 'Counts toward CIS — Business core']);
    expect(card()).not.toContain('still need');
    expect(strip()).not.toContain('unless');
  });

  it('uses the corrected rows', () => {
    add('mgt 321');
    add('eng 131');
    add('eng 140');
    reviewing(good(), good({ prefix: 'ENG', number: '131' }));
    // A row left out is not used; a grade corrected to one below C is not passed.
    $('[data-out="0"]').click();
    $('[data-edit="1"]').click();
    setGrade(1, 'D');
    $('[data-save="1"]').click();
    $('[data-continue]').click();
    expect(app.route).toBe('check');
    expect(card()).toContain('1 row taken on. 1 left out as not on your transcript.');
    expect(answers()).toEqual(['Counts toward CIS — Business core', 'Counts toward CIS — Composition', 'Doesn’t count — it fills the same requirement as ENG 131.']);
    // Every row left out: no row is taken on, and the answers go back to conditional.
    reviewing(good());
    $('[data-out="0"]').click();
    $('[data-continue]').click();
    expect(status()).toBe('No transcript added');
    expect(card()).toContain('No row of your transcript (made-up.pdf) was taken on, so these answers don’t use it.');
    expect(answers()[0]).toBe(`Counts toward CIS — Business core ${CONDITION}`);
  });
});
