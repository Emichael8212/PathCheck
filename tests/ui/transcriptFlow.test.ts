// U unit tests for the cancellable transcript send (src/ui/transcriptFlow.ts).
// Ports are TEST DOUBLES with manually resolved promises; no provider, network or real PDF.
import { describe, expect, it } from 'vitest';
import type { CatalogModel, Result, TranscriptExtraction, ValidatedExtractedRows } from '../../src/contracts';
import type { TranscriptPorts } from '../../src/ui/services';
import { startTranscriptSend, uncertainRows, unreadableRowCount } from '../../src/ui/transcriptFlow';
import type { SendRun } from '../../src/ui/transcriptFlow';
import { downgradeExtraction, optimisticRawExtraction, syntheticExtraction } from '../fixtures/ui/fakeServices';

const PDF = '%PDF-1.4 synthetic test document';
const catalog = {} as CatalogModel;
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const failure = (reasonCode: string): Result<never> => ({ ok: false, code: 'external_failure', reasonCode });

function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** A file whose buffer the test keeps, so zeroing of the UI's copy is observable. */
function syntheticFile(text = PDF) {
  const buffer = new TextEncoder().encode(text).buffer;
  return { buffer, file: { arrayBuffer: async () => buffer }, zeroed: () => new Uint8Array(buffer).every(b => b === 0) };
}

type Step = 'attestation' | 'session' | 'ticket' | 'extract';
/** Ports where each step resolves immediately unless `held` gives the test a deferred to settle later. */
function ports(over: Partial<Record<Step, () => Promise<Result<unknown>>>> & { validate?: TranscriptPorts['validate'] } = {}) {
  const calls: string[] = [];
  const seen: { extractBytes: Uint8Array | null; extractCopy: string | null } = { extractBytes: null, extractCopy: null };
  const step = <T>(name: Step, fallback: () => Result<T>) => async (..._args: unknown[]): Promise<Result<T>> => {
    calls.push(name);
    if (name === 'extract') { const b = _args[1] as Uint8Array; seen.extractBytes = b; seen.extractCopy = new TextDecoder().decode(b); }
    return (over[name] ? (await over[name]!()) : fallback()) as Result<T>;
  };
  const p: TranscriptPorts = {
    obtainBotAttestation: step('attestation', () => ok('attest')),
    client: {
      getAvailability: async () => { throw new Error('not used'); },
      establishGuestSession: step('session', () => ok(null)),
      requestTicket: step('ticket', () => ok({ signedTicket: 'signed', consentReceiptId: 'receipt-1', expiresAt: '2026-11-12T15:05:00.000Z' })),
      extract: step('extract', () => ok(syntheticExtraction('needs_review'))),
      revokeConsent: async () => { calls.push('revoke'); return ok(null); },
    },
    validate: over.validate ?? ((e: TranscriptExtraction) => { calls.push('validate'); return ok({ kind: 'validated_proposed_rows', extraction: e } as unknown as ValidatedExtractedRows); }),
  };
  return { ports: p, calls, seen };
}

const tick = () => new Promise(r => setTimeout(r, 0));

