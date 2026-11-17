// @vitest-environment happy-dom
// F20: both flows from the first click to the last, as docs/BRIEF.md §4 has them step by
// step (docs/sprints/F20.md). The parts have their own tests; here the whole path is run.
// What a simulated browser cannot show (the design, contrast, a real phone, the 10
// seconds by a stopwatch) is checked by the evaluator in a real one.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sampleB from '../synthetic/transcripts/sample-b.json';
import { onTestDay } from './day';
import { type App, type AppWindow } from '../src/app';
import { showRow } from '../src/check';
import { type Curriculum } from '../src/curriculum';
import { type Transcript } from '../src/review';

const root = join(import.meta.dirname, '..');
const folder = join(root, 'synthetic', 'transcripts');
const fileOf = (bytes: Uint8Array, name: string) => ({ name, size: bytes.length, arrayBuffer: async (): Promise<ArrayBuffer> => bytes.slice().buffer as ArrayBuffer });
const madeUp = (name: string) => fileOf(new Uint8Array(readFileSync(join(folder, `${name}.pdf`))), `${name}.pdf`);
const tidy = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim();
const $ = <T extends HTMLElement>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`nothing matches ${selector}`);
  return found;
};
const all = (selector: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(selector)];
const go = (hash: string): void => {
  window.history.replaceState(null, '', hash);
  window.dispatchEvent(new Event('hashchange'));
};
const field = (): HTMLInputElement => $('#add-course');
const type = (text: string): void => {
  field().focus();
  field().value = text;
  field().dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
};
const enter = (): void => { field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); };
const add = (text: string): void => { type(text); enter(); };
const choose = (selector: string, value: string): void => {
  const list = $<HTMLSelectElement>(selector);
  list.value = value;
  list.dispatchEvent(new Event('change', { bubbles: true }));
};
const rows = (): HTMLElement[] => all('[data-entries] [role="row"].row');
const rowOf = (code: string): HTMLElement => {
  const found = rows().find(one => tidy(one.querySelector('.cell-name .code')?.textContent) === code);
  if (!found) throw new Error(`no row for ${code}`);
  return found;
};
const answerOf = (code: string): string => tidy(rowOf(code).querySelector('.cell-answer')?.textContent);
const summary = (): string => tidy($('[data-summary]').textContent);
const main = (): string => tidy($('main').textContent);
const CONDITION = 'unless you’ve already passed it or filled this slot';
const CAVEAT = 'Credits only — course order may add semesters.';
const NOT_OFFICIAL = 'Not an official degree audit.';
const REVIEWED = 'Curriculum last reviewed: Nov 2026';
const UNAVAILABLE = 'Upload isn’t available right now — try again tomorrow';
type Row = Record<string, unknown>;
const row = (prefix: string, number: string, grade = 'B', over: Row = {}): Row => ({ term: 'Fall 2025', transfer: false, prefix, number, description: `About ${prefix} ${number}`, attempted: '3.00', earned: '3.00', grade, points: '9.00', ...over });

let app: App;
// The curriculum and the transcript reader of the same copy of the app that is running.
let curriculum: Curriculum;
let openTranscript: (name: string, answer: unknown, curriculum: Curriculum) => Transcript;
let printed = 0;
const said: string[] = [];
const win = window as unknown as AppWindow & { print?: () => void; today?: () => Date };
/** Opens PathCheck as a first-time student does: on Start, with nothing kept. */
const open = async (hash = '#/'): Promise<void> => {
  document.body.innerHTML = '<div id="app"></div>';
  window.history.replaceState(null, '', hash);
  win.print = () => { printed++; };
  const { startApp } = await import('../src/app');
  ({ curriculum } = await import('../src/curriculum'));
  ({ openTranscript } = await import('../src/review'));
  app = startApp(onTestDay(win));
};
/** Chooses a made-up transcript on the page the student is on, and goes on from the review. */
const bring = async (name = 'sample-a'): Promise<void> => {
  await app.takeFile(madeUp(name));
  $('[data-continue]').click();
};
beforeEach(async () => {
  window.localStorage.clear();
  printed = 0;
  said.length = 0;
  // Whatever the pages say to the console is kept, and no test may leave anything there.
  for (const kind of ['error', 'warn'] as const) vi.spyOn(console, kind).mockImplementation((...parts: unknown[]) => { said.push(`${kind}: ${parts.map(String).join(' ')}`); });
  await open();
});
afterEach(() => {
  app.stop();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
  delete win.print;
  expect(said).toEqual([]);
});

