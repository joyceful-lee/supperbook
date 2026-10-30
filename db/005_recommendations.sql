ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cuisine text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS recommendation_preferences (
 user_id text PRIMARY KEY, cuisines jsonb NOT NULL DEFAULT '[]', max_minutes integer,
 disliked_ingredients jsonb NOT NULL DEFAULT '[]', updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(max_minutes IS NULL OR max_minutes BETWEEN 5 AND 240)
);
CREATE TABLE IF NOT EXISTS recommendation_feedback (
 user_id text NOT NULL, candidate_key text NOT NULL, feedback text NOT NULL CHECK(feedback IN ('liked','dismissed')),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,candidate_key)
);
CREATE TABLE IF NOT EXISTS recipe_activity (
 user_id text NOT NULL,recipe_id uuid NOT NULL,planned_count integer NOT NULL DEFAULT 1,last_planned_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,recipe_id),FOREIGN KEY(recipe_id,user_id) REFERENCES recipes(id,user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS recipe_sources (
 recipe_id uuid PRIMARY KEY, user_id text NOT NULL, provider text NOT NULL CHECK(provider='themealdb'),
 provider_recipe_id text NOT NULL, source_url text NOT NULL DEFAULT '',
 UNIQUE(user_id,provider,provider_recipe_id),
 FOREIGN KEY(recipe_id,user_id) REFERENCES recipes(id,user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS recommendation_provider_cache (
 cache_key text PRIMARY KEY, payload jsonb NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS recommendation_rate_limits (
 user_id text PRIMARY KEY, window_start timestamptz NOT NULL DEFAULT now(), request_count integer NOT NULL DEFAULT 1
);
ALTER TABLE recommendation_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_provider_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_activity ENABLE ROW LEVEL SECURITY;
INSERT INTO recipe_activity(user_id,recipe_id)
SELECT ks.user_id,r.id FROM kitchen_state ks JOIN recipes r ON r.user_id=ks.user_id AND ks.meals ? r.id::text WHERE r.archived=false
ON CONFLICT DO NOTHING;
