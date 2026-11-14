# Synthetic transcript benchmark and secure local configuration

**Synthetic corpus PASS:**18/18 cases, comprising16 real Gemini PDF responses and
2 malformed/encrypted preflight rejections.21/21 course attempts matched exactly;
zero omissions, extra rows or critical-field mismatches. The first10 results were
preserved; only incomplete cases11–16 were submitted in the final run.

Human-confirmed Free project; fixed gemini-3.5-flash-lite. Saved private flag0 is
unchanged; process-only1 was authorized by the explicit confirmation. No billing,
model switch, paid fallback or real student transcript. This is synthetic model
acceptance, not real-data privacy approval or a completed public upload service.

## Actual runtime and secret location

Architecture specifies a Supabase Edge Function. The preserved extraction branch
now implements a server-only Request→Response runtime/secret-reader factory.
The host gateway/listener and live free-fixture browser composition are still pending.
The lead benchmark is a local Node CLI; it does not open an HTTP endpoint. It calls
Google for raw extraction, then actual G validation and E normalization. It is not
proof of the unassembled browser/admission/Edge pipeline.

Canonical local secret file:
`/Users/_eman5michael/pathcheck-lead/supabase/functions/.env`.
This reuses [Supabase's local secrets location](https://supabase.com/docs/guides/functions/secrets).
The current Node runner must load it explicitly with `--env-file`; G runtime reads server environment values and supplies ProviderPolicy.apiKey;
the public listener/gateway remains a separate integration gate.

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

G PR8 now includes the reviewed wire correction and bounded runtime retries.
Its simulated transport and actual local HTTP/database tests verify those paths;
the earlier direct live benchmark does not independently certify the hosted handler.

## Measured complete corpus — 2026-11-13

Report `/private/tmp/pathcheck-gemini-benchmark-v1/gemini-3.5-flash-lite-attempt-1794600646577.json`.
Corpus SHA256 `7bf670dca674d235798d685de6068390a802b5747a013cb98d4b5483cff442d9`;
execution SHA256 `d6527734ea5f308db0cafa6485ea76c321b11119f76b41ca4f90bdd74591d0a9`;
extraction fingerprint `26610d180a22d7f95d66f87dcb114092b48bfff84abb3510fa1fb8ec17f2f509`.
The checkpoint retains the first10 cases' original execution hashes. Compatibility
migration reconstructed the exact8262320 benchmark source against unchanged G/E
sources and compared extraction sections, schema, prompt, scorer and corpus.
Transport-only changes do not erase successful evidence or trigger re-extraction.
Changed extraction semantics fail closed and require an explicit new evaluation.

| Fixture | Expected attempts | Extracted | Result |
|---|---:|---:|---|
| 01-standard | 2 | 2 | PASS |
| 02-multipage | 2 | 2 | PASS |
| 03-repeated-attempt | 2 | 2 | PASS |
| 04-withdrawal | 1 | 1 | PASS |
| 05-transfer | 1 | 1 | PASS |
| 06-ambiguous-grade | 1 | 1 | PASS |
| 07-in-progress | 1 | 1 | PASS |
| 08-missing-grade | 1 | 1 | PASS |
| 09-missing-credits | 1 | 1 | PASS |
| 10-empty-middle-page | 2 | 2 | PASS |
| 11-reversed-order | 2 | 2 | PASS |
| 12-totals-not-courses | 2 | 2 | PASS |
| 13-earned-before-attempted | 1 | 1 | PASS |
| 14-scanned | 2 | 2 | PASS |
| 15-empty-record | 0 | 0 | PASS |
| 16-unsupported-document | 0 | 0 | PASS |
| 17-truncated | — | No egress | PASS |
| 18-encrypted | — | No egress | PASS |

Fourteen course-bearing PDFs plus two zero-row empty/unsupported PDFs received real
model responses. The zero-row cases were safely rejected by validation. Fifteen
text-readable PDFs' attempt counts were independently checked against native PDF
text; the scanned fixture's two rows were inspected visually. Generated fixture
labels were not derived from Gemini responses.

Critical-field comparison covers code, term, attempted/earned credits, grade,
completion status and institution. Ambiguous/missing raw values remain preserved;
G/E normalization requires explicit record acceptance and retains uncertainty.
Title/provenance accuracy is outside this scorer; no real-format university support
or academic equivalence is inferred from fictional layouts.

Successful corpus responses:12,708 input/9,670 output tokens. Per-case elapsed
8.621–15.447s, median11.897s includes pacing/countTokens, not only provider latency.
The final resume made13 HTTP calls, all200; it needed zero retries. Two historical
corpus503 responses and five earlier schema400 diagnostics remain separately
recorded with source-report hashes. Historical latency/token usage not previously
recorded remains unknown; no invented totals or hidden failures. No external-service
blocker remains for this corpus.

## Retry, checkpoint and quota semantics

Benchmark:503 only, at most4 attempts and120s per HTTP operation,50s per-attempt
ceiling, exponential jitter, Retry-After seconds/date, sequential requests, abort
propagation.400/401/403/429 and rejected admission are never retried. Every outbound
attempt reserves conservative24,576 tokens and a request in persistent rolling
RPM/TPM and Pacific-day RPD accounting before egress, including failures. Other
clients' project usage remains unknown; provider429 stops the run. Atomic checkpoints
are written per attempt and completed fixture; pending transport failures never
become extraction-accuracy failures.43 deterministic regression tests PASS, including
bounded503 recovery, cancellation, Retry-After and incompatible-checkpoint refusal.
Independent review ran40 of these tests before three additional regression cases.
Live503 recovery was not observed in the final run; do not conflate simulations
with the real successful extraction measurements.

The standalone benchmark consumes no application admission tickets. Application
runtime separately allows at most3 provider attempts within50s and an overall60s
request deadline, under one120s DB reservation. Each extra egress rechecks processing
approval, consent and lease using admission_retry_check; no new ticket, admission
or student quota is consumed. Worst-case spend for all attempts is reserved upfront;
unknown failed-attempt cost remains charged conservatively. Free synthetic provider
composition additionally requires a durable per-attempt project budget callback,
fixed model and fixture-digest allowlist. No synthetic mode enables public real-data
processing. Failed retries return temporary-unavailable/manual entry, never rows.
