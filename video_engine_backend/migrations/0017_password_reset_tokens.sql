CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES video_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
  ON password_reset_tokens (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expiry
  ON password_reset_tokens (expires_at);
