# pdf-lib replacement plan (U, F19)

**Status:** IMPLEMENTED on `feat/frontend-ux` after the human merged PR #3 (main `2bb6b3f`). The handwritten writer is removed. U1–U12 and B1–B3 have been run by the author (evidence in PR #6). L integration and human visual check below remain open.

**Deviation from step 2 (determinism):** `page.drawText` names font resources with `Math.random` suffixes, so output was not byte-identical (U10). The renderer registers fixed `/F1` `/F2` resources once per page and emits text through pdf-lib's public operator API (`beginText`, `setFontAndSize`, `moveText`, `showText(font.encodeText(..))`, `endText`). The sanitizer asks the embedded font whether a character is encodable instead of keeping a private WinAnsi table, and NFC-normalizes first.

## What stays (frozen or already reviewed)

- `ExportService.exportPdf(scenario, analysis): Promise<Result<Blob>>` (contract), `createPdfExportService`, `exportFileName`.
- `validateAnalysisForScenario` gate. Stale or overclaiming analyses still return typed failures and produce no document.
- `planReport.ts` (`buildPlanReport`, `reportConditions`) and the minimum-data policy documented there. Only the renderer changes.
- `Block` / `PdfDocumentInput`, the layout rules (Letter 612×792, 54pt margins, keep heading with 2 lines, footer `Page i of N`) and Helvetica / Helvetica-Bold.

## Steps

1. `git fetch origin && git merge origin/main` into `feat/frontend-ux` (merge, never force-push). Confirm `package.json` and the lockfile pin `"pdf-lib": "1.17.1"`. Then run `npm ci` and `npm audit`, which must report 0 vulnerabilities.
2. `pdfWriter.ts`: make `renderPdf(input): Promise<Uint8Array>`.
   - Load lazily inside the function: `const { PDFDocument, StandardFonts } = await import('pdf-lib')`. This keeps it out of the main chunk (~517 kB already).
   - `PDFDocument.create({ updateMetadata: false })`. Then `setTitle(title)`, `setProducer('PathCheck')`, `setCreator('PathCheck')`, and `setCreationDate` / `setModificationDate` set to `new Date(generatedAt)`. **Never** call `setAuthor`, `setSubject` or `setKeywords`.
   - `embedFont(StandardFonts.Helvetica | HelveticaBold)`. `font.widthOfTextAtSize` replaces the AFM tables in `wrap`/`layout`. `page.drawText(line, { x, y, size, font })`.
   - Standard fonts throw on characters outside WinAnsi. Keep `encodeWinAnsi` as a sanitizer that maps unknown characters to `?` and control characters to a space before measuring or drawing.
   - `save({ useObjectStreams: false })`. This keeps a classic xref table, so the independent inspector can still verify every offset.
   - Delete the handwritten serializer: `pdfString`, the object/xref assembly and the AFM width tables.
3. `pdfExportService.ts`: `exportPdfBytes` becomes async. A renderer or import failure maps to `validation_error` / `pdf_render_failed` (unchanged), and the Blob path stays the same.
4. `tests/ui/pdfInspect.ts`: inflate `/Filter /FlateDecode` streams with `node:zlib` `inflateSync`. Extract text from hex `<…> Tj` and `TJ` arrays, decoded as WinAnsi. Decode the UTF-16BE (`<FEFF…>`) `/Title`. Keep the header, xref-offset, trailer, `/Count` and `%%EOF` checks. Cross-check the page count with `PDFDocument.load(bytes).getPageCount()`.

## Required tests after replacement (all must PASS before PR #6 is ready to merge)

Unit tests (`tests/ui/export.test.ts`) check the **actual bytes**. They decompress the content streams, extract the text and decode the metadata:

| # | Test | Pass condition |
|---|---|---|
| U1 | Structure | `%PDF-1.`, every classic xref offset points at `n 0 obj`, trailer `/Size`/`/Root`/`/Info`, `%%EOF`; `PDFDocument.load` succeeds; page counts agree |
| U2 | Metadata | title, producer `PathCheck`, creation date = `generatedAt`; author/subject/keywords absent |
| U3 | Required content | title, disclaimer, Important conditions, catalog version/year status, target, generated time, active placements with origin labels, priority issues, evidence gaps, student-reported offerings, record counts, per-page footer |
| U4 | Minimum data | grades, notes, attempt raw codes/institutions/terms, plan/draft/source/E-internal IDs, fingerprint absent from **decompressed text and decoded metadata** (raw-byte search alone is meaningless under Flate) |
| U5 | Active only | unadopted projections and previews never appear as selections |
| U6 | Pagination | 160 bullets: more than 3 pages, `Page i of N` on every page, last line present, no heading orphaned at a page bottom |
| U7 | Wrapping | every drawn line ≤ printable width by `font.widthOfTextAtSize`; overlong tokens hard-split with no characters lost |
| U8 | Encoding | ✓, emoji, CJK, combining marks and control characters do not throw (become `?` or a space); `— • ’ é €` round-trip through extraction |
| U9 | Refusal | stale and overclaiming analyses return typed failures and no bytes |
| U10 | Determinism | same input and time give byte-identical output |
| U11 | Service | `application/pdf` Blob, dated file name |
| U12 | Conditions | existing `reportConditions` present/absent cases unchanged |

Browser tests (`tests/ui/browser`, desktop 1280):

- **B1:** Export downloads a file named `pathcheck-plan-YYYY-MM-DD.pdf`. Run the inspector and `PDFDocument.load` on the downloaded bytes. Check the active course and conditions are present and the attempt term, grade and fingerprint are absent.
- **B2:** Export is disabled while there is no analysis or it is stale. An exporter failure shows an alert and starts no download.
- **B3:** `npm run build` emits pdf-lib as a separate lazy chunk, and the main chunk does not grow. Record the chunk sizes in the PR.

Full checks: `npm run check`, `node node_modules/@playwright/test/cli.js test -c tests/ui/browser/playwright.ui.config.ts` and `git diff --check`.

## Cross-component and human checks (not U-standalone)

- **L integration (owner L; trigger: PR #3 merged and U migration pushed):** `npm run test:integration`. Real E analysis on the provisional ASU catalog → Export → inspect the downloaded bytes. Must show "Provisional rule set…", "catalog year is unresolved" and the blocking-policy count, with no invented applicability.
- **Human visual check (NOT RUN until migration):** open one downloaded synthetic PDF in macOS Preview and in Chrome. Text must be selectable, footers present on every page and wrapping readable. Return a screenshot of page 1 and the page count.
