// F06: the start screen and the app around it (docs/sprints/F06.md; docs/BRIEF.md §4, §6,
// §8; docs/design/DESIGN.md "Shared pieces" and "Page 1: Start"; owner answers of
// 2026-11-15 and 2026-11-16). These tests read the text and the markup. Whether the page
// looks like the owner's screenshots is the evaluator's job, with a browser.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The approved mockups are plain JavaScript, with no type declarations.
import { facts as approvedFacts, start as approvedStart } from '../mockups/data.js';
import rawData from '../docs/curriculum/provisional-current.json';
import madeUp from './fixtures/made-up-program.json';
import { renderPage, startApp, type AppWindow } from '../src/app';
import { UNKNOWN_COURSE_CREDITS } from '../src/credits';
import { CurriculumError, curriculum, findCourse, loadCurriculum, programs, type Program } from '../src/curriculum';
import { STEP_MS, nextStep, setupDemo, type DemoPart, type DemoRoot } from '../src/demo';
import examples from '../src/examples.json';
import { countsByElectiveRule } from '../src/placement';
import { HREF, foot, reviewedOn, routeOf, titleOf, top } from '../src/shell';
import { countsExample, demoStudent, doesNotCountExample, startPage } from '../src/start';
import { CAVEAT, CONDITION, NOT_AFFILIATED, NOT_IN_CURRICULUM, NOT_OFFICIAL, PRIVACY } from '../src/wording';

const repo = join(import.meta.dirname, '..');
const decode = (html: string): string => html
  .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ')
  .replace(/ ([,.;:)])/g, '$1').replace(/\( /g, '(');
const count = (text: string, part: string): number => text.split(part).length - 1;

const html = startPage();
const text = decode(html);
const pages = { start: html, check: renderPage('check'), left: renderPage('left') };
const strings = (value: unknown): string[] =>
  typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];

describe('the Start page', () => {
  it('shows the two choices and nothing to fill in', () => {
    expect(html).toMatch(/<h2 id="way-check">Check my courses<\/h2>/);
    expect(html).toMatch(/<h2 id="way-left">See what I have left<\/h2>/);
    // Each choice has its own way in.
    const [, check = '', left = ''] = html.split(/<section class="entry-(?:check|left)"/);
    expect(check).toContain(`href="${HREF.check}"`);
    expect(left.split('</section>')[0]).toContain(`href="${HREF.left}"`);
    // Nothing to type, tick or send first.
    expect(html).not.toMatch(/<input|<textarea|<form|\brequired\b/i);
    expect(count(html, '<select')).toBe(1);
    expect(html).toMatch(/<label for="major">Your major<\/label>/);
    expect(count(html, '<h1')).toBe(1);
  });

  it("keeps the owner's wording", () => {
    // Every text of the approved Start mockup, apart from the note about the mockup itself.
    const approved = structuredClone(approvedStart) as { left: { mockNote?: string } };
    expect(approved.left.mockNote).toBe('Mockup: opens synthetic student results.');
    delete approved.left.mockNote;
    const wanted = strings(approved);
    expect(wanted.length).toBeGreaterThan(40);
    for (const one of wanted) expect(text.includes(one) || html.includes(one.replace(/&/g, '&amp;')), one).toBe(true);
    expect(text).not.toMatch(/mockup|synthetic/i);

    for (const one of [
      'Before registration. Before you pay.', 'Does it count toward your degree?', 'Check before you select your classes.',
      'Know what counts. See what’s left. Make room for what matters.', '~30 seconds · No transcript needed',
      'Drag & drop your transcript PDF here', 'Browse files', 'See it work', 'A quick look',
    ]) expect(text, one).toContain(one);
    // The privacy sentence sits with the upload control.
    expect(PRIVACY).toBe('Your PDF is read, then deleted. Only your result stays in this browser.');
    expect(html).toMatch(/<div class="drop">[\s\S]*Browse files[\s\S]*Your PDF is read, then deleted\. Only your result stays in this browser\.[\s\S]*?<\/div>/);
    // The top bar.
    expect(NOT_OFFICIAL).toBe(approvedFacts.notOfficial);
    expect(decode(top('start'))).toBe(' PathCheck. Check my courses What I have left Not an official degree audit. ');
  });

  it('shows the name and that it is not affiliated', () => {
    expect(NOT_AFFILIATED).toBe('Not affiliated with Alabama State University');
    for (const [name, page] of Object.entries(pages)) {
      expect(page, name).toMatch(/<a class="wordmark" href="#\/">PathCheck<span class="dot">\.<\/span><\/a>/);
      expect(page, name).toMatch(/<footer class="foot( foot-wide)?">[\s\S]*<p>Not affiliated with Alabama State University<\/p>\s*<\/footer>/);
      expect(page, name).not.toMatch(/<img|logo|<picture|background-image/i);
    }
  });

  it('has no sign-in, account or advisor screen', () => {
    const banned = /\bsign[ -]?in\b|\blog[ -]?in\b|\bpassword\b|\baccounts?\b|advisor/i;
    expect(text).not.toMatch(banned);
    for (const route of ['start', 'check', 'left'] as const) expect(decode(top(route) + foot(curriculum)), route).not.toMatch(banned);
    for (const [name, page] of Object.entries(pages)) expect(decode(page), name).not.toMatch(/ask your advisor/i);
    // The check is not blind: it sees the words it looks for.
    for (const one of ['Sign in', 'sign-in', 'Log in', 'login', 'Your account', 'Ask your advisor']) expect(one).toMatch(banned);
    expect('Principles of Accounting').not.toMatch(banned);
  });

  it('lists only the majors the app has, one of them', () => {
    expect(programs.map(one => one.name)).toEqual(['B.S. Computer Information Systems']);
    expect(html.match(/<select id="major">([\s\S]*?)<\/select>/)?.[1]).toBe('<option value="asu-bs-cis" selected>B.S. Computer Information Systems</option>'.replace('asu-bs-cis', programs[0]!.id));
    expect(html).not.toMatch(/disabled|coming soon/i);
    // The list is the app's list of programs: a second program would be a second option.
    const second: Program = { id: 'made-up-program', name: 'B.S. Made-up Studies', curriculum: loadCurriculum(madeUp) };
    const both = startPage([...programs, second]);
    expect(both.match(/<option /g)).toHaveLength(2);
    expect(both).toContain('<option value="made-up-program">B.S. Made-up Studies</option>');
    expect(both.match(/ selected>/g)).toHaveLength(1);
    expect(() => startPage([])).toThrow(/no program/);
  });
});

