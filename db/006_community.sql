ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS published_at timestamptz;
CREATE INDEX IF NOT EXISTS recipes_public_feed ON recipes(published_at DESC,id DESC) WHERE is_public AND NOT archived;
CREATE TABLE IF NOT EXISTS community_profiles (
 user_id text PRIMARY KEY, display_name text NOT NULL CHECK(length(trim(display_name)) BETWEEN 2 AND 60)
);
CREATE TABLE IF NOT EXISTS recipe_likes (
 recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
 user_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(recipe_id,user_id)
);
CREATE TABLE IF NOT EXISTS recipe_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
 user_id text NOT NULL, body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recipe_comments_feed ON recipe_comments(recipe_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS recipe_comments_author_date ON recipe_comments(user_id,created_at);
ALTER TABLE community_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_comments ENABLE ROW LEVEL SECURITY;
