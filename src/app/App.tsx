import { SEARCH_POLICY } from '../contracts';
import { academicService, ENGINE_VERSION } from '../engine';
import { createPdfExportService } from '../export';
import { PathCheckWorkflow } from '../screens';
import { createGuestWorkflow } from './createGuestWorkflow';
import { browserRecoveryStores, createAccountPorts } from './createAccountPorts';

// Academic authority and state mutations stay in their existing services.
// Public transcript processing stays disabled pending its runtime/privacy gates.
// Optional accounts use only validated browser-public configuration.
const guestServices = createGuestWorkflow(
  academicService,
  createPdfExportService({ now: () => new Date().toISOString() }),
  {
    engineVersion: ENGINE_VERSION,
    evaluationPolicy: 'conservative-v1',
    assumeFuturePass: true,
    searchOptions: SEARCH_POLICY,
  },
);

const services = Object.freeze({ ...guestServices, account: createAccountPorts({
  url: import.meta.env.VITE_SUPABASE_URL,
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
}, browserRecoveryStores()) });

export function App() {
  return <PathCheckWorkflow services={services} />;
}
