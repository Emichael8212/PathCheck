// @vitest-environment happy-dom
// F19: remembering (docs/sprints/F19.md; docs/BRIEF.md §4 "Remembering", §7). The last result
// and the list are kept in the student's own browser and nowhere else; no passing letter
// grade is kept; what is read back is not trusted; "Clear my data" removes all of it.
// A reload is a new app on the same browser storage.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sampleA from '../synthetic/transcripts/sample-a.json';
import sampleB from '../synthetic/transcripts/sample-b.json';
import { onTestDay } from './day';
import { startApp, type App, type AppWindow } from '../src/app';
import { curriculum } from '../src/curriculum';
import { CLEARED, STORED_KEYS, VISIT_KEY, keptRows, keptText, readKept } from '../src/remember';
import { correctRow, leaveOut, openTranscript, putBack, reviewRows, reviewedStandings, stillToFix, takenOn, type Transcript } from '../src/review';
import { defaultSettings } from '../src/pace';

const folder = join(import.meta.dirname, '..', 'synthetic', 'transcripts');
const fileOf = (bytes: Uint8Array, name: string) => ({ name, size: bytes.length, arrayBuffer: async (): Promise<ArrayBuffer> => bytes.slice().buffer as ArrayBuffer });
const madeUp = (name: string) => fileOf(new Uint8Array(readFileSync(join(folder, `${name}.pdf`))), `${name}.pdf`);
const tidy = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim();
const $ = <T extends HTMLElement>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`nothing matches ${selector}`);
  return found;
};
const go = (hash: string): void => {
  window.history.replaceState(null, '', hash);
  window.dispatchEvent(new Event('hashchange'));
};
const add = (text: string): void => {
  const field = $<HTMLInputElement>('#add-course');
  field.focus();
  field.value = text;
  field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
};
const choose = (selector: string, value: string): void => {
  const list = $<HTMLSelectElement>(selector);
  list.value = value;
  list.dispatchEvent(new Event('change', { bubbles: true }));
};
type Row = Record<string, unknown>;
const row = (prefix: string, number: string, grade: string | null = 'B', over: Row = {}): Row => ({ term: 'Fall 2025', transfer: false, prefix, number, description: `About ${prefix} ${number}`, attempted: '3.00', earned: '3.00', grade: grade ?? '', points: '9.00', ...over });

let app: App;
const win = window as unknown as AppWindow & { print?: () => void; today?: () => Date };
/** Opens PathCheck in this browser: the first time, or again after a reload, with whatever the browser kept. */
const open = (hash = '#/left'): void => {
  document.body.innerHTML = '<div id="app"></div>';
  window.history.replaceState(null, '', hash);
  win.print = () => {};
  app = startApp(onTestDay(win));
};
const reload = (hash = window.location.hash): void => {
  app.stop();
  open(hash);
};
const result = async (name = 'sample-a'): Promise<void> => {
  go('#/left');
  await app.takeFile(madeUp(name));
  $('[data-continue]').click();
};
/** Puts a prepared, reviewed transcript in the place of a read one, and has the visit kept. */
const having = (transcript: Transcript, continued = true): void => {
  Object.assign(app.left, { transcript, continued });
  go('#/check');
  go('#/left');
  $('h1').click();
};
const kept = (): { v: number; list: Row[]; term: string | null; result: { rows: (Row | null)[]; leftOut: number[]; pace: Row; moves: Row } | null } | null => {
  const text = window.localStorage.getItem(VISIT_KEY);
  return text === null ? null : JSON.parse(text);
};
const keys = (): string[] => Object.keys(window.localStorage).sort();
/** The page as the student reads it, and the settings its lists and steppers show. */
const page = (): string => tidy($('main').textContent);
const shown = () => ({
  text: page(),
  target: document.querySelector('[data-pace-target] option[selected]')?.getAttribute('value') ?? null,
  range: [...document.querySelectorAll('[data-stepper] [data-value]')].map(one => tidy(one.textContent)),
  summers: document.querySelector('[data-pace-summers]')?.getAttribute('aria-checked') ?? null,
  plan: [...document.querySelectorAll('.semester')].map(one => `${tidy(one.querySelector('h3')?.textContent)}: ${[...one.querySelectorAll('[data-move]')].map(move => (move as HTMLElement).dataset.move).join(', ')}`),
});
const rowsOnCheck = (): string[] => [...document.querySelectorAll<HTMLElement>('[data-entries] [role="row"].row')].map(one => {
  const credits = one.querySelector<HTMLSelectElement>('.cell-cr select');
  return tidy(`${one.querySelector('.cell-name')?.textContent} | ${credits ? credits.querySelector('option[selected]')?.getAttribute('value') : one.querySelector('.cell-cr')?.textContent} | ${one.querySelector('.cell-answer')?.textContent}`);
});

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  open();
});
afterEach(() => {
  app.stop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete win.print;
});

