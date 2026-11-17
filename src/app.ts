// The app: one page, three addresses. Shows the page for the address, and keeps doing so
// as the student moves about.
import { NO_TRANSCRIPT, checkPage, checkReport, emptyList, setupCheck, type CheckView, type CourseList, type OnCheck } from './check';
import { programs as allPrograms, type Program } from './curriculum';
import { setupDemo, type Demo, type DemoRoot, type Timers } from './demo';
import { ANOTHER_FIRST, countLine, emptyLeft, leftPage, leftReport, refusalText, setupLeft, type LeftState } from './left';
import { PRINT_TITLE, closeAfterPaper, openForPaper } from './print';
import { CLEARED, browserNumber, canKeep, clearStored, keptText, loadKept, storeKept, type KeptResult } from './remember';
import { botToken, siteKeyOf, type CheckWindow } from './turnstile';
import { browserStorage, clearLegacyAnswer, readLegacyAnswer, writeLegacyAnswer } from './legacy';
import { ReaderError } from './reader';
import { correctRow, openTranscript, reviewedStandings, stillToFix, takenOn } from './review';
import { HREF, dayOf, oldReviewBanner, reportLink, routeOf, titleOf, type Day, type Route } from './shell';
import { startPage } from './start';
import { READS_MADE_UP, readFile, type ChosenFile, type Refusal } from './upload';
import { READING, TICK } from './wording';

/**
 * A page. `today` is the day on the student's device: with it, a curriculum whose last
 * review is more than twelve months old gets its banner before everything else. Nothing
 * else on any page depends on the day.
 */
export const renderPage = (route: Route, programs: readonly Program[] = allPrograms, list: CourseList = emptyList(), left: LeftState = emptyLeft(), onCheck: OnCheck = NO_TRANSCRIPT, today: Day | null = null): string => {
  const [program] = programs;
  if (!program) throw new Error('PathCheck has no program to show.');
  // Something of the student's is on a page or kept: "Clear my data" is then offered on "See what I have left" before a result too.
  const kept = list.entries.length > 0 || list.legacy !== null || left.transcript !== null;
  const page = route === 'start' ? startPage(programs) : route === 'check' ? checkPage(program.curriculum, list, onCheck) : leftPage(program.curriculum, left, list.legacy, kept);
  return `${oldReviewBanner(program.curriculum, today)}${page}`;
};

type Listener = (event: AppEvent) => void;
type MediaListener = (change: { readonly matches: boolean }) => void;
/** A media query, and (where the browser tells) when it starts or stops matching. */
interface MediaWatch {
  readonly matches: boolean;
  addEventListener?(type: 'change', listener: MediaListener): void;
  removeEventListener?(type: 'change', listener: MediaListener): void;
}
/** As much of the browser as the app uses. */
export interface AppWindow extends Timers {
  readonly document: { title: string; getElementById(id: string): AppRoot | null };
  readonly location: { hash: string };
  addEventListener(type: 'hashchange' | 'dragover' | 'drop' | 'beforeprint' | 'afterprint' | 'click' | 'change' | 'keydown', listener: Listener): void;
  removeEventListener?(type: 'hashchange' | 'dragover' | 'drop' | 'beforeprint' | 'afterprint' | 'click' | 'change' | 'keydown', listener: Listener): void;
  matchMedia(query: string): MediaWatch;
  /** The browser's print window. Some in-app browsers have none. */
  print?(): void;
  /** Now, on the student's device: only the day is used, and only for the banner of an old review. (The clock, unless a test sets it.) */
  today?(): Date;
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
  setAttribute?(name: string, value: string): void;
  querySelector(selector: string): unknown;
  addEventListener?(type: 'click' | 'pointerdown' | 'focusin', listener: (event: { readonly target: unknown }) => void): void;
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
/** The place of Cloudflare's bot check (F22): one element beside the page, kept through every redraw. */
export const CHECK_ID = 'pathcheck-check';

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

