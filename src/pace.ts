// Pace: whether the credits still to take fit into the terms up to a target semester
// (docs/BRIEF.md §4 Flow B step 4; docs/design/DESIGN.md "Page 3"; docs/sprints/F14.md).
// Credits only. Everything comes from the reviewed transcript and the student's settings;
// nothing is taken from today's date (the owner, 2026-11-16).
import { FULL_TIME, USUAL_MOST } from './credits';
import { esc, eyebrow } from './html';
import { type CourseStanding } from './transcript';
import { CAVEAT, belowFullTime, overUsualMost } from './wording';

export type Season = 'Spring' | 'Summer' | 'Fall';
export interface Term {
  readonly season: Season;
  readonly year: number;
}
const SEASONS: readonly Season[] = ['Spring', 'Summer', 'Fall'];
/** A term's place in time: later terms have larger numbers. */
const place = (term: Term): number => term.year * SEASONS.length + SEASONS.indexOf(term.season);
export const termName = (term: Term): string => `${term.season} ${term.year}`;
const sameTerm = (a: Term, b: Term): boolean => place(a) === place(b);

/**
 * A term as printed on a transcript or typed in the review: a season and a four-digit
 * year. Letter case and extra spaces do not matter. Anything else is not a term.
 */
export function readTerm(text: string): Term | null {
  const found = /^\s*(fall|spr|spring|sum|summer)\s+(\d{4})\s*$/i.exec(text);
  if (!found) return null;
  const word = (found[1] ?? '').toLowerCase();
  return { season: word === 'fall' ? 'Fall' : word.startsWith('spr') ? 'Spring' : 'Summer', year: Number(found[2]) };
}

/** The term after this one: Spring, then Fall; Summer between them only when summers count. */
export function termAfter(term: Term, summers: boolean): Term {
  if (term.season === 'Fall') return { season: 'Spring', year: term.year + 1 };
  if (term.season === 'Spring' && summers) return { season: 'Summer', year: term.year };
  return { season: 'Fall', year: term.year };
}

/**
 * The latest term on the transcript: the latest term with a row in progress; with none,
 * the latest term with a graded row. Rows of the transfer section are not looked at.
 * Null when there is no such row, or when a term that decides cannot be read: it could
 * be the latest.
 */
export function latestTermOf(standings: readonly CourseStanding[]): Term | null {
  const rows = standings.flatMap(one => one.rows).filter(one => one.row.transfer !== true);
  const running = rows.filter(one => one.standing === 'in-progress');
  const deciding = (running.length > 0 ? running : rows).map(one => readTerm(one.row.term));
  if (deciding.length === 0 || deciding.includes(null)) return null;
  return (deciding as Term[]).reduce((latest, term) => (place(term) > place(latest) ? term : latest));
}

/** What the student has chosen. `target` is null until they choose one: it then follows the settings. */
export interface PaceSettings {
  readonly target: Term | null;
  readonly fewest: number;
  readonly most: number;
  readonly summers: boolean;
}
export const defaultSettings = (): PaceSettings => ({ target: null, fewest: FULL_TIME, most: USUAL_MOST, summers: false });

/** One step of "−" or "+" on an end of the range. The ends never cross, and neither goes below 1. */
export function stepRange(settings: PaceSettings, end: 'fewest' | 'most', delta: number): PaceSettings {
  const value = Math.max(1, settings[end] + delta);
  return end === 'fewest'
    ? { ...settings, fewest: value, most: Math.max(settings.most, value) }
    : { ...settings, most: value, fewest: Math.min(settings.fewest, value) };
}

export type Pace =
  /** The latest term could not be read from the transcript: no estimate. */
  | { readonly kind: 'unreadable' }
  /** Nothing is left to take. */
  | { readonly kind: 'none' }
  | {
    /** On pace: the credits fit into the terms up to the target at the most credits a term. */
    readonly kind: 'on' | 'off';
    readonly credits: number;
    readonly start: Term;
    readonly target: Term;
    /** The terms from the start to the target, both counted. */
    readonly terms: number;
    /** Credits a term to finish by the target, rounded to a whole number. */
    readonly perTerm: number;
    /** What the detail line says: the average; or where the student finishes at one end of the range. */
    readonly detail: { readonly kind: 'about' } | { readonly kind: 'before' | 'after'; readonly at: number; readonly finish: Term; readonly semesters: number };
    /** The targets offered: the one before the default, the default, three after it, and the chosen one. */
    readonly options: readonly Term[];
  };

