// Small pieces every page is drawn with. A page is a function that returns HTML text, so
// its wording and structure can be tested without a browser.

export const esc = (text: string | number): string =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A course code, set in the code face so that it cannot break across lines. */
export const code = (text: string, cls = ''): string => `<span class="code${cls ? ' ' + cls : ''}">${esc(text)}</span>`;

// Marks and icons are drawn here; there is no icon pack and no image.
const svg = (size: number, body: string, cls = '', box = 20): string =>
  `<svg class="icon${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 ${box} ${box}" aria-hidden="true" focusable="false">${body}</svg>`;
const line = (d: string, w = 2): string => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const cut = (d: string, w = 2.2): string => `<path d="${d}" fill="none" stroke="var(--surface)" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

const tick = 'M5.9 10.3l2.8 2.8 5.5-5.9';
// One status, one word, one shape. "Counts" is an outlined tick; the filled tick belongs to
// "Done", so a conditional answer never looks as certain as a finished requirement.
export const marks = {
  counts: (size = 20): string => svg(size, `<circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2"/>${line(tick, 2.2)}`, 'mark mark-counts'),
  no: (size = 20): string => svg(size, `<rect x="1" y="1" width="18" height="18" rx="3" fill="currentColor"/>${cut('M6.6 6.6l6.8 6.8M13.4 6.6l-6.8 6.8')}`, 'mark mark-no'),
};

export const icons = {
  arrow: (size = 20, cls = ''): string => svg(size, line('M3 10h13M11.2 5.2L16 10l-4.8 4.8'), cls),
  doc: (size = 20): string => svg(size, line('M5 2h7l4 4v12H5z', 1.8) + line('M12 2v4h4M8 11h5M8 14h5', 1.8)),
  upload: (size = 28): string => svg(size, line('M8 21H7a5 5 0 0 1-.4-10A7.5 7.5 0 0 1 21 9a6 6 0 0 1 0 12h-1M14 25V13M10 17l4-4 4 4', 1.7), '', 28),
  play: (size = 14): string => svg(size, `<path d="M3 1l10 6-10 6z" fill="currentColor"/>`, 'i-play', 14),
  pause: (size = 14): string => svg(size, `<rect x="2" y="1" width="3.5" height="12" fill="currentColor"/><rect x="8.5" y="1" width="3.5" height="12" fill="currentColor"/>`, 'i-pause', 14),
};

export const eyebrow = (text: string): string => `<span class="eyebrow">${esc(text)}</span>`;
