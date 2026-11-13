-- PathCheck S: server-only guest transcript admission store (ARCHITECTURE §8 "Guest Gemini admission").
--
-- Trust model
--   * Tables live in schema admission_private, which no API role (anon, authenticated,
--     service_role) can use. RLS is enabled with no policies as defense in depth.
--   * The only entry points are six public.admission_* SECURITY DEFINER RPCs, executable by
--     service_role ONLY (the server-side extract-transcript function). Never by anon/authenticated.
--   * All decisions use the database clock. The caller's clock (p_client_now) is untrusted and is
--     only compared against the DB clock; a mismatch above 30 s fails closed (clock_mismatch).
--   * Every mutating RPC takes one global transaction-scoped advisory lock and then reads under a
--     fresh READ COMMITTED snapshot, so ticket consumption, quotas, concurrency and cost reservation
--     are atomic across Edge Function instances. Other isolation levels are refused (PA001).
--   * Stored: random UUIDs, SHA-256 hex digests (document, bot attestation), the keyed/rotating
--     network key (validated shape: cannot hold an IPv4/IPv6 literal), timestamps and integer
--     micro-USD amounts. No PDF bytes, extracted text/rows, raw IP or bot token is stored.
--
-- Limits (contracts ADMISSION_LIMITS): ticket TTL 300 s; 3 admissions/session and 20/network per
-- rolling hour; 1 concurrent/session, 3/network; daily provider cost per UTC calendar day with the
-- ceiling and per-request reservation supplied by the server's approved configuration (no default).
--
-- Reservation charge toward its UTC cost_day (fixed at admission, never moved by late settlement):
--   admitted & lease live -> reserved | admitted & lease expired -> 0 (cannot be dispatched any more)
--   dispatched (live or expired lease) -> reserved | settled -> actual (<= reserved) | released -> 0
-- Concurrency counts admitted/dispatched reservations whose lease is live (lease recovery).

create schema if not exists admission_private;
revoke all on schema admission_private from public;
revoke all on schema admission_private from anon, authenticated, service_role;

create table admission_private.consent_receipts (
  receipt_id uuid primary key,
  session_id uuid not null,
  disclosure_version text not null check (char_length(disclosure_version) between 1 and 160),
  processor text not null default 'gemini' check (processor = 'gemini'),
  purpose text not null default 'course_extraction' check (purpose = 'course_extraction'),
  granted_at timestamptz not null,
  revoked_at timestamptz,
  check (revoked_at is null or revoked_at >= granted_at)
);

create table admission_private.tickets (
  ticket_id uuid primary key,
  session_id uuid not null,
  consent_receipt_id uuid not null unique
    references admission_private.consent_receipts (receipt_id) on delete restrict,
  attestation_digest text not null unique check (attestation_digest ~ '^[a-f0-9]{64}$'),
  document_digest text not null check (document_digest ~ '^[a-f0-9]{64}$'),
  network_key text not null check (network_key ~ '^[A-Za-z0-9_-]{32,100}$'),
  claims_issued_at timestamptz not null,
  claims_expires_at timestamptz not null,
  issued_at timestamptz not null,   -- DB clock
  expires_at timestamptz not null,  -- DB-enforced: least(claims expiry, issued_at + 300 s)
  consumed_at timestamptz,
  revoked_at timestamptz,
  check (claims_expires_at > claims_issued_at and claims_expires_at <= claims_issued_at + interval '300 seconds'),
  check (expires_at > issued_at and expires_at <= issued_at + interval '300 seconds'),
  check (consumed_at is null or revoked_at is null)
);

create table admission_private.reservations (
  reservation_id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references admission_private.tickets (ticket_id) on delete restrict,
  session_id uuid not null,
  network_key text not null check (network_key ~ '^[A-Za-z0-9_-]{32,100}$'),
  cost_day date not null,
  reserved_microusd bigint not null check (reserved_microusd between 1 and 9007199254740991),
  state text not null check (state in ('admitted', 'dispatched', 'settled', 'released')),
  admitted_at timestamptz not null,
  lease_expires_at timestamptz not null check (lease_expires_at > admitted_at),
  dispatched_at timestamptz,
  settled_at timestamptz,
  actual_microusd bigint,
  outcome text check (outcome in ('success', 'failed')),
  check (
    (state = 'admitted' and dispatched_at is null and settled_at is null and actual_microusd is null and outcome is null)
    or (state = 'dispatched' and dispatched_at is not null and settled_at is null and actual_microusd is null and outcome is null)
    or (state = 'settled' and dispatched_at is not null and settled_at is not null and outcome is not null
        and actual_microusd between 0 and reserved_microusd)
    or (state = 'released' and dispatched_at is null and settled_at is not null and actual_microusd = 0 and outcome = 'failed')
  )
);

