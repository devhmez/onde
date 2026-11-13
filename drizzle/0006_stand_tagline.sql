-- White stand tagline (Oct 2026): Google forbids asking for a specific rating, and the guides say so, so the tagline no
-- longer promises "5 stars". Only the original seed wording is touched: a tagline the owner already edited in
-- admin → Catalog is left alone, and running it twice changes nothing.
UPDATE `products` SET `tagline_fr` = 'Un tap. Un avis Google de plus.' WHERE `tagline_fr` = 'Un tap. Un avis Google 5 étoiles de plus.';--> statement-breakpoint
UPDATE `products` SET `tagline_en` = 'One tap. One more Google review.' WHERE `tagline_en` = 'One tap. One more 5-star Google review.';
