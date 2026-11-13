-- PathCheck S: admission_retry_check (migration 20261114000000) — bounded provider transport retries.
-- Run against a LOCAL/TEST Supabase stack only:  supabase test db
-- One transaction, rolled back. Synthetic UUIDs/digests only; no PDF, transcript text or IP.
-- RPCs are called as service_role (the only grantee). Elapsed DB time is simulated by the table
-- owner backdating rows (`reset role`), never by a clock override inside the store.
-- "Unchanged" is proven with a whole-store fingerprint that includes each row's ctid/xmin/xmax, so
-- any UPDATE (even a no-op), DELETE, INSERT or SELECT ... FOR UPDATE row lock is detected.
-- Single-session pgTAP cannot race two backends; ../admission/concurrency.sh s6 races revoke/recheck.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(62);

-- ===== Test helpers (rolled back) =====
create schema pc_rt;
grant usage on schema pc_rt to anon, authenticated, service_role;
create function pc_rt.tid(n int) returns uuid language sql immutable as
  $$ select ('41000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid $$;
create function pc_rt.rid(n int) returns uuid language sql immutable as
  $$ select ('42000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid $$;
create function pc_rt.sid(n int) returns uuid language sql immutable as
  $$ select ('43000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid $$;
create function pc_rt.dig(t text) returns text language sql immutable as
  $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;
create function pc_rt.net(n int) returns text language sql immutable as
  $$ select 'rtnet_' || lpad(n::text, 40, '0') $$;
create table pc_rt.res (n int primary key, id uuid not null);
create table pc_rt.snaps (k text primary key, v text not null);
grant select, insert on pc_rt.res to service_role;

-- Issue + admit ticket n for session s on its own network n (claims echo ONE DB clock reading).
-- Returns 'ok' or the failing reason; records the reservation id.
create function pc_rt.ia(n int, s int, reserve bigint default 1000) returns text language plpgsql as $$
declare t timestamptz := clock_timestamp(); r jsonb;
begin
  r := public.admission_issue(pc_rt.tid(n), pc_rt.sid(s), pc_rt.rid(n), pc_rt.dig('doc'), 'disclosure-v1',
                              t, t + interval '300 seconds', pc_rt.dig('rt-att-' || n), pc_rt.net(n), t);
  if r ->> 'status' <> 'ok' then return 'issue:' || (r ->> 'reason'); end if;
  r := public.admission_admit(pc_rt.tid(n), pc_rt.sid(s), pc_rt.rid(n), pc_rt.dig('doc'), t, t + interval '300 seconds',
                              array[pc_rt.net(n)], 9000000000000000, reserve, 120, clock_timestamp());
  if r ->> 'status' = 'ok' then insert into pc_rt.res values (n, (r ->> 'reservation_id')::uuid); end if;
  return coalesce(r ->> 'reason', r ->> 'status');
end $$;
create function pc_rt.rsv(n int) returns uuid language sql stable as $$ select id from pc_rt.res where res.n = rsv.n $$;
create function pc_rt.disp(n int, s int) returns text language sql as
  $$ select coalesce(r ->> 'reason', r ->> 'status') from public.admission_dispatch(pc_rt.rsv(n), pc_rt.sid(s), clock_timestamp()) r $$;
-- The RPC under test (full jsonb result).
create function pc_rt.rc(n int, s int, client_off interval default '0') returns jsonb language sql as
  $$ select public.admission_retry_check(pc_rt.rsv(n), pc_rt.sid(s), clock_timestamp() + client_off) $$;
-- k sequential rechecks; returns how many returned exactly {status:'ok'}.
create function pc_rt.rcn(n int, s int, k int) returns int language plpgsql as $$
declare i int; ok int := 0;
begin
  for i in 1 .. k loop
    if pc_rt.rc(n, s) = '{"status":"ok"}'::jsonb then ok := ok + 1; end if;
  end loop;
  return ok;
end $$;
create function pc_rt.fin(n int, actual bigint, outcome text) returns jsonb language sql as
  $$ select public.admission_finish(pc_rt.rsv(n), actual, outcome, clock_timestamp()) $$;
create function pc_rt.rev(n int, s int) returns jsonb language sql as
  $$ select public.admission_revoke(pc_rt.rid(n), pc_rt.sid(s), clock_timestamp()) $$;
grant execute on all functions in schema pc_rt to service_role;

-- Owner-only (after `reset role`): whole-store fingerprint incl. physical row identity and lockers.
create function pc_rt.snap() returns text language sql as $$
  select md5(
    coalesce((select string_agg(r.ctid::text || r.xmin::text || r.xmax::text || row_to_json(r)::text, '|' order by r.reservation_id)
              from admission_private.reservations r), '') || '#' ||
    coalesce((select string_agg(t.ctid::text || t.xmin::text || t.xmax::text || row_to_json(t)::text, '|' order by t.ticket_id)
              from admission_private.tickets t), '') || '#' ||
    coalesce((select string_agg(c.ctid::text || c.xmin::text || c.xmax::text || row_to_json(c)::text, '|' order by c.receipt_id)
              from admission_private.consent_receipts c), '')) $$;
create function pc_rt.save(k text) returns void language sql as
  $$ insert into pc_rt.snaps values (k, pc_rt.snap()) on conflict (k) do update set v = excluded.v $$;
create function pc_rt.same(k text) returns boolean language sql as $$ select v = pc_rt.snap() from pc_rt.snaps where snaps.k = same.k $$;
-- Owner-only: one reservation's accounting row (state/dispatch/lease/reserved/actual/ticket burn/consent).
create function pc_rt.row(n int) returns text language sql as $$
  select r.state || '|' || coalesce(r.dispatched_at::text, '-') || '|' || r.lease_expires_at::text || '|' || r.reserved_microusd
         || '|' || coalesce(r.actual_microusd::text, '-') || '|' || coalesce(t.consumed_at::text, '-') || '|' || (c.revoked_at is not null)
    from admission_private.reservations r join admission_private.tickets t on t.ticket_id = r.ticket_id
    join admission_private.consent_receipts c on c.receipt_id = t.consent_receipt_id where r.reservation_id = pc_rt.rsv(n) $$;
create function pc_rt.expire_lease(n int) returns void language sql as $$
  update admission_private.reservations set lease_expires_at = admitted_at + interval '1 microsecond'
   where reservation_id = pc_rt.rsv(n) $$;
create table pc_rt.rows (n int primary key, v text not null);

-- ===== 1. Signature, definer, privileges, read-only body (11) =====
select ok(to_regprocedure('public.admission_retry_check(uuid,uuid,timestamptz)') is not null,
          'public.admission_retry_check(uuid, uuid, timestamptz) exists');
select is((select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace and proname = 'admission_retry_check'), 1,
          'exactly one overload (no alternate signature)');
select is((select prorettype::regtype::text from pg_proc where oid = 'public.admission_retry_check(uuid,uuid,timestamptz)'::regprocedure),
          'jsonb', 'returns jsonb');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
           where oid = 'public.admission_retry_check(uuid,uuid,timestamptz)'::regprocedure),
          'SECURITY DEFINER with fixed empty search_path');
select is((select count(*)::int from pg_proc p, aclexplode(p.proacl) a
           where p.oid = 'public.admission_retry_check(uuid,uuid,timestamptz)'::regprocedure and a.grantee = 0), 0,
          'no PUBLIC EXECUTE');
select is((select string_agg(r.role, ',' order by r.role) from (values ('anon'), ('authenticated'), ('service_role')) r(role)
           where has_function_privilege(r.role, 'public.admission_retry_check(uuid,uuid,timestamptz)', 'EXECUTE')),
          'service_role', 'EXECUTE held by service_role only (not anon/authenticated)');
select ok((select prosrc ~ 'admission_private\.lock_and_now\(p_client_now\)' from pg_proc
           where oid = 'public.admission_retry_check(uuid,uuid,timestamptz)'::regprocedure),
          'uses the shared store advisory lock + DB clock helper (lock_and_now)');
select ok((select prosrc !~* '\m(insert|update|delete|truncate|merge)\M' and prosrc !~* 'for\s+(no\s+key\s+)?(update|share)'
             and prosrc !~* 'admission_(admit|dispatch|finish|revoke|issue|purge)\(' from pg_proc
           where oid = 'public.admission_retry_check(uuid,uuid,timestamptz)'::regprocedure),
          'body has no write, row lock or call to a mutating admission RPC');
set local role anon;
select throws_ok($$ select public.admission_retry_check(null, null, null) $$, '42501', null, 'anon: retry_check denied (42501)');
reset role;
set local role authenticated;
select ok(set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true) is not null, 'setup');
select throws_ok($$ select public.admission_retry_check(null, null, null) $$, '42501', null, 'authenticated: retry_check denied (42501)');
reset role;

