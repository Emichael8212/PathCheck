import { SEARCH_POLICY } from '../contracts';
import { academicService, ENGINE_VERSION } from '../engine';
import { createPdfExportService } from '../export';
import { PathCheckWorkflow } from '../screens';
import { createGuestWorkflow } from './createGuestWorkflow';

// Academic authority and state mutations stay in their existing services.
// Public transcript processing and account services remain unavailable until
// their separate runtime configuration and acceptance gates are satisfied.
const services = createGuestWorkflow(
  academicService,
  createPdfExportService({ now: () => new Date().toISOString() }),
  {
    engineVersion: ENGINE_VERSION,
    evaluationPolicy: 'conservative-v1',
    assumeFuturePass: true,
    searchOptions: SEARCH_POLICY,
  },
);

export function App() {
  return <PathCheckWorkflow services={services} />;
}
