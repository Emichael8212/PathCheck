# M0 design brief (owner, 2026-11-15)

> **Superseded in part.** Later on 2026-11-15 the owner designed PathCheck themselves; that
> design is the chosen direction (`docs/decision-log.md`, "The owner's own design replaces
> the three directions"; `docs/design/`). The instructions below to produce three
> directions and to apply Apple's guidance and Liquid Glass no longer apply. What still
> applies is the fixed content and wording under "The 3 pages" and the "Requirements" list.
> One slip in that content: it says "15 count toward CIS". The owner confirmed on
> 2026-11-15 that 12 is correct and the 15 was a mistake. Later answers of the same day also
> replace the privacy sentence and the single "credits per term" control (see the log).

The owner rejected the first three mockups and gave this brief for the next round. It is
copied as written. Where it differs from `docs/BRIEF.md`, this brief wins (see
`docs/decision-log.md`). The owner added these instructions with it:

- "Read Apple official documentation and apply their UI flow including liquid glass."
- "Produce 3 distinct design directions for the same 3 pages, each with its own rationale."
- Do not merge or move ahead with the design until the owner approves.

---

## Design brief: PathCheck — 3-page mockup

You are designing the first mockup of PathCheck. All visual and layout decisions are yours: structure, hierarchy, composition, typography, color, imagery or none, interaction patterns. Base every decision on the problem, the audience and how they use it (below). Do not default to a generic web-app or SaaS template look; the result should feel designed for this specific problem and these students.

### The problem

Students in the B.S. Computer Information Systems (CIS) program at Alabama State University (Montgomery, Alabama — not Arizona State) can't find out, before they register, whether a course counts toward their degree:

- the student portal has no degree audit; the university's only audit happens after a student applies to graduate;
- the public catalog is out of date;
- the department provides no checklist;
- advice can be wrong (a CIS student was placed in a biology course that didn't count).

Result: students pay for courses that don't count, and some have graduated a year late.

Promise: "Check whether your courses count toward your CIS degree before you pay for them, and see what's left so you graduate on time."

Priorities, in order: (1) "Does it count?" — must never imply a course counts when it may not; (2) what's left and whether the student is on pace; (3) a draft semester plan.

### Audience and context of use

- CIS undergraduates, often first- or second-year, often on a phone during registration week, sometimes anxious about money (scholarships require 12+ credits; over 18 may cost extra) and about graduating late.
- Advisors sometimes use it sitting next to a student, on a desktop, and may print the result.
- Visits are short and rare (2–3 times a year). Nobody reads instructions. No account, no sign-in.
- Trust matters: it's an independent tool, so it must be honest about what it knows and doesn't.

### What PathCheck is NOT

Not the school portal: no registration, prerequisites, class times, GPA, accounts, chatbot or advisor tools. It never says "ask your advisor". Not affiliated with the university: show "Not affiliated with Alabama State University"; no university logo, no school colors (black and gold).

### The 3 pages and what each must communicate

(Content and wording are fixed; how you present them is up to you.)

**Page 1 — Start**

- What PathCheck does, in one idea.
- Two ways in, with nothing to fill in first:
  - "Check my courses" — for registration: is each of next semester's courses going to count? (~30 seconds, no transcript needed)
  - "See what I have left" — upload the unofficial transcript PDF from the portal; get what's left, pace, and a draft plan.
- "Not an official degree audit." · "Curriculum last reviewed: Nov 2026" · "Report a mistake" · "Not affiliated with Alabama State University"
- The transcript PDF is read and discarded; nothing is stored.

**Page 2 — "Check my courses" result (Spring 2027, no transcript added)**

The student can add a course by code or title (show a suggestion state: typing "mgt 3" suggests "MGT 321 Principles of Management"), remove a course, and optionally "Add your transcript for an exact answer".

Each course shows code, title (when known), credits and exactly one answer:

- ACT 215 Principles of Managerial Accounting, 3 cr → "Counts toward CIS — Pre-professional" + "unless you've already passed it or filled this slot"
- MGT 321 Principles of Management, 3 cr → "Counts toward CIS — Business core" + same condition
- MKT 410 (no title), 3 cr → "Counts toward CIS: elective (300/400-level MKT)" + same condition
- BIO 230 (no title), 3 cr → "Doesn't count toward CIS — not in the CIS curriculum"
- ENG 131 English Composition I, 3 cr → "Counts toward CIS — Composition" + same condition
- ENG 140 English Composition Honors I, 3 cr → "Doesn't count — it fills the same requirement as ENG 131."

Also: total "18 credits", "15 count toward CIS"; "Remember: you need HIS 132 or ENG 210 for the history/literature sequence."; credit notes: under 12 → "Below 12 credits: below full-time; may affect scholarships."; over 18 → "Over 18 credits: may cost extra."

"Doesn't count" is the most important answer on the page: it must be unmistakable without being alarming.

**Page 3 — "See what I have left" result (after transcript upload)**

Synthetic student. Headline facts: 81 credits left; on pace for Spring 2029 (about 16 credits a term); 27 counted, 13 in progress (Fall 2026), 121 total; "Credits only — course order may add semesters." Adjustable: target semester (Spring 2029), credits per term (12–18), summers (off).

Requirement blocks (credits counted / needed, status):

- Orientation 1/1 — Done
- Composition 6/6 — Done
- Science & math 11/11 — Done
- Social sciences 3/12 — In progress. Done: HIS 131 World History. In progress: ECO 251 Principles of Macroeconomics (repeat; the earlier D doesn't count). Still needed: ECO 252 Principles of Microeconomics; 1 of HIS 132 / GEO 206 / ANT 113 / POS 207 / PSY 251 / SOC 110.
- Humanities 0/12 — In progress. In progress: HUM 103 Humanities Through the African-American Experience. Still needed: ENG 209 Introduction to Literature; 1 of ART 131 / THE 111 / MUS 121; 1 of ENG 210 / HUM 101 / HUM 102 / CMS 200 / CMS 205 / PHL 201.
- Pre-professional 3/19 — In progress. Done: CIS 205 Introduction to CIS. In progress: ACT 214, MGT 202, PED 114. Still needed: ACT 215, MGT 252, MGT 255.
- Business core 3/27 — Still needed. Done: CIS 206 Business Programming Languages. Still needed: MGT 201, MGT 204, FIN 321, MGT 321, MKT 321, CIS 329, MGT 422, MGT 462.
- Major (CIS) 0/24 — Still needed: CIS 300, CIS 302, CIS 310, CIS 341, CIS 351, CIS 404, CIS 410, CIS 461.
- CIS electives 0/9 — Still needed: 3 courses: FIN 201, or any 300/400-level MGT, FIN, CIS, MKT, ACT or ECO course not already required.
- "Still needed: HIS 132 or ENG 210 to complete a history or literature sequence."

Draft plan, labelled "Draft — Order not checked — your portal checks prerequisites"; every course can be moved later ("Move later"); "pick" and "elective" entries are open choices, not real courses:

- Spring 2027 (18 cr): ENG 209, ECO 252, ACT 215, MGT 201, MGT 204, Humanities pick (ART 131, THE 111 or MUS 121)
- Fall 2027 (18 cr): MGT 252, MGT 255, Social sciences pick, Humanities pick (ENG 210 or another), CIS 300, CIS 302
- Spring 2028 (15 cr): FIN 321, MGT 321, MKT 321, CIS 310, CIS 341
- Fall 2028 (15 cr): CIS 329, CIS 351, CIS 404, CIS 410, CIS elective
- Spring 2029 (15 cr): CIS 461, MGT 422, CIS elective, CIS elective, MGT 462 Business Policies (always the final semester)

Actions: "Print / save PDF for your advisor", "Clear my data".

Course titles for codes above: ENG 209 Introduction to Literature; ECO 252 Principles of Microeconomics; MGT 201 Business Orientation; MGT 204 Business Communications; MGT 252 Business Statistics II; MGT 255 Business Law/Legal; CIS 300 Programming in Python; CIS 302 Internet Programming; FIN 321 Essentials of Managerial Finance; MKT 321 Elements of Marketing; CIS 310 Networking Fundamentals; CIS 341 Information Security; CIS 329 Business Process Integration using SAP; CIS 351 Business Data Analytics; CIS 404 Database Administration; CIS 410 Systems Analysis; CIS 461 Advanced Database Systems; MGT 422 Production Management; MGT 462 Business Policies.

All student data is synthetic. Course codes, titles and credits are real curriculum data: spell them exactly.

### Requirements (not style choices)

- Each page at desktop (1440) and phone (375) width, in light and dark mode.
- WCAG AA contrast; status never shown by color alone (each status — Done, In progress, Still needed, Counts, Doesn't count — also has a word and a distinct non-color cue).
- Course codes never break across lines; "0" and "O", "1" and "l" are clearly distinct.
- Touch targets at least 44px; real, labelled controls.
- All colors defined as named variables with light and dark values.
- No invented courses, numbers, testimonials, statistics or claims.

### Deliverables

- The 3 pages × desktop/phone × light/dark.
- A short rationale (half a page): the design direction you chose and why, tied to the problem, the students and how they use it; how page 2 makes "Doesn't count" impossible to miss; how page 3 makes "what's left" obvious at a glance on a phone.
- Any question about content you couldn't resolve, listed instead of guessed.

Also I should think about animated slide or video under the get started page that shows how PathCheck works
