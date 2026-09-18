CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`revoked_reason` text,
	`last_seen_at` text DEFAULT (current_timestamp) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
-- Data backfill, hand-added: drizzle-kit generates schema changes, and this is
-- a change to the rows. It alters no structure, so the 0002 snapshot stays
-- accurate and the next `npm run gen` still diffs cleanly.
--
-- Emails are stored lowercased from here on (see users.email). Existing rows
-- have to be brought in line or the same account exists twice, once per
-- capitalisation. Rows whose lowercase form is already taken are left exactly
-- as they are: that is two real accounts for one mailbox, and merging them is
-- a decision about whose data survives, not something a migration should
-- silently make. They keep working; the site owner can reconcile them.
UPDATE users
SET email = lower(email)
WHERE email IS NOT NULL
  AND email <> lower(email)
  AND NOT EXISTS (
    SELECT 1 FROM users existing WHERE existing.email = lower(users.email)
  );
