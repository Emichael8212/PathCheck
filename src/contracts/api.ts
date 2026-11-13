import type { AcademicRecord, CatalogModel, CatalogRef } from './academic';
import type { Result, TypedFailure } from './common';
import type { AnalysisResult, CandidatePreview, ChangeSet, ExplicitUserAction, GeneratedDraft, InputFingerprint, Plan, PlanPlacement, AvailabilityEvidence, PlanningScenario, RuleFinding, UndoCheckpoint } from './planning';
import type { AdmissionRequest, ProcessingEligibility, ProposedRow, TranscriptExtraction, TicketIssueRequest, RevokeConsentRequest, ValidatedExtractedRows } from './transcript';
import type { SavedPlan, GuestDraft, RECOVERY_CLEAR_EVENTS } from './persistence';
export interface AcademicService {
  listCatalogs(): Result<CatalogRef[]>;
  loadValidatedCatalog(ref: CatalogRef): Result<CatalogModel>;
  normalizeAttempts(rows: ValidatedExtractedRows | { kind: 'manual_rows'; rows: ProposedRow[] } | { kind: 'mixed_rows'; extracted: ValidatedExtractedRows | null; manualRows: ProposedRow[] }, catalog: CatalogModel): Result<{ record: AcademicRecord; unmatched: string[]; warnings: string[] }>;
  audit(scenario: PlanningScenario): Result<AnalysisResult['degreeAudit']>;
  evaluate(scenario: PlanningScenario): Result<AnalysisResult>;
  preview(scenario: PlanningScenario, changes: ChangeSet): Result<CandidatePreview>;
  validateCandidate(scenario: PlanningScenario, preview: CandidatePreview): Result<ValidatedCandidate>;
  generateDraft(scenario: PlanningScenario): Result<GeneratedDraft | { kind: 'no_valid_draft_under_search_bounds'; expansions: number }>;
}
export interface ValidatedCandidate { baseFingerprint: InputFingerprint; placements: PlanPlacement[]; findings: RuleFinding[]; assumptions: string[] }
export interface PlannerCommands {
  createGuestPlan(ref: CatalogRef, target: Plan['targetTerm'], action: ExplicitUserAction): Result<Plan>;
  setTargetTerm(scenario: PlanningScenario, target: Plan['targetTerm'], action: ExplicitUserAction): Result<{ plan: Plan; analysis: AnalysisResult }>;
  recordAvailability(scenario: PlanningScenario, report: AvailabilityEvidence | { kind: 'skip'; courseId: string; termId: Plan['targetTerm'] }, action: ExplicitUserAction): Result<{ plan: Plan; analysis: AnalysisResult }>;
  recordStudentSelections(scenario: PlanningScenario, changes: ChangeSet, action: ExplicitUserAction): Result<{ plan: Plan; analysis: AnalysisResult }>;
  acceptRecord(scenario: PlanningScenario, proposed: AcademicRecord, action: ExplicitUserAction): Result<{ record: AcademicRecord; analysis: AnalysisResult }>;

  applyPreview(scenario: PlanningScenario, preview: CandidatePreview, action: ExplicitUserAction): Result<{ plan: Plan; undo: UndoCheckpoint }>;
  rejectPreview(session: { plan: Plan; previews: CandidatePreview[] }, previewId: string): { plan: Plan; previews: CandidatePreview[] };
  undoLast(scenario: PlanningScenario, checkpoint: UndoCheckpoint, action: ExplicitUserAction): Result<{ plan: Plan; analysis: AnalysisResult }>;
  adoptDraft(scenario: PlanningScenario, draft: GeneratedDraft, action: ExplicitUserAction): Result<{ plan: Plan; undo: UndoCheckpoint }>;
}
export interface TranscriptService {
  extract(admission: AdmissionRequest, pdfBytes: Uint8Array): Promise<Result<TranscriptExtraction>>;
  validate(extraction: TranscriptExtraction, catalog: CatalogModel): Result<ValidatedExtractedRows>;
}
export interface StorageService {
  createPlan(record: AcademicRecord, plan: Plan): Promise<Result<SavedPlan>>;
  listOwnedPlans(): Promise<Result<Array<{ id: string; revision: number; updatedAt: string }>>>;
  getOwnedPlan(id: string): Promise<Result<SavedPlan>>;
  savePlan(id: string, expectedRevision: number, record: AcademicRecord, plan: Plan): Promise<Result<SavedPlan>>;
  deleteOwnedPlan(id: string, expectedRevision: number): Promise<Result<null>>;
  deleteAccount(): Promise<Result<null>>;
}
export interface AuthService {
  currentUser(): Promise<Result<{ userId: string } | null>>;
  requestEmailOtp(email: string): Promise<Result<null>>;
  verifyEmailOtp(email: string, token: string): Promise<Result<{ userId: string }>>;
  signOut(): Promise<Result<null>>;
}
export interface GuestRecoveryService {
  stash(draft: GuestDraft): Result<null>;
  recover(now: string): Result<GuestDraft | null>;
  clear(event: typeof RECOVERY_CLEAR_EVENTS[number]): Result<null>;
}
export interface ExportService { exportPdf(scenario: PlanningScenario, analysis: AnalysisResult): Promise<Result<Blob>> }
// G implements this server-only port. Success requires verified signature, audience,
// session/document/consent binding, origin, bot proof and an ATOMIC ticket + quota +
// cost reservation in shared storage. A parsed request alone is never authorization.
export interface GuestAdmissionService {
  issueTicket(request: TicketIssueRequest, context: { serverSessionId: string; networkKey: string; origin: string; now: string; eligibility: ProcessingEligibility }): Promise<Result<{ signedTicket: string; consentReceiptId: string; expiresAt: string }>>;
  admit(request: AdmissionRequest, context: { sessionId: string; networkKey: string; origin: string; documentDigest: string; now: string; eligibility: ProcessingEligibility }): Promise<Result<{ reservationId: string }>>;
  revokeConsent(request: RevokeConsentRequest, context: { serverSessionId: string; now: string }): Promise<Result<null>>;
  finish(reservationId: string, actualCostMicrousd: number, outcome: 'success' | 'failed'): Promise<Result<null>>;
}
export type SearchInterrupted = Extract<TypedFailure, { ok: false }>;

export interface TranscriptClient {
  getAvailability(): Promise<Result<{ status: 'disabled' | 'approved'; disclosureVersion: string; processingTier: string; reasonCode: string | null }>>;
  establishGuestSession(): Promise<Result<null>>;
  requestTicket(request: TicketIssueRequest): Promise<Result<{ signedTicket: string; consentReceiptId: string; expiresAt: string }>>;
  extract(admission: AdmissionRequest, pdfBytes: Uint8Array): Promise<Result<TranscriptExtraction>>;
  revokeConsent(request: RevokeConsentRequest): Promise<Result<null>>;
}
