// Pieces every mockup page carries, whatever the design direction (docs/BRIEF.md §4
// "On every result" and "Remembering"). Each direction styles them its own way.
import { page } from './data.js';

export const esc = text => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

export const sum = courses => courses.reduce((total, course) => total + course.credits, 0);

export const header = () => `
<header class="top">
  <a class="brand" href="../index.html">${page.name}</a>
  <p class="unaffiliated">${page.notAffiliated}</p>
</header>`;

// `current` is "check" or "left"; `subject` pre-fills the mistake report.
export const footer = (current, subject) => `
<footer class="foot">
  <p>${page.reviewed}</p>
  <p>${page.notOfficial}</p>
  <p><a href="mailto:mistake@example.com?subject=${encodeURIComponent('PathCheck mistake: ' + subject)}">Report a mistake</a></p>
  <p><button type="button" class="quiet">Clear my data</button></p>
  <nav aria-label="Mockup pages">
    ${current === 'check' ? '<a href="left.html">See what I have left</a>' : '<a href="check.html">Check my courses</a>'}
    <a href="../index.html">All three mockups</a>
  </nav>
  <p class="mockup-note">${esc(page.mockupNote)}</p>
</footer>`;
