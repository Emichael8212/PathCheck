import { createHash } from 'node:crypto';
const destination = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent';
/** Last server-side guard before fetch; rejects arbitrary PDF/URI/redirect egress. */
export function guardLiveEgress(url, init, digest) {
  if (url !== destination || init?.method !== 'POST' || typeof init.body !== 'string' || init.body.length > 100000) throw Error('provider_destination_denied');
  const body = JSON.parse(init.body);
  if (!Array.isArray(body.contents) || body.contents.length !== 1 || body.contents[0].role !== 'user'
    || !Array.isArray(body.contents[0].parts) || body.contents[0].parts.length !== 1) throw Error('provider_document_denied');
  const part = body.contents[0].parts[0];
  if (Object.keys(part).length !== 1 || !part.inlineData || part.inlineData.mimeType !== 'application/pdf'
    || typeof part.inlineData.data !== 'string') throw Error('provider_document_denied');
  const bytes = Buffer.from(part.inlineData.data, 'base64');
  const valid = bytes.toString('base64') === part.inlineData.data && createHash('sha256').update(bytes).digest('hex') === digest;
  bytes.fill(0);
  if (!valid || /"(?:fileData|file_uri|fileUri)"\s*:/.test(init.body)) throw Error('provider_document_denied');
  return { ...init, redirect: 'error' };
}
