import { database } from "./config";
import { AppError, invariant } from "./errors";
import { seedWorkspace } from "./seed";
import type { Workspace } from "./types";

export interface InvoiceOperation {
  requestId: string;
  sendRequestId: string;
  lockUntil: number;
  attemptId?: string;
  clientEmail?: string;
  payload?: Record<string, unknown>;
  approvalId: string;
  contentVersion: number;
  paypalInvoiceId?: string;
}

export interface StoredWorkspace {
  workspace: Workspace;
  invoiceOperation?: InvoiceOperation;
}

interface WorkspaceRow { owner_id: string; workspace_id: string; revision: number; data_json: string }
export interface ReviewTokenRow { token_hash: string; owner_id: string; workspace_id: string; approval_id: string; content_version: number; expires_at: string }

export async function readWorkspace(ownerId: string): Promise<StoredWorkspace> {
  const db = database();
  let row = await db.prepare("SELECT owner_id, workspace_id, revision, data_json FROM proofpay_workspaces WHERE owner_id = ?").bind(ownerId).first<WorkspaceRow>();
  if (!row) {
    const workspace = seedWorkspace();
    await db.prepare("INSERT OR IGNORE INTO proofpay_workspaces (owner_id, workspace_id, revision, data_json, updated_at) VALUES (?, ?, 0, ?, ?)").bind(ownerId, workspace.id, JSON.stringify({ workspace }), new Date().toISOString()).run();
    row = await db.prepare("SELECT owner_id, workspace_id, revision, data_json FROM proofpay_workspaces WHERE owner_id = ?").bind(ownerId).first<WorkspaceRow>();
  }
  invariant(row, 503, "STORAGE_UNAVAILABLE", "The workspace could not be loaded.");
  const stored = JSON.parse(row.data_json) as StoredWorkspace;
  stored.workspace.revision = row.revision;
  return stored;
}

export async function findWorkspaceById(workspaceId: string): Promise<{ ownerId: string; stored: StoredWorkspace } | null> {
  const row = await database().prepare("SELECT owner_id, workspace_id, revision, data_json FROM proofpay_workspaces WHERE workspace_id = ?").bind(workspaceId).first<WorkspaceRow>();
  if (!row) return null;
  const stored = JSON.parse(row.data_json) as StoredWorkspace;
  stored.workspace.revision = row.revision;
  return { ownerId: row.owner_id, stored };
}

export async function findWorkspaceByInvoice(invoiceId: string): Promise<{ ownerId: string; stored: StoredWorkspace } | null> {
  const row = await database().prepare("SELECT owner_id, workspace_id, revision, data_json FROM proofpay_workspaces WHERE json_extract(data_json, '$.invoiceOperation.paypalInvoiceId') = ?").bind(invoiceId).first<WorkspaceRow>();
  if (!row) return null;
  const stored = JSON.parse(row.data_json) as StoredWorkspace;
  stored.workspace.revision = row.revision;
  return { ownerId: row.owner_id, stored };
}

export async function commit(ownerId: string, stored: StoredWorkspace, expectedRevision: number): Promise<StoredWorkspace> {
  stored.workspace.revision = expectedRevision + 1;
  const result = await database().prepare("UPDATE proofpay_workspaces SET revision = ?, data_json = ?, updated_at = ? WHERE owner_id = ? AND revision = ?")
    .bind(expectedRevision + 1, JSON.stringify(stored), new Date().toISOString(), ownerId, expectedRevision).run();
  if (result.meta.changes !== 1) throw new AppError(409, "WORKSPACE_CHANGED", "The workspace changed in another tab. Refresh and try again.");
  return stored;
}

export async function mutate(ownerId: string, fn: (stored: StoredWorkspace) => void): Promise<StoredWorkspace> {
  // Mutation callbacks must be synchronous and free of external side effects.
  const stored = await readWorkspace(ownerId);
  const revision = stored.workspace.revision;
  fn(stored);
  stored.workspace.activity = stored.workspace.activity.slice(-80);
  return commit(ownerId, stored, revision);
}

export async function getReviewToken(tokenHash: string): Promise<ReviewTokenRow | null> {
  return database().prepare("SELECT * FROM proofpay_review_tokens WHERE token_hash = ?").bind(tokenHash).first<ReviewTokenRow>();
}

export async function saveReviewToken(tokenHash: string, ownerId: string, stored: StoredWorkspace): Promise<void> {
  const w = stored.workspace;
  invariant(w.approval, 409, "APPROVAL_MISSING", "Create an approval request first.");
  await database().prepare("INSERT INTO proofpay_review_tokens (token_hash, owner_id, workspace_id, approval_id, content_version, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(tokenHash, ownerId, w.id, w.approval.id, w.contentVersion, w.approval.expiresAt, new Date().toISOString()).run();
}

export async function eventAlreadyProcessed(eventId: string): Promise<boolean> {
  return Boolean(await database().prepare("SELECT event_id FROM proofpay_webhook_events WHERE event_id = ?").bind(eventId).first());
}

export async function markEventProcessed(eventId: string, invoiceId: string): Promise<void> {
  await database().prepare("INSERT OR IGNORE INTO proofpay_webhook_events (event_id, invoice_id, processed_at) VALUES (?, ?, ?)").bind(eventId, invoiceId, new Date().toISOString()).run();
}
