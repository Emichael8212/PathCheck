// The few things that move in the mockups: the "See it work" demo on Start; and on "What I
// have left", the two credit steppers and printing. Everything else is drawn, not wired.

export const STEP_MS = 3600;
export const nextStep = (n, total) => (n % total) + 1;

// Four frames that advance on their own. The round button pauses and plays; the dashes jump
// to a step. With Reduce Motion on, nothing advances until the student asks.
export function setupDemo(root, { reducedMotion = false, timers = globalThis } = {}) {
  const frames = [...root.querySelectorAll('[data-step]')];
  const captions = [...root.querySelectorAll('[data-caption]')];
  const dots = [...root.querySelectorAll('[data-go]')];
  const toggle = root.querySelector('[data-toggle]');
  const live = root.querySelector('[data-live]');
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
    // Announce the caption only when the student moves the demo, not every few seconds.
    live.setAttribute('aria-live', 'polite');
  };
  const play = () => {
    stop();
    timer = timers.setInterval(() => show(nextStep(step, frames.length)), STEP_MS);
    toggle.dataset.playing = 'true';
    toggle.setAttribute('aria-label', 'Pause demo');
    live.setAttribute('aria-live', 'off');
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

// "Fewest" and "Most" credits per term. Both can be changed and PathCheck sets no hard limit:
// the portal enforces the real one. A neutral note appears under 12 and over 18.
export const FULL_TIME = 12;
export const USUAL_MOST = 18;
export function stepCredits({ fewest, most }, which, delta) {
  if (which === 'fewest') return { fewest: Math.min(most, Math.max(1, fewest + delta)), most };
  return { fewest, most: Math.max(fewest, most + delta) };
}
export const creditNotes = ({ fewest, most }) => ({ fewest: fewest < FULL_TIME, most: most > USUAL_MOST });

export function setupCredits(doc) {
  const fields = { fewest: doc.querySelector('[data-stepper="fewest"]'), most: doc.querySelector('[data-stepper="most"]') };
  const read = name => Number(fields[name].querySelector('[data-value]').textContent);
  let state = { fewest: read('fewest'), most: read('most') };
  const show = () => {
    const notes = creditNotes(state);
    for (const name of ['fewest', 'most']) {
      fields[name].querySelector('[data-value]').textContent = String(state[name]);
      fields[name].querySelector('[data-note]').hidden = !notes[name];
    }
  };
  for (const name of ['fewest', 'most']) {
    for (const button of fields[name].querySelectorAll('[data-delta]')) {
      button.addEventListener('click', () => { state = stepCredits(state, name, Number(button.dataset.delta)); show(); });
    }
  }
  show();
  return { get state() { return state; } };
}
