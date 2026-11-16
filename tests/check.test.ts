// F07: entering next semester's courses (docs/sprints/F07.md; docs/BRIEF.md §4 Flow A step 1;
// docs/design/DESIGN.md "Page 2: Check my courses"). The rules and the page's text; typing
// and the keyboard are in tests/check-page.test.ts.
import { describe, expect, it } from 'vitest';
import rawData from '../docs/curriculum/provisional-current.json';
import madeUp from './fixtures/made-up-program.json';
import { alreadyThere, checkPage, entriesHtml, notACourse, suggestionsHtml } from '../src/check';
import { UNKNOWN_COURSE_CREDITS } from '../src/credits';
import { curriculum, findCourse, loadCurriculum, type Course } from '../src/curriculum';
import { FEWEST_CHARACTERS, MOST_SUGGESTIONS, addCourse, entryFor, listedCourses, removeCourse, suggest, type Entry } from '../src/entries';

const decode = (html: string): string => html
  .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ');
const codes = (courses: readonly { code: string }[]): string[] => courses.map(course => course.code);
const all = (text: string): Course[] => suggest(text, curriculum, 1000);
const course = (code: string): Course => {
  const found = findCourse(curriculum, code)[0]?.course;
  if (!found) throw new Error(`${code} is not in the curriculum`);
  return found;
};
// The curriculum's courses in the order of the data file, written out from the file itself.
const inFile = [
  ...rawData.blocks.flatMap(block => [...block.required, ...block.choices.flatMap(choice => choice.courses)]),
  ...rawData.electives.namedCourses, ...rawData.electives.legacyOnlyCourses,
].map(one => one.courseId.replace('-', ' ')).filter((code, i, list) => list.indexOf(code) === i);
const added = (entries: readonly Entry[], text: string, highlighted: Course | null = null): Entry[] => {
  const result = addCourse(entries, text, highlighted, curriculum);
  if (!('added' in result)) throw new Error(`${text} was not added: ${result.problem}`);
  return [...result.entries];
};

