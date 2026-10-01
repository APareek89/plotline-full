import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignStartProblem, campaignNameFromPrompt, latestCampaignQuestion, campaignArtifactForReview } from '../lib/client/campaign-flow.ts';

const question = (options = []) => ({ text: 'Approve the brief or describe a change?', options, multi: false, free_text: true, note: null });
const agent = (id, seq, q) => ({ id, seq, role: 'agent', envelope: { text: 'Ready to review.', artifacts: [], question: q }, created_at: seq });

test('a photo and one line start without a campaign name, brand, audience or channel form', () => {
  assert.equal(campaignStartProblem('Summer campaign for this T-shirt', ['upload-1']), null);
  assert.match(campaignStartProblem('Summer campaign', []), /product image/);
  assert.match(campaignStartProblem('  ', ['upload-1']), /one line/);
  assert.equal(campaignNameFromPrompt('  Summer\n campaign  '), 'Summer campaign');
  assert.equal(campaignNameFromPrompt('Summer campaign', ['Summer campaign', 'SUMMER CAMPAIGN (2)']), 'Summer campaign (3)');
  assert.ok(campaignNameFromPrompt('x'.repeat(300)).length <= 120);
});

test('a newer status or failed turn never resurrects an old Start or approval question', () => {
  const old = agent('intake', 1, question([{ label: 'Start', event: 'begin', artifact_id: 'intake', primary: true }]));
  assert.equal(latestCampaignQuestion([old])?.msgId, 'intake');
  const status = agent('status', 2, null);
  assert.equal(latestCampaignQuestion([old, status]), null);
  assert.equal(latestCampaignQuestion([old, { id: 'answer', seq: 2, role: 'user', envelope: { text: 'Begin' }, created_at: 2 }]), null);
  const next = agent('brief', 3, question([{ label: 'Approve brief', event: 'approve_brief', artifact_id: 'brief', primary: true }]));
  assert.equal(latestCampaignQuestion([old, status, next])?.msgId, 'brief');
});

test('saved cards offer only exact artifact/event pairs in the current server question', () => {
  const old = { id: 'intake', type: 'intake_progress', title: 'Old intake', payload: {}, actions: [{ id: 'start', label: 'Start', event: 'begin', style: 'primary', spends: false }] };
  const current = { id: 'brief', type: 'campaign_brief', title: 'Brief', payload: {}, actions: [
    { id: 'approve', label: 'Approve brief', event: 'approve_brief', style: 'primary', spends: false },
    { id: 'regen', label: 'Regenerate', event: 'regenerate_brief', style: 'secondary', spends: true },
  ] };
  const ask = question([{ label: 'Approve brief', event: 'approve_brief', artifact_id: 'brief', primary: true }]);
  assert.deepEqual(campaignArtifactForReview(old, ask).actions, []);
  assert.deepEqual(campaignArtifactForReview(current, ask).actions.map(a => a.event), ['approve_brief']);
  assert.deepEqual(campaignArtifactForReview(current, null).actions, []);
  assert.equal(current.actions.length, 2, 'filtering a view does not mutate stored history');
});