create index reservations_session_admitted_idx on admission_private.reservations (session_id, admitted_at);
create index reservations_network_admitted_idx on admission_private.reservations (network_key, admitted_at);
create index reservations_cost_day_idx on admission_private.reservations (cost_day);

alter table admission_private.consent_receipts enable row level security;
alter table admission_private.tickets enable row level security;
alter table admission_private.reservations enable row level security;

revoke all on all tables in schema admission_private from public;
revoke all on all tables in schema admission_private from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Defense-in-depth guards: identities/bindings immutable, write-once markers, forward-only states.
-- (Time columns are not guarded so that pgTAP can simulate elapsed DB time on rolled-back rows.)
create function admission_private.receipts_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.receipt_id is distinct from old.receipt_id or new.session_id is distinct from old.session_id
     or new.disclosure_version is distinct from old.disclosure_version
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'immutable consent receipt field' using errcode = 'PA002';
  end if;
  return new;
end $$;

create function admission_private.tickets_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.ticket_id is distinct from old.ticket_id or new.session_id is distinct from old.session_id
     or new.consent_receipt_id is distinct from old.consent_receipt_id
     or new.attestation_digest is distinct from old.attestation_digest
     or new.document_digest is distinct from old.document_digest
     or new.network_key is distinct from old.network_key
     or new.claims_issued_at is distinct from old.claims_issued_at
     or new.claims_expires_at is distinct from old.claims_expires_at
     or (old.consumed_at is not null and new.consumed_at is distinct from old.consumed_at)
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'immutable ticket field' using errcode = 'PA002';
  end if;
  return new;
end $$;

create function admission_private.reservations_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.reservation_id is distinct from old.reservation_id or new.ticket_id is distinct from old.ticket_id
     or new.session_id is distinct from old.session_id or new.network_key is distinct from old.network_key
     or new.reserved_microusd is distinct from old.reserved_microusd then
    raise exception 'immutable reservation field' using errcode = 'PA002';
  end if;
  if old.state in ('settled', 'released') and (new.state, new.actual_microusd, new.outcome, new.settled_at, new.dispatched_at)
       is distinct from (old.state, old.actual_microusd, old.outcome, old.settled_at, old.dispatched_at) then
    raise exception 'settled reservation is final' using errcode = 'PA003';
  end if;
  if new.state <> old.state and not (
       (old.state = 'admitted' and new.state in ('dispatched', 'released'))
       or (old.state = 'dispatched' and new.state = 'settled')) then
    raise exception 'invalid reservation transition' using errcode = 'PA003';
  end if;
  return new;
end $$;

create trigger consent_receipts_guard before update on admission_private.consent_receipts
  for each row execute function admission_private.receipts_guard();
create trigger tickets_guard before update on admission_private.tickets
  for each row execute function admission_private.tickets_guard();
create trigger reservations_guard before update on admission_private.reservations
  for each row execute function admission_private.reservations_guard();

-- ---------------------------------------------------------------------------------------------
-- Serialize every admission-store mutation, then read the DB clock (after the lock wait).
-- Returns NULL when the caller's clock is missing or differs from the DB clock by more than 30 s.
create function admission_private.lock_and_now(p_client_now timestamptz) returns timestamptz
language plpgsql volatile set search_path = '' as $$
declare
  v_now timestamptz;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'admission store requires READ COMMITTED' using errcode = 'PA001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pathcheck.transcript_admission.v1', 0));
  v_now := clock_timestamp();
  if p_client_now is null or abs(extract(epoch from (p_client_now - v_now))) > 30 then
    return null;
  end if;
  return v_now;
end $$;

