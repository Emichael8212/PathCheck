// Page 1, Start: two big choices and nothing to fill in first (docs/design/DESIGN.md).
//
// The examples on this page name courses by code only (examples.json, read here and nowhere
// else). Every title, credit, block name and total shown is looked up in, or worked out
// from, the curriculum, and an example that would say something untrue is refused.
import examples from './examples.json';
import { UNKNOWN_COURSE_CREDITS } from './credits';
import { findCourse, normalizeCode, programs as allPrograms, type Block, type Course, type Curriculum, type Program } from './curriculum';
import { code, esc, eyebrow, icons, marks } from './html';
import { countsByElectiveRule, placeCourses, type Placement } from './placement';
import { HREF, FLOW_NAME, foot, top } from './shell';
import { courseStandings, type TranscriptRow } from './transcript';
import { CAVEAT, CONDITION, NOT_IN_CURRICULUM, PRIVACY, countsToward } from './wording';

const TEXT = {
  kicker: 'Before registration. Before you pay.',
  headline: ['Does it count toward your degree?', 'Check before you select your classes.'],
  sub: 'Know what counts. See what’s left. Make room for what matters.',
  majorLabel: 'Your major',
  check: {
    number: '01',
    eyebrow: 'For next semester',
    desc: 'Is each of next semester’s courses going to count?',
    exampleLabel: 'Example course result',
    note: '~30 seconds · No transcript needed',
  },
  left: {
    number: '02',
    eyebrow: 'For the bigger picture',
    desc: 'Upload the unofficial transcript PDF from the portal; get what’s left, pace, and a draft plan.',
    drop: 'Drag & drop your transcript PDF here',
    or: 'or',
    browse: 'Browse files',
  },
  demo: {
    eyebrow: 'A quick look',
    title: 'See it work',
    sub: 'From a course code to a clear answer.',
    list: ['Type a code or title', 'See whether it counts', 'Add a transcript to see what’s left'],
    label: 'How PathCheck works',
    steps: [
      'Type a course code or title. Suggestions appear as you type.',
      'Each course gets exactly one answer.',
      '“Doesn’t count” is marked plainly, before you pay for it.',
      'Add your unofficial transcript PDF to see what’s left and your pace.',
    ],
    placeholder: 'Add a course',
    file: 'unofficial-transcript.pdf',
    remainingLabel: 'credits left',
    // Example text for the made-up student, until the pace code can work it out.
    pace: 'On pace for Spring 2029',
  },
};

const credits = (n: number): string => `${n} cr`;

/** The example of a course that counts: a required course, with its block. */
export function countsExample(curriculum: Curriculum): { course: Course; block: Block } {
  const place = findCourse(curriculum, examples.counts).find(one => one.kind === 'required');
  const block = place?.kind === 'required' ? curriculum.blocks.find(one => one.id === place.blockId) : undefined;
  if (!place || !block) throw new Error(`The example ${examples.counts} is not a required course of this curriculum.`);
  return { course: place.course, block };
}

/** The example of a course that does not count: in no list, and not an elective by the rule. */
export function doesNotCountExample(curriculum: Curriculum): string {
  const normal = normalizeCode(examples.doesNotCount);
  if (normal === null || findCourse(curriculum, normal).length > 0 || countsByElectiveRule(curriculum, normal)) {
    throw new Error(`The example ${examples.doesNotCount} would count in this curriculum.`);
  }
  return normal;
}

/** Where the demo's made-up student stands, worked out like any transcript. */
export function demoStudent(curriculum: Curriculum): Placement {
  const row = (grade: string | null) => (courseCode: string): TranscriptRow => ({ code: courseCode, term: '', credits: 0, grade, transfer: false });
  const rows = [...examples.student.passed.map(row(curriculum.grades.minimumCounting)), ...examples.student.inProgress.map(row(null))];
  return placeCourses(courseStandings(rows, curriculum.grades), curriculum);
}

const percent = (part: number, whole: number): string => `${Math.round((part / whole) * 1e5) / 1e3}%`;
// The credit bar: done is solid, in progress is hatched, the rest is open.
const bar = ({ credits: c }: Placement): string =>
  `<span class="bar-counted" style="width: ${percent(c.done, c.degree)}"></span><span class="bar-progress hatch" style="width: ${percent(c.inProgress, c.degree)}"></span>`;

const demoFrames = (curriculum: Curriculum): string[] => {
  const d = TEXT.demo;
  const counts = countsExample(curriculum);
  const no = doesNotCountExample(curriculum);
  const student = demoStudent(curriculum);
  // What the demo's student has typed when the suggestion appears: the start of the code.
  const typed = counts.course.code.slice(0, 5).toLowerCase();
  const field = (inner: string): string => `<div class="demo-field">${inner}</div>`;
  const placeholder = `<span class="muted">${esc(d.placeholder)}</span>`;
  // A "Counts" answer never appears without its condition, here as everywhere.
  const countsCard = `
        <div class="demo-card">
          <div class="demo-card-head"><span>${code(counts.course.code, 'strong')} ${esc(counts.course.title)}</span><span class="num muted">${esc(credits(counts.course.credits))}</span></div>
          <div class="demo-answer is-counts">${marks.counts(16)} ${esc(countsToward(counts.block.name))}</div>
          <small class="demo-condition">${esc(CONDITION)}</small>
        </div>`;
  const noCard = `
        <div class="demo-card is-no">
          <div class="demo-card-head">${code(no, 'strong')} <span class="num muted struck">${esc(credits(UNKNOWN_COURSE_CREDITS))}</span></div>
          <div class="demo-answer is-no">${marks.no(16)} ${esc(NOT_IN_CURRICULUM)}</div>
        </div>`;
  // The pace answer never appears without its caveat.
  const leftCard = `
        <div class="demo-card">
          <div class="demo-file">${icons.doc(20)} ${esc(d.file)}</div>
          <div class="demo-left"><span class="num">${student.credits.remaining}</span><span>${esc(d.remainingLabel)}</span></div>
          <div class="demo-bar">${bar(student)}</div>
          <div class="demo-pace">${esc(d.pace)}</div>
          <small class="demo-caveat">${esc(CAVEAT)}</small>
        </div>`;
  return [
    `${field(`<span class="code">${esc(typed)}<span class="caret"></span></span>`)}
      <div class="demo-suggest">${code(counts.course.code, 'strong')} <span class="truncate">${esc(counts.course.title)}</span></div>`,
    `${field(placeholder)}
      <div class="demo-cards">${countsCard}
      </div>`,
    `${field(code(no))}
      <div class="demo-cards">${countsCard}${noCard}
      </div>`,
    `${field(placeholder)}
      <div class="demo-cards">${leftCard}
      </div>`,
  ];
};

