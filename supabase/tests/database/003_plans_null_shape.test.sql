-- PathCheck S: regression suite for NULL-bypass of JSON shape/identity CHECK constraints.
-- PostgreSQL CHECK accepts NULL (unknown); JSON extraction of a missing key yields NULL.
-- Every required-key predicate must therefore reject missing AND JSON-null keys on
-- create_plan, save_plan, direct INSERT/UPDATE (authenticated) and superuser writes.
-- Run against a LOCAL/TEST Supabase stack only:  supabase test db
-- Everything runs in one transaction and is rolled back. Synthetic data only.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(53);

-- Synthetic identity H (fixed UUID, reserved .test domain).
insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-000000000011', 'user-h@pathcheck.test', 'authenticated', 'authenticated');

select ok(set_config('test.record', '{"schemaVersion":1,"recordRevision":0,"courseAttempts":[],"unresolvedItems":[]}', true) is not null, 'setup');
select ok(set_config('test.plan', '{"schemaVersion":1,"planId":"client-chosen","planRevision":0,"catalogRef":{"institutionId":"asu","programId":"bs-cis","catalogYearId":"synthetic-only","catalogVersion":"synthetic-v1","ruleSetStatus":"synthetic","sources":[]},"targetTerm":{"academicYear":2030,"season":"fall","sortIndex":6092},"activePlacements":[],"acceptedDraft":null,"availabilityEvidence":[],"availabilityRevision":0,"updatedAt":"2030-01-01T00:00:00Z"}', true) is not null, 'setup');

-- ===== Structural: constraint definitions are NULL-safe =====
select is((select count(*)::int from pg_constraint where conrelid = 'public.plans'::regclass and contype = 'c'
            and conname in ('plans_record_shape', 'plans_plan_shape', 'plans_identity', 'plans_no_shadow_availability')
            and pg_get_constraintdef(oid) ~* 'IS TRUE\)+$'), 4, 'all JSON-extracting CHECK constraints are wrapped in IS TRUE');

