ALTER TABLE `tags` ADD `chip_status` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `tags` ADD `chip_at` integer;--> statement-breakpoint
-- Chips that already answered a real NFC tap (taps.source = 'nfc') were written and work: mark them "tested", dated by
-- their first NFC tap. Everything else starts as "none" (not written yet) and is set from the admin.
UPDATE `tags` SET `chip_status` = 'tested', `chip_at` = (SELECT min(`ts`) FROM `taps` WHERE `taps`.`tag_id` = `tags`.`id` AND `taps`.`source` = 'nfc') WHERE EXISTS (SELECT 1 FROM `taps` WHERE `taps`.`tag_id` = `tags`.`id` AND `taps`.`source` = 'nfc');
