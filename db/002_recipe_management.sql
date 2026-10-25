CREATE TABLE IF NOT EXISTS collections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,name)
);
CREATE UNIQUE INDEX IF NOT EXISTS collections_owner_name ON collections(user_id,lower(name));
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS collection_id uuid REFERENCES collections(id) ON DELETE SET NULL;
INSERT INTO collections(user_id,name) SELECT DISTINCT user_id,collection FROM recipes WHERE collection <> 'Unfiled' ON CONFLICT DO NOTHING;
UPDATE recipes r SET collection_id=c.id FROM collections c WHERE r.user_id=c.user_id AND lower(r.collection)=lower(c.name) AND r.collection_id IS NULL;
CREATE INDEX IF NOT EXISTS recipes_owner_archive ON recipes(user_id,archived);
