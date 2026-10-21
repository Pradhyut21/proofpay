import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const proofpayWorkspaces = sqliteTable("proofpay_workspaces", {
  ownerId: text("owner_id").primaryKey(),
  workspaceId: text("workspace_id").notNull().unique(),
  revision: integer("revision").notNull().default(0),
  dataJson: text("data_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const proofpayReviewTokens = sqliteTable("proofpay_review_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  ownerId: text("owner_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  approvalId: text("approval_id").notNull(),
  contentVersion: integer("content_version").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const proofpayWebhookEvents = sqliteTable("proofpay_webhook_events", {
  eventId: text("event_id").primaryKey(),
  invoiceId: text("invoice_id").notNull(),
  processedAt: text("processed_at").notNull(),
});
