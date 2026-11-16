// F01: the owner's design, with the owner's answers of 2026-11-15, as the M0 mockups
// (docs/sprints/F01.md, docs/design/DESIGN.md, docs/decision-log.md).
// These tests read the rendered text, the markup and the CSS. Whether a page looks like
// the owner's screenshots is the evaluator's job, with a browser.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAVEAT, CONDITION, PRIVACY, check, left, start, summary } from '../mockups/data.js';
import { marks, pageNames, render } from '../mockups/view.js';
import { STEP_MS, creditNotes, nextStep, setupCredits, setupDemo, setupPrint, stepCredits } from '../mockups/behavior.js';
import curriculum from '../docs/curriculum/provisional-current.json';

const repo = join(import.meta.dirname, '..');
const root = join(repo, 'mockups');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
const css = stripComments(read('style.css'));
const design = readFileSync(join(repo, 'docs', 'design', 'DESIGN.md'), 'utf8');

const decode = html => html
  .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ')
  .replace(/ ([,.;:)])/g, '$1').replace(/\( /g, '(');

const page = which => { const html = render(which); return { html, text: decode(html) }; };
const pages = ['start', 'check', 'check-typing', 'left'];

describe('the owner’s design is the reference', () => {
  it.each([['the design as it is now', []], ['the owner’s published site', ['published']]])('has a screenshot of every page in light and dark, at desktop and phone width: %s', (_, sub) => {
    const dir = join(repo, 'docs', 'design', 'screens', ...sub);
    for (const name of ['start', 'check', 'left']) {
      for (const theme of ['light', 'dark']) {
        for (const [width, px] of [['desktop', 1440], ['phone', 375]]) {
          const file = join(dir, `${name}-${theme}-${width}.png`);
          expect(existsSync(file), file).toBe(true);
          const png = readFileSync(file);
          expect(png.subarray(1, 4).toString(), file).toBe('PNG');
          expect(png.readUInt32BE(16), `${file} width`).toBe(px);
        }
      }
    }
    // Nothing else is kept there, apart from the folder of the published site's screenshots.
    expect(readdirSync(dir).filter(file => !file.endsWith('.png'))).toEqual(sub.length ? [] : ['published']);
  });

  it('DESIGN.md records the same color tokens the mockups use', () => {
    const [light, dark] = tokenBlocks(css);
    for (const name of TOKENS) {
      const row = design.split('\n').find(line => line.startsWith(`| \`${name}\` |`));
      expect(row, `${name} is in DESIGN.md`).toBeTruthy();
      expect(row, `${name} light`).toContain(`\`${light[name]}\``);
      expect(row, `${name} dark`).toContain(`\`${dark[name]}\``);
    }
    for (const heading of ['## Color tokens', '## Fonts', '## Type sizes', '## Spacing', '## Radii', '## Status marks', '## Page 1: Start', '## Page 2: Check my courses', '## Page 3: What I have left']) {
      expect(design, heading).toContain(heading);
    }
  });

  it('uses the published design’s colors exactly', () => {
    const [light, dark] = tokenBlocks(css);
    expect(light).toMatchObject({
      '--bg': '#f7f8fa', '--surface': '#ffffff', '--surface-2': '#eceff4', '--ink': '#202735', '--ink-2': '#5b6473',
      '--line': '#d9dfe8', '--line-strong': '#7f8999', '--accent': '#4052a6', '--accent-soft': '#e9edf9', '--on-accent': '#ffffff',
      '--counts': '#23664f', '--counts-soft': '#e7f2ed', '--nocount': '#9d3e36', '--nocount-soft': '#fcf0ed',
      '--progress': '#415fb0', '--progress-soft': '#eaf0fb', '--focus': '#4052a6',
    });
    expect(dark).toMatchObject({
      '--bg': '#0d1117', '--surface': '#161b22', '--surface-2': '#21262d', '--ink': '#e9edf3', '--ink-2': '#a3adbb',
      '--line': '#30363d', '--line-strong': '#768392', '--accent': '#b0bfff', '--accent-soft': '#242c40', '--on-accent': '#151d33',
      '--counts': '#8bd5b4', '--counts-soft': '#182c25', '--nocount': '#ffb3a6', '--nocount-soft': '#35221e',
      '--progress': '#a9c0fa', '--progress-soft': '#202c43', '--focus': '#b0bfff',
    });
  });
});

describe('the three mockup pages', () => {
  it('are opened from one index page and link to each other', () => {
    const index = read('index.html');
    expect(pageNames).toEqual(pages);
    for (const which of pages) {
      expect(index).toContain(`href="${which}.html"`);
      const shell = read(`${which}.html`);
      expect(shell).toContain(`render('${which}')`);
      expect(shell).toContain('href="style.css"');
      const { html } = page(which);
      for (const href of ['start.html', 'check.html', 'left.html']) expect(html, `${which} → ${href}`).toContain(`href="${href}"`);
    }
    // The two page links are shown at every width: on a phone they wrap to a second row.
    expect(css).toMatch(/\.top nav \{ order: 3; display: flex;[^}]*width: 100%;/);
    expect(css).not.toMatch(/\.top nav[^{]*\{[^}]*display: none/);
    // The old directions are gone completely.
    for (const old of ['a-receipt', 'b-meter', 'c-signs', 'shared.js', 'base.css', 'index.css']) expect(existsSync(join(root, old)), old).toBe(false);
  });

  it('put "Not affiliated…" at the right of the footer, level with the other three lines', () => {
    const rule = css.match(/\n\.foot \{[^}]*\}/)[0];
    expect(rule).toMatch(/display: flex;\s*flex-wrap: wrap;\s*justify-content: space-between;\s*align-items: center;/);
    expect(css).toMatch(/\.foot > p \{ margin: 0; \}/);
    for (const which of pages) {
      const footer = page(which).html.match(/<footer class="foot[^"]*">[\s\S]*?<\/footer>/)[0];
      // Two children: the three lines on the left, then the affiliation line.
      expect(footer).toMatch(/<footer class="foot[^"]*">\s*<div>[\s\S]*?<\/div>\s*<p>Not affiliated with Alabama State University<\/p>\s*<\/footer>/);
    }
  });

  it('show the name, the disclaimer and the "on every result" lines on every page', () => {
    for (const which of pages) {
      const { html, text } = page(which);
      for (const expected of [
        'PathCheck', 'Not affiliated with Alabama State University', 'Not an official degree audit.',
        'Curriculum last reviewed: Nov 2026', 'Report a mistake',
      ]) expect(text, `${which}: ${expected}`).toContain(expected);
      expect(html).toMatch(/<a class="text-link" href="mailto:[^"@]+@pathcheck\.example\?subject=PathCheck%3A%20[^"]+">Report a mistake<\/a>/);
    }
  });

  it('use synthetic data only and nothing that is not PathCheck’s job', () => {
    for (const which of pages) {
      const { html, text } = page(which);
      expect(text).not.toMatch(/ask your advisor|GPA|sign in|log in|password|student id|testimonial/i);
      expect(text.replace('Print / save PDF for your advisor', '')).not.toMatch(/advisor/i);
      expect(html).not.toMatch(/<img|logo/i);
    }
  });

  it('never show a "Counts" answer without its condition, on any page', () => {
    let seen = 0;
    for (const which of pages) {
      const { text } = page(which);
      // "Count toward CIS" is the summary label on page 2; the answers say "Counts toward CIS".
      const answers = text.split('Counts toward CIS').slice(1);
      seen += answers.length;
      for (const rest of answers) expect(rest.slice(0, 90), `${which}: …${rest.slice(0, 60)}`).toContain(CONDITION);
      expect(text).not.toMatch(/You already passed this|This slot is already filled/);
    }
    // Start: the example and two demo frames. Page 2: four rows. Typing state: three rows.
    expect(seen).toBe(3 + 4 + 3);
    expect(CONDITION).toBe('unless you’ve already passed it or filled this slot');
  });

  it('never show the pace answer without "Credits only — course order may add semesters."', () => {
    expect(CAVEAT).toBe('Credits only — course order may add semesters.');
    for (const which of ['start', 'left']) {
      const { text } = page(which);
      const answers = text.split('On pace for Spring 2029').slice(1);
      expect(answers.length, which).toBe(1);
      for (const rest of answers) expect(rest.slice(0, 80), which).toContain(CAVEAT);
    }
  });
});

describe('page 1: Start', () => {
  const { html, text } = page('start');

  it('keeps the owner’s wording and the two ways in', () => {
    for (const expected of [
      'Before registration. Before you pay.',
      'Does it count toward your degree? Check before you select your classes.',
      'Know what counts. See what’s left. Make room for what matters.',
      'Your major', 'B.S. Computer Information Systems',
      '01 For next semester Check my courses', 'Is each of next semester’s courses going to count?',
      '~30 seconds · No transcript needed',
      '02 For the bigger picture See what I have left',
      'Upload the unofficial transcript PDF from the portal; get what’s left, pace, and a draft plan.',
      'Drag & drop your transcript PDF here', 'Browse files',
      'Your PDF is read, then deleted. Only your result stays in this browser.',
      'Mockup: opens synthetic student results.',
    ]) expect(text, expected).toContain(expected);
    expect(html).toMatch(/<a class="btn primary" href="check\.html">Check my courses /);
    expect(html).toMatch(/<a class="btn secondary" href="left\.html">Browse files /);
  });

  it('keeps the owner’s design choices: cards, the pill badge, the upload icon in a circle, uppercase labels', () => {
    expect(html).toContain('<span class="kicker"><span class="kicker-dot" aria-hidden="true"></span>Before registration. Before you pay.</span>');
    expect(css).toMatch(/\.kicker \{[^}]*border-radius: 99px;/);
    expect(html).toMatch(/<div class="entry">\s*<section class="entry-check"/);
    expect(css).toMatch(/\.entry \{[^}]*border: 1px solid var\(--line\);[^}]*border-radius: 24px;/);
    expect(html).toMatch(/<span class="upload-icon"><svg/);
    expect(css).toMatch(/\.upload-icon \{[^}]*border-radius: 50%;/);
    expect(html).toContain('<span class="eyebrow">For next semester</span>');
    expect(css).toMatch(/\.eyebrow \{[^}]*text-transform: uppercase;/);
    // The major dropdown is kept, with one pre-selected option and nothing else (owner, answer a).
    expect(html).toMatch(/<select id="major"><option selected>B\.S\. Computer Information Systems<\/option><\/select>/);
    expect(html.match(/<option/g)).toHaveLength(1);
    expect(text).not.toMatch(/coming soon/i);
    // The privacy sentence sits inside the drop zone, next to the upload control (answer i).
    expect(PRIVACY).toBe('Your PDF is read, then deleted. Only your result stays in this browser.');
    expect(decode(html.match(/<div class="drop">[\s\S]*?<\/div>/)[0])).toContain(`Browse files ${PRIVACY}`);
  });

  it('shows one example answer, with its condition', () => {
    const example = decode(html.match(/<div class="example"[\s\S]*?<\/div>\s*<a/)[0]);
    expect(example).toContain(`MGT 321 3 cr Principles of Management Counts toward CIS — Business core ${CONDITION}`);
  });

  it('has the four-step demo with pause and step buttons, still under Reduce Motion', () => {
    expect(text).toContain('A quick look See it work From a course code to a clear answer.');
    for (const item of start.demo.list) expect(text).toContain(item);
    expect(html.match(/<div class="demo-step" data-step="\d"/g)).toHaveLength(4);
    expect(html.match(/<div class="demo-step" data-step="\d" hidden>/g)).toHaveLength(3);
    expect(html).toMatch(/<button type="button" class="demo-toggle" aria-label="Pause demo" data-playing="true" data-toggle>/);
    expect(html.match(/<button type="button" aria-label="Step \d of 4"/g)).toHaveLength(4);
    expect(html).toContain('<p class="demo-caption" aria-live="off" data-live>');
    start.demo.steps.forEach((caption, i) => expect(text).toContain(`${i + 1}/4 ${caption}`));
    const frames = html.match(/<div class="demo-step"[\s\S]*?(?=<div class="demo-step"|<div class="demo-controls">)/g).map(decode);
    expect(frames[0]).toContain('mgt 3 MGT 321 Principles of Management');
    expect(frames[1]).toContain(`Counts toward CIS — Business core ${CONDITION}`);
    expect(frames[2]).toContain(`Counts toward CIS — Business core ${CONDITION}`);
    expect(frames[2]).toContain('BIO 230 3 cr Doesn’t count toward CIS — not in the CIS curriculum');
    expect(frames[3]).toContain(`unofficial-transcript.pdf 81 credits left On pace for Spring 2029 ${CAVEAT}`);
    for (const frame of frames) expect(frame).not.toMatch(/\bDone\b/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.demo-step > \*, \.caret \{ animation: none; \}/);
    expect(read('start.html')).toContain("reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches");
  });
});

