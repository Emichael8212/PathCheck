-- PathCheck S: server-only guest transcript admission store (migration 20261113000000).
-- Run against a LOCAL/TEST Supabase stack only:  supabase test db
-- One transaction, rolled back. Synthetic UUIDs/digests only; no PDF, transcript text or IP.
-- RPCs are called as service_role (the only grantee). Elapsed DB time is simulated by the table
-- owner backdating rows (`reset role`), never by a clock override inside the store.
-- Single-session pgTAP cannot race two backends; see ../admission/concurrency.sh for live races.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(137);

-- ===== Test helpers (rolled back) =====
create schema pc_test;
grant usage on schema pc_test to anon, authenticated, service_role;
create function pc_test.tid(n int) returns uuid language sql immutable as
  $$ select ('10000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid $$;
create function pc_test.rid(n int) returns uuid language sql immutable as
  $$ select ('20000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid $$;
create function pc_test.sid(n int) returns uuid language sql immutable as
  $$ select ('30000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid $$;
create function pc_test.dig(t text) returns text language sql immutable as
  $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;
create function pc_test.net(n int) returns text language sql immutable as
  $$ select 'net_' || lpad(n::text, 40, '0') $$;
create table pc_test.claims (n int primary key, issued timestamptz not null, expires timestamptz not null);
create table pc_test.res (n int primary key, id uuid not null);
grant select, insert on pc_test.claims, pc_test.res to service_role;

-- Issue ticket n for session s on network net (claims echo the DB clock, as a correct server would).
create function pc_test.issue(n int, s int, net int, doc text default 'doc') returns jsonb language plpgsql as $$
declare t timestamptz := clock_timestamp(); r jsonb;
begin
  r := public.admission_issue(pc_test.tid(n), pc_test.sid(s), pc_test.rid(n), pc_test.dig(doc), 'disclosure-v1',
                              t, t + interval '300 seconds', pc_test.dig('att-' || n), pc_test.net(net), t);
  if r ->> 'status' = 'ok' then insert into pc_test.claims values (n, t, t + interval '300 seconds'); end if;
  return r;
end $$;
-- Raw issue for negative cases. ONE clock_timestamp() is captured and every timestamp argument
-- (claims issued/expiry, caller clock) is an offset from it: separate clock_timestamp() calls advance
-- on a real server and would make a 300 s lifetime look like >300 s (false invalid_ticket_lifetime).
create function pc_test.issue_at(ticket uuid, sess uuid, receipt uuid, doc_digest text, att text, netkey text,
                                 issued_off interval default '0', expires_off interval default '300 seconds',
                                 client_off interval default '0', client_null boolean default false) returns jsonb
language plpgsql as $$
declare t timestamptz := clock_timestamp();
begin
  return public.admission_issue(ticket, sess, receipt, doc_digest, 'disclosure-v1', t + issued_off, t + expires_off,
                                att, netkey, case when client_null then null else t + client_off end);
end $$;
-- Admit ticket n exactly as issued (overridable fields for binding tests). Records reservation id.
create function pc_test.admit(n int, s int, nets int[], doc text default 'doc', ceil_usd bigint default 1000000,
                              reserve bigint default 1000, receipt uuid default null, expiry_shift interval default '0') returns jsonb
language plpgsql as $$
declare r jsonb; c pc_test.claims%rowtype;
begin
  select * into c from pc_test.claims where claims.n = admit.n;
  r := public.admission_admit(pc_test.tid(n), pc_test.sid(s), coalesce(receipt, pc_test.rid(n)), pc_test.dig(doc),
         c.issued, c.expires + expiry_shift, array(select pc_test.net(x) from unnest(nets) with ordinality u(x, i) order by i),
         ceil_usd, reserve, 120, clock_timestamp());
  if r ->> 'status' = 'ok' then insert into pc_test.res values (n, (r ->> 'reservation_id')::uuid); end if;
  return r;
end $$;
-- Issue then admit ticket n (session s, network net); returns 'ok' or the denial reason.
create function pc_test.ia(n int, s int, net int, ceil_usd bigint default 1000000, reserve bigint default 1000,
                           keys int[] default null) returns text language plpgsql as $$
declare r jsonb;
begin
  r := pc_test.issue(n, s, net);
  if r ->> 'status' <> 'ok' then return 'issue:' || (r ->> 'reason'); end if;
  r := pc_test.admit(n, s, coalesce(keys, array[net]), ceil_usd => ceil_usd, reserve => reserve);
  return coalesce(r ->> 'reason', r ->> 'status');
end $$;
create function pc_test.rsv(n int) returns uuid language sql stable as $$ select id from pc_test.res where res.n = rsv.n $$;
create function pc_test.dispatch(n int, s int) returns jsonb language sql as
  $$ select public.admission_dispatch(pc_test.rsv(n), pc_test.sid(s), clock_timestamp()) $$;
create function pc_test.fin(n int, actual bigint, outcome text) returns jsonb language sql as
  $$ select public.admission_finish(pc_test.rsv(n), actual, outcome, clock_timestamp()) $$;
create function pc_test.rev(n int, s int) returns jsonb language sql as
  $$ select public.admission_revoke(pc_test.rid(n), pc_test.sid(s), clock_timestamp()) $$;
-- ia + immediate release for tickets n_from..n_to (fresh session each); returns ok-admission count.
create function pc_test.churn(n_from int, n_to int, net int) returns int language plpgsql as $$
declare k int; ok int := 0;
begin
  for k in n_from .. n_to loop
    if pc_test.ia(k, k, net) = 'ok' then
      ok := ok + 1;
      perform pc_test.fin(k, 0, 'failed');
    end if;
  end loop;
  return ok;
end $$;
-- Release (finish 0/failed) each listed admission; returns count of ok.
create function pc_test.release_all(ns int[]) returns int language plpgsql as $$
declare k int; ok int := 0;
begin
  foreach k in array ns loop
    if pc_test.fin(k, 0, 'failed') ->> 'status' = 'ok' then ok := ok + 1; end if;
  end loop;
  return ok;
end $$;
-- Owner-only time travel (run after `reset role`).
create function pc_test.age_reservation(n int, d interval) returns void language sql as $$
  update admission_private.reservations
     set admitted_at = admitted_at - d, lease_expires_at = lease_expires_at - d,
         cost_day = ((admitted_at - d) at time zone 'UTC')::date
   where ticket_id = pc_test.tid(n) $$;
create function pc_test.expire_lease(n int) returns void language sql as $$
  update admission_private.reservations set lease_expires_at = admitted_at + interval '1 microsecond'
   where ticket_id = pc_test.tid(n) $$;
grant execute on all functions in schema pc_test to service_role;

-- ===== 1. Privileges and structure (12) =====
select is((select count(*)::int from pg_namespace n, aclexplode(n.nspacl) a
           where n.nspname = 'admission_private' and a.grantee <> n.nspowner), 0,
          'admission_private schema: no ACL entry for any non-owner role (incl. PUBLIC)');
select is((select count(*)::int from pg_class c, aclexplode(c.relacl) a
           where c.relnamespace = 'admission_private'::regnamespace and a.grantee <> c.relowner), 0,
          'admission_private relations: no ACL entry for any non-owner role');
select is((select count(*)::int from (values ('anon'), ('authenticated'), ('service_role')) r(role)
           where has_schema_privilege(r.role, 'admission_private', 'USAGE')), 0,
          'anon/authenticated/service_role lack USAGE on admission_private');
select is((select count(*)::int from (values ('anon'), ('authenticated'), ('service_role')) r(role)
           cross join (values ('admission_private.tickets'), ('admission_private.reservations'), ('admission_private.consent_receipts')) t(tbl)
           where has_table_privilege(r.role, t.tbl, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')), 0,
          'no API role holds any table privilege on the admission tables');
select is((select count(*)::int from pg_class c where c.relnamespace = 'admission_private'::regnamespace
           and c.relkind = 'r' and c.relrowsecurity), 3, 'RLS enabled on all 3 admission tables');
select is((select count(*)::int from pg_proc p, aclexplode(p.proacl) a
           where p.pronamespace = 'admission_private'::regnamespace and a.grantee <> p.proowner), 0,
          'admission_private helper functions: no EXECUTE for any non-owner role');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'admission\_%'), 7,
          'exactly seven public admission RPCs (six store RPCs + admission_retry_check, migration 20261114000000)');
select is((select count(*)::int from pg_proc p, aclexplode(p.proacl) a
           where p.pronamespace = 'public'::regnamespace and p.proname like 'admission\_%' and a.grantee = 0), 0,
          'admission RPCs: no PUBLIC EXECUTE');
select is((select count(*)::int from pg_proc p cross join (values ('anon'), ('authenticated')) r(role)
           where p.pronamespace = 'public'::regnamespace and p.proname like 'admission\_%'
             and has_function_privilege(r.role, p.oid, 'EXECUTE')), 0, 'anon/authenticated cannot EXECUTE any admission RPC');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'admission\_%'
             and has_function_privilege('service_role', p.oid, 'EXECUTE')), 7, 'service_role can EXECUTE all seven admission RPCs');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'admission\_%'
             and p.prosecdef and p.proconfig @> array['search_path=""']), 7, 'all RPCs SECURITY DEFINER with empty search_path');
