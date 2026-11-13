# Gemini free-tier verification — 2026-11-13

Public documentation verified; project access and live accuracy **BLOCKED**.
This is research evidence, not a completed T-GEM benchmark or processing approval.
User direction is DECISIONS.md GEM-001.

## Publicly documented candidates

Google lists Standard input/output as free for the models below in its
[pricing](https://aistudio.google.com/docs/pricing). Public eligibility does not
prove this project's access. All listed model pages document PDF/image input,
text output, structured outputs, 1,048,576 input and 65,536 output tokens.

| Exact model ID | Role in evaluation |
|---|---|
| [`gemini-3.5-flash-lite`](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite) | Recommended initial synthetic benchmark: documented document-parsing focus and low latency. Accuracy unmeasured. |
| [`gemini-3.8-flash`](https://aistudio.google.com/docs/models/gemini-3.8-flash) | More capable Flash comparison if Lite misses the approved accuracy gates; not an automatic fallback. |
| [`gemini-3.6-flash`](https://aistudio.google.com/docs/models/gemini-3.6-flash) | Previous-generation Flash alternative, not preferred over current candidates. |
| [`gemini-3.1-flash-lite`](https://aistudio.google.com/docs/models/gemini-3.1-flash-lite) | Earlier lightweight alternative, subject to project verification. |
| [`gemini-2.5-flash-lite`](https://aistudio.google.com/docs/models/gemini-2.5-flash-lite) | Legacy access restricted to prior active users; not assumed usable by a new project. |

Do not configure `gemini-2.5-flash`: current pricing documents deprecation,
removal from AI Studio selection and automatic routing to 3.5 Flash-Lite from
December 1, 2026. Avoid deprecated aliases and unreviewed model transitions.

## Limits, billing and privacy

- Exact RPM, input TPM and RPD for every candidate: **UNVERIFIED**. Google directs
  users to [AI Studio active limits](https://aistudio.google.com/rate-limit).
  Limits apply per project; daily reset is midnight Pacific; capacity is not
  guaranteed. Grounding search allowances are not extraction-request quotas.
  Source: [rate limits](https://aistudio.google.com/docs/rate-limits).
- Free tier generally requires an active eligible project, not paid billing;
  some projects require verification. This project's billing status is unknown.
  Inspect Projects → Billing Tier without selecting setup/upgrade.
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

## Actual project verification blocker

No browser connection was listed; native Chrome access returned Computer Use
permissions not granted. Presence-only checks found GEMINI_API_KEY and
GOOGLE_API_KEY unset in this process. No credential contents were inspected.
No project identity, model-access list, quota, billing tier or live response has
been verified. This is an access blocker, not evidence that free tier is inadequate.

When access is available: verify Free tier and active quota for the same project;
use server-only credentials with the authenticated
[models endpoint](https://aistudio.google.com/api-reference/models), retain only
IDs/capabilities/token limits, then make a bounded synthetic request. Listing a
model alone does not establish available quota or successful PDF/JSON generation.
Never print credentials, request headers or raw provider failures.

## Adapter compatibility and executable evidence

Inspected extraction branch fbe9374c40ba688be5c780f63eaf6a75e374864c:

- Provider accepts a configured exact model ID and sends inline PDF with JSON
  schema to generateContent. Raw proposed-row and deterministic normalization
  contracts need no model-specific change. Live schema compatibility is NOT RUN.
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
