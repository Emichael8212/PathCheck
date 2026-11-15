// Direction C — Signs. Read like road signs at a glance on a phone: a large shape and a
// few large words per answer. "Doesn't count" is the one inverted sign on the page.
// On a desktop the same answers line up as a table an advisor can scan and print.
import { check, left, start } from '../data.js';
import * as s from '../shared.js';

const startPage = () => s.shell('start', 'Start', `
<main class="start">
  <h1>${s.esc(start.promise)}</h1>
  ${s.ways()}
  ${s.demo()}
</main>`);

const checkPage = () => s.shell('check', 'Check my courses, Spring 2027', `
<main class="check">
  <header class="head">
    <h1>${s.esc(check.heading)}</h1>
    <p class="term-name">${s.esc(check.term)}</p>
  </header>
  ${s.noSummary()}
  ${s.rows()}
  <section class="after" aria-label="Totals">
    ${s.totals()}
    ${s.reminder()}
    ${s.transcriptButton()}
  </section>
</main>
${s.addCourse()}`);

const figure = (n, label, state) => `
  <li class="${state}">${s.marks[state]}<strong>${n}</strong> <span>${label}</span></li>`;

const leftPage = () => s.shell('left', 'See what I have left', `
<main class="left">
  <header class="head">
    <h1>${s.esc(left.creditsLeft)}</h1>
    <p class="pace">${s.esc(left.pace)} <span class="pace-detail">(${s.esc(left.paceDetail)})</span></p>
  </header>
  <ul class="figures">
    ${figure(left.counted, 'counted', 'done')}
    ${figure(left.inProgress, `in progress (${s.esc(left.inProgressTerm)})`, 'progress')}
    <li class="total-figure"><strong>${left.total}</strong> <span>total</span></li>
  </ul>
  <p class="caveat">${s.esc(left.caveat)}</p>
  ${s.paceControls()}
  <section class="checklist" aria-labelledby="req-title">
    <h2 id="req-title">Your CIS requirements</h2>
    <div class="block-list">${s.blocks()}</div>
    ${s.sequence()}
  </section>
  ${s.plan()}
</main>
${s.leftActions()}`);

export const render = page => ({ start: startPage, check: checkPage, left: leftPage })[page]();