select is((select string_agg(table_name || '.' || column_name, ',' order by table_name, column_name)
           from information_schema.columns where table_schema = 'admission_private'),
  'consent_receipts.disclosure_version,consent_receipts.granted_at,consent_receipts.processor,consent_receipts.purpose,consent_receipts.receipt_id,consent_receipts.revoked_at,consent_receipts.session_id,'
  || 'reservations.actual_microusd,reservations.admitted_at,reservations.cost_day,reservations.dispatched_at,reservations.lease_expires_at,reservations.network_key,reservations.outcome,reservations.reservation_id,reservations.reserved_microusd,reservations.session_id,reservations.settled_at,reservations.state,reservations.ticket_id,'
  || 'tickets.attestation_digest,tickets.claims_expires_at,tickets.claims_issued_at,tickets.consent_receipt_id,tickets.consumed_at,tickets.document_digest,tickets.expires_at,tickets.issued_at,tickets.network_key,tickets.revoked_at,tickets.session_id,tickets.ticket_id',
  'stored columns are exactly ids/digests/network key/times/amounts: no PDF, text, rows, raw IP or token');

-- ===== 2. Live denial for anon / authenticated / service_role direct access (21) =====
set local role anon;
select throws_ok($$ select public.admission_issue(null, null, null, null, null, null, null, null, null, null) $$, '42501', null, 'anon: issue RPC denied');
select throws_ok($$ select public.admission_admit(null, null, null, null, null, null, null, null, null, null, null) $$, '42501', null, 'anon: admit RPC denied');
select throws_ok($$ select public.admission_dispatch(null, null, null) $$, '42501', null, 'anon: dispatch RPC denied');
select throws_ok($$ select public.admission_finish(null, null, null, null) $$, '42501', null, 'anon: finish RPC denied');
select throws_ok($$ select public.admission_revoke(null, null, null) $$, '42501', null, 'anon: revoke RPC denied');
select throws_ok($$ select public.admission_purge(null) $$, '42501', null, 'anon: purge RPC denied');
select throws_ok($$ select * from admission_private.tickets $$, '42501', null, 'anon: SELECT tickets denied');
select throws_ok($$ insert into admission_private.reservations default values $$, '42501', null, 'anon: INSERT reservations denied');
select throws_ok($$ update admission_private.consent_receipts set revoked_at = now() $$, '42501', null, 'anon: UPDATE receipts denied');
reset role;
set local role authenticated;
select ok(set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true) is not null, 'setup');
select throws_ok($$ select public.admission_issue(null, null, null, null, null, null, null, null, null, null) $$, '42501', null, 'authenticated: issue RPC denied');
select throws_ok($$ select public.admission_admit(null, null, null, null, null, null, null, null, null, null, null) $$, '42501', null, 'authenticated: admit RPC denied');
select throws_ok($$ select public.admission_dispatch(null, null, null) $$, '42501', null, 'authenticated: dispatch RPC denied');
select throws_ok($$ select public.admission_finish(null, null, null, null) $$, '42501', null, 'authenticated: finish RPC denied');
select throws_ok($$ select public.admission_revoke(null, null, null) $$, '42501', null, 'authenticated: revoke RPC denied');
select throws_ok($$ select public.admission_purge(null) $$, '42501', null, 'authenticated: purge RPC denied');
select throws_ok($$ select * from admission_private.reservations $$, '42501', null, 'authenticated: SELECT reservations denied');
select throws_ok($$ insert into admission_private.tickets default values $$, '42501', null, 'authenticated: INSERT tickets denied');
select throws_ok($$ delete from admission_private.consent_receipts $$, '42501', null, 'authenticated: DELETE receipts denied');
reset role;
set local role service_role;
select throws_ok($$ select * from admission_private.tickets $$, '42501', null, 'service_role: no direct SELECT on tickets (RPC only)');
select throws_ok($$ update admission_private.reservations set state = 'released' $$, '42501', null, 'service_role: no direct UPDATE on reservations');

