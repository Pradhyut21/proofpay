import { z } from "zod";
import { analyzeWorkspace, extractRequirements } from "./ai";
import { isLoopback, randomToken, requireSameOrigin, sellerIdentity, sha256 } from "./auth";
import { environment, modelName, paymentMode } from "./config";
import { AppError, invariant } from "./errors";
import { buildPayPalInvoicePayload, createPayPalInvoice, getPayPalInvoice, reconcileInvoice, sendPayPalInvoice, verifyPayPalWebhook, type PayPalConfig } from "./paypal";
import { assertEditable, assertInvoiceReady, assertReviewReady, assertSamplePayment } from "./policy";
import { event, seedWorkspace } from "./seed";
import { commit, eventAlreadyProcessed, findWorkspaceByInvoice, getReviewToken, markEventProcessed, mutate, readWorkspace, saveReviewToken, type StoredWorkspace } from "./store";
import type { AppConfig, ReviewSnapshot, Workspace } from "./types";

export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  invariant(Number(request.headers.get("content-length") || 0) <= 100_000, 413, "BODY_TOO_LARGE", "The submitted text is too large.");
  let text: string;
  try { text = await request.text(); } catch { throw new AppError(400, "INVALID_BODY", "The request body could not be read."); }
  invariant(text.length <= 100_000, 413, "BODY_TOO_LARGE", "The submitted text is too large.");
  let json: unknown;
  try { json = text.trim() ? JSON.parse(text) : {}; } catch { throw new AppError(400, "INVALID_JSON", "Send a valid JSON request."); }
  const result = schema.safeParse(json);
  invariant(result.success, 422, "INVALID_INPUT", "Check the required fields and text lengths, then try again.");
  return result.data;
}

function seller(request: Request, write = false): string {
  if (write) requireSameOrigin(request);
  const identity = sellerIdentity(request);
  if (!isLoopback(request) && paymentMode() !== "sample") {
    const allowed = environment().PROOFPAY_SELLER_USER_ID;
    invariant(allowed && identity === `sites:${allowed}`, 403, "SELLER_NOT_AUTHORIZED", "This sandbox merchant workspace is restricted to its configured seller.");
  }
  return identity;
}

export function appConfig(request: Request): AppConfig {
  let authenticated = false;
  try { seller(request); authenticated = true; } catch { /* optional identity */ }
  const config = environment();
  const mode = paymentMode(config);
  return { aiMode: config.GEMINI_API_KEY ? "gemini" : "sample", aiModel: config.GEMINI_API_KEY ? modelName(config) : "deterministic-sample-v1", paymentMode: mode, authenticated, localDemo: isLoopback(request), signInUrl: "/signin-with-chatgpt?return_to=%2F", capabilities: { analyze: authenticated, invoice: authenticated && mode !== "unavailable", samplePayment: authenticated && mode === "sample" }, notices: [config.GEMINI_API_KEY ? "Gemini evaluates supplied text; it does not execute websites or verify inboxes." : "Sample assessment uses deterministic rules. Configure Gemini for AI analysis.", mode === "sample" ? "Payment simulation is sample-only. No PayPal API is called and no money moves." : mode === "paypal_sandbox" ? "PayPal sandbox only. The buyer must pay the hosted invoice; no real money moves." : "PayPal configuration is incomplete. Payments and simulations are disabled.", "Client approval is bound to the reviewed evidence version and price. This is not escrow."] };
}

export function publicWorkspace(stored: StoredWorkspace): Workspace {
  const w = structuredClone(stored.workspace);
  if (w.approval?.status === "pending" && Date.parse(w.approval.expiresAt) < Date.now()) w.approval.status = "expired";
  return w;
}

export async function getWorkspace(request: Request): Promise<Workspace> { return publicWorkspace(await readWorkspace(seller(request))); }

export async function resetWorkspace(request: Request): Promise<Workspace> {
  const ownerId = seller(request, true);
  return publicWorkspace(await mutate(ownerId, stored => {
    invariant(!stored.workspace.invoice || (stored.workspace.invoice.provider === "sample" && paymentMode() === "sample"), 409, "INVOICE_EXISTS", "A PayPal invoice exists for this milestone. It cannot be discarded by resetting the demo.");
    stored.workspace = seedWorkspace(stored.workspace.id); delete stored.invoiceOperation;
  }));
}

