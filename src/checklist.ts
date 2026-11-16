// The degree checklist: what a reviewed transcript has done, has in progress and still
// needs, requirement by requirement (docs/BRIEF.md §4 Flow B step 3; docs/design/DESIGN.md
// "Page 3"). The rules here; the page is drawn at the end of this file.
//
// Everything comes from `placeCourses`: credits are the curriculum's, never a row's. A
// course in progress fills its place but is never done.
import { levelOf, sequencePicks } from './answers';
import { findCourse, type Curriculum } from './curriculum';
import { code, esc, eyebrow, icons, marks } from './html';
import { countsByElectiveRule, placeCourses, type Filled, type Placement } from './placement';
import { type CourseStanding } from './transcript';
import {
  LEGACY_STUDENTS_ONLY, NOT_IN_CURRICULUM, electiveFailed, electivePlacesFilled, extraForSequence, listOf, mustBeRepeated, notInCurrentCurriculum, pickFailed,
  repeatInProgress, sameRequirement, sequenceExtra, sequenceStillNeeded,
} from './wording';

export type Status = 'Done' | 'In progress' | 'Still needed';

/** A course in a card's list. */
export interface CourseItem {
  readonly code: string;
  /** The curriculum's title; "" when it has none for this course (an elective by the rule). */
  readonly title: string;
  readonly note: string | null;
}
/** A place that is still open: "1 of A / B", or the electives still to take. */
export interface OpenItem {
  readonly open: true;
  readonly text: string;
  readonly notes: readonly string[];
}
export type StillItem = CourseItem | OpenItem;

export interface Card {
  readonly id: string;
  readonly name: string;
  readonly status: Status;
  /** Credits done. A course in progress is not among them. */
  readonly counted: number;
  readonly needed: number;
  readonly done: readonly CourseItem[];
  readonly progress: readonly CourseItem[];
  readonly still: readonly StillItem[];
}

/** A passed or in-progress course that fills nothing, and why. */
export interface Unused {
  readonly code: string;
  readonly title: string;
  readonly reason: string;
}

export interface Checklist {
  readonly credits: { readonly counted: number; readonly inProgress: number; readonly left: number; readonly total: number };
  /** The terms of the courses in progress that fill a place, as printed, in transcript order. */
  readonly inProgressTerms: readonly string[];
  readonly cards: readonly Card[];
  /**
   * What the sequence still needs: nothing; a course through a pick that is still open; or,
   * with every pick held, a course that fills the sequence only, with extra credits.
   */
  readonly sequence: { readonly kind: 'none' } | { readonly kind: 'open'; readonly text: string } | { readonly kind: 'extra'; readonly text: string; readonly beside: string };
  readonly unused: readonly Unused[];
}

const titleOf = (curriculum: Curriculum, courseCode: string): string => findCourse(curriculum, courseCode)[0]?.course.title ?? '';

