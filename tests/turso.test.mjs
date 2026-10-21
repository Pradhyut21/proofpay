import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createTursoD1 } from '../lib/proofpay/turso-d1.ts';
import { migrateTurso } from '../scripts/migrate-turso.mjs';

const config = { TURSO_DATABASE_URL: 'libsql://proofpay-test.turso.io', TURSO_AUTH_TOKEN: 'test-token' };
const encode = value => value === null ? { type: 'null' } : typeof value === 'string' ? { type: 'text', value } : Number.isInteger(value) ? { type: 'integer', value: String(value) } : { type: 'float', value };
const decode = value => value.type === 'null' ? null : value.type === 'integer' ? Number(value.value) : value.value;

// This transport executes real SQLite statements while implementing the documented
// Hrana envelope and conditional batch semantics. It does not call Turso Cloud.
function sqliteTransport(database = new DatabaseSync(':memory:')) {
  const requests = [];
  let transaction = false;
  function execute(stmt) {
    try {
      const prepared = database.prepare(stmt.sql);
      const args = (stmt.args || []).map(decode);
      const columns = prepared.columns().map(col => ({ name: col.name }));
      let rows = [], changes = 0;
      if (columns.length) {
        const values = prepared.all(...args);
        if (stmt.want_rows !== false) rows = values.map(row => columns.map(col => encode(row[col.name])));
      } else {
        changes = Number(prepared.run(...args).changes);
      }
      if (/^BEGIN\b/i.test(stmt.sql)) transaction = true;
      if (/^(?:COMMIT|ROLLBACK)\b/i.test(stmt.sql)) transaction = false;
      return { result: { cols: columns, rows, affected_row_count: changes, last_insert_rowid: null } };
    } catch (error) { return { error: { message: `private provider details: ${error.message}`, code: 'SQLITE_ERROR' } }; }
  }
  function condition(value, successes, errors) {
    if (!value) return true;
    if (value.type === 'ok') return Boolean(successes[value.step]);
    if (value.type === 'error') return Boolean(errors[value.step]);
    if (value.type === 'not') return !condition(value.cond, successes, errors);
    if (value.type === 'and') return value.conds.every(c => condition(c, successes, errors));
    if (value.type === 'or') return value.conds.some(c => condition(c, successes, errors));
    throw Error('Unexpected test protocol condition');
  }
  async function fetcher(url, init) {
    assert.equal(url, 'https://proofpay-test.turso.io/v2/pipeline');
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    assert.ok(init.signal instanceof AbortSignal);
    const body = JSON.parse(init.body);
    requests.push(body);
    const results = body.requests.map(request => {
      if (request.type === 'close') {
        if (transaction) { database.exec('ROLLBACK'); transaction = false; }
        return { type: 'ok', response: { type: 'close' } };
      }
      if (request.type === 'batch') {
        const step_results = [], step_errors = [];
        for (const step of request.batch.steps) {
          const outcome = condition(step.condition, step_results, step_errors) ? execute(step.stmt) : {};
          step_results.push(outcome.result || null);
          step_errors.push(outcome.error || null);
        }
        return { type: 'ok', response: { type: 'batch', result: { step_results, step_errors } } };
      }
      assert.equal(request.type, 'execute');
      const outcome = execute(request.stmt);
      return outcome.error ? { type: 'error', error: outcome.error } : { type: 'ok', response: { type: 'execute', result: outcome.result } };
    });
    return Response.json({ baton: null, base_url: null, results });
  }
  return { database, fetcher, requests };
}

test('Turso bindings preserve SQLite values and result rows without string interpolation', async () => {
  const remote = sqliteTransport();
  remote.database.exec('CREATE TABLE records (id INTEGER PRIMARY KEY, text TEXT, optional TEXT, ratio REAL)');
  const db = createTursoD1(config, remote.fetcher);
  const hostile = "text'); DROP TABLE records; --";
  assert.equal((await db.prepare('INSERT INTO records VALUES (?, ?, ?, ?)').bind(7, hostile, null, 1.25).run()).meta.changes, 1);
  assert.deepEqual(await db.prepare('SELECT * FROM records WHERE id = ?').bind(7).first(), { id: 7, text: hostile, optional: null, ratio: 1.25 });
  assert.equal(await db.prepare('SELECT * FROM records WHERE id = ?').bind(99).first(), null);
  assert.equal(remote.requests[0].requests[0].stmt.want_rows, false);
  assert.equal(remote.requests[1].requests[0].stmt.want_rows, true);
  assert.deepEqual(remote.requests[0].requests.map(request => request.type), ['execute', 'close']);
  assert.ok(!remote.requests[0].requests[0].stmt.sql.includes(hostile));
});

