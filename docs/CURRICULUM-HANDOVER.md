# Keeping PathCheck's curriculum true

This guide is for the person responsible for PathCheck. You do not need to be a developer
and you do not need to install anything. You need a GitHub login that can change this
repository, and a web browser.

It covers one job: once a year, check PathCheck's curriculum against the department's,
and set the date the pages show.

## The yearly routine

Do this once a year, and whenever the department changes the B.S. CIS curriculum.

1. **Compare.** Put the department's current curriculum guide next to the table in
   section 5 of `docs/BRIEF.md`. ([Step 1](#step-1-compare))
2. **Nothing changed?** Set the review date. It is written in two places.
   ([Step 2A](#step-2a-nothing-changed-set-the-review-date))
3. **Something changed?** Write it down first. Then either make the change yourself or
   hand it over. ([Step 2B](#step-2b-something-changed))
4. **Wait for the green check** on your pull request, then merge it. Never merge while it
   is red. If it is red, read [Is this mine to fix?](#is-this-mine-to-fix)
5. **Publish and look.** ([Step 3](#step-3-publish-and-look))

Why the date matters: every page says "Curriculum last reviewed:" with the month and year.
Twelve months after that date, every page also warns that the review is more than 12
months old. The warning stays until the date is set again. For example, a review dated
2026-11-15 shows the warning from 2027-11-16.

## Before you start

**Who decides.** The university decides what the curriculum requires. The person
responsible for PathCheck confirms what PathCheck should say. Nobody guesses a rule. If
the department's guide is unclear, PathCheck keeps what it has until the requirement is
clear in writing.

**The one promise.** PathCheck must never say a course counts when it may not. If you are
not sure a change is right, do not make it.

**Words used here.**

- A *repository* is the project's folder on GitHub: every file, with its history.
- A *branch* is a separate copy of the files, where you make your change.
- A *pull request* is the page that proposes your change. Nothing changes for students
  until it is merged and the result is published.
- The *check* runs all of PathCheck's tests on your pull request. Green means every test
  passed. Red means something is wrong.
- To *merge* is to accept the pull request into the main copy of the files.

## Step 1: Compare

1. Get the department's current curriculum guide for the B.S. Computer Information
   Systems. Note the date or the years printed on it.
2. Open `docs/BRIEF.md` on GitHub and find section 5, "Academic rules". Its table starts
   with this line:

   In `docs/BRIEF.md`:
   ```
   | Block | Credits | Required | Choose |
   ```
3. For each block, compare the credits, the required courses, and the courses of each
   "1 of …" choice.
4. Read the rules under the table and compare them too: grades, repeats, electives,
   legacy electives, transfer credit.
5. Note every difference. With none, go to Step 2A. Otherwise go to Step 2B.

## Step 2A: Nothing changed. Set the review date

The date is written as year, month, day, for example `2027-11-10`. Use the day you
finished comparing.

### The first place: the curriculum file

1. On GitHub, open `docs/curriculum/provisional-current.json`.
2. Click the pencil button at the top right of the file. It is named "Edit file".
3. Find the line that starts like this. Change only the date between the quotation marks.
   Keep the quotation marks and the comma at the end of the line.

   In `docs/curriculum/provisional-current.json`:
   ```
   "lastReviewed":
   ```
4. Say what you compared. Find the list that starts like this:

   In `docs/curriculum/provisional-current.json`:
   ```
   "sources": [
   ```
   Its last entry ends with `}`, just before the list's closing `]`. Type a comma after
   that `}`. Then add a new entry under it, like this one, with your own year, date and
   words:

   ```json
       {
         "id": "review-2027",
         "description": "Yearly review on 2027-11-10 against the department's B.S. CIS curriculum guide dated 2027: no change."
       }
   ```
   The comma rule: every entry of a list has a comma after it, except the last.
5. Click **Commit changes...**. A box opens. Choose the option that creates a **new
   branch** and starts a pull request. Do not commit directly to `main`. Click **Propose
   changes**.
6. The next page is named "Open a pull request". Three things on it:
   - **The branch's name.** The first lines say that your change "was written to a new
     branch named" and then a name, such as `yourname-patch-1`. Write that name down. You
     need it in a moment.
   - **The title** is already filled in. Leave it.
   - **The description** is a big box that holds a form for developers. Delete everything
     in the box and write one sentence, for example "Yearly review on 2027-11-10: no
     change."

   Then click **Create pull request**.

**The check now starts, and it will go red. That is expected.** The date is changed in one
of its two places, and PathCheck's tests notice. GitHub may also send you an email saying
that a run failed. Carry on with the second place.

### The second place: the test that states the date

One test states the review date on purpose, so the date cannot change by accident.

1. Go back to the repository's first page. Above the list of files is the branch menu,
   which shows `main`. Open it and choose the branch you just created: the name you
   wrote down.
2. Open `tests/curriculum.test.ts` and click the pencil button.
3. Find these two lines, one under the other. Change the date in both, to the same date
   you put in the curriculum file:

   In `tests/curriculum.test.ts`:
   ```
   expect(rawData.lastReviewed).toBe(
   expect(curriculum.lastReviewed).toBe(
   ```
4. Click **Commit changes...**. Choose to commit to the branch you are on: not a new one,
   and not `main`. Click **Commit changes**.

Saving this starts the check again by itself. You do not press anything.

Now open your pull request from the **Pull requests** tab and wait for the check. Look at
the newest result only: the red one from before no longer matters. Go on to
[The check](#the-check).

## Step 2B: Something changed

### First, write the change down

1. Open `docs/decision-log.md` and click the pencil button.
2. Go to the end of the section "Owner answers". That is just above the heading "Open
   questions to the owner".
3. Add an entry there. Start it with a heading line like the others, then say what
   changed and where the department's guide says so. This is only an example, with a
   course that does not exist:

   ```
   ### 2027-11-10 — The curriculum changed: XYZ 101 joins the Social sciences choice

   The department's B.S. CIS curriculum guide dated 2027 lists XYZ 101 among the Social
   sciences choices. PathCheck's table did not have it.
   ```
4. Commit it to a new branch, as in Step 2A. Every later edit goes to that same branch.

### Then decide whether the change is yours to make

**Hand it over** (see [Handing a change over](#handing-a-change-over)) when:

- a required course is added, removed or replaced;
- credits change: a course's, a block's, or the degree's total;
- a rule changes: grades, repeats, electives, legacy electives, the two-course sequence,
  transfer credit;
- a block is added, removed or renamed;
- the course appears more than once in the curriculum file. Open the file's page and
  search it with Ctrl+F (Cmd+F on a Mac) for the course's code, written with a hyphen,
  such as `ENG-210`. A course found twice is part of a rule.

**You can try these yourself:**

- adding a course to a "1 of …" choice;
- changing a course's title;
- taking a course out of a "1 of …" choice;
- replacing a course in a "1 of …" choice with another.

Be ready for a hand-over all the same. Most courses already in the file are the examples
PathCheck's own tests are written with. Taking one of those out, or replacing it, turns
the check red on a test that is not yours, and then the change is handed over. Today only
a few courses can be taken out or replaced without that. Adding a course and changing a
title usually work.

You do not need to know which courses the tests use. Make the change, and the check tells
you.

### The two places a course is written

**1. The curriculum file**, `docs/curriculum/provisional-current.json`. A course looks
like this, inside the `courses` list of a choice:

```json
            {
              "courseId": "POS-207",
              "title": "American Government",
              "credits": 3
            }
```

- To **add** a course, copy such an entry and put it after the last course of that
  choice. Change the three values. Mind the comma rule: type a comma after the entry that
  was last until now, and none after your new one.
- To change a **title**, change only the text after `"title":`.
- To **take out** a course, delete its entry from `{` to `}`, and the comma after it. If
  it was the last course of the list, delete the comma after the course before it
  instead.
- To **replace** a course, change the three values of its entry.

Here the course code has a hyphen: `POS-207`. All courses of one choice have the same
credits.

**2. The table in section 5 of `docs/BRIEF.md`.** Change the same course in the row of its
block. There the code has a space, `POS 207`, and the courses of a choice are separated by
` / `. Keep the courses in the same order as in the file: a new course goes last in its
choice in both. Titles are not in the table, so a title change needs no edit there.

Then add an entry to `sources` and set the review date in its two places, as in Step 2A.
Commit every edit to the same branch.

## The check

Near the bottom of the pull request's page, a box shows the check. It is named `check` and
takes a few minutes. It runs again by itself each time you save a change to your branch.

- **Green tick:** every test passed. Click **Merge pull request** (or **Squash and
  merge**), then the confirm button. Go to Step 3.
- **Red cross:** do not merge. Click **Details** beside the red cross. That opens the log
  of the run. Use that page's search box.

### Is this mine to fix?

Search the log for these, in this order. Stop at the first one you find.

1. **A line that names `docs/curriculum/provisional-current.json` with two numbers in
   round brackets**, for example
   `docs/curriculum/provisional-current.json(8,3): error TS1005: ',' expected.`
   The file is not written correctly there. The first number is the line, the second the
   position in it. Almost always a comma or a quotation mark is missing, or one too many,
   on that line or the one before. Fix it on your branch.
2. **A line containing `trailing comma at line`.** The curriculum file has a comma just
   before a closing `]` or `}`. The two numbers after it point at that closing bracket.
   The comma is just before it, usually at the end of the line above. Delete that comma
   on your branch.
3. **A line containing `CurriculumError: Curriculum data:`.** PathCheck read the file and
   refused it. Look
   up the words after it in [Mistakes the check catches](#mistakes-the-check-catches). If
   they are in that table, do what the table says. If they are not, hand the change over.
4. **A line containing `docs/BRIEF.md §5`.** A row of the brief's table is not written
   like the others. The line says which row. Fix it on your branch.
5. **Lines containing `FAIL`**, each followed by the name of a test. If every one of
   those tests is in [The tests that are yours](#the-tests-that-are-yours), fix what the
   list says. If any other test is named, hand the change over.
6. **None of these:** hand the change over.

After a fix, the check runs again by itself.

### The tests that are yours

- `matches the table in brief section 5`: the curriculum file and the brief's table
  disagree. The lines under it name the block. Make the two say the same.
- `lists each course once`: the same cause. The file and the table do not name the same
  number of courses.
- `reaches 121 with everything passed`: the same cause, when it fails together with the
  two above.
- `carries the last-reviewed date`: the date in the curriculum file and the date in
  `tests/curriculum.test.ts` differ. Make them the same.
- `has no CIS 304, CIS 415, replacement, older-code or not-offered entry`: the curriculum
  file uses words it must not contain: "CIS 304", "CIS 415", "replacement", "old code"
  or "older code", "formerly", "supersede", "not offered", "historical", "unresolved".
  If they are in a `description` you wrote under `sources`, reword it. If they are in a
  course's title, hand the change over: PathCheck shows titles as the department writes
  them.

### Mistakes the check catches

| What went wrong | The check says | What to do |
|---|---|---|
| A comma or quotation mark is missing in the curriculum file | `error TS1005: ',' expected.` (for example) | Fix the line it names |
| A comma is left before a closing `]` or `}` | `trailing comma at line` | Delete the comma before the bracket it points at |
| The review date is not written as year-month-day | `must be null or a date written YYYY-MM-DD` | Write it like `2027-11-10` |
| A course code is not written like `POS-207` | `must be 2 to 4 capital letters, a hyphen and 3 digits` | Use capital letters, a hyphen, three digits |
| The same course is in the file twice | `the same course is listed twice` | Delete the entry you added. If the department's guide really lists the course in both places, hand it over |
| The courses of one choice have different credits | `courses in one pick group must have the same credits` | Hand it over: credits changed |
| A block's credits do not match its courses | `but its courses add up to` | Hand it over: credits changed |
| A word in the file is misspelled or new | `unknown field` | Spell it as in the entries around it |
| A row of the brief's table is not written like the others | `is not written as "1 of AAA 101 / BBB 102"` | Write the choice as `1 of AAA 101 / BBB 102` |

## Handing a change over

Some changes need someone who can change PathCheck's code and its tests: a developer, or
Claude Code working in this repository. Leave your pull request open and do not merge it.
Give them this request, filled in:

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

Read that explanation before you merge their work. If a test was changed and you do not
understand why, ask before merging.

## Step 3: Publish and look

Merging does not always change the site. Open Netlify at `https://app.netlify.com`, open
the project named `pathcheck`, and click **Deploys**.

- If the page says **Auto Publishing Locked**: wait until the newest deploy at the top of
  the list is finished. It is named `Production: main@…`. Click it, then click **Publish
  deploy**.
- If the page does not say that, the merge has already published the new version.

Then open the site and look:

- the foot of every page says "Curriculum last reviewed:" with the new month and year;
- no page warns that the review is more than 12 months old;
- after a course change, "Check my courses" answers the changed course as you expect.

A printed summary of "See what I have left" carries the same date in its top line.

## Reference: the curriculum file, field by field

The file is `docs/curriculum/provisional-current.json`. It is a list of named values.
Text is in quotation marks; numbers are not. "Yours" marks what you may change yourself.

| Field | What it holds | Example |
|---|---|---|
| `schemaVersion` | The version of the file's format. Not yours | `2` |
| `id` | The curriculum's short name inside PathCheck. Not yours | `asu-bs-cis` |
| `institution` | The university's name, as the pages show it. Not yours | `Alabama State University` |
| `program` | The degree's name, as the pages show it. Not yours | `B.S. Computer Information Systems` |
| `degreeCredits` | The degree's total credits. Hand over | `121` |
| `lastReviewed` | The date of the last review. **Yours** | `2026-11-15` |
| `finalSemesterCourse` | The required course the draft plan keeps for the last semester. Hand over | `MGT-462` |
| `sources` | What the curriculum was compared with. Each entry has an `id` (a short name without spaces) and a `description`. **Yours** | see Step 2A |
| `grades` | The grade rules: `letters` (the grades that exist), `minimumCounting` (the lowest grade that counts) and `neverCounting` (marks that never count). Hand over | `C` |
| `blocks` | The blocks of the degree. Each has an `id`, a `name`, its `credits`, its `required` courses and its `choices`. Hand over, except as below | |
| `required` | A block's required courses. Hand over | |
| `choices` | A block's "1 of …" choices. Each has `choose` (how many to take) and `courses` (what to take them from). The `courses` list is **yours** | |
| `courseId` | A course's code, with a hyphen. **Yours** inside a choice | `POS-207` |
| `title` | A course's title. **Yours** | `American Government` |
| `credits` | The credits of a course, a block or the electives. Hand over | `3` |
| `sequence` | The two-course sequence rule: `choose` (how many sequences), `alternatives` (each with an `id`, a `name` and its `courses`), `additionalCredits`, and `coreBlocks` with `coreCredits` (the blocks the sequence sits in, and their credits). Hand over | |
| `electives` | The electives rule: its `id`, `name`, `credits` and `courseCount`; `namedCourses` (electives named one by one); `subjectRule` (which other courses count: `prefixes`, `minCourseNumber`, `maxCourseNumber`, `creditsPerCourse`, and `exceptCourses`, which never count); `excludeRequiredCourses`; and `legacyOnlyCourses` (electives for legacy students only). Hand over | |

## Why a course and the date are each written twice

A change made in one place only turns the check red. That is on purpose: one slip of the
keyboard cannot change what PathCheck tells students. The brief's table is the approved
statement of the curriculum. The curriculum file is what the pages read. The check
compares the two. The date is in the file, and in the test that records the review.
