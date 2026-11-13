ALTER TABLE `products` ADD `sale_price` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `sale_ends_at` integer;--> statement-breakpoint
-- Launch promo on the review stands (databases seeded before this migration had them at a flat 59 DT):
-- regular price 69 DT, 59 DT until 10 Nov 2026 23:59:59 Tunis time, then back to 69 DT automatically.
UPDATE `products` SET `price` = 69000, `sale_price` = 59000, `sale_ends_at` = 1794351599000 WHERE `slug` IN ('stand-white', 'stand-black') AND `price` = 59000 AND `sale_price` IS NULL;
