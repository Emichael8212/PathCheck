// F15: the pace line on "Check my courses", with a transcript only (docs/sprints/F15.md;
// docs/BRIEF.md §4 Flow A step 5; the owner's answer of 2026-11-16: the term the typed
// courses are for, its example sentence and its four tests). The rules and the line as
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
  it('says when the student finishes at this pace', () => {
    // The design's student has 81 credits still to take after Fall 2026; 15 credits a term take six terms.
    const list = typed(FIFTEEN);
    const view = paceLineFor(list, curriculum, added(a));
    // The owner's own example, word for word.
    expect(paceLineSentence(view)).toBe('15 credits in Spring 2027 — at this pace you finish Fall 2029, one semester after your target.');
    const html = paceLineHtml(view);
    expect(decode(html)).toBe(` 15 credits in Spring 2027 Fall 2027 Spring 2028 Fall 2028 — at this pace you finish Fall 2029, one semester after your target Fall 2028 Spring 2029 Fall 2029 Spring 2030 Fall 2030. ${CAVEAT} `);
    // Two small lists inside the sentence, each with a name a screen reader says.
    const lists = html.match(/<select[^>]*>[\s\S]*?<\/select>/g) ?? [];
    expect(lists).toHaveLength(2);
    expect(lists[0]).toMatch(/^<select class="line-select" aria-label="Term for these courses" data-line-term>/);
    expect(lists[0]!.match(/<option value="([^"]+)"( selected)?>/g)).toEqual([
      '<option value="Spring 2027" selected>', '<option value="Fall 2027">', '<option value="Spring 2028">', '<option value="Fall 2028">',
    ]);
    expect(lists[1]).toMatch(/^<select class="line-select" aria-label="Target semester" data-line-target>/);
    expect(lists[1]!.match(/<option value="([^"]+)"( selected)?>/g)).toEqual([
      '<option value="Fall 2028">', '<option value="Spring 2029" selected>', '<option value="Fall 2029">', '<option value="Spring 2030">', '<option value="Fall 2030">',
    ]);
    // Under the three numbers, in the same part of the page.
    const summary = summaryHtml(list, curriculum, added(a));
    expect(summary).toMatch(/<\/div>\s*<\/div><div class="pace-line" data-pace-line>\s*<p>15 credits in <select/);
    expect(summary.endsWith(html)).toBe(true);
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
    expect(said(['MGT 321'], added(a))).toContain('3 credits in Spring 2027');
    expect(said(['MGT 321'], added(b))).toContain('3 credits in Spring 2026');
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

  it('moves the finish with the term', () => {
    // The owner's test: changing the term changes the finish semester.
    expect(said(FIFTEEN, added(a))).toBe('15 credits in Spring 2027 — at this pace you finish Fall 2029, one semester after your target.');
    expect(said(FIFTEEN, added(a), { term: term('Fall 2027') })).toBe('15 credits in Fall 2027 — at this pace you finish Spring 2030, 2 semesters after your target.');
    expect(said(FIFTEEN, added(a), { term: term('Fall 2028') })).toBe('15 credits in Fall 2028 — at this pace you finish Spring 2031, 4 semesters after your target.');
    // The chosen term is shown as chosen.
    expect(paceLineHtml(paceLineFor(typed(FIFTEEN, { term: term('Fall 2027') }), curriculum, added(a)))).toContain('<option value="Fall 2027" selected>');
    // A term that is not offered (a summer; one too far; one before the first) leaves the default.
    for (const other of ['Summer 2027', 'Fall 2035', 'Fall 2026', 'Spring 2020']) expect(said(FIFTEEN, added(a), { term: term(other) }), other).toContain('15 credits in Spring 2027 —');
  });

  it('compares with the target', () => {
    const at = (target: string): string => said(FIFTEEN, added(a, { target: term(target) }));
    // The finish does not move; what is said about the target does.
    expect(at('Fall 2029')).toBe('15 credits in Spring 2027 — at this pace you finish in your target semester.');
    expect(at('Spring 2030')).toBe('15 credits in Spring 2027 — at this pace you finish Fall 2029, one semester before your target.');
    expect(at('Fall 2030')).toBe('15 credits in Spring 2027 — at this pace you finish Fall 2029, 2 semesters before your target.');
    expect(at('Fall 2028')).toBe('15 credits in Spring 2027 — at this pace you finish Fall 2029, 2 semesters after your target.');
    // A target earlier than the chosen term: the finish is after it.
    expect(said(FIFTEEN, added(a, { target: term('Spring 2027') }), { term: term('Fall 2027') })).toBe('15 credits in Fall 2027 — at this pace you finish Spring 2030, 6 semesters after your target.');
    // The exact hit names the target only in its list.
    const hit = paceLineHtml(paceLineFor(typed(FIFTEEN), curriculum, added(a, { target: term('Fall 2029') })));
    expect(decode(hit)).toContain('— at this pace you finish in your target semester Fall 2028 Spring 2029 Fall 2029 Spring 2030 Fall 2030.');
    expect(hit).toContain('<option value="Fall 2029" selected>');
    // The student's own target is in the list even when it is far from the default.
    const far = paceLineFor(typed(FIFTEEN), curriculum, added(a, { target: term('Fall 2033') }));
    expect(far?.kind === 'line' ? far.line.targets.map(termName) : []).toEqual(['Fall 2028', 'Spring 2029', 'Fall 2029', 'Spring 2030', 'Fall 2030', 'Fall 2033']);
    // The range of the other page moves the default target, as it does there: 21 a term reaches Fall 2028.
    expect(said(FIFTEEN, added(a, { most: 21 }))).toBe('15 credits in Spring 2027 — at this pace you finish Fall 2029, 2 semesters after your target.');
  });

  it('compares a summer target in calendar order', () => {
    // On "See what I have left" summers count and Summer 2029 is the target. Here it is shown as itself.
    const summer = added(a, { summers: true, target: term('Summer 2029') });
    const view = paceLineFor(typed(FIFTEEN), curriculum, summer);
    expect(view?.kind === 'line' ? [termName(view.line.target), view.line.targets.map(termName)] : []).toEqual(['Summer 2029', ['Fall 2028', 'Spring 2029', 'Summer 2029', 'Fall 2029', 'Spring 2030', 'Fall 2030']]);
    expect(paceLineHtml(view)).toContain('<option value="Summer 2029" selected>');
    // The Fall after it is one semester after; the Spring before it is one semester before. Never "in your target semester".
    expect(paceLineSentence(view)).toBe('15 credits in Spring 2027 — at this pace you finish Fall 2029, one semester after your target.');
    const eighteen = [...FIFTEEN, 'CIS 310'];
    expect(said(eighteen, summer)).toBe('18 credits in Spring 2027 — at this pace you finish Spring 2029, one semester before your target.');
    // Further away: Fall and Spring terms, the target summer as one step.
    const line = (left: number, counting: number, target: string) => paceLineOf({ left, after: left - counting, counting, total: counting, latest: term('Fall 2026'), term: null, settings: { ...defaultSettings(), summers: true, target: term(target) } });
    expect(line(3, 3, 'Summer 2028')).toMatchObject({ finish: term('Spring 2027'), compare: { kind: 'before', semesters: 3 } });
    expect(line(12, 3, 'Summer 2028')).toMatchObject({ finish: term('Fall 2028'), compare: { kind: 'after', semesters: 1 } });
    expect(line(18, 3, 'Summer 2028')).toMatchObject({ finish: term('Fall 2029'), compare: { kind: 'after', semesters: 3 } });
    // The finish never falls in a summer, and no other summer is offered.
    for (const left of [3, 6, 9, 12, 15, 18, 21]) {
      const one = line(left, 3, 'Summer 2028');
      if (one.kind !== 'line') throw new Error('no line');
      expect(one.finish.season).not.toBe('Summer');
      expect(one.terms.some(each => each.season === 'Summer')).toBe(false);
      expect(one.targets.filter(each => each.season === 'Summer').map(termName)).toEqual(['Summer 2028']);
      expect(one.compare.kind).not.toBe('on');
    }
    // With summers counted there but no summer chosen, the default target there may be a summer: it is shown here as it is there.
    const byDefault = paceLineFor(typed(FIFTEEN), curriculum, added(a, { summers: true }));
    expect(byDefault?.kind === 'line' ? termName(byDefault.line.target) : '').toBe('Summer 2028');
  });

  it('paces by the credits that count', () => {
    // A course outside the curriculum, one already passed and one in progress add nothing to the pace.
    const list = [...FIFTEEN, 'BIO 230', 'ENG 131', 'ECO 251'];
    expect(said(list, added(a))).toBe('15 of your 24 credits in Spring 2027 count toward CIS — at this pace you finish Fall 2029, one semester after your target.');
    expect(decode(paceLineHtml(paceLineFor(typed(list), curriculum, added(a))))).toContain('15 of your 24 credits in Spring 2027 Fall 2027 Spring 2028 Fall 2028 count toward CIS — at this pace you finish Fall 2029, one semester after your target');
    // Without them only the wording changes, not the finish.
    expect(said(FIFTEEN, added(a))).toBe('15 credits in Spring 2027 — at this pace you finish Fall 2029, one semester after your target.');
    // A course that only repeats a filled slot does not count either.
    expect(said(['MGT 321', 'PED 122'], added(a))).toBe('3 of your 4 credits in Spring 2027 count toward CIS — at this pace you finish Spring 2040, 22 semesters after your target.');
    // Nothing that counts: no finish is named, and there are no lists.
    const none = paceLineFor(typed(['BIO 230', 'ENG 131']), curriculum, added(a));
    expect(none).toEqual({ kind: 'text', text: 'None of these credits counts toward CIS, so this list doesn’t bring you closer to finishing.' });
    expect(paceLineHtml(none)).toBe('<p class="pace-line" data-pace-line>None of these credits counts toward CIS, so this list doesn’t bring you closer to finishing.</p>');
    // A sequence course that is needed for its sequence only is among the credits still to take: it counts for the pace.
    const held = having(...everything('GEO 206', 'HUM 101').filter(code => code !== 'MGT 462'));
    expect(said(['HIS 132'], added(held))).toBe('3 credits in Spring 2026 — at this pace you finish Fall 2026, one semester after your target.');
    expect(said(['HIS 132', 'MGT 462'], added(held))).toBe('6 credits in Spring 2026 — at this pace you finish in your target semester.');
    // One credit.
    expect(said(['ORI 100'], added(having('ENG 131:-@Fall 2026')))).toMatch(/^1 credit in Spring 2027 — at this pace you finish /);
  });

  it('counts the sequence course that the typed courses make necessary', () => {
    // Everything is passed but four courses; GEO 206 holds the Social sciences pick, and the
    // pick of ENG 210 is still open: 15 credits left, and a sequence could still go through it.
    const open = ['MGT 462', 'MGT 422', 'CIS 461', 'CIS 410', 'ENG 210'];
    const transcript = added(having(...everything('GEO 206', 'ENG 210').filter(code => !open.includes(code))));
    // Typed with ENG 210, the five courses finish everything in one term.
    expect(said(open, transcript)).toBe('15 credits in Spring 2026 — at this pace you finish in your target semester.');
    // Typed with HUM 101 instead, all five count as well, but HUM 101 takes the pick the
    // sequence needed: a sequence course is then still to take, with 3 extra credits. One term more.
    const closing = ['MGT 462', 'MGT 422', 'CIS 461', 'CIS 410', 'HUM 101'];
    expect(said(closing, transcript)).toBe('15 credits in Spring 2026 — at this pace you finish Fall 2026, one semester after your target.');
    // The finish is never earlier than what is left once the typed courses are taken allows.
    expect(paceLineOf({ left: 15, after: 3, counting: 15, total: 15, latest: term('Fall 2025'), term: null, settings: defaultSettings() })).toMatchObject({ finish: term('Fall 2026') });
    expect(paceLineOf({ left: 15, after: 0, counting: 15, total: 15, latest: term('Fall 2025'), term: null, settings: defaultSettings() })).toMatchObject({ finish: term('Spring 2026') });
    // A typed course that is on the transcript without credit (a W) is taken again: it is
    // taken off what is left like any other, once. 92 credits at 3 a term: 31 terms.
    expect(said(['BIO 127'], added(b))).toBe('3 credits in Spring 2026 — at this pace you finish Spring 2041, 25 semesters after your target.');
    // The same for a course that was failed: 118 credits at 3 a term, 40 terms from Spring 2026.
    expect(said(['MGT 321'], added(having('ENG 131@Fall 2025', 'MGT 321:F@Fall 2025')))).toBe('3 credits in Spring 2026 — at this pace you finish Fall 2045, 33 semesters after your target.');
  });

  it('never names a finish without the caveat', () => {
    for (const transcript of [added(a), added(a, { target: term('Fall 2029') }), added(a, { summers: true }), added(b), added(a, {}, false)]) {
      for (const codes of [FIFTEEN, ['MGT 321'], ['MGT 321', 'BIO 230'], ['HIS 132', 'ENG 210']]) {
        const html = paceLineHtml(paceLineFor(typed(codes), curriculum, transcript));
        expect(html, codes.join()).toMatch(/at this pace you finish[\s\S]*<\/p>\s*<p class="caveat">Credits only — course order may add semesters\.<\/p>\s*<\/div>$/);
      }
    }
    // A line that names no finish has none, and no lists.
    for (const codes of [['BIO 230'], ['ENG 131']]) {
      const html = paceLineHtml(paceLineFor(typed(codes), curriculum, added(a)));
      expect(html).not.toMatch(/caveat|<select|at this pace/);
    }
    // While rows still need fixing the line is shown all the same; the card says the pace may change.
    expect(said(FIFTEEN, added(a, {}, false))).toBe('15 credits in Spring 2027 — at this pace you finish Fall 2029, one semester after your target.');
  });

  it('waits for the legacy answer', () => {
    // A typed row shows the question: the line points to it and names no finish.
    const waiting = paceLineFor(typed(['FIN 201', 'CIS 499'], { legacy: null }), curriculum, added(b));
    expect(waiting).toEqual({ kind: 'text', text: 'Answer “Are you a legacy CIS student?” to see your pace.' });
    expect(paceLineHtml(waiting)).not.toMatch(/<select|caveat|data-legacy/);
    // Answered, the line follows the answers: three credits fewer count on Yes.
    expect(said(['FIN 201', 'CIS 499'], added(b), { legacy: false })).toBe('6 credits in Spring 2026 — at this pace you finish Fall 2033, 10 semesters after your target.');
    expect(said(['FIN 201', 'CIS 499'], added(b), { legacy: true })).toBe('3 of your 6 credits in Spring 2026 count toward CIS — at this pace you finish Fall 2040, 25 semesters after your target.');
    // With the first made-up transcript nothing depends on the answer: the line is there before it.
    expect(said(FIFTEEN, added(a), { legacy: null })).toBe('15 credits in Spring 2027 — at this pace you finish Fall 2029, one semester after your target.');
  });

  it('asks the legacy question when only the credits left depend on it', () => {
    // No typed row asks (CIS 300 counts either way), but the transcript's FLS 161 changes the credits still to take.
    const list = typed(['CIS 300'], { legacy: null });
    const view = paceLineFor(list, curriculum, added(b));
    expect(view).toEqual({ kind: 'ask', because: 'Your transcript has FLS 161, which counts as an elective only for legacy students.' });
    const html = paceLineHtml(view);
    expect(html).toMatch(/<div class="pace-line" data-pace-line>\s*<div class="legacy-ask" role="group" aria-label="Are you a legacy CIS student\?">\s*<p>Are you a legacy CIS student\?<\/p>\s*<div class="legacy-buttons">\s*<button type="button" class="btn secondary" data-legacy="yes">Yes<\/button>\s*<button type="button" class="btn secondary" data-legacy="no">No<\/button>\s*<\/div>\s*<p class="condition">Your transcript has <span class="code">FLS 161<\/span>, which counts as an elective only for legacy students\.<\/p>/);
    expect(html).not.toMatch(/at this pace|<select|caveat/);
    // 89 credits still to take with Yes, 92 with No: different finishes.
    expect(said(['CIS 300'], added(b), { legacy: true })).toBe('3 credits in Spring 2026 — at this pace you finish Fall 2040, 25 semesters after your target.');
    expect(said(['CIS 300'], added(b), { legacy: false })).toBe('3 credits in Spring 2026 — at this pace you finish Spring 2041, 25 semesters after your target.');
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
    expect(paceLineOf({ left: 5, after: 5, counting: 0, total: 3, latest: term('Fall 2026'), term: null, settings: defaultSettings() })).toEqual({ kind: 'no-count' });
  });

  it('holds for any numbers', () => {
    const SEED = 20261120;
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
    const seen = { on: 0, before: 0, after: 0, summerTarget: 0, laterTerm: 0, sameTerm: 0 };
    for (let i = 0; i < 3000; i++) {
      const left = whole(1, 140);
      const counting = whole(1, 24);
      const extra = whole(0, 9);
      const latest: Term = { season: seasons[whole(0, 2)]!, year: whole(2019, 2032) };
      const summers = next() < 0.4;
      const chosenTarget: Term | null = next() < 0.3 ? null : { season: summers ? seasons[whole(0, 2)]! : (next() < 0.5 ? 'Spring' : 'Fall'), year: whole(latest.year, latest.year + 12) };
      const settings: PaceSettings = { ...defaultSettings(), most: whole(1, 24), summers, target: chosenTarget };
      if (settings.fewest > settings.most) Object.assign(settings, { fewest: settings.most });
      const first: Term = latest.season === 'Fall' ? { season: 'Spring', year: latest.year + 1 } : { season: 'Fall', year: latest.year };
      const skip = whole(0, 5);
      const chosenTerm: Term = { season: (halves(first) + skip) % 2 === 1 ? 'Fall' : 'Spring', year: Math.floor((halves(first) + skip) / 2) };
      const label = `seed ${SEED}, case ${i}: ${left} left, ${counting} counting after ${termName(latest)}, term ${termName(chosenTerm)}, ${JSON.stringify(settings)}`;
      // What is left once this term's courses are taken: usually the rest, sometimes 3 more (a sequence course made necessary).
      const after = left - counting + (next() < 0.2 ? 3 : 0);
      const line = paceLineOf({ left, after, counting, total: counting + extra, latest, term: chosenTerm, settings });
      if (line.kind !== 'line') throw new Error(`${label}: no line`);
      // The terms offered: the first Fall or Spring after the latest term and the next three; no summer.
      expect(line.terms.map(halves), label).toEqual([0, 1, 2, 3].map(n => halves(first) + n));
      expect(line.terms.some(one => one.season === 'Summer'), label).toBe(false);
      // The chosen term is used when it is offered; otherwise the first.
      const used = skip <= 3 ? chosenTerm : first;
      expect(line.term, label).toEqual(used);
      if (skip > 0 && skip <= 3) seen.laterTerm++;
      // The finish: this term, and then what is left after it ÷ pace, rounded up, in Fall and
      // Spring terms. Never a summer, never before the term, never earlier than the plain count.
      const more = after <= 0 ? 0 : Math.ceil(after / counting);
      expect(line.finish.season, label).not.toBe('Summer');
      expect(halves(line.finish), label).toBe(halves(used) + more);
      expect(halves(line.finish), label).toBeGreaterThanOrEqual(halves(used) + Math.ceil(left / counting) - 1);
      if (after <= 0) { seen.sameTerm++; expect(line.finish, label).toEqual(used); }
      // Against the student's own target, in calendar order.
      const later = calendar(line.finish) - calendar(line.target);
      if (line.target.season === 'Summer') seen.summerTarget++;
      if (later > 0) { seen.after++; expect(line.compare.kind, label).toBe('after'); }
      else if (later < 0) { seen.before++; expect(line.compare.kind, label).toBe('before'); }
      else { seen.on++; expect(line.compare, label).toEqual({ kind: 'on' }); }
      if (line.compare.kind !== 'on') {
        // By that many Fall and Spring terms; a target summer is one step.
        const steps = line.target.season === 'Summer'
          ? (later > 0 ? halves(line.finish) - (line.target.year * 2) : (line.target.year * 2 + 1) - halves(line.finish))
          : Math.abs(halves(line.finish) - halves(line.target));
        expect(line.compare.semesters, label).toBe(steps);
        expect(line.compare.semesters, label).toBeGreaterThan(0);
      }
      // The list of targets has the target, in order, each once; a summer in it is the target itself.
      const names = line.targets.map(termName);
      expect(names, label).toContain(termName(line.target));
      expect(new Set(names).size, label).toBe(names.length);
      expect(line.targets.filter(one => one.season === 'Summer' && termName(one) !== termName(line.target)), label).toEqual([]);
      // A later term never gives an earlier finish; fewer counting credits never give an earlier one; credits that do not count change nothing.
      const at = (over: Partial<{ counting: number; after: number; term: Term }>) => paceLineOf({ left, after, counting, total: counting + extra, latest, term: used, settings, ...over });
      const laterTerm = at({ term: line.terms[Math.min(3, line.terms.findIndex(one => termName(one) === termName(used)) + 1)]! });
      if (laterTerm.kind === 'line') expect(halves(laterTerm.finish), label).toBeGreaterThanOrEqual(halves(line.finish));
      if (counting > 1) { const fewer = at({ counting: counting - 1, after: after + 1 }); if (fewer.kind === 'line') expect(halves(fewer.finish), label).toBeGreaterThanOrEqual(halves(line.finish)); }
      // With no counting credits no finish is named.
      expect(at({ counting: 0 }), label).toEqual({ kind: 'no-count' });
    }
    for (const [what, times] of Object.entries(seen)) expect(times, what).toBeGreaterThan(20);
  });
});

export type { Entry };
