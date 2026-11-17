// The two counters that stand in front of Gemini (docs/BRIEF.md §7 "Limits"; docs/sprints/F22.md):
// three uploads a day for one browser, and $5 a month.
//
// What is counted, all of it:
//   day/<UTC day>/<the browser's random number>  →  a whole number of uploads
//   month/<Google's billing month>               →  a whole number of millionths of a dollar
// No address, no cookie, no file name, nothing of a transcript, no time of day.
//
// Every change is a conditional write: it goes through only when the entry is still as it
// was read. So two uploads at once cannot both take the last place. A write that keeps
// losing is given up, and the caller refuses the upload.

/** $5, in millionths of a dollar. */
export const CAP = 5_000_000;
/** Uploads a day for one browser. */
export const MOST_A_DAY = 3;
/** The price list for the model in use (gemini-3.5-flash-lite, read 2026-11-17), in millionths of a dollar a token. */
export const PRICE_IN = 0.3;
/** What the model writes, its thinking included, costs this a token. */
export const PRICE_OUT = 2.5;
/** The most the model takes in: Gemini refuses a larger request. */
export const INPUT_WINDOW = 1_048_576;
/** How often a write that lost to another upload is tried again. */
export const TRIES = 4;

/** Where the counters are kept, as much of it as is used. */
export interface Counters {
  /** The number under a key and the mark of that entry; nothing when there is no entry. */
  read(key: string): Promise<{ readonly value: number; readonly mark: string } | null>;
  /** Writes only when the entry is still the one read (its mark), or still absent (no mark). True when it was written. */
  write(key: string, value: number, mark: string | null): Promise<boolean>;
  keys(prefix: string): Promise<string[]>;
  remove(key: string): Promise<void>;
}

/** The UTC day of a moment: "2026-11-17". */
export const dayOf = (now: Date): string => now.toISOString().slice(0, 10);

const pacific = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit' });
/**
 * The month of a moment as Google bills it, the calendar month in Pacific time: "2026-11".
 * Google's own cap starts anew on the first of the month there; a month that began hours
 * earlier would allow a second $5 inside one of Google's months.
 */
export const monthOf = (now: Date): string => {
  const parts = pacific.formatToParts(now);
  const part = (type: string): string => parts.find(one => one.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}`;
};

/** A browser's number as it may be used in a key: 32 hex digits, made by the browser, new every day. */
export const isBrowserNumber = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);

/** The most one upload can cost: the model's whole input window and the most it may write. */
export const reservationFor = (mostOutput: number): number => Math.ceil(INPUT_WINDOW * PRICE_IN + mostOutput * PRICE_OUT);

const count = (value: unknown): number | null => (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null);
/**
 * What an upload did cost, from the token counts Gemini reports, rounded up; nothing when
 * the counts are not there. Thinking is billed as output.
 */
export function costOf(usage: unknown): number | null {
  if (typeof usage !== 'object' || usage === null) return null;
  const read = (name: string): unknown => (Object.hasOwn(usage, name) ? (usage as Record<string, unknown>)[name] : undefined);
  const [input, output] = [count(read('promptTokenCount')), count(read('candidatesTokenCount'))];
  const thinking = read('thoughtsTokenCount') === undefined ? 0 : count(read('thoughtsTokenCount'));
  if (input === null || output === null || thinking === null) return null;
  return Math.ceil(input * PRICE_IN + (output + thinking) * PRICE_OUT);
}

/** The number written, or why none was: the change was not allowed, or the write kept losing. */
export type Changed = number | 'refused' | 'lost';

/** Changes a counter by a rule, when the rule allows it. */
async function change(counters: Counters, key: string, next: (now: number) => number | null): Promise<Changed> {
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const entry = await counters.read(key);
    const value = next(entry?.value ?? 0);
    if (value === null) return 'refused';
    if (await counters.write(key, value, entry?.mark ?? null)) return value;
  }
  return 'lost';
}

/** Counts one upload for a browser on a day; refused when it would be more than three. */
export const countUpload = (counters: Counters, day: string, browser: string): Promise<Changed> =>
  change(counters, `day/${day}/${browser}`, uploads => (uploads >= MOST_A_DAY ? null : uploads + 1));

/** Sets the most an upload can cost aside in the month's total; refused when that would take the month over $5. */
export const reserve = (counters: Counters, month: string, amount: number): Promise<Changed> =>
  change(counters, `month/${month}`, spent => (spent + amount > CAP ? null : spent + amount));

/** Puts what the upload did cost in the place of what was set aside. */
export const settle = (counters: Counters, month: string, reserved: number, cost: number): Promise<Changed> =>
  change(counters, `month/${month}`, spent => Math.max(0, spent - reserved) + cost);

/** Deletes the counts of earlier days: nothing of a day is kept once it is over. */
export async function forgetEarlierDays(counters: Counters, day: string): Promise<void> {
  for (const key of await counters.keys('day/')) {
    if (!key.startsWith(`day/${day}/`)) await counters.remove(key);
  }
}
