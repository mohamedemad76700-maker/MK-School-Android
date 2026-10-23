ALTER TABLE exam_sessions
  ADD COLUMN IF NOT EXISTS retry_pending BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS retry_answers JSONB,
  ADD COLUMN IF NOT EXISTS retry_wrong_indexes JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_sessions_retry_answers_array' AND conrelid = 'exam_sessions'::regclass) THEN
    ALTER TABLE exam_sessions ADD CONSTRAINT exam_sessions_retry_answers_array
      CHECK (retry_answers IS NULL OR jsonb_typeof(retry_answers) = 'array');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_sessions_retry_wrong_indexes_array' AND conrelid = 'exam_sessions'::regclass) THEN
    ALTER TABLE exam_sessions ADD CONSTRAINT exam_sessions_retry_wrong_indexes_array
      CHECK (jsonb_typeof(retry_wrong_indexes) = 'array');
  END IF;
END $$;
