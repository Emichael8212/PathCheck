import { it } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { createLiveFixture, expectedAttempt } from './liveFixture.mjs';
it('produces a reproducible single-page synthetic fixture independent of provider output', async () => {
  const first = await createLiveFixture(), second = await createLiveFixture();
  assert.equal(first.digest, second.digest);
  assert.equal((await PDFDocument.load(first.bytes)).getPageCount(), 1);
  assert.equal(expectedAttempt.rawCourseCode, 'SYN 101');
  assert.equal(expectedAttempt.rawEarnedCredits, '3');
  assert.equal(first.bytes.length < 10000, true);
});