-- ===== 3. Issue: single-use attestation/ticket/receipt, DB clock, lifetime, shape (12) =====
select is(pc_test.issue(1, 1, 1) ->> 'status', 'ok', 'issue ticket 1');
select is(pc_test.issue_at(pc_test.tid(900), pc_test.sid(1), pc_test.rid(900), pc_test.dig('doc'), pc_test.dig('att-1'), pc_test.net(1)) ->> 'reason',
          'attestation_replayed', 'bot attestation digest is single-use across tickets');
select is(pc_test.issue_at(pc_test.tid(1), pc_test.sid(1), pc_test.rid(901), pc_test.dig('doc'), pc_test.dig('att-901'), pc_test.net(1)) ->> 'reason',
          'ticket_id_reused', 'ticket ID cannot be re-issued');
select is(pc_test.issue_at(pc_test.tid(902), pc_test.sid(1), pc_test.rid(1), pc_test.dig('doc'), pc_test.dig('att-902'), pc_test.net(1)) ->> 'reason',
          'consent_receipt_reused', 'consent receipt ID cannot be re-bound');
select is(pc_test.issue_at(pc_test.tid(903), pc_test.sid(1), pc_test.rid(903), pc_test.dig('doc'), pc_test.dig('att-903'), pc_test.net(1),
                           client_off => interval '5 minutes') ->> 'reason',
          'clock_mismatch', 'untrusted caller clock 5 min ahead of DB clock rejected');
