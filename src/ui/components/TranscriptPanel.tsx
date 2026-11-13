import { useEffect, useId, useRef, useState } from 'react';
import { ADMISSION_LIMITS } from '../../contracts';
import type { CatalogModel, ProposedRow, TranscriptExtraction, ValidatedExtractedRows } from '../../contracts';
import { failureText, humanizeCode } from '../labels';
import { guardAsync } from '../scenario';
import type { TranscriptPorts } from '../services';
import { startTranscriptSend, uncertainRows, unreadableRowCount } from '../transcriptFlow';
import type { SendOutcome, SendRun } from '../transcriptFlow';

type Availability = { status: 'disabled' | 'approved'; disclosureVersion: string; processingTier: string; reasonCode: string | null };
type Phase = 'idle' | 'checking' | 'ready' | 'sending' | 'done';
type RowView = 'none' | 'uncertain' | 'all';

const MANUAL = 'Please enter your courses manually.';
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function RowsTable({ rows, caption }: { rows: ProposedRow[]; caption: string }) {
  return (
    <div className="table-scroll"><table className="rows-table"><caption>{caption}</caption>
      <thead><tr><th scope="col">Code</th><th scope="col">Term</th><th scope="col">Earned/attempted</th><th scope="col">Grade</th><th scope="col">Flags</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.rowId}><td>{r.rawCourseCode}</td><td>{r.rawTerm ?? '—'}</td><td>{r.rawEarnedCredits ?? '—'}/{r.rawAttemptedCredits ?? '—'}</td><td>{r.rawGrade ?? '—'}</td><td>{[...r.uncertainty.map(humanizeCode), ...(r.provisionalCourseId === null ? ['No catalog match'] : [])].join(', ') || '—'}</td></tr>)}</tbody>
    </table></div>
  );
}

