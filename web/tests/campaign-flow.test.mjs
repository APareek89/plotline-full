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


test('the current legacy escalation exposes only its explicitly offered Retry', () => {
  const failure = agent('failed', 4, null);
  failure.envelope.artifacts = [{ id: 'error', type: 'escalation', title: 'Step failed', payload: { reason: 'A dependency was unavailable.' }, actions: [
    { id: 'retry', label: 'Retry', event: 'retry', style: 'primary' },
    { id: 'approve', label: 'Approve', event: 'approve_brief', style: 'primary' },
  ] }];
  const offered = latestCampaignQuestion([failure]);
  assert.equal(offered?.msgId, 'failed');
  assert.deepEqual(offered?.q.options, [{ label: 'Retry', event: 'retry', artifact_id: 'error', primary: true }]);
  assert.match(offered.q.note, /charged/);
  assert.equal(latestCampaignQuestion([failure, agent('new-status', 5, null)]), null);
  assert.equal(latestCampaignQuestion([failure, { id: 'user-retry', seq: 5, role: 'user', envelope: { action: { event: 'retry' } }, created_at: 5 }]), null);
  const canonical = question([{ label: 'Current action', event: 'approve_brief', artifact_id: 'brief', primary: true }]);
  failure.envelope.question = canonical;
  assert.equal(latestCampaignQuestion([failure])?.q, canonical, 'the current server question takes precedence');
});

test('cards without an explicit escalation retry cannot manufacture a recovery button', () => {
  const turn = agent('ordinary', 1, null);
  turn.envelope.artifacts = [{ id: 'brief', type: 'campaign_brief', title: 'Brief', payload: {}, actions: [{ id: 'retry', label: 'Retry', event: 'retry', style: 'primary' }] }];
  assert.equal(latestCampaignQuestion([turn]), null);
  turn.envelope.artifacts[0].type = 'escalation';
  turn.envelope.artifacts[0].actions = [{ id: 'regen', label: 'Regenerate', event: 'regenerate_brief', style: 'primary' }];
  assert.equal(latestCampaignQuestion([turn]), null);
});