create function admission_private.network_keys_valid(p_keys text[]) returns boolean
language sql immutable set search_path = '' as $$
  select p_keys is not null and array_ndims(p_keys) = 1 and cardinality(p_keys) between 1 and 2
     and array_position(p_keys, null) is null
     and not exists (select 1 from unnest(p_keys) k where k !~ '^[A-Za-z0-9_-]{32,100}$')
$$;

create function admission_private.deny(p_status text, p_reason text) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('status', p_status, 'reason', p_reason)
$$;

revoke all on function admission_private.receipts_guard() from public;
revoke all on function admission_private.tickets_guard() from public;
revoke all on function admission_private.reservations_guard() from public;
revoke all on function admission_private.lock_and_now(timestamptz) from public;
revoke all on function admission_private.network_keys_valid(text[]) from public;
revoke all on function admission_private.deny(text, text) from public;

-- ---------------------------------------------------------------------------------------------
-- issue: record a freshly signed ticket + consent receipt after server bot verification.
-- The bot attestation digest, ticket ID and receipt ID are each single-use forever (until purge,
-- long after the bot token and ticket have expired).
create function public.admission_issue(
  p_ticket_id uuid, p_session_id uuid, p_consent_receipt_id uuid, p_document_digest text,
  p_disclosure_version text, p_claims_issued_at timestamptz, p_claims_expires_at timestamptz,
  p_attestation_digest text, p_network_key text, p_client_now timestamptz)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_now timestamptz;
begin
  if p_ticket_id is null or p_session_id is null or p_consent_receipt_id is null
     or p_document_digest is null or p_document_digest !~ '^[a-f0-9]{64}$'
     or p_attestation_digest is null or p_attestation_digest !~ '^[a-f0-9]{64}$'
     or p_disclosure_version is null or char_length(p_disclosure_version) not between 1 and 160
     or p_network_key is null or p_network_key !~ '^[A-Za-z0-9_-]{32,100}$'
     or p_claims_issued_at is null or p_claims_expires_at is null then
    return admission_private.deny('denied', 'invalid_input');
  end if;
  v_now := admission_private.lock_and_now(p_client_now);
  if v_now is null or abs(extract(epoch from (p_claims_issued_at - v_now))) > 30 then
    return admission_private.deny('denied', 'clock_mismatch');
  end if;
  if p_claims_expires_at <= p_claims_issued_at or p_claims_expires_at > p_claims_issued_at + interval '300 seconds'
     or p_claims_expires_at <= v_now then
    return admission_private.deny('denied', 'invalid_ticket_lifetime');
  end if;
  if exists (select 1 from admission_private.tickets t where t.attestation_digest = p_attestation_digest) then
    return admission_private.deny('denied', 'attestation_replayed');
  end if;
  if exists (select 1 from admission_private.tickets t where t.ticket_id = p_ticket_id) then
    return admission_private.deny('denied', 'ticket_id_reused');
  end if;
  if exists (select 1 from admission_private.consent_receipts r where r.receipt_id = p_consent_receipt_id) then
    return admission_private.deny('denied', 'consent_receipt_reused');
  end if;

  insert into admission_private.consent_receipts (receipt_id, session_id, disclosure_version, granted_at)
  values (p_consent_receipt_id, p_session_id, p_disclosure_version, v_now);
  insert into admission_private.tickets (ticket_id, session_id, consent_receipt_id, attestation_digest,
    document_digest, network_key, claims_issued_at, claims_expires_at, issued_at, expires_at)
  values (p_ticket_id, p_session_id, p_consent_receipt_id, p_attestation_digest, p_document_digest,
    p_network_key, p_claims_issued_at, p_claims_expires_at, v_now,
    least(p_claims_expires_at, v_now + interval '300 seconds'));
  return jsonb_build_object('status', 'ok');
end $$;

-- ---------------------------------------------------------------------------------------------
-- admit: atomically consume the one-use ticket and reserve concurrency, rolling-hour quota and
-- worst-case daily provider cost. Once the ticket is found for the calling session and is live it
-- is consumed even when a later binding/quota/cost check denies (each attempt costs a new
-- bot-verified ticket). p_network_keys = [current] or [current, previous] across key rotation;
-- quotas count both so rotation does not reset rolling windows.
create function public.admission_admit(
  p_ticket_id uuid, p_session_id uuid, p_consent_receipt_id uuid, p_document_digest text,
  p_claims_issued_at timestamptz, p_claims_expires_at timestamptz, p_network_keys text[],
  p_daily_ceiling_microusd bigint, p_reservation_microusd bigint, p_lease_seconds integer,
  p_client_now timestamptz)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_now timestamptz;
  v_ticket admission_private.tickets%rowtype;
  v_day date;
  v_committed numeric;
  v_id uuid;
  v_lease timestamptz;
