// F01: the three M0 design directions (docs/sprints/F01.md, docs/M0-DESIGN-BRIEF.md).
// Each direction renders three pages from the same content; these tests read the
// rendered text, the markup and the CSS. What only an eye can judge (distinctness,
// layout, "unmistakable but not alarming") is the evaluator's job.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { check, left } from '../mockups/data.js';
import curriculum from '../docs/curriculum/provisional-current.json';

const root = join(import.meta.dirname, '..', 'mockups');
const directions = ['a-receipt', 'b-meter', 'c-signs'];
const pages = ['start', 'check', 'left'];
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

const decode = html => html
  .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ')
  .replace(/ ([,.;:)])/g, '$1').replace(/\( /g, '(');

const CONDITION = 'unless you’ve already passed it or filled this slot';
const base = stripComments(read('base.css'));

describe.each(directions)('direction %s', direction => {
  const load = async () => (await import(`../mockups/${direction}/view.js`)).render;
  const page = async which => { const html = (await load())(which); return { html, text: decode(html) }; };
  const css = stripComments(read(direction, 'style.css'));

  it('has its three pages, linked from the index and to each other', async () => {
    const index = read('index.html');
    for (const which of pages) {
      expect(existsSync(join(root, direction, `${which}.html`)), which).toBe(true);
      expect(index).toContain(`href="${direction}/${which}.html"`);
      const shell = read(direction, `${which}.html`);
      expect(shell).toContain(`render('${which}')`);
      expect(shell).toContain('href="../base.css"');
      const { html } = await page(which);
      for (const href of ['start.html', 'check.html', 'left.html', '../index.html']) expect(html).toContain(`href="${href}"`);
    }
  });

  it('shows the name, the disclaimer and the "on every result" lines on every page', async () => {
    for (const which of pages) {
      const { html, text } = await page(which);
      for (const expected of [
        'PathCheck', 'Not affiliated with Alabama State University', 'Not an official degree audit.',
        'Curriculum last reviewed: Nov 2026', 'Report a mistake',
      ]) expect(text, `${which}: ${expected}`).toContain(expected);
      expect(html).toMatch(/<a href="mailto:[^"@]+@example\.com\?subject=PathCheck%20mistake%3A%20[^"]+">Report a mistake<\/a>/);
    }
  });

  it('uses synthetic data only and nothing that is not PathCheck’s job', async () => {
    for (const which of pages) {
      const { html, text } = await page(which);
      expect(text).not.toMatch(/ask your advisor|GPA|prerequisite check|sign in|log in|password|student id|testimonial/i);
      expect(text.replace('Print / save PDF for your advisor', '')).not.toMatch(/advisor/i);
      expect(html).not.toMatch(/<img|logo/i);
    }
  });

  it('page 1: the promise, two ways in with nothing to fill in, and the privacy sentence', async () => {
    const { html, text } = await page('start');
    for (const expected of [
      'Check whether your courses count toward your CIS degree before you pay for them, and see what’s left so you graduate on time.',
      'Check my courses', 'For registration: is each of next semester’s courses going to count?', '~30 seconds, no transcript needed',
      'See what I have left', 'Upload the unofficial transcript PDF from the portal; get what’s left, pace, and a draft plan.',
      'The transcript PDF is read and discarded; nothing is stored.',
    ]) expect(text).toContain(expected);
    expect(html).toMatch(/<a class="way" href="check\.html">/);
    expect(html).toMatch(/<a class="way" href="left\.html">/);
    // Nothing to fill in first: the only input is the demo's pause control.
    expect(html.match(/<input/g)).toHaveLength(1);
    expect(html).not.toMatch(/<select|<textarea/);
  });

  it('page 1 demo: three captioned frames, a labelled pause control, still under Reduce Motion', async () => {
    const { html, text } = await page('start');
    expect(text).toContain('How it works');
    expect(html.match(/class="demo-frame"/g)).toHaveLength(3);
    expect(html).toMatch(/<label class="demo-pause"><input type="checkbox" class="demo-toggle" \/> <span>Pause the demo<\/span><\/label>/);
    // A frame that shows "Counts" shows its condition; nothing in a frame says Done.
    const demo = decode(html.slice(html.indexOf('class="demo"'), html.indexOf('</section>', html.indexOf('class="demo"'))));
    expect(demo).toContain(`Counts toward CIS — Pre-professional, ${CONDITION}`);
    expect(demo.split('Counts toward CIS')).toHaveLength(2);
    expect(demo).not.toMatch(/\bDone\b/);
    // The pace answer in the demo keeps its caveat.
    expect(demo).toContain('On pace for Spring 2029 Credits only \u2014 course order may add semesters.');
    expect(base).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.demo-frame \{ animation: none;/);
    expect(base).toMatch(/\.demo:has\(\.demo-toggle:checked\) \.demo-frame \{ animation-play-state: paused; \}/);
  });

  it('page 2: six courses in order, each with code, title when known, credits and one answer', async () => {
    const { html, text } = await page('check');
    expect(text).toContain('Check my courses');
    expect(text).toContain('Spring 2027');
    const expected = [
      ['ACT 215', 'Principles of Managerial Accounting', 'Counts toward CIS — Pre-professional', true],
      ['MGT 321', 'Principles of Management', 'Counts toward CIS — Business core', true],
      ['MKT 410', '', 'Counts toward CIS: elective (300/400-level MKT)', true],
      ['BIO 230', '', 'Doesn’t count toward CIS — not in the CIS curriculum', false],
      ['ENG 131', 'English Composition I', 'Counts toward CIS — Composition', true],
      ['ENG 140', 'English Composition Honors I', 'Doesn’t count — it fills the same requirement as ENG 131.', false],
    ];
    const rows = html.match(/<li class="row (counts|no)">[\s\S]*?<\/li>/g);
    expect(rows).toHaveLength(6);
    rows.forEach((row, i) => {
      const [code, title, answer, counts] = expected[i];
      const rowText = decode(row);
      expect(rowText).toContain(`${code}${title ? ` ${title}` : ''} 3 cr`);
      expect(rowText).toContain(answer);
      expect(row.startsWith(`<li class="row ${counts ? 'counts' : 'no'}">`), code).toBe(true);
      expect((rowText.match(/Counts toward CIS|Doesn’t count/g) ?? []), code).toHaveLength(1);
      expect(rowText.includes(CONDITION), code).toBe(counts);
      expect(row).toContain(`aria-label="Remove ${code}"`);
    });
    for (const more of [
      '18 credits', 'Remember: you need HIS 132 or ENG 210 for the history/literature sequence.',
      'Below 12 credits: below full-time; may affect scholarships.', 'Over 18 credits: may cost extra.',
      'Add your transcript for an exact answer',
    ]) expect(text).toContain(more);
    // The credit notes belong to the total, not to the count line.
    expect(html).toMatch(/<p class="total"><strong>18 credits<\/strong><\/p>\s*<ul class="notes">/);
  });

  it('page 2 never over-promises', async () => {
    const { html, text } = await page('check');
    // Every "Counts toward CIS" outside the summary is followed by its condition...
    const outside = text.replace(/12 count toward CIS, unless you’ve already passed them or filled their slots/, '');
    const counts = outside.split('Counts toward CIS').slice(1);
    expect(counts).toHaveLength(4);
    for (const rest of counts) expect(rest.slice(0, 120)).toContain(CONDITION);
    // ...and the summary line carries one too. The four counting courses are 12 credits.
    expect(text).toContain('12 count toward CIS, unless you’ve already passed them or filled their slots');
    expect(check.courses.filter(course => course.counts).reduce((sum, course) => sum + course.cr, 0)).toBe(12);
    expect(check.courses.reduce((sum, course) => sum + course.cr, 0)).toBe(18);
    expect(text).not.toMatch(/15 count|You already passed this|This slot is already filled|On pace|\bDone\b/);
    // "Counts" never appears as a bare word (for example as a label on a chart).
    expect(text.replace(/Counts toward CIS/g, '')).not.toMatch(/\bCounts\b/);
    // The mark beside a counting course is the open circle, never the solid Done disc.
    expect(html).not.toContain('r="10.5" fill="currentColor"');
  });

  it('page 2 controls: a labelled field with the suggestion open', async () => {
    const { html } = await page('check');
    expect(html).toMatch(/<label class="add-label" for="add-course">Add a course by code or title<\/label>\s*<input id="add-course" type="text" value="mgt 3"/);
    expect(html).toMatch(/role="combobox" aria-expanded="true" aria-controls="suggestions"/);
    const menu = html.match(/<div class="suggest glass" role="listbox"[\s\S]*?<\/div>\s*<\/div>/)[0];
    expect(decode(menu)).toContain('MGT 321 Principles of Management');
  });

  it('page 2 names what doesn’t count before the list', async () => {
    const { html, text } = await page('check');
    expect(text).toContain('2 don’t count: BIO 230, ENG 140');
    expect(html.indexOf('class="no-summary"')).toBeLessThan(html.indexOf('class="rows"'));
  });

  it('page 3: headline facts and the three pace controls', async () => {
    const { html, text } = await page('left');
    for (const expected of ['81 credits left', 'On pace for Spring 2029', 'about 16 credits a term', 'Credits only — course order may add semesters.', 'Fall 2026']) {
      expect(text).toContain(expected);
    }
    for (const figure of [/\b27\b[^.]{0,20}counted|Counted[^.]{0,12}27/i, /\b13\b[^.]{0,20}in progress|In progress[^.]{0,24}13/i, /\b121\b[^.]{0,12}total|Total[^.]{0,24}121/i]) expect(text).toMatch(figure);
    expect(html).toMatch(/<label>Target semester\s*<select><option selected>Spring 2029<\/option><\/select>/);
    expect(html).toMatch(/<legend>Credits per term<\/legend>\s*<input type="number" value="12" aria-label="Fewest credits per term" \/>[\s\S]*<input type="number" value="18" aria-label="Most credits per term" \/>/);
    expect(html).toMatch(/<label class="switch"><input type="checkbox" role="switch" \/> <span>Summers<\/span> <span class="switch-state">off<\/span><\/label>/);
    // The headline comes before everything else on the page.
    expect(html.indexOf('81 credits left')).toBeLessThan(html.indexOf('class="pace-controls"'));
  });

  it('page 3: nine blocks with the brief’s credits, status and courses', async () => {
    const { html, text } = await page('left');
    const expected = [
      ['Orientation', '1/1', 'Done'], ['Composition', '6/6', 'Done'], ['Science & math', '11/11', 'Done'],
      ['Social sciences', '3/12', 'In progress'], ['Humanities', '0/12', 'In progress'], ['Pre-professional', '3/19', 'In progress'],
      ['Business core', '3/27', 'Still needed'], ['Major (CIS)', '0/24', 'Still needed'], ['CIS electives', '0/9', 'Still needed'],
    ];
    const sections = html.match(/<section class="block (done|progress|needed)">[\s\S]*?<\/section>/g);
    expect(sections).toHaveLength(9);
    sections.forEach((section, i) => {
      const [name, fraction, status] = expected[i];
      const heading = decode(section.match(/<h3>[\s\S]*?<\/h3>/)[0]);
      expect(heading).toContain(name);
      expect(heading).toContain(fraction);
      expect(heading).toContain(status);
    });
    // Done blocks are collapsed with a control to open them (F13); no course list is invented for them.
    sections.forEach((section, i) => {
      const collapsed = i < 3;
      expect(section.includes('class="group'), expected[i][0]).toBe(!collapsed);
      expect(/<button type="button" class="ghost show" aria-label="Show courses in [^"]+">Show courses<\/button>/.test(section), expected[i][0]).toBe(collapsed);
    });
    for (const expectedText of [
      'HIS 131 World History',
      'ECO 251 Principles of Macroeconomics (repeat; the earlier D doesn’t count)',
      'ECO 252 Principles of Microeconomics',
      '1 of HIS 132 / GEO 206 / ANT 113 / POS 207 / PSY 251 / SOC 110',
      'HUM 103 Humanities Through the African-American Experience',
      'ENG 209 Introduction to Literature',
      '1 of ART 131 / THE 111 / MUS 121',
      '1 of ENG 210 / HUM 101 / HUM 102 / CMS 200 / CMS 205 / PHL 201',
      'CIS 205 Introduction to CIS', 'ACT 214', 'MGT 202', 'PED 114', 'ACT 215', 'MGT 252', 'MGT 255',
      'CIS 206 Business Programming Languages', 'MGT 201', 'MGT 204', 'FIN 321', 'MGT 321', 'MKT 321', 'CIS 329', 'MGT 422', 'MGT 462',
      'CIS 300', 'CIS 302', 'CIS 310', 'CIS 341', 'CIS 351', 'CIS 404', 'CIS 410', 'CIS 461',
      '3 courses: FIN 201, or any 300/400-level MGT, FIN, CIS, MKT, ACT or ECO course not already required.',
      'Still needed: HIS 132 or ENG 210 to complete a history or literature sequence.',
    ]) expect(text, expectedText).toContain(expectedText);
    // What is in progress or still needed is never hidden behind a disclosure.
    expect(html).not.toMatch(/<details/);
  });

  it('page 3: draft plan with a Move later control on every entry', async () => {
    const { html, text } = await page('left');
    expect(text).toContain('Draft — Order not checked — your portal checks prerequisites');
    const terms = html.match(/<section class="term">[\s\S]*?<\/section>/g);
    expect(terms.map(term => decode(term.match(/<h3>[\s\S]*?<\/h3>/)[0]).trim())).toEqual(['Spring 2027 18 cr', 'Fall 2027 18 cr', 'Spring 2028 15 cr', 'Fall 2028 15 cr', 'Spring 2029 15 cr']);
    expect(decode(terms[0])).toContain('Humanities pick ART 131, THE 111 or MUS 121');
    expect(decode(terms[1])).toContain('Humanities pick ENG 210 or another');
    expect(decode(terms[1])).toContain('Social sciences pick');
    expect(decode(terms[4])).toContain('MGT 462 Business Policies (always the final semester)');
    expect(html.match(/<button type="button" class="ghost later" aria-label="Move [^"]+ later">Move later<\/button>/g)).toHaveLength(27);
    // Picks and electives are marked as open choices, not courses.
    expect(html.match(/<li class="open">\s*<span class="entry"><span class="pick-name">/g)).toHaveLength(6);
    expect(html).toMatch(/<button type="button" class="prominent">Print \/ save PDF for your advisor<\/button>/);
    expect(html).toMatch(/<button type="button" class="ghost">Clear my data<\/button>/);
  });

  it('every course code is in the code face and cannot break', async () => {
    for (const which of pages) {
      const { html } = await page(which);
      const bare = html.replace(/<span class="code">[^<]*<\/span>/g, '').replace(/aria-label="[^"]*"/g, '').replace(/subject=[^"]*/g, '');
      expect(bare.match(/\b[A-Z]{3,4}(?: |&nbsp;)\d{3}\b/g) ?? [], which).toEqual([]);
    }
    expect(base).toMatch(/\.code \{ font-family: var\(--code-font\);[^}]*white-space: nowrap;/);
    const face = css.match(/--code-font: "([^"]+)"/)[1];
    expect(['IBM Plex Mono', 'Atkinson Hyperlegible', 'JetBrains Mono']).toContain(face);
    // The face is shipped with the mockups, with its licence, and loaded from there.
    const files = [...css.matchAll(/url\("\.\.\/fonts\/([^"]+)"\)/g)].map(match => match[1]);
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const file of files) {
      expect(existsSync(join(root, 'fonts', file)), file).toBe(true);
      const family = file.replace(/-latin-\d+-normal\.woff2$/, '');
      expect(existsSync(join(root, 'fonts', `LICENSE-${family}.txt`)), family).toBe(true);
    }
    expect(files.some(file => file.startsWith(face.toLowerCase().replace(/ /g, '-')))).toBe(true);
    expect(css).not.toMatch(/SF Pro|San Francisco|-apple-system|SF Mono/);
  });

  it('colors are named variables with light, dark and print values', () => {
    const outside = (css + base).replace(/:root\s*\{[^}]*\}/g, '');
    expect(outside).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|:\s*(white|black|red|green|blue|gr[ae]y|gold)\b/i);
    const [light, dark, print] = tokenBlocks(css);
    expect(Object.keys(light).sort()).toEqual([...TOKENS].sort());
    expect(Object.keys(dark).sort()).toEqual([...TOKENS].sort());
    // Print uses the light values on a white page.
    expect({ ...print, '--bg': light['--bg'], '--surface': light['--surface'] }).toEqual(light);
    expect(print['--bg']).toBe('#ffffff');
    for (const [, name] of (css + base).matchAll(/var\((--[\w-]+)/g)) {
      expect([...TOKENS, '--code-font', '--code-weight', '--bar-width', '--display', '--i', '--n'], name).toContain(name);
    }
  });

  it('contrast meets WCAG AA in light and dark, including text on glass', () => {
    const [light, dark] = tokenBlocks(css);
    for (const [scheme, tokens] of [['light', light], ['dark', dark]]) {
      const value = name => tokens[name].slice(0, 7);
      for (const [fg, bg] of TEXT_PAIRS) expect(contrast(value(fg), value(bg)), `${scheme} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      for (const [fg, bg] of MARK_PAIRS) expect(contrast(value(fg), value(bg)), `${scheme} ${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
      // Glass is translucent: check it over everything that can scroll under it.
      for (const under of ['--bg', '--surface', '--no-fill', '--done-fill', '--progress-fill', '--text']) {
        const glass = composite(tokens['--glass'], value(under));
        for (const fg of ['--text', '--muted']) expect(contrast(value(fg), glass), `${scheme} ${fg} on glass over ${under}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(value('--accent'), glass), `${scheme} accent on glass over ${under}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('uses Liquid Glass only on floating controls, with solid fallbacks', async () => {
    // Only the shared .glass rule blurs; the direction's own CSS never does.
    expect(css).not.toMatch(/backdrop-filter/);
    expect(base.match(/^\s*(-webkit-)?backdrop-filter: blur/gm)).toHaveLength(2); // one rule, with its -webkit- twin
    expect(base).toMatch(/@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\) \{\s*\.glass \{ background: var\(--glass-solid\); \}/);
    expect(base).toMatch(/@media \(prefers-reduced-transparency: reduce\), \(prefers-contrast: more\) \{\s*\.glass \{ background: var\(--glass-solid\);/);
    for (const which of pages) {
      const { html } = await page(which);
      const glass = html.match(/<[a-z]+ class="[^"]*\bglass\b[^"]*"/g) ?? [];
      // The top bar everywhere; plus the bottom bar (and the suggestion menu on page 2).
      expect(glass.length, which).toBe({ start: 1, check: 3, left: 2 }[which]);
      for (const tag of glass) expect(tag).toMatch(/class="(bar bar-top|bar bar-bottom|suggest) glass"/);
      // Never glass inside glass.
      for (const piece of html.split(/class="[^"]*\bglass\b[^"]*"/).slice(1)) {
        const untilClose = piece.slice(0, piece.search(/<\/(header|form|div)>/));
        expect(untilClose).not.toMatch(/\bglass\b/);
      }
    }
  });

  it('prints as an opaque page without the floating controls', () => {
    const print = base.slice(base.indexOf('@media print'));
    expect(print).toMatch(/\.bar, \.suggest, \.ghost, \.pace-controls, \.demo, \.mock \{ display: none !important; \}/);
    expect(css).toMatch(/@media print \{\s*:root \{/);
  });

  it('keeps the bans that still stand', () => {
    expect(css + base).not.toMatch(/text-transform:\s*uppercase/);
    // No default blue primary button, and no black-and-gold scheme.
    const [light] = tokenBlocks(css);
    const [r, g, b] = [1, 3, 5].map(i => parseInt(light['--accent'].slice(i, i + 2), 16));
    expect(b > r + 60 && b > g + 40 && r < 80, 'accent is not a default blue').toBe(false);
    for (const value of Object.values(light)) {
      const [vr, vg, vb] = [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
      expect(vr > 190 && vg > 140 && vg < 215 && vb < 90, `${value} is not gold`).toBe(false);
    }
  });
});

describe('the mockup content', () => {
  it('uses real titles and credits for every course it names', () => {
    const known = new Map([
      ...curriculum.blocks.flatMap(block => [...block.required, ...block.choices.flatMap(choice => choice.courses)]),
      ...curriculum.electives.namedCourses, ...curriculum.electives.legacyOnlyCourses,
    ].map(course => [course.courseId.replace('-', ' '), course]));
    const named = [
      ...check.courses.filter(course => course.title),
      ...left.blocks.flatMap(block => [...(block.done ?? []), ...(block.progress ?? []), ...(block.still ?? [])]).filter(item => item.code),
      ...left.plan.flatMap(term => term.entries).filter(item => item.code),
    ];
    expect(named.length).toBeGreaterThan(50);
    for (const course of named) {
      expect(known.has(course.code), course.code).toBe(true);
      expect(course.title, course.code).toBe(known.get(course.code).title);
    }
    // MKT 410 fits the elective rule and BIO 230 is in no list.
    expect(known.has('MKT 410')).toBe(false);
    expect(curriculum.electives.subjectRule.prefixes).toContain('MKT');
    expect(known.has('BIO 230')).toBe(false);
  });

  it('adds up: 27 counted, 13 in progress, 81 left, 121 total', () => {
    const credits = code => [...curriculum.blocks.flatMap(block => [...block.required, ...block.choices.flatMap(choice => choice.courses)])]
      .find(course => course.courseId === code.replace(' ', '-')).credits;
    expect(left.blocks.reduce((sum, block) => sum + block.counted, 0)).toBe(27);
    expect(left.blocks.reduce((sum, block) => sum + block.needed, 0)).toBe(121);
    const byName = Object.fromEntries([...curriculum.blocks, curriculum.electives].map(block => [block.name, block.credits]));
    for (const block of left.blocks) expect(block.needed, block.name).toBe(byName[block.name]);
    const inProgress = left.blocks.flatMap(block => block.progress ?? []);
    expect(inProgress.map(course => course.code)).toEqual(['ECO 251', 'HUM 103', 'ACT 214', 'MGT 202', 'PED 114']);
    expect(inProgress.reduce((sum, course) => sum + credits(course.code), 0)).toBe(13);
    expect([left.counted, left.inProgress, left.remaining, left.total]).toEqual([27, 13, 81, 121]);
    expect(left.total - left.counted - left.inProgress).toBe(left.remaining);
    // Counted credits per block equal the credits of its Done courses (Done blocks: all of them).
    for (const block of left.blocks.filter(item => item.status !== 'Done')) {
      expect((block.done ?? []).reduce((sum, course) => sum + credits(course.code), 0), block.name).toBe(block.counted);
    }
  });

  it('never calls a block Done while it has courses in progress or still needed', () => {
    for (const block of left.blocks) {
      const unfinished = (block.progress?.length ?? 0) + (block.still?.length ?? 0) > 0;
      expect(block.status === 'Done', block.name).toBe(!unfinished);
      if (block.status === 'Done') expect(block.counted).toBe(block.needed);
    }
    const eco251 = left.blocks.find(block => block.name === 'Social sciences');
    expect(eco251.progress.map(course => course.code)).toContain('ECO 251');
    expect((eco251.done ?? []).map(course => course.code)).not.toContain('ECO 251');
  });

  it('plans exactly what is still needed: 27 entries, 81 credits, nothing done or in progress', () => {
    const entries = left.plan.flatMap(term => term.entries);
    expect(entries).toHaveLength(27);
    expect(left.plan.map(term => term.cr)).toEqual([18, 18, 15, 15, 15]);
    for (const term of left.plan) expect(term.entries.length * 3, term.term).toBe(term.cr);
    expect(left.plan.reduce((sum, term) => sum + term.cr, 0)).toBe(81);
    const stillCodes = left.blocks.flatMap(block => block.still ?? []).filter(item => item.code).map(item => item.code).sort();
    expect(entries.filter(item => item.code).map(item => item.code).sort()).toEqual(stillCodes);
    // The open choices: 1 social sciences pick, 2 humanities picks, 3 electives...
    expect(entries.filter(item => item.open).map(item => item.name).sort()).toEqual(['CIS elective', 'CIS elective', 'CIS elective', 'Humanities pick', 'Humanities pick', 'Social sciences pick']);
    // ...which is 6 open entries in the plan for the 6 open slots in the blocks (the electives line is 3 slots).
    const openSlots = left.blocks.flatMap(block => block.still ?? []).filter(item => item.open);
    expect(openSlots).toHaveLength(4);
    const taken = left.blocks.flatMap(block => [...(block.done ?? []), ...(block.progress ?? [])]).map(course => course.code);
    for (const code of taken) expect(entries.map(item => item.code)).not.toContain(code);
    expect(left.plan.at(-1).entries.at(-1).code).toBe('MGT 462');
    // Neither HIS 132 nor ENG 210 is fixed in the plan, so the sequence line stays.
    expect(entries.map(item => item.code)).not.toContain('HIS 132');
    expect(entries.map(item => item.code)).not.toContain('ENG 210');
    expect(left.sequence).toContain('Still needed: HIS 132 or ENG 210');
  });

  it('gives each of the five statuses its own shape', async () => {
    const { marks } = await import('../mockups/shared.js');
    expect(Object.keys(marks).sort()).toEqual(['counts', 'done', 'needed', 'no', 'progress']);
    expect(new Set(Object.values(marks)).size).toBe(5);
    for (const svg of Object.values(marks)) expect(svg).toContain('aria-hidden="true"');
  });

  it('gives each direction its own palette and typeface', () => {
    const styles = directions.map(direction => stripComments(read(direction, 'style.css')));
    const first = name => styles.map(css => tokenBlocks(css)[0][name]);
    const fonts = styles.map(css => css.match(/font: [^;]*?\d\s+"([^"]+)"/)[1]);
    for (const list of [first('--bg'), first('--accent'), first('--no-fill'), fonts]) expect(new Set(list).size, list.join(' | ')).toBe(3);
  });

  it('has a rationale for each direction and the open questions in one place', () => {
    const index = read('index.html');
    for (const id of ['a', 'b', 'c']) {
      const section = index.match(new RegExp(`<section id="${id}">[\\s\\S]*?</section>`))[0];
      for (const heading of ['Why this direction', 'How page 2 makes "Doesn\'t count" impossible to miss', 'How page 3 makes "what\'s left" obvious on a phone']) {
        expect(section).toContain(`<h3>${heading}</h3>`);
      }
      expect(decode(section).split(' ').length).toBeGreaterThan(150);
    }
    const questions = index.match(/<section id="questions">[\s\S]*?<\/section>/)[0];
    expect(questions.match(/<li>/g).length).toBeGreaterThanOrEqual(5);
    expect(questions).toContain('15 count toward CIS');
  });
});

// ---- helpers ----

const TOKENS = [
  '--bg', '--surface', '--text', '--muted', '--line', '--accent', '--on-accent', '--focus',
  '--counts', '--done', '--progress', '--needed', '--no', '--no-fill', '--on-no', '--done-fill', '--progress-fill',
  '--glass', '--glass-solid', '--glass-edge', '--glass-shadow', '--glass-shine',
];

// Text on its background: WCAG AA 4.5:1.
const TEXT_PAIRS = [
  ['--text', '--bg'], ['--text', '--surface'], ['--muted', '--bg'], ['--muted', '--surface'],
  ['--text', '--glass-solid'], ['--muted', '--glass-solid'],
  ['--counts', '--bg'], ['--counts', '--surface'], ['--done', '--bg'], ['--done', '--surface'],
  ['--progress', '--bg'], ['--progress', '--surface'], ['--needed', '--bg'], ['--needed', '--surface'],
  ['--no', '--bg'], ['--no', '--surface'],
  ['--on-no', '--no-fill'], ['--text', '--done-fill'], ['--text', '--progress-fill'],
  ['--on-accent', '--accent'],
];

// Control borders, marks and the focus ring: WCAG 1.4.11, 3:1.
const MARK_PAIRS = [
  ['--line', '--bg'], ['--line', '--surface'], ['--focus', '--bg'], ['--focus', '--surface'], ['--focus', '--glass-solid'],
  ['--accent', '--bg'], ['--accent', '--surface'], ['--accent', '--glass-solid'], ['--on-no', '--no-fill'],
];

function tokenBlocks(css) {
  const blocks = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map(match =>
    Object.fromEntries([...match[1].matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?)\s*;/g)].map(([, name, value]) => [name, value])));
  expect(blocks).toHaveLength(3);
  expect(css.indexOf('prefers-color-scheme: dark')).toBeGreaterThan(css.indexOf(':root'));
  return blocks;
}

const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

// A translucent #rrggbbaa color drawn over an opaque one.
function composite(top, under) {
  const alpha = parseInt(top.slice(7, 9), 16) / 255;
  const over = channels(top);
  const below = channels(under);
  return '#' + over.map((value, i) => Math.round(value * alpha + below[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('');
}

function luminance(hex) {
  const [r, g, b] = channels(hex).map(value => value / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
