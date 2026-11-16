// Content for the M0 mockups. Wording is the owner's design (docs/design/DESIGN.md), the
// owner's answers of 2026-11-15 (docs/decision-log.md) and docs/M0-DESIGN-BRIEF.md "The 3 pages".
// The student is synthetic. Course codes, titles and credits are real curriculum data.

export const CONDITION = 'unless you’ve already passed it or filled this slot';
export const CAVEAT = 'Credits only — course order may add semesters.';
// Shown before the first upload, next to the upload control (owner, 2026-11-15).
export const PRIVACY = 'Your PDF is read, then deleted. Only your result stays in this browser.';

export const facts = {
  name: 'PathCheck',
  notOfficial: 'Not an official degree audit.',
  reviewed: 'Curriculum last reviewed: Nov 2026',
  report: 'Report a mistake',
  // Placeholder: the owner gives the contact address before M3 (brief §12).
  reportAddress: 'report@pathcheck.example',
  notAffiliated: 'Not affiliated with Alabama State University',
  nav: [
    { page: 'check', href: 'check.html', label: 'Check my courses' },
    { page: 'left', href: 'left.html', label: 'What I have left' },
  ],
};

export const start = {
  kicker: 'Before registration. Before you pay.',
  headline: ['Does it count toward your degree?', 'Check before you select your classes.'],
  sub: 'Know what counts. See what’s left. Make room for what matters.',
  majorLabel: 'Your major',
  major: 'B.S. Computer Information Systems',
  check: {
    number: '01',
    eyebrow: 'For next semester',
    title: 'Check my courses',
    desc: 'Is each of next semester’s courses going to count?',
    example: { code: 'MGT 321', cr: '3 cr', title: 'Principles of Management', answer: 'Counts toward CIS — Business core', condition: CONDITION },
    cta: 'Check my courses',
    note: '~30 seconds · No transcript needed',
  },
  left: {
    number: '02',
    eyebrow: 'For the bigger picture',
    title: 'See what I have left',
    desc: 'Upload the unofficial transcript PDF from the portal; get what’s left, pace, and a draft plan.',
    drop: 'Drag & drop your transcript PDF here',
    or: 'or',
    browse: 'Browse files',
    privacy: PRIVACY,
    mockNote: 'Mockup: opens synthetic student results.',
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
    typed: 'mgt 3',
    placeholder: 'Add a course',
    counts: { code: 'MGT 321', title: 'Principles of Management', cr: '3 cr', answer: 'Counts toward CIS — Business core', condition: CONDITION },
    no: { code: 'BIO 230', cr: '3 cr', answer: 'Doesn’t count toward CIS — not in the CIS curriculum' },
    file: 'unofficial-transcript.pdf',
  },
};

const row = (code, title, counts, answer) => ({ code, title, cr: 3, counts, answer, ...(counts ? { condition: CONDITION } : {}) });

export const check = {
  eyebrow: 'Check my courses',
  term: 'Spring 2027',
  status: 'No transcript added',
  summaryLabels: ['Total credits', 'Count toward CIS', 'Don’t count'],
  // Without a transcript the count is conditional, like every answer under it.
  countCondition: 'unless you’ve already passed them or filled their slots',
  addLabel: 'Add a course',
  placeholder: 'Course code or title',
  add: 'Add',
  typed: 'mgt 3',
  suggestion: { code: 'MGT 321', title: 'Principles of Management' },
  filters: ['All courses', 'Doesn’t count'],
  columns: ['Course', 'Credits', 'Does it count?', 'Remove'],
  courses: [
    row('ACT 215', 'Principles of Managerial Accounting', true, 'Counts toward CIS — Pre-professional'),
    row('MGT 321', 'Principles of Management', true, 'Counts toward CIS — Business core'),
    row('MKT 410', '', true, 'Counts toward CIS: elective (300/400-level MKT)'),
    row('BIO 230', '', false, 'Doesn’t count toward CIS — not in the CIS curriculum'),
    row('ENG 131', 'English Composition I', true, 'Counts toward CIS — Composition'),
    row('ENG 140', 'English Composition Honors I', false, 'Doesn’t count — it fills the same requirement as ENG 131.'),
  ],
  reminder: 'Remember: you need HIS 132 or ENG 210 for the history/literature sequence.',
  transcript: 'Add your transcript for an exact answer',
  privacy: PRIVACY,
  choose: 'Choose transcript PDF',
};

