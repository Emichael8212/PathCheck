// F08: one answer per typed course, without a transcript (docs/sprints/F08.md; docs/BRIEF.md
// §4 Flow A step 3; the owner's answers of 2026-11-15 and 2026-11-16). The rules; the page
// is in tests/check.test.ts and tests/check-page.test.ts.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import rawData from '../docs/curriculum/provisional-current.json';
import madeUp from './fixtures/made-up-program.json';
import { answersFor, legacyMatters, levelOf, reminderFor, type Answer } from '../src/answers';
import { curriculum, loadCurriculum, normalizeCode, type Curriculum } from '../src/curriculum';
import { entryFor, type Entry } from '../src/entries';
import { placeCourses } from '../src/placement';
import { courseStandings } from '../src/transcript';

const CONDITION = 'unless you’ve already passed it or filled this slot';
const WAITING = 'Answer “Are you a legacy CIS student?” to see this.';
const LEGACY_ONLY = 'Doesn’t count toward CIS. Legacy students only.';
const YES = true;
const NO = false;
const NOT_ANSWERED = null;

const entries = (codes: readonly string[], program: Curriculum = curriculum): Entry[] => codes.map(code => entryFor(normalizeCode(code) ?? code, program));
/** The answers as short lines: "✓ …" counts, "✗ …" doesn't, "?" the legacy question, "… " waiting. */
const said = (answer: Answer): string => (answer.kind === 'counts' ? `✓ ${answer.text}` : answer.kind === 'no' ? `✗ ${answer.text}` : answer.kind === 'ask' ? '?' : `… ${answer.text}`);
const ask = (codes: readonly string[], legacy: boolean | null = NOT_ANSWERED, program: Curriculum = curriculum): string[] =>
  answersFor(entries(codes, program), program, legacy).map(said);
const other = loadCurriculum(madeUp);

describe('courses that count', () => {
  it('says which block a listed course counts toward', () => {
    expect(ask(['MGT 321', 'ACT 215', 'ENG 131', 'FIN 201', 'ORI 100'])).toEqual([
      '✓ Counts toward CIS — Business core', '✓ Counts toward CIS — Pre-professional', '✓ Counts toward CIS — Composition',
      '✓ Counts toward CIS — CIS electives', '✓ Counts toward CIS — Orientation',
    ]);
    // The condition goes with every one of them.
    for (const answer of answersFor(entries(['MGT 321', 'FIN 201', 'ENG 131']), curriculum, NOT_ANSWERED)) expect(answer).toMatchObject({ kind: 'counts', condition: CONDITION });
    // The answer is the same whatever the legacy answer, and however the code was typed.
    for (const legacy of [YES, NO, NOT_ANSWERED]) expect(ask(['mgt-321', 'eng131'], legacy)).toEqual(['✓ Counts toward CIS — Business core', '✓ Counts toward CIS — Composition']);
    expect(ask([])).toEqual([]);
  });

  it('names the rule for an elective', () => {
    expect(ask(['MKT 410', 'CIS 499', 'ECO 301'])).toEqual([
      '✓ Counts toward CIS: elective (300/400-level MKT)', '✓ Counts toward CIS: elective (300/400-level CIS)', '✓ Counts toward CIS: elective (300/400-level ECO)',
    ]);
    expect(answersFor(entries(['MKT 410']), curriculum, NOT_ANSWERED)[0]).toEqual({ kind: 'counts', text: 'Counts toward CIS: elective (300/400-level MKT)', condition: CONDITION });
    expect(entries(['MKT 410'])[0]?.title).toBe('');
    expect(levelOf(curriculum)).toBe('300/400-level');
    // Another program, another rule: one hundred only.
    expect(levelOf(other)).toBe('300-level');
    expect(ask(['XC 351'], NOT_ANSWERED, other)).toEqual(['✓ Counts toward CIS: elective (300-level XC)']);
  });
});