-- ===== 2. Input, clock and ownership denials on a DISPATCHED reservation (13) =====
set local role service_role;
select is(pc_rt.ia(1, 1) || '/' || pc_rt.disp(1, 1), 'ok/ok', 'admit + dispatch reservation 1 (session 1)');
reset role;
do $$ begin perform pc_rt.save('d1'); end $$;
set local role service_role;
select is(public.admission_retry_check(null, pc_rt.sid(1), clock_timestamp()),
          '{"status":"denied","reason":"invalid_input"}'::jsonb, 'missing reservation id -> invalid_input');
select is(public.admission_retry_check(pc_rt.rsv(1), null, clock_timestamp()),
          '{"status":"denied","reason":"invalid_input"}'::jsonb, 'missing session id -> invalid_input');
select is(public.admission_retry_check(pc_rt.rsv(1), pc_rt.sid(1), null),
          '{"status":"denied","reason":"clock_mismatch"}'::jsonb, 'missing caller clock fails closed');
select is(pc_rt.rc(1, 1, interval '5 minutes'), '{"status":"denied","reason":"clock_mismatch"}'::jsonb,
          'caller clock 5 min ahead of DB clock -> clock_mismatch');
select is(pc_rt.rc(1, 1, interval '-31 seconds'), '{"status":"denied","reason":"clock_mismatch"}'::jsonb,
          'caller clock 31 s behind DB clock -> clock_mismatch');
