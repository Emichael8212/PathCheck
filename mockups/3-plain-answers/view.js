// Direction 3 — Plain answers. Each answer is a full-width band of color with the
// course code set large, read top to bottom like a list of spoken answers. In Flow A a
// course that counts "unless..." gets a green edge, never the solid green of Done.
import { check, left } from '../data.js';
import { esc, footer, header, sum } from '../shared.js';

const cls = { 'Done': 'done', 'In progress': 'progress', 'Still needed': 'needed' };
const credits = n => `${n} credit${n === 1 ? '' : 's'}`;

const checkPage = () => `
${header()}
<main>
  <div class="wrap lead">
    <h1 class="question">${esc(check.question)}</h1>
    <p class="answer">${esc(check.answerCounts)} <span class="nowrap">${esc(check.answerDoesnt)}</span></p>
  </div>
  <ul class="bands">
    ${check.courses.map(c => `
    <li class="band ${c.counts ? 'maybe' : 'needed'}">
      <div class="wrap pair">
        <p class="big">${esc(c.code)}</p>
        <div>
          ${c.title ? `<p class="title">${esc(c.title)}</p>` : ''}
          <p class="verdict">${esc(c.text)}</p>
        </div>
      </div>
    </li>`).join('')}
  </ul>
  <div class="wrap">
    <p class="aside">${esc(check.reminder)}</p>
    <p class="total"><strong>${esc(check.total)}</strong> this semester. ${esc(check.totalNote)}</p>
    <p><button type="button" class="primary">${esc(check.transcript)}</button></p>
  </div>
</main>
${footer('check', 'Check my courses')}`;

const courseLine = c => `
          <li><strong>${esc(c.code)}</strong> ${esc(c.title)}${c.note ? ` <em class="flag">${esc(c.note)}</em>` : ''}</li>`;

const block = b => {
  const doneCourses = b.courses.filter(c => c.state === 'done');
  const open = b.courses.filter(c => c.state !== 'done');
  if (b.status === 'Done') {
    return `
    <li class="band done slim">
      <details class="wrap">
        <summary><span class="big">${esc(b.status)}</span> <span class="block-name">${esc(b.name)}</span> <span class="small">${credits(b.credits)}. Show courses</span></summary>
        <ul class="list">${doneCourses.map(courseLine).join('')}</ul>
      </details>
    </li>`;
  }
  return `
    <li class="band ${cls[b.status]}">
      <div class="wrap pair">
        <h3 class="heads"><span class="big">${esc(b.status)}</span> <span class="block-name">${esc(b.name)} <span class="small">${credits(b.credits)}</span></span></h3>
        <div class="body">
          ${b.hint ? `<p class="small">${esc(b.hint)}</p>` : ''}
          <ul class="list">${open.map(courseLine).join('')}</ul>
          ${doneCourses.length ? `
          <details class="already">
            <summary>${doneCourses.length} already done</summary>
            <ul class="list">${doneCourses.map(courseLine).join('')}</ul>
          </details>` : ''}
        </div>
      </div>
    </li>`;
};

const leftPage = () => `
${header()}
<main>
  <div class="wrap lead">
    <h1 class="question">${esc(left.question)}</h1>
    <p class="answer">${esc(left.answerLeft)} ${esc(left.answerPace)}</p>
    <p class="small">${left.pace.inputs.map(esc).join(', ')}. <button type="button" class="quiet">Change</button></p>
    <p class="aside">${esc(left.pace.caveat)}</p>
  </div>

  <h2 class="wrap">Your CIS degree checklist</h2>
  <ul class="bands">${left.blocks.map(block).join('')}</ul>

  <div class="wrap">
    <h2>Draft plan</h2>
    <p class="aside">${esc(left.planLabel)}</p>
    <div class="plan">
      ${left.plan.map(term => `
      <section class="term">
        <h3><span class="big">${esc(term.term)}</span> <span class="small">${credits(sum(term.courses))}</span></h3>
        <ul class="list">
          ${term.courses.map(c => `
          <li><span><strong>${esc(c.code)}</strong> ${esc(c.title)}</span> <button type="button" class="quiet" aria-label="Move later: ${esc(c.code)}">Move later</button></li>`).join('')}
        </ul>
      </section>`).join('')}
    </div>
    <p><button type="button" class="primary">Print / PDF</button></p>
  </div>
</main>
${footer('left', 'See what I have left')}`;

export const render = which => (which === 'check' ? checkPage() : leftPage());