  // Remembering (F19). What the browser kept comes back, checked again: the list, and the
  // last result with its pace settings and moves. From then on the visit is kept each time
  // it changes: the list always, a result once the student has continued from the review
  // (a review in progress is not a result, and the last result stays kept meanwhile).
  const storage = browserStorage();
  // (A kept result is called made-up only where the made-up transcripts can be read at all.)
  const back = loadKept(storage, curriculum, READS_MADE_UP);
  let keptResult: KeptResult | null = back?.result ?? null;
  if (back) {
    Object.assign(courses, { entries: back.entries, term: back.term });
    if (back.result) Object.assign(left, { transcript: back.result.transcript, continued: true, pace: back.result.pace, moves: back.result.moves });
  }
  // Where the browser keeps nothing, the pages do not say that anything stays.
  if (!canKeep(storage)) root.setAttribute?.('data-keeps', 'no');
  let stored: string | null | undefined;
  const keep = (): void => {
    if (left.transcript === null) keptResult = null;
    else if (left.continued) keptResult = { transcript: left.transcript, pace: left.pace, moves: left.moves };
    const text = keptText(curriculum, courses, keptResult);
    if (text === stored) return;
    stored = text;
    // The browser stopped keeping (its storage is full): the pages no longer say that anything stays.
    if (!storeKept(storage, text)) root.setAttribute?.('data-keeps', 'no');
  };
  const part = <T>(selector: string): T | null => root.querySelector(selector) as T | null;

  // "Check my courses" uses the same transcript once it is reviewed. Why a file chosen on
  // that page was not taken is said there.
  let checkRefusal: Refusal | null = null;
  let checkView: CheckView | null = null;
  const onCheck = (): OnCheck => {
    const { transcript } = left;
    if (!transcript) return { state: 'none', refusal: left.reading ? (left.tick ? TICK : READING) : checkRefusal ? refusalText(checkRefusal) : null };
    if (!left.continued) return { state: 'reviewing' };
    const toFix = stillToFix(transcript).length;
    // With no row taken on there is nothing to go by; with rows still to fix nothing is exact.
    const use = takenOn(transcript).length > 0 ? { standings: reviewedStandings(transcript, curriculum.grades), exact: toFix === 0 } : null;
    return { state: 'added', name: transcript.name, use, counts: countLine(transcript), toFix, pace: left.pace };
  };

  // The sentence about another transcript goes with the next thing the student does on the page:
  // out of the state, and off the page at once, also where only a part of the page is drawn again.
  const noNotice = (): void => {
    if (!left.notice) return;
    left.notice = false;
    part<{ remove(): void }>('[data-notice]')?.remove();
  };

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
  // The place where Cloudflare's widget is drawn when a file is read on the hosted site: made once, beside
  // the page, so that a box to tick is not lost when the page is drawn again or the student moves on.
  // Empty, it is out of sight.
  const checkPlace = ((): unknown => {
    const doc = win.document as unknown as Partial<Document>;
    if (!doc.body || !doc.createElement) return null;
    const existing = doc.getElementById?.(CHECK_ID);
    if (existing) return existing;
    const place = doc.createElement('div');
    place.id = CHECK_ID;
    place.className = 'bot-check no-print';
    // (The keyboard can be put on it when a box waits there: the next Tab then enters the widget.)
    place.tabIndex = -1;
    doc.body.append(place);
    return place;
  })();