function invalidate(w: Workspace): void {
  w.contentVersion += 1;
  w.analysis = null;
  if (w.approval) w.approval.status = "stale";
}

export async function setRequirements(request: Request): Promise<Workspace> {
  const ownerId = seller(request, true);
  const { text } = await readBody(request, z.object({ text: z.string().trim().min(20).max(20000) }).strict());
  const stored = await readWorkspace(ownerId);
  assertEditable(stored.workspace);
  const expectedRevision = stored.workspace.revision;
  const requirements = await extractRequirements(text, environment());
  stored.workspace.project.brief = text;
  stored.workspace.requirements = requirements;
  invalidate(stored.workspace);
  stored.workspace.activity.push(event("requirement", `${requirements.length} requirements extracted from the agreement. Previous approval invalidated.`));
  return publicWorkspace(await commit(ownerId, stored, expectedRevision));
}

export async function addEvidence(request: Request): Promise<Workspace> {
  const ownerId = seller(request, true);
  const body = await readBody(request, z.object({ title: z.string().trim().min(2).max(160), text: z.string().trim().min(15).max(12000), kind: z.enum(["delivery_note", "test_report", "client_message", "other"]).optional() }).strict());
  return publicWorkspace(await mutate(ownerId, stored => {
    const w = stored.workspace; assertEditable(w);
    invariant(w.evidence.length < 12, 422, "EVIDENCE_LIMIT", "This prototype supports up to 12 text artifacts per milestone.");
    w.evidence.push({ id: crypto.randomUUID(), title: body.title, text: body.text, kind: body.kind || "other", createdAt: new Date().toISOString() });
    invalidate(w);
    w.activity.push(event("evidence", `Added “${body.title}”. Delivery is now version ${w.contentVersion}; analysis and prior approval need renewal.`));
  }));
}

export async function analyze(request: Request): Promise<Workspace> {
  const ownerId = seller(request, true);
  const stored = await readWorkspace(ownerId);
  assertEditable(stored.workspace);
  const expectedRevision = stored.workspace.revision;
  const analysis = await analyzeWorkspace(stored.workspace, environment());
  stored.workspace.analysis = analysis;
  if (stored.workspace.approval) stored.workspace.approval.status = "stale";
  stored.workspace.activity.push(event("analysis", `${analysis.provider === "sample" ? "Sample rules" : "Gemini"} assessed evidence version ${analysis.contentVersion}: ${analysis.readiness}% supported. Client decision still required.`));
  return publicWorkspace(await commit(ownerId, stored, expectedRevision));
}

export async function createApprovalLink(request: Request): Promise<{ workspace: Workspace; url: string; expiresAt: string }> {
  const ownerId = seller(request, true);
  const token = randomToken();
  const stored = await mutate(ownerId, stored => {
    const w = stored.workspace; assertEditable(w); assertReviewReady(w);
    w.approval = { id: crypto.randomUUID(), status: "pending", contentVersion: w.contentVersion, analysisId: w.analysis!.id, amountMinor: w.project.amountMinor, currency: w.project.currency, expiresAt: new Date(Date.now() + 48 * 3600_000).toISOString() };
    w.activity.push(event("approval", `Created a private client review link for evidence version ${w.contentVersion}, USD ${(w.project.amountMinor / 100).toFixed(2)}. Expires in 48 hours.`));
  });
  await saveReviewToken(await sha256(token), ownerId, stored);
  return { workspace: publicWorkspace(stored), url: `${new URL(request.url).origin}/review/${token}`, expiresAt: stored.workspace.approval!.expiresAt };
}

export async function reviewForToken(token: string): Promise<{ ownerId: string; stored: StoredWorkspace }> {
  invariant(/^[a-f0-9]{64}$/.test(token), 404, "REVIEW_NOT_FOUND", "This client review link is invalid or unavailable.");
  const row = await getReviewToken(await sha256(token));
  invariant(row, 404, "REVIEW_NOT_FOUND", "This client review link is invalid or unavailable.");
  invariant(Date.parse(row.expires_at) > Date.now(), 410, "REVIEW_EXPIRED", "This review link has expired. Ask the seller for a new link.");
  const stored = await readWorkspace(row.owner_id);
  const w = stored.workspace;
  invariant(w.id === row.workspace_id && w.contentVersion === row.content_version && w.approval?.id === row.approval_id && ["pending", "accepted"].includes(w.approval.status) && w.approval.analysisId === w.analysis?.id, 409, "REVIEW_STALE", "The evidence or assessment has changed. Ask the seller for a new review link.");
  return { ownerId: row.owner_id, stored };
}

