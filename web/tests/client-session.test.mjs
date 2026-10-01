import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientSession, accountChangeNotice, clearOwnerDrafts, ownerKey, performAuth } from '../lib/client/session.ts';

const account = (id) => ({ enabled: true, user: { id, email: `${id}@example.test` }, csrf: `csrf-${id}` });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const aborted = (error) => error instanceof Error && error.name === 'AbortError';

test('a response body from A cannot update B after an account change', async () => {
  const body = deferred(); let expired = 0;
  const client = createClientSession(async () => ({ ok: true, status: 200, json: () => body.promise }), () => expired++);
  client.accept(account('A')); const request = client.request('/api/campaigns');
  await Promise.resolve(); client.accept(account('B')); body.resolve({ private: 'A' });
  await assert.rejects(request, aborted); assert.equal(client.owner(), 'B'); assert.equal(expired, 0);
});
test('late A401 does not sign out B, including a delayed error body', async () => {
  const body = deferred(); let expired = 0;
  const client = createClientSession(async () => ({ ok: false, status: 401, json: () => body.promise }), () => expired++);
  client.accept(account('A')); const request = client.request('/api/canon');
  await Promise.resolve(); client.accept(account('B')); body.resolve({ error: 'authentication_required' });
  await assert.rejects(request, aborted); assert.equal(expired, 0); assert.equal(client.owner(), 'B');
});
test('current401 expires session and aborts another pending read', async () => {
  const pending = deferred(); let observed = null; let expired = 0;
  const client = createClientSession(async (path, init) => {
    if (path === '/api/slow') { observed = init?.signal ?? null; return pending.promise; }
    return new Response(JSON.stringify({ error: 'authentication_required' }), { status: 401 });
  }, () => expired++);
  client.accept(account('A')); const slow = client.request('/api/slow');
  await assert.rejects(client.request('/api/canon'), aborted);
  assert.equal(expired, 1); assert.equal(client.owner(), null); assert.equal(observed.aborted, true);
  pending.resolve(new Response('{}')); await assert.rejects(slow, aborted);
});
test('blob download body and queued upload loop retain the original account generation', async () => {
  const bytes = deferred(); let calls = 0;
  const client = createClientSession(async () => { calls++; return { ok: true, status: 200, blob: () => bytes.promise }; });
  client.accept(account('A')); const epoch = client.capture(); const download = client.request('/api/assets/A/file', {}, epoch, 'blob');
  await Promise.resolve(); client.accept(account('B')); bytes.resolve(new Blob(['A bytes']));
  await assert.rejects(download, aborted); await assert.rejects(client.request('/api/uploads', { method: 'POST' }, epoch), aborted);
  assert.equal(calls, 1);
});
test('multipart uses same-origin cookies and session CSRF without overriding browser boundary', async () => {
  let options;
  const client = createClientSession(async (_path, init) => { options = init; return new Response('{"id":"upload"}'); });
  client.accept(account('A')); const body = new FormData(); body.append('file', new Blob(['fixture']), 'sample.txt');
  await client.request('/api/uploads', { method: 'POST', body });
  assert.equal(options?.credentials, 'same-origin');
  assert.equal(new Headers(options?.headers).get('X-Plotline-CSRF'), 'csrf-A');
  assert.equal(new Headers(options?.headers).has('Content-Type'), false);
});
test('owner draft cleanup cannot adopt or remove legacy and other-account drafts', () => {
  const data = new Map([[ownerKey('A', 'draft', 'one'), 'A'], [ownerKey('B', 'draft', 'one'), 'B'], ['plotline.draft.one', 'legacy']]);
  const storage = { get length() { return data.size; }, key: (i) => [...data.keys()][i] ?? null, removeItem: (key) => { data.delete(key); } };
  clearOwnerDrafts(storage, 'A'); assert.deepEqual([...data.values()], ['B', 'legacy']);
});
test('Auth.js return-redirect contract rejects wrong password even on HTTP200', async () => {
  let calls = 0; const fetcher = async (_path, init) => {
    if (++calls === 1) return new Response('{"csrfToken":"fixture-token"}');
    assert.equal(new Headers(init?.headers).get('X-Auth-Return-Redirect'), '1'); assert.equal(init?.redirect, 'error');
    return new Response('{"url":"https://app.example.test/api/auth/error?error=CredentialsSignin"}');
  };
  await assert.rejects(performAuth('callback/credentials', { email: 'a@example.test', password: 'fake-password' }, 'https://app.example.test', fetcher), /not accepted/);
  assert.equal(calls, 2);
});
test('a session refresh body arriving after B login cannot restore A', async () => {
  const body = deferred(); const client = createClientSession(async () => ({ ok: true, json: () => body.promise }));
  client.accept(account('A')); const refresh = client.read(); await Promise.resolve(); client.accept(account('B')); body.resolve(account('A'));
  await assert.rejects(refresh, aborted); assert.equal(client.owner(), 'B');
});

test('cross-tab account notice hides A and fences its response before the session refresh completes', async () => {
  const response = deferred(); let hidden = false; let refreshStarted = false;
  const client = createClientSession(async () => response.promise);
  client.accept(account('A')); const pending = client.request('/api/campaigns');
  accountChangeNotice({ key: 'plotline-account-change' }, client, () => { hidden = true; }, () => { assert.equal(hidden, true); refreshStarted = true; });
  assert.equal(hidden, true); assert.equal(refreshStarted, true); assert.equal(client.owner(), null);
  response.resolve(new Response('{"private":"A"}')); await assert.rejects(pending, aborted);
  client.accept(account('B')); assert.equal(client.owner(), 'B');
});
