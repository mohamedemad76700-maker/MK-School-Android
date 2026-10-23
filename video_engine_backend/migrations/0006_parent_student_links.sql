CREATE TABLE IF NOT EXISTS parent_student_links (
  parent_id VARCHAR(255) NOT NULL REFERENCES video_users(id) ON DELETE CASCADE,
  student_id VARCHAR(255) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(parent_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_parent_student_links_student ON parent_student_links(student_id, active);
