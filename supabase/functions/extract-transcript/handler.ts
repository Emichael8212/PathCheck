import type { ProcessingEligibility } from '../../../src/contracts';
import { approved } from './admission';
import { createTranscriptHandlerCore } from './handlerCore';
import type { CoreEndpointOptions } from './handlerCore';
export { INSPECTION_DEADLINE_MS } from './handlerCore';
export type { PdfInspector } from './handlerCore';
export interface EndpointOptions extends CoreEndpointOptions<ProcessingEligibility> {
  /** Deny unless reviewed maximum provider spend fits the reserved amount. */
  maximumProviderCostMicrousd: number | null;
}
/** Public runtime remains permanently bound to the approved paid-processing contract. */
export function createTranscriptHandler(options: EndpointOptions): (request: Request) => Promise<Response> {
  return createTranscriptHandlerCore(options, {
    enabled: (eligibility, time) => approved(eligibility, time)
      && options.maximumProviderCostMicrousd !== null && Number.isSafeInteger(options.maximumProviderCostMicrousd)
      && options.maximumProviderCostMicrousd > 0 && eligibility.perRequestReservationMicrousd >= options.maximumProviderCostMicrousd,
    reservedCost: eligibility => eligibility.status === 'approved' ? eligibility.perRequestReservationMicrousd : 0,
    processingTier: 'reviewed_paid_processing_required',
  });
}
