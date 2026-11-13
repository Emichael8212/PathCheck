-- PathCheck S: real-Postgres RLS + grants + CAS suite for public.plans.
-- Run against a LOCAL/TEST Supabase stack only:  supabase test db
-- Personas: User A, User B (authenticated with distinct JWT subs) and the anon DB role.
-- Everything runs in one transaction and is rolled back. Synthetic data only.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(68);

-- Synthetic identities (fixed UUIDs, reserved .test domain).
insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-00000000000a', 'user-a@pathcheck.test', 'authenticated', 'authenticated'),
       ('00000000-0000-4000-8000-00000000000b', 'user-b@pathcheck.test', 'authenticated', 'authenticated');

-- Minimal synthetic payloads (DB checks shape; the browser enforces the full contract).
select ok(set_config('test.record', '{"schemaVersion":1,"recordRevision":0,"courseAttempts":[],"unresolvedItems":[]}', true) is not null, 'setup');
select ok(set_config('test.plan', '{"schemaVersion":1,"planId":"client-chosen","planRevision":0,"catalogRef":{"institutionId":"asu","programId":"bs-cis","catalogYearId":"synthetic-only","catalogVersion":"synthetic-v1","ruleSetStatus":"synthetic","sources":[]},"targetTerm":{"academicYear":2030,"season":"fall","sortIndex":6092},"activePlacements":[],"acceptedDraft":null,"availabilityEvidence":[],"availabilityRevision":0,"updatedAt":"2030-01-01T00:00:00Z"}', true) is not null, 'setup');

-- ===== Structural: RLS, grants, function privileges =====
select ok((select relrowsecurity from pg_class where oid = 'public.plans'::regclass), 'RLS enabled on public.plans');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'plans'), 4, 'exactly four plans policies');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'plans' and roles <> '{authenticated}'), 0, 'all policies scoped to authenticated only');
select ok(not has_table_privilege('anon', 'public.plans', 'SELECT'), 'anon cannot SELECT');
select ok(not has_table_privilege('anon', 'public.plans', 'INSERT'), 'anon cannot INSERT');
select ok(not has_table_privilege('anon', 'public.plans', 'UPDATE'), 'anon cannot UPDATE');
select ok(not has_table_privilege('anon', 'public.plans', 'DELETE'), 'anon cannot DELETE');
select ok(not has_table_privilege('anon', 'public.plans', 'TRUNCATE'), 'anon cannot TRUNCATE');
select ok(not has_table_privilege('authenticated', 'public.plans', 'TRUNCATE'), 'authenticated cannot TRUNCATE');
select ok(not has_column_privilege('authenticated', 'public.plans', 'owner_user_id', 'INSERT'), 'owner_user_id not insertable');
select ok(not has_column_privilege('authenticated', 'public.plans', 'id', 'INSERT'), 'id not insertable');
select ok(not has_column_privilege('authenticated', 'public.plans', 'revision', 'INSERT'), 'revision not insertable');
select ok(not has_column_privilege('authenticated', 'public.plans', 'owner_user_id', 'UPDATE'), 'owner_user_id not updatable');
select ok(not has_column_privilege('authenticated', 'public.plans', 'id', 'UPDATE'), 'id not updatable');
select ok(not has_function_privilege('anon', 'public.create_plan(jsonb,jsonb)', 'EXECUTE'), 'anon cannot execute create_plan');
select ok(not has_function_privilege('anon', 'public.save_plan(uuid,bigint,jsonb,jsonb)', 'EXECUTE'), 'anon cannot execute save_plan');
select ok(not has_function_privilege('anon', 'public.delete_plan(uuid,bigint)', 'EXECUTE'), 'anon cannot execute delete_plan');
select ok(not has_function_privilege('anon', 'public.delete_my_account()', 'EXECUTE'), 'anon cannot execute delete_my_account');
select ok(not has_schema_privilege('anon', 'private', 'USAGE') and not has_schema_privilege('authenticated', 'private', 'USAGE'), 'private schema not exposed');

