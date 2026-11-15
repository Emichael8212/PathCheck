// Synthetic student used by all three mockups. Nobody real: every course, grade and
// date here is made up to show each kind of answer once (docs/sprints/F01.md).

const course = (code, title, credits = 3) => ({ code, title, credits });

export const check = {
  question: 'Do these 5 courses count?',
  // The big answer, in two parts so a design can mark each part its own way.
  answerCounts: '3 count, unless you’ve already passed them or filled their slots.',
  answerDoesnt: '2 don’t.',
  courses: [
    { ...course('CIS 310', 'Networking Fundamentals'), counts: true, text: 'Counts toward CIS: Major (CIS) — unless you’ve already passed it or filled this slot' },
    { ...course('MKT 410', ''), counts: true, text: 'Counts toward CIS: elective (300/400-level MKT) — unless you’ve already passed it or filled this slot' },
    { ...course('ENG 131', 'English Composition I'), counts: true, text: 'Counts toward CIS: Composition — unless you’ve already passed it or filled this slot' },
    { ...course('ENG 140', 'English Composition Honors I'), counts: false, text: 'Doesn’t count — it fills the same requirement as ENG 131.' },
    { ...course('BIO 220', '', 0), counts: false, text: 'Doesn’t count toward CIS — not in the CIS curriculum' },
  ],
  reminder: 'Remember: you need HIS 132 or ENG 210 for the history/literature sequence.',
  total: '12 credits',
  totalNote: 'BIO 220 isn’t included — it isn’t in the CIS curriculum, so PathCheck doesn’t know its credits.',
  transcript: 'Add your transcript for an exact answer',
};

const done = (code, title, credits) => ({ ...course(code, title, credits), state: 'done' });
const progress = (code, title, credits) => ({ ...course(code, title, credits), state: 'progress', note: 'In progress' });
const needed = (code, title, credits) => ({ ...course(code, title, credits), state: 'needed' });

export const left = {
  question: 'What do I have left?',
  answerLeft: '45 credits left.',
  answerPace: 'On pace for Spring 2028.',
  pace: {
    answer: 'On pace for Spring 2028',
    inputs: ['Target: Spring 2028', '12–18 credits a semester', 'Summers off'],
    caveat: 'Credits only — course order may add semesters.',
  },
  blocks: [
    { name: 'Orientation', credits: 1, status: 'Done', courses: [done('ORI 100', 'Freshman Orientation', 1)] },
    { name: 'Composition', credits: 6, status: 'Done', courses: [done('ENG 131', 'English Composition I'), done('ENG 132', 'English Composition II')] },
    {
      name: 'Humanities', credits: 12, status: 'In progress',
      courses: [
        done('HUM 103', 'Humanities Through the African-American Experience'), done('ENG 209', 'Introduction to Literature'),
        done('ART 131', 'Art Appreciation'), progress('ENG 210', 'Introduction to Literature II'),
      ],
    },
    {
      name: 'Social sciences', credits: 12, status: 'Done',
      courses: [done('HIS 131', 'World History'), done('ECO 251', 'Principles of Macroeconomics'), done('ECO 252', 'Principles of Microeconomics'), done('PSY 251', 'General Psychology')],
    },
    {
      name: 'Science & math', credits: 11, status: 'Still needed',
      courses: [
        done('BIO 127', 'General Biology'), done('BIOL 127', 'General Biology Lab', 1), done('BIOL 128', 'General Biology Lab', 1), done('MAT 137', 'Pre-Calculus Algebra'),
        { ...needed('BIO 128', 'General Biology'), note: 'Grade D — must be repeated' },
      ],
    },
    {
      name: 'Pre-professional', credits: 19, status: 'Still needed',
      courses: [
        done('CIS 205', 'Introduction to CIS'), done('ACT 214', 'Principles of Financial Accounting'), done('ACT 215', 'Principles of Managerial Accounting'),
        done('MGT 202', 'Business Statistics I'), done('PED 114', 'Golf', 1),
        progress('MGT 252', 'Business Statistics II'), needed('MGT 255', 'Business Law/Legal'),
      ],
    },
    {
      name: 'Business core', credits: 27, status: 'Still needed',
      courses: [
        done('MGT 201', 'Business Orientation'), done('CIS 206', 'Business Programming Languages'), done('MGT 204', 'Business Communications'),
        progress('MGT 321', 'Principles of Management'),
        needed('FIN 321', 'Essentials of Managerial Finance'), needed('MKT 321', 'Elements of Marketing'), needed('CIS 329', 'Business Process Integration using SAP'),
        needed('MGT 422', 'Production Management'), needed('MGT 462', 'Business Policies'),
      ],
    },
    {
      name: 'Major (CIS)', credits: 24, status: 'Still needed',
      courses: [
        done('CIS 300', 'Programming in Python'), done('CIS 302', 'Internet Programming'), progress('CIS 310', 'Networking Fundamentals'),
        needed('CIS 341', 'Information Security'), needed('CIS 351', 'Business Data Analytics'), needed('CIS 404', 'Database Administration'),
        needed('CIS 410', 'Systems Analysis'), needed('CIS 461', 'Advanced Database Systems'),
      ],
    },
    {
      name: 'CIS electives', credits: 9, status: 'Still needed',
      courses: [needed('CIS elective', 'your choice'), needed('CIS elective', 'your choice'), needed('CIS elective', 'your choice')],
      hint: 'Pick 3: FIN 201, or any 300/400-level MGT, FIN, CIS, MKT, ACT or ECO course you don’t already need.',
    },
  ],
  planLabel: 'Order not checked — your portal checks prerequisites',
  plan: [
    { term: 'Spring 2027', courses: [course('BIO 128', 'General Biology'), course('MGT 255', 'Business Law/Legal'), course('CIS 329', 'Business Process Integration using SAP'), course('CIS 341', 'Information Security'), course('CIS 351', 'Business Data Analytics')] },
    { term: 'Fall 2027', courses: [course('FIN 321', 'Essentials of Managerial Finance'), course('MKT 321', 'Elements of Marketing'), course('CIS elective', 'your choice'), course('CIS elective', 'your choice'), course('CIS elective', 'your choice')] },
    { term: 'Spring 2028', courses: [course('CIS 404', 'Database Administration'), course('CIS 410', 'Systems Analysis'), course('CIS 461', 'Advanced Database Systems'), course('MGT 422', 'Production Management'), course('MGT 462', 'Business Policies')] },
  ],
};

export const page = {
  name: 'PathCheck',
  notAffiliated: 'Not affiliated with Alabama State University',
  reviewed: 'Curriculum last reviewed: 12 August 2026',
  notOfficial: 'Not an official degree audit',
  mockupNote: 'Mockup. The student and the review date are made up, and the buttons don’t work yet.',
};
