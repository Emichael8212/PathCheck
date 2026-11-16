# Made-up transcripts

Everything in this folder is synthetic. The student ("Sample Student", ID 000000000) does
not exist, and no real transcript was copied: only the layout of the unofficial transcript
(term headings, one line per course, the GPA and "Academic Standing" lines, a
transfer-credit section) as the owner described it in `docs/decision-log.md`.

- `transcripts/<name>.json` is what a reader would return for that transcript: the rows,
  in the shape `src/reader.ts` checks.
- `transcripts/<name>.pdf` is written from that file by
  `node scripts/make-synthetic-transcripts.mjs`. Change the `.json`, run the script, and
  commit both: a test fails when they differ.

These files are used by the tests and, at M1, by the upload on localhost. Never put a
real transcript, or any part of one, here.