describe('courses that share a place', () => {
  it('lets the first typed course fill a shared pick', () => {
    expect(ask(['ENG 131', 'ENG 140'])).toEqual(['✓ Counts toward CIS — Composition', '✗ Doesn’t count — it fills the same requirement as ENG 131.']);
    expect(ask(['ENG 140', 'ENG 131'])).toEqual(['✓ Counts toward CIS — Composition', '✗ Doesn’t count — it fills the same requirement as ENG 140.']);
    // Three for one pick: the second and the third both name the first.
    expect(ask(['SOC 110', 'GEO 206', 'ANT 113'])).toEqual([
      '✓ Counts toward CIS — Social sciences', '✗ Doesn’t count — it fills the same requirement as SOC 110.', '✗ Doesn’t count — it fills the same requirement as SOC 110.',
    ]);
    // Courses for different picks do not get in each other's way.
    expect(ask(['ENG 131', 'GEO 206', 'HUM 101']).every(line => line.startsWith('✓'))).toBe(true);
  });

  it('names every course that fills a pick for two', () => {
    expect(ask(['XAA 110', 'XAA 120', 'XAA 130'], NOT_ANSWERED, other)).toEqual([
      '✓ Counts toward CIS — Basics', '✓ Counts toward CIS — Basics', '✗ Doesn’t count — it fills the same requirement as XAA 110 and XAA 120.',
    ]);
    // XAA 110 is that program's sequence course: it is placed first, then typed order.
    expect(ask(['XAA 130', 'XAA 110', 'XAA 120'], NOT_ANSWERED, other)).toEqual([
      '✓ Counts toward CIS — Basics', '✓ Counts toward CIS — Basics', '✗ Doesn’t count — it fills the same requirement as XAA 110 and XAA 130.',
    ]);
  });

  it('gives a shared pick to the sequence course in both typed orders', () => {
    for (const codes of [['GEO 206', 'HIS 132'], ['HIS 132', 'GEO 206']]) {
      const answers = Object.fromEntries(codes.map((code, i) => [code, ask(codes)[i]]));
      expect(answers, codes.join()).toEqual({ 'HIS 132': '✓ Counts toward CIS — Social sciences', 'GEO 206': '✗ Doesn’t count — it fills the same requirement as HIS 132.' });
    }
    for (const codes of [['HUM 101', 'ENG 210'], ['ENG 210', 'HUM 101']]) {
      const answers = Object.fromEntries(codes.map((code, i) => [code, ask(codes)[i]]));
      expect(answers, codes.join()).toEqual({ 'ENG 210': '✓ Counts toward CIS — Humanities', 'HUM 101': '✗ Doesn’t count — it fills the same requirement as ENG 210.' });
    }
  });

  it('counts the first three electives and names them to the fourth', () => {
    const filled = '✗ Doesn’t count — your 3 CIS elective places are already filled by MKT 410, CIS 499 and ECO 301.';
    expect(ask(['MKT 410', 'CIS 499', 'ECO 301', 'ACT 350'])).toEqual([
      '✓ Counts toward CIS: elective (300/400-level MKT)', '✓ Counts toward CIS: elective (300/400-level CIS)', '✓ Counts toward CIS: elective (300/400-level ECO)', filled,
    ]);
    expect(ask(['MKT 410', 'CIS 499', 'ECO 301', 'ACT 350', 'MGT 499']).slice(3)).toEqual([filled, filled]);
    // The named elective takes a place in typed order, like any other.
    expect(ask(['MKT 410', 'FIN 201', 'CIS 499', 'ECO 301'])).toEqual([
      '✓ Counts toward CIS: elective (300/400-level MKT)', '✓ Counts toward CIS — CIS electives', '✓ Counts toward CIS: elective (300/400-level CIS)',
      '✗ Doesn’t count — your 3 CIS elective places are already filled by MKT 410, FIN 201 and CIS 499.',
    ]);
  });
});

