// The "See it work" demo on Start: four frames that advance on their own. The round button
// pauses and plays; the dashes jump to a step. With Reduce Motion on, nothing advances
// until the student asks.

export const STEP_MS = 3600;
export const nextStep = (n: number, total: number): number => (n % total) + 1;

/** As much of an element as the demo uses. */
export interface DemoPart {
  readonly dataset: { [name: string]: string | undefined };
  hidden: boolean;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  addEventListener(type: 'click', listener: () => void): void;
}
export interface DemoRoot {
  querySelectorAll(selector: string): Iterable<DemoPart>;
  querySelector(selector: string): DemoPart | null;
}
export interface Timers {
  setInterval(run: () => void, ms: number): unknown;
  clearInterval(id: never): void;
}
export interface Demo {
  show(step: number): void;
  play(): void;
  stop(): void;
  readonly step: number;
  readonly playing: boolean;
}

export function setupDemo(root: DemoRoot, { reducedMotion = false, timers = globalThis as Timers }: { reducedMotion?: boolean; timers?: Timers } = {}): Demo {
  const frames = [...root.querySelectorAll('[data-step]')];
  const captions = [...root.querySelectorAll('[data-caption]')];
  const dots = [...root.querySelectorAll('[data-go]')];
  const toggle = root.querySelector('[data-toggle]');
  const live = root.querySelector('[data-live]');
  if (!toggle || !live) throw new Error('The demo is missing its play button or its caption.');
  let step = 1;
  let timer: unknown = null;

  const show = (n: number): void => {
    step = n;
    frames.forEach(frame => { frame.hidden = Number(frame.dataset.step) !== n; });
    captions.forEach(caption => { caption.hidden = Number(caption.dataset.caption) !== n; });
    dots.forEach(dot => {
      if (Number(dot.dataset.go) === n) dot.setAttribute('aria-current', 'step');
      else dot.removeAttribute('aria-current');
    });
  };
  const stop = (): void => {
    if (timer !== null) timers.clearInterval(timer as never);
    timer = null;
    toggle.dataset.playing = 'false';
    toggle.setAttribute('aria-label', 'Play demo');
    // The caption is read out only when the student moves the demo, not every few seconds.
    live.setAttribute('aria-live', 'polite');
  };
  const play = (): void => {
    stop();
    timer = timers.setInterval(() => show(nextStep(step, frames.length)), STEP_MS);
    toggle.dataset.playing = 'true';
    toggle.setAttribute('aria-label', 'Pause demo');
    live.setAttribute('aria-live', 'off');
  };

  toggle.addEventListener('click', () => (timer === null ? play() : stop()));
  dots.forEach(dot => dot.addEventListener('click', () => { stop(); show(Number(dot.dataset.go)); }));
  show(1);
  if (reducedMotion) stop(); else play();
  return { show, play, stop, get step() { return step; }, get playing() { return timer !== null; } };
}