begin
  if p_ticket_id is null or p_session_id is null or p_consent_receipt_id is null
     or p_document_digest is null or p_document_digest !~ '^[a-f0-9]{64}$'
     or p_claims_issued_at is null or p_claims_expires_at is null
     or not admission_private.network_keys_valid(p_network_keys)
     or p_daily_ceiling_microusd is null or p_daily_ceiling_microusd not between 1 and 9007199254740991
     or p_reservation_microusd is null or p_reservation_microusd not between 1 and p_daily_ceiling_microusd
     or p_lease_seconds is null or p_lease_seconds not between 30 and 300 then
    return admission_private.deny('denied', 'invalid_input');
  end if;
  v_now := admission_private.lock_and_now(p_client_now);
  if v_now is null then
    return admission_private.deny('denied', 'clock_mismatch');
  end if;

  select * into v_ticket from admission_private.tickets t where t.ticket_id = p_ticket_id for update;
  if not found or v_ticket.session_id <> p_session_id then
    return admission_private.deny('denied', 'unknown_ticket');
  end if;
  if v_ticket.consumed_at is not null then
    return admission_private.deny('denied', 'ticket_replayed');
  end if;
  if v_ticket.revoked_at is not null then
    return admission_private.deny('denied', 'ticket_revoked');
  end if;
  if v_now >= v_ticket.expires_at or v_now >= v_ticket.claims_expires_at then
    return admission_private.deny('denied', 'ticket_expired');
  end if;

  update admission_private.tickets set consumed_at = v_now where ticket_id = p_ticket_id;

  if v_ticket.consent_receipt_id <> p_consent_receipt_id or v_ticket.document_digest <> p_document_digest
     or v_ticket.claims_issued_at <> p_claims_issued_at or v_ticket.claims_expires_at <> p_claims_expires_at
     or not (v_ticket.network_key = any (p_network_keys)) then
    return admission_private.deny('denied', 'binding_mismatch');
  end if;
  if exists (select 1 from admission_private.consent_receipts r
             where r.receipt_id = v_ticket.consent_receipt_id and r.revoked_at is not null) then
    return admission_private.deny('denied', 'consent_revoked');
  end if;

  if (select count(*) from admission_private.reservations r
      where r.session_id = p_session_id and r.admitted_at > v_now - interval '1 hour') >= 3 then
    return admission_private.deny('rate_limited', 'session_hourly_quota');
  end if;
  if (select count(*) from admission_private.reservations r
      where r.network_key = any (p_network_keys) and r.admitted_at > v_now - interval '1 hour') >= 20 then
    return admission_private.deny('rate_limited', 'network_hourly_quota');
  end if;
  if (select count(*) from admission_private.reservations r
      where r.session_id = p_session_id and r.state in ('admitted', 'dispatched') and r.lease_expires_at > v_now) >= 1 then
    return admission_private.deny('rate_limited', 'session_concurrency');
  end if;
  if (select count(*) from admission_private.reservations r
      where r.network_key = any (p_network_keys) and r.state in ('admitted', 'dispatched') and r.lease_expires_at > v_now) >= 3 then
    return admission_private.deny('rate_limited', 'network_concurrency');
  end if;

  v_day := (v_now at time zone 'UTC')::date;
  select coalesce(sum(case r.state
           when 'settled' then r.actual_microusd
           when 'released' then 0
           when 'dispatched' then r.reserved_microusd
           else case when r.lease_expires_at > v_now then r.reserved_microusd else 0 end
         end), 0)
    into v_committed
    from admission_private.reservations r where r.cost_day = v_day;
  if v_committed + p_reservation_microusd > p_daily_ceiling_microusd then
    return admission_private.deny('rate_limited', 'daily_cost_ceiling');
  end if;

  v_lease := v_now + make_interval(secs => p_lease_seconds);
  insert into admission_private.reservations (ticket_id, session_id, network_key, cost_day,
    reserved_microusd, state, admitted_at, lease_expires_at)
  values (p_ticket_id, p_session_id, p_network_keys[1], v_day, p_reservation_microusd, 'admitted', v_now, v_lease)
  returning reservation_id into v_id;
  return jsonb_build_object('status', 'ok', 'reservation_id', v_id, 'lease_expires_at', v_lease);
