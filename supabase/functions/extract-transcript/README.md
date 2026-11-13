# Transcript endpoint implementation checkpoint

This module implements the HTTP handler, signed guest-session/ticket admission, server Turnstile verification, real PDF structural inspection and Gemini REST transport. **It is not a deployable or production-enabled endpoint yet.** No real provider request has run. The real-data processing gate remains disabled pending the existing human processing/privacy approval and integration tests.

Browser exports: `createTranscriptClient`, `documentDigest`, `validateExtraction` from `src/transcript/index.ts`. The browser expects same-origin `/api/transcript/{availability,session,ticket,extract,revoke}`. U supplies the explicit disclosure/consent and Turnstile widget; use action `extract-transcript` and the server-configured audience as cData. Availability is display-only. Browser ticket state is transient, never local/session storage. Manual entry must remain available.

The server factory accepts private dependencies. No process-local quota implementation, synthetic production bypass, default paid approval, automatic file upload/storage, request/response logging or arbitrary provider URL exists. Gemini uses one `generateContent` request with inline PDF, JSON schema and bounded output; no retry and no Files API. The reviewed model/pricing policy must cover maximum billable input/output including thinking tokens. Unknown failed dispatch cost retains the full reservation. Configuration correctness, pricing and provider billing behavior are external processing-review obligations, not established by synthetic tests.

Timing bounds: ticket ≤300s, admission lease 120s, PDF inspection deadline 30s after admission (timer race plus elapsed-clock check, so CPU-bound inspection also fails closed before dispatch), provider transport 50s, browser request 65s. The browser claims a ticket synchronously after digest computation (concurrent calls upload once); revocation deletes unused tickets, aborts in-flight uploads for that receipt and discards any late proposal. Already-transmitted bytes cannot be recalled.

All output remains `needs_review` (or rejected if empty). Provider-reported page/row counts are cross-checked for internal consistency but cannot demonstrate independent recall. `validateExtraction` retains every raw field/repeat, discards invented provisional matches, proposes only literal catalog-code matches, and leaves academic interpretation to E. Raw quotes are removed from provider output. No accepted-PDF accuracy claim is made.

## PDF structural inspection

`createTranscriptHandler` defaults to `createPdfInspector` in `pdf.ts`; an injected
inspector exists only for isolated tests. The pinned pdf-lib 1.17.1 loader rejects
encryption and invalid objects without copying parser errors into responses. The
inspector checks the bounded PDF header/trailer/xref envelope and traverses the
parsed page tree with cycle, duplicate-node, parent, declared-count, depth and node
bounds. It counts actual leaves, refuses zero or over 20 pages, and never changes
caller bytes. The handler applies its existing inspection deadline, clears admitted
PDF bytes, settles failures and dispatches no provider call after rejection.

This is structural preflight, **not** a PDF conformance validator, renderer, malware
scanner, or completeness proof. pdf-lib can repair some malformed structures and
inflates object streams before page-tree validation. A byte limit and timeout race
do not provide a CPU/memory sandbox or cancel parser work. Runtime resource isolation
and cancellation must be verified with L before any public processing is enabled.
Synthetic in-memory fixtures (compressed/plain PDF, independent hand-authored xref,
encrypted trailer, truncation and broken trees) test these checks without student
records or provider calls. They are not the 15–20 labeled extraction benchmark.

## Pending integration dependencies