/** The term reached after this many terms, counting the start as the first. */
const termAt = (start: Term, count: number, summers: boolean): Term => {
  let term = start;
  for (let i = 1; i < count; i++) term = termAfter(term, summers);
  return term;
};
/** How many terms there are from the start up to and including this one. */
const termsTo = (start: Term, target: Term, summers: boolean): number => {
  let count = 1;
  for (let term = start; place(term) < place(target); term = termAfter(term, summers)) count++;
  return count;
};

/**
 * The pace answer for the credits still to take, after the latest term of the transcript.
 * A course in progress is already left out of those credits: it counts as passed.
 */
export function paceOf(credits: number, latest: Term | null, settings: PaceSettings): Pace {
  if (credits <= 0) return { kind: 'none' };
  if (latest === null) return { kind: 'unreadable' };
  const { summers } = settings;
  // The controls keep both ends whole numbers of at least 1 that never cross; should other
  // values be given, the most decides and nothing here can run without end.
  const most = Math.max(1, Math.floor(settings.most));
  const fewest = Math.max(1, Math.min(Math.floor(settings.fewest), most));
  const start = termAfter(latest, summers);
  const termsAtMost = Math.ceil(credits / most);
  const earliest = termAt(start, termsAtMost, summers);
  // The chosen target, as far as it can still be one: not a summer when summers do not
  // count, and not before the first term ahead.
  let target = settings.target ?? earliest;
  if (target.season === 'Summer' && !summers) target = { season: 'Fall', year: target.year };
  if (place(target) < place(start)) target = start;
  const terms = termsTo(start, target, summers);
  const on = termsAtMost <= terms;
  const termsAtFewest = Math.ceil(credits / fewest);
  const detail: Extract<Pace, { kind: 'on' | 'off' }>['detail'] = !on
    ? { kind: 'after', at: most, finish: earliest, semesters: termsAtMost - terms }
    : credits / terms < fewest && termsAtFewest < terms
      ? { kind: 'before', at: fewest, finish: termAt(start, termsAtFewest, summers), semesters: terms - termsAtFewest }
      : { kind: 'about' };
  const offered = [termsAtMost - 1, termsAtMost, termsAtMost + 1, termsAtMost + 2, termsAtMost + 3].filter(count => count >= 1).map(count => termAt(start, count, summers));
  const options = [...offered, target].filter((term, i, all) => all.findIndex(other => sameTerm(other, term)) === i).sort((a, b) => place(a) - place(b));
  return { kind: on ? 'on' : 'off', credits, start, target, terms, perTerm: Math.round(credits / terms), detail, options };
}

// ---- The pace line of "Check my courses" (brief §4 Flow A step 5; the owner's answer of 2026-11-16; docs/sprints/F15.md) ----
export const NO_CREDITS_LEFT = 'No credits left to plan';
export const PACE_UNREADABLE = 'Pace can’t be estimated: the latest term on your transcript could not be read.';

export type PaceLine =
  /** Nothing is left to take. */
  | { readonly kind: 'none' }
  /** The latest term could not be read from the transcript. */
  | { readonly kind: 'unreadable' }
  /** None of the typed credits counts: the list brings the finish no closer. */
  | { readonly kind: 'no-count' }
  | {
    readonly kind: 'line';
    /** The typed credits that count toward the degree, and all the typed credits. */
    readonly counting: number;
    readonly total: number;
    /** The term the typed courses are for, and the terms offered: the default and the next three. */
    readonly term: Term;
    readonly terms: readonly Term[];
    /** The term in which the credits still to take run out, at this many credits in every Fall and Spring. */
    readonly finish: Term;
    readonly target: Term;
    readonly targets: readonly Term[];
    /** The finish against the target, in Fall and Spring terms; a summer target is one step. */
    readonly compare: { readonly kind: 'on' } | { readonly kind: 'before' | 'after'; readonly semesters: number };
  };

/** A term's place among Fall and Spring terms; a summer sits half-way between its Spring and its Fall. */
const halfYears = (term: Term): number => term.year * 2 + (term.season === 'Spring' ? 0 : term.season === 'Summer' ? 0.5 : 1);

