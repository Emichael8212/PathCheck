// F07: entering next semester's courses (docs/sprints/F07.md; docs/BRIEF.md §4 Flow A step 1;
// docs/design/DESIGN.md "Page 2: Check my courses"). The rules and the page's text; typing
// and the keyboard are in tests/check-page.test.ts.
import { describe, expect, it } from 'vitest';
// @ts-expect-error The approved mockups are plain JavaScript, with no type declarations.
import { check as approvedCheck } from '../mockups/data.js';
import rawData from '../docs/curriculum/provisional-current.json';
import madeUp from './fixtures/made-up-program.json';
import { NO_TRANSCRIPT, alreadyThere, checkPage, entriesHtml, filtersHtml, notACourse, noteText, statusText, suggestionsHtml, summaryHtml, transcriptCard, type CourseList, type OnCheck } from '../src/check';
import { UNKNOWN_COURSE_CREDITS } from '../src/credits';
import { curriculum, findCourse, loadCurriculum, type Course } from '../src/curriculum';
import { FEWEST_CHARACTERS, MOST_SUGGESTIONS, addCourse, entryFor, listedCourses, removeCourse, setCredits, suggest, type Entry } from '../src/entries';
import { courseStandings } from '../src/transcript';

const decode = (html: string): string => html
  .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ')
  .replace(/ ([,.;:)])/g, '$1');
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
const listed = (entries: readonly Entry[], legacy: boolean | null = null, filter: 'all' | 'no' = 'all'): CourseList => ({ entries, legacy, filter });
const drawn = (entries: readonly Entry[], legacy: boolean | null = null, filter: 'all' | 'no' = 'all'): string => entriesHtml(listed(entries, legacy, filter), curriculum);
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
    expect(drawn(entries).match(/aria-label="Remove [^"]+" data-remove="[^"]+"/g)).toEqual([
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
    // The same list drawn with the page.
    expect(checkPage(curriculum, listed(some))).toContain(drawn(some));
    // A course of the curriculum always has its title under its code; one outside it has none.
    for (const entry of some) {
      const cell = drawn([entry]).match(/<div role="cell" class="cell-name">([\s\S]*?)<\/div>/)?.[1] ?? '';
      expect(decode(cell).trim(), entry.code).toBe(entry.kind === 'listed' ? `${entry.code} ${course(entry.code).title}` : entry.code);
    }
    expect(drawn(some).match(/<div role="cell" class="cell-name">\s*<span class="code strong">([^<]+)</g)?.map(found => found.replace(/^[\s\S]*>/, '').replace('<', ''))).toEqual(['MGT 321', 'BIO 230', 'MGT 312', 'ENG 131']);
    expect(drawn(some)).toMatch(/<div class="table" role="table" aria-label="Your courses">/);
    expect(drawn(some).match(/role="columnheader"/g)).toHaveLength(4);
    expect(decode(drawn(some).match(/<div class="table-head" role="row">([\s\S]*?)<\/div>/)?.[1] ?? '')).toBe(' Course Credits Does it count? Remove ');
    expect(drawn(some).match(/role="row" class="row[^"]*"/g)).toHaveLength(4);
  });

  it('shows the empty state', () => {
    expect(drawn([])).toBe('<p class="empty-hint">Add the courses you plan to take next semester.</p>');
    expect(page).toContain(`<div data-entries>${drawn([])}</div>`);
    expect(page).toContain('<div data-filters></div>');
    expect(page).not.toMatch(/role="table"|role="row"/);
    expect(drawn(some)).not.toContain('empty-hint');
  });

  it('never puts typed text into the page', () => {
    // The only thing of an entry that is drawn is its code, title and credits, escaped.
    const odd: Entry = { code: 'BIO 230', title: '<img src=x onerror=alert(1)> "A&B"', credits: 3, kind: 'unknown' };
    const html = drawn([odd]);
    expect(html).not.toMatch(/<img/);
    expect(html).toContain('&quot;A&amp;B&quot;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    // The messages are fixed sentences, or name a course code in its normal form.
    expect(addCourse([], '<img src=x onerror=alert(1)>', null, curriculum)).toEqual({ entries: [], problem: 'not-a-course' });
    expect(notACourse(curriculum)).not.toMatch(/[<>]/);
  });
});

