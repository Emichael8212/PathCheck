// F08: one answer per typed course, without a transcript (docs/sprints/F08.md; docs/BRIEF.md
// §4 Flow A step 3; the owner's answers of 2026-11-15 and 2026-11-16). F12: the answers with
// a transcript (docs/sprints/F12.md), from "with a transcript" on. The rules; the page is in
// tests/check.test.ts and tests/check-page.test.ts. Every student here is made up.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import rawData from '../docs/curriculum/provisional-current.json';
import madeUp from './fixtures/made-up-program.json';
import sampleA from '../synthetic/transcripts/sample-a.json';
import sampleB from '../synthetic/transcripts/sample-b.json';
import { answersFor, legacyMatters, levelOf, reminderFor, type Answer, type TranscriptUse } from '../src/answers';
import { totalsOf } from '../src/credits';
import { curriculum, loadCurriculum, normalizeCode, type Curriculum } from '../src/curriculum';
import { entryFor, type Entry } from '../src/entries';
import { placeCourses } from '../src/placement';
import { openTranscript, reviewedStandings } from '../src/review';
import { courseStandings, type TranscriptRow } from '../src/transcript';

const CONDITION = 'unless you’ve already passed it or filled this slot';
const WAITING = 'Answer “Are you a legacy CIS student?” to see this.';
const LEGACY_ONLY = 'Doesn’t count toward CIS. Legacy students only.';
const YES = true;
const NO = false;
const NOT_ANSWERED = null;

const entries = (codes: readonly string[], program: Curriculum = curriculum): Entry[] => codes.map(code => entryFor(normalizeCode(code) ?? code, program));
/** The answers as short lines: "✓ …" counts, "✗ …" doesn't, "?" the legacy question, "… " waiting. */
const said = (answer: Answer): string => (answer.kind === 'counts' ? `✓ ${answer.text}` : answer.kind === 'no' ? `✗ ${answer.text}` : answer.kind === 'ask' ? '?' : answer.kind === 'needed' ? `! ${answer.text}` : `… ${answer.text}`);
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

// ---- F12: with a transcript ----
const PASSED = '✗ You already passed this';
const FILLED = '✗ This slot is already filled';
const RUNNING = '✗ Already in progress.';
// The owner's two answers of 2026-11-16 for a sequence course whose pick is held.
const neededFor = (sequence: string): string => `! Needed for the ${sequence} sequence (3 extra credits).`;
const takeInstead = (holder: string, take: string): string => `✗ Doesn’t count — same slot as ${holder}. Take ${take} for the sequence.`;
/** A made-up row: "ENG 131" is passed with a B; "ENG 131:D" has that grade; ":-" is in progress; ":T" is transfer credit. */
const rowOf = (entry: string, i = 0): TranscriptRow => {
  const [code = '', mark = 'B'] = entry.split(':');
  if (mark === 'T') return { code, term: 'Transfer credit', credits: 3, grade: 'T', transfer: true };
  return { code, term: `Term ${i + 1}`, credits: 3, grade: mark === '-' ? null : mark, transfer: false };
};
/** A reviewed transcript with these rows; `exact` is false when rows still need fixing. */
const having = (rows: readonly string[], exact = true): TranscriptUse => ({ standings: courseStandings(rows.map(rowOf), curriculum.grades), exact });
const askWith = (transcript: TranscriptUse, codes: readonly string[], legacy: boolean | null = NO): string[] =>
  answersFor(entries(codes), curriculum, legacy, transcript).map(said);
const blockOf = (code: string): string => {
  const block = curriculum.blocks.find(one => [...one.required, ...one.picks.flatMap(group => group.courses)].some(course => course.code === code));
  if (!block) throw new Error(`${code} is in no block`);
  return block.name;
};

