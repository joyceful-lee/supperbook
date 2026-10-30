import 'server-only';
import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { mentionsInBody } from './threads';
const sql=neon(process.env.DATABASE_URL!);
type CommentAction={action:'comment';recipeId:string;displayName:string;body:string;parentId?:string|null;mentions?:string[]}|{action:'editComment';commentId:string;body:string;mentions?:string[]}|{action:'deleteComment';commentId:string}|{action:'restoreComment';commentId:string};
export async function commentAction(action:CommentAction,userId:string) {
 const ok={data:{ok:true},status:200};
 if(action.action==='deleteComment'||action.action==='restoreComment') {
  const restore=action.action==='restoreComment';
  const result=await sql.transaction([
   sql`SELECT r.id FROM recipes r JOIN recipe_comments c ON c.recipe_id=r.id WHERE c.id=${action.commentId} AND (c.user_id=${userId} OR r.user_id=${userId}) FOR UPDATE OF r`,
   restore?sql`UPDATE recipe_comments c SET deleted_at=NULL,deleted_by=NULL FROM recipes r WHERE c.id=${action.commentId} AND r.id=c.recipe_id AND (r.user_id=${userId} OR (c.user_id=${userId} AND c.deleted_by=${userId})) RETURNING c.id`:
   sql`UPDATE recipe_comments c SET deleted_at=now(),deleted_by=${userId} FROM recipes r WHERE c.id=${action.commentId} AND r.id=c.recipe_id AND (c.user_id=${userId} OR r.user_id=${userId}) RETURNING c.id`,
  ]);
  return result[1].length?ok:{data:{error:'Comment not found.'},status:404};
 }
 const creating=action.action==='comment';
 const existing=creating?[]:await sql`SELECT c.id,c.recipe_id,c.parent_id FROM recipe_comments c JOIN recipes r ON r.id=c.recipe_id WHERE c.id=${action.commentId} AND c.user_id=${userId} AND c.deleted_at IS NULL AND r.is_public AND NOT r.archived`;
 if(!creating&&!existing.length)return {data:{error:'Comment not found or recipe is no longer public.'},status:404};
 const recipeId=creating?action.recipeId:existing[0].recipe_id;
 const parentId=creating?action.parentId||null:existing[0].parent_id;
 const commentId=creating?randomUUID():existing[0].id;
 const rootId=parentId||commentId;
 if(parentId) {
  const parent=await sql`SELECT c.id FROM recipe_comments c JOIN recipes r ON r.id=c.recipe_id WHERE c.id=${parentId} AND c.recipe_id=${recipeId} AND c.parent_id IS NULL AND r.is_public AND NOT r.archived`;
  if(!parent.length)return {data:{error:'Reply to a parent comment on this recipe.'},status:400};
 }
 const selected=[...new Set(action.mentions||[])];
 const people=selected.length?await sql`SELECT DISTINCT p.public_id AS id,p.display_name AS "displayName" FROM community_profiles p JOIN recipe_comments c ON c.user_id=p.user_id JOIN recipes r ON r.id=c.recipe_id WHERE c.recipe_id=${recipeId} AND r.is_public AND NOT r.archived AND c.deleted_at IS NULL AND (c.id=${rootId} OR c.parent_id=${rootId}) AND c.user_id<>${userId} AND p.public_id::text IN (SELECT jsonb_array_elements_text(${JSON.stringify(selected)}::jsonb))`:[];
 if(people.length!==selected.length)return {data:{error:'Choose someone participating in this thread.'},status:400};
 const previous=!creating&&selected.length?await sql`SELECT p.public_id AS id,m.display_name AS "displayName" FROM comment_mentions m JOIN community_profiles p ON p.user_id=m.mentioned_user_id WHERE m.comment_id=${commentId}`:[];
 const namedPeople=people.map(person=>{const old=previous.find(old=>old.id===person.id);return old&&mentionsInBody(action.body,[{id:String(old.id),displayName:String(old.displayName)}]).length?{id:String(old.id),displayName:String(old.displayName)}:{id:String(person.id),displayName:String(person.displayName)};});
 const mentioned=mentionsInBody(action.body,namedPeople);
 const mentions=mentioned.map(person=>person.id);
 const result=await sql.transaction([
  sql`SELECT id FROM recipes WHERE id=${recipeId} AND is_public AND NOT archived FOR UPDATE`,
  sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId},0))`,
  ...(creating?[sql`INSERT INTO community_profiles(user_id,display_name) SELECT ${userId},${action.displayName} WHERE EXISTS(SELECT 1 FROM recipes WHERE id=${recipeId} AND is_public AND NOT archived) ON CONFLICT(user_id) DO UPDATE SET display_name=EXCLUDED.display_name`]:[]),
  creating?sql`INSERT INTO recipe_comments(id,recipe_id,user_id,body,parent_id) SELECT ${commentId},id,${userId},${action.body},${parentId}::uuid FROM recipes WHERE id=${recipeId} AND is_public AND NOT archived AND (SELECT count(*) FROM recipe_comments WHERE user_id=${userId} AND created_at>now()-interval '1 hour')<30 RETURNING id`:
  sql`UPDATE recipe_comments c SET body=${action.body},updated_at=now() FROM recipes r WHERE c.id=${commentId} AND c.user_id=${userId} AND c.deleted_at IS NULL AND r.id=c.recipe_id AND r.is_public AND NOT r.archived RETURNING c.id`,
  sql`DELETE FROM comment_mentions m WHERE m.comment_id=${commentId} AND EXISTS(SELECT 1 FROM recipe_comments c JOIN recipes r ON r.id=c.recipe_id WHERE c.id=m.comment_id AND c.user_id=${userId} AND c.deleted_at IS NULL AND r.is_public AND NOT r.archived) AND m.mentioned_user_id NOT IN (SELECT user_id FROM community_profiles WHERE public_id::text IN (SELECT jsonb_array_elements_text(${JSON.stringify(mentions)}::jsonb)))`,
  sql`INSERT INTO comment_mentions(comment_id,mentioned_user_id,display_name) SELECT ${commentId},p.user_id,chosen.value->>'displayName' FROM jsonb_array_elements(${JSON.stringify(mentioned)}::jsonb) AS chosen(value) JOIN community_profiles p ON p.public_id::text=chosen.value->>'id' WHERE true AND EXISTS(SELECT 1 FROM recipe_comments c JOIN recipes r ON r.id=c.recipe_id WHERE c.id=${commentId} AND c.user_id=${userId} AND c.deleted_at IS NULL AND r.is_public AND NOT r.archived) ON CONFLICT(comment_id,mentioned_user_id) DO UPDATE SET display_name=EXCLUDED.display_name`,
 ]);
 if(!result[0].length)return {data:{error:'This recipe is no longer public.'},status:404};
 return result[creating?3:2].length?ok:{data:{error:creating?'You’ve reached the limit of 30 new comments per hour. Please try again later.':'Comment not found.'},status:creating?429:404};
}
