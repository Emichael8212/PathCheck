// The app: one page, three addresses. Shows the page for the address, and keeps doing so
// as the student moves about.
import { checkPage, emptyList, setupCheck, type CourseList } from './check';
import { programs as allPrograms, type Program } from './curriculum';
import { setupDemo, type Demo, type DemoRoot, type Timers } from './demo';
import { ANOTHER_FIRST, emptyLeft, leftPage, refusalText, setupLeft, type LeftState } from './left';
import { browserStorage, readLegacyAnswer } from './legacy';
import { ReaderError } from './reader';
import { correctRow, openTranscript } from './review';
import { HREF, routeOf, titleOf, type Route } from './shell';
import { startPage } from './start';
import { readFile, type ChosenFile, type Refusal } from './upload';

export const renderPage = (route: Route, programs: readonly Program[] = allPrograms, list: CourseList = emptyList(), left: LeftState = emptyLeft()): string => {
  const [program] = programs;
  if (!program) throw new Error('PathCheck has no program to show.');
  return route === 'start' ? startPage(programs) : route === 'check' ? checkPage(program.curriculum, list) : leftPage(program.curriculum, left);
};

type Listener = (event: AppEvent) => void;
/** As much of the browser as the app uses. */
export interface AppWindow extends Timers {
  readonly document: { title: string; getElementById(id: string): AppRoot | null };
  readonly location: { hash: string };
  addEventListener(type: 'hashchange' | 'dragover' | 'drop', listener: Listener): void;
  removeEventListener?(type: 'hashchange' | 'dragover' | 'drop', listener: Listener): void;
  matchMedia(query: string): { readonly matches: boolean };
  scrollTo(x: number, y: number): void;
}
/**
 * A page event. For a drag, `types` says what kind of thing is dragged. A dropped file is
 * looked at only when it lands on the drop zone of a page that takes one.
 */
export interface AppEvent {
  preventDefault(): void;
  readonly target?: unknown;
  readonly dataTransfer?: { readonly types: readonly string[]; readonly files?: ArrayLike<ChosenFile>; dropEffect?: string } | null;
}
interface AppRoot {
  innerHTML: string;
  querySelector(selector: string): unknown;
  addEventListener?(type: 'click', listener: (event: { readonly target: unknown }) => void): void;
}

export interface App {
  readonly route: Route;
  readonly demo: Demo | null;
  readonly left: LeftState;
  /** Takes a chosen or dropped file: looks at it, and opens its review or says why not. */
  takeFile(file: ChosenFile): Promise<void>;
  /** Stops listening to the window. */
  stop(): void;
}

/** The id of the line that tells a screen reader what happened. It is outside the page that is drawn again. */
export const STATUS_ID = 'pathcheck-status';

