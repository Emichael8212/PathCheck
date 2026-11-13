#!/usr/bin/env bash
# PathCheck S: live multi-backend race test for the transcript admission store.
#
# TARGET IS PINNED (no overrides). It talks only to the dedicated Colima VM daemon at
#   unix://$HOME/.colima/pathcheck-test/docker.sock   (docker context colima-pathcheck-test)
# and only to container supabase_db_pathcheck-local-test (label com.supabase.cli.project =
# pathcheck-local-test), via `docker exec ... psql` as the container's local postgres user. No URL,
# key or password is read. It refuses DOCKER_HOST, TLS/remote daemon variables, any other
# DOCKER_CONTEXT, and any PATHCHECK_DB_CONTAINER other than the exact container. All target checks
# are read-only and complete BEFORE the first write. See docs/testing/local-security.md for the stack.
#
# Synthetic UUIDs/digests only; every row carries a random run prefix and is deleted on exit. A
# cleanup failure (or any run row left behind) makes the script exit non-zero.
#
# Each race: a barrier backend takes the store's advisory lock; N worker backends (service_role) are
# started and the script polls pg_locks until EXACTLY the N intended workers (by application_name)
# are waiting on THAT lock key; only then is the barrier released. No fixed sleep is assumed: if the
# queue is not observed within the bounded wait, the race fails (zero contention = FAIL). Every
# worker must exit 0 and every loser must return the exact expected denial reason.
#   1 replay_same_ticket     N admits of one ticket          -> 1 ok, N-1 ticket_replayed
#   2 session_concurrency    one session, N tickets          -> 1 ok, N-1 session_concurrency
#   3 network_concurrency    one network, N sessions         -> 3 ok, N-3 network_concurrency
#   4 daily_cost_ceiling     ceiling = committed + 5 slots   -> 5 ok, N-5 daily_cost_ceiling
#   5 dispatch_vs_revoke     N/2 pairs: dispatch(reservation) races revoke(its consent receipt).
#       revoke first   -> dispatch consent_revoked; reservation stays undispatched; a cost settlement
#                         is refused (invalid_settlement); release 0/failed ok, consent_revoked=true
#       dispatch first -> dispatch ok; dispatched_at <= revoked_at; provider cost settles (ok) and
#                         finish reports consent_revoked=true so the server suppresses the result
#     Either serialization is accepted per pair; anything else fails.
#   6 retry_vs_revoke    N/2 pairs on a DISPATCHED reservation: admission_retry_check races revoke.
#       Each retry worker also reports clock_timestamp() taken after the check returned, while it still
#       holds the store lock (released only at its commit).
#       retry first  -> ok and that time <= revoked_at      revoke first -> consent_revoked, revoked_at <= that time
#     Both: reservation row physically unchanged (ctid/xmin/xmax/state/dispatch/lease/cost), a later
#     recheck is consent_revoked, and finish reports consent_revoked=true.
# Usage: bash supabase/tests/admission/concurrency.sh   (env: PATHCHECK_RACE_PARALLEL 6..64, default 12)
set -euo pipefail
umask 077
trap '' PIPE   # a dead barrier psql must surface as a write error (-> cleanup), not a silent SIGPIPE

readonly PROFILE="pathcheck-test"
readonly CONTEXT_NAME="colima-${PROFILE}"
readonly SOCK="${HOME}/.colima/${PROFILE}/docker.sock"
readonly DOCKER_URL="unix://${SOCK}"
readonly PROJECT="pathcheck-local-test"
readonly CONTAINER="supabase_db_${PROJECT}"
readonly LOCK_KEY="hashtextextended('pathcheck.transcript_admission.v1', 0)"
readonly RESERVE=1000 CEIL_BIG=1000000000
readonly WAIT_SECS=20     # bound for barrier/queue observation; < the store's 30 s caller-clock tolerance
readonly WORKER_SECS=90   # bound for workers to finish after release (statement/lock timeout 60 s)
N="${PATHCHECK_RACE_PARALLEL:-12}"

die() { echo "REFUSING: $*" >&2; exit 2; }   # preflight only: nothing has been written
fail() { echo "FAIL: $*" >&2; exit 1; }      # after writes: EXIT trap still cleans up

