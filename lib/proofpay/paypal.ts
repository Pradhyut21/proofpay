import { AppError, invariant } from "./errors";
import type { Invoice, Workspace } from "./types";

export interface PayPalConfig { PAYPAL_CLIENT_ID?: string; PAYPAL_CLIENT_SECRET?: string; PAYPAL_INVOICER_EMAIL?: string; PAYPAL_WEBHOOK_ID?: string }
export interface PayPalAmount { currency_code?: string; value?: string }
export interface PayPalInvoice {
  id?: string;
  status?: string;
  detail?: { currency_code?: string; invoice_number?: string; reference?: string; metadata?: { recipient_view_url?: string } };
  amount?: PayPalAmount;
  due_amount?: PayPalAmount;
  payments?: { paid_amount?: PayPalAmount; transactions?: { type?: string; payment_id?: string; amount?: PayPalAmount; method?: string }[] };
  links?: { href: string; rel: string; method?: string }[];
}

const BASE = "https://api-m.sandbox.paypal.com";

async function accessToken(config: PayPalConfig): Promise<string> {
  invariant(config.PAYPAL_CLIENT_ID && config.PAYPAL_CLIENT_SECRET, 503, "PAYPAL_NOT_CONFIGURED", "PayPal sandbox credentials are not configured.");
  let response: Response;
  try {
    response = await fetch(`${BASE}/v1/oauth2/token`, {
      method: "POST", headers: { Authorization: `Basic ${btoa(`${config.PAYPAL_CLIENT_ID}:${config.PAYPAL_CLIENT_SECRET}`)}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials", signal: AbortSignal.timeout(15000),
    });
  } catch { throw new AppError(502, "PAYPAL_UNREACHABLE", "PayPal sandbox is not responding. Try again shortly."); }
  if (!response.ok) throw new AppError(502, "PAYPAL_AUTH_FAILED", "PayPal sandbox authentication failed. Check the seller configuration.");
  const result = await response.json() as { access_token?: string };
  invariant(result.access_token, 502, "PAYPAL_AUTH_FAILED", "PayPal did not return a sandbox access token.");
  return result.access_token;
}

async function api<T>(config: PayPalConfig, path: string, method = "GET", body?: unknown, requestId?: string): Promise<T> {
  const token = await accessToken(config);
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation", ...(requestId ? { "PayPal-Request-Id": requestId } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
  } catch { throw new AppError(502, "PAYPAL_UNCERTAIN", "PayPal did not confirm this operation. The saved request will be reused on retry; do not create another invoice manually."); }
  if (!response.ok) throw new AppError(502, "PAYPAL_REQUEST_FAILED", response.status === 429 ? "PayPal sandbox is busy. Wait before retrying." : "PayPal sandbox could not complete the request. Check the sandbox account and try again.");
  const text = await response.text();
  if (!text.trim()) return {} as T;
  try { return JSON.parse(text) as T; }
  catch { throw new AppError(502, "PAYPAL_INVALID_RESPONSE", "PayPal returned an unexpected response. Refresh the invoice before retrying."); }
}

export function decimalToMinor(value: string | undefined): number {
  invariant(typeof value === "string" && /^\d{1,9}(\.\d{1,2})?$/.test(value), 502, "PAYPAL_INVALID_AMOUNT", "PayPal returned an invalid USD amount.");
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function buildPayPalInvoicePayload(config: PayPalConfig, workspace: Workspace, requestId: string): Record<string, unknown> {
  invariant(config.PAYPAL_INVOICER_EMAIL, 503, "PAYPAL_NOT_CONFIGURED", "Configure the sandbox seller email.");
  invariant(workspace.project.currency === "USD", 422, "CURRENCY_UNSUPPORTED", "This prototype supports USD invoices only.");
  return {
    detail: { currency_code: "USD", invoice_number: `PP-${requestId.replaceAll("-", "").slice(0, 20)}`, reference: `ProofPay ${workspace.id} v${workspace.contentVersion}`, note: `Client accepted ${workspace.project.milestone}, evidence version ${workspace.contentVersion}. Sandbox prototype. This invoice is not escrow.`, payment_term: { term_type: "DUE_ON_RECEIPT" } },
    invoicer: { email_address: config.PAYPAL_INVOICER_EMAIL },
    primary_recipients: [{ billing_info: { email_address: workspace.project.clientEmail, business_name: workspace.project.client } }],
    items: [{ name: workspace.project.milestone, description: `Approved evidence version ${workspace.contentVersion}`, quantity: "1", unit_amount: { currency_code: "USD", value: (workspace.project.amountMinor / 100).toFixed(2) } }],
    configuration: { partial_payment: { allow_partial_payment: false }, allow_tip: false, tax_inclusive: false },
  };
}

export async function createPayPalInvoice(config: PayPalConfig, payload: Record<string, unknown>, requestId: string): Promise<string> {
  const invoice = await api<PayPalInvoice>(config, "/v2/invoicing/invoices", "POST", payload, requestId);
  let id = invoice.id;
  if (!id) {
    const link = invoice.links?.find(item => item.rel === "self")?.href;
    if (link) {
      const url = new URL(link);
      if (url.origin === BASE) id = url.pathname.split("/").pop();
    }
  }
  invariant(id && /^INV2-[A-Z0-9-]{8,50}$/.test(id), 502, "PAYPAL_INVOICE_ID_MISSING", "PayPal did not return a usable invoice ID. The saved request can be retried safely.");
  return id;
}

export async function sendPayPalInvoice(config: PayPalConfig, invoiceId: string, requestId: string): Promise<void> {
  await api(config, `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/send`, "POST", { send_to_recipient: true, send_to_invoicer: true }, requestId);
}

export async function getPayPalInvoice(config: PayPalConfig, invoiceId: string): Promise<PayPalInvoice> {
  return api(config, `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}`);
}

export function reconcileInvoice(existing: Invoice, resource: PayPalInvoice): Invoice {
  invariant(resource.id === existing.id, 502, "PAYPAL_INVOICE_MISMATCH", "The PayPal invoice does not match this approved milestone.");
  invariant(resource.amount?.currency_code === existing.currency && decimalToMinor(resource.amount.value) === existing.amountMinor, 409, "INVOICE_AMOUNT_CHANGED", "The PayPal invoice amount differs from the client-approved price. Manual review is required.");
  const transactions = resource.payments?.transactions || [];
  const paypalTransactions = transactions.filter(transaction => transaction.type === "PAYPAL");
  const externalTransactions = transactions.filter(transaction => transaction.type === "EXTERNAL");
  const paidAmount = resource.payments?.paid_amount;
  if (paidAmount?.currency_code) invariant(paidAmount.currency_code === existing.currency, 502, "PAYPAL_CURRENCY_MISMATCH", "The payment currency differs from the approved invoice.");
  const paidMinor = paidAmount?.value ? decimalToMinor(paidAmount.value) : 0;
  const status = resource.status || "UNKNOWN";
  let mapped: Invoice["status"] = "pending";
  if (status === "DRAFT") mapped = "draft";
  else if (["SENT", "UNPAID", "SHARED", "SCHEDULED"].includes(status)) mapped = "unpaid";
  else if (["CANCELLED", "AUTO_CANCELLED"].includes(status)) mapped = "cancelled";
  else if (["MARKED_AS_PAID", "PAID_EXTERNAL", "MARKED_AS_REFUNDED", "REFUNDED_EXTERNAL"].includes(status)) mapped = "recorded_externally";
  else if (status === "PAYMENT_PENDING") mapped = "pending";
  else if (status === "PARTIALLY_PAID") mapped = "partially_paid";
  else if (status === "REFUNDED") mapped = "refunded";
  else if (status === "PARTIALLY_REFUNDED") mapped = "partially_refunded";
  else if (status === "PAID") {
    // A paid event/name alone is insufficient: recorded external payments can also trigger it.
    mapped = paypalTransactions.length > 0 && externalTransactions.length === 0 && paidMinor >= existing.amountMinor ? "paid" : "recorded_externally";
  }
  const link = resource.detail?.metadata?.recipient_view_url || resource.links?.find(item => item.rel === "payer_view")?.href;
  let paymentUrl: string | undefined;
  if (link) {
    try { const url = new URL(link); if (url.protocol === "https:" && (url.hostname === "www.sandbox.paypal.com" || url.hostname === "sandbox.paypal.com")) paymentUrl = url.href; } catch { /* untrusted provider URL omitted */ }
  }
  return { ...existing, status: mapped, paypalStatus: status, paidMinor, updatedAt: new Date().toISOString(), ...(paymentUrl ? { paymentUrl } : {}), ...(paypalTransactions[0]?.payment_id ? { paymentId: paypalTransactions[0].payment_id } : {}), message: mapped === "paid" ? "PayPal sandbox reports this invoice fully paid through PayPal. No real money moved." : mapped === "recorded_externally" ? "PayPal reports a recorded or unconfirmed external payment. This is not a verified PayPal checkout payment." : mapped === "pending" ? "Payment is pending or not fully confirmed by PayPal." : "PayPal sandbox invoice status synchronized." };
}

export async function verifyPayPalWebhook(config: PayPalConfig, request: Request, rawEvent: string): Promise<void> {
  invariant(config.PAYPAL_WEBHOOK_ID, 503, "WEBHOOK_NOT_CONFIGURED", "PayPal webhook verification is not configured.");
  const names = ["paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id", "paypal-transmission-sig", "paypal-transmission-time"];
  invariant(names.every(name => request.headers.get(name)), 400, "WEBHOOK_HEADERS_MISSING", "Required PayPal verification headers are missing.");
  let certUrl: URL;
  try { certUrl = new URL(request.headers.get("paypal-cert-url")!); } catch { throw new AppError(400, "WEBHOOK_CERT_INVALID", "PayPal certificate URL is invalid."); }
  invariant(certUrl.protocol === "https:" && ["api.paypal.com", "api.sandbox.paypal.com", "api-m.sandbox.paypal.com"].includes(certUrl.hostname), 400, "WEBHOOK_CERT_INVALID", "PayPal certificate URL is invalid.");
  const verification = {
    auth_algo: request.headers.get("paypal-auth-algo"), cert_url: certUrl.href, transmission_id: request.headers.get("paypal-transmission-id"), transmission_sig: request.headers.get("paypal-transmission-sig"), transmission_time: request.headers.get("paypal-transmission-time"), webhook_id: config.PAYPAL_WEBHOOK_ID,
  };
  // Embed original event JSON byte-for-byte: do not reserialize or reorder its fields.
  const prefix = JSON.stringify(verification).slice(0, -1);
  const token = await accessToken(config);
  let response: Response;
  try {
    response = await fetch(`${BASE}/v1/notifications/verify-webhook-signature`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: `${prefix},"webhook_event":${rawEvent}}`, signal: AbortSignal.timeout(20000) });
  } catch { throw new AppError(502, "WEBHOOK_VERIFICATION_UNAVAILABLE", "PayPal signature verification is temporarily unavailable."); }
  invariant(response.ok, 502, "WEBHOOK_VERIFICATION_UNAVAILABLE", "PayPal signature verification is temporarily unavailable.");
  const result = await response.json() as { verification_status?: string };
  invariant(result.verification_status === "SUCCESS", 400, "WEBHOOK_SIGNATURE_INVALID", "PayPal webhook signature could not be verified.");
}
