-- Keep administrator-issued extra plays separate from the normal three-view counter,
-- so resetting ordinary view counters does not erase an explicit grant.
CREATE TABLE IF NOT EXISTS student_video_view_grants (
  student_id VARCHAR(255) NOT NULL,
  video_id VARCHAR(255) NOT NULL,
  granted_views INT NOT NULL DEFAULT 0 CHECK (granted_views BETWEEN 0 AND 500),
  used_views INT NOT NULL DEFAULT 0 CHECK (used_views >= 0 AND used_views <= granted_views),
  granted_by VARCHAR(255) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_student_video_view_grants_video
  ON student_video_view_grants(video_id);
