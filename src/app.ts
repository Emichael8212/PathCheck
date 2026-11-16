// The app: one page, three addresses. Shows the page for the address, and keeps doing so
// as the student moves about.
import { programs as allPrograms, type Program } from './curriculum';
import { setupDemo, type Demo, type DemoRoot, type Timers } from './demo';
import { HREF, flowPage, routeOf, titleOf, type Route } from './shell';
import { startPage } from './start';

export const renderPage = (route: Route, programs: readonly Program[] = allPrograms): string => {
  const [program] = programs;
  if (!program) throw new Error('PathCheck has no program to show.');
  return route === 'start' ? startPage(programs) : flowPage(route, program.curriculum);
};

/** As much of the browser as the app uses. */
export interface AppWindow extends Timers {
  readonly document: { title: string; getElementById(id: string): AppRoot | null };
  readonly location: { hash: string };
  addEventListener(type: 'hashchange' | 'dragover' | 'drop', listener: (event: { preventDefault(): void }) => void): void;
  matchMedia(query: string): { readonly matches: boolean };
  scrollTo(x: number, y: number): void;
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

  const show = (moved: boolean): void => {
    // The demo's timer belongs to the Start page: it stops when the student leaves.
    demo?.stop();
    demo = null;
    route = routeOf(win.location.hash);
    root.innerHTML = renderPage(route);
    win.document.title = titleOf(route);
    const player = root.querySelector('[data-demo]') as DemoRoot | null;
    if (player) demo = setupDemo(player, { reducedMotion: win.matchMedia('(prefers-reduced-motion: reduce)').matches, timers: win });
    if (moved) {
      // A new page starts at its top, with the keyboard and a screen reader on its heading.
      (root.querySelector('h1') as { focus(): void } | null)?.focus();
      win.scrollTo(0, 0);
    }
  };

  win.addEventListener('hashchange', () => show(true));
  // A file dropped on the page must never make the browser open it in place of PathCheck.
  // Nothing here looks at the file. Until upload is built, a drop on Start opens the flow
  // that will take it.
  win.addEventListener('dragover', event => event.preventDefault());
  win.addEventListener('drop', event => {
    event.preventDefault();
    if (route === 'start') win.location.hash = HREF.left;
  });
  show(false);
  return { get route() { return route; }, get demo() { return demo; } };
}