function snapshot(stored: StoredWorkspace): ReviewSnapshot {
  const w = publicWorkspace(stored);
  invariant(w.analysis && w.approval, 409, "REVIEW_STALE", "The reviewed evidence is no longer available.");
  return { workspaceId: w.id, project: w.project, contentVersion: w.contentVersion, requirements: w.requirements, evidence: w.evidence, analysis: w.analysis, approval: w.approval, invoice: w.invoice, paymentMode: paymentMode() };
}

export async function getReview(token: string): Promise<ReviewSnapshot> { return snapshot((await reviewForToken(token)).stored); }

export async function acceptReview(request: Request, token: string): Promise<ReviewSnapshot> {
  requireSameOrigin(request);
  const { clientName } = await readBody(request, z.object({ clientName: z.string().trim().min(2).max(120) }).strict());
  const { ownerId, stored } = await reviewForToken(token);
  const revision = stored.workspace.revision;
  const w = stored.workspace;
  assertReviewReady(w);
  if (w.approval!.status === "accepted") return snapshot(stored);
  w.approval = { ...w.approval!, status: "accepted", acceptedAt: new Date().toISOString(), clientName };
  w.activity.push(event("approval", `${clientName} accepted the exact requirements, evidence version ${w.contentVersion}, and USD ${(w.project.amountMinor / 100).toFixed(2)} invoice price.`));
  return snapshot(await commit(ownerId, stored, revision));
}

export async function createInvoice(request: Request): Promise<Workspace> {
  const ownerId = seller(request, true);
  const body = await readBody(request, z.object({ clientEmail: z.string().email().max(254).optional() }).strict());
  const mode = paymentMode();
  invariant(mode !== "unavailable", 503, "PAYPAL_NOT_CONFIGURED", "Complete the PayPal sandbox configuration before invoicing. Simulated payment is disabled.");
  let stored = await readWorkspace(ownerId);
  const w = stored.workspace;
  assertInvoiceReady(w);
  if (w.invoice) invariant(w.invoice.provider === (mode === "sample" ? "sample" : "paypal_sandbox"), 409, "PAYMENT_MODE_CHANGED", "This invoice belongs to a different payment mode. It cannot be converted or simulated.");
  if (w.invoice && !["creating", "failed", "draft"].includes(w.invoice.status)) return publicWorkspace(stored);
  invariant(!stored.invoiceOperation || stored.invoiceOperation.lockUntil <= Date.now(), 409, "INVOICE_BUSY", "This invoice operation is still in progress. Wait a few minutes and refresh before retrying.");
  if (mode === "paypal_sandbox") invariant(body.clientEmail || w.project.clientEmail, 422, "CLIENT_EMAIL_REQUIRED", "Enter the sandbox buyer email before creating the invoice.");
  if (stored.invoiceOperation && body.clientEmail) {
    invariant(body.clientEmail === (stored.invoiceOperation.clientEmail ?? w.project.clientEmail), 409, "INVOICE_RECIPIENT_LOCKED", "The buyer email is fixed for this invoice operation. Retry with the original recipient.");
  }
  if (!stored.invoiceOperation && body.clientEmail) w.project.clientEmail = body.clientEmail;
  const revision = w.revision;
  if (!stored.invoiceOperation) {
    const requestId = crypto.randomUUID();
    stored.invoiceOperation = { requestId, sendRequestId: crypto.randomUUID(), approvalId: w.approval!.id, contentVersion: w.contentVersion, lockUntil: 0, clientEmail: w.project.clientEmail, ...(mode === "paypal_sandbox" ? { payload: buildPayPalInvoicePayload(environment(), w, requestId) } : {}) };
  }
  const operation = stored.invoiceOperation;
  invariant(operation.approvalId === w.approval!.id && operation.contentVersion === w.contentVersion, 409, "INVOICE_VERSION_MISMATCH", "The saved invoice operation belongs to a different approval.");
  invariant(mode !== "paypal_sandbox" || operation.payload, 409, "INVOICE_RECOVERY_REQUIRED", "This older invoice attempt has no frozen provider payload. Check it in the sandbox dashboard before attempting recovery.");
  const attemptId = crypto.randomUUID();
  operation.attemptId = attemptId;
  // Three provider operations can each take 15s OAuth + 20s API, with bounded GET refetches.
  operation.lockUntil = Date.now() + 240_000;
  const at = new Date().toISOString();
  w.invoice = w.invoice || { id: `${mode === "sample" ? "sample" : "pending"}-${crypto.randomUUID()}`, provider: mode === "sample" ? "sample" : "paypal_sandbox", status: "creating", amountMinor: w.approval!.amountMinor, currency: w.approval!.currency, paidMinor: 0, contentVersion: w.contentVersion, approvalId: w.approval!.id, createdAt: at, updatedAt: at };
  w.invoice.status = "creating";
  if (mode === "sample") {
    w.invoice.status = "unpaid"; w.invoice.message = "Sample invoice only. No PayPal API has been called and no money has moved."; operation.lockUntil = 0;
    w.activity.push(event("invoice", "Created a clearly labelled sample USD 300 invoice for the client-approved delivery."));
    return publicWorkspace(await commit(ownerId, stored, revision));
  }
  // Claim the operation atomically before any outbound provider call. Losing CAS callers never call PayPal.
  stored = await commit(ownerId, stored, revision);
  try {
    const config = environment();
    let id = stored.invoiceOperation!.paypalInvoiceId;
    if (!id) {
      id = await createPayPalInvoice(config, operation.payload!, operation.requestId);
      stored = await mutate(ownerId, next => {
        assertInvoiceAttempt(next, operation.requestId, attemptId);
        next.invoiceOperation.paypalInvoiceId = id; next.workspace.invoice!.id = id!; next.workspace.invoice!.status = "draft";
      });
    }
    assertInvoiceAttempt(await readWorkspace(ownerId), operation.requestId, attemptId);
    await sendPayPalInvoice(config, id, operation.sendRequestId);
    stored = await reconcileCurrentPayPalInvoice(ownerId, id, config, { requestId: operation.requestId, attemptId });
    return publicWorkspace(stored);
  } catch (error) {
    try { await recordInvoiceAttemptFailure(ownerId, operation.requestId, attemptId); } catch { /* original sanitized provider error returned */ }
    throw error;
  }
}