select is(pc_test.issue_at(pc_test.tid(904), pc_test.sid(1), pc_test.rid(904), pc_test.dig('doc'), pc_test.dig('att-904'), pc_test.net(1),
                           issued_off => interval '-4 minutes', expires_off => interval '60 seconds') ->> 'reason',
          'clock_mismatch', 'backdated claims.issuedAt rejected against DB clock');
select is(pc_test.issue_at(pc_test.tid(905), pc_test.sid(1), pc_test.rid(905), pc_test.dig('doc'), pc_test.dig('att-905'), pc_test.net(1),
                           expires_off => interval '301 seconds') ->> 'reason',
          'invalid_ticket_lifetime', 'ticket lifetime over 300 s rejected');
select is(pc_test.issue_at(pc_test.tid(906), pc_test.sid(1), pc_test.rid(906), pc_test.dig('doc'), pc_test.dig('att-906'), pc_test.net(1),
                           expires_off => interval '-1 second') ->> 'reason',
          'invalid_ticket_lifetime', 'expiry before issuance rejected');
select is(pc_test.issue_at(pc_test.tid(907), pc_test.sid(1), pc_test.rid(907), upper(pc_test.dig('doc')), pc_test.dig('att-907'), pc_test.net(1)) ->> 'reason',
          'invalid_input', 'non-canonical document digest rejected');
select is(pc_test.issue_at(pc_test.tid(908), pc_test.sid(1), pc_test.rid(908), pc_test.dig('doc'), pc_test.dig('att-908'), '203.0.113.7') ->> 'reason',
          'invalid_input', 'raw IP literal refused as network key');
select is(pc_test.issue_at(pc_test.tid(909), pc_test.sid(1), pc_test.rid(909), pc_test.dig('doc'), pc_test.dig('att-909'), pc_test.net(1),
                           client_null => true) ->> 'reason',
          'clock_mismatch', 'missing caller clock fails closed');
