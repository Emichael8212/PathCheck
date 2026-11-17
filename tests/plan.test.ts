// F16: the draft plan (docs/sprints/F16.md; docs/BRIEF.md §4 Flow B step 5; the owner's
// answer of 2026-11-16 on the sequence: "the draft plan schedules it"). The rules and the
// section as text; clicking is in tests/left-page.test.ts. Every student here is made up.
import { describe, expect, it } from 'vitest';
// @ts-expect-error The approved mockups are plain JavaScript, with no type declarations.
import { left as approved } from '../mockups/data.js';
import madeUp from './fixtures/made-up-program.json';
import sampleA from '../synthetic/transcripts/sample-a.json';
import { checklistOf } from '../src/checklist';
import { curriculum, loadCurriculum } from '../src/curriculum';
import { emptyLeft, leftPage, resultHtml } from '../src/left';
import { defaultSettings, paceOf, readTerm, termAfter, termName, type PaceSettings, type Term } from '../src/pace';
import { layOut, moveLater, movedSentence, planEntries, planHtml, planOf, type Moves, type Plan, type PlanEntry } from '../src/plan';
import { openTranscript, reviewedStandings } from '../src/review';
import { courseStandings, type CourseStanding, type TranscriptRow } from '../src/transcript';

const decode = (html: string): string => html
  .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ')
  .replace(/ ([,.;:)])/g, '$1');
const term = (text: string): Term => {
  const read = readTerm(text);
  if (!read) throw new Error(`${text} is not a term`);
  return read;
};
/** A made-up row: "ENG 131" is passed with a B; "ENG 131:D" has that grade; ":-" is in progress. */
const rowOf = (entry: string): TranscriptRow => {
  const [code = '', mark = 'B'] = entry.split(':');
  return { code, term: 'Fall 2026', credits: 3, grade: mark === '-' ? null : mark, transfer: false };
};
const having = (rows: readonly string[]): CourseStanding[] => courseStandings(rows.map(rowOf), curriculum.grades);
const settings = (over: Partial<PaceSettings> = {}): PaceSettings => ({ ...defaultSettings(), ...over });
const LATEST = term('Fall 2026');
const plan = (rows: readonly string[], over: Partial<PaceSettings> = {}, moves: Moves = {}, legacy = false): Plan => {
  const made = planOf(having(rows), curriculum, legacy, LATEST, settings(over), moves);
  if (!made) throw new Error('no plan');
  return made;
};
const nameOf = (entry: PlanEntry): string => entry.course?.code ?? entry.choice ?? '';
/** The plan as lines: "Spring 2027 18: A, B, C". */
const shape = (made: Plan): string[] => made.semesters.map(one => `${termName(one.term)} ${one.credits}: ${one.entries.map(nameOf).join(', ')}`);
const terms = (made: Plan): string[] => made.semesters.map(one => `${termName(one.term)} ${one.credits}`);
const all = (made: Plan): PlanEntry[] => made.semesters.flatMap(one => one.entries);
const where = (made: Plan, key: string): string => termName(made.semesters.find(one => one.entries.some(entry => entry.key === key))!.term);
const a = reviewedStandings(openTranscript('sample-a.pdf', sampleA, curriculum), curriculum.grades);
const requiredCodes = curriculum.blocks.flatMap(block => block.required.map(course => course.code));
/** Everything passed, with these courses in the two sequence picks and three electives. */
const everything = (social: string, humanities: string): string[] => [
  ...requiredCodes,
  ...curriculum.blocks.flatMap(block => block.picks.map(group => {
    const codes = group.courses.map(course => course.code);
    return codes.includes('HIS 132') ? social : codes.includes('ENG 210') ? humanities : codes[0]!;
  })),
  'FIN 201', 'MKT 410', 'CIS 499',
];
const when = (one: Term): number => one.year * 3 + ['Spring', 'Summer', 'Fall'].indexOf(one.season);

/**
 * An open pick as the plan names it, with the alternatives the curriculum file has today: "Composition pick (ENG 131
 * or ENG 140)", and the block's name alone when there are more than three. The lists are the file's and are written
 * in no test (F25, docs/CURRICULUM-HANDOVER.md); that three or fewer are named is the plan's own rule, stated here.
 */
const pickLabel = (blockId: string, group: number): string => {
  const block = curriculum.blocks.find(one => one.id === blockId);
  const codes = block?.picks[group]?.courses.map(course => course.code);
  if (!block || !codes) throw new Error(`no pick ${group} in ${blockId}`);
  const named = codes.length <= 1 ? codes.join('') : `${codes.slice(0, -1).join(', ')} or ${codes[codes.length - 1]}`;
  return codes.length <= 3 ? `${block.name} pick (${named})` : `${block.name} pick`;
};
/**
 * An open choice of the approved design, with today's alternatives where the design lists a pick's courses. (The
 * mockups are a frozen record; "… or another" and the electives are rules and stay in the design's words.)
 */
const designChoice = (text: string): string => {
  const listed = /^(.+) pick \((.+)\)$/.exec(text);
  if (!listed || listed[2]!.endsWith('or another')) return text;
  const block = curriculum.blocks.find(one => one.name === listed[1]);
  if (!block) throw new Error(`the design names a pick of "${listed[1]}", which is no block`);
  const shared = block.picks.map(group => group.courses.filter(course => listed[2]!.includes(course.code)).length);
  const group = shared.indexOf(Math.max(...shared));
  // The design's pick is one of the block's: something of what it names is still there.
  expect(shared[group], text).toBeGreaterThan(0);
  return pickLabel(block.id, group);
};

