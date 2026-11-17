// The curriculum table of the brief's §5, read from docs/BRIEF.md itself (F25,
// docs/sprints/F25.md). The brief is the approved statement of the curriculum and the data
// file must equal it: tests/curriculum.test.ts "matches the table in brief section 5". So a
// course is written in two places, the data file and this table, and in no test.
// The reading is strict: a row that is not written as the others fails with what is wrong.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface BriefPick { readonly choose: number; readonly courses: readonly string[] }
export interface BriefBlock { readonly name: string; readonly credits: number; readonly required: readonly string[]; readonly picks: readonly BriefPick[] }
export interface BriefTable {
  /** The blocks in the table's order. */
  readonly blocks: readonly BriefBlock[];
  /** The last row: the electives, which have a rule and no list. */
  readonly electives: { readonly name: string; readonly credits: number; readonly courses: number };
}

const HEAD = '| Block | Credits | Required | Choose |';
const NONE = '—';
const CODE = /^[A-Z]{2,4} \d{3}$/;

/** A course as the table writes it: its code, with "(lab)" allowed after a lab. */
function codeOf(written: string, where: string): string {
  const code = written.replace(/\s*\(lab\)$/, '').trim();
  if (!CODE.test(code)) throw new Error(`docs/BRIEF.md §5, ${where}: "${written.trim()}" is not a course code such as "MGT 321"`);
  return code;
}

export function briefTable(text: string = readFileSync(join(import.meta.dirname, '..', 'docs', 'BRIEF.md'), 'utf8')): BriefTable {
  const lines = text.split('\n');
  const start = lines.indexOf(HEAD);
  if (start < 0) throw new Error(`docs/BRIEF.md §5: the table's first line "${HEAD}" was not found`);
  if (!/^\|(\s*:?-+:?\s*\|){4}$/.test(lines[start + 1] ?? '')) throw new Error('docs/BRIEF.md §5: the line under the table\'s first line must be "|---|---|---|---|"');
  const rows: string[][] = [];
  for (let i = start + 2; i < lines.length && lines[i]!.startsWith('|'); i++) {
    const cells = lines[i]!.split('|').slice(1, -1).map(cell => cell.trim());
    if (cells.length !== 4) throw new Error(`docs/BRIEF.md §5: the row "${lines[i]}" does not have four columns`);
    rows.push(cells);
  }
  const last = rows.pop();
  const counted = last ? /^(\d+) \((\d+) courses\)$/.exec(last[1]!) : null;
  if (!last || !counted) throw new Error('docs/BRIEF.md §5: the table\'s last row must be the electives, with credits written as "9 (3 courses)"');

  const blocks = rows.map(([name, credits, required, choose]): BriefBlock => {
    const where = `row "${name}"`;
    if (!/^\d+$/.test(credits!)) throw new Error(`docs/BRIEF.md §5, ${where}: the credits "${credits}" are not a whole number`);
    const picks = choose === NONE ? [] : choose!.split(';').map((group): BriefPick => {
      const found = /^(\d+) of (.+)$/.exec(group.trim());
      if (!found) throw new Error(`docs/BRIEF.md §5, ${where}: "${group.trim()}" is not written as "1 of AAA 101 / BBB 102"`);
      return { choose: Number(found[1]), courses: found[2]!.split('/').map(course => codeOf(course, where)) };
    });
    return { name: name!, credits: Number(credits), required: required === NONE ? [] : required!.split(',').map(course => codeOf(course, where)), picks };
  });
  return { blocks, electives: { name: last[0]!, credits: Number(counted[1]), courses: Number(counted[2]) } };
}

/** Every course the table names, as often as it names it. */
export const briefCourses = (table: BriefTable): string[] => table.blocks.flatMap(block => [...block.required, ...block.picks.flatMap(pick => pick.courses)]);
