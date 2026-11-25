CREATE TABLE `analytics_event` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`visitor_id` text NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text,
	`kind` text NOT NULL,
	`path` text NOT NULL,
	`target` text,
	`source` text,
	`device` text,
	`browser` text,
	`os` text,
	`country` text,
	`load_ms` integer,
	`time_on_page_ms` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `analytics_event_created_idx` ON `analytics_event` (`created_at`);--> statement-breakpoint
CREATE INDEX `analytics_event_session_idx` ON `analytics_event` (`session_id`);--> statement-breakpoint
CREATE INDEX `analytics_event_user_idx` ON `analytics_event` (`user_id`);