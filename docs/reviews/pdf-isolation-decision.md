# PDF parsing isolation — approved local implementation

Status: APPROVED for local implementation/synthetic tests by the human on2026-11-13; implemented in PR15 `ba2e325`; actual container tests and one live synthetic integration passed. See DECISIONS.md SEC-LOCAL-PDF-001. Existing extraction and privacy
contracts remain authoritative. No deployment, paid billing or real transcripts.

## Evidence and impact

Main `c6ab714` parses PDF object streams in-process (`pdf.ts`). The timeout race in
`handlerCore.ts`/`lifecycle.ts` can refuse later Gemini dispatch, but cannot stop
synchronous parser CPU work or allocation. Passing hung-Promise tests does not
establish resource termination. Final audit requires adversarial CPU/memory,
cancellation and concurrent-request evidence before this gate can pass.

[Supabase's hosted limits](https://supabase.com/docs/guides/functions/limits)
state256MB memory,2sCPU/request and no Web Workers/Node vm support. The pinned
runtime exposes worker creation to its privileged MAIN runtime, not ordinary
hosted function code. Whole-function supervisor limits are not evidence of an
independently terminated per-request parser. Local CLI `oneshot` is not a hosted
isolation guarantee. G's read-only inspection verified CLI3.1.0; no local Edge
runtime image/Deno binary is installed. No service was changed for this inspection.

## Recommended bounded correction

Approve a separate, constrained PDF parser execution boundary, first implemented
and tested **locally only**. Keep Supabase authentication/admission/replay/quota
storage, consent, exact model, deterministic normalization and academic authority
unchanged. This changes runtime/data flow, so AGENTS/engineering escalation requires
human approval before implementation.

The parser receives only admitted PDF bytes and returns a bounded validation/page
summary. It cannot call Gemini, the database or any network endpoint. For local
verification, use one disposable process/container per inspection with an actual
memory ceiling, CPU limit and parent-enforced wall timeout/cancel termination;
no shared parser workers, no original-PDF persistence, no document logging, and
no external network. Concrete limits must be pinned and tested against the already
approved10MiB/20page envelope before acceptance; lack of resources fails closed.
Existing admission reservation and lease accounting survives killed parser work;
never reconsume a ticket or silently create a second user request.

The gateway continues to own server identity and bot enforcement. This proposal
neither selects a hosting vendor nor authorizes production infrastructure or cost.
A hosted implementation must independently demonstrate equivalent isolation and
privacy before any public/real-data enablement. Do not downgrade the requirement
by relabeling whole-function limits as per-request isolation.

## Acceptance evidence required

- Actual CPU and compressed-object allocation stress kills parsing within bounds.
- Cancel stops the worker; no provider dispatch follows failure/termination.
- One failed parser cannot corrupt another request; next valid synthetic PDF works.
- Memory/CPU/wall limits are measured, not merely timer assertions.
- Logs/temporary resources contain no retained PDF/text; no parser network access.
- Admission remains consumed/charged correctly, concurrency recovers through the
  approved durable lease, and replay/revocation/security suites still pass.
- Existing synthetic corpus and browser workflow remain correct; no paid fallback.

Local implementation evidence: PR15 actual Docker suite10 PASS, all16containers
removed; lead live browser/SQL/Gemini success1 PASS with confirmed parser cleanup.
Human PR15 acceptance is NOT RUN. Public/hosted integration remains an engineering
gate BLOCKED, separate from release-only real-transcript terms, hosted configuration
and human deployment approval. Safe Edge entry/module-resolution work can proceed independently with
processing disabled; no new credentials are needed for that work.
