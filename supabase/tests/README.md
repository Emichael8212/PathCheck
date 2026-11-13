# S — database authorization tests

Real RLS/grants evidence requires a real Postgres with Supabase Auth. Unit tests under
`tests/persistence` and `tests/auth` use fetch doubles and are **not** RLS proof.

Run only against a **local or disposable test** stack — never production.

```sh
supabase start            # needs Docker + Supabase CLI; uses lead-owned supabase/config.toml
supabase db reset         # applies supabase/migrations
supabase test db          # pgTAP: 001 (68) + 002 quota/amr/anon (51) + 003 null/missing-key shape (53)

PATHCHECK_LIVE_SUPABASE_URL=http://127.0.0.1:54321 \
PATHCHECK_LIVE_SUPABASE_PUBLISHABLE_KEY=<local publishable/anon key from `supabase status`> \
npx vitest run tests/persistence/live.supabase.test.ts   # two real users + anon over REST
```

Expected: pgTAP `001_plans_rls` ok (1..68) and `002_plans_quota_amr_anon` ok (1..51) and `003_plans_null_shape` ok (1..53), `Result: PASS`; live suite `1 passed` (not skipped).
Failure indicators: any `not ok`, `42501` where success is expected, a cross-owner row
returned, a conflict that overwrote data, or `delete_my_account` failing with a privilege
error on `auth.users` (then account deletion must move to a lead-owned privileged
function). Return the pg_prove summary and vitest summary only — no tokens, keys or emails.

## Transcript admission store (`20261113000000_transcript_admission.sql`)

Server-only shared store for G's guest Gemini admission (ARCHITECTURE §8). Tables are in
`admission_private`, which no API role can use (RLS on, no policies). Six `public.admission_*`
SECURITY DEFINER RPCs are executable **only by `service_role`**. Decisions use the DB clock;
the caller's `p_client_now` is only checked (±30 s) and a mismatch fails closed. A global
transaction advisory lock serializes every mutation across instances. Stored: UUIDs, SHA-256
digests, keyed network key (shape rejects IP literals), times, integer micro-USD. No PDF, text,
rows, bot token or raw IP.

```sh
# same local stack as above (after lead coordination)
supabase db reset && supabase test db        # adds 004_admission_store ok (1..137)
bash supabase/tests/admission/concurrency.sh # live multi-backend races via docker exec, self-cleaning
```

Expected: `004_admission_store` 1..137 all ok; race script prints `PASS replay_same_ticket ok=1`,
`PASS session_concurrency ok=1`, `PASS network_concurrency ok=3`, `PASS daily_cost_ceiling ok=5`,
`PASS stored_reservations=10`, `Result: PASS` with `queued_at_barrier` > 0 (workers truly
contended). Failure indicators: any `not ok`; a race `ok` count above the expected bound; a
`42501` for service_role; `PA001` (non READ COMMITTED caller); `WARNING: cleanup ... failed`.
The script defaults to container `supabase_db_pathcheck-local-test` (`PATHCHECK_DB_CONTAINER`),
12 workers (`PATHCHECK_RACE_PARALLEL`, 6–64). It refuses non-`supabase_db_*` containers.

pgTAP coverage: grants/ACL/RLS/definer/search_path and stored-column whitelist; live 42501 for
anon/authenticated on all RPCs/tables and service_role on tables; issue single-use attestation/
ticket/receipt, clock mismatch, 300 s lifetime, IP-literal key; admit forged/foreign/
mismatched document/receipt/network/claims, burn-on-attempt, replay, DB-clock expiry, revoked
ticket; session 1 concurrent / 3 per rolling hour; network 3 concurrent / 20 per hour incl.
key rotation; lease recovery; revocation before dispatch; idempotent/conflicting settlement,
over-reservation refusal, revoked-after-dispatch flag; daily UTC ceiling boundaries, expired
undispatched lease releases cost, dispatched lease keeps cost, cross-day settlement stays in
the original day; guard triggers; purge without replay/resurrection.

### Proposed private RPC adapter (for L review — not adopted; G files unchanged)

The adapter implements G's `AdmissionStore` server-side with the service-role client (never in
browser code). `GuestAdmissionService` and `src/contracts` stay unchanged. Every call passes
`p_client_now = new Date().toISOString()` **taken at call time**.

| `AdmissionStore` | RPC (named params) |
|---|---|
| `issue({claims, consentReceipt, attestationDigest, networkKey})` | `admission_issue(p_ticket_id=claims.ticketId, p_session_id=claims.sessionId, p_consent_receipt_id=claims.consentReceiptId, p_document_digest=claims.documentDigest, p_disclosure_version=consentReceipt.disclosureVersion, p_claims_issued_at=claims.issuedAt, p_claims_expires_at=claims.expiresAt, p_attestation_digest, p_network_key, p_client_now)` |
| `admit({claims, networkKey, dailyCostCeilingMicrousd, reservationMicrousd, leaseExpiresAt})` | `admission_admit(p_ticket_id, p_session_id, p_consent_receipt_id, p_document_digest, p_claims_issued_at, p_claims_expires_at, p_network_keys=[current] or [current, previous], p_daily_ceiling_microusd, p_reservation_microusd, p_lease_seconds=120, p_client_now)` → `{status:'ok', reservation_id, lease_expires_at}` |
| `dispatch({reservationId, sessionId})` | `admission_dispatch(p_reservation_id, p_session_id, p_client_now)` |
| `revoke({consentReceiptId, sessionId})` | `admission_revoke(p_consent_receipt_id, p_session_id, p_client_now)` → `{status:'ok', already_revoked}` |
| `finish({reservationId, actualCostMicrousd, outcome})` | `admission_finish(p_reservation_id, p_actual_microusd, p_outcome, p_client_now)` → `{status:'ok', replayed, consent_revoked, cost_day}` |
| (scheduled job, L) | `admission_purge(p_client_now)` — removes rows older than 2 days |

Result mapping: `ok` → `{ok:true}`; `denied` → `forbidden`/`admission_denied`; `rate_limited` →
`rate_limited`/`admission_denied`; `conflict` → `conflict`; any thrown error, transport failure,
non-2xx or unrecognized body → `unavailable`/`admission_store_unavailable` (fail closed). The
`reason` field is a fixed non-sensitive code, safe for server metrics, never for the browser.

Requests for L/G (no change made here):
1. **Clock at call time.** `handler.ts` passes request-start `time` to `admit` after reading up
   to 10 MiB; a slow upload (>30 s) fails closed as `clock_mismatch`. Pass a fresh `now()`.
2. **Lease duration, not instant.** `admit.leaseExpiresAt` becomes `p_lease_seconds` (30–300);
   the DB computes expiry on its own clock.
3. **Network-key rotation.** Pass the previous rotation key too, or rolling windows reset at
   each rotation (both keys are counted; a ticket bound to either key is accepted).
4. **Revoked-after-dispatch.** `finish` returns `consent_revoked`; adopting G's README amendment
   lets the server withhold the provider result.
5. **Ticket burn.** Once a live ticket is presented by its own session, any later denial (binding,
   quota, cost) consumes it; a retry needs a new bot-verified ticket.
6. **Isolation.** The RPCs refuse non-READ COMMITTED transactions (`PA001`); PostgREST's default
   is compatible.
