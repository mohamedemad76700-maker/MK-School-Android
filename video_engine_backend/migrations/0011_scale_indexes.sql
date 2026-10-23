-- Additive query indexes for school account, exam, video-job and points lookups.
-- The migration is safe to run on every startup and does not rewrite school records.
CREATE INDEX IF NOT EXISTS idx_video_users_role_active ON video_users(role, active);
CREATE INDEX IF NOT EXISTS idx_video_jobs_video_status ON video_jobs(video_id, status);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_exam_date ON exam_submissions(exam_id, submitted_at DESC);
-- Class selection has been removed; keep the grade/date lookup without the retired field.
CREATE INDEX IF NOT EXISTS idx_exam_submissions_grade_date ON exam_submissions(grade, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_link_codes_student_expiry ON parent_link_codes(student_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_points_ledger_student_created ON platform_point_ledger(student_id, created_at DESC);