function assertInvoiceAttempt(stored: StoredWorkspace, requestId: string, attemptId: string): asserts stored is StoredWorkspace & { invoiceOperation: NonNullable<StoredWorkspace["invoiceOperation"]> } {
  invariant(stored.invoiceOperation?.requestId === requestId && stored.invoiceOperation.attemptId === attemptId, 409, "INVOICE_ATTEMPT_CHANGED", "A newer attempt owns this invoice operation. Refresh to see its result.");
}

async function recordInvoiceAttemptFailure(ownerId: string, requestId: string, attemptId: string): Promise<void> {
  for (let retry = 0; retry < 3; retry++) {
    const stored = await readWorkspace(ownerId);
    if (stored.invoiceOperation?.requestId !== requestId || stored.invoiceOperation.attemptId !== attemptId) return;
    const revision = stored.workspace.revision;
    const invoice = stored.workspace.invoice;
    // A late network failure must not replace a payment/refund state confirmed by a webhook.
    if (invoice && ["creating", "draft", "failed"].includes(invoice.status)) {
      invoice.status = "failed";
      invoice.message = "Provider confirmation incomplete. Refresh or retry this saved operation; do not create a replacement invoice.";
    }
    stored.invoiceOperation.lockUntil = 0;
    try { await commit(ownerId, stored, revision); return; }
    catch (error) { if (!(error instanceof AppError && error.code === "WORKSPACE_CHANGED")) throw error; }
  }
}