describe('coming back', () => {
  it('shows the last result again', async () => {
    expect(kept()).toBeNull();
    await result();
    $('[data-stepper="most"] [data-delta="1"]').click();
    $('[data-pace-summers]').click();
    $('[data-move="MGT 321"]').click();
    $('[data-move="MGT 321"]').click();
    const left = shown();
    expect(left.range).toEqual(['12', '19']);
    expect(left.summers).toBe('true');
    expect(left.text).toContain('credits left');
    const moved = left.plan.find(one => one.includes('MGT 321'));

    // A reload, a new tab, the next day: the same result, with no upload asked for.
    reload();
    expect(document.querySelector('[data-upload], [data-browse], .review-row')).toBeNull();
    expect(shown()).toEqual(left);
    expect(shown().plan.find(one => one.includes('MGT 321'))).toBe(moved);
    expect(tidy($('h1').textContent)).toBe('Your degree, in focus.');
    // It keeps working as before: a setting changed after the return is kept too.
    $('[data-stepper="most"] [data-delta="-1"]').click();
    const next = shown();
    expect(next.range).toEqual(['12', '18']);
    reload();
    expect(shown()).toEqual(next);
    // Opened from the Start page, the result is one click away, as on the first visit.
    reload('#/');
    go('#/left');
    expect(shown()).toEqual(next);
  });

  it('shows the list again', async () => {
    go('#/check');
    for (const one of ['mgt 321', 'bio 230', 'xyz 999']) add(one);
    const typed = rowsOnCheck();
    choose('[data-credits="XYZ 999"]', '4');
    expect(kept()!.list).toEqual([{ code: 'MGT 321' }, { code: 'BIO 230', credits: 3 }, { code: 'XYZ 999', credits: 4 }]);
    const total = tidy($('[data-summary]').textContent);
    reload();
    const list = rowsOnCheck();
    // The same three, with the same answers, and the credits the student gave.
    expect(list.slice(0, 2)).toEqual(typed.slice(0, 2));
    expect(list[2]).toBe(typed[2]!.replace('| 3 |', '| 4 |'));
    expect(tidy($('[data-summary]').textContent)).toBe(total);
    expect(total).toContain('10');
    // With a transcript the exact answers come back, and the term chosen for the pace line.
    await result();
    go('#/check');
    expect(tidy($('[data-status]').textContent)).toBe('Transcript added');
    choose('[data-line-term]', 'Fall 2027');
    const exact = rowsOnCheck();
    const line = tidy($('.pace-line').textContent);
    expect(exact).not.toEqual(list);
    reload();
    expect(tidy($('[data-status]').textContent)).toBe('Transcript added');
    expect(rowsOnCheck()).toEqual(exact);
    expect($('[data-line-term] option[selected]').getAttribute('value')).toBe('Fall 2027');
    expect(tidy($('.pace-line').textContent)).toBe(line);
    // The file's name is not kept: the card says "your transcript".
    expect(tidy($('[data-transcript]').textContent)).toContain('Your answers use your transcript (your transcript).');
    // A course removed stays removed.
    $('[data-remove="BIO 230"]').click();
    reload();
    expect(rowsOnCheck().join('\n')).not.toContain('BIO 230');
    expect(rowsOnCheck()).toHaveLength(2);
  });

  it('keeps the corrections', async () => {
    // A review as a student leaves it: one row corrected, one left out, one still to fix.
    let transcript = openTranscript('made-up.pdf', { rows: [row('ENG', '131', 'A'), row('MGT', '32l', 'B'), row('BIO', '230', 'A'), row('MGT', '422', 'B+'), row('CIS', '300', '')] }, curriculum);
    transcript = correctRow(transcript, 1, { term: 'Fall 2025', prefix: 'MGT', number: '321', attempted: '3', grade: 'B', transfer: false }, curriculum);
    transcript = leaveOut(transcript, 2);
    having(transcript);
    const before = page();
    expect(before).toContain('1 row of your transcript still needs fixing');
    const standings = reviewedStandings(transcript, curriculum.grades).map(one => `${one.code} ${one.standing}`);
    reload();
    expect(page()).toBe(before);
    const back = app.left.transcript!;
    expect(reviewedStandings(back, curriculum.grades).map(one => `${one.code} ${one.standing}`)).toEqual(standings);
    expect(takenOn(back).map(one => one.row.code)).toEqual(['ENG 131', 'MGT 321', 'CIS 300']);
    expect(stillToFix(back).map(one => [one.seen.prefix, one.seen.number, one.seen.grade, one.problems])).toEqual([['MGT', '422', 'B+', ['grade']]]);
    expect(reviewRows(back, curriculum).map(one => [one.code, one.state, one.leftOut])).toEqual([
      ['ENG 131', 'passed', false], ['MGT 321', 'passed', false], ['BIO 230', 'passed', true], ['MGT 422', 'to-fix', false], ['CIS 300', 'in-progress', false],
    ]);
    // "Check what was read" opens the rows, and the review still works on them.
    $('.review-foot [data-review-again]').click();
    expect(document.querySelectorAll('.review-row')).toHaveLength(5);
    expect(tidy($('.review-intro').textContent)).toBe('This is what PathCheck read from your transcript. Correct anything that was misread before you continue.');
    $('[data-continue]').click();
    expect(page()).toBe(before);

    // A legacy student's answer is still given after a return, and can still be changed.
    $('[data-another]').click();
    await result('sample-b');
    $('[data-legacy="yes"]').click();
    const legacy = page();
    reload();
    expect(page()).toBe(legacy);
    expect(tidy($('.legacy-line').textContent)).toBe('Legacy CIS student: Yes Change');
    $('[data-legacy-change]').click();
    expect(document.querySelector('[data-legacy-first]')).not.toBeNull();
    reload();
    expect(document.querySelector('[data-legacy-first]')).not.toBeNull();
    $('[data-legacy="no"]').click();
    reload();
    expect(tidy($('.legacy-line').textContent)).toBe('Legacy CIS student: No Change');
  });

  it('keeps a result, not a review in progress', async () => {
    // A transcript chosen but not continued: there is no result yet, and nothing is kept.
    await app.takeFile(madeUp('sample-a'));
    expect(document.querySelectorAll('.review-row').length).toBeGreaterThan(0);
    $('h1').click();
    expect(kept()).toBeNull();
    reload();
    expect(document.querySelector('[data-upload]')).not.toBeNull();
    expect(app.left.transcript).toBeNull();
    // A result, then back to "Check what was read", then a reload: the last result is back.
    await result();
    const before = page();
    $('.review-foot [data-review-again]').click();
    expect(document.querySelectorAll('.review-row').length).toBeGreaterThan(0);
    expect(kept()?.result).not.toBeNull();
    reload();
    expect(page()).toBe(before);
    // "Use another transcript": nothing of the old one is kept.
    $('[data-another]').click();
    expect(kept()).toBeNull();
    reload();
    expect(document.querySelector('[data-upload]')).not.toBeNull();
    // With a list, the list alone stays.
    go('#/check');
    add('mgt 321');
    await result('sample-b');
    $('[data-another]').click();
    expect(kept()).toMatchObject({ list: [{ code: 'MGT 321' }], result: null });
  });
});