describe('courses that do not count', () => {
  it("says a course outside the curriculum doesn't count", () => {
    expect(ask(['BIO 230', 'XYZ 101', 'MKT 299', 'ECO 500'])).toEqual(Array(4).fill('✗ Doesn’t count toward CIS — not in the CIS curriculum'));
    for (const legacy of [YES, NO]) expect(ask(['BIO 230'], legacy)).toEqual(['✗ Doesn’t count toward CIS — not in the CIS curriculum']);
  });

  it('never counts the two courses that never count, and still counts their neighbours', () => {
    expect(ask(['CIS 304', 'CIS 415'])).toEqual([
      '✗ Doesn’t count toward CIS — CIS 304 isn’t in the current CIS curriculum.', '✗ Doesn’t count toward CIS — CIS 415 isn’t in the current CIS curriculum.',
    ]);
    // They take no elective place from a course typed after them.
    expect(ask(['CIS 304', 'CIS 415', 'CIS 303', 'CIS 305', 'CIS 414']).slice(2)).toEqual(Array(3).fill('✓ Counts toward CIS: elective (300/400-level CIS)'));
    for (const legacy of [YES, NO]) expect(ask(['cis-304', 'CIS 303'], legacy).map(line => line[0])).toEqual(['✗', '✓']);
    // The made-up program has its own exception, in its own words.
    expect(ask(['XC 350', 'XC 351'], NOT_ANSWERED, other)).toEqual(['✗ Doesn’t count toward CIS — XC 350 isn’t in the current CIS curriculum.', '✓ Counts toward CIS: elective (300-level XC)']);
  });
});

