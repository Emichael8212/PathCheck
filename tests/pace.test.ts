// F14: pace on "See what I have left" (docs/sprints/F14.md; docs/BRIEF.md §4 Flow B step 4;
// docs/design/DESIGN.md "Page 3"; the owner's rule of 2026-11-16 for the term that comes
// next, and "never derive the term from today's date"). The rules and the page as text;
// clicking is in tests/left-page.test.ts. Every student here is made up.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error The approved mockups are plain JavaScript, with no type declarations.
import { left as approved } from '../mockups/data.js';
import sampleA from '../synthetic/transcripts/sample-a.json';
import sampleB from '../synthetic/transcripts/sample-b.json';
import { curriculum } from '../src/curriculum';
import { emptyLeft, leftPage, overviewOf, resultHtml } from '../src/left';
import {
  defaultSettings, latestTermOf, paceAnswerHtml, paceControlsHtml, paceHeadline, paceOf, paceSentence, readTerm, stepRange, termAfter, termName,
  type Pace, type PaceSettings, type Term,
} from '../src/pace';
import { openTranscript, reviewedStandings, type Transcript } from '../src/review';
import { demoPace, demoStudent, startPage } from '../src/start';
import { programs } from '../src/curriculum';

const CAVEAT = 'Credits only — course order may add semesters.';
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
const settings = (over: Partial<PaceSettings> = {}): PaceSettings => ({ ...defaultSettings(), ...over });
/** The answer as "<headline> | <detail>". */
const answer = (credits: number, latest: string, over: Partial<PaceSettings> = {}): string => {
  const pace = paceOf(credits, readTerm(latest), settings(over));
  return decode(paceAnswerHtml(pace)).replace(/^ Looking ahead /, '').replace(` ${CAVEAT} `, '').trim();
};
type Row = Record<string, unknown>;
/** A made-up reader's row: "MGT 321" passed in Fall 2025; "MGT 321:-" in progress; "@Spr 2026" sets its term; ":T" is transfer credit. */
const rowOf = (entry: string): Row => {
  const [course = '', when = 'Fall 2025'] = entry.split('@');
  const [code = '', mark = 'B'] = course.split(':');
  const [prefix, number] = code.split(' ');
  const transfer = mark === 'T';
  return { term: transfer ? 'Transfer Credit' : when, transfer, prefix, number, description: 'A course', attempted: transfer ? '' : 3, earned: 3, grade: mark === '-' ? '' : mark, points: 0 };
};
const transcriptOf = (...entries: string[]): Transcript => openTranscript('made-up.pdf', { rows: entries.map(rowOf) }, curriculum);
const latestOf = (...entries: string[]): string => { const latest = latestTermOf(reviewedStandings(transcriptOf(...entries), curriculum.grades)); return latest ? termName(latest) : 'unreadable'; };
const overview = (transcript: Transcript, over: Partial<PaceSettings> = {}, legacy = false): string => decode(overviewOf(transcript, curriculum, legacy, settings(over)).html);
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

afterEach(() => { vi.useRealTimers(); });

