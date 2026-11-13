import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { CatalogModel, ProposedRow, TranscriptExtraction, TypedFailure, ValidatedExtractedRows } from '../contracts';
import { guard, guardAsync } from './scenario';
import type { TranscriptPorts } from './services';
import { looksLikePdf } from './upload';

/**
 * One consented transcript send, as a cancellable run over the immutable TranscriptPorts.
 *
 * Guarantees, independent of React:
 * - After cancel() no further port call is started (attestation, session, ticket, extract or validate),
 *   and the run settles as `cancelled` even if a pending call later resolves with rows.
 * - The local PDF copy is zeroed on every path: success, every failure, read failure, cancel.
 *   On cancel it is zeroed immediately; a client still serializing it would send bytes whose digest
 *   no longer matches the ticket, so the server refuses them.
 * - The ports offer no abort signal, so a request already in flight cannot be recalled; its result
 *   is dropped. The consent receipt is exposed as soon as the ticket is issued (`run.receipt` and
 *   `onReceipt`), so a caller that cancels mid-extract can revoke it immediately, before the held
 *   request settles. A receipt issued only after cancel is still reported in `cancelled.receipt`.
 */
export type SendOutcome =
  | { kind: 'cancelled'; receipt: string | null }
  | { kind: 'read_failed' }
  | { kind: 'not_pdf' }
  | { kind: 'failed'; failure: TypedFailure; receipt: string | null }
  /**
   * `rejected` and `invalid` deliberately carry no extraction: the raw provider envelope was not
   * confirmed by G, so its rows, acceptance status and completeness claim must never reach the screen.
   */
  | { kind: 'rejected'; receipt: string }
  | { kind: 'invalid'; failure: TypedFailure; receipt: string }
  /** `extraction` is `rows.extraction` (G's validated envelope), never the raw extract response. */
  | { kind: 'validated'; extraction: TranscriptExtraction; rows: ValidatedExtractedRows; receipt: string };

export interface SendInput {
  ports: TranscriptPorts;
  file: Pick<Blob, 'arrayBuffer'>;
  disclosureVersion: string;
  catalog: CatalogModel;
  /** Called once, synchronously, when the ticket's consent receipt is issued (also after cancel). */
  onReceipt?: (consentReceiptId: string) => void;
}

export interface SendRun {
  readonly done: Promise<SendOutcome>;
  cancel(): void;
  readonly cancelled: boolean;
  /** The issued consent receipt, known from ticket issue onwards (before extract settles); null before. */
  readonly receipt: string | null;
}

export function startTranscriptSend(input: SendInput): SendRun {
  let cancelled = false;
  let bytes: Uint8Array | null = null;
  let receipt: string | null = null;
  const wipe = () => { bytes?.fill(0); bytes = null; };

  async function run(): Promise<SendOutcome> {
    const { ports } = input;
    const stop = (): SendOutcome => ({ kind: 'cancelled', receipt });
    let buffer: ArrayBuffer;
    try { buffer = await input.file.arrayBuffer(); } catch { return cancelled ? stop() : { kind: 'read_failed' }; }
    bytes = new Uint8Array(buffer);
    if (cancelled) return stop();
    if (!looksLikePdf(bytes)) return { kind: 'not_pdf' };
    const documentDigest = bytesToHex(sha256(bytes));

    const attestation = await guardAsync(() => ports.obtainBotAttestation(), 'attestation_failed');
    if (cancelled) return stop();
    if (!attestation.ok) return { kind: 'failed', failure: attestation, receipt };

    const session = await guardAsync(() => ports.client.establishGuestSession(), 'session_failed');
    if (cancelled) return stop();
    if (!session.ok) return { kind: 'failed', failure: session, receipt };

    const ticket = await guardAsync(() => ports.client.requestTicket({ botAttestation: attestation.value, disclosureVersion: input.disclosureVersion, explicitConsent: true, documentDigest }), 'ticket_failed');
    // A receipt issued after cancel is still reported, so the caller can revoke it.
    if (ticket.ok) {
      receipt = ticket.value.consentReceiptId;
      try { input.onReceipt?.(receipt); } catch { /* a caller error must not hide the receipt from `done` */ }
    }
    if (cancelled) return stop();
    if (!ticket.ok) return { kind: 'failed', failure: ticket, receipt };
    const issued = ticket.value.consentReceiptId;

    const sent = bytes;
    const extracted = await guardAsync(() => ports.client.extract({ signedTicket: ticket.value.signedTicket, consentReceiptId: issued }, sent), 'extract_failed');
    wipe();
    if (cancelled) return stop();
    if (!extracted.ok) return { kind: 'failed', failure: extracted, receipt: issued };
    if (extracted.value.acceptanceStatus === 'rejected') return { kind: 'rejected', receipt: issued };
    const validated = guard(() => ports.validate(extracted.value, input.catalog), 'validation_failed');
    if (!validated.ok) return { kind: 'invalid', failure: validated, receipt: issued };
    // G may itself reject the envelope; rejected rows are never handed on (normalization refuses them too).
    if (validated.value.extraction.acceptanceStatus === 'rejected') return { kind: 'rejected', receipt: issued };
    // The summary must describe what G validated, not the raw provider envelope: G may downgrade
    // acceptance/completeness or add row uncertainty, and the raw optimistic values must not be shown.
    return { kind: 'validated', extraction: validated.value.extraction, rows: validated.value, receipt: issued };
  }

  const done = run().finally(wipe);
  return {
    done,
    cancel() { cancelled = true; wipe(); },
    get cancelled() { return cancelled; },
    get receipt() { return receipt; },
  };
}

/** Rows the student should look at: flagged by G, listed as unrecognized, or without a catalog match. */
export function uncertainRows(extraction: TranscriptExtraction): ProposedRow[] {
  const unrecognized = new Set(extraction.unrecognizedRows);
  return extraction.rows.filter(r => r.uncertainty.length > 0 || unrecognized.has(r.rowId) || r.provisionalCourseId === null);
}

/** Unrecognized row IDs that have no proposed row (G kept them for review but could not read them). */
export function unreadableRowCount(extraction: TranscriptExtraction): number {
  const ids = new Set(extraction.rows.map(r => r.rowId));
  return extraction.unrecognizedRows.filter(id => !ids.has(id)).length;
}
