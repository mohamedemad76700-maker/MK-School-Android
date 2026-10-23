CREATE TABLE IF NOT EXISTS parent_link_codes (
  code_hash CHAR(64) PRIMARY KEY,
  student_id VARCHAR(255) NOT NULL REFERENCES video_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_parent_link_codes_expiry ON parent_link_codes(expires_at);
