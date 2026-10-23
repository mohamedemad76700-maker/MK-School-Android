ALTER TABLE exam_submissions
  ADD COLUMN IF NOT EXISTS review_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS forfeited BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_submissions_review_array' AND conrelid = 'exam_submissions'::regclass) THEN
    ALTER TABLE exam_submissions ADD CONSTRAINT exam_submissions_review_array
      CHECK (jsonb_typeof(review_data) = 'array');
  END IF;
END $$;
