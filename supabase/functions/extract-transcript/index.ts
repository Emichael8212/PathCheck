import { startTranscriptFunction } from './entry';
import type { FunctionServer } from './entry';
import { hostBindings } from './hostBindings';
export { createFunctionEntry, startTranscriptFunction } from './entry';

declare const Deno: FunctionServer;
startTranscriptFunction(Deno, hostBindings);
