// Applies the exact checked-in SQL once using a checksum and an atomic transaction.
// Protocol: https://github.com/tursodatabase/libsql/blob/main/docs/HTTP_V2_SPEC.md
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const migrationId = '0000_faithful_rawhide_kid';
const migrationUrl = new URL('../drizzle/0000_faithful_rawhide_kid.sql', import.meta.url);
const safeFailure = () => Error('Database migration could not be confirmed. Check server credentials/connectivity, then rerun to inspect its tracked state. Provider details are intentionally omitted.');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function endpoint(config) {
  if (!config.TURSO_DATABASE_URL || !config.TURSO_AUTH_TOKEN?.trim()) throw Error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN privately before migrating.');
  try {
    const url = new URL(config.TURSO_DATABASE_URL.replace(/^(?:libsql|turso):\/\//, 'https://'));
    const localTest = config.allowHttpForLocalTesting === true && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((!localTest && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) throw Error();
    return `${url.origin}/v2/pipeline`;
  } catch { throw Error('Use a libsql://, turso:// or HTTPS database base URL without embedded credentials or query parameters.'); }
}

export async function migrateTurso(config = process.env, fetcher = globalThis.fetch) {
  const url = endpoint(config);
  const sql = await readFile(migrationUrl, 'utf8');
  // Git may check out CRLF on Windows and LF on Vercel; that is the same SQL.
  const checksum = createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
  const statements = sql.split('--> statement-breakpoint').map(text => text.trim()).filter(Boolean);
  async function request(operation) {
    try {
      const response = await fetcher(url, {
        method: 'POST', redirect: 'error', cache: 'no-store',
        headers: { Authorization: `Bearer ${config.TURSO_AUTH_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ baton: null, requests: [operation, { type: 'close' }] }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw safeFailure();
      const body = await response.json();
      const [first, close] = body?.results || [];
      if (!Array.isArray(body?.results) || body.results.length !== 2 || first?.type !== 'ok' || first.response?.type !== operation.type || close?.type !== 'ok' || close.response?.type !== 'close' || !object(first.response.result)) throw safeFailure();
      return first.response.result;
    } catch { throw safeFailure(); }
  }
  const stmt = (sql, args = [], want_rows = false) => ({ sql, args, want_rows });
  await request({ type: 'execute', stmt: stmt('CREATE TABLE IF NOT EXISTS proofpay_schema_migrations (id TEXT PRIMARY KEY NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)') });
  const existing = await request({ type: 'execute', stmt: stmt('SELECT checksum FROM proofpay_schema_migrations WHERE id = ?', [{ type: 'text', value: migrationId }], true) });
  if (!Array.isArray(existing.rows)) throw safeFailure();
  if (existing.rows.length) {
    if (existing.rows.length !== 1 || existing.rows[0]?.[0]?.type !== 'text' || existing.rows[0][0].value !== checksum) throw Error('Migration checksum differs from the recorded schema. Stop and inspect the database migration history before changing it.');
    return { status: 'already_applied', migration: migrationId, statements: statements.length };
  }
  const steps = [{ stmt: stmt('BEGIN IMMEDIATE') }];
  for (const statement of statements) steps.push({ condition: { type: 'ok', step: steps.length - 1 }, stmt: stmt(statement) });
  steps.push({ condition: { type: 'ok', step: steps.length - 1 }, stmt: stmt('INSERT INTO proofpay_schema_migrations (id, checksum, applied_at) VALUES (?, ?, ?)', [migrationId, checksum, new Date().toISOString()].map(value => ({ type: 'text', value }))) });
  const commitStep = steps.length;
  steps.push({ condition: { type: 'ok', step: commitStep - 1 }, stmt: stmt('COMMIT') });
  steps.push({ condition: { type: 'and', conds: [{ type: 'ok', step: 0 }, { type: 'not', cond: { type: 'ok', step: commitStep } }] }, stmt: stmt('ROLLBACK') });
  const result = await request({ type: 'batch', batch: { steps } });
  if (!Array.isArray(result.step_results) || !Array.isArray(result.step_errors) || result.step_results.length !== steps.length || result.step_errors.length !== steps.length || result.step_errors.some(Boolean) || !result.step_results[commitStep]) throw safeFailure();
  return { status: 'applied', migration: migrationId, statements: statements.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Existing process variables win. Load the more specific local file first.
  for (const file of ['.env.local', '.env']) if (existsSync(file)) process.loadEnvFile(file);
  try { console.log(JSON.stringify(await migrateTurso())); }
  catch (error) { console.error(error instanceof Error ? error.message : 'Database migration failed.'); process.exitCode = 1; }
}