describe('the draft plan', () => {
  it("matches the approved design's student", () => {
    const made = planOf(a, curriculum, false, LATEST, defaultSettings());
    if (!made) throw new Error('no plan');
    // The design's five semesters and their credits.
    const design = approved.plan as { term: string; cr: number; entries: { code?: string; title?: string; note?: string; choice?: boolean; text?: string }[] }[];
    expect(terms(made)).toEqual(design.map(one => `${one.term} ${one.cr}`));
    expect(terms(made)).toEqual(['Spring 2027 18', 'Fall 2027 18', 'Spring 2028 15', 'Fall 2028 15', 'Spring 2029 15']);
    // The same 27 entries: the same courses, and the same open choices in the design's words.
    const mine = all(made);
    const theirs = design.flatMap(one => one.entries);
    expect(mine).toHaveLength(27);
    expect(mine.filter(entry => entry.course).map(entry => entry.course!.code).sort()).toEqual(theirs.filter(entry => !entry.choice).map(entry => entry.code!).sort());
    expect(mine.filter(entry => entry.choice).map(entry => entry.choice!).sort()).toEqual(theirs.filter(entry => entry.choice).map(entry => designChoice(entry.text!)).sort());
    // Where the design gives a title, it is the curriculum's.
    for (const entry of theirs) if (!entry.choice && entry.title) expect(mine.find(one => one.course?.code === entry.code)?.course?.title, entry.code).toBe(entry.title);
    // The order by level puts the open picks of the lowest level first (the screenshot has them later): the one listed difference.
    expect(shape(made)[0]).toBe(`Spring 2027 18: ${pickLabel('humanities', 0)}, Humanities pick (ENG 210 or another), Social sciences pick, ENG 209, ECO 252, ACT 215`);
    expect(shape(made)[4]).toBe('Spring 2029 15: CIS 461, CIS elective, CIS elective, CIS elective, MGT 462');
    // The section, in the design's words.
    const html = planHtml(made);
    const text = decode(html);
    for (const words of [approved.planEyebrow, approved.planTitle, approved.planLabel, approved.planNote, approved.choiceLabel, approved.move]) expect(text, words).toContain(words);
    expect(html).toMatch(/^<section class="plan" aria-labelledby="plan-title">[\s\S]*<span class="eyebrow">A starting point, not a schedule<\/span>\s*<h2 id="plan-title">Draft plan<\/h2>/);
    expect(html.match(/<li class="semester">/g)).toHaveLength(5);
    expect(html).toMatch(/<header>\s*<h3>Spring 2027<\/h3>\s*<span class="num">18 cr<\/span>\s*<\/header>/);
    // On the page it comes after the requirements.
    const page = leftPage(curriculum, { ...emptyLeft(), transcript: openTranscript('sample-a.pdf', sampleA, curriculum), continued: true });
    expect(page.indexOf('class="plan"')).toBeGreaterThan(page.indexOf('class="reqs"'));
    expect(page).toContain(`<div data-plan>${html}</div>`);
  });

  it('orders the courses by level', () => {
    for (const rows of [[], ['ENG 131', 'MGT 321:-'], ['ORI 100', 'CIS 300', 'CIS 461'], everything('HIS 132', 'ENG 210').slice(0, 20)]) {
      const entries = planEntries(having(rows), curriculum, false);
      // One order for the whole plan: the hundred of the number never goes down, the final-semester course apart.
      const levels = entries.filter(entry => !entry.final).map(entry => entry.level);
      expect(levels, rows.join()).toEqual([...levels].sort((x, y) => x - y));
      for (const entry of entries) if (entry.course) expect(entry.level, entry.course.code).toBe(Math.floor(Number(entry.course.code.split(' ')[1]) / 100) * 100);
      // Laid out, no semester has a lower level than an earlier one.
      const made = planOf(having(rows), curriculum, false, LATEST, defaultSettings())!;
      const perSemester = made.semesters.map(one => one.entries.filter(entry => !entry.final).map(entry => entry.level));
      for (const one of perSemester) expect(one).toEqual([...one].sort((x, y) => x - y));
      perSemester.slice(1).forEach((one, i) => { if (one.length > 0) expect(Math.min(...one), rows.join()).toBeGreaterThanOrEqual(Math.max(...perSemester[i]!, 0)); });
    }
    // An open pick has the level of its lowest course; an open elective the rule's highest level.
    const entries = planEntries(having([]), curriculum, false);
    expect(entries.find(entry => entry.choice === 'Social sciences pick')?.level).toBe(100);
    expect(entries.filter(entry => entry.choice === 'CIS elective').map(entry => entry.level)).toEqual([400, 400, 400]);
    // Within a level the order is the curriculum's.
    expect(entries.filter(entry => entry.level === 300 && entry.course).map(entry => entry.course!.code).slice(0, 4)).toEqual(['FIN 321', 'MGT 321', 'MKT 321', 'CIS 329']);
  });

  it('keeps the final-semester course last', () => {
    // The last entry of the last semester, with its note, whatever else is left.
    for (const rows of [[], ['ENG 131'], everything('HIS 132', 'ENG 210').filter(code => !['MGT 462', 'CIS 461'].includes(code))]) {
      const made = plan(rows);
      const last = made.semesters[made.semesters.length - 1]!;
      expect(last.entries[last.entries.length - 1]).toMatchObject({ final: true, course: { code: 'MGT 462', title: 'Business Policies' } });
      expect(all(made).filter(entry => entry.final)).toHaveLength(1);
    }
    expect(planHtml(plan([]))).toMatch(/<span class="code strong">MGT 462<\/span>\s*<p>Business Policies<\/p>\s*<span class="plan-fixed">Always the final semester<\/span>/);
    expect(planHtml(plan([])).match(/Always the final semester/g)).toHaveLength(1);
    // The only course left: alone in one semester.
    expect(shape(plan(everything('HIS 132', 'ENG 210').filter(code => code !== 'MGT 462')))).toEqual(['Spring 2027 3: MGT 462']);
    // When it does not fit under the most, it has a semester of its own at the end.
    const tight = plan(everything('HIS 132', 'ENG 210').filter(code => !['MGT 462', 'CIS 461', 'CIS 410'].includes(code)), { fewest: 6, most: 6 });
    expect(shape(tight)).toEqual(['Spring 2027 6: CIS 410, CIS 461', 'Fall 2027 3: MGT 462']);
    // Passed or in progress: no such entry and no such note.
    for (const mark of ['', ':-']) {
      const without = plan([`MGT 462${mark}`]);
      expect(all(without).some(entry => entry.final || entry.course?.code === 'MGT 462')).toBe(false);
      expect(planHtml(without)).not.toContain('Always the final semester');
    }
    // Which course it is comes from the curriculum file: another program has its own, and one without the line has none.
    const other = loadCurriculum(madeUp);
    expect(planEntries([], other, false).filter(entry => entry.final).map(entry => entry.course?.code)).toEqual(['XBBB 202']);
    const { finalSemesterCourse: _dropped, ...rest } = madeUp as Record<string, unknown>;
    void _dropped;
    expect(planEntries([], loadCurriculum(rest), false).some(entry => entry.final)).toBe(false);
  });

  it('keeps every semester within the range', () => {
    const cases: Partial<PaceSettings>[] = [{}, { fewest: 9, most: 12 }, { fewest: 15, most: 21 }, { fewest: 3, most: 3 }, { fewest: 1, most: 30 }, { summers: true }, { target: term('Fall 2032') }, { target: term('Spring 2027') }];
    for (const over of cases) {
      for (const rows of [[], ['ENG 131', 'ORI 100:-'], a.map(one => one.code)]) {
        const made = planOf(rows === cases ? a : having(rows), curriculum, false, LATEST, settings(over))!;
        const { fewest, most } = settings(over);
        made.semesters.forEach((one, i) => {
          // The credits shown are the sum of the entries; never over the most.
          expect(one.credits, JSON.stringify(over)).toBe(one.entries.reduce((sum, entry) => sum + entry.credits, 0));
          expect(one.credits, JSON.stringify(over)).toBeLessThanOrEqual(most);
          // Under the fewest only at the end, or when nothing that is left still fits.
          if (one.credits < fewest && i < made.semesters.length - 1) {
            const later = made.semesters.slice(i + 1).flatMap(next => next.entries).filter(entry => !entry.final);
            for (const entry of later) expect(one.credits + entry.credits, JSON.stringify(over)).toBeGreaterThan(most);
          }
        });
      }
    }
    // A course bigger than the most cannot be split: it has the semester to itself.
    const small = plan(['ENG 131'], { fewest: 1, most: 2 });
    for (const one of small.semesters) {
      if (one.credits > 2) expect(one.entries).toHaveLength(1);
      else expect(one.entries.every(entry => entry.credits <= 2)).toBe(true);
    }
    expect(small.semesters.some(one => one.credits > 2)).toBe(true);
    expect(all(small).reduce((sum, entry) => sum + entry.credits, 0)).toBe(118);
  });

  it('ends where pace says', () => {
    const made = (over: Partial<PaceSettings>): Plan => planOf(a, curriculum, false, LATEST, settings(over))!;
    const last = (one: Plan): string => termName(one.semesters[one.semesters.length - 1]!.term);
    // On pace: the plan ends in the target.
    expect(last(made({}))).toBe('Spring 2029');
    expect(terms(made({ target: term('Fall 2029') }))).toEqual(['Spring 2027 15', 'Fall 2027 15', 'Spring 2028 15', 'Fall 2028 12', 'Spring 2029 12', 'Fall 2029 12']);
    // Not on pace: it runs to where the most credits a term finish.
    expect(last(made({ target: term('Fall 2028') }))).toBe('Spring 2029');
    expect(terms(made({ target: term('Fall 2028') }))).toEqual(['Spring 2027 18', 'Fall 2027 18', 'Spring 2028 15', 'Fall 2028 15', 'Spring 2029 15']);
    // A target so far that even the fewest credits a term finish earlier: it ends there.
    expect(last(made({ target: term('Spring 2031') }))).toBe('Spring 2030');
    expect(made({ target: term('Spring 2031') }).semesters.every(one => one.credits >= 9)).toBe(true);
    // More credits a term: fewer semesters. Summers on: summers are used.
    expect(terms(made({ most: 21 }))).toEqual(['Spring 2027 21', 'Fall 2027 21', 'Spring 2028 21', 'Fall 2028 18']);
    expect(terms(made({ summers: true })).map(one => one.split(' ').slice(0, 2).join(' '))).toEqual(['Spring 2027', 'Summer 2027', 'Fall 2027', 'Spring 2028', 'Summer 2028']);
    // In every one of these the plan ends no later than the pace answer implies: nothing is said under it.
    for (const over of [{}, { target: term('Fall 2029') }, { target: term('Fall 2028') }, { target: term('Spring 2031') }, { most: 21 }, { summers: true }]) expect(made(over).late, JSON.stringify(over)).toBeNull();
  });

  it('leaves out what is passed or in progress', () => {
    const made = plan(['ENG 131', 'MGT 321:-', 'CIS 300:D', 'CIS 302:W', 'BIO 230', 'BIO 230:-']);
    const codes = all(made).flatMap(entry => (entry.course ? [entry.course.code] : []));
    expect(codes).not.toContain('MGT 321');
    expect(codes).not.toContain('ENG 131');
    // A course that must be repeated, or has a W, is still to take.
    expect(codes).toContain('CIS 300');
    expect(codes).toContain('CIS 302');
    // A course outside the curriculum is never planned, and changes nothing.
    expect(JSON.stringify(shape(made))).not.toContain('BIO 230');
    expect(shape(plan(['ENG 131', 'MGT 321:-', 'CIS 300:D', 'CIS 302:W']))).toEqual(shape(made));
    // The first Composition pick is filled, the second is open.
    expect(all(made).filter(entry => entry.choice?.startsWith('Composition')).map(entry => entry.choice)).toEqual(['Composition pick (ENG 132 or ENG 141)']);
  });

  it('says it is a draft', () => {
    for (const rows of [[], ['ENG 131'], everything('HIS 132', 'ENG 210').filter(code => code !== 'MGT 462')]) {
      const html = planHtml(plan(rows));
      expect(html).toMatch(/<p class="draft-label"><svg[\s\S]*?<\/svg>Draft — Order not checked — your portal checks prerequisites<\/p>\s*<p class="section-note">Pace settings estimate credits only\. “Move later” changes this draft; prerequisites are not checked\.<\/p>/);
    }
  });

  it('is a draft and nothing more', () => {
    // The wording itself: the block, "pick", and up to three courses joined with commas and "or".
    expect(pickLabel('composition', 0)).toMatch(/^Composition pick( \((?:[A-Z]{2,4} \d{3}, )?[A-Z]{2,4} \d{3} or [A-Z]{2,4} \d{3}\))?$/);
    const html = planHtml(plan([]));
    // The only control is "Move later", once for each entry.
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(all(plan([])).length);
    // Its name starts with the words it shows ("Move later"), then says which entry.
    for (const button of buttons) expect(button).toMatch(/^<button type="button" class="move no-print" aria-label="Move later: [^"]+" data-move="[^"]+">$/);
    expect(html.match(/<span>Move later<\/span><\/button>/g)).toHaveLength(buttons.length);
    expect(html).not.toMatch(/draggable|ondrag|<input|<select|<form|contenteditable/i);
    expect(decode(html)).not.toMatch(/\b(adopt|apply|preview|undo|save plan|offered|prerequisite for|register)\b/i);
    // "Prerequisites" appears only where the plan says it does not check them.
    expect(decode(html).match(/prerequisites/gi)).toHaveLength(2);
  });

  it('plans the open choices', () => {
    const entries = planEntries(having([]), curriculum, false);
    const choices = entries.filter(entry => entry.choice).map(entry => [entry.key, entry.choice, entry.credits, entry.nth]);
    expect(choices).toEqual([
      // (Which courses a pick offers is the curriculum file's: the label is built from it. As approved: "Composition
      // pick (ENG 131 or ENG 140)", "Humanities pick (ART 131, THE 111 or MUS 121)".)
      ['pick:composition:0:0', pickLabel('composition', 0), 3, null],
      ['pick:composition:1:0', pickLabel('composition', 1), 3, null],
      ['pick:humanities:0:0', pickLabel('humanities', 0), 3, null],
      // The first open pick through which a sequence can still be completed names that course; the other does not.
      ['pick:humanities:1:0', 'Humanities pick (ENG 210 or another)', 3, null],
      ['pick:social-sciences:0:0', 'Social sciences pick', 3, null],
      ['pick:pre-professional:0:0', pickLabel('pre-professional', 0), 1, null],
      // One entry for each elective place, told apart by their count.
      ['elective:0', 'CIS elective', 3, { n: 1, of: 3 }], ['elective:1', 'CIS elective', 3, { n: 2, of: 3 }], ['elective:2', 'CIS elective', 3, { n: 3, of: 3 }],
    ]);
    const html = planHtml(plan([]));
    expect(html).toMatch(/<li class="plan-entry is-choice">\s*<div class="plan-text">\s*<span class="choice-label">Open choice<\/span>\s*<p>Humanities pick \(<span class="code">ENG 210<\/span> or another\)<\/p>/);
    expect(html.match(/aria-label="Move later: CIS elective, \d of 3"/g)).toEqual(['aria-label="Move later: CIS elective, 1 of 3"', 'aria-label="Move later: CIS elective, 2 of 3"', 'aria-label="Move later: CIS elective, 3 of 3"']);
    expect(html).toContain('aria-label="Move later: MGT 321" data-move="MGT 321"');
    expect(html).toContain('aria-label="Move later: Social sciences pick" data-move="pick:social-sciences:0:0"');
    // With electives taken, only the open places are planned; with the sequence course in its pick, no pick names one.
    expect(all(plan(['FIN 201', 'MKT 410:-'])).filter(entry => entry.choice === 'CIS elective').map(entry => entry.nth)).toEqual([null]);
    expect(all(plan(['HIS 132'])).filter(entry => entry.choice?.includes('or another'))).toEqual([]);
    expect(all(plan(['HIS 132'])).map(entry => entry.choice).filter(Boolean)).toContain('Humanities pick');
    // With the Humanities pick held by another course, the Social sciences pick is the one that names its sequence course.
    expect(all(plan(['HUM 101'])).map(entry => entry.choice).filter(Boolean)).toContain('Social sciences pick (HIS 132 or another)');
  });

  it('schedules the sequence course when both picks are held', () => {
    // The owner, 2026-11-16: with both sequence picks held by other courses, the draft plan schedules the sequence course.
    const rows = everything('GEO 206', 'HUM 101').filter(code => !['MGT 462', 'CIS 461'].includes(code));
    const made = plan(rows);
    const extra = all(made).find(entry => entry.key === 'sequence');
    expect(extra).toMatchObject({ choice: 'HIS 132 or ENG 210, for the history or literature sequence', credits: 3, level: 100, course: null });
    expect(shape(made)).toEqual(['Spring 2027 9: HIS 132 or ENG 210, for the history or literature sequence, CIS 461, MGT 462']);
    // Its credits are the extra credits pace counts: the plan holds exactly the credits still to take.
    const checklist = checklistOf(having(rows), curriculum, false);
    expect(all(made).reduce((sum, entry) => sum + entry.credits, 0)).toBe(checklist.credits.left + checklist.extraLeft);
    expect([checklist.credits.left, checklist.extraLeft]).toEqual([6, 3]);
    // With everything else done it is the whole plan, never "nothing to plan".
    expect(shape(plan(everything('GEO 206', 'HUM 101')))).toEqual(['Spring 2027 3: HIS 132 or ENG 210, for the history or literature sequence']);
    // With a pick open instead, that pick names the course and there is no extra entry.
    const open = plan(everything('GEO 206', 'ENG 210').filter(code => code !== 'ENG 210'));
    expect(shape(open)).toEqual(['Spring 2027 3: Humanities pick (ENG 210 or another)']);
    // A legacy student whose legacy course holds the pick of the one sequence still open: the sequence course
    // would take that pick and the legacy course an elective place. No pick is open for it, so one elective
    // place is planned as the sequence course: the plan never leaves out what the checklist says is still needed.
    const legacyRows = ['PSY 251', 'HUM 101', 'FIN 201', 'MKT 410'];
    const legacyList = checklistOf(having(legacyRows), curriculum, true);
    expect(legacyList.sequence).toMatchObject({ kind: 'open', text: 'Still needed: HIS 132 to complete a history sequence.' });
    const forLegacy = all(plan(legacyRows, {}, {}, true));
    expect(forLegacy.filter(entry => entry.choice?.includes('sequence'))).toEqual([{ key: 'sequence', credits: 3, level: 100, course: null, choice: 'HIS 132, for the history sequence', nth: null, final: false }]);
    expect(forLegacy.filter(entry => entry.key.startsWith('elective'))).toEqual([]);
    expect(forLegacy.reduce((sum, entry) => sum + entry.credits, 0)).toBe(legacyList.credits.left + legacyList.extraLeft);
    expect(legacyList.extraLeft).toBe(0);
    expect(movedSentence(plan(legacyRows, {}, {}, true), 'sequence')).toBe('HIS 132, for the history sequence, moved to Fall 2027.');
    // With two more elective places open, they are planned beside it.
    expect(all(plan(['PSY 251', 'HUM 101'], {}, {}, true)).filter(entry => entry.choice !== null && /sequence|elective/.test(entry.choice)).map(entry => [entry.choice, entry.nth])).toEqual([
      ['HIS 132, for the history sequence', null], ['CIS elective', { n: 1, of: 2 }], ['CIS elective', { n: 2, of: 2 }],
    ]);
    // The same rows for a student who is not a legacy student: both picks are held for good, so it is the extra course.
    expect(all(plan(legacyRows)).filter(entry => entry.key === 'sequence').map(entry => entry.choice)).toEqual(['HIS 132 or ENG 210, for the history or literature sequence']);
    // With the sequence course in progress there is nothing of it to plan.
    expect(planOf(having([...everything('GEO 206', 'HUM 101'), 'HIS 132:-']), curriculum, false, LATEST, defaultSettings())).toBeNull();
  });

  it('moves an entry later and flows again', () => {
    const first = planOf(a, curriculum, false, LATEST, defaultSettings())!;
    expect(where(first, 'MGT 321')).toBe('Fall 2027');
    // "Move later": not before the next term; the others flow again into the room it left.
    let moves = moveLater(first, 'MGT 321', defaultSettings(), {});
    expect(moves).toEqual({ 'MGT 321': term('Spring 2028') });
    let made = planOf(a, curriculum, false, LATEST, defaultSettings(), moves)!;
    expect(where(made, 'MGT 321')).toBe('Spring 2028');
    expect(terms(made)).toEqual(['Spring 2027 18', 'Fall 2027 18', 'Spring 2028 15', 'Fall 2028 15', 'Spring 2029 15']);
    expect(movedSentence(made, 'MGT 321')).toBe('MGT 321 moved to Spring 2028.');
    // Nothing is lost or doubled.
    expect(all(made).map(entry => entry.key).sort()).toEqual(all(first).map(entry => entry.key).sort());
    // It keeps its place in the order: first among the entries of the semester it lands in that are of its level or higher.
    const landed = made.semesters.find(one => termName(one.term) === 'Spring 2028')!.entries.map(entry => entry.level);
    expect(landed).toEqual([...landed].sort((x, y) => x - y));
    // Pressed again: one further. It never comes back earlier.
    moves = moveLater(made, 'MGT 321', defaultSettings(), moves);
    made = planOf(a, curriculum, false, LATEST, defaultSettings(), moves)!;
    expect(where(made, 'MGT 321')).toBe('Fall 2028');
    // A move stays on its own entry: the second elective place moves, the first and third stay.
    const before = planOf(a, curriculum, false, LATEST, defaultSettings())!;
    const second = planOf(a, curriculum, false, LATEST, defaultSettings(), moveLater(before, 'elective:1', defaultSettings(), {}))!;
    expect([where(second, 'elective:0'), where(second, 'elective:1'), where(second, 'elective:2')]).toEqual(['Spring 2029', 'Fall 2029', 'Spring 2029']);
    expect(movedSentence(second, 'elective:1')).toBe('CIS elective, 2 of 3, moved to Fall 2029.');
    // From the last semester it opens a new one, and the final-semester course goes with the end.
    expect(shape(second).slice(-2)).toEqual(['Spring 2029 9: CIS 461, CIS elective, CIS elective', expect.stringMatching(/^Fall 2029 6: CIS elective, MGT 462$/)]);
    // Moving the final-semester course itself: alone, one term after the last.
    const finalMoved = planOf(a, curriculum, false, LATEST, defaultSettings(), moveLater(before, 'MGT 462', defaultSettings(), {}))!;
    expect(shape(finalMoved).slice(-2)).toEqual(['Spring 2029 12: CIS 461, CIS elective, CIS elective, CIS elective', 'Fall 2029 3: MGT 462']);
    // A move is the entry's earliest term, whatever the settings then are: kept for a summer, with summers switched off it is the Fall after.
    const withSummers = settings({ summers: true });
    const summerPlan = planOf(a, curriculum, false, LATEST, withSummers)!;
    const intoSummer = moveLater(summerPlan, 'ENG 209', withSummers, {});
    expect(intoSummer).toEqual({ 'ENG 209': term('Summer 2027') });
    expect(where(planOf(a, curriculum, false, LATEST, withSummers, intoSummer)!, 'ENG 209')).toBe('Summer 2027');
    expect(where(planOf(a, curriculum, false, LATEST, defaultSettings(), intoSummer)!, 'ENG 209')).toBe('Fall 2027');
    // However often it is pressed, the entry is still in the plan: nothing is ever dropped.
    let far: Moves = {};
    let farPlan = first;
    for (let n = 0; n < 60; n++) { far = moveLater(farPlan, 'ENG 209', defaultSettings(), far); farPlan = planOf(a, curriculum, false, LATEST, defaultSettings(), far)!; }
    expect(where(farPlan, 'ENG 209')).toBe('Spring 2057');
    expect(all(farPlan)).toHaveLength(27);
    // A key that is not in the plan changes nothing.
    expect(moveLater(first, 'ZZZ 999', defaultSettings(), {})).toEqual({});
  });

  it('says when it ends later than the pace estimate', () => {
    const last = (made: Plan): string => termName(made.semesters[made.semesters.length - 1]!.term);
    // A move that pushes the end out: said, with why.
    const before = planOf(a, curriculum, false, LATEST, defaultSettings())!;
    const moved = planOf(a, curriculum, false, LATEST, defaultSettings(), moveLater(before, 'MGT 462', defaultSettings(), {}))!;
    expect(moved.late).toEqual({ term: term('Fall 2029'), why: 'moved' });
    expect(planHtml(moved)).toMatch(/<\/ol>\s*<p class="plan-late">This draft ends in Fall 2029, later than the pace estimate above: you moved courses later\.<\/p>\s*<\/section>$/);
    // A move that changes nothing of the end: nothing is said.
    expect(planOf(a, curriculum, false, LATEST, defaultSettings(), moveLater(before, 'ENG 209', defaultSettings(), {}))!.late).toBeNull();
    expect(planHtml(before)).not.toContain('plan-late');
    // A move that is not the cause is not blamed: with at most 17 a term the plan ends later with or without it.
    const seventeen = settings({ fewest: 12, most: 17 });
    const movedWithin = planOf(a, curriculum, false, LATEST, seventeen, moveLater(planOf(a, curriculum, false, LATEST, seventeen)!, 'ENG 209', seventeen, {}))!;
    expect(movedWithin.late).toEqual({ term: term('Fall 2029'), why: 'split' });
    // Courses that cannot be split: 81 credits at up to 17 a term are five terms by the numbers, but 3-credit courses fill only 15.
    const tight = planOf(a, curriculum, false, LATEST, settings({ fewest: 12, most: 17 }))!;
    expect(paceOf(81, LATEST, settings({ fewest: 12, most: 17 }))).toMatchObject({ kind: 'on', terms: 5 });
    expect(terms(tight)).toEqual(['Spring 2027 15', 'Fall 2027 15', 'Spring 2028 15', 'Fall 2028 15', 'Spring 2029 15', 'Fall 2029 6']);
    expect(tight.late).toEqual({ term: term('Fall 2029'), why: 'split' });
    expect(decode(planHtml(tight))).toContain('This draft ends in Fall 2029, later than the pace estimate above: courses can’t be split across semesters.');
    // An entry that does not fit is passed over for the next one that does, and is first in the next semester.
    const entry = (key: string, credits: number, level: number): PlanEntry => ({ key, credits, level, course: { code: key, title: '' }, choice: null, nth: null, final: false });
    const mixed = [entry('AAA 101', 3, 100), entry('AAA 102', 3, 100), entry('BBB 201', 4, 200), entry('CCC 301', 1, 300), entry('CCC 302', 3, 300)];
    const range = settings({ fewest: 7, most: 7 });
    const pace = paceOf(14, LATEST, range);
    if (pace.kind !== 'on') throw new Error('not on pace');
    expect(shape(layOut(mixed, pace, range))).toEqual(['Spring 2027 7: AAA 101, AAA 102, CCC 301', 'Fall 2027 7: BBB 201, CCC 302']);
    expect(layOut(mixed, pace, range).late).toBeNull();
    // Three 4-credit courses at up to 7 a term: two terms by the numbers, three in fact.
    const fours = [entry('AAA 101', 4, 100), entry('AAA 102', 4, 100), entry('AAA 103', 4, 100)];
    const seven = settings({ fewest: 1, most: 7 });
    const two = paceOf(12, LATEST, seven);
    if (two.kind !== 'on') throw new Error('not on pace');
    expect(terms(layOut(fours, two, seven))).toEqual(['Spring 2027 4', 'Fall 2027 4', 'Spring 2028 4']);
    expect(layOut(fours, two, seven).late).toEqual({ term: term('Spring 2028'), why: 'split' });
    expect(last(layOut(fours, two, seven))).toBe('Spring 2028');
  });

  it('has no plan without an estimate', () => {
    // Nothing left to take: no plan, and no section.
    expect(planOf(having(everything('HIS 132', 'ENG 210')), curriculum, false, LATEST, defaultSettings())).toBeNull();
    expect(planHtml(null)).toBe('');
    // The latest term of the transcript cannot be read: no plan.
    expect(planOf(a, curriculum, false, null, defaultSettings())).toBeNull();
    // On the page: with rows to fix the note above the result names the draft plan; before the legacy answer there is no plan.
    const row = (prefix: string, number: string, grade = 'B') => ({ term: 'Fall 2026', transfer: false, prefix, number, description: 'A course', attempted: 3, earned: 3, grade, points: 0 });
    const toFix = openTranscript('x.pdf', { rows: [row('ENG', '131'), row('MGT', '321', 'B+')] }, curriculum);
    expect(decode(resultHtml(toFix, curriculum, false))).toContain('The credits left, the pace and the draft plan may change too.');
    expect(resultHtml(toFix, curriculum, false)).toContain('class="plan"');
    const legacy = openTranscript('x.pdf', { rows: [row('ENG', '131'), row('FLS', '161')] }, curriculum);
    expect(resultHtml(legacy, curriculum, null)).not.toMatch(/class="plan"|data-move|Draft plan/);
    expect(resultHtml(legacy, curriculum, true)).toContain('class="plan"');
    const noRows = openTranscript('x.pdf', { rows: ['not a row'] }, curriculum);
    expect(resultHtml(noRows, curriculum, false)).not.toMatch(/class="plan"|data-plan/);
  });

  it('holds for any transcript and settings', () => {
    const SEED = 20261121;
    let seed = SEED;
    const next = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T>(from: readonly T[]): T => from[Math.floor(next() * from.length)] as T;
    const whole = (from: number, to: number): number => from + Math.floor(next() * (to - from + 1));
    const everyCourse = [...new Set([...curriculum.blocks.flatMap(block => [...block.required, ...block.picks.flatMap(group => group.courses)]), ...curriculum.electives.named, ...curriculum.electives.legacyOnly].map(course => course.code))];
    const pool = [...everyCourse, 'MKT 410', 'CIS 499', 'ECO 301', 'ACT 350', 'CIS 304', 'BIO 230'];
    const marks = ['A', 'B', 'B', 'B', 'C', 'D', 'F', 'W', '-', '-'];
    const seen = { late: 0, split: 0, moved: 0, extra: 0, throughHeld: 0, finalAlone: 0, underFewest: 0, summers: 0, gaps: 0 };
    // (Many cases, so that each situation counted below comes up often enough whatever courses the curriculum file
    // lists: the cases are drawn from its list, and a course added to a pick changes which ones are drawn. F25.)
    for (let i = 0; i < 2000; i++) {
      const rows = Array.from({ length: Math.floor(next() * (i % 4 === 0 ? pool.length * 1.4 : 30)) }, () => `${pick(pool)}:${pick(marks)}`);
      const standings = having(rows);
      const legacy = next() < 0.5;
      const most = whole(1, 22);
      const given: PaceSettings = { most, fewest: whole(1, most), summers: next() < 0.35, target: next() < 0.5 ? null : { season: pick(['Spring', 'Fall'] as const), year: whole(2027, 2034) } };
      const label = `seed ${SEED}, case ${i}: ${rows.join(', ')} ${JSON.stringify(given)} legacy ${legacy}`;
      const checklist = checklistOf(standings, curriculum, legacy);
      const toTake = checklist.credits.left + checklist.extraLeft;
      // A few moves, each made on the plan as it then stands.
      let moves: Moves = {};
      let made = planOf(standings, curriculum, legacy, LATEST, given, moves);
      if (toTake === 0) { expect(made, label).toBeNull(); continue; }
      if (!made) throw new Error(`${label}: no plan`);
      const unmoved = made;
      for (let n = whole(0, 3); n > 0; n--) {
        moves = moveLater(made, pick(all(made)).key, given, moves);
        made = planOf(standings, curriculum, legacy, LATEST, given, moves)!;
      }
      const entries = all(made);
      // Exactly the credits still to take that pace uses.
      expect(entries.reduce((sum, entry) => sum + entry.credits, 0), label).toBe(toTake);
      // Every still-needed course of the checklist once; each open place once; nothing else.
      const needed = checklist.cards.flatMap(card => card.still.flatMap(item => ('open' in item ? [] : [item.code])));
      expect(entries.flatMap(entry => (entry.course ? [entry.course.code] : [])).sort(), label).toEqual([...needed].sort());
      const openPlaces = checklist.cards.flatMap(card => card.still.flatMap(item => ('open' in item ? [Number(item.text.split(' ')[0])] : []))).reduce((sum, n) => sum + n, 0);
      expect(entries.filter(entry => entry.choice !== null), label).toHaveLength(openPlaces + (checklist.sequence.kind === 'extra' ? 1 : 0));
      if (checklist.sequence.kind === 'extra') { seen.extra++; expect(entries.some(entry => entry.key === 'sequence'), label).toBe(true); }
      // A sequence the checklist says is still needed is always named by an entry: a pick, or the place its course frees.
      if (checklist.sequence.kind === 'open') {
        const naming = entries.filter(entry => checklist.sequenceThrough.some(courseCode => entry.choice?.includes(courseCode)));
        expect(naming.length, label).toBeGreaterThan(0);
        if (naming.some(entry => entry.key === 'sequence')) seen.throughHeld++;
      } else if (checklist.sequence.kind !== 'extra') expect(entries.some(entry => entry.key === 'sequence'), label).toBe(false);
      expect(new Set(entries.map(entry => entry.key)).size, label).toBe(entries.length);
      expect(entries.map(entry => entry.key).sort(), label).toEqual(all(unmoved).map(entry => entry.key).sort());
      // The semesters: terms in order by the Summers setting, each with an entry; no gap unless a move made one.
      const semesters = made.semesters;
      expect(when(semesters[0]!.term), label).toBeGreaterThanOrEqual(when(termAfter(LATEST, given.summers)));
      semesters.forEach((one, at) => {
        expect(one.entries.length, label).toBeGreaterThan(0);
        if (!given.summers) expect(one.term.season, label).not.toBe('Summer'); else if (one.term.season === 'Summer') seen.summers++;
        if (at > 0) {
          const previous = semesters[at - 1]!.term;
          expect(when(one.term), label).toBeGreaterThan(when(previous));
          if (Object.keys(moves).length === 0) expect(one.term, label).toEqual(termAfter(previous, given.summers));
          else if (when(one.term) !== when(termAfter(previous, given.summers))) seen.gaps++;
        }
        // Within a semester the levels do not go down (the final-semester course apart).
        const levels = one.entries.filter(entry => !entry.final).map(entry => entry.level);
        expect(levels, label).toEqual([...levels].sort((x, y) => x - y));
        // Over the most only for one course that is itself bigger than the most.
        expect(one.credits, label).toBe(one.entries.reduce((sum, entry) => sum + entry.credits, 0));
        if (one.credits > given.most) { expect(one.entries, label).toHaveLength(1); expect(one.entries[0]!.credits, label).toBeGreaterThan(given.most); }
        if (one.credits < given.fewest && at < semesters.length - 1) seen.underFewest++;
      });
      // Without moves: a semester under the fewest that is not the last means nothing later still fits; and no lower level follows a higher one unless it was passed over.
      if (Object.keys(moves).length === 0) {
        semesters.forEach((one, at) => {
          if (at === semesters.length - 1) return;
          const later = semesters.slice(at + 1).flatMap(other => other.entries).filter(entry => !entry.final);
          if (one.credits < given.fewest) for (const entry of later) expect(one.credits + entry.credits, label).toBeGreaterThan(given.most);
          const top = Math.max(0, ...one.entries.filter(entry => !entry.final).map(entry => entry.level));
          for (const entry of later) if (entry.level < top) expect(one.credits + entry.credits, `${label}: ${entry.key} passed over`).toBeGreaterThan(given.most);
        });
      }
      // The final-semester course is the last entry of the last semester.
      const finals = entries.filter(entry => entry.final);
      expect(finals.length, label).toBeLessThanOrEqual(1);
      if (finals.length === 1) {
        const lastSemester = semesters[semesters.length - 1]!;
        expect(lastSemester.entries[lastSemester.entries.length - 1], label).toBe(finals[0]);
        if (lastSemester.entries.length === 1 && semesters.length > 1) seen.finalAlone++;
      }
      // Each moved entry is at or after its term.
      for (const [key, earliest] of Object.entries(moves)) {
        const at = semesters.find(one => one.entries.some(entry => entry.key === key));
        if (at) { seen.moved++; expect(when(at.term), `${label}: ${key}`).toBeGreaterThanOrEqual(when(earliest)); }
      }
      // The plan ends where the pace answer implies or earlier, or else it says so, with why.
      const pace = paceOf(toTake, LATEST, given);
      if (pace.kind !== 'on' && pace.kind !== 'off') throw new Error(`${label}: no estimate`);
      const implied = pace.detail.kind === 'after' ? pace.terms + pace.detail.semesters : pace.detail.kind === 'before' ? pace.terms - pace.detail.semesters : pace.terms;
      let end = pace.start;
      for (let n = 1; n < implied; n++) end = termAfter(end, given.summers);
      const lastTerm = semesters[semesters.length - 1]!.term;
      if (when(lastTerm) > when(end)) {
        seen.late++;
        // The reason: the moves, only when the plan without them ends earlier.
        const unmovedLast = unmoved.semesters[unmoved.semesters.length - 1]!.term;
        const byMoves = when(unmovedLast) < when(lastTerm);
        if (!byMoves) seen.split++;
        expect(made.late, label).toEqual({ term: lastTerm, why: byMoves ? 'moved' : 'split' });
        expect(planHtml(made), label).toContain(`This draft ends in ${termName(lastTerm)}, later than the pace estimate above`);
      } else {
        expect(made.late, label).toBeNull();
        expect(planHtml(made), label).not.toContain('plan-late');
      }
    }
    for (const [what, times] of Object.entries(seen)) expect(times, what).toBeGreaterThan(3);
  });
});
