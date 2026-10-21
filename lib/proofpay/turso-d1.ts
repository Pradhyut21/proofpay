import { AppError } from "./errors";

export interface TursoConfiguration {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  /** Test harnesses only. Production database requests always use HTTPS. */
  allowHttpForLocalTesting?: boolean;
}

export interface TursoStatement {
  bind(...values: unknown[]): TursoStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ success: true; meta: { changes: number } }>;
}

/** The D1 subset used by ProofPay's store, not a general Drizzle D1 driver. */
export interface TursoD1Database { prepare(sql: string): TursoStatement }

type WireValue = { type: "null" } | { type: "integer" | "text"; value: string } | { type: "float"; value: number };
type RecordValue = Record<string, unknown>;
const unavailable = () => new AppError(503, "DATABASE_UNAVAILABLE", "Workspace storage could not be reached or returned an invalid response. Check its server configuration and try again.");

function object(value: unknown): value is RecordValue { return value !== null && typeof value === "object" && !Array.isArray(value); }

function endpoint(config: TursoConfiguration): string {
  if (!config.TURSO_DATABASE_URL || !config.TURSO_AUTH_TOKEN?.trim()) {
    throw new AppError(503, "DATABASE_UNAVAILABLE", "Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN on the server and apply the included database migration.");
  }
  try {
    const url = new URL(config.TURSO_DATABASE_URL.replace(/^(?:libsql|turso):\/\//, "https://"));
    const localTest = config.allowHttpForLocalTesting === true && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((!localTest && url.protocol !== "https:") || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) throw Error();
    return `${url.origin}/v2/pipeline`;
  } catch { throw new AppError(503, "DATABASE_UNAVAILABLE", "Use the database's libsql://, turso:// or HTTPS base URL without embedded credentials or query parameters."); }
}

function encode(value: unknown): WireValue {
  if (value === null) return { type: "null" };
  if (typeof value === "string") return { type: "text", value };
  if (typeof value === "number" && Number.isFinite(value)) {
    if (Number.isInteger(value)) {
      if (!Number.isSafeInteger(value)) throw new TypeError("Database integer bindings must be safe integers.");
      return { type: "integer", value: String(value) };
    }
    return { type: "float", value };
  }
  throw new TypeError("Database bindings must be strings, finite numbers or null.");
}

function decode(value: unknown): string | number | null {
  if (!object(value)) throw unavailable();
  if (value.type === "null") return null;
  if (value.type === "text" && typeof value.value === "string") return value.value;
  if (value.type === "integer" && typeof value.value === "string" && /^-?\d+$/.test(value.value)) {
    const decoded = Number(value.value);
    // Never round a revision or amount that could alter compare-and-swap behavior.
    if (Number.isSafeInteger(decoded)) return decoded;
  }
  if (value.type === "float" && typeof value.value === "number" && Number.isFinite(value.value)) return value.value;
  throw unavailable();
}

export function createTursoD1(config: TursoConfiguration, fetcher: typeof fetch = globalThis.fetch): TursoD1Database {
  const url = endpoint(config);
  const authorization = `Bearer ${config.TURSO_AUTH_TOKEN}`;
  async function execute(sql: string, args: WireValue[], wantRows: boolean) {
    let body: unknown;
    try {
      const response = await fetcher(url, {
        method: "POST", redirect: "error", cache: "no-store",
        headers: { Authorization: authorization, "Content-Type": "application/json" },
        body: JSON.stringify({ baton: null, requests: [{ type: "execute", stmt: { sql, args, want_rows: wantRows } }, { type: "close" }] }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw unavailable();
      body = await response.json();
    } catch { throw unavailable(); }
    if (!object(body) || !Array.isArray(body.results) || body.results.length !== 2) throw unavailable();
    const [statement, close] = body.results;
    if (!object(statement) || statement.type !== "ok" || !object(statement.response) || statement.response.type !== "execute" || !object(statement.response.result) || !object(close) || close.type !== "ok" || !object(close.response) || close.response.type !== "close") throw unavailable();
    const result = statement.response.result;
    if (!Array.isArray(result.cols) || !Array.isArray(result.rows) || !Number.isSafeInteger(result.affected_row_count) || Number(result.affected_row_count) < 0) throw unavailable();
    return result;
  }
  function prepare(sql: string, args: WireValue[] = []): TursoStatement {
    if (!sql.trim()) throw new TypeError("A database statement is required.");
    return {
      bind(...values) { return prepare(sql, values.map(encode)); },
      async first<T>() {
        const result = await execute(sql, args, true);
        const columns = result.cols as unknown[];
        const rows = result.rows as unknown[];
        if (!rows.length) return null;
        const row = rows[0];
        if (!Array.isArray(row) || row.length !== columns.length) throw unavailable();
        const entries = columns.map((column, index) => {
          if (!object(column) || typeof column.name !== "string") throw unavailable();
          return [column.name, decode(row[index])] as const;
        });
        return Object.fromEntries(entries) as T;
      },
      async run() {
        const result = await execute(sql, args, false);
        return { success: true, meta: { changes: Number(result.affected_row_count) } };
      },
    };
  }
  return { prepare };
}
