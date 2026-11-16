// Page 2, "Check my courses": the student enters next semester's courses
// (docs/design/DESIGN.md). The page is drawn once; after that only the suggestions and the
// list are redrawn, so the field the student is typing in is never replaced.
//
// What the student types is never put into the page as it is: only a course code worked
// out from it.
import { type Course, type Curriculum } from './curriculum';
import { addCourse, removeCourse, suggest, type Entry } from './entries';
import { code, esc, icons } from './html';
import { FLOW_NAME, foot, top } from './shell';
import { countsExample } from './start';

const TEXT = {
  addLabel: 'Add a course',
  placeholder: 'Course code or title',
  add: 'Add',
  suggestions: 'Suggestions',
  empty: 'Add the courses you plan to take next semester.',
  table: 'Your courses',
  columns: ['Course', 'Credits', 'Remove'],
};
// The example code in this message is the Start page's example course, from the curriculum.
export const notACourse = (curriculum: Curriculum): string => `Type a course code like ${countsExample(curriculum).course.code}, or pick a course from the list.`;
export const alreadyThere = (courseCode: string): string => `${courseCode} is already in your list.`;
const added = (courseCode: string): string => `${courseCode} added.`;
const removed = (courseCode: string): string => `${courseCode} removed.`;

export const suggestionsHtml = (courses: readonly Course[], active: number): string =>
  courses.map((course, i) => `
        <li id="suggestion-${i + 1}" role="option" aria-selected="${i === active}" aria-posinset="${i + 1}" aria-setsize="${courses.length}" data-index="${i}">${code(course.code, 'strong')} <span class="truncate">${esc(course.title)}</span></li>`).join('');

const row = (entry: Entry): string => `
    <div role="row" class="row">
      <div role="cell" class="cell-name">
        ${code(entry.code, 'strong')}${entry.title ? `
        <p>${esc(entry.title)}</p>` : ''}
      </div>
      <span role="cell" class="cell-cr num">${entry.credits}<span class="cr-unit"> cr</span></span>
      <div role="cell" class="cell-remove">
        <button type="button" class="remove" aria-label="Remove ${esc(entry.code)}" data-remove="${esc(entry.code)}">${icons.x()}</button>
      </div>
    </div>`;

/** The list of entered courses, or the line that says there are none yet. */
export const entriesHtml = (entries: readonly Entry[]): string => (entries.length === 0
  ? `<p class="empty-hint">${esc(TEXT.empty)}</p>`
  : `<div class="table" role="table" aria-label="${esc(TEXT.table)}">
    <div class="table-head" role="row">
      ${TEXT.columns.map((heading, i) => `<span role="columnheader"${i === 2 ? ' class="sr-only"' : ''}>${esc(heading)}</span>`).join('\n      ')}
    </div>${entries.map(row).join('')}
  </div>`);

export const checkPage = (curriculum: Curriculum, entries: readonly Entry[] = []): string => `${top('check')}
<main class="check">
  <div class="page-head">
    <div>
      <h1 tabindex="-1">${esc(FLOW_NAME.check)}</h1>
    </div>
  </div>

  <div class="toolbar">
    <div class="search">
      <label for="add-course">${esc(TEXT.addLabel)}</label>
      <div class="search-row">
        <input id="add-course" type="text" role="combobox" aria-expanded="false" aria-controls="suggestions" aria-autocomplete="list" aria-describedby="add-message" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" placeholder="${esc(TEXT.placeholder)}">
        <button type="button" class="btn primary add" data-add disabled>${esc(TEXT.add)}</button>
      </div>
      <ul id="suggestions" role="listbox" aria-label="${esc(TEXT.suggestions)}" class="suggestions" hidden></ul>
      <p id="add-message" class="field-message" role="status" aria-live="polite"></p>
    </div>
  </div>

  <div data-entries>${entriesHtml(entries)}</div>
  <p class="sr-only" role="status" aria-live="polite" data-said></p>
</main>
${foot(curriculum, `PathCheck: ${FLOW_NAME.check}`)}`;