describe('the start', () => {
  it('starts with two choices', () => {
    // Two big choices and nothing to fill in first.
    expect(all('#way-check, #way-left').map(one => tidy(one.textContent))).toEqual(['Check my courses', 'See what I have left']);
    expect(all('main input, main textarea')).toEqual([]);
    // (The design's list of majors has one program, already chosen: nothing to choose before starting.)
    expect(all('main select').map(one => [one.id, (one as HTMLSelectElement).options.length])).toEqual([['major', 1]]);
    expect(tidy($('h1').textContent).length).toBeGreaterThan(10);
    // Each opens its flow.
    const ways = all('main a[href="#/check"], main a[href="#/left"]').map(one => one.getAttribute('href'));
    expect(ways).toContain('#/check');
    expect(all('main a[href="#/left"], main [data-browse]').length).toBeGreaterThan(0);
    go('#/check');
    expect(tidy($('h1').textContent)).toBe('Check my courses');
    go('#/left');
    expect(tidy($('h1').textContent)).toBe('See what I have left');
  });

  it('opens Flow B from Start with the transcript', async () => {
    // "Browse files" on Start: the transcript is chosen there, and the student is in Flow B's review.
    expect(app.route).toBe('start');
    await app.takeFile(madeUp('sample-a'));
    expect(app.route).toBe('left');
    expect(tidy($('h1').textContent)).toBe('Check what was read');
    expect(all('.review-row').length).toBeGreaterThan(10);
  });

  it('answers a first course in three steps', () => {
    // One choice, a course typed, Enter: nothing else is asked and nothing has to be read first.
    expect($('main a[href="#/check"]')).toBeTruthy();
    go('#/check');
    // The page is ready to type in: the field is the first thing the keyboard reaches after the heading, and nothing stands before it.
    expect(document.activeElement).toBe($('h1'));
    const reachable = all('main a[href], main button:not([disabled]), main input, main select, main [tabindex="0"]');
    expect(reachable[0]).toBe(field());
    expect(all('main [role="dialog"], main [aria-modal]')).toEqual([]);
    expect(rows()).toEqual([]);
    type('MGT 321');
    enter();
    expect(rows()).toHaveLength(1);
    expect(answerOf('MGT 321')).toBe(`Counts toward CIS — Business core ${CONDITION}`);
    // The answer is the first row under the field, and the field is ready for the next course.
    expect(field().value).toBe('');
    expect(document.activeElement).toBe(field());
  });

  it('brings the answer into view on a small screen', () => {
    // On a phone the first answer can be below what the screen shows: the new row is then brought into view.
    const rowAt = (top: number, bottom: number) => {
      const calls: unknown[] = [];
      return { calls, getBoundingClientRect: () => ({ top, bottom }) as DOMRect, scrollIntoView: (how?: unknown) => { calls.push(how); } };
    };
    const screen = { top: 0, bottom: 740 };
    const below = rowAt(665, 840);
    showRow(below, screen);
    expect(below.calls).toEqual([{ block: 'center' }]);
    const above = rowAt(-90, 80);
    showRow(above, screen);
    expect(above.calls).toEqual([{ block: 'center' }]);
    // A row already in view stays where it is: nothing moves on a large screen.
    const inView = rowAt(300, 470);
    showRow(inView, screen);
    expect(inView.calls).toEqual([]);
    // With a phone's keyboard open, less of the page is seen: a row behind the keyboard, or above what is seen, is not in view.
    const behind = rowAt(300, 470);
    showRow(behind, { top: 0, bottom: 400 });
    expect(behind.calls).toEqual([{ block: 'center' }]);
    const over = rowAt(20, 190);
    showRow(over, { top: 60, bottom: 460 });
    expect(over.calls).toEqual([{ block: 'center' }]);
    expect(() => showRow(null, screen)).not.toThrow();
    expect(() => showRow(rowAt(0, 0))).not.toThrow();
    // Adding a course asks for exactly that row.
    go('#/check');
    const asked: string[] = [];
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({ top: 2000, bottom: 2170 }) as DOMRect);
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) { asked.push(tidy(this.querySelector('.cell-name .code')?.textContent)); });
    add('mgt 321');
    add('bio 230');
    add('bio 230');
    add('not a course');
    expect(asked).toEqual(['MGT 321', 'BIO 230']);
  });
});

