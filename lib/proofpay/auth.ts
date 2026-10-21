import { AppError, invariant } from "./errors";
import { createHash, timingSafeEqual } from "node:crypto";
import { environment } from "./config";

export function ownerPasswordConfigured(): boolean {
  return (environment().PROOFPAY_OWNER_PASSWORD?.length || 0) >= 32;
}

export function validOwnerCredentials(request: Request): boolean {
  if (environment().PROOFPAY_HOSTING !== "vercel" || !ownerPasswordConfigured()) return false;
  const authorization = request.headers.get("authorization") || "";
  if (authorization.length > 4096 || !/^Basic [A-Za-z0-9+/]+=*$/.test(authorization)) return false;
  const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator < 0 || decoded.slice(0, separator) !== "owner") return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(decoded.slice(separator + 1)), digest(environment().PROOFPAY_OWNER_PASSWORD!));
}

export function isLoopback(request: Request): boolean {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

export function sellerIdentity(request: Request): string {
  if (environment().PROOFPAY_HOSTING === "vercel") {
    // Public requests may forge Sites headers or a loopback Host. Neither grants
    // seller access in this runtime; only the server-configured owner credential does.
    if (validOwnerCredentials(request)) return "vercel:owner";
    throw new AppError(401, "SIGN_IN_REQUIRED", "Sign in to open your private seller workspace.");
  }
  // Sites dispatch strips client-supplied identity headers and injects the authenticated identity.
  // These headers are only trusted behind Sites dispatch (or loopback development).
  const userId = request.headers.get("oai-authenticated-user-id");
  if (userId && /^[A-Za-z0-9_.:@|\-]{1,200}$/.test(userId)) return `sites:${userId}`;
  if (isLoopback(request)) return "local:proofpay-demo";
  throw new AppError(401, "SIGN_IN_REQUIRED", "Sign in with ChatGPT to open your private seller workspace.");
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  invariant(!origin || origin === new URL(request.url).origin, 403, "INVALID_ORIGIN", "This action must start from ProofPay.");
  const fetchSite = request.headers.get("sec-fetch-site");
  invariant(fetchSite !== "cross-site", 403, "INVALID_ORIGIN", "This action must start from ProofPay.");
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
}

export function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
}
