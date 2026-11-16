// @vitest-environment happy-dom
// F07: typing, the keyboard and redrawing on "Check my courses", in a simulated browser
// (docs/sprints/F07.md). What a simulated browser models poorly (a click landing after the
// field loses focus, touch, real input methods) is also checked by the evaluator in a real one.
import { beforeEach, describe, expect, it } from 'vitest';
import { startApp, type AppWindow } from '../src/app';

const $ = <T extends HTMLElement>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`nothing matches ${selector}`);
  return found;
};
const field = (): HTMLInputElement => $('#add-course');
const menu = (): HTMLElement => $('#suggestions');
const options = (): HTMLElement[] => [...menu().querySelectorAll<HTMLElement>('[role="option"]')];
const optionCodes = (): string[] => options().map(one => one.querySelector('.code')?.textContent ?? '');
const rows = (): string[] => [...document.querySelectorAll('[data-entries] [role="row"].row')].map(row => (row.textContent ?? '').replace(/\s+/g, ' ').trim());
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
  document.body.innerHTML = '<div id="app"></div>';
  window.history.replaceState(null, '', '#/check');
  app = startApp(window as unknown as AppWindow);
});

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
    third.querySelector('.truncate')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
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

  it('moves the highlight without drawing the list again', () => {
    type('cis');
    const before = options();
    key('ArrowDown');
    before[3]!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
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
    expect(said()).toBe('MGT 321 added.');
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
