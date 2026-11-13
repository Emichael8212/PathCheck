import { useEffect, useId, useRef, useState } from 'react';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { ADMISSION_LIMITS } from '../../contracts';
import type { CatalogModel, TranscriptExtraction, TypedFailure, ValidatedExtractedRows } from '../../contracts';
import { failureText, humanizeCode } from '../labels';
import { guardAsync, guard } from '../scenario';
import type { TranscriptPorts } from '../services';
import { looksLikePdf } from '../upload';

type Availability = { status: 'disabled' | 'approved'; disclosureVersion: string; processingTier: string; reasonCode: string | null };
type Phase = 'idle' | 'checking' | 'ready' | 'sending' | 'done';

export function TranscriptPanel({ ports, catalog, onValidated, onDiscard, hasExtraction }: { ports: TranscriptPorts | null; catalog: CatalogModel; onValidated: (rows: ValidatedExtractedRows) => void; onDiscard: () => void; hasExtraction: boolean }) {
  const consentId = useId(), fileId = useId();
  const [phase, setPhase] = useState<Phase>('idle');
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<TranscriptExtraction | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [showRows, setShowRows] = useState(false);

  // Availability is checked once when the screen opens. The request carries no student data
  // and starts no processing; StrictMode's double effect is absorbed by the ref.
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current || !ports) return;
    checked.current = true;
    void check();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (f: TypedFailure) => { setError(failureText(f)); setPhase(availability ? 'ready' : 'idle'); };

  async function check() {
    if (!ports) return;
    setPhase('checking'); setError(null);
    const r = await guardAsync(() => ports.client.getAvailability(), 'availability_failed');
    if (!r.ok) { setError(failureText(r)); setPhase('idle'); return; }
    setAvailability(r.value); setPhase('ready');
  }

  function pick(f: File | null) {
    setFile(null); setFileError(null);
    if (!f) return;
    if (f.size > ADMISSION_LIMITS.maxPdfBytes) { setFileError('File is larger than 10 MiB.'); return; }
    if (f.type && f.type !== 'application/pdf') { setFileError('Only PDF files are accepted.'); return; }
    setFile(f);
  }

  async function send() {
    if (!ports || !availability || availability.status !== 'approved' || !consent || !file) return;
    setPhase('sending'); setError(null);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!looksLikePdf(bytes)) { setFileError('This file is not a valid PDF.'); setPhase('ready'); return; }
    const documentDigest = bytesToHex(sha256(bytes));
    const attestation = await guardAsync(() => ports.obtainBotAttestation(), 'attestation_failed');
    if (!attestation.ok) return fail(attestation);
    const session = await guardAsync(() => ports.client.establishGuestSession(), 'session_failed');
    if (!session.ok) return fail(session);
    const ticket = await guardAsync(() => ports.client.requestTicket({ botAttestation: attestation.value, disclosureVersion: availability.disclosureVersion, explicitConsent: true, documentDigest }), 'ticket_failed');
    if (!ticket.ok) return fail(ticket);
    setReceipt(ticket.value.consentReceiptId);
    const extracted = await guardAsync(() => ports.client.extract({ signedTicket: ticket.value.signedTicket, consentReceiptId: ticket.value.consentReceiptId }, bytes), 'extract_failed');
    bytes.fill(0); // drop the transient copy; the PDF is never stored by the UI
    setFile(null);
    if (!extracted.ok) return fail(extracted);
    setExtraction(extracted.value);
    setPhase('done');
    if (extracted.value.acceptanceStatus === 'rejected') { setError('The extraction was rejected as unreliable. Please enter your courses manually.'); return; }
    const validated = guard(() => ports.validate(extracted.value, catalog), 'validation_failed');
    if (!validated.ok) { setError(`${failureText(validated)} Please enter your courses manually.`); return; }
    onValidated(validated.value);
  }

  async function revoke() {
    if (!ports || !receipt) return;
    const r = await guardAsync(() => ports.client.revokeConsent({ consentReceiptId: receipt }), 'revoke_failed');
    if (!r.ok) setError(failureText(r)); else setRevoked(true);
  }

  function discard() { setExtraction(null); setShowRows(false); setPhase(availability ? 'ready' : 'idle'); setConsent(false); onDiscard(); }

  return (
    <section aria-labelledby="upload-title" className="side-card transcript" data-testid="transcript-panel">
      <h2 id="upload-title" className="insp-title">Import from a transcript</h2>
      {!ports && <p className="small" data-testid="upload-unavailable">Transcript import isn’t available in this build. Add your courses manually. Nothing is uploaded.</p>}
      {ports && phase === 'idle' && !availability && error && <div className="button-row"><button type="button" className="secondary" onClick={check}>Check again</button></div>}
      {phase === 'checking' && <p className="small" role="status">Checking availability…</p>}
      {availability?.status === 'disabled' && (
        <p className="small" data-testid="upload-unavailable" title={humanizeCode(availability.reasonCode ?? 'not_approved')}>Transcript import isn’t available yet. Add your courses manually. Nothing is uploaded.</p>
      )}
      {availability?.status === 'approved' && phase !== 'done' && (
        <div className="disclosure" data-testid="disclosure">
          <h3>Before you upload</h3>
          <ul>
            <li>Your PDF will be sent to <strong>Google Gemini</strong>, a third-party AI processor, through PathCheck&apos;s secure server.</li>
            <li>Purpose: extract proposed course rows only. Gemini does not decide requirements, eligibility or graduation.</li>
            <li>Processing tier: {availability.processingTier}. Disclosure version {availability.disclosureVersion}.</li>
            <li>The PDF is processed transiently and is not saved by PathCheck. Extracted rows stay proposals until you accept them.</li>
            <li>You can decline and enter courses manually instead, and you can withdraw consent afterwards.</li>
          </ul>
          <label className="check" htmlFor={consentId}>
            <input id={consentId} type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
            I consent to sending this PDF to Google Gemini for course extraction.
          </label>
          <div className="field">
            <label htmlFor={fileId}>Transcript PDF (max 10 MiB, 20 pages)</label>
            <input id={fileId} type="file" accept="application/pdf" disabled={!consent} onChange={e => pick(e.target.files?.[0] ?? null)} />
            {fileError && <span className="field-error" role="alert">{fileError}</span>}
          </div>
          <button type="button" disabled={!consent || !file || phase === 'sending'} onClick={send}>{phase === 'sending' ? 'Sending…' : 'Send for extraction'}</button>
        </div>
      )}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {extraction && (
        <div className="extraction-summary" data-testid="extraction-summary">
          <h3>Extraction summary — {humanizeCode(extraction.acceptanceStatus)}</h3>
          <ul>
            <li>{extraction.rows.length} proposed row(s){extraction.detectedRowCount === null ? '' : ` of ${extraction.detectedRowCount} detected`}</li>
            <li>Pages covered: {extraction.coveredPages.length} of {extraction.documentPageCount}</li>
            <li>{extraction.completeness === 'demonstrated' ? 'Completeness demonstrated by row/page checks.' : 'Completeness not demonstrated — check that no courses are missing.'}</li>
            {extraction.unrecognizedRows.length > 0 && <li>{extraction.unrecognizedRows.length} unrecognized row(s) kept for review</li>}
            {extraction.warnings.map(w => <li key={w}>Warning: {humanizeCode(w)}</li>)}
          </ul>
          <button type="button" className="link" aria-expanded={showRows} onClick={() => setShowRows(!showRows)}>{showRows ? 'Hide' : 'Show'} all proposed rows</button>
          {showRows && (
            <div className="table-scroll"><table className="rows-table"><caption>Proposed rows (raw values, not yet interpreted)</caption>
              <thead><tr><th scope="col">Code</th><th scope="col">Term</th><th scope="col">Credits</th><th scope="col">Grade</th><th scope="col">Flags</th></tr></thead>
              <tbody>{extraction.rows.map(r => <tr key={r.rowId}><td>{r.rawCourseCode}</td><td>{r.rawTerm ?? '—'}</td><td>{r.rawEarnedCredits ?? '—'}/{r.rawAttemptedCredits ?? '—'}</td><td>{r.rawGrade ?? '—'}</td><td>{r.uncertainty.map(humanizeCode).join(', ')}</td></tr>)}</tbody>
            </table></div>
          )}
          <div className="button-row">
            {(hasExtraction || extraction.acceptanceStatus === 'rejected' || error) && <button type="button" className="secondary" onClick={discard}>Discard extraction</button>}
            {receipt && !revoked && <button type="button" className="secondary" onClick={revoke}>Withdraw consent</button>}
            {revoked && <span>Consent withdrawn. No further processing will be requested.</span>}
          </div>
        </div>
      )}
    </section>
  );
}
