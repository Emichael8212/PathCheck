/** Stops awaiting work when its request is cancelled. The underlying I/O must also
 * receive the same signal; this does not claim to interrupt synchronous PDF parsing. */
export function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { work.catch(() => undefined); reject(new Error('request_cancelled')); return; }
    const cancelled = () => { reject(new Error('request_cancelled')); };
    signal.addEventListener('abort', cancelled, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancelled));
  });
}
