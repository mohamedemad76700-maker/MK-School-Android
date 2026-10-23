-- Admin accounts may stay signed in on multiple trusted devices. Other roles keep
-- the existing single-active-device check in the login handler.
DO $$
DECLARE
  primary_key_columns TEXT[];
BEGIN
  SELECT array_agg(attribute.attname ORDER BY key_column.ordinality)
    INTO primary_key_columns
  FROM pg_constraint constraint_row
  CROSS JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY AS key_column(attnum, ordinality)
  JOIN pg_attribute attribute ON attribute.attrelid = constraint_row.conrelid AND attribute.attnum = key_column.attnum
  WHERE constraint_row.conrelid = 'account_devices'::regclass AND constraint_row.contype = 'p';

  IF primary_key_columns IS DISTINCT FROM ARRAY['user_id','device_hash']::TEXT[] THEN
    ALTER TABLE account_devices DROP CONSTRAINT IF EXISTS account_devices_pkey;
    ALTER TABLE account_devices ADD PRIMARY KEY (user_id, device_hash);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_account_devices_user_active_seen
  ON account_devices(user_id, active, last_seen_at DESC);

-- Private, administrator-published library material uses the hardened school-file store.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'school_files'::regclass
      AND conname = 'school_files_purpose_check'
      AND pg_get_constraintdef(oid) LIKE '%platform-library%'
  ) THEN
    ALTER TABLE school_files DROP CONSTRAINT IF EXISTS school_files_purpose_check;
    ALTER TABLE school_files ADD CONSTRAINT school_files_purpose_check
      CHECK (purpose IN ('student-file','course-cover','course-file','payment-receipt','exam-question','platform-library'));
  END IF;
END $$;