describe('what is suggested', () => {
  it('suggests by code, however it is typed', () => {
    const wanted = inFile.filter(code => code.startsWith('MGT 3'));
    expect(wanted).toContain('MGT 321');
    for (const text of ['mgt 3', 'mgt3', 'MGT-3', ' Mgt 3 ', 'mgt  3', 'MGT 3']) expect(codes(all(text)), text).toEqual(wanted);
    expect(all('mgt 3').find(one => one.code === 'MGT 321')?.title).toBe('Principles of Management');
    // In the curriculum's order, and six at most.
    const cis = inFile.filter(code => code.startsWith('CIS '));
    expect(cis.length).toBeGreaterThan(6);
    expect(MOST_SUGGESTIONS).toBe(6);
    expect(codes(suggest('cis', curriculum))).toEqual(cis.slice(0, 6));
    expect(codes(suggest('CIS 3', curriculum))).toEqual(cis.filter(code => code.startsWith('CIS 3')).slice(0, 6));
    // A whole code suggests that course, however it is written: what can be added can be suggested.
    for (const text of ['mgt 321', 'mgt-321', 'MGT–321', 'mgt\u00a0321', 'ＭＧＴ３２１', 'mgt\u200b321']) {
      expect(codes(all(text)), JSON.stringify(text)).toEqual(['MGT 321']);
      expect(codes(added([], text)), JSON.stringify(text)).toEqual(['MGT 321']);
    }
  });

  it('suggests by title', () => {
    const titled = (text: string): string[] => all(text).map(one => one.title);
    expect(codes(all('manag'))).toContain('MGT 321');
    for (const title of titled('manag')) expect(title.toLowerCase()).toMatch(/\bmanag/);
    expect(titled('manag').length).toBeGreaterThan(1);
    expect(titled('principles of ma')).toContain('Principles of Management');
    for (const title of titled('principles of ma')) expect(title).toMatch(/^Principles of Ma/);
    expect(titled('PRINCIPLES   OF MA')).toEqual(titled('principles of ma'));
    // From any word of the title on, but only at the start of a word and in order.
    expect(titled('of management')).toContain('Principles of Management');
    expect(all('anagement')).toEqual([]);
    expect(all('rinciples')).toEqual([]);
    expect(titled('management of')).not.toContain('Principles of Management');
    expect(all('management principles')).toEqual([]);
    // A title can be typed as it is printed, with its dashes and strokes.
    expect(titled('pre-calculus')).toEqual(['Pre-Calculus Algebra']);
    expect(titled('Pre Calculus alg')).toEqual(['Pre-Calculus Algebra']);
    expect(titled('law/legal')).toEqual(['Business Law/Legal']);
    expect(titled('business law/legal')).toEqual(['Business Law/Legal']);
    expect(titled('african-american')).toEqual(['Humanities Through the African-American Experience']);
    expect(titled('special topics: bus')).toEqual(['Special Topics: Business Communications']);
    // Code matches come before title matches.
    const mixed = all('ma');
    const byCode = mixed.map(one => one.code.startsWith('MA'));
    expect(byCode).toContain(true);
    expect(byCode).toContain(false);
    expect(byCode.lastIndexOf(true)).toBeLessThan(byCode.indexOf(false));
    for (const one of mixed.filter((_, i) => !byCode[i])) expect(one.title.toLowerCase()).toMatch(/(^|[^a-z0-9])ma/);
  });

  it('suggests only courses of the curriculum', () => {
    const listed = listedCourses(curriculum);
    expect(codes(listed)).toEqual(inFile);
    expect(new Set(codes(listed)).size).toBe(listed.length);
    for (const text of ['mgt', 'cis', 'manag', 'eng 1', 'intro', 'his', 'psy', 'fin', 'bus', 'co', 'world']) {
      for (const one of all(text)) {
        expect(listed, `${text}: ${one.code}`).toContain(one);
        expect(one.title.length, one.code).toBeGreaterThan(0);
      }
    }
    // The named elective and the legacy-only electives are courses of the curriculum.
    expect(codes(all('fin 2'))).toContain('FIN 201');
    expect(all('spanish')).toEqual([course('FLS 161')]);
    expect(codes(all('mgt 2'))).toEqual(expect.arrayContaining(['MGT 220', 'MGT 203']));
    // PSY 251 is listed as a pick and as a legacy elective: suggested once.
    expect(codes(all('psy'))).toEqual(['PSY 251']);
    expect(codes(all('general psych'))).toEqual(['PSY 251']);
    // A course outside the curriculum gets no suggestion.
    for (const text of ['bio 2', 'bio 230', 'mkt 4', 'mkt 410', 'xyz', 'zz']) expect(all(text), text).toEqual([]);
    // Another curriculum, other suggestions.
    const other = loadCurriculum(madeUp);
    expect(suggest('mgt 3', other)).toEqual([]);
    const theirs = suggest('xa', other, 1000);
    expect(theirs.length).toBeGreaterThan(0);
    for (const one of theirs) expect(listedCourses(other)).toContain(one);
  });

  it('never suggests the two courses that never count', () => {
    expect(curriculum.electives.except).toEqual(['CIS 304', 'CIS 415']);
    for (const text of ['cis', 'cis 3', 'cis 30', 'cis 304', 'cis304', 'CIS-304', 'cis 4', 'cis 41', 'cis 415', 'ci']) {
      for (const never of curriculum.electives.except) expect(codes(all(text)), text).not.toContain(never);
    }
    expect(all('cis 304')).toEqual([]);
    expect(all('cis 415')).toEqual([]);
    for (const never of curriculum.electives.except) expect(codes(listedCourses(curriculum))).not.toContain(never);
  });

  it('suggests nothing for too little text', () => {
    expect(FEWEST_CHARACTERS).toBe(2);
    for (const text of ['', ' ', '   ', 'm', ' m ', 'c', '3', '-', '--', '- -', ' – ', 'a-', '-a', 'a -', '?', '…', 'a.', 'a,', 'm?', 'a/', '.a', 'a:', '(m)', 'a…', '..', '?!']) expect(suggest(text, curriculum), JSON.stringify(text)).toEqual([]);
    // Two letters are enough, whatever stands between them.
    expect(suggest('m.g', curriculum)).toEqual([]);
    expect(suggest('m g', curriculum).length).toBeGreaterThan(0);
    expect(addCourse([], 'a.', suggest('a.', curriculum)[0] ?? null, curriculum)).toEqual({ entries: [], problem: 'not-a-course' });
    // Nothing but dashes must never add the curriculum's first course.
    expect(addCourse([], '--', suggest('--', curriculum)[0] ?? null, curriculum)).toEqual({ entries: [], problem: 'not-a-course' });
    expect(suggest('mg', curriculum).length).toBeGreaterThan(0);
    expect(suggest('mgt 3', curriculum, 0)).toEqual([]);
  });
});