const demo = (curriculum: Curriculum): string => {
  const d = TEXT.demo;
  const frames = demoFrames(curriculum);
  return `
  <section class="demo" aria-labelledby="demo-title">
    <div>
      ${eyebrow(d.eyebrow)}
      <h2 id="demo-title">${esc(d.title)}</h2>
      <p>${esc(d.sub)}</p>
      <ol class="demo-list">
        ${d.list.map((item, i) => `<li><span class="chip" aria-hidden="true">${i + 1}</span>${esc(item)}</li>`).join('\n        ')}
      </ol>
    </div>
    <section class="demo-player" aria-label="${esc(d.label)}" data-demo>
      <div class="demo-frame" aria-hidden="true">
        ${frames.map((frame, i) => `<div class="demo-step" data-step="${i + 1}"${i ? ' hidden' : ''}>
      ${frame}
        </div>`).join('\n        ')}
      </div>
      <div class="demo-controls">
        <button type="button" class="demo-toggle" aria-label="Pause demo" data-playing="true" data-toggle>${icons.pause()}${icons.play()}</button>
        <div class="demo-dots" role="group" aria-label="Demo steps">
          ${frames.map((_, i) => `<button type="button" aria-label="Step ${i + 1} of ${frames.length}"${i ? '' : ' aria-current="step"'} data-go="${i + 1}"><span></span></button>`).join('\n          ')}
        </div>
        <p class="demo-caption" aria-live="off" data-live>
          ${d.steps.map((step, i) => `<span data-caption="${i + 1}"${i ? ' hidden' : ''}><span class="num">${i + 1}/${d.steps.length}</span> ${esc(step)}</span>`).join('\n          ')}
        </p>
      </div>
    </section>
  </section>`;
};

/** The Start page. `programs` is the list of majors the app has; the first is the one shown. */
export function startPage(programs: readonly Program[] = allPrograms): string {
  const [program] = programs;
  if (!program) throw new Error('PathCheck has no program to show.');
  const { curriculum } = program;
  const a = TEXT.check;
  const b = TEXT.left;
  const example = countsExample(curriculum);
  return `${top('start')}
<main class="start wrap">
  <div class="intro">
    <span class="kicker"><span class="kicker-dot" aria-hidden="true"></span>${esc(TEXT.kicker)}</span>
    <h1 tabindex="-1">${esc(TEXT.headline[0] ?? '')}<br><span class="accent">${esc(TEXT.headline[1] ?? '')}</span></h1>
    <p>${esc(TEXT.sub)}</p>
    <div class="major">
      <label for="major">${esc(TEXT.majorLabel)}</label>
      <div class="select">
        <span aria-hidden="true">${esc(program.name)}</span>
        ${icons.arrow(20, 'turn-down')}
        <select id="major">${programs.map((one, i) => `<option value="${esc(one.id)}"${i ? '' : ' selected'}>${esc(one.name)}</option>`).join('')}</select>
      </div>
    </div>
  </div>

  <div class="entry">
    <section class="entry-check" aria-labelledby="way-check">
      <span class="chip" aria-hidden="true">${esc(a.number)}</span>
      <div>
        ${eyebrow(a.eyebrow)}
        <h2 id="way-check">${esc(FLOW_NAME.check)}</h2>
      </div>
      <p>${esc(a.desc)}</p>
      <div class="example" role="group" aria-label="${esc(a.exampleLabel)}">
        <div class="example-head">${code(example.course.code)} <span>${esc(credits(example.course.credits))}</span></div>
        <p>${esc(example.course.title)}</p>
        <span class="example-answer">${marks.counts(20)}${esc(countsToward(example.block.name))}</span>
        <small>${esc(CONDITION)}</small>
      </div>
      <a class="btn primary" href="${HREF.check}">${esc(FLOW_NAME.check)} ${icons.arrow()}</a>
      <span class="entry-note">${esc(a.note)}</span>
    </section>
    <section class="entry-left" aria-labelledby="way-left">
      <div class="entry-head">
        <span class="chip" aria-hidden="true">${esc(b.number)}</span>
        <div>
          ${eyebrow(b.eyebrow)}
          <h2 id="way-left">${esc(FLOW_NAME.left)}</h2>
        </div>
      </div>
      <p>${esc(b.desc)}</p>
      <div class="drop" data-drop>
        <span class="upload-icon">${icons.upload()}</span>
        <p class="drop-title">${esc(b.drop)}</p>
        <span class="drop-or">${esc(b.or)}</span>
        <button type="button" class="btn secondary" data-browse>${esc(b.browse)} ${icons.arrow()}</button>
        <p class="privacy">${icons.doc(20)}${esc(PRIVACY)}</p>
      </div>
    </section>
  </div>
${demo(curriculum)}
</main>
${foot(curriculum)}`;
}
