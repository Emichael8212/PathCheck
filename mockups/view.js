// The three M0 mockup pages, rebuilt in plain code from the owner's design
// (docs/design/DESIGN.md, screenshots in docs/design/screens/). Each page is an HTML string
// so the wording and structure can be tested without a browser.
import { check, facts, left, start, summary } from './data.js';

export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const COURSE_CODE = /\b[A-Z]{3,4} \d{3}\b/g;
export const code = (s, cls = '') => `<span class="code${cls ? ' ' + cls : ''}">${esc(s)}</span>`;
// A sentence with every course code inside it set in the code face.
export const t = s => esc(s).replace(COURSE_CODE, m => `<span class="code">${m}</span>`);

// ---- Marks and icons: drawn here, no icon pack. ----
const svg = (size, body, cls = '', box = 20) =>
  `<svg class="icon${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 ${box} ${box}" aria-hidden="true" focusable="false">${body}</svg>`;
const line = (d, w = 2) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const cut = (d, w = 2.2) => `<path d="${d}" fill="none" stroke="var(--surface)" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

const tick = 'M5.9 10.3l2.8 2.8 5.5-5.9';
// One status, one word, one shape. "Counts" is an outlined tick and "Done" a filled one, so
// a conditional answer never looks as certain as a finished requirement (owner, 2026-11-15).
export const marks = {
  counts: (size = 20) => svg(size, `<circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2"/>${line(tick, 2.2)}`, 'mark mark-counts'),
  done: (size = 16) => svg(size, `<circle cx="10" cy="10" r="9" fill="currentColor"/>${cut(tick)}`, 'mark mark-done'),
  no: (size = 20) => svg(size, `<rect x="1" y="1" width="18" height="18" rx="3" fill="currentColor"/>${cut('M6.6 6.6l6.8 6.8M13.4 6.6l-6.8 6.8')}`, 'mark mark-no'),
  progress: (size = 16) => svg(size, `<circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 2a8 8 0 0 1 0 16z" fill="currentColor"/>`, 'mark mark-progress'),
  needed: (size = 16) => svg(size, `<circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3.2 2.4"/>`, 'mark mark-needed'),
};
const statusMark = { 'Done': marks.done, 'In progress': marks.progress, 'Still needed': marks.needed };

const icons = {
  arrow: (size = 20, cls = '') => svg(size, line('M3 10h13M11.2 5.2L16 10l-4.8 4.8'), cls),
  doc: (size = 20) => svg(size, line('M5 2h7l4 4v12H5z', 1.8) + line('M12 2v4h4M8 11h5M8 14h5', 1.8)),
  x: (size = 18) => svg(size, line('M5 5l10 10M15 5L5 15')),
  move: (size = 18) => svg(size, line('M3 10h11M10.2 5.2L15 10l-4.8 4.8M17.5 4v12')),
  print: (size = 20) => svg(size, line('M5 7V2h10v5M5 15H2V8h16v7h-3M5 12h10v6H5z', 1.8)),
  trash: (size = 20) => svg(size, line('M3 5h14M8 5V3h4v2M5 5l1 12h8l1-12', 1.8)),
  upload: (size = 28) => svg(size, line('M8 21H7a5 5 0 0 1-.4-10A7.5 7.5 0 0 1 21 9a6 6 0 0 1 0 12h-1M14 25V13M10 17l4-4 4 4', 1.7), '', 28),
  play: (size = 14) => svg(size, `<path d="M3 1l10 6-10 6z" fill="currentColor"/>`, 'i-play', 14),
  pause: (size = 14) => svg(size, `<rect x="2" y="1" width="3.5" height="12" fill="currentColor"/><rect x="8.5" y="1" width="3.5" height="12" fill="currentColor"/>`, 'i-pause', 14),
};