describe('with a transcript', () => {
  it('says a passed course is already passed', () => {
    // By grade, at the lowest grade that counts, as transfer credit, and after a repeat.
    const transcript = having(['ENG 131:A', 'HIS 131:C', 'MAT 137:T', 'CIS 205:F', 'CIS 205:B', 'MKT 410']);
    expect(askWith(transcript, ['ENG 131', 'HIS 131', 'MAT 137', 'CIS 205', 'MKT 410'])).toEqual([PASSED, PASSED, PASSED, PASSED, PASSED]);
    // Whatever the legacy answer, and however the code was typed.
    for (const legacy of [YES, NO, NOT_ANSWERED]) expect(askWith(transcript, ['eng131', 'cis-205'], legacy)).toEqual([PASSED, PASSED]);
    // The repeat the other way round: the highest grade counts.
    expect(askWith(having(['CIS 205:B', 'CIS 205:F']), ['CIS 205'])).toEqual([PASSED]);
  });

  it('says a slot is filled by the transcript', () => {
    // A pick that a passed course holds, and one that a course in progress holds.
    const transcript = having(['ENG 131', 'ART 131:-', 'FIN 201', 'MKT 410', 'CIS 499:-']);
    expect(askWith(transcript, ['ENG 140', 'THE 111', 'MUS 121'])).toEqual([FILLED, FILLED, FILLED]);
    // Three electives on the transcript, passed or in progress: no place is left.
    expect(askWith(transcript, ['ECO 301', 'ACT 350'])).toEqual([FILLED, FILLED]);
    // With two, one place is open.
    expect(askWith(having(['FIN 201', 'MKT 410']), ['ECO 301'])).toEqual(['✓ Counts toward CIS: elective (300/400-level ECO)']);
  });

  it('counts a course that fills an open place', () => {
    const transcript = having(['ENG 131', 'ORI 100']);
    const answers = answersFor(entries(['MGT 321', 'ENG 132', 'FIN 201', 'MKT 410']), curriculum, NO, transcript);
    // A required place, a pick, a named elective and an elective by the rule: no condition on any.
    expect(answers).toEqual([
      { kind: 'counts', text: 'Counts toward CIS — Business core', condition: null },
      { kind: 'counts', text: 'Counts toward CIS — Composition', condition: null },
      { kind: 'counts', text: 'Counts toward CIS — CIS electives', condition: null },
      { kind: 'counts', text: 'Counts toward CIS: elective (300/400-level MKT)', condition: null },
    ]);
  });

  it('does not count a course in progress again', () => {
    const transcript = having(['MGT 321:-', 'MKT 410:-', 'ENG 131:-']);
    const typed = entries(['MGT 321', 'MKT 410', 'ENG 131']);
    for (const legacy of [YES, NO, NOT_ANSWERED]) {
      const answers = answersFor(typed, curriculum, legacy, transcript);
      expect(answers.map(said)).toEqual([RUNNING, RUNNING, RUNNING]);
      // Its credits are among those that don't count.
      expect(totalsOf(typed, answers)).toMatchObject({ total: 9, counts: 0, doesNotCount: 9 });
    }
  });

  it('counts a course that must be repeated', () => {
    // Below C, W and I: as if the course were not on the transcript.
    const transcript = having(['MGT 321:D', 'BIO 127:W', 'CIS 206:I', 'ENG 131:F', 'ECO 251:F', 'ECO 251:-', 'MKT 410:D']);
    expect(askWith(transcript, ['MGT 321', 'BIO 127', 'CIS 206', 'ENG 131', 'MKT 410'])).toEqual([
      '✓ Counts toward CIS — Business core', `✓ Counts toward CIS — ${blockOf('BIO 127')}`, '✓ Counts toward CIS — Business core', '✓ Counts toward CIS — Composition',
      '✓ Counts toward CIS: elective (300/400-level MKT)',
    ]);
    // A failing grade and a later row with no grade yet: in progress.
    expect(askWith(transcript, ['ECO 251'])).toEqual([RUNNING]);
    // A failed course of a pick does not hold the pick: the other course of it counts.
    expect(askWith(transcript, ['ENG 140'])).toEqual(['✓ Counts toward CIS — Composition']);
  });

  it('names the courses of the list that hold a place', () => {
    // Electives: two on the transcript, the first typed takes the last place, the next is told all three.
    expect(askWith(having(['FIN 201', 'MKT 410']), ['CIS 499', 'ECO 301'])).toEqual([
      '✓ Counts toward CIS: elective (300/400-level CIS)', '✗ Doesn’t count — your 3 CIS elective places are already filled by FIN 201, MKT 410 and CIS 499.',
    ]);
    // A pick the list itself fills, beside a transcript that leaves it open.
    expect(askWith(having(['ORI 100']), ['ENG 131', 'ENG 140'])).toEqual(['✓ Counts toward CIS — Composition', '✗ Doesn’t count — it fills the same requirement as ENG 131.']);
    // The sequence course still wins its pick among typed courses.
    expect(askWith(having(['ORI 100']), ['GEO 206', 'HIS 132'])).toEqual(['✗ Doesn’t count — it fills the same requirement as HIS 132.', '✓ Counts toward CIS — Social sciences']);
    // But a typed sequence course never pushes out a course of the transcript.
    expect(askWith(having(['GEO 206:-', 'ENG 210']), ['HIS 132'])).toEqual([FILLED]);
  });

  it("keeps the curriculum's no before the transcript", () => {
    const transcript = having(['BIO 230', 'CIS 304', 'XYZ 101:-', 'CIS 415:-', 'ENG 131']);
    for (const legacy of [YES, NO, NOT_ANSWERED]) {
      expect(askWith(transcript, ['BIO 230', 'CIS 304', 'XYZ 101', 'CIS 415'], legacy)).toEqual([
        '✗ Doesn’t count toward CIS — not in the CIS curriculum', '✗ Doesn’t count toward CIS — CIS 304 isn’t in the current CIS curriculum.',
        '✗ Doesn’t count toward CIS — not in the CIS curriculum', '✗ Doesn’t count toward CIS — CIS 415 isn’t in the current CIS curriculum.',
      ]);
    }
    // And when they are not on the transcript.
    expect(askWith(transcript, ['ART 101', 'CIS 304'].map(code => (code === 'ART 101' ? 'ZZZ 101' : code)))).toEqual([
      '✗ Doesn’t count toward CIS — not in the CIS curriculum', '✗ Doesn’t count toward CIS — CIS 304 isn’t in the current CIS curriculum.',
    ]);
  });

  it('points to the other sequence course while its pick is open', () => {
    // (a) The pick is held by another course, and a sequence can still go through an open pick.
    for (const other of ['GEO 206', 'GEO 206:-']) {
      const transcript = having(['HIS 131', other]);
      const typed = entries(['HIS 132']);
      for (const legacy of [YES, NO, NOT_ANSWERED]) {
        const answers = answersFor(typed, curriculum, legacy, transcript);
        expect(answers).toEqual([{ kind: 'no', text: 'Doesn’t count — same slot as GEO 206. Take ENG 210 for the sequence.' }]);
        // It doesn't count: its credits are among those that don't.
        expect(totalsOf(typed, answers)).toEqual({ total: 3, counts: 0, doesNotCount: 3, waiting: 0, needed: 0, pending: false });
      }
    }
    // The other way round.
    expect(askWith(having(['HUM 101']), ['ENG 210'])).toEqual([takeInstead('HUM 101', 'HIS 132')]);
    expect(askWith(having(['ENG 209', 'HUM 102:-']), ['ENG 210'])).toEqual([takeInstead('HUM 102', 'HIS 132')]);
    // A failed sequence course does not hold its pick: the pick is open, and it is the one to take.
    expect(askWith(having(['GEO 206', 'ENG 210:D']), ['HIS 132'])).toEqual([takeInstead('GEO 206', 'ENG 210')]);
    // A course of the list in the other pick does not close it: the transcript leaves it open.
    expect(askWith(having(['GEO 206']), ['HIS 132', 'HUM 101'])).toEqual([takeInstead('GEO 206', 'ENG 210'), `✓ Counts toward CIS — ${blockOf('HUM 101')}`]);
  });

  it('does not send away a sequence course when both picks are held', () => {
    // (b) Both picks are held by courses that belong to no sequence: needed for the sequence only.
    for (const rows of [['HIS 131', 'GEO 206', 'HUM 101'], ['GEO 206:-', 'HUM 101'], ['SOC 110', 'PHL 201:-']]) {
      const transcript = having(rows);
      const typed = entries(['HIS 132']);
      for (const legacy of [YES, NO, NOT_ANSWERED]) {
        const answers = answersFor(typed, curriculum, legacy, transcript);
        expect(answers, rows.join()).toEqual([{ kind: 'needed', text: 'Needed for the history sequence (3 extra credits).' }]);
        // Extra credits: in the total, in neither count.
        expect(totalsOf(typed, answers)).toEqual({ total: 3, counts: 0, doesNotCount: 0, waiting: 0, needed: 3, pending: false });
      }
      expect(askWith(transcript, ['ENG 210'])).toEqual([neededFor('literature')]);
    }
    // One of the two is enough: the first typed is the needed one, the other's slot is filled.
    expect(askWith(having(['GEO 206', 'HUM 101']), ['ENG 210', 'HIS 132'])).toEqual([neededFor('literature'), FILLED]);
    expect(askWith(having(['GEO 206', 'HUM 101']), ['HIS 132', 'ENG 210'])).toEqual([neededFor('history'), FILLED]);
    // The credits in the sentence are the course's own, from the curriculum.
    expect(curriculum.blocks.flatMap(block => block.picks.flatMap(group => group.courses)).filter(course => ['HIS 132', 'ENG 210'].includes(course.code)).map(course => course.credits)).toEqual([3, 3]);
  });

  it('says the slot is filled when a sequence is already on its way', () => {
    // Passed, in progress, or typed before it.
    expect(askWith(having(['GEO 206', 'ENG 210']), ['HIS 132'])).toEqual([FILLED]);
    expect(askWith(having(['GEO 206', 'ENG 210:-']), ['HIS 132'])).toEqual([FILLED]);
    expect(askWith(having(['HUM 101', 'HIS 132']), ['ENG 210'])).toEqual([FILLED]);
    // Or typed anywhere in the list and holding its pick.
    expect(askWith(having(['HUM 101']), ['ENG 210', 'HIS 132'])).toEqual([FILLED, '✓ Counts toward CIS — Social sciences']);
    expect(askWith(having(['GEO 206']), ['HIS 132', 'ENG 210'])).toEqual([FILLED, `✓ Counts toward CIS — ${blockOf('ENG 210')}`]);
    // With its pick open the course simply counts toward its block.
    expect(askWith(having(['HIS 131']), ['HIS 132'])).toEqual(['✓ Counts toward CIS — Social sciences']);
    // A course of the same pick that is no sequence course is simply told the slot is filled.
    expect(askWith(having(['HIS 131', 'GEO 206']), ['SOC 110'])).toEqual([FILLED]);
  });

  it('reminds of the sequence only when it is open', () => {
    const reminder = 'Remember: you need HIS 132 or ENG 210 for the history/literature sequence.';
    const typed = entries(['MGT 321']);
    expect(reminderFor(typed, curriculum, having(['HIS 131', 'ENG 209']))).toBe(reminder);
    expect(reminderFor(typed, curriculum, having(['HIS 132:D', 'ENG 210:W']))).toBe(reminder);
    expect(reminderFor(typed, curriculum, having(['HIS 132']))).toBeNull();
    expect(reminderFor(typed, curriculum, having(['ENG 210:-']))).toBeNull();
    expect(reminderFor(entries(['HIS 132']), curriculum, having(['ORI 100']))).toBeNull();
    expect(reminderFor([], curriculum, having(['ORI 100']))).toBeNull();
  });

  it('asks the legacy question when the transcript makes it matter', () => {
    // Two legacy courses passed: for a legacy student they hold two elective places.
    const transcript = having(['FLS 161', 'MGT 220']);
    const typed = ['CIS 499', 'MGT 321', 'ECO 301', 'ACT 350'];
    expect(askWith(transcript, typed, YES)).toEqual([
      '✓ Counts toward CIS: elective (300/400-level CIS)', '✓ Counts toward CIS — Business core',
      '✗ Doesn’t count — your 3 CIS elective places are already filled by FLS 161, MGT 220 and CIS 499.', '✗ Doesn’t count — your 3 CIS elective places are already filled by FLS 161, MGT 220 and CIS 499.',
    ]);
    expect(askWith(transcript, typed, NO)).toEqual([
      '✓ Counts toward CIS: elective (300/400-level CIS)', '✓ Counts toward CIS — Business core', '✓ Counts toward CIS: elective (300/400-level ECO)', '✓ Counts toward CIS: elective (300/400-level ACT)',
    ]);
    // Not answered: the first course whose answer depends on it asks, and says why; the next waits.
    const open = answersFor(entries(typed), curriculum, NOT_ANSWERED, transcript);
    expect(open.map(said)).toEqual(['✓ Counts toward CIS: elective (300/400-level CIS)', '✓ Counts toward CIS — Business core', '?', `… ${WAITING}`]);
    expect(open[2]).toEqual({ kind: 'ask', because: 'Your transcript has FLS 161 and MGT 220, which count as electives only for legacy students.' });
    expect(legacyMatters(entries(typed), curriculum, transcript)).toBe(true);
    expect(answersFor(entries(['FIN 201', 'CIS 499', 'ECO 301']), curriculum, NOT_ANSWERED, having(['FLS 161', 'MKT 410']))[1])
      .toEqual({ kind: 'ask', because: 'Your transcript has FLS 161, which counts as an elective only for legacy students.' });
    // Where the answer changes nothing, nothing is asked.
    expect(askWith(transcript, ['CIS 499', 'MGT 321'], NOT_ANSWERED)).toEqual(['✓ Counts toward CIS: elective (300/400-level CIS)', '✓ Counts toward CIS — Business core']);
    expect(legacyMatters(entries(['CIS 499', 'MGT 321']), curriculum, transcript)).toBe(false);
    // A typed legacy course that is already passed says so, whatever the answer: no question.
    for (const legacy of [YES, NO, NOT_ANSWERED]) expect(askWith(transcript, ['FLS 161', 'MGT 220'], legacy)).toEqual([PASSED, PASSED]);
    expect(legacyMatters(entries(['FLS 161']), curriculum, transcript)).toBe(false);
    // A typed legacy course that is not on the transcript asks on its own row, with no line of reasons.
    expect(answersFor(entries(['MGT 203']), curriculum, NOT_ANSWERED, transcript)).toEqual([{ kind: 'ask', because: null }]);
    expect(askWith(transcript, ['MGT 203'], YES)).toEqual(['✓ Counts toward CIS: elective (legacy)']);
    expect(askWith(transcript, ['MGT 203'], NO)).toEqual([`✗ ${LEGACY_ONLY}`]);
  });

  it('answers PSY 251 against a pick the transcript holds', () => {
    const transcript = having(['GEO 206']);
    expect(askWith(transcript, ['PSY 251'], NOT_ANSWERED)).toEqual(['?']);
    expect(askWith(transcript, ['PSY 251'], NO)).toEqual([FILLED]);
    expect(askWith(transcript, ['PSY 251'], YES)).toEqual(['✓ Counts toward CIS: elective (legacy)']);
    // A legacy student with every elective place held by the transcript: the slot is filled.
    expect(askWith(having(['GEO 206', 'FIN 201', 'MKT 410', 'CIS 499']), ['PSY 251'], YES)).toEqual([FILLED]);
    // A legacy student whose last elective place is taken by a course of their own list is
    // told so, with the courses that hold the places: the pick is not the whole reason.
    expect(askWith(having(['GEO 206', 'FIN 201', 'MKT 410']), ['PSY 251', 'CIS 499'], YES)).toEqual([
      '✗ Doesn’t count — your 3 CIS elective places are already filled by FIN 201, MKT 410 and CIS 499.', '✓ Counts toward CIS: elective (300/400-level CIS)',
    ]);
    expect(askWith(having(['GEO 206', 'FIN 201', 'MKT 410']), ['CIS 499', 'PSY 251'], YES)).toEqual([
      '✓ Counts toward CIS: elective (300/400-level CIS)', '✗ Doesn’t count — your 3 CIS elective places are already filled by FIN 201, MKT 410 and CIS 499.',
    ]);
    // Held by the student's own list: F08's sentence.
    expect(askWith(having(['ORI 100']), ['GEO 206', 'PSY 251'], NO)).toEqual(['✓ Counts toward CIS — Social sciences', `✗ ${LEGACY_ONLY}`]);
    // With its pick open it is an ordinary course of that block, whatever the answer.
    for (const legacy of [YES, NO, NOT_ANSWERED]) expect(askWith(having(['ORI 100']), ['PSY 251'], legacy)).toEqual(['✓ Counts toward CIS — Social sciences']);
    // PSY 251 passed on the transcript, another course of its pick typed: for a legacy
    // student it can be an elective, which leaves the pick to the typed course.
    expect(askWith(having(['PSY 251']), ['GEO 206'], YES)).toEqual(['✓ Counts toward CIS — Social sciences']);
    expect(askWith(having(['PSY 251']), ['GEO 206'], NO)).toEqual([FILLED]);
    expect(answersFor(entries(['GEO 206']), curriculum, NOT_ANSWERED, having(['PSY 251']))).toEqual([{ kind: 'ask', because: 'Your transcript has PSY 251, which counts as an elective only for legacy students.' }]);
  });

  it('keeps the condition while rows still need fixing', () => {
    const typed = entries(['MGT 321', 'ENG 131', 'ENG 140', 'FIN 201']);
    const answers = (exact: boolean): Answer[] => answersFor(typed, curriculum, NO, having(['ENG 131'], exact));
    // The checked rows are used either way; only "Counts" changes.
    expect(answers(false).map(said)).toEqual(answers(true).map(said));
    expect(answers(false).map(said)).toEqual(['✓ Counts toward CIS — Business core', PASSED, FILLED, '✓ Counts toward CIS — CIS electives']);
    expect(answers(false).filter(answer => answer.kind === 'counts')).toEqual([
      { kind: 'counts', text: 'Counts toward CIS — Business core', condition: CONDITION }, { kind: 'counts', text: 'Counts toward CIS — CIS electives', condition: CONDITION },
    ]);
    for (const answer of answers(true)) if (answer.kind === 'counts') expect(answer.condition).toBeNull();
  });

  it('uses the made-up transcripts as the review hands them on', () => {
    const use = (answer: unknown): TranscriptUse => ({ standings: reviewedStandings(openTranscript('made-up.pdf', answer, curriculum), curriculum.grades), exact: true });
    // The student of the design: passed, in progress (after a D), a pick held by a course in progress, open places.
    expect(askWith(use(sampleA), ['ENG 131', 'ECO 251', 'PED 122', 'MGT 321', 'CIS 300', 'FIN 201', 'ZZZ 101'])).toEqual([
      PASSED, RUNNING, FILLED, '✓ Counts toward CIS — Business core', `✓ Counts toward CIS — ${blockOf('CIS 300')}`, '✓ Counts toward CIS — CIS electives',
      '✗ Doesn’t count toward CIS — not in the CIS curriculum',
    ]);
    // The second: transfer and AP credit, a W, an F then a B, an I then in progress, a course outside the curriculum.
    expect(askWith(use(sampleB), ['ENG 131', 'HIS 131', 'BIO 127', 'CIS 205', 'CIS 206', 'BIO 230', 'MKT 410'])).toEqual([
      PASSED, PASSED, `✓ Counts toward CIS — ${blockOf('BIO 127')}`, PASSED, RUNNING, '✗ Doesn’t count toward CIS — not in the CIS curriculum', PASSED,
    ]);
    // Its legacy course makes the answer matter once two electives are typed.
    expect(askWith(use(sampleB), ['FIN 201', 'CIS 499'], NOT_ANSWERED)).toEqual(['✓ Counts toward CIS — CIS electives', '?']);
  });
});

