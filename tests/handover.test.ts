// F25: docs/CURRICULUM-HANDOVER.md, the guide to the yearly curriculum review, stays true
// (docs/sprints/F25.md). A guide that names a file, a test, a field or the words of a
// refusal that no longer exist would send its reader, who is not a developer, nowhere:
// so every such thing in it is checked here against the repository, and the changes it
// walks through are made to a copy of the curriculum in memory.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import rawData from '../docs/curriculum/provisional-current.json';
import { briefTable } from './brief';
import { loadCurriculum, type Curriculum } from '../src/curriculum';
import { foot, oldReviewBanner, reviewIsOld } from '../src/shell';

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const guide = read('docs/CURRICULUM-HANDOVER.md');
const brief = read('docs/BRIEF.md');
/** The guide as running text: line breaks and list indents are layout only. */
const prose = guide.replace(/\s+/g, ' ');
/** Every piece of the guide written as code in a line of text. */
const spans = [...guide.matchAll(/`([^`\n]+)`/g)].map(found => found[1]!);
/** A part of the guide, from its heading to the next heading of the same or a higher level. */
const section = (heading: string): string => {
  const start = guide.indexOf(`\n${heading}\n`);
  if (start < 0) throw new Error(`the guide has no heading "${heading}"`);
  const level = heading.match(/^#+/)![0].length;
  const rest = guide.slice(start + heading.length + 2);
  const end = rest.search(new RegExp(`^#{1,${level}} `, 'm'));
  return end < 0 ? rest : rest.slice(0, end);
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Data = { [key: string]: Json };
type Course = { courseId: string; title: string; credits: number };
type Block = { id: string; name: string; credits: number; required: Course[]; choices: { choose: number; courses: Course[] }[] };
const copy = (): Data => structuredClone(rawData) as unknown as Data;
const blocksOf = (data: Data): Block[] => data.blocks as unknown as Block[];
/** The first choice of the file with more than one course: the tests below name no course of the curriculum. */
const aChoice = (data: Data): { block: Block; courses: Course[] } => {
  const block = blocksOf(data).find(one => one.choices.some(choice => choice.courses.length > 1));
  if (!block) throw new Error('the curriculum file has no choice of several courses');
  return { block, courses: block.choices.find(choice => choice.courses.length > 1)!.courses };
};
const spaced = (id: string): string => id.replace('-', ' ');
const keysOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.flatMap(keysOf)
    : value && typeof value === 'object' ? Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]) : [];
const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const refusal = (make: () => unknown): string => { try { make(); } catch (error) { return error instanceof Error ? error.message : String(error); } return ''; };