// F08: the answers on the page (docs/sprints/F08.md).
describe('the answers on the page', () => {
  const CONDITION = 'unless you’ve already passed it or filled this slot';
  const typed = (...codes: string[]): Entry[] => codes.reduce<Entry[]>((list, one) => added(list, one), []);
  const rowsOf = (html: string): string[] => html.split('<div role="row" class="row').slice(1).map(one => one.split('<p class="legacy-line">')[0]!.split('<p class="note">')[0]!);
  const six = typed('ACT 215', 'MGT 321', 'MKT 410', 'BIO 230', 'ENG 131', 'ENG 140');

  it('draws each answer with its mark', () => {
    const html = drawn(six);
    const rows = rowsOf(html);
    expect(rows).toHaveLength(6);
    // The six courses of the approved mockup, each with the mockup's answer, word for word.
    const approved = approvedCheck.courses as { code: string; counts: boolean; answer: string }[];
    expect(approved.map(one => one.code)).toEqual(six.map(one => one.code));
    approved.forEach((wanted, i) => {
      const row = rows[i]!;
      const answer = decode(row.match(/<div role="cell" class="cell-answer">([\s\S]*?)<div role="cell" class="cell-remove">/)?.[1] ?? '').trim();
      expect(answer, wanted.code).toBe(wanted.counts ? `${wanted.answer} ${CONDITION}` : wanted.answer);
      // "Counts": the outlined tick, no tint. "Doesn't count": the square cross and the tinted row.
      expect(row.startsWith(wanted.counts ? '">' : ' is-no">'), wanted.code).toBe(true);
      expect(row.includes('mark-counts'), wanted.code).toBe(wanted.counts);
      expect(row.includes('mark-no'), wanted.code).toBe(!wanted.counts);
      expect(row, wanted.code).toContain(wanted.counts ? '<p class="answer is-counts">' : '<p class="answer is-no">');
    });
    expect(html).not.toContain('mark-done');
    // Codes inside an answer are set in the code face.
    expect(html).toContain('it fills the same requirement as <span class="code">ENG 131</span>.');
    // The reminder, with its document icon, under the list.
    expect(html).toMatch(/<\/div>\s*<p class="note"><svg[^>]*>[\s\S]*?<\/svg>Remember: you need <span class="code">HIS 132<\/span> or <span class="code">ENG 210<\/span> for the history\/literature sequence\.<\/p>$/);
    expect(decode(html)).toContain(approvedCheck.reminder);
    expect(drawn(typed('MGT 321', 'HIS 132'))).not.toContain('class="note"');
    // A row that asks, and a row that waits: no mark, no tint, no verdict.
    const [asking, waiting] = rowsOf(drawn(typed('PSY 251', 'GEO 206')));
    for (const row of [asking!, waiting!]) {
      expect(row.startsWith('">')).toBe(true);
      expect(row).not.toMatch(/mark-counts|mark-no|is-counts|is-no|Counts toward|Doesn’t count/);
    }
    expect(asking).toMatch(/<div class="legacy-ask" role="group" aria-label="Are you a legacy CIS student\?">\s*<p>Are you a legacy CIS student\?<\/p>\s*<div class="legacy-buttons">\s*<button type="button" class="btn secondary" data-legacy="yes">Yes<\/button>\s*<button type="button" class="btn secondary" data-legacy="no">No<\/button>/);
    expect(decode(waiting!)).toContain('Answer “Are you a legacy CIS student?” to see this.');
    expect(waiting).toContain('<p class="answer is-waiting">');
  });

  it('shows the title next to every answer', () => {
    const rows = rowsOf(drawn(typed('MGT 321', 'ENG 131', 'ENG 140', 'FLS 161', 'BIO 230'), true));
    const names = ['MGT 321 Principles of Management', 'ENG 131 English Composition I', 'ENG 140 English Composition Honors I', 'FLS 161 Spanish I', 'BIO 230'];
    rows.forEach((row, i) => {
      // The title under the code, then the credits, then the answer: one row, one course.
      expect(decode(row.match(/<div role="cell" class="cell-name">([\s\S]*?)<\/div>/)?.[1] ?? '').trim()).toBe(names[i]);
      expect(row.indexOf('cell-name')).toBeLessThan(row.indexOf('cell-cr'));
      expect(row.indexOf('cell-cr')).toBeLessThan(row.indexOf('cell-answer'));
      expect(row.indexOf('cell-answer')).toBeLessThan(row.indexOf('cell-remove'));
      expect(row.match(/role="cell"/g)).toHaveLength(4);
    });
    expect(decode(rows[3]!)).toContain(`Counts toward CIS: elective (legacy) ${CONDITION}`);
  });

  it('never shows a Counts answer without its condition', () => {
    for (const legacy of [true, false, null]) {
      const text = decode(checkPage(curriculum, listed(typed('MGT 321', 'MKT 410', 'FIN 201', 'FLS 161', 'PSY 251', 'GEO 206', 'CIS 499', 'ECO 301', 'BIO 230'), legacy)));
      const counts = text.split('Counts toward CIS').slice(1);
      expect(counts.length).toBeGreaterThan(2);
      for (const after of counts) expect(after, String(legacy)).toMatch(new RegExp(`^[^.]{1,60}? ${CONDITION}`));
    }
  });

  it('draws the two filters and what each lists', () => {
    expect(filtersHtml(listed([]))).toBe('');
    expect(filtersHtml(listed(six)).match(/<button[^>]*>/g)).toEqual(['<button type="button" aria-pressed="true" data-filter="all">', '<button type="button" aria-pressed="false" data-filter="no">']);
    expect(filtersHtml(listed(six, null, 'no')).match(/aria-pressed="[^"]+"/g)).toEqual(['aria-pressed="false"', 'aria-pressed="true"']);
    expect(decode(filtersHtml(listed(six)))).toBe(' All courses Doesn’t count ');
    expect(filtersHtml(listed(six))).toMatch(/<div class="filters" role="group" aria-label="Filter courses">/);
    expect(filtersHtml(listed(six))).toMatch(/data-filter="no"><svg[^>]*mark-no/);
    // "Doesn't count" lists those rows only; a row that asks or waits is not one of them.
    const codesIn = (html: string): string[] => rowsOf(html).map(row => row.match(/<span class="code strong">([^<]+)</)?.[1] ?? '');
    expect(codesIn(drawn(six, null, 'no'))).toEqual(['BIO 230', 'ENG 140']);
    expect(codesIn(drawn(typed('PSY 251', 'GEO 206', 'BIO 230'), null, 'no'))).toEqual(['BIO 230']);
    expect(drawn(typed('MGT 321', 'FLS 161'), null, 'no')).toContain('<p class="empty-hint">No course in your list is marked “Doesn’t count”.</p>');
    expect(drawn(typed('MGT 321', 'FLS 161'), null, 'no')).not.toContain('role="table"');
    // The reminder does not depend on the filter.
    expect(drawn(six, null, 'no')).toContain('class="note"');
  });

  it('shows the line to change the legacy answer only when it matters', () => {
    const line = (answer: string): RegExp => new RegExp(`<p class="legacy-line">Legacy CIS student: <strong>${answer}</strong> <button type="button" class="text-link" data-legacy-change>Change</button></p>`);
    expect(drawn(typed('FLS 161'), true)).toMatch(line('Yes'));
    expect(drawn(typed('MGT 321', 'GEO 206', 'PSY 251'), false)).toMatch(line('No'));
    // Not before the answer, not without a course it matters for, and not for PSY 251 alone.
    expect(drawn(typed('FLS 161'))).not.toContain('legacy-line');
    expect(drawn(typed('MGT 321', 'BIO 230'), true)).not.toContain('legacy-line');
    expect(drawn(typed('PSY 251', 'MGT 321'), true)).not.toContain('legacy-line');
    expect(drawn([], true)).not.toContain('legacy-line');
  });
});

// F09: the numbers above the list (docs/sprints/F09.md).
describe('the numbers above the list', () => {
  const typed = (...codes: string[]): Entry[] => codes.reduce<Entry[]>((list, one) => added(list, one), []);
  const strip = (entries: readonly Entry[], legacy: boolean | null = null): string => summaryHtml(listed(entries, legacy), curriculum);
  const six = typed('ACT 215', 'MGT 321', 'MKT 410', 'BIO 230', 'ENG 131', 'ENG 140');
  const CONDITION = 'unless you’ve already passed them or filled their slots';

  it('shows the three numbers of the design', () => {
    expect(decode(strip(six))).toBe(` 18 Total credits 12 Count toward CIS ${CONDITION} 6 Don’t count `);
    // The labels and the condition are the approved mockup's.
    expect(approvedCheck.summaryLabels).toEqual(['Total credits', 'Count toward CIS', 'Don’t count']);
    expect(approvedCheck.countCondition).toBe(CONDITION);
    // The design's colors: plain, "counts", "doesn't count".
    expect(strip(six).match(/<span class="num[^"]*">\d+<\/span>/g)).toEqual(['<span class="num">18</span>', '<span class="num is-counts">12</span>', '<span class="num is-no">6</span>']);
    // Between the heading and the field, and nothing at all for an empty list.
    const page = checkPage(curriculum, listed(six));
    expect(page).toContain(`<div data-summary>${strip(six)}</div>`);
    expect(page.indexOf('data-summary')).toBeGreaterThan(page.indexOf('</h1>'));
    expect(page.indexOf('data-summary')).toBeLessThan(page.indexOf('class="toolbar"'));
    expect(strip([])).toBe('');
    expect(checkPage(curriculum)).toContain('<div data-summary></div>');
    expect(decode(strip(typed('ORI 100')))).toContain(' 1 Total credits ');
  });

  it('labels the numbers', () => {
    expect(strip(six)).toMatch(/^<div class="summary" role="group" aria-label="Credits">/);
    // Each number is followed at once by its label, in the same cell.
    expect(strip(six).match(/<div><span class="num[^"]*">\d+<\/span><span class="summary-label">[^<]+<\/span>/g)).toHaveLength(3);
  });

  it('never shows the count without its condition', () => {
    for (const entries of [six, typed('BIO 230'), typed('MGT 321'), typed('FLS 161', 'MGT 321')]) {
      for (const legacy of [true, false, null]) {
        expect(strip(entries, legacy)).toMatch(new RegExp(`<span class="num is-counts">\\d+</span><span class="summary-label">Count toward CIS</span><span class="summary-condition">${CONDITION}</span>`));
      }
    }
  });

  it('puts the note under the total, and only when it applies', () => {
    const under = 'Below 12 credits: below full-time; may affect scholarships.';
    const over = 'Over 18 credits: may cost extra.';
    const first = (html: string): string => decode(html.split('<div>')[1] ?? '').trim();
    expect(first(strip(typed('MGT 321')))).toBe(`3 Total credits ${under}`);
    expect(first(strip(typed('ORI 100')))).toBe(`1 Total credits ${under}`);
    expect(first(strip(typed('MGT 321', 'ENG 131', 'ACT 215', 'BIO 230')))).toBe('12 Total credits');
    expect(first(strip(six))).toBe('18 Total credits');
    expect(first(strip([...six, ...typed('ORI 100')]))).toBe(`19 Total credits ${over}`);
    for (const html of [strip(six), strip(typed('MGT 321', 'ENG 131', 'ACT 215', 'BIO 230'))]) expect(html).not.toMatch(/Below|Over/);
    expect(strip(typed('MGT 321'))).not.toContain(over);
    expect(noteText(listed(typed('MGT 321')))).toBe(under);
    expect(noteText(listed(six))).toBeNull();
    expect(noteText(listed([]))).toBeNull();
    // An edited unknown course moves the note.
    expect(noteText(listed(setCredits(six, 'BIO 230', 4)))).toBe(over);
  });

  it('says when the two counts wait for the legacy answer', () => {
    const waiting = 'Waiting for your legacy answer.';
    expect(decode(strip(typed('FLS 161', 'MGT 321')))).toBe(` 6 Total credits Below 12 credits: below full-time; may affect scholarships. 3 Count toward CIS ${CONDITION} ${waiting} 0 Don’t count ${waiting} `);
    // Under both counts for the eye; read out once.
    expect(strip(typed('FLS 161', 'MGT 321')).match(/<span class="summary-condition"( aria-hidden="true")?>Waiting for your legacy answer\.<\/span>/g)).toEqual([
      '<span class="summary-condition">Waiting for your legacy answer.</span>', '<span class="summary-condition" aria-hidden="true">Waiting for your legacy answer.</span>',
    ]);
    expect(decode(strip(typed('FLS 161', 'MGT 321'), true))).toBe(` 6 Total credits Below 12 credits: below full-time; may affect scholarships. 6 Count toward CIS ${CONDITION} 0 Don’t count `);
    expect(decode(strip(typed('FLS 161', 'MGT 321'), false))).toBe(` 6 Total credits Below 12 credits: below full-time; may affect scholarships. 3 Count toward CIS ${CONDITION} 3 Don’t count `);
    expect(strip(six)).not.toContain(waiting);
    expect(strip(typed('PSY 251'))).not.toContain(waiting);
  });

  it("lets only an unknown course's credits be changed", () => {
    const html = drawn(typed('MGT 321', 'ORI 100', 'FLS 161', 'MKT 410', 'BIO 230', 'CIS 304'), true);
    const cells = html.match(/<span role="cell" class="cell-cr num">[\s\S]*?<span class="cr-unit"> cr<\/span><\/span>/g) ?? [];
    expect(cells).toHaveLength(6);
    // Courses PathCheck knows: their credits as text.
    expect(cells.slice(0, 4)).toEqual(['3', '1', '3', '3'].map(credits => `<span role="cell" class="cell-cr num">${credits}<span class="cr-unit"> cr</span></span>`));
    // Courses it doesn't know: a labelled dropdown from 0 to 12, on 3.
    for (const [cell, code] of [[cells[4]!, 'BIO 230'], [cells[5]!, 'CIS 304']] as const) {
      expect(cell).toContain(`<select class="credits-select" aria-label="Credits for ${code}" data-credits="${code}">`);
      expect(cell.match(/<option value="(\d+)"( selected)?>\1<\/option>/g)).toHaveLength(13);
      expect(cell.match(/<option value="\d+" selected>/g)).toEqual(['<option value="3" selected>']);
      expect(cell).toContain('<option value="0">0</option>');
      expect(cell).toContain('<option value="12">12</option>');
    }
    expect(html.match(/<select/g)).toHaveLength(2);
    // The dropdown shows what the student chose.
    expect(drawn(setCredits(typed('BIO 230'), 'BIO 230', 7)).match(/<option value="\d+" selected>/g)).toEqual(['<option value="7" selected>']);
  });
});

// ---- F12: a transcript on the page (docs/sprints/F12.md) ----
describe('the transcript on the page', () => {
  const CONDITION = 'unless you’ve already passed it or filled this slot';
  const COUNT_CONDITION = 'unless you’ve already passed them or filled their slots';
  const typed = (...codes: string[]): Entry[] => codes.reduce<Entry[]>((list, one) => added(list, one), []);
  /** A reviewed transcript with these courses passed. */
  const withPassed = (codes: string[], more: { exact?: boolean; toFix?: number; used?: boolean } = {}): OnCheck => ({
    state: 'added',
    name: 'sample.pdf',
    use: more.used === false ? null : { standings: courseStandings(codes.map(code => ({ code, term: 'Fall 2025', credits: 3, grade: 'B', transfer: false })), curriculum.grades), exact: more.exact ?? true },
    counts: `${codes.length} rows taken on.`,
    toFix: more.toFix ?? 0,
  });
  const rowsOf = (html: string): string[] => html.split('<div role="row" class="row').slice(1).map(one => one.split('<p class="legacy-line">')[0]!.split('<p class="note">')[0]!);
  const answerIn = (row: string): string => decode(row.match(/<div role="cell" class="cell-answer">([\s\S]*?)<div role="cell" class="cell-remove">/)?.[1] ?? '').trim();

  it('offers the transcript as an option', () => {
    const page = checkPage(curriculum);
    // The note at the right of the heading, and the card, in the approved design's words.
    expect(page).toMatch(/<\/h1>\s*<\/div>\s*<span class="page-status" data-status>No transcript added<\/span>\s*<\/div>/);
    expect(approvedCheck.status).toBe('No transcript added');
    const card = transcriptCard(NO_TRANSCRIPT);
    expect(page).toContain(`<div data-transcript>${card}</div>`);
    expect(card).toMatch(/^<section class="exact" aria-labelledby="exact-title">/);
    expect(card).toContain(`<h2 id="exact-title">${approvedCheck.transcript}</h2>`);
    // (The mockup's privacy sentence was replaced by the owner on 2026-11-17, for M2, where Google Gemini reads the PDF.)
    expect(approvedCheck.privacy).toBe('Your PDF is read, then deleted. Only your result stays in this browser.');
    expect(decode(card)).toContain('Google reads your PDF and may keep it briefly. Your result stays in this browser.');
    expect(decode(card)).not.toContain('then deleted');
    expect(card).toMatch(new RegExp(`<button type="button" class="btn primary" data-choose>${approvedCheck.choose} <svg`));
    // The reason a file was not taken goes under the card; there is none yet.
    // (Under it, the place of Cloudflare's bot check: empty and out of sight unless a box must be ticked. F22)
    expect(card).toMatch(/<p class="field-message" data-refusal><\/p>\s*<div class="bot-check" data-turnstile><\/div>$/);
    // It is an option: nothing of it is a field to fill in, and the list works without it.
    expect(card).not.toMatch(/<input|type="file"/);
    expect(page.match(/<input/g)).toHaveLength(1);
    // The card comes after the list and its reminder.
    const some = checkPage(curriculum, listed(typed('MGT 321')));
    expect(some.indexOf('class="note"')).toBeGreaterThan(0);
    expect(some.indexOf('class="exact"')).toBeGreaterThan(some.indexOf('class="note"'));
    // Without a transcript every answer and number is as before.
    expect(entriesHtml(listed(typed('MGT 321', 'ENG 131')), curriculum, NO_TRANSCRIPT)).toBe(drawn(typed('MGT 321', 'ENG 131')));
    expect(summaryHtml(listed(typed('MGT 321')), curriculum, NO_TRANSCRIPT)).toBe(summaryHtml(listed(typed('MGT 321')), curriculum));
  });

  it('drops the condition with a transcript', () => {
    const list = listed(typed('MGT 321', 'ENG 131', 'ENG 140', 'FIN 201', 'BIO 230'));
    const transcript = withPassed(['ENG 131', 'ORI 100']);
    const rows = rowsOf(entriesHtml(list, curriculum, transcript));
    expect(rows.map(answerIn)).toEqual([
      'Counts toward CIS — Business core', 'You already passed this', 'This slot is already filled', 'Counts toward CIS — CIS electives', 'Doesn’t count toward CIS — not in the CIS curriculum',
    ]);
    // "Counts" keeps its outlined mark and has no condition line; the others are drawn as "Doesn't count".
    expect(rows.map(row => [row.includes('mark-counts'), row.includes('mark-no'), row.startsWith(' is-no">'), row.includes('class="condition"')])).toEqual([
      [true, false, false, false], [false, true, true, false], [false, true, true, false], [true, false, false, false], [false, true, true, false],
    ]);
    expect(rows.join('')).not.toContain('mark-done');
    // The numbers follow: 15 in all, 6 count, 9 don't; no condition under the count.
    const summary = summaryHtml(list, curriculum, transcript);
    expect(summary.match(/<span class="num[^"]*">(\d+)<\/span>/g)?.map(one => Number(one.replace(/\D+/g, '')))).toEqual([15, 6, 9]);
    expect(decode(summary)).not.toContain(COUNT_CONDITION);
    expect(decode(summaryHtml(list, curriculum))).toContain(COUNT_CONDITION);
    // The "Doesn't count" filter lists the three.
    expect(rowsOf(entriesHtml({ ...list, filter: 'no' }, curriculum, transcript))).toHaveLength(3);
    // While rows still need fixing nothing is exact: both conditions stay.
    const unchecked = withPassed(['ENG 131', 'ORI 100'], { exact: false, toFix: 1 });
    expect(rowsOf(entriesHtml(list, curriculum, unchecked)).map(answerIn)).toEqual([
      `Counts toward CIS — Business core ${CONDITION}`, 'You already passed this', 'This slot is already filled', `Counts toward CIS — CIS electives ${CONDITION}`, 'Doesn’t count toward CIS — not in the CIS curriculum',
    ]);
    expect(decode(summaryHtml(list, curriculum, unchecked))).toContain(COUNT_CONDITION);
    // A transcript with no row taken on changes nothing.
    expect(entriesHtml(list, curriculum, withPassed([], { used: false }))).toBe(entriesHtml(list, curriculum));
    expect(summaryHtml(list, curriculum, withPassed([], { used: false }))).toBe(summaryHtml(list, curriculum));
  });

  it('draws a course that is needed for a sequence with neither mark', () => {
    const list = listed(typed('HIS 132', 'MGT 321'));
    // Both sequence picks are held by other courses.
    const transcript = withPassed(['HIS 131', 'GEO 206', 'HUM 101']);
    const [needed, counting] = rowsOf(entriesHtml(list, curriculum, transcript));
    expect(answerIn(needed!)).toBe('Needed for the history sequence (3 extra credits).');
    expect(needed!.startsWith('">')).toBe(true);
    expect(needed).not.toMatch(/mark-counts|mark-no|is-counts|is-no|Counts toward|Doesn’t count|already filled/);
    expect(needed).toContain('<p class="answer">');
    expect(answerIn(counting!)).toBe('Counts toward CIS — Business core');
    // Its credits are in the total and in neither count.
    expect(summaryHtml(list, curriculum, transcript).match(/<span class="num[^"]*">(\d+)<\/span>/g)?.map(one => Number(one.replace(/\D+/g, '')))).toEqual([6, 3, 0]);
    // No reminder: the course it reminds of is in the list.
    expect(entriesHtml(list, curriculum, transcript)).not.toContain('class="note"');
    // While the other sequence's pick is open the course doesn't count, and the row says which to take.
    const [pointed] = rowsOf(entriesHtml(list, curriculum, withPassed(['HIS 131', 'GEO 206'])));
    expect(answerIn(pointed!)).toBe('Doesn’t count — same slot as GEO 206. Take ENG 210 for the sequence.');
    expect(pointed!.startsWith(' is-no">')).toBe(true);
    expect(pointed).toContain('same slot as <span class="code">GEO 206</span>. Take <span class="code">ENG 210</span> for the sequence.');
    expect(summaryHtml(list, curriculum, withPassed(['HIS 131', 'GEO 206'])).match(/<span class="num[^"]*">(\d+)<\/span>/g)?.map(one => Number(one.replace(/\D+/g, '')))).toEqual([6, 3, 3]);
  });

  it('says why the legacy question is asked on a row that is no legacy course', () => {
    const html = entriesHtml(listed(typed('CIS 499', 'ECO 301', 'ACT 350')), curriculum, withPassed(['FLS 161', 'MGT 220']));
    const [first, asking, waiting] = rowsOf(html);
    expect(answerIn(first!)).toBe('Counts toward CIS: elective (300/400-level CIS)');
    expect(asking).toMatch(/<div class="legacy-ask" role="group" aria-label="Are you a legacy CIS student\?">\s*<p>Are you a legacy CIS student\?<\/p>\s*<div class="legacy-buttons">\s*<button type="button" class="btn secondary" data-legacy="yes">Yes<\/button>\s*<button type="button" class="btn secondary" data-legacy="no">No<\/button>\s*<\/div>\s*<p class="condition">Your transcript has <span class="code">FLS 161<\/span> and <span class="code">MGT 220<\/span>, which count as electives only for legacy students\.<\/p>/);
    expect(answerIn(waiting!)).toBe('Answer “Are you a legacy CIS student?” to see this.');
    for (const row of [asking!, waiting!]) expect(row).not.toMatch(/mark-counts|mark-no|is-counts|is-no|Counts toward|Doesn’t count/);
    // Once answered, the line to change it is there although no typed course is a legacy course.
    expect(entriesHtml(listed(typed('CIS 499', 'ECO 301', 'ACT 350'), true), curriculum, withPassed(['FLS 161', 'MGT 220']))).toMatch(/<p class="legacy-line">Legacy CIS student: <strong>Yes<\/strong> <button type="button" class="text-link" data-legacy-change>Change<\/button><\/p>/);
  });

  it('says where the transcript stands', () => {
    // Uploaded, not yet checked: nothing is used; the card leads to the review.
    const reviewing: OnCheck = { state: 'reviewing' };
    expect(statusText(reviewing)).toBe('No transcript added');
    expect(decode(transcriptCard(reviewing))).toBe(' Your transcript is waiting to be checked. Check what was read ');
    expect(transcriptCard(reviewing)).toMatch(/<button type="button" class="btn secondary" data-review>Check what was read <svg/);
    expect(transcriptCard(reviewing)).not.toMatch(/data-choose|data-another|data-refusal/);
    expect(entriesHtml(listed(typed('MGT 321')), curriculum, reviewing)).toBe(drawn(typed('MGT 321')));
    // Reviewed: what the answers use, the review's counts, and the way to another transcript.
    const there = withPassed(['ENG 131', 'ORI 100']);
    expect(statusText(there)).toBe('Transcript added');
    expect(decode(transcriptCard(there))).toBe(' Your answers use your transcript (sample.pdf). 2 rows taken on. Use another transcript Choosing another transcript forgets your corrections. ');
    expect(transcriptCard(there)).toMatch(/<button type="button" class="btn secondary" data-another>Use another transcript<\/button>/);
    expect(transcriptCard(there)).not.toMatch(/data-choose|data-review|exact-warning/);
    // Rows still to fix: said, with the way back to them.
    expect(decode(transcriptCard(withPassed(['ENG 131'], { exact: false, toFix: 2 })))).toContain('2 rows of your transcript still need fixing, so these answers are not exact yet. The pace may change too. Fix them');
    const one = transcriptCard(withPassed(['ENG 131'], { exact: false, toFix: 1 }));
    expect(decode(one)).toContain('1 row of your transcript still needs fixing, so these answers are not exact yet. The pace may change too. Fix it');
    expect(one).toMatch(/<p class="exact-warning">[^<]+<\/p>\s*<button type="button" class="text-link" data-review>Fix it<\/button>/);
    expect(statusText(withPassed(['ENG 131'], { exact: false, toFix: 1 }))).toBe('Transcript added');
    // No row taken on: the answers do not use it, and the page says so.
    const unused = withPassed([], { used: false });
    expect(statusText(unused)).toBe('No transcript added');
    expect(decode(transcriptCard(unused))).toContain('No row of your transcript (sample.pdf) was taken on, so these answers don’t use it.');
    expect(transcriptCard(unused)).toContain('data-another');
    // It is not used, so nothing is said about being exact, even with rows still to fix.
    expect(transcriptCard(withPassed([], { used: false, toFix: 2 }))).not.toMatch(/exact-warning|data-review/);
    // None, after a file was not taken: the reason is under the card.
    expect(transcriptCard({ state: 'none', refusal: 'That file is not a PDF.' })).toMatch(/<p class="field-message" data-refusal>That file is not a PDF\.<\/p>\s*<div class="bot-check" data-turnstile><\/div>$/);
    // A file's name and a reason are shown as text.
    expect(transcriptCard({ ...there, name: '<b>x</b>.pdf' } as OnCheck)).toContain('(&lt;b&gt;x&lt;/b&gt;.pdf)');
    expect(transcriptCard({ state: 'none', refusal: '<i>no</i>' })).toContain('&lt;i&gt;no&lt;/i&gt;');
    // The page carries the note and the card of the state it is given.
    const page = checkPage(curriculum, listed(typed('MGT 321')), there);
    expect(page).toContain('<span class="page-status" data-status>Transcript added</span>');
    expect(page).toContain(`<div data-transcript>${transcriptCard(there)}</div>`);
  });
});