describe('Flow A: "Check my courses"', () => {
  it('walks Flow A as the brief has it', async () => {
    go('#/check');
    // 1. Enter courses: by code or by title; suggestions come from the curriculum; the title is beside every answer.
    type('mgt 3');
    const byCode = all('#suggestions [role="option"]').map(one => tidy(one.textContent));
    expect(byCode.length).toBeGreaterThan(0);
    expect(byCode.every(one => /^MGT 3\d\d /.test(one))).toBe(true);
    type('principles of management');
    const byTitle = all('#suggestions [role="option"]').map(one => tidy(one.textContent));
    expect(byTitle.some(one => one.startsWith('MGT 321 Principles of Management'))).toBe(true);
    for (const option of byTitle) expect(curriculum.blocks.some(block => [...block.required, ...block.picks.flatMap(group => group.courses)].some(course => option.startsWith(`${course.code} ${course.title}`))) || curriculum.electives.named.some(course => option.startsWith(course.code)) || curriculum.electives.legacyOnly.some(course => option.startsWith(course.code)), option).toBe(true);
    enter();
    expect(tidy(rowOf('MGT 321').querySelector('.cell-name')?.textContent)).toBe('MGT 321 Principles of Management');
    // 3. One answer per course, in the brief's words; without a transcript every "Counts" has its condition.
    expect(answerOf('MGT 321')).toBe(`Counts toward CIS — Business core ${CONDITION}`);
    add('bio 230');
    expect(answerOf('BIO 230')).toBe('Doesn’t count toward CIS — not in the CIS curriculum');
    expect(tidy($('[data-status]').textContent)).toBe('No transcript added');
    // 4. The credit total, with its neutral notes under 12 and over 18, and none between.
    expect(summary()).toContain('Below 12 credits: below full-time; may affect scholarships.');
    for (const one of ['eng 131', 'cis 300']) add(one);
    expect(summary()).not.toMatch(/Below 12|Over 18/);
    for (const one of ['cis 302', 'cis 310', 'fin 321']) add(one);
    expect(summary()).toContain('Over 18 credits: may cost extra.');
    for (const one of ['FIN 321', 'CIS 310', 'CIS 302']) $(`[data-remove="${one}"]`).click();
    // 5. No pace without a transcript.
    expect(document.querySelector('.pace-line')).toBeNull();

    // 2. The optional transcript: chosen from this page, reviewed, and the student is back here.
    expect(main()).toContain('Add your transcript for an exact answer');
    expect($('[data-choose]')).toBeTruthy();
    await app.takeFile(madeUp('sample-a'));
    expect(app.route).toBe('left');
    expect(all('.review-row').length).toBeGreaterThan(10);
    $('[data-continue]').click();
    expect(app.route).toBe('check');
    expect(tidy($('[data-status]').textContent)).toBe('Transcript added');
    // With a transcript only: "You already passed this" and "This slot is already filled"; and no "unless …".
    expect(answerOf('ENG 131')).toBe('You already passed this');
    add('eng 140');
    expect(answerOf('ENG 140')).toBe('This slot is already filled');
    expect(answerOf('MGT 321')).toBe('Counts toward CIS — Business core');
    expect(tidy($('[data-entries]').textContent)).not.toContain('unless');
    expect(answerOf('BIO 230')).toBe('Doesn’t count toward CIS — not in the CIS curriculum');
    // 5. Pace, with a transcript only: the target semester is asked, and one line says what a term needs to finish by it, with its caveat.
    // (The owner's sentence of the M1 check, 2026-11-16: no finish date is named.)
    const line = tidy($('.pace-line').textContent);
    expect(line).toMatch(/^\d+ of these \d+ credits count\. To finish by (Spring|Fall) \d{4}, you need about \d+ counting credits a term\./);
    expect(line).not.toMatch(/finish (Spring|Fall|Summer)|semesters? after|at this pace/);
    expect(line).toContain(CAVEAT);
    expect(tidy($('label[for="line-target"]').textContent)).toBe('Target semester');
    expect($('[data-line-target]').id).toBe('line-target');
    const targets = [...$<HTMLSelectElement>('[data-line-target]').options].map(option => option.value);
    choose('[data-line-target]', targets[targets.length - 1]!);
    expect(tidy($('.pace-line').textContent)).not.toBe(line);
    expect(tidy($('.pace-line').textContent)).toContain(CAVEAT);
  });
});