  // Printing (F17). The result is opened for paper and the tab named for the file: by the
  // button before its own print call, and for the browser's own Print when the browser
  // says printing starts (its event, or the print media query). It can be done again
  // while the page is open for paper. The page is put back, once, when the browser says
  // printing has ended, or when the page is next drawn: never when the print call
  // returns, because on some phones it returns before the paper is laid out. (The
  // stylesheet's print rules cover a browser that gives no signal at all.)
  let paper: { opened: Set<HTMLDetailsElement>; title: string } | null = null;
  const forPaper = (): void => {
    const opened = paper?.opened ?? new Set<HTMLDetailsElement>();
    if (!openForPaper(root as unknown as ParentNode, opened)) return;
    if (paper) return;
    paper = { opened, title: win.document.title };
    win.document.title = PRINT_TITLE;
  };
  const fromPaper = (): void => {
    if (!paper) return;
    const { opened, title } = paper;
    paper = null;
    closeAfterPaper(root as unknown as ParentNode, opened);
    win.document.title = title;
  };
  const printMedia = win.matchMedia('print');
  // A browser may tell of the print query turning on only after printing has ended: the
  // page is opened only while the query does match.
  const onPrintMedia: MediaListener = change => {
    if (!change.matches) fromPaper();
    else if (printMedia.matches) forPaper();
  };
  const print = typeof win.print === 'function' ? (): void => {
    forPaper();
    win.print?.();
  } : null;