async function reconcileCurrentPayPalInvoice(ownerId: string, invoiceId: string, config: PayPalConfig, attempt?: { requestId: string; attemptId: string }): Promise<StoredWorkspace> {
  for (let retry = 0; retry < 3; retry++) {
    const stored = await readWorkspace(ownerId);
    invariant(stored.workspace.invoice?.provider === "paypal_sandbox", 409, "PAYPAL_INVOICE_REQUIRED", "There is no PayPal sandbox invoice to refresh.");
    invariant(stored.invoiceOperation?.paypalInvoiceId === invoiceId && stored.workspace.invoice.id === invoiceId, 409, "INVOICE_VERSION_MISMATCH", "The invoice operation has changed. Refresh the workspace.");
    if (attempt) assertInvoiceAttempt(stored, attempt.requestId, attempt.attemptId);
    const revision = stored.workspace.revision;
    // Capture the database revision BEFORE the provider GET. A slower, older response cannot
    // overwrite a webhook or another refresh that committed while this request was in flight.
    const resource = await getPayPalInvoice(config, invoiceId);
    const before = stored.workspace.invoice.status;
    stored.workspace.invoice = reconcileInvoice(stored.workspace.invoice, resource);
    if (before !== stored.workspace.invoice.status) stored.workspace.activity.push(event("payment", `PayPal sandbox status: ${stored.workspace.invoice.status.replaceAll("_", " ")}.`));
    if (attempt) {
      stored.invoiceOperation!.lockUntil = 0;
      stored.workspace.activity.push(event("invoice", "PayPal sandbox invoice synchronized for the client-approved amount. The current payment status is shown below."));
    }
    try { return await commit(ownerId, stored, revision); }
    catch (error) {
      if (!(error instanceof AppError && error.code === "WORKSPACE_CHANGED")) throw error;
      // Refetch PayPal after a conflict; never apply the same stale resource to a newer row.
    }
  }
  throw new AppError(409, "INVOICE_REFRESH_BUSY", "The invoice changed during refresh. Please refresh again shortly.");
}

export async function refreshInvoice(request: Request): Promise<Workspace> {
  const ownerId = seller(request, true);
  const stored = await readWorkspace(ownerId);
  invariant(stored.workspace.invoice, 409, "INVOICE_REQUIRED", "Create an invoice first.");
  if (stored.workspace.invoice.provider === "sample") return publicWorkspace(stored);
  invariant(paymentMode() === "paypal_sandbox", 503, "PAYPAL_NOT_CONFIGURED", "PayPal sandbox is not configured.");
  const id = stored.invoiceOperation?.paypalInvoiceId;
  invariant(id, 409, "INVOICE_UNCONFIRMED", "Invoice creation was not confirmed. Retry the saved invoice operation.");
  return publicWorkspace(await reconcileCurrentPayPalInvoice(ownerId, id, environment()));
}

export async function demoPay(request: Request): Promise<Workspace> {
  const ownerId = seller(request, true);
  return publicWorkspace(await mutate(ownerId, stored => {
    const w = stored.workspace; assertSamplePayment(w, paymentMode());
    if (w.invoice!.status === "paid") return;
    w.invoice = { ...w.invoice!, status: "paid", paidMinor: w.invoice!.amountMinor, updatedAt: new Date().toISOString(), paymentId: `SAMPLE-${crypto.randomUUID()}`, message: "SIMULATED PAYMENT. No PayPal checkout, API call, or transfer occurred." };
    w.activity.push(event("payment", "SIMULATED sample payment marked complete. No PayPal API call or transfer occurred."));
  }));
}

export async function paypalWebhook(request: Request): Promise<{ received: true; duplicate?: true; ignored?: true }> {
  invariant(paymentMode() === "paypal_sandbox", 503, "WEBHOOK_NOT_CONFIGURED", "PayPal sandbox webhooks are not configured.");
  const rawEvent = await request.clone().text();
  const payload = await readBody(request, z.object({ id: z.string().min(1).max(120), event_type: z.string().min(1).max(120), resource: z.record(z.unknown()) }).passthrough());
  await verifyPayPalWebhook(environment(), request, rawEvent);
  if (await eventAlreadyProcessed(payload.id)) return { received: true, duplicate: true };
  if (!payload.event_type.startsWith("INVOICING.INVOICE.")) return { received: true, ignored: true };
  const resource = payload.resource as { id?: unknown; invoice_id?: unknown; invoice?: { id?: unknown } };
  const id = [resource.id, resource.invoice_id, resource.invoice?.id].find(candidate => typeof candidate === "string" && /^INV2-[A-Z0-9-]{8,50}$/.test(candidate)) as string | undefined;
  if (!id) return { received: true, ignored: true };
  const found = await findWorkspaceByInvoice(id);
  if (!found) return { received: true, ignored: true };
  // Never trust event names, event amounts, event order, or client redirects as payment proof.
  // Query PayPal's current invoice, so stale/duplicate notifications cannot regress state.
  await reconcileCurrentPayPalInvoice(found.ownerId, id, environment());
  await markEventProcessed(payload.id, id);
  return { received: true };
}
