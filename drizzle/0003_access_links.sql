CREATE TABLE `access_link` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token` text NOT NULL,
	`label` text NOT NULL,
	`duration_hours` integer NOT NULL,
	`first_visited_at` text,
	`expires_at` text,
	`session_token` text,
	`revoked_at` text,
	`created_by` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_link_token_idx` ON `access_link` (`token`);