// F01: the three design mockups (docs/sprints/F01.md). Each direction renders its two
// pages from the same synthetic data; these tests read the rendered text and the CSS.
// What only an eye can judge (distinctness, layout at 375px) is the evaluator's job.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { left } from '../mockups/data.js';

const root = join(import.meta.dirname, '..', 'mockups');
const directions = ['1-worksheet', '2-credit-map', '3-plain-answers'];
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

const decode = html => html
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ');

const UNLESS = '— unless you’ve already passed it or filled this slot';

describe.each(directions)('mockup %s', direction => {
  const load = async () => (await import(`../mockups/${direction}/view.js`)).render;
  const page = async which => { const html = (await load())(which); return { html, text: decode(html) }; };
  const css = read(direction, 'style.css');

  it('has both pages for each direction', () => {
    const index = read('index.html');
    for (const file of ['check.html', 'left.html']) {
      expect(existsSync(join(root, direction, file)), file).toBe(true);
      expect(index).toContain(`href="${direction}/${file}"`);
      expect(read(direction, file)).toContain(`render('${file.replace('.html', '')}')`);
    }
  });

  it('links each page to the index and to its sibling', async () => {
    expect((await page('check')).html).toContain('href="left.html"');
    expect((await page('left')).html).toContain('href="check.html"');
    for (const which of ['check', 'left']) expect((await page(which)).html).toContain('href="../index.html"');
  });

  it('Flow A wording', async () => {
    const { text } = await page('check');
    for (const expected of [
      'CIS 310 Networking Fundamentals',
      `Counts toward CIS: Major (CIS) ${UNLESS}`,
      'ENG 131 English Composition I',
      `Counts toward CIS: Composition ${UNLESS}`,
      'MKT 410',
      `Counts toward CIS: elective (300/400-level MKT) ${UNLESS}`,
      'ENG 140 English Composition Honors I',
      'Doesn’t count — it fills the same requirement as ENG 131.',
      'BIO 220',
      'Doesn’t count toward CIS — not in the CIS curriculum',
      'Remember: you need HIS 132 or ENG 210 for the history/literature sequence.',
      '12 credits',
      'BIO 220 isn’t included',
      'Add your transcript for an exact answer',
    ]) expect(text).toContain(expected);
    expect(text).not.toMatch(/below full-time|may cost extra/);
  });

  it('Flow A never over-promises', async () => {
    const { text } = await page('check');
    const counts = text.split('Counts toward CIS').slice(1);
    expect(counts).toHaveLength(3);
    for (const rest of counts) expect(rest).toMatch(/^: [^—]+ — unless you’ve already passed it or filled this slot/);
    expect(text).not.toMatch(/You already passed this|This slot is already filled|at this pace|On pace/);
  });

  it('one big answer', async () => {
    expect((await page('check')).text).toContain('Do these 5 courses count? 3 count, unless you’ve already passed them or filled their slots. 2 don’t.');
    expect((await page('left')).text).toContain('What do I have left? 45 credits left. On pace for Spring 2028.');
    for (const which of ['check', 'left']) expect(((await page(which)).html.match(/<h1/g) ?? [])).toHaveLength(1);
  });

  it('Flow B checklist', async () => {
    const { html, text } = await page('left');
    const expected = {
      'Orientation': 'Done', 'Composition': 'Done', 'Humanities': 'In progress', 'Social sciences': 'Done',
      'Science & math': 'Still needed', 'Pre-professional': 'Still needed', 'Business core': 'Still needed',
      'Major (CIS)': 'Still needed', 'CIS electives': 'Still needed',
    };
    expect(left.blocks.map(block => [block.name, block.status])).toEqual(Object.entries(expected));
    for (const [name, status] of Object.entries(expected)) {
      expect(text).toContain(name);
      // The status word sits in the same heading as the block name.
      const heading = html.split('\n').join(' ').match(new RegExp(`<(h3|summary)[^>]*>(?:(?!</\\1>).)*${name.replace(/[()&]/g, m => (m === '&' ? '&amp;' : '\\' + m))}(?:(?!</\\1>).)*</\\1>`));
      expect(heading, name).not.toBeNull();
      expect(decode(heading[0]), name).toContain(status);
    }
    expect(text).toContain('Grade D — must be repeated');
    // Done blocks are native, script-free disclosures; the others show their courses directly.
    expect((html.match(/<details class="(block|wrap)"/g) ?? [])).toHaveLength(3);
    const outsideDetails = decode(html.replace(/<details[\s\S]*?<\/details>/g, ''));
    for (const shown of ['ENG 210', 'BIO 128', 'MGT 255', 'MGT 252', 'FIN 321', 'MGT 462', 'CIS 341', 'CIS 461', 'CIS elective']) {
      expect(outsideDetails, shown).toContain(shown);
    }
    expect(outsideDetails.match(/In progress/g).length).toBeGreaterThanOrEqual(5);
    expect(html).not.toMatch(/<script|onclick/);
  });

  it('nothing in progress or below C is Done', () => {
    for (const block of left.blocks) {
      const unfinished = block.courses.some(course => course.state !== 'done');
      expect(block.status === 'Done', block.name).toBe(!unfinished);
    }
    const holder = code => left.blocks.find(block => block.courses.some(course => course.code === code));
    for (const code of ['ENG 210', 'MGT 252', 'MGT 321', 'CIS 310', 'BIO 128']) expect(holder(code).status, code).not.toBe('Done');
    expect(holder('BIO 128').courses.find(course => course.code === 'BIO 128').state).toBe('needed');
  });

  it('Flow B pace and plan', async () => {
    const { html, text } = await page('left');
    for (const expected of [
      'On pace for Spring 2028', 'Target: Spring 2028', '12–18 credits a semester', 'Summers off',
      'Credits only — course order may add semesters.',
      'Order not checked — your portal checks prerequisites',
      'Print / PDF',
    ]) expect(text).toContain(expected);

    expect(left.plan.map(term => term.term)).toEqual(['Spring 2027', 'Fall 2027', 'Spring 2028']);
    const planned = left.plan.flatMap(term => term.courses);
    for (const term of left.plan) {
      const credits = term.courses.reduce((sum, course) => sum + course.credits, 0);
      expect(credits, term.term).toBe(15);
      expect(text).toContain(`${term.term} 15 credits`);
    }
    expect(planned.reduce((sum, course) => sum + course.credits, 0)).toBe(45);

    // The plan is exactly the courses still needed: nothing in progress, nothing done.
    const needed = left.blocks.flatMap(block => block.courses).filter(course => course.state === 'needed').map(course => course.code).sort();
    expect(planned.map(course => course.code).sort()).toEqual(needed);
    for (const code of ['ENG 210', 'MGT 252', 'MGT 321', 'CIS 310']) expect(planned.map(course => course.code)).not.toContain(code);
    expect(planned.map(course => course.code)).toContain('BIO 128');

    // Level 100 -> 400 across the plan (an elective is a 300/400-level slot), MGT 462 last.
    const level = course => (course.code === 'CIS elective' ? 300 : Math.floor(Number(course.code.split(' ')[1]) / 100) * 100);
    const levels = planned.map(level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(planned.at(-1).code).toBe('MGT 462');
    expect(text).toContain('MGT 462 Business Policies');

    expect((html.match(/<button type="button"[^>]*>Move later<\/button>/g) ?? [])).toHaveLength(15);
    expect(html).toMatch(/<button type="button"[^>]*>Print \/ PDF<\/button>/);
  });

  it('on every page', async () => {
    for (const which of ['check', 'left']) {
      const { html, text } = await page(which);
      for (const expected of [
        'PathCheck', 'Not affiliated with Alabama State University', 'Curriculum last reviewed: 12 August 2026',
        'Not an official degree audit', 'Report a mistake',
      ]) expect(text).toContain(expected);
      expect(html).toMatch(/<a href="mailto:[^"@]+@example\.com\?subject=[^"]+">Report a mistake<\/a>/);
      expect(html).toMatch(/<button type="button"[^>]*>Clear my data<\/button>/);
      expect(html).not.toMatch(/<img|<svg/);
      expect(text).not.toMatch(/advisor|GPA|prerequisite check|sign in|adopt/i);
    }
  });

  it('no banned CSS', () => {
    expect(css).not.toMatch(/backdrop-filter|text-transform:\s*uppercase|box-shadow|filter:\s*blur/);
  });

  it('colors are tokens', () => {
    const outsideTokens = css.replace(/:root\s*\{[^}]*\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(outsideTokens).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|:\s*(white|black|red|green|blue|gr[ae]y|gold)\b/i);
    const [light, dark] = tokenBlocks(css);
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
    expect(Object.keys(light).sort()).toEqual([...TOKENS].sort());
    // Every var() used is a declared token.
    for (const [, name] of css.matchAll(/var\((--[\w-]+)/g)) expect(TOKENS, name).toContain(name);
  });

  it('token contrast', () => {
    const [light, dark] = tokenBlocks(css);
    for (const [scheme, tokens] of [['light', light], ['dark', dark]]) {
      for (const [fg, bg] of TEXT_PAIRS) expect(contrast(tokens[fg], tokens[bg]), `${scheme} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      for (const [fg, bg] of MARK_PAIRS) expect(contrast(tokens[fg], tokens[bg]), `${scheme} ${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('uses each color token only on the backgrounds its contrast was checked for', () => {
    // Text colors: only --text and --on-accent may sit on a fill or the accent.
    for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\{([^{}]*)\}/g)) {
      const body = rule[1];
      const background = body.match(/background(?:-color)?:\s*var\((--[\w-]+)\)/)?.[1];
      const color = body.match(/(?:^|;|\s)color:\s*var\((--[\w-]+)\)/)?.[1];
      if (!background || !color) continue;
      expect(TEXT_PAIRS.some(([fg, bg]) => fg === color && bg === background), `${color} on ${background}`).toBe(true);
    }
  });
});

it('the three directions do not share a palette or a typeface', () => {
  const styles = directions.map(direction => read(direction, 'style.css'));
  const backgrounds = styles.map(css => tokenBlocks(css)[0]['--bg']);
  const accents = styles.map(css => tokenBlocks(css)[0]['--accent']);
  const fonts = styles.map(css => css.match(/font:[^;]*?\d\s+([^;]+);/)[1].split(',')[0].trim());
  for (const list of [backgrounds, accents, fonts]) expect(new Set(list).size, list.join(' | ')).toBe(3);
});

// ---- helpers ----

const TOKENS = [
  '--bg', '--surface', '--text', '--muted', '--line', '--accent', '--on-accent', '--focus',
  '--done', '--progress', '--needed', '--done-fill', '--progress-fill', '--needed-fill',
];

// Text on background: WCAG AA 4.5:1.
const TEXT_PAIRS = [
  ['--text', '--bg'], ['--text', '--surface'], ['--muted', '--bg'], ['--muted', '--surface'],
  ['--done', '--bg'], ['--progress', '--bg'], ['--needed', '--bg'],
  ['--done', '--surface'], ['--progress', '--surface'], ['--needed', '--surface'],
  ['--text', '--done-fill'], ['--text', '--progress-fill'], ['--text', '--needed-fill'],
  ['--on-accent', '--accent'],
];

// Control borders, status marks and the focus ring: WCAG 1.4.11, 3:1.
const MARK_PAIRS = [
  ['--line', '--bg'], ['--line', '--surface'], ['--line', '--done-fill'], ['--line', '--progress-fill'], ['--line', '--needed-fill'],
  ['--focus', '--bg'], ['--focus', '--surface'], ['--focus', '--done-fill'], ['--focus', '--progress-fill'], ['--focus', '--needed-fill'],
  ['--accent', '--bg'], ['--accent', '--surface'],
];

function tokenBlocks(css) {
  const blocks = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map(match =>
    Object.fromEntries([...match[1].matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map(([, name, value]) => [name, value])));
  expect(blocks).toHaveLength(2);
  expect(css.indexOf('prefers-color-scheme: dark')).toBeGreaterThan(css.indexOf(':root'));
  return blocks;
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