describe('the legacy courses', () => {
  it('asks the legacy question in place of an answer', () => {
    expect(ask(['FLS 161', 'MGT 220', 'MGT 203'])).toEqual(['?', '?', '?']);
    expect(ask(['fls-161', 'MGT 321', 'BIO 230'])).toEqual(['?', '✓ Counts toward CIS — Business core', '✗ Doesn’t count toward CIS — not in the CIS curriculum']);
    expect(legacyMatters(entries(['FLS 161']), curriculum)).toBe(true);
    // A list without these courses never asks.
    for (const codes of [[], ['MGT 321', 'MKT 410', 'BIO 230', 'CIS 304'], ['ENG 131', 'ENG 140', 'GEO 206', 'HIS 132']]) {
      expect(ask(codes), codes.join()).not.toContain('?');
      expect(legacyMatters(entries(codes), curriculum)).toBe(false);
    }
  });

  it('asks about PSY 251 only when its pick is shared', () => {
    // With its pick to itself it is an ordinary course of that block.
    for (const legacy of [YES, NO, NOT_ANSWERED]) expect(ask(['PSY 251'], legacy)).toEqual(['✓ Counts toward CIS — Social sciences']);
    expect(legacyMatters(entries(['PSY 251', 'MGT 321']), curriculum)).toBe(false);
    // With another course of that pick, which of the two counts depends on the answer.
    expect(ask(['PSY 251', 'GEO 206'])).toEqual(['?', `… ${WAITING}`]);
    expect(ask(['GEO 206', 'PSY 251'])).toEqual(['✓ Counts toward CIS — Social sciences', '?']);
    // When the answer would change nothing, nothing is asked: with the three elective
    // places full, PSY 251 keeps its pick for a legacy student too.
    expect(ask(['PSY 251', 'GEO 206', 'MKT 410', 'CIS 499', 'ECO 301']).slice(0, 2)).toEqual([
      '✓ Counts toward CIS — Social sciences', '✗ Doesn’t count — it fills the same requirement as PSY 251.',
    ]);
    expect(legacyMatters(entries(['PSY 251', 'GEO 206', 'MKT 410', 'CIS 499', 'ECO 301']), curriculum)).toBe(false);
    for (const legacy of [YES, NO]) expect(ask(['PSY 251', 'GEO 206', 'MKT 410', 'CIS 499', 'ECO 301'], legacy)[0]).toBe('✓ Counts toward CIS — Social sciences');
    // The sequence course holds the pick either way, so it has its answer already.
    expect(ask(['PSY 251', 'HIS 132'])).toEqual(['?', '✓ Counts toward CIS — Social sciences']);
    expect(ask(['HIS 132', 'PSY 251'])).toEqual(['✓ Counts toward CIS — Social sciences', '?']);
  });

  it('counts a legacy elective on Yes, in one of the three places', () => {
    expect(answersFor(entries(['FLS 161']), curriculum, YES)).toEqual([{ kind: 'counts', text: 'Counts toward CIS: elective (legacy)', condition: CONDITION }]);
    expect(ask(['FLS 161', 'MGT 220', 'MGT 203'], YES)).toEqual(Array(3).fill('✓ Counts toward CIS: elective (legacy)'));
    expect(ask(['FLS 161', 'MKT 410', 'CIS 499', 'ECO 301'], YES)).toEqual([
      '✓ Counts toward CIS: elective (legacy)', '✓ Counts toward CIS: elective (300/400-level MKT)', '✓ Counts toward CIS: elective (300/400-level CIS)',
      '✗ Doesn’t count — your 3 CIS elective places are already filled by FLS 161, MKT 410 and CIS 499.',
    ]);
    // Typed after three electives, the legacy course is the one left out.
    expect(ask(['MKT 410', 'CIS 499', 'ECO 301', 'FLS 161'], YES)[3]).toBe('✗ Doesn’t count — your 3 CIS elective places are already filled by MKT 410, CIS 499 and ECO 301.');
    // PSY 251 beside another course of its pick: both count.
    for (const codes of [['PSY 251', 'GEO 206'], ['GEO 206', 'PSY 251']]) {
      const answers = Object.fromEntries(codes.map((code, i) => [code, ask(codes, YES)[i]]));
      expect(answers, codes.join()).toEqual({ 'GEO 206': '✓ Counts toward CIS — Social sciences', 'PSY 251': '✓ Counts toward CIS: elective (legacy)' });
    }
  });

  it('places PSY 251 for a legacy student when the electives are full', () => {
    const full = ['MKT 410', 'CIS 499', 'ECO 301'];
    // Moving it would gain nothing: it keeps its pick.
    expect(ask([...full, 'PSY 251', 'GEO 206'], YES).slice(3)).toEqual(['✓ Counts toward CIS — Social sciences', '✗ Doesn’t count — it fills the same requirement as PSY 251.']);
    // Its pick held by the sequence course and no elective place free: it fits nowhere.
    expect(ask([...full, 'HIS 132', 'PSY 251'], YES).slice(3)).toEqual(['✓ Counts toward CIS — Social sciences', '✗ Doesn’t count — it fills the same requirement as HIS 132.']);
    expect(ask([...full, 'HIS 132', 'PSY 251'], NO)[4]).toBe(`✗ ${LEGACY_ONLY}`);
    expect(ask([...full, 'HIS 132', 'PSY 251'])[4]).toBe('?');
  });

  it('does not count a legacy course on No', () => {
    expect(ask(['FLS 161', 'MGT 220', 'MGT 203'], NO)).toEqual(Array(3).fill(`✗ ${LEGACY_ONLY}`));
    expect(ask(['GEO 206', 'PSY 251'], NO)).toEqual(['✓ Counts toward CIS — Social sciences', `✗ ${LEGACY_ONLY}`]);
    expect(ask(['PSY 251', 'GEO 206'], NO)).toEqual(['✓ Counts toward CIS — Social sciences', '✗ Doesn’t count — it fills the same requirement as PSY 251.']);
    // They take no elective place.
    expect(ask(['FLS 161', 'MKT 410', 'CIS 499', 'ECO 301'], NO).slice(1).every(line => line.startsWith('✓'))).toBe(true);
  });

  it('shows no verdict that depends on the legacy answer', () => {
    expect(ask(['FLS 161', 'MKT 410', 'CIS 499', 'ECO 301'])).toEqual([
      '?', '✓ Counts toward CIS: elective (300/400-level MKT)', '✓ Counts toward CIS: elective (300/400-level CIS)', `… ${WAITING}`,
    ]);
    // ECO 301 would count or not; ACT 350 would not count either way, but for other courses.
    expect(ask(['MKT 410', 'CIS 499', 'FLS 161', 'ECO 301', 'ACT 350'])).toEqual([
      '✓ Counts toward CIS: elective (300/400-level MKT)', '✓ Counts toward CIS: elective (300/400-level CIS)', '?', `… ${WAITING}`, `… ${WAITING}`,
    ]);
    expect(ask(['PSY 251', 'GEO 206'])[1]).toBe(`… ${WAITING}`);
    // With three places taken before it, the legacy course is still the one to ask about.
    expect(ask(['MKT 410', 'CIS 499', 'ECO 301', 'FLS 161'])).toEqual([
      '✓ Counts toward CIS: elective (300/400-level MKT)', '✓ Counts toward CIS: elective (300/400-level CIS)', '✓ Counts toward CIS: elective (300/400-level ECO)', '?',
    ]);
  });
});

