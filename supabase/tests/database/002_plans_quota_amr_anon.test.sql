-- PathCheck S: regression suite for the per-owner plan quota (200), delete_my_account
-- recent-authentication (stale/future/malformed `amr`) and anonymous RPC/direct writes.
-- Run against a LOCAL/TEST Supabase stack only:  supabase test db
-- Everything runs in one transaction and is rolled back. Synthetic data only.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(51);

-- Synthetic identities (fixed UUIDs, reserved .test domain).
--   C: quota owner   D: quota bystander   E: AMR refusals then mixed-array success
--   F: stale boundary (-599s) success     G: future boundary (+59s) success
insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-00000000000c', 'user-c@pathcheck.test', 'authenticated', 'authenticated'),
       ('00000000-0000-4000-8000-00000000000d', 'user-d@pathcheck.test', 'authenticated', 'authenticated'),
       ('00000000-0000-4000-8000-00000000000e', 'user-e@pathcheck.test', 'authenticated', 'authenticated'),
       ('00000000-0000-4000-8000-00000000000f', 'user-f@pathcheck.test', 'authenticated', 'authenticated'),
       ('00000000-0000-4000-8000-000000000010', 'user-g@pathcheck.test', 'authenticated', 'authenticated');

select ok(set_config('test.record', '{"schemaVersion":1,"recordRevision":0,"courseAttempts":[],"unresolvedItems":[]}', true) is not null, 'setup');
select ok(set_config('test.plan', '{"schemaVersion":1,"planId":"client-chosen","planRevision":0,"catalogRef":{"institutionId":"asu","programId":"bs-cis","catalogYearId":"synthetic-only","catalogVersion":"synthetic-v1","ruleSetStatus":"synthetic","sources":[]},"targetTerm":{"academicYear":2030,"season":"fall","sortIndex":6092},"activePlacements":[],"acceptedDraft":null,"availabilityEvidence":[],"availabilityRevision":0,"updatedAt":"2030-01-01T00:00:00Z"}', true) is not null, 'setup');

-- ===== Per-owner quota: 200 plans =====
set local role authenticated;
select ok(set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true) is not null, 'setup');
select is((select count(*)::int from (select public.create_plan(current_setting('test.record')::jsonb, current_setting('test.plan')::jsonb) as r from generate_series(1, 200)) s where s.r ->> 'status' = 'ok'), 200, 'C creates 200 plans');
select is((select count(*)::int from public.plans), 200, 'C sees exactly 200 own plans');
select throws_ok($$ select public.create_plan(current_setting('test.record')::jsonb, current_setting('test.plan')::jsonb) $$, 'PC001', 'plan_quota_exceeded', '201st create_plan rejected with plan_quota_exceeded');
select throws_ok($$ insert into public.plans (record_json, plan_json) values (current_setting('test.record')::jsonb, current_setting('test.plan')::jsonb) $$, 'PC001', 'plan_quota_exceeded', 'direct INSERT past quota rejected by trigger');
select is((select count(*)::int from public.plans), 200, 'rejected creates stored nothing');
select ok(set_config('test.c1', (select id::text from public.plans order by created_at, id limit 1), true) is not null, 'setup');
select is(public.save_plan(current_setting('test.c1')::uuid, 0, current_setting('test.record')::jsonb, jsonb_set(current_setting('test.plan')::jsonb, '{planId}', to_jsonb(current_setting('test.c1')))) ->> 'status', 'ok', 'save_plan (update) still allowed at quota');
select is(public.delete_plan(current_setting('test.c1')::uuid, 1) ->> 'status', 'ok', 'owner deletes one plan at quota');
select is(public.create_plan(current_setting('test.record')::jsonb, current_setting('test.plan')::jsonb) ->> 'status', 'ok', 'create succeeds again after freeing a slot');
select throws_ok($$ select public.create_plan(current_setting('test.record')::jsonb, current_setting('test.plan')::jsonb) $$, 'PC001', 'plan_quota_exceeded', 'quota re-enforced at 200 after refill');