/**
 * The pace line: `left` credits are still to take; the student has typed `total` credits
 * of which `counting` count toward the degree, for `term` (null: the first Fall or Spring
 * after the transcript's latest term). `after` is what will still be to take once those
 * courses are taken: usually `left - counting`, but more when one of them fills the last
 * pick a sequence could have gone through. The target is the one of "See what I have
 * left". Summers are never counted here.
 */
export function paceLineOf(input: { left: number; after: number; counting: number; total: number; latest: Term | null; term: Term | null; settings: PaceSettings }): PaceLine {
  const { left, after, counting, total, latest, settings } = input;
  if (left <= 0) return { kind: 'none' };
  if (latest === null) return { kind: 'unreadable' };
  if (counting <= 0) return { kind: 'no-count' };
  const first = termAfter(latest, false);
  const terms = [1, 2, 3, 4].map(count => termAt(first, count, false));
  // The chosen term, when it is one of those offered.
  const term = terms.find(one => input.term !== null && sameTerm(one, input.term)) ?? first;
  // This term, and then as many more at the same pace as what is left after it takes.
  const finish = after <= 0 ? term : termAt(term, 1 + Math.ceil(after / counting), false);
  // The target as "See what I have left" has it; a summer only when summers count there.
  const shared = paceOf(left, latest, settings);
  const plain = paceOf(left, latest, { ...settings, summers: false, target: null });
  // (Credits are left and the latest term is known, so both are estimates.)
  if ((shared.kind !== 'on' && shared.kind !== 'off') || (plain.kind !== 'on' && plain.kind !== 'off')) throw new Error('The pace line has no target to compare with.');
  const { target } = shared;
  const targets = [...plain.options, target].filter((one, i, all) => all.findIndex(other => sameTerm(other, one)) === i).sort((a, b) => place(a) - place(b));
  const apart = halfYears(finish) - halfYears(target);
  const compare: Extract<PaceLine, { kind: 'line' }>['compare'] = apart === 0 ? { kind: 'on' } : { kind: apart > 0 ? 'after' : 'before', semesters: Math.ceil(Math.abs(apart)) };
  return { kind: 'line', counting, total, term, terms, finish, target, targets, compare };
}

// ---- The page ----
const TEXT = {
  eyebrow: 'Looking ahead',
  on: (target: string): string => `On pace for ${target}`,
  off: (target: string): string => `Not on pace for ${target}`,
  about: (credits: number): string => `about ${credits} ${credits === 1 ? 'credit' : 'credits'} a term`,
  finish: (at: number, term: string, semesters: number, when: 'before' | 'after'): string =>
    `At ${at} ${at === 1 ? 'credit' : 'credits'} a term you finish ${term}, ${semesters === 1 ? 'one semester' : `${semesters} semesters`} ${when} your target.`,
  none: NO_CREDITS_LEFT,
  unreadable: PACE_UNREADABLE,
  controls: 'Make the estimate yours',
  legend: 'Adjust your pace',
  target: 'Target semester',
  fewest: 'Fewest credits per term',
  most: 'Most credits per term',
  fewer: 'one fewer',
  more: 'one more',
  credits: (count: number): string => (count === 1 ? 'credit' : 'credits'),
  summers: 'Summers',
  onOff: (on: boolean): string => (on ? 'On' : 'Off'),
};

/** The answer in a few words: "On pace for Spring 2029". Nothing when there is no estimate. */
export const paceHeadline = (pace: Pace): string =>
  (pace.kind === 'on' ? TEXT.on(termName(pace.target)) : pace.kind === 'off' ? TEXT.off(termName(pace.target)) : pace.kind === 'none' ? TEXT.none : '');

/** The answer as one sentence, for a screen reader when a control changes it. */
export function paceSentence(pace: Pace): string {
  if (pace.kind === 'none') return TEXT.none;
  if (pace.kind === 'unreadable') return TEXT.unreadable;
  const { detail } = pace;
  const headline = pace.kind === 'on' ? TEXT.on(termName(pace.target)) : TEXT.off(termName(pace.target));
  return detail.kind === 'about' ? `${headline}: ${TEXT.about(pace.perTerm)}` : `${headline}. ${TEXT.finish(detail.at, termName(detail.finish), detail.semesters, detail.kind)}`;
}