describe('whatever the list', () => {
  const SEED = 20261116;
  const random = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = [
    'PSY 251', 'FLS 161', 'MGT 220', 'MGT 203', 'PSY 251', 'FLS 161', 'HIS 131', 'HIS 132', 'ENG 209', 'ENG 210', 'GEO 206', 'SOC 110', 'HUM 101', 'ENG 131', 'ENG 140',
    'MGT 321', 'CIS 300', 'FIN 201', 'MKT 410', 'CIS 499', 'ECO 301', 'ACT 350', 'MGT 499', 'CIS 304', 'CIS 415', 'BIO 230', 'XYZ 101',
  ];
  const lists = (count: number): { label: string; codes: string[] }[] => {
    const next = random(SEED);
    return Array.from({ length: count }, (_, i) => {
      const codes = [...new Set(Array.from({ length: 1 + Math.floor(next() * 9) }, () => pool[Math.floor(next() * pool.length)] as string))];
      return { label: `seed ${SEED}, list ${i}: ${codes.join(', ')}`, codes };
    });
  };

  it('agrees with the placing rules for any list', () => {
    for (const { label, codes } of lists(500)) {
      const typed = entries(codes);
      for (const legacy of [YES, NO]) {
        const answers = answersFor(typed, curriculum, legacy);
        expect(answers, label).toHaveLength(codes.length);
        // Placed independently, as the contract says: one state, typed order.
        const rows = codes.map(code => ({ code, term: '', credits: 0, grade: null, transfer: false }));
        const placement = placeCourses(courseStandings(rows, curriculum.grades), curriculum, { legacy });
        const placed = [
          ...placement.blocks.flatMap(one => [...one.required.filter(place => place.state !== 'needed').map(place => place.course.code), ...one.picks.flatMap(pick => pick.filled.map(filled => filled.course.code))]),
          ...placement.electives.filled.map(filled => filled.course.code),
        ];
        const counting = codes.filter((_, i) => answers[i]?.kind === 'counts');
        expect([...counting].sort(), `${label} / ${legacy}`).toEqual([...placed].sort());
        // With the answer known every row is a verdict, and nothing else.
        for (const answer of answers) expect(['counts', 'no'], label).toContain(answer.kind);
        // Three electives at most, a legacy elective among them, whatever else the course is listed as.
        const asElective = answers.filter(answer => answer.kind === 'counts' && /: elective \(|— CIS electives$/.test(answer.text));
        expect(asElective.length, label).toBeLessThanOrEqual(3);
        expect(asElective.length, label).toBe(placement.electives.filled.length);
        // A course named as filling a place is itself a course that counts.
        for (const answer of answers) {
          if (answer.kind !== 'no') continue;
          const named = /(?:same requirement as|already filled by) (.+)\.$/.exec(answer.text)?.[1]?.split(/, | and /) ?? [];
          for (const code of named) expect(counting, `${label} / ${answer.text}`).toContain(code);
        }
        for (const never of ['CIS 304', 'CIS 415', 'BIO 230', 'XYZ 101']) expect(counting, label).not.toContain(never);
        if (!legacy) for (const never of ['FLS 161', 'MGT 220', 'MGT 203']) expect(counting, label).not.toContain(never);
      }
    }
  });

  it('never says Counts without the condition', () => {
    for (const { label, codes } of lists(300)) {
      for (const legacy of [YES, NO, NOT_ANSWERED]) {
        for (const answer of answersFor(entries(codes), curriculum, legacy)) {
          if (answer.kind === 'counts') {
            expect(answer.condition, label).toBe(CONDITION);
            expect(answer.text, label).toMatch(/^Counts toward CIS/);
          } else if (answer.kind === 'no') {
            expect(answer.text, label).toMatch(/^Doesn’t count/);
          }
        }
      }
    }
  });

  it('waits only where the answer matters', () => {
    let asked = 0;
    let waited = 0;
    for (const { label, codes } of lists(600)) {
      const typed = entries(codes);
      const yes = answersFor(typed, curriculum, YES).map(said);
      const no = answersFor(typed, curriculum, NO).map(said);
      answersFor(typed, curriculum, NOT_ANSWERED).forEach((answer, i) => {
        const code = codes[i] as string;
        const legacyCourse = curriculum.electives.legacyOnly.some(course => course.code === code);
        // A verdict before the answer exactly when Yes and No say the same, word for word.
        if (yes[i] === no[i]) expect(said(answer), `${label} / ${code}`).toBe(yes[i]);
        else expect(answer.kind, `${label} / ${code}`).toBe(legacyCourse ? 'ask' : 'waiting');
        if (answer.kind === 'ask') { asked++; expect(legacyCourse, label).toBe(true); }
        if (answer.kind === 'waiting') { waited++; expect(answer.text).toBe(WAITING); }
      });
      expect(legacyMatters(typed, curriculum), label).toBe(yes.some((line, i) => line !== no[i] && curriculum.electives.legacyOnly.some(course => course.code === codes[i])));
    }
    expect(asked).toBeGreaterThan(100);
    expect(waited).toBeGreaterThan(20);
  });
});

describe('the reminder and the sentences', () => {
  it('reminds about the sequence when neither course is typed', () => {
    const reminder = 'Remember: you need HIS 132 or ENG 210 for the history/literature sequence.';
    expect(reminderFor(entries(['MGT 321']), curriculum)).toBe(reminder);
    expect(reminderFor(entries(['BIO 230', 'GEO 206', 'HUM 101']), curriculum)).toBe(reminder);
    // The first course of a sequence is not the one that sits in a pick: still reminded.
    expect(reminderFor(entries(['HIS 131']), curriculum)).toBe(reminder);
    expect(reminderFor(entries(['ENG 209', 'HIS 131']), curriculum)).toBe(reminder);
    expect(reminderFor(entries(['HIS 132']), curriculum)).toBeNull();
    expect(reminderFor(entries(['MGT 321', 'ENG 210']), curriculum)).toBeNull();
    expect(reminderFor(entries(['GEO 206', 'HIS 132']), curriculum)).toBeNull();
    // Nothing typed, nothing to be reminded about.
    expect(reminderFor([], curriculum)).toBeNull();
    // The two courses are the curriculum's.
    expect(rawData.sequence.alternatives.map(alternative => alternative.courses[1])).toEqual(['HIS-132', 'ENG-210']);
    // Another program is reminded of its own sequence course, by that program's name for it.
    expect(reminderFor(entries(['XAA 101'], other), other)).toMatch(/^Remember: you need XAA 110 for the .+ sequence\.$/);
    expect(reminderFor(entries(['XAA 101', 'XAA 110'], other), other)).toBeNull();
  });

  it('builds every sentence from the curriculum', () => {
    // One more elective place in the data: the sentence counts four and names four.
    const data = structuredClone(rawData) as unknown as { degreeCredits: number; electives: { credits: number; courseCount: number } };
    data.electives.courseCount += 1;
    data.electives.credits += 3;
    data.degreeCredits += 3;
    const four = loadCurriculum(data);
    expect(ask(['MKT 410', 'CIS 499', 'ECO 301', 'ACT 350', 'MGT 499'], NOT_ANSWERED, four)[4])
      .toBe('✗ Doesn’t count — your 4 CIS elective places are already filled by MKT 410, CIS 499, ECO 301 and ACT 350.');
    // A block by another name is called by that name.
    const renamed = structuredClone(rawData) as unknown as { blocks: { id: string; name: string }[] };
    renamed.blocks.find(block => block.id === 'business-core')!.name = 'Business foundation';
    expect(ask(['MGT 321'], NOT_ANSWERED, loadCurriculum(renamed))).toEqual(['✓ Counts toward CIS — Business foundation']);
    expect(ask(['XAA 101', 'XBBB 201'], NOT_ANSWERED, other)).toEqual(['✓ Counts toward CIS — Basics', '✓ Counts toward CIS — Depth']);
  });

  it("reaches the browser's storage in one place only", () => {
    const src = join(import.meta.dirname, '..', 'src');
    const naming = readdirSync(src, { recursive: true }).map(String).filter(file => /\.(tsx?|jsx?)$/.test(file))
      .filter(file => /localStorage|sessionStorage|indexedDB|document\.cookie/.test(readFileSync(join(src, file), 'utf8')));
    expect(naming).toEqual(['legacy.ts']);
  });
});