describe('transcript send: failures fall back to manual and always wipe the PDF copy', () => {
  it('a rejected file.arrayBuffer() yields read_failed and makes no port call', async () => {
    const { ports: p, calls } = ports();
    const run = startTranscriptSend({ ports: p, file: { arrayBuffer: () => Promise.reject(new Error('NotReadableError')) }, disclosureVersion: 'v1', catalog });
    await expect(run.done).resolves.toEqual({ kind: 'read_failed' });
    expect(calls).toEqual([]);
  });

  it('a non-PDF is refused locally, wiped, and nothing is sent', async () => {
    const f = syntheticFile('not a pdf at all');
    const { ports: p, calls } = ports();
    await expect(startTranscriptSend({ ports: p, file: f.file, disclosureVersion: 'v1', catalog }).done).resolves.toEqual({ kind: 'not_pdf' });
    expect(calls).toEqual([]);
    expect(f.zeroed()).toBe(true);
  });

  it.each([
    ['attestation', ['attestation'], null],
    ['session', ['attestation', 'session'], null],
    ['ticket', ['attestation', 'session', 'ticket'], null],
    ['extract', ['attestation', 'session', 'ticket', 'extract'], 'receipt-1'],
  ] as const)('a %s failure stops the chain, keeps the typed failure and zeroes the bytes', async (step, expected, receipt) => {
    const f = syntheticFile();
    const { ports: p, calls } = ports({ [step]: async () => failure(`${step}_down`) });
    const outcome = await startTranscriptSend({ ports: p, file: f.file, disclosureVersion: 'v1', catalog }).done;
    expect(outcome).toEqual({ kind: 'failed', failure: { ok: false, code: 'external_failure', reasonCode: `${step}_down` }, receipt });
    expect(calls).toEqual(expected);
    expect(f.zeroed()).toBe(true);
  });

  it('a throwing port is converted to a typed failure and the bytes are still zeroed', async () => {
    const f = syntheticFile();
    const { ports: p } = ports({ session: async () => { throw new Error('boom'); } });
    const outcome = await startTranscriptSend({ ports: p, file: f.file, disclosureVersion: 'v1', catalog }).done;
    expect(outcome).toMatchObject({ kind: 'failed', failure: { reasonCode: 'session_failed' } });
    expect(f.zeroed()).toBe(true);
  });

  it('rejected and unvalidatable extractions are never handed on as rows', async () => {
    const rejected = ports({ extract: async () => ok(syntheticExtraction('rejected')) });
    await expect(startTranscriptSend({ ports: rejected.ports, file: syntheticFile().file, disclosureVersion: 'v1', catalog }).done).resolves.toMatchObject({ kind: 'rejected', receipt: 'receipt-1' });
    expect(rejected.calls).not.toContain('validate');
    const invalid = ports({ validate: () => { throw new Error('bad shape'); } });
    await expect(startTranscriptSend({ ports: invalid.ports, file: syntheticFile().file, disclosureVersion: 'v1', catalog }).done).resolves.toMatchObject({ kind: 'invalid', failure: { reasonCode: 'validation_failed' } });
  });

  it('success sends the real bytes once, binds the digest, validates, then zeroes', async () => {
    const f = syntheticFile();
    let ticketRequest: unknown = null;
    const { ports: p, calls, seen } = ports();
    const original = p.client.requestTicket;
    p.client = { ...p.client, requestTicket: r => { ticketRequest = r; return original(r); } };
    const outcome = await startTranscriptSend({ ports: p, file: f.file, disclosureVersion: 'disc-v9', catalog }).done;
    expect(outcome.kind).toBe('validated');
    expect(calls).toEqual(['attestation', 'session', 'ticket', 'extract', 'validate']);
    expect(seen.extractCopy).toBe(PDF);
    expect(ticketRequest).toMatchObject({ disclosureVersion: 'disc-v9', explicitConsent: true, botAttestation: 'attest', documentDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(f.zeroed()).toBe(true);
  });

  it('success reports G\'s downgraded validated envelope, never the optimistic raw extract response', async () => {
    const raw = optimisticRawExtraction();
    const downgraded = downgradeExtraction(raw);
    const { ports: p } = ports({ extract: async () => ok(raw), validate: () => ok({ kind: 'validated_proposed_rows', extraction: downgraded } as unknown as ValidatedExtractedRows) });
    const outcome = await startTranscriptSend({ ports: p, file: syntheticFile().file, disclosureVersion: 'v1', catalog }).done;
    if (outcome.kind !== 'validated') throw new Error(`expected validated, got ${outcome.kind}`);
    // Precondition: the two envelopes really differ in what the summary displays.
    expect([raw.acceptanceStatus, raw.completeness, uncertainRows(raw).length]).toEqual(['accepted', 'demonstrated', 1]);
    expect(outcome.extraction).toBe(outcome.rows.extraction);
    expect(outcome.extraction).toEqual(downgraded);
    expect([outcome.extraction.acceptanceStatus, outcome.extraction.completeness]).toEqual(['needs_review', 'unknown']);
    expect(uncertainRows(outcome.extraction).map(r => r.rowId)).toEqual(['x1', 'x2']);
  });
});

describe('transcript send: withdrawal during an async step', () => {
  it('cancel while the file is being read: no port is ever called and the late buffer is wiped', async () => {
    const f = syntheticFile();
    const read = deferred<ArrayBuffer>();
    const { ports: p, calls } = ports();
    const run = startTranscriptSend({ ports: p, file: { arrayBuffer: () => read.promise }, disclosureVersion: 'v1', catalog });
    run.cancel();
    read.resolve(f.buffer);
    await expect(run.done).resolves.toEqual({ kind: 'cancelled', receipt: null });
    expect(calls).toEqual([]);
    expect(f.zeroed()).toBe(true);
  });

  it('cancel while attestation is pending: bytes wiped at once, no session/ticket/extract afterwards', async () => {
    const f = syntheticFile();
    const att = deferred<Result<unknown>>();
    const { ports: p, calls } = ports({ attestation: () => att.promise });
    const run = startTranscriptSend({ ports: p, file: f.file, disclosureVersion: 'v1', catalog });
    await tick();
    expect(calls).toEqual(['attestation']);
    run.cancel();
    expect(f.zeroed()).toBe(true);
    att.resolve(ok('late-attestation'));
    await expect(run.done).resolves.toEqual({ kind: 'cancelled', receipt: null });
    expect(calls).toEqual(['attestation']);
  });

  it('cancel while the ticket is pending: a late receipt is reported for revocation and extract never runs', async () => {
    const t = deferred<Result<unknown>>();
    const { ports: p, calls } = ports({ ticket: () => t.promise });
    const run = startTranscriptSend({ ports: p, file: syntheticFile().file, disclosureVersion: 'v1', catalog });
    await tick();
    run.cancel();
    t.resolve(ok({ signedTicket: 's', consentReceiptId: 'late-receipt', expiresAt: '2026-11-12T15:05:00.000Z' }));
    await expect(run.done).resolves.toEqual({ kind: 'cancelled', receipt: 'late-receipt' });
    expect(calls).toEqual(['attestation', 'session', 'ticket']);
  });

  it('cancel while extract is pending: the in-flight copy is zeroed now and late rows are never validated or returned', async () => {
    const x = deferred<Result<unknown>>();
    const { ports: p, calls, seen } = ports({ extract: () => x.promise });
    const run = startTranscriptSend({ ports: p, file: syntheticFile().file, disclosureVersion: 'v1', catalog });
    await tick();
    expect(calls).toEqual(['attestation', 'session', 'ticket', 'extract']);
    run.cancel();
    expect(run.cancelled).toBe(true);
    expect(seen.extractBytes!.every(b => b === 0)).toBe(true);
    x.resolve(ok(syntheticExtraction('accepted')));
    await expect(run.done).resolves.toEqual({ kind: 'cancelled', receipt: 'receipt-1' });
    expect(calls).not.toContain('validate');
  });

  it('cancel after a pending extract fails still reports cancelled, not a failure to show', async () => {
    const x = deferred<Result<unknown>>();
    const { ports: p } = ports({ extract: () => x.promise });
    const run = startTranscriptSend({ ports: p, file: syntheticFile().file, disclosureVersion: 'v1', catalog });
    await tick();
    run.cancel();
    x.reject(new Error('network'));
    await expect(run.done).resolves.toEqual({ kind: 'cancelled', receipt: 'receipt-1' });
  });

  it('the issued receipt is exposed while extract is still pending, so it can be revoked before extract settles', async () => {
    const x = deferred<Result<unknown>>();
    const issued: string[] = [];
    const { ports: p } = ports({ extract: () => x.promise });
    const run = startTranscriptSend({ ports: p, file: syntheticFile().file, disclosureVersion: 'v1', catalog, onReceipt: id => issued.push(id) });
    expect(run.receipt).toBeNull();
    await tick();
    expect(issued).toEqual(['receipt-1']);
    run.cancel();
    expect(run.receipt).toBe('receipt-1'); // known now, while extract is still held
    x.resolve(ok(syntheticExtraction('accepted')));
    await expect(run.done).resolves.toEqual({ kind: 'cancelled', receipt: 'receipt-1' });
    expect(issued).toEqual(['receipt-1']);
  });

  it('a receipt issued after cancel is still announced via onReceipt and run.receipt', async () => {
    const t = deferred<Result<unknown>>();
    const announced: Array<{ id: string; cancelled: boolean }> = [];
    const { ports: p, calls } = ports({ ticket: () => t.promise });
    const run: SendRun = startTranscriptSend({ ports: p, file: syntheticFile().file, disclosureVersion: 'v1', catalog, onReceipt: id => announced.push({ id, cancelled: run.cancelled }) });
    await tick();
    run.cancel();
    expect(run.receipt).toBeNull();
    t.resolve(ok({ signedTicket: 's', consentReceiptId: 'late-receipt', expiresAt: '2026-11-12T15:05:00.000Z' }));
    await expect(run.done).resolves.toEqual({ kind: 'cancelled', receipt: 'late-receipt' });
    expect(announced).toEqual([{ id: 'late-receipt', cancelled: true }]);
    expect(run.receipt).toBe('late-receipt');
    expect(calls).not.toContain('extract');
  });

  it('a throwing onReceipt does not hide the receipt or break the run', async () => {
    const { ports: p } = ports();
    const run = startTranscriptSend({ ports: p, file: syntheticFile().file, disclosureVersion: 'v1', catalog, onReceipt: () => { throw new Error('caller bug'); } });
    await expect(run.done).resolves.toMatchObject({ kind: 'validated', receipt: 'receipt-1' });
  });
});

describe('extraction review helpers', () => {
  it('uncertain rows are those flagged, unrecognized or without a catalog match', () => {
    const e = syntheticExtraction('needs_review');
    expect(uncertainRows(e).map(r => r.rowId)).toEqual(['x2']);
    expect(uncertainRows({ ...e, unrecognizedRows: ['x1'] }).map(r => r.rowId)).toEqual(['x1', 'x2']);
  });

  it('counts unrecognized IDs with no proposed row as unreadable', () => {
    const e = syntheticExtraction('needs_review');
    expect(unreadableRowCount(e)).toBe(0);
    expect(unreadableRowCount({ ...e, unrecognizedRows: ['x2', 'lost-1', 'lost-2'] })).toBe(2);
  });
});
