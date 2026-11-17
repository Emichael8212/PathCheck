// F22, the browser side (docs/sprints/F22.md; docs/BRIEF.md §7 "Limits"): Cloudflare's bot check
// as the page asks for it, and the browser's random number for the day's uploads. The
// widget and the browser are stand-ins: nothing here reaches Cloudflare.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BROWSER_KEY, STORED_KEYS, browserNumber, clearStored } from '../src/remember';
import { ACTION, CHECK_WAIT, SCRIPT, TEST_SITE_KEY, botToken, siteKeyOf, type CheckWindow } from '../src/turnstile';

type Options = Record<string, unknown> & { callback(token: unknown): void; 'error-callback'(): void; 'expired-callback'(): void; 'timeout-callback'(): void };
/** A browser with Cloudflare's script standing in: how the script loads, and what the widget does once drawn. */
const browserOf = (load: 'loads' | 'blocked', drawn: (options: Options) => void = options => { options.callback('a-token'); }) => {
  const seen = { scripts: [] as { src: string; async: boolean }[], rendered: [] as { container: unknown; options: Options }[], removed: [] as string[] };
  const widget = {
    render(container: unknown, options: Record<string, unknown>): string {
      seen.rendered.push({ container, options: options as Options });
      queueMicrotask(() => { drawn(options as Options); });
      return `widget-${seen.rendered.length}`;
    },
    remove(id: string): void { seen.removed.push(id); },
  };
  const win: CheckWindow = {
    document: {
      createElement: () => ({ src: '', async: false, onload: null, onerror: null }),
      head: {
        append(node: unknown): void {
          const script = node as { src: string; async: boolean; onload: (() => void) | null; onerror: (() => void) | null };
          seen.scripts.push(script);
          queueMicrotask(() => {
            if (load === 'loads') { win.turnstile = widget; script.onload?.(); } else script.onerror?.();
          });
        },
      },
    },
  };
  return { win, seen };
};
const PLACE = { place: 'under the upload control' };
const KEY = '0x4AAAAAAAmade-up-site-key';