  const show = (moved: boolean): void => {
    // A page drawn again is as the student left it: nothing of a print is put back onto it.
    fromPaper();
    // The demo's timer belongs to the Start page: it stops when the student leaves.
    demo?.stop();
    demo = null;
    if (moved) checkRefusal = null;
    route = routeOf(win.location.hash);
    root.innerHTML = renderPage(route, allPrograms, courses, left, onCheck(), dayOf(win.today?.() ?? new Date()));
    win.document.title = titleOf(route);
    const player = part<DemoRoot>('[data-demo]');
    if (player) demo = setupDemo(player, { reducedMotion: win.matchMedia('(prefers-reduced-motion: reduce)').matches, timers: win });
    checkView = route === 'check' ? setupCheck(root as unknown as ParentNode, courses, curriculum, onCheck, {
      browse,
      // The transcript and its corrections go; the pace range chosen for the visit stays.
      forget: () => { Object.assign(left, { ...emptyLeft(), pace: { ...left.pace, target: null } }); checkRefusal = null; },
      // One target semester for both flows.
      target: term => { left.pace = { ...left.pace, target: term }; },
      // The review, with its corrections as they are; "Continue" there comes back here.
      review: () => { Object.assign(left, { continued: false, editing: null, draft: null, returnTo: 'check' }); goTo('left'); },
    }) : null;
    if (route === 'left' && part('main.left')) {
      setupLeft(root as unknown as ParentNode, left, curriculum, {
        browse,
        redraw: () => show(false),
        correct: (line, correction) => { if (left.transcript) left.transcript = correctRow(left.transcript, line, correction, curriculum); },
        say,
        answer: () => courses.legacy,
        print,
        // One legacy answer for both flows, remembered in the browser.
        legacy: answer => {
          noNotice();
          courses.legacy = answer;
          if (answer === null) clearLegacyAnswer(browserStorage());
          else writeLegacyAnswer(browserStorage(), answer);
          show(false);
        },
        // Back to "Check my courses" when the transcript was asked for there.
        continued: () => {
          if (left.returnTo !== 'check') return;
          left.returnTo = 'left';
          goTo('check');
        },
      }, next => {
        Object.assign(left, next);
        noNotice();
      });
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
  /** Shows a page of one of the two flows, wherever the student is. */
  function goTo(to: 'left' | 'check'): void {
    if (routeOf(win.location.hash) !== to) {
      // The browser tells the page of the new address a moment later; it is shown now.
      shownAlready = HREF[to];
      win.location.hash = HREF[to];
    }
    show(true);
  }
  const showLeft = (): void => goTo('left');

  // Each file taken has a number: only the last one chosen may change the page.
  let latest = 0;
  // The bot check that is running for a file, if one is: ended when that file is no longer wanted, so that
  // no box waits for a tick that would send a file the student has given up.
  let endCheck: (() => void) | null = null;
  const noCheck = (): void => {
    const end = endCheck;
    endCheck = null;
    end?.();
  };
  const takeFile = async (file: ChosenFile): Promise<void> => {
    // A transcript is already there: another file is not read. "Use another transcript" is the way.
    if (left.transcript) {
      // Said on the page, under its heading, and read out: the file chosen is not the one whose rows are shown.
      left.notice = true;
      showLeft();
      say(ANOTHER_FIRST);
      return;
    }
    // Another file takes the place of one that is still being checked: that check is over.
    noCheck();
    const mine = ++latest;
    // Where the file was chosen: a transcript asked for on "Check my courses" comes back there.
    const from = route;
    // Reading takes a moment on the hosted site: the page says so where a refusal would stand.
    left.reading = true;
    left.tick = false;
    left.refusal = null;
    checkRefusal = null;
    if (route === 'check') {
      checkView?.refresh();
      part<{ focus(): void }>('[data-choose]')?.focus();
    } else if (route === 'left') {
      show(false);
      part<{ focus(): void }>('[data-browse]')?.focus();
    } else showLeft();
    say(READING);
    let refusal: Refusal | null = null;
    let transcript: LeftState['transcript'] = null;
    try {
      // On the hosted site the reader is asked only with a passed bot check, and counts the day's uploads
      // under a random number of this browser's making (F22). On a development server neither is used.
      // When Cloudflare wants its box ticked, the page says so where it said that it is reading, reads it out,
      // and puts the keyboard on the box's place; afterwards it says again that it is reading.
      const step = (tick: boolean): void => {
        if (mine !== latest || !left.reading) return;
        left.tick = tick;
        if (route === 'check') checkView?.refresh();
        else if (route === 'left' && !left.transcript) show(false);
        say(tick ? TICK : READING);
        // While a tick is asked the place is on the page even if the widget has drawn nothing into it yet,
        // so that it can take the keyboard whatever the widget does first.
        const place = checkPlace as { focus?(): void; toggleAttribute?(name: string, on: boolean): void } | null;
        place?.toggleAttribute?.('data-asked', tick);
        if (tick) place?.focus?.();
      };
      const upload = await readFile(file, {
        // A token for a file that is no longer wanted (another was chosen, or the data was cleared) is no token:
        // nothing is sent for it, and no number of the browser's is made or kept.
        token: async () => {
          const token = await botToken(win as unknown as CheckWindow, checkPlace, siteKeyOf(import.meta.env.VITE_TURNSTILE_SITE_KEY), undefined, {
            asked: () => { step(true); },
            answered: () => { step(false); },
            begun: end => { if (mine === latest) endCheck = end; else end(); },
          });
          if (mine === latest) endCheck = null;
          return mine === latest ? token : null;
        },
        browser: () => browserNumber(storage, (win.today?.() ?? new Date()).toISOString().slice(0, 10)),
      });
      if (upload.ok) transcript = openTranscript(upload.name, upload.answer, curriculum, false, upload.madeUp);
      else refusal = upload.refusal;
    } catch (error) {
      // A reader's answer that is no answer; or a file that could not be opened at all.
      refusal = error instanceof ReaderError ? 'unavailable' : 'unreadable';
    }
    // Another file was chosen meanwhile, or the student cleared their data: this file changes nothing.
    if (mine !== latest) return;
    left.reading = false;
    left.tick = false;
    if (refusal && from === 'check' && route === 'check') {
      // Not taken: the student stays on "Check my courses", and the card says why.
      checkRefusal = refusal;
      checkView?.refresh();
      say(refusalText(refusal));
      part<{ focus(): void }>('[data-choose]')?.focus();
      return;
    }
    // (A file refused after the student left "Check my courses" brings nobody back there.)
    const returnTo = from === 'check' && !refusal ? 'check' : from === 'left' ? left.returnTo : 'left';
    // A new transcript: the term chosen for the pace line of the last one does not go with it.
    if (transcript) courses.term = null;
    Object.assign(left, { transcript, continued: false, refusal, editing: null, draft: null, returnTo });
    keep();
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
    if (already) return;
    // The student moved on: the sentence about another transcript does not follow.
    left.notice = false;
    show(true);
  };
  root.addEventListener?.('click', event => {
    // "Browse files" on Start; the page of the flow has its own.
    const target = event.target as { closest?(selector: string): unknown } | null;
    if (route === 'start' && target?.closest?.('[data-browse]')) browse();
    if (target?.closest?.('[data-clear]')) clearData();
    fillReport(event);
  });
  // "Report a mistake": the email is filled in with what the page shows at this moment,
  // whatever was changed since the page was drawn. Then the browser follows the link. It
  // is filled in as soon as the link is pressed or reached (a middle click, the link's
  // own menu, the keyboard), not only when it is followed.
  function fillReport(event: { readonly target: unknown }): void {
    const target = event.target as { closest?(selector: string): unknown } | null;
    const report = target?.closest?.('.foot a') as { setAttribute(name: string, value: string): void } | null | undefined;
    if (!report) return;
    report.setAttribute('href', route === 'check' ? checkReport(curriculum, courses, onCheck())
      : route === 'left' ? leftReport(curriculum, left, courses.legacy) : reportLink(curriculum));
  }
  // "Clear my data": everything PathCheck stored in the browser goes, the legacy answer
  // included, and with it what is on the pages. The page is then as on a first visit.
  function clearData(): void {
    // A file that is still being read is not taken any more, and a bot check waiting for it is ended.
    latest++;
    noCheck();
    clearStored(storage);
    Object.assign(courses, emptyList());
    Object.assign(left, emptyLeft());
    checkRefusal = null;
    keptResult = null;
    stored = null;
    show(false);
    // Said on the page until the student moves on, and to a screen reader.
    (root as unknown as Partial<ParentNode>).querySelector?.('main')?.insertAdjacentHTML('afterbegin', `<p class="note cleared" data-cleared>${CLEARED}</p>`);
    say(CLEARED);
    part<{ focus(): void }>('h1')?.focus();
  }
  root.addEventListener?.('pointerdown', fillReport);
  root.addEventListener?.('focusin', fillReport);

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
      left.notice = true;
      showLeft();
      say(ANOTHER_FIRST);
    } else if (onDropZone(event)) {
      const file = event.dataTransfer?.files?.[0];
      if (file) void takeFile(file);
    }
  };
  win.addEventListener('hashchange', onHashChange);
  win.addEventListener('dragover', onDragOver);
  win.addEventListener('drop', onDrop);
  // After anything the student does, when every handler of the page has run, the visit is kept as it now stands.
  const onChange: Listener = () => keep();
  // Anything pressed or chosen on "See what I have left" (a card opened, the filter, Print, a list) is such a next thing.
  // (Moving through the page with the keyboard is not: the sentence stays while it is being reached.)
  const onAct: Listener = event => {
    const target = (event as { target?: unknown }).target as { closest?(selector: string): unknown } | null | undefined;
    if (route === 'left' && target?.closest?.('main')) noNotice();
  };
  win.addEventListener('click', onAct);
  win.addEventListener('change', onAct);
  win.addEventListener('click', onChange);
  win.addEventListener('change', onChange);
  win.addEventListener('keydown', onChange);
  // What came back is kept again as it was checked: anything that could not be read is gone from the browser too.
  keep();
  win.addEventListener('beforeprint', forPaper);
  win.addEventListener('afterprint', fromPaper);
  printMedia.addEventListener?.('change', onPrintMedia);
  show(false);
  return {
    get route() { return route; },
    get demo() { return demo; },
    left,
    takeFile,
    stop(): void {
      demo?.stop();
      fromPaper();
      win.removeEventListener?.('hashchange', onHashChange);
      win.removeEventListener?.('dragover', onDragOver);
      win.removeEventListener?.('drop', onDrop);
      win.removeEventListener?.('click', onAct);
      win.removeEventListener?.('change', onAct);
      win.removeEventListener?.('click', onChange);
      win.removeEventListener?.('change', onChange);
      win.removeEventListener?.('keydown', onChange);
      win.removeEventListener?.('beforeprint', forPaper);
      win.removeEventListener?.('afterprint', fromPaper);
      printMedia.removeEventListener?.('change', onPrintMedia);
    },
  };
}
