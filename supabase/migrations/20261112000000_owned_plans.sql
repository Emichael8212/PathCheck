-- PathCheck owned cloud plans (S-owned). contracts-v1: SavedPlan / StorageService.
--
-- Security model
--   * One student-data table, public.plans. RLS enabled; every policy is scoped to the
--     `authenticated` role and tied to auth.uid(). `anon` and PUBLIC get no table
--     privileges and no RPC EXECUTE privilege.
--   * Server-owned fields (id, owner_user_id, revision, schema_version, timestamps) are
--     not insertable/updatable through column grants and are additionally forced by
--     BEFORE triggers (defense in depth).
--   * `revision` is the server-owned CAS token, independent of Plan.planRevision and
--     AcademicRecord.recordRevision. Every UPDATE must advance it by exactly one; the
--     save_plan RPC performs the atomic compare-and-update.
--   * Save-as-new always receives a fresh server UUID; the copied plan_json.planId is
--     rewritten to that UUID. No other plan/record content is modified.
--   * plan_json is the only persisted availability-evidence state (no availability_json).
--   * Original transcript PDFs and derived AnalysisResult are never stored here.
--   * RPCs are SECURITY INVOKER so RLS and grants govern them. delete_my_account is the
--     sole SECURITY DEFINER function; it requires a recent server-signed authentication
--     (JWT amr timestamp) and only touches the caller's own identity.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  schema_version smallint not null default 1,
  revision bigint not null default 0,
  record_json jsonb not null,
  plan_json jsonb not null,
  catalog_ref jsonb generated always as (plan_json -> 'catalogRef') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_schema_version check (schema_version = 1),
  constraint plans_revision_nonnegative check (revision >= 0),
  constraint plans_record_shape check (
    jsonb_typeof(record_json) = 'object'
    and record_json -> 'schemaVersion' = '1'::jsonb
    and jsonb_typeof(record_json -> 'courseAttempts') = 'array'
  ),
  constraint plans_plan_shape check (
    jsonb_typeof(plan_json) = 'object'
    and plan_json -> 'schemaVersion' = '1'::jsonb
    and jsonb_typeof(plan_json -> 'catalogRef') = 'object'
    and jsonb_typeof(plan_json -> 'availabilityEvidence') = 'array'
  ),
  constraint plans_identity check (plan_json ->> 'planId' = id::text),
  constraint plans_no_shadow_availability check (
    not (plan_json ? 'availability_json') and not (record_json ? 'availabilityEvidence')
  ),
  constraint plans_size check (octet_length(record_json::text) + octet_length(plan_json::text) <= 2097152)
);

create index plans_owner_updated_idx on public.plans (owner_user_id, updated_at desc);

comment on table public.plans is 'PathCheck owned saved plans. Structured record + plan only; no PDFs, no derived analysis.';

-- ---------------------------------------------------------------------------
-- Triggers: force server-owned fields.
-- ---------------------------------------------------------------------------
create function private.plans_before_insert() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  -- Serialize per-owner inserts so the quota check cannot be raced.
  perform pg_advisory_xact_lock(hashtextextended('pathcheck.plans:' || uid::text, 0));
  if (select count(*) from public.plans p where p.owner_user_id = uid) >= 200 then
    raise exception 'plan_quota_exceeded' using errcode = 'PC001';
  end if;
  if jsonb_typeof(new.plan_json) is distinct from 'object' then
    raise exception 'plan_json must be an object' using errcode = '23514';
  end if;
  new.id := gen_random_uuid();
  new.owner_user_id := uid;
  new.revision := 0;
  new.schema_version := 1;
  new.created_at := now();
  new.updated_at := now();
  new.plan_json := jsonb_set(new.plan_json, '{planId}', to_jsonb(new.id::text), true);
  return new;
end;
$$;

create function private.plans_before_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.owner_user_id is distinct from old.owner_user_id
     or new.schema_version is distinct from old.schema_version
     or new.created_at is distinct from old.created_at then
    raise exception 'immutable plan field' using errcode = 'PC003';
  end if;
  if new.revision is distinct from old.revision + 1 then
    raise exception 'revision must advance by exactly one' using errcode = 'PC002';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.plans_before_insert() from public;
revoke all on function private.plans_before_update() from public;

create trigger plans_before_insert before insert on public.plans
  for each row execute function private.plans_before_insert();
create trigger plans_before_update before update on public.plans
  for each row execute function private.plans_before_update();