// ---- Shared pieces ----
const top = page => `
<header class="top">
  <a class="wordmark" href="start.html">${esc(facts.name)}<span class="dot">.</span></a>
  <nav aria-label="Main navigation">
    ${facts.nav.map(n => `<a href="${n.href}"${n.page === page ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`).join('\n    ')}
  </nav>
  <span class="top-note">${esc(facts.notOfficial)}</span>
</header>`;

const foot = (subject, wide = false) => `
<footer class="foot${wide ? ' foot-wide' : ''}">
  <div>
    <strong>${esc(facts.notOfficial)}</strong>
    <span>${esc(facts.reviewed)}</span>
    <a class="text-link" href="mailto:${facts.reportAddress}?subject=${encodeURIComponent(subject)}">${esc(facts.report)}</a>
  </div>
  <p>${esc(facts.notAffiliated)}</p>
</footer>`;

const eyebrow = s => `<span class="eyebrow">${esc(s)}</span>`;

// ---- Page 1: Start ----
const demoFrames = () => {
  const d = start.demo;
  const field = inner => `<div class="demo-field">${inner}</div>`;
  const placeholder = `<span class="muted">${esc(d.placeholder)}</span>`;
  // A "Counts" answer never appears without its condition, here as everywhere.
  const countsCard = `
        <div class="demo-card">
          <div class="demo-card-head"><span>${code(d.counts.code, 'strong')} ${esc(d.counts.title)}</span><span class="num muted">${esc(d.counts.cr)}</span></div>
          <div class="demo-answer is-counts">${marks.counts(16)} ${esc(d.counts.answer)}</div>
          <small class="demo-condition">${esc(d.counts.condition)}</small>
        </div>`;
  const noCard = `
        <div class="demo-card is-no">
          <div class="demo-card-head">${code(d.no.code, 'strong')} <span class="num muted struck">${esc(d.no.cr)}</span></div>
          <div class="demo-answer is-no">${marks.no(16)} ${esc(d.no.answer)}</div>
        </div>`;
  const leftCard = `
        <div class="demo-card">
          <div class="demo-file">${icons.doc(20)} ${esc(d.file)}</div>
          <div class="demo-left"><span class="num">${left.remaining}</span><span>${esc(left.remainingLabel)}</span></div>
          <div class="demo-bar">${bar()}</div>
          <div class="demo-pace">${esc(left.pace)}</div>
          <small class="demo-caveat">${esc(left.caveat)}</small>
        </div>`;
  return [
    `${field(`<span class="code">${esc(d.typed)}<span class="caret"></span></span>`)}
      <div class="demo-suggest">${code(d.counts.code, 'strong')} <span class="truncate">${esc(d.counts.title)}</span></div>`,
    `${field(placeholder)}
      <div class="demo-cards">${countsCard}
      </div>`,
    `${field(code(d.no.code))}
      <div class="demo-cards">${countsCard}${noCard}
      </div>`,
    `${field(placeholder)}
      <div class="demo-cards">${leftCard}
      </div>`,
  ];
};

const demo = () => {
  const d = start.demo;
  const frames = demoFrames();
  return `
  <section class="demo" aria-labelledby="demo-title">
    <div>
      ${eyebrow(d.eyebrow)}
      <h2 id="demo-title">${esc(d.title)}</h2>
      <p>${esc(d.sub)}</p>
      <ol class="demo-list">
        ${d.list.map((s, i) => `<li><span class="chip" aria-hidden="true">${i + 1}</span>${esc(s)}</li>`).join('\n        ')}
      </ol>
    </div>
    <section class="demo-player" aria-label="${esc(d.label)}" data-demo>
      <div class="demo-frame" aria-hidden="true">
        ${frames.map((f, i) => `<div class="demo-step" data-step="${i + 1}"${i ? ' hidden' : ''}>
      ${f}
        </div>`).join('\n        ')}
      </div>
      <div class="demo-controls">
        <button type="button" class="demo-toggle" aria-label="Pause demo" data-playing="true" data-toggle>${icons.pause()}${icons.play()}</button>
        <div class="demo-dots" role="group" aria-label="Demo steps">
          ${frames.map((_, i) => `<button type="button" aria-label="Step ${i + 1} of ${frames.length}"${i ? '' : ' aria-current="step"'} data-go="${i + 1}"><span></span></button>`).join('\n          ')}
        </div>
        <p class="demo-caption" aria-live="off" data-live>
          ${d.steps.map((s, i) => `<span data-caption="${i + 1}"${i ? ' hidden' : ''}><span class="num">${i + 1}/${d.steps.length}</span> ${esc(s)}</span>`).join('\n          ')}
        </p>
      </div>
    </section>
  </section>`;
};

const startPage = () => {
  const a = start.check;
  const b = start.left;
  return `${top('start')}
<main class="start wrap">
  <div class="intro">
    <span class="kicker"><span class="kicker-dot" aria-hidden="true"></span>${esc(start.kicker)}</span>
    <h1>${esc(start.headline[0])}<br><span class="accent">${esc(start.headline[1])}</span></h1>
    <p>${esc(start.sub)}</p>
    <div class="major">
      <label for="major">${esc(start.majorLabel)}</label>
      <div class="select">
        <span aria-hidden="true">${esc(start.major)}</span>
        ${icons.arrow(20, 'turn-down')}
        <select id="major"><option selected>${esc(start.major)}</option></select>
      </div>
    </div>
  </div>

  <div class="entry">
    <section class="entry-check" aria-labelledby="way-check">
      <span class="chip" aria-hidden="true">${esc(a.number)}</span>
      <div>
        ${eyebrow(a.eyebrow)}
        <h2 id="way-check">${esc(a.title)}</h2>
      </div>
      <p>${esc(a.desc)}</p>
      <div class="example" role="group" aria-label="Example course result">
        <div class="example-head">${code(a.example.code)} <span>${esc(a.example.cr)}</span></div>
        <p>${esc(a.example.title)}</p>
        <span class="example-answer">${marks.counts(20)}${esc(a.example.answer)}</span>
        <small>${esc(a.example.condition)}</small>
      </div>
      <a class="btn primary" href="check.html">${esc(a.cta)} ${icons.arrow()}</a>
      <span class="entry-note">${esc(a.note)}</span>
    </section>
    <section class="entry-left" aria-labelledby="way-left">
      <div class="entry-head">
        <span class="chip" aria-hidden="true">${esc(b.number)}</span>
        <div>
          ${eyebrow(b.eyebrow)}
          <h2 id="way-left">${esc(b.title)}</h2>
        </div>
      </div>
      <p>${esc(b.desc)}</p>
      <div class="drop">
        <span class="upload-icon">${icons.upload()}</span>
        <p class="drop-title">${esc(b.drop)}</p>
        <span class="drop-or">${esc(b.or)}</span>
        <a class="btn secondary" href="left.html">${esc(b.browse)} ${icons.arrow()}</a>
        <p class="privacy">${icons.doc(20)}${esc(b.privacy)}</p>
        <span class="mock-note">${esc(b.mockNote)}</span>
      </div>
    </section>
  </div>
${demo()}
</main>
${foot('PathCheck: report a mistake')}`;
};

// ---- Page 2: "Check my courses" result ----
const courseRow = c => `
    <div role="row" class="row${c.counts ? '' : ' is-no'}">
      <div role="cell" class="cell-name">
        ${code(c.code, 'strong')}${c.title ? `
        <p>${esc(c.title)}</p>` : ''}
      </div>
      <span role="cell" class="cell-cr num">${c.cr}<span class="cr-unit"> cr</span></span>
      <div role="cell" class="cell-answer">
        ${c.counts ? marks.counts(20) : marks.no(20)}
        <div>
          <p class="answer ${c.counts ? 'is-counts' : 'is-no'}">${t(c.answer)}</p>${c.condition ? `
          <p class="condition">${esc(c.condition)}</p>` : ''}
        </div>
      </div>
      <div role="cell" class="cell-remove">
        <button type="button" class="remove" aria-label="Remove ${esc(c.code)}">${icons.x()}</button>
      </div>
    </div>`;

const checkPage = (typing = false) => {
  // The typing state shows the moment before MGT 321 is added, as the owner's design does.
  const courses = typing ? check.courses.filter(c => c.code !== check.suggestion.code) : check.courses;
  const numbers = summary(courses);
  const tone = ['', ' is-counts', ' is-no'];
  return `${top('check')}
<main class="check">
  <div class="page-head">
    <div>
      ${eyebrow(check.eyebrow)}
      <h1>${esc(check.term)}</h1>
    </div>
    <span class="page-status">${esc(check.status)}</span>
  </div>

  <div class="summary">
    ${numbers.map((n, i) => `<div><span class="num${tone[i]}">${n}</span><span class="summary-label">${esc(check.summaryLabels[i])}</span>${i === 1 ? `<span class="summary-condition">${esc(check.countCondition)}</span>` : ''}</div>`).join('\n    ')}
  </div>

  <div class="toolbar">
    <div class="search">
      <label for="add-course">${esc(check.addLabel)}</label>
      <div class="search-row">
        <input id="add-course" type="text" role="combobox" aria-expanded="${typing}" aria-controls="suggestions" aria-autocomplete="list"${typing ? ' aria-activedescendant="suggestion-1"' : ''} autocomplete="off" spellcheck="false" placeholder="${esc(check.placeholder)}" value="${typing ? esc(check.typed) : ''}">
        <button type="button" class="btn primary add"${typing ? '' : ' disabled'}>${esc(check.add)}</button>
      </div>
      <ul id="suggestions" role="listbox" aria-label="Suggestions" class="suggestions"${typing ? '' : ' hidden'}>${typing ? `
        <li id="suggestion-1" role="option" aria-selected="true">${code(check.suggestion.code, 'strong')} <span class="truncate">${esc(check.suggestion.title)}</span></li>
      ` : ''}</ul>
    </div>
    <div class="filters" role="group" aria-label="Filter courses">
      <button type="button" aria-pressed="true">${esc(check.filters[0])}</button>
      <button type="button" aria-pressed="false">${marks.no(16)}${esc(check.filters[1])}</button>
    </div>
  </div>

  <div class="table" role="table" aria-label="Course count results">
    <div class="table-head" role="row">
      ${check.columns.map((h, i) => `<span role="columnheader"${i === 3 ? ' class="sr-only"' : ''}>${esc(h)}</span>`).join('\n      ')}
    </div>${courses.map(courseRow).join('')}
  </div>

  <p class="note">${icons.doc(20)}${t(check.reminder)}</p>

  <section class="exact" aria-labelledby="exact-title">
    <div class="exact-text">
      ${icons.doc(20)}
      <div>
        <h2 id="exact-title">${esc(check.transcript)}</h2>
        <p>${esc(check.privacy)}</p>
      </div>
    </div>
    <div>
      <button type="button" class="btn primary">${esc(check.choose)} ${icons.arrow()}</button>
    </div>
  </section>
</main>
${foot(`PathCheck: Check my courses, ${check.term}`, true)}`;
};

// ---- Page 3: "See what I have left" result ----
const pct = n => `${Math.round((n / left.total) * 1e5) / 1e3}%`;
// The credit bar: counted is solid, in progress is hatched, the rest is open.
function bar() {
  return `<span class="bar-counted" style="width: ${pct(left.counted)}"></span><span class="bar-progress hatch" style="width: ${pct(left.inProgress)}"></span>`;
}

const item = e => e.open
  ? `<li>${t(e.text)}</li>`
  : `<li>${code(e.code, 'strong')}${e.title ? ' ' + esc(e.title) : ''}${e.note ? `<span class="item-note">${esc(e.note)}</span>` : ''}</li>`;

const group = (status, list) => list && list.length ? `
          <div>
            <p class="group-title">${statusMark[status](16)} ${status}</p>
            <ul>
              ${list.map(item).join('\n              ')}
            </ul>
          </div>` : '';

const reqRow = (b, cue) => `
          <span class="req-name">${esc(b.name)}</span>
          <span class="req-status">${statusMark[b.status](16)}${b.status}</span>
          <span class="req-bar" aria-hidden="true">${Array.from({ length: b.needed }, (_, i) => `<span${i < b.counted ? ' class="is-counted"' : ''}></span>`).join('')}</span>
          <span class="req-credits num"><strong>${b.counted}</strong> / ${b.needed} cr</span>
          ${cue}`;

const reqBody = b => `
          <div class="req-body">${group('Done', b.done)}${group('In progress', b.progress)}${group('Still needed', b.still)}
          </div>`;
const showCue = `<span class="req-show no-print"><span class="when-closed">${esc(left.show)}</span><span class="when-open">${esc(left.hide)}</span>${icons.arrow(16, 'req-cue')}</span>`;

// Owner, 2026-11-15: In progress and Still needed requirements show their courses straight
// away; a Done requirement is collapsed and opens with "Show courses".
const requirement = b => b.status === 'Done' ? `
      <li class="req">
        <details>
          <summary><span class="req-row">${reqRow(b, showCue)}
          </span></summary>${reqBody(b)}
        </details>
      </li>` : `
      <li class="req">
        <div class="req-row">${reqRow(b, '<span></span>')}
        </div>${reqBody(b)}
      </li>`;

const planEntry = e => e.choice ? `
          <li class="plan-entry is-choice">
            <div class="plan-text">
              <span class="choice-label">${esc(left.choiceLabel)}</span>
              <p>${t(e.text)}</p>
            </div>
            <button type="button" class="move no-print" aria-label="Move ${esc(e.text)} later">${icons.move()}<span>${esc(left.move)}</span></button>
          </li>` : `
          <li class="plan-entry">
            <div class="plan-text">
              ${code(e.code, 'strong')}
              <p>${esc(e.title)}</p>${e.note ? `
              <span class="plan-fixed">${esc(e.note)}</span>` : ''}
            </div>
            <button type="button" class="move no-print" aria-label="Move ${esc(e.code)} later">${icons.move()}<span>${esc(left.move)}</span></button>
          </li>`;

// One end of the credit range. Both ends can be changed; a neutral note appears under 12
// and over 18 (behavior.js writes it into the live region, so it is also read out).
// PathCheck sets no hard limit.
const stepper = (name, f) => `<div class="field" data-stepper="${name}">
          <span id="${name}-label">${esc(f.label)}</span>
          <div class="stepper" role="group" aria-labelledby="${name}-label" aria-describedby="${name}-note">
            <button type="button" aria-label="${esc(f.label)}: one fewer" data-delta="-1">−</button>
            <output class="num"><span data-value>${f.value}</span> <span data-unit>credits</span></output>
            <button type="button" aria-label="${esc(f.label)}: one more" data-delta="1">+</button>
          </div>
          <p class="field-note" id="${name}-note" data-note="${esc(f.note)}" aria-live="polite"></p>
        </div>`;

const leftPage = () => {
  const k = left.controls;
  return `${top('left')}
<main class="left wrap">
  <div class="page-head">
    <div>
      ${eyebrow(left.eyebrow)}
      <h1>${esc(left.heading)}</h1>
    </div>
    <span class="pill">${icons.doc(15)}${esc(left.pill)}</span>
  </div>

  <section class="overview" aria-label="Credits left and pace">
    <div class="overview-main">
      <div class="donut" role="img" aria-label="${left.remaining} credits left, ${left.counted} counted, ${left.inProgress} in progress, ${left.total} total" style="--counted: ${pct(left.counted)}; --counted-and-progress: ${pct(left.counted + left.inProgress)}">
        <div><strong class="num">${left.remaining}</strong><span>${esc(left.remainingLabel)}</span></div>
      </div>
      <div>
        ${eyebrow(left.paceEyebrow)}
        <h2>${esc(left.pace)}</h2>
        <p class="pace-detail">${esc(left.paceDetail)}</p>
        <p class="caveat">${esc(left.caveat)}</p>
      </div>
    </div>
    <div class="credit" style="grid-template-columns: minmax(0, ${left.counted}fr) minmax(0, ${left.inProgress}fr) minmax(0, ${left.remaining}fr)">
      <span class="bar-label is-progress"><strong class="num">${left.inProgress}</strong> in progress · ${esc(left.inProgressTerm)}</span>
      <div class="credit-bar" aria-hidden="true">${bar()}</div>
      <span class="bar-label is-counted"><strong class="num">${left.counted}</strong> counted</span>
      <span class="bar-label is-left"><strong class="num">${left.remaining}</strong> left</span>
      <span class="bar-label is-total"><strong class="num">${left.total}</strong> total</span>
    </div>
    <div class="pace">
      ${eyebrow(k.eyebrow)}
      <fieldset class="pace-grid">
        <legend class="sr-only">${esc(k.legend)}</legend>
        <div class="field">
          <label for="target">${esc(k.target.label)}</label>
          <select id="target">
            ${k.target.options.map(o => `<option${o === k.target.value ? ' selected' : ''}>${esc(o)}</option>`).join('')}
          </select>
        </div>
        ${stepper('fewest', k.fewest)}
        ${stepper('most', k.most)}
        <div class="field">
          <span id="summers-label">${esc(k.summers.label)}</span>
          <button type="button" class="switch" role="switch" aria-checked="false" aria-labelledby="summers-label">
            <span class="switch-track" aria-hidden="true"><span></span></span>
            <span class="switch-value">${esc(k.summers.value)}</span>
          </button>
        </div>
      </fieldset>
    </div>
  </section>

  <section class="reqs" aria-labelledby="req-title">
    <div class="section-head">
      <div>
        ${eyebrow(left.reqEyebrow)}
        <h2 id="req-title">${esc(left.reqTitle)}</h2>
      </div>
      <div class="tabs no-print" role="group" aria-label="Requirement filter">
        <button type="button" aria-pressed="true">${esc(left.reqTabs[0])}</button>
        <button type="button" aria-pressed="false">${esc(left.reqTabs[1])}</button>
      </div>
    </div>
    <p class="section-note">${esc(left.reqNote)}</p>
    <ul class="req-list">${left.blocks.map(requirement).join('')}
    </ul>
    <p class="sequence">${marks.needed(20)}<span>${t(left.sequence)}</span></p>
  </section>

  <section class="plan" aria-labelledby="plan-title">
    <div class="section-head">
      <div>
        ${eyebrow(left.planEyebrow)}
        <h2 id="plan-title">${esc(left.planTitle)}</h2>
      </div>
    </div>
    <p class="draft-label">${icons.doc(18)}${esc(left.planLabel)}</p>
    <p class="section-note">${esc(left.planNote)}</p>
    <ol class="semesters">${left.plan.map(s => `
      <li class="semester">
        <header>
          <h3>${esc(s.term)}</h3>
          <span class="num">${s.cr} cr</span>
        </header>
        <ul>${s.entries.map(planEntry).join('')}
        </ul>
      </li>`).join('')}
    </ol>
  </section>

  <div class="actions no-print">
    <button type="button" class="btn primary" data-print>${icons.print()}${esc(left.print)}</button>
    <button type="button" class="btn secondary">${icons.trash()}${esc(left.clear)}</button>
  </div>
</main>
${foot('PathCheck: What I have left')}`;
};

const pages = { start: startPage, check: () => checkPage(false), 'check-typing': () => checkPage(true), left: leftPage };
export const pageNames = Object.keys(pages);
export const render = page => pages[page]();
