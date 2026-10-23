CREATE TABLE IF NOT EXISTS school_files (
  file_id VARCHAR(64) PRIMARY KEY,
  owner_id VARCHAR(255) NOT NULL,
  uploaded_by VARCHAR(255) NOT NULL,
  owner_role VARCHAR(32) NOT NULL,
  purpose VARCHAR(64) NOT NULL CHECK (purpose IN ('student-file','course-cover','course-file','payment-receipt')),
  original_name TEXT NOT NULL,
  media_type VARCHAR(128) NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  storage_key VARCHAR(255) NOT NULL UNIQUE,
  sha256 CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS school_files_owner_created_idx ON school_files(owner_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS school_files_purpose_idx ON school_files(purpose, created_at DESC) WHERE deleted_at IS NULL;


-- Legacy installations may have previously embedded files as data/blob URLs in state.
-- Remove inline binary payloads while preserving ordinary text and server file IDs.
CREATE OR REPLACE FUNCTION mk_school_scrub_inline_file_data(v JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  kind TEXT;
  result JSONB;
  element JSONB;
  entry RECORD;
  normalized_key TEXT;
BEGIN
  kind := jsonb_typeof(v);
  IF kind = 'string' THEN
    IF (v #>> '{}') ~* '^(data:|blob:|idb:)' THEN RETURN to_jsonb(''::TEXT); END IF;
    RETURN v;
  ELSIF kind = 'array' THEN
    result := '[]'::JSONB;
    FOR element IN SELECT value FROM jsonb_array_elements(v) LOOP
      result := result || jsonb_build_array(mk_school_scrub_inline_file_data(element));
    END LOOP;
    RETURN result;
  ELSIF kind = 'object' THEN
    result := '{}'::JSONB;
    FOR entry IN SELECT key, value FROM jsonb_each(v) LOOP
      normalized_key := regexp_replace(lower(entry.key), '[^a-z0-9]', '', 'g');
      IF normalized_key = ANY(ARRAY['data','blob','base64','filedata','filecontent','binarycontent']) THEN CONTINUE; END IF;
      result := result || jsonb_build_object(entry.key, mk_school_scrub_inline_file_data(entry.value));
    END LOOP;
    RETURN result;
  END IF;
  RETURN v;
END;
$$;

UPDATE platform_state_items
SET item_value = mk_school_scrub_inline_file_data(item_value)
WHERE item_value::TEXT ~* '(data:|blob:|idb:|"(data|blob|base64|fileData|fileContent|binaryContent)")';
UPDATE platform_state_collections
SET scalar_value = mk_school_scrub_inline_file_data(scalar_value)
WHERE scalar_value IS NOT NULL
  AND scalar_value::TEXT ~* '(data:|blob:|idb:|"(data|blob|base64|fileData|fileContent|binaryContent)")';
DROP FUNCTION mk_school_scrub_inline_file_data(JSONB);