describe('the answer', () => {
  it('draws the answer and the four controls', () => {
    const pace = paceOf(81, readTerm('Fall 2026'), settings());
    const beside = paceAnswerHtml(pace);
    expect(beside).toMatch(/^<span class="eyebrow">Looking ahead<\/span>\s*<h2>On pace for Spring 2029<\/h2>\s*<p class="pace-detail">about 16 credits a term<\/p>\s*<p class="caveat">Credits only — course order may add semesters\.<\/p>$/);
    const under = paceControlsHtml(pace, settings());
    expect(under).toMatch(/^<div class="pace">\s*<span class="eyebrow">Make the estimate yours<\/span>\s*<fieldset class="pace-grid">\s*<legend class="sr-only">Adjust your pace<\/legend>/);
    // The target: a labelled list.
    expect(under).toMatch(/<label for="target">Target semester<\/label>\s*<select id="target" data-pace-target>/);
    // The two ends of the range: a labelled group each, with "−" and "+" that say what they do.
    for (const [name, label, value] of [['fewest', 'Fewest credits per term', 12], ['most', 'Most credits per term', 18]] as const) {
      expect(under).toContain(`<div class="field" data-stepper="${name}">`);
      expect(under).toContain(`<span id="${name}-label">${label}</span>`);
      expect(under).toContain(`<div class="stepper" role="group" aria-labelledby="${name}-label" aria-describedby="${name}-note">`);
      expect(under).toContain(`<button type="button" aria-label="${label}: one fewer" data-delta="-1">−</button>`);
      expect(under).toContain(`<button type="button" aria-label="${label}: one more" data-delta="1">+</button>`);
      expect(under).toMatch(new RegExp(`<output class="num"><span data-value>${value}</span> <span data-unit>credits</span></output>[\\s\\S]*?<p class="field-note" id="${name}-note"></p>`));
    }
    // Summers: a switch, off.
    expect(under).toMatch(/<span id="summers-label">Summers<\/span>\s*<button type="button" class="switch" role="switch" aria-checked="false" aria-labelledby="summers-label" data-pace-summers>[\s\S]*<span class="switch-value">Off<\/span>/);
    expect(paceControlsHtml(pace, settings({ summers: true }))).toMatch(/aria-checked="true"[\s\S]*<span class="switch-value">On<\/span>/);
    // No field in which anything can be typed.
    expect(under).not.toMatch(/<input|<textarea|contenteditable/);
  });

  it("matches the approved design's student", () => {
    const transcript = openTranscript('sample-a.pdf', sampleA, curriculum);
    const standings = reviewedStandings(transcript, curriculum.grades);
    expect(termName(latestTermOf(standings)!)).toBe(approved.inProgressTerm);
    const pace = paceOf(approved.remaining, latestTermOf(standings), defaultSettings());
    // The design's answer, its detail, and its list of targets with the same one chosen.
    expect(paceHeadline(pace)).toBe(approved.pace);
    expect(decode(paceAnswerHtml(pace)).trim()).toBe(`Looking ahead ${approved.pace} ${approved.paceDetail} ${approved.caveat}`);
    const k = approved.controls;
    expect(pace.kind === 'on' ? pace.options.map(termName) : []).toEqual(k.target.options);
    expect(pace.kind === 'on' ? termName(pace.target) : '').toBe(k.target.value);
    const controls = paceControlsHtml(pace, defaultSettings());
    expect(controls.match(/<option[^>]*>([^<]+)<\/option>/g)?.map(one => decode(one).trim())).toEqual(k.target.options);
    expect(controls).toContain(`<option value="${k.target.value}" selected>`);
    for (const words of [k.eyebrow, k.legend, k.target.label, k.fewest.label, k.most.label, k.summers.label, k.summers.value]) expect(decode(controls), words).toContain(words);
    expect([defaultSettings().fewest, defaultSettings().most, defaultSettings().summers]).toEqual([k.fewest.value, k.most.value, false]);
    // The two notes of the design, word for word, when they apply.
    expect(decode(paceControlsHtml(pace, settings({ fewest: 11 })))).toContain(k.fewest.note);
    expect(decode(paceControlsHtml(pace, settings({ most: 19 })))).toContain(k.most.note);
    // On the page: beside the ring, and the controls under the bar, in the same card.
    const page = leftPage(curriculum, { ...emptyLeft(), transcript, continued: true });
    expect(page).toMatch(/<div data-pace>\s*<span class="eyebrow">Looking ahead<\/span>\s*<h2>On pace for Spring 2029<\/h2>/);
    expect(page).toMatch(/<section class="overview"[\s\S]*<div class="credit">[\s\S]*<div class="pace">[\s\S]*<\/fieldset>\s*<\/div>\s*<p class="print-only pace-settings" data-pace-settings>Target semester: Spring 2029\. Fewest credits per term: 12 credits\. Most credits per term: 18 credits\. Summers: Off\.<\/p>\s*<\/section>/);
    expect(page.match(/<h2>/g)?.length).toBe(1);
  });

  it('counts courses in progress as passed', () => {
    // Courses in progress that fill a place are not among the credits still to take.
    const done = transcriptOf('ENG 131', 'MGT 321');
    const running = transcriptOf('ENG 131', 'MGT 321:-');
    const failed = transcriptOf('ENG 131', 'MGT 321:D');
    const credits = (transcript: Transcript): number => Number(/(\d+) left/.exec(overview(transcript))?.[1]);
    expect([credits(done), credits(running), credits(failed)]).toEqual([115, 115, 118]);
    // 115 credits after Fall 2025: seven terms at 18 a term, so Spring 2029.
    expect(overview(done)).toContain('On pace for Spring 2029 about 16 credits a term');
    expect(overview(running)).toContain('On pace for Spring 2029 about 16 credits a term');
    // A course that was failed is still to take: 118 credits, the same seven terms, more credits in each.
    expect(overview(failed)).toContain('On pace for Spring 2029 about 17 credits a term');
    // A course in progress that fills nothing adds nothing, and takes nothing off.
    expect(credits(transcriptOf('ENG 131', 'MGT 321', 'BIO 230:-'))).toBe(115);
    expect(overview(transcriptOf('ENG 131', 'MGT 321', 'BIO 230:-'))).toContain('On pace for Spring 2029 about 16 credits a term');
  });

  it('never answers without the caveat', () => {
    for (const credits of [1, 12, 81, 121]) {
      for (const over of [{}, { target: term('Spring 2027') }, { target: term('Fall 2040') }, { most: 3 }, { summers: true }]) {
        const html = paceAnswerHtml(paceOf(credits, readTerm('Fall 2026'), settings(over)));
        expect(html, `${credits} ${JSON.stringify(over)}`).toMatch(/<p class="pace-detail">[^<]+<\/p>\s*<p class="caveat">Credits only — course order may add semesters\.<\/p>$/);
        expect(html).toMatch(/<h2>(On pace|Not on pace) for [A-Z][a-z]+ \d{4}<\/h2>/);
      }
    }
    // In the same card as the credits, for the first made-up transcript and for the second (once the legacy answer is given).
    expect(overview(openTranscript('a.pdf', sampleA, curriculum))).toContain(CAVEAT);
    expect(decode(resultHtml(openTranscript('b.pdf', sampleB, curriculum), curriculum, true))).toContain(CAVEAT);
  });

  it('answers for each target', () => {
    // 81 credits after Fall 2026: five terms at 18 a term, so Spring 2029 at the earliest.
    expect(answer(81, 'Fall 2026')).toBe('On pace for Spring 2029 about 16 credits a term');
    // Earlier than can be reached: where the student finishes at the most, and how far after.
    expect(answer(81, 'Fall 2026', { target: term('Fall 2028') })).toBe('Not on pace for Fall 2028 At 18 credits a term you finish Spring 2029, one semester after your target.');
    expect(answer(81, 'Fall 2026', { target: term('Spring 2028') })).toBe('Not on pace for Spring 2028 At 18 credits a term you finish Spring 2029, 2 semesters after your target.');
    expect(answer(81, 'Fall 2026', { target: term('Spring 2027') })).toBe('Not on pace for Spring 2027 At 18 credits a term you finish Spring 2029, 4 semesters after your target.');
    // Later: on pace, with fewer credits a term.
    expect(answer(81, 'Fall 2026', { target: term('Fall 2029') })).toBe('On pace for Fall 2029 about 14 credits a term');
    expect(answer(81, 'Fall 2026', { target: term('Spring 2030') })).toBe('On pace for Spring 2030 about 12 credits a term');
    // So late that even the fewest credits a term finish earlier: said so.
    expect(answer(81, 'Fall 2026', { target: term('Spring 2031') })).toBe('On pace for Spring 2031 At 12 credits a term you finish Spring 2030, 2 semesters before your target.');
    expect(answer(81, 'Fall 2026', { target: term('Fall 2030') })).toBe('On pace for Fall 2030 At 12 credits a term you finish Spring 2030, one semester before your target.');
    // Few credits left: one term, whatever the fewest says.
    expect(answer(3, 'Fall 2026')).toBe('On pace for Spring 2027 about 3 credits a term');
    expect(answer(1, 'Spr 2026')).toBe('On pace for Fall 2026 about 1 credit a term');
    // The sentence read out when a control changes the answer.
    expect(paceSentence(paceOf(81, readTerm('Fall 2026'), settings()))).toBe('On pace for Spring 2029: about 16 credits a term');
    expect(paceSentence(paceOf(81, readTerm('Fall 2026'), settings({ target: term('Fall 2028') })))).toBe('Not on pace for Fall 2028. At 18 credits a term you finish Spring 2029, one semester after your target.');
    // The list: the term before the default, the default, the three after; and the student's own choice.
    const options = (over: Partial<PaceSettings> = {}): string[] => { const pace = paceOf(81, readTerm('Fall 2026'), settings(over)); return pace.kind === 'on' || pace.kind === 'off' ? pace.options.map(termName) : []; };
    expect(options()).toEqual(['Fall 2028', 'Spring 2029', 'Fall 2029', 'Spring 2030', 'Fall 2030']);
    expect(options({ target: term('Spring 2027') })).toEqual(['Spring 2027', 'Fall 2028', 'Spring 2029', 'Fall 2029', 'Spring 2030', 'Fall 2030']);
    expect(options({ target: term('Fall 2033') })).toEqual(['Fall 2028', 'Spring 2029', 'Fall 2029', 'Spring 2030', 'Fall 2030', 'Fall 2033']);
    // With one term to go there is no term before the default.
    expect(paceOf(3, readTerm('Fall 2026'), settings())).toMatchObject({ options: ['Spring 2027', 'Fall 2027', 'Spring 2028', 'Fall 2028'].map(term) });
    // A target before the first term ahead becomes that term.
    expect(answer(3, 'Fall 2026', { target: term('Fall 2020') })).toBe('On pace for Spring 2027 about 3 credits a term');
  });

  it('moves the two ends together', () => {
    // One step at a time; the default target and the answer follow the most.
    expect(stepRange(settings(), 'most', 1)).toMatchObject({ fewest: 12, most: 19 });
    expect(stepRange(settings(), 'fewest', -1)).toMatchObject({ fewest: 11, most: 18 });
    expect(answer(81, 'Fall 2026', { most: 21 })).toBe('On pace for Fall 2028 about 20 credits a term');
    expect(answer(81, 'Fall 2026', { most: 16 })).toBe('On pace for Fall 2029 about 14 credits a term');
    expect(answer(81, 'Fall 2026', { most: 16, target: term('Spring 2029') })).toBe('Not on pace for Spring 2029 At 16 credits a term you finish Fall 2029, one semester after your target.');
    // The ends never cross: pushing one past the other takes it along.
    let range = settings({ fewest: 12, most: 12 });
    range = stepRange(range, 'fewest', 1);
    expect([range.fewest, range.most]).toEqual([13, 13]);
    range = stepRange(stepRange(range, 'most', -1), 'most', -1);
    expect([range.fewest, range.most]).toEqual([11, 11]);
    // Neither goes below 1, where "−" is switched off; there is no upper limit.
    let low = settings({ fewest: 2, most: 2 });
    for (let i = 0; i < 5; i++) low = stepRange(low, 'most', -1);
    expect([low.fewest, low.most]).toEqual([1, 1]);
    const drawn = paceControlsHtml(paceOf(81, readTerm('Fall 2026'), low), low);
    expect(drawn.match(/data-delta="-1" disabled/g)).toHaveLength(2);
    expect(drawn).toContain('<span data-value>1</span> <span data-unit>credit</span>');
    expect(drawn).not.toMatch(/data-delta="1" disabled/);
    expect(stepRange(settings({ most: 60 }), 'most', 1).most).toBe(61);
    // The notes: below 12 and over 18, each under its own control; none at 12 and at 18.
    const notes = (over: Partial<PaceSettings>): (string | undefined)[] => {
      const html = paceControlsHtml(paceOf(81, readTerm('Fall 2026'), settings(over)), settings(over));
      return ['fewest', 'most'].map(name => new RegExp(`<p class="field-note" id="${name}-note">([^<]*)</p>`).exec(html)?.[1]);
    };
    expect(notes({})).toEqual(['', '']);
    expect(notes({ fewest: 11 })).toEqual(['Below 12 credits: below full-time; may affect scholarships.', '']);
    expect(notes({ most: 19 })).toEqual(['', 'Over 18 credits: may cost extra.']);
    expect(notes({ fewest: 9, most: 9 })).toEqual(['Below 12 credits: below full-time; may affect scholarships.', 'Below 12 credits: below full-time; may affect scholarships.']);
    expect(notes({ fewest: 20, most: 20 })).toEqual(['Over 18 credits: may cost extra.', 'Over 18 credits: may cost extra.']);
    // The target does not change the settings it was not asked to change.
    expect(stepRange(settings({ target: term('Fall 2030'), summers: true }), 'most', 1)).toMatchObject({ target: term('Fall 2030'), summers: true });
  });

  it('counts summers only when asked', () => {
    // Off: Spring, then Fall. On: the summer between them.
    expect(termName(termAfter(term('Fall 2026'), false))).toBe('Spring 2027');
    expect(termName(termAfter(term('Spring 2027'), false))).toBe('Fall 2027');
    expect(termName(termAfter(term('Spring 2027'), true))).toBe('Summer 2027');
    expect(termName(termAfter(term('Summer 2027'), true))).toBe('Fall 2027');
    expect(termName(termAfter(term('Summer 2027'), false))).toBe('Fall 2027');
    // 81 credits: five terms either way, but with summers the fifth comes sooner.
    expect(answer(81, 'Fall 2026', { summers: true })).toBe('On pace for Summer 2028 about 16 credits a term');
    const on = paceOf(81, readTerm('Fall 2026'), settings({ summers: true }));
    expect(on.kind === 'on' ? on.options.map(termName) : []).toEqual(['Spring 2028', 'Summer 2028', 'Fall 2028', 'Spring 2029', 'Summer 2029']);
    // The same target is easier to reach with summers.
    expect(answer(81, 'Fall 2026', { target: term('Fall 2028') })).toContain('Not on pace');
    expect(answer(81, 'Fall 2026', { target: term('Fall 2028'), summers: true })).toBe('On pace for Fall 2028 about 14 credits a term');
    // A summer can be the target while summers count; switched off, it becomes the Fall after it.
    expect(answer(81, 'Fall 2026', { target: term('Summer 2029'), summers: true })).toBe('On pace for Summer 2029 At 12 credits a term you finish Spring 2029, one semester before your target.');
    expect(answer(81, 'Fall 2026', { target: term('Summer 2029') })).toBe('On pace for Fall 2029 about 14 credits a term');
    const off = paceOf(81, readTerm('Fall 2026'), settings({ target: term('Summer 2029') }));
    expect(off.kind === 'on' ? off.options.every(one => one.season !== 'Summer') : false).toBe(true);
  });
});

