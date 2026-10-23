-- Permanently remove classroom/section data and references from the school platform.
CREATE OR REPLACE FUNCTION jsonb_remove_class_fields(value JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT CASE jsonb_typeof(value)
    WHEN 'object' THEN COALESCE((
      SELECT jsonb_object_agg(key, jsonb_remove_class_fields(nested))
      FROM jsonb_each(value) AS entries(key, nested)
      WHERE lower(key) NOT IN ('classes', 'classid', 'class_id')
    ), '{}'::jsonb)
    WHEN 'array' THEN COALESCE((
      SELECT jsonb_agg(jsonb_remove_class_fields(item) ORDER BY ordinal)
      FROM jsonb_array_elements(value) WITH ORDINALITY AS entries(item, ordinal)
    ), '[]'::jsonb)
    ELSE value
  END
$$;

DELETE FROM platform_state_collections WHERE collection_key = 'classes';
UPDATE platform_state_items
SET item_value = jsonb_remove_class_fields(item_value)
WHERE item_value::text ~* '"(classes|classId|class_id)"';
UPDATE platform_state_collections
SET scalar_value = jsonb_remove_class_fields(scalar_value)
WHERE scalar_value IS NOT NULL AND scalar_value::text ~* '"(classes|classId|class_id)"';
UPDATE platform_state
SET state = jsonb_remove_class_fields(state)
WHERE state::text ~* '"(classes|classId|class_id)"';
UPDATE video_user_profiles
SET profile_data = jsonb_remove_class_fields(profile_data)
WHERE profile_data::text ~* '"(classes|classId|class_id)"';

DROP INDEX IF EXISTS idx_exam_submissions_class_date;
ALTER TABLE exam_submissions DROP COLUMN IF EXISTS class_id;
DROP FUNCTION jsonb_remove_class_fields(JSONB);