-- ===== Anonymous database role =====
set local role anon;
select throws_ok($$ select count(*) from public.plans $$, '42501', null, 'anon SELECT denied');
select throws_ok($$ insert into public.plans (record_json, plan_json) values ('{}', '{}') $$, '42501', null, 'anon INSERT denied');
select throws_ok($$ select public.create_plan(current_setting('test.record')::jsonb, current_setting('test.plan')::jsonb) $$, '42501', null, 'anon create_plan denied');
reset role;

-- ===== User A creates (Save as new) =====
set local role authenticated;
select ok(set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true) is not null, 'setup');
select ok(set_config('test.a1', public.create_plan(current_setting('test.record')::jsonb, current_setting('test.plan')::jsonb) -> 'plan' ->> 'id', true) is not null, 'setup');
select isnt(current_setting('test.a1'), 'client-chosen', 'server assigns a fresh id');
select is((select plan_json ->> 'planId' from public.plans where id = current_setting('test.a1')::uuid), current_setting('test.a1'), 'copied planId rewritten to server id');
select is((select revision from public.plans where id = current_setting('test.a1')::uuid), 0::bigint, 'new plan starts at revision 0');
select is((select owner_user_id from public.plans where id = current_setting('test.a1')::uuid), '00000000-0000-4000-8000-00000000000a'::uuid, 'owner derived from auth.uid()');
select is((select plan_json - 'planId' from public.plans where id = current_setting('test.a1')::uuid), current_setting('test.plan')::jsonb - 'planId', 'plan content otherwise stored unchanged');
select throws_ok(
  $$ insert into public.plans (owner_user_id, record_json, plan_json) values ('00000000-0000-4000-8000-00000000000b', current_setting('test.record')::jsonb, current_setting('test.plan')::jsonb) $$,
  '42501', null, 'owner spoofing on insert denied by column grant');
select throws_ok(
  $$ select public.create_plan(jsonb_set(current_setting('test.record')::jsonb, '{schemaVersion}', '2'), current_setting('test.plan')::jsonb) $$,
  '23514', null, 'wrong record schemaVersion rejected');
select throws_ok(
  $$ select public.create_plan(current_setting('test.record')::jsonb, current_setting('test.plan')::jsonb || '{"availability_json":[]}') $$,
  '23514', null, 'shadow availability_json rejected');
select throws_ok(
  $$ select public.create_plan(current_setting('test.record')::jsonb, jsonb_set(current_setting('test.plan')::jsonb, '{blob}', to_jsonb(repeat('x', 2100000)))) $$,
  '23514', null, 'oversized payload rejected');

-- ===== User B: cross-owner access denied =====
select ok(set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true) is not null, 'setup');
select is((select count(*)::int from public.plans where id = current_setting('test.a1')::uuid), 0, 'B cannot read A plan by guessed id');
select is((select count(*)::int from public.plans), 0, 'B lists no plans');
select is_empty($$ update public.plans set revision = revision + 1 where id = current_setting('test.a1')::uuid returning 1 $$, 'B direct UPDATE affects 0 rows');
select is_empty($$ delete from public.plans where id = current_setting('test.a1')::uuid returning 1 $$, 'B direct DELETE affects 0 rows');
select is(public.save_plan(current_setting('test.a1')::uuid, 0, current_setting('test.record')::jsonb, jsonb_set(current_setting('test.plan')::jsonb, '{planId}', to_jsonb(current_setting('test.a1')))) ->> 'status', 'not_found', 'B save_plan on A plan: not_found');
select is(public.delete_plan(current_setting('test.a1')::uuid, 0) ->> 'status', 'not_found', 'B delete_plan on A plan: not_found');
select ok(set_config('test.b1', public.create_plan(current_setting('test.record')::jsonb, jsonb_set(current_setting('test.plan')::jsonb, '{planId}', to_jsonb(current_setting('test.a1')))) -> 'plan' ->> 'id', true) is not null, 'setup');
select isnt(current_setting('test.b1'), current_setting('test.a1'), 'B supplying A id as planId gets a different server id');
select is((select owner_user_id from public.plans where id = current_setting('test.b1')::uuid), '00000000-0000-4000-8000-00000000000b'::uuid, 'B plan owned by B');

