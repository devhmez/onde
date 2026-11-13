CREATE TABLE `push_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`origin` text NOT NULL,
	`label` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`last_seen_at` integer,
	`last_success_at` integer,
	`last_error` text,
	`failures` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE TABLE `vapid_keys` (
	`id` integer PRIMARY KEY NOT NULL,
	`public_key` text NOT NULL,
	`private_key` text NOT NULL,
	`subject` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
-- Telegram alerts were replaced by Web Push: drop the old bot token / chat id (secrets nobody uses any more).
DELETE FROM `settings` WHERE `key` IN ('telegramBotToken', 'telegramChatId');
