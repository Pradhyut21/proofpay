// Next.js-only replacement for cloudflare:workers. Storage stays external.
import { createTursoD1 } from "./turso-d1";

let cached: { url: string; token: string; db: ReturnType<typeof createTursoD1> } | undefined;

function databaseBinding() {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url || !token) return undefined;
  if (!cached || cached.url !== url || cached.token !== token) {
    cached = { url, token, db: createTursoD1({ TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: token }) };
  }
  return cached.db;
}

export const env = new Proxy<Record<string, unknown>>({}, {
  get(_target, property) {
    if (property === "PROOFPAY_HOSTING") return "vercel";
    if (property === "DB") return databaseBinding();
    return typeof property === "string" ? process.env[property] : undefined;
  },
});