reset role;
select is((select count(*)::int from admission_private.tickets), 1, 'only the valid issuance stored a ticket (denials stored nothing)');

-- ===== 4. Admit: binding, one-use, expiry, revocation (20) =====
set local role service_role;
select is(public.admission_admit(pc_test.tid(999), pc_test.sid(1), pc_test.rid(999), pc_test.dig('doc'), clock_timestamp(),
          clock_timestamp() + interval '300 seconds', array[pc_test.net(1)], 1000000, 1000, 120, clock_timestamp()) ->> 'reason',
          'unknown_ticket', 'never-issued (forged) ticket denied');
select is(pc_test.admit(1, 2, array[1]) ->> 'reason', 'unknown_ticket', 'ticket presented by another session denied (indistinguishable from unknown)');
select is(pc_test.admit(1, 1, array[1], doc => 'other-doc') ->> 'reason', 'binding_mismatch', 'document digest mismatch denied');
select is(pc_test.admit(1, 1, array[1]) ->> 'reason', 'ticket_replayed', 'ticket burned by the failed attempt: correct retry is replay');
select is(pc_test.issue(2, 2, 1) ->> 'status', 'ok', 'issue ticket 2');
select is(pc_test.admit(2, 2, array[1], receipt => pc_test.rid(1)) ->> 'reason', 'binding_mismatch', 'consent receipt mismatch denied');
select is(pc_test.issue(3, 3, 1) ->> 'status', 'ok', 'issue ticket 3');
select is(pc_test.admit(3, 3, array[2]) ->> 'reason', 'binding_mismatch', 'network mismatch denied');
select is(pc_test.issue(4, 4, 1) ->> 'status', 'ok', 'issue ticket 4');
select is(pc_test.admit(4, 4, array[1], expiry_shift => interval '1 second') ->> 'reason', 'binding_mismatch', 'claims differing from the issued ticket denied');
select is(pc_test.issue(5, 5, 1) ->> 'status', 'ok', 'issue ticket 5');
select is(public.admission_admit(pc_test.tid(5), pc_test.sid(5), pc_test.rid(5), pc_test.dig('doc'), (select issued from pc_test.claims where n = 5),
          (select expires from pc_test.claims where n = 5), array[pc_test.net(1)], 1000000, 1000, 120, clock_timestamp() - interval '31 seconds') ->> 'reason',
          'clock_mismatch', 'admit with caller clock 31 s behind DB rejected');
select is(pc_test.admit(5, 5, array[1]) ->> 'status', 'ok', 'clock-mismatch attempt did not burn the ticket; valid admit succeeds');
select is(pc_test.admit(5, 5, array[1]) ->> 'reason', 'ticket_replayed', 'sequential replay of an admitted ticket denied');
select is(pc_test.issue(6, 6, 1) ->> 'status', 'ok', 'issue ticket 6');
reset role;
update admission_private.tickets set issued_at = issued_at - interval '301 seconds', expires_at = expires_at - interval '301 seconds' where ticket_id = pc_test.tid(6);
set local role service_role;
select is(pc_test.admit(6, 6, array[1]) ->> 'reason', 'ticket_expired', 'ticket past its DB-clock expiry denied');
select is(pc_test.issue(7, 7, 1) ->> 'status', 'ok', 'issue ticket 7');
select is(pc_test.rev(7, 8) ->> 'reason', 'unknown_receipt', 'another session cannot revoke the receipt');
select is(pc_test.rev(7, 7) ->> 'status', 'ok', 'owning session revokes before admission');
select is(pc_test.admit(7, 7, array[1]) ->> 'reason', 'ticket_revoked', 'revoked unused ticket denied');

