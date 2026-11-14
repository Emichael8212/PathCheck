import type { TranscriptBindingSource } from './entry';

/** No approved hosted ingress/parser composition exists yet. This is deliberately
 * not an environment-selected module or a synthetic/local processing switch.
 * L/G must replace this static binding through a reviewed implementation change. */
export const hostBindings: TranscriptBindingSource = null;