end $$;

-- ---------------------------------------------------------------------------------------------
-- dispatch: last check immediately before provider egress. Consent revocation, lease expiry or a
-- non-admitted state denies; an expired or settled reservation can never be resurrected.
create function public.admission_dispatch(p_reservation_id uuid, p_session_id uuid, p_client_now timestamptz)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_now timestamptz;
  v_res admission_private.reservations%rowtype;
begin
  if p_reservation_id is null or p_session_id is null then
    return admission_private.deny('denied', 'invalid_input');
  end if;
  v_now := admission_private.lock_and_now(p_client_now);
  if v_now is null then
    return admission_private.deny('denied', 'clock_mismatch');
  end if;
  select * into v_res from admission_private.reservations r where r.reservation_id = p_reservation_id for update;
  if not found or v_res.session_id <> p_session_id then
    return admission_private.deny('denied', 'unknown_reservation');
  end if;
  if v_res.state <> 'admitted' then
    return admission_private.deny('denied', 'not_dispatchable');
  end if;
  if v_now >= v_res.lease_expires_at then
    return admission_private.deny('denied', 'lease_expired');
  end if;
  if exists (select 1 from admission_private.tickets t join admission_private.consent_receipts c
               on c.receipt_id = t.consent_receipt_id
             where t.ticket_id = v_res.ticket_id and c.revoked_at is not null) then
    return admission_private.deny('denied', 'consent_revoked');
  end if;
  update admission_private.reservations set state = 'dispatched', dispatched_at = v_now
   where reservation_id = p_reservation_id;
  return jsonb_build_object('status', 'ok');
end $$;

-- ---------------------------------------------------------------------------------------------
-- finish: idempotent settlement. Undispatched -> released (actual must be 0, outcome failed).
-- Dispatched -> settled with 0 <= actual <= reserved; an over-reservation report is refused and
-- the full reservation stays charged. Repeating identical values returns ok/replayed; different
-- values return conflict. cost_day never changes (cross-day settlement stays in the original day).
-- consent_revoked lets the server withhold a result whose consent was revoked after dispatch.
create function public.admission_finish(
  p_reservation_id uuid, p_actual_microusd bigint, p_outcome text, p_client_now timestamptz)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_now timestamptz;
  v_res admission_private.reservations%rowtype;
  v_revoked boolean;
  v_replayed boolean := false;
begin
  if p_reservation_id is null or p_actual_microusd is null
     or p_actual_microusd not between 0 and 9007199254740991
     or p_outcome is null or p_outcome not in ('success', 'failed') then
    return admission_private.deny('denied', 'invalid_input');
  end if;
  v_now := admission_private.lock_and_now(p_client_now);
  if v_now is null then
    return admission_private.deny('denied', 'clock_mismatch');
  end if;
  select * into v_res from admission_private.reservations r where r.reservation_id = p_reservation_id for update;
  if not found then
    return admission_private.deny('denied', 'unknown_reservation');
  end if;

  if v_res.state = 'admitted' then
    if p_actual_microusd <> 0 or p_outcome <> 'failed' then
      return admission_private.deny('denied', 'invalid_settlement');
    end if;
    update admission_private.reservations
       set state = 'released', settled_at = v_now, actual_microusd = 0, outcome = 'failed'
     where reservation_id = p_reservation_id;
  elsif v_res.state = 'dispatched' then
    if p_actual_microusd > v_res.reserved_microusd then
      return admission_private.deny('denied', 'invalid_settlement');
    end if;
    update admission_private.reservations
       set state = 'settled', settled_at = v_now, actual_microusd = p_actual_microusd, outcome = p_outcome
     where reservation_id = p_reservation_id;
  elsif v_res.actual_microusd = p_actual_microusd and v_res.outcome = p_outcome then
    v_replayed := true;
  else
    return admission_private.deny('conflict', 'settlement_conflict');
  end if;

  select c.revoked_at is not null into v_revoked
    from admission_private.tickets t join admission_private.consent_receipts c on c.receipt_id = t.consent_receipt_id
   where t.ticket_id = v_res.ticket_id;
  return jsonb_build_object('status', 'ok', 'replayed', v_replayed, 'consent_revoked', coalesce(v_revoked, false),
                            'cost_day', v_res.cost_day);