/** Beside the ring: the answer, its detail and, with every estimate, the caveat. */
export function paceAnswerHtml(pace: Pace): string {
  if (pace.kind === 'unreadable') return `${eyebrow(TEXT.eyebrow)}
        <p class="pace-detail">${esc(TEXT.unreadable)}</p>`;
  if (pace.kind === 'none') return `${eyebrow(TEXT.eyebrow)}
        <h2>${esc(TEXT.none)}</h2>`;
  const { detail } = pace;
  return `${eyebrow(TEXT.eyebrow)}
        <h2>${esc(pace.kind === 'on' ? TEXT.on(termName(pace.target)) : TEXT.off(termName(pace.target)))}</h2>
        <p class="pace-detail">${esc(detail.kind === 'about' ? TEXT.about(pace.perTerm) : TEXT.finish(detail.at, termName(detail.finish), detail.semesters, detail.kind))}</p>
        <p class="caveat">${esc(CAVEAT)}</p>`;
}

const stepper = (name: 'fewest' | 'most', label: string, value: number, note: string | null): string => `<div class="field" data-stepper="${name}">
          <span id="${name}-label">${esc(label)}</span>
          <div class="stepper" role="group" aria-labelledby="${name}-label" aria-describedby="${name}-note">
            <button type="button" aria-label="${esc(`${label}: ${TEXT.fewer}`)}" data-delta="-1"${value <= 1 ? ' disabled' : ''}>−</button>
            <output class="num"><span data-value>${value}</span> <span data-unit>${esc(TEXT.credits(value))}</span></output>
            <button type="button" aria-label="${esc(`${label}: ${TEXT.more}`)}" data-delta="1">+</button>
          </div>
          <p class="field-note" id="${name}-note">${note ? esc(note) : ''}</p>
        </div>`;

/** The neutral note under an end of the range, or nothing: below full-time, or over the usual most. */
const rangeNote = (value: number): string | null => (value < FULL_TIME ? belowFullTime(FULL_TIME) : value > USUAL_MOST ? overUsualMost(USUAL_MOST) : null);

/** What a control now shows, for a screen reader: the card is drawn again, so the new value and its note are said. */
export const rangeSentence = (end: 'fewest' | 'most', settings: PaceSettings): string => {
  const value = settings[end];
  const note = rangeNote(value);
  return `${TEXT[end]}: ${value} ${TEXT.credits(value)}.${note ? ` ${note}` : ''}`;
};
export const summersSentence = (settings: PaceSettings): string => `${TEXT.summers}: ${TEXT.onOff(settings.summers)}.`;

/**
 * Under the credit bar: the four controls, and for paper, where controls are not printed,
 * one line that says what they are set to. Nothing when there is no estimate to adjust.
 */
export function paceControlsHtml(pace: Pace, settings: PaceSettings): string {
  if (pace.kind !== 'on' && pace.kind !== 'off') return '';
  return `<div class="pace">
      ${eyebrow(TEXT.controls)}
      <fieldset class="pace-grid">
        <legend class="sr-only">${esc(TEXT.legend)}</legend>
        <div class="field">
          <label for="target">${esc(TEXT.target)}</label>
          <select id="target" data-pace-target>
            ${pace.options.map(term => `<option value="${esc(termName(term))}"${sameTerm(term, pace.target) ? ' selected' : ''}>${esc(termName(term))}</option>`).join('')}
          </select>
        </div>
        ${stepper('fewest', TEXT.fewest, settings.fewest, rangeNote(settings.fewest))}
        ${stepper('most', TEXT.most, settings.most, rangeNote(settings.most))}
        <div class="field">
          <span id="summers-label">${esc(TEXT.summers)}</span>
          <button type="button" class="switch" role="switch" aria-checked="${settings.summers}" aria-labelledby="summers-label" data-pace-summers>
            <span class="switch-track" aria-hidden="true"><span></span></span>
            <span class="switch-value">${esc(TEXT.onOff(settings.summers))}</span>
          </button>
        </div>
      </fieldset>
    </div>
    <p class="print-only pace-settings" data-pace-settings>${esc(`${TEXT.target}: ${termName(pace.target)}. ${rangeSentence('fewest', settings)} ${rangeSentence('most', settings)} ${summersSentence(settings)}`)}</p>`;
}
