// F22: the two counters in front of Gemini, on their own (docs/sprints/F22.md; docs/BRIEF.md §7
// "Limits"): three uploads a day for one browser, and $5 a month. The store is a stand-in
// that behaves as Netlify Blobs does: an entry is written only on a condition.
import { describe, expect, it } from 'vitest';
import {
  CAP, INPUT_WINDOW, MOST_A_DAY, PRICE_IN, PRICE_OUT, TRIES, costOf, countUpload, dayOf, forgetEarlierDays, isBrowserNumber, monthOf, reservationFor, reserve, settle, type Counters,
} from '../netlify/lib/limits.mjs';

const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const RESERVED = reservationFor(16_384);

/** A store of numbers with marks. `between` runs after every read: there another upload can get in first. */
const storeOf = (start: Record<string, number> = {}, between: () => void | Promise<void> = () => undefined) => {
  const entries = new Map(Object.entries(start).map(([key, value]) => [key, { value, mark: 'start' }]));
  const seen = { reads: 0, writes: 0, lost: 0 };
  const counters: Counters = {
    async read(key) {
      seen.reads++;
      const entry = entries.has(key) ? { ...entries.get(key)! } : null;
      await between();
      return entry;
    },
    write(key, value, mark) {
      if ((entries.get(key)?.mark ?? null) !== mark) { seen.lost++; return Promise.resolve(false); }
      entries.set(key, { value, mark: `write-${++seen.writes}` });
      return Promise.resolve(true);
    },
    keys: prefix => Promise.resolve([...entries.keys()].filter(key => key.startsWith(prefix))),
    remove: key => { entries.delete(key); return Promise.resolve(); },
  };
  return { counters, seen, all: (): Record<string, number> => Object.fromEntries([...entries].map(([key, entry]) => [key, entry.value])), put: (key: string, value: number) => { entries.set(key, { value, mark: `put-${++seen.writes}` }); } };
};

