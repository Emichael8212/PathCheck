#!/usr/bin/env bash
# PathCheck S: live multi-backend race test for the transcript admission store.
#
# LOCAL DISPOSABLE Supabase CLI stack only (`supabase start` + `supabase db reset`). It talks to the
# database solely through `docker exec <local db container> psql` as the container's local postgres
# user: no URL, key or password is read or needed, and it cannot target a hosted project.
# Synthetic UUIDs/digests only. Every row it creates carries a random run prefix and is deleted on exit.
#
# Each scenario: N parallel psql backends (as service_role) queue behind a held barrier on the store's
# advisory lock, are released at once, and race one admission constraint:
#   1 same ticket replay           -> exactly 1 ok
#   2 one session, N tickets       -> exactly 1 ok   (1 concurrent/session)
#   3 one network, N sessions      -> exactly 3 ok   (3 concurrent/network)
#   4 daily cost ceiling +5 slots  -> exactly 5 ok   (ceiling = today's committed + 5 x reservation)
# Usage: supabase/tests/admission/concurrency.sh   (env: PATHCHECK_DB_CONTAINER, PATHCHECK_RACE_PARALLEL)
set -euo pipefail

CONTAINER="${PATHCHECK_DB_CONTAINER:-supabase_db_pathcheck-local-test}"
N="${PATHCHECK_RACE_PARALLEL:-12}"
LOCK_KEY="hashtextextended('pathcheck.transcript_admission.v1', 0)"
RESERVE=1000

case "$CONTAINER" in supabase_db_*) ;; *) echo "refusing: container must be a local supabase_db_* container" >&2; exit 2 ;; esac
[[ "$N" =~ ^[0-9]+$ ]] && (( N >= 6 && N <= 64 )) || { echo "PATHCHECK_RACE_PARALLEL must be 6..64" >&2; exit 2; }
docker inspect "$CONTAINER" >/dev/null 2>&1 || { echo "container $CONTAINER not running (supabase start)" >&2; exit 2; }

RUN="$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
TMP="$(mktemp -d)"
FAILED=0

psql_c() { docker exec "$CONTAINER" psql -X -q -tA -v ON_ERROR_STOP=1 -U postgres -d postgres -c "set timezone = 'UTC'" "$@"; }
uid() { printf '%s-%s-4000-8000-%012x' "$RUN" "$1" "$2"; }   # $1 kind (0001 ticket, 0002 receipt, 0003 session)
net() { printf 'race_%s_%032d' "$RUN" "$1"; }

cleanup() {
  psql_c -c "delete from admission_private.reservations where session_id::text like '${RUN}-%';
             delete from admission_private.tickets where session_id::text like '${RUN}-%';
             delete from admission_private.consent_receipts where session_id::text like '${RUN}-%';" >/dev/null \
    || echo "WARNING: cleanup of run ${RUN} failed" >&2
  rm -rf "$TMP"
}
trap cleanup EXIT

# issue <n> <session n> <network n>  -> prints "issued|expires" (DB clock, millisecond precision)
issue() {
  local out
  out="$(psql_c -c "set role service_role" -c "
    with x as (select date_trunc('milliseconds', clock_timestamp()) t)
    select (public.admission_issue('$(uid 0001 "$1")', '$(uid 0003 "$2")', '$(uid 0002 "$1")',
              encode(sha256(convert_to('race-doc', 'UTF8')), 'hex'), 'disclosure-v1', x.t, x.t + interval '300 seconds',
              encode(sha256(convert_to('race-att-${RUN}-$1', 'UTF8')), 'hex'), '$(net "$3")', x.t) ->> 'status')
           || '|' || x.t || '|' || (x.t + interval '300 seconds') from x")"
  [[ "$out" == ok\|* ]] || { echo "issue $1 failed: $out" >&2; exit 1; }
  printf '%s' "${out#ok|}"
}

# admit_sql <n> <session n> <network n> <ceiling> <claims "issued|expires">
admit_sql() {
  local issued="${5%%|*}" expires="${5#*|}"
  printf "select coalesce(r ->> 'reason', r ->> 'status') from (select public.admission_admit('%s', '%s', '%s', encode(sha256(convert_to('race-doc', 'UTF8')), 'hex'), '%s', '%s', array['%s'], %s, %s, 120, clock_timestamp())) q(r)" \
    "$(uid 0001 "$1")" "$(uid 0003 "$2")" "$(uid 0002 "$1")" "$issued" "$expires" "$(net "$3")" "$4" "$RESERVE"
}