describe("Cloudflare's bot check in the page", () => {
  it('gets a token from the widget', async () => {
    const { win, seen } = browserOf('loads');
    expect(await botToken(win, PLACE, KEY)).toBe('a-token');
    // The script comes from Cloudflare, as Cloudflare asks, and is asked for when a check is wanted, once.
    expect(seen.scripts).toHaveLength(1);
    expect(seen.scripts[0]).toMatchObject({ src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', async: true });
    expect(SCRIPT).toBe(seen.scripts[0]!.src);
    // The widget is drawn in the place given, for an upload, out of sight unless a box must be ticked.
    expect(seen.rendered).toHaveLength(1);
    expect(seen.rendered[0]!.container).toBe(PLACE);
    expect(seen.rendered[0]!.options).toMatchObject({ sitekey: KEY, action: 'upload', appearance: 'interaction-only' });
    expect(Object.keys(seen.rendered[0]!.options).sort()).toEqual(['action', 'appearance', 'callback', 'error-callback', 'expired-callback', 'sitekey', 'timeout-callback']);
    expect(ACTION).toBe('upload');
    // When it has done its work it is taken off the page again.
    expect(seen.removed).toEqual(['widget-1']);
    // A second upload: a new widget and a new token, the same script.
    expect(await botToken(win, PLACE, KEY)).toBe('a-token');
    expect([seen.scripts.length, seen.rendered.length, seen.removed]).toEqual([1, 2, ['widget-1', 'widget-2']]);
  });

  it('gives no token when the check does not pass', async () => {
    // The widget says it failed, expired or timed out; or gives something that is no token.
    for (const fails of [
      (options: Options) => { options['error-callback'](); },
      (options: Options) => { options['expired-callback'](); },
      (options: Options) => { options['timeout-callback'](); },
      (options: Options) => { options.callback(''); },
      (options: Options) => { options.callback(undefined); },
      (options: Options) => { options.callback({ token: 'x' }); },
    ]) {
      const { win, seen } = browserOf('loads', fails);
      expect(await botToken(win, PLACE, KEY)).toBeNull();
      expect(seen.removed).toEqual(['widget-1']);
    }
    // Only the first word of the widget counts: a token after a failure is not taken.
    const twice = browserOf('loads', options => { options['error-callback'](); options.callback('late-token'); });
    expect(await botToken(twice.win, PLACE, KEY)).toBeNull();
    // It never says anything: the page stops waiting, and the widget is taken away.
    expect(CHECK_WAIT).toBe(30_000);
    const silent = browserOf('loads', () => undefined);
    expect(await botToken(silent.win, PLACE, KEY, 20)).toBeNull();
    expect(silent.seen.removed).toEqual(['widget-1']);
    // The script is blocked (an ad blocker, no network): no token, and it is asked for again the next time.
    const blocked = browserOf('blocked');
    expect(await botToken(blocked.win, PLACE, KEY)).toBeNull();
    expect(await botToken(blocked.win, PLACE, KEY)).toBeNull();
    expect([blocked.seen.scripts.length, blocked.seen.rendered.length]).toEqual([2, 0]);
    // The script loads but brings no widget; or the widget breaks: no token, nothing thrown.
    const empty = browserOf('blocked');
    empty.win.document.head.append = node => { queueMicrotask(() => { (node as { onload(): void }).onload(); }); };
    expect(await botToken(empty.win, PLACE, KEY)).toBeNull();
    const broken = browserOf('loads');
    broken.win.turnstile = { render: () => { throw new Error('broken'); }, remove: () => undefined };
    expect(await botToken(broken.win, PLACE, KEY)).toBeNull();
    // No place on the page to draw it: no check, and Cloudflare is not asked for anything.
    const nowhere = browserOf('loads');
    expect(await botToken(nowhere.win, null, KEY)).toBeNull();
    expect(nowhere.seen.scripts).toEqual([]);
  });

  it('uses the site key the page was built with, or the test key', () => {
    expect(TEST_SITE_KEY).toBe('1x00000000000000000000AA');
    expect(siteKeyOf('0x4AAAAAAAmade-up-site-key')).toBe('0x4AAAAAAAmade-up-site-key');
    expect(siteKeyOf('  0x4AAAAAAAmade-up-site-key\n')).toBe('0x4AAAAAAAmade-up-site-key');
    // Built without one (a Deploy Preview), or with something that is no key: Cloudflare's test key, which PathCheck's function takes on a preview only.
    for (const none of [undefined, null, '', '   ', 'short', 'has spaces in it and more', '<script>alert(1)</script>', 7, 'x'.repeat(101)]) expect(siteKeyOf(none), String(none)).toBe(TEST_SITE_KEY);
    // The page's code knows nothing that only the server may know.
    const source = readFileSync(join(import.meta.dirname, '..', 'src', 'turnstile.ts'), 'utf8');
    expect(source).not.toMatch(/siteverify|SECRET|1x0000000000000000000000000000000AA/);
    // The check is asked for in one place of the app, when a file is about to be read.
    const app = readFileSync(join(import.meta.dirname, '..', 'src', 'app.ts'), 'utf8');
    expect(app.match(/botToken\(/g)).toHaveLength(1);
    expect(app).toContain("token: () => botToken(win as unknown as CheckWindow, part('[data-turnstile]'), siteKeyOf(import.meta.env.VITE_TURNSTILE_SITE_KEY)),");
  });
});

describe("the browser's number for the day", () => {
  const storageOf = (start: Record<string, string> = {}) => {
    const kept = new Map(Object.entries(start));
    return { kept, getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => { kept.set(key, value); }, removeItem: (key: string) => { kept.delete(key); } };
  };

  it('is a random number, the same all day and another the next', () => {
    const storage = storageOf();
    const today = browserNumber(storage, '2026-11-17');
    // 16 random bytes, as 32 hex digits: what the function takes as a browser's number.
    expect(today).toMatch(/^[0-9a-f]{32}$/);
    expect(browserNumber(storage, '2026-11-17')).toBe(today);
    expect(browserNumber(storage, '2026-11-17')).toBe(today);
    // Kept with its day and nothing else, under PathCheck's own name.
    expect(BROWSER_KEY).toBe('pathcheck.browser');
    expect([...storage.kept.keys()]).toEqual(['pathcheck.browser']);
    expect(JSON.parse(storage.kept.get('pathcheck.browser')!)).toEqual({ day: '2026-11-17', number: today });
    // The next day it is another, and the old one is gone: nothing links the two days.
    const tomorrow = browserNumber(storage, '2026-11-18');
    expect(tomorrow).toMatch(/^[0-9a-f]{32}$/);
    expect(tomorrow).not.toBe(today);
    expect(storage.kept.get('pathcheck.browser')).not.toContain(today);
    // It is made of the browser's own random bytes and of nothing about the browser or the person.
    expect(browserNumber(storageOf(), '2026-11-17', bytes => { bytes.fill(0xab); })).toBe('ab'.repeat(16));
    expect(browserNumber(storageOf(), '2026-11-17', bytes => { bytes.set([0, 1, 15, 16, 255]); })).toBe(`00010f10ff${'00'.repeat(11)}`);
    const numbers = new Set(Array.from({ length: 50 }, () => browserNumber(storageOf(), '2026-11-17')));
    expect(numbers.size).toBe(50);
  });

  it('goes with "Clear my data", and survives a browser that keeps nothing', () => {
    // It is one of the three things PathCheck keeps in a browser; "Clear my data" removes each of them.
    expect(STORED_KEYS).toContain('pathcheck.browser');
    const storage = storageOf({ 'something.else': 'not PathCheck’s' });
    const before = browserNumber(storage, '2026-11-17');
    clearStored(storage);
    expect([...storage.kept.keys()]).toEqual(['something.else']);
    expect(browserNumber(storage, '2026-11-17')).not.toBe(before);
    // What is kept cannot be read, or is not a number of this kind: a new one is made and kept.
    for (const garbage of ['not json', '{"day":"2026-11-17"}', '{"day":"2026-11-17","number":"XYZ"}', '{"day":"2026-11-17","number":7}', '[]', 'null', `{"day":"2026-11-16","number":"${'a'.repeat(32)}"}`]) {
      const odd = storageOf({ 'pathcheck.browser': garbage });
      const made = browserNumber(odd, '2026-11-17');
      expect(made, garbage).toMatch(/^[0-9a-f]{32}$/);
      expect(made, garbage).not.toBe('a'.repeat(32));
      expect(JSON.parse(odd.kept.get('pathcheck.browser')!), garbage).toEqual({ day: '2026-11-17', number: made });
    }
    // No storage, or storage that refuses: every upload gets a number, and nothing fails.
    expect(browserNumber(null, '2026-11-17')).toMatch(/^[0-9a-f]{32}$/);
    expect(browserNumber(undefined, '2026-11-17')).not.toBe(browserNumber(undefined, '2026-11-17'));
    const refusing = { getItem: (): string => { throw new Error('no'); }, setItem: (): void => { throw new Error('full'); }, removeItem: (): void => undefined };
    expect(browserNumber(refusing, '2026-11-17')).toMatch(/^[0-9a-f]{32}$/);
  });
});
