import { invariant } from "./errors";
import type { PaymentMode, Workspace } from "./types";

export function assertEditable(workspace: Workspace): void {
  invariant(!workspace.invoice, 409, "INVOICE_EXISTS", "This delivery version has an invoice and is locked. Start a separate milestone for further changes.");
}

export function assertReviewReady(workspace: Workspace): void {
  invariant(workspace.analysis && workspace.analysis.contentVersion === workspace.contentVersion, 409, "ANALYSIS_REQUIRED", "Analyze the current evidence version before requesting client approval.");
  invariant(workspace.analysis.findings.length === workspace.requirements.length && workspace.analysis.findings.every(finding => finding.status === "met"), 409, "DELIVERY_NOT_READY", "Resolve the missing, partial, or uncertain requirements before requesting approval.");
}

export function assertInvoiceReady(workspace: Workspace, now = Date.now()): void {
  assertReviewReady(workspace);
  const approval = workspace.approval;
  invariant(approval?.status === "accepted", 409, "CLIENT_APPROVAL_REQUIRED", "The client must explicitly accept this delivery before an invoice can be created.");
  // Expiration limits token acceptance; an already accepted exact version stays approved.
  invariant(Boolean(approval.acceptedAt) && Date.parse(approval.acceptedAt!) <= now, 409, "CLIENT_APPROVAL_REQUIRED", "A valid client acceptance is required.");
  invariant(approval.contentVersion === workspace.contentVersion && approval.analysisId === workspace.analysis!.id, 409, "STALE_APPROVAL", "The approval belongs to an earlier evidence or analysis version.");
  invariant(approval.amountMinor === workspace.project.amountMinor && approval.currency === workspace.project.currency, 409, "APPROVED_PRICE_CHANGED", "The milestone price differs from the client-approved price.");
  invariant(workspace.project.amountMinor > 0 && Number.isSafeInteger(workspace.project.amountMinor) && workspace.project.currency === "USD", 422, "INVALID_PRICE", "This prototype requires a positive fixed USD price.");
}

export function assertSamplePayment(workspace: Workspace, mode: PaymentMode): void {
  invariant(mode === "sample", 403, "SAMPLE_PAYMENT_DISABLED", "Simulated payment is disabled when PayPal is configured.");
  assertInvoiceReady(workspace);
  invariant(workspace.invoice?.provider === "sample", 409, "SAMPLE_INVOICE_REQUIRED", "Create a sample invoice before simulating payment.");
  invariant(workspace.invoice.approvalId === workspace.approval!.id && workspace.invoice.contentVersion === workspace.contentVersion && workspace.invoice.amountMinor === workspace.approval!.amountMinor && workspace.invoice.currency === workspace.approval!.currency, 409, "INVOICE_VERSION_MISMATCH", "The sample invoice differs from the approved delivery.");
  invariant(["unpaid", "paid"].includes(workspace.invoice.status), 409, "INVOICE_NOT_PAYABLE", "This sample invoice cannot receive payment.");
}

export function configuredPaymentMode(config: { PAYPAL_CLIENT_ID?: string; PAYPAL_CLIENT_SECRET?: string; PAYPAL_INVOICER_EMAIL?: string; PAYPAL_WEBHOOK_ID?: string; PROOFPAY_PAYMENT_MODE?: string }): PaymentMode {
  if (config.PROOFPAY_PAYMENT_MODE && !["sample", "paypal_sandbox"].includes(config.PROOFPAY_PAYMENT_MODE)) return "unavailable";
  const any = Boolean(config.PAYPAL_CLIENT_ID || config.PAYPAL_CLIENT_SECRET || config.PAYPAL_INVOICER_EMAIL || config.PAYPAL_WEBHOOK_ID);
  if (any || config.PROOFPAY_PAYMENT_MODE === "paypal_sandbox") return config.PAYPAL_CLIENT_ID && config.PAYPAL_CLIENT_SECRET && config.PAYPAL_INVOICER_EMAIL && config.PAYPAL_WEBHOOK_ID ? "paypal_sandbox" : "unavailable";
  return "sample";
}
