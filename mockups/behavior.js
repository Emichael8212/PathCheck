// The only two things that move in the mockups: the "See it work" demo on Start, and
// printing "What I have left". Everything else is drawn, not wired.

export const STEP_MS = 3600;
export const nextStep = (n, total) => (n % total) + 1;

// Four frames that advance on their own. The round button pauses and plays; the dashes jump
// to a step. With Reduce Motion on, nothing advances until the student asks.
export function setupDemo(root, { reducedMotion = false, timers = globalThis } = {}) {
  const frames = [...root.querySelectorAll('[data-step]')];
  const captions = [...root.querySelectorAll('[data-caption]')];
  const dots = [...root.querySelectorAll('[data-go]')];
  const toggle = root.querySelector('[data-toggle]');
  let step = 1;
  let timer = null;

  const show = n => {
    step = n;
    frames.forEach(f => { f.hidden = Number(f.dataset.step) !== n; });
    captions.forEach(c => { c.hidden = Number(c.dataset.caption) !== n; });
    dots.forEach(d => {
      if (Number(d.dataset.go) === n) d.setAttribute('aria-current', 'step');
      else d.removeAttribute('aria-current');
    });
  };
  const stop = () => {
    if (timer !== null) timers.clearInterval(timer);
    timer = null;
    toggle.dataset.playing = 'false';
    toggle.setAttribute('aria-label', 'Play demo');
  };
  const play = () => {
    stop();
    timer = timers.setInterval(() => show(nextStep(step, frames.length)), STEP_MS);
    toggle.dataset.playing = 'true';
    toggle.setAttribute('aria-label', 'Pause demo');
  };

  toggle.addEventListener('click', () => (timer === null ? play() : stop()));
  dots.forEach(d => d.addEventListener('click', () => { stop(); show(Number(d.dataset.go)); }));
  show(1);
  if (reducedMotion) stop(); else play();
  return { show, play, stop, get step() { return step; }, get playing() { return timer !== null; } };
}

// Printing shows every requirement's courses, whatever is open on screen.
export function setupPrint(doc, win) {
  let closed = [];
  win.addEventListener('beforeprint', () => {
    closed = [...doc.querySelectorAll('details:not([open])')];
    closed.forEach(d => { d.open = true; });
  });
  win.addEventListener('afterprint', () => {
    closed.forEach(d => { d.open = false; });
    closed = [];
  });
  doc.querySelector('[data-print]')?.addEventListener('click', () => win.print());
}