export function startApp(win: AppWindow): App {
  const root = win.document.getElementById('app');
  if (!root) throw new Error('The page has no place to show PathCheck.');
  const [program] = allPrograms;
  if (!program) throw new Error('PathCheck has no program to show.');
  const { curriculum } = program;
  let route: Route = 'start';
  let demo: Demo | null = null;
  // What the student has entered stays while they move between pages, for this visit. The
  // legacy answer is the one thing remembered from an earlier visit.
  const courses: CourseList = emptyList(readLegacyAnswer(browserStorage()));
  const left: LeftState = emptyLeft();
  const part = <T>(selector: string): T | null => root.querySelector(selector) as T | null;

  // One polite status line for what happens on a page that is drawn again as a whole: made
  // once, beside the page, so that what is said in it is read out.
  const status = ((): { replaceChildren(text: string): void } | null => {
    const doc = win.document as unknown as Partial<Document>;
    if (!doc.body || !doc.createElement) return null;
    const existing = doc.getElementById?.(STATUS_ID);
    if (existing) return existing;
    const line = doc.createElement('p');
    line.id = STATUS_ID;
    line.className = 'sr-only';
    line.setAttribute('role', 'status');
    line.setAttribute('aria-live', 'polite');
    doc.body.append(line);
    return line;
  })();
  const say = (text: string): void => { status?.replaceChildren(text); };

  const show = (moved: boolean): void => {
    // The demo's timer belongs to the Start page: it stops when the student leaves.
    demo?.stop();
    demo = null;
    route = routeOf(win.location.hash);
    root.innerHTML = renderPage(route, allPrograms, courses, left);
    win.document.title = titleOf(route);
    const player = part<DemoRoot>('[data-demo]');
    if (player) demo = setupDemo(player, { reducedMotion: win.matchMedia('(prefers-reduced-motion: reduce)').matches, timers: win });
    if (route === 'check') setupCheck(root as unknown as ParentNode, courses, curriculum);
    if (route === 'left' && part('main.left')) {
      setupLeft(root as unknown as ParentNode, left, curriculum, {
        browse,
        redraw: () => show(false),
        correct: (line, correction) => { if (left.transcript) left.transcript = correctRow(left.transcript, line, correction, curriculum); },
        say,
      }, next => { Object.assign(left, next); });
    }
    if (moved) {
      // What was said on the page before does not stay behind on this one.
      say('');
      // A new page starts at its top, with the keyboard and a screen reader on its heading.
      part<{ focus(): void }>('h1')?.focus();
      win.scrollTo(0, 0);
    }
  };

  // The address the app has just moved to by itself and already shown.
  let shownAlready: string | null = null;
  /** Shows the page of the transcript flow, wherever the student is. */
  const showLeft = (): void => {
    if (routeOf(win.location.hash) !== 'left') {
      // The browser tells the page of the new address a moment later; it is shown now.
      shownAlready = HREF.left;
      win.location.hash = HREF.left;
    }
    show(true);
  };

  // Each file taken has a number: only the last one chosen may change the page.
  let latest = 0;
  const takeFile = async (file: ChosenFile): Promise<void> => {
    // A transcript is already there: another file is not read. "Use another transcript" is the way.
    if (left.transcript) {
      showLeft();
      say(ANOTHER_FIRST);
      return;
    }
    const mine = ++latest;
    let refusal: Refusal | null = null;
    let transcript: LeftState['transcript'] = null;
    try {
      const upload = await readFile(file);
      if (upload.ok) transcript = openTranscript(upload.name, upload.answer, curriculum);
      else refusal = upload.refusal;
    } catch (error) {
      // A reader's answer that is no answer; or a file that could not be opened at all.
      refusal = error instanceof ReaderError ? 'unavailable' : 'unreadable';
    }
    // Another file was chosen meanwhile: this one changes nothing.
    if (mine !== latest) return;
    Object.assign(left, { transcript, continued: false, refusal, editing: null, draft: null });
    showLeft();
    if (refusal) {
      // The reason is on the page and is read out; the keyboard is where another file is chosen.
      say(refusalText(refusal));
      part<{ focus(): void }>('[data-browse]')?.focus();
    }
  };

  // The file picker: a file control made for the moment, so that no page has a field to
  // fill in, and the same file can be chosen twice. It is kept until a file is chosen: a
  // control nothing holds on to can be thrown away by the browser while the picker is open.
  let picker: HTMLInputElement | null = null;
  function browse(): void {
    const input = (win.document as unknown as Document).createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.addEventListener('change', () => {
      const [file] = input.files ?? [];
      if (picker === input) picker = null;
      if (file) void takeFile(file);
    });
    picker = input;
    input.click();
  }

  const onHashChange: Listener = () => {
    const already = shownAlready === win.location.hash;
    shownAlready = null;
    if (!already) show(true);
  };
  root.addEventListener?.('click', event => {
    // "Browse files" on Start; the page of the flow has its own.
    const target = event.target as { closest?(selector: string): unknown } | null;
    if (route === 'start' && target?.closest?.('[data-browse]')) browse();
  });

  // A file dropped on the page must never make the browser open it in place of PathCheck.
  // Dragged text is left alone. A file is taken only when it is dropped on a drop zone;
  // anywhere else nothing of it is looked at.
  const carriesFiles = (event: AppEvent): boolean => event.dataTransfer?.types.includes('Files') === true;
  const onDropZone = (event: AppEvent): boolean => Boolean((event.target as { closest?(selector: string): unknown } | null)?.closest?.('[data-drop]'));
  const reviewing = (): boolean => route === 'left' && left.transcript !== null;
  const onDragOver: Listener = event => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    // During a review the drop is let through, so that the student can be told what to do.
    if (event.dataTransfer) event.dataTransfer.dropEffect = onDropZone(event) || reviewing() ? 'copy' : 'none';
  };
  const onDrop: Listener = event => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    if (reviewing()) {
      say(ANOTHER_FIRST);
    } else if (onDropZone(event)) {
      const file = event.dataTransfer?.files?.[0];
      if (file) void takeFile(file);
    }
  };
  win.addEventListener('hashchange', onHashChange);
  win.addEventListener('dragover', onDragOver);
  win.addEventListener('drop', onDrop);
  show(false);
  return {
    get route() { return route; },
    get demo() { return demo; },
    left,
    takeFile,
    stop(): void {
      demo?.stop();
      win.removeEventListener?.('hashchange', onHashChange);
      win.removeEventListener?.('dragover', onDragOver);
      win.removeEventListener?.('drop', onDrop);
    },
  };
}
