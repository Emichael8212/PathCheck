import { useId } from 'react';
import type { CatalogModel, CatalogRef, TermId, TypedFailure } from '../contracts';
import { CatalogSummary } from '../ui/components/Display';
import { catalogYearLabel, failureText, programLabel } from '../ui/labels';
import { termKey, termLabel } from '../ui/terms';

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
    <section className="screen screen-narrow" aria-labelledby="start-title" data-testid="screen-start">
      <h1 id="start-title">Plan your path to graduation</h1>
      <p className="lede">PathCheck checks the courses you select or propose against the modeled degree rules and builds a conditional plan. It is not an official degree audit or registration system.</p>
      {!Array.isArray(p.catalogs) && <p className="notice notice-error" role="alert">Programs could not be loaded. {failureText(p.catalogs)}</p>}
      <form className="section" onSubmit={e => { e.preventDefault(); if (p.catalog && p.targetKey && !p.busy) p.onContinue(); }}>
        <div className="field">
          <label htmlFor={programId}>University and program</label>
          <select id={programId} value={p.selectedVersion} disabled={p.locked} onChange={e => p.onSelectCatalog(e.target.value)}>
            <option value="">Choose a supported program…</option>
            {refs.map(r => <option key={r.catalogVersion} value={r.catalogVersion}>{programLabel(r)}, catalog {catalogYearLabel(r)} ({r.catalogVersion})</option>)}
          </select>
          {p.locked && <p className="hint">Program is fixed for this plan. <button type="button" className="link" onClick={p.onStartOver}>Start over</button> to change it.</p>}
        </div>
        {p.catalogError && (
          <div className="notice notice-error" role="alert" data-testid="unsupported-catalog">
            <p>This catalog or program is not supported. {failureText(p.catalogError)}</p>
            <p>PathCheck will not make degree claims for it. Choose a supported program.</p>
          </div>
        )}
        {p.catalog && <CatalogSummary catalog={p.catalog} />}
        <div className="field">
          <label htmlFor={targetId}>Target graduation term</label>
          <select id={targetId} value={p.targetKey} aria-describedby={targetHint} onChange={e => p.onTarget(e.target.value)}>
            <option value="">Choose a term…</option>
            {p.targetOptions.map(t => <option key={termKey(t)} value={termKey(t)}>{termLabel(t)}</option>)}
          </select>
          <p className="hint" id={targetHint}>Changing the target changes every projection. A target is a goal, not a promise.</p>
        </div>
        <div className="button-row">
          <button type="submit" disabled={!p.catalog || !p.targetKey || p.busy}>Continue as guest</button>
        </div>
        <p className="hint">No account needed. You can sign in and save later.</p>
      </form>
    </section>
  );
}