describe('Flow B: "See what I have left"', () => {
  it('walks Flow B as the brief has it', async () => {
    go('#/left');
    // 1. The transcript is the only input: there is no field to type a course in.
    expect(all('main input, main textarea, main select')).toEqual([]);
    expect($('[data-browse]')).toBeTruthy();
    expect(main()).toContain('Google reads your PDF and may keep it briefly. Your result stays in this browser.');
    // 2. The review step shows what was read; a misread row is fixed there.
    await app.takeFile(madeUp('sample-b'));
    const read = (sampleB as { rows: Row[] }).rows.filter(one => typeof one.number === 'string' && /^\d{3}$/.test(one.number));
    expect(all('.review-row')).toHaveLength(read.length);
    Object.assign(app.left, { transcript: openTranscript('made-up.pdf', { rows: [...(sampleB as { rows: Row[] }).rows, row('MGT', '32l', 'B'), row('ENG', '209', '', { transfer: true, term: 'Transfer Credit', attempted: '' }), row('CIS', '300', 'D')] }, curriculum) });
    go('#/check');
    go('#/left');
    const misread = all('.review-row').find(one => tidy(one.textContent).includes('MGT 32l'))!;
    expect(tidy(misread.textContent)).toMatch(/Needs fixing/);
    const line = misread.getAttribute('data-line')!;
    $(`[data-edit="${line}"]`).click();
    const number = $<HTMLInputElement>(`[data-editing="${line}"] [data-field="number"]`);
    number.value = '321';
    number.dispatchEvent(new Event('input', { bubbles: true }));
    const grade = $<HTMLSelectElement>(`#row-${line}-grade`);
    grade.value = 'B';
    grade.dispatchEvent(new Event('change', { bubbles: true }));
    $(`[data-save="${line}"]`).click();
    expect(tidy($(`[data-line="${line}"]`).textContent)).toContain('MGT 321');
    expect(tidy($(`[data-line="${line}"]`).textContent)).not.toMatch(/Needs fixing/);
    $('[data-continue]').click();
    // The legacy question comes first when its answer would change the result.
    expect(document.querySelector('[data-legacy-first]')).not.toBeNull();
    expect(document.querySelector('.reqs, .plan')).toBeNull();
    $('[data-legacy="no"]').click();

    // 3. The checklist: each requirement Done, In progress or Still needed.
    const cards = all('.req');
    expect(cards).toHaveLength(9);
    for (const card of cards) expect(['Done', 'In progress', 'Still needed']).toContain(card.dataset.status);
    const listed = (status: string): string[] => all('.req .item-group, .req [data-group]').filter(group => tidy(group.textContent).startsWith(status)).flatMap(group => [...group.querySelectorAll('.code')].map(one => tidy(one.textContent)));
    const planned = all('[data-move]').map(one => one.dataset.move ?? '');
    const page = main();
    // In progress (no grade yet): shown "In progress", its requirement not Done, and not scheduled again.
    for (const code of ['CIS 206', 'ECO 251']) {
      expect(planned, code).not.toContain(code);
      const card = cards.find(one => [...one.querySelectorAll('.code')].some(shown => tidy(shown.textContent) === code))!;
      expect(card.dataset.status, code).not.toBe('Done');
      expect(tidy(card.textContent), code).toContain('In progress');
    }
    expect(listed('In progress').length + (page.match(/In progress/g) ?? []).length).toBeGreaterThan(2);
    // Below C, W and I do not count: the W course and the D course are still to take; the F was repeated and passed; the I is running again.
    expect(planned).toContain('BIO 127');
    expect(planned).toContain('CIS 300');
    expect(page).toContain('Must be repeated; the D doesn’t count.');
    expect(planned).not.toContain('CIS 205');
    // The row that was misread counts once it is fixed.
    expect(planned).not.toContain('MGT 321');
    // Transfer, AP and CLEP rows count when shown under a course code, whatever the grade column shows, also when it shows nothing.
    for (const code of ['ENG 131', 'MAT 137', 'HIS 131', 'ENG 209']) expect(planned, code).not.toContain(code);
    expect(tidy(cards.find(one => tidy(one.querySelector('summary')?.textContent).startsWith('Composition'))!.textContent)).toContain('ENG 131');
    // A course outside the curriculum is listed as not counting, and is never planned.
    expect(tidy($('.unused').textContent)).toContain('BIO 230');
    expect(planned).not.toContain('BIO 230');

    // 4. Pace: the target semester, the range (12 to 18 to start with), Summers (off), the answer and its caveat.
    expect($('[data-pace-target]').tagName).toBe('SELECT');
    expect(all('[data-stepper] [data-value]').map(one => tidy(one.textContent))).toEqual(['12', '18']);
    expect($('[data-pace-summers]').getAttribute('aria-checked')).toBe('false');
    expect(tidy($('[data-pace]').textContent)).toMatch(/(On pace|Not on pace) for (Fall|Spring) \d{4}/);
    expect(tidy($('[data-pace]').textContent)).toContain(CAVEAT);
    $('[data-stepper="most"] [data-delta="-1"]').click();
    expect(all('[data-stepper] [data-value]').map(one => tidy(one.textContent))).toEqual(['12', '17']);
    $('[data-stepper="most"] [data-delta="1"]').click();

    // 5. The draft plan: by level, MGT 462 last, each semester within the range, its label, "Move later", nothing to adopt.
    expect(tidy($('.plan .draft-label').textContent)).toBe('Draft — Order not checked — your portal checks prerequisites');
    const semesters = all('.semester');
    const credits = semesters.map(one => Number(tidy(one.querySelector('header .num')?.textContent).replace(' cr', '')));
    expect(credits.every(one => one <= 18)).toBe(true);
    expect(credits.slice(0, -1).every(one => one >= 12)).toBe(true);
    const lastEntries = [...semesters[semesters.length - 1]!.querySelectorAll('.plan-entry')];
    expect(tidy(lastEntries[lastEntries.length - 1]!.textContent)).toContain('MGT 462 Business Policies Always the final semester');
    const levels = all('.plan-entry:not(.is-choice) .code').map(one => tidy(one.textContent)).filter(code => /^[A-Z]{2,4} \d{3}$/.test(code) && code !== 'MGT 462').map(code => Math.floor(Number(code.split(' ')[1]) / 100));
    expect(levels.length).toBeGreaterThan(15);
    // By course level, 100 to 400: within a semester no course comes before one of a lower level, and the plan
    // starts with its lowest courses and ends with its highest. (A course that did not fit under the most credits
    // comes first in the next semester: tests/plan.test.ts has that rule and the order of the whole plan.)
    const levelOf = (entry: Element): number | null => { const code = entry.classList.contains('is-choice') ? '' : tidy(entry.querySelector('.code')?.textContent); return /^[A-Z]{2,4} \d{3}$/.test(code) && code !== 'MGT 462' ? Math.floor(Number(code.split(' ')[1]) / 100) : null; };
    const bySemester = semesters.map(one => [...one.querySelectorAll('.plan-entry')].map(levelOf).filter((level): level is number => level !== null));
    for (const one of bySemester) expect(one).toEqual([...one].sort((x, y) => x - y));
    expect(Math.min(...bySemester[0]!)).toBe(Math.min(...levels));
    expect(Math.max(...bySemester[bySemester.length - 1]!)).toBe(Math.max(...levels));
    expect(bySemester.map(one => Math.max(...one))).toEqual([...bySemester.map(one => Math.max(...one))].sort((x, y) => x - y));
    expect(all('.plan-entry')).toHaveLength(all('.plan-entry [data-move]').length);
    const termOf = (key: string): string => tidy($(`[data-move="${key}"]`).closest('.semester')?.querySelector('h3')?.textContent);
    const moved = planned.find(one => /^[A-Z]{2,4} \d{3}$/.test(one) && one !== 'MGT 462')!;
    const before = termOf(moved);
    $(`[data-move="${moved}"]`).click();
    expect(termOf(moved)).not.toBe(before);
    expect(all('.plan-entry')).toHaveLength(planned.length);
    expect(tidy($('.plan').textContent)).not.toMatch(/\b(adopt|apply|accept this plan|save plan|undo)\b/i);
    expect(all('.plan [draggable="true"]')).toEqual([]);

    // 6. Print / PDF a summary for an advisor.
    expect(tidy($('[data-print]').textContent)).toBe('Print / save PDF for your advisor');
    $('[data-print]').click();
    expect(printed).toBe(1);
    window.dispatchEvent(new Event('afterprint'));
  });
});

