-- Remove retired student-code fields and private message/announcement payloads
-- from persisted platform and account-profile JSON.
CREATE OR REPLACE FUNCTION jsonb_remove_retired_platform_fields(value JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT CASE jsonb_typeof(value)
    WHEN 'object' THEN COALESCE((
      SELECT jsonb_object_agg(
        key,
        CASE
          WHEN lower(key) = 'notifications' AND jsonb_typeof(nested) = 'array' THEN COALESCE((
            SELECT jsonb_agg(jsonb_remove_retired_platform_fields(item) ORDER BY ordinal)
            FROM jsonb_array_elements(nested) WITH ORDINALITY AS notifications(item, ordinal)
            WHERE NOT (
              item ? 'announcementId'
              OR item ? 'messageId'
              OR COALESCE(item->>'title', '') ~ '^(إعلان جديد|رسالة جديدة)'
            )
          ), '[]'::JSONB)
          ELSE jsonb_remove_retired_platform_fields(nested)
        END
      )
      FROM jsonb_each(value) AS entries(key, nested)
      WHERE lower(key) NOT IN ('studentcode', 'studentcodes', 'messages', 'announcements')
    ), '{}'::JSONB)
    WHEN 'array' THEN COALESCE((
      SELECT jsonb_agg(jsonb_remove_retired_platform_fields(item) ORDER BY ordinal)
      FROM jsonb_array_elements(value) WITH ORDINALITY AS entries(item, ordinal)
    ), '[]'::JSONB)
    ELSE value
  END
$$;

DELETE FROM platform_state_items
WHERE collection_key IN ('studentCode', 'studentCodes', 'messages', 'announcements');
DELETE FROM platform_state_collections
WHERE collection_key IN ('studentCode', 'studentCodes', 'messages', 'announcements');
DELETE FROM platform_state_items
WHERE collection_key = 'notifications'
  AND (
    item_value ? 'announcementId'
    OR item_value ? 'messageId'
    OR COALESCE(item_value->>'title', '') ~ '^(إعلان جديد|رسالة جديدة)'
  );

UPDATE platform_state_items
SET item_value = jsonb_remove_retired_platform_fields(item_value)
WHERE item_value::TEXT ~* '"(studentCode|studentCodes|messages|announcements|announcementId|messageId|notifications)"';

UPDATE platform_state_collections
SET scalar_value = jsonb_remove_retired_platform_fields(scalar_value)
WHERE scalar_value IS NOT NULL
  AND scalar_value::TEXT ~* '"(studentCode|studentCodes|messages|announcements|announcementId|messageId|notifications)"';

UPDATE platform_state
SET state = jsonb_remove_retired_platform_fields(state)
WHERE state::TEXT ~* '"(studentCode|studentCodes|messages|announcements|announcementId|messageId|notifications)"';

UPDATE video_user_profiles
SET profile_data = jsonb_remove_retired_platform_fields(profile_data)
WHERE profile_data::TEXT ~* '"(studentCode|studentCodes|messages|announcements|announcementId|messageId|notifications)"';

DROP FUNCTION jsonb_remove_retired_platform_fields(JSONB);
