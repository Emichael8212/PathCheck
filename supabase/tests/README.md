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
# dedicated Colima stack of docs/testing/local-security.md, only after lead coordination
DOCKER_CONTEXT=colima-pathcheck-test supabase db reset --network-id pathcheck-local-only   # CLI 3.1: no --local flag
DOCKER_CONTEXT=colima-pathcheck-test supabase test db --network-id pathcheck-local-only   # 004 ok 1..137, 005 ok 1..62
bash supabase/tests/admission/concurrency.sh   # live multi-backend races, self-cleaning
```

**Lead-run automated evidence (not human acceptance).** On the isolated loopback-only local stack
(no secrets or real data): `supabase db reset --network-id pathcheck-local-only`; `supabase test db`
→ 5 files, 371 assertions, PASS; `bash -n concurrency.sh` PASS; `concurrency.sh` (real Postgres,
12 workers) → winners replay 1 / session 1 / network 3 / budget 5; dispatch_vs_revoke 6 pairs
(5 dispatch-first, 1 revoke-first); retry_vs_revoke 6 pairs (2 recheck-first, 4 revoke-first);
22 stored reservations; cleanup 0 left; PASS. Human acceptance: NOT RUN.

**Pinned target (no overrides).** The race script uses only `docker --host
unix://$HOME/.colima/pathcheck-test/docker.sock` and container `supabase_db_pathcheck-local-test`.
Before its first write it verifies, read-only: no `DOCKER_HOST`/`DOCKER_TLS_VERIFY`/`DOCKER_CERT_PATH`;
`DOCKER_CONTEXT` unset or `colima-pathcheck-test`; `PATHCHECK_DB_CONTAINER` unset or the exact name;
socket is a real socket owned by the user; context `colima-pathcheck-test` endpoint equals that
socket; daemon `Name|OSType` = `colima-pathcheck-test|linux`; container running, label
`com.supabase.cli.project=pathcheck-local-test`, image `supabase/postgres:*`, no port on a non-loopback
address; DB is a primary `postgres` with `admission_private` and 7 RPCs (incl. `admission_retry_check`). Any mismatch prints
`REFUSING:` and exits 2 with nothing written. psql runs as OS user `postgres` (`docker exec -u
postgres`, local peer/trust auth); no key, URL or password is read.

**Contention is proven, not assumed.** A barrier backend takes the store advisory lock; the script
polls `pg_locks` (that exact key: `classid`/`objid` halves, `objsubid=1`) until **exactly** the N
intended workers (by `application_name`) are waiting on it, then releases. Not observed within 20 s
→ FAIL (zero contention fails). Every worker must exit 0 within 90 s; every loser must return the
exact denial reason.

Expected (N=12): `PASS s1: ... ok=1 ticket_replayed=11`, `PASS s2: ... ok=1 session_concurrency=11`,
`PASS s3: ... ok=3 network_concurrency=9`, `PASS s4: ... ok=5 daily_cost_ceiling=7`,
`PASS dispatch_vs_revoke: pairs=6 queued=12 dispatch_first=a revoke_first=b` (a+b=6; either
serialization is valid per pair: revoke-first → `consent_revoked`, cost settlement refused, release
reports `consent_revoked`; dispatch-first → `dispatched_at <= revoked_at`, cost settles,
finish reports `consent_revoked=true` so the server must suppress the result),
`PASS retry_vs_revoke: pairs=6 queued=12 recheck_first=c revoke_first=d` (c+d=6; recheck-first →
`ok` read before `revoked_at`; revoke-first → `consent_revoked`; both: reservation row physically
unchanged, later recheck `consent_revoked`, finish reports `consent_revoked=true`),
`PASS stored_reservations=22`, `cleanup: run … 0 left`, then `Result: PASS`. The verdict is printed
only after cleanup is verified; a cleanup failure or any remaining run row exits non-zero.
Failure indicators: any `not ok`, `FAIL`, `REFUSING`, `TIMEOUT`; a `42501` for service_role;
`PA001`. Workers: `PATHCHECK_RACE_PARALLEL` 6–64 (default 12).

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
| (G provider, before EACH extra egress after a transport 503) | `admission_retry_check(p_reservation_id, p_session_id, p_client_now)` → `{status:'ok'}` or `{status:'denied', reason}` |

### Bounded transport retry check (`20261114000000_admission_retry_check.sql`)

`public.admission_retry_check(p_reservation_id uuid, p_session_id uuid, p_client_now timestamptz)
returns jsonb` — SECURITY DEFINER, `search_path=''`, `service_role` only. Takes the shared store
advisory lock and DB clock (`lock_and_now`), then **only reads**. `ok` only for the same session's
`dispatched` reservation with a live DB-clock lease and unrevoked consent. Denials (existing shape):
`invalid_input`, `clock_mismatch`, `unknown_reservation` (missing or foreign), `not_retryable`
(admitted/settled/released), `lease_expired`, `consent_revoked`. It consumes no ticket, creates no
reservation, and charges/resets no quota, concurrency, cost or lease; `admission_dispatch` is
unchanged. It does not make concurrent provider requests safe: G keeps singleflight and a bounded
attempt count within the worst-case cost reserved at admission, then settles once via `finish`.
pgTAP `005` (62): signature/definer/grants, live anon/authenticated 42501, read-only body, every
denial, repeated allows with a whole-store ctid/xmin/xmax fingerprint unchanged, quota/ticket/
dispatch/settlement unaffected, revoked finish still reported. Live race: `concurrency.sh` s6.

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
