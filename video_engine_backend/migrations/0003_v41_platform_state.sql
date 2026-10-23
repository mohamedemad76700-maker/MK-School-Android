CREATE TABLE IF NOT EXISTS platform_state (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
