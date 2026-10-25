CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE IF NOT EXISTS ingredients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 normalized_name text NOT NULL UNIQUE, category text NOT NULL DEFAULT 'Other', created_by text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ingredients_name_trgm ON ingredients USING gin(normalized_name gin_trgm_ops);
CREATE TABLE IF NOT EXISTS recipes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, title text NOT NULL,
 description text NOT NULL DEFAULT '', image_url text NOT NULL DEFAULT '', source_url text NOT NULL DEFAULT '',
 source_name text NOT NULL DEFAULT '', servings numeric NOT NULL DEFAULT 2 CHECK(servings > 0 AND servings <= 1000),
 minutes integer NOT NULL DEFAULT 30 CHECK(minutes BETWEEN 0 AND 10080), collection text NOT NULL DEFAULT 'Everyday',
 instructions jsonb NOT NULL DEFAULT '[]', notes text NOT NULL DEFAULT '', favorite boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recipes_owner ON recipes(user_id);
CREATE TABLE IF NOT EXISTS recipe_ingredients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
 ingredient_id uuid NOT NULL REFERENCES ingredients(id), quantity numeric CHECK(quantity >= 0), unit text NOT NULL DEFAULT '',
 preparation text NOT NULL DEFAULT '', original_text text NOT NULL DEFAULT '', position integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS recipe_lines_recipe ON recipe_ingredients(recipe_id);
CREATE TABLE IF NOT EXISTS kitchen_state (user_id text PRIMARY KEY, meals jsonb NOT NULL DEFAULT '{}', checked jsonb NOT NULL DEFAULT '[]', updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_state ENABLE ROW LEVEL SECURITY;
-- Database access is server-only through the owner role. Every application query also scopes by the validated Neon Auth user ID.
-- No anonymous/client grants are provided. RLS defaults to deny for non-owner roles.
INSERT INTO ingredients (name,normalized_name,category) VALUES
('Olive oil','olive oil','Pantry'),('Garlic','garlic','Produce'),('Lemon','lemon','Produce'),('Cherry tomatoes','cherry tomato','Produce'),
('Basil','basil','Produce'),('Pasta','pasta','Pantry'),('Parmesan','parmesan','Dairy & eggs'),('Chickpeas','chickpea','Pantry'),
('Spinach','spinach','Produce'),('Feta','feta','Dairy & eggs'),('Chicken thighs','chicken thigh','Meat & fish'),('Rice','rice','Pantry'),
('Butter','butter','Dairy & eggs'),('Eggs','egg','Dairy & eggs'),('Onion','onion','Produce'),('Salt','salt','Pantry'),
('Black pepper','black pepper','Pantry'),('Cumin','cumin','Pantry'),('Paprika','paprika','Pantry'),('Greek yogurt','greek yogurt','Dairy & eggs'),
('Cucumber','cucumber','Produce'),('Dill','dill','Produce'),('Salmon','salmon','Meat & fish'),('Potatoes','potato','Produce')
ON CONFLICT (normalized_name) DO NOTHING;
