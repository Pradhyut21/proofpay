import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { analyzeWorkspace, extractRequirements, groundedFindings } from "../lib/proofpay/ai.ts";
import { SAMPLE_BRIEF, seedWorkspace } from "../lib/proofpay/seed.ts";
import { sellerIdentity, requireSameOrigin } from "../lib/proofpay/auth.ts";
import { configuredPaymentMode, assertInvoiceReady, assertSamplePayment } from "../lib/proofpay/policy.ts";
import { reconcileInvoice } from "../lib/proofpay/paypal.ts";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
CREATE TABLE proofpay_workspaces (owner_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL DEFAULT 0, data_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE proofpay_review_tokens (token_hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL, workspace_id TEXT NOT NULL, approval_id TEXT NOT NULL, content_version INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE proofpay_webhook_events (event_id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL, processed_at TEXT NOT NULL);
`);
const d1 = { prepare(sql) { const stmt = sqlite.prepare(sql); return { bind(...args) { return { async first() { return stmt.get(...args) || null; }, async run() { const result = stmt.run(...args); return { success: true, meta: { changes: Number(result.changes) } }; } }; } }; } };
globalThis.__proofpayTestEnv = { DB: d1 };
const service = await import("../lib/proofpay/service.ts");
const store = await import("../lib/proofpay/store.ts");

function req(path, data = undefined, identity = "seller-one") {
  return new Request(`https://proofpay.test${path}`, { method: data === undefined ? "GET" : "POST", headers: { "oai-authenticated-user-id": identity, ...(data === undefined ? {} : { "Content-Type": "application/json", Origin: "https://proofpay.test" }) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
}

const completion = "Home, About, and Contact mobile screenshots are captured at 390 × 844 with no horizontal overflow. Contact form submission succeeded; email received in studio inbox, message ID QA-1042.";

test("sample analysis detects actual coverage gaps and requires specific new evidence", async () => {
  const workspace = seedWorkspace();
  const before = await analyzeWorkspace(workspace, {});
  assert.deepEqual(before.findings.map(finding => finding.status), ["met", "partial", "partial"]);
  assert.equal(before.readiness, 67);
  assert.equal(before.provider, "sample");
  assert.ok(before.limitations.some(text => text.includes("not an AI model")));
  workspace.evidence.push({ id: "final-qa", title: "Final QA", kind: "test_report", text: completion, createdAt: new Date().toISOString() });
  const after = await analyzeWorkspace(workspace, {});
  assert.equal(after.readiness, 100);
  assert.ok(after.findings.every(finding => finding.status === "met"));
  for (const finding of after.findings) for (const citation of finding.citations) assert.ok(workspace.evidence.find(item => item.id === citation.evidenceId)?.text.includes(citation.quote));
});

test("fabricated or missing AI citations cannot certify a requirement", () => {
  const workspace = seedWorkspace();
  const findings = workspace.requirements.map(requirement => ({ requirementId: requirement.id, status: "met", reason: "Everything passed", citations: [{ evidenceId: "ev-handoff", quote: "Fabricated email delivery proof" }] }));
  assert.ok(groundedFindings(workspace.requirements, workspace.evidence, findings).every(finding => finding.status === "uncertain"));
});

test("sample requirement extraction preserves source text and excludes context/payment sentences", async () => {
  const requirements = await extractRequirements(SAMPLE_BRIEF, {});
  assert.equal(requirements.length, 3);
  assert.ok(requirements.every(requirement => SAMPLE_BRIEF.includes(requirement.sourceQuote)));
  assert.ok(requirements.every(requirement => !requirement.description.startsWith("Website handoff")));
});

test("hosted anonymous sellers and cross-origin write requests are rejected", () => {
  assert.throws(() => sellerIdentity(new Request("https://proofpay.test/api/workspace")), /Sign in/);
  assert.equal(sellerIdentity(new Request("http://127.0.0.1:3000/api/workspace")), "local:proofpay-demo");
  assert.throws(() => requireSameOrigin(new Request("https://proofpay.test/api/evidence", { headers: { Origin: "https://attacker.test" } })), /ProofPay/);
});

test("Vercel authenticates only the configured owner and rejects forged Sites or loopback identities", async t => {
  const previous = { ...globalThis.__proofpayTestEnv };
  t.after(() => {
    for (const key of Object.keys(globalThis.__proofpayTestEnv)) delete globalThis.__proofpayTestEnv[key];
    Object.assign(globalThis.__proofpayTestEnv, previous);
  });
  const password = "test-only-owner-password-with-32-plus-characters";
  Object.assign(globalThis.__proofpayTestEnv, { PROOFPAY_HOSTING: "vercel", PROOFPAY_OWNER_PASSWORD: password });
  const ownerRequest = (username = "owner", value = password) => new Request("https://proofpay.test/api/workspace", {
    headers: { Authorization: "Basic " + Buffer.from(`${username}:${value}`).toString("base64") },
  });
  assert.throws(() => sellerIdentity(req("/api/workspace")), /Sign in/);
  assert.throws(() => sellerIdentity(new Request("http://127.0.0.1:3000/api/workspace")), /Sign in/);
  assert.throws(() => sellerIdentity(ownerRequest("attacker")), /Sign in/);
  assert.throws(() => sellerIdentity(ownerRequest("owner", "incorrect")), /Sign in/);
  assert.equal(sellerIdentity(ownerRequest()), "vercel:owner");
  const config = service.appConfig(ownerRequest());
  assert.equal(config.authenticated, true);
  assert.equal(config.signInUrl, "/signin");
  assert.equal(config.localDemo, false);
  assert.equal(service.appConfig(req("/api/config")).authenticated, false);
  const workspace = await service.getWorkspace(ownerRequest());
  assert.ok(workspace.id);
  assert.equal(JSON.stringify(config).includes(password), false);
  globalThis.__proofpayTestEnv.PROOFPAY_OWNER_PASSWORD = "short";
  assert.throws(() => sellerIdentity(ownerRequest("owner", "short")), /Sign in/);
  delete globalThis.__proofpayTestEnv.PROOFPAY_OWNER_PASSWORD;
  assert.throws(() => sellerIdentity(ownerRequest()), /Sign in/);
});

test("partial real-provider configuration never enables sample payment", () => {
  assert.equal(configuredPaymentMode({}), "sample");
  assert.equal(configuredPaymentMode({ PAYPAL_CLIENT_ID: "present" }), "unavailable");
  assert.equal(configuredPaymentMode({ PROOFPAY_PAYMENT_MODE: "paypal_sandbox" }), "unavailable");
  assert.equal(configuredPaymentMode({ PROOFPAY_PAYMENT_MODE: "live" }), "unavailable");
  assert.equal(configuredPaymentMode({ PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret", PAYPAL_INVOICER_EMAIL: "merchant@test.invalid", PAYPAL_WEBHOOK_ID: "WH" }), "paypal_sandbox");
  assert.throws(() => assertSamplePayment(seedWorkspace(), "paypal_sandbox"), /disabled/);
});

test("private ownership, version-scoped approval, and exact-price invoice form an end-to-end gate", async () => {
  const first = await service.getWorkspace(req("/api/workspace"));
  const other = await service.getWorkspace(req("/api/workspace", undefined, "seller-two"));
  assert.notEqual(first.id, other.id);
  await assert.rejects(service.createInvoice(req("/api/invoice", {})), /Analyze/);
  await service.analyze(req("/api/analyze", {}));
  await assert.rejects(service.createApprovalLink(req("/api/approval/link", {})), /Resolve/);
  await service.addEvidence(req("/api/evidence", { title: "Final QA", text: completion }));
  await service.analyze(req("/api/analyze", {}));
  const link = await service.createApprovalLink(req("/api/approval/link", {}));
  const token = link.url.split("/").pop();
  assert.equal((await service.getReview(token)).approval.status, "pending");
  const tokenRow = sqlite.prepare("SELECT token_hash FROM proofpay_review_tokens").get();
  assert.notEqual(tokenRow.token_hash, token);
  await assert.rejects(service.createInvoice(req("/api/invoice", {})), /explicitly accept/);
  await service.acceptReview(req(`/api/review/${token}/accept`, { clientName: "Alder client" }), token);
  const accepted = await service.getWorkspace(req("/api/workspace"));
  const changedPrice = structuredClone(accepted); changedPrice.project.amountMinor += 1;
  assert.throws(() => assertInvoiceReady(changedPrice), /price differs/);
  const changedVersion = structuredClone(accepted); changedVersion.contentVersion += 1;
  assert.throws(() => assertInvoiceReady(changedVersion), /Analyze/);
  const invoice = await service.createInvoice(req("/api/invoice", {}));
  assert.equal(invoice.invoice.provider, "sample"); assert.equal(invoice.invoice.amountMinor, 30000);
  const duplicate = await service.createInvoice(req("/api/invoice", {}));
  assert.equal(duplicate.invoice.id, invoice.invoice.id);
  await assert.rejects(service.addEvidence(req("/api/evidence", { title: "Late change", text: completion })), /locked/);
  const paid = await service.demoPay(req("/api/demo/pay", {}));
  assert.equal(paid.invoice.status, "paid"); assert.match(paid.invoice.message, /SIMULATED/);
  const paidAgain = await service.demoPay(req("/api/demo/pay", {}));
  assert.equal(paidAgain.invoice.paymentId, paid.invoice.paymentId);
  assert.equal((await service.getWorkspace(req("/api/workspace", undefined, "seller-two"))).invoice, null);
  const replay = await service.resetWorkspace(req("/api/workspace/reset", {}));
  assert.equal(replay.invoice, null); assert.equal(replay.approval, null);
  await assert.rejects(service.getReview(token), /changed/);
});

test("reanalyzing invalidates old client link even when evidence version is unchanged", async () => {
  const identity = "seller-three";
  await service.addEvidence(req("/api/evidence", { title: "Final QA", text: completion }, identity));
  await service.analyze(req("/api/analyze", {}, identity));
  const link = await service.createApprovalLink(req("/api/approval/link", {}, identity));
  const token = link.url.split("/").pop();
  await service.analyze(req("/api/analyze", {}, identity));
  await assert.rejects(service.getReview(token), /changed/);
});

test("atomic revision compare-and-swap permits only one concurrent writer", async () => {
  const owner = "sites:cas-seller";
  const a = await store.readWorkspace(owner); const b = await store.readWorkspace(owner);
  await store.commit(owner, a, a.workspace.revision);
  await assert.rejects(store.commit(owner, b, b.workspace.revision), /another tab/);
});

test("invoice event names, pending/partial, external record, changed amount cannot claim full PayPal checkout", () => {
  const base = { id: "INV2-TEST-TEST-TEST-TEST", provider: "paypal_sandbox", status: "unpaid", amountMinor: 30000, currency: "USD", paidMinor: 0, contentVersion: 1, approvalId: "a", createdAt: "", updatedAt: "" };
  const resource = { id: base.id, status: "PAID", amount: { currency_code: "USD", value: "300.00" }, payments: { paid_amount: { currency_code: "USD", value: "300.00" }, transactions: [{ type: "PAYPAL", payment_id: "transaction" }] } };
  assert.equal(reconcileInvoice(base, resource).status, "paid");
  assert.equal(reconcileInvoice(base, { ...resource, status: "PAYMENT_PENDING" }).status, "pending");
  assert.equal(reconcileInvoice(base, { ...resource, status: "PARTIALLY_PAID" }).status, "partially_paid");
  assert.equal(reconcileInvoice(base, { ...resource, payments: { ...resource.payments, transactions: [{ type: "EXTERNAL" }] } }).status, "recorded_externally");
  assert.equal(reconcileInvoice(base, { ...resource, payments: { ...resource.payments, transactions: [] } }).status, "recorded_externally");
  assert.throws(() => reconcileInvoice(base, { ...resource, amount: { currency_code: "USD", value: "301.00" } }), /differs/);
  assert.throws(() => reconcileInvoice(base, { ...resource, amount: { currency_code: "EUR", value: "300.00" } }), /differs/);
});

test("negated, failed, bounced, or incomplete contact evidence cannot pass the sample gate", async () => {
  for (const text of [
    "Contact form submission succeeded. Email was not received in the studio inbox.",
    "Contact form submission failed. Email received in studio inbox from an unrelated earlier test.",
    "Contact form submission succeeded. Email delivery bounced and was never received in the studio inbox.",
    "Contact form submission succeeded. Email delivered to inbox? No, delivery failed.",
    "Email received in the studio inbox, message ID QA-1042. Form submission outcome is unknown.",
  ]) {
    const workspace = seedWorkspace();
    workspace.evidence.push({ id: "failed-qa", title: "Latest contact QA", kind: "test_report", text, createdAt: new Date().toISOString() });
    const result = await analyzeWorkspace(workspace, {});
    assert.notEqual(result.findings.find(finding => finding.requirementId === "req-contact").status, "met", text);
  }
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function sandboxFixture(t, identity, handler) {
  const previousEnv = { ...globalThis.__proofpayTestEnv };
  const previousFetch = globalThis.fetch;
  Object.assign(globalThis.__proofpayTestEnv, {
    PAYPAL_CLIENT_ID: "test-client-not-a-secret", PAYPAL_CLIENT_SECRET: "test-secret-not-a-credential",
    PAYPAL_INVOICER_EMAIL: "seller@sandbox.test", PAYPAL_WEBHOOK_ID: "TEST-WEBHOOK",
    PROOFPAY_PAYMENT_MODE: "paypal_sandbox", PROOFPAY_SELLER_USER_ID: identity,
  });
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.origin, "https://api-m.sandbox.paypal.com", "Tests must never call another network endpoint");
    if (parsed.pathname === "/v1/oauth2/token") return Response.json({ access_token: "fixture-access-token" });
    if (parsed.pathname === "/v1/notifications/verify-webhook-signature") return Response.json({ verification_status: "SUCCESS" });
    return handler(parsed.pathname, init);
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
    for (const key of Object.keys(globalThis.__proofpayTestEnv)) delete globalThis.__proofpayTestEnv[key];
    Object.assign(globalThis.__proofpayTestEnv, previousEnv);
  });
}

async function readySeller(identity) {
  await service.addEvidence(req("/api/evidence", { title: "Final QA", text: completion }, identity));
  await service.analyze(req("/api/analyze", {}, identity));
  const link = await service.createApprovalLink(req("/api/approval/link", {}, identity));
  const token = link.url.split("/").pop();
  await service.acceptReview(req(`/api/review/${token}/accept`, { clientName: "Alder client" }, identity), token);
}

function providerInvoice(id, status = "UNPAID") {
  const paid = ["PAID", "REFUNDED", "PARTIALLY_REFUNDED"].includes(status);
  return { id, status, amount: { currency_code: "USD", value: "300.00" }, payments: { paid_amount: { currency_code: "USD", value: paid ? "300.00" : "0.00" }, transactions: paid ? [{ type: "PAYPAL", payment_id: "FIXTURE-PAYMENT" }] : [] } };
}

function webhookRequest(id, eventType = "INVOICING.INVOICE.PAID") {
  return new Request("https://proofpay.test/api/paypal/webhook", {
    method: "POST", headers: { "Content-Type": "application/json", "paypal-auth-algo": "SHA256withRSA", "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/FIXTURE", "paypal-transmission-id": crypto.randomUUID(), "paypal-transmission-sig": "fixture-signature", "paypal-transmission-time": new Date().toISOString() },
    body: JSON.stringify({ id: `WH-${crypto.randomUUID()}`, event_type: eventType, resource: { id } }),
  });
}

test("failed invoice retries freeze recipient and entire provider payload while reusing request ID", async t => {
  const identity = "immutable-recipient-seller";
  const id = "INV2-TEST-TEST-TEST-1001";
  const creates = [];
  sandboxFixture(t, identity, async (path, init) => {
    if (path === "/v2/invoicing/invoices") {
      creates.push({ body: init.body, requestId: new Headers(init.headers).get("PayPal-Request-Id") });
      return creates.length === 1 ? Response.json({ error: "fixture failure" }, { status: 503 }) : Response.json({ id }, { status: 201 });
    }
    if (path.endsWith("/send")) return new Response(null, { status: 204 });
    if (path === `/v2/invoicing/invoices/${id}`) return Response.json(providerInvoice(id));
    throw new Error(`Unexpected fixture path: ${path}`);
  });
  await readySeller(identity);
  await assert.rejects(service.createInvoice(req("/api/invoice", { clientEmail: "original@sandbox.test" }, identity)), /could not complete/);
  await assert.rejects(service.createInvoice(req("/api/invoice", { clientEmail: "different@sandbox.test" }, identity)), /buyer email is fixed/);
  assert.equal(creates.length, 1, "Changed recipient must fail before a second provider call");
  globalThis.__proofpayTestEnv.PAYPAL_INVOICER_EMAIL = "changed-setting@sandbox.test";
  const retried = await service.createInvoice(req("/api/invoice", { clientEmail: "original@sandbox.test" }, identity));
  assert.equal(retried.invoice.status, "unpaid");
  assert.equal(creates.length, 2);
  assert.equal(creates[1].body, creates[0].body, "Provider request payload must be byte-identical across retries");
  assert.equal(creates[1].requestId, creates[0].requestId);
  assert.equal(JSON.parse(creates[1].body).invoicer.email_address, "seller@sandbox.test");
});

test("a sufficiently long invoice lease uses a new attempt identity and late failures cannot unlock its successor", async t => {
  const identity = "lease-takeover-seller";
  const id = "INV2-TEST-TEST-TEST-1002";
  const firstStarted = deferred(); const secondStarted = deferred();
  const firstResponse = deferred(); const secondResponse = deferred();
  let creates = 0;
  sandboxFixture(t, identity, async path => {
    if (path === "/v2/invoicing/invoices") {
      creates += 1;
      if (creates === 1) { firstStarted.resolve(); return firstResponse.promise; }
      secondStarted.resolve(); return secondResponse.promise;
    }
    if (path.endsWith("/send")) return new Response(null, { status: 204 });
    if (path === `/v2/invoicing/invoices/${id}`) return Response.json(providerInvoice(id));
    throw new Error(`Unexpected fixture path: ${path}`);
  });
  await readySeller(identity);
  const firstOutcome = service.createInvoice(req("/api/invoice", { clientEmail: "buyer@sandbox.test" }, identity)).then(value => ({ value }), error => ({ error }));
  await firstStarted.promise;
  const initial = await store.readWorkspace(`sites:${identity}`);
  assert.ok(initial.invoiceOperation.lockUntil - Date.now() >= 179_000);
  assert.ok(initial.invoiceOperation.attemptId);
  await store.mutate(`sites:${identity}`, stored => { stored.invoiceOperation.lockUntil = Date.now() - 1; });
  const secondOutcome = service.createInvoice(req("/api/invoice", { clientEmail: "buyer@sandbox.test" }, identity)).then(value => ({ value }), error => ({ error }));
  await secondStarted.promise;
  const successor = await store.readWorkspace(`sites:${identity}`);
  assert.notEqual(successor.invoiceOperation.attemptId, initial.invoiceOperation.attemptId);
  assert.equal(successor.invoiceOperation.requestId, initial.invoiceOperation.requestId);
  firstResponse.resolve(Response.json({ error: "late fixture failure" }, { status: 503 }));
  assert.ok((await firstOutcome).error);
  const afterLateFailure = await store.readWorkspace(`sites:${identity}`);
  assert.equal(afterLateFailure.invoiceOperation.attemptId, successor.invoiceOperation.attemptId);
  assert.equal(afterLateFailure.invoiceOperation.lockUntil, successor.invoiceOperation.lockUntil);
  assert.equal(afterLateFailure.workspace.invoice.status, "creating");
  secondResponse.resolve(Response.json({ id }, { status: 201 }));
  const result = await secondOutcome;
  assert.equal(result.error, undefined);
  assert.equal(result.value.invoice.status, "unpaid");
  assert.equal((await store.readWorkspace(`sites:${identity}`)).invoiceOperation.lockUntil, 0);
});

for (const confirmedStatus of ["PAID", "REFUNDED"]) {
  test(`a late send failure cannot regress webhook-confirmed ${confirmedStatus}`, async t => {
    const identity = `late-failure-${confirmedStatus.toLowerCase()}`;
    const id = confirmedStatus === "PAID" ? "INV2-TEST-TEST-TEST-1003" : "INV2-TEST-TEST-TEST-1004";
    const sendStarted = deferred(); const sendResponse = deferred();
    sandboxFixture(t, identity, async path => {
      if (path === "/v2/invoicing/invoices") return Response.json({ id }, { status: 201 });
      if (path.endsWith("/send")) { sendStarted.resolve(); return sendResponse.promise; }
      if (path === `/v2/invoicing/invoices/${id}`) return Response.json(providerInvoice(id, confirmedStatus));
      throw new Error(`Unexpected fixture path: ${path}`);
    });
    await readySeller(identity);
    const outcome = service.createInvoice(req("/api/invoice", { clientEmail: "buyer@sandbox.test" }, identity)).then(value => ({ value }), error => ({ error }));
    await sendStarted.promise;
    await service.paypalWebhook(webhookRequest(id, `INVOICING.INVOICE.${confirmedStatus}`));
    const confirmed = await service.getWorkspace(req("/api/workspace", undefined, identity));
    assert.equal(confirmed.invoice.status, confirmedStatus.toLowerCase());
    const message = confirmed.invoice.message;
    sendResponse.resolve(Response.json({ error: "late fixture failure" }, { status: 503 }));
    assert.ok((await outcome).error);
    const after = await service.getWorkspace(req("/api/workspace", undefined, identity));
    assert.equal(after.invoice.status, confirmedStatus.toLowerCase());
    assert.equal(after.invoice.message, message);
    assert.equal((await store.readWorkspace(`sites:${identity}`)).invoiceOperation.lockUntil, 0);
  });
}

test("an older provider GET refetches after a revision conflict instead of overwriting a newer paid webhook", async t => {
  const identity = "stale-provider-read-seller";
  const id = "INV2-TEST-TEST-TEST-1005";
  const oldReadStarted = deferred(); const oldReadResponse = deferred();
  let phase = "initial";
  let racingGets = 0;
  sandboxFixture(t, identity, async path => {
    if (path === "/v2/invoicing/invoices") return Response.json({ id }, { status: 201 });
    if (path.endsWith("/send")) return new Response(null, { status: 204 });
    if (path === `/v2/invoicing/invoices/${id}`) {
      if (phase === "initial") return Response.json(providerInvoice(id));
      racingGets += 1;
      if (racingGets === 1) { oldReadStarted.resolve(); return oldReadResponse.promise; }
      return Response.json(providerInvoice(id, "PAID"));
    }
    throw new Error(`Unexpected fixture path: ${path}`);
  });
  await readySeller(identity);
  await service.createInvoice(req("/api/invoice", { clientEmail: "buyer@sandbox.test" }, identity));
  phase = "race";
  const refresh = service.refreshInvoice(req("/api/invoice/refresh", {}, identity));
  await oldReadStarted.promise;
  await service.paypalWebhook(webhookRequest(id));
  assert.equal((await service.getWorkspace(req("/api/workspace", undefined, identity))).invoice.status, "paid");
  oldReadResponse.resolve(Response.json(providerInvoice(id, "UNPAID")));
  const result = await refresh;
  assert.equal(result.invoice.status, "paid");
  assert.equal(result.invoice.paidMinor, 30000);
  assert.equal(racingGets, 3, "Conflicting stale response must cause a new provider GET");
});