describe('the starting term', () => {
  it('starts after the latest term of the transcript', () => {
    // Rows in progress decide: the latest term that has one.
    expect(latestOf('ENG 131@Fall 2025', 'MGT 321:-@Fall 2026', 'ENG 132@Spr 2026')).toBe('Fall 2026');
    expect(latestOf('ENG 131:-@Spr 2026', 'MGT 321:-@Fall 2025')).toBe('Spring 2026');
    // A graded row in a later term does not move it.
    expect(latestOf('MGT 321:-@Fall 2026', 'ENG 131@Spr 2027')).toBe('Fall 2026');
    // With none in progress: the latest graded term, whatever the grade.
    expect(latestOf('ENG 131@Fall 2025', 'ENG 132@Spr 2026', 'MGT 321:W@Fall 2024')).toBe('Spring 2026');
    expect(latestOf('ENG 131:F@Fall 2026', 'ENG 132@Spr 2026')).toBe('Fall 2026');
    // The transfer section is not a term, and is not looked at.
    expect(latestOf('ENG 131:T', 'MGT 321@Fall 2025')).toBe('Fall 2025');
    expect(latestOf('ENG 131:T', 'MAT 137:T')).toBe('unreadable');
    // The first term ahead: the next Fall or Spring; a summer goes to Fall, also with summers on.
    const first = (latest: string, summers = false): string => { const pace = paceOf(3, readTerm(latest), settings({ summers })); return pace.kind === 'on' ? termName(pace.start) : pace.kind; };
    expect([first('Fall 2026'), first('Spr 2026'), first('Sum 2026'), first('Sum 2026', true), first('Spr 2026', true), first('Fall 2026', true)])
      .toEqual(['Spring 2027', 'Fall 2026', 'Fall 2026', 'Fall 2026', 'Summer 2026', 'Spring 2027']);
    // The made-up transcripts: Fall 2026 and Fall 2025 in progress.
    expect(termName(latestTermOf(reviewedStandings(openTranscript('a.pdf', sampleA, curriculum), curriculum.grades))!)).toBe('Fall 2026');
    expect(termName(latestTermOf(reviewedStandings(openTranscript('b.pdf', sampleB, curriculum), curriculum.grades))!)).toBe('Fall 2025');
    expect(overview(openTranscript('b.pdf', sampleB, curriculum), {}, true)).toContain('On pace for Spring 2028 about 18 credits a term');
  });

  it('reads a term as printed or typed', () => {
    const read = (text: string): string => { const found = readTerm(text); return found ? termName(found) : 'no'; };
    expect(['Fall 2026', 'Spr 2026', 'Spring 2026', 'Sum 2026', 'Summer 2026'].map(read)).toEqual(['Fall 2026', 'Spring 2026', 'Spring 2026', 'Summer 2026', 'Summer 2026']);
    // Letter case and extra spaces do not matter: a term can be typed in the review.
    expect(['fall 2026', ' Spr  2026 ', 'SPRING 2026', 'summer\t2026'].map(read)).toEqual(['Fall 2026', 'Spring 2026', 'Spring 2026', 'Summer 2026']);
    // Anything else is not a term.
    expect(['', 'Fall', '2026', 'Fall 26', 'Fall 20266', 'Winter 2026', 'Transfer Credit', 'Fall2026', 'Autumn 2026', 'Fall 2026 (cont.)', 'Springtime 2026'].map(read)).toEqual(Array(11).fill('no'));
    // An unreadable term among the rows that decide: no estimate, and the page says so, with no controls.
    const unreadable = transcriptOf('ENG 131@Fall 2025', 'MGT 321:-@Winter 2026');
    expect(latestTermOf(reviewedStandings(unreadable, curriculum.grades))).toBeNull();
    const html = overviewOf(unreadable, curriculum, false, settings()).html;
    expect(decode(html)).toContain('Looking ahead Pace can’t be estimated: the latest term on your transcript could not be read.');
    expect(html).not.toMatch(/class="pace"|data-pace-target|data-stepper|caveat|On pace/);
    // With no row in progress, any unreadable graded term blocks it: it might be the latest.
    expect(latestOf('ENG 131@Winter 2024', 'MGT 321@Fall 2025')).toBe('unreadable');
    // With rows in progress, an unreadable term on a graded row changes nothing.
    expect(latestOf('ENG 131@Winter 2024', 'MGT 321:-@Fall 2025')).toBe('Fall 2025');
    expect(latestOf('ENG 131@fall 2025', 'MGT 321:-@ Spr  2026 ')).toBe('Spring 2026');
  });

  it("never looks at today's date", () => {
    const outputs = [new Date('2020-01-15T12:00:00Z'), new Date('2035-09-01T12:00:00Z')].map(now => {
      vi.useFakeTimers({ now });
      const transcript = openTranscript('a.pdf', sampleA, curriculum);
      return [
        overviewOf(transcript, curriculum, false, settings()).html,
        overviewOf(transcript, curriculum, false, settings({ summers: true, most: 15, target: term('Fall 2030') })).html,
        resultHtml(openTranscript('b.pdf', sampleB, curriculum), curriculum, true),
        demoPace(curriculum),
        JSON.stringify(paceOf(40, readTerm('Sum 2031'), settings())),
      ];
    });
    expect(outputs[0]).toEqual(outputs[1]);
    expect(outputs[0]![0]).toContain('On pace for Spring 2029');
  });
});