describe('the two flows together', () => {
  it('keeps the two flows together', async () => {
    // A transcript brought in "See what I have left" is used in "Check my courses".
    go('#/left');
    await bring('sample-b');
    $('[data-legacy="yes"]').click();
    const result = main();
    go('#/check');
    expect(tidy($('[data-status]').textContent)).toBe('Transcript added');
    for (const one of ['eng 131', 'fls 161', 'mgt 321']) add(one);
    expect(answerOf('ENG 131')).toBe('You already passed this');
    // The legacy answer is the same in both: it is not asked again here, and changing it here changes it there.
    expect(document.querySelector('.legacy-ask')).toBeNull();
    expect(tidy($('.legacy-line').textContent)).toBe('Legacy CIS student: Yes Change');
    // The target semester is the same in both.
    const targets = [...$<HTMLSelectElement>('[data-line-target]').options].map(option => option.value);
    const target = targets[targets.length - 1]!;
    choose('[data-line-target]', target);
    go('#/left');
    expect($('[data-pace-target] option[selected]').getAttribute('value')).toBe(target);
    expect(tidy($('.legacy-line').textContent)).toBe('Legacy CIS student: Yes Change');
    // After a reload both are as they were left.
    const left = main();
    expect(left).not.toBe(result);
    app.stop();
    await open('#/left');
    expect(main()).toBe(left);
    go('#/check');
    expect(rows().map(one => tidy(one.querySelector('.cell-name .code')?.textContent))).toEqual(['ENG 131', 'FLS 161', 'MGT 321']);
    expect(tidy($('[data-status]').textContent)).toBe('Transcript added');
    // "Clear my data" empties both.
    $('[data-clear]').click();
    expect(rows()).toEqual([]);
    expect(tidy($('[data-status]').textContent)).toBe('No transcript added');
    go('#/left');
    expect(document.querySelector('[data-upload]')).not.toBeNull();
    expect(Object.keys(window.localStorage)).toEqual([]);
  });

  it('still checks courses when upload is unavailable', async () => {
    // On the development server a file that is not one of the made-up PDFs is refused with its own sentence.
    go('#/check');
    add('mgt 321');
    const other = fileOf(new TextEncoder().encode('%PDF-1.4 somebody else'), 'other.pdf');
    await app.takeFile(other);
    expect(app.route).toBe('check');
    expect(main()).toContain('PathCheck can only read its two made-up transcripts for now. Nothing from this file was kept or sent.');
    add('bio 230');
    expect(answerOf('MGT 321')).toBe(`Counts toward CIS — Business core ${CONDITION}`);
    expect(answerOf('BIO 230')).toBe('Doesn’t count toward CIS — not in the CIS curriculum');

    // On the built site, when the reader cannot be reached: the brief's sentence, on both pages, and Flow A still works.
    app.stop();
    window.localStorage.clear();
    vi.stubEnv('DEV', false);
    vi.stubGlobal('fetch', () => Promise.reject(new Error('no reader here')));
    vi.resetModules();
    await open('#/left');
    await app.takeFile(madeUp('sample-a'));
    expect(app.left.transcript).toBeNull();
    expect(main()).toContain(UNAVAILABLE);
    expect(tidy($('#pathcheck-status').textContent)).toBe(UNAVAILABLE);
    expect(document.querySelector('.review-row')).toBeNull();
    go('#/check');
    add('mgt 321');
    await app.takeFile(madeUp('sample-a'));
    expect(app.route).toBe('check');
    expect(main()).toContain(UNAVAILABLE);
    add('bio 230');
    expect(answerOf('MGT 321')).toBe(`Counts toward CIS — Business core ${CONDITION}`);
    expect(answerOf('BIO 230')).toBe('Doesn’t count toward CIS — not in the CIS curriculum');
    expect(tidy($('[data-status]').textContent)).toBe('No transcript added');
    expect(summary()).toContain('Below 12 credits: below full-time; may affect scholarships.');
  });
});