// The numbers in the summary strip, worked out from the rows so they can never disagree.
export const summary = courses => {
  const sum = list => list.reduce((n, c) => n + c.cr, 0);
  return [sum(courses), sum(courses.filter(c => c.counts)), sum(courses.filter(c => !c.counts))];
};

const c = (code, title = '', note = '') => ({ code, title, ...(note ? { note } : {}) });
const pick = text => ({ open: true, text });
const choice = text => ({ choice: true, text });

export const left = {
  eyebrow: 'What I have left',
  heading: 'Your degree, in focus.',
  pill: 'Synthetic transcript result',
  remaining: 81,
  remainingLabel: 'credits left',
  paceEyebrow: 'Looking ahead',
  pace: 'On pace for Spring 2029',
  paceDetail: 'about 16 credits a term',
  caveat: CAVEAT,
  counted: 27,
  inProgress: 13,
  inProgressTerm: 'Fall 2026',
  total: 121,
  controls: {
    eyebrow: 'Make the estimate yours',
    legend: 'Adjust your pace',
    target: { label: 'Target semester', options: ['Fall 2028', 'Spring 2029', 'Fall 2029', 'Spring 2030', 'Fall 2030'], value: 'Spring 2029' },
    // Two editable ends of the range. PathCheck sets no hard limit; the portal does.
    fewest: { label: 'Fewest credits per term', value: 12, note: 'Below 12 credits: below full-time; may affect scholarships.' },
    most: { label: 'Most credits per term', value: 18, note: 'Over 18 credits: may cost extra.' },
    summers: { label: 'Summers', value: 'Off' },
  },
  reqEyebrow: 'The rest of your degree',
  reqTitle: 'Requirements',
  reqTabs: ['All', 'Not done'],
  reqNote: 'Credits counted / needed.',
  show: 'Show courses',
  hide: 'Hide courses',
  blocks: [
    // The brief names no courses for the three Done requirements; these are the synthetic
    // student's, with titles from the curriculum file.
    { name: 'Orientation', counted: 1, needed: 1, status: 'Done', done: [c('ORI 100', 'Freshman Orientation')] },
    { name: 'Composition', counted: 6, needed: 6, status: 'Done', done: [c('ENG 131', 'English Composition I'), c('ENG 132', 'English Composition II')] },
    {
      name: 'Science & math', counted: 11, needed: 11, status: 'Done',
      done: [c('BIO 127', 'General Biology'), c('BIOL 127', 'General Biology Lab'), c('BIO 128', 'General Biology'), c('BIOL 128', 'General Biology Lab'), c('MAT 137', 'Pre-Calculus Algebra')],
    },
    {
      name: 'Social sciences', counted: 3, needed: 12, status: 'In progress',
      done: [c('HIS 131', 'World History')],
      progress: [c('ECO 251', 'Principles of Macroeconomics', 'Repeat; the earlier D doesn’t count.')],
      still: [c('ECO 252', 'Principles of Microeconomics'), pick('1 of HIS 132 / GEO 206 / ANT 113 / POS 207 / PSY 251 / SOC 110')],
    },
    {
      name: 'Humanities', counted: 0, needed: 12, status: 'In progress',
      progress: [c('HUM 103', 'Humanities Through the African-American Experience')],
      still: [c('ENG 209', 'Introduction to Literature'), pick('1 of ART 131 / THE 111 / MUS 121'), pick('1 of ENG 210 / HUM 101 / HUM 102 / CMS 200 / CMS 205 / PHL 201')],
    },
    {
      name: 'Pre-professional', counted: 3, needed: 19, status: 'In progress',
      done: [c('CIS 205', 'Introduction to CIS')],
      // The brief gives no titles for these three, and the design shows none.
      progress: [c('ACT 214'), c('MGT 202'), c('PED 114')],
      still: [c('ACT 215', 'Principles of Managerial Accounting'), c('MGT 252', 'Business Statistics II'), c('MGT 255', 'Business Law/Legal')],
    },
    {
      name: 'Business core', counted: 3, needed: 27, status: 'Still needed',
      done: [c('CIS 206', 'Business Programming Languages')],
      still: [
        c('MGT 201', 'Business Orientation'), c('MGT 204', 'Business Communications'), c('FIN 321', 'Essentials of Managerial Finance'),
        c('MGT 321', 'Principles of Management'), c('MKT 321', 'Elements of Marketing'), c('CIS 329', 'Business Process Integration using SAP'),
        c('MGT 422', 'Production Management'), c('MGT 462', 'Business Policies'),
      ],
    },
    {
      name: 'Major (CIS)', counted: 0, needed: 24, status: 'Still needed',
      still: [
        c('CIS 300', 'Programming in Python'), c('CIS 302', 'Internet Programming'), c('CIS 310', 'Networking Fundamentals'),
        c('CIS 341', 'Information Security'), c('CIS 351', 'Business Data Analytics'), c('CIS 404', 'Database Administration'),
        c('CIS 410', 'Systems Analysis'), c('CIS 461', 'Advanced Database Systems'),
      ],
    },
    {
      name: 'CIS electives', counted: 0, needed: 9, status: 'Still needed',
      still: [pick('3 courses: FIN 201, or any 300/400-level MGT, FIN, CIS, MKT, ACT or ECO course not already required')],
    },
  ],
  sequence: 'Still needed: HIS 132 or ENG 210 to complete a history or literature sequence.',
  planEyebrow: 'A starting point, not a schedule',
  planTitle: 'Draft plan',
  planLabel: 'Draft — Order not checked — your portal checks prerequisites',
  planNote: 'Pace settings estimate credits only. “Move later” changes this draft; prerequisites are not checked.',
  choiceLabel: 'Open choice',
  move: 'Move later',
  plan: [
    { term: 'Spring 2027', cr: 18, entries: [c('ENG 209', 'Introduction to Literature'), c('ECO 252', 'Principles of Microeconomics'), c('ACT 215', 'Principles of Managerial Accounting'), c('MGT 201', 'Business Orientation'), c('MGT 204', 'Business Communications'), choice('Humanities pick (ART 131, THE 111 or MUS 121)')] },
    { term: 'Fall 2027', cr: 18, entries: [c('MGT 252', 'Business Statistics II'), c('MGT 255', 'Business Law/Legal'), choice('Social sciences pick'), choice('Humanities pick (ENG 210 or another)'), c('CIS 300', 'Programming in Python'), c('CIS 302', 'Internet Programming')] },
    { term: 'Spring 2028', cr: 15, entries: [c('FIN 321', 'Essentials of Managerial Finance'), c('MGT 321', 'Principles of Management'), c('MKT 321', 'Elements of Marketing'), c('CIS 310', 'Networking Fundamentals'), c('CIS 341', 'Information Security')] },
    { term: 'Fall 2028', cr: 15, entries: [c('CIS 329', 'Business Process Integration using SAP'), c('CIS 351', 'Business Data Analytics'), c('CIS 404', 'Database Administration'), c('CIS 410', 'Systems Analysis'), choice('CIS elective')] },
    { term: 'Spring 2029', cr: 15, entries: [c('CIS 461', 'Advanced Database Systems'), c('MGT 422', 'Production Management'), choice('CIS elective'), choice('CIS elective'), c('MGT 462', 'Business Policies', 'Always the final semester')] },
  ],
  print: 'Print / save PDF for your advisor',
  clear: 'Clear my data',
};
