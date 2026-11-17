// F13: the degree checklist (docs/sprints/F13.md; docs/BRIEF.md §4 Flow B step 3 and §5;
// docs/design/DESIGN.md "Page 3"; the owner's answer of 2026-11-16 on the sequence, for
// Flow B). The rules and the page as text; clicking is in tests/left-page.test.ts. Every
// student here is made up.
import { describe, expect, it } from 'vitest';
// @ts-expect-error The approved mockups are plain JavaScript, with no type declarations.
import { left as approved } from '../mockups/data.js';
import sampleA from '../synthetic/transcripts/sample-a.json';
import sampleB from '../synthetic/transcripts/sample-b.json';
import { checklistOf, legacyChanges, legacyOnTranscript, overviewHtml, requirementsHtml, type Card, type Checklist, type StillItem } from '../src/checklist';
import { answersFor } from '../src/answers';
import { curriculum, findCourse } from '../src/curriculum';
import { entryFor } from '../src/entries';
import { emptyLeft, leftPage, resultHtml } from '../src/left';
import { placeCourses } from '../src/placement';
import { openTranscript, reviewedStandings } from '../src/review';
import { courseStandings, type CourseStanding, type TranscriptRow } from '../src/transcript';

const decode = (html: string): string => html
  .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ')
  .replace(/ ([,.;:)])/g, '$1');
/** A made-up row: "ENG 131" is passed with a B; "ENG 131:D" has that grade; ":-" is in progress; ":T" is transfer credit. */
const rowOf = (entry: string, i = 0): TranscriptRow => {
  const [code = '', mark = 'B'] = entry.split(':');
  if (mark === 'T') return { code, term: 'Transfer credit', credits: 3, grade: 'T', transfer: true };
  return { code, term: `Term ${i + 1}`, credits: 3, grade: mark === '-' ? null : mark, transfer: false };
};
const having = (rows: readonly string[]): CourseStanding[] => courseStandings(rows.map(rowOf), curriculum.grades);
const list = (rows: readonly string[], legacy = false): Checklist => checklistOf(having(rows), curriculum, legacy);
const reviewed = (answer: unknown): CourseStanding[] => reviewedStandings(openTranscript('made-up.pdf', answer, curriculum), curriculum.grades);
const cardOf = (checklist: Checklist, name: string): Card => {
  const found = checklist.cards.find(card => card.name === name);
  if (!found) throw new Error(`no requirement ${name}`);
  return found;
};
/** A list as short lines: "MGT 321", "MGT 321 (note)", or the text of an open place with its notes. */
const lines = (items: readonly StillItem[]): string[] => items.map(one => ('open' in one ? [one.text, ...one.notes].join(' | ') : one.note ? `${one.code} (${one.note})` : one.code));
const page = (rows: readonly string[], legacy = false): string => { const checklist = list(rows, legacy); return `${overviewHtml(checklist)}${requirementsHtml(checklist)}`; };

const STEP_5 = 'Still needed: HIS 132 or ENG 210 to complete a history or literature sequence.';
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

