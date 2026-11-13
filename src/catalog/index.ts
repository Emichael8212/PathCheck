// Catalog service: only user-approved, schema-validated configurations are loadable.
// Unknown, unsupported-year or mismatched references return a typed `unavailable` failure;
// a configuration is never silently migrated to another version (T-CAT CAT-05).
import historical from '../../docs/curriculum/historical-2019-2021.json';
import provisional from '../../docs/curriculum/provisional-current.json';
import { CatalogModelSchema, CatalogRefSchema, canonicalJson } from '../contracts';
import type { CatalogModel, CatalogRef, Result } from '../contracts';
import { curriculumToCatalog } from './curriculumCatalog';

export { curriculumToCatalog, requirementIds } from './curriculumCatalog';

export interface CatalogRegistry {
  listCatalogs(): Result<CatalogRef[]>;
  loadValidatedCatalog(ref: CatalogRef): Result<CatalogModel>;
}

/**
 * Registry over an explicit, schema-validated catalog list (same lookup rules as the default).
 * Used by the default service and by integration/browser tests that must inject a clearly
 * labeled synthetic catalog. Throws on an invalid or duplicate-version model (composition bug).
 */
export function createCatalogRegistry(models: readonly CatalogModel[]): CatalogRegistry {
  const list = Object.freeze(models.map(m => Object.freeze(CatalogModelSchema.parse(m))));
  if (new Set(list.map(c => c.catalogRef.catalogVersion)).size !== list.length) throw new Error('Duplicate catalog version in registry');
  return {
    listCatalogs: () => ({ ok: true, value: list.map(c => structuredClone(c.catalogRef)) }),
    loadValidatedCatalog(ref) {
      const parsed = CatalogRefSchema.safeParse(ref);
      if (!parsed.success) return { ok: false, code: 'validation_error', reasonCode: 'invalid_catalog_ref' };
      const match = list.find(c => c.catalogRef.catalogVersion === parsed.data.catalogVersion);
      if (!match) return { ok: false, code: 'unavailable', reasonCode: 'catalog_version_unavailable' };
      if (parsed.data.catalogYearId !== match.catalogRef.catalogYearId) return { ok: false, code: 'unavailable', reasonCode: 'unsupported_catalog_year' };
      if (canonicalJson(parsed.data) !== canonicalJson(match.catalogRef)) return { ok: false, code: 'unavailable', reasonCode: 'catalog_ref_mismatch' };
      return { ok: true, value: structuredClone(match) };
    },
  };
}

let registry: CatalogRegistry | null = null;
/** Provisional current configuration first (default for new plans), then historical reference. */
function defaultRegistry(): CatalogRegistry {
  registry ??= createCatalogRegistry([curriculumToCatalog(provisional), curriculumToCatalog(historical)]);
  return registry;
}

export function listCatalogs(): Result<CatalogRef[]> {
  return defaultRegistry().listCatalogs();
}

export function loadValidatedCatalog(ref: CatalogRef): Result<CatalogModel> {
  return defaultRegistry().loadValidatedCatalog(ref);
}
