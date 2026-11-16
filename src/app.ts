// The app: one page, three addresses. Shows the page for the address, and keeps doing so
// as the student moves about.
import { checkPage, emptyList, setupCheck, type CourseList } from './check';
import { programs as allPrograms, type Program } from './curriculum';
import { setupDemo, type Demo, type DemoRoot, type Timers } from './demo';
import { browserStorage, readLegacyAnswer } from './legacy';
import { HREF, flowPage, routeOf, titleOf, type Route } from './shell';
import { startPage } from './start';

export const renderPage = (route: Route, programs: readonly Program[] = allPrograms, list: CourseList = emptyList()): string => {
  const [program] = programs;
  if (!program) throw new Error('PathCheck has no program to show.');
  return route === 'start' ? startPage(programs) : route === 'check' ? checkPage(program.curriculum, list) : flowPage(route, program.curriculum);
};

/** As much of the browser as the app uses. */
export interface AppWindow extends Timers {
  readonly document: { title: string; getElementById(id: string): AppRoot | null };
  readonly location: { hash: string };
  addEventListener(type: 'hashchange' | 'dragover' | 'drop', listener: (event: AppEvent) => void): void;
  matchMedia(query: string): { readonly matches: boolean };
  scrollTo(x: number, y: number): void;
}
/** A page event. For a drag, `types` says what kind of thing is dragged, never what is in it. */
export interface AppEvent {
  preventDefault(): void;
  readonly dataTransfer?: { readonly types: readonly string[] } | null;
}
interface AppRoot {
  innerHTML: string;
  querySelector(selector: string): unknown;
}

export function startApp(win: AppWindow): { readonly route: Route; readonly demo: Demo | null } {
  const root = win.document.getElementById('app');
  if (!root) throw new Error('The page has no place to show PathCheck.');
  let route: Route = 'start';
  let demo: Demo | null = null;
  // What the student has entered stays while they move between pages, for this visit. The
  // legacy answer is the one thing remembered from an earlier visit.
  const courses: CourseList = emptyList(readLegacyAnswer(browserStorage()));

  const show = (moved: boolean): void => {
    // The demo's timer belongs to the Start page: it stops when the student leaves.
    demo?.stop();
    demo = null;
    route = routeOf(win.location.hash);
    root.innerHTML = renderPage(route, allPrograms, courses);
    win.document.title = titleOf(route);
    const player = root.querySelector('[data-demo]') as DemoRoot | null;
    if (player) demo = setupDemo(player, { reducedMotion: win.matchMedia('(prefers-reduced-motion: reduce)').matches, timers: win });
    const [program] = allPrograms;
    if (route === 'check' && program) setupCheck(root as unknown as ParentNode, courses, program.curriculum);
    if (moved) {
      // A new page starts at its top, with the keyboard and a screen reader on its heading.
      (root.querySelector('h1') as { focus(): void } | null)?.focus();
      win.scrollTo(0, 0);
    }
  };

  win.addEventListener('hashchange', () => show(true));
  // A file dropped on the page must never make the browser open it in place of PathCheck.
  // Only the kind of thing dragged is looked at, never the file. Dragged text is left
  // alone. Until upload is built, a file dropped on Start opens the flow that will take it.
  const carriesFiles = (event: AppEvent): boolean => event.dataTransfer?.types.includes('Files') === true;
  win.addEventListener('dragover', event => { if (carriesFiles(event)) event.preventDefault(); });
  win.addEventListener('drop', event => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    if (route === 'start') win.location.hash = HREF.left;
  });
  show(false);
  return { get route() { return route; }, get demo() { return demo; } };
}