export function TranscriptPanel({ ports, catalog, onValidated, onDiscard, hasExtraction }: { ports: TranscriptPorts | null; catalog: CatalogModel; onValidated: (rows: ValidatedExtractedRows) => void; onDiscard: () => void; hasExtraction: boolean }) {
  const consentId = useId(), fileId = useId();
  const [phase, setPhase] = useState<Phase>('idle');
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [file, setFileState] = useState<File | null>(null);
  // Remounts the native input whenever the selection is cleared, so no stale filename is shown.
  const [fileKey, setFileKey] = useState(0);
  const setFile = (f: File | null) => { setFileState(f); if (!f) setFileKey(k => k + 1); };
  const [fileError, setFileError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<TranscriptExtraction | null>(null);
  const [usable, setUsable] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [rowView, setRowView] = useState<RowView>('none');

  // The active send, if any, with the UI run that owns it. Cancelling it stops every later port call
  // and drops any late result.
  const run = useRef<{ send: SendRun; gen: number } | null>(null);
  // Identifies the UI run whose receipt/withdrawal state is on screen. Each send starts a new run, and
  // each run has at most one receipt, so a revoke response for an older run's receipt is recognisable.
  const generation = useRef(0);
  const mounted = useRef(true);

  // Availability is checked once when the screen opens. The request carries no student data
  // and starts no processing; StrictMode's double effect is absorbed by the ref.
  const checked = useRef(false);
  useEffect(() => {
    mounted.current = true;
    if (!checked.current && ports) { checked.current = true; void check(); }
    // Leaving the screen withdraws an unfinished send: nothing more is requested, nothing late is applied.
    return () => { mounted.current = false; stopRun(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function check() {
    if (!ports) return;
    setPhase('checking'); setError(null);
    const r = await guardAsync(() => ports.client.getAvailability(), 'availability_failed');
    if (!mounted.current) return;
    if (!r.ok) { setError(failureText(r)); setPhase('idle'); return; }
    setAvailability(r.value); setPhase('ready');
  }

  function pick(f: File | null) {
    setFileState(null); setFileError(null);
    if (!f) return;
    if (f.size > ADMISSION_LIMITS.maxPdfBytes) { setFileError('File is larger than 10 MiB.'); return; }
    if (f.type && f.type !== 'application/pdf') { setFileError('Only PDF files are accepted.'); return; }
    setFile(f);
  }

  /**
   * Revokes a consent receipt owned by UI run `gen`. The server request is always sent, even after
   * unmount or a newer upload (privacy first). The response only updates the UI while that run is still
   * the current one: a late answer for an older receipt must not clear, replace or mark withdrawn the
   * receipt of a newer upload.
   */
  async function revokeReceipt(id: string, gen: number) {
    if (!ports) return;
    const r = await guardAsync(() => ports.client.revokeConsent({ consentReceiptId: id }), 'revoke_failed');
    if (!mounted.current || gen !== generation.current) return;
    if (r.ok) { setRevoked(true); setReceipt(null); } else { setReceipt(id); setError(`Consent could not be withdrawn: ${failureText(r)}`); }
  }

  /** Receipts whose automatic revocation has already been sent, so withdrawal is requested once per receipt. */
  const autoRevoked = useRef(new Set<string>());
  function revokeOnce(id: string, gen: number) {
    if (autoRevoked.current.has(id)) return;
    autoRevoked.current.add(id);
    void revokeReceipt(id, gen);
  }

  /**
   * Cancels the active send. A receipt already issued is revoked immediately, without waiting for a
   * held extract to settle, so the server learns of the withdrawal before it could dispatch. A receipt
   * issued only after the cancel is revoked as soon as it arrives.
   */
  function stopRun() {
    const active = run.current;
    if (!active) return;
    run.current = null;
    active.send.cancel();
    if (active.send.receipt) revokeOnce(active.send.receipt, active.gen);
    void active.send.done.then(o => { if (o.kind === 'cancelled' && o.receipt) revokeOnce(o.receipt, active.gen); });
  }

  function withdrawInFlight() {
    stopRun();
    setConsent(false); setFile(null); setPhase('ready'); setError(null);
    setStatus('Stopped. Nothing from this upload will be used. You can enter your courses manually.');
  }

  function apply(o: SendOutcome) {
    if (o.kind === 'cancelled') return;
    if ('receipt' in o && o.receipt) setReceipt(o.receipt);
    switch (o.kind) {
      case 'read_failed': setFileError('This file could not be read. Nothing was sent.'); setError('The transcript could not be read. Choose the file again or enter your courses manually.'); setPhase('ready'); return;
      case 'not_pdf': setFileError('This file is not a valid PDF. Nothing was sent.'); setPhase('ready'); return;
      case 'failed': setError(`${failureText(o.failure)} ${MANUAL}`); setPhase('ready'); return;
      case 'rejected': setExtraction(o.extraction); setUsable(false); setPhase('done'); setError(`The extraction was rejected as unreliable. ${MANUAL}`); return;
      case 'invalid': setExtraction(o.extraction); setUsable(false); setPhase('done'); setError(`${failureText(o.failure)} ${MANUAL}`); return;
      case 'validated': setExtraction(o.extraction); setUsable(true); setPhase('done'); onValidated(o.rows); return;
    }
  }

  async function send() {
    if (!ports || !availability || availability.status !== 'approved' || !consent || !file || run.current) return;
    setPhase('sending'); setError(null); setStatus(null); setFileError(null); setReceipt(null); setRevoked(false); setRowView('none');
    const gen = ++generation.current;
    // A receipt issued after the student already withdrew is revoked the moment it is issued.
    const active: SendRun = startTranscriptSend({ ports, file, disclosureVersion: availability.disclosureVersion, catalog, onReceipt: id => { if (active.cancelled) revokeOnce(id, gen); } });
    run.current = { send: active, gen };
    setFile(null); // the selection is consumed; a new send needs a new, re-consented pick
    const outcome = await active.done;
    if (run.current?.send !== active || active.cancelled || !mounted.current) return; // withdrawn, discarded or unmounted
    run.current = null;
    apply(outcome);
  }

  function setConsentChecked(next: boolean) {
    if (!next && run.current) return withdrawInFlight();
    setConsent(next);
    if (!next) setFile(null);
  }

  function discard() {
    stopRun();
    setExtraction(null); setUsable(false); setRowView('none'); setError(null); setStatus(null);
    setPhase(availability ? 'ready' : 'idle'); setConsent(false); setFile(null); onDiscard();
  }

  const sending = phase === 'sending';
  const flagged = extraction ? uncertainRows(extraction) : [];
  const unreadable = extraction ? unreadableRowCount(extraction) : 0;

  return (
    <section aria-labelledby="upload-title" className="side-card transcript" data-testid="transcript-panel">
      <h2 id="upload-title" className="insp-title">Import from a transcript</h2>
      {!ports && <p className="small" data-testid="upload-unavailable">Transcript import isn’t available yet. Add courses manually.</p>}
      {ports && phase === 'idle' && !availability && error && <div className="button-row"><button type="button" className="secondary" onClick={check}>Check again</button></div>}
      {phase === 'checking' && <p className="small" role="status">Checking availability…</p>}
      {availability?.status === 'disabled' && (
        <p className="small" data-testid="upload-unavailable" title={humanizeCode(availability.reasonCode ?? 'not_approved')}>Transcript import isn’t available yet. Add courses manually.</p>
      )}
      {availability?.status === 'approved' && phase !== 'done' && !extraction && hasExtraction && (
        <div className="notice" data-testid="extraction-kept">
          <p className="small">Rows from an earlier transcript extraction are included with your courses.</p>
          <button type="button" className="secondary" onClick={discard}>Discard extracted rows</button>
        </div>
      )}
      {availability?.status === 'approved' && phase !== 'done' && (
        <div className="disclosure" data-testid="disclosure">
          <h3>Before you upload</h3>
          <ul>
            <li>Your PDF will be sent to <strong>Google Gemini</strong>, a third-party AI processor, through PathCheck&apos;s secure server.</li>
            <li>Purpose: extract proposed course rows only. Gemini does not decide requirements, eligibility or graduation.</li>
            <li>Processing tier: {availability.processingTier}. Disclosure version {availability.disclosureVersion}.</li>
            <li>The PDF is processed transiently and is not saved by PathCheck. Extracted rows stay proposals until you accept them.</li>
            <li>You can decline and enter courses manually instead, and you can withdraw consent at any time, including while sending.</li>
          </ul>
          <label className="check" htmlFor={consentId}>
            <input id={consentId} type="checkbox" checked={consent} onChange={e => setConsentChecked(e.target.checked)} />
            I consent to sending this PDF to Google Gemini for course extraction.
          </label>
          <div className="field">
            <label htmlFor={fileId}>Transcript PDF (max 10 MiB, 20 pages)</label>
            <input key={fileKey} id={fileId} type="file" accept="application/pdf" disabled={!consent || sending} onChange={e => pick(e.target.files?.[0] ?? null)} />
            {fileError && <span className="field-error" role="alert">{fileError}</span>}
          </div>
          <div className="button-row">
            <button type="button" disabled={!consent || !file || sending} onClick={send}>{sending ? 'Sending…' : 'Send for extraction'}</button>
            {sending && <button type="button" className="secondary" onClick={withdrawInFlight}>Stop and withdraw consent</button>}
          </div>
          {sending && <p className="small" role="status">Sending. Results stay proposals; nothing is added to your record yet.</p>}
        </div>
      )}
      {status && <p className="small" role="status" data-testid="transcript-status">{status}</p>}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {extraction && (
        <div className="extraction-summary" data-testid="extraction-summary">
          <h3>Extraction summary — {humanizeCode(extraction.acceptanceStatus)}</h3>
          <ul>
            <li>{extraction.rows.length} proposed row(s){extraction.detectedRowCount === null ? '' : ` of ${extraction.detectedRowCount} detected`}</li>
            <li>Pages covered: {extraction.coveredPages.length} of {extraction.documentPageCount}</li>
            <li>{extraction.completeness === 'demonstrated' ? 'Completeness demonstrated by row/page checks.' : 'Completeness not demonstrated — check that no courses are missing.'}</li>
            {flagged.length > 0 && <li data-testid="uncertain-count">{plural(flagged.length, 'row')} need{flagged.length === 1 ? 's' : ''} a look and won’t count until resolved</li>}
            {unreadable > 0 && <li>{plural(unreadable, 'detected row')} could not be read — add {unreadable === 1 ? 'it' : 'them'} manually</li>}
            {extraction.warnings.map(w => <li key={w}>Warning: {humanizeCode(w)}</li>)}
          </ul>
          {usable && <p className="small" data-testid="extraction-next">Nothing is added yet. Review if you like, then select <strong>Accept and continue</strong> to add these rows to your record.</p>}
          <div className="button-row">
            {flagged.length > 0 && <button type="button" className="link" aria-expanded={rowView === 'uncertain'} onClick={() => setRowView(rowView === 'uncertain' ? 'none' : 'uncertain')}>{rowView === 'uncertain' ? 'Hide' : 'Review'} {plural(flagged.length, 'uncertain row')}</button>}
            <button type="button" className="link" aria-expanded={rowView === 'all'} onClick={() => setRowView(rowView === 'all' ? 'none' : 'all')}>{rowView === 'all' ? 'Hide' : 'Show'} all proposed rows</button>
          </div>
          {rowView === 'uncertain' && <RowsTable rows={flagged} caption="Rows that need a look (raw values, not yet interpreted)" />}
          {rowView === 'all' && <RowsTable rows={extraction.rows} caption="Proposed rows (raw values, not yet interpreted)" />}
          <div className="button-row">
            <button type="button" className="secondary" onClick={discard}>Discard extraction</button>
          </div>
        </div>
      )}
      {receipt && !revoked && !sending && (
        <div className="button-row"><button type="button" className="secondary" onClick={() => void revokeReceipt(receipt, generation.current)}>Withdraw consent</button></div>
      )}
      {revoked && <p className="small" role="status" data-testid="consent-withdrawn">Consent withdrawn. No further processing will be requested.</p>}
    </section>
  );
}
