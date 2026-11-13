import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { guardLiveEgress } from './liveEgress.mjs';
const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent';
const bytes = Buffer.from('synthetic document');
const digest = createHash('sha256').update(bytes).digest('hex');
const body = () => ({ contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: bytes.toString('base64') } }] }] });
const request = value => ({ method: 'POST', body: JSON.stringify(value), redirect: 'follow' });
it('pins model/destination/document and forces redirects to fail', () => {
  assert.equal(guardLiveEgress(url, request(body()), digest).redirect, 'error');
  assert.throws(() => guardLiveEgress('https://untrusted.invalid', request(body()), digest));
  assert.throws(() => guardLiveEgress(url, request(body()), '0'.repeat(64)));
});
it('refuses additional documents, remote files and malformed payloads', () => {
  const extra = body(); extra.contents[0].parts.push(extra.contents[0].parts[0]);
  assert.throws(() => guardLiveEgress(url, request(extra), digest));
  const remote = body(); remote.contents[0].parts[0].fileData = { fileUri: 'https://untrusted.invalid/document' };
  assert.throws(() => guardLiveEgress(url, request(remote), digest));
  assert.throws(() => guardLiveEgress(url, { method: 'POST', body: '{invalid' }, digest));
});
