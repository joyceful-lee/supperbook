ALTER TABLE kitchen_state ADD COLUMN IF NOT EXISTS meal_order jsonb NOT NULL DEFAULT '[]';
UPDATE ingredients SET name=upper(left(trim(name),1)) || substring(trim(name),2)
WHERE name <> upper(left(trim(name),1)) || substring(trim(name),2);
