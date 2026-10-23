CREATE TABLE IF NOT EXISTS exam_submissions (
  submission_id BIGSERIAL PRIMARY KEY,
  student_id VARCHAR(255) NOT NULL REFERENCES video_users(id) ON DELETE CASCADE,
  exam_id VARCHAR(255) NOT NULL,
  teacher_id VARCHAR(255),
  grade VARCHAR(255),
  class_id VARCHAR(255),
  subject VARCHAR(255),
  title VARCHAR(255),
  score NUMERIC(10,2) NOT NULL CHECK (score >= 0),
  max_score NUMERIC(10,2) NOT NULL CHECK (max_score > 0),
  percentage INTEGER NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, exam_id)
);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_teacher_grade ON exam_submissions(teacher_id, grade, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_student_date ON exam_submissions(student_id, submitted_at DESC);
