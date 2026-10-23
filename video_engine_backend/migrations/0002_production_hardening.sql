CREATE TABLE IF NOT EXISTS video_access (
  student_id VARCHAR(255) NOT NULL,
  video_id VARCHAR(255) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_video_access_video ON video_access(video_id, active);

CREATE TABLE IF NOT EXISTS video_jobs (
  job_id VARCHAR(255) PRIMARY KEY,
  video_id VARCHAR(255) NOT NULL,
  input_path TEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  original_name TEXT NOT NULL,
  playlist TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_video_jobs_status ON video_jobs(status, updated_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id VARCHAR(255),
  action VARCHAR(128) NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS course_catalog (
  course_id VARCHAR(255) PRIMARY KEY,
  kind VARCHAR(16) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS course_videos (
  course_id VARCHAR(255) NOT NULL REFERENCES course_catalog(course_id) ON DELETE CASCADE,
  video_id VARCHAR(255) NOT NULL,
  PRIMARY KEY(course_id, video_id)
);
CREATE TABLE IF NOT EXISTS course_enrollments (
  course_id VARCHAR(255) NOT NULL REFERENCES course_catalog(course_id) ON DELETE CASCADE,
  student_id VARCHAR(255) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(course_id, student_id)
);

CREATE TABLE IF NOT EXISTS account_devices (
  user_id VARCHAR(255) PRIMARY KEY,
  device_hash VARCHAR(128) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_account_devices_active ON account_devices(active);

CREATE TABLE IF NOT EXISTS platform_rewards (
  id VARCHAR(255) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  points_cost INT NOT NULL CHECK(points_cost > 0),
  stock INT NOT NULL DEFAULT -1,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS platform_points (
  student_id VARCHAR(255) PRIMARY KEY,
  balance INT NOT NULL DEFAULT 0 CHECK(balance >= 0),
  lifetime_earned INT NOT NULL DEFAULT 0 CHECK(lifetime_earned >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS platform_point_ledger (
  id BIGSERIAL PRIMARY KEY,
  student_id VARCHAR(255) NOT NULL,
  delta INT NOT NULL,
  reason VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS platform_redemptions (
  id BIGSERIAL PRIMARY KEY,
  reward_id VARCHAR(255) NOT NULL REFERENCES platform_rewards(id),
  student_id VARCHAR(255) NOT NULL,
  points_cost INT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'approved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