/** The checklist of a reviewed transcript, for a student who is or is not a legacy student. */
export function checklistOf(standings: readonly CourseStanding[], curriculum: Curriculum, legacy: boolean): Checklist {
  const placement: Placement = placeCourses(standings, curriculum, { legacy });
  const { electives, grades } = curriculum;
  const standingOf = new Map(standings.map(one => [one.code, one]));
  const held = (courseCode: string): boolean => ['passed', 'in-progress'].includes(standingOf.get(courseCode)?.standing ?? '');
  /** The best grade below the lowest that counts among a course's rows, or null when it has none. */
  const failedWith = (courseCode: string): string | null => {
    const failing = (standingOf.get(courseCode)?.rows ?? []).filter(row => row.standing === 'must-repeat').map(row => (row.row.grade ?? '').trim().toUpperCase());
    return grades.letters.find(letter => failing.includes(letter.toUpperCase())) ?? null;
  };
  /** A course that only failed: below the lowest grade that counts, with nothing later that passes or runs. */
  const mustRepeat = (courseCode: string): string | null => (held(courseCode) ? null : failedWith(courseCode));

  const filledItem = (filled: Filled): CourseItem => {
    const earlier = filled.state === 'in-progress' ? failedWith(filled.course.code) : null;
    return { code: filled.course.code, title: filled.course.title, note: earlier ? repeatInProgress(earlier) : null };
  };
  const statusOf = (allDone: boolean, anyInProgress: boolean): Status => (allDone ? 'Done' : anyInProgress ? 'In progress' : 'Still needed');

  const blockCards: Card[] = placement.blocks.map(({ block, required, picks, credits }) => {
    const filled: Filled[] = [
      ...required.flatMap(place => (place.state === 'needed' ? [] : [{ course: place.course, state: place.state }])),
      ...picks.flatMap(pick => pick.filled),
    ];
    // The courses still to take, lowest number first (as the design lists them); courses
    // with the same number keep the curriculum's order.
    const numberOf = (courseCode: string): number => Number(courseCode.split(' ')[1] ?? 0);
    const still: StillItem[] = [
      ...required.filter(place => place.state === 'needed').map(place => {
        const grade = mustRepeat(place.course.code);
        return { code: place.course.code, title: place.course.title, note: grade ? mustBeRepeated(grade) : null };
      }).sort((a, b) => numberOf(a.code) - numberOf(b.code)),
      ...picks.filter(pick => pick.open > 0).map(pick => {
        const left = pick.options.filter(option => !pick.filled.some(one => one.course.code === option.code));
        return {
          open: true as const,
          text: `${pick.open} of ${left.map(option => option.code).join(' / ')}`,
          notes: left.flatMap(option => { const grade = mustRepeat(option.code); return grade ? [pickFailed(option.code, grade)] : []; }),
        };
      }),
    ];
    const allDone = required.every(place => place.state === 'done') && picks.every(pick => pick.open === 0 && pick.filled.every(one => one.state === 'done'));
    return {
      id: block.id, name: block.name, status: statusOf(allDone, filled.some(one => one.state === 'in-progress')), counted: credits.done, needed: block.credits,
      done: filled.filter(one => one.state === 'done').map(filledItem), progress: filled.filter(one => one.state === 'in-progress').map(filledItem), still,
    };
  });

  // The electives: what fills a place, and one line for the places still open.
  const fillsElective = (courseCode: string): boolean => {
    const places = findCourse(curriculum, courseCode);
    if (places.some(place => place.kind === 'required' || place.kind === 'pick')) return false;
    if (places.some(place => place.kind === 'named-elective')) return true;
    // A failed legacy-only course gets no note: the result must not depend on the legacy
    // answer because of a course that counts nothing either way.
    if (places.some(place => place.kind === 'legacy-elective')) return false;
    return countsByElectiveRule(curriculum, courseCode);
  };
  const { filled: electiveFilled, open: electivesOpen } = placement.electives;
  const namedLeft = electives.named.map(course => course.code).filter(courseCode => !electiveFilled.some(one => one.course.code === courseCode));
  const subjects = electives.subjects.length <= 1 ? electives.subjects.join('') : `${electives.subjects.slice(0, -1).join(', ')} or ${electives.subjects[electives.subjects.length - 1]}`;
  const byRule = `any ${levelOf(curriculum)} ${subjects} course not already required`;
  const electiveStill: StillItem[] = electivesOpen === 0 ? [] : [{
    open: true,
    text: `${electivesOpen} ${electivesOpen === 1 ? 'course' : 'courses'}: ${namedLeft.length > 0 ? `${namedLeft.join(', ')}, or ` : ''}${byRule}`,
    notes: standings.flatMap(one => { const grade = fillsElective(one.code) ? mustRepeat(one.code) : null; return grade ? [electiveFailed(one.code, grade)] : []; }),
  }];
  const electiveCard: Card = {
    id: electives.id, name: electives.name,
    status: statusOf(electivesOpen === 0 && electiveFilled.every(one => one.state === 'done'), electiveFilled.some(one => one.state === 'in-progress')),
    counted: placement.electives.credits.done, needed: electives.credits,
    done: electiveFilled.filter(one => one.state === 'done').map(filledItem), progress: electiveFilled.filter(one => one.state === 'in-progress').map(filledItem), still: electiveStill,
  };

  // Courses that are passed or in progress and fill nothing, each with its reason.
  const holdingElectives = electiveFilled.map(one => one.course.code);
  const unused: Unused[] = placement.unplaced.map(one => ({
    code: one.code,
    title: titleOf(curriculum, one.code),
    reason: one.reason === 'not-in-curriculum' ? NOT_IN_CURRICULUM
      : one.reason === 'not-current' ? notInCurrentCurriculum(one.code)
        : one.reason === 'legacy-only' ? LEGACY_STUDENTS_ONLY
          : one.reason === 'pick-filled' ? sameRequirement(one.filledBy)
            : electivePlacesFilled(electives.courseCount, holdingElectives),
  }));

  // The sequence: judged on its courses that sit in a pick (the others are required anyway).
  const alternatives = sequencePicks(curriculum).filter(alternative => alternative.courses.length > 0);
  const kind = (name: string): string => name.replace(/ sequence$/, '');
  const pickIsOpen = (courseCode: string): boolean => placement.blocks.flatMap(one => one.picks).some(pick => pick.open > 0 && pick.options.some(option => option.code === courseCode));
  let sequence: Checklist['sequence'] = { kind: 'none' };
  if (placement.sequence.state === 'needed' && alternatives.length > 0 && !alternatives.some(alternative => alternative.courses.every(held))) {
    const through = alternatives.filter(alternative => alternative.courses.every(pickIsOpen));
    if (through.length > 0) {
      sequence = { kind: 'open', text: sequenceStillNeeded(through.flatMap(alternative => alternative.courses), through.map(alternative => kind(alternative.name))) };
    } else {
      const codes = alternatives.flatMap(alternative => alternative.courses);
      const kinds = alternatives.map(alternative => kind(alternative.name));
      const extra = Math.min(...codes.map(courseCode => findCourse(curriculum, courseCode)[0]?.course.credits ?? electives.creditsPerCourse));
      sequence = { kind: 'extra', text: sequenceExtra(kinds, extra, codes), beside: extraForSequence(extra, kinds) };
    }
  }

  const inProgress = new Set([...blockCards, electiveCard].flatMap(card => card.progress.map(item => item.code)));
  const inProgressTerms = [...new Set(standings.filter(one => inProgress.has(one.code)).map(one => one.deciding.row.term.trim()).filter(Boolean))];
  const { done, inProgress: running, remaining, degree } = placement.credits;
  return { credits: { counted: done, inProgress: running, left: remaining, total: degree }, inProgressTerms, cards: [...blockCards, electiveCard], sequence, unused };
}