describe('adding and removing', () => {
  it('adds a course of the curriculum with its title and credits', () => {
    const [first] = suggest('mgt 3', curriculum);
    expect(first?.code).toBe('MGT 321');
    const entries = added([], 'mgt 3', first);
    expect(entries).toEqual([{ code: 'MGT 321', title: 'Principles of Management', credits: 3, kind: 'listed' }]);
    // "MGT" with its first suggestion highlighted adds that suggestion.
    const [mgt] = suggest('MGT', curriculum);
    expect(added([], 'MGT', mgt)).toEqual([entryFor(mgt!.code, curriculum)]);
    // Credits are the curriculum's, whatever they are.
    expect(entryFor('ORI 100', curriculum)).toMatchObject({ credits: 1, kind: 'listed' });
    expect(entryFor('FLS 161', curriculum)).toMatchObject({ title: 'Spanish I', kind: 'listed' });
    expect(entryFor('FIN 201', curriculum)).toMatchObject({ title: 'Personal Finance', kind: 'listed' });
  });

  it('adds a course that is not in the curriculum', () => {
    expect(added([], 'bio 230')).toEqual([{ code: 'BIO 230', title: '', credits: UNKNOWN_COURSE_CREDITS, kind: 'unknown' }]);
    expect(added([], 'mkt410')).toEqual([{ code: 'MKT 410', title: '', credits: curriculum.electives.creditsPerCourse, kind: 'elective' }]);
    // The two courses that never count can be typed; PathCheck doesn't know them.
    expect(added([], 'cis 304')).toEqual([{ code: 'CIS 304', title: '', credits: UNKNOWN_COURSE_CREDITS, kind: 'unknown' }]);
    expect(added([], 'CIS-415')[0]).toMatchObject({ kind: 'unknown', title: '' });
    // Where the credits come from shows in a program whose rule gives 2: an elective by the
    // rule gets the rule's, an exception to the rule the unknown-course default.
    const other = loadCurriculum(madeUp);
    expect(other.electives.creditsPerCourse).toBe(2);
    expect(entryFor('XC 351', other)).toEqual({ code: 'XC 351', title: '', credits: 2, kind: 'elective' });
    expect(entryFor('XC 350', other)).toEqual({ code: 'XC 350', title: '', credits: UNKNOWN_COURSE_CREDITS, kind: 'unknown' });
    expect(UNKNOWN_COURSE_CREDITS).toBe(3);
  });

  it('adds the code that was typed in full', () => {
    // Whatever is highlighted, a whole code is what the student asked for.
    expect(codes(added([], 'cis 300', course('CIS 302')))).toEqual(['CIS 300']);
    expect(codes(added([], 'bio 230', course('MGT 321')))).toEqual(['BIO 230']);
    expect(codes(added([], ' Mgt-321 ', null))).toEqual(['MGT 321']);
    // Text that is not a whole code adds the highlighted course.
    expect(codes(added([], 'cis 30', course('CIS 302')))).toEqual(['CIS 302']);
    expect(codes(added([], '', course('ENG 131')))).toEqual(['ENG 131']);
  });

  it('refuses text that is not a course', () => {
    const before = added([], 'eng 131');
    for (const text of ['basket weaving', 'ZZZ', 'PSY 9', '321', 'MGT 3211', 'MGT 321, CIS 300', 'MGT 321 CIS 300', '<img src=x onerror=alert(1)>', 'x'.repeat(500), '', '   ', '--']) {
      expect(suggest(text, curriculum), text).toEqual([]);
      const result = addCourse(before, text, null, curriculum);
      expect(result, text).toEqual({ entries: before, problem: 'not-a-course' });
      expect(result.entries).toBe(before);
    }
    expect(notACourse(curriculum)).toBe('Type a course code like MGT 321, or pick a course from the list.');
  });

  it('does not add a course twice', () => {
    const once = added([], 'mgt 321');
    for (const [text, highlighted] of [['mgt-321', null], ['MGT321', null], ['mgt 3', course('MGT 321')], ['', course('MGT 321')]] as const) {
      const again = addCourse(once, text, highlighted, curriculum);
      expect(again).toEqual({ entries: once, problem: 'already-there', code: 'MGT 321' });
    }
    expect(alreadyThere('MGT 321')).toBe('MGT 321 is already in your list.');
    const unknown = added(once, 'bio 230');
    expect(addCourse(unknown, 'BIO-230', null, curriculum)).toMatchObject({ problem: 'already-there', code: 'BIO 230' });
    // A course already in the list is still suggested.
    expect(codes(suggest('mgt 321', curriculum))).toEqual(['MGT 321']);
  });

  it('removes one course', () => {
    let entries = added(added(added([], 'mgt 321'), 'bio 230'), 'eng 131');
    expect(entriesHtml(entries).match(/aria-label="Remove [^"]+" data-remove="[^"]+"/g)).toEqual([
      'aria-label="Remove MGT 321" data-remove="MGT 321"', 'aria-label="Remove BIO 230" data-remove="BIO 230"', 'aria-label="Remove ENG 131" data-remove="ENG 131"',
    ]);
    entries = removeCourse(entries, 'BIO 230');
    expect(codes(entries)).toEqual(['MGT 321', 'ENG 131']);
    expect(removeCourse(entries, 'XYZ 999')).toEqual(entries);
    // A removed course can be added again; it goes to the end.
    expect(codes(added(entries, 'bio 230'))).toEqual(['MGT 321', 'ENG 131', 'BIO 230']);
    expect(removeCourse(removeCourse(entries, 'MGT 321'), 'ENG 131')).toEqual([]);
  });
});