describe('the curriculum handover guide', () => {
  it('names what exists', () => {
    // Files: whatever is written as a path with a folder and an ending.
    const paths = [...new Set(spans.filter(one => /^[\w.-]+(\/[\w.-]+)+\.\w+$/.test(one)))];
    expect(paths).toEqual(expect.arrayContaining(['docs/BRIEF.md', 'docs/curriculum/provisional-current.json', 'tests/curriculum.test.ts', 'docs/decision-log.md']));
    for (const path of paths) expect(existsSync(join(root, path)), path).toBe(true);
    // Commands.
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
    const commands = spans.filter(one => one.startsWith('npm '));
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) expect(Object.keys(scripts), command).toContain(command.replace(/^npm (run )?/, ''));
    // Lines of a file, quoted as "In `path`:" over a fenced block: each is in that file, word for word.
    const quoted = [...guide.matchAll(/^[ \t]*In `([^`]+)`:\n[ \t]*```[a-z]*\n([\s\S]*?)\n[ \t]*```/gm)];
    expect(quoted.length).toBeGreaterThanOrEqual(4);
    for (const [, path, lines] of quoted) {
      const file = read(path!);
      for (const line of lines!.split('\n').map(one => one.trim()).filter(Boolean)) expect(file.includes(line), `${path}: ${line}`).toBe(true);
    }
    // The tests it calls the reader's own are tests, by those names.
    const tests = readdirSync(join(root, 'tests')).filter(name => /\.test\.(ts|js)$/.test(name)).map(name => read(`tests/${name}`)).join('\n');
    const named = [...section('### The tests that are yours').matchAll(/^- `([^`]+)`:/gm)].map(found => found[1]!);
    expect(named).toEqual(expect.arrayContaining(['matches the table in brief section 5', 'lists each course once', 'carries the last-reviewed date']));
    for (const name of named) expect(tests.includes(`it('${name}'`), name).toBe(true);
    // The check's own name, as the workflow gives it.
    expect(read('.github/workflows/ci.yml')).toMatch(/^\s+name: check$/m);
    expect(prose).toContain('named `check`');
    // Every link inside the guide leads to one of its headings.
    const anchors = [...guide.matchAll(/^#{1,6} (.+)$/gm)].map(found => found[1]!.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-'));
    const links = [...guide.matchAll(/\]\(#([^)]+)\)/g)].map(found => found[1]!);
    expect(links.length).toBeGreaterThan(5);
    for (const link of links) expect(anchors, link).toContain(link);
  });

  it('gives a true example of the date', () => {
    // "a review dated 2026-11-15 shows the warning from 2027-11-16": labelled with its own date, so it never goes stale.
    const example = /a review dated (\d{4}-\d{2}-\d{2}) shows the warning from (\d{4})-(\d{2})-(\d{2})/.exec(prose);
    if (!example) throw new Error('the guide gives no example of when the warning about an old review appears');
    const first = { year: Number(example[2]), month: Number(example[3]), day: Number(example[4]) };
    const before = new Date(first.year, first.month - 1, first.day - 1, 12);
    expect(reviewIsOld(example[1]!, first)).toBe(true);
    expect(reviewIsOld(example[1]!, { year: before.getFullYear(), month: before.getMonth() + 1, day: before.getDate() })).toBe(false);
    // The date is written as the file writes it, and the guide says so.
    expect(prose).toMatch(/written as year, month, day, for example `\d{4}-\d{2}-\d{2}`/);
  });

  it('explains every field of the curriculum file', () => {
    const reference = section('## Reference: the curriculum file, field by field');
    const explained = new Set([...reference.matchAll(/`([^`\n]+)`/g)].map(found => found[1]!));
    const fields = [...new Set(keysOf(rawData))];
    expect(fields.length).toBeGreaterThan(30);
    for (const field of fields) expect(explained.has(field), `"${field}" is in the curriculum file and not in the guide's reference`).toBe(true);
    // And it says what a course looks like in the file, with the three values a course has.
    const shown = /```json\n\s*\{\s*("courseId"[\s\S]*?)\},?\n\s*```/.exec(guide);
    expect(Object.keys(JSON.parse(`{${shown?.[1] ?? ''}}`) as object)).toEqual(Object.keys(aChoice(copy()).courses[0]!));
    // The entry it tells the reader to add to "sources" is one the file takes.
    const entry = /```json\n\s*(\{\s*"id"[\s\S]*?\})\n\s*```/.exec(guide);
    const added = copy();
    (added.sources as Json[]).push(JSON.parse(entry?.[1] ?? '') as Json);
    expect(loadCurriculum(added).lastReviewed).toBe(rawData.lastReviewed);
  });

  it('takes the changes the guide walks through', () => {
    // On a fixed day, with made-up courses: the review date and a note of what was compared; a course added to a
    // choice, one taken out, one replaced, a title changed. Each in the file and in the brief's table, as the guide says.
    const data = copy();
    const { block, courses } = aChoice(data);
    const [first, second] = [courses[0]!, courses[1]!];
    const credits = first.credits;
    // (A choice as the brief's table writes it: "1 of AAA 101 / BBB 102".)
    const written = (list: readonly Course[]): string => `1 of ${list.map(course => spaced(course.courseId)).join(' / ')}`;
    const before = written(courses);
    expect(brief.includes(before), `the brief's table has "${before}"`).toBe(true);

    data.lastReviewed = '2031-03-09';
    (data.sources as Json[]).push({ id: 'review-2031', description: 'Yearly review on 2031-03-09 against the department\'s guide: one choice changed.' });
    // Added: after the last course of the choice.
    courses.push({ courseId: 'XAA-901', title: 'A Made-up Course', credits });
    // Replaced: the three values of an entry. (The second course of the choice.)
    Object.assign(second, { courseId: 'XAB-902', title: 'Another Made-up Course', credits });
    // A title: in the file only.
    first.title = 'A New Title';
    const table = brief.replace(before, written(courses));

    const changed = loadCurriculum(data);
    const mine = changed.blocks.find(one => one.id === block.id)!;
    const theirs = briefTable(table).blocks.find(one => one.name === block.name)!;
    expect(mine.picks.map(group => group.courses.map(course => course.code))).toEqual(theirs.picks.map(group => [...group.courses]));
    expect(mine.picks.flatMap(group => group.courses).map(course => course.code)).toEqual(expect.arrayContaining(['XAA 901', 'XAB 902']));
    expect(mine.picks.flatMap(group => group.courses).find(course => course.code === spaced(first.courseId))?.title).toBe('A New Title');
    // The whole table still equals the file, block by block.
    expect(briefTable(table).blocks.map(one => [one.name, one.credits, [...one.required].sort()])).toEqual(changed.blocks.map(one => [one.name, one.credits, one.required.map(course => course.code).sort()]));

    // Taken out: the entry and its comma; the course and its " / " in the table.
    const shorter = copy();
    const picked = aChoice(shorter);
    const whole = written(picked.courses);
    picked.courses.pop();
    const without = brief.replace(whole, written(picked.courses));
    expect(without).not.toBe(brief);
    const smaller = loadCurriculum(shorter).blocks.find(one => one.id === picked.block.id)!;
    expect(smaller.picks.map(group => group.courses.map(course => course.code))).toEqual(briefTable(without).blocks.find(one => one.name === picked.block.name)!.picks.map(group => [...group.courses]));

    // The pages then say the new month and year, and nothing about an old review until twelve months have passed.
    const pages = (curriculum: Curriculum): string => text(foot(curriculum));
    expect(pages(changed)).toContain('Curriculum last reviewed: Mar 2031');
    expect(oldReviewBanner(changed, { year: 2031, month: 3, day: 10 })).toBe('');
    expect(oldReviewBanner(changed, { year: 2032, month: 3, day: 9 })).toBe('');
    expect(text(oldReviewBanner(changed, { year: 2032, month: 3, day: 10 }))).toContain('last reviewed in Mar 2031, more than 12 months ago');
  });

  it('refuses the mistakes the guide names', () => {
    const broken = (edit: (data: Data) => void): string => refusal(() => { const data = copy(); edit(data); return loadCurriculum(data); });
    const file = JSON.stringify(rawData, null, 2);
    // The words the check shows for each mistake, and how the mistake is made here.
    const mistakes: Record<string, () => string> = {
      // A missing comma: the words are those of a real run of `npm run check` (docs/sprints/F25.md), where the type
      // check stops at the file before any test runs. Here: such a text is not a curriculum file at all.
      "error TS1005: ',' expected.": () => (refusal(() => JSON.parse(file.replace('",\n', '"\n')) as unknown) === '' ? '' : "error TS1005: ',' expected."),
      // A comma left before a closing bracket: again the words of a real run (the build's own reading of the file
      // stops every test file), and here the proof that such a text does not parse.
      'trailing comma at line': () => (refusal(() => JSON.parse(file.replace('\n  ]', ',\n  ]')) as unknown) === '' ? '' : 'trailing comma at line'),
      'must be null or a date written YYYY-MM-DD': () => broken(data => { data.lastReviewed = '10 Nov 2027'; }),
      'must be 2 to 4 capital letters, a hyphen and 3 digits': () => broken(data => { const course = aChoice(data).courses[0]!; course.courseId = spaced(course.courseId); }),
      'the same course is listed twice': () => broken(data => { const { courses } = aChoice(data); courses.push({ ...courses[0]! }); }),
      'courses in one pick group must have the same credits': () => broken(data => { aChoice(data).courses[0]!.credits += 1; }),
      'but its courses add up to': () => broken(data => { blocksOf(data).find(one => one.required.length > 0)!.required[0]!.credits += 1; }),
      'unknown field': () => broken(data => { (aChoice(data).courses[0] as unknown as Data).titel = 'A Title'; }),
      'is not written as "1 of AAA 101 / BBB 102"': () => refusal(() => briefTable(brief.replace(/\| 1 of ([A-Z]{2,4} \d{3} \/)/, '| $1'))),
    };
    for (const [words, make] of Object.entries(mistakes)) expect(make(), words).toContain(words);
    // The guide's table quotes exactly these, no more and no fewer.
    const rows = section('### Mistakes the check catches').split('\n').filter(line => line.startsWith('| ') && !line.startsWith('| What') && !line.startsWith('|---'));
    const quoted = rows.map(row => /^\| [^|]+ \| `(.+?)`[^|]*\|/.exec(row)?.[1] ?? row);
    expect([...quoted].sort()).toEqual(Object.keys(mistakes).sort());
    // And the rule for a red check looks for the three kinds of line in the order they can appear.
    const rule = section('### Is this mine to fix?');
    const order = ['`docs/curriculum/provisional-current.json` with two numbers', '`trailing comma at line`', '`CurriculumError: Curriculum data:`', '`docs/BRIEF.md §5`', '`FAIL`', 'None of these'].map(words => rule.replace(/\s+/g, ' ').indexOf(words));
    expect(order.every(at => at >= 0), String(order)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // A refusal whose words the table does not have is not the reader's to fix: such a change is handed over.
    // (For example a sequence course taken out of its choice: "is not a course in a core block".)
    expect(rule.replace(/\s+/g, ' ')).toContain('If they are in that table, do what the table says. If they are not, hand the change over.');
    const sequenceCourseGone = broken(data => {
      const sequence = data.sequence as unknown as { alternatives: { courses: string[] }[] };
      const code = sequence.alternatives[0]!.courses[1]!;
      for (const block of blocksOf(data)) for (const choice of block.choices) choice.courses = choice.courses.filter(course => course.courseId !== code);
    });
    expect(sequenceCourseGone).toContain('is not a course in a core block');
    expect(quoted.some(words => sequenceCourseGone.includes(words)), 'the table has no words for this refusal').toBe(false);
    // And a course that the file names more than once is handed over before any edit: the guide says how to tell.
    expect(prose).toContain('the course appears more than once in the curriculum file');
    // (What a refusal starts with, and what a badly written row of the brief starts with.)
    // (The rule looks for the refusal's own first words, "CurriculumError: Curriculum data:": the text of a test's
    // assertion can hold "Curriculum data:" too, and is not a refusal.)
    const named = (): string => { try { const data = copy(); data.lastReviewed = 'soon'; loadCurriculum(data); } catch (error) { return error instanceof Error ? `${error.name}: ${error.message}` : ''; } return ''; };
    expect(named()).toMatch(/^CurriculumError: Curriculum data: /);
    expect(refusal(() => briefTable(brief.replace(/\| 1 of ([A-Z]{2,4} \d{3} \/)/, '| $1')))).toMatch(/^docs\/BRIEF\.md §5, row /);
  });

  it('sends nobody to an advisor', () => {
    expect(prose).not.toMatch(/advis[eo]r|registrar|\bask (your|the|a) (department|dean|office|professor|chair)/i);
    // It says who decides, and that nobody guesses.
    expect(prose).toContain('Nobody guesses a rule');
    expect(prose).toContain('the person responsible for PathCheck');
    // Publishing is told apart by what Netlify's page says; nobody is told to deploy from a command line.
    expect(prose).toContain('**Auto Publishing Locked**');
    expect(prose).not.toMatch(/netlify deploy|--prod/i);
    // It promises no more than was tried: what usually works, and what is usually handed over.
    expect(prose).toContain('Adding a course and changing a title usually work.');
    expect(prose).not.toMatch(/does not have this problem|always works|never fails/i);
    // Never merged while red, and never straight to `main`.
    expect(prose).toContain('Never merge while it is red');
    expect(prose).toContain('Do not commit directly to `main`');
  });
});
