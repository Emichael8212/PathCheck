import { useId } from 'react';
import type { CatalogModel, CatalogRef, TermId, TypedFailure } from '../contracts';
import { CatalogSummary } from '../ui/components/Display';
import { catalogStatus, failureText, programLabel } from '../ui/labels';
import { termKey, termLabel } from '../ui/terms';

/** Groups catalogs by institution so each option shows only the program and its catalog status. */
function institutions(refs: CatalogRef[]): Array<[string, CatalogRef[]]> {
  const groups = new Map<string, CatalogRef[]>();
  for (const r of refs) {
    const inst = programLabel(r).split(' — ')[0]!;
    groups.set(inst, [...(groups.get(inst) ?? []), r]);
  }
  return [...groups.entries()];
}
const programName = (r: CatalogRef) => programLabel(r).split(' — ').slice(1).join(' — ') || programLabel(r);
export interface GetStartedProps {
  catalogs: CatalogRef[] | TypedFailure;
  selectedVersion: string;
  catalog: CatalogModel | null;
  catalogError: TypedFailure | null;
  locked: boolean;
  targetOptions: TermId[];
  targetKey: string;
  busy: boolean;
  onSelectCatalog(version: string): void;
  onTarget(key: string): void;
  onContinue(): void;
  onStartOver(): void;
}

export function GetStartedScreen(p: GetStartedProps) {
  const programId = useId(), targetId = useId(), targetHint = useId();
  const refs = Array.isArray(p.catalogs) ? p.catalogs : [];
  return (
    <section className="screen start" aria-labelledby="start-title" data-testid="screen-start">
      <div className="start-intro">
        <p className="wordmark-large" translate="no">PathCheck</p>
        <h1 id="start-title">Plan your path to graduation</h1>
        <p className="lede">Check your courses against your degree requirements and build a semester plan you control.</p>
        <ol className="steps-summary">
          <li><span className="step-n" aria-hidden="true">1</span>Add the courses you’ve taken</li>
          <li><span className="step-n" aria-hidden="true">2</span>Plan your remaining semesters</li>
          <li><span className="step-n" aria-hidden="true">3</span>Review what’s unconfirmed before you register</li>
        </ol>
        <p className="small">Not an official degree audit or registration system.</p>
      </div>
      <form className="setup-card" aria-label="Plan setup" onSubmit={e => { e.preventDefault(); if (p.catalog && p.targetKey && !p.busy) p.onContinue(); }}>
        {!Array.isArray(p.catalogs) && <p className="notice notice-error" role="alert">Programs couldn’t be loaded. {failureText(p.catalogs)}</p>}
        <div className="field">
          <label htmlFor={programId}>University and program</label>
          {/* Option text names the program and its catalog status; the version stays in Catalog details. */}
          <select id={programId} value={p.selectedVersion} disabled={p.locked} onChange={e => p.onSelectCatalog(e.target.value)}>
            <option value="">Choose a supported program…</option>
            {institutions(refs).map(([inst, list]) => (
              <optgroup key={inst} label={inst}>
                {list.map(r => <option key={r.catalogVersion} value={r.catalogVersion}>{programName(r)} · {catalogStatus(r, null).short}</option>)}
              </optgroup>
            ))}
          </select>
          {p.locked && <p className="hint">Program is fixed for this plan. <button type="button" className="link" onClick={p.onStartOver}>Start over</button> to change it.</p>}
        </div>
        {p.catalogError && (
          <div className="notice notice-error" role="alert" data-testid="unsupported-catalog">
            <p>This catalog or program isn’t supported. {failureText(p.catalogError)}</p>
            <p>PathCheck makes no degree claims for it. Choose a supported program.</p>
          </div>
        )}
        {p.catalog && <CatalogSummary catalog={p.catalog} />}
        <div className="field">
          <label htmlFor={targetId}>Target graduation term</label>
          <select id={targetId} value={p.targetKey} aria-describedby={targetHint} onChange={e => p.onTarget(e.target.value)}>
            <option value="">Choose a term…</option>
            {p.targetOptions.map(t => <option key={termKey(t)} value={termKey(t)}>{termLabel(t)}</option>)}
          </select>
          <p className="hint" id={targetHint}>A goal, not a promise. Changing it rechecks your plan.</p>
        </div>
        <button type="submit" className="block" disabled={!p.catalog || !p.targetKey || p.busy}>Continue as guest</button>
        <p className="hint center">No account needed. Sign in later to save.</p>
      </form>
    </section>
  );
}