describe('page 2: Check my courses', () => {
  const { html, text } = page('check');
  const expected = [
    ['ACT 215', 'Principles of Managerial Accounting', 'Counts toward CIS — Pre-professional', true],
    ['MGT 321', 'Principles of Management', 'Counts toward CIS — Business core', true],
    ['MKT 410', '', 'Counts toward CIS: elective (300/400-level MKT)', true],
    ['BIO 230', '', 'Doesn’t count toward CIS — not in the CIS curriculum', false],
    ['ENG 131', 'English Composition I', 'Counts toward CIS — Composition', true],
    ['ENG 140', 'English Composition Honors I', 'Doesn’t count — it fills the same requirement as ENG 131.', false],
  ];
  const rowsOf = source => source.match(/<div role="row" class="row( is-no)?">[\s\S]*?(?=<div role="row" class="row|<\/div>\s*<p class="note">)/g);

  it('has the heading, the summary and the six courses, each with one answer', () => {
    expect(text).toContain('Check my courses Spring 2027 No transcript added');
    // The count carries its condition when there is no transcript (owner, answer b).
    expect(text).toContain('18 Total credits 12 Count toward CIS unless you’ve already passed them or filled their slots 6 Don’t count');
    expect(html).toMatch(/<span class="num is-counts">12<\/span><span class="summary-label">Count toward CIS<\/span><span class="summary-condition">unless you’ve already passed them or filled their slots<\/span>/);
    expect(text).toContain('Course Credits Does it count? Remove');
    const rows = rowsOf(html);
    expect(rows).toHaveLength(6);
    rows.forEach((row, i) => {
      const [code, title, answer, counts] = expected[i];
      const rowText = decode(row);
      expect(rowText.trim().startsWith(`${code}${title ? ` ${title}` : ''} 3 cr ${answer}`), `${code}: ${rowText}`).toBe(true);
      expect(row.startsWith(`<div role="row" class="row${counts ? '' : ' is-no'}">`), code).toBe(true);
      expect((rowText.match(/Counts toward CIS|Doesn’t count/g) ?? []), code).toHaveLength(1);
      expect(rowText.includes(CONDITION), code).toBe(counts);
      expect(row).toContain(`<button type="button" class="remove" aria-label="Remove ${code}">`);
      // The word comes with a shape: a round check, or a square cross.
      expect(row.includes('mark-counts'), code).toBe(counts);
      expect(row.includes('mark-no'), code).toBe(!counts);
    });
    for (const more of [
      'Remember: you need HIS 132 or ENG 210 for the history/literature sequence.',
      'Add your transcript for an exact answer', PRIVACY, 'Choose transcript PDF',
    ]) expect(text).toContain(more);
    // The privacy sentence is in the transcript card, beside its upload button (answer i).
    expect(decode(html.match(/<section class="exact"[\s\S]*?<\/section>/)[0]).trim()).toBe(`Add your transcript for an exact answer ${PRIVACY} Choose transcript PDF`);
  });

  it('works its summary numbers out from the rows', () => {
    expect(summary(check.courses)).toEqual([18, 12, 6]);
    expect(summary(check.courses.filter(course => course.code !== 'MGT 321'))).toEqual([15, 9, 6]);
    expect(text).not.toMatch(/15 count|On pace|\bDone\b/);
    // At exactly 18 credits neither credit note applies, and none is shown.
    expect(text).not.toMatch(/Below 12 credits|Over 18 credits/);
  });

  it('has a labelled add field, an Add button and the two filters', () => {
    expect(html).toMatch(/<label for="add-course">Add a course<\/label>/);
    expect(html).toMatch(/<input id="add-course" type="text" role="combobox" aria-expanded="false" aria-controls="suggestions" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="Course code or title" value="">/);
    expect(html).toMatch(/<button type="button" class="btn primary add" disabled>Add<\/button>/);
    expect(html).toMatch(/<ul id="suggestions" role="listbox" aria-label="Suggestions" class="suggestions" hidden><\/ul>/);
    expect(html).toMatch(/<button type="button" aria-pressed="true">All courses<\/button>/);
    // One answer for a course outside the curriculum, so the filter just says "Doesn’t count" (answer c).
    expect(decode(html.match(/<button type="button" aria-pressed="false">[\s\S]*?<\/button>/)[0]).trim()).toBe('Doesn’t count');
    for (const which of pages) expect(page(which).text).not.toMatch(/unconfirmed|Can’t confirm/i);
  });

  it('typing state: "mgt 3" suggests MGT 321 Principles of Management before it is added', () => {
    const typing = page('check-typing');
    expect(typing.html).toMatch(/aria-expanded="true" aria-controls="suggestions" aria-autocomplete="list" aria-activedescendant="suggestion-1"[^>]* value="mgt 3">/);
    const menu = typing.html.match(/<ul id="suggestions"[\s\S]*?<\/ul>/)[0];
    expect(menu).not.toContain('hidden');
    expect(decode(menu).trim()).toBe('MGT 321 Principles of Management');
    expect(typing.html).toMatch(/<button type="button" class="btn primary add">Add<\/button>/);
    expect(typing.text).toContain('15 Total credits 9 Count toward CIS unless you’ve already passed them or filled their slots 6 Don’t count');
    expect(rowsOf(typing.html)).toHaveLength(5);
  });

  it('has a normal-case table header, not an uppercase grey one', () => {
    const rules = css.match(/[^{}]*table-head[^{}]*\{[^}]*\}/g);
    expect(rules.length).toBeGreaterThanOrEqual(2);
    for (const rule of rules) expect(rule).not.toMatch(/text-transform|letter-spacing/);
    expect(text).toContain('Course Credits Does it count? Remove');
  });

  it('makes "Doesn’t count" a tinted, heavy-edged row', () => {
    expect(css).toMatch(/\.row\.is-no \{[^}]*border-left: 4px solid var\(--nocount\);[^}]*background: var\(--nocount-soft\);/);
  });
});