describe('the requirements', () => {
  it('gives every requirement one status', () => {
    for (const rows of [[], ['ENG 131'], ['ORI 100', 'MGT 321:-', 'FIN 201']]) {
      const checklist = list(rows);
      // One card for each block of the curriculum, in its order, and one for the electives.
      expect(checklist.cards.map(card => card.name)).toEqual([...curriculum.blocks.map(block => block.name), curriculum.electives.name]);
      expect(checklist.cards.map(card => card.needed)).toEqual([...curriculum.blocks.map(block => block.credits), curriculum.electives.credits]);
      for (const card of checklist.cards) expect(['Done', 'In progress', 'Still needed']).toContain(card.status);
    }
    expect(curriculum.blocks).toHaveLength(8);
    // On the page: the word and its own mark, never a color alone.
    const html = page(['ORI 100', 'MGT 321:-']);
    const rowsOf = html.split('<li class="req"').slice(1);
    expect(rowsOf).toHaveLength(9);
    const marked = rowsOf.map(row => row.match(/<span class="req-status"><svg class="icon mark (mark-[a-z]+)"[^>]*>[\s\S]*?<\/svg>([^<]+)<\/span>/)?.slice(1, 3));
    expect(marked[0]).toEqual(['mark-done', 'Done']);
    expect(marked[6]).toEqual(['mark-progress', 'In progress']);
    expect(marked[1]).toEqual(['mark-needed', 'Still needed']);
    for (const one of marked) expect(one).toBeDefined();
    // "Done" is the filled tick; it is never the outlined tick of a "Counts".
    expect(html).not.toContain('mark-counts');
    expect(rowsOf[0]).toContain('data-status="Done"');
  });

  it("matches the approved design's student", () => {
    const checklist = checklistOf(reviewed(sampleA), curriculum, false);
    // The numbers of the design.
    expect(checklist.credits).toEqual({ counted: approved.counted, inProgress: approved.inProgress, left: approved.remaining, total: approved.total });
    expect(checklist.credits).toEqual({ counted: 27, inProgress: 13, left: 81, total: 121 });
    expect(checklist.inProgressTerms).toEqual([approved.inProgressTerm]);
    // Each of the design's nine requirements: status, credits and lists.
    type Shown = { code?: string; title?: string; note?: string; open?: boolean; text?: string };
    const blocks = approved.blocks as { name: string; counted: number; needed: number; status: string; done?: Shown[]; progress?: Shown[]; still?: Shown[] }[];
    expect(blocks.map(block => block.name).sort()).toEqual(checklist.cards.map(card => card.name).sort());
    const wanted = (items: Shown[] = []): string[] => items.map(one => (one.open ? one.text! : one.note ? `${one.code} (${one.note})` : one.code!));
    for (const block of blocks) {
      const card = cardOf(checklist, block.name);
      expect([card.status, card.counted, card.needed], block.name).toEqual([block.status, block.counted, block.needed]);
      expect(lines(card.done), `${block.name}: done`).toEqual(wanted(block.done));
      expect(lines(card.progress), `${block.name}: in progress`).toEqual(wanted(block.progress));
      expect(lines(card.still), `${block.name}: still needed`).toEqual(wanted(block.still));
      // Where the design shows a title, it is the curriculum's.
      for (const one of [...(block.done ?? []), ...(block.progress ?? []), ...(block.still ?? [])]) {
        if (one.code && one.title) expect(findCourse(curriculum, one.code)[0]?.course.title, one.code).toBe(one.title);
      }
      // Titles are the curriculum's, also where the design shows none.
      for (const item of [...card.done, ...card.progress, ...card.still]) {
        if (!('open' in item)) expect(item.title, item.code).toBe(findCourse(curriculum, item.code)[0]?.course.title);
      }
    }
    expect(checklist.sequence).toEqual({ kind: 'open', text: approved.sequence });
    expect(checklist.unused).toEqual([]);
    expect(legacyChanges(reviewed(sampleA), curriculum)).toBe(false);
    // The page, in the design's words.
    const html = leftPage(curriculum, { ...emptyLeft(), transcript: openTranscript('sample-a.pdf', sampleA, curriculum), continued: true });
    const text = decode(html);
    for (const words of [approved.eyebrow, approved.heading, approved.pill, approved.remainingLabel, approved.reqEyebrow, approved.reqTitle, approved.reqNote, approved.show, approved.hide, approved.sequence, ...approved.reqTabs]) {
      expect(text, words).toContain(words);
    }
    expect(html).toMatch(/<span class="eyebrow">What I have left<\/span>\s*<h1 tabindex="-1">Your degree, in focus\.<\/h1>/);
    expect(html).toMatch(/<div class="donut" role="img" aria-label="81 credits left, 27 counted, 13 in progress, 121 total" style="--counted: 22\.314%; --counted-and-progress: 33\.058%">\s*<div><strong class="num">81<\/strong><span>credits left<\/span><\/div>/);
    expect(text).toContain('13 in progress · Fall 2026');
    expect(text).toContain('27 counted 81 left 121 total');
    // Each label of the bar starts where its part starts: in progress after the counted part, "left" after both.
    expect(html).toContain('<span class="credit-gap" style="flex-basis: 22.314%"></span><span class="bar-label is-progress">');
    expect(html).toContain('<span class="bar-label is-counted" style="min-width: 33.058%">');
    expect(html).toContain('<span class="item-note">Repeat; the earlier D doesn’t count.</span>');
  });

  it('does not call a block with a course in progress done', () => {
    // Every place filled, one of them by a course in progress: in progress, and not counted.
    expect(cardOf(list(['ORI 100:-']), 'Orientation')).toMatchObject({ status: 'In progress', counted: 0, needed: 1 });
    expect(cardOf(list(['ENG 131', 'ENG 132:-']), 'Composition')).toMatchObject({ status: 'In progress', counted: 3, needed: 6 });
    expect(cardOf(list(['ENG 131', 'ENG 132']), 'Composition')).toMatchObject({ status: 'Done', counted: 6, needed: 6 });
    expect(cardOf(list(['FIN 201', 'MKT 410', 'CIS 499:-']), 'CIS electives')).toMatchObject({ status: 'In progress', counted: 6, needed: 9 });
    expect(cardOf(list(['FIN 201', 'MKT 410', 'CIS 499']), 'CIS electives')).toMatchObject({ status: 'Done', counted: 9 });
    // Something done, nothing in progress, places open: still needed.
    expect(cardOf(list(['ENG 131']), 'Composition')).toMatchObject({ status: 'Still needed', counted: 3 });
    // With everything passed but one course in progress, exactly that block is not done.
    const all = list([...everything('HIS 132', 'ENG 210').filter(code => code !== 'MGT 462'), 'MGT 462:-']);
    expect(all.cards.filter(card => card.status !== 'Done').map(card => [card.name, card.status])).toEqual([['Business core', 'In progress']]);
    expect(lines(cardOf(all, 'Business core').progress)).toEqual(['MGT 462']);
    expect(all.credits).toEqual({ counted: 118, inProgress: 3, left: 0, total: 121 });
  });

  it('flags a course that must be repeated', () => {
    const still = (rows: string[], name: string): string[] => lines(cardOf(list(rows), name).still);
    // A required course below C: still needed, flagged with the grade that was read.
    expect(still(['MGT 321:D'], 'Business core')).toContain('MGT 321 (Must be repeated; the D doesn’t count.)');
    expect(still(['MGT 321:F'], 'Business core')).toContain('MGT 321 (Must be repeated; the F doesn’t count.)');
    expect(still(['MGT 321:F', 'MGT 321:D'], 'Business core')).toContain('MGT 321 (Must be repeated; the D doesn’t count.)');
    expect(cardOf(list(['MGT 321:D']), 'Business core')).toMatchObject({ status: 'Still needed', counted: 0 });
    expect(decode(page(['MGT 321:D']))).toContain('MGT 321 Principles of Management Must be repeated; the D doesn’t count.');
    // W and I don't count either, and are not flagged.
    expect(still(['MGT 321:W'], 'Business core')).toContain('MGT 321');
    expect(still(['MGT 321:I', 'MGT 422:W'], 'Business core').filter(line => line.includes('('))).toEqual([]);
    // Repeated and now running: in progress, with the design's note.
    const running = cardOf(list(['MGT 321:D', 'MGT 321:-']), 'Business core');
    expect(lines(running.progress)).toEqual(['MGT 321 (Repeat; the earlier D doesn’t count.)']);
    expect(running.status).toBe('In progress');
    // A course that also has a row still to fix is not flagged: that row may be the one that passed.
    const unchecked = lines(cardOf(checklistOf(having(['MGT 321:D', 'ENG 131:D', 'MKT 410:D', 'MGT 422:F']), curriculum, false, new Set(['MGT 321', 'ENG 131', 'MKT 410'])), 'Business core').still);
    expect(unchecked).toContain('MGT 321');
    expect(unchecked).toContain('MGT 422 (Must be repeated; the F doesn’t count.)');
    const quiet = checklistOf(having(['ENG 131:D', 'MKT 410:D']), curriculum, false, new Set(['ENG 131', 'MKT 410']));
    expect(JSON.stringify(quiet.cards)).not.toContain('doesn’t count');
    // A row to fix with no readable code could be any course: nothing is flagged.
    expect(JSON.stringify(checklistOf(having(['MGT 321:D', 'ENG 131:F', 'MKT 410:D']), curriculum, false, 'any').cards)).not.toContain('doesn’t count');
    // Repeated and passed: done, nothing flagged.
    expect(lines(cardOf(list(['MGT 321:D', 'MGT 321:A']), 'Business core').done)).toEqual(['MGT 321']);
    // A course of a pick: the pick stays open; the note keeps "must be repeated" and says another course can fill it.
    expect(still(['ENG 131:D'], 'Composition')).toEqual([
      '1 of ENG 131 / ENG 140 | ENG 131: the D doesn’t count. It must be repeated, or another course of this pick taken.', '1 of ENG 132 / ENG 141',
    ]);
    expect(still(['ENG 131:D', 'ENG 140'], 'Composition')).toEqual(['1 of ENG 132 / ENG 141']);
  });

  it('says where a failed elective went', () => {
    const electives = (rows: string[], legacy = false): string[] => lines(cardOf(list(rows, legacy), 'CIS electives').still);
    expect(electives(['MKT 410:D'])).toEqual([
      '3 courses: FIN 201, or any 300/400-level MGT, FIN, CIS, MKT, ACT or ECO course not already required | MKT 410: the D doesn’t count. It must be repeated, or another elective taken.',
    ]);
    expect(electives(['FIN 201:F', 'CIS 499'])).toEqual([
      '2 courses: FIN 201, or any 300/400-level MGT, FIN, CIS, MKT, ACT or ECO course not already required | FIN 201: the F doesn’t count. It must be repeated, or another elective taken.',
    ]);
    // It is in no other list.
    const failed = list(['MKT 410:D']);
    expect(failed.unused).toEqual([]);
    expect(JSON.stringify(failed.cards.filter(card => card.name !== 'CIS electives'))).not.toContain('MKT 410');
    // Repeated and passed, W, a course that never counts, a course outside the curriculum: no note.
    expect(electives(['MKT 410:D', 'MKT 410'])).toEqual(['2 courses: FIN 201, or any 300/400-level MGT, FIN, CIS, MKT, ACT or ECO course not already required']);
    expect(electives(['MKT 410:W', 'CIS 304:D', 'BIO 230:D', 'MGT 321:D'])).toEqual(['3 courses: FIN 201, or any 300/400-level MGT, FIN, CIS, MKT, ACT or ECO course not already required']);
    // A failed legacy-only course is not noted, whatever the legacy answer: it changes nothing.
    expect(electives(['FLS 161:D'], true)).toEqual(electives(['FLS 161:D'], false));
    expect(legacyChanges(having(['FLS 161:D']), curriculum)).toBe(false);
    // The line names what is still open: one place, and the named course only while it is not taken.
    expect(electives(['FIN 201', 'MKT 410'])).toEqual(['1 course: any 300/400-level MGT, FIN, CIS, MKT, ACT or ECO course not already required']);
    expect(electives(['FIN 201', 'MKT 410', 'CIS 499'])).toEqual([]);
    // The design's sentence, word for word.
    expect(electives([])[0]).toBe((approved.blocks as { name: string; still: { text: string }[] }[]).find(block => block.name === 'CIS electives')?.still[0]?.text);
  });

  it('opens what is not done', () => {
    const html = page(['ORI 100', 'ENG 131', 'MGT 321:-']);
    const cards = html.split('<li class="req"').slice(1).map(one => one.split('</li>\n      <li class="req"')[0]!);
    expect(cards.map(card => [card.match(/data-status="([^"]+)"/)?.[1], /<details open>/.test(card), /<details>/.test(card)])).toEqual([
      ['Done', false, true], ['Still needed', true, false], ['Still needed', true, false], ['Still needed', true, false], ['Still needed', true, false],
      ['Still needed', true, false], ['In progress', true, false], ['Still needed', true, false], ['Still needed', true, false],
    ]);
    for (const card of cards) {
      // A native control, so the keyboard opens and closes it; both labels are there.
      expect(card).toMatch(/<summary><span class="req-row">[\s\S]*<span class="req-show no-print"><span class="when-closed">Show courses<\/span> <span class="when-open">Hide courses<\/span>/);
      // The bar has one segment for each credit needed, the counted ones filled.
      const [counted, needed] = card.match(/<strong>(\d+)<\/strong> \/ (\d+) cr/)!.slice(1).map(Number);
      expect(card.match(/<span class="req-bar"[^>]*>([\s\S]*?)<\/span><\/span>|<span class="req-bar"[^>]*>((?:<span[^>]*><\/span>)*)<\/span>/)?.[0].match(/<span(?: class="is-counted")?><\/span>/g)).toHaveLength(needed!);
      expect(card.match(/class="is-counted"/g) ?? []).toHaveLength(counted!);
    }
    // The remaining courses of an open requirement are on the page without a click.
    expect(decode(cards[6]!)).toContain('In progress MGT 321 Principles of Management Still needed MGT 201 Business Orientation');
    // A done requirement lists what filled it, once opened.
    expect(decode(cards[0]!)).toContain('Done ORI 100');
    // The two filter buttons.
    expect(html).toMatch(/<div class="tabs no-print" role="group" aria-label="Requirement filter">\s*<button type="button" aria-pressed="true" data-reqs="all">All<\/button>\s*<button type="button" aria-pressed="false" data-reqs="not-done">Not done<\/button>/);
  });
});

