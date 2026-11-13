import { z } from 'zod';
import { RevisionSchema, SavedPlanSchema } from '../contracts';
import type { AcademicRecord, Plan, Result, SavedPlan, StorageService, TypedFailure } from '../contracts';
import type { SessionProvider } from '../auth/session';
import type { PublicSupabaseConfig } from './config';
import { errorCode, requestJson } from './http';
import type { FetchLike, HttpResponse } from './http';
import { checkPersistableProjection } from './projection';

const UuidSchema = z.uuid();
// Postgres emits microseconds and "+00:00"; truncate to milliseconds for portable parsing.
const toMs = (s: string) => Date.parse(s.replace(/(\.\d{3})\d+/, '$1'));
const TimestampLike = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/).refine(s => !Number.isNaN(toMs(s)), 'timestamp');
const PlanRowSchema = z.object({
  id: UuidSchema, owner_user_id: UuidSchema, schema_version: z.literal(1), revision: RevisionSchema,
  record_json: z.unknown(), plan_json: z.unknown(), created_at: TimestampLike, updated_at: TimestampLike,
});
const ListRowSchema = z.object({ id: UuidSchema, revision: RevisionSchema, updated_at: TimestampLike });
const RpcEnvelopeSchema = z.object({ status: z.enum(['ok', 'not_authenticated', 'identity_mismatch', 'conflict', 'not_found', 'reauthentication_required']), plan: z.unknown().optional() });

const iso = (s: string) => new Date(toMs(s)).toISOString();
const fail = (code: TypedFailure['code'], reasonCode: string): TypedFailure => ({ ok: false, code, reasonCode });

/** Maps a database row to the frozen SavedPlan contract, verifying owner and identity. */
function toSavedPlan(row: unknown, expectedOwner: string): Result<SavedPlan> {
  const r = PlanRowSchema.safeParse(row);
  if (!r.success) return fail('validation_error', 'invalid_saved_plan');
  if (r.data.owner_user_id !== expectedOwner) return fail('validation_error', 'unexpected_owner');
  const saved = SavedPlanSchema.safeParse({
    schemaVersion: r.data.schema_version, id: r.data.id, ownerUserId: r.data.owner_user_id, revision: r.data.revision,
    record: r.data.record_json, plan: r.data.plan_json, createdAt: iso(r.data.created_at), updatedAt: iso(r.data.updated_at),
  });
  return saved.success ? { ok: true, value: saved.data } : fail('validation_error', 'invalid_saved_plan');
}

function httpFailure(res: HttpResponse): TypedFailure {
  const code = errorCode(res.body);
  if (res.status === 401) return fail('forbidden', 'session_expired');
  if (code === '42501' || res.status === 403) return fail('forbidden', 'permission_denied');
  if (code === 'PC001') return fail('rate_limited', 'plan_quota_exceeded');
  if (code === 'PC002') return fail('conflict', 'revision_conflict');
  if (code === 'PC003' || code === '23514' || code === '22P02' || code === '23502') return fail('validation_error', 'rejected_by_database');
  if (res.status === 429) return fail('rate_limited', 'database_rate_limited');
  return fail('external_failure', 'database_request_failed');
}

/**
 * Owned cloud persistence against Supabase PostgREST using the publishable key plus the
 * caller's user JWT. Authorization is enforced by the database (RLS + grants + invoker
 * RPCs from supabase/migrations), never by this client. All inputs and outputs are
 * validated against the frozen contracts; local revisions are never rewritten.
 */
export function createSupabaseStorage(config: PublicSupabaseConfig, deps: { fetch: FetchLike; session: SessionProvider }): StorageService {
  /**
   * Resolves the caller's login and returns a `send` that performs the request and then
   * re-checks that the same login is still current. If the user signed out or switched
   * accounts while the request was in flight, the response is withheld as
   * `conflict/auth_session_changed` so the old account's data or identity is never handed
   * to the new UI state. For mutations the server may already have committed the write
   * under the previous login (its own data, authorized by its own JWT); the caller keeps
   * its unsynced local plan and the previous account can reload it later.
   */
  const authed = async (): Promise<Result<{ headers: Record<string, string>; userId: string; send: typeof requestJson }>> => {
    const s = await deps.session.getSession();
    if (!s.ok) return s;
    if (!s.value) return fail('forbidden', 'not_authenticated');
    const access = s.value;
    if (!UuidSchema.safeParse(access.userId).success) return fail('validation_error', 'invalid_session');
    const send: typeof requestJson = async (...args) => {
      const res = await requestJson(...args);
      return deps.session.isCurrent && !deps.session.isCurrent(access) ? fail('conflict', 'auth_session_changed') : res;
    };
    return { ok: true, value: { userId: access.userId, send, headers: { apikey: config.publishableKey, Authorization: `Bearer ${access.accessToken}` } } };
  };

  const rpc = async (name: string, args: Record<string, unknown>): Promise<Result<{ envelope: z.infer<typeof RpcEnvelopeSchema>; userId: string }>> => {
    const a = await authed();
    if (!a.ok) return a;
    const res = await a.value.send(deps.fetch, `${config.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: a.value.headers, body: args });
    if (!res.ok) return res;
    if (res.value.status !== 200) return httpFailure(res.value);
    const env = RpcEnvelopeSchema.safeParse(res.value.body);
    if (!env.success) return fail('external_failure', 'malformed_response');
    switch (env.data.status) {
      case 'ok': return { ok: true, value: { envelope: env.data, userId: a.value.userId } };
      case 'not_authenticated': return fail('forbidden', 'not_authenticated');
      case 'identity_mismatch': return fail('validation_error', 'save_identity_mismatch');
      case 'conflict': return fail('conflict', 'revision_conflict');
      case 'not_found': return fail('forbidden', 'plan_not_found');
      case 'reauthentication_required': return fail('forbidden', 'reauthentication_required');
    }
  };

  const validId = (id: string) => UuidSchema.safeParse(id).success;

  return {
    // Save as new: the server assigns a fresh id, rewrites only plan.planId, revision 0.
    async createPlan(record: AcademicRecord, plan: Plan) {
      const projection = checkPersistableProjection(record, plan);
      if (!projection.ok) return projection;
      const r = await rpc('create_plan', { p_record: projection.value.record, p_plan: projection.value.plan });
      return r.ok ? toSavedPlan(r.value.envelope.plan, r.value.userId) : r;
    },

    async listOwnedPlans() {
      const a = await authed();
      if (!a.ok) return a;
      const res = await a.value.send(deps.fetch, `${config.url}/rest/v1/plans?select=id,revision,updated_at&owner_user_id=eq.${a.value.userId}&order=updated_at.desc,id.asc`, { method: 'GET', headers: a.value.headers });
      if (!res.ok) return res;
      if (res.value.status !== 200) return httpFailure(res.value);
      const rows = z.array(ListRowSchema).safeParse(res.value.body);
      if (!rows.success) return fail('external_failure', 'malformed_response');
      return { ok: true, value: rows.data.map(r => ({ id: r.id, revision: r.revision, updatedAt: iso(r.updated_at) })) };
    },

    async getOwnedPlan(id: string) {
      if (!validId(id)) return fail('forbidden', 'plan_not_found');
      const a = await authed();
      if (!a.ok) return a;
      const res = await a.value.send(deps.fetch, `${config.url}/rest/v1/plans?select=id,owner_user_id,schema_version,revision,record_json,plan_json,created_at,updated_at&id=eq.${id}`, { method: 'GET', headers: a.value.headers });
      if (!res.ok) return res;
      if (res.value.status !== 200) return httpFailure(res.value);
      const rows = z.array(z.unknown()).max(1).safeParse(res.value.body);
      if (!rows.success) return fail('external_failure', 'malformed_response');
      if (rows.data.length === 0) return fail('forbidden', 'plan_not_found');
      return toSavedPlan(rows.data[0], a.value.userId);
    },

    // Atomic CAS on the server-owned revision token; mismatch returns `conflict`.
    async savePlan(id: string, expectedRevision: number, record: AcademicRecord, plan: Plan) {
      if (!validId(id)) return fail('forbidden', 'plan_not_found');
      if (!RevisionSchema.safeParse(expectedRevision).success) return fail('validation_error', 'invalid_expected_revision');
      const projection = checkPersistableProjection(record, plan);
      if (!projection.ok) return projection;
      if (projection.value.plan.planId !== id) return fail('validation_error', 'save_identity_mismatch');
      const r = await rpc('save_plan', { p_id: id, p_expected_revision: expectedRevision, p_record: projection.value.record, p_plan: projection.value.plan });
      if (!r.ok) return r;
      const saved = toSavedPlan(r.value.envelope.plan, r.value.userId);
      if (saved.ok && saved.value.revision !== expectedRevision + 1) return fail('external_failure', 'unexpected_revision');
      return saved;
    },

    async deleteOwnedPlan(id: string, expectedRevision: number) {
      if (!validId(id)) return fail('forbidden', 'plan_not_found');
      if (!RevisionSchema.safeParse(expectedRevision).success) return fail('validation_error', 'invalid_expected_revision');
      const r = await rpc('delete_plan', { p_id: id, p_expected_revision: expectedRevision });
      return r.ok ? { ok: true, value: null } : r;
    },

    // Server enforces recent authentication; the client call grants nothing by itself.
    async deleteAccount() {
      const r = await rpc('delete_my_account', {});
      return r.ok ? { ok: true, value: null } : r;
    },
  };
}
