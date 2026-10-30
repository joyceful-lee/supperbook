ALTER TABLE community_profiles ADD COLUMN IF NOT EXISTS public_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS community_profiles_public_id ON community_profiles(public_id);
ALTER TABLE recipe_comments ADD COLUMN IF NOT EXISTS parent_id uuid;
ALTER TABLE recipe_comments ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE recipe_comments ADD COLUMN IF NOT EXISTS deleted_by text;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='comments_identity_recipe') THEN
  ALTER TABLE recipe_comments ADD CONSTRAINT comments_identity_recipe UNIQUE(id,recipe_id);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='comments_parent_recipe') THEN
  ALTER TABLE recipe_comments ADD CONSTRAINT comments_parent_recipe FOREIGN KEY(parent_id,recipe_id) REFERENCES recipe_comments(id,recipe_id) ON DELETE CASCADE;
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS recipe_comments_thread ON recipe_comments(parent_id,created_at,id);
CREATE TABLE IF NOT EXISTS comment_mentions (
 comment_id uuid NOT NULL REFERENCES recipe_comments(id) ON DELETE CASCADE,
 mentioned_user_id text NOT NULL REFERENCES community_profiles(user_id),
 display_name text NOT NULL, PRIMARY KEY(comment_id,mentioned_user_id)
);
CREATE TABLE IF NOT EXISTS notification_preferences (
 user_id text PRIMARY KEY, enabled boolean NOT NULL DEFAULT true,
 likes boolean NOT NULL DEFAULT true, comments boolean NOT NULL DEFAULT true, mentions boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS account_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipient_user_id text NOT NULL, actor_user_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('like','comment','reply','mention')),
 recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
 comment_id uuid REFERENCES recipe_comments(id) ON DELETE CASCADE,
 event_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz,
 UNIQUE(recipient_user_id,event_key)
);
CREATE INDEX IF NOT EXISTS account_notifications_inbox ON account_notifications(recipient_user_id,created_at DESC,id DESC);
ALTER TABLE comment_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_notifications ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION validate_comment_thread() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM recipe_comments p WHERE p.id=NEW.parent_id AND p.recipe_id=NEW.recipe_id AND p.parent_id IS NULL AND p.id<>NEW.id) THEN
  RAISE EXCEPTION 'Replies must belong to a parent comment on the same recipe';
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER recipe_comment_thread_guard BEFORE INSERT OR UPDATE OF parent_id,recipe_id ON recipe_comments FOR EACH ROW EXECUTE FUNCTION validate_comment_thread();
CREATE OR REPLACE FUNCTION enqueue_recipe_notification(recipient text,actor text,event_kind text,recipe uuid,comment uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE allowed boolean; event text;
BEGIN
 IF recipient IS NULL OR recipient=actor THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM recipes WHERE id=recipe AND is_public AND NOT archived) THEN RETURN; END IF;
 SELECT COALESCE((SELECT enabled AND CASE WHEN event_kind='like' THEN likes WHEN event_kind='mention' THEN mentions ELSE comments END FROM notification_preferences WHERE user_id=recipient),true) INTO allowed;
 IF NOT allowed THEN RETURN; END IF;
 event:=CASE WHEN event_kind='like' THEN 'like:'||recipe::text||':'||actor ELSE 'comment:'||comment::text END;
 INSERT INTO account_notifications(recipient_user_id,actor_user_id,kind,recipe_id,comment_id,event_key)
 VALUES(recipient,actor,event_kind,recipe,comment,event)
 ON CONFLICT(recipient_user_id,event_key) DO UPDATE SET kind=EXCLUDED.kind,read_at=NULL,created_at=now()
 WHERE EXCLUDED.kind='mention' AND account_notifications.kind<>'mention';
END $$;
CREATE OR REPLACE FUNCTION notify_recipe_like() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM enqueue_recipe_notification((SELECT user_id FROM recipes WHERE id=NEW.recipe_id),NEW.user_id,'like',NEW.recipe_id);
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER recipe_like_notification AFTER INSERT ON recipe_likes FOR EACH ROW EXECUTE FUNCTION notify_recipe_like();
CREATE OR REPLACE FUNCTION notify_recipe_comment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM enqueue_recipe_notification((SELECT user_id FROM recipes WHERE id=NEW.recipe_id),NEW.user_id,'comment',NEW.recipe_id,NEW.id);
 IF NEW.parent_id IS NOT NULL THEN
  PERFORM enqueue_recipe_notification((SELECT user_id FROM recipe_comments WHERE id=NEW.parent_id),NEW.user_id,'reply',NEW.recipe_id,NEW.id);
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER recipe_comment_notification AFTER INSERT ON recipe_comments FOR EACH ROW EXECUTE FUNCTION notify_recipe_comment();
CREATE OR REPLACE FUNCTION validate_and_notify_mention() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target recipe_comments%ROWTYPE;
BEGIN
 SELECT * INTO target FROM recipe_comments WHERE id=NEW.comment_id;
 IF target.deleted_at IS NOT NULL OR target.user_id=NEW.mentioned_user_id OR NOT EXISTS(
  SELECT 1 FROM recipe_comments participant WHERE participant.recipe_id=target.recipe_id AND participant.deleted_at IS NULL AND participant.user_id=NEW.mentioned_user_id
   AND (participant.id=COALESCE(target.parent_id,target.id) OR participant.parent_id=COALESCE(target.parent_id,target.id))
 ) THEN RAISE EXCEPTION 'Mention someone participating in this thread'; END IF;
 PERFORM enqueue_recipe_notification(NEW.mentioned_user_id,target.user_id,'mention',target.recipe_id,target.id);
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER comment_mention_notification AFTER INSERT ON comment_mentions FOR EACH ROW EXECUTE FUNCTION validate_and_notify_mention();