describe('what is still to take', () => {
  it('counts the extra credits of the sequence', () => {
    // Both sequence picks are held by other courses and no sequence is on its way: 3 extra credits are still to take.
    const held = transcriptOf(...everything('GEO 206', 'HUM 101').filter(code => code !== 'MGT 462'));
    expect(overview(held)).toContain('3 left');
    // 3 left of the degree and 3 extra: 6 credits to take.
    expect(overview(held)).toContain('On pace for Spring 2026 about 6 credits a term');
    expect(overview(held, { most: 3 })).toContain('On pace for Fall 2026 about 3 credits a term');
    // With everything else done the answer is about those 3 credits, never "nothing left".
    const onlyExtra = transcriptOf(...everything('GEO 206', 'HUM 101'));
    expect(overview(onlyExtra)).toContain('0 credits left');
    expect(overview(onlyExtra)).toContain('On pace for Spring 2026 about 3 credits a term');
    expect(overview(onlyExtra)).not.toContain('No credits left to plan');
    expect(overview(onlyExtra)).toContain('Plus 3 extra credits for the history or literature sequence.');
    // A pick still open: the sequence course is among the credits left already; nothing is added.
    expect(overview(transcriptOf(...everything('GEO 206', 'ENG 210').filter(code => code !== 'ENG 210')))).toContain('On pace for Spring 2026 about 3 credits a term');
    // The sequence course in progress with its pick held: its credits count as taken.
    const running = transcriptOf(...everything('GEO 206', 'HUM 101'), 'HIS 132:-@Spr 2026');
    const text = overview(running);
    expect(text).toContain('No credits left to plan');
    expect(text).toContain('Plus 3 extra credits in progress for the history sequence.');
    expect(decode(resultHtml(running, curriculum, false))).toContain('In progress: HIS 132 for the history sequence (3 extra credits). It fills the sequence requirement only.');
    expect(decode(resultHtml(running, curriculum, false))).not.toMatch(/\b(complete[d]?|finished|congratulations|all done)\b/i);
  });

  it('says when nothing is left to plan', () => {
    const done = transcriptOf(...everything('HIS 132', 'HUM 101'));
    const html = overviewOf(done, curriculum, false, settings()).html;
    expect(html).toMatch(/<div data-pace>\s*<span class="eyebrow">Looking ahead<\/span>\s*<h2>No credits left to plan<\/h2>\s*<\/div>/);
    // No detail, no caveat, no controls: there is nothing to estimate.
    expect(html).not.toMatch(/pace-detail|caveat|class="pace"|data-pace-target/);
    // In progress counts as taken too.
    expect(overview(transcriptOf(...everything('HIS 132', 'HUM 101').filter(code => code !== 'MGT 462'), 'MGT 462:-@Spr 2026'))).toContain('No credits left to plan');
    // The page does not say the degree is complete.
    expect(decode(resultHtml(done, curriculum, false))).not.toMatch(/\b(complete[d]?|finished|congratulations|all done)\b/i);
    expect(paceOf(0, readTerm('Fall 2026'), settings())).toEqual({ kind: 'none' });
    expect(paceOf(0, null, settings())).toEqual({ kind: 'none' });
    expect(paceOf(5, null, settings())).toEqual({ kind: 'unreadable' });
    // Values the controls never give cannot make it run without end: the most is at least 1, a whole number.
    expect(paceOf(5, readTerm('Fall 2026'), settings({ most: 0, fewest: 0 }))).toMatchObject({ kind: 'on', terms: 5 });
    expect(paceOf(5, readTerm('Fall 2026'), settings({ most: 2.9, fewest: 7 }))).toMatchObject({ kind: 'on', terms: 3 });
    expect(paceHeadline(paceOf(5, null, settings()))).toBe('');
  });
});