describe('the three addresses', () => {
  it('opens each flow from its choice', () => {
    expect(html).toMatch(/<a class="btn primary" href="#\/check">Check my courses /);
    expect(html).toMatch(/<a class="btn secondary" href="#\/left">Browse files /);
    for (const [name, page] of Object.entries(pages)) {
      expect(page, name).toContain('<a href="#/check"');
      expect(page, name).toContain('<a href="#/left"');
      expect(count(page, '<h1'), name).toBe(1);
      expect(count(page, 'aria-current="page"'), name).toBe(name === 'start' ? 0 : 1);
    }
    expect(pages.check).toMatch(/<h1 tabindex="-1">Check my courses<\/h1>/);
    expect(pages.check).toContain('<a href="#/check" aria-current="page">Check my courses</a>');
    expect(pages.left).toMatch(/<h1 tabindex="-1">See what I have left<\/h1>/);
    expect(pages.left).toContain('<a href="#/left" aria-current="page">What I have left</a>');
    // A flow's page holds its name and nothing that is not built yet.
    expect(decode(pages.left)).toBe(' PathCheck. Check my courses What I have left Not an official degree audit. See what I have left Not an official degree audit. Report a mistake Not affiliated with Alabama State University ');
    for (const page of [pages.check, pages.left]) expect(decode(page)).not.toMatch(/coming soon|not built|later/i);
    expect(routeOf('#/check')).toBe('check');
    expect(routeOf('#/left')).toBe('left');
  });

  it('shows Start for an unknown address', () => {
    for (const hash of ['', '#', '#/', '#/nothing', '#/check/', '#/CHECK', '#check', '#/left?x=1', 'check']) expect(routeOf(hash), JSON.stringify(hash)).toBe('start');
  });

  it('names each page in the tab title', () => {
    expect(titleOf('start')).toBe('PathCheck');
    expect(titleOf('check')).toBe('Check my courses — PathCheck');
    expect(titleOf('left')).toBe('See what I have left — PathCheck');
  });
});