-- ===== 5. Admit input validation (5) =====
select is(pc_test.issue(8, 8, 1) ->> 'status', 'ok', 'issue ticket 8');
select is(pc_test.admit(8, 8, array[1], ceil_usd => 500, reserve => 1000) ->> 'reason', 'invalid_input', 'reservation above daily ceiling rejected as invalid');
select is(pc_test.admit(8, 8, array[1], reserve => 0) ->> 'reason', 'invalid_input', 'zero reservation rejected');
select is(pc_test.admit(8, 8, array[1, 2, 3]) ->> 'reason', 'invalid_input', 'more than [current, previous] network keys rejected');
select is(public.admission_admit(pc_test.tid(8), pc_test.sid(8), pc_test.rid(8), pc_test.dig('doc'), (select issued from pc_test.claims where n = 8),
          (select expires from pc_test.claims where n = 8), array['2001:db8::1'], 1000000, 1000, 120, clock_timestamp()) ->> 'reason',
          'invalid_input', 'raw IPv6 literal refused as network key');

-- ===== 6. Session: 1 concurrent, 3 per rolling hour (9) =====
select is(pc_test.ia(11, 10, 10), 'ok', 'session admission 1 ok');
select is(pc_test.ia(12, 10, 10), 'session_concurrency', 'second concurrent session admission refused');
select is(pc_test.fin(11, 0, 'failed') ->> 'status', 'ok', 'release admission 1 (frees concurrency)');
select is(pc_test.ia(13, 10, 10), 'ok', 'session admission 2 ok (denied attempt did not count)');
select is(pc_test.fin(13, 0, 'failed') ->> 'status', 'ok', 'release admission 2');
select is(pc_test.ia(14, 10, 10), 'ok', 'session admission 3 ok');
select is(pc_test.fin(14, 0, 'failed') ->> 'status', 'ok', 'release admission 3');
select is(pc_test.ia(15, 10, 10), 'session_hourly_quota', '4th admission within the rolling hour refused');
reset role;
do $$ begin perform pc_test.age_reservation(k, interval '61 minutes') from generate_series(11, 14) k; end $$;
set local role service_role;
select is(pc_test.ia(16, 10, 10), 'ok', 'after earlier admissions leave the rolling hour the session is admitted again');

-- ===== 7. Network: 3 concurrent, lease recovery, 20 per rolling hour, key rotation (11) =====
select is(pc_test.ia(101, 101, 20) || '/' || pc_test.ia(102, 102, 20) || '/' || pc_test.ia(103, 103, 20), 'ok/ok/ok',
          'three concurrent admissions on one network');
select is(pc_test.ia(104, 104, 20), 'network_concurrency', 'fourth concurrent network admission refused');
reset role;
do $$ begin perform pc_test.expire_lease(101); end $$;
set local role service_role;
select is(pc_test.ia(105, 105, 20), 'ok', 'expired undispatched lease is recovered: slot reusable');
select is(pc_test.dispatch(101, 101) ->> 'reason', 'lease_expired', 'expired lease cannot be dispatched (no resurrection)');
select is(pc_test.fin(101, 0, 'failed') ->> 'status', 'ok', 'late release of expired undispatched lease ok');
select is(pc_test.release_all(array[102, 103, 105]), 3, 'release remaining network admissions');
select is(pc_test.churn(106, 121, 20), 16, '16 further admissions bring the network to 20 in the rolling hour');
select is(pc_test.ia(122, 122, 20), 'network_hourly_quota', '21st network admission within the hour refused');
select is(pc_test.ia(123, 123, 21, keys => array[21, 20]), 'network_hourly_quota', 'rotated key [current, previous] still counts the previous key window');
select is(pc_test.ia(124, 124, 20, keys => array[21, 20]), 'network_hourly_quota', 'ticket bound to the previous key binds but is still quota-limited');
select is(pc_test.ia(125, 125, 22), 'ok', 'an unrelated network is unaffected');

-- ===== 8. Dispatch, revocation before dispatch, idempotent settlement, no resurrection (24) =====
select is(pc_test.ia(201, 201, 30), 'ok', 'admit 201');
select is(pc_test.dispatch(201, 999) ->> 'reason', 'unknown_reservation', 'dispatch from another session denied');
select is(pc_test.rev(201, 201) ->> 'status', 'ok', 'consent revoked after admission, before dispatch');
select is(pc_test.dispatch(201, 201) ->> 'reason', 'consent_revoked', 'dispatch refused after revocation');
select is(pc_test.fin(201, 0, 'failed') ->> 'status', 'ok', 'revoked admission released');
select is(pc_test.ia(202, 202, 30), 'ok', 'admit 202');
select is(pc_test.dispatch(202, 202) ->> 'status', 'ok', 'dispatch 202');
select is(pc_test.dispatch(202, 202) ->> 'reason', 'not_dispatchable', 'second dispatch of the same reservation refused');
select is(pc_test.rev(202, 202) ->> 'already_revoked', 'false', 'revocation after dispatch recorded');
select is(pc_test.fin(202, 500, 'success') - 'cost_day', '{"status":"ok","replayed":false,"consent_revoked":true}'::jsonb,
          'settlement reports consent revoked after dispatch (server can withhold result)');
