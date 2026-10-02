import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('installed pg keeps explicit verified CA across URL TLS overrides; no connection', async () => {
  const { database, closeDatabase } = await import('../server/db.js');
  const folder = await mkdtemp(join(tmpdir(), 'plotline-tls-'));
  const path = join(folder, 'fixture-ca.pem');
  await writeFile(path, 'OFFLINE_FIXTURE_CA');
  const saved = { ...process.env }, OriginalPool = pg.Pool;
  const seen = [];
  pg.Pool = class {
    constructor(options) { seen.push(new pg.Client(options).connectionParameters.ssl); }
    async connect() { return { query: async query => ({ rows: query.includes('pg_roles') ? [{ rolsuper: false, rolbypassrls: false }] : [], rowCount: 1 }), release() {} }; }
    async end() {}
  };
  try {
    for (const key of Object.keys(process.env)) if (/DATABASE_|PLOTLINE_|OPENAI|ANTHROPIC|FAL|PIXELBIN/.test(key)) delete process.env[key];
    process.env.NODE_ENV = 'test'; process.env.DATABASE_SSL_CA_FILE = path;
    for (const query of ['ssl=no-verify', 'ssl=0', 'sslmode=disable', 'sslmode=no-verify&uselibpqcompat=true', 'sSl=no-verify', '%73sl=no-verify', 'sslrootcert=/not-read&sslcert=/not-read&sslkey=/not-read', 'sslnegotiation=direct&sslmode=prefer']) {
      process.env.DATABASE_URL = 'postgresql://synthetic:fixture@db.invalid/plotline?' + query;
      await database(); await closeDatabase();
      assert.equal(seen.at(-1).rejectUnauthorized, true);
      assert.equal(seen.at(-1).ca, 'OFFLINE_FIXTURE_CA');
      assert.equal(seen.at(-1).checkServerIdentity, undefined);
    }
    assert.equal(seen.length, 8);
  } finally {
    await closeDatabase(); pg.Pool = OriginalPool;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved); await rm(folder, { recursive: true });
  }
});
