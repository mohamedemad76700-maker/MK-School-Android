ALTER TABLE video_users
  ADD COLUMN IF NOT EXISTS parent_phone VARCHAR(32);

ALTER TABLE course_enrollments
  ADD COLUMN IF NOT EXISTS enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS course_lesson_watch_progress (
  course_id VARCHAR(255) NOT NULL REFERENCES course_catalog(course_id) ON DELETE CASCADE,
  student_id VARCHAR(255) NOT NULL REFERENCES video_users(id) ON DELETE CASCADE,
  lesson_index INTEGER NOT NULL CHECK (lesson_index >= 0),
  watched_seconds INTEGER NOT NULL DEFAULT 0 CHECK (watched_seconds >= 0),
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  last_position_seconds INTEGER NOT NULL DEFAULT 0 CHECK (last_position_seconds >= 0),
  heartbeat_at TIMESTAMPTZ,
  playing BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, student_id, lesson_index)
);

CREATE INDEX IF NOT EXISTS idx_lesson_watch_student_course
  ON course_lesson_watch_progress(student_id, course_id, completed_at);