describe('through both flows', () => {
  /** A visit through every page and state of the two flows; `at` is called on each. */
  const visit = async (at: (where: string) => void): Promise<void> => {
    at('Start');
    go('#/check');
    at('Check my courses, empty');
    for (const one of ['mgt 321', 'bio 230', 'fls 161', 'cis 304']) add(one);
    at('Check my courses, with the legacy question');
    $('[data-legacy="yes"]').click();
    at('Check my courses, answered');
    go('#/left');
    at('See what I have left, upload');
    await app.takeFile(madeUp('sample-a'));
    at('the review step');
    $(`[data-edit="${all('.review-row')[0]!.getAttribute('data-line')}"]`).click();
    at('the review step, a row being edited');
    $('[data-continue]').click();
    at('the result');
    $('[data-stepper="most"] [data-delta="-1"]').click();
    $('[data-move="MGT 462"]').click();
    at('the result, with a late plan');
    $('[data-reqs="not-done"]').click();
    $('[data-print]').click();
    window.dispatchEvent(new Event('afterprint'));
    at('the result, after printing');
    go('#/check');
    at('Check my courses, with a transcript');
    Object.assign(app.left, { transcript: openTranscript('made-up.pdf', { rows: [row('ENG', '131'), row('MGT', '321', 'B+')] }, curriculum), continued: true });
    go('#/left');
    at('the result, with a row to fix');
    go('#/check');
    at('Check my courses, with a row to fix');
    $('[data-clear]').click();
    at('after clearing');
  };

  it('keeps its promises through both flows', async () => {
    const places: string[] = [];
    await visit(where => {
      places.push(where);
      const page = tidy($('#app').textContent);
      // The two lines, on every page.
      expect(tidy($('.top-note').textContent), where).toBe(NOT_OFFICIAL);
      expect(tidy($('footer.foot').textContent), where).toContain(NOT_OFFICIAL);
      expect(tidy($('footer.foot').textContent), where).toContain(REVIEWED);
      // "Report a mistake" opens a filled-in email on every page.
      const link = $('.foot a');
      link.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      const href = link.getAttribute('href') ?? '';
      expect(href, where).toMatch(/^mailto:[^?]+\?subject=PathCheck%3A%20[^&]+&body=What%20looks%20wrong%3F/);
      expect(decodeURIComponent(href), where).toContain(REVIEWED);
      // Nothing sends the student to an advisor; the only mention is the print button's.
      expect(page.replace(/Print \/ save PDF for your advisor/g, ''), where).not.toMatch(/advis[eo]r/i);
      // Without a transcript in use, every "Counts" has its condition.
      if (document.querySelector('[data-status]') && tidy($('[data-status]').textContent) === 'No transcript added') {
        for (const counts of all('[data-entries] .answer.is-counts')) expect(tidy(counts.closest('.cell-answer')?.textContent), where).toContain(CONDITION);
      }
      // A finish or a pace is never named without its caveat.
      for (const pace of all('[data-pace], .pace-line')) {
        if (/On pace|Not on pace|To finish by/.test(tidy(pace.textContent))) expect(tidy(pace.textContent), where).toContain(CAVEAT);
      }
      // The plan, whenever it is there, says what it is.
      for (const plan of all('.plan')) expect(tidy(plan.textContent), where).toContain('Order not checked — your portal checks prerequisites');
    });
    expect(places).toHaveLength(14);

    // With the day moved past the review's anniversary, the banner starts every page.
    app.stop();
    win.today = () => new Date(2027, 10, 16, 9);
    document.body.innerHTML = '<div id="app"></div>';
    window.history.replaceState(null, '', '#/');
    const { startApp } = await import('../src/app');
    app = startApp(win);
    for (const hash of ['#/', '#/check', '#/left']) {
      go(hash);
      expect($('#app').firstElementChild?.className, hash).toBe('old-review');
      expect(tidy($('.old-review').textContent), hash).toContain('more than 12 months ago');
    }
    delete win.today;
  });

  it('says nothing to the console', async () => {
    // Every page and state of both flows, with nothing said to the console (checked after every test of this file).
    const seen: string[] = [];
    await visit(where => {
      seen.push(where);
      expect(tidy($('h1').textContent).length, where).toBeGreaterThan(3);
      // No page shows a word that only a program would write.
      expect(tidy($('#app').textContent), where).not.toMatch(/\bundefined\b|\bNaN\b|\[object |\bnull\b/);
    });
    expect(seen).toHaveLength(14);
    expect(said).toEqual([]);
  });

  it('uses no colour outside the tokens', () => {
    const css = readFileSync(join(root, 'src', 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // The three places where colours are named: the light values, the dark ones, and the ones for paper.
    const tokens = [...css.matchAll(/:root\s*\{[^}]*\}/g)].map(found => found[0]);
    expect(tokens).toHaveLength(3);
    const rest = tokens.reduce((text, block) => text.replace(block, ''), css);
    // Everywhere else a colour is a token: no hex value, no rgb() or hsl(), no named colour.
    expect(rest.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(rest.match(/\b(rgba?|hsla?|oklch|color-mix)\(/g) ?? []).toEqual([]);
    expect(rest.match(/(?:color|background|border[a-z-]*|outline|fill|stroke)\s*:\s*[^;]*\b(white|black|red|green|blue|gray|grey|navy|orange|yellow|purple)\b/g) ?? []).toEqual([]);
    // Each token has a light, a dark and a paper value.
    const names = (block: string): string[] => [...block.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(found => found[1]!).sort();
    const colours = names(tokens[1]!);
    expect(colours.length).toBeGreaterThan(12);
    expect(colours.filter(name => !names(tokens[0]!).includes(name))).toEqual([]);
    expect(colours.filter(name => !names(tokens[2]!).includes(name))).toEqual([]);
  });
});