select is(pc_test.fin(202, 500, 'success') ->> 'replayed', 'true', 'identical settlement is idempotent');
select is(pc_test.fin(202, 400, 'success') ->> 'reason', 'settlement_conflict', 'different settlement of a settled reservation is a conflict');
select is(pc_test.rev(202, 202) ->> 'already_revoked', 'true', 'repeat revocation idempotent');
select is(pc_test.ia(203, 203, 30), 'ok', 'admit 203');
select is(pc_test.dispatch(203, 203) ->> 'status', 'ok', 'dispatch 203');
select is(pc_test.fin(203, 1001, 'success') ->> 'reason', 'invalid_settlement', 'actual cost above reservation refused');
select is(pc_test.ia(204, 204, 30), 'ok', 'admit 204');
select is(pc_test.fin(204, 5, 'failed') ->> 'reason', 'invalid_settlement', 'undispatched reservation cannot report provider cost');
select is(pc_test.fin(204, 0, 'success') ->> 'reason', 'invalid_settlement', 'undispatched reservation cannot report success');
select is(pc_test.fin(204, 0, 'failed') ->> 'status', 'ok', 'undispatched reservation released as 0/failed');
select is(pc_test.dispatch(204, 204) ->> 'reason', 'not_dispatchable', 'released reservation never re-dispatched');
select is((public.admission_finish('00000000-0000-4000-8000-00000000dead', 0, 'failed', clock_timestamp()) ->> 'reason')
          || '/' || (pc_test.fin(203, -1, 'failed') ->> 'reason') || '/' || (pc_test.fin(203, 0, 'cancelled') ->> 'reason'),
          'unknown_reservation/invalid_input/invalid_input', 'unknown reservation, negative cost and unknown outcome rejected');
reset role;
select is((select state || ':' || coalesce(actual_microusd::text, '-') from admission_private.reservations where ticket_id = pc_test.tid(203)),
          'dispatched:-', 'refused over-reservation settlement leaves full reservation charged');
select is((select state || ':' || actual_microusd from admission_private.reservations where ticket_id = pc_test.tid(202)),
          'settled:500', 'conflicting settlement did not overwrite the stored settlement');

-- ===== 9. Daily provider-cost ceiling, lease recovery and cross-day settlement (14) =====
-- Move every earlier reservation out of today's UTC bucket so the bucket starts empty.
update admission_private.reservations set admitted_at = admitted_at - interval '2 days',
       lease_expires_at = lease_expires_at - interval '2 days', cost_day = cost_day - 2;
set local role service_role;
select is(pc_test.ia(301, 301, 301, 3000, 1000) || '/' || pc_test.ia(302, 302, 302, 3000, 1000) || '/' || pc_test.ia(303, 303, 303, 3000, 1000),
          'ok/ok/ok', 'three 1000 reservations fill a 3000 daily ceiling');
