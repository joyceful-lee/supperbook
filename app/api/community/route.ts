import { NextRequest,NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { publicRecipe,communityCursor,readCommunityCursor } from "@/lib/community";
import { commentAction } from "@/lib/comment-actions";
import { commentPage,participants } from "@/lib/thread-store";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const sql=neon(process.env.DATABASE_URL!);
const uuid=z.string().uuid(),name=z.string().trim().min(2).max(60),bodyText=z.string().trim().min(1).max(2000);
const actionSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("publish"),recipeId:uuid,displayName:name}),
 z.object({action:z.literal("unpublish"),recipeId:uuid}),
 z.object({action:z.literal("like"),recipeId:uuid,liked:z.boolean()}),
 z.object({action:z.literal("comment"),recipeId:uuid,displayName:name,body:bodyText,parentId:uuid.nullable().optional(),mentions:z.array(uuid).max(10).optional()}),
 z.object({action:z.literal("editComment"),commentId:uuid,body:bodyText,mentions:z.array(uuid).max(10).optional()}),
 z.object({action:z.literal("deleteComment"),commentId:uuid}),
 z.object({action:z.literal("restoreComment"),commentId:uuid}),
]);
function reply(data:unknown,status=200){return NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});}
async function viewer(){const {data}=await auth.getSession();return data?.user?.id||"";}
export async function GET(request:NextRequest) {
 try {
  const userId=await viewer(),params=request.nextUrl.searchParams;
  const profile=userId?await sql`SELECT display_name FROM community_profiles WHERE user_id=${userId}`:[];
  const viewerName=profile[0]?.display_name||"";
  if(params.has("profile"))return reply({displayName:viewerName});
  const id=params.get("id");
  const thread=params.get("thread");
  if(id&&thread) {
   uuid.parse(id);uuid.parse(thread);
   const root=await commentPage(id,userId,"one",thread);
   if(!root.comments.length)return reply({error:"This thread is no longer available."},404);
   const people=await participants(id,thread,userId,z.string().max(60).parse(params.get("q")||""));
   if(params.has("participants"))return reply({participants:people});
   const page=await commentPage(id,userId,"replies",thread,params.get("repliesBefore"));
   return reply({root:root.comments[0],replies:page.comments,nextReplyCursor:page.cursor,participants:people});
  }
  if(id) {
   uuid.parse(id);
   const records=await sql`SELECT r.id,r.title,r.description,r.image_url AS "imageUrl",r.source_url AS "sourceUrl",r.source_name AS "sourceName",r.servings::float8,r.minutes,r.cuisine,to_char(r.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "publishedAt",p.display_name AS "authorName",r.instructions,
    (SELECT provider FROM recipe_sources WHERE recipe_id=r.id) AS "externalProvider",(SELECT provider_recipe_id FROM recipe_sources WHERE recipe_id=r.id) AS "externalId",
    (SELECT count(*)::int FROM recipe_likes WHERE recipe_id=r.id) AS "likeCount",(SELECT count(*)::int FROM recipe_comments WHERE recipe_id=r.id AND deleted_at IS NULL) AS "commentCount",
    EXISTS(SELECT 1 FROM recipe_likes WHERE recipe_id=r.id AND user_id=${userId}) AS "likedByViewer",r.user_id=${userId} AS "ownedByViewer",
    COALESCE((SELECT jsonb_agg(jsonb_build_object('name',i.name,'quantity',ri.quantity::float8,'unit',ri.unit,'preparation',ri.preparation) ORDER BY ri.position) FROM recipe_ingredients ri JOIN ingredients i ON i.id=ri.ingredient_id WHERE ri.recipe_id=r.id),'[]') AS ingredients
    FROM recipes r LEFT JOIN community_profiles p ON p.user_id=r.user_id WHERE r.id=${id} AND r.is_public AND NOT r.archived`;
   if(!records.length)return reply({error:"This recipe is no longer public."},404);
   const page=await commentPage(id,userId,"roots",null,params.get("commentsBefore"));
   return reply({recipe:publicRecipe(records[0],true),comments:page.comments,nextCommentCursor:page.cursor,viewerName});
  }
  const search=z.string().max(80).parse(params.get("q")||"").trim();
  const [beforeAt,beforeId]=readCommunityCursor(params.get("cursor"));
  const records=await sql`SELECT r.id,r.title,r.description,r.image_url AS "imageUrl",r.source_url AS "sourceUrl",r.source_name AS "sourceName",r.servings::float8,r.minutes,r.cuisine,to_char(r.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "publishedAt",p.display_name AS "authorName",
   (SELECT count(*)::int FROM recipe_likes WHERE recipe_id=r.id) AS "likeCount",(SELECT count(*)::int FROM recipe_comments WHERE recipe_id=r.id AND deleted_at IS NULL) AS "commentCount",
   EXISTS(SELECT 1 FROM recipe_likes WHERE recipe_id=r.id AND user_id=${userId}) AS "likedByViewer",r.user_id=${userId} AS "ownedByViewer"
   FROM recipes r LEFT JOIN community_profiles p ON p.user_id=r.user_id WHERE r.is_public AND NOT r.archived AND position(lower(${search}) in lower(r.title))>0 AND (${beforeAt}::timestamptz IS NULL OR (r.published_at,r.id)<(${beforeAt}::timestamptz,${beforeId}::uuid)) ORDER BY r.published_at DESC,r.id DESC LIMIT 21`;
  const page=records.slice(0,20),last=page.at(-1);
  return reply({recipes:page.map(row=>publicRecipe(row)),nextCursor:records.length>20&&last?communityCursor(last.publishedAt,last.id):null,viewerName});
 } catch(error) {return reply({error:error instanceof z.ZodError||error instanceof Error&&error.message==="Invalid page cursor."?"Check the search or page address.":"Community recipes could not be loaded. Please try again."},error instanceof z.ZodError||error instanceof Error&&error.message==="Invalid page cursor."?400:500);}
}
export async function POST(request:NextRequest) {
 try {
  if(request.headers.get("origin")!==request.nextUrl.origin)return reply({error:"This request came from a different website."},403);
  const userId=await viewer();if(!userId)return reply({error:"Sign in to share recipes, like, or comment."},401);
  if(Number(request.headers.get("content-length")||0)>12000)return reply({error:"This request is too large."},413);
  const text=await request.text();if(Buffer.byteLength(text)>12000)return reply({error:"This request is too large."},413);
  const action=actionSchema.parse(JSON.parse(text));
  if(action.action==="publish") {
   const results=await sql.transaction([
    sql`SELECT id FROM recipes WHERE id=${action.recipeId} AND user_id=${userId} AND NOT archived FOR UPDATE`,
    sql`INSERT INTO community_profiles(user_id,display_name) SELECT ${userId},${action.displayName} WHERE EXISTS(SELECT 1 FROM recipes WHERE id=${action.recipeId} AND user_id=${userId} AND NOT archived) ON CONFLICT(user_id) DO UPDATE SET display_name=EXCLUDED.display_name`,
    sql`UPDATE recipes SET is_public=true,published_at=COALESCE(published_at,now()) WHERE id=${action.recipeId} AND user_id=${userId} AND NOT archived RETURNING id`,
   ]);
   return results[2].length?reply({ok:true,isPublic:true}):reply({error:"Recipe not found. Restore archived recipes before sharing."},404);
  }
  if(action.action==="unpublish") {
   const rows=await sql`UPDATE recipes SET is_public=false,published_at=NULL WHERE id=${action.recipeId} AND user_id=${userId} RETURNING id`;
   return rows.length?reply({ok:true,isPublic:false}):reply({error:"Recipe not found."},404);
  }
  if(action.action==="comment"||action.action==="editComment"||action.action==="deleteComment"||action.action==="restoreComment") {const result=await commentAction(action,userId);return reply(result.data,result.status);}
  const lock=sql`SELECT id FROM recipes WHERE id=${action.recipeId} AND is_public AND NOT archived FOR UPDATE`;
  if(action.action==="like") {
   const results=await sql.transaction([lock,action.liked?
    sql`INSERT INTO recipe_likes(recipe_id,user_id) SELECT id,${userId} FROM recipes WHERE id=${action.recipeId} AND is_public AND NOT archived ON CONFLICT DO NOTHING`:
    sql`DELETE FROM recipe_likes WHERE recipe_id=${action.recipeId} AND user_id=${userId}`]);
   return results[0].length?reply({ok:true}):reply({error:"This recipe is no longer public."},404);
  }
  return reply({error:"Unknown action."},400);
 } catch(error) {return reply({error:error instanceof z.ZodError?error.issues[0]?.message:"Your change could not be saved. Please try again."},400);}
}
