CREATE TABLE `portal_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`from_type` text,
	`from_url` text,
	`to_type` text NOT NULL,
	`to_url` text NOT NULL,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `portal_requests_customer_idx` ON `portal_requests` (`customer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `portal_requests_tag_idx` ON `portal_requests` (`tag_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `portal_requests_one_pending` ON `portal_requests` (`tag_id`) WHERE "portal_requests"."status" = 'pending';--> statement-breakpoint
ALTER TABLE `customers` ADD `portal_token` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `portal_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `portal_mode` text DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `portal_created_at` integer;--> statement-breakpoint
ALTER TABLE `customers` ADD `portal_seen_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `customers_portal_token_unique` ON `customers` (`portal_token`);--> statement-breakpoint
ALTER TABLE `destination_history` ADD `actor` text;--> statement-breakpoint
ALTER TABLE `tags` ADD `location_label` text;--> statement-breakpoint
ALTER TABLE `tags` ADD `customer_since` integer;