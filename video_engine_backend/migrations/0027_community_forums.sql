CREATE TABLE IF NOT EXISTS community_spaces (
  space_id VARCHAR(128) PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(2000) NOT NULL DEFAULT '',
  course_id VARCHAR(128),
  teacher_name VARCHAR(160) NOT NULL DEFAULT '',
  visibility VARCHAR(10) NOT NULL CHECK (visibility IN ('public','private')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_community_spaces_course_active ON community_spaces(course_id,active,visibility);

CREATE TABLE IF NOT EXISTS community_replies (
  reply_id VARCHAR(128) PRIMARY KEY,
  topic_id VARCHAR(128) NOT NULL,
  parent_reply_id VARCHAR(128),
  author_id VARCHAR(255) NOT NULL,
  author_role VARCHAR(16) NOT NULL CHECK (author_role IN ('admin','student','parent')),
  author_name VARCHAR(120) NOT NULL,
  body VARCHAR(4000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(255)
);
CREATE INDEX IF NOT EXISTS idx_community_replies_topic_created ON community_replies(topic_id,created_at,reply_id);
CREATE INDEX IF NOT EXISTS idx_community_replies_parent ON community_replies(parent_reply_id);

CREATE TABLE IF NOT EXISTS community_topic_controls (
  topic_id VARCHAR(128) PRIMARY KEY,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by VARCHAR(255) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_member_bans (
  user_id VARCHAR(255) PRIMARY KEY,
  banned_by VARCHAR(255) NOT NULL,
  reason VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_by VARCHAR(255),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_community_member_bans_active ON community_member_bans(user_id) WHERE revoked_at IS NULL;

INSERT INTO community_spaces(space_id,title,description,visibility,active,created_by)
VALUES('general','المنتدى العام','مساحة عامة لأسئلة المنصة ومشاركة المعرفة.','public',TRUE,'system')
ON CONFLICT(space_id) DO NOTHING;