test('Turso affected rows preserve atomic revision compare-and-swap conflict detection', async () => {
  const remote = sqliteTransport();
  remote.database.exec("CREATE TABLE workspaces (owner TEXT PRIMARY KEY, revision INTEGER); INSERT INTO workspaces VALUES ('seller', 0)");
  const db = createTursoD1(config, remote.fetcher);
  const update = db.prepare('UPDATE workspaces SET revision = ? WHERE owner = ? AND revision = ?');
  assert.equal((await update.bind(1, 'seller', 0).run()).meta.changes, 1);
  assert.equal((await update.bind(1, 'seller', 0).run()).meta.changes, 0);
  assert.equal((await db.prepare('SELECT revision FROM workspaces').first()).revision, 1);
});

test('Turso configuration and bindings reject insecure or lossy values before transport', () => {
  for (const TURSO_DATABASE_URL of ['http://public.example', 'https://user:secret@db.example', 'https://db.example?token=secret', 'file:test.db', 'https://db.example/v2/pipeline']) {
    assert.throws(() => createTursoD1({ ...config, TURSO_DATABASE_URL }), error => error.status === 503 && !error.message.includes('secret'));
  }
  assert.throws(() => createTursoD1({}), /TURSO_DATABASE_URL/);
  assert.throws(() => createTursoD1({ ...config, TURSO_DATABASE_URL: 'http://127.0.0.1:1234' }), /base URL/);
  assert.doesNotThrow(() => createTursoD1({ ...config, TURSO_DATABASE_URL: 'http://127.0.0.1:1234', allowHttpForLocalTesting: true }));
  const db = createTursoD1(config, async () => { throw Error('Must not run'); });
  for (const value of [undefined, {}, true, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => db.prepare('SELECT ?').bind(value));
});

test('Turso network, provider and malformed result errors remain sanitized', async () => {
  const payload = 'private SQL and bearer token';
  const responders = [
    async () => { throw Error(payload); },
    async () => new Response(payload, { status: 401 }),
    async () => new Response('invalid json'),
    async () => Response.json({ results: [{ type: 'error', error: { message: payload } }, { type: 'ok', response: { type: 'close' } }] }),
    async () => Response.json({ results: [{ type: 'ok', response: { type: 'execute', result: { cols: [{ name: 'revision' }], rows: [[{ type: 'integer', value: '9007199254740993' }]], affected_row_count: 0 } } }, { type: 'ok', response: { type: 'close' } }] }),
  ];
  for (const responder of responders) await assert.rejects(createTursoD1(config, responder).prepare('SELECT revision FROM workspace').first(), error => error.status === 503 && error.code === 'DATABASE_UNAVAILABLE' && !error.message.includes(payload));
});

test('exact Turso migration applies atomically and a matching tracked rerun is a no-op', async () => {
  const remote = sqliteTransport();
  assert.deepEqual(await migrateTurso(config, remote.fetcher), { status: 'applied', migration: '0000_faithful_rawhide_kid', statements: 4 });
  const tables = remote.database.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row => row.name);
  assert.deepEqual(tables, ['proofpay_review_tokens', 'proofpay_schema_migrations', 'proofpay_webhook_events', 'proofpay_workspaces']);
  assert.equal(remote.database.prepare('SELECT COUNT(*) AS count FROM proofpay_schema_migrations').get().count, 1);
  assert.equal((await migrateTurso(config, remote.fetcher)).status, 'already_applied');
  assert.equal(remote.requests.filter(request => request.requests[0].type === 'batch').length, 1);
  remote.database.prepare('UPDATE proofpay_schema_migrations SET checksum = ?').run('wrong');
  await assert.rejects(migrateTurso(config, remote.fetcher), /checksum differs/);
});

test('failed Turso migration rolls back earlier DDL and does not record success', async () => {
  const remote = sqliteTransport();
  remote.database.exec('CREATE TABLE proofpay_webhook_events (existing TEXT)');
  await assert.rejects(migrateTurso(config, remote.fetcher), error => /could not be confirmed/.test(error.message) && !error.message.includes('private provider details'));
  assert.equal(remote.database.prepare("SELECT name FROM sqlite_master WHERE name = 'proofpay_review_tokens'").get(), undefined);
  assert.equal(remote.database.prepare('SELECT COUNT(*) AS count FROM proofpay_schema_migrations').get().count, 0);
  assert.deepEqual(remote.database.prepare('PRAGMA table_info(proofpay_webhook_events)').all().map(row => row.name), ['existing']);
});
