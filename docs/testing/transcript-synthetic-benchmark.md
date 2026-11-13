# Synthetic transcript benchmark and secure local configuration

Status: live API **BLOCKED** pending the human's server-side key configuration.
No Google call has run. No human upload acceptance is claimed.

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
env -u GEMINI_API_KEY -u GOOGLE_API_KEY -u PATHCHECK_GEMINI_MODEL -u PATHCHECK_GEMINI_FREE_TIER_CONFIRMED \
  node --env-file=/Users/_eman5michael/pathcheck-lead/supabase/functions/.env \
  tests/e2e/transcript-benchmark/run.mjs --live --access-only
```

This checks the exact model metadata, counts tokens and attempts one actual
structured synthetic PDF extraction. Access-only is never a full benchmark PASS.
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

The public endpoint still fails closed under its approved paid/real-data eligibility
contract. A reviewed fixture-restricted synthetic runtime, actual admission adapter,
trusted network rotation, current DB timestamps, post-dispatch revoke handling and
runtime resource isolation remain separate work. No fake paid approval is used.
