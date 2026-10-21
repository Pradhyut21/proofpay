import { environment } from "@/lib/proofpay/config";
import { ownerPasswordConfigured, validOwnerCredentials } from "@/lib/proofpay/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
  if (environment().PROOFPAY_HOSTING !== "vercel") return new Response(null, { status: 307, headers: { ...headers, Location: "/signin-with-chatgpt?return_to=%2F" } });
  if (!ownerPasswordConfigured()) return new Response("Set a private PROOFPAY_OWNER_PASSWORD of at least 32 characters in your deployment environment, then redeploy.", { status: 503, headers });
  if (validOwnerCredentials(request)) return new Response(null, { status: 303, headers: { ...headers, Location: "/" } });
  return new Response("Owner sign-in required. Username: owner. Use the private password configured in your deployment. Close the browser session when finished on a shared computer.", { status: 401, headers: { ...headers, "WWW-Authenticate": 'Basic realm="ProofPay seller", charset="UTF-8"' } });
}
