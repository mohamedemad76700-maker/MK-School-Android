-- Remove the retired teacher role, invalidate its sessions, and clean legacy platform state.
CREATE OR REPLACE FUNCTION jsonb_remove_teacher_accounts(value JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT CASE jsonb_typeof(value)
    WHEN 'object' THEN COALESCE((
      SELECT jsonb_object_agg(
        key,
        CASE WHEN lower(key) IN ('teacher', 'teacherid')
          THEN to_jsonb('admin'::TEXT)
          WHEN lower(key) = 'teachername'
          THEN to_jsonb('إدارة المنصة'::TEXT)
          ELSE jsonb_remove_teacher_accounts(nested)
        END
      )
      FROM jsonb_each(value) AS entries(key, nested)
      WHERE lower(key) NOT IN ('teachers', 'teachernotes')
    ), '{}'::JSONB)
    WHEN 'array' THEN COALESCE((
      SELECT jsonb_agg(jsonb_remove_teacher_accounts(item) ORDER BY ordinal)
      FROM jsonb_array_elements(value) WITH ORDINALITY AS entries(item, ordinal)
    ), '[]'::JSONB)
    ELSE value
  END
$$;

UPDATE platform_state_items
SET item_value = jsonb_remove_teacher_accounts(item_value)
WHERE item_value::TEXT ~* '"(teachers|teacherNotes|teacherId|teacher|teacherName)"';

UPDATE platform_state_collections
SET scalar_value = jsonb_remove_teacher_accounts(scalar_value)
WHERE scalar_value IS NOT NULL
  AND scalar_value::TEXT ~* '"(teachers|teacherNotes|teacherId|teacher|teacherName)"';

UPDATE platform_state
SET state = jsonb_remove_teacher_accounts(state)
WHERE state::TEXT ~* '"(teachers|teacherNotes|teacherId|teacher|teacherName)"';

UPDATE exam_submissions SET teacher_id = NULL WHERE teacher_id IN (
  SELECT id FROM video_users WHERE role = 'teacher'
);

DELETE FROM account_devices WHERE user_id IN (
  SELECT id FROM video_users WHERE role = 'teacher'
);

DELETE FROM video_users WHERE role = 'teacher';

DROP FUNCTION jsonb_remove_teacher_accounts(JSONB);