select is(public.admission_retry_check('00000000-0000-4000-8000-00000000dead', pc_rt.sid(1), clock_timestamp()),
          '{"status":"denied","reason":"unknown_reservation"}'::jsonb, 'never-admitted reservation -> unknown_reservation');
select is(pc_rt.rc(1, 2), '{"status":"denied","reason":"unknown_reservation"}'::jsonb,
          'another session''s dispatched reservation -> unknown_reservation (indistinguishable from missing)');
select is(public.admission_retry_check(pc_rt.sid(1), pc_rt.rsv(1), clock_timestamp()),
          '{"status":"denied","reason":"unknown_reservation"}'::jsonb, 'swapped reservation/session ids denied');
reset role;
select ok(pc_rt.same('d1'), 'denied rechecks left the whole store byte-identical (incl. ctid/xmin/xmax)');
set local role service_role;
select is(pc_rt.rc(1, 1), '{"status":"ok"}'::jsonb, 'correct session + dispatched + live lease + consent -> exactly {status:ok}');
select is(pc_rt.rcn(1, 1, 5), 5, 'five further sequential rechecks all ok (no hidden attempt counter)');
reset role;
select ok(pc_rt.same('d1'), 'allowed rechecks left the whole store byte-identical: no state/lease/cost/ticket/row-lock change');

-- ===== 3. Allowed rechecks charge nothing and reset nothing (10) =====
insert into pc_rt.rows values (1, pc_rt.row(1));
select is((select count(*)::int from admission_private.reservations), 1, 'no new reservation was created by rechecks');
select ok((select v like 'dispatched|%|1000|-|%|false' from pc_rt.rows where n = 1), 'reservation 1 still dispatched, reserved 1000, unsettled, consent live');
set local role service_role;
select is(pc_rt.ia(2, 1), 'session_concurrency', 'session still holds its single concurrent slot (rechecks are not admissions)');
select is(public.admission_admit(pc_rt.tid(1), pc_rt.sid(1), pc_rt.rid(1), pc_rt.dig('doc'), clock_timestamp(),
          clock_timestamp() + interval '300 seconds', array[pc_rt.net(1)], 9000000000000000, 1000, 120, clock_timestamp()) ->> 'reason',
          'ticket_replayed', 'the dispatched reservation''s ticket stays consumed: no ticket reuse');
select is(pc_rt.disp(1, 1), 'not_dispatchable', 'admission_dispatch semantics unchanged: a dispatched reservation is not re-dispatched');
select is(pc_rt.rcn(1, 1, 3), 3, 'rechecks still ok after the denied admission attempts');
reset role;
select is(pc_rt.row(1), (select v from pc_rt.rows where n = 1), 'reservation 1 state/dispatched_at/lease/reserved/actual/ticket burn unchanged');
set local role service_role;
select is(pc_rt.fin(1, 1001, 'success') ->> 'reason', 'invalid_settlement', 'reserved worst case still 1000: over-reservation settlement refused');
select is(pc_rt.fin(1, 1000, 'success') - 'cost_day', '{"status":"ok","replayed":false,"consent_revoked":false}'::jsonb,
          'settle at the full upfront reservation');
select is(pc_rt.rc(1, 1), '{"status":"denied","reason":"not_retryable"}'::jsonb, 'settled reservation -> not_retryable');