select ok(set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000d","role":"authenticated"}', true) is not null, 'setup');
select is(public.create_plan(current_setting('test.record')::jsonb, current_setting('test.plan')::jsonb) ->> 'status', 'ok', 'quota is per owner: D unaffected by C at quota');
select is((select count(*)::int from public.plans), 1, 'D sees only its own plan');
reset role;
select is((select count(*)::int from public.plans where owner_user_id = '00000000-0000-4000-8000-00000000000c'), 200, 'C holds exactly 200 plans (superuser view)');

-- ===== delete_my_account: recent-authentication (amr) gate =====
set local role authenticated;
select ok(set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000e","role":"authenticated"}', true) is not null, 'setup');
select is(public.create_plan(current_setting('test.record')::jsonb, current_setting('test.plan')::jsonb) ->> 'status', 'ok', 'E creates a plan');

select ok(set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-00000000000e', 'role', 'authenticated', 'iat', floor(extract(epoch from now()))::bigint, 'amr', json_build_array(json_build_object('method', 'otp', 'timestamp', floor(extract(epoch from now()))::bigint - 601)))::text, true) is not null, 'setup');
select is(public.delete_my_account() ->> 'status', 'reauthentication_required', 'stale amr (601s) refused even with a freshly issued (refreshed) token');
select ok(set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-00000000000e', 'role', 'authenticated', 'amr', json_build_array(json_build_object('method', 'password', 'timestamp', floor(extract(epoch from now()))::bigint - 86400)))::text, true) is not null, 'setup');
select is(public.delete_my_account() ->> 'status', 'reauthentication_required', 'day-old amr refused');
select ok(set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-00000000000e', 'role', 'authenticated', 'amr', json_build_array(json_build_object('method', 'otp', 'timestamp', floor(extract(epoch from now()))::bigint + 61)))::text, true) is not null, 'setup');
select is(public.delete_my_account() ->> 'status', 'reauthentication_required', 'future amr beyond 60s skew refused');
select ok(set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-00000000000e', 'role', 'authenticated', 'amr', json_build_array(json_build_object('method', 'otp', 'timestamp', floor(extract(epoch from now()))::bigint + 31536000)))::text, true) is not null, 'setup');
select is(public.delete_my_account() ->> 'status', 'reauthentication_required', 'far-future amr refused');
select ok(set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-00000000000e', 'role', 'authenticated', 'amr', json_build_array(json_build_object('method', 'otp', 'timestamp', floor(extract(epoch from now()))::text)))::text, true) is not null, 'setup');
select is(public.delete_my_account() ->> 'status', 'reauthentication_required', 'string amr timestamp refused');
select ok(set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-00000000000e', 'role', 'authenticated', 'amr', json_build_object('method', 'otp', 'timestamp', floor(extract(epoch from now()))::bigint))::text, true) is not null, 'setup');
select is(public.delete_my_account() ->> 'status', 'reauthentication_required', 'non-array amr refused');
select ok(set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-00000000000e', 'role', 'authenticated', 'amr', json_build_array('otp'))::text, true) is not null, 'setup');
select is(public.delete_my_account() ->> 'status', 'reauthentication_required', 'amr without timestamps refused');
reset role;
select is((select count(*)::int from public.plans where owner_user_id = '00000000-0000-4000-8000-00000000000e'), 1, 'refused deletions kept E plans');
select is((select count(*)::int from auth.users where id = '00000000-0000-4000-8000-00000000000e'), 1, 'refused deletions kept E identity');

set local role authenticated;
select ok(set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-00000000000e', 'role', 'authenticated', 'amr', json_build_array(json_build_object('method', 'password', 'timestamp', floor(extract(epoch from now()))::bigint - 86400), json_build_object('method', 'otp', 'timestamp', floor(extract(epoch from now()))::bigint)))::text, true) is not null, 'setup');
select is(public.delete_my_account() ->> 'status', 'ok', 'latest amr entry is used: old + recent succeeds');
select ok(set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-00000000000f', 'role', 'authenticated', 'amr', json_build_array(json_build_object('method', 'otp', 'timestamp', floor(extract(epoch from now()))::bigint - 599)))::text, true) is not null, 'setup');
select is(public.delete_my_account() ->> 'status', 'ok', 'amr 599s old accepted (inside 600s window)');
select ok(set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-000000000010', 'role', 'authenticated', 'amr', json_build_array(json_build_object('method', 'otp', 'timestamp', floor(extract(epoch from now()))::bigint + 59)))::text, true) is not null, 'setup');
select is(public.delete_my_account() ->> 'status', 'ok', 'amr 59s in future accepted (inside 60s skew)');
reset role;
select is((select count(*)::int from auth.users where id in ('00000000-0000-4000-8000-00000000000e', '00000000-0000-4000-8000-00000000000f', '00000000-0000-4000-8000-000000000010')), 0, 'accepted deletions removed E/F/G identities');
select is((select count(*)::int from public.plans where owner_user_id = '00000000-0000-4000-8000-00000000000c'), 200, 'other owners unaffected by E/F/G deletion');

-- ===== Anonymous database role: RPCs and direct writes (even with forged claims) =====
set local role anon;
select ok(set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"anon"}', true) is not null, 'setup');
select ok(set_config('test.dvictim', '00000000-0000-4000-8000-000000000000', true) is not null, 'setup');
select throws_ok($$ select public.save_plan(current_setting('test.dvictim')::uuid, 0, '{}'::jsonb, '{}'::jsonb) $$, '42501', null, 'anon save_plan denied');
select throws_ok($$ select public.delete_plan(current_setting('test.dvictim')::uuid, 0) $$, '42501', null, 'anon delete_plan denied');
select throws_ok($$ select public.delete_my_account() $$, '42501', null, 'anon delete_my_account denied');
select throws_ok($$ update public.plans set revision = revision + 1 $$, '42501', null, 'anon direct UPDATE denied');
select throws_ok($$ delete from public.plans $$, '42501', null, 'anon direct DELETE denied');
reset role;
select is((select count(*)::int from public.plans where owner_user_id = '00000000-0000-4000-8000-00000000000c'), 200, 'anon attempts with forged sub changed nothing');

select * from finish();
rollback;