describe('what is kept', () => {
  it('keeps only what the result needs', async () => {
    await result();
    $('[data-move="MGT 321"]').click();
    go('#/check');
    for (const one of ['mgt 321', 'xyz 999']) add(one);
    choose('[data-line-term]', 'Fall 2027');
    // Two entries at most are PathCheck's, and nothing else is of its making.
    expect(keys()).toEqual(['pathcheck.visit']);
    expect(STORED_KEYS).toEqual(['pathcheck.visit', 'pathcheck.legacy']);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    const visit = kept()!;
    expect(Object.keys(visit).sort()).toEqual(['list', 'result', 'term', 'v']);
    expect(visit).toMatchObject({ v: 1, list: [{ code: 'MGT 321' }, { code: 'XYZ 999', credits: 3 }], term: 'Fall 2027' });
    expect(Object.keys(visit.result!).sort()).toEqual(['leftOut', 'moves', 'pace', 'rows']);
    expect(visit.result!.pace).toEqual({ fewest: 12, most: 18, summers: false, target: null });
    expect(visit.result!.moves).toEqual({ 'MGT 321': 'Spring 2028' });
    // A row holds the course, its printed title, the term, the credits, whether it is transfer credit, and of the grade only what the result uses.
    for (const one of visit.result!.rows) expect(Object.keys(one!).sort()).toEqual(['attempted', 'description', 'grade', 'number', 'prefix', 'term', 'transfer']);
    // Never: the file's name, the PDF, totals lines, credits earned, quality points, the day.
    const text = window.localStorage.getItem(VISIT_KEY)!;
    expect(text).not.toMatch(/sample-a|\.pdf|%PDF|GPA|Standing|Totals|earned|points|2026-11-16|today/i);
    expect(visit.result!.rows).toHaveLength((sampleA as { rows: Row[] }).rows.length);
    expect(text.length).toBeLessThan(6000);
    // With a legacy answer, its own entry beside it.
    $('[data-forget], [data-another]').click();
    await result('sample-b');
    $('[data-legacy="no"]').click();
    expect(keys()).toEqual(['pathcheck.legacy', 'pathcheck.visit']);
    expect(window.localStorage.getItem('pathcheck.legacy')).toBe('no');
    expect(window.localStorage.getItem(VISIT_KEY)).not.toMatch(/legacy/i);
  });

  it('keeps no passing grade and shows the same result', async () => {
    const letter = /^[ABC][+-]?$/i;
    for (const [name, answer] of [['sample-a', sampleA], ['sample-b', sampleB]] as const) {
      window.localStorage.clear();
      reload('#/left');
      await result(name);
      if (document.querySelector('[data-legacy="yes"]')) $('[data-legacy="yes"]').click();
      const before = page();
      const grades = kept()!.result!.rows.map(one => one!.grade);
      // Every passing row has "Passed", every row in progress has none; no letter of a passing grade is in the entry.
      expect(grades.filter(grade => typeof grade === 'string' && letter.test(grade)), name).toEqual([]);
      const read = (answer as { rows: Row[] }).rows.filter(one => typeof one.number === 'string' && /^\d{3}$/.test(one.number));
      expect(grades.filter(grade => grade === 'Passed'), name).toHaveLength(read.filter(one => one.transfer === false && letter.test(String(one.grade))).length);
      expect(grades.filter(grade => grade === ''), name).toHaveLength(read.filter(one => one.transfer === true || String(one.grade ?? '').trim() === '').length);
      expect(window.localStorage.getItem(VISIT_KEY), name).not.toMatch(/"grade":"[ABC][+-]?"/);
      // The result is the same after a return, word for word and number for number.
      reload();
      expect(page(), name).toBe(before);
    }

    // A transcript with everything the result says about a grade: a D that is being repeated, a W, transfer credit, a row to fix.
    window.localStorage.clear();
    reload('#/left');
    const rows = [
      row('HIS', '131', 'A'), row('ECO', '251', 'D'), row('ECO', '251', '', { term: 'Fall 2026' }), row('MGT', '321', 'W'),
      row('ENG', '131', 'T', { transfer: true, attempted: '' }), row('MGT', '422', 'B+'), row('CIS', '205', 'c'), row('BIO', '230', 'B+'),
      { prefix: 'Term GPA', number: '', description: '', term: 'Fall 2025', transfer: false, attempted: '12.00', earned: '12.00', grade: '', points: '30.60' },
    ];
    let transcript = leaveOut(openTranscript('made-up.pdf', { rows }, curriculum), 7);
    having(transcript);
    const before = page();
    expect(before).toContain('Repeat; the earlier D doesn’t count.');
    expect(kept()!.result!.rows.map(one => [one!.prefix, one!.number, one!.grade])).toEqual([
      ['HIS', '131', 'Passed'], ['ECO', '251', 'D'], ['ECO', '251', ''], ['MGT', '321', 'W'],
      // Transfer credit has no grade to keep; a row still to fix is kept as it was read; left out, it keeps no grade.
      ['ENG', '131', ''], ['MGT', '422', 'B+'], ['CIS', '205', 'Passed'], ['BIO', '230', false],
    ]);
    expect(kept()!.result!.leftOut).toEqual([7]);
    reload();
    expect(page()).toBe(before);
    // "Check what was read" shows "Passed" where a passing letter was, and the other grades as they were.
    transcript = app.left.transcript!;
    expect(transcript.kept).toBe(true);
    expect(reviewRows(transcript, curriculum).map(one => [one.code, one.grade, one.state])).toEqual([
      ['HIS 131', 'Passed', 'passed'], ['ECO 251', 'D', 'below'], ['ECO 251', '', 'in-progress'], ['MGT 321', 'W', 'never'],
      ['ENG 131', '', 'passed'], ['MGT 422', 'B+', 'to-fix'], ['CIS 205', 'Passed', 'passed'], ['BIO 230', '', 'to-fix'],
    ]);
    $('.review-foot [data-review-again]').click();
    const read = [...document.querySelectorAll('.review-row .grade-read')].map(one => tidy(one.textContent));
    expect(read.filter(one => one === 'Passed')).toHaveLength(2);
    expect(read.filter(one => /^[ABC]$/i.test(one))).toEqual([]);
    expect(read).toContain('D');
    // A row opened for editing and saved unchanged is still "Passed".
    const unchanged = reviewRows(transcript, curriculum)[0]!.editable!;
    expect(unchanged.grade).toBe('Passed');
    transcript = correctRow(transcript, 0, unchanged, curriculum);
    expect(reviewRows(transcript, curriculum)[0]).toMatchObject({ code: 'HIS 131', grade: 'Passed', state: 'passed' });
    // Its grade can be chosen again.
    expect(reviewRows(correctRow(transcript, 0, { ...unchanged, grade: 'D' }, curriculum), curriculum)[0]).toMatchObject({ grade: 'D', state: 'below' });
    // The row to fix, once fixed, is kept as "Passed": its letters are gone from the entry.
    transcript = correctRow(transcript, 5, { term: 'Fall 2025', prefix: 'MGT', number: '422', attempted: '3', grade: 'B', transfer: false }, curriculum);
    having(transcript);
    expect(kept()!.result!.rows[5]).toMatchObject({ prefix: 'MGT', number: '422', grade: 'Passed' });
    expect(window.localStorage.getItem(VISIT_KEY)).not.toContain('B+');
    // The row to fix that was left out is still a row to fix when it is put back: its grade is chosen again.
    reload();
    transcript = putBack(app.left.transcript!, 7);
    expect(stillToFix(transcript).map(one => [one.seen.prefix, one.problems])).toEqual([['BIO', ['grade']]]);

    // Only what PathCheck itself kept is read that way: a freshly read "Passed" is not a grade, and the row is one to fix.
    const fresh = openTranscript('made-up.pdf', { rows: [row('HIS', '131', 'Passed')] }, curriculum);
    expect([takenOn(fresh).length, stillToFix(fresh).map(one => one.problems)]).toEqual([0, [['grade']]]);
    expect(takenOn(openTranscript('kept', { rows: [row('HIS', '131', 'Passed')] }, curriculum, true)).map(one => one.row)).toEqual([{ code: 'HIS 131', term: 'Fall 2025', credits: 3, grade: null, transfer: false, passed: true }]);
    // Transfer credit is never read as the kept word, and a row with another fault is not excused by it.
    expect(stillToFix(openTranscript('kept', { rows: [row('HIS', '13', 'Passed')] }, curriculum, true)).map(one => one.problems)).toEqual([['code']]);
  });

  it('keeps every fault of a row that still needs fixing', () => {
    // Whatever made a row one to fix is still a fault when it comes back: being kept never makes a row count.
    const faulty: unknown[] = [
      row('MGT', '321', 'B', { term: '' }), row('MGT', '321', 'B', { transfer: 'no' }), row('MG7', '321'), row('MGT', '321', 'B', { attempted: 'three' }),
      row('MGT', '321', 'B', { earned: 'x' }), row('MGT', '321', 'B', { points: 'y' }), row('MGT', '321', 4 as unknown as string), row('MGT', '321', 'B', { description: 7 }),
      'not a row', row('MGT', '321', 'Z'),
    ];
    const transcript = openTranscript('made-up.pdf', { rows: faulty }, curriculum);
    const problems = stillToFix(transcript).map(one => one.problems);
    expect(problems).toEqual([['term'], ['transfer'], ['code'], ['credits'], ['earned'], ['points'], ['grade'], ['description'], ['not-a-row'], ['grade']]);
    const back = readKept(keptText(curriculum, { entries: [], term: null }, { transcript, pace: defaultSettings(), moves: {} }), curriculum)!.result!.transcript;
    expect(stillToFix(back).map(one => one.problems)).toEqual(problems);
    expect(takenOn(back)).toEqual([]);
    // Lines that were thrown away are not kept, and the rows left out are still the same rows.
    const mixed = leaveOut(leaveOut(openTranscript('x.pdf', { rows: [row('ENG', '131'), { prefix: 'Term GPA 3.10' }, row('MGT', '321'), { description: 'Academic Standing: Good Standing' }, row('CIS', '300')] }, curriculum), 2), 4);
    expect(keptRows(mixed, curriculum)).toMatchObject({ rows: [{ prefix: 'ENG' }, { prefix: 'MGT' }, { prefix: 'CIS' }], leftOut: [1, 2] });
  });
});

