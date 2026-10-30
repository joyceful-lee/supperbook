import 'server-only';
import { neon } from '@neondatabase/serverless';
import { communityCursor,publicComment,readCommunityCursor } from './community';
const sql=neon(process.env.DATABASE_URL!);
export async function commentPage(recipeId:string,viewer:string,mode:'roots'|'replies'|'one',threadId:string|null=null,cursor:string|null=null) {
 const [date,id]=readCommunityCursor(cursor);
 const rows=await sql`SELECT c.id,c.body,c.parent_id AS "parentId",p.public_id AS "authorId",p.display_name AS "authorName",c.deleted_at IS NOT NULL AS deleted,
  to_char(c.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",to_char(c.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "updatedAt",
  c.user_id=${viewer} AND c.deleted_at IS NULL AS "canEdit",(c.user_id=${viewer} OR r.user_id=${viewer}) AND c.deleted_at IS NULL AS "canDelete",
  c.deleted_at IS NOT NULL AND (r.user_id=${viewer} OR (c.user_id=${viewer} AND c.deleted_by=${viewer})) AS "canRestore",
  (SELECT count(*)::int FROM recipe_comments child WHERE child.parent_id=c.id AND child.deleted_at IS NULL) AS "replyCount",
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',mp.public_id,'displayName',m.display_name)) FROM comment_mentions m JOIN community_profiles mp ON mp.user_id=m.mentioned_user_id WHERE m.comment_id=c.id),'[]') AS mentions
  FROM recipe_comments c JOIN recipes r ON r.id=c.recipe_id LEFT JOIN community_profiles p ON p.user_id=c.user_id
  WHERE r.id=${recipeId} AND r.is_public AND NOT r.archived AND (
   (${mode}='roots' AND c.parent_id IS NULL AND (${date}::timestamptz IS NULL OR (c.created_at,c.id)<(${date}::timestamptz,${id}::uuid))) OR
   (${mode}='replies' AND c.parent_id=${threadId}::uuid AND (${date}::timestamptz IS NULL OR (c.created_at,c.id)<(${date}::timestamptz,${id}::uuid))) OR
   (${mode}='one' AND c.id=${threadId}::uuid AND c.parent_id IS NULL)
  ) AND (c.deleted_at IS NULL OR ${mode}='one' OR r.user_id=${viewer} OR (c.user_id=${viewer} AND c.deleted_by=${viewer}) OR EXISTS(SELECT 1 FROM recipe_comments child WHERE child.parent_id=c.id AND child.deleted_at IS NULL))
  ORDER BY c.created_at DESC,c.id DESC
  LIMIT ${mode==='roots'?31:mode==='replies'?21:1}`;
 const size=mode==='roots'?30:mode==='replies'?20:1,page=rows.slice(0,size),last=page.at(-1);
 return {comments:page.map(publicComment),cursor:rows.length>size&&last?communityCursor(last.createdAt,last.id):null};
}
export async function participants(recipeId:string,rootId:string,viewer:string,search='') {
 return await sql`SELECT DISTINCT p.public_id AS id,p.display_name AS "displayName" FROM recipe_comments c JOIN community_profiles p ON p.user_id=c.user_id JOIN recipes r ON r.id=c.recipe_id WHERE c.recipe_id=${recipeId} AND r.is_public AND NOT r.archived AND c.deleted_at IS NULL AND (c.id=${rootId} OR c.parent_id=${rootId}) AND c.user_id<>${viewer} AND position(lower(${search}) in lower(p.display_name))>0 ORDER BY "displayName",id LIMIT 40`;
}
