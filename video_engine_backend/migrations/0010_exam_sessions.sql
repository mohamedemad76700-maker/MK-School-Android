CREATE TABLE IF NOT EXISTS exam_sessions (
  student_id VARCHAR(255) NOT NULL REFERENCES video_users(id) ON DELETE CASCADE,
  exam_id VARCHAR(255) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  PRIMARY KEY(student_id, exam_id),
  CHECK (expires_at > started_at)
);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_expiry ON exam_sessions(expires_at);
