// Cloudflare's bot check (docs/BRIEF.md §7 "Limits"; docs/sprints/F22.md), on the built site only.
//
// Before a PDF is posted, the page gets a token from Cloudflare's widget; PathCheck's
// function has Cloudflare confirm it before anything is read. The widget's script is
// asked for the first time a file is chosen, not when a page opens: a student who never
// uploads meets no check. The widget stays out of sight unless Cloudflare wants a box
// ticked; then it shows under the upload control.

/** Cloudflare's widget, as much of it as is used. */
interface Widget {
  render(container: unknown, options: Record<string, unknown>): string;
  remove(id: string): void;
}
/** As much of the browser as the check uses. */
export interface CheckWindow {
  turnstile?: Widget;
  readonly document: {
    createElement(tag: 'script'): { src: string; async: boolean; onload: (() => void) | null; onerror: (() => void) | null };
    readonly head: { append(node: unknown): void };
  };
}

/** The widget's script. Cloudflare asks for it to be loaded from there, as it is. */
export const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
/**
 * Cloudflare's published test site key (always passes). It stands in where the build was
 * given no key: a Deploy Preview, whose hostname no widget can be made for. PathCheck's
 * function takes its token on a preview only.
 */
export const TEST_SITE_KEY = '1x00000000000000000000AA';
/** What the token is for; the function takes no token made for anything else. */
export const ACTION = 'upload';
/** How long the check is waited for. */
export const CHECK_WAIT = 30_000;

/** The site key the page was built with, or the test key. It is public: it is in the page. */
export const siteKeyOf = (given: unknown): string => (typeof given === 'string' && /^[\w-]{10,100}$/.test(given.trim()) ? given.trim() : TEST_SITE_KEY);

/** Loads the widget's script once; a script that did not load is asked for again the next time. */
function widgetOf(win: CheckWindow): Promise<Widget | null> {
  if (win.turnstile) return Promise.resolve(win.turnstile);
  return new Promise(resolve => {
    const script = win.document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => { resolve(win.turnstile ?? null); };
    script.onerror = () => { resolve(null); };
    win.document.head.append(script);
  });
}

/**
 * A token of a passed check, drawn into the given place; nothing when there is no place,
 * the script is blocked, the check fails or it takes too long. Never throws.
 */
export async function botToken(win: CheckWindow, container: unknown, siteKey: string, wait = CHECK_WAIT): Promise<string | null> {
  if (!container) return null;
  try {
    const widget = await widgetOf(win);
    if (!widget) return null;
    return await new Promise<string | null>(resolve => {
      let id: string | null = null;
      let over = false;
      const done = (token: string | null): void => {
        if (over) return;
        over = true;
        clearTimeout(timer);
        // The widget has done its work: it is taken off the page again.
        try {
          if (id !== null) widget.remove(id);
        } catch {
          // (A widget that is already gone.)
        }
        resolve(typeof token === 'string' && token !== '' ? token : null);
      };
      const timer = setTimeout(() => { done(null); }, wait);
      id = widget.render(container, {
        sitekey: siteKey,
        action: ACTION,
        appearance: 'interaction-only',
        callback: (token: unknown) => { done(typeof token === 'string' ? token : null); },
        'error-callback': () => { done(null); },
        'expired-callback': () => { done(null); },
        'timeout-callback': () => { done(null); },
      });
    });
  } catch {
    return null;
  }
}
