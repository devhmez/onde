CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`action` text NOT NULL,
	`details` text
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`business_name` text,
	`governorate` text,
	`city` text,
	`address` text,
	`discount_available` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_phone_unique` ON `customers` (`phone`);--> statement-breakpoint
CREATE TABLE `destination_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tag_id` integer NOT NULL,
	`from_type` text,
	`from_url` text,
	`to_type` text NOT NULL,
	`to_url` text NOT NULL,
	`changed_at` integer NOT NULL,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`product_id` integer,
	`product_name` text NOT NULL,
	`kind` text NOT NULL,
	`unit_price` integer NOT NULL,
	`qty` integer NOT NULL,
	`line_total` integer NOT NULL,
	`business_name` text,
	`destination_url` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`number` text NOT NULL,
	`customer_id` integer NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`channel` text DEFAULT 'web' NOT NULL,
	`locale` text DEFAULT 'fr' NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`governorate` text NOT NULL,
	`city` text NOT NULL,
	`address` text NOT NULL,
	`notes` text,
	`subtotal` integer NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`discount_reason` text,
	`delivery_fee` integer NOT NULL,
	`total` integer NOT NULL,
	`payment_method` text DEFAULT 'cod' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number_unique` ON `orders` (`number`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_created_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE TABLE `page_views` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`path` text NOT NULL,
	`locale` text,
	`device` text,
	`referrer` text,
	`visitor` text
);
--> statement-breakpoint
CREATE INDEX `pv_ts_idx` ON `page_views` (`ts`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`kind` text NOT NULL,
	`name_en` text NOT NULL,
	`name_fr` text NOT NULL,
	`tagline_en` text DEFAULT '' NOT NULL,
	`tagline_fr` text DEFAULT '' NOT NULL,
	`desc_en` text DEFAULT '' NOT NULL,
	`desc_fr` text DEFAULT '' NOT NULL,
	`price` integer NOT NULL,
	`compare_at` integer,
	`image` text NOT NULL,
	`model` text,
	`active` integer DEFAULT true NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`kind` text NOT NULL,
	`customer_id` integer,
	`order_id` integer,
	`destination_type` text DEFAULT 'google_review' NOT NULL,
	`destination_url` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`tap_count` integer DEFAULT 0 NOT NULL,
	`last_tap_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_code_unique` ON `tags` (`code`);--> statement-breakpoint
CREATE INDEX `tags_customer_idx` ON `tags` (`customer_id`);--> statement-breakpoint
CREATE TABLE `taps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tag_id` integer NOT NULL,
	`ts` integer NOT NULL,
	`source` text NOT NULL,
	`device` text NOT NULL,
	`referer` text,
	`ip_hash` text,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `taps_tag_ts_idx` ON `taps` (`tag_id`,`ts`);--> statement-breakpoint
CREATE INDEX `taps_ts_idx` ON `taps` (`ts`);