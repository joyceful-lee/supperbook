-- Every fixture is created inside a subtransaction and rolled back before this block completes.
-- No real account, recipe, or notification is changed or contacted.
DO $$
DECLARE
 a text:='qa-transaction-a-'||gen_random_uuid()::text;
 b text:='qa-transaction-b-'||gen_random_uuid()::text;
 c text:='qa-transaction-c-'||gen_random_uuid()::text;
 d text:='qa-transaction-d-'||gen_random_uuid()::text;
 recipe uuid:=gen_random_uuid(); root_b uuid:=gen_random_uuid(); root_a uuid:=gen_random_uuid();
 reply_a uuid:=gen_random_uuid(); reply_b uuid:=gen_random_uuid(); edited uuid:=gen_random_uuid(); outside uuid:=gen_random_uuid();
 rejected boolean; before_count integer;
BEGIN
 BEGIN
  INSERT INTO community_profiles(user_id,display_name) VALUES(a,'Cook A'),(b,'Cook B'),(c,'Cook C');
  INSERT INTO recipes(id,user_id,title,is_public,published_at) VALUES(recipe,b,'Transaction-only fixture',true,now());
  INSERT INTO recipe_comments(id,recipe_id,user_id,body) VALUES(root_b,recipe,b,'Parent by the recipe owner');
  IF EXISTS(SELECT 1 FROM account_notifications WHERE recipient_user_id=b) THEN RAISE EXCEPTION 'Self notifications must be skipped'; END IF;
  INSERT INTO recipe_likes(recipe_id,user_id) VALUES(recipe,a);
  INSERT INTO recipe_likes(recipe_id,user_id) VALUES(recipe,a) ON CONFLICT DO NOTHING;
  IF (SELECT count(*) FROM account_notifications WHERE recipient_user_id=b AND kind='like')<>1 THEN RAISE EXCEPTION 'Like notifications must be idempotent'; END IF;
  INSERT INTO notification_preferences(user_id,enabled) VALUES(b,false);
  INSERT INTO recipe_comments(recipe_id,user_id,body) VALUES(recipe,a,'Master switch is off');
  IF (SELECT count(*) FROM account_notifications WHERE recipient_user_id=b)<>1 THEN RAISE EXCEPTION 'Master switch must stop new notifications'; END IF;
  UPDATE notification_preferences SET enabled=true,comments=false,mentions=true WHERE user_id=b;
  INSERT INTO recipe_comments(id,recipe_id,user_id,parent_id,body) VALUES(reply_a,recipe,a,root_b,'Hello @Cook B');
  IF EXISTS(SELECT 1 FROM account_notifications WHERE recipient_user_id=b AND comment_id=reply_a) THEN RAISE EXCEPTION 'Comment switch must include replies'; END IF;
  INSERT INTO comment_mentions(comment_id,mentioned_user_id,display_name) SELECT reply_a,p.user_id,chosen.value->>'displayName' FROM jsonb_array_elements(jsonb_build_array(jsonb_build_object('id',(SELECT public_id FROM community_profiles WHERE user_id=b),'displayName','Cook B'))) AS chosen(value) JOIN community_profiles p ON p.public_id::text=chosen.value->>'id';
  INSERT INTO comment_mentions(comment_id,mentioned_user_id,display_name) VALUES(reply_a,b,'Cook B') ON CONFLICT DO NOTHING;
  IF (SELECT count(*) FROM account_notifications WHERE recipient_user_id=b AND comment_id=reply_a AND kind='mention')<>1 THEN RAISE EXCEPTION 'Enabled mentions must be delivered once'; END IF;
  INSERT INTO recipe_comments(id,recipe_id,user_id,body) VALUES(root_a,recipe,a,'A different parent thread');
  INSERT INTO recipe_comments(id,recipe_id,user_id,parent_id,body) VALUES(reply_b,recipe,b,root_a,'A reply for Cook A');
  IF NOT EXISTS(SELECT 1 FROM account_notifications WHERE recipient_user_id=a AND comment_id=reply_b AND kind='reply') THEN RAISE EXCEPTION 'Replies must notify the parent author'; END IF;
  INSERT INTO notification_preferences(user_id,comments,mentions) VALUES(a,false,false);
  INSERT INTO recipe_comments(id,recipe_id,user_id,parent_id,body) VALUES(edited,recipe,b,root_a,'Hello @Cook A');
  INSERT INTO comment_mentions(comment_id,mentioned_user_id,display_name) VALUES(edited,a,'Cook A');
  IF EXISTS(SELECT 1 FROM account_notifications WHERE recipient_user_id=a AND comment_id=edited) THEN RAISE EXCEPTION 'Disabled replies and mentions must not notify'; END IF;
  UPDATE notification_preferences SET comments=true WHERE user_id=b;
  INSERT INTO recipe_comments(id,recipe_id,user_id,parent_id,body) VALUES(outside,recipe,a,root_b,'Another note for @Cook B');
  INSERT INTO comment_mentions(comment_id,mentioned_user_id,display_name) VALUES(outside,b,'Cook B');
  IF (SELECT count(*) FROM account_notifications WHERE recipient_user_id=b AND comment_id=outside)<>1 OR NOT EXISTS(SELECT 1 FROM account_notifications WHERE recipient_user_id=b AND comment_id=outside AND kind='mention') THEN RAISE EXCEPTION 'Mentions must replace duplicate comment notifications'; END IF;
  UPDATE recipe_comments SET body='Edited text for @Cook B' WHERE id=outside;
  IF (SELECT count(*) FROM account_notifications WHERE recipient_user_id=b AND comment_id=outside)<>1 THEN RAISE EXCEPTION 'Ordinary edits must not duplicate notifications'; END IF;
  INSERT INTO recipe_comments(recipe_id,user_id,body) VALUES(recipe,c,'Cook C participates only in a different thread');
  rejected:=false;
  BEGIN INSERT INTO comment_mentions(comment_id,mentioned_user_id,display_name) VALUES(outside,c,'Cook C');
  EXCEPTION WHEN raise_exception THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Mentions must stay within the specific thread'; END IF;
  rejected:=false;
  BEGIN INSERT INTO recipe_comments(recipe_id,user_id,parent_id,body) VALUES(recipe,a,reply_b,'An invalid nested reply');
  EXCEPTION WHEN raise_exception THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Nested replies must be rejected'; END IF;
  UPDATE recipe_comments SET deleted_at=now(),deleted_by=b WHERE id=root_b;
  IF NOT EXISTS(SELECT 1 FROM recipe_comments WHERE id=reply_a AND parent_id=root_b) THEN RAISE EXCEPTION 'Removing a parent must preserve its replies'; END IF;
  SELECT count(*) INTO before_count FROM account_notifications WHERE recipient_user_id=b;
  UPDATE recipes SET is_public=false WHERE id=recipe;
  INSERT INTO recipe_likes(recipe_id,user_id) VALUES(recipe,d);
  IF (SELECT count(*) FROM account_notifications WHERE recipient_user_id=b)<>before_count THEN RAISE EXCEPTION 'Private recipes must not create notifications'; END IF;
  RAISE EXCEPTION 'qa_fixture_rollback';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'qa_fixture_rollback' THEN RAISE; END IF;
 END;
END $$;