- **S + L:** private shared atomic store migration and reviewed RPC transport semantics. `AdmissionStore` in `admission.ts` is a proposal, not a frozen cross-agent interface. Store must atomically bind consumed bot-proof hash/claims/consent, reject ticket replay, enforce session/network rolling-hour quotas and concurrency, reserve UTC-day worst-case cost, recheck revocation at dispatch, and idempotently settle/recover leases. Expired dispatched leases keep their full reserved cost; expired undispatched leases may release cost without resurrecting tickets. Cross-day settlements remain attributed to the original reservation bucket. Use DB time or validate server times; fail closed on all storage errors. No PDF/rows/raw IP in this store. Network-key rotation must preserve rolling-window enforcement across rotation boundaries. **Proposal amendment (pending L/S review, not adopted):** `finish` should report whether consent was revoked after dispatch so the server can withhold the provider result from the response; today only the browser discards it and the server still returns it to the same authenticated session.
- **L + G:** resource-isolated/cancellable PDF processing (including compressed-object amplification), tested Supabase/Deno module resolution or bundling, function entry/shared configuration, and same-origin authenticated gateway. `resolveNetwork` must accept only gateway-authenticated identity, never arbitrary public forwarded-IP headers. Cookie is secure `__Host-`, HttpOnly and SameSite Strict. Verify configured gateway preserves same-origin cookie/Origin and strips forged identity headers. No deployment is authorized here.
- **G + S + L / I4:** real private SQL concurrency/replay/quota/budget/cross-day/lease tests against local/test backend after migration. Test doubles verify call order and fail-closed handling only.
- **G + E + L / I4:** actual malicious/ambiguous raw rows through E normalization and cloud/recovery projections; no raw quotes or authoritative Gemini academic conclusions.
- **G + authorized environment:** 15–20 labeled synthetic PDF corpus and actual provider benchmark after reviewed model/allowed synthetic credentials and labeled PDFs are available. Existing 15 raw-row cases are not the PDF benchmark. Accepted recall has no measured denominator yet. Do not process personal PDFs or enable the public endpoint to run a synthetic benchmark.

## Verification

Parser checkpoint (2026-11-13, after incorporating human-merged main
`2bb6b3f8e36039a243ea3af389380019256357b7`; merge commit
`16c1ad5f9932766eb85e6d0b415403b4a9f83045`):

- `npm ci --ignore-scripts` — PASS: 187 packages installed, 188 audited, zero vulnerabilities.
- `npm test -- tests/transcript` — PASS: 115 tests / 6 files, including 23 new real-parser/handler cases.
- `npm run check` — PASS: lint, TypeScript, 218 unit tests / 12 files (115 G + 103 foundation), production build, 1 Chromium foundation smoke with captures disabled.
- Initial new-parser run: 22/23 PASS; encrypted rejection was correct but the expected specific reason differed because pdf-lib's Error subclass identity was not preserved. Now returns a generic typed unreadable/encrypted failure. Initial fullcheck stopped on intentional NUL-whitespace regex lint; two scoped explanatory exceptions were added, with no shared configuration changes. Final fullcheck above passed.

No database acceptance, external provider, personal PDF, screenshots or public
endpoint used. Provider recall/accuracy, distributed SQL admission and real runtime
resource isolation remain BLOCKED/NOT RUN. The actual parser tests do not clear them.


Security-review checkpoint (2026-11-12, after concurrent/revoked-consent and lease-timeout fixes): `npm test -- tests/transcript` PASS 92/92 in 5 files; `npm run check` PASS: lint, TypeScript, 151 unit tests in 9 files (92 G + 59 foundation), build, 1 Chromium smoke. No install rerun; no external service called.

Earlier checkpoint evidence (2026-11-12): `npm ci --ignore-scripts` PASS (182 locked packages; audit zero vulnerabilities). `npm run check` PASS: lint, TypeScript, **145 unit tests in 9 files (86 G tests + 59 foundation tests)**, Vite production build, **1 Chromium foundation smoke test**. An initial Web Crypto buffer typing error was corrected before the passing full run. No live external service was called.

Run `npm run check` for all locally executable lint/type/unit/build/browser checks. `npm test -- tests/transcript` executes the isolated G suites without network credentials. Assertions use synthetic HTTP/store/PDF doubles explicitly under `tests/`; they do not prove live Gemini accuracy, complete PDF safety, or database atomicity. The separate pdf.test.ts suite uses actual generated PDF bytes and the real inspector, with store/provider doubles explicitly retained. Missing dependencies above are NOT RUN/BLOCKED, never PASS.

Official implementation references checked 2026-11-12: [Gemini generateContent REST](https://aistudio.google.com/api-reference/generate-content), [inline PDF processing](https://aistudio.google.com/docs/document-processing), [structured outputs](https://aistudio.google.com/docs/structured-output), [Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [Gemini terms](https://aistudio.google.com/docs/terms). Current terms include age restrictions; the processing-eligibility review must address them alongside paid data handling. No independent legal/processing approval is claimed.