describe('"Clear my data"', () => {
  it('clears everything', async () => {
    // Nothing kept, nothing to clear: no button on a first visit, and none on Start.
    for (const hash of ['#/', '#/check', '#/left']) {
      go(hash);
      expect(document.querySelector('[data-clear]'), hash).toBeNull();
    }
    // "Check my courses": the button comes with the first course, with its sentence, and goes with the last.
    go('#/check');
    add('fls 161');
    const row_ = $('[data-clear-row]');
    expect([row_.className, tidy(row_.textContent)]).toEqual(['actions no-print', 'Clear my data This list stays in this browser until you clear it.']);
    expect([$('[data-clear]').tagName, $('[data-clear]').className, $('[data-clear]').querySelector('svg[aria-hidden="true"]') !== null]).toEqual(['BUTTON', 'btn secondary', true]);
    const button = $('[data-clear]');
    add('mgt 321');
    expect($('[data-clear]')).toBe(button);
    $('[data-remove="MGT 321"]').click();
    $('[data-remove="FLS 161"]').click();
    expect(document.querySelector('[data-clear]')).toBeNull();
    // A legacy answer alone is something to clear: the button, without the sentence about a list.
    add('fls 161');
    $('[data-legacy="yes"]').click();
    $('[data-remove="FLS 161"]').click();
    expect(tidy($('[data-clear-row]').textContent)).toBe('Clear my data');
    // "See what I have left" before a result has it too when something is kept; Start never.
    go('#/left');
    expect(tidy($('[data-clear-row]').textContent)).toBe('Clear my data');
    go('#/');
    expect(document.querySelector('[data-clear]')).toBeNull();
    // The result: beside the print button, as in the design, with its sentence.
    go('#/check');
    add('mgt 321');
    await result('sample-b');
    const actions = $('.actions');
    expect([...actions.querySelectorAll('button')].map(one => [tidy(one.textContent), one.className])).toEqual([['Print / save PDF for your advisor', 'btn primary'], ['Clear my data', 'btn secondary']]);
    expect(tidy(actions.querySelector('[data-kept-note]')?.textContent)).toBe('This result stays in this browser until you clear it.');
    expect(document.querySelectorAll('[data-clear]')).toHaveLength(1);
    expect($('#app').getAttribute('data-keeps')).toBeNull();
    expect(keys()).toEqual(['pathcheck.legacy', 'pathcheck.visit']);

    $('[data-clear]').click();
    // Everything PathCheck stored is gone, and what was on the pages with it.
    expect(keys()).toEqual([]);
    expect(tidy($('[data-cleared]').textContent)).toBe('Your data was cleared from this browser.');
    expect(CLEARED).toBe('Your data was cleared from this browser.');
    expect(tidy($('#pathcheck-status').textContent)).toBe(CLEARED);
    expect($('main').firstElementChild).toBe($('[data-cleared]'));
    expect(document.activeElement).toBe($('h1'));
    expect(document.querySelector('[data-upload]')).not.toBeNull();
    expect(document.querySelector('[data-clear], .plan, .reqs')).toBeNull();
    expect(app.left).toMatchObject({ transcript: null, continued: false, moves: {} });
    go('#/check');
    expect(document.querySelector('[data-cleared]')).toBeNull();
    expect(rowsOnCheck()).toEqual([]);
    expect(tidy($('[data-status]').textContent)).toBe('No transcript added');
    // The legacy question is asked again.
    add('fls 161');
    expect(tidy($('[data-entries] .cell-answer').textContent)).toContain('Are you a legacy CIS student?');
    $('[data-clear]').click();
    expect(keys()).toEqual([]);
    expect(rowsOnCheck()).toEqual([]);
    expect(tidy($('[data-cleared]').textContent)).toBe(CLEARED);
    // After a reload nothing comes back.
    reload('#/left');
    expect(document.querySelector('[data-upload]')).not.toBeNull();
    go('#/check');
    expect(rowsOnCheck()).toEqual([]);
    expect(keys()).toEqual([]);
  });
});

