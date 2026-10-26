CREATE UNIQUE INDEX IF NOT EXISTS recipes_id_owner ON recipes(id,user_id);
CREATE UNIQUE INDEX IF NOT EXISTS collections_id_owner ON collections(id,user_id);
CREATE TABLE IF NOT EXISTS recipe_collections (
  recipe_id uuid NOT NULL, collection_id uuid NOT NULL, user_id text NOT NULL,
  PRIMARY KEY(recipe_id,collection_id),
  FOREIGN KEY(recipe_id,user_id) REFERENCES recipes(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(collection_id,user_id) REFERENCES collections(id,user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS recipe_collections_collection ON recipe_collections(collection_id);
ALTER TABLE recipe_collections ENABLE ROW LEVEL SECURITY;
INSERT INTO recipe_collections(recipe_id,collection_id,user_id)
SELECT r.id,c.id,r.user_id FROM recipes r JOIN collections c ON c.id=r.collection_id AND c.user_id=r.user_id
ON CONFLICT DO NOTHING;
