// Public engine surface. Consumers (L facade, U via L) import only from here.
export { academicService, audit, createAcademicService, evaluate, generateDraft, startDraftGeneration } from './service';
export type { DraftGeneration, NoValidDraft } from './service';
export { preview, validateCandidate } from './preview';
export { normalizeAttempts, parseTerm, canonicalCourseCode } from './normalize';
export type { NormalizationInput, NormalizationOutput } from './normalize';
export { evaluatePrerequisite } from './prerequisites';
export { ENGINE_VERSION } from './util';
export { createCatalogRegistry, listCatalogs, loadValidatedCatalog } from '../catalog';
export type { CatalogRegistry } from '../catalog';