describe('what is read back', () => {
  it('trusts nothing it reads back', async () => {
    const attack = '<img src=x onerror="window.hacked=1">';
    const good = { v: 1, list: [{ code: 'MGT 321' }], term: null, result: { rows: [row('ENG', '131', 'Passed'), row('MGT', '321', 'D')], leftOut: [], pace: { fewest: 12, most: 18, summers: false, target: null }, moves: {} } };
    const opening = (stored: unknown, hash = '#/left'): void => {
      app.stop();
      window.localStorage.clear();
      window.localStorage.setItem(VISIT_KEY, typeof stored === 'string' ? stored : JSON.stringify(stored));
      open(hash);
      // Whatever was there, nothing of it is drawn as HTML and the pages draw.
      for (const at of ['#/left', '#/check', '#/']) {
        go(at);
        expect(document.querySelector('img, script, iframe'), JSON.stringify(stored).slice(0, 60)).toBeNull();
        expect(tidy($('h1').textContent).length).toBeGreaterThan(3);
      }
      expect((window as unknown as { hacked?: number }).hacked).toBeUndefined();
      go(hash);
    };
    // The well-formed entry comes back.
    opening(good);
    expect(document.querySelector('.reqs')).not.toBeNull();
    expect(kept()).toMatchObject({ list: [{ code: 'MGT 321' }] });
    // Not JSON, another version, not an entry at all: thrown away, and gone from the browser.
    for (const bad of ['not json {', '{"v":2,"list":[{"code":"MGT 321"}]}', '[]', 'null', '"text"', '{"list":[{"code":"MGT 321"}]}', 'x'.repeat(400_000)]) {
      opening(bad);
      expect(document.querySelector('[data-upload]'), bad.slice(0, 30)).not.toBeNull();
      expect(window.localStorage.getItem(VISIT_KEY), bad.slice(0, 30)).toBeNull();
    }
    // Rows that are not rows: no result; the list beside them still comes back.
    for (const rows of ['rows', 7, null, { 0: row('ENG', '131') }, Array.from({ length: 700 }, () => row('ENG', '131'))]) {
      opening({ ...good, result: { ...good.result, rows } });
      expect(document.querySelector('[data-upload]')).not.toBeNull();
      expect(kept()).toMatchObject({ list: [{ code: 'MGT 321' }], result: null });
    }
    // Text where a title, a moved entry's name or a course code should be: shown as text, or dropped.
    opening({ ...good, list: [{ code: attack }, { code: 'mgt321' }, { code: 'MGT 321' }, { code: 7 }, null, { code: 'BIO 230', credits: 99 }, { code: 'XYZ 999', credits: 5 }, { code: 'XYZ 998', credits: '6' }],
      result: { ...good.result, rows: [row('ENG', '131', 'Passed', { description: attack }), row('MGT', '321', 'D', { term: attack })], moves: { [attack]: 'Fall 2027', 'MGT 422': attack, 'CIS 300': 'Fall 2027' } } });
    expect(kept()!.list).toEqual([{ code: 'MGT 321' }, { code: 'BIO 230', credits: 3 }, { code: 'XYZ 999', credits: 5 }, { code: 'XYZ 998', credits: 3 }]);
    expect(kept()!.result!.moves).toEqual({ [attack]: 'Fall 2027', 'CIS 300': 'Fall 2027' });
    $('.review-foot [data-review-again]').click();
    expect(tidy($('main').textContent)).toContain('<img src=x onerror="window.hacked=1">');
    expect(document.querySelector('img')).toBeNull();
    // A list far too long is not PathCheck's: only as many as a list can hold are read.
    opening({ ...good, list: Array.from({ length: 5000 }, (_, i) => ({ code: `ZZZ ${String(100 + (i % 900))}` })) }, '#/check');
    expect(rowsOnCheck().length).toBeLessThanOrEqual(200);
    // Settings out of range fall back to the usual ones; a target that is not a term is no target.
    for (const pace of [{ fewest: -3, most: 9999, summers: 'yes', target: 'banana' }, { fewest: 18, most: 12 }, { fewest: 12.5, most: 18 }, 'fast', null]) {
      opening({ ...good, result: { ...good.result, pace } });
      expect(kept()!.result!.pace, JSON.stringify(pace)).toEqual({ fewest: 12, most: 18, summers: false, target: null });
      expect(shown().range).toEqual(['12', '18']);
    }
    opening({ ...good, result: { ...good.result, pace: { fewest: 9, most: 15, summers: true, target: 'Fall 2030' } } });
    expect(kept()!.result!.pace).toEqual({ fewest: 9, most: 15, summers: true, target: 'Fall 2030' });
    // Rows said to be left out that are not rows of it are ignored; a term that is not a term is none.
    opening({ ...good, term: attack, result: { ...good.result, leftOut: [999, -1, 'x', 1.5, 1] } });
    expect(kept()).toMatchObject({ term: null, result: { leftOut: [1] } });
    // A passing letter put into the entry by hand is not kept again as a letter.
    opening({ ...good, result: { ...good.result, rows: [row('ENG', '131', 'A')] } });
    expect(kept()!.result!.rows).toMatchObject([{ grade: 'Passed' }]);
  });

  it('works without storage', async () => {
    const visit = async (): Promise<void> => {
      // Both flows work for the visit, and nothing is said about an error.
      go('#/check');
      add('mgt 321');
      expect(rowsOnCheck()).toHaveLength(1);
      await result();
      expect(document.querySelector('.plan')).not.toBeNull();
      $('[data-move="MGT 321"]').click();
      expect(tidy($('#app').textContent)).not.toMatch(/error|storage|could not be saved|quota/i);
      // The pages do not say that anything stays in this browser: the note is there for the stylesheet to hide.
      expect($('#app').getAttribute('data-keeps')).toBe('no');
      // "Clear my data" still forgets what is on the page.
      $('[data-clear]').click();
      expect(tidy($('[data-cleared]').textContent)).toBe(CLEARED);
      expect(document.querySelector('[data-upload]')).not.toBeNull();
      go('#/check');
      expect(rowsOnCheck()).toEqual([]);
    };
    const failing = (message: string) => (): never => { throw new Error(message); };
    const storages: [string, unknown][] = [
      ['missing', undefined],
      ['blocked on every use', { getItem: failing('blocked'), setItem: failing('blocked'), removeItem: failing('blocked') }],
      ['full', { getItem: (): null => null, setItem: failing('QuotaExceededError'), removeItem: (): void => undefined }],
    ];
    for (const [name, storage] of storages) {
      app.stop();
      vi.stubGlobal('localStorage', storage);
      expect(() => open('#/check'), name).not.toThrow();
      await visit();
      vi.unstubAllGlobals();
    }
    // A browser that fails on the mere mention of its storage.
    app.stop();
    const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: failing('SecurityError') });
    try {
      expect(() => open('#/check')).not.toThrow();
      await visit();
    } finally {
      if (real) Object.defineProperty(globalThis, 'localStorage', real);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
    expect(typeof window.localStorage.getItem).toBe('function');
    // The stylesheet hides the sentence where nothing is kept.
    expect(readFileSync(join(import.meta.dirname, '..', 'src', 'style.css'), 'utf8')).toContain('[data-keeps="no"] [data-kept-note] { display: none; }');
  });
});