/** Would the legacy answer change anything of the checklist? */
export const legacyChanges = (standings: readonly CourseStanding[], curriculum: Curriculum): boolean =>
  JSON.stringify(checklistOf(standings, curriculum, true)) !== JSON.stringify(checklistOf(standings, curriculum, false));

/** The legacy-only courses that the transcript has passed or in progress. */
export const legacyOnTranscript = (standings: readonly CourseStanding[], curriculum: Curriculum): string[] =>
  standings.filter(one => (one.standing === 'passed' || one.standing === 'in-progress') && findCourse(curriculum, one.code).some(place => place.kind === 'legacy-elective')).map(one => one.code);

// ---- The page ----
const TEXT = {
  creditsLeft: 'credits left',
  overview: 'Credits left',
  counted: 'counted',
  inProgress: 'in progress',
  left: 'left',
  total: 'total',
  reqEyebrow: 'The rest of your degree',
  reqTitle: 'Requirements',
  reqTabs: ['All', 'Not done'],
  reqFilter: 'Requirement filter',
  reqNote: 'Credits counted / needed.',
  show: 'Show courses',
  hide: 'Hide courses',
  unused: (count: number): string => `${count} ${count === 1 ? 'course on your transcript is' : 'courses on your transcript are'} not counted toward CIS`,
};
const STATUS_MARK: Record<Status, (size?: number) => string> = { 'Done': marks.done, 'In progress': marks.progress, 'Still needed': marks.needed };
// A sentence with every course code inside it set in the code face.
const COURSE_CODE = /\b[A-Z]{2,4} \d{3}\b/g;
const withCodes = (text: string): string => esc(text).replace(COURSE_CODE, found => `<span class="code">${found}</span>`);
const percent = (part: number, whole: number): string => `${Math.round((part / whole) * 1e5) / 1e3}%`;
const showCue = `<span class="req-show no-print"><span class="when-closed">${esc(TEXT.show)}</span> <span class="when-open">${esc(TEXT.hide)}</span>${icons.arrow(16, 'req-cue')}</span>`;

const item = (one: StillItem): string => ('open' in one
  ? `<li>${withCodes(one.text)}${one.notes.map(note => ` <span class="item-note">${withCodes(note)}</span>`).join('')}</li>`
  : `<li>${code(one.code, 'strong')}${one.title ? ` ${esc(one.title)}` : ''}${one.note ? ` <span class="item-note">${esc(one.note)}</span>` : ''}</li>`);
const group = (status: Status, list: readonly StillItem[]): string => (list.length === 0 ? '' : `
          <div>
            <p class="group-title">${STATUS_MARK[status](16)} ${status}</p>
            <ul>
              ${list.map(item).join('\n              ')}
            </ul>
          </div>`);

