// Diagnostic allowlist: never return Google's raw error text, headers or echoed inputs.
export function providerErrorSummary(body) {
  const error = body && typeof body === 'object' ? body.error : null;
  const message = typeof error?.message === 'string' ? error.message : '';
  const statuses = new Set(['INVALID_ARGUMENT', 'PERMISSION_DENIED', 'UNAUTHENTICATED', 'NOT_FOUND', 'FAILED_PRECONDITION', 'RESOURCE_EXHAUSTED']);
  const reasons = new Set(['API_KEY_INVALID', 'API_KEY_SERVICE_BLOCKED', 'API_KEY_HTTP_REFERRER_BLOCKED', 'API_KEY_IP_ADDRESS_BLOCKED', 'SERVICE_DISABLED', 'BILLING_DISABLED']);
  const details = Array.isArray(error?.details) ? error.details : [];
  const knownFields = new Set(['generate_content_request', 'contents', 'model', 'system_instruction',
    'generation_config', 'generation_config.response_json_schema', 'generation_config.response_mime_type',
    'generation_config.max_output_tokens']);
  const fields = details.flatMap(d => Array.isArray(d?.fieldViolations) ? d.fieldViolations : [])
    .map(v => v?.field).filter(f => knownFields.has(f));
  const category = /API key not valid/i.test(message) ? 'invalid_key'
    : /(?:user )?location is not supported|unsupported.{0,20}(?:region|location)|not available in your (?:country|region)/i.test(message) ? 'unsupported_request_location'
    : /billing|paid tier|free tier/i.test(message) ? 'billing_or_tier_restriction'
    : /not found|not supported for generateContent|model.{0,30}unavailable/i.test(message) ? 'model_access_restriction'
    : /too many states|schema.{0,80}complex/i.test(message) ? 'schema_complexity'
    : /unknown name|cannot find field|invalid JSON payload/i.test(message) ? 'invalid_payload_fields'
    : /schema/i.test(message) ? 'schema_validation'
    : /token/i.test(message) ? 'token_request_validation' : 'unclassified';
  return { apiStatus: statuses.has(error?.status) ? error.status : 'unclassified', category,
    reasons: details.map(d => d?.reason).filter(r => reasons.has(r)), fields,
    signals: { location: /location|region|country/i.test(message), document: /pdf|document|mime|file/i.test(message),
      model: /model/i.test(message), quota: /quota|limit|exhaust/i.test(message), content: /content|instruction|safety/i.test(message) } };
}

export async function readBoundedJson(response, limit = 2000000) {
  const fail = reason => Object.assign(new Error(reason), { safeReason: reason });
  const reader = response.body?.getReader();
  if (!reader) throw fail('empty_provider_response');
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw fail('provider_response_size_limit'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw fail('invalid_provider_json'); }
}
