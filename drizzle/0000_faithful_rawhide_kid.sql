CREATE TABLE `proofpay_review_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`approval_id` text NOT NULL,
	`content_version` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `proofpay_webhook_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`processed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `proofpay_workspaces` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`data_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proofpay_workspaces_workspace_id_unique` ON `proofpay_workspaces` (`workspace_id`);