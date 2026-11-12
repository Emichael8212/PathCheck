import { z } from 'zod';
import { AcademicRecordSchema } from './academic';
import { IdSchema, RevisionSchema, TimestampSchema } from './common';
import { PlanSchema } from './planning';
export const SavedPlanSchema = z.strictObject({
  schemaVersion: z.literal(1), id: IdSchema, ownerUserId: IdSchema, revision: RevisionSchema,
  record: AcademicRecordSchema, plan: PlanSchema, createdAt: TimestampSchema, updatedAt: TimestampSchema,
}).refine(s => s.id === s.plan.planId && s.revision === s.plan.planRevision, 'Persistence/plan identity or revision mismatch');
export type SavedPlan = z.infer<typeof SavedPlanSchema>;
export const GuestDraftSchema = z.strictObject({
  schemaVersion: z.literal(1), draftId: IdSchema, mode: z.enum(['session', 'cross_tab_opt_in']), explicitRecoveryConsent: z.boolean(),
  createdAt: TimestampSchema, expiresAt: TimestampSchema, record: AcademicRecordSchema, plan: PlanSchema,
}).superRefine((d, ctx) => {
  const lifetime = Date.parse(d.expiresAt) - Date.parse(d.createdAt);
  if (lifetime <= 0 || lifetime > 24 * 60 * 60_000) ctx.addIssue({ code: 'custom', message: 'Invalid recovery lifetime' });
  if (d.mode === 'cross_tab_opt_in' && !d.explicitRecoveryConsent) ctx.addIssue({ code: 'custom', message: 'Cross-tab recovery requires opt-in' });
});
export type GuestDraft = z.infer<typeof GuestDraftSchema>;
export function readGuestDraft(input: unknown, now: string): GuestDraft | null {
  const clock = TimestampSchema.safeParse(now), parsed = GuestDraftSchema.safeParse(input);
  if (!clock.success || !parsed.success) return null;
  const t = Date.parse(clock.data);
  return t >= Date.parse(parsed.data.createdAt) && t < Date.parse(parsed.data.expiresAt) ? parsed.data : null;
}
export const RECOVERY_CLEAR_EVENTS = ['save', 'cancel', 'expiry', 'sign_out'] as const;
export const SaveIntentSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('create_new'), record: AcademicRecordSchema, plan: PlanSchema }),
  z.strictObject({ kind: z.literal('update_owned'), id: IdSchema, expectedRevision: RevisionSchema, record: AcademicRecordSchema, plan: PlanSchema }),
]);