describe('whatever the numbers', () => {
  it('holds for any numbers', () => {
    const SEED = 20261119;
    let seed = SEED;
    const next = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const whole = (from: number, to: number): number => from + Math.floor(next() * (to - from + 1));
    const seasons = ['Spring', 'Summer', 'Fall'] as const;
    // An independent count of terms: a term is a number of half-years (or thirds, with summers).
    const index = (one: Term, summers: boolean): number => (summers ? one.year * 3 + seasons.indexOf(one.season) : one.year * 2 + (one.season === 'Fall' ? 1 : 0));
    const seen = { on: 0, off: 0, before: 0, about: 0, summerTarget: 0, moved: 0 };
    for (let i = 0; i < 3000; i++) {
      const credits = whole(1, 140);
      const most = whole(1, 24);
      const fewest = whole(1, most);
      const summers = next() < 0.4;
      const latest: Term = { season: seasons[whole(0, 2)]!, year: whole(2019, 2032) };
      const chosen: Term | null = next() < 0.35 ? null : { season: seasons[whole(0, 2)]!, year: whole(latest.year - 1, latest.year + 12) };
      const given: PaceSettings = { target: chosen, fewest, most, summers };
      const label = `seed ${SEED}, case ${i}: ${credits} credits after ${termName(latest)}, ${JSON.stringify(given)}`;
      const pace = paceOf(credits, latest, given);
      if (pace.kind !== 'on' && pace.kind !== 'off') throw new Error(`${label}: no estimate`);
      // The first term ahead, and the terms to the target, as an independent count gives them.
      const start = termAfter(latest, summers);
      expect(pace.start, label).toEqual(start);
      expect(index(start, summers), label).toBe(summers ? index(latest, true) + 1 : latest.season === 'Fall' ? latest.year * 2 + 2 : latest.year * 2 + 1);
      expect(pace.terms, label).toBe(index(pace.target, summers) - index(start, summers) + 1);
      expect(pace.terms, label).toBeGreaterThanOrEqual(1);
      // On pace exactly when the credits fit into those terms at the most credits a term.
      expect(pace.kind, label).toBe(credits <= pace.terms * most ? 'on' : 'off');
      // Where the student finishes at the most: never after the target when on pace, always after it when not.
      const termsAtMost = Math.ceil(credits / most);
      if (pace.kind === 'off') {
        seen.off++;
        expect(pace.detail, label).toMatchObject({ kind: 'after', at: most, semesters: termsAtMost - pace.terms });
        if (pace.detail.kind === 'after') expect(index(pace.detail.finish, summers), label).toBe(index(pace.target, summers) + pace.detail.semesters);
      } else {
        seen.on++;
        expect(termsAtMost, label).toBeLessThanOrEqual(pace.terms);
        if (pace.detail.kind === 'before') {
          seen.before++;
          expect(pace.detail.at, label).toBe(fewest);
          expect(pace.detail.semesters, label).toBeGreaterThan(0);
          expect(index(pace.detail.finish, summers), label).toBe(index(pace.target, summers) - pace.detail.semesters);
          expect(Math.ceil(credits / fewest), label).toBe(pace.terms - pace.detail.semesters);
        } else { seen.about++; expect(pace.detail.kind, label).toBe('about'); }
      }
      // The number in the detail: credits ÷ terms, rounded.
      expect(pace.perTerm, label).toBe(Math.round(credits / pace.terms));
      // The default target is on pace, and the term before it is not.
      const byDefault = paceOf(credits, latest, { ...given, target: null });
      if (byDefault.kind !== 'on') throw new Error(`${label}: the default target is not on pace`);
      expect(byDefault.terms, label).toBe(termsAtMost);
      if (termsAtMost > 1) {
        let before = start;
        for (let n = 1; n < termsAtMost - 1; n++) before = termAfter(before, summers);
        expect(paceOf(credits, latest, { ...given, target: before }).kind, label).toBe('off');
      }
      // Changing the fewest never changes the verdict.
      for (const other of [1, Math.max(1, fewest - 3), most]) expect(paceOf(credits, latest, { ...given, fewest: other }).kind, label).toBe(pace.kind);
      // The list always has the chosen target and the default, in order, each once.
      const names = pace.options.map(termName);
      expect(names, label).toContain(termName(pace.target));
      expect(names, label).toContain(termName(byDefault.target));
      expect(new Set(names).size, label).toBe(names.length);
      expect([...pace.options].sort((a, b) => index(a, true) - index(b, true)), label).toEqual(pace.options);
      // With summers off no summer is counted or offered; a summer target becomes the Fall after it.
      if (!summers) {
        expect(pace.options.some(one => one.season === 'Summer'), label).toBe(false);
        expect(pace.target.season, label).not.toBe('Summer');
        if (chosen?.season === 'Summer' && index({ season: 'Fall', year: chosen.year }, false) >= index(start, false)) {
          seen.moved++;
          expect(pace.target, label).toEqual({ season: 'Fall', year: chosen.year });
        }
      } else if (pace.target.season === 'Summer') seen.summerTarget++;
      // The target is never before the first term ahead.
      expect(index(pace.target, summers), label).toBeGreaterThanOrEqual(index(start, summers));
    }
    for (const [what, times] of Object.entries(seen)) expect(times, what).toBeGreaterThan(20);
  });

  it('agrees with the Start demo', () => {
    // The demo's line is what the code says for the demo's student, in progress in the term the demo names.
    const student = demoStudent(curriculum);
    const said = paceHeadline(paceOf(student.credits.remaining, readTerm('Fall 2026'), defaultSettings()));
    expect(demoPace(curriculum)).toBe(said);
    expect(said).toBe('On pace for Spring 2029');
    const html = startPage(programs);
    expect(decode(html)).toContain(`${student.credits.remaining} credits left ${said} ${CAVEAT}`);
    expect(html.match(/On pace for/g)).toHaveLength(1);
    // The line is worked out, not written out: the Start page's source has no such sentence in it.
    expect(readFileSync(join(import.meta.dirname, '..', 'src', 'start.ts'), 'utf8')).not.toMatch(/On pace|Spring 20\d\d/);
    // That student still needs a sequence course, with its pick open: no extra credits to add.
    expect(student.sequence.state).toBe('needed');
    expect(student.blocks.flatMap(block => block.picks).filter(group => group.options.some(option => ['HIS 132', 'ENG 210'].includes(option.code))).every(group => group.open > 0)).toBe(true);
  });
});

// A pace value is only ever one of the kinds above.
export type { Pace };
