// Direction B — Meter. The degree is one bar, 121 credits long, and every screen shows
// where you are on it. Solid is counted, striped is being taken now, open is still to do.
// Each part of the bar carries its own number and word, so nothing has to be decoded.
import { check, left, start } from '../data.js';
import * as s from '../shared.js';

const startPage = () => s.shell('start', 'Start', `
<main class="start">
  <h1>${s.esc(start.promise)}</h1>
  ${s.ways()}
  ${s.demo()}
</main>`);

// One cell per typed course, in order. A crossed-out cell says "Doesn't count". The
// others are plain and carry only the course code: "counts" is only ever said in the
// rows below, next to its condition, never by a graphic on its own.
const courseMeter = () => `
<ol class="meter course-meter" aria-label="Your ${check.courses.length} courses">
  ${check.courses.map(course => `
  <li class="seg ${course.counts ? 'counts' : 'no'}">
    <span class="seg-bar" aria-hidden="true"></span>
    <span class="seg-label">${s.code(course.code)}${course.counts ? '' : ' <span class="seg-word">Doesn’t count</span>'}</span>
  </li>`).join('')}
</ol>`;

const checkPage = () => s.shell('check', 'Check my courses, Spring 2027', `
<main class="check">
  <header class="head">
    <h1>${s.esc(check.heading)}</h1>
    <p class="term-name">${s.esc(check.term)}</p>
  </header>
  ${s.noSummary()}
  ${courseMeter()}
  ${s.rows()}
  <section class="after" aria-label="Totals">
    ${s.totals()}
    ${s.reminder()}
    ${s.transcriptButton()}
  </section>
</main>
${s.addCourse()}`);

const part = (state, n, label, extra = '') => `
  <li class="seg ${state}" style="--n: ${n}">
    <span class="seg-bar" aria-hidden="true"></span>
    <span class="seg-label"><strong>${n}</strong> ${label}${extra}</span>
  </li>`;

const degreeMeter = () => `
<ol class="meter degree-meter" aria-label="${left.total} credits in the degree">
  ${part('done', left.counted, 'counted')}
  ${part('progress', left.inProgress, 'in progress', ` <span class="seg-extra">(${s.esc(left.inProgressTerm)})</span>`)}
  ${part('needed', left.remaining, 'left')}
</ol>
<p class="meter-total">${left.total} total</p>`;

// A small bar per block: how much of it is counted so far.
const blockMeter = b => `
  <span class="mini" aria-hidden="true"><span class="mini-fill" style="width: ${(b.counted / b.needed) * 100}%"></span></span>`;

const leftPage = () => s.shell('left', 'See what I have left', `
<main class="left">
  <header class="head">
    <h1>${s.esc(left.creditsLeft)}</h1>
    <p class="pace">${s.esc(left.pace)} <span class="pace-detail">(${s.esc(left.paceDetail)})</span></p>
  </header>
  <div class="degree">${degreeMeter()}</div>
  <p class="caveat">${s.esc(left.caveat)}</p>
  ${s.paceControls()}
  <section class="checklist" aria-labelledby="req-title">
    <h2 id="req-title">Your CIS requirements</h2>
    <div class="block-grid">${s.blocks(blockMeter)}</div>
    ${s.sequence()}
  </section>
  ${s.plan()}
</main>
${s.leftActions()}`);

export const render = page => ({ start: startPage, check: checkPage, left: leftPage })[page]();
