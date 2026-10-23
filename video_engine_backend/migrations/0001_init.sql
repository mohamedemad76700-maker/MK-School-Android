CREATE TABLE IF NOT EXISTS student_video_views (
    student_id VARCHAR(255) NOT NULL,
    video_id VARCHAR(255) NOT NULL,
    view_count INT NOT NULL DEFAULT 0 CHECK (view_count >= 0 AND view_count <= 3),
    PRIMARY KEY (student_id, video_id)
);

CREATE TABLE IF NOT EXISTS video_users (
    id VARCHAR(255) PRIMARY KEY,
    role VARCHAR(32) NOT NULL,
    email VARCHAR(320),
    password TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_video_users_email ON video_users (lower(email));
