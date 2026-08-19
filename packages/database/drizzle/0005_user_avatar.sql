ALTER TABLE users ADD COLUMN avatar_url text;
--> statement-breakpoint
ALTER TABLE users ADD CONSTRAINT users_avatar_url_length_check
CHECK (avatar_url IS NULL OR length(avatar_url) <= 2048);