# ---------------------------------------------------------------- preflight (read-only) ----------
[[ -z "${DOCKER_HOST:-}" ]] || die "DOCKER_HOST is set; this script only uses ${DOCKER_URL}"
for v in DOCKER_TLS_VERIFY DOCKER_CERT_PATH; do [[ -z "${!v:-}" ]] || die "${v} is set (TLS/remote daemon)"; done
case "${DOCKER_CONTEXT:-}" in "" | "$CONTEXT_NAME") ;; *) die "DOCKER_CONTEXT=${DOCKER_CONTEXT} is not ${CONTEXT_NAME}" ;; esac
[[ -z "${PATHCHECK_DB_CONTAINER:-}" || "${PATHCHECK_DB_CONTAINER}" == "$CONTAINER" ]] \
  || die "PATHCHECK_DB_CONTAINER override not allowed (only ${CONTAINER})"
unset DOCKER_CONTEXT
[[ "$N" =~ ^[0-9]+$ ]] && (( N >= 6 && N <= 64 )) || die "PATHCHECK_RACE_PARALLEL must be 6..64"
command -v docker >/dev/null || die "docker CLI not found"
[[ -S "$SOCK" && ! -L "$SOCK" && -O "$SOCK" ]] \
  || die "dedicated socket ${SOCK} missing, a symlink, or not owned by $(id -un) (colima start ${PROFILE})"

dk() { command docker --host "$DOCKER_URL" "$@"; }

ctx_host="$(command docker context inspect "$CONTEXT_NAME" --format '{{.Endpoints.docker.Host}}' 2>/dev/null)" \
  || die "docker context ${CONTEXT_NAME} not found"
[[ "$ctx_host" == "$DOCKER_URL" ]] || die "context ${CONTEXT_NAME} points at ${ctx_host}, not ${DOCKER_URL}"
daemon="$(dk info --format '{{.Name}}|{{.OSType}}' 2>/dev/null)" || die "daemon at ${DOCKER_URL} not reachable"
[[ "$daemon" == "${CONTEXT_NAME}|linux" ]] || die "daemon identity '${daemon}' is not '${CONTEXT_NAME}|linux'"

cinfo="$(dk inspect --type container \
  --format '{{.Name}}|{{.State.Running}}|{{index .Config.Labels "com.supabase.cli.project"}}|{{.Config.Image}}' \
  "$CONTAINER" 2>/dev/null)" || die "container ${CONTAINER} not found on the pinned daemon (supabase start)"
IFS='|' read -r c_name c_running c_project c_image <<<"$cinfo"
[[ "$c_name" == "/${CONTAINER}" && "$c_running" == "true" && "$c_project" == "$PROJECT" ]] \
  || die "container identity '${cinfo}' is not a running ${CONTAINER} of project ${PROJECT}"
[[ "$c_image" == *supabase/postgres:* ]] || die "container image '${c_image}' is not supabase/postgres"
binds="$(dk inspect --type container --format '{{range $p, $b := .NetworkSettings.Ports}}{{range $b}}{{.HostIp}} {{end}}{{end}}' "$CONTAINER")"
for ip in $binds; do
  case "$ip" in 127.0.0.1 | ::1) ;; *) die "container publishes a port on ${ip} (expected localhost-only)" ;; esac
done

RUN="$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
readonly RUN APP="pc_race_${RUN}"

# psql_c <application_name> <psql args...> : one backend, UTC, bounded statement/lock waits.
psql_c() {
  local app="$1"; shift
  dk exec -u postgres -e "PGAPPNAME=${app}" "$CONTAINER" psql -X -q -tA -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "set timezone = 'UTC'" -c "set statement_timeout = '60s'" -c "set lock_timeout = '60s'" "$@"
}

dbinfo="$(psql_c "${APP}_preflight" -c "select current_database() || '|' || pg_is_in_recovery()::text || '|'
  || (to_regnamespace('admission_private') is not null)::text || '|'
  || (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'admission\_%')")" \
  || die "cannot query ${CONTAINER} as local postgres"
[[ "$dbinfo" == "postgres|false|true|7" ]] \
  || die "database '${dbinfo}' is not a primary with the admission + retry_check migrations applied (7 RPCs)"
echo "target: ${DOCKER_URL} daemon=${CONTEXT_NAME} container=${CONTAINER} project=${PROJECT} db=postgres workers=${N} run=${RUN}"