describe('the sequence', () => {
  const sequenceOf = (rows: string[], legacy = false) => list(rows, legacy).sequence;

  it('says what the sequence still needs', () => {
    // A sequence course passed or in progress: nothing to say.
    for (const rows of [['HIS 132'], ['ENG 210:-'], ['HIS 131', 'HIS 132'], ['GEO 206', 'ENG 210'], ['HIS 132:T']]) expect(sequenceOf(rows), rows.join()).toEqual({ kind: 'none' });
    // Neither, and both picks open: the sentence of the feature's step 5, the design's.
    for (const rows of [[], ['HIS 131', 'ENG 209'], ['HIS 132:D', 'ENG 210:W']]) expect(sequenceOf(rows), rows.join()).toEqual({ kind: 'open', text: STEP_5 });
    expect(STEP_5).toBe(approved.sequence);
    // One pick held by another course: the course that can still go through its own pick.
    expect(sequenceOf(['GEO 206'])).toEqual({ kind: 'open', text: 'Still needed: ENG 210 to complete a literature sequence.' });
    expect(sequenceOf(['HIS 131', 'SOC 110:-'])).toEqual({ kind: 'open', text: 'Still needed: ENG 210 to complete a literature sequence.' });
    expect(sequenceOf(['HUM 101'])).toEqual({ kind: 'open', text: 'Still needed: HIS 132 to complete a history sequence.' });
    // Both picks held by other courses: needed for the sequence only, with extra credits (the owner's answer, for Flow B).
    for (const rows of [['GEO 206', 'HUM 101'], ['SOC 110:-', 'PHL 201'], ['HIS 131', 'ENG 209', 'ANT 113', 'CMS 200:-']]) {
      expect(sequenceOf(rows), rows.join()).toEqual({
        kind: 'extra', text: 'Needed for the history or literature sequence (3 extra credits): HIS 132 or ENG 210.', beside: 'Plus 3 extra credits for the history or literature sequence.',
      });
    }
    // On the page: the dashed box under the list, with the still-needed mark; the line beside the credits only for the extra case.
    expect(page([])).toMatch(/<\/ul>\s*<p class="sequence"><svg class="icon mark mark-needed"[^>]*>[\s\S]*?<\/svg><span>Still needed: <span class="code">HIS 132<\/span> or <span class="code">ENG 210<\/span> to complete a history or literature sequence\.<\/span><\/p>/);
    expect(page([])).not.toContain('credit-extra');
    expect(page(['HIS 132'])).not.toContain('class="sequence"');
    const extra = page(['GEO 206', 'HUM 101']);
    expect(decode(extra)).toContain('Needed for the history or literature sequence (3 extra credits): HIS 132 or ENG 210.');
    expect(extra).toMatch(/<\/div>\s*<p class="credit-extra">Plus 3 extra credits for the history or literature sequence\.<\/p>\s*<\/section>/);
    // For a legacy student PSY 251 can leave its pick for an elective place: the history
    // sequence can then still go through that pick, exactly as "Check my courses" answers.
    expect(sequenceOf(['PSY 251', 'HUM 101'], false).kind).toBe('extra');
    expect(sequenceOf(['PSY 251', 'HUM 101'], true)).toEqual({ kind: 'open', text: 'Still needed: HIS 132 to complete a history sequence.' });
    // PSY 251 holding its pick with the other pick open: the open one is named, the same for
    // every student, so nothing depends on the legacy answer (the owner: PSY 251 alone is not asked about).
    for (const legacy of [true, false]) expect(sequenceOf(['PSY 251'], legacy), String(legacy)).toEqual({ kind: 'open', text: 'Still needed: ENG 210 to complete a literature sequence.' });
    expect(JSON.stringify(list(['PSY 251'], true))).toBe(JSON.stringify(list(['PSY 251'], false)));
    for (const legacy of [true, false]) {
      const typed = answersFor([entryFor('HIS 132', curriculum)], curriculum, legacy, { standings: having(['PSY 251', 'HUM 101']), exact: true })[0];
      expect(typed?.kind, String(legacy)).toBe(legacy ? 'counts' : 'needed');
    }
    // With the elective places full it cannot move, and the pick stays held.
    expect(sequenceOf(['PSY 251', 'HUM 101', 'FIN 201', 'MKT 410', 'CIS 499'], true).kind).toBe('extra');
  });

  it('does not say a sequence course in progress does not count', () => {
    // HIS 132 is in progress while a passed course holds its pick: it is what completes the
    // sequence. It is said in the sequence box, and is not among the courses that count nothing.
    const rows = ['HIS 131', 'GEO 206', 'HIS 132:-'];
    const checklist = list(rows);
    expect(checklist.sequence).toEqual({
      kind: 'running', text: 'In progress: HIS 132 for the history sequence (3 extra credits). It fills the sequence requirement only.', beside: 'Plus 3 extra credits in progress for the history sequence.',
    });
    expect(checklist.unused).toEqual([]);
    expect(JSON.stringify(checklist.cards)).not.toContain('HIS 132');
    const html = page(rows);
    expect(html).toMatch(/<p class="sequence"><svg class="icon mark mark-progress"[^>]*>[\s\S]*?<\/svg><span>In progress: <span class="code">HIS 132<\/span> for the history sequence \(3 extra credits\)\. It fills the sequence requirement only\.<\/span><\/p>/);
    expect(html).toMatch(/<p class="credit-extra">Plus 3 extra credits in progress for the history sequence\.<\/p>/);
    expect(html).not.toContain('class="unused"');
    expect(decode(html)).not.toMatch(/HIS 132[^.]*Doesn’t count/);
    // The same for the other sequence.
    expect(list(['HUM 101', 'ENG 210:-']).sequence).toMatchObject({ kind: 'running', text: 'In progress: ENG 210 for the literature sequence (3 extra credits). It fills the sequence requirement only.' });
    // Everything else passed: every card is done and nothing is left, and the page still says what HIS 132 is for.
    const all = list([...everything('GEO 206', 'HUM 101'), 'HIS 132:-']);
    expect([all.credits.left, all.cards.every(card => card.status === 'Done'), all.sequence.kind, all.unused.length]).toEqual([0, true, 'running', 0]);
    // Another sequence already holds its pick: then the course in progress really fills nothing, and is listed.
    const settled = list(['GEO 206', 'ENG 210', 'HIS 132:-']);
    expect(settled.sequence).toEqual({ kind: 'none' });
    expect(settled.unused.map(one => [one.code, one.reason])).toEqual([['HIS 132', 'Doesn’t count — it fills the same requirement as GEO 206.']]);
    // Both sequence courses in progress with both picks held: one completes a sequence, the other is listed.
    const both = list(['GEO 206', 'HUM 101', 'HIS 132:-', 'ENG 210:-']);
    expect(both.sequence).toMatchObject({ kind: 'running', text: 'In progress: HIS 132 for the history sequence (3 extra credits). It fills the sequence requirement only.' });
    expect(both.unused.map(one => one.code)).toEqual(['ENG 210']);
    // With its pick open the course in progress simply holds it.
    expect([list(['HIS 132:-']).sequence.kind, lines(cardOf(list(['HIS 132:-']), 'Social sciences').progress)]).toEqual(['none', ['HIS 132']]);
  });

  it('keeps the sequence apart from the credits, with nothing left', () => {
    // Every credit done, with other courses in the two picks: the sequence is still open.
    const rows = everything('GEO 206', 'HUM 101');
    const checklist = list(rows);
    expect(checklist.credits).toEqual({ counted: 121, inProgress: 0, left: 0, total: 121 });
    expect(checklist.cards.every(card => card.status === 'Done')).toBe(true);
    expect(checklist.sequence.kind).toBe('extra');
    const html = page(rows);
    // The ring reads 0; the extra credits are said in the same card, directly under the bar; the box is shown.
    expect(html).toMatch(/<strong class="num">0<\/strong><span>credits left<\/span>/);
    expect(html).toMatch(/<span class="bar-label is-total"><strong class="num">121<\/strong> total<\/span>\s*<\/div>\s*<\/div>\s*<p class="credit-extra">Plus 3 extra credits for the history or literature sequence\.<\/p>\s*<\/section>/);
    expect(html).toMatch(/<p class="sequence">[\s\S]*Needed for the history or literature sequence \(3 extra credits\): /);
    // No word says the degree is done.
    const whole = decode(resultHtml(openTranscript('made-up.pdf', { rows: rows.map(code => { const [prefix, number] = code.split(' '); return { term: 'Fall 2025', transfer: false, prefix, number, description: 'A course', attempted: 3, earned: 3, grade: 'B', points: 9 }; }) }, curriculum), curriculum, false));
    expect(whole).toContain('Needed for the history or literature sequence (3 extra credits)');
    expect(whole).not.toMatch(/\b(complete[d]?|finished|congratulations|all done|nothing left|you(’|')re done)\b/i);
    // With a pick still open instead, step 5's kind of sentence is shown, and still nothing says done.
    const oneOpen = list(everything('GEO 206', 'ENG 210').filter(code => code !== 'ENG 210'));
    expect(oneOpen.sequence).toEqual({ kind: 'open', text: 'Still needed: ENG 210 to complete a literature sequence.' });
    // With a sequence course in a pick the sequence is done, and there is nothing to add.
    const done = list(everything('HIS 132', 'HUM 101'));
    expect([done.credits.left, done.sequence.kind]).toEqual([0, 'none']);
    expect(page(everything('HIS 132', 'HUM 101'))).not.toMatch(/credit-extra|class="sequence"/);
  });
});

describe('what does not count, and the legacy answer', () => {
  it('lists the courses that fill nothing', () => {
    const rows = ['BIO 230', 'CIS 304', 'ENG 131', 'ENG 140:-', 'FIN 201', 'MKT 410', 'CIS 499', 'ECO 301', 'FLS 161', 'XYZ 101:D'];
    const checklist = list(rows);
    expect(checklist.unused.map(one => [one.code, one.reason])).toEqual([
      ['BIO 230', 'Doesn’t count toward CIS — not in the CIS curriculum'],
      ['CIS 304', 'Doesn’t count toward CIS — CIS 304 isn’t in the current CIS curriculum.'],
      ['ENG 140', 'Doesn’t count — it fills the same requirement as ENG 131.'],
      ['ECO 301', 'Doesn’t count — your 3 CIS elective places are already filled by FIN 201, MKT 410 and CIS 499.'],
      ['FLS 161', 'Doesn’t count toward CIS. Legacy students only.'],
    ]);
    // Each once, and in no card.
    const inCards = checklist.cards.flatMap(card => [...card.done, ...card.progress].map(item => item.code));
    for (const one of checklist.unused) expect(inCards, one.code).not.toContain(one.code);
    // On the page: closed until asked for, with how many there are.
    const html = page(rows);
    expect(html).toMatch(/<details class="unused">\s*<summary><span>5 courses on your transcript are not counted toward CIS<\/span> <span class="req-show no-print">/);
    expect(html).not.toMatch(/<details class="unused" open/);
    expect(decode(html)).toContain('ENG 140 English Composition Honors I Doesn’t count — it fills the same requirement as ENG 131.');
    expect(page(['BIO 230'])).toContain('<summary><span>1 course on your transcript is not counted toward CIS</span>');
    // With none, the list is not drawn.
    expect(page(['ENG 131'])).not.toContain('class="unused"');
  });

  it('asks the legacy question only when it changes the result', () => {
    // The second made-up transcript has a legacy course passed: an elective for a legacy student only.
    const b = reviewed(sampleB);
    expect(legacyChanges(b, curriculum)).toBe(true);
    expect(legacyOnTranscript(b, curriculum)).toEqual(['FLS 161']);
    const yes = checklistOf(b, curriculum, true);
    const no = checklistOf(b, curriculum, false);
    expect(lines(cardOf(yes, 'CIS electives').done)).toEqual(['FLS 161', 'MKT 410']);
    expect([yes.credits.counted, yes.credits.left, cardOf(yes, 'CIS electives').counted]).toEqual([26, 89, 6]);
    expect(lines(cardOf(no, 'CIS electives').done)).toEqual(['MKT 410']);
    expect([no.credits.counted, no.credits.left, cardOf(no, 'CIS electives').counted]).toEqual([23, 92, 3]);
    expect(no.unused.map(one => one.code)).toEqual(['BIO 230', 'FLS 161']);
    expect(yes.unused.map(one => one.code)).toEqual(['BIO 230']);
    // Where the answer changes nothing, nothing is asked.
    // PSY 251 alone is an ordinary course of its pick (the owner's answer of 2026-11-16 for F08).
    for (const rows of [[], ['ENG 131', 'MGT 321'], ['PSY 251'], ['PSY 251', 'HIS 131', 'MGT 321:-'], ['PSY 251:D'], ['FLS 161:D'], ['FLS 161:W', 'MGT 220:F']]) expect(legacyChanges(having(rows), curriculum), rows.join()).toBe(false);
    // PSY 251 with another course for its pick; and PSY 251 with the other sequence pick held,
    // where only a legacy student can still complete a sequence without extra credits.
    for (const rows of [['FLS 161'], ['MGT 220:-'], ['MGT 203:T'], ['PSY 251', 'GEO 206'], ['PSY 251', 'HUM 101']]) expect(legacyChanges(having(rows), curriculum), rows.join()).toBe(true);
    // The page before the answer: the question and its reason, and nothing the answer could change.
    const transcript = openTranscript('sample-b.pdf', sampleB, curriculum);
    const asking = resultHtml(transcript, curriculum, null);
    expect(asking).toMatch(/<div class="legacy-ask" role="group" aria-label="Are you a legacy CIS student\?">\s*<p>Are you a legacy CIS student\?<\/p>\s*<div class="legacy-buttons">\s*<button type="button" class="btn secondary" data-legacy="yes">Yes<\/button>\s*<button type="button" class="btn secondary" data-legacy="no">No<\/button>\s*<\/div>\s*<p class="condition">Your transcript has FLS 161, which counts as an elective only for legacy students\.<\/p>/);
    expect(asking).not.toMatch(/class="req"|donut|credit-bar|class="sequence"|class="unused"|legacy-line|Done|In progress|Still needed|credits left/);
    expect(decode(asking)).not.toMatch(/\b(26|23|89|92)\b/);
    // After it: the line that shows the answer and lets the student change it.
    expect(resultHtml(transcript, curriculum, true)).toMatch(/<p class="legacy-line">Legacy CIS student: <strong>Yes<\/strong> <button type="button" class="text-link" data-legacy-change>Change<\/button><\/p>/);
    expect(resultHtml(transcript, curriculum, false)).toContain('<strong>No</strong>');
    // A transcript the answer cannot change shows neither.
    for (const legacy of [true, false, null]) expect(resultHtml(openTranscript('sample-a.pdf', sampleA, curriculum), curriculum, legacy)).not.toMatch(/legacy-ask|legacy-line/);
  });
});

describe('whatever the transcript', () => {
  it('adds up from the curriculum', () => {
    // A row's own credits change nothing: a withdrawn 3, a mis-keyed 30, a zero.
    const rows: TranscriptRow[] = [
      { code: 'ORI 100', term: 'Fall 2025', credits: 30, grade: 'A', transfer: false },
      { code: 'BIOL 127', term: 'Fall 2025', credits: 0, grade: 'B', transfer: false },
      { code: 'MGT 321', term: 'Fall 2025', credits: 3, grade: 'W', transfer: false },
      { code: 'ENG 131', term: 'Spr 2026', credits: 99, grade: null, transfer: false },
    ];
    const checklist = checklistOf(courseStandings(rows, curriculum.grades), curriculum, false);
    expect(checklist.credits).toEqual({ counted: 2, inProgress: 3, left: 116, total: 121 });
    expect(cardOf(checklist, 'Orientation').counted).toBe(1);
    expect(cardOf(checklist, 'Science & math').counted).toBe(1);
    expect(checklist.inProgressTerms).toEqual(['Spr 2026']);
    // Several terms with courses in progress are all named.
    const two = checklistOf(courseStandings([rows[3]!, { code: 'MGT 321', term: 'Sum 2026', credits: 3, grade: null, transfer: false }], curriculum.grades), curriculum, false);
    expect(decode(overviewHtml(two))).toContain('6 in progress · Spr 2026 and Sum 2026');
    // With nothing in progress the bar has no in-progress label.
    expect(overviewHtml(list(['ENG 131']))).not.toContain('is-progress');
  });

  it('shows printed text as text', () => {
    const term = '<img src=x onerror=alert(1)>';
    const html = overviewHtml(checklistOf(courseStandings([{ code: 'ENG 131', term, credits: 3, grade: null, transfer: false }], curriculum.grades), curriculum, false));
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
  });

  it('never shows more than the transcript has', () => {
    const SEED = 20261118;
    let seed = SEED;
    const next = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T>(from: readonly T[]): T => from[Math.floor(next() * from.length)] as T;
    const everyCourse = [...new Set([...curriculum.blocks.flatMap(block => [...block.required, ...block.picks.flatMap(group => group.courses)]), ...curriculum.electives.named, ...curriculum.electives.legacyOnly].map(course => course.code))];
    const pool = [...everyCourse, 'MKT 410', 'CIS 499', 'ECO 301', 'ACT 350', 'CIS 304', 'CIS 415', 'BIO 230', 'XYZ 101'];
    const marks = ['A', 'B', 'B', 'B', 'C', 'D', 'F', 'W', 'I', '-', '-', 'T'];
    const seen = { open: 0, oneOpen: 0, extra: 0, none: 0, running: 0, asked: 0, unused: 0, done: 0, flagged: 0 };
    for (let i = 0; i < 300; i++) {
      // A transcript of any size, up to nearly everything, with repeats.
      const size = Math.floor(next() * (i % 3 === 0 ? pool.length * 1.5 : 25));
      const rows = Array.from({ length: size }, () => `${pick(pool)}:${pick(marks)}`);
      const standings = having(rows);
      const held = new Map(standings.filter(one => one.standing === 'passed' || one.standing === 'in-progress').map(one => [one.code, one.standing]));
      const label = `seed ${SEED}, transcript ${i}: ${rows.join(', ')}`;
      for (const legacy of [true, false]) {
        const checklist = checklistOf(standings, curriculum, legacy);
        const placement = placeCourses(standings, curriculum, { legacy });
        const placed = [...placement.blocks.map(one => ({ name: one.block.name, total: one.block.credits, done: one.credits.done, required: one.required, picks: one.picks })),
        ];
        // A block is Done exactly when every place of it is done; In progress exactly when it is not Done and some place is in progress.
        placed.forEach(block => {
          const card = cardOf(checklist, block.name);
          const places = [...block.required.map(place => place.state), ...block.picks.flatMap(group => [...group.filled.map(one => one.state), ...Array.from({ length: group.open }, () => 'needed' as const)])];
          const allDone = places.every(state => state === 'done');
          expect(card.status, `${label}: ${block.name}`).toBe(allDone ? 'Done' : places.includes('in-progress') ? 'In progress' : 'Still needed');
          expect(card.counted, `${label}: ${block.name}`).toBe(block.done);
          if (card.status === 'Done') { expect(card.counted, label).toBe(block.total); seen.done++; }
          // A pick line is under Still needed only when a place is open, with the number open.
          const openLines = card.still.filter(item => 'open' in item).map(item => ('open' in item ? Number(item.text.split(' ')[0]) : 0));
          expect(openLines, `${label}: ${block.name}`).toEqual(block.picks.filter(group => group.open > 0).map(group => group.open));
        });
        const electives = cardOf(checklist, curriculum.electives.name);
        expect(electives.counted, label).toBe(placement.electives.credits.done);
        expect(electives.still.length, label).toBe(placement.electives.open > 0 ? 1 : 0);
        if (placement.electives.open > 0) expect((electives.still[0] as { text: string }).text.startsWith(`${placement.electives.open} course`), label).toBe(true);
        // The cards add up to the ring, and the ring to the degree.
        expect(checklist.cards.reduce((sum, card) => sum + card.counted, 0), label).toBe(checklist.credits.counted);
        expect(checklist.credits.counted + checklist.credits.inProgress + checklist.credits.left, label).toBe(checklist.credits.total);
        // No course is in two cards or twice in one; done means passed, in progress means in progress.
        const shown = checklist.cards.flatMap(card => [...card.done.map(item => [item.code, 'passed']), ...card.progress.map(item => [item.code, 'in-progress'])]);
        expect(new Set(shown.map(([code]) => code)).size, label).toBe(shown.length);
        for (const [code, standing] of shown) expect(held.get(code!), `${label}: ${code}`).toBe(standing);
        // Every still-needed course is one the transcript has neither passed nor in progress.
        for (const card of checklist.cards) for (const item of card.still) if (!('open' in item)) { expect(held.has(item.code), `${label}: ${item.code}`).toBe(false); if (item.note) seen.flagged++; }
        // The not-counted list is exactly the placement's left-over courses, without a
        // sequence course in progress that is what completes the sequence.
        const forSequence = checklist.sequence.kind === 'running' ? ['HIS 132', 'ENG 210'].filter(code => checklist.sequence.kind === 'running' && checklist.sequence.text.includes(code)) : [];
        if (forSequence.length > 0) { seen.running++; for (const code of forSequence) expect(held.get(code), label).toBe('in-progress'); }
        expect(checklist.unused.map(one => one.code), label).toEqual(placement.unplaced.map(one => one.code).filter(code => !forSequence.includes(code)));
        for (const one of checklist.unused) expect(held.has(one.code), label).toBe(true);
        for (const one of checklist.unused) expect(shown.map(([code]) => code), label).not.toContain(one.code);
        if (checklist.unused.length > 0) seen.unused++;
        // The sequence box, from an independent look at the two sequence courses and their picks.
        const groupOf = (code: string) => placement.blocks.flatMap(block => block.picks).find(group => group.options.some(option => option.code === code))!;
        const have = ['HIS 132', 'ENG 210'].filter(code => held.has(code));
        const placedOnes = placement.blocks.flatMap(block => block.picks.flatMap(group => group.filled.map(one => one.course.code)));
        // The picks the transcript leaves open. When none is, a legacy student's PSY 251 can
        // still give up its pick for an open elective place. (This restates that one rule of
        // the placement for today's curriculum; the rest of the check is independent of it.)
        const plainlyOpen = ['HIS 132', 'ENG 210'].filter(code => groupOf(code).open > 0);
        const open = plainlyOpen.length > 0 || !legacy ? plainlyOpen : ['HIS 132', 'ENG 210'].filter(code => groupOf(code).filled.some(one => one.course.code === 'PSY 251') && placement.electives.open > 0);
        if (have.length > 0) {
          // Nothing to say when a sequence course holds its pick; otherwise it is the one in progress.
          expect(checklist.sequence.kind, label).toBe(have.some(code => placedOnes.includes(code)) ? 'none' : 'running');
          seen.none++;
        }
        else if (open.length === 2) { expect(checklist.sequence, label).toEqual({ kind: 'open', text: STEP_5 }); seen.open++; }
        else if (open.length === 1) { expect(checklist.sequence, label).toMatchObject({ kind: 'open' }); expect((checklist.sequence as { text: string }).text, label).toMatch(new RegExp(`^Still needed: ${open[0]} to complete a (history|literature) sequence\\.$`)); seen.oneOpen++; }
        else { expect(checklist.sequence.kind, label).toBe('extra'); seen.extra++; }
      }
      // With no answer to a legacy question that matters, no status and no number is drawn.
      const raw = { rows: rows.map(entry => { const [code = '', mark = 'B'] = entry.split(':'); const [prefix, number] = code.split(' '); return { term: mark === 'T' ? 'Transfer Credit' : 'Fall 2025', transfer: mark === 'T', prefix, number, description: 'A course', attempted: mark === 'T' ? '' : 3, earned: 3, grade: mark === '-' ? '' : mark === 'T' ? 'T' : mark, points: 0 }; }) };
      const transcript = openTranscript('made-up.pdf', raw, curriculum);
      const asks = legacyChanges(reviewedStandings(transcript, curriculum.grades), curriculum);
      const before = resultHtml(transcript, curriculum, null);
      if (rows.length === 0) continue;
      if (asks) {
        seen.asked++;
        expect(before, label).toContain('data-legacy-first');
        expect(before, label).not.toMatch(/class="req"|donut|class="sequence"|class="unused"|Still needed|In progress|>Done</);
      } else {
        expect(before, label).not.toContain('data-legacy-first');
        expect(before, label).toBe(resultHtml(transcript, curriculum, true));
        expect(before, label).toBe(resultHtml(transcript, curriculum, false));
      }
    }
    // The cases above really happened.
    for (const [what, times] of Object.entries(seen)) expect(times, what).toBeGreaterThan(5);
  });
});