const cardHtml = (card: Card): string => `
      <li class="req" data-status="${card.status}">
        <details${card.status === 'Done' ? '' : ' open'}>
          <summary><span class="req-row">
          <span class="req-name">${esc(card.name)}</span>
          <span class="req-status">${STATUS_MARK[card.status](16)}${card.status}</span>
          <span class="req-bar" aria-hidden="true">${Array.from({ length: card.needed }, (_, i) => `<span${i < card.counted ? ' class="is-counted"' : ''}></span>`).join('')}</span>
          <span class="req-credits num"><strong>${card.counted}</strong> / ${card.needed} cr</span>
          ${showCue}
          </span></summary>
          <div class="req-body">${group('Done', card.done)}${group('In progress', card.progress)}${group('Still needed', card.still)}
          </div>
        </details>
      </li>`;

/** The ring and the credit bar. The pace answer beside them comes with its own feature. */
export function overviewHtml(checklist: Checklist): string {
  const { counted, inProgress, left, total } = checklist.credits;
  const terms = checklist.inProgressTerms.length > 0 ? ` · ${esc(listOf(checklist.inProgressTerms))}` : '';
  return `<section class="overview" aria-label="${esc(TEXT.overview)}">
    <div class="overview-main">
      <div class="donut" role="img" aria-label="${left} ${esc(TEXT.creditsLeft)}, ${counted} ${esc(TEXT.counted)}, ${inProgress} ${esc(TEXT.inProgress)}, ${total} ${esc(TEXT.total)}" style="--counted: ${percent(counted, total)}; --counted-and-progress: ${percent(counted + inProgress, total)}">
        <div><strong class="num">${left}</strong><span>${esc(TEXT.creditsLeft)}</span></div>
      </div>
      <div data-pace></div>
    </div>
    <div class="credit" style="grid-template-columns: minmax(0, ${counted}fr) minmax(0, ${inProgress}fr) minmax(0, ${left}fr)">${inProgress > 0 ? `
      <span class="bar-label is-progress"><strong class="num">${inProgress}</strong> ${esc(TEXT.inProgress)}${terms}</span>` : ''}
      <div class="credit-bar" aria-hidden="true"><span class="bar-counted" style="width: ${percent(counted, total)}"></span><span class="bar-progress hatch" style="width: ${percent(inProgress, total)}"></span></div>
      <span class="bar-label is-counted"><strong class="num">${counted}</strong> ${esc(TEXT.counted)}</span>
      <span class="bar-label is-left"><strong class="num">${left}</strong> ${esc(TEXT.left)}</span>
      <span class="bar-label is-total"><strong class="num">${total}</strong> ${esc(TEXT.total)}</span>
    </div>${checklist.sequence.kind === 'extra' ? `
    <p class="credit-extra">${esc(checklist.sequence.beside)}</p>` : ''}
  </section>`;
}

/** The requirement cards, what the sequence still needs, and the courses that fill nothing. */
export function requirementsHtml(checklist: Checklist): string {
  const { sequence, unused } = checklist;
  return `<section class="reqs" aria-labelledby="req-title">
    <div class="section-head">
      <div>
        ${eyebrow(TEXT.reqEyebrow)}
        <h2 id="req-title">${esc(TEXT.reqTitle)}</h2>
      </div>
      <div class="tabs no-print" role="group" aria-label="${esc(TEXT.reqFilter)}">
        <button type="button" aria-pressed="true" data-reqs="all">${esc(TEXT.reqTabs[0] ?? '')}</button>
        <button type="button" aria-pressed="false" data-reqs="not-done">${esc(TEXT.reqTabs[1] ?? '')}</button>
      </div>
    </div>
    <p class="section-note">${esc(TEXT.reqNote)}</p>
    <ul class="req-list">${checklist.cards.map(cardHtml).join('')}
    </ul>${sequence.kind === 'none' ? '' : `
    <p class="sequence">${marks.needed(20)}<span>${withCodes(sequence.text)}</span></p>`}${unused.length === 0 ? '' : `
    <details class="unused">
      <summary><span>${esc(TEXT.unused(unused.length))}</span> ${showCue}</summary>
      <ul>
        ${unused.map(one => `<li>${code(one.code, 'strong')}${one.title ? ` ${esc(one.title)}` : ''} <span class="item-note">${withCodes(one.reason)}</span></li>`).join('\n        ')}
      </ul>
    </details>`}
  </section>`;
}