-- ---------------------------------------------------------------------------
-- Row level security and grants.
-- ---------------------------------------------------------------------------
alter table public.plans enable row level security;

create policy plans_select_own on public.plans
  for select to authenticated
  using ((select auth.uid()) = owner_user_id);

create policy plans_insert_own on public.plans
  for insert to authenticated
  with check ((select auth.uid()) = owner_user_id);

create policy plans_update_own on public.plans
  for update to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create policy plans_delete_own on public.plans
  for delete to authenticated
  using ((select auth.uid()) = owner_user_id);

-- Supabase default privileges grant ALL on new public tables to anon/authenticated.
revoke all on table public.plans from public;
revoke all on table public.plans from anon, authenticated;
grant select, delete on table public.plans to authenticated;
grant insert (record_json, plan_json) on table public.plans to authenticated;
grant update (record_json, plan_json, revision) on table public.plans to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs (SECURITY INVOKER: RLS + grants apply to the caller).
-- Result envelope: {"status": "ok", "plan": <row>} or {"status": "<reason>"}.
-- ---------------------------------------------------------------------------
create function public.create_plan(p_record jsonb, p_plan jsonb) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.plans;
begin
  if auth.uid() is null then
    return jsonb_build_object('status', 'not_authenticated');
  end if;
  insert into public.plans (record_json, plan_json) values (p_record, p_plan) returning * into r;
  return jsonb_build_object('status', 'ok', 'plan', to_jsonb(r) - 'catalog_ref');
end;
$$;

create function public.save_plan(p_id uuid, p_expected_revision bigint, p_record jsonb, p_plan jsonb) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.plans;
begin
  if auth.uid() is null then
    return jsonb_build_object('status', 'not_authenticated');
  end if;
  if p_plan ->> 'planId' is distinct from p_id::text then
    return jsonb_build_object('status', 'identity_mismatch');
  end if;
  update public.plans p
     set record_json = p_record, plan_json = p_plan, revision = p.revision + 1
   where p.id = p_id and p.revision = p_expected_revision
   returning * into r;
  if found then
    return jsonb_build_object('status', 'ok', 'plan', to_jsonb(r) - 'catalog_ref');
  end if;
  -- RLS hides other owners' rows, so a foreign or absent id is indistinguishable.
  if exists (select 1 from public.plans p where p.id = p_id) then
    return jsonb_build_object('status', 'conflict');
  end if;
  return jsonb_build_object('status', 'not_found');
end;
$$;

create function public.delete_plan(p_id uuid, p_expected_revision bigint) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('status', 'not_authenticated');
  end if;
  delete from public.plans p where p.id = p_id and p.revision = p_expected_revision;
  if found then
    return jsonb_build_object('status', 'ok');
  end if;
  if exists (select 1 from public.plans p where p.id = p_id) then
    return jsonb_build_object('status', 'conflict');
  end if;
  return jsonb_build_object('status', 'not_found');
end;
$$;

-- Protected account deletion. Requires an authentication event (server-signed JWT `amr`
-- timestamp) within the last 600 seconds; a refreshed old session does not qualify.
-- Deletes only the caller's plans and identity. Identity-provider retention (e.g. Auth
-- audit logs) is outside this function and must be disclosed by the release owner.
create function public.delete_my_account() returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  latest_auth numeric;
begin
  if uid is null then
    return jsonb_build_object('status', 'not_authenticated');
  end if;
  select max((e ->> 'timestamp')::numeric) into latest_auth
    from jsonb_array_elements(
      case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end
    ) as e
   where jsonb_typeof(e) = 'object' and jsonb_typeof(e -> 'timestamp') = 'number';
  if latest_auth is null or extract(epoch from now()) - latest_auth > 600 or latest_auth > extract(epoch from now()) + 60 then
    return jsonb_build_object('status', 'reauthentication_required');
  end if;
  delete from public.plans p where p.owner_user_id = uid;
  delete from auth.users u where u.id = uid;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default and Supabase adds anon/authenticated.
revoke all on function public.create_plan(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.save_plan(uuid, bigint, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.delete_plan(uuid, bigint) from public, anon, authenticated;
revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.create_plan(jsonb, jsonb) to authenticated;
grant execute on function public.save_plan(uuid, bigint, jsonb, jsonb) to authenticated;
grant execute on function public.delete_plan(uuid, bigint) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
