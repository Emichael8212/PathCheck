// Content for the M0 mockups, taken from docs/M0-DESIGN-BRIEF.md "The 3 pages".
// The student is synthetic. Course codes, titles and credits are real curriculum data.

export const facts = {
  name: 'PathCheck',
  notOfficial: 'Not an official degree audit.',
  reviewed: 'Curriculum last reviewed: Nov 2026',
  report: 'Report a mistake',
  notAffiliated: 'Not affiliated with Alabama State University',
};

export const start = {
  promise: 'Check whether your courses count toward your CIS degree before you pay for them, and see what’s left so you graduate on time.',
  ways: [
    {
      name: 'Check my courses',
      href: 'check.html',
      desc: 'For registration: is each of next semester’s courses going to count?',
      note: '~30 seconds, no transcript needed',
    },
    {
      name: 'See what I have left',
      href: 'left.html',
      desc: 'Upload the unofficial transcript PDF from the portal; get what’s left, pace, and a draft plan.',
      note: 'The transcript PDF is read and discarded; nothing is stored.',
    },
  ],
  demoTitle: 'How it works',
  demo: [
    { caption: 'Type next semester’s courses.', kind: 'type' },
    { caption: 'See which ones count toward CIS, and which don’t.', kind: 'answers' },
    { caption: 'Add your transcript to see what’s left.', kind: 'left' },
  ],
};

const CONDITION = 'unless you’ve already passed it or filled this slot';

export const check = {
  term: 'Spring 2027',
  heading: 'Check my courses',
  typed: 'mgt 3',
  suggestion: { code: 'MGT 321', title: 'Principles of Management' },
  courses: [
    { code: 'ACT 215', title: 'Principles of Managerial Accounting', cr: 3, counts: true, answer: 'Counts toward CIS — Pre-professional', condition: CONDITION },
    { code: 'MGT 321', title: 'Principles of Management', cr: 3, counts: true, answer: 'Counts toward CIS — Business core', condition: CONDITION },
    { code: 'MKT 410', title: '', cr: 3, counts: true, answer: 'Counts toward CIS: elective (300/400-level MKT)', condition: CONDITION },
    { code: 'BIO 230', title: '', cr: 3, counts: false, answer: 'Doesn’t count toward CIS — not in the CIS curriculum' },
    { code: 'ENG 131', title: 'English Composition I', cr: 3, counts: true, answer: 'Counts toward CIS — Composition', condition: CONDITION },
    { code: 'ENG 140', title: 'English Composition Honors I', cr: 3, counts: false, answer: 'Doesn’t count — it fills the same requirement as ENG 131.' },
  ],
  total: '18 credits',
  // The brief says 15; four courses at 3 credits count, which is 12. Question for the owner.
  countLine: '12 count toward CIS',
  countCondition: 'unless you’ve already passed them or filled their slots',
  reminder: 'Remember: you need HIS 132 or ENG 210 for the history/literature sequence.',
  notes: ['Below 12 credits: below full-time; may affect scholarships.', 'Over 18 credits: may cost extra.'],
  transcript: 'Add your transcript for an exact answer',
};

const c = (code, title, note) => ({ code, title, ...(note ? { note } : {}) });
const pick = text => ({ open: true, text });

export const left = {
  heading: 'See what I have left',
  creditsLeft: '81 credits left',
  pace: 'On pace for Spring 2029',
  paceDetail: 'about 16 credits a term',
  counted: 27,
  inProgress: 13,
  remaining: 81,
  total: 121,
  inProgressTerm: 'Fall 2026',
  caveat: 'Credits only — course order may add semesters.',
  blocks: [
    { name: 'Orientation', counted: 1, needed: 1, status: 'Done' },
    { name: 'Composition', counted: 6, needed: 6, status: 'Done' },
    { name: 'Science & math', counted: 11, needed: 11, status: 'Done' },
    {
      name: 'Social sciences', counted: 3, needed: 12, status: 'In progress',
      done: [c('HIS 131', 'World History')],
      progress: [c('ECO 251', 'Principles of Macroeconomics', 'repeat; the earlier D doesn’t count')],
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
      progress: [c('ACT 214', 'Principles of Financial Accounting'), c('MGT 202', 'Business Statistics I'), c('PED 114', 'Golf')],
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
      still: [pick('3 courses: FIN 201, or any 300/400-level MGT, FIN, CIS, MKT, ACT or ECO course not already required.')],
    },
  ],
  sequence: 'Still needed: HIS 132 or ENG 210 to complete a history or literature sequence.',
  planLabel: 'Draft — Order not checked — your portal checks prerequisites',
  plan: [
    { term: 'Spring 2027', cr: 18, entries: [c('ENG 209', 'Introduction to Literature'), c('ECO 252', 'Principles of Microeconomics'), c('ACT 215', 'Principles of Managerial Accounting'), c('MGT 201', 'Business Orientation'), c('MGT 204', 'Business Communications'), { open: true, name: 'Humanities pick', text: 'ART 131, THE 111 or MUS 121' }] },
    { term: 'Fall 2027', cr: 18, entries: [c('MGT 252', 'Business Statistics II'), c('MGT 255', 'Business Law/Legal'), { open: true, name: 'Social sciences pick', text: '' }, { open: true, name: 'Humanities pick', text: 'ENG 210 or another' }, c('CIS 300', 'Programming in Python'), c('CIS 302', 'Internet Programming')] },
    { term: 'Spring 2028', cr: 15, entries: [c('FIN 321', 'Essentials of Managerial Finance'), c('MGT 321', 'Principles of Management'), c('MKT 321', 'Elements of Marketing'), c('CIS 310', 'Networking Fundamentals'), c('CIS 341', 'Information Security')] },
    { term: 'Fall 2028', cr: 15, entries: [c('CIS 329', 'Business Process Integration using SAP'), c('CIS 351', 'Business Data Analytics'), c('CIS 404', 'Database Administration'), c('CIS 410', 'Systems Analysis'), { open: true, name: 'CIS elective', text: '' }] },
    { term: 'Spring 2029', cr: 15, entries: [c('CIS 461', 'Advanced Database Systems'), c('MGT 422', 'Production Management'), { open: true, name: 'CIS elective', text: '' }, { open: true, name: 'CIS elective', text: '' }, c('MGT 462', 'Business Policies', 'always the final semester')] },
  ],
  print: 'Print / save PDF for your advisor',
  clear: 'Clear my data',
};
