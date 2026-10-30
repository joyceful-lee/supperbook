import { NextRequest,NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { communityCursor,readCommunityCursor } from '@/lib/community';
import { defaultNotificationPreferences } from '@/lib/threads';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const sql=neon(process.env.DATABASE_URL!);
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('preferences'),preferences:z.object({enabled:z.boolean(),likes:z.boolean(),comments:z.boolean(),mentions:z.boolean()})}),
 z.object({action:z.literal('read'),id:z.string().uuid()}),z.object({action:z.literal('readAll')}),
]);
function reply(data:unknown,status=200){return NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});}
async function user(){const {data}=await auth.getSession();return data?.user?.id;}
export async function GET(request:NextRequest) {
 try {
  const id=await user();if(!id)return reply({error:'Sign in to see your notifications.'},401);
  const params=request.nextUrl.searchParams;
  const [preferences,count]=await Promise.all([
   sql`SELECT enabled,likes,comments,mentions FROM notification_preferences WHERE user_id=${id}`,
   sql`SELECT count(*)::int AS total FROM account_notifications n JOIN recipes r ON r.id=n.recipe_id LEFT JOIN recipe_comments c ON c.id=n.comment_id WHERE n.recipient_user_id=${id} AND n.read_at IS NULL AND r.is_public AND NOT r.archived AND (n.comment_id IS NULL OR c.deleted_at IS NULL) AND (n.kind<>'like' OR EXISTS(SELECT 1 FROM recipe_likes l WHERE l.recipe_id=n.recipe_id AND l.user_id=n.actor_user_id)) AND (n.kind<>'mention' OR EXISTS(SELECT 1 FROM comment_mentions m WHERE m.comment_id=n.comment_id AND m.mentioned_user_id=${id}))`,
  ]);
  const base={preferences:preferences[0]||defaultNotificationPreferences,unreadCount:count[0].total};
  if(params.has('summary'))return reply(base);
  const [date,cursorId]=readCommunityCursor(params.get('cursor'));
  const rows=await sql`SELECT n.id,n.kind,n.recipe_id AS "recipeId",r.title AS "recipeTitle",COALESCE(p.display_name,'A cook') AS "actorName",COALESCE(c.parent_id,c.id) AS "threadId",to_char(n.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",n.read_at IS NOT NULL AS read FROM account_notifications n JOIN recipes r ON r.id=n.recipe_id LEFT JOIN community_profiles p ON p.user_id=n.actor_user_id LEFT JOIN recipe_comments c ON c.id=n.comment_id WHERE n.recipient_user_id=${id} AND r.is_public AND NOT r.archived AND (n.comment_id IS NULL OR c.deleted_at IS NULL) AND (n.kind<>'like' OR EXISTS(SELECT 1 FROM recipe_likes l WHERE l.recipe_id=n.recipe_id AND l.user_id=n.actor_user_id)) AND (n.kind<>'mention' OR EXISTS(SELECT 1 FROM comment_mentions m WHERE m.comment_id=n.comment_id AND m.mentioned_user_id=${id})) AND (${date}::timestamptz IS NULL OR (n.created_at,n.id)<(${date}::timestamptz,${cursorId}::uuid)) ORDER BY n.created_at DESC,n.id DESC LIMIT 21`;
  const notifications=rows.slice(0,20),last=notifications.at(-1);
  return reply({...base,notifications,nextCursor:rows.length>20&&last?communityCursor(last.createdAt,last.id):null});
 }catch{return reply({error:'Notifications could not be loaded. Please try again.'},400);}
}
export async function POST(request:NextRequest) {
 try {
  if(request.headers.get('origin')!==request.nextUrl.origin)return reply({error:'This request came from a different website.'},403);
  const id=await user();if(!id)return reply({error:'Sign in to manage notifications.'},401);
  const text=await request.text();if(Buffer.byteLength(text)>4000)return reply({error:'This request is too large.'},413);
  const action=schema.parse(JSON.parse(text));
  if(action.action==='preferences') {
   const p=action.preferences;
   await sql`INSERT INTO notification_preferences(user_id,enabled,likes,comments,mentions) VALUES(${id},${p.enabled},${p.likes},${p.comments},${p.mentions}) ON CONFLICT(user_id) DO UPDATE SET enabled=EXCLUDED.enabled,likes=EXCLUDED.likes,comments=EXCLUDED.comments,mentions=EXCLUDED.mentions`;
  }else if(action.action==='readAll')await sql`UPDATE account_notifications SET read_at=now() WHERE recipient_user_id=${id} AND read_at IS NULL`;
  else await sql`UPDATE account_notifications SET read_at=now() WHERE id=${action.id} AND recipient_user_id=${id}`;
  return reply({ok:true});
 }catch{return reply({error:'Your notification settings could not be saved. Please try again.'},400);}
}
