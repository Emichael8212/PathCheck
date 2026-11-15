// Building blocks shared by the three M0 design directions. They carry the fixed
// content and the accessible structure; each direction arranges and styles them its own way.
import { check, facts, left, start } from './data.js';

export const esc = text => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

// Every course code, wherever it appears, is set in the code face and never breaks.
export const code = value => `<span class="code">${esc(value).replace(' ', '&nbsp;')}</span>`;
export const t = text => esc(text).replace(/\b[A-Z]{3,4} \d{3}\b/g, match => code(match));

// One mark per status. The shape differs for each, so color is never the only cue.
const svg = inner => `<svg class="mark" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">${inner}</svg>`;
export const marks = {
  // Counts (with a condition): an open circle with a tick.
  counts: svg('<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7.5 12.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
  // Doesn't count: an octagon with a cross.
  no: svg('<path d="M8 2.5h8l5.5 5.5v8L16 21.5H8L2.5 16V8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8.5 8.5l7 7m0-7l-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  // Done: a solid disc with the tick cut out.
  done: svg('<circle cx="12" cy="12" r="10.5" fill="currentColor"/><path class="knock" d="M7.5 12.5l3 3 6-7" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  // In progress: a half-filled circle.
  progress: svg('<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.5a9.5 9.5 0 0 1 0 19z" fill="currentColor"/>'),
  // Still needed: an empty dashed ring.
  needed: svg('<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3.2 3.2"/>'),
};

export const statusClass = { 'Done': 'done', 'In progress': 'progress', 'Still needed': 'needed' };

// ---- Page furniture -------------------------------------------------------------------

// Floating glass bar: navigation only (Apple: glass is for controls and navigation).
export const topBar = current => `
<header class="bar bar-top glass">
  <a class="brand" href="start.html">${facts.name}</a>
  <nav aria-label="PathCheck">
    <a href="check.html"${current === 'check' ? ' aria-current="page"' : ''}>Check courses</a>
    <a href="left.html"${current === 'left' ? ' aria-current="page"' : ''}>What\u2019s left</a>
  </nav>
</header>`;

export const factsFooter = subject => `
<footer class="facts">
  <p>${facts.notOfficial}</p>
  <p>${facts.reviewed}</p>
  <p><a href="mailto:mistake@example.com?subject=${encodeURIComponent('PathCheck mistake: ' + subject)}">${facts.report}</a></p>
  <p>${facts.notAffiliated}</p>
  <p class="mock"><a href="../index.html">All three designs</a> This is a mockup: the student is made up and most buttons don’t work yet.</p>
</footer>`;

// "How it works": three captioned frames that fade in turn. The checkbox pauses it;
// with Reduce Motion the frames are simply shown one after another, not animated.
const demoFrame = kind => ({
  type: `<p class="demo-field"><span class="demo-typed">${esc(check.typed)}</span> <span class="demo-suggest">${code(check.suggestion.code)} ${esc(check.suggestion.title)}</span></p>`,
  answers: `
    <p class="demo-row counts">${marks.counts}<span>${code(check.courses[0].code)} ${t(check.courses[0].answer)}, ${t(check.courses[0].condition)}</span></p>
    <p class="demo-row no">${marks.no}<span>${code(check.courses[3].code)} ${t(check.courses[3].answer)}</span></p>`,
  left: `<p class="demo-big">${esc(left.creditsLeft)}</p><p>${esc(left.pace)}</p>`,
})[kind];

export const demo = () => `
<section class="demo" aria-labelledby="demo-title">
  <h2 id="demo-title">${esc(start.demoTitle)}</h2>
  <label class="demo-pause"><input type="checkbox" class="demo-toggle" /> <span>Pause the demo</span></label>
  <ol class="demo-frames">
    ${start.demo.map((frame, i) => `
    <li class="demo-frame" style="--i: ${i}">
      <p class="demo-caption"><span class="demo-step">${i + 1}</span> ${esc(frame.caption)}</p>
      <div class="demo-shot">${demoFrame(frame.kind)}</div>
    </li>`).join('')}
  </ol>
</section>`;

// ---- Page 1 ---------------------------------------------------------------------------

export const ways = () => `
<ul class="ways">
  ${start.ways.map(way => `
  <li>
    <a class="way" href="${way.href}">
      <span class="way-name">${esc(way.name)}</span>
      <span class="way-desc">${esc(way.desc)}</span>
      <span class="way-note">${esc(way.note)}</span>
    </a>
  </li>`).join('')}
</ul>`;

// ---- Page 2 ---------------------------------------------------------------------------

export const answerRow = course => `
<li class="row ${course.counts ? 'counts' : 'no'}">
  ${course.counts ? marks.counts : marks.no}
  <p class="what">${code(course.code)}${course.title ? ` <span class="title">${esc(course.title)}</span>` : ''} <span class="cr">${course.cr} cr</span></p>
  <div class="verdict">
    <p class="answer">${t(course.answer)}</p>
    ${course.condition ? `<p class="cond">${esc(course.condition)}</p>` : ''}
  </div>
  <button type="button" class="ghost remove" aria-label="Remove ${esc(course.code)}">Remove</button>
</li>`;

// The add-a-course field with its suggestion open. The menu is a glass popover; the
// field sits in the bottom glass bar.
export const addCourse = () => `
<div class="add">
  <div class="suggest glass" role="listbox" id="suggestions" aria-label="Suggestions">
    <div class="option" role="option" aria-selected="true">${code(check.suggestion.code)} ${esc(check.suggestion.title)}</div>
  </div>
  <form class="bar bar-bottom glass" role="search">
    <label class="add-label" for="add-course">Add a course by code or title</label>
    <input id="add-course" type="text" value="${esc(check.typed)}" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="suggestions" />
    <button type="button" class="prominent">Add</button>
  </form>
</div>`;

export const totals = () => `
<div class="totals">
  <p class="total"><strong>${esc(check.total)}</strong></p>
  <ul class="notes">${check.notes.map(note => `<li>${esc(note)}</li>`).join('')}</ul>
  <p class="count"><strong>${esc(check.countLine)}</strong>, ${esc(check.countCondition)}</p>
</div>`;

// The two courses that don't count, named once at the top so nobody has to hunt for them.
export const noSummary = () => {
  const no = check.courses.filter(course => !course.counts);
  return `<p class="no-summary">${marks.no}<span><strong>${no.length} don\u2019t count:</strong> ${no.map(course => code(course.code)).join(', ')}</span></p>`;
};

export const rows = () => `<ul class="rows">${check.courses.map(answerRow).join('')}</ul>`;
export const reminder = () => `<p class="reminder">${t(check.reminder)}</p>`;
export const transcriptButton = () => `<p><button type="button" class="ghost wide">${esc(check.transcript)}</button></p>`;

// ---- Page 3 ---------------------------------------------------------------------------

const entry = item => (item.open
  ? `<li class="open">${t(item.text)}</li>`
  : `<li>${code(item.code)} <span class="title">${esc(item.title)}</span>${item.note ? ` <span class="note">(${esc(item.note)})</span>` : ''}</li>`);

const group = (label, state, items) => (items?.length ? `
    <div class="group ${state}">
      <h4>${marks[state]} ${label}</h4>
      <ul>${items.map(entry).join('')}</ul>
    </div>` : '');

// `extra` lets a direction add its own element to the block heading (for example a meter).
export const block = (b, extra = () => '') => {
  const state = statusClass[b.status];
  return `
<section class="block ${state}">
  <h3>
    ${marks[state]}
    <span class="bname">${esc(b.name)}</span>
    <span class="frac">${b.counted}/${b.needed}</span>
    <span class="status">${esc(b.status)}</span>
  </h3>
  ${extra(b)}
  ${group('Done', 'done', b.done)}${group('In progress', 'progress', b.progress)}${group('Still needed', 'needed', b.still)}
</section>`;
};

export const paceControls = () => `
<form class="pace-controls" aria-label="Adjust the pace">
  <label>Target semester
    <select><option>Fall 2028</option><option selected>Spring 2029</option><option>Fall 2029</option></select>
  </label>
  <fieldset>
    <legend>Credits per term</legend>
    <input type="number" value="12" min="1" max="21" aria-label="Fewest credits per term" />
    <span aria-hidden="true">–</span>
    <input type="number" value="18" min="1" max="21" aria-label="Most credits per term" />
  </fieldset>
  <label class="switch"><input type="checkbox" role="switch" /> <span>Summers</span> <span class="switch-state">off</span></label>
</form>`;

const planEntry = item => {
  const name = item.open ? item.name : item.code;
  const body = item.open
    ? `<span class="pick-name">${esc(item.name)}</span>${item.text ? ` <span class="title">${t(item.text)}</span>` : ''} <span class="pick-tag">open choice</span>`
    : `${code(item.code)} <span class="title">${esc(item.title)}</span>${item.note ? ` <span class="note">(${esc(item.note)})</span>` : ''}`;
  return `
      <li class="${item.open ? 'open' : ''}">
        <span class="entry">${body}</span>
        <button type="button" class="ghost later" aria-label="Move ${esc(name)} later">Move later</button>
      </li>`;
};

export const planTerm = term => `
<section class="term">
  <h3>${esc(term.term)} <span class="cr">${term.cr} cr</span></h3>
  <ul>${term.entries.map(planEntry).join('')}</ul>
</section>`;

// Bottom glass bar on page 3: the two actions.
export const leftActions = () => `
<div class="bar bar-bottom glass">
  <button type="button" class="prominent">${esc(left.print)}</button>
  <button type="button" class="ghost">${esc(left.clear)}</button>
</div>`;

export const blocks = extra => left.blocks.map(b => block(b, extra)).join('');
export const sequence = () => `<p class="sequence">${marks.needed}<span>${t(left.sequence)}</span></p>`;
export const plan = () => `
<section class="plan" aria-labelledby="plan-title">
  <h2 id="plan-title">Draft plan</h2>
  <p class="plan-label">${esc(left.planLabel)}</p>
  <div class="terms">${left.plan.map(planTerm).join('')}</div>
</section>`;

// Each direction's three HTML files call render(page).
export const shell = (current, subject, body) => `${topBar(current)}${body}${factsFooter(subject)}`;