describe('nothing leaves the browser', () => {
  it('sends nothing anywhere', async () => {
    const sent: string[] = [];
    vi.spyOn(window, 'fetch').mockImplementation((() => { sent.push('fetch'); return Promise.reject(new Error('no')); }) as never);
    vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => { sent.push('XMLHttpRequest'); });
    vi.stubGlobal('WebSocket', class { constructor() { sent.push('WebSocket'); } });
    vi.stubGlobal('EventSource', class { constructor() { sent.push('EventSource'); } });
    Object.defineProperty(window.navigator, 'sendBeacon', { configurable: true, value: () => { sent.push('beacon'); return true; } });
    // A whole visit: both flows, a return, a print, a report, clearing.
    go('#/check');
    for (const one of ['mgt 321', 'bio 230', 'fls 161']) add(one);
    $('[data-legacy="yes"]').click();
    await result('sample-b');
    $('[data-stepper="most"] [data-delta="-1"]').click();
    $('[data-move="MGT 462"]').click();
    reload();
    $('[data-print]').click();
    $('.foot a').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    $('.review-foot [data-review-again]').click();
    $('[data-continue]').click();
    go('#/check');
    reload();
    $('[data-clear]').click();
    expect(sent).toEqual([]);
    // No cookie, nothing in the session's storage, and nothing left behind.
    expect(document.cookie).toBe('');
    expect(window.sessionStorage.length).toBe(0);
    expect(keys()).toEqual([]);
    // No account and no sign-in on any page.
    for (const hash of ['#/', '#/check', '#/left']) {
      go(hash);
      expect(tidy($('#app').textContent), hash).not.toMatch(/\bsign[ -]?(in|up)\b|\blog[ -]?in\b|\bpassword\b|\baccount\b|\bregister\b/i);
      expect(document.querySelector('form, input[type="password"], input[type="email"]'), hash).toBeNull();
    }
    // Nothing in the app's code can send anything: it never names a way to.
    const src = join(import.meta.dirname, '..', 'src');
    for (const name of ['app.ts', 'remember.ts', 'left.ts', 'check.ts', 'upload.ts', 'report.ts', 'print.ts']) {
      expect(readFileSync(join(src, name), 'utf8'), name).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|document\.cookie|sessionStorage|indexedDB/);
    }
  });

  it('comes back whole', async () => {
    await result();
    $('[data-move="MGT 462"]').click();
    const email = (): string => { const link = $('.foot a'); link.dispatchEvent(new Event('pointerdown', { bubbles: true })); return link.getAttribute('href') ?? ''; };
    const before = { page: page(), email: email() };
    // The banner follows the day of the return: nothing about a day is kept.
    app.stop();
    document.body.innerHTML = '<div id="app"></div>';
    win.print = () => {};
    win.today = () => new Date(2027, 10, 16, 9);
    app = startApp(win);
    expect(tidy($('.old-review').textContent)).toContain('more than 12 months ago');
    expect(page()).toBe(before.page);
    // The email and the paper of a result that came back are the same.
    expect(email()).toBe(before.email);
    expect(tidy($('[data-print-head]').textContent)).toContain('PathCheck summary');
    let printed = 0;
    reload();
    win.print = () => { printed += document.querySelectorAll('details:not([open])').length === 0 ? 1 : 100; };
    $('[data-print]').click();
    expect(printed).toBe(1);
    window.dispatchEvent(new Event('afterprint'));
    // "Clear my data" and its sentence are not printed: they sit in the row that print hides.
    expect($('[data-clear]').closest('.no-print')).not.toBeNull();
    expect($('[data-kept-note]').closest('.no-print')).not.toBeNull();
    expect(window.localStorage.getItem(VISIT_KEY)).not.toMatch(/2027-11|old-review/);
  });
});