-- ===== create_plan: missing / null required keys =====
set local role authenticated;
select ok(set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000011","role":"authenticated"}', true) is not null, 'setup');
select throws_ok($$ select public.create_plan('{}'::jsonb, '{}'::jsonb) $$, '23514', null, 'create_plan({}, {}) rejected');
select throws_ok($$ select public.create_plan('{}'::jsonb, current_setting('test.plan')::jsonb) $$, '23514', null, 'create_plan empty record rejected');
select throws_ok($$ select public.create_plan(current_setting('test.record')::jsonb, '{}'::jsonb) $$, '23514', null, 'create_plan empty plan rejected');
select throws_ok($$ select public.create_plan(current_setting('test.record')::jsonb - 'schemaVersion', current_setting('test.plan')::jsonb) $$, '23514', null, 'record missing schemaVersion rejected');
select throws_ok($$ select public.create_plan(jsonb_set(current_setting('test.record')::jsonb, '{schemaVersion}', 'null'), current_setting('test.plan')::jsonb) $$, '23514', null, 'record null schemaVersion rejected');
select throws_ok($$ select public.create_plan(current_setting('test.record')::jsonb - 'courseAttempts', current_setting('test.plan')::jsonb) $$, '23514', null, 'record missing courseAttempts rejected');
select throws_ok($$ select public.create_plan(jsonb_set(current_setting('test.record')::jsonb, '{courseAttempts}', 'null'), current_setting('test.plan')::jsonb) $$, '23514', null, 'record null courseAttempts rejected');
select throws_ok($$ select public.create_plan('[]'::jsonb, current_setting('test.plan')::jsonb) $$, '23514', null, 'non-object record rejected');
select throws_ok($$ select public.create_plan('null'::jsonb, current_setting('test.plan')::jsonb) $$, '23514', null, 'JSON-null record rejected');
select throws_ok($$ select public.create_plan(null, current_setting('test.plan')::jsonb) $$, '23502', null, 'SQL-NULL record rejected');
select throws_ok($$ select public.create_plan(current_setting('test.record')::jsonb, current_setting('test.plan')::jsonb - 'schemaVersion') $$, '23514', null, 'plan missing schemaVersion rejected');
select throws_ok($$ select public.create_plan(current_setting('test.record')::jsonb, jsonb_set(current_setting('test.plan')::jsonb, '{schemaVersion}', 'null')) $$, '23514', null, 'plan null schemaVersion rejected');
select throws_ok($$ select public.create_plan(current_setting('test.record')::jsonb, current_setting('test.plan')::jsonb - 'catalogRef') $$, '23514', null, 'plan missing catalogRef rejected');
select throws_ok($$ select public.create_plan(current_setting('test.record')::jsonb, jsonb_set(current_setting('test.plan')::jsonb, '{catalogRef}', 'null')) $$, '23514', null, 'plan null catalogRef rejected');
select throws_ok($$ select public.create_plan(current_setting('test.record')::jsonb, current_setting('test.plan')::jsonb - 'availabilityEvidence') $$, '23514', null, 'plan missing availabilityEvidence rejected');
select throws_ok($$ select public.create_plan(current_setting('test.record')::jsonb, jsonb_set(current_setting('test.plan')::jsonb, '{availabilityEvidence}', 'null')) $$, '23514', null, 'plan null availabilityEvidence rejected');
select throws_ok($$ select public.create_plan(current_setting('test.record')::jsonb, null) $$, '23514', null, 'SQL-NULL plan rejected');

-- ===== Direct INSERT (authenticated): missing / null required keys =====
select throws_ok($$ insert into public.plans (record_json, plan_json) values ('{}', '{}') $$, '23514', null, 'direct INSERT {}, {} rejected');
select throws_ok($$ insert into public.plans (record_json, plan_json) values (current_setting('test.record')::jsonb - 'courseAttempts', current_setting('test.plan')::jsonb) $$, '23514', null, 'direct INSERT record missing courseAttempts rejected');
select throws_ok($$ insert into public.plans (record_json, plan_json) values (current_setting('test.record')::jsonb, current_setting('test.plan')::jsonb - 'availabilityEvidence') $$, '23514', null, 'direct INSERT plan missing availabilityEvidence rejected');
select throws_ok($$ insert into public.plans (record_json, plan_json) values (current_setting('test.record')::jsonb, jsonb_set(current_setting('test.plan')::jsonb, '{catalogRef}', 'null')) $$, '23514', null, 'direct INSERT plan null catalogRef rejected');
select is((select count(*)::int from public.plans), 0, 'no rejected create stored a row');

-- Valid baseline plan.
select ok(set_config('test.h1', public.create_plan(current_setting('test.record')::jsonb, current_setting('test.plan')::jsonb) -> 'plan' ->> 'id', true) is not null, 'setup');
select ok(set_config('test.h1plan', jsonb_set(current_setting('test.plan')::jsonb, '{planId}', to_jsonb(current_setting('test.h1')))::text, true) is not null, 'setup');
select is((select plan_json ->> 'planId' from public.plans where id = current_setting('test.h1')::uuid), current_setting('test.h1'), 'valid create stores planId = server id');

-- ===== save_plan: missing / null required keys and identity =====
select throws_ok($$ select public.save_plan(current_setting('test.h1')::uuid, 0, '{}'::jsonb, current_setting('test.h1plan')::jsonb) $$, '23514', null, 'save_plan empty record rejected');
select throws_ok($$ select public.save_plan(current_setting('test.h1')::uuid, 0, current_setting('test.record')::jsonb - 'schemaVersion', current_setting('test.h1plan')::jsonb) $$, '23514', null, 'save_plan record missing schemaVersion rejected');
select throws_ok($$ select public.save_plan(current_setting('test.h1')::uuid, 0, current_setting('test.record')::jsonb, jsonb_build_object('planId', current_setting('test.h1'))) $$, '23514', null, 'save_plan plan with only planId rejected');
select throws_ok($$ select public.save_plan(current_setting('test.h1')::uuid, 0, current_setting('test.record')::jsonb, current_setting('test.h1plan')::jsonb - 'catalogRef') $$, '23514', null, 'save_plan plan missing catalogRef rejected');
select throws_ok($$ select public.save_plan(current_setting('test.h1')::uuid, 0, current_setting('test.record')::jsonb, jsonb_set(current_setting('test.h1plan')::jsonb, '{availabilityEvidence}', 'null')) $$, '23514', null, 'save_plan plan null availabilityEvidence rejected');
select is(public.save_plan(current_setting('test.h1')::uuid, 0, current_setting('test.record')::jsonb, current_setting('test.h1plan')::jsonb - 'planId') ->> 'status', 'identity_mismatch', 'save_plan plan missing planId: identity_mismatch');
select is(public.save_plan(current_setting('test.h1')::uuid, 0, current_setting('test.record')::jsonb, jsonb_set(current_setting('test.h1plan')::jsonb, '{planId}', 'null')) ->> 'status', 'identity_mismatch', 'save_plan plan null planId: identity_mismatch');
select is(public.save_plan(null, 0, current_setting('test.record')::jsonb, current_setting('test.h1plan')::jsonb - 'planId') ->> 'status', 'identity_mismatch', 'save_plan NULL id with missing planId: identity_mismatch');

-- ===== Direct UPDATE (authenticated): removing / nulling required keys =====
select throws_ok($$ update public.plans set plan_json = plan_json - 'planId', revision = revision + 1 where id = current_setting('test.h1')::uuid $$, '23514', null, 'direct UPDATE deleting planId rejected');
select throws_ok($$ update public.plans set plan_json = jsonb_set(plan_json, '{planId}', 'null'), revision = revision + 1 where id = current_setting('test.h1')::uuid $$, '23514', null, 'direct UPDATE nulling planId rejected');
select throws_ok($$ update public.plans set plan_json = jsonb_build_object('planId', id::text), revision = revision + 1 where id = current_setting('test.h1')::uuid $$, '23514', null, 'direct UPDATE plan to only planId rejected');
select throws_ok($$ update public.plans set plan_json = plan_json - 'catalogRef', revision = revision + 1 where id = current_setting('test.h1')::uuid $$, '23514', null, 'direct UPDATE deleting catalogRef rejected');
select throws_ok($$ update public.plans set plan_json = plan_json - 'availabilityEvidence', revision = revision + 1 where id = current_setting('test.h1')::uuid $$, '23514', null, 'direct UPDATE deleting availabilityEvidence rejected');
select throws_ok($$ update public.plans set plan_json = plan_json - 'schemaVersion', revision = revision + 1 where id = current_setting('test.h1')::uuid $$, '23514', null, 'direct UPDATE deleting plan schemaVersion rejected');
select throws_ok($$ update public.plans set record_json = '{}', revision = revision + 1 where id = current_setting('test.h1')::uuid $$, '23514', null, 'direct UPDATE empty record rejected');
select throws_ok($$ update public.plans set record_json = record_json - 'schemaVersion', revision = revision + 1 where id = current_setting('test.h1')::uuid $$, '23514', null, 'direct UPDATE deleting record schemaVersion rejected');
select throws_ok($$ update public.plans set record_json = jsonb_set(record_json, '{courseAttempts}', 'null'), revision = revision + 1 where id = current_setting('test.h1')::uuid $$, '23514', null, 'direct UPDATE nulling courseAttempts rejected');
reset role;

-- ===== Superuser direct write: CHECK holds independently of grants/RLS =====
select throws_ok($$ update public.plans set plan_json = plan_json - 'planId', revision = revision + 1 where id = current_setting('test.h1')::uuid $$, '23514', null, 'superuser UPDATE deleting planId rejected');
select throws_ok($$ update public.plans set record_json = record_json - 'courseAttempts', revision = revision + 1 where id = current_setting('test.h1')::uuid $$, '23514', null, 'superuser UPDATE deleting courseAttempts rejected');
select is((select revision from public.plans where id = current_setting('test.h1')::uuid), 0::bigint, 'all rejected writes left revision at 0');
select is((select plan_json from public.plans where id = current_setting('test.h1')::uuid), current_setting('test.h1plan')::jsonb, 'all rejected writes left plan_json unchanged');
select is((select record_json from public.plans where id = current_setting('test.h1')::uuid), current_setting('test.record')::jsonb, 'all rejected writes left record_json unchanged');

-- ===== Valid save still works after rejections =====
set local role authenticated;
select ok(set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000011","role":"authenticated"}', true) is not null, 'setup');
select is(public.save_plan(current_setting('test.h1')::uuid, 0, current_setting('test.record')::jsonb, current_setting('test.h1plan')::jsonb) -> 'plan' ->> 'revision', '1', 'valid save after rejections advances revision to 1');
reset role;

select * from finish();
rollback;