/** The list the student has entered. It is kept while they move between pages. */
export interface CourseList {
  entries: readonly Entry[];
}

/** Wires up the page once it is drawn. */
export function setupCheck(root: ParentNode, list: CourseList, curriculum: Curriculum): void {
  const input = root.querySelector<HTMLInputElement>('#add-course');
  const add = root.querySelector<HTMLButtonElement>('[data-add]');
  const menu = root.querySelector<HTMLElement>('#suggestions');
  const message = root.querySelector<HTMLElement>('#add-message');
  const region = root.querySelector<HTMLElement>('[data-entries]');
  const said = root.querySelector<HTMLElement>('[data-said]');
  if (!input || !add || !menu || !message || !region || !said) return;

  let suggestions: Course[] = [];
  let active = 0;

  const draw = (): void => {
    const open = suggestions.length > 0;
    menu.innerHTML = suggestionsHtml(suggestions, active);
    menu.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    if (open) input.setAttribute('aria-activedescendant', `suggestion-${active + 1}`);
    else input.removeAttribute('aria-activedescendant');
  };
  const close = (): void => { suggestions = []; active = 0; draw(); };
  const highlight = (index: number): void => { active = index; draw(); };

  const addNow = (course: Course | null): void => {
    const result = addCourse(list.entries, course ? '' : input.value, course ?? suggestions[active] ?? null, curriculum);
    if ('added' in result) {
      list.entries = result.entries;
      region.innerHTML = entriesHtml(list.entries);
      input.value = '';
      add.disabled = true;
      message.textContent = '';
      said.textContent = added(result.added.code);
      close();
    } else {
      message.textContent = result.problem === 'already-there' ? alreadyThere(result.code) : notACourse(curriculum);
    }
    input.focus();
  };

  input.addEventListener('input', () => {
    message.textContent = '';
    add.disabled = input.value.trim() === '';
    suggestions = suggest(input.value, curriculum);
    active = 0;
    draw();
  });
  input.addEventListener('keydown', event => {
    // Text still being put together by an input method is not finished: leave its keys alone.
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (input.value.trim() !== '') addNow(null);
    } else if (event.key === 'Escape') {
      if (suggestions.length > 0) { event.preventDefault(); close(); }
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length > 0) {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      highlight((active + step + suggestions.length) % suggestions.length);
    }
  });
  // Leaving the field (Tab, or a click elsewhere) closes the list and keeps the text.
  input.addEventListener('blur', close);
  add.addEventListener('click', () => addNow(null));

  const optionAt = (target: EventTarget | null): number | null => {
    const option = target instanceof Element ? target.closest<HTMLElement>('[data-index]') : null;
    return option ? Number(option.dataset.index) : null;
  };
  // A press on the list must not take the keyboard out of the field: the list would close
  // before the click lands.
  menu.addEventListener('mousedown', event => event.preventDefault());
  menu.addEventListener('mouseover', event => {
    const index = optionAt(event.target);
    if (index !== null && index !== active) highlight(index);
  });
  menu.addEventListener('click', event => {
    const index = optionAt(event.target);
    const course = index === null ? undefined : suggestions[index];
    if (course) addNow(course);
  });

  region.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-remove]') : null;
    const gone = button?.dataset.remove;
    if (!gone) return;
    const at = list.entries.findIndex(entry => entry.code === gone);
    list.entries = removeCourse(list.entries, gone);
    region.innerHTML = entriesHtml(list.entries);
    said.textContent = removed(gone);
    // The keyboard goes to the next course's Remove button, or back to the field.
    const buttons = region.querySelectorAll<HTMLElement>('[data-remove]');
    (buttons[Math.min(at, buttons.length - 1)] ?? input).focus();
  });
}