select is(pc_test.ia(304, 304, 304, 3000, 1), 'daily_cost_ceiling', 'any further reservation exceeds the ceiling');
select is(pc_test.dispatch(301, 301) ->> 'status', 'ok', 'dispatch 301');
select is(pc_test.fin(301, 400, 'success') ->> 'status', 'ok', 'settle 301 at actual 400 (frees 600)');
select is(pc_test.ia(305, 305, 305, 3000, 601), 'daily_cost_ceiling', 'reservation 1 over the remaining budget refused');
select is(pc_test.ia(306, 306, 306, 3000, 600), 'ok', 'reservation exactly reaching the ceiling admitted');
reset role;
do $$ begin perform pc_test.expire_lease(302); end $$;
set local role service_role;
select is(pc_test.ia(307, 307, 307, 3000, 1000), 'ok', 'expired undispatched lease releases its reserved cost');
select is(pc_test.dispatch(303, 303) ->> 'status', 'ok', 'dispatch 303');
reset role;
do $$ begin perform pc_test.expire_lease(303); end $$;
set local role service_role;
select is(pc_test.ia(308, 308, 308, 3000, 1), 'daily_cost_ceiling', 'dispatched reservation keeps full cost after lease expiry until settled');
reset role;
do $$ begin perform pc_test.age_reservation(303, interval '1 day'); end $$;
set local role service_role;
select is(pc_test.fin(303, 1000, 'failed') ->> 'cost_day', ((clock_timestamp() at time zone 'UTC')::date - 1)::text,
          'cross-day settlement stays attributed to the original UTC day');
select is(pc_test.ia(309, 309, 309, 3000, 1000), 'ok', 'yesterday''s settlement does not consume today''s budget');
select is(pc_test.ia(310, 310, 310, 3000, 1), 'daily_cost_ceiling', 'today is full again: 400 + 600 + 1000 + 1000');
select is(pc_test.fin(303, 1000, 'failed') ->> 'replayed', 'true', 'cross-day settlement idempotent');
select ok(exists (select 1 from pg_locks where locktype = 'advisory' and pid = pg_backend_pid() and granted),
          'admission RPCs hold the global transaction-scoped advisory lock');

-- ===== 10. Guard triggers: forward-only, write-once, immutable bindings (4) =====
reset role;
select throws_ok($$ update admission_private.reservations set state = 'admitted', settled_at = null, actual_microusd = null, outcome = null where ticket_id = pc_test.tid(204) $$,
                 'PA003', null, 'released reservation cannot be resurrected');
select throws_ok($$ update admission_private.reservations set state = 'settled', dispatched_at = now(), settled_at = now(), actual_microusd = 0, outcome = 'failed' where ticket_id = pc_test.tid(309) $$,
                 'PA003', null, 'admitted reservation cannot skip dispatch to settled');
select throws_ok($$ update admission_private.tickets set consumed_at = null where ticket_id = pc_test.tid(5) $$, 'PA002', null, 'consumed ticket cannot be un-consumed');
select throws_ok($$ update admission_private.tickets set document_digest = pc_test.dig('x') where ticket_id = pc_test.tid(8) $$, 'PA002', null, 'ticket binding immutable');

-- ===== 11. Purge: minimization without replay or resurrection (5) =====
select is((select count(*)::int from admission_private.reservations where ticket_id = pc_test.tid(303) and state = 'settled'
           and cost_day = (clock_timestamp() at time zone 'UTC')::date - 1), 1, 'stored settlement keeps cost_day = previous UTC day');
-- Age everything except ticket 309 past the 2-day retention (time columns only; guards untouched).
update admission_private.reservations set admitted_at = admitted_at - interval '3 days', lease_expires_at = lease_expires_at - interval '3 days',
       cost_day = cost_day - 3 where ticket_id <> pc_test.tid(309);
update admission_private.tickets set issued_at = issued_at - interval '3 days', expires_at = expires_at - interval '3 days' where ticket_id <> pc_test.tid(309);
update admission_private.consent_receipts set granted_at = granted_at - interval '3 days' where receipt_id <> pc_test.rid(309);
set local role service_role;
select is(public.admission_purge(clock_timestamp()) - 'status',
          jsonb_build_object('reservations', (select count(*) from pc_test.res) - 1, 'tickets', (select count(*) from pc_test.claims) - 1,
                             'receipts', (select count(*) from pc_test.claims) - 1),
          'purge removes every row older than 2 days and keeps the recent one');
select is(pc_test.admit(5, 5, array[1]) ->> 'reason', 'unknown_ticket', 'replay of a purged ticket still denied');
select is(pc_test.fin(202, 500, 'success') ->> 'reason', 'unknown_reservation', 'settlement of a purged reservation denied');
reset role;
select is((select state from admission_private.reservations where ticket_id = pc_test.tid(309)), 'admitted', 'recent reservation retained by purge');

select * from finish();
rollback;
