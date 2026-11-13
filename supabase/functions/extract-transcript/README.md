# Transcript endpoint implementation checkpoint

This module implements the HTTP handler, signed guest-session/ticket admission, server Turnstile verification, real PDF structural inspection and Gemini REST transport. **It is not a deployed or production-enabled endpoint.** `createTranscriptRuntime` composes the actual Request→Response runtime with a server-only environment reader and injected atomic admission/gateway services. The real-data processing gate remains disabled pending the existing human processing/privacy approval and integration tests. Lead-owned live synthetic benchmark evidence is tracked separately; these module tests simulate provider responses explicitly.

Browser exports: `createTranscriptClient`, `documentDigest`, `validateExtraction` from `src/transcript/index.ts`. The browser expects same-origin `/api/transcript/{availability,session,ticket,extract,revoke}`. U supplies the explicit disclosure/consent and Turnstile widget; use action `extract-transcript` and the server-configured audience as cData. Availability is display-only. Browser ticket state is transient, never local/session storage. Manual entry must remain available.

The server factory accepts private dependencies. No process-local quota implementation, synthetic production bypass, default paid approval, automatic file upload/storage, request/response logging or arbitrary provider URL exists. Gemini uses inline PDF, JSON schema and bounded output, never the Files API. The reviewed model/pricing policy must cover maximum billable input/output including thinking tokens and every permitted transport attempt. Unknown failed dispatch cost retains the full reservation. Configuration correctness, pricing and provider billing behavior are external processing-review obligations, not established by synthetic tests.

## Bounded transport retries and private runtime

Only HTTP503 may retry, opt-in through a reviewed `ProviderPolicy.retry`; default is
one attempt. Maximum3 total attempts,50seconds total provider lifetime, base delay
at least6seconds, exponential backoff plus0–1second jitter, and Retry-After seconds
or date honored. No retry if its delay would exceed the remaining deadline.400,
401,403,429, malformed response and rejected admission are not retried. Cancellation
propagates through body reads, backoff, retry authorization and provider I/O. The
whole handler has a60second signal, below the browser's65second request timeout;
PDF inspection remains separately bounded30seconds. Synchronous PDF work still
requires the separately tracked resource-isolation runtime.

`EndpointOptions.authorizeRetry({reservationId,sessionId,now})` must verify the
same dispatched reservation's live consent and lease. It cannot consume another
ticket, create another admission, reset the lease or increment the student request
quota. Missing/denied retry authorization fails closed. Every paid attempt's maximum
cost is reserved upfront; successful settlement conservatively includes the maximum
cost of prior503 attempts. Exhaustion returns
`provider_temporarily_unavailable_manual_entry`; no generated coursework is invented.
`finish` returning forbidden (including late consent revocation) suppresses output.

`createTranscriptRuntime` reads only `GEMINI_API_KEY` and `PATHCHECK_GEMINI_MODEL`
through the supplied private secret reader. Missing/mismatched configuration makes
processing unavailable; it does not manufacture reviewed processing eligibility.
The public runtime has no free-tier enable flag. Host listener, same-origin gateway,
durable RPC adapter and reviewed eligibility remain explicit lead dependencies.

Separate `createSyntheticGeminiProvider` is for a local test composition only:
exact `gemini-3.5-flash-lite`, explicit Free confirmation, a fixed synthetic PDF SHA256
allowlist, zero monetary cost and an obligatory `authorizeAttempt(maximumTokens)`
project-budget callback on EVERY provider attempt. This callback must enforce actual
RPM/TPM/RPD in the local harness; it is distinct from application admission quotas.
No arbitrary PDF, alternate model or default budget is allowed. This factory is not
wired into the public paid-eligibility handler. Test-only synthetic paid eligibility
used with simulated Google responses is not proof of a live free-tier endpoint.

The provider wire schema omits only rows/unrecognizedRows maxItems1000, matching the
lead's live-discovered grammar correction. Original strict Zod limits still enforce
both bounds before output enters G/E normalization; all required keys/types remain.

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

- **S + L:** private shared atomic store migration and reviewed RPC transport semantics. `AdmissionStore` in `admission.ts` is a proposal, not a frozen cross-agent interface. Store must atomically bind consumed bot-proof hash/claims/consent, reject ticket replay, enforce session/network rolling-hour quotas and concurrency, reserve UTC-day worst-case cost, recheck revocation at dispatch, and idempotently settle/recover leases. Expired dispatched leases keep their full reserved cost; expired undispatched leases may release cost without resurrecting tickets. Cross-day settlements remain attributed to the original reservation bucket. Use DB time or validate server times; fail closed on all storage errors. No PDF/rows/raw IP in this store. Network-key rotation must preserve rolling-window enforcement across rotation boundaries. The lead RPC adapter must translate SQL `consent_revoked` at settlement into a forbidden result; the current handler withholds extracted rows in that case. Retry authorization uses the same dispatched reservation and never repeats admission; PR7 supplies its reviewed SQL check.
- **L + G:** resource-isolated/cancellable PDF processing (including compressed-object amplification), tested Supabase/Deno module resolution or bundling, function entry/shared configuration, and same-origin authenticated gateway. `resolveNetwork` must accept only gateway-authenticated identity, never arbitrary public forwarded-IP headers. Cookie is secure `__Host-`, HttpOnly and SameSite Strict. Verify configured gateway preserves same-origin cookie/Origin and strips forged identity headers. No deployment is authorized here.
- **G + S + L / I4:** real private SQL concurrency/replay/quota/budget/cross-day/lease tests against local/test backend after migration. Test doubles verify call order and fail-closed handling only.
- **G + E + L / I4:** actual malicious/ambiguous raw rows through E normalization and cloud/recovery projections; no raw quotes or authoritative Gemini academic conclusions.
- **G + L:** The lead-owned synthetic benchmark now reports18/18 cases PASS (16 live PDF responses,2 local preflight rejections) and21/21 exact attempts. That direct-provider test does not certify this runtime or a new transcript layout; the lead maintains its exact evidence and transport history. Public/real-data processing remains disabled; browser and actual-admission integration still require their separate gates.

