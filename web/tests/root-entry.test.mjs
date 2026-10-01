import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Run after PLOTLINE_DIST_DIR=.next-integrated npm run build. No account,
// database or provider environment is passed to this isolated HTTP server.
test('production root redirects before rendering the account-gated RSC page', { timeout: 30_000 }, async () => {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));

  const web = fileURLToPath(new URL('../', import.meta.url));
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: web,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      PLOTLINE_DIST_DIR: '.next-integrated',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.resume();
  child.stderr.resume();
  const exited = once(child, 'exit');
  const origin = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error('Isolated production server exited before readiness');
      try {
        const response = await fetch(origin, { redirect: 'manual', signal: AbortSignal.timeout(500) });
        await response.body?.cancel();
        ready = true;
        break;
      } catch { await delay(100); }
    }
    assert.equal(ready, true, 'isolated compiled server must listen');
    for (const [path, headers] of [['/', {}], ['/?entry=portfolio', {}], ['/', { RSC: '1' }]]) {
      const response = await fetch(`${origin}${path}`, { headers, redirect: 'manual', signal: AbortSignal.timeout(2_000) });
      assert.equal(response.status, 307, 'root is an HTTP redirect, never delayed page rendering');
      assert.equal(new URL(response.headers.get('location'), origin).pathname, '/studio/campaign');
      assert.equal(new URL(response.headers.get('location'), origin).search, path.includes('?') ? '?entry=portfolio' : '');
      await response.body?.cancel();
    }
    const studio = await fetch(`${origin}/studio/campaign`, { redirect: 'manual', signal: AbortSignal.timeout(5_000) });
    assert.equal(studio.status, 200, 'the destination still serves the account shell');
    assert.match(await studio.text(), /Plotline/);
  } finally {
    child.kill('SIGTERM');
    const stopped = await Promise.race([exited.then(() => true), delay(3_000).then(() => false)]);
    if (!stopped) { child.kill('SIGKILL'); await exited; }
  }
});
