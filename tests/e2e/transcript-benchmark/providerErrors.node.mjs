import { it } from 'node:test';
import assert from 'node:assert/strict';
import { providerErrorSummary, readBoundedJson } from './providerErrors.mjs';
it('classifies schema failures without returning echoed secret or document content', () => {
  const summary = providerErrorSummary({ error: { status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload received: PRIVATE_SENTINEL',
    details: [{ reason: 'PRIVATE_SENTINEL', fieldViolations: [{ field: 'generate_content_request', description: 'PRIVATE_SENTINEL' }] }] } });
  assert.equal(summary.category, 'invalid_payload_fields');
  assert.equal(JSON.stringify(summary).includes('PRIVATE_SENTINEL'), false);
  assert.deepEqual(summary.fields, ['generate_content_request']);
});
it('never preserves arbitrary identifier-shaped field paths', () => {
  const summary = providerErrorSummary({ error: { details: [null, { fieldViolations: [null,
    { field: 'private_sentinel_123' }, { field: 'contents.private_sentinel_123' }, { field: 'contents' }] }] } });
  assert.deepEqual(summary.fields, ['contents']);
  assert.equal(JSON.stringify(summary).includes('private_sentinel'), false);
});
it('bounds error bodies and cancels an oversized stream', async () => {
  let cancelled = false;
  const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(9)); }, cancel() { cancelled = true; } });
  await assert.rejects(readBoundedJson(new Response(body, { status: 400 }), 8), { safeReason: 'provider_response_size_limit' });
  assert.equal(cancelled, true);
});
it('parses bounded error JSON and never echoes malformed body contents', async () => {
  assert.deepEqual(await readBoundedJson(new Response('{"error":{"status":"INVALID_ARGUMENT"}}', { status: 400 })), { error: { status: 'INVALID_ARGUMENT' } });
  await assert.rejects(readBoundedJson(new Response('private_sentinel_123')), { message: 'invalid_provider_json' });
});
it('rejects arbitrary error status, field text and malformed response bodies', () => {
  assert.equal(providerErrorSummary(null).category, 'unclassified');
  assert.equal(JSON.stringify(providerErrorSummary({ error: { status: 'PRIVATE_SENTINEL', details: [{ fieldViolations: [{ field: 'private text or key' }] }] } })).includes('private'), false);
});
it('identifies an unsupported request location without exposing raw server text', () => {
  assert.equal(providerErrorSummary({ error: { message: 'User location is not supported for the API use.' } }).category, 'unsupported_request_location');
});
