-- PathCheck S: read-only retry authorization for bounded provider transport retries (HTTP 503).
--
-- The provider (G) controls singleflight and a bounded number of attempts; the worst-case spend for
-- every attempt was reserved upfront by admission_admit. Before EACH extra provider egress it calls
-- admission_retry_check. The check authorizes another attempt only for the SAME reservation, by the
-- SAME session, while that reservation is 'dispatched', its lease is still live on the DB clock and
-- its consent receipt has not been revoked.
--
-- It is NOT an admission: no ticket is consumed or reused, no reservation is created, and quota,
-- concurrency, cost and lease are neither charged nor reset. It performs no write of any kind (no
-- UPDATE/INSERT/DELETE and no row lock) - it only takes the store's global transaction advisory lock
-- (shared with every admission RPC) so it serializes against revoke/finish, then reads the DB clock.
-- It does not authorize concurrent provider requests; it does not change admission_dispatch.
--
-- Returns {status:'ok'} or the store's existing denial shape {status:'denied', reason}:
--   invalid_input | clock_mismatch | unknown_reservation (missing or another session's) |
--   not_retryable (admitted/settled/released: only a dispatched reservation may retry) |
--   lease_expired | consent_revoked

create function public.admission_retry_check(p_reservation_id uuid, p_session_id uuid, p_client_now timestamptz)
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
  -- Plain read: the advisory lock already serializes every store mutation; no row lock is taken.
  select * into v_res from admission_private.reservations r where r.reservation_id = p_reservation_id;
  if not found or v_res.session_id <> p_session_id then
    return admission_private.deny('denied', 'unknown_reservation');
  end if;
  if v_res.state <> 'dispatched' then
    return admission_private.deny('denied', 'not_retryable');
  end if;
  if v_now >= v_res.lease_expires_at then
    return admission_private.deny('denied', 'lease_expired');
  end if;
  if not exists (select 1 from admission_private.tickets t join admission_private.consent_receipts c
                   on c.receipt_id = t.consent_receipt_id
                 where t.ticket_id = v_res.ticket_id and c.revoked_at is null) then
    return admission_private.deny('denied', 'consent_revoked');
  end if;
  return jsonb_build_object('status', 'ok');
end $$;

revoke all on function public.admission_retry_check(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.admission_retry_check(uuid, uuid, timestamptz) to service_role;
