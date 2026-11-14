import type {
  AcademicService, AuthService, ExportService, GuestRecoveryService, PlannerCommands, PlanningScenario, Result,
  StorageService, TranscriptClient, TranscriptService,
} from '../contracts';

/**
 * Ports the lead (L) composes in src/app and passes to <PathCheckWorkflow services={...}/>.
 * UI never constructs academic results: E's AcademicService evaluates, L's PlannerCommands
 * is the only Plan mutation boundary, S owns auth/storage/recovery, G owns transcript calls.
 * Pass a frozen object; the workflow treats every port as immutable.
 */
export interface WorkflowClock {
  /** ISO-8601 timestamp with offset. */
  now(): string;
  /** Unique opaque ID for placements, actions, drafts and manual rows. */
  newId(prefix: string): string;
}

export interface ScenarioConfig {
  engineVersion: string;
  evaluationPolicy: string;
  /** Disclosed engine assumption shown to the student. */
  assumeFuturePass: boolean;
  searchOptions: PlanningScenario['searchOptions'];
}

export interface TranscriptPorts {
  client: TranscriptClient;
  validate: TranscriptService['validate'];
  /** Server-verifiable bot attestation (e.g. Turnstile token). Absent/failed => upload refused. */
  obtainBotAttestation(): Promise<Result<string>>;
}

export interface AccountPorts {
  auth: AuthService;
  storage: StorageService;
  recovery: GuestRecoveryService;
}

/**
 * Cancellable draft generation (ARCH Search-v1 / SCH-18). L implements it over a browser
 * Worker running E's search with a bounded watchdog; U owns only controls and lifecycle.
 * Aborting `signal` must stop the job; an interrupted/cancelled job resolves with
 * `search_interrupted` (never `no_valid_draft_under_search_bounds`). The UI additionally
 * ignores any result whose job was cancelled, superseded or whose inputs changed.
 */
export interface DraftGenerationPort {
  generate(scenario: PlanningScenario, signal: AbortSignal): Promise<ReturnType<AcademicService['generateDraft']>>;
}

export interface WorkflowServices {
  academic: AcademicService;
  commands: PlannerCommands;
  exporter: ExportService;
  clock: WorkflowClock;
  config: ScenarioConfig;
  /** null => transcript upload is shown as unavailable; manual entry always works. */
  transcript: TranscriptPorts | null;
  /** null => cloud save/sign-in shown as unavailable; guest planning always works. */
  account: AccountPorts | null;
  /**
   * Optional UI-private port. The real application always supplies it (worker). When absent,
   * the workflow falls back to synchronous academic.generateDraft — kept only for existing
   * test/harness compatibility until L injects the port everywhere.
   */
  generation?: DraftGenerationPort;
}