-- ===== User A: CAS saves, conflicts, immutability =====
select ok(set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true) is not null, 'setup');
select ok(set_config('test.a1plan', jsonb_set(current_setting('test.plan')::jsonb, '{planId}', to_jsonb(current_setting('test.a1')))::text, true) is not null, 'setup');
select is((select revision from public.plans where id = current_setting('test.a1')::uuid), 0::bigint, 'A plan untouched by B attempts');
select is((select count(*)::int from public.plans where id = current_setting('test.b1')::uuid), 0, 'A cannot read B plan');
select is(public.save_plan(current_setting('test.a1')::uuid, 0, current_setting('test.record')::jsonb, jsonb_set(current_setting('test.a1plan')::jsonb, '{planRevision}', '5')) -> 'plan' ->> 'revision', '1', 'CAS save increments stored revision by exactly one');
select is((select plan_json -> 'planRevision' from public.plans where id = current_setting('test.a1')::uuid), '5'::jsonb, 'submitted planRevision stored unchanged (independent of CAS token)');
select is(public.save_plan(current_setting('test.a1')::uuid, 0, current_setting('test.record')::jsonb, current_setting('test.a1plan')::jsonb) ->> 'status', 'conflict', 'stale expectedRevision returns conflict');
select is((select plan_json -> 'planRevision' from public.plans where id = current_setting('test.a1')::uuid), '5'::jsonb, 'conflict did not overwrite newer state');
select is(public.save_plan(current_setting('test.a1')::uuid, 1, current_setting('test.record')::jsonb, current_setting('test.plan')::jsonb) ->> 'status', 'identity_mismatch', 'planId/id mismatch rejected');
select throws_ok($$ update public.plans set revision = revision + 5 where id = current_setting('test.a1')::uuid $$, 'PC002', null, 'revision cannot jump');
select throws_ok($$ update public.plans set record_json = record_json where id = current_setting('test.a1')::uuid $$, 'PC002', null, 'blind write without revision advance rejected');
select throws_ok($$ update public.plans set owner_user_id = '00000000-0000-4000-8000-00000000000b' where id = current_setting('test.a1')::uuid $$, '42501', null, 'owner transfer denied by column grant');
select throws_ok($$ update public.plans set plan_json = jsonb_set(plan_json, '{planId}', '"other"'), revision = revision + 1 where id = current_setting('test.a1')::uuid $$, '23514', null, 'payload id change rejected');

-- ===== Deletion =====
select is(public.delete_plan(current_setting('test.a1')::uuid, 0) ->> 'status', 'conflict', 'stale delete returns conflict');
select is(public.delete_plan(current_setting('test.a1')::uuid, 1) ->> 'status', 'ok', 'owner deletes own plan at current revision');
select is((select count(*)::int from public.plans where id = current_setting('test.a1')::uuid), 0, 'deleted plan gone');
select ok(set_config('test.a2', public.create_plan(current_setting('test.record')::jsonb, current_setting('test.plan')::jsonb) -> 'plan' ->> 'id', true) is not null, 'setup');
select is(public.delete_my_account() ->> 'status', 'reauthentication_required', 'account deletion requires recent authentication');
select ok(set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-00000000000a', 'role', 'authenticated', 'amr', json_build_array(json_build_object('method', 'otp', 'timestamp', floor(extract(epoch from now()))::bigint)))::text, true) is not null, 'setup');
select is(public.delete_my_account() ->> 'status', 'ok', 'recently authenticated owner deletes account');
reset role;
select is((select count(*)::int from public.plans where owner_user_id = '00000000-0000-4000-8000-00000000000a'), 0, 'account deletion removed all A plans');
select is((select count(*)::int from auth.users where id = '00000000-0000-4000-8000-00000000000a'), 0, 'account deletion removed A identity');
select is((select count(*)::int from public.plans where owner_user_id = '00000000-0000-4000-8000-00000000000b'), 1, 'B data unaffected by A deletion');

select * from finish();
rollback;
