// Direction A — Receipt. Registration is a purchase, so the result reads like the
// receipt you check before you pay: line items, a total, and the items that don't count
// pulled out in plain sight. Page 3 is the statement: what you owe the degree, as a sum.
import { check, left, start } from '../data.js';
import * as s from '../shared.js';

const startPage = () => s.shell('start', 'Start', `
<main class="start">
  <div class="lead">
    <h1>${s.esc(start.promise)}</h1>
    ${s.ways()}
  </div>
  ${s.demo()}
</main>`);

const checkPage = () => s.shell('check', 'Check my courses, Spring 2027', `
<main class="check">
  <header class="head">
    <h1>${s.esc(check.heading)}</h1>
    <p class="term-name">${s.esc(check.term)}</p>
  </header>
  <section class="receipt" aria-label="Your courses">
    ${s.noSummary()}
    ${s.rows()}
  </section>
  <aside class="side" aria-label="Totals">
    ${s.totals()}
    ${s.reminder()}
    ${s.transcriptButton()}
  </aside>
</main>
${s.addCourse()}`);

// The headline as a subtraction, the way a statement shows a balance.
const sum = () => `
<dl class="sum">
  <div><dt>Total for the degree</dt><dd>${left.total}</dd></div>
  <div><dt>Counted</dt><dd>− ${left.counted}</dd></div>
  <div><dt>In progress (${s.esc(left.inProgressTerm)})</dt><dd>− ${left.inProgress}</dd></div>
  <div class="balance"><dt>Left</dt><dd>${left.remaining}</dd></div>
</dl>`;

const leftPage = () => s.shell('left', 'See what I have left', `
<main class="left">
  <header class="head">
    <div>
      <h1>${s.esc(left.creditsLeft)}</h1>
      <p class="pace">${s.esc(left.pace)} <span class="pace-detail">(${s.esc(left.paceDetail)})</span></p>
      <p class="caveat">${s.esc(left.caveat)}</p>
      ${s.paceControls()}
    </div>
    ${sum()}
  </header>
  <section class="checklist" aria-labelledby="req-title">
    <h2 id="req-title">Your CIS requirements</h2>
    ${s.blocks()}
    ${s.sequence()}
  </section>
  ${s.plan()}
</main>
${s.leftActions()}`);

export const render = page => ({ start: startPage, check: checkPage, left: leftPage })[page]();
