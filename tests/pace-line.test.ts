// F15: the pace line on "Check my courses", with a transcript only (docs/sprints/F15.md and
// its "Change after the M1 check"; docs/BRIEF.md §4 Flow A step 5; the owner's answers of
// 2026-11-16: the term the typed courses are for, and, after the M1 check, the sentence
// that says what a term needs to finish by the target, with no finish date). The rules and the line as
// text; clicking is in tests/check-page.test.ts. Every student here is made up.
import { afterEach, describe, expect, it, vi } from 'vitest';
import sampleA from '../synthetic/transcripts/sample-a.json';
import sampleB from '../synthetic/transcripts/sample-b.json';
import { NO_TRANSCRIPT, paceLineFor, paceLineHtml, paceLineSentence, summaryHtml, type CourseList, type OnCheck } from '../src/check';
import { curriculum, normalizeCode } from '../src/curriculum';
import { entryFor, type Entry } from '../src/entries';
import { defaultSettings, paceLineOf, readTerm, termName, type PaceSettings, type Term } from '../src/pace';
import { openTranscript, reviewedStandings } from '../src/review';
import { type CourseStanding } from '../src/transcript';

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
type Row = Record<string, unknown>;
/** A made-up reader's row: "MGT 321" passed in Fall 2025; "MGT 321:-" in progress; "@Spr 2026" sets its term. */
const rowOf = (entry: string): Row => {
  const [course = '', when = 'Fall 2025'] = entry.split('@');
  const [code = '', mark = 'B'] = course.split(':');
  const [prefix, number] = code.split(' ');
  return { term: when, transfer: false, prefix, number, description: 'A course', attempted: 3, earned: 3, grade: mark === '-' ? '' : mark, points: 0 };
};
const standingsOf = (answer: unknown): CourseStanding[] => reviewedStandings(openTranscript('made-up.pdf', answer, curriculum), curriculum.grades);
const having = (...entries: string[]): CourseStanding[] => standingsOf({ rows: entries.map(rowOf) });
const a = standingsOf(sampleA);
const b = standingsOf(sampleB);
/** A reviewed transcript as "Check my courses" has it. */
const added = (standings: CourseStanding[], pace: Partial<PaceSettings> = {}, exact = true): OnCheck =>
  ({ state: 'added', name: 'made-up.pdf', use: { standings, exact }, counts: `${standings.length} rows taken on.`, toFix: exact ? 0 : 1, pace: { ...defaultSettings(), ...pace } });
const typed = (codes: readonly string[], more: Partial<CourseList> = {}): CourseList =>
  ({ entries: codes.map(code => entryFor(normalizeCode(code) ?? code, curriculum)), legacy: false, filter: 'all', term: null, ...more });
/** The line as it is read out. */
const said = (codes: readonly string[], transcript: OnCheck, more: Partial<CourseList> = {}): string => paceLineSentence(paceLineFor(typed(codes, more), curriculum, transcript));
const FIFTEEN = ['MGT 321', 'MGT 422', 'CIS 300', 'CIS 302', 'FIN 201'];
const requiredCodes = curriculum.blocks.flatMap(block => block.required.map(course => course.code));
const everything = (social: string, humanities: string): string[] => [
  ...requiredCodes,
  ...curriculum.blocks.flatMap(block => block.picks.map(group => {
    const codes = group.courses.map(course => course.code);
    return codes.includes('HIS 132') ? social : codes.includes('ENG 210') ? humanities : codes[0]!;
  })),
  'FIN 201', 'MKT 410', 'CIS 499',
];

afterEach(() => { vi.useRealTimers(); });

