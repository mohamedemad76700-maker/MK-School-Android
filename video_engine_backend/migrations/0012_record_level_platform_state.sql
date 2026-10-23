-- Store school state as independently versioned records rather than one ever-growing JSONB blob.
-- The existing singleton table remains only as a small revision/lock row for optimistic concurrency.
CREATE TABLE IF NOT EXISTS platform_state_collections (
  collection_key VARCHAR(255) PRIMARY KEY,
  collection_kind VARCHAR(16) NOT NULL CHECK (collection_kind IN ('array','object','scalar')),
  scalar_value JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(255)
);
CREATE TABLE IF NOT EXISTS platform_state_items (
  collection_key VARCHAR(255) NOT NULL REFERENCES platform_state_collections(collection_key) ON DELETE CASCADE,
  item_key VARCHAR(255) NOT NULL,
  item_value JSONB NOT NULL,
  ordinal INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(255),
  PRIMARY KEY(collection_key, item_key)
);
CREATE INDEX IF NOT EXISTS idx_platform_state_items_updated_at ON platform_state_items(updated_at);
CREATE INDEX IF NOT EXISTS idx_platform_state_items_value_gin ON platform_state_items USING GIN(item_value jsonb_path_ops);

-- Idempotently move existing installations before clearing the legacy payload.
DO $$
DECLARE
  state_payload JSONB;
  collection_name TEXT;
  collection_value JSONB;
  collection_type TEXT;
BEGIN
  SELECT state INTO state_payload FROM platform_state WHERE id=1;
  IF state_payload IS NULL OR jsonb_typeof(state_payload) <> 'object' OR state_payload = '{}'::jsonb THEN
    RETURN;
  END IF;
  FOR collection_name, collection_value IN SELECT key, value FROM jsonb_each(state_payload) LOOP
    collection_type := CASE jsonb_typeof(collection_value)
      WHEN 'array' THEN 'array'
      WHEN 'object' THEN 'object'
      ELSE 'scalar'
    END;
    INSERT INTO platform_state_collections(collection_key,collection_kind,scalar_value,updated_at,updated_by)
    VALUES(collection_name,collection_type,CASE WHEN collection_type='scalar' THEN collection_value ELSE NULL END,now(),'migration')
    ON CONFLICT(collection_key) DO NOTHING;
    IF collection_type='array' THEN
      INSERT INTO platform_state_items(collection_key,item_key,item_value,ordinal,updated_by)
      SELECT collection_name,
             COALESCE(NULLIF(value->>'id',''),'@'||ordinality::text),
             value, (ordinality-1)::integer, 'migration'
      FROM jsonb_array_elements(collection_value) WITH ORDINALITY AS entries(value,ordinality)
      ON CONFLICT(collection_key,item_key) DO NOTHING;
    ELSIF collection_type='object' THEN
      INSERT INTO platform_state_items(collection_key,item_key,item_value,ordinal,updated_by)
      SELECT collection_name,key,value,0,'migration' FROM jsonb_each(collection_value)
      ON CONFLICT(collection_key,item_key) DO NOTHING;
    END IF;
  END LOOP;
  UPDATE platform_state SET state='{}'::jsonb WHERE id=1;
END $$;

-- From this migration forward, do not retain the data payload in the singleton lock/revision row.
UPDATE platform_state SET state='{}'::jsonb WHERE state <> '{}'::jsonb;