describe('the examples', () => {
  it('shows one example answer, with its condition', () => {
    const example = html.match(/<div class="example" role="group" aria-label="Example course result">([\s\S]*?)<\/div>\s*<a class="btn primary"/)?.[1] ?? '';
    expect(decode(example)).toBe(' MGT 321 3 cr Principles of Management Counts toward CIS — Business core unless you’ve already passed it or filled this slot ');
    // The outlined "Counts" mark; the filled tick belongs to "Done" and is not on this page.
    expect(example).toContain('mark-counts');
    expect(html).not.toContain('mark-done');
    // A "Counts" answer never appears without its condition.
    expect(count(text, 'Counts toward CIS')).toBe(3);
    expect(count(text, `Counts toward CIS — Business core ${CONDITION}`)).toBe(3);
    expect(CONDITION).toBe('unless you’ve already passed it or filled this slot');
  });

  it("takes the example's facts from the curriculum", () => {
    const { course, block } = countsExample(curriculum);
    expect(course).toEqual({ code: 'MGT 321', title: 'Principles of Management', credits: 3 });
    expect(block.name).toBe('Business core');
    expect(block.required).toContain(course);
    expect(findCourse(curriculum, examples.counts)).toEqual([{ kind: 'required', blockId: block.id, course }]);
    // In a curriculum where the example would say something untrue, the page is refused.
    const other = loadCurriculum(madeUp);
    expect(() => countsExample(other)).toThrow(/not a required course/);
    expect(() => startPage([{ id: other.id, name: other.program, curriculum: other }])).toThrow(/not a required course/);
    const counting = structuredClone(rawData) as unknown as { electives: { subjectRule: { prefixes: string[]; minCourseNumber: number } } };
    counting.electives.subjectRule.prefixes.push('BIO');
    counting.electives.subjectRule.minCourseNumber = 200;
    expect(() => doesNotCountExample(loadCurriculum(counting))).toThrow(/would count/);
  });

  it('names only course codes in the examples file', () => {
    expect(Object.keys(examples).sort()).toEqual(['counts', 'doesNotCount', 'student']);
    expect(Object.keys(examples.student).sort()).toEqual(['inProgress', 'passed']);
    const values = [examples.counts, examples.doesNotCount, ...examples.student.passed, ...examples.student.inProgress];
    expect(values).toHaveLength(2 + 11 + 5);
    for (const value of values) expect(value).toMatch(/^[A-Z]{2,4} \d{3}$/);
    expect(new Set(values).size).toBe(values.length);
    for (const never of curriculum.electives.except) expect(values).not.toContain(never);
    // Codes only: no number, no flag, nothing else that could carry a fact.
    const raw = readFileSync(join(repo, 'src', 'examples.json'), 'utf8');
    const leaves = (value: unknown): unknown[] => (value && typeof value === 'object' ? Object.values(value).flatMap(leaves) : [value]);
    expect(leaves(JSON.parse(raw)).sort()).toEqual([...values].sort());
  });

  it('lets only the Start page read the examples', () => {
    const files = readdirSync(join(repo, 'src'), { recursive: true }).map(String).filter(file => /\.(ts|tsx|js|html)$/.test(file));
    expect(files.length).toBeGreaterThan(5);
    const readers = files.filter(file => /examples(\.json)?['"]/.test(readFileSync(join(repo, 'src', file), 'utf8')));
    expect(readers).toEqual(['start.ts']);
  });
});

describe('the demo', () => {
  const frameArea = html.match(/<div class="demo-frame" aria-hidden="true">([\s\S]*?)<div class="demo-controls">/)?.[1] ?? '';
  const frames = frameArea.split(/<div class="demo-step" data-step="\d"[^>]*>/).slice(1);

  it('has the four-step demo', () => {
    expect(html).toMatch(/<section class="demo-player" aria-label="How PathCheck works" data-demo>/);
    expect(count(html, 'class="demo-step"')).toBe(4);
    expect(html.match(/<div class="demo-step" data-step="\d"( hidden)?>/g)).toEqual([
      '<div class="demo-step" data-step="1">', '<div class="demo-step" data-step="2" hidden>', '<div class="demo-step" data-step="3" hidden>', '<div class="demo-step" data-step="4" hidden>',
    ]);
    expect(decode(frames[0]!)).toBe(' mgt 3 MGT 321 Principles of Management ');
    expect(decode(frames[1]!)).toBe(' Add a course MGT 321 Principles of Management 3 cr Counts toward CIS — Business core unless you’ve already passed it or filled this slot ');
    expect(decode(frames[2]!)).toBe(' BIO 230 MGT 321 Principles of Management 3 cr Counts toward CIS — Business core unless you’ve already passed it or filled this slot BIO 230 3 cr Doesn’t count toward CIS — not in the CIS curriculum ');
    expect(decode(frames[3]!)).toBe(' Add a course unofficial-transcript.pdf 81 credits left On pace for Spring 2029 Credits only — course order may add semesters. ');
    // "Counts" has its outlined mark in the demo too; "Doesn't count" its own.
    expect(frames[1]).toContain('mark-counts');
    expect(frames[2]).toMatch(/<div class="demo-card is-no">[\s\S]*<span class="num muted struck">3 cr<\/span>[\s\S]*mark-no/);
    // The controls: one pause/play button, four step buttons, and a caption "n/4 …".
    expect(html).toMatch(/<button type="button" class="demo-toggle" aria-label="Pause demo" data-playing="true" data-toggle>/);
    expect(html.match(/<button type="button" aria-label="Step \d of 4"( aria-current="step")? data-go="\d">/g)).toHaveLength(4);
    expect(html).toContain('<button type="button" aria-label="Step 1 of 4" aria-current="step" data-go="1">');
    expect(html).toMatch(/<p class="demo-caption" aria-live="off" data-live>/);
    for (const n of [1, 2, 3, 4]) expect(html).toContain(`<span class="num">${n}/4</span>`);
    expect(html.match(/<span data-caption="\d"( hidden)?>/g)).toEqual(['<span data-caption="1">', '<span data-caption="2" hidden>', '<span data-caption="3" hidden>', '<span data-caption="4" hidden>']);
  });

  it('says only true things in the demo', () => {
    // The suggestion is a course of the curriculum that starts with what was typed.
    const { course } = countsExample(curriculum);
    expect(course.code.toLowerCase().startsWith('mgt 3')).toBe(true);
    expect(frames[0]).toContain('mgt 3');

    // BIO 230 is in no list and is not an elective by the rule; its sentence and its credits are the shared ones.
    const no = doesNotCountExample(curriculum);
    expect(no).toBe('BIO 230');
    expect(findCourse(curriculum, no)).toEqual([]);
    expect(countsByElectiveRule(curriculum, no)).toBe(false);
    expect(NOT_IN_CURRICULUM).toBe('Doesn’t count toward CIS — not in the CIS curriculum');
    expect(UNKNOWN_COURSE_CREDITS).toBe(3);
    expect(frames[2]).toContain(`struck">${UNKNOWN_COURSE_CREDITS} cr<`);

    // The made-up student: 11 courses passed, 5 in progress; what is left is worked out.
    const student = demoStudent(curriculum);
    expect(student.credits).toEqual({ done: 27, inProgress: 13, remaining: 81, degree: 121 });
    expect(student.unplaced).toEqual([]);
    expect(frames[3]).toContain(`<span class="num">${student.credits.remaining}</span><span>credits left</span>`);
    const percent = (n: number): string => `${Math.round((n / 121) * 1e5) / 1e3}%`;
    expect(percent(27)).toBe('22.314%');
    expect(frames[3]).toContain(`<span class="bar-counted" style="width: ${percent(27)}"></span><span class="bar-progress hatch" style="width: ${percent(13)}"></span>`);
    // The frame does not suggest a finished sequence: it is still needed, and its pick is open.
    expect(student.sequence.state).toBe('needed');
    expect(student.blocks.find(one => one.block.id === 'social-sciences')?.picks[0]).toMatchObject({ filled: [], open: 1 });

    // The pace line never appears without its caveat.
    expect(CAVEAT).toBe('Credits only — course order may add semesters.');
    expect(count(text, 'On pace')).toBe(1);
    expect(text).toContain(`On pace for Spring 2029 ${CAVEAT}`);
  });

  it('works the demo out again for another curriculum', () => {
    // One more credit on a course the made-up student has not taken: one more credit left.
    const data = structuredClone(rawData) as unknown as { degreeCredits: number; blocks: { id: string; credits: number; required: { courseId: string; credits: number }[] }[] };
    const major = data.blocks.find(block => block.id === 'major')!;
    major.required[0]!.credits += 1;
    major.credits += 1;
    data.degreeCredits += 1;
    const other = loadCurriculum(data);
    expect(demoStudent(other).credits).toEqual({ done: 27, inProgress: 13, remaining: 82, degree: 122 });
    const page = startPage([{ id: other.id, name: other.program, curriculum: other }]);
    expect(page).toContain('<span class="num">82</span><span>credits left</span>');
    expect(page).not.toContain('<span class="num">81</span>');
    const percent = (n: number): string => `${Math.round((n / 122) * 1e5) / 1e3}%`;
    expect(page).toContain(`<span class="bar-counted" style="width: ${percent(27)}"></span><span class="bar-progress hatch" style="width: ${percent(13)}"></span>`);
    // The example's credits follow the curriculum too.
    const business = data.blocks.find(block => block.id === 'business-core')!;
    const example = business.required.find(course => course.courseId === 'MGT-321')!;
    example.credits += 1;
    business.credits += 1;
    data.degreeCredits += 1;
    const third = loadCurriculum(data);
    expect(decode(startPage([{ id: third.id, name: third.program, curriculum: third }]))).toContain('MGT 321 4 cr Principles of Management Counts toward CIS — Business core');
  });

  it('keeps nothing focusable inside the hidden frames', () => {
    expect(frameArea.length).toBeGreaterThan(500);
    expect(frameArea).not.toMatch(/<a\b|<button|<input|<select|<textarea|tabindex|contenteditable|href=/i);
    // Whatever else is hidden from assistive technology holds nothing to focus either.
    for (const [, tag, rest] of html.matchAll(/<(\w+)[^>]*aria-hidden="true"[^>]*>([^<]*)/g)) {
      expect(['span', 'svg', 'div'], `${tag} ${rest}`).toContain(tag);
    }
    // Every button has a name; the chips are decoration.
    for (const [button] of html.matchAll(/<button[^>]*>/g)) expect(button).toMatch(/aria-label="[^"]+"/);
  });

  // Stand-ins for the parts of the page the demo moves.
  const part = (data: Record<string, string> = {}) => {
    const attrs: Record<string, string> = {};
    const one = {
      dataset: { ...data } as { [name: string]: string | undefined },
      hidden: false,
      attrs,
      click: (): void => undefined,
      setAttribute: (name: string, value: string): void => { attrs[name] = value; },
      removeAttribute: (name: string): void => { delete attrs[name]; },
      addEventListener: (_type: 'click', listener: () => void): void => { one.click = listener; },
    };
    return one;
  };
  const demoRoot = () => {
    const parts = {
      '[data-step]': [1, 2, 3, 4].map(n => part({ step: String(n) })),
      '[data-caption]': [1, 2, 3, 4].map(n => part({ caption: String(n) })),
      '[data-go]': [1, 2, 3, 4].map(n => part({ go: String(n) })),
    };
    const toggle = part({ playing: 'true' });
    const live = part();
    const root: DemoRoot = {
      querySelectorAll: selector => (parts as Record<string, DemoPart[]>)[selector] ?? [],
      querySelector: selector => ({ '[data-toggle]': toggle, '[data-live]': live } as Record<string, DemoPart>)[selector] ?? null,
    };
    return { root, parts, toggle, live };
  };
  const fakeTimers = () => {
    const timers = {
      running: new Map<number, () => void>(), started: 0, cleared: 0, ms: 0,
      setInterval(run: () => void, ms: number): number { timers.started++; timers.ms = ms; timers.running.set(timers.started, run); return timers.started; },
      clearInterval(id: never): void { timers.cleared++; timers.running.delete(id as number); },
      tick(): void { for (const run of [...timers.running.values()]) run(); },
    };
    return timers;
  };
  const shown = (parts: { hidden: boolean }[]): number[] => parts.flatMap((one, i) => (one.hidden ? [] : [i + 1]));

  it('steps through the four frames and wraps', () => {
    expect(STEP_MS).toBe(3600);
    expect([1, 2, 3, 4].map(n => nextStep(n, 4))).toEqual([2, 3, 4, 1]);
    const { root, parts, live } = demoRoot();
    const timers = fakeTimers();
    const demo = setupDemo(root, { timers });
    expect(timers.ms).toBe(3600);
    const seen = [demo.step];
    for (let i = 0; i < 5; i++) { timers.tick(); seen.push(demo.step); }
    expect(seen).toEqual([1, 2, 3, 4, 1, 2]);
    expect(shown(parts['[data-step]'])).toEqual([2]);
    expect(shown(parts['[data-caption]'])).toEqual([2]);
    expect(parts['[data-go]'].map(one => one.attrs['aria-current'])).toEqual([undefined, 'step', undefined, undefined]);
    // While it plays by itself the caption is not read out every few seconds.
    expect(live.attrs['aria-live']).toBe('off');
  });

  it('pauses, plays and jumps', () => {
    const { root, parts, toggle, live } = demoRoot();
    const timers = fakeTimers();
    const demo = setupDemo(root, { timers });
    expect(toggle.attrs['aria-label']).toBe('Pause demo');
    toggle.click();
    expect(demo.playing).toBe(false);
    expect(timers.running.size).toBe(0);
    expect(toggle.attrs['aria-label']).toBe('Play demo');
    expect(toggle.dataset.playing).toBe('false');
    expect(live.attrs['aria-live']).toBe('polite');
    timers.tick();
    expect(demo.step).toBe(1);
    toggle.click();
    expect(demo.playing).toBe(true);
    expect(toggle.attrs['aria-label']).toBe('Pause demo');
    expect(timers.running.size).toBe(1);
    timers.tick();
    expect(demo.step).toBe(2);
    // A step button jumps there and stops.
    parts['[data-go]'][3]!.click();
    expect(demo.step).toBe(4);
    expect(demo.playing).toBe(false);
    expect(shown(parts['[data-step]'])).toEqual([4]);
    expect(live.attrs['aria-live']).toBe('polite');
    timers.tick();
    expect(demo.step).toBe(4);
    // Never two timers at once.
    toggle.click();
    demo.play();
    expect(timers.running.size).toBe(1);
  });

  it('stays still under Reduce Motion', () => {
    const { root, toggle } = demoRoot();
    const timers = fakeTimers();
    const demo = setupDemo(root, { reducedMotion: true, timers });
    expect(timers.started).toBe(0);
    expect(demo.playing).toBe(false);
    expect(demo.step).toBe(1);
    expect(toggle.attrs['aria-label']).toBe('Play demo');
    // The student can still play it.
    toggle.click();
    expect(demo.playing).toBe(true);
  });

  // A stand-in for the browser window, as much as the app uses.
  const fakeWindow = (hash = '', reducedMotion = false) => {
    const timers = fakeTimers();
    const handlers: Record<string, (event: { preventDefault(): void }) => void> = {};
    const heading = { focused: 0, focus(): void { heading.focused++; } };
    const scrolls: number[][] = [];
    const page = {
      innerHTML: '',
      querySelector: (selector: string): unknown =>
        selector === '[data-demo]' ? (page.innerHTML.includes('data-demo') ? demoRoot().root : null) : selector === 'h1' ? heading : null,
    };
    const win = {
      ...timers,
      document: { title: '', getElementById: (id: string) => (id === 'app' ? page : null) },
      location: { hash },
      addEventListener: (type: string, listener: (event: { preventDefault(): void }) => void): void => { handlers[type] = listener; },
      matchMedia: (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' && reducedMotion }),
      scrollTo: (x: number, y: number): void => { scrolls.push([x, y]); },
    };
    const go = (to: string): void => { win.location.hash = to; handlers.hashchange?.({ preventDefault: () => undefined }); };
    return { win: win as unknown as AppWindow, timers, handlers, heading, scrolls, page, go, location: win.location, document: win.document };
  };

  it('stops when the student leaves the page', () => {
    const fake = fakeWindow();
    const app = startApp(fake.win);
    expect(app.route).toBe('start');
    expect(fake.document.title).toBe('PathCheck');
    expect(fake.page.innerHTML).toBe(startPage());
    expect(app.demo?.playing).toBe(true);
    expect(fake.timers.running.size).toBe(1);
    // Opening the site does not move the keyboard or the page.
    expect(fake.heading.focused).toBe(0);
    expect(fake.scrolls).toEqual([]);

    fake.timers.tick();
    expect(app.demo?.step).toBe(2);
    fake.go('#/left');
    expect(app.route).toBe('left');
    expect(app.demo).toBeNull();
    expect(fake.timers.running.size).toBe(0);
    expect(fake.page.innerHTML).toBe(renderPage('left'));
    expect(fake.document.title).toBe('See what I have left — PathCheck');
    // A new page: the keyboard is on its heading and the page is at its top.
    expect(fake.heading.focused).toBe(1);
    expect(fake.scrolls).toEqual([[0, 0]]);

    // Back on Start the demo starts again, from its first step.
    fake.go('#/');
    expect(app.route).toBe('start');
    expect(app.demo?.playing).toBe(true);
    expect(app.demo?.step).toBe(1);
    expect(fake.timers.running.size).toBe(1);
    expect(fake.heading.focused).toBe(2);
    fake.go('#/nothing');
    expect(app.route).toBe('start');
    expect(fake.timers.running.size).toBe(1);

    // Under Reduce Motion the demo does not start by itself, on load or on coming back.
    const still = fakeWindow('#/', true);
    const quiet = startApp(still.win);
    expect(quiet.demo?.playing).toBe(false);
    still.go('#/left');
    still.go('#/');
    expect(still.timers.started).toBe(0);
    // An address typed straight in opens that page.
    expect(startApp(fakeWindow('#/left').win).route).toBe('left');
  });

  it('does not read a dropped file', () => {
    const looked = (): never => { throw new Error('the dropped file was looked at'); };
    const dragged = (types: string[]) => {
      const event = {
        prevented: 0,
        preventDefault(): void { event.prevented++; },
        // The kind of thing dragged may be asked. Looking at the file in any way fails the test.
        dataTransfer: { types, get files(): never { return looked(); }, get items(): never { return looked(); }, getData: looked },
      };
      return event;
    };
    const dropped = () => dragged(['Files']);
    const fake = fakeWindow();
    startApp(fake.win);
    for (const type of ['dragover', 'drop']) expect(fake.handlers[type], type).toBeTypeOf('function');
    const over = dropped();
    fake.handlers.dragover!(over);
    expect(over.prevented).toBe(1);
    expect(fake.location.hash).toBe('');
    // On Start, a drop opens the flow that will take the file.
    const drop = dropped();
    fake.handlers.drop!(drop);
    expect(drop.prevented).toBe(1);
    expect(fake.location.hash).toBe('#/left');
    fake.go('#/left');
    // On a flow page it does nothing, and the browser still does not open the file.
    for (const route of ['#/left']) {
      fake.go(route);
      const again = dropped();
      fake.handlers.dragover!(again);
      fake.handlers.drop!(again);
      expect(again.prevented).toBe(2);
      expect(fake.location.hash).toBe(route);
    }
    // Dragged text is none of the app's business: it is left alone, on every page.
    for (const route of ['#/', '#/left']) {
      fake.go(route);
      for (const event of [dragged(['text/plain']), dragged([]), { prevented: 0, preventDefault(): void { this.prevented++; }, dataTransfer: null }, { prevented: 0, preventDefault(): void { this.prevented++; } }]) {
        fake.handlers.dragover!(event);
        fake.handlers.drop!(event);
        expect(event.prevented).toBe(0);
        expect(fake.location.hash).toBe(route);
      }
    }
    // The app's code never asks for a file or sends anything.
    for (const file of readdirSync(join(repo, 'src'), { recursive: true }).map(String).filter(name => /\.(tsx?|jsx?|html)$/.test(name))) {
      expect(readFileSync(join(repo, 'src', file), 'utf8'), file).not.toMatch(/FileReader|\.files\b|\.items\b|getData|arrayBuffer|createObjectURL|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
    }
  });
});

describe('the footer', () => {
  it('leaves the last-reviewed line out while there is no date', () => {
    expect(curriculum.lastReviewed).toBeNull();
    expect(reviewedOn(null)).toBeNull();
    for (const [name, page] of Object.entries(pages)) {
      expect(page, name).not.toMatch(/last reviewed|Nov 2026|Invalid|NaN|\bnull\b|undefined/i);
      expect(decode(page.slice(page.indexOf('<footer'))), name).toBe(' Not an official degree audit. Report a mistake Not affiliated with Alabama State University ');
    }
    expect(foot(curriculum)).toMatch(/<strong>Not an official degree audit\.<\/strong>\s*<a class="text-link" href="mailto:[^"@]+@[^"?]+\?subject=PathCheck%3A%20report%20a%20mistake">Report a mistake<\/a>\s*<\/div>\s*<p>Not affiliated with Alabama State University<\/p>/);
  });

  it('shows the month and year of a review date in any time zone', () => {
    const dated = foot({ ...curriculum, lastReviewed: '2026-01-15' });
    expect(decode(dated)).toBe(' Not an official degree audit. Curriculum last reviewed: Jan 2026 Report a mistake Not affiliated with Alabama State University ');
    expect(decode(foot(loadCurriculum(madeUp)))).toContain('Curriculum last reviewed: Jan 2026');
    const zone = process.env.TZ;
    try {
      for (const tz of ['America/Chicago', 'Pacific/Kiritimati', 'UTC']) {
        process.env.TZ = tz;
        expect(reviewedOn('2026-01-01'), tz).toBe('Jan 2026');
        expect(reviewedOn('2026-12-31'), tz).toBe('Dec 2026');
        expect(reviewedOn('2026-11-16'), tz).toBe('Nov 2026');
      }
      // The trap this avoids: read as a moment in time, the first of January is still
      // December in the United States.
      process.env.TZ = 'America/Chicago';
      expect(new Date('2026-01-01').getMonth()).toBe(11);
    } finally {
      if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone;
    }
    // Never "Invalid Date": a date that is not a date gives no line, and the loader refuses it.
    for (const bad of ['', '2026', 'Nov 2026', '2026-13-01', '2026-00-10', '2026-1-5', '01/15/2026']) expect(reviewedOn(bad), bad).toBeNull();
    expect(() => loadCurriculum({ ...rawData, lastReviewed: 'January 2026' })).toThrow(CurriculumError);
    expect(() => loadCurriculum({ ...rawData, lastReviewed: '2026-13-01' })).toThrow(CurriculumError);
  });
});

describe('the stylesheet', () => {
  const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
  const app = stripComments(readFileSync(join(repo, 'src', 'style.css'), 'utf8'));
  const approved = stripComments(readFileSync(join(repo, 'mockups', 'style.css'), 'utf8'));
  // The three :root blocks, in order: light, dark, print.
  const tokenBlocks = (css: string): Record<string, string>[] =>
    [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map(([, body = '']) =>
      Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name = '', value = '']) => [name, value.trim()])));
  const COLOR = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i;

  it("uses the design's color tokens and nothing else", () => {
    const [light = {}, dark = {}, print = {}] = tokenBlocks(app);
    expect(tokenBlocks(app)).toHaveLength(3);
    // The tokens, names and values, are the approved design's, in light, dark and print.
    expect(tokenBlocks(app)).toEqual(tokenBlocks(approved));
    expect(light['--accent']).toBe('#4052a6');
    expect(dark['--accent']).toBe('#b0bfff');
    // Every color token has a dark value and a print value.
    const colorTokens = Object.keys(light).filter(name => COLOR.test(light[name] ?? ''));
    expect(colorTokens.length).toBeGreaterThanOrEqual(18);
    for (const name of colorTokens) {
      expect(dark[name], `${name} in dark`).toMatch(COLOR);
      expect(print[name], `${name} in print`).toMatch(COLOR);
    }
    expect(app).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root \{/);
    // Outside the token blocks no rule names a color: rules use var(--…) only.
    const outside = app.replace(/:root\s*\{[^}]*\}/g, '');
    expect(outside).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|:\s*(white|black|red|green|blue|gr[ae]y|gold|maroon|orange|yellow)\b/i);
    for (const [, name = ''] of app.matchAll(/var\((--[\w-]+)/g)) {
      expect([...Object.keys(light), '--counted', '--counted-and-progress'], name).toContain(name);
    }
    // The pages set sizes inline, never a color.
    for (const [name, page] of Object.entries(pages)) {
      for (const [, style = ''] of page.matchAll(/style="([^"]*)"/g)) expect(style, name).toMatch(/^width: [\d.]+%$/);
      expect(page, name).not.toMatch(COLOR);
    }
    // Rules that only the mockups need are not carried into the app.
    expect(app).not.toMatch(/\.mock-note|\.index\b/);
    expect(app).toContain('url("../mockups/fonts/manrope-latin-wght-normal.woff2")');
    expect(readFileSync(join(repo, 'index.html'), 'utf8')).toContain('<link rel="stylesheet" href="/src/style.css" />');
  });
});
