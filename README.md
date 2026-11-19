# PathCheck

Check whether your courses count toward the Alabama State University B.S. in Computer
Information Systems before you select them, and see what you have left to graduate on time.

**Use it:** https://pathcheck.netlify.app

PathCheck is an independent student project. It is not an official degree audit, and it is
not affiliated with Alabama State University.

## What it does

**Check my courses.** Type the courses you plan to take next semester. For each one,
PathCheck says whether it counts toward the CIS degree and which part of the degree it
fills, or that it doesn't count. Without your transcript, each "Counts" comes with "unless
you’ve already passed it or filled this slot"; add your transcript for an exact answer.
It adds up your credits and tells you if you are below 12, which is below full-time.

**See what I have left.** Upload your unofficial transcript as a PDF. PathCheck shows you
what it read, so you can correct any row before it is used. Then it shows:

- how many of the 121 credits you have left;
- whether you are on pace for the semester you want to finish in;
- each requirement, and what is still open in it;
- a draft plan of the semesters ahead.

You can print the result or save it as a PDF to take to your advisor.

## What it does not do

PathCheck answers three things the student portal doesn't: does this course count, what
is left, and am I on pace by credits. Everything else stays with the portal: grades and
GPA, prerequisites, which term a course is offered, and registration. The draft plan
counts credits only. It does not check course order.

If PathCheck is not sure a course counts, it says so. It never says a course counts when
it may not.

## Your data

PathCheck stores no personal data.

- Your course list, your last result and your answer to "Legacy CIS student" stay in your
  own browser. "Clear my data" removes them.
- Your transcript PDF is not stored by PathCheck. It is sent to Google to be read, and
  Google may keep it briefly.
- When you choose a file, Cloudflare runs a check in your browser that you are not a bot.
  It does not get the PDF.
- To count uploads, the site keeps how many uploads a random number for your browser made
  each day, and what the month has cost. Numbers only: no name, no file, no course.
- Netlify, which hosts the site, keeps ordinary logs of requests.
- If you report a mistake by email, your email reaches the person who runs PathCheck.

The full list is in [docs/milestones/M3.md](docs/milestones/M3.md), part 3.

## Limits

Reading a transcript costs a little money each time, so uploads are limited: three a day
for each browser, and a fixed amount a month for the whole site. Past either limit the
site says "Upload isn’t available right now — try again tomorrow". "Check my courses"
needs no upload and always works.

## Found a mistake?

Every page has the contact address at its foot: pathcheck.report@gmail.com. On the site it
opens an email already filled in with what the page showed.

## Keeping the curriculum true

Every page shows when the curriculum was last reviewed. Once a year, and whenever the
department changes the B.S. CIS curriculum, the person responsible for PathCheck compares
it and sets that date. Twelve months after the date, every page warns that the review is
old.

[docs/CURRICULUM-HANDOVER.md](docs/CURRICULUM-HANDOVER.md) says how, step by step. It
needs a GitHub login that can change this repository, access to the `pathcheck` project
on Netlify to publish, and a browser. Nothing has to be installed.

## Running it on your own computer

You need Node.js 24.

```
npm ci
npm run dev
```

Then open http://127.0.0.1:5173.

On your own computer no key is needed. Only the two made-up transcripts in
`synthetic/transcripts` can be read there: the browser recognises them, and nothing is
sent to Google. Any other PDF is refused. Every transcript in this repository is made up:
no real student's data is here, and none may be added.

Before proposing a change, run every check:

```
npm run check
```

It runs the code checks, all the tests and a build, and then makes sure the built site
holds no made-up transcript data, nothing of the function (its key names and addresses)
and no placeholder address.

## How it is hosted

Netlify builds the site from this repository (`netlify.toml`). One small function,
`netlify/functions/read-transcript.mts`, takes an uploaded PDF, has Cloudflare confirm the
bot check, applies the limits, and asks Google's Gemini to read it.

Three settings live in Netlify, and their values are never written in this repository:
`GEMINI_API_KEY`, `TURNSTILE_SECRET_KEY` and `VITE_TURNSTILE_SITE_KEY`.

Each new version is published by hand in Netlify.

## Where things are

| Folder or file | What is in it |
|---|---|
| `src/` | The site: the three pages and the rules that decide what counts |
| `netlify/` | The function that reads a transcript, and the counters behind the limits |
| `docs/curriculum/provisional-current.json` | The curriculum PathCheck uses |
| `docs/BRIEF.md` | What PathCheck is meant to be |
| `docs/decision-log.md` | Every decision and every answer, with its date |
| `docs/milestones/` | What was checked at each milestone, and what is still open |
| `tests/` | The tests. Every curriculum rule has to have one |
| `synthetic/` | The made-up transcripts the tests use |
| `mockups/` | The approved design as static pages. The site's two fonts are in `mockups/fonts/`, so the folder must stay |