describe('the page', () => {
  const page = checkPage(curriculum);
  const some = added(added(added(added([], 'mgt 321'), 'bio 230'), 'mgt 312'), 'eng 131');

  it('has the field, its button and the heading', () => {
    expect(page.match(/<h1[^>]*>([^<]*)<\/h1>/g)).toEqual(['<h1 tabindex="-1">Check my courses</h1>']);
    expect(page).not.toContain('eyebrow');
    expect(page).toContain('<label for="add-course">Add a course</label>');
    const input = page.match(/<input[^>]*>/g) ?? [];
    expect(input).toHaveLength(1);
    for (const attribute of ['id="add-course"', 'type="text"', 'role="combobox"', 'aria-expanded="false"', 'aria-controls="suggestions"', 'aria-autocomplete="list"',
      'autocomplete="off"', 'autocorrect="off"', 'autocapitalize="off"', 'spellcheck="false"', 'enterkeyhint="done"', 'placeholder="Course code or title"']) {
      expect(input[0], attribute).toContain(attribute);
    }
    expect(input[0]).not.toMatch(/value=|aria-activedescendant/);
    expect(page).toMatch(/<button type="button" class="btn primary add" data-add disabled>Add<\/button>/);
    expect(page).toMatch(/<ul id="suggestions" role="listbox" aria-label="Suggestions" class="suggestions" hidden><\/ul>/);
    expect(page).toMatch(/<p id="add-message" class="field-message" role="status" aria-live="polite"><\/p>/);
    // The message is a live region only: were it also the field's description, some screen readers would read it twice.
    expect(input[0]).not.toContain('aria-describedby');
    expect(page).toMatch(/<p class="sr-only" role="status" aria-live="polite" data-said><\/p>/);
    expect(page).toContain('<a href="#/check" aria-current="page">Check my courses</a>');
    expect(page).not.toMatch(/<form/);
    // The footer spans the page, as in the design of this page.
    expect(page).toContain('<footer class="foot foot-wide">');
  });

  it('exposes each suggestion with its place in the list', () => {
    const three = suggest('cis', curriculum).slice(0, 3);
    const options = suggestionsHtml(three, 1).match(/<li [^>]*>/g) ?? [];
    expect(options).toEqual([
      '<li id="suggestion-1" role="option" aria-selected="false" aria-posinset="1" aria-setsize="3" data-index="0">',
      '<li id="suggestion-2" role="option" aria-selected="true" aria-posinset="2" aria-setsize="3" data-index="1">',
      '<li id="suggestion-3" role="option" aria-selected="false" aria-posinset="3" aria-setsize="3" data-index="2">',
    ]);
    expect(decode(suggestionsHtml(three, 0))).toBe(` ${three.map(one => `${one.code} ${one.title}`).join(' ')} `);
    expect(suggestionsHtml([], 0)).toBe('');
  });

  it('shows the title next to every entry', () => {
    expect(decode(entriesHtml(some))).toBe(' Course Credits Remove MGT 321 Principles of Management 3 cr BIO 230 3 cr MGT 312 3 cr ENG 131 English Composition I 3 cr ');
    // The same list drawn with the page.
    expect(checkPage(curriculum, some)).toContain(entriesHtml(some));
    // A course of the curriculum always has its title under its code; one outside it has none.
    for (const entry of some) {
      const cell = entriesHtml([entry]).match(/<div role="cell" class="cell-name">([\s\S]*?)<\/div>/)?.[1] ?? '';
      expect(decode(cell).trim(), entry.code).toBe(entry.kind === 'listed' ? `${entry.code} ${course(entry.code).title}` : entry.code);
    }
    expect(entriesHtml(some)).toMatch(/<div class="table" role="table" aria-label="Your courses">/);
    expect(entriesHtml(some).match(/role="columnheader"/g)).toHaveLength(3);
    expect(entriesHtml(some).match(/role="row" class="row"/g)).toHaveLength(4);
  });

  it('shows the empty state', () => {
    expect(entriesHtml([])).toBe('<p class="empty-hint">Add the courses you plan to take next semester.</p>');
    expect(page).toContain(`<div data-entries>${entriesHtml([])}</div>`);
    expect(page).not.toMatch(/role="table"|role="row"/);
    expect(entriesHtml(some)).not.toContain('empty-hint');
  });

  it('says nothing yet about what counts', () => {
    for (const html of [page, checkPage(curriculum, some)]) {
      const text = decode(html);
      expect(text).not.toMatch(/\bcounts?\b|doesn’t|doesn't|does it|total|elective|already passed/i);
      expect(html).not.toMatch(/mark-counts|mark-no|is-no|is-counts|cell-answer/);
    }
  });

  it('never puts typed text into the page', () => {
    // The only thing of an entry that is drawn is its code, title and credits, escaped.
    const odd: Entry = { code: '<b>"A&B"</b>', title: '<img src=x onerror=alert(1)>', credits: 3, kind: 'unknown' };
    const html = entriesHtml([odd]);
    expect(html).not.toMatch(/<b>|<img/);
    expect(html).toContain('&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    // The messages are fixed sentences, or name a course code in its normal form.
    expect(addCourse([], '<img src=x onerror=alert(1)>', null, curriculum)).toEqual({ entries: [], problem: 'not-a-course' });
    expect(notACourse(curriculum)).not.toMatch(/[<>]/);
  });
});