describe('the pace line', () => {
  const OVER = (most: number): string => `That’s more than your ${most}-credit limit — consider a later target.`;
  const lineOf = (codes: readonly string[], transcript: OnCheck, more: Partial<CourseList> = {}) => {
    const view = paceLineFor(typed(codes, more), curriculum, transcript);
    if (view?.kind !== 'line') throw new Error(`no line: ${view?.kind}`);
    return view.line;
  };

  it('says how many credits a term the target needs', () => {
    // The design's student has 81 credits still to take after Fall 2026, and five Fall and Spring terms to Spring 2029: 16.2, rounded up.
    const list = typed(FIFTEEN);
    const view = paceLineFor(list, curriculum, added(a));
    // The owner's sentence of 2026-11-16 (the M1 check), word for word.
    expect(paceLineSentence(view)).toBe('15 of these 15 credits count. To finish by Spring 2029, you need about 17 counting credits a term.');
    expect(lineOf(FIFTEEN, added(a))).toMatchObject({ counting: 15, total: 15, semesters: 5, perTerm: 17, over: null });
    const html = paceLineHtml(view);
    // The sentence, then the two lists on a line of their own with their names, then the caveat.
    expect(decode(html)).toBe(` 15 of these 15 credits count. To finish by Spring 2029, you need about 17 counting credits a term. Term for these courses Spring 2027 Fall 2027 Spring 2028 Fall 2028 Target semester Fall 2028 Spring 2029 Fall 2029 Spring 2030 Fall 2030 ${CAVEAT} `);
    expect(html).toMatch(/^<div class="pace-line" data-pace-line>\s*<p data-line-sentence>[^<]+<\/p>\s*<div class="line-lists">[\s\S]*<\/div>\s*<p class="caveat">Credits only — course order may add semesters\.<\/p>\s*<\/div>$/);
    // No list stands inside the sentence.
    expect(/<p data-line-sentence>([\s\S]*?)<\/p>/.exec(html)?.[1]).toBe('15 of these 15 credits count. To finish by Spring 2029, you need about 17 counting credits a term.');
    const lists = html.match(/<span class="line-list">[\s\S]*?<\/span>/g) ?? [];
    expect(lists).toHaveLength(2);
    // Each list is named by the words beside it.
    expect(lists[0]).toMatch(/<label for="line-term">Term for these courses<\/label>\s*<select id="line-term" class="line-select" data-line-term>/);
    expect(lists[0]!.match(/<option value="([^"]+)"( selected)?>/g)).toEqual([
      '<option value="Spring 2027" selected>', '<option value="Fall 2027">', '<option value="Spring 2028">', '<option value="Fall 2028">',
    ]);
    expect(lists[1]).toMatch(/<label for="line-target">Target semester<\/label>\s*<select id="line-target" class="line-select" data-line-target>/);
    expect(lists[1]!.match(/<option value="([^"]+)"( selected)?>/g)).toEqual([
      '<option value="Fall 2028">', '<option value="Spring 2029" selected>', '<option value="Fall 2029">', '<option value="Spring 2030">', '<option value="Fall 2030">',
    ]);
    expect(html).not.toContain('aria-label');
    // Under the three numbers, in the same part of the page.
    const summary = summaryHtml(list, curriculum, added(a));
    expect(summary).toMatch(/<\/div>\s*<\/div><div class="pace-line" data-pace-line>\s*<p data-line-sentence>15 of these 15 credits count\./);
    expect(summary.endsWith(html)).toBe(true);

    // n is the typed credits that count, m all of them: a course outside the curriculum, one already passed and one in progress add to m only.
    expect(said([...FIFTEEN, 'BIO 230'], added(a))).toBe('15 of these 18 credits count. To finish by Spring 2029, you need about 17 counting credits a term.');
    expect(said([...FIFTEEN, 'BIO 230', 'ENG 131', 'ECO 251'], added(a))).toBe('15 of these 24 credits count. To finish by Spring 2029, you need about 17 counting credits a term.');
    expect(said(['MGT 321', 'PED 122'], added(a))).toBe('3 of these 4 credits count. To finish by Spring 2029, you need about 17 counting credits a term.');
    // None of them counts: the same sentence says so, and what the target needs is the same.
    expect(said(['BIO 230'], added(a))).toBe('0 of these 3 credits count. To finish by Spring 2029, you need about 17 counting credits a term.');
    expect(said(['BIO 230', 'ENG 131'], added(a))).toBe('0 of these 6 credits count. To finish by Spring 2029, you need about 17 counting credits a term.');
    // A sequence course that is needed for its sequence only counts here: its credits are among those still to take.
    const held = having(...everything('GEO 206', 'HUM 101').filter(code => code !== 'MGT 462'));
    expect(said(['HIS 132'], added(held))).toBe('3 of these 3 credits count. To finish by Spring 2026, you need about 6 counting credits a term.');
    // The owner's words are kept exactly, also for a 1.
    expect(said(['ORI 100'], added(having('ENG 131:-@Fall 2026')))).toMatch(/^1 of these 1 credits count\. To finish by Spring 2030, you need about 17 counting credits a term\.$/);
    const one = paceLineOf({ left: 1, after: 0, counting: 1, total: 1, latest: term('Fall 2026'), term: null, settings: defaultSettings() });
    if (one.kind !== 'line') throw new Error('no line');
    expect(paceLineSentence({ kind: 'line', line: one })).toBe('1 of these 1 credits count. To finish by Spring 2027, you need about 1 counting credits a term.');
    // While rows still need fixing the line is shown all the same; the card says the pace may change.
    expect(said(FIFTEEN, added(a, {}, false))).toBe('15 of these 15 credits count. To finish by Spring 2029, you need about 17 counting credits a term.');
  });

  it('shows nothing without a transcript', () => {
    const list = typed(FIFTEEN);
    for (const transcript of [NO_TRANSCRIPT, { state: 'reviewing' } as OnCheck, { ...added(a), use: null } as OnCheck]) {
      expect(paceLineFor(list, curriculum, transcript)).toBeNull();
      const summary = summaryHtml(list, curriculum, transcript);
      expect(summary).not.toMatch(/pace-line|data-line-term|data-line-target|<select/);
      expect(decode(summary)).not.toMatch(/pace|finish|target|semester/i);
    }
    // An empty list has no numbers and no line.
    expect(paceLineFor(typed([]), curriculum, added(a))).toBeNull();
    expect(summaryHtml(typed([]), curriculum, added(a))).toBe('');
    expect(paceLineHtml(null)).toBe('');
    expect(paceLineSentence(null)).toBe('');
  });

  it("starts in the term after the transcript's latest", () => {
    const first = (...rows: string[]): string => { const view = paceLineFor(typed(['MGT 321']), curriculum, added(having(...rows))); return view?.kind === 'line' ? termName(view.line.term) : `no line: ${view?.kind}`; };
    // The owner's tests: an in-progress term gives the next Fall or Spring;
    expect(first('ENG 131@Fall 2025', 'ENG 132:-@Fall 2026')).toBe('Spring 2027');
    expect(first('ENG 131@Fall 2025', 'ENG 132:-@Spr 2026')).toBe('Fall 2026');
    // no in-progress term uses the latest graded term;
    expect(first('ENG 131@Fall 2024', 'ENG 132@Spr 2025')).toBe('Fall 2025');
    expect(first('ENG 131@Spr 2025', 'ENG 132@Fall 2025')).toBe('Spring 2026');
    // a summer latest term skips to Fall.
    expect(first('ENG 131@Spr 2026', 'ENG 132:-@Sum 2026')).toBe('Fall 2026');
    expect(first('ENG 131@Summer 2026')).toBe('Fall 2026');
    // The two made-up transcripts.
    expect(termName(lineOf(['MGT 321'], added(a)).term)).toBe('Spring 2027');
    expect(termName(lineOf(['MGT 321'], added(b)).term)).toBe('Spring 2026');
    // The list of terms: the default and the next three, Fall and Spring only.
    const view = paceLineFor(typed(['MGT 321']), curriculum, added(having('ENG 131:-@Sum 2026')));
    expect(view?.kind === 'line' ? view.line.terms.map(termName) : []).toEqual(['Fall 2026', 'Spring 2027', 'Fall 2027', 'Spring 2028']);
    // Never today's date: the same line whatever the clock says.
    const lines = [new Date('2020-01-15T12:00:00Z'), new Date('2035-09-01T12:00:00Z')].map(now => {
      vi.useFakeTimers({ now });
      return [summaryHtml(typed(FIFTEEN), curriculum, added(standingsOf(sampleA))), said(['MGT 321', 'BIO 230'], added(standingsOf(sampleB)), { legacy: true })];
    });
    expect(lines[0]).toEqual(lines[1]);
  });

  it('divides by the Fall and Spring terms from the term through the target', () => {
    // The term and the target both count: Spring 2027 to Spring 2029 is five terms.
    expect(lineOf(FIFTEEN, added(a))).toMatchObject({ semesters: 5, perTerm: 17 });
    // A later term leaves fewer terms to the same target: 81 ÷ 4 = 20.25.
    expect(said(FIFTEEN, added(a), { term: term('Fall 2027') })).toBe(`15 of these 15 credits count. To finish by Spring 2029, you need about 21 counting credits a term. ${OVER(18)}`);
    expect(lineOf(FIFTEEN, added(a), { term: term('Fall 2028') })).toMatchObject({ semesters: 2, perTerm: 41 });
    // The chosen term is shown as chosen.
    expect(paceLineHtml(paceLineFor(typed(FIFTEEN, { term: term('Fall 2027') }), curriculum, added(a)))).toContain('<option value="Fall 2027" selected>');
    // A term that is not offered (a summer; one too far; one before the first) leaves the default.
    for (const other of ['Summer 2027', 'Fall 2035', 'Fall 2026', 'Spring 2020']) expect(termName(lineOf(FIFTEEN, added(a), { term: term(other) }).term), other).toBe('Spring 2027');
    // A later target leaves more terms: 81 ÷ 6 = 13.5; 81 ÷ 8.
    const at = (target: string): string => said(FIFTEEN, added(a, { target: term(target) }));
    expect(at('Fall 2029')).toBe('15 of these 15 credits count. To finish by Fall 2029, you need about 14 counting credits a term.');
    expect(at('Fall 2030')).toBe('15 of these 15 credits count. To finish by Fall 2030, you need about 11 counting credits a term.');
    expect(at('Fall 2028')).toBe(`15 of these 15 credits count. To finish by Fall 2028, you need about 21 counting credits a term. ${OVER(18)}`);
    // The target is the term itself: one term for everything.
    expect(at('Spring 2027')).toBe(`15 of these 15 credits count. To finish by Spring 2027, you need about 81 counting credits a term. ${OVER(18)}`);
    // The student's own target is in the list even when it is far from the default.
    expect(lineOf(FIFTEEN, added(a, { target: term('Fall 2033') })).targets.map(termName)).toEqual(['Fall 2028', 'Spring 2029', 'Fall 2029', 'Spring 2030', 'Fall 2030', 'Fall 2033']);
    expect(at('Fall 2033')).toBe('15 of these 15 credits count. To finish by Fall 2033, you need about 6 counting credits a term.');

    // Summers are never counted. A summer target of "See what I have left" is shown as itself; the terms to it are the Fall and Spring ones before it.
    const summer = added(a, { summers: true, target: term('Summer 2029') });
    const line = lineOf(FIFTEEN, summer);
    expect([termName(line.target), line.targets.map(termName), line.semesters, line.perTerm]).toEqual(['Summer 2029', ['Fall 2028', 'Spring 2029', 'Summer 2029', 'Fall 2029', 'Spring 2030', 'Fall 2030'], 5, 17]);
    expect(said(FIFTEEN, summer)).toBe('15 of these 15 credits count. To finish by Summer 2029, you need about 17 counting credits a term.');
    expect(paceLineHtml(paceLineFor(typed(FIFTEEN), curriculum, summer))).toContain('<option value="Summer 2029" selected>');
    const direct = (left: number, target: string, from: string | null = null) => paceLineOf({ left, after: left - 3, counting: 3, total: 3, latest: term('Fall 2026'), term: from ? term(from) : null, settings: { ...defaultSettings(), summers: true, target: term(target) } });
    expect(direct(30, 'Summer 2028')).toMatchObject({ semesters: 3, perTerm: 10 });
    expect(direct(30, 'Summer 2027')).toMatchObject({ semesters: 1, perTerm: 30, over: 18 });
    expect(direct(30, 'Summer 2028', 'Fall 2027')).toMatchObject({ semesters: 2, perTerm: 15 });
    for (const left of [3, 6, 9, 12, 15, 18, 21]) {
      const one = direct(left, 'Summer 2028');
      if (one.kind !== 'line') throw new Error('no line');
      expect(one.terms.some(each => each.season === 'Summer')).toBe(false);
      expect(one.targets.filter(each => each.season === 'Summer').map(termName)).toEqual(['Summer 2028']);
    }
    // With summers counted there but no summer chosen, the default target there may be a summer: it is shown here as it is there.
    expect(termName(lineOf(FIFTEEN, added(a, { summers: true })).target)).toBe('Summer 2028');
  });

  it('says when a term would need more than the most', () => {
    const direct = (left: number, most = 18, target = 'Spring 2029') => paceLineOf({ left, after: left - 15, counting: 15, total: 15, latest: term('Fall 2026'), term: null, settings: { ...defaultSettings(), fewest: Math.min(12, most), most, target: term(target) } });
    // Exactly the most is not more than the most.
    expect(direct(90)).toMatchObject({ semesters: 5, perTerm: 18, over: null });
    expect(direct(91)).toMatchObject({ perTerm: 19, over: 18 });
    expect(direct(81)).toMatchObject({ perTerm: 17, over: null });
    // The sentence goes on in the same paragraph, with the student's own most.
    const over = paceLineFor(typed(FIFTEEN, { term: term('Fall 2027') }), curriculum, added(a));
    expect(paceLineHtml(over)).toContain('<p data-line-sentence>15 of these 15 credits count. To finish by Spring 2029, you need about 21 counting credits a term. That’s more than your 18-credit limit — consider a later target.</p>');
    // The most credits of "See what I have left": with 21 the default target there is Fall 2028, and 21 a term is not more than 21.
    expect(said(FIFTEEN, added(a, { most: 21 }))).toBe('15 of these 15 credits count. To finish by Fall 2028, you need about 21 counting credits a term.');
    expect(direct(81, 21, 'Fall 2028')).toMatchObject({ perTerm: 21, over: null });
    expect(direct(81, 20, 'Fall 2028')).toMatchObject({ perTerm: 21, over: 20 });
    // With 12, a target that takes 17 a term is over the limit, and the limit named is 12.
    expect(said(FIFTEEN, added(a, { fewest: 12, most: 12, target: term('Spring 2029') }))).toBe(`15 of these 15 credits count. To finish by Spring 2029, you need about 17 counting credits a term. ${OVER(12)}`);
    expect(said(FIFTEEN, added(a, { fewest: 12, most: 12 }))).toBe('15 of these 15 credits count. To finish by Spring 2030, you need about 12 counting credits a term.');
    // The list of targets always holds one that needs no more than the most.
    for (const [left, most] of [[81, 18], [81, 12], [140, 9], [3, 18], [50, 1]] as const) {
      const line = direct(left, most, 'Spring 2027');
      if (line.kind !== 'line') throw new Error('no line');
      const fits = line.targets.some(target => { const other = direct(left, most, termName(target)); return other.kind === 'line' && other.over === null; });
      expect(fits, `${left} left, most ${most}`).toBe(true);
    }
  });

  it('never names a finish', () => {
    const terms = /\b(Spring|Summer|Fall) \d{4}\b/g;
    for (const transcript of [added(a), added(a, { target: term('Fall 2029') }), added(a, { summers: true }), added(b), added(a, {}, false), added(a, { most: 9, fewest: 9 })]) {
      for (const codes of [FIFTEEN, ['MGT 321'], ['MGT 321', 'BIO 230'], ['HIS 132', 'ENG 210'], ['BIO 230']]) {
        for (const from of [null, 'Fall 2027', 'Fall 2028']) {
          const view = paceLineFor(typed(codes, from ? { term: term(from) } : {}), curriculum, transcript);
          if (view?.kind !== 'line') throw new Error('no line');
          const sentence = paceLineSentence(view);
          // The only term in the sentence is the target, and no word of the old line is left.
          expect(sentence.match(terms), sentence).toEqual([termName(view.line.target)]);
          expect(sentence, sentence).not.toMatch(/finish (Spring|Summer|Fall)|semesters? (after|before)|at this pace|in your target semester/);
          // The caveat is under every such line: it is an estimate from credits alone.
          expect(paceLineHtml(view), sentence).toMatch(/<\/div>\s*<p class="caveat">Credits only — course order may add semesters\.<\/p>\s*<\/div>$/);
        }
      }
    }
    // The line that the old sentence made of one course ("…finish Spring 2040, 22 semesters after your target").
    expect(said(['MGT 321'], added(a))).toBe('3 of these 3 credits count. To finish by Spring 2029, you need about 17 counting credits a term.');
  });

  it('takes the term as the target when the target is earlier', () => {
    // Twelve credits left: the target of "See what I have left" is the very next term.
    const four = ['MGT 462', 'MGT 422', 'CIS 461', 'CIS 410'];
    const transcript = added(having(...everything('HIS 132', 'ENG 210').filter(code => !four.includes(code))));
    expect(lineOf(['MGT 462'], transcript)).toMatchObject({ term: term('Spring 2026'), target: term('Spring 2026'), semesters: 1, perTerm: 12, over: null });
    // The courses are for a later term: nothing is left to a target before it, so the term itself is the target here.
    const later = lineOf(['MGT 462'], transcript, { term: term('Fall 2026') });
    expect(later).toMatchObject({ term: term('Fall 2026'), target: term('Fall 2026'), semesters: 1, perTerm: 12, over: null });
    expect(said(['MGT 462'], transcript, { term: term('Fall 2026') })).toBe('3 of these 3 credits count. To finish by Fall 2026, you need about 12 counting credits a term.');
    // The list of targets offers no term before the term.
    expect(later.targets.map(termName)[0]).toBe('Fall 2026');
    expect(lineOf(['MGT 462'], transcript, { term: term('Fall 2027') }).targets.map(termName)[0]).toBe('Fall 2027');
    expect(paceLineHtml(paceLineFor(typed(['MGT 462'], { term: term('Fall 2026') }), curriculum, transcript))).toMatch(/<select id="line-target"[^>]*><option value="Fall 2026" selected>/);
    // The target of "See what I have left" is not changed by it: the settings are as they were.
    expect(transcript.state === 'added' ? transcript.pace?.target : 'x').toBeNull();
    // A target chosen by the student that is not before the term is kept.
    expect(lineOf(['MGT 462'], added(having(...everything('HIS 132', 'ENG 210').filter(code => !four.includes(code))), { target: term('Spring 2027') }), { term: term('Fall 2026') })).toMatchObject({ target: term('Spring 2027'), semesters: 2, perTerm: 6 });
  });

  it('counts the sequence course that the typed courses make necessary', () => {
    // The design's student, with the two picks a sequence could go through filled by the typed courses: a sequence
    // course is then needed as well, with 3 extra credits. 84 are to take, not 81.
    const closing = ['GEO 206', 'HUM 101', 'CIS 300'];
    const keeping = ['GEO 206', 'ENG 210', 'CIS 300'];
    expect(said(closing, added(a))).toBe('9 of these 9 credits count. To finish by Spring 2029, you need about 17 counting credits a term.');
    expect(said(keeping, added(a))).toBe('9 of these 9 credits count. To finish by Spring 2029, you need about 17 counting credits a term.');
    // Where the 3 credits change what a term needs: three terms from Spring 2028 to Spring 2029, 84 ÷ 3 against 81 ÷ 3.
    expect(lineOf(closing, added(a), { term: term('Spring 2028') })).toMatchObject({ semesters: 3, perTerm: 28 });
    expect(lineOf(keeping, added(a), { term: term('Spring 2028') })).toMatchObject({ semesters: 3, perTerm: 27 });
    expect(said(closing, added(a), { term: term('Spring 2028') })).toBe(`9 of these 9 credits count. To finish by Spring 2029, you need about 28 counting credits a term. ${OVER(18)}`);

    // Everything is passed but four courses; GEO 206 holds the Social sciences pick, and the
    // pick of ENG 210 is still open: 15 credits left, and a sequence could still go through it.
    const open = ['MGT 462', 'MGT 422', 'CIS 461', 'CIS 410', 'ENG 210'];
    const transcript = added(having(...everything('GEO 206', 'ENG 210').filter(code => !open.includes(code))));
    expect(said(open, transcript)).toBe('15 of these 15 credits count. To finish by Spring 2026, you need about 15 counting credits a term.');
    // Typed with HUM 101 instead, all five count as well, but HUM 101 takes the pick the sequence needed: 18 are to take.
    expect(said(['MGT 462', 'MGT 422', 'CIS 461', 'CIS 410', 'HUM 101'], transcript)).toBe('15 of these 15 credits count. To finish by Spring 2026, you need about 18 counting credits a term.');
    // What a term needs is never less than what is left once the typed courses are taken allows.
    const direct = (after: number) => paceLineOf({ left: 15, after, counting: 15, total: 15, latest: term('Fall 2025'), term: null, settings: defaultSettings() });
    expect(direct(3)).toMatchObject({ perTerm: 18, over: null });
    expect(direct(0)).toMatchObject({ perTerm: 15 });
    expect(direct(6)).toMatchObject({ perTerm: 21, over: 18 });
    // A typed course that is on the transcript without credit (a W) is taken again: 92 credits to take, six terms to Fall 2028.
    expect(said(['BIO 127'], added(b))).toBe('3 of these 3 credits count. To finish by Fall 2028, you need about 16 counting credits a term.');
  });

  it('waits for the legacy answer', () => {
    // A typed row shows the question: the line points to it and says nothing about pace.
    const waiting = paceLineFor(typed(['FIN 201', 'CIS 499'], { legacy: null }), curriculum, added(b));
    expect(waiting).toEqual({ kind: 'text', text: 'Answer “Are you a legacy CIS student?” to see your pace.' });
    expect(paceLineHtml(waiting)).not.toMatch(/<select|caveat|data-legacy/);
    // Answered, the line follows the answers: three credits fewer count on Yes, and three fewer are left.
    expect(said(['FIN 201', 'CIS 499'], added(b), { legacy: false })).toBe('6 of these 6 credits count. To finish by Fall 2028, you need about 16 counting credits a term.');
    expect(said(['FIN 201', 'CIS 499'], added(b), { legacy: true })).toBe('3 of these 6 credits count. To finish by Spring 2028, you need about 18 counting credits a term.');
    // With the first made-up transcript nothing depends on the answer: the line is there before it.
    expect(said(FIFTEEN, added(a), { legacy: null })).toBe('15 of these 15 credits count. To finish by Spring 2029, you need about 17 counting credits a term.');
  });

  it('asks the legacy question when only the credits left depend on it', () => {
    // No typed row asks (CIS 300 counts either way), but the transcript's FLS 161 changes the credits still to take.
    const list = typed(['CIS 300'], { legacy: null });
    const view = paceLineFor(list, curriculum, added(b));
    expect(view).toEqual({ kind: 'ask', because: 'Your transcript has FLS 161, which counts as an elective only for legacy students.' });
    const html = paceLineHtml(view);
    expect(html).toMatch(/<div class="pace-line" data-pace-line>\s*<div class="legacy-ask" role="group" aria-label="Are you a legacy CIS student\?">\s*<p>Are you a legacy CIS student\?<\/p>\s*<div class="legacy-buttons">\s*<button type="button" class="btn secondary" data-legacy="yes">Yes<\/button>/);
    expect(html).not.toMatch(/counting credits a term|<select|caveat/);
    // 89 credits still to take with Yes, 92 with No: different targets, and what a term needs.
    expect(said(['CIS 300'], added(b), { legacy: true })).toBe('3 of these 3 credits count. To finish by Spring 2028, you need about 18 counting credits a term.');
    expect(said(['CIS 300'], added(b), { legacy: false })).toBe('3 of these 3 credits count. To finish by Fall 2028, you need about 16 counting credits a term.');
  });

  it('says when there is nothing to pace', () => {
    // Every credit done and the sequence done: F14's sentence.
    const done = having(...everything('HIS 132', 'HUM 101'));
    expect(paceLineFor(typed(['BIO 230']), curriculum, added(done))).toEqual({ kind: 'text', text: 'No credits left to plan' });
    // The latest term cannot be read: F14's sentence.
    expect(paceLineFor(typed(['MGT 321']), curriculum, added(having('ENG 131@Fall 2025', 'ENG 132:-@Winter 2026')))).toEqual({ kind: 'text', text: 'Pace can’t be estimated: the latest term on your transcript could not be read.' });
    for (const view of [paceLineFor(typed(['BIO 230']), curriculum, added(done)), paceLineFor(typed(['MGT 321']), curriculum, added(having('ENG 132:-@Winter 2026')))]) {
      expect(paceLineHtml(view)).toMatch(/^<p class="pace-line" data-pace-line>[^<]+<\/p>$/);
    }
    expect(paceLineOf({ left: 0, after: 0, counting: 3, total: 3, latest: term('Fall 2026'), term: null, settings: defaultSettings() })).toEqual({ kind: 'none' });
    expect(paceLineOf({ left: 5, after: 2, counting: 3, total: 3, latest: null, term: null, settings: defaultSettings() })).toEqual({ kind: 'unreadable' });
    // Typed credits of which none counts are still a line: the sentence says "0 of these …".
    expect(paceLineOf({ left: 5, after: 5, counting: 0, total: 3, latest: term('Fall 2026'), term: null, settings: defaultSettings() })).toMatchObject({ kind: 'line', counting: 0, total: 3, perTerm: 5 });
  });

  it('holds for any numbers', () => {
    const SEED = 20261122;
    let seed = SEED;
    const next = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const whole = (from: number, to: number): number => from + Math.floor(next() * (to - from + 1));
    const seasons = ['Spring', 'Summer', 'Fall'] as const;
    // An independent count: Fall and Spring terms as whole numbers across year ends; calendar order with the summer between.
    const halves = (one: Term): number => one.year * 2 + (one.season === 'Fall' ? 1 : 0);
    const calendar = (one: Term): number => one.year * 3 + seasons.indexOf(one.season);
    /** The Fall and Spring terms from one term through another, both counted; a summer is reached by the Spring before it. */
    const through = (from: Term, to: Term): number => (to.season === 'Summer' ? to.year * 2 : halves(to)) - halves(from) + 1;
    const seen = { over: 0, under: 0, exact: 0, summerTarget: 0, laterTerm: 0, earlierTarget: 0, extra: 0, noneCount: 0 };
    for (let i = 0; i < 3000; i++) {
      const left = whole(1, 140);
      const counting = whole(0, 24);
      const extra = whole(0, 9);
      const latest: Term = { season: seasons[whole(0, 2)]!, year: whole(2019, 2032) };
      const summers = next() < 0.4;
      const chosenTarget: Term | null = next() < 0.3 ? null : { season: summers ? seasons[whole(0, 2)]! : (next() < 0.5 ? 'Spring' : 'Fall'), year: whole(latest.year, latest.year + 12) };
      const most = whole(1, 24);
      const settings: PaceSettings = { ...defaultSettings(), fewest: Math.min(12, most), most, summers, target: chosenTarget };
      const first: Term = latest.season === 'Fall' ? { season: 'Spring', year: latest.year + 1 } : { season: 'Fall', year: latest.year };
      const skip = whole(0, 5);
      const chosenTerm: Term = { season: (halves(first) + skip) % 2 === 1 ? 'Fall' : 'Spring', year: Math.floor((halves(first) + skip) / 2) };
      const label = `seed ${SEED}, case ${i}: ${left} left, ${counting} counting after ${termName(latest)}, term ${termName(chosenTerm)}, ${JSON.stringify(settings)}`;
      // What is left once this term's courses are taken: usually the rest, sometimes 3 more (a sequence course made necessary).
      const more = next() < 0.2 ? 3 : 0;
      const after = left - counting + more;
      const total = counting + extra;
      const line = paceLineOf({ left, after, counting, total, latest, term: chosenTerm, settings });
      if (line.kind !== 'line') throw new Error(`${label}: no line`);
      if (more > 0) seen.extra++;
      if (counting === 0) seen.noneCount++;
      // The terms offered: the first Fall or Spring after the latest term and the next three; no summer.
      expect(line.terms.map(halves), label).toEqual([0, 1, 2, 3].map(n => halves(first) + n));
      expect(line.terms.some(one => one.season === 'Summer'), label).toBe(false);
      // The chosen term is used when it is offered; otherwise the first.
      const used = skip <= 3 ? chosenTerm : first;
      expect(line.term, label).toEqual(used);
      if (skip > 0 && skip <= 3) seen.laterTerm++;
      // n and m are what was typed.
      expect([line.counting, line.total], label).toEqual([counting, total]);
      expect(line.counting, label).toBeLessThanOrEqual(line.total);
      // The target is never before the term: the student's own, or the term itself when theirs is earlier.
      expect(calendar(line.target), label).toBeGreaterThanOrEqual(calendar(used));
      if (chosenTarget) {
        if (calendar(chosenTarget) >= calendar(used)) expect(line.target, label).toEqual(chosenTarget);
        else { seen.earlierTarget++; expect(line.target, label).toEqual(used); }
      }
      if (line.target.season === 'Summer') seen.summerTarget++;
      // The terms from the term through the target, Fall and Spring only, both counted.
      const terms = through(used, line.target);
      expect(line.semesters, label).toBe(terms);
      expect(terms, label).toBeGreaterThanOrEqual(1);
      // What a term needs: the credits to take, with what the typed courses make necessary, ÷ those terms, rounded up.
      const toTake = left + more;
      expect(line.perTerm * terms, label).toBeGreaterThanOrEqual(toTake);
      expect((line.perTerm - 1) * terms, label).toBeLessThan(toTake);
      // The limit sentence exactly when a term would need more than the most.
      expect(line.over, label).toBe(line.perTerm > most ? most : null);
      if (line.perTerm > most) seen.over++; else if (line.perTerm === most) seen.exact++; else seen.under++;
      // The list of targets: the target in it, in order, each once, none before the term; a summer in it is the target itself;
      // and one of them needs no more than the most.
      const names = line.targets.map(termName);
      expect(names, label).toContain(termName(line.target));
      expect(new Set(names).size, label).toBe(names.length);
      expect(line.targets.map(calendar), label).toEqual([...line.targets.map(calendar)].sort((x, y) => x - y));
      expect(calendar(line.targets[0]!), label).toBeGreaterThanOrEqual(calendar(used));
      expect(line.targets.filter(one => one.season === 'Summer' && termName(one) !== termName(line.target)), label).toEqual([]);
      expect(line.targets.some(one => Math.ceil(toTake / through(used, one)) <= most), label).toBe(true);
      // The sentence names the target and no other term, and never a finish.
      const sentence = paceLineSentence({ kind: 'line', line });
      expect(sentence.match(/\b(Spring|Summer|Fall) \d{4}\b/g), label).toEqual([termName(line.target)]);
      expect(sentence.startsWith(`${counting} of these ${total} credits count. To finish by ${termName(line.target)}, you need about ${line.perTerm} counting credits a term.`), label).toBe(true);
      expect(sentence.includes('more than your'), label).toBe(line.perTerm > most);
      // A later target never needs more a term; a later term never needs less; credits that do not count change nothing.
      const at = (over: Partial<{ total: number; term: Term; target: Term }>) => paceLineOf({ left, after, counting, total: over.total ?? total, latest, term: over.term ?? used, settings: { ...settings, target: over.target ?? line.target } });
      const laterTarget = at({ target: { season: 'Fall', year: line.target.year + 1 } });
      if (laterTarget.kind === 'line') expect(laterTarget.perTerm, label).toBeLessThanOrEqual(line.perTerm);
      const laterTerm = at({ term: line.terms[Math.min(3, line.terms.findIndex(one => termName(one) === termName(used)) + 1)]! });
      if (laterTerm.kind === 'line' && calendar(laterTerm.target) === calendar(line.target)) expect(laterTerm.perTerm, label).toBeGreaterThanOrEqual(line.perTerm);
      const padded = at({ total: total + 7 });
      if (padded.kind === 'line') expect([padded.perTerm, padded.over, padded.semesters], label).toEqual([line.perTerm, line.over, line.semesters]);
    }
    for (const [what, times] of Object.entries(seen)) expect(times, what).toBeGreaterThan(20);
  });
});

export type { Entry };
