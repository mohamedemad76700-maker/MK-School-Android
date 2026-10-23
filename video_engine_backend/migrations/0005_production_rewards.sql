CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_point_event
  ON platform_point_ledger(student_id, reason);

CREATE INDEX IF NOT EXISTS idx_platform_redemptions_student
  ON platform_redemptions(student_id, created_at DESC);
