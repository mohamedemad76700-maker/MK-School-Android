CREATE TABLE IF NOT EXISTS video_user_profiles (
  user_id VARCHAR(255) PRIMARY KEY REFERENCES video_users(id) ON DELETE CASCADE,
  profile_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_video_user_profiles_updated ON video_user_profiles(updated_at DESC);
