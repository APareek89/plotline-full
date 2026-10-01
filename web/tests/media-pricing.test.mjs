import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaCost, sampleMedia, recordedCredits } from '../lib/client/media-pricing.ts';

test('only recorded sample provenance claims zero provider cost; ordinary unknowns stay unverified', () => {
  assert.equal(mediaCost(.08, {sample_media:true}), 'Sample · $0');
  assert.equal(mediaCost(.08, {billing_status:'sample'}), 'Sample · $0');
  assert.equal(mediaCost(.08, {provider:'sample'}), 'Sample · $0');
  assert.equal(mediaCost(0, {provider:'pixelbin'}), 'USD cost unverified');
  assert.equal(mediaCost(undefined, {model:'fal-ai/example'}), 'USD cost unverified');
  assert.equal(sampleMedia({cached:true}), false); // caching alone does not establish media provenance
  assert.equal(mediaCost(.08, {provider:'pixelbin'}), 'USD cost unverified');
  assert.equal(mediaCost(.08, {billing_status:'usd_unverified'}), 'USD cost unverified');
  assert.equal(mediaCost(.08, {model:'pixelbin:nano-banana'}), 'USD cost unverified');
  assert.equal(mediaCost(.08, {provider:'fal'}), 'Est. $0.08 · USD unverified');
  assert.equal(recordedCredits(undefined), null);
  assert.equal(recordedCredits('3'), '3 provider credits recorded');
  assert.equal(recordedCredits('3.125'), '3.125 provider credits recorded');
  assert.equal(recordedCredits(null), null);
  assert.equal(recordedCredits('unknown'), null);
  assert.equal(recordedCredits('3 credits'), null);
  assert.equal(recordedCredits('100000000000000000000'), null);
  assert.equal(recordedCredits(-1), null);
  assert.equal(recordedCredits(12), '12 provider credits recorded');
});