end $$;

-- ---------------------------------------------------------------------------------------------
-- revoke: the same server-issued session revokes its receipt; unused tickets become unusable and
-- dispatch is refused from now on. Idempotent. Unknown and foreign receipts are indistinguishable.
create function public.admission_revoke(p_consent_receipt_id uuid, p_session_id uuid, p_client_now timestamptz)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_now timestamptz;
  v_receipt admission_private.consent_receipts%rowtype;
begin
  if p_consent_receipt_id is null or p_session_id is null then
    return admission_private.deny('denied', 'invalid_input');
  end if;
  v_now := admission_private.lock_and_now(p_client_now);
  if v_now is null then
    return admission_private.deny('denied', 'clock_mismatch');
  end if;
  select * into v_receipt from admission_private.consent_receipts r where r.receipt_id = p_consent_receipt_id for update;
  if not found or v_receipt.session_id <> p_session_id then
    return admission_private.deny('denied', 'unknown_receipt');
  end if;
  if v_receipt.revoked_at is null then
    update admission_private.consent_receipts set revoked_at = v_now where receipt_id = p_consent_receipt_id;
    update admission_private.tickets set revoked_at = v_now
     where consent_receipt_id = p_consent_receipt_id and consumed_at is null and revoked_at is null;
  end if;
  return jsonb_build_object('status', 'ok', 'already_revoked', v_receipt.revoked_at is not null);
end $$;

-- ---------------------------------------------------------------------------------------------
-- purge: data minimization for a scheduled server job. Removes rows older than 2 days (well past
-- every 300 s ticket/bot-token lifetime, 1 h window and the previous UTC cost day). A purged
-- ticket/reservation is unknown, so replay or late settlement is still denied.
create function public.admission_purge(p_client_now timestamptz)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_now timestamptz;
  v_res bigint;
  v_tickets bigint;
  v_receipts bigint;
begin
  v_now := admission_private.lock_and_now(p_client_now);
  if v_now is null then
    return admission_private.deny('denied', 'clock_mismatch');
  end if;
  delete from admission_private.reservations r where r.admitted_at < v_now - interval '2 days';
  get diagnostics v_res = row_count;
  delete from admission_private.tickets t
   where t.expires_at < v_now - interval '2 days'
     and not exists (select 1 from admission_private.reservations r where r.ticket_id = t.ticket_id);
  get diagnostics v_tickets = row_count;
  delete from admission_private.consent_receipts c
   where c.granted_at < v_now - interval '2 days'
     and not exists (select 1 from admission_private.tickets t where t.consent_receipt_id = c.receipt_id);
  get diagnostics v_receipts = row_count;
  return jsonb_build_object('status', 'ok', 'reservations', v_res, 'tickets', v_tickets, 'receipts', v_receipts);
end $$;

-- Postgres grants EXECUTE to PUBLIC by default and Supabase adds anon/authenticated.
revoke all on function public.admission_issue(uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.admission_admit(uuid, uuid, uuid, text, timestamptz, timestamptz, text[], bigint, bigint, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.admission_dispatch(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.admission_finish(uuid, bigint, text, timestamptz) from public, anon, authenticated;
revoke all on function public.admission_revoke(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.admission_purge(timestamptz) from public, anon, authenticated;
grant execute on function public.admission_issue(uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, timestamptz) to service_role;
grant execute on function public.admission_admit(uuid, uuid, uuid, text, timestamptz, timestamptz, text[], bigint, bigint, integer, timestamptz) to service_role;
grant execute on function public.admission_dispatch(uuid, uuid, timestamptz) to service_role;
grant execute on function public.admission_finish(uuid, bigint, text, timestamptz) to service_role;
grant execute on function public.admission_revoke(uuid, uuid, timestamptz) to service_role;
grant execute on function public.admission_purge(timestamptz) to service_role;
