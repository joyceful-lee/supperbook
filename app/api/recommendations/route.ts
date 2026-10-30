import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { kitchenSnapshot } from "@/lib/kitchen-store";
import { examples } from "@/lib/examples";
import { asCandidate, defaultPreferences, discoverySeeds, rankRecommendations, type Candidate, type RecommendationPreferences } from "@/lib/recommendations";
import { discoverRecipes } from "@/lib/themealdb-provider";
import { normalizeName, type Recipe } from "@/lib/domain";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=20;
const sql=neon(process.env.DATABASE_URL!);
const preferencesSchema=z.object({
 cuisines:z.array(z.string().trim().min(1).max(80)).max(8),
 maxMinutes:z.number().int().min(5).max(240).nullable(),
 dislikedIngredients:z.array(z.string().trim().min(1).max(120)).max(30),
});
async function user() { const {data}=await auth.getSession(); return data?.user?.id; }
function response(value:unknown,status=200) {return NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store"}});}
export async function GET() {
 try {
  const id=await user();
  if(!id) return response({recommendations:rankRecommendations(examples.map(recipe=>asCandidate(recipe,"starter")),[],{},defaultPreferences),preferences:defaultPreferences,feedback:{},personalized:false,discoveryStatus:"sign_in"});
  const [kitchen,settings,reactions,history]=await Promise.all([
   kitchenSnapshot(id),
   sql`SELECT cuisines,max_minutes AS "maxMinutes",disliked_ingredients AS "dislikedIngredients" FROM recommendation_preferences WHERE user_id=${id}`,
   sql`SELECT candidate_key,feedback FROM recommendation_feedback WHERE user_id=${id}`,
   sql`SELECT recipe_id,planned_count FROM recipe_activity WHERE user_id=${id}`,
  ]);
  const preferences=(settings[0] || defaultPreferences) as RecommendationPreferences;
  const saved=kitchen.recipes as Recipe[];
  const feedback=Object.fromEntries(reactions.map(row=>[row.candidate_key,row.feedback])) as Record<string,"liked"|"dismissed">;
  const external=await discoverRecipes(id,discoverySeeds(saved,kitchen.meals,preferences));
  const ingredientIds=new Map(kitchen.ingredients.map(ingredient=>[normalizeName(ingredient.name),ingredient.id]));
  const local:Candidate[]=saved.some(recipe=>!recipe.archived) ? saved.map(recipe=>asCandidate(recipe)) : examples.map(recipe=>asCandidate(recipe,"starter"));
  const candidates=[...local,...external.candidates.map(candidate=>({...candidate,recipe:{...candidate.recipe,ingredients:candidate.recipe.ingredients.map(line=>({...line,ingredientId:ingredientIds.get(normalizeName(line.name))}))}}))];
  const recommendations=rankRecommendations(candidates,saved,kitchen.meals,preferences,feedback,12,Object.fromEntries(history.map(row=>[row.recipe_id,row.planned_count])));
  return response({recommendations,preferences,feedback,personalized:true,discoveryStatus:external.status});
 } catch {
  return response({error:"Suggestions could not be loaded. Please try again."},500);
 }
}
export async function POST(request:NextRequest) {
 try {
  if(request.headers.get("origin")!==request.nextUrl.origin) return response({error:"This request came from a different website."},403);
  const id=await user();
  if(!id) return response({error:"Sign in to save your recommendation preferences."},401);
  if(Number(request.headers.get("content-length")||0)>12000) return response({error:"This request is too large."},413);
  const content=await request.text();
  if(Buffer.byteLength(content)>12000) return response({error:"This request is too large."},413);
  const body=JSON.parse(content);
  if(body.action==="preferences") {
   const preferences=preferencesSchema.parse(body.preferences);
   await sql`INSERT INTO recommendation_preferences(user_id,cuisines,max_minutes,disliked_ingredients) VALUES(${id},${JSON.stringify([...new Set(preferences.cuisines)])}::jsonb,${preferences.maxMinutes},${JSON.stringify([...new Set(preferences.dislikedIngredients)])}::jsonb) ON CONFLICT(user_id) DO UPDATE SET cuisines=EXCLUDED.cuisines,max_minutes=EXCLUDED.max_minutes,disliked_ingredients=EXCLUDED.disliked_ingredients,updated_at=now()`;
   return response({ok:true});
  }
  if(body.action==="feedback") {
   const key=z.string().regex(/^(saved:[0-9a-f-]{36}|starter:[0-9a-f-]{36}|themealdb:\d{1,12})$/i).parse(body.key);
   const feedback=z.enum(["liked","dismissed","clear"]).parse(body.feedback);
   if(key.startsWith("saved:")) {
    const owned=await sql`SELECT id FROM recipes WHERE id=${key.slice(6)} AND user_id=${id}`;
    if(!owned.length) return response({error:"Recipe not found."},404);
   }
   if(feedback==="clear") await sql`DELETE FROM recommendation_feedback WHERE user_id=${id} AND candidate_key=${key}`;
   else await sql`INSERT INTO recommendation_feedback(user_id,candidate_key,feedback) VALUES(${id},${key},${feedback}) ON CONFLICT(user_id,candidate_key) DO UPDATE SET feedback=EXCLUDED.feedback,created_at=now()`;
   return response({ok:true});
  }
  return response({error:"Unknown recommendation action."},400);
 } catch(error) {
  return response({error:error instanceof z.ZodError ? error.issues[0]?.message : "Your preferences could not be saved. Please try again."},400);
 }
}
