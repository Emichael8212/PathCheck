// Direction 1 — Worksheet. The page is the advising sheet a student would mark up by
// hand: tick boxes down the left edge and highlighter over the words that matter.
import { check, left } from '../data.js';
import { esc, footer, header, sum } from '../shared.js';

const cls = { 'Done': 'done', 'In progress': 'progress', 'Still needed': 'needed' };
const tick = { done: '✓', progress: '•', needed: '' };
const box = state => `<span class="box ${state}" aria-hidden="true">${tick[state]}</span>`;
const hl = (state, text) => `<mark class="hl ${state}">${esc(text)}</mark>`;
const credits = n => `${n} credit${n === 1 ? '' : 's'}`;

const checkPage = () => `
${header()}
<main>
  <h1 class="question">${esc(check.question)}</h1>
  <p class="answer">${hl('done', check.answerCounts)} ${hl('needed', check.answerDoesnt)}</p>
  <ul class="rows">
    ${check.courses.map(c => `
    <li>
      ${box(c.counts ? 'done' : 'needed')}
      <div>
        <p class="course"><strong>${esc(c.code)}</strong> ${esc(c.title)}</p>
        <p class="verdict">${hl(c.counts ? 'done' : 'needed', c.text)}</p>
      </div>
    </li>`).join('')}
  </ul>
  <p class="margin-note">${esc(check.reminder)}</p>
  <p class="total"><strong>${esc(check.total)}</strong> this semester. ${esc(check.totalNote)}</p>
  <p><button type="button" class="primary">${esc(check.transcript)}</button></p>
</main>
${footer('check', 'Check my courses')}`;

const courseLine = c => `
      <li>
        ${box(c.state)}
        <p class="course"><strong>${esc(c.code)}</strong> ${esc(c.title)}${c.note ? ` ${hl(c.state === 'progress' ? 'progress' : 'needed', c.note)}` : ''}</p>
      </li>`;

const block = b => {
  const state = cls[b.status];
  const doneCourses = b.courses.filter(c => c.state === 'done');
  const open = b.courses.filter(c => c.state !== 'done');
  const heading = `${box(state)}<span class="block-name">${esc(b.name)}</span> ${hl(state, b.status)} <span class="small">${credits(b.credits)}</span>`;
  if (b.status === 'Done') {
    return `
  <details class="block">
    <summary>${heading}</summary>
    <ul class="rows inner">${doneCourses.map(courseLine).join('')}</ul>
  </details>`;
  }
  return `
  <section class="block">
    <h3>${heading}</h3>
    ${b.hint ? `<p class="small hint">${esc(b.hint)}</p>` : ''}
    <ul class="rows inner">${open.map(courseLine).join('')}</ul>
    ${doneCourses.length ? `
    <details class="already">
      <summary>${doneCourses.length} already done</summary>
      <ul class="rows inner">${doneCourses.map(courseLine).join('')}</ul>
    </details>` : ''}
  </section>`;
};

const leftPage = () => `
${header()}
<main>
  <h1 class="question">${esc(left.question)}</h1>
  <p class="answer">${hl('needed', left.answerLeft)} ${hl('done', left.answerPace)}</p>
  <p class="small">${left.pace.inputs.map(esc).join(', ')}. <button type="button" class="quiet">Change</button></p>
  <p class="margin-note">${esc(left.pace.caveat)}</p>

  <h2>Your CIS degree checklist</h2>
  ${left.blocks.map(block).join('')}

  <h2>Draft plan</h2>
  <p class="margin-note">${esc(left.planLabel)}</p>
  <div class="plan">
    ${left.plan.map(term => `
    <section class="term">
      <h3>${esc(term.term)} <span class="small">${credits(sum(term.courses))}</span></h3>
      <ul class="rows inner">
        ${term.courses.map(c => `
        <li>
          ${box('needed')}
          <p class="course"><strong>${esc(c.code)}</strong> ${esc(c.title)}</p>
          <button type="button" class="quiet">Move later</button>
        </li>`).join('')}
      </ul>
    </section>`).join('')}
  </div>
  <p><button type="button" class="primary">Print / PDF</button></p>
</main>
${footer('left', 'See what I have left')}`;

export const render = which => (which === 'check' ? checkPage() : leftPage());