-- ===== 4. Not dispatched / released / settled / expired (13) =====
select is(pc_rt.ia(3, 3), 'ok', 'admit reservation 3 (not dispatched)');
reset role;
do $$ begin perform pc_rt.save('a3'); end $$;
set local role service_role;
select is(pc_rt.rc(3, 3), '{"status":"denied","reason":"not_retryable"}'::jsonb, 'admitted, undispatched reservation -> not_retryable');
reset role;
select ok(pc_rt.same('a3'), 'denied recheck did not dispatch or otherwise touch the admitted reservation');
set local role service_role;
select is(pc_rt.disp(3, 3), 'ok', 'normal dispatch still works afterwards (retry_check is not a dispatch substitute)');
select is(pc_rt.ia(4, 4), 'ok', 'admit reservation 4');
select is(pc_rt.fin(4, 0, 'failed') ->> 'status', 'ok', 'release undispatched reservation 4');
select is(pc_rt.rc(4, 4), '{"status":"denied","reason":"not_retryable"}'::jsonb, 'released reservation -> not_retryable');
select is(pc_rt.ia(5, 5), 'ok', 'admit reservation 5');
reset role;
do $$ begin perform pc_rt.expire_lease(5); end $$;
set local role service_role;
select is(pc_rt.rc(5, 5), '{"status":"denied","reason":"not_retryable"}'::jsonb, 'admitted reservation with expired lease -> not_retryable');
select is(pc_rt.rc(3, 3), '{"status":"ok"}'::jsonb, 'dispatched reservation 3 with live lease -> ok');
reset role;
do $$ begin perform pc_rt.expire_lease(3); perform pc_rt.save('x3'); end $$;
set local role service_role;
select is(pc_rt.rc(3, 3), '{"status":"denied","reason":"lease_expired"}'::jsonb, 'dispatched reservation past its DB-clock lease -> lease_expired');
reset role;
select ok(pc_rt.same('x3'), 'lease-expired denial did not extend/reset the lease or change any row');
set local role service_role;
select is(pc_rt.fin(3, 1000, 'failed') ->> 'status', 'ok', 'expired dispatched reservation still settles (provider stops retrying)');

-- ===== 5. Consent revocation: denies rechecks, finish still reports it, other sessions unaffected (13) =====
select is(pc_rt.ia(6, 6) || '/' || pc_rt.disp(6, 6), 'ok/ok', 'admit + dispatch reservation 6');
select is(pc_rt.ia(7, 7) || '/' || pc_rt.disp(7, 7), 'ok/ok', 'admit + dispatch reservation 7 (independent session)');
select is(pc_rt.rc(6, 6), '{"status":"ok"}'::jsonb, 'recheck 6 ok before revocation');
select is(pc_rt.rev(6, 7) ->> 'reason', 'unknown_receipt', 'another session cannot revoke 6''s consent');
select is(pc_rt.rc(6, 6), '{"status":"ok"}'::jsonb, 'failed foreign revoke does not affect 6');
reset role;
insert into pc_rt.rows values (6, pc_rt.row(6));
set local role service_role;
select is(pc_rt.rev(6, 6) - 'already_revoked', '{"status":"ok"}'::jsonb, 'owning session revokes consent after dispatch');
reset role;
do $$ begin perform pc_rt.save('v6'); end $$;
set local role service_role;
select is(pc_rt.rc(6, 6), '{"status":"denied","reason":"consent_revoked"}'::jsonb, 'recheck after revocation -> consent_revoked');
select is(pc_rt.rcn(6, 6, 3), 0, 'every later recheck stays denied');
reset role;
select ok(pc_rt.same('v6'), 'revoked-consent denials changed nothing');
select is(regexp_replace(pc_rt.row(6), '\|(true|false)$', ''), regexp_replace((select v from pc_rt.rows where n = 6), '\|(true|false)$', ''),
          'revocation left reservation 6 dispatched with the same dispatch time, lease and reserved cost');
set local role service_role;
select is(pc_rt.rc(7, 7), '{"status":"ok"}'::jsonb, 'unrelated session 7 still allowed');
select is(pc_rt.fin(6, 1000, 'success') - 'cost_day', '{"status":"ok","replayed":false,"consent_revoked":true}'::jsonb,
          'finish of the revoked reservation reports consent_revoked (server withholds the result)');
select is(pc_rt.fin(6, 1000, 'success') - 'cost_day', '{"status":"ok","replayed":true,"consent_revoked":true}'::jsonb,
          'replayed finish still reports consent_revoked');

-- ===== 6. Post-conditions (2) =====
reset role;
select ok(exists (select 1 from pg_locks where locktype = 'advisory' and pid = pg_backend_pid() and granted),
          'store advisory lock held by this transaction');
select is((select count(*)::int from admission_private.reservations), 6, 'exactly the 6 successful admissions of this suite exist (rechecks created none)');

select * from finish();
rollback;
