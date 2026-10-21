import { AppError, invariant } from "./errors";

export function isLoopback(request: Request): boolean {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

export function sellerIdentity(request: Request): string {
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
