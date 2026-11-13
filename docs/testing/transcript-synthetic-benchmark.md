# Synthetic transcript benchmark and secure local configuration

The human confirmed the corrected key's project is on the Free tier. This is
user-attested billing evidence; model metadata does not expose billing status.
The saved confirmation flag remains0. Explicit process-only confirmation permits
this authorized synthetic run without changing the private file or billing.
Authenticated model metadata, a text generation control, a simple PDF/JSON control
and one full structured PDF extraction PASS on gemini-3.5-flash-lite. The initial
API_KEY_INVALID is resolved. Partial full-corpus results are recorded below;
neither an access-only pass nor synthetic accuracy establishes browser acceptance.

## Actual runtime and secret location

Architecture specifies a Supabase Edge Function. The preserved extraction branch
implements a handler/provider factory, but has no runnable index/secret loader yet.
The lead benchmark is a local Node CLI; it does not open an HTTP endpoint. It calls
Google for raw extraction, then actual G validation and E normalization. It is not
proof of the unassembled browser/admission/Edge pipeline.

Canonical local secret file:
`/Users/_eman5michael/pathcheck-lead/supabase/functions/.env`.
This reuses [Supabase's local secrets location](https://supabase.com/docs/guides/functions/secrets).
The current Node runner must load it explicitly with `--env-file`; the pending Edge
entry must read server environment values and supply ProviderPolicy.apiKey.

Expected values (human supplies the key privately; never commit this file):

```dotenv
GEMINI_API_KEY=<human enters privately>
PATHCHECK_GEMINI_MODEL=gemini-3.5-flash-lite
PATHCHECK_GEMINI_FREE_TIER_CONFIRMED=1
```

`GEMINI_API_KEY` is read only by the server test runner. The provider takes a private
injected key. Do not use a VITE_ prefix or root browser example. Git check-ignore
verified `.gitignore:69:.env`; git ls-files found no tracked secret file. Before key
entry, Node --env-file loading passed with a synthetic sentinel; a built integrated
browser bundle did not contain that sentinel. No React/Vite code imports the secret
or provider. This is current-source evidence, not certification of future Edge wiring.

## Reproducible local test preparation

Requires Python3.9+ and Node24–26. In a composed L/E/G checkout:

```sh
python3 -m venv /private/tmp/pathcheck-pdf-benchmark-tools
/private/tmp/pathcheck-pdf-benchmark-tools/bin/pip install reportlab==4.5.1 PyMuPDF==1.26.5
npm ci --ignore-scripts
npm run test:transcript-benchmark
node tests/e2e/transcript-benchmark/run.mjs
```

Generator reads no external PDFs. It produces 18 fictional PDFs in
`/private/tmp/pathcheck-gemini-benchmark-v1`, their expected rows, hashes and renders.
Cases cover standard, multi-page, repeat, withdrawal, transfer, ambiguous grade,
in-progress, missing fields, empty middle page, ordering, totals, swapped credit
columns, scanned input, empty/unsupported documents, truncation and encryption.
The deterministic corpus and its 19 readable page renders were inspected. This is
a synthetic layout corpus, not independently established ASU transcript support.

Preflight uses the actual G parser: 16 valid PDFs PASS; truncated/encrypted rejected
without egress PASS. Model extraction remains NOT RUN in preflight mode.

After the human creates the private file, lead runs from the composed checkout:

```sh
env -u GEMINI_API_KEY -u GOOGLE_API_KEY -u PATHCHECK_GEMINI_MODEL PATHCHECK_GEMINI_FREE_TIER_CONFIRMED=1 \
  node --env-file=/Users/_eman5michael/pathcheck-lead/supabase/functions/.env \
  tests/e2e/transcript-benchmark/run.mjs --live --access-only
```

This checks the exact model metadata, counts tokens and attempts one actual
structured synthetic PDF extraction. Access-only is never a full benchmark PASS.
The explicit confirmation value is authorized by the human's Free-tier verification;
do not use it for a different/unverified project.
For the complete corpus, repeat without `--access-only`. Only after a completed
matching primary benchmark has an actual model-quality failure, add `--compare`
to run 3.8 on identical fixtures. No automatic fallback, retry or billing change.

## Evidence semantics and bounds

All calls are paced below the user-reported RPM; input capped at16,384 tokens and
output at8,192. Local daily accounting conservatively counts metadata/token calls
too, so the 20-call Flash budget can require multiple Pacific days. Actual429 stops
the run; no bypass/retry. Other project clients' consumption is unknown. The local
cap is not the production distributed admission store.

Resume checks corpus and execution hashes including code/prompt/schema/config and
actual engine/validator sources. Unknown/duplicate/changed cases are discarded.
Final PASS requires the exact complete case set. Integration exceptions cannot
qualify a model comparison. Reports contain counts, timing, model and token metadata,
never keys, raw outputs or document contents. They live outside Git with0600 mode.

Strict multiset comparison requires every attempt and critical raw field, including
institution, to match. Missing/extra rows and changed codes/terms fail; ambiguous
alignment is reported separately, never as zero errors. Title and per-row provenance
accuracy are not yet scored. Normalization checks record count, uncertainty and
explicit acceptance; academic-rule correctness remains covered by engine tests.
No T-GEM or end-to-end completion until actual provider and pipeline gates pass.

## Live request correction and production handoff

The original wire schema returned HTTP400 INVALID_ARGUMENT at generateContent;
metadata and countTokens succeeded. Removing the body model field or the schema
dialect annotation did not resolve it. Keeping the same prompt, model, PDF and
schema while removing only the two maxItems1000 wire constraints succeeded.
`wireSchema.mjs` therefore leaves these bounds to the unchanged original Zod
validator. Required keys, raw field types, page bounds and all local limits remain.
Oversized responses still fail before G validation or E normalization. The full
response byte cap applies to both successful and error bodies; diagnostics use
exact allowlists and never preserve Google's raw text.

Google documents that complex decoding schemas can return400 and recommends
application-side validation when simplifying the grammar:
[structured-output limitations](https://aistudio.google.com/docs/structured-output#limitations).
26 scorer/evidence/diagnostic/wire-schema tests PASS. Independent static review
found no remaining blocker in these lead-owned changes; reviewer ran no API calls.

The G-owned provider at fbe9374 still sends the original bounds. Its owner must
port and test this transport correction before claiming production pipeline
compatibility. The lead benchmark does not modify or certify that provider.

## Measured partial corpus — 2026-11-13

**BLOCKED by Google HTTP503 at generateContent.** Initial run completed cases01–08;
one bounded resume reused their exact corpus/execution fingerprints and completed
09–10 before another503. No further live retry or alternate model was attempted.
Cases01–10 PASS:14 expected/14 extracted/14 exact attempts,0 missing,0 unexpected,
0 critical-field errors,0 unalignable mismatches. Coverage and actual G/E
normalization checks PASS for each. Completed requests consumed8,550 input and6,411
output tokens; per-case elapsed11.010–15.447s includes local pacing/token-count work,
not just provider latency. Failed attempts/control requests are excluded from those
totals but included in the local daily call budget.

Remaining live cases11–16 are NOT RUN to completion;17–18 malformed/encrypted
preflight rejections previously PASS without provider egress. This is not full
T-GEM accuracy acceptance, scanned-input approval or human browser acceptance.

Private non-sensitive report:
`/private/tmp/pathcheck-gemini-benchmark-v1/gemini-3.5-flash-lite-attempt-1794599892630.json`.
Corpus SHA256 `7bf670dca674d235798d685de6068390a802b5747a013cb98d4b5483cff442d9`;
execution SHA256 `866917e1e1880ad7ae7f8f6557395ed14aa79c9d345f26fe3abcf79dd8697a90`.
The same full-run command resumes only fingerprint-matching completed cases.
Do not label service errors as model-quality failures or trigger a model comparison.

The public endpoint still fails closed under its approved paid/real-data eligibility
contract. A reviewed fixture-restricted synthetic runtime, actual admission adapter,
trusted network rotation, current DB timestamps, post-dispatch revoke handling and
runtime resource isolation remain separate work. No fake paid approval is used.
