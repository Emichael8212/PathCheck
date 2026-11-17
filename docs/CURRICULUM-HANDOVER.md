# Keeping PathCheck's curriculum true

This guide is for the person responsible for PathCheck. You do not need to be a developer
or to install anything: a GitHub login that can change this repository and a web browser
are enough. It covers the one job PathCheck needs every year: checking its curriculum
against the department's and setting the date the pages show.

## The yearly routine

Do this once a year, and whenever the department changes the B.S. CIS curriculum.

1. **Compare.** Put the department's current curriculum guide for the B.S. CIS next to the
   table in section 5 of `docs/BRIEF.md`. Go through it block by block, then read the
   rules under the table. ([Step 1](#step-1-compare))
2. **Nothing changed?** Set the review date. It is written in two places.
   ([Step 2A](#step-2a-nothing-changed-set-the-review-date))
3. **Something changed?** Write the change down, then change the curriculum in its two
   places, and set the review date. ([Step 2B](#step-2b-something-changed))
4. **Wait for the green check** on your pull request, then merge it. If the check is red,
   the section [Is this mine to fix?](#is-this-mine-to-fix) tells you what to do. Never
   merge while it is red.
5. **Publish and look.** ([Step 3](#step-3-publish-and-look))

Why the date matters: every page says "Curriculum last reviewed:" with the month and year
of the review. Twelve months after that date, every page also shows a sentence saying
that the review is more than 12 months old and that requirements may have changed. It
stays until the date is set again. For example, a review dated 2026-11-15 shows the
sentence from 2027-11-16.

## Before you start

**Who decides.** What the curriculum requires is decided by the university. The person
responsible for PathCheck confirms what PathCheck should say. Nobody guesses a rule: if
the department's guide is unclear about a requirement, PathCheck keeps what it has until
the requirement is clear in writing.

**What PathCheck promises.** It must never say a course counts when it may not. So when
you are not sure a change is right, do not make it.

**Words used here.**

- A *repository* is the project's folder on GitHub, with every file and its history.
- A *branch* is a private copy of the files where you make your change.
- A *pull request* is the page that proposes your branch's change. Nothing changes for
  students until a pull request is merged and the result is published.
- The *check* is an automatic run of all of PathCheck's tests on your pull request. Green
  means every test passed. Red means something is wrong, and the change must not be
  merged.
- *Merge* means accepting the pull request into the main copy of the files.

## Step 1: Compare

1. Get the department's current curriculum guide for the B.S. Computer Information
   Systems. Note its date or the years printed on it.
2. Open `docs/BRIEF.md` on GitHub and find section 5, "Academic rules". Its table starts
   with this line:

   In `docs/BRIEF.md`:
   ```
   | Block | Credits | Required | Choose |
   ```
3. For each block, compare the credits, the required courses, and the courses of each
   "1 of …" choice.
4. Read the rules under the table (grades, repeats, electives, legacy electives, transfer
   credit) and compare them with the department's guide.
5. Note every difference. If there is none, go to Step 2A. Otherwise go to Step 2B.

## Step 2A: Nothing changed. Set the review date

The date is written as year, month, day, for example `2027-11-10`. Use the day you
finished comparing.

### The first place: the curriculum file

1. On GitHub, open `docs/curriculum/provisional-current.json`.
2. Click the pencil button at the top right of the file (it is named "Edit file").
3. Find the line that starts like this and change only the date between the quotation
   marks. Keep the quotation marks and the comma at the end.

   In `docs/curriculum/provisional-current.json`:
   ```
   "lastReviewed":
   ```
4. Say what you compared. Find the list that starts like this:

   In `docs/curriculum/provisional-current.json`:
   ```
   "sources": [
   ```
   Go to its last entry, which ends with `}` just before the list's closing `]`. Type a
   comma after that `}` and add a new entry under it. Write it like this, with your own
   year, date and words:

   ```json
       {
         "id": "review-2027",
         "description": "Yearly review on 2027-11-10 against the department's B.S. CIS curriculum guide dated 2027: no change."
       }
   ```
   The last entry of a list has no comma after it; every entry before it has one.
5. Click **Commit changes...**. In the box that opens, choose the option that creates a
   **new branch** and starts a pull request. Do not commit directly to `main`. Then click
   **Propose changes**.
6. On the next page click **Create pull request**.

### The second place: the test that states the date

One test states the review date on purpose, so that the date cannot change by accident.

1. Go back to the repository's first page. Open the branch menu above the list of files
   (it shows `main`) and choose the branch you just created.
2. Open `tests/curriculum.test.ts` and click the pencil button.
3. Find these two lines, one under the other, and change the date in both to the same
   date you used in the curriculum file:

   In `tests/curriculum.test.ts`:
   ```
   expect(rawData.lastReviewed).toBe(
   expect(curriculum.lastReviewed).toBe(
   ```
4. Click **Commit changes...** and choose to commit to the branch you are on (not a new
   one, and not `main`). Click **Commit changes**.

Now go to your pull request (the **Pull requests** tab) and wait for the check. Continue
with [The check](#the-check).

## Step 2B: Something changed

### First, write the change down

Open `docs/decision-log.md`, click the pencil button, and add an entry at the end of the
section "Owner answers", before the heading "Open questions to the owner". Give the date,
what changed, and where the department's guide says so. Commit it to a new branch, as in
Step 2A. Every later edit goes to that same branch.

### Then decide whether the change is yours to make

**Hand it over** (see [Handing a change over](#handing-a-change-over)) when the change is
any of these:

- a required course is added, removed or replaced;
- a course's credits, a block's credits or the degree's total change;
- a rule changes: grades, repeats, electives, legacy electives, the two-course sequence,
  transfer credit;
- a block is added, removed or renamed.

**You can make these changes yourself**, in the two places described below:

- a course is **added to** a "1 of …" choice;
- a course is **taken out of** a "1 of …" choice;
- a course in a "1 of …" choice is **replaced** by another;
- a course's **title** changes.

Some courses are used by PathCheck's own tests as their examples. Taking out, replacing
or renaming one of those ends in a red check on a test that is not yours, and then the
change is handed over too. You do not need to know which courses these are: the check
tells you. Adding a course to a choice does not have this problem.

### The two places a course is written

**1. The curriculum file**, `docs/curriculum/provisional-current.json`. Each course is
written like this, inside the `required` list or a `choices` list of its block:

```json
            {
              "courseId": "POS-207",
              "title": "American Government",
              "credits": 3
            },
```

- To **add** a course to a choice, copy such an entry, put it after the last course of
  that choice's `courses` list, and change the three values. Remember the comma rule: a
  comma after every entry except the last.
- To **take out** a course, delete its entry, from `{` to `}`, and its comma.
- To **replace** a course, change the three values of its entry.
- To change a **title**, change only the text after `"title":`.

The course code is written with a hyphen here: `POS-207`. All courses of one choice have
the same credits.

**2. The table in section 5 of `docs/BRIEF.md`.** Change the same course in the row of
its block. Here the code is written with a space, `POS 207`, and the courses of a choice
are separated by ` / `. A title is not in the table, so a title change needs no edit
here.

Then add an entry to `sources` and set the review date in its two places, exactly as in
Step 2A. Commit every edit to the same branch.

## The check

On the pull request's page, near the bottom, a box shows the check, named `check`. It
takes a few minutes.

- **Green tick:** every test passed. Click **Merge pull request** (or **Squash and
  merge**), then the confirm button. Go to Step 3.
- **Red cross:** do not merge. Click the link beside the red cross (**Details**) to open
  the log of the run, and use the search box of that page.

### Is this mine to fix?

Look in the log in this order, and stop at the first one that applies.

1. **A line that names `docs/curriculum/provisional-current.json` with two numbers in
   brackets**, for example `docs/curriculum/provisional-current.json(8,3): error TS1005: ',' expected.`
   The file is not written correctly at that place: the first number is the line, the
   second the position in it. Almost always a comma or a quotation mark is missing or
   left over on that line or the one before. Fix it on your branch. (In this case no
   test has run yet.)
2. **A line containing `Curriculum data:`** PathCheck read the file and refused it. The
   words after it say where and why; the table [Mistakes the check catches](#mistakes-the-check-catches)
   explains them. Fix it on your branch.
3. **A line containing `docs/BRIEF.md §5`.** A row of the brief's table is not written
   like the others. The line says which row. Fix it on your branch.
4. **Lines containing `FAIL`** followed by the name of a test. If every such test is one
   of [the tests that are yours](#the-tests-that-are-yours), fix what it says. If any
   other test is named, hand the change over.
5. **None of these:** hand the change over.

After a fix, the check runs again by itself.

### The tests that are yours

- `matches the table in brief section 5`: the curriculum file and the brief's table
  disagree. The lines under it name the block. Make the two say the same.
- `lists each course once`: the same cause. The file and the brief's table do not name
  the same number of courses.
- `reaches 121 with everything passed`: the same cause, when it fails together with the
  two above.
- `carries the last-reviewed date`: the date in the curriculum file and the date in
  `tests/curriculum.test.ts` are not the same. Make them the same.
- `has no CIS 304, CIS 415, replacement, older-code or not-offered entry`: a title or a
  description in the curriculum file uses a word the file must not contain. Reword it
  without "replacement", "formerly", "older code", "not offered", "historical" or
  "unresolved".

### Mistakes the check catches

| What went wrong | The check says | What to do |
|---|---|---|
| A comma or quotation mark is missing in the curriculum file | `error TS1005: ',' expected.` (for example) | Fix the line it names |
| The review date is not written as year-month-day | `must be null or a date written YYYY-MM-DD` | Write it like `2027-11-10` |
| A course code is not written like `POS-207` | `must be 2 to 4 capital letters, a hyphen and 3 digits` | Use capital letters, a hyphen, three digits |
| The same course is in the file twice | `the same course is listed twice` | Delete one of the two entries |
| The courses of one choice have different credits | `courses in one pick group must have the same credits` | Hand it over: this is a change of credits |
| A block's credits do not match its courses | `but its courses add up to` | Hand it over: this is a change of credits |
| A word in the file is misspelled or new | `unknown field` | Spell it as in the entries around it |
| A row of the brief's table is not written like the others | `is not written as "1 of AAA 101 / BBB 102"` | Write the choice as `1 of AAA 101 / BBB 102` |

## Handing a change over

A change you cannot make yourself needs someone who can change PathCheck's code and its
tests: a developer, or Claude Code working in this repository. Leave your pull request
open, do not merge it, and give them this request, filled in:

> PathCheck's curriculum has to change. Please make the change below and nothing else.
>
> - What the department's guide says now, and its date: …
> - What PathCheck says today: …
> - Recorded in `docs/decision-log.md` on: …
> - My pull request with what I already changed: …
>
> Change `docs/BRIEF.md` section 5, `docs/curriculum/provisional-current.json` and the
> tests that state the old curriculum. Do not change any rule I did not list. Set the
> review date to …, in the curriculum file and in `tests/curriculum.test.ts`. Run
> `npm run check` until it passes. In the pull request, say in plain language what you
> changed, which tests you edited, and why each one had to change.

Before you merge their work, read that explanation. A test that was changed without a
reason you understand is a question to ask before merging.

## Step 3: Publish and look

Merging does not always change the site. Open the project in Netlify and click
**Deploys**.

- If the page says **Auto Publishing Locked**: wait until the newest deploy at the top of
  the list, named `Production: main@…`, is finished. Click it, then click **Publish
  deploy**.
- If it does not say so, the merge published the new version by itself.

Then open the site and look:

- the foot of every page says "Curriculum last reviewed:" with the new month and year;
- no page shows the sentence about a review that is more than 12 months old;
- after a course change, "Check my courses" answers the course you changed as you expect.

The printed summary of "See what I have left" carries the same date in its top line.

## Reference: the curriculum file, field by field

The file is `docs/curriculum/provisional-current.json`. It is a list of named values.
Text is written in quotation marks; numbers are not. The fields you may change yourself
are marked "yours".

| Field | What it holds | Example |
|---|---|---|
| `schemaVersion` | The file format's version. Not yours | `2` |
| `id` | The curriculum's short name inside PathCheck. Not yours | `asu-bs-cis` |
| `institution` | The university's name, as the pages show it. Not yours | `Alabama State University` |
| `program` | The degree's name, as the pages show it. Not yours | `B.S. Computer Information Systems` |
| `degreeCredits` | The degree's total credits. Hand over | `121` |
| `lastReviewed` | The date of the last review. **Yours** | `2026-11-15` |
| `finalSemesterCourse` | The required course that the draft plan keeps for the last semester. Hand over | `MGT-462` |
| `sources` | What the curriculum was compared with. Each entry has an `id` (a short name, no spaces) and a `description`. **Yours** | see Step 2A |
| `grades` | The grade rules: `letters` (the grades that exist), `minimumCounting` (the lowest grade that counts) and `neverCounting` (marks that never count). Hand over | `C` |
| `blocks` | The eight blocks of the degree. Each has an `id`, a `name`, its `credits`, its `required` courses and its `choices`. Hand over, except as below | |
| `required` | A block's required courses. Hand over | |
| `choices` | A block's "1 of …" choices. Each has `choose` (how many to take) and `courses` (what to take them from). The `courses` list is **yours** | `1` |
| `courseId` | A course's code, with a hyphen. **Yours** inside a choice | `POS-207` |
| `title` | A course's title. **Yours** | `American Government` |
| `credits` | The credits of a course, a block or the electives. Hand over | `3` |
| `sequence` | The two-course sequence rule: `choose` (how many sequences), `alternatives` (each with an `id`, a `name` and its `courses`), `additionalCredits`, `coreBlocks` and `coreCredits` (the blocks the sequence sits in and their credits). Hand over | |
| `electives` | The electives rule: its `id`, `name`, `credits` and `courseCount`; `namedCourses` (electives named one by one); `subjectRule` (which other courses count: `prefixes`, `minCourseNumber`, `maxCourseNumber`, `creditsPerCourse`, and `exceptCourses`, which never count); `excludeRequiredCourses`; and `legacyOnlyCourses` (electives for legacy students only). Hand over | |

## Why a course and the date are each written twice

A change made in one place only makes the check red. That is on purpose: one slip of the
keyboard cannot change what PathCheck tells students. The brief's table is the approved
statement of the curriculum, the curriculum file is what the pages read, and the check
compares the two. The date is written in the file and in the test that records the
review.
