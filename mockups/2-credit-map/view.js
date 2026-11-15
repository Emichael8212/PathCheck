// Direction 2 — Credit map. The degree is 121 squares, one per credit. A filled square
// is earned, a striped one is being taken now, an empty one is still to do. Every row
// also says its status in words, so the squares never have to be decoded.
import { check, left } from '../data.js';
import { esc, footer, header, sum } from '../shared.js';

const cls = { 'Done': 'done', 'In progress': 'progress', 'Still needed': 'needed' };
const squares = (state, n) => `<span class="squares" aria-hidden="true">${`<i class="sq ${state}"></i>`.repeat(n)}</span>`;
const credits = n => `${n} credit${n === 1 ? '' : 's'}`;

const checkPage = () => `
${header()}
<main>
  <h1 class="question">${esc(check.question)}</h1>
  <p class="answer">${esc(check.answerCounts)} ${esc(check.answerDoesnt)}</p>
  <ul class="courses">
    ${check.courses.map(c => `
    <li class="${c.counts ? 'yes' : 'no'}">
      ${c.credits ? squares(c.counts ? 'done' : 'needed', c.credits) : '<span class="squares" aria-hidden="true"><i class="sq unknown"></i></span>'}
      <p class="course"><strong>${esc(c.code)}</strong> ${esc(c.title)}</p>
      <p class="verdict">${esc(c.text)}</p>
    </li>`).join('')}
  </ul>
  <p class="note">${esc(check.reminder)}</p>
  <div class="total">
    ${squares('done', 9)}${squares('needed', 3)}
    <p><strong>${esc(check.total)}</strong> this semester. ${esc(check.totalNote)}</p>
  </div>
  <p><button type="button" class="primary">${esc(check.transcript)}</button></p>
</main>
${footer('check', 'Check my courses')}`;

const courseLine = c => `
      <li>
        ${squares(c.state, c.credits)}
        <p class="course"><strong>${esc(c.code)}</strong> ${esc(c.title)}${c.note ? ` <span class="tag ${c.state}">${esc(c.note)}</span>` : ''}</p>
      </li>`;

const blockSquares = b => b.courses.map(c => squares(c.state, c.credits)).join('');

const block = b => {
  const doneCourses = b.courses.filter(c => c.state === 'done');
  const open = b.courses.filter(c => c.state !== 'done');
  const head = `
      <span class="block-name">${esc(b.name)}</span>
      <span class="status ${cls[b.status]}">${esc(b.status)}</span>
      <span class="small">${credits(sum(doneCourses))} of ${b.credits} done</span>
      <span class="block-squares">${blockSquares(b)}</span>`;
  if (b.status === 'Done') {
    return `
  <details class="block">
    <summary>${head}</summary>
    <ul class="courses inner">${doneCourses.map(courseLine).join('')}</ul>
  </details>`;
  }
  return `
  <section class="block">
    <h3>${head}</h3>
    ${b.hint ? `<p class="small">${esc(b.hint)}</p>` : ''}
    <ul class="courses inner">${open.map(courseLine).join('')}</ul>
    ${doneCourses.length ? `
    <details class="already">
      <summary>${doneCourses.length} already done</summary>
      <ul class="courses inner">${doneCourses.map(courseLine).join('')}</ul>
    </details>` : ''}
  </section>`;
};

const leftPage = () => `
${header()}
<main>
  <div class="hero">
    <div>
      <h1 class="question">${esc(left.question)}</h1>
      <p class="answer">${esc(left.answerLeft)} ${esc(left.answerPace)}</p>
      <p class="small">${left.pace.inputs.map(esc).join(', ')}. <button type="button" class="quiet">Change</button></p>
      <p class="note">${esc(left.pace.caveat)}</p>
    </div>
    <div class="map" role="img" aria-label="121 credits: 64 done, 12 in progress, 45 left">${left.blocks.map(blockSquares).join('')}</div>
  </div>

  <h2>Your CIS degree checklist</h2>
  ${left.blocks.map(block).join('')}

  <h2>Draft plan</h2>
  <p class="note">${esc(left.planLabel)}</p>
  <div class="plan">
    ${left.plan.map(term => `
    <section class="term">
      <h3>${esc(term.term)} <span class="small">${credits(sum(term.courses))}</span></h3>
      <ul class="courses inner">
        ${term.courses.map(c => `
        <li>
          ${squares('needed', c.credits)}
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
