ALTER TABLE platform_redemptions
  ADD COLUMN IF NOT EXISTS claim_code_hash CHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_redemptions_claim_code
  ON platform_redemptions(claim_code_hash)
  WHERE claim_code_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS course_lesson_completions (
  course_id VARCHAR(255) NOT NULL,
  student_id VARCHAR(255) NOT NULL REFERENCES video_users(id) ON DELETE CASCADE,
  lesson_index INTEGER NOT NULL CHECK (lesson_index >= 0),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, student_id, lesson_index)
);

CREATE INDEX IF NOT EXISTS idx_course_lesson_completions_student
  ON course_lesson_completions(student_id, course_id);
