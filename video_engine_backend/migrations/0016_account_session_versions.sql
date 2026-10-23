ALTER TABLE video_users
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'video_users_session_version_positive'
      AND conrelid = 'video_users'::regclass
  ) THEN
    ALTER TABLE video_users
      ADD CONSTRAINT video_users_session_version_positive
      CHECK (session_version > 0);
  END IF;
END $$;
