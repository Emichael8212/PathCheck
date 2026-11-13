// Catalog service: only user-approved, schema-validated configurations are loadable.
// Unknown, unsupported-year or mismatched references return a typed `unavailable` failure;
// a configuration is never silently migrated to another version (T-CAT CAT-05).
import historical from '../../docs/curriculum/historical-2019-2021.json';
import provisional from '../../docs/curriculum/provisional-current.json';
import { CatalogRefSchema, canonicalJson } from '../contracts';
import type { CatalogModel, CatalogRef, Result } from '../contracts';
import { curriculumToCatalog } from './curriculumCatalog';

export { curriculumToCatalog, requirementIds } from './curriculumCatalog';

let cache: readonly CatalogModel[] | null = null;
/** Provisional current configuration first (default for new plans), then historical reference. */
function catalogs(): readonly CatalogModel[] {
  cache ??= Object.freeze([curriculumToCatalog(provisional), curriculumToCatalog(historical)]);
  return cache;
}

export function listCatalogs(): Result<CatalogRef[]> {
  return { ok: true, value: catalogs().map(c => structuredClone(c.catalogRef)) };
}

export function loadValidatedCatalog(ref: CatalogRef): Result<CatalogModel> {
  const parsed = CatalogRefSchema.safeParse(ref);
  if (!parsed.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_catalog_ref' };
  const match = catalogs().find(c => c.catalogRef.catalogVersion === parsed.data.catalogVersion);
  if (!match) return { ok: false, code: 'unavailable', reasonCode: 'catalog_version_unavailable' };
  if (parsed.data.catalogYearId !== match.catalogRef.catalogYearId) return { ok: false, code: 'unavailable', reasonCode: 'unsupported_catalog_year' };
  if (canonicalJson(parsed.data) !== canonicalJson(match.catalogRef)) return { ok: false, code: 'unavailable', reasonCode: 'catalog_ref_mismatch' };
  return { ok: true, value: structuredClone(match) };
}