describe('the counters of the upload limits', () => {
  it('names the day in UTC and the month as Google bills it', () => {
    expect(dayOf(new Date('2026-11-17T12:00:00Z'))).toBe('2026-11-17');
    expect(dayOf(new Date('2026-11-17T23:59:59Z'))).toBe('2026-11-17');
    expect(dayOf(new Date('2026-11-18T00:00:00Z'))).toBe('2026-11-18');
    // Google's cap starts anew on the first of the month, Pacific time: 08:00 UTC in winter, 07:00 in summer.
    expect(monthOf(new Date('2026-11-17T12:00:00Z'))).toBe('2026-11');
    expect(monthOf(new Date('2026-12-01T02:00:00Z'))).toBe('2026-11');
    expect(monthOf(new Date('2026-12-01T07:59:59Z'))).toBe('2026-11');
    expect(monthOf(new Date('2026-12-01T08:00:00Z'))).toBe('2026-12');
    expect(monthOf(new Date('2026-12-01T09:00:00Z'))).toBe('2026-12');
    expect(monthOf(new Date('2027-01-01T07:30:00Z'))).toBe('2026-12');
    expect(monthOf(new Date('2026-07-01T06:59:59Z'))).toBe('2026-06');
    expect(monthOf(new Date('2026-07-01T07:00:00Z'))).toBe('2026-07');
  });

  it('takes only a browser number of 32 hex digits', () => {
    expect(isBrowserNumber(A)).toBe(true);
    expect(isBrowserNumber('0123456789abcdef0123456789abcdef')).toBe(true);
    for (const not of ['', 'a'.repeat(31), 'a'.repeat(33), 'A'.repeat(32), 'g'.repeat(32), `${'a'.repeat(31)}/`, '../month/2026-11', `${'a'.repeat(16)}\n${'a'.repeat(15)}`, null, undefined, 7, ['a'.repeat(32)]]) {
      expect(isBrowserNumber(not), String(not)).toBe(false);
    }
  });

  it('works out what an upload cost from the counts Gemini reports', () => {
    // The price list of 2026-11-17 for gemini-3.5-flash-lite: $0.30 a million tokens in, $2.50 out, in millionths of a dollar a token.
    expect([PRICE_IN, PRICE_OUT, INPUT_WINDOW, CAP, MOST_A_DAY]).toEqual([0.3, 2.5, 1_048_576, 5_000_000, 3]);
    // A small transcript: 1,200 tokens in, 1,500 out: 360 + 3,750 millionths, under half a cent.
    expect(costOf({ promptTokenCount: 1200, candidatesTokenCount: 1500, totalTokenCount: 2700 })).toBe(4110);
    // Thinking is billed as output.
    expect(costOf({ promptTokenCount: 1200, candidatesTokenCount: 1500, thoughtsTokenCount: 400 })).toBe(5110);
    // Rounded up, never down.
    expect(costOf({ promptTokenCount: 1, candidatesTokenCount: 0 })).toBe(1);
    expect(costOf({ promptTokenCount: 0, candidatesTokenCount: 0 })).toBe(0);
    // Without the counts it is not known what was used.
    for (const none of [undefined, null, {}, 'usage', { promptTokenCount: 5 }, { candidatesTokenCount: 5 }, { promptTokenCount: '5', candidatesTokenCount: 5 }, { promptTokenCount: -1, candidatesTokenCount: 5 }, { promptTokenCount: 1.5, candidatesTokenCount: 5 }, { promptTokenCount: 5, candidatesTokenCount: 5, thoughtsTokenCount: 'many' }]) {
      expect(costOf(none), JSON.stringify(none)).toBeNull();
    }
    // The most one upload can cost: the model's whole input window and the most it may write. About 36 cents.
    expect(RESERVED).toBe(Math.ceil(1_048_576 * 0.3 + 16_384 * 2.5));
    expect(RESERVED).toBe(355_533);
    // Nothing Gemini can report for one upload costs more than that.
    expect(costOf({ promptTokenCount: INPUT_WINDOW, candidatesTokenCount: 10_000, thoughtsTokenCount: 6_384 })).toBe(RESERVED);
  });

  it('counts three uploads a day for one browser', async () => {
    const store = storeOf();
    expect(await countUpload(store.counters, '2026-11-17', A)).toBe(1);
    expect(await countUpload(store.counters, '2026-11-17', A)).toBe(2);
    expect(await countUpload(store.counters, '2026-11-17', A)).toBe(3);
    // The fourth is refused, and nothing is written for it.
    const writes = store.seen.writes;
    expect(await countUpload(store.counters, '2026-11-17', A)).toBe('refused');
    expect(await countUpload(store.counters, '2026-11-17', A)).toBe('refused');
    expect(store.seen.writes).toBe(writes);
    // Another browser the same day, and the same browser the next day, start at one.
    expect(await countUpload(store.counters, '2026-11-17', B)).toBe(1);
    expect(await countUpload(store.counters, '2026-11-18', A)).toBe(1);
    expect(store.all()).toEqual({ [`day/2026-11-17/${A}`]: 3, [`day/2026-11-17/${B}`]: 1, [`day/2026-11-18/${A}`]: 1 });
    // The counts of earlier days go; today's stay, and the month's total is not touched.
    store.put('month/2026-11', 4110);
    await forgetEarlierDays(store.counters, '2026-11-18');
    expect(store.all()).toEqual({ [`day/2026-11-18/${A}`]: 1, 'month/2026-11': 4110 });
    // A request that began just before midnight tidies up when the new day has counts already: those stay.
    store.put(`day/2026-11-17/${B}`, 2);
    store.put(`day/2026-11-19/${B}`, 1);
    await forgetEarlierDays(store.counters, '2026-11-18');
    expect(store.all()).toEqual({ [`day/2026-11-18/${A}`]: 1, [`day/2026-11-19/${B}`]: 1, 'month/2026-11': 4110 });
  });

  it('sets the most an upload can cost aside, and settles it to what it did cost', async () => {
    const store = storeOf();
    expect(await reserve(store.counters, '2026-11', RESERVED)).toBe(RESERVED);
    expect(await settle(store.counters, '2026-11', RESERVED, 4110)).toBe(4110);
    expect(await reserve(store.counters, '2026-11', RESERVED)).toBe(4110 + RESERVED);
    // Gemini refused the request: nothing was used, and what was set aside is taken off again.
    expect(await settle(store.counters, '2026-11', RESERVED, 0)).toBe(4110);
    // Under $5 by exactly one reservation: allowed. One millionth more: refused, and the total is unchanged.
    store.put('month/2026-11', CAP - RESERVED);
    expect(await reserve(store.counters, '2026-11', RESERVED)).toBe(CAP);
    store.put('month/2026-11', CAP - RESERVED + 1);
    expect(await reserve(store.counters, '2026-11', RESERVED)).toBe('refused');
    expect(store.all()['month/2026-11']).toBe(CAP - RESERVED + 1);
    // At $5 nothing more is read; another month starts at zero.
    store.put('month/2026-11', CAP);
    expect(await reserve(store.counters, '2026-11', RESERVED)).toBe('refused');
    expect(await reserve(store.counters, '2026-12', RESERVED)).toBe(RESERVED);
    // A total never goes under zero, whatever is settled.
    expect(await settle(storeOf({ 'month/2026-11': 10 }).counters, '2026-11', RESERVED, 5)).toBe(5);
  });

  it('lets one of two take the last place', async () => {
    // Two uploads of one browser at count 2, started together: both read 2; one write wins, the other reads again and is refused.
    const day = storeOf({ [`day/2026-11-17/${A}`]: 2 }, () => new Promise(resolve => { setTimeout(resolve, 1); }));
    const both = await Promise.all([countUpload(day.counters, '2026-11-17', A), countUpload(day.counters, '2026-11-17', A)]);
    expect([...both].sort()).toEqual([3, 'refused']);
    expect(day.all()).toEqual({ [`day/2026-11-17/${A}`]: 3 });
    expect(day.seen.lost).toBe(1);
    // The first two of a day, started together: one writes the new entry, the other finds it and counts on.
    const fresh = storeOf({}, () => new Promise(resolve => { setTimeout(resolve, 1); }));
    expect((await Promise.all([countUpload(fresh.counters, '2026-11-17', A), countUpload(fresh.counters, '2026-11-17', A)])).sort()).toEqual([1, 2]);
    // Two uploads one reservation under the cap, started together: one is read, one refused.
    const month = storeOf({ 'month/2026-11': CAP - RESERVED }, () => new Promise(resolve => { setTimeout(resolve, 1); }));
    const two = await Promise.all([reserve(month.counters, '2026-11', RESERVED), reserve(month.counters, '2026-11', RESERVED)]);
    expect([...two].sort()).toEqual([CAP, 'refused']);
    expect(month.all()).toEqual({ 'month/2026-11': CAP });
    // Ten at once from zero: each reservation is in the total exactly once.
    const many = storeOf({}, () => new Promise(resolve => { setTimeout(resolve, Math.random() * 3); }));
    const ten = await Promise.all(Array.from({ length: 10 }, () => reserve(many.counters, '2026-11', 1000)));
    const taken = ten.filter(one => typeof one === 'number').length;
    expect(many.all()['month/2026-11']).toBe(taken * 1000);
    // (Some may have lost every try: they are refused by the caller, never counted twice.)
    expect(ten.every(one => typeof one === 'number' || one === 'lost')).toBe(true);
    // A store in which another upload always gets in first: given up after a few tries, with nothing written.
    let n = 0;
    const busy = storeOf({ 'month/2026-11': 0 });
    const racing = storeOf({ 'month/2026-11': 0 }, () => { busy.put('x', n++); });
    const always: Counters = { ...racing.counters, write: () => Promise.resolve(false) };
    expect(await reserve(always, '2026-11', RESERVED)).toBe('lost');
    expect(await countUpload(always, '2026-11-17', A)).toBe('lost');
    expect(racing.seen.reads).toBe(TRIES * 2);
    expect(TRIES).toBe(4);
    expect(racing.all()).toEqual({ 'month/2026-11': 0 });
  });

  it('holds for any uploads', async () => {
    const SEED = 20261117;
    let seed = SEED;
    const next = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const whole = (from: number, to: number): number => from + Math.floor(next() * (to - from + 1));
    const seen = { read: 0, refusedByCap: 0, kept: 0, givenBack: 0, settleFailed: 0, stopped: 0 };
    for (let run = 0; run < 40; run++) {
      const store = storeOf({ 'month/2026-11': whole(0, 2_000_000) });
      const start = store.all()['month/2026-11']!;
      let real = 0;
      for (let i = 0; i < 60; i++) {
        const label = `seed ${SEED}, run ${run}, upload ${i}`;
        const reserved = await reserve(store.counters, '2026-11', RESERVED);
        if (reserved === 'refused') { seen.refusedByCap++; continue; }
        // What then happens to the upload, as the function sees it.
        const what = next();
        if (what < 0.55) {
          // Gemini read it and says what it used: anything up to the most an upload can cost.
          const usage = { promptTokenCount: whole(200, next() < 0.05 ? INPUT_WINDOW : 40_000), candidatesTokenCount: whole(0, 8_000), thoughtsTokenCount: whole(0, 8_384) };
          const cost = costOf(usage)!;
          real += cost;
          if (next() < 0.1) {
            // The write that settles it fails, or keeps losing: what was set aside stays.
            seen.settleFailed++;
          } else {
            await settle(store.counters, '2026-11', RESERVED, cost);
            seen.read++;
          }
        } else if (what < 0.7) {
          // Gemini refused the request: nothing was used, and it is given back.
          await settle(store.counters, '2026-11', RESERVED, 0);
          seen.givenBack++;
        } else if (what < 0.85) {
          // No answer in time, or an answer without counts: it may have cost anything up to the most; what was set aside stays.
          real += whole(0, RESERVED);
          seen.kept++;
        } else {
          // The function was stopped after reserving: the same.
          real += whole(0, RESERVED);
          seen.stopped++;
        }
        const total = store.all()['month/2026-11']!;
        // The total is never behind what was really spent through PathCheck this month, and never over $5.
        expect(total - start, label).toBeGreaterThanOrEqual(real);
        expect(total, label).toBeLessThanOrEqual(CAP);
        expect(Number.isSafeInteger(total) && total >= 0, label).toBe(true);
      }
      // So what Google can have billed through PathCheck is under $5 too.
      expect(start + real).toBeLessThanOrEqual(CAP);
    }
    for (const [what, times] of Object.entries(seen)) expect(times, what).toBeGreaterThan(10);
  });
});
