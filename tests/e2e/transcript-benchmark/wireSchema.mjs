// Large repeated-object array bounds expand Gemini's decoding grammar and can
// reject an otherwise valid request. Retain all fields/types/required keys here;
// the original Zod schema still enforces both 1,000-item limits after generation.
// This transport-only conversion does not change shared extraction contracts.
export function toProviderWireSchema(schema) {
  const wire = structuredClone(schema);
  for (const field of ['rows', 'unrecognizedRows']) {
    if (wire.properties?.[field]?.maxItems !== 1000) throw new Error('unexpected_benchmark_schema');
    delete wire.properties[field].maxItems;
  }
  return wire;
}