# ---------------------------------------------------------------- state + cleanup ---------------
TMP="$(mktemp -d)"
MUTATED=0 FAILED=0 BARRIER_OPEN=0 BARRIER_PID="" WORKER_PIDS=""

run_rows_sql="(select count(*) from admission_private.reservations where session_id::text like '${RUN}-%')
  + (select count(*) from admission_private.tickets where session_id::text like '${RUN}-%')
  + (select count(*) from admission_private.consent_receipts where session_id::text like '${RUN}-%')"

cleanup() {
  local rc=$? ok=1 left="unknown" deadline p
  trap - EXIT
  set +e
  if (( BARRIER_OPEN )); then exec 3>&-; BARRIER_OPEN=0; fi
  for p in $BARRIER_PID $WORKER_PIDS; do kill "$p" 2>/dev/null; done
  if (( MUTATED )); then
    # Killing a docker exec client need not end its backend: terminate every run backend first so
    # no queued worker can write after the delete, then delete and verify nothing is left.
    psql_c "${APP}_cleanup" -c "select count(pg_terminate_backend(pid)) from pg_stat_activity
      where application_name ~ '^${APP}_' and pid <> pg_backend_pid()" >/dev/null || ok=0
    deadline=$((SECONDS + WAIT_SECS))
    until [[ "$(psql_c "${APP}_cleanup" -c "select count(*) from pg_stat_activity
                where application_name ~ '^${APP}_' and pid <> pg_backend_pid()")" == "0" ]]; do
      (( SECONDS < deadline )) || { ok=0; break; }
      sleep 0.1
    done
    psql_c "${APP}_cleanup" -c "delete from admission_private.reservations where session_id::text like '${RUN}-%';
      delete from admission_private.tickets where session_id::text like '${RUN}-%';
      delete from admission_private.consent_receipts where session_id::text like '${RUN}-%';" >/dev/null || ok=0
    left="$(psql_c "${APP}_cleanup" -c "select ${run_rows_sql}")" || ok=0
    [[ "$left" == "0" ]] || ok=0
  fi
  rm -rf "$TMP" || ok=0
  if (( ok )); then
    (( MUTATED )) && echo "cleanup: run ${RUN} rows deleted, 0 left"
  else
    echo "FAIL cleanup: run ${RUN} not fully cleaned (rows left: ${left})"
    (( rc != 0 )) || rc=1
  fi
  # The verdict is printed only here, after cleanup was verified.
  if (( rc == 0 )); then echo "Result: PASS (run ${RUN})"; else echo "Result: FAIL (run ${RUN}, exit ${rc})"; fi
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP

# ---------------------------------------------------------------- helpers ------------------------
uid() { printf '%s-%s-4000-8000-%012x' "$RUN" "$1" "$2"; }   # $1 kind: 0001 ticket, 0002 receipt, 0003 session
net() { printf 'race_%s_%032d' "$RUN" "$1"; }
DOC_SQL="encode(sha256(convert_to('race-doc', 'UTF8')), 'hex')"

# issue <n> <session n> <network n> -> prints "issued|expires" (ONE DB timestamp, ms precision)
issue() {
  local out
  out="$(psql_c "${APP}_setup" -c "set role service_role" -c "
    with x as materialized (select date_trunc('milliseconds', clock_timestamp()) t)
    select (public.admission_issue('$(uid 0001 "$1")', '$(uid 0003 "$2")', '$(uid 0002 "$1")', ${DOC_SQL},
              'disclosure-v1', x.t, x.t + interval '300 seconds',
              encode(sha256(convert_to('race-att-${RUN}-$1', 'UTF8')), 'hex'), '$(net "$3")', x.t) ->> 'status')
           || '|' || x.t || '|' || (x.t + interval '300 seconds') from x")" || fail "issue $1: psql error"
  [[ "$out" == ok\|* ]] || fail "issue $1 failed: ${out}"
  printf '%s' "${out#ok|}"
}

# admit_sql <n> <session n> <network n> <ceiling> <claims "issued|expires"> [id]
#   prints the reason/status, or with "id" the reservation id
admit_sql() {
  local issued="${5%%|*}" expires="${5#*|}" sel="coalesce(r ->> 'reason', r ->> 'status')"
  [[ "${6:-}" == "id" ]] && sel="coalesce(r ->> 'reservation_id', 'ERR:' || (r ->> 'reason'))"
  printf "select %s from (select public.admission_admit('%s', '%s', '%s', %s, '%s', '%s', array['%s'], %s, %s, 120, clock_timestamp())) q(r)" \
    "$sel" "$(uid 0001 "$1")" "$(uid 0003 "$2")" "$(uid 0002 "$1")" "$DOC_SQL" "$issued" "$expires" "$(net "$3")" "$4" "$RESERVE"
}
finish_sql() {   # <reservation id> <actual> <outcome> -> reason, or status|replayed|consent_revoked
  printf "select coalesce(r ->> 'reason', (r ->> 'status') || '|' || (r ->> 'replayed') || '|' || (r ->> 'consent_revoked'))
    from (select public.admission_finish('%s', %s, '%s', clock_timestamp())) q(r)" "$1" "$2" "$3"
}
as_service() { psql_c "${APP}_setup" -c "set role service_role" -c "$1"; }

# Locks on THE store key (bigint key: high half in classid, low half in objid, objsubid 1).
count_store_locks() {   # <granted true|false> <application_name regex>
  psql_c "${APP}_probe" -c "select count(*) from pg_locks l join pg_stat_activity a on a.pid = l.pid
    cross join (select ${LOCK_KEY} as k) lk
    where l.locktype = 'advisory' and l.classid = ((lk.k >> 32) & 4294967295)::oid
      and l.objid = (lk.k & 4294967295)::oid and l.objsubid = 1
      and l.granted = $1 and a.application_name ~ '$2'"
}
wait_for() {   # <description> <wanted output> <command...> : bounded poll, no fixed-sleep assumption
  local desc="$1" want="$2" got="" deadline=$((SECONDS + WAIT_SECS)); shift 2
  while :; do
    got="$("$@")" || got="error"
    [[ "$got" == "$want" ]] && { echo "  observed ${desc}: ${got}"; return 0; }
    (( SECONDS < deadline )) || { echo "  TIMEOUT ${desc}: want ${want}, last ${got}" >&2; return 1; }
    sleep 0.1
  done
}
wait_pids() {   # <seconds> <pid...> : returns 1 if any pid is still alive at the deadline
  local deadline=$((SECONDS + $1)) p alive; shift
  while :; do
    alive=0
    for p in "$@"; do kill -0 "$p" 2>/dev/null && alive=1; done
    (( alive )) || return 0
    (( SECONDS < deadline )) || return 1
    sleep 0.1
  done
}

# race <name> <sql file>... : barrier on the store lock, all N workers verified queued on it, release.
# Worker i writes $TMP/<name>.out.<i>; any worker exit != 0 or timeout fails the whole run.
race() {
  local name="$1" i=0 p rc pids="" fifo; shift
  local n=$#
  fifo="$TMP/${name}.barrier.fifo"
  mkfifo "$fifo"
  dk exec -i -u postgres -e "PGAPPNAME=${APP}_${name}_barrier" "$CONTAINER" \
    psql -X -q -tA -v ON_ERROR_STOP=1 -U postgres -d postgres <"$fifo" >"$TMP/${name}.barrier.out" 2>&1 &
  BARRIER_PID=$!
  exec 3>"$fifo"
  BARRIER_OPEN=1
  printf '%s\n' "set statement_timeout = '30s';" "select pg_advisory_lock(${LOCK_KEY});" >&3
  wait_for "barrier holding the store advisory lock" 1 count_store_locks true "^${APP}_${name}_barrier\$" \
    || fail "${name}: barrier did not acquire the store lock"

  for sql in "$@"; do
    i=$((i + 1))
    psql_c "${APP}_${name}_w${i}" -c "set role service_role" -c "$(cat "$sql")" >"$TMP/${name}.out.${i}" 2>&1 &
    pids="${pids} $!"
    WORKER_PIDS="${WORKER_PIDS} $!"
  done
  wait_for "workers queued on the store lock behind the barrier" "$n" count_store_locks false "^${APP}_${name}_w[0-9]+\$" \
    || fail "${name}: the ${n} intended workers were not all observed waiting on the store lock (no contention)"

  printf '%s\n' "select pg_advisory_unlock(${LOCK_KEY});" >&3
  exec 3>&-
  BARRIER_OPEN=0
  wait_pids "$WAIT_SECS" "$BARRIER_PID" || fail "${name}: barrier session did not exit"
  if wait "$BARRIER_PID"; then rc=0; else rc=$?; fi
  BARRIER_PID=""
  [[ $rc == 0 && "$(tail -n 1 "$TMP/${name}.barrier.out")" == "t" ]] \
    || fail "${name}: barrier unlock failed (exit ${rc}): $(tr '\n' ' ' <"$TMP/${name}.barrier.out" | cut -c1-200)"

  # shellcheck disable=SC2086
  wait_pids "$WORKER_SECS" $pids || fail "${name}: workers still running ${WORKER_SECS}s after release"
  i=0
  for p in $pids; do
    i=$((i + 1))
    if wait "$p"; then rc=0; else rc=$?; fi
    [[ $rc == 0 ]] || fail "${name}: worker ${i} exited ${rc}: $(tr '\n' ' ' <"$TMP/${name}.out.${i}" | cut -c1-200)"
  done
  WORKER_PIDS=""
}

race_n() {   # <name> : race over $TMP/<name>.1.sql .. $TMP/<name>.$N.sql
  local name="$1" i
  set -- "$TMP/${name}.1.sql"
  for i in $(seq 2 "$N"); do set -- "$@" "$TMP/${name}.${i}.sql"; done
  race "$name" "$@"
}

# expect_outcomes <name> <n> <expected ok> <exact loser reason>
expect_outcomes() {
  local name="$1" n="$2" want="$3" reason="$4" i line ok=0 lost=0 bad=""
  for i in $(seq 1 "$n"); do
    line="$(cat "$TMP/${name}.out.${i}")"
    if [[ "$line" == "ok" ]]; then ok=$((ok + 1))
    elif [[ "$line" == "$reason" ]]; then lost=$((lost + 1))
    else bad="${bad} [w${i}: $(printf '%s' "$line" | tr '\n' ' ' | cut -c1-120)]"; fi
  done
  if (( ok == want && lost == n - want )) && [[ -z "$bad" ]]; then
    echo "PASS ${name}: workers=${n} queued=${n} ok=${ok} ${reason}=${lost}"
  else
    echo "FAIL ${name}: workers=${n} ok=${ok}/${want} ${reason}=${lost}/$((n - want)) unexpected=${bad:-none}"
    FAILED=1
  fi
}

# ---------------------------------------------------------------- scenarios (writes start) -------
MUTATED=1

echo "1 replay_same_ticket"
claims="$(issue 1 1 1)"
for i in $(seq 1 "$N"); do admit_sql 1 1 1 "$CEIL_BIG" "$claims" >"$TMP/s1.$i.sql"; done
race_n s1
expect_outcomes s1 "$N" 1 ticket_replayed

echo "2 session_concurrency"
for i in $(seq 1 "$N"); do t=$((100 + i)); c="$(issue "$t" 100 "$t")"; admit_sql "$t" 100 "$t" "$CEIL_BIG" "$c" >"$TMP/s2.$i.sql"; done
race_n s2
expect_outcomes s2 "$N" 1 session_concurrency

echo "3 network_concurrency"
for i in $(seq 1 "$N"); do t=$((200 + i)); c="$(issue "$t" "$t" 200)"; admit_sql "$t" "$t" 200 "$CEIL_BIG" "$c" >"$TMP/s3.$i.sql"; done
race_n s3
expect_outcomes s3 "$N" 3 network_concurrency

echo "4 daily_cost_ceiling"
# Release this run's live admissions so their cost is exactly 0, and refuse if any OTHER live
# undispatched reservation exists today (its lease could expire mid-race and change the budget).
released="$(psql_c "${APP}_setup" -c "select count(*) from (select public.admission_finish(r.reservation_id, 0, 'failed', clock_timestamp()) ->> 'status' s
  from admission_private.reservations r where r.session_id::text like '${RUN}-%' and r.state = 'admitted') x where s = 'ok'")"
echo "  released ${released} earlier run admissions"
for i in $(seq 1 "$N"); do t=$((300 + i)); c="$(issue "$t" "$t" "$t")"; echo "$c" >"$TMP/s4.claims.$i"; done
foreign="$(psql_c "${APP}_setup" -c "select count(*) from admission_private.reservations
  where cost_day = (clock_timestamp() at time zone 'UTC')::date and state = 'admitted' and lease_expires_at > clock_timestamp()
    and session_id::text not like '${RUN}-%'")"
[[ "$foreign" == "0" ]] || fail "daily_cost_ceiling: ${foreign} foreign live admitted reservations today make the budget non-deterministic"
# Same charge formula as the store; no live 'admitted' rows remain, so every term is stable.
committed="$(psql_c "${APP}_setup" -c "select coalesce(sum(case state when 'settled' then actual_microusd when 'dispatched' then reserved_microusd else 0 end), 0)
  from admission_private.reservations where cost_day = (clock_timestamp() at time zone 'UTC')::date")"
ceiling=$((committed + 5 * RESERVE))
for i in $(seq 1 "$N"); do t=$((300 + i)); admit_sql "$t" "$t" "$t" "$ceiling" "$(cat "$TMP/s4.claims.$i")" >"$TMP/s4.$i.sql"; done
race_n s4
expect_outcomes s4 "$N" 5 daily_cost_ceiling

echo "5 dispatch_vs_revoke"
P=$((N / 2))
files="" roles=""
for p in $(seq 1 "$P"); do
  t=$((500 + p))
  c="$(issue "$t" "$t" "$t")"
  rid="$(as_service "$(admit_sql "$t" "$t" "$t" "$CEIL_BIG" "$c" id)")" || fail "pair ${p}: admit psql error"
  [[ "$rid" =~ ^[0-9a-f-]{36}$ ]] || fail "pair ${p}: admit failed: ${rid}"
  echo "$rid" >"$TMP/s5.rid.$p"
  printf "select coalesce(r ->> 'reason', r ->> 'status') from (select public.admission_dispatch('%s', '%s', clock_timestamp())) q(r)" \
    "$rid" "$(uid 0003 "$t")" >"$TMP/s5.d.$p.sql"
  printf "select (r ->> 'status') || '|' || coalesce(r ->> 'already_revoked', r ->> 'reason') from (select public.admission_revoke('%s', '%s', clock_timestamp())) q(r)" \
    "$(uid 0002 "$t")" "$(uid 0003 "$t")" >"$TMP/s5.v.$p.sql"
  # Randomize which backend of the pair queues first; the lock decides the serialization.
  if (( RANDOM % 2 )); then files="${files} $TMP/s5.d.$p.sql $TMP/s5.v.$p.sql"; roles="${roles} d:$p v:$p"
  else files="${files} $TMP/s5.v.$p.sql $TMP/s5.d.$p.sql"; roles="${roles} v:$p d:$p"; fi
done
# shellcheck disable=SC2086
race s5 $files
i=0
for role in $roles; do i=$((i + 1)); cp "$TMP/s5.out.$i" "$TMP/s5.${role%%:*}.$((${role#*:})).out"; done
state_sql() {
  printf "select r.state || '|' || coalesce(r.actual_microusd::text, '-') || '|' || (r.dispatched_at is not null)::text
      || '|' || (c.revoked_at is not null)::text || '|' || coalesce((r.dispatched_at <= c.revoked_at)::text, '-')
    from admission_private.reservations r join admission_private.tickets t on t.ticket_id = r.ticket_id
    join admission_private.consent_receipts c on c.receipt_id = t.consent_receipt_id where r.reservation_id = '%s'" "$1"
}
dfirst=0 vfirst=0 bad=""
for p in $(seq 1 "$P"); do
  rid="$(cat "$TMP/s5.rid.$p")" d="$(cat "$TMP/s5.d.$p.out")" v="$(cat "$TMP/s5.v.$p.out")"
  [[ "$v" == "ok|false" ]] || { bad="${bad} [pair ${p}: revoke=${v}]"; continue; }
  st="$(psql_c "${APP}_setup" -c "$(state_sql "$rid")")"
  if [[ "$d" == "ok" ]]; then
    # dispatch serialized first: egress was allowed, cost must settle, result must be suppressed.
    [[ "$st" == "dispatched|-|true|true|true" ]] || { bad="${bad} [pair ${p} dispatch-first state=${st}]"; continue; }
    f="$(as_service "$(finish_sql "$rid" 600 success)")"
    [[ "$f" == "ok|false|true" ]] || { bad="${bad} [pair ${p} dispatch-first finish=${f}]"; continue; }
    st="$(psql_c "${APP}_setup" -c "$(state_sql "$rid")")"
    [[ "$st" == "settled|600|true|true|true" ]] || { bad="${bad} [pair ${p} dispatch-first settled=${st}]"; continue; }
    dfirst=$((dfirst + 1))
  elif [[ "$d" == "consent_revoked" ]]; then
    # revoke serialized first: no egress, no provider cost may be recorded, release reports revoked.
    [[ "$st" == "admitted|-|false|true|-" ]] || { bad="${bad} [pair ${p} revoke-first state=${st}]"; continue; }
    f="$(as_service "$(finish_sql "$rid" 600 success)")"
    [[ "$f" == "invalid_settlement" ]] || { bad="${bad} [pair ${p} revoke-first cost finish=${f}]"; continue; }
    f="$(as_service "$(finish_sql "$rid" 0 failed)")"
    [[ "$f" == "ok|false|true" ]] || { bad="${bad} [pair ${p} revoke-first release=${f}]"; continue; }
    st="$(psql_c "${APP}_setup" -c "$(state_sql "$rid")")"
    [[ "$st" == "released|0|false|true|-" ]] || { bad="${bad} [pair ${p} revoke-first released=${st}]"; continue; }
    vfirst=$((vfirst + 1))
  else
    bad="${bad} [pair ${p}: dispatch=$(printf '%s' "$d" | tr '\n' ' ' | cut -c1-120)]"
  fi
done
if [[ -z "$bad" ]] && (( dfirst + vfirst == P )); then
  echo "PASS dispatch_vs_revoke: pairs=${P} queued=$((2 * P)) dispatch_first=${dfirst} revoke_first=${vfirst}"
else
  echo "FAIL dispatch_vs_revoke: pairs=${P} dispatch_first=${dfirst} revoke_first=${vfirst} unexpected=${bad}"
  FAILED=1
fi

echo "6 retry_vs_revoke"
# Physical identity + accounting of a reservation row: any write (even a no-op UPDATE) or row lock changes it.
ident_sql() {
  printf "select ctid::text || '|' || xmin::text || '|' || xmax::text || '|' || state || '|' || dispatched_at || '|'
      || lease_expires_at || '|' || reserved_microusd || '|' || coalesce(actual_microusd::text, '-')
    from admission_private.reservations where reservation_id = '%s'" "$1"
}
retry_sql() {   # <reservation id> <session uuid> -> reason/status
  printf "select coalesce(r ->> 'reason', r ->> 'status') from (select public.admission_retry_check('%s', '%s', clock_timestamp())) q(r)" "$1" "$2"
}
files="" roles=""
for p in $(seq 1 "$P"); do
  t=$((600 + p))
  c="$(issue "$t" "$t" "$t")"
  rid="$(as_service "$(admit_sql "$t" "$t" "$t" "$CEIL_BIG" "$c" id)")" || fail "retry pair ${p}: admit psql error"
  [[ "$rid" =~ ^[0-9a-f-]{36}$ ]] || fail "retry pair ${p}: admit failed: ${rid}"
  d="$(as_service "select coalesce(r ->> 'reason', r ->> 'status') from (select public.admission_dispatch('${rid}', '$(uid 0003 "$t")', clock_timestamp())) q(r)")"
  [[ "$d" == "ok" ]] || fail "retry pair ${p}: dispatch=${d}"
  r0="$(as_service "$(retry_sql "$rid" "$(uid 0003 "$t")")")"
  [[ "$r0" == "ok" ]] || fail "retry pair ${p}: pre-race recheck=${r0}"
  echo "$rid" >"$TMP/s6.rid.$p"
  psql_c "${APP}_setup" -c "$(ident_sql "$rid")" >"$TMP/s6.ident.$p" || fail "retry pair ${p}: ident"
  # The materialized CTE runs the check first; clock_timestamp() is read after it returned, lock still held.
  printf "with q as materialized (select public.admission_retry_check('%s', '%s', clock_timestamp()) r)
    select coalesce(r ->> 'reason', r ->> 'status') || '|' || clock_timestamp() from q" "$rid" "$(uid 0003 "$t")" >"$TMP/s6.c.$p.sql"
  printf "select (r ->> 'status') || '|' || coalesce(r ->> 'already_revoked', r ->> 'reason') from (select public.admission_revoke('%s', '%s', clock_timestamp())) q(r)" \
    "$(uid 0002 "$t")" "$(uid 0003 "$t")" >"$TMP/s6.v.$p.sql"
  if (( RANDOM % 2 )); then files="${files} $TMP/s6.c.$p.sql $TMP/s6.v.$p.sql"; roles="${roles} c:$p v:$p"
  else files="${files} $TMP/s6.v.$p.sql $TMP/s6.c.$p.sql"; roles="${roles} v:$p c:$p"; fi
done
# shellcheck disable=SC2086
race s6 $files
i=0
for role in $roles; do i=$((i + 1)); cp "$TMP/s6.out.$i" "$TMP/s6.${role%%:*}.$((${role#*:})).out"; done
cfirst=0 vfirst=0 bad=""
for p in $(seq 1 "$P"); do
  t=$((600 + p)) rid="$(cat "$TMP/s6.rid.$p")" cr="$(cat "$TMP/s6.c.$p.out")" v="$(cat "$TMP/s6.v.$p.out")"
  [[ "$v" == "ok|false" ]] || { bad="${bad} [pair ${p}: revoke=${v}]"; continue; }
  res="${cr%%|*}" at="${cr#*|}"
  # "<check-time <= revoked_at>|<revoked_at <= check-time>" (non-strict: equal clock readings are not misordered)
  order="$(psql_c "${APP}_setup" -c "select ('${at}'::timestamptz <= c.revoked_at)::text || '|' || (c.revoked_at <= '${at}'::timestamptz)::text
    from admission_private.reservations r
    join admission_private.tickets k on k.ticket_id = r.ticket_id join admission_private.consent_receipts c on c.receipt_id = k.consent_receipt_id
    where r.reservation_id = '${rid}'" 2>&1)" || { bad="${bad} [pair ${p}: order query: ${order}]"; continue; }
  if [[ "$res" == "ok" && "$order" == true\|* ]]; then cfirst=$((cfirst + 1))
  elif [[ "$res" == "consent_revoked" && "$order" == *\|true ]]; then vfirst=$((vfirst + 1))
  else bad="${bad} [pair ${p}: recheck=$(printf '%s' "$cr" | tr '\n' ' ' | cut -c1-120) before_revoke=${order}]"; continue; fi
  now_ident="$(psql_c "${APP}_setup" -c "$(ident_sql "$rid")")"
  [[ "$now_ident" == "$(cat "$TMP/s6.ident.$p")" ]] || { bad="${bad} [pair ${p}: reservation row changed]"; continue; }
  r2="$(as_service "$(retry_sql "$rid" "$(uid 0003 "$t")")")"
  [[ "$r2" == "consent_revoked" ]] || { bad="${bad} [pair ${p}: post-race recheck=${r2}]"; continue; }
  f="$(as_service "$(finish_sql "$rid" 600 success)")"
  [[ "$f" == "ok|false|true" ]] || bad="${bad} [pair ${p}: finish=${f}]"
done
if [[ -z "$bad" ]] && (( cfirst + vfirst == P )); then
  echo "PASS retry_vs_revoke: pairs=${P} queued=$((2 * P)) recheck_first=${cfirst} revoke_first=${vfirst}"
else
  echo "FAIL retry_vs_revoke: pairs=${P} recheck_first=${cfirst} revoke_first=${vfirst} unexpected=${bad}"
  FAILED=1
fi

# Post-condition: exactly one stored reservation per ok admission across all scenarios.
want_stored=$((1 + 1 + 3 + 5 + P + P))
stored="$(psql_c "${APP}_setup" -c "select count(*) from admission_private.reservations where session_id::text like '${RUN}-%'")"
if [[ "$stored" == "$want_stored" ]]; then echo "PASS stored_reservations=${stored}"
else echo "FAIL stored_reservations=${stored} expected=${want_stored}"; FAILED=1; fi

exit "$FAILED"   # EXIT trap cleans up, may turn this into a failure, and prints the verdict
