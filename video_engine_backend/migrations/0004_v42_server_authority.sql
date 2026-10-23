ALTER TABLE platform_state ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE platform_state ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_video_users_email_lower ON video_users ((lower(email)));