describe('page 3: What I have left', () => {
  const { html, text } = page('left');

  it('opens with what’s left and the pace answer, before anything else', () => {
    expect(text).toContain('What I have left Your degree, in focus. Synthetic transcript result');
    expect(text).toContain('81 credits left Looking ahead On pace for Spring 2029 about 16 credits a term Credits only — course order may add semesters.');
    // No legend: each part of the bar is labelled where it is (owner, answer f2).
    expect(text).toContain('13 in progress · Fall 2026 27 counted 81 left 121 total');
    expect(html).not.toMatch(/class="legend"|<dl/);
    expect(html).toContain('<div class="credit" style="grid-template-columns: minmax(0, 27fr) minmax(0, 13fr) minmax(0, 81fr)">');
    expect(css).toMatch(/\.bar-label\.is-progress \{ grid-column: 2 \/ -1; grid-row: 1; \}/);
    expect(css).toMatch(/\.bar-label\.is-counted \{ grid-column: 1; grid-row: 3; \}/);
    expect(css).toMatch(/\.bar-label\.is-left \{ grid-column: 3; grid-row: 3; justify-self: start; \}/);
    expect(html).toContain('aria-label="81 credits left, 27 counted, 13 in progress, 121 total"');
    expect(html.indexOf('class="overview"')).toBeLessThan(html.indexOf('class="reqs"'));
    expect(html.indexOf('class="reqs"')).toBeLessThan(html.indexOf('class="plan"'));
    // The bar and the ring are drawn from the same numbers.
    expect(html).toContain('<span class="bar-counted" style="width: 22.314%"></span><span class="bar-progress hatch" style="width: 10.744%"></span>');
    expect(html).toContain('style="--counted: 22.314%; --counted-and-progress: 33.058%"');
  });

  it('has the pace controls as real, labelled controls, with Fewest and Most both editable', () => {
    expect(text).toContain('Make the estimate yours');
    expect(html).toMatch(/<legend class="sr-only">Adjust your pace<\/legend>/);
    expect(html).toMatch(/<label for="target">Target semester<\/label>\s*<select id="target">\s*<option>Fall 2028<\/option><option selected>Spring 2029<\/option><option>Fall 2029<\/option><option>Spring 2030<\/option><option>Fall 2030<\/option>/);
    for (const [name, label, value] of [['fewest', 'Fewest credits per term', 12], ['most', 'Most credits per term', 18]]) {
      const field = html.match(new RegExp(`<div class="field" data-stepper="${name}">[\\s\\S]*?</p>`))[0];
      expect(field).toContain(`<div class="stepper" role="group" aria-labelledby="${name}-label" aria-describedby="${name}-note">`);
      expect(field).toContain(`<span id="${name}-label">${label}</span>`);
      expect(field).toContain(`<button type="button" aria-label="${label}: one fewer" data-delta="-1">−</button>`);
      expect(field).toContain(`<output class="num"><span data-value>${value}</span> <span data-unit>credits</span></output>`);
      expect(field).toContain(`<button type="button" aria-label="${label}: one more" data-delta="1">+</button>`);
      // No hard limit: neither button is switched off.
      expect(field).not.toContain('disabled');
    }
    // The neutral notes are empty at 12 and 18. Each sits in a polite live region tied to its
    // control, so when it applies it is shown and read out.
    expect(html).toContain('<p class="field-note" id="fewest-note" data-note="Below 12 credits: below full-time; may affect scholarships." aria-live="polite"></p>');
    expect(html).toContain('<p class="field-note" id="most-note" data-note="Over 18 credits: may cost extra." aria-live="polite"></p>');
    expect(text).not.toMatch(/Below 12 credits|Over 18 credits/);
    expect(html).toMatch(/<button type="button" class="switch" role="switch" aria-checked="false" aria-labelledby="summers-label">/);
    expect(text).toContain('Fewest credits per term − 12 credits +');
    expect(text).toContain('Most credits per term − 18 credits +');
    expect(text).toContain('Summers Off');
  });

  it('lists the nine requirements with credits and status in words', () => {
    const expected = [
      ['Orientation', '1 / 1 cr', 'Done'], ['Composition', '6 / 6 cr', 'Done'], ['Science & math', '11 / 11 cr', 'Done'],
      ['Social sciences', '3 / 12 cr', 'In progress'], ['Humanities', '0 / 12 cr', 'In progress'], ['Pre-professional', '3 / 19 cr', 'In progress'],
      ['Business core', '3 / 27 cr', 'Still needed'], ['Major (CIS)', '0 / 24 cr', 'Still needed'], ['CIS electives', '0 / 9 cr', 'Still needed'],
    ];
    const items = html.match(/<li class="req">[\s\S]*?<\/li>\s*(?=<li class="req">|<\/ul>\s*<p class="sequence">)/g);
    expect(items).toHaveLength(9);
    items.forEach((item, i) => {
      const [name, credits, status] = expected[i];
      const [counted, needed] = credits.replace(' cr', '').split(' / ').map(Number);
      const done = status === 'Done';
      const row = decode(item.match(/class="req-row">[\s\S]*?(?=<\/span><\/summary>)/)[0].replace('class="req-row">', ''));
      expect(row.trim(), name).toBe(`${name} ${status} ${credits} Show courses Hide courses`);
      // One bar segment per credit; the counted ones are filled.
      const bar = item.match(/<span class="req-bar" aria-hidden="true">((?:<span[^>]*><\/span>)+)<\/span>/)[1];
      expect(bar.match(/<span[^>]*><\/span>/g), name).toHaveLength(needed);
      expect(bar.match(/class="is-counted"/g) ?? [], name).toHaveLength(counted);
      // Owner: every requirement has the Show courses / Hide courses toggle. In progress and
      // Still needed start open, so what is left shows straight away; Done starts closed.
      expect(item.includes('<details>'), name).toBe(done);
      expect(item.includes('<details open>'), name).toBe(!done);
      expect(item).toContain('<summary><span class="req-row">');
      expect(item).toContain('<span class="when-closed">Show courses</span><span class="when-open">Hide courses</span>');
      expect(item.match(/<div class="req-body">/g), name).toHaveLength(1);
      expect(item.includes({ 'Done': 'mark-done', 'In progress': 'mark-progress', 'Still needed': 'mark-needed' }[status]), name).toBe(true);
    });
    expect(text).toContain('The rest of your degree Requirements All Not done Credits counted / needed.');
    // Only one of "Show courses" / "Hide courses" is ever displayed.
    expect(css).toContain('.req-show .when-open, details[open] .req-show .when-closed { display: none; }');
    expect(css).toContain('details[open] .req-show .when-open { display: inline; }');
  });

  it('shows each open requirement’s courses exactly as in the brief', () => {
    for (const expectedText of [
      'Done ORI 100 Freshman Orientation',
      'Done ENG 131 English Composition I ENG 132 English Composition II',
      'Done BIO 127 General Biology BIOL 127 General Biology Lab BIO 128 General Biology BIOL 128 General Biology Lab MAT 137 Pre-Calculus Algebra',
      'Done HIS 131 World History',
      'In progress ECO 251 Principles of Macroeconomics Repeat; the earlier D doesn’t count.',
      'Still needed ECO 252 Principles of Microeconomics 1 of HIS 132 / GEO 206 / ANT 113 / POS 207 / PSY 251 / SOC 110',
      'In progress HUM 103 Humanities Through the African-American Experience',
      'Still needed ENG 209 Introduction to Literature 1 of ART 131 / THE 111 / MUS 121 1 of ENG 210 / HUM 101 / HUM 102 / CMS 200 / CMS 205 / PHL 201',
      'Done CIS 205 Introduction to CIS In progress ACT 214 MGT 202 PED 114 Still needed ACT 215 Principles of Managerial Accounting MGT 252 Business Statistics II MGT 255 Business Law/Legal',
      'Done CIS 206 Business Programming Languages Still needed MGT 201 Business Orientation MGT 204 Business Communications FIN 321 Essentials of Managerial Finance MGT 321 Principles of Management MKT 321 Elements of Marketing CIS 329 Business Process Integration using SAP MGT 422 Production Management MGT 462 Business Policies',
      'Still needed CIS 300 Programming in Python CIS 302 Internet Programming CIS 310 Networking Fundamentals CIS 341 Information Security CIS 351 Business Data Analytics CIS 404 Database Administration CIS 410 Systems Analysis CIS 461 Advanced Database Systems',
      'Still needed 3 courses: FIN 201, or any 300/400-level MGT, FIN, CIS, MKT, ACT or ECO course not already required',
      'Still needed: HIS 132 or ENG 210 to complete a history or literature sequence.',
    ]) expect(text, expectedText).toContain(expectedText);
  });

  it('labels the draft plan and gives every entry a Move later control', () => {
    expect(text).toContain('A starting point, not a schedule Draft plan Draft — Order not checked — your portal checks prerequisites');
    expect(text).toContain('Pace settings estimate credits only. “Move later” changes this draft; prerequisites are not checked.');
    const terms = html.match(/<li class="semester">[\s\S]*?<\/ul>\s*<\/li>/g);
    expect(terms.map(term => decode(term.match(/<header>[\s\S]*?<\/header>/)[0]).trim())).toEqual(['Spring 2027 18 cr', 'Fall 2027 18 cr', 'Spring 2028 15 cr', 'Fall 2028 15 cr', 'Spring 2029 15 cr']);
    expect(decode(terms[0])).toContain('Open choice Humanities pick (ART 131, THE 111 or MUS 121) Move later');
    expect(decode(terms[1])).toContain('Open choice Social sciences pick Move later Open choice Humanities pick (ENG 210 or another) Move later');
    expect(decode(terms[4])).toContain('MGT 462 Business Policies Always the final semester Move later');
    expect(html.match(/<button type="button" class="move no-print" aria-label="Move [^"]+ later"><svg[\s\S]*?<\/svg><span>Move later<\/span><\/button>/g)).toHaveLength(27);
    expect(html).toContain('aria-label="Move ENG 209 later"');
    expect(html).toContain('aria-label="Move Humanities pick (ART 131, THE 111 or MUS 121) later"');
    // Picks and electives are marked as open choices, not courses.
    expect(html.match(/<li class="plan-entry is-choice">\s*<div class="plan-text">\s*<span class="choice-label">Open choice<\/span>/g)).toHaveLength(6);
    expect(css).toMatch(/\.plan-entry\.is-choice \.plan-text \{[^}]*border-left: 2px dashed var\(--line-strong\);/);
    expect(decode(html.match(/<div class="actions no-print">[\s\S]*?<\/div>/)[0]).trim()).toBe('Print / save PDF for your advisor Clear my data');
  });

  it('prints without the top bar and controls, on white, with every requirement open', () => {
    const print = css.slice(css.lastIndexOf('@media print'));
    expect(print).toMatch(/\.top, \.no-print \{ display: none !important; \}/);
    // The bars, the ring and the tinted rows are backgrounds; browsers drop them unless asked.
    expect(print).toMatch(/body \{ -webkit-print-color-adjust: exact; print-color-adjust: exact; \}/);
    expect(print).toMatch(/\.req \{ border: 1px solid var\(--line\); box-shadow: none; \}/);
    const [light, , printTokens] = tokenBlocks(css);
    expect(printTokens['--bg']).toBe('#ffffff');
    expect(printTokens['--surface']).toBe('#ffffff');
    expect(Object.keys(printTokens).sort()).toEqual(Object.keys(light).sort());
    expect(read('left.html')).toContain('setupPrint(document, window)');
    expect(read('left.html')).toContain('setupCredits(document)');
  });
});

describe('the things that move', () => {
  const el = (data = {}) => {
    const handlers = {};
    const attrs = {};
    return {
      dataset: { ...data }, hidden: false, open: false, handlers,
      setAttribute: (name, value) => { attrs[name] = value; },
      removeAttribute: name => { delete attrs[name]; },
      getAttribute: name => attrs[name] ?? null,
      addEventListener: (type, fn) => { handlers[type] = fn; },
    };
  };
  const demoRoot = () => {
    const parts = {
      '[data-step]': [1, 2, 3, 4].map(n => el({ step: String(n) })),
      '[data-caption]': [1, 2, 3, 4].map(n => el({ caption: String(n) })),
      '[data-go]': [1, 2, 3, 4].map(n => el({ go: String(n) })),
    };
    const toggle = el({ playing: 'true' });
    const live = el();
    return { parts, toggle, live, querySelectorAll: sel => parts[sel], querySelector: sel => ({ '[data-toggle]': toggle, '[data-live]': live })[sel] };
  };
  const fakeTimers = () => {
    const t = { tick: null, cleared: 0, setInterval: (fn, ms) => { t.tick = fn; t.ms = ms; return 7; }, clearInterval: () => { t.cleared++; t.tick = null; } };
    return t;
  };

  it('the demo steps through its four frames and wraps round', () => {
    expect([1, 2, 3, 4].map(n => nextStep(n, 4))).toEqual([2, 3, 4, 1]);
    const root = demoRoot();
    const timers = fakeTimers();
    const demo = setupDemo(root, { timers });
    expect(timers.ms).toBe(STEP_MS);
    expect(demo.playing).toBe(true);
    // While it plays by itself the caption is not announced every few seconds.
    expect(root.live.getAttribute('aria-live')).toBe('off');
    expect(root.parts['[data-step]'].map(frame => frame.hidden)).toEqual([false, true, true, true]);
    timers.tick();
    expect(demo.step).toBe(2);
    expect(root.parts['[data-step]'].map(frame => frame.hidden)).toEqual([true, false, true, true]);
    expect(root.parts['[data-caption]'].map(caption => caption.hidden)).toEqual([true, false, true, true]);
    expect(root.parts['[data-go]'].map(dot => dot.getAttribute('aria-current'))).toEqual([null, 'step', null, null]);
  });

  it('the pause button stops it, and a step button jumps and stops', () => {
    const root = demoRoot();
    const timers = fakeTimers();
    const demo = setupDemo(root, { timers });
    root.toggle.handlers.click();
    expect(demo.playing).toBe(false);
    expect(root.toggle.getAttribute('aria-label')).toBe('Play demo');
    expect(root.toggle.dataset.playing).toBe('false');
    expect(root.live.getAttribute('aria-live')).toBe('polite');
    root.toggle.handlers.click();
    expect(demo.playing).toBe(true);
    expect(root.toggle.getAttribute('aria-label')).toBe('Pause demo');
    root.parts['[data-go]'][3].handlers.click();
    expect(demo.step).toBe(4);
    expect(demo.playing).toBe(false);
  });

  it('with Reduce Motion on, the demo does not start by itself', () => {
    const root = demoRoot();
    const timers = fakeTimers();
    const demo = setupDemo(root, { reducedMotion: true, timers });
    expect(demo.playing).toBe(false);
    expect(timers.tick).toBe(null);
    expect(root.toggle.getAttribute('aria-label')).toBe('Play demo');
  });

  it('the credit range has two editable ends and no hard limit', () => {
    const start12to18 = { fewest: 12, most: 18 };
    expect(stepCredits(start12to18, 'most', 1)).toEqual({ fewest: 12, most: 19 });
    expect(stepCredits({ fewest: 12, most: 30 }, 'most', 1)).toEqual({ fewest: 12, most: 31 });
    expect(stepCredits(start12to18, 'fewest', -1)).toEqual({ fewest: 11, most: 18 });
    // The two ends never cross: pushing one past the other takes the other along.
    expect(stepCredits({ fewest: 12, most: 12 }, 'most', -1)).toEqual({ fewest: 11, most: 11 });
    expect(stepCredits({ fewest: 18, most: 18 }, 'fewest', 1)).toEqual({ fewest: 19, most: 19 });
    // The only stop is 1 credit.
    expect(stepCredits({ fewest: 1, most: 18 }, 'fewest', -1)).toEqual({ fewest: 1, most: 18 });
    expect(stepCredits({ fewest: 1, most: 1 }, 'most', -1)).toEqual({ fewest: 1, most: 1 });
    // Neutral notes: under 12, and over 18. Exactly 12 and 18 carry none.
    expect(creditNotes(start12to18)).toEqual({ fewest: false, most: false });
    expect(creditNotes({ fewest: 11, most: 19 })).toEqual({ fewest: true, most: true });
  });

  it('pressing + on Most past 18 shows "may cost extra"; − on Fewest under 12 shows the scholarship note', () => {
    const field = value => {
      const valueEl = { textContent: String(value) };
      const note = { textContent: '', dataset: { note: `note for ${value}` } };
      const buttons = [el({ delta: '-1' }), el({ delta: '1' })];
      const unit = { textContent: 'credits' };
      const parts = { '[data-value]': valueEl, '[data-unit]': unit, '[data-note]': note, '[data-delta="-1"]': buttons[0] };
      return { valueEl, unit, note, buttons, querySelector: sel => parts[sel], querySelectorAll: () => buttons };
    };
    const fields = { fewest: field(12), most: field(18) };
    const credits = setupCredits({ querySelector: sel => fields[sel.includes('fewest') ? 'fewest' : 'most'] });
    expect([fields.fewest.note.textContent, fields.most.note.textContent]).toEqual(['', '']);
    fields.most.buttons[1].handlers.click();
    expect(fields.most.valueEl.textContent).toBe('19');
    expect(fields.most.note.textContent).toBe('note for 18');
    fields.most.buttons[0].handlers.click();
    expect(fields.most.note.textContent).toBe('');
    fields.fewest.buttons[0].handlers.click();
    expect(fields.fewest.valueEl.textContent).toBe('11');
    expect(fields.fewest.note.textContent).toBe('note for 12');
    expect(credits.state).toEqual({ fewest: 11, most: 18 });
    // "−" is switched off only at 1 credit.
    expect(fields.fewest.buttons[0].disabled).toBe(false);
    for (let i = 0; i < 10; i++) fields.fewest.buttons[0].handlers.click();
    expect(credits.state.fewest).toBe(1);
    expect(fields.fewest.buttons[0].disabled).toBe(true);
    expect(`${fields.fewest.valueEl.textContent} ${fields.fewest.unit.textContent}`).toBe('1 credit');
    expect(`${fields.most.valueEl.textContent} ${fields.most.unit.textContent}`).toBe('18 credits');
  });

  it('printing opens every requirement, then puts them back', () => {
    const details = [el(), el()];
    const button = el();
    const win = { ...el(), printed: 0, print() { this.printed++; } };
    const doc = { querySelectorAll: () => details.filter(d => !d.open), querySelector: () => button };
    setupPrint(doc, win);
    win.handlers.beforeprint();
    expect(details.map(d => d.open)).toEqual([true, true]);
    win.handlers.afterprint();
    expect(details.map(d => d.open)).toEqual([false, false]);
    button.handlers.click();
    expect(win.printed).toBe(1);
  });
});

describe('the basics kept from the brief', () => {
  it('every course code is in the code face and cannot break', () => {
    for (const which of pages) {
      const { html } = page(which);
      const bare = html.replace(/<span class="code[^"]*">[^<]*<\/span>/g, '').replace(/aria-label="[^"]*"/g, '').replace(/subject=[^"]*/g, '');
      expect(bare.match(/\b[A-Z]{3,4}(?: |&nbsp;)\d{3}\b/g) ?? [], which).toEqual([]);
    }
    expect(css).toMatch(/\.code \{\s*font-family: var\(--f-code\);\s*white-space: nowrap;\s*font-variant-numeric: slashed-zero tabular-nums;/);
    expect(css).toMatch(/--f-code: "JetBrains Mono"/);
    expect(css).toMatch(/--f-body: "Manrope"/);
  });

  it('ships its two open-licence fonts with their licences, and nothing from Apple or Figma Make', () => {
    const files = [...css.matchAll(/url\("fonts\/([^"]+)"\)/g)].map(match => match[1]);
    expect([...files].sort()).toEqual(['jetbrains-mono-latin-wght-normal.woff2', 'manrope-latin-wght-normal.woff2']);
    for (const file of files) {
      expect(existsSync(join(root, 'fonts', file)), file).toBe(true);
      const licence = read('fonts', `LICENSE-${file.replace('-latin-wght-normal.woff2', '')}.txt`);
      expect(licence).toContain('SIL Open Font License, Version 1.1');
    }
    expect(readdirSync(join(root, 'fonts')).sort()).toEqual(['LICENSE-jetbrains-mono.txt', 'LICENSE-manrope.txt', ...files].sort());
    // Plain project code: no component library, toast or icon pack was copied in.
    const sources = ['view.js', 'behavior.js', 'data.js', 'style.css', ...pages.map(name => `${name}.html`), 'index.html'].map(name => read(name)).join('\n');
    expect(sources).not.toMatch(/lucide|radix|sonner|shadcn|tailwind|toast|@mui|figma/i);
    expect(sources).not.toMatch(/https?:\/\//);
    const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  });

  it('defines every color as a token with light, dark and print values', () => {
    const outside = css.replace(/:root\s*\{[^}]*\}/g, '');
    expect(outside).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|:\s*(white|black|red|green|blue|gr[ae]y|gold)\b/i);
    const [light, dark, print] = tokenBlocks(css);
    for (const block of [light, dark, print]) expect(Object.keys(block).sort()).toEqual([...TOKENS].sort());
    for (const [, name] of css.matchAll(/var\((--[\w-]+)/g)) {
      expect([...TOKENS, '--f-body', '--f-code', '--radius', '--counted', '--counted-and-progress'], name).toContain(name);
    }
    for (const which of pages) {
      // Inline styles carry sizes only, never a color.
      for (const [, style] of page(which).html.matchAll(/style="([^"]*)"/g)) expect(style).toMatch(/^(width: [\d.]+%|--counted: [\d.]+%; --counted-and-progress: [\d.]+%|grid-template-columns: minmax\(0, \d+fr\) minmax\(0, \d+fr\) minmax\(0, \d+fr\))$/);
    }
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root \{/);
  });

  it('meets WCAG AA contrast in light and dark', () => {
    const [light, dark, print] = tokenBlocks(css);
    for (const [scheme, tokens] of [['light', light], ['dark', dark], ['print', print]]) {
      for (const [fg, bg] of TEXT_PAIRS) expect(contrast(tokens[fg], tokens[bg]), `${scheme} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      for (const [fg, bg] of MARK_PAIRS) expect(contrast(tokens[fg], tokens[bg]), `${scheme} ${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('outlines every control whose edge is its only cue with the strong line color', () => {
    // WCAG 1.4.11: a border that alone shows where a control is needs 3:1. Those borders use
    // --line-strong (tested above against every background). Buttons with a text label may
    // carry a quieter --line border, as the design does for the filters and the tabs.
    for (const selector of ['.select', '.search input', '.field select', '.stepper', '.switch', '.switch-track', '.drop', '.demo-toggle', '.btn.secondary', '.req-bar span', '.credit-bar']) {
      const rule = css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`));
      expect(rule, selector).toBeTruthy();
      expect(rule[1], selector).toMatch(/border(-color)?: [^;]*var\(--line-strong\)/);
    }
    // Every label on a quiet-bordered button is text that meets 4.5:1 on its own.
    expect(css).toMatch(/\.filters button \{[^}]*border: 1px solid var\(--line\);[^}]*color: var\(--ink-2\);/);
    expect(css).toMatch(/\.tabs button \{[^}]*color: var\(--ink-2\);/);
  });

  it('shows keyboard focus on everything', () => {
    expect(css).toMatch(/:focus-visible \{ outline: 3px solid var\(--focus\); outline-offset: 2px; \}/);
    expect(css).toMatch(/\.select:focus-within \{ outline: 3px solid var\(--focus\); outline-offset: 2px; \}/);
    expect(css).not.toMatch(/outline:\s*(none|0)\b/);
  });

  it('gives every status a word and a shape', () => {
    expect(Object.keys(marks).sort()).toEqual(['counts', 'done', 'needed', 'no', 'progress']);
    const shape = fn => fn(20).replace(/class="[^"]*"/, '');
    // Five statuses, five shapes (owner, answer g). "Counts" is an outlined tick: it has no
    // filled disc, so a conditional answer never looks like a finished requirement.
    expect(new Set(Object.values(marks).map(shape)).size).toBe(5);
    expect(shape(marks.done)).toContain('<circle cx="10" cy="10" r="9" fill="currentColor"/>');
    expect(shape(marks.counts)).toContain('fill="none" stroke="currentColor"');
    expect(shape(marks.counts)).not.toContain('fill="currentColor"');
    for (const which of ['start', 'check', 'check-typing']) expect(page(which).html).not.toContain('mark-done');
    for (const fn of Object.values(marks)) expect(fn()).toContain('aria-hidden="true"');
    const { html } = page('left');
    for (const status of ['Done', 'In progress', 'Still needed']) expect(html).toMatch(new RegExp(`<span class="req-status"><svg[^>]*mark-[a-z]+"[\\s\\S]*?</svg>${status}</span>`));
  });

  it('uses no school colors', () => {
    const [light, dark] = tokenBlocks(css);
    for (const value of [...Object.values(light), ...Object.values(dark)]) {
      const [r, g, b] = channels(value);
      expect(r > 190 && g > 140 && g < 215 && b < 90, `${value} is not gold`).toBe(false);
    }
  });
});

describe('the mockup content', () => {
  const inBlocks = curriculum.blocks.flatMap(block => [...block.required, ...block.choices.flatMap(choice => choice.courses)]);

  it('uses real titles for every course it names', () => {
    const known = new Map([...inBlocks, ...curriculum.electives.namedCourses, ...curriculum.electives.legacyOnlyCourses].map(course => [course.courseId.replace('-', ' '), course]));
    const named = [
      ...check.courses.filter(course => course.title),
      ...left.blocks.flatMap(block => [...(block.done ?? []), ...(block.progress ?? []), ...(block.still ?? [])]).filter(item => item.code),
      ...left.plan.flatMap(term => term.entries).filter(item => item.code),
    ];
    expect(named.length).toBeGreaterThan(50);
    for (const course of named) {
      expect(known.has(course.code), course.code).toBe(true);
      // The brief gives no title for three in-progress courses, and none is shown.
      if (course.title) expect(course.title, course.code).toBe(known.get(course.code).title);
    }
    expect(named.filter(course => !course.title).map(course => course.code)).toEqual(['ACT 214', 'MGT 202', 'PED 114']);
    // Composition is two picks: the student has exactly one course from each pair.
    const pairs = curriculum.blocks.find(block => block.name === 'Composition').choices.map(choice => choice.courses.map(course => course.courseId.replace('-', ' ')));
    const passed = left.blocks.find(block => block.name === 'Composition').done.map(course => course.code);
    expect(pairs).toHaveLength(2);
    for (const pair of pairs) expect(passed.filter(code => pair.includes(code)), pair.join(' / ')).toHaveLength(1);
    expect(passed).toHaveLength(2);
    // MKT 410 fits the elective rule and BIO 230 is in no list.
    expect(known.has('MKT 410')).toBe(false);
    expect(curriculum.electives.subjectRule.prefixes).toContain('MKT');
    expect(known.has('BIO 230')).toBe(false);
  });

  it('adds up: 27 counted, 13 in progress, 81 left, 121 total', () => {
    const credits = code => inBlocks.find(course => course.courseId === code.replace(' ', '-')).credits;
    expect(left.blocks.reduce((sum, block) => sum + block.counted, 0)).toBe(27);
    expect(left.blocks.reduce((sum, block) => sum + block.needed, 0)).toBe(121);
    const byName = Object.fromEntries([...curriculum.blocks, curriculum.electives].map(block => [block.name, block.credits]));
    for (const block of left.blocks) expect(block.needed, block.name).toBe(byName[block.name]);
    const inProgress = left.blocks.flatMap(block => block.progress ?? []);
    expect(inProgress.map(course => course.code)).toEqual(['ECO 251', 'HUM 103', 'ACT 214', 'MGT 202', 'PED 114']);
    expect(inProgress.reduce((sum, course) => sum + credits(course.code), 0)).toBe(13);
    expect([left.counted, left.inProgress, left.remaining, left.total]).toEqual([27, 13, 81, 121]);
    expect(left.total - left.counted - left.inProgress).toBe(left.remaining);
    // Counted credits are the credits of the courses listed as Done, in every requirement.
    for (const block of left.blocks) {
      expect((block.done ?? []).reduce((sum, course) => sum + credits(course.code), 0), block.name).toBe(block.counted);
    }
  });

  it('never calls a requirement Done while it has courses in progress or still needed', () => {
    for (const block of left.blocks) {
      const unfinished = (block.progress?.length ?? 0) + (block.still?.length ?? 0) > 0;
      expect(block.status === 'Done', block.name).toBe(!unfinished);
      if (block.status === 'Done') expect(block.counted).toBe(block.needed);
    }
    const social = left.blocks.find(block => block.name === 'Social sciences');
    expect(social.progress.map(course => course.code)).toContain('ECO 251');
    expect((social.done ?? []).map(course => course.code)).not.toContain('ECO 251');
  });

  it('plans exactly what is still needed: 27 entries, 81 credits, nothing done or in progress', () => {
    const entries = left.plan.flatMap(term => term.entries);
    expect(entries).toHaveLength(27);
    expect(left.plan.map(term => term.cr)).toEqual([18, 18, 15, 15, 15]);
    for (const term of left.plan) expect(term.entries.length * 3, term.term).toBe(term.cr);
    expect(left.plan.reduce((sum, term) => sum + term.cr, 0)).toBe(left.remaining);
    const stillCodes = left.blocks.flatMap(block => block.still ?? []).filter(item => item.code).map(item => item.code).sort();
    expect(entries.filter(item => item.code).map(item => item.code).sort()).toEqual(stillCodes);
    expect(entries.filter(item => item.choice).map(item => item.text.replace(/ \(.*/, '')).sort()).toEqual(['CIS elective', 'CIS elective', 'CIS elective', 'Humanities pick', 'Humanities pick', 'Social sciences pick']);
    const taken = left.blocks.flatMap(block => [...(block.done ?? []), ...(block.progress ?? [])]).map(course => course.code);
    for (const code of taken) expect(entries.map(item => item.code)).not.toContain(code);
    expect(left.plan.at(-1).entries.at(-1).code).toBe('MGT 462');
    // Neither HIS 132 nor ENG 210 is fixed in the plan, so the sequence line stays.
    expect(entries.map(item => item.code)).not.toContain('HIS 132');
    expect(entries.map(item => item.code)).not.toContain('ENG 210');
    expect(left.sequence).toContain('Still needed: HIS 132 or ENG 210');
  });
});

// ---- helpers ----

const TOKENS = [
  '--bg', '--surface', '--surface-2', '--ink', '--ink-2', '--line', '--line-strong', '--accent', '--accent-soft', '--on-accent',
  '--counts', '--counts-soft', '--nocount', '--nocount-soft', '--progress', '--progress-soft', '--focus', '--shadow',
];

// Text on the backgrounds it is actually drawn on: WCAG AA 4.5:1.
const TEXT_PAIRS = [
  ['--ink', '--bg'], ['--ink', '--surface'], ['--ink', '--surface-2'], ['--ink', '--accent-soft'], ['--ink', '--nocount-soft'],
  ['--ink-2', '--bg'], ['--ink-2', '--surface'], ['--ink-2', '--surface-2'], ['--ink-2', '--accent-soft'], ['--ink-2', '--nocount-soft'],
  ['--accent', '--bg'], ['--accent', '--surface'], ['--accent', '--accent-soft'], ['--on-accent', '--accent'],
  ['--counts', '--bg'], ['--counts', '--surface'], ['--nocount', '--surface'], ['--nocount', '--nocount-soft'],
];

// Control borders, status marks, bar fills and the focus ring: WCAG 1.4.11, 3:1.
const MARK_PAIRS = [
  ['--line-strong', '--bg'], ['--line-strong', '--surface'], ['--line-strong', '--surface-2'], ['--line-strong', '--accent-soft'],
  ['--focus', '--bg'], ['--focus', '--surface'], ['--focus', '--accent-soft'], ['--focus', '--nocount-soft'],
  ['--counts', '--surface'], ['--counts', '--surface-2'], ['--progress', '--surface'], ['--progress', '--progress-soft'],
  ['--ink-2', '--surface'], ['--nocount', '--nocount-soft'], ['--nocount', '--surface'],
];

function tokenBlocks(source) {
  const blocks = [...source.matchAll(/:root\s*\{([^}]*)\}/g)].map(match =>
    Object.fromEntries([...match[1].matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?)\s*;/g)].map(([, name, value]) => [name, value])));
  expect(blocks).toHaveLength(3);
  return blocks;
}

function channels(hex) {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
}

function luminance(hex) {
  const [r, g, b] = channels(hex).map(value => value / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
