# Gemini free-tier verification — 2026-11-13

Public documentation checked; exact-model generation access now PASS and the
human confirms the key's project is Free. Full synthetic benchmark evidence is
maintained in the linked execution note; real-transcript processing is not approved.
User direction is DECISIONS.md GEM-001.

Update: user selected3.5 Flash-Lite and supplied AI Studio free quotas:
3.5 Flash-Lite15RPM/250,000TPM/500RPD;3.8 Flash5RPM/250,000TPM/20RPD;
2.5 Flash-Lite10RPM/250,000TPM/20RPD. Quotas are now user-verified;
authenticated metadata and actual structured synthetic-PDF generation now PASS. See
[executable benchmark and configuration](transcript-synthetic-benchmark.md).

## Publicly documented candidates

Google lists Standard input/output as free for the models below in its
[pricing](https://aistudio.google.com/docs/pricing). Public eligibility does not
prove this project's access. All listed model pages document PDF/image input,
text output, structured outputs, 1,048,576 input and 65,536 output tokens.

| Exact model ID | Role in evaluation |
|---|---|
| [`gemini-3.5-flash-lite`](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite) | Recommended initial synthetic benchmark: documented document-parsing focus and low latency. Synthetic corpus21/21 attempts exact; see measured benchmark. |
| [`gemini-3.8-flash`](https://aistudio.google.com/docs/models/gemini-3.8-flash) | More capable Flash comparison if Lite misses the approved accuracy gates; not an automatic fallback. |
| [`gemini-3.6-flash`](https://aistudio.google.com/docs/models/gemini-3.6-flash) | Previous-generation Flash alternative, not preferred over current candidates. |
| [`gemini-3.1-flash-lite`](https://aistudio.google.com/docs/models/gemini-3.1-flash-lite) | Earlier lightweight alternative, subject to project verification. |
| [`gemini-2.5-flash-lite`](https://aistudio.google.com/docs/models/gemini-2.5-flash-lite) | Legacy access restricted to prior active users; not assumed usable by a new project. |

Do not configure `gemini-2.5-flash`: current pricing documents deprecation,
removal from AI Studio selection and automatic routing to 3.5 Flash-Lite from
December 1, 2026. Avoid deprecated aliases and unreviewed model transitions.

## Limits, billing and privacy

- RPM, input TPM and RPD above are **user-verified in AI Studio**, not independently
  read through the API. Google directs
  users to [AI Studio active limits](https://aistudio.google.com/rate-limit).
  Limits apply per project; daily reset is midnight Pacific; capacity is not
  guaranteed. Grounding search allowances are not extraction-request quotas.
  Source: [rate limits](https://aistudio.google.com/docs/rate-limits).
- Free tier generally requires an active eligible project, not paid billing;
  some projects require verification. The human confirmed this key's project is
  Free; no billing configuration was changed.
  Source: [billing](https://aistudio.google.com/docs/billing).
- Google's PDF ceiling is 50 MB/1,000 pages, within the model context limit.
  PathCheck retains its stricter 10 MiB/20-page boundary and bounded output.
  Native PDF processing includes visual content; scanned-input accuracy still
  needs measurement. Source: [document understanding](https://aistudio.google.com/docs/document-processing).
- Unpaid submissions and responses may improve Google products and receive human
  review; sensitive/personal information must not be submitted. Regional and
  paid-service exceptions require their own applicability review. Synthetic-only
  testing does not authorize real student records. Inline submission avoids the
  Files API but does not negate Google's data-use/retention terms.
  Source: [terms](https://aistudio.google.com/docs/terms).

## Actual project verification

The corrected private key loads through Node --env-file from the existing ignored
server file (0600). The exact-model GET and actual synthetic text/PDF generation
succeeded. The user supplied Free-tier and quota confirmation; no browser or billing
API inspection is claimed. Saved confirmation0 remains unchanged; the authorized
benchmark sets process-only confirmation1. No keys, headers, raw failures or
extracted document text are displayed or persisted in reports.

## Adapter compatibility and executable evidence

Inspected extraction branch fbe9374c40ba688be5c780f63eaf6a75e374864c:

- Provider accepts a configured exact model ID and sends inline PDF with JSON
  schema to generateContent. Raw proposed-row and deterministic normalization
  contracts need no model-specific change. Live testing found that the two large
  array maxItems wire bounds caused request rejection; the lead benchmark omits
  those grammar bounds but keeps full runtime validation. G PR8 now includes
  that correction with independent review and simulated transport regressions.
- Free execution is **not** just a model-name change: maximumCost rejects zero
  prices and ProcessingEligibility.approved requires paidProjectId. Do not fake
  paid eligibility. A reviewed local-only, fixture-restricted synthetic execution
  boundary must preserve admission, quotas, consent and fail-closed real processing.
  No public synthetic bypass is permitted. Implementation remains pending.
- Provider maps 429 to rate_limited, performs no retries/model fallback, and keeps
  credentials in server headers. Browser/client errors preserve the manual path.
- Lead ran `npm test -- --run tests/transcript/provider.test.ts tests/transcript/browser.test.ts`
  in the extraction worktree: **23 PASS / 2 files**. These use synthetic transport
  responses, not live Google; they do not establish extraction quality or access.

Next live gate: T-GEM's 15–20 labeled synthetic PDFs, zero silent omissions or
hallucinated accepted attempts, zero accepted critical-field errors, preserved
unmapped/repeated/partial rows, rejection/manual fallback and consent/security
checks. Record latency and token usage without raw content. Then test actual
PDF upload → summary → E normalization → explicit acceptance → planner.
