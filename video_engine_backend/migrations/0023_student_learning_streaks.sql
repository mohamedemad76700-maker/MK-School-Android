CREATE TABLE IF NOT EXISTS student_learning_activity_days (
  student_id VARCHAR(255) NOT NULL REFERENCES video_users(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, activity_date)
);

CREATE INDEX IF NOT EXISTS idx_student_learning_activity_days_recent
  ON student_learning_activity_days(student_id, activity_date DESC);