# race <name> <expected ok> <sql file>...  : hold the store lock, start all workers, release, count ok.
race() {
  local name="$1" expected="$2"; shift 2
  psql_c -c "select pg_advisory_lock($LOCK_KEY)" -c "select pg_sleep(4)" -c "select pg_advisory_unlock($LOCK_KEY)" >/dev/null &
  local barrier=$! tries=0
  until [[ "$(psql_c -c "select count(*) from pg_locks where locktype = 'advisory' and granted")" -ge 1 ]]; do
    (( ++tries > 50 )) && { echo "barrier lock not observed" >&2; exit 1; }
    sleep 0.1
  done
  local i=0 pids=()
  for sql in "$@"; do
    i=$((i + 1))
    psql_c -c "set role service_role" -c "$(cat "$sql")" > "$TMP/$name.out.$i" 2>&1 &
    pids+=($!)
  done
  sleep 1
  local waiting
  waiting="$(psql_c -c "select count(*) from pg_locks where locktype = 'advisory' and not granted")"
  for p in "${pids[@]}"; do wait "$p" || true; done
  wait "$barrier"
  local ok others
  ok="$(cat "$TMP/$name".out.* | grep -cx 'ok' || true)"
  others="$(cat "$TMP/$name".out.* | grep -vx 'ok' | sort | uniq -c | tr -s ' ' | paste -sd ',' - || true)"
  if [[ "$ok" == "$expected" ]]; then
    echo "PASS $name: ok=$ok expected=$expected workers=$# queued_at_barrier=$waiting others=[${others}]"
  else
    echo "FAIL $name: ok=$ok expected=$expected workers=$# queued_at_barrier=$waiting others=[${others}]"
    FAILED=1
  fi
}

CEIL_BIG=1000000000

# 1. Concurrent replay of a single ticket.
claims="$(issue 1 1 1)"
for i in $(seq 1 "$N"); do admit_sql 1 1 1 "$CEIL_BIG" "$claims" > "$TMP/s1.$i.sql"; done
race replay_same_ticket 1 "$TMP"/s1.*.sql

# 2. One session, N distinct tickets on distinct networks.
for i in $(seq 1 "$N"); do t=$((100 + i)); c="$(issue "$t" 100 "$t")"; admit_sql "$t" 100 "$t" "$CEIL_BIG" "$c" > "$TMP/s2.$i.sql"; done
race session_concurrency 1 "$TMP"/s2.*.sql

# 3. One network, N distinct sessions.
for i in $(seq 1 "$N"); do t=$((200 + i)); c="$(issue "$t" "$t" 200)"; admit_sql "$t" "$t" 200 "$CEIL_BIG" "$c" > "$TMP/s3.$i.sql"; done
race network_concurrency 3 "$TMP"/s3.*.sql

# 4. Daily cost: ceiling leaves room for exactly five reservations today (UTC), whatever exists already.
committed="$(psql_c -c "select coalesce(sum(case state when 'settled' then actual_microusd when 'released' then 0
  when 'dispatched' then reserved_microusd else case when lease_expires_at > clock_timestamp() then reserved_microusd else 0 end end), 0)
  from admission_private.reservations where cost_day = (clock_timestamp() at time zone 'UTC')::date")"
ceiling=$((committed + 5 * RESERVE))
for i in $(seq 1 "$N"); do t=$((300 + i)); c="$(issue "$t" "$t" "$t")"; admit_sql "$t" "$t" "$t" "$ceiling" "$c" > "$TMP/s4.$i.sql"; done
race daily_cost_ceiling 5 "$TMP"/s4.*.sql

# Post-condition: stored state agrees (one reservation per ok, ticket consumed exactly once).
stored="$(psql_c -c "select count(*) from admission_private.reservations where session_id::text like '${RUN}-%'")"
if [[ "$stored" == "10" ]]; then echo "PASS stored_reservations=10"; else echo "FAIL stored_reservations=$stored expected=10"; FAILED=1; fi

[[ "$FAILED" == 0 ]] && echo "Result: PASS (run ${RUN}, cleaned up)" || echo "Result: FAIL (run ${RUN})"
exit "$FAILED"
