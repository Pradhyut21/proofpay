export type RequirementStatus = "met" | "partial" | "missing" | "uncertain";
export type ProviderMode = "sample" | "gemini";
export type PaymentMode = "sample" | "paypal_sandbox" | "unavailable";

export interface Requirement {
  id: string;
  title: string;
  description: string;
  sourceQuote: string;
}

export interface Evidence {
  id: string;
  title: string;
  kind: "delivery_note" | "test_report" | "client_message" | "other";
  text: string;
  createdAt: string;
}

export interface Citation { evidenceId: string; quote: string }
export interface Finding {
  requirementId: string;
  status: RequirementStatus;
  reason: string;
  citations: Citation[];
}

export interface Analysis {
  id: string;
  contentVersion: number;
  provider: ProviderMode;
  model: string;
  createdAt: string;
  readiness: number;
  summary: string;
  findings: Finding[];
  limitations: string[];
}

export interface Approval {
  id: string;
  status: "pending" | "accepted" | "stale" | "expired";
  contentVersion: number;
  analysisId: string;
  amountMinor: number;
  currency: string;
  expiresAt: string;
  acceptedAt?: string;
  clientName?: string;
}

export interface Invoice {
  id: string;
  provider: "sample" | "paypal_sandbox";
  status: "creating" | "draft" | "unpaid" | "pending" | "partially_paid" | "paid" | "refunded" | "partially_refunded" | "cancelled" | "recorded_externally" | "failed";
  paypalStatus?: string;
  amountMinor: number;
  currency: string;
  paidMinor: number;
  contentVersion: number;
  approvalId: string;
  createdAt: string;
  updatedAt: string;
  paymentUrl?: string;
  paymentId?: string;
  message?: string;
}

export interface Activity {
  id: string;
  at: string;
  type: "project" | "requirement" | "evidence" | "analysis" | "approval" | "invoice" | "payment";
  message: string;
}

export interface Workspace {
  id: string;
  revision: number;
  contentVersion: number;
  project: {
    name: string;
    client: string;
    clientEmail: string;
    milestone: string;
    amountMinor: number;
    currency: string;
    brief: string;
    dueDate: string;
  };
  requirements: Requirement[];
  evidence: Evidence[];
  analysis: Analysis | null;
  approval: Approval | null;
  invoice: Invoice | null;
  activity: Activity[];
}

export interface AppConfig {
  aiMode: ProviderMode;
  aiModel: string;
  paymentMode: PaymentMode;
  authenticated: boolean;
  localDemo: boolean;
  signInUrl: string;
  capabilities: { analyze: boolean; invoice: boolean; samplePayment: boolean };
  notices: string[];
}

export interface ReviewSnapshot {
  workspaceId: string;
  project: Workspace["project"];
  contentVersion: number;
  requirements: Requirement[];
  evidence: Evidence[];
  analysis: Analysis;
  approval: Approval;
  invoice: Invoice | null;
  paymentMode: PaymentMode;
}

export interface ApiError { error: string; code: string }

// GET /api/config -> AppConfig. All workspace mutations return Workspace.
// GET /api/workspace -> Workspace (automatically seeds this seller's sample).
// POST /api/workspace/reset -> Workspace; body {} (sample replay allowed; real invoice blocks reset).
// POST /api/requirements -> Workspace; body { text: string }.
// POST /api/evidence -> Workspace; body { title, text, kind? }.
// POST /api/analyze -> Workspace; body {}.
// POST /api/approval/link -> { workspace: Workspace, url: string, expiresAt: string }.
// GET /api/review/[token] -> ReviewSnapshot (scoped public bearer link).
// POST /api/review/[token]/accept -> ReviewSnapshot; body { clientName: string }.
// POST /api/invoice -> Workspace; body { clientEmail?: string }.
// POST /api/invoice/refresh -> Workspace; body {}.
// POST /api/demo/pay -> Workspace; body {}; only explicitly isolated sample mode.
// Errors: { error, code }; 401 signin, 409 stale/version/busy, 422 validation.