## Verification

### Local synthetic acceptance composition — 2026-11-13

`tests/fixtures/transcripts/localRuntime.ts` now provides
`createLocalSyntheticTranscriptRuntime` for the lead's private Chrome acceptance
server. It reuses the same handler, signing, consent, admission, PDF parser and
provider mechanics through G-private `handlerCore`/`admissionCore` modules. Public
`createTranscriptHandler`, `createGuestAdmission` and `createTranscriptRuntime`
remain bound to the unchanged paid `ProcessingEligibility` contract; no public
free flag or fabricated paid project/approval is introduced.

The test factory requires an exact HTTPS loopback origin/port, explicit free-tier confirmation,
fixed Gemini 3.5 Flash-Lite, an at-most-one-hour private permit, a copied immutable fixture SHA256
allowlist, server secrets, bot/capability verification, actual store/network ports
and project quota authorization. The listener must also bind only to 127.0.0.1.
Unknown digests fail before bot/ticket storage; substituted PDF bytes fail before
admission, parsing or dispatch. Provider verifies the allowlist again. Real PDFs
cannot enter through a synthetic mode toggle. Positive SQL ledger units are explicit
synthetic abuse-accounting units; successful API monetary settlement is zero and
does not assert billing enabled. RPM/TPM/RPD enforcement belongs to the mandatory
lead-provided project budget callback, called for every transport attempt.

The synthetic provider now requires a final egress authorization after that quota
callback, on the first attempt and each retry. It checks the same dispatched
reservation's current consent/lease and the current private permit immediately
before send. It does not issue another ticket, admit again or reset the lease.
Any injected transport must avoid new asynchronous work between that final check
and actual network dispatch; the lead's evidence writes belong before authorization
or after dispatch. Production paid retry behavior and shared contracts are unchanged.

The local factory's 20 new regressions cover consent/replay/session binding, unknown PDFs,
immutable allowlist, model/free/origin/expiry/configuration gates and public paid-gate
preservation. Deferred-quota tests revoke consent or expire a 20-second permit during
first/retry authorization, then assert no additional egress and the precise failure
reason while remaining below the 50-second provider timeout. Independent static
review confirmed the post-quota race and the initially overly-long expiry test
were corrected. These tests simulate Google/store responses; live SQL/API/browser
and human acceptance remain separately evidenced by the lead.

Actual G worktree `npm run check` PASS: lint, TypeScript, 577 unit tests in 30
passing files with two explicit live-database skips, production build and one
Chromium smoke test. The extraction suites contain 157 tests, including the 20
new local-composition regressions. No live Google or database operation was run
by these checks; those services and human acceptance are separate gates.

Runtime/retry checkpoint (2026-11-13, pending owned change on fbe9374 baseline):

After non-destructively refreshing this feature branch with human-merged main
`4f74a679f1f6ae0cf8e00a681d5214d77b1a9c39`, `npm run check` again PASS:
557unit tests/29files with2explicit live-database skips, lint/typecheck/build and
Chromium smoke1. Extraction-owned tests remain137. Independent final static review
confirmed both reported handler findings resolved, with no remaining blocker in
the reviewed retry/runtime scope. This does not waive integration/human gates.

- `npm run check` — PASS: lint, TypeScript,240unit tests/14files (137G), build,
  Chromium foundation smoke1. No live Google requests or real transcripts used.
- `tests/transcript/runtime.test.ts` binds an actual loopback HTTP server, exercises
  signed session/ticket, the real PDF inspector and actual provider transport with
  explicitly simulated Google503→200 responses plus a store test double. Asserts
  one application admission/dispatch/settlement while two provider attempts occur.
  This does not establish live database security or real-provider accuracy.
- `providerRetry.test.ts` covers attempt/elapsed limits, Retry-After seconds/date,
  exponential jitter, cancellation (including hung authorization), no retry on
  invalid credentials/malformed requests/quota denial, conservative cost reserve,
  unchanged runtime row caps, synthetic digest rejection and per-attempt project
  budget enforcement. Lead owns integration with actual SQL/gateway and browser.
- Independent review identified stale ticket/revoke timestamps after slow body
  reads and processing approval not rechecked around retry authorization. Both
  corrected with deterministic regressions (40second body delay and expiry during
  backoff/authorization). Handler32tests PASS; fullcheck above rerun after fixes.

Older checkpoints below remain historical evidence, not claims about the current
integrated application or live free-tier endpoint.

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
