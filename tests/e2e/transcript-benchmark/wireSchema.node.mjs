import { it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { toProviderWireSchema } from './wireSchema.mjs';
const shape = z.strictObject({ rows: z.array(z.strictObject({ code: z.string() })).max(1000),
  unrecognizedRows: z.array(z.string()).max(1000), coveredPages: z.array(z.number().int()).max(20) });
it('changes only the two large wire array bounds while preserving every structural constraint', () => {
  const original = z.toJSONSchema(shape);
  const expected = structuredClone(original);
  delete expected.properties.rows.maxItems;
  delete expected.properties.unrecognizedRows.maxItems;
  assert.deepEqual(toProviderWireSchema(original), expected);
  assert.equal(original.properties.rows.maxItems, 1000);
  assert.equal(original.properties.unrecognizedRows.maxItems, 1000);
});
it('still rejects oversized provider results under the unchanged runtime schema', () => {
  toProviderWireSchema(z.toJSONSchema(shape));
  assert.equal(shape.safeParse({ rows: Array.from({ length: 1001 }, () => ({ code: 'SYN 101' })), unrecognizedRows: [], coveredPages: [1] }).success, false);
  assert.equal(shape.safeParse({ rows: [], unrecognizedRows: Array(1001).fill('unreadable'), coveredPages: [1] }).success, false);
});
it('fails closed if benchmark array constraints drift', () => {
  assert.throws(() => toProviderWireSchema({ properties: {} }), /unexpected_benchmark_schema/);
});