describe('with a transcript, whatever the list', () => {
  const SEED = 20261117;
  const random = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = [
    'PSY 251', 'FLS 161', 'MGT 220', 'MGT 203', 'HIS 131', 'HIS 132', 'ENG 209', 'ENG 210', 'GEO 206', 'SOC 110', 'HUM 101', 'HUM 102', 'ENG 131', 'ENG 140', 'ORI 100',
    'MGT 321', 'CIS 300', 'FIN 201', 'MKT 410', 'CIS 499', 'ECO 301', 'ACT 350', 'MGT 499', 'CIS 304', 'CIS 415', 'BIO 230', 'XYZ 101',
  ];
  const marks = ['A', 'B', 'B', 'C', 'D', 'F', 'W', 'I', '-', '-', 'T'];

  it('never counts what the transcript already has, for any list', () => {
    const next = random(SEED);
    const pick = <T>(from: readonly T[]): T => from[Math.floor(next() * from.length)] as T;
    const use = (answer: unknown): TranscriptUse['standings'] => reviewedStandings(openTranscript('made-up.pdf', answer, curriculum), curriculum.grades);
    const madeUpOnes = [use(sampleA), use(sampleB)];
    const seen = { needed: 0, pointed: 0, asked: 0, filled: 0, counted: 0, passed: 0 };
    for (let i = 0; i < 400; i++) {
      // A transcript: one of the two made-up ones, or rows made here (repeats included).
      const rows = Array.from({ length: Math.floor(next() * 15) }, () => `${pick(pool)}:${pick(marks)}`);
      const standings = i % 10 < 2 ? madeUpOnes[i % 2]! : courseStandings(rows.map(rowOf), curriculum.grades);
      const codes = [...new Set(Array.from({ length: 1 + Math.floor(next() * 8) }, () => pick(pool)))];
      const typed = entries(codes);
      const held = new Map(standings.filter(one => one.standing === 'passed' || one.standing === 'in-progress').map(one => [one.code, one.standing]));
      const label = `seed ${SEED}, case ${i}: [${i % 10 < 2 ? 'made-up' : rows.join(', ')}] typed ${codes.join(', ')}`;
      for (const exact of [true, false]) {
        const transcript: TranscriptUse = { standings, exact };
        const known = { yes: answersFor(typed, curriculum, YES, transcript), no: answersFor(typed, curriculum, NO, transcript) };
        for (const legacy of [YES, NO]) {
          const answers = legacy ? known.yes : known.no;
          const planned = codes.filter(code => !held.has(code));
          const placement = placeCourses(standings, curriculum, { legacy, planned });
          const placedAsPlanned = [
            ...placement.blocks.flatMap(one => [...one.required.filter(place => place.state === 'planned').map(place => place.course.code), ...one.picks.flatMap(group => group.filled.filter(filled => filled.state === 'planned').map(filled => filled.course.code))]),
            ...placement.electives.filled.filter(filled => filled.state === 'planned').map(filled => filled.course.code),
          ];
          // "Counts" is said of exactly the courses the placing rules place as planned.
          expect(codes.filter((_, at) => answers[at]?.kind === 'counts').sort(), label).toEqual([...placedAsPlanned].sort());
          // The transcript alone, placed without the list: what it holds stays held.
          const alone = placeCourses(standings, curriculum, { legacy });
          const heldAlone = [
            ...alone.blocks.flatMap(one => [...one.required.filter(place => place.state !== 'needed').map(place => place.course.code), ...one.picks.flatMap(group => group.filled.map(filled => filled.course.code))]),
            ...alone.electives.filled.map(filled => filled.course.code),
          ];
          const heldWith = [
            ...placement.blocks.flatMap(one => [...one.required.filter(place => place.state === 'done' || place.state === 'in-progress').map(place => place.course.code), ...one.picks.flatMap(group => group.filled.filter(filled => filled.state !== 'planned').map(filled => filled.course.code))]),
            ...placement.electives.filled.filter(filled => filled.state !== 'planned').map(filled => filled.course.code),
          ];
          // No course of the transcript loses its place to a typed one.
          for (const code of heldAlone) expect(heldWith, `${label}: ${code}`).toContain(code);
          // The electives that count are never more than the places the transcript leaves.
          const countedElectives = placement.electives.filled.filter(filled => filled.state === 'planned').length;
          expect(countedElectives + placement.electives.filled.filter(filled => filled.state !== 'planned').length, label).toBeLessThanOrEqual(curriculum.electives.courseCount);
          expect(countedElectives, label).toBeLessThanOrEqual(alone.electives.open);
          answers.forEach((answer, at) => {
            const code = codes[at] as string;
            // A course that is passed or in progress never counts again.
            if (held.has(code)) expect(answer.kind, `${label}: ${code}`).toBe('no');
            // The condition is there exactly while rows still need fixing.
            if (answer.kind === 'counts') expect(answer.condition, `${label}: ${code}`).toBe(exact ? null : CONDITION);
            if (answer.kind === 'needed') seen.needed++;
            if (answer.kind === 'no' && answer.text === 'This slot is already filled') seen.filled++;
            if (answer.kind === 'no' && answer.text === 'You already passed this') seen.passed++;
            if (answer.kind === 'counts') seen.counted++;
            expect(answer.kind === 'ask' || answer.kind === 'waiting', label).toBe(false);
          });
          // A course said to be needed for a sequence is a sequence course, and the transcript
          // holds the pick of both sequence courses, neither of which it has.
          codes.forEach((code, at) => {
            const answer = answers[at]!;
            const groupOf = (one: string) => alone.blocks.flatMap(block => block.picks).find(group => group.options.some(option => option.code === one));
            if (answer.kind === 'needed') {
              expect(['HIS 132', 'ENG 210'], label).toContain(code);
              for (const one of ['HIS 132', 'ENG 210']) {
                expect(groupOf(one)?.open, `${label}: ${one}`).toBe(0);
                expect(held.has(one), `${label}: ${one}`).toBe(false);
              }
            }
            // "Take the other one" is said only while the other one's pick is open and its own is held.
            if (answer.kind === 'no' && answer.text.includes('for the sequence.')) {
              seen.pointed++;
              const take = code === 'HIS 132' ? 'ENG 210' : 'HIS 132';
              expect(answer.text, label).toMatch(new RegExp(`^Doesn’t count — same slot as [A-Z]+ \\d+\\. Take ${take} for the sequence\\.$`));
              expect(groupOf(code)?.open, label).toBe(0);
              expect(groupOf(take)?.open, label).toBeGreaterThan(0);
              expect(held.has(take), label).toBe(false);
            }
          });
          // The numbers add up.
          const sums = totalsOf(typed, answers);
          expect(sums.total, label).toBe(sums.counts + sums.doesNotCount + sums.waiting + sums.needed);
        }
        // Before the legacy answer: no verdict that Yes and No would not both give.
        const open = answersFor(typed, curriculum, NOT_ANSWERED, transcript);
        open.forEach((answer, at) => {
          if (answer.kind === 'ask' || answer.kind === 'waiting') {
            expect(said(known.yes[at]!), label).not.toBe(said(known.no[at]!));
            return;
          }
          expect(said(answer), label).toBe(said(known.yes[at]!));
          expect(said(answer), label).toBe(said(known.no[at]!));
        });
        // Whoever waits has a question to answer, and it is asked once at least.
        if (open.some(answer => answer.kind === 'waiting')) expect(open.some(answer => answer.kind === 'ask'), label).toBe(true);
        if (open.some(answer => answer.kind === 'ask')) seen.asked++;
        expect(legacyMatters(typed, curriculum, transcript), label).toBe(open.some(answer => answer.kind === 'ask'));
      }
    }
    // The cases above really happened.
    for (const [what, times] of Object.entries(seen)) expect(times, what).toBeGreaterThan(10);
  });
});
