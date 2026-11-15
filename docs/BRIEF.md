# PathCheck — Project Brief (v2, 2026-11-15)

Every decision below was made by the owner in an interview. The agent builds exactly this.
Anything not covered here: choose the simplest option, record it in `docs/decision-log.md`,
and never invent academic rules.

---

## 1. Problem

Alabama State University (ASU) CIS students can't find out, before they register, whether a
course counts toward their degree:

- the student portal has no degree audit (ASU's only audit happens after a student applies to graduate);
- the public catalog is out of date;
- the department provides no checklist;
- advice can be wrong (example: a CIS student was placed in a biology course that didn't count).

Students pay for courses that don't count, and some have graduated a year late because of it.

**Promise:** "Check whether your courses count toward your CIS degree before you pay for them,
and see what's left so you graduate on time."

**Priorities:**
1. "Does it count?" must never say a course counts when it may not.
2. What's left and whether the student is on pace.
3. The draft plan (helpful, secondary).

Anything that serves none of these is not built.

## 2. Principle: not the portal's job

PathCheck answers only what the portal can't: does it count, what's left, and credit pace.
Anything the portal already shows comes from the student (transcript upload, or a yes/no
question), or the student is told to check it there:

- transcript and grades
- prerequisites
- term offerings
- registration

PathCheck never sources, stores or invents any of these. It never tells the student to "ask
your advisor".

## 3. Users

- **ASU B.S. Computer Information Systems students.** Advisors use the same two flows with a student. There are no advisor screens or logins.
- **CIS only at launch.** Store the curriculum as data so other College of Business majors can be added later. Do not build multi-major UI now.
- **Independent of the university.** Name "PathCheck". Show "Not affiliated with Alabama State University". No ASU logo or school colors.

## 4. How it works

**Start screen:** two big choices and nothing to fill in first.

### Flow A: "Check my courses" (registration time, about 30 seconds)

1. **Enter courses.** The student types or searches next semester's courses by code or title. Autocomplete comes from the curriculum, and the course title is shown next to every answer so typos are obvious.
2. **Optional transcript.** "Add your transcript for an exact answer" uploads the unofficial transcript PDF.
3. **One answer per course:**
   - "Counts toward CIS: <requirement block>"
   - "Doesn't count toward CIS — not in the CIS curriculum": anything not in a curriculum list and not matching the elective rule
   - With a transcript only: "You already passed this" or "This slot is already filled"
   - Without a transcript: "Counts toward CIS — unless you've already passed it or filled this slot"
4. **Credit total.** Neutral notes appear under 12 ("below full-time; may affect scholarships") and over 18 ("may cost extra").
5. **Pace, with a transcript only.** Ask the target semester and add one line, e.g. "6 credits this term — at this pace you finish Fall 2029, one semester after your target."

### Flow B: "See what I have left" (once a semester, about 3 minutes)

1. **Upload.** The unofficial transcript PDF from the portal is the only input; there is no typed course list.
2. **Review step.** Show what was read. The student can fix a misread row.
   - **In progress** (no grade yet): assume they will pass. Show "In progress", don't mark the requirement Done, and don't schedule the course again.
   - **Below C, W and I:** don't count.
   - **Transfer, AP and CLEP:** count if shown under an ASU course code. Apply no grade check if no grade is shown.
3. **Degree checklist.** Each requirement block is marked Done, In progress or Still needed.
4. **Pace.** Ask the target semester, credit range (default 12–18, editable) and summers (off by default). Then say whether the student is on pace: "Credits only — course order may add semesters."
5. **Draft plan.** One plan of the remaining courses by semester:
   - Ordered by course level 100 → 400, with MGT 462 Business Policies in the final semester.
   - Each semester within the credit range.
   - Labelled "Order not checked — your portal checks prerequisites".
   - Each course has a **Move later** button (used when the portal blocks it), and the plan re-flows.
   - It is a draft only; nothing is "adopted".
6. **Print / PDF** a summary for an advisor.

**If upload is unavailable** (outage or limits reached), show "Upload isn't available right now — try again tomorrow". Flow A still works.

### On every result

- "Curriculum last reviewed: <date>"
- "Not an official degree audit"
- "Report a mistake": an email link to the owner's contact address, pre-filled with the course or result
- A banner if the curriculum hasn't been reviewed in 12 months

### Remembering

- The last result is kept only in the student's browser (localStorage), with a visible "Clear my data" button.
- No accounts, no sign-in, and no student data on any server.

## 5. Academic rules (owner-approved)

**Curriculum: one only.** B.S. CIS, 121 credits, from the department's two-page guide (2019–2021
label) with the owner's updates. Carry over the reviewed curriculum data file, cleaned as follows:

- Delete CIS 304, CIS 415, and all "replacement", "older code" and "not offered" entries. They were a mistake and never used.
- No catalog-year or start-year question.

| Block | Credits | Required | Choose |
|---|---|---|---|
| Orientation | 1 | ORI 100 | — |
| Composition | 6 | — | 1 of ENG 131 / ENG 140; 1 of ENG 132 / ENG 141 |
| Humanities | 12 | HUM 103, ENG 209 | 1 of ART 131 / THE 111 / MUS 121; 1 of ENG 210 / HUM 101 / HUM 102 / CMS 200 / CMS 205 / PHL 201 |
| Social sciences | 12 | HIS 131, ECO 251, ECO 252 | 1 of HIS 132 / GEO 206 / ANT 113 / POS 207 / PSY 251 / SOC 110 |
| Science & math | 11 | BIO 127, BIOL 127 (lab), BIO 128, BIOL 128 (lab), MAT 137 | — |
| Pre-professional | 19 | CIS 205, ACT 214, ACT 215, MGT 202, MGT 252, MGT 255 | 1 of PED 114 / PED 122 |
| Business core | 27 | MGT 201, CIS 206, MGT 204, FIN 321, MGT 321, MKT 321, CIS 329, MGT 422, MGT 462 | — |
| Major (CIS) | 24 | CIS 300, CIS 302, CIS 310, CIS 341, CIS 351, CIS 404, CIS 410, CIS 461 | — |
| CIS electives | 9 (3 courses) | — | see the elective rules below |

**Sequence rule (from the guide):** complete one two-course sequence: HIS 131 + HIS 132, or
ENG 209 + ENG 210. It adds no credits. *(Owner to confirm this reading at M0.)*

**Rules:**

- **Grades.** A grade below C never counts; flag "must be repeated". W and I don't count.
- **Repeats.** The highest grade counts.
- **No double counting.** Each course fills exactly one requirement. Place it where it helps most.
- **Electives (3 courses, 9 credits):**
  - FIN 201
  - any 300/400-level MGT, FIN, CIS, MKT, ACT or ECO course not already required
- **Legacy electives.** PSY 251, FLS 161, MGT 220 and MGT 203 count as electives only for legacy students.
  - Ask "Are you a legacy CIS student?" (Yes / No) only when one of these four courses appears. Remember the answer in the browser; the student can change it.
- **Transfer, AP and CLEP** count when shown under an ASU course code.
- **Not checked at all:** GPA, residency, and the suspended exams (Nelson-Denny reading test, English proficiency exam, senior comprehensive exam, writing competency test). Do not show them.
- **Every rule has an automated test.**

## 6. Not built (do not add)

- accounts, sign-in or saved plans on a server
- any database of students
- prerequisite or corequisite checking
- course offerings or availability
- recommendation cards
- a chatbot
- a drag-and-drop timeline, preview/apply/undo, or plan adoption
- a catalog-year picker
- advisor substitutions
- typed transcript entry
- GPA calculator
- what-if for other majors
- advisor-only features

## 7. Transcript reading, privacy and cost

- **The only server piece.** One function that sends the PDF to paid Google Gemini and returns the course rows.
  - The Gemini key stays server-side.
  - The PDF is never stored, and no transcript contents appear in logs.
  - The function's output is untrusted: plain code validates it and matches it to the curriculum before anything counts.
- **Limits:**
  - $5 per month total, a hard cap
  - 3 uploads per browser per day, counted anonymously
  - Cloudflare Turnstile bot check on upload
- **Consent.** Before the first upload, one plain sentence says what is sent and that it isn't kept.
- **Hosting.** Netlify free plan: a static site plus Netlify Functions, and Netlify Blobs for the anonymous counters if the free plan covers it. If it doesn't, use the simplest free alternative and record why. No Supabase unless needed.
- **Tests and real data.** Tests use synthetic transcripts only. The owner tests with their real transcript at M2.

## 8. Design

- **Concept.** The page is the student's CIS degree checklist (Done / In progress / Still needed), without copying any vendor's look.
- **One question and one big answer per screen.** Everything else stays hidden until asked for.
- **Banned:**
  - pill tab steppers
  - frosted glass
  - a card around everything
  - icon-in-circle feature lists
  - uppercase grey table headers
  - a default blue primary button
  - toasts
  - legends
  - multiple side panels
- **Basics:**
  - All colors are CSS tokens, with light and dark mode.
  - WCAG AA contrast.
  - Works at 375px wide with nothing hidden or overlapping.
- **M0 mockups.** Make 3 visually distinct static mockups of Flow A's result and Flow B's checklist + plan, using synthetic data. The owner picks one, and the app is built to match it.
- **Evaluator calibration:**
  - "Looks like a generic SaaS/AI template" means Visual 3 (FAIL).
  - "Says a course counts when it may not" means Truthfulness FAIL.

## 9. Definition of done

**Product**
- Both flows work exactly as in section 4 on phone and desktop.
- A first-time student checks a course within 10 seconds of opening the site, with no instructions.

**Correct**
- "Counts" is never shown when it may not be true. Tests cover:
  - already passed
  - slot filled
  - not in the curriculum
  - below C, W, I
  - in progress
  - repeats (highest grade)
  - legacy Yes/No
  - transfer/AP
  - no double counting
- Every curriculum rule is tested.
- The transcript reader passes on synthetic transcripts, then on the owner's real one.

**Safe**
- The PDF is never stored, and no transcript contents appear in logs.
- The key is server-side.
- Limits are enforced.
- No personal data is stored anywhere.

**Live**
- A public `*.netlify.app` address on free plans.
- No console errors in either flow.
- `docs/CURRICULUM-HANDOVER.md` explains how to review and update the curriculum each year.

## 10. Milestones (the agent stops at each and asks the owner)

| | Delivered | Owner checks |
|---|---|---|
| M0 | 3 design mockups | Picks one; confirms the sequence rule |
| M1 | Flow A + Flow B with synthetic transcripts, on localhost | Both flows on phone and desktop |
| M2 | Real upload on a staging address | Uploads their own transcript |
| M3 | Public site | Final check, then launch |

There is no deadline. Quality over speed.

## 11. How the agent works

- **Workflow.** One feature per branch and PR. Each feature has a short sprint contract, agreed with the evaluator subagent before coding.
- **Checks.** Tests, a browser check by the evaluator, and code review by the reviewer subagent.
- **Merging.** The agent merges its own PR when CI is green and the reviewer finds no blocker. It stops only at milestones, and for logins, secrets, money or an academic-rule question.
- **PR format.**
  - Title of 60 characters or fewer: `<type>(<ID>): <what changed>`.
  - Body in plain language: What changed, Why, How to check it yourself, Tests and evidence, Risks.
- **Hard limits:**
  - never force-push or push to main
  - never bypass CI
  - never read or commit secrets
  - never enable paid plans
  - never commit real student data
- **Simplicity.** Prefer deleting over accommodating. If something isn't needed for sections 4 and 5, it isn't built.

## 12. What the owner provides

| When | What |
|---|---|
| Before M1 | New public GitHub repo, with branch protection on `main` (require CI, no force-push) |
| Before M2 | Netlify login; Gemini API key set as a Netlify secret; a Cloudflare Turnstile site key and secret; a Google Cloud budget alert |
| Before M3 | The contact email for "Report a mistake"; the date of the last curriculum review |
