import "server-only";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { themealdbCandidate, selectProviderMeals } from "./themealdb";
import type { Candidate } from "./recommendations";
const sql=neon(process.env.DATABASE_URL!);
type Seeds = { cuisines:string[];ingredients:string[] };
export type DiscoveryStatus = "available" | "not_configured" | "unavailable" | "limited";
async function request(key:string,path:string,signal:AbortSignal) {
 const response=await fetch("https://www.themealdb.com/api/json/v1/"+encodeURIComponent(key)+"/"+path,{signal,cache:"no-store"});
 if(!response.ok) throw new Error("Recipe provider unavailable");
 const content=await response.text();
 if(content.length>1_000_000) throw new Error("Recipe provider response too large");
 const data=JSON.parse(content);
 return Array.isArray(data.meals) ? data.meals.filter((meal:unknown)=>meal&&typeof meal==="object") as Record<string,unknown>[] : [];
}
export async function discoverRecipes(userId:string,seeds:Seeds):Promise<{candidates:Candidate[];status:DiscoveryStatus}> {
 const key=process.env.THEMEALDB_API_KEY || (process.env.NODE_ENV==="development" ? "1" : "");
 if(!key || (key==="1" && process.env.NODE_ENV==="production")) return {candidates:[],status:"not_configured"};
 const queries=[
  ...seeds.cuisines.map(name=>"filter.php?a="+encodeURIComponent(name)),
  ...seeds.ingredients.map(name=>"filter.php?i="+encodeURIComponent(name.replace(/ /g,"_"))),
 ].slice(0,3);
 if(!queries.length) queries.push("search.php?f=a");
 const cacheKey=createHash("sha256").update(JSON.stringify(queries)).digest("hex");
 try {
  const cached=await sql`SELECT payload FROM recommendation_provider_cache WHERE cache_key=${cacheKey} AND expires_at>now()`;
  if(cached[0]) {
   const meals=Array.isArray(cached[0].payload)?cached[0].payload:[];
   return { candidates:meals.map(themealdbCandidate).filter((value:Candidate|null):value is Candidate=>!!value),status:"available" };
  }
  const allowed=await sql`INSERT INTO recommendation_rate_limits(user_id,window_start,request_count) VALUES(${userId},now(),1) ON CONFLICT(user_id) DO UPDATE SET window_start=CASE WHEN recommendation_rate_limits.window_start<now()-interval '1 hour' THEN now() ELSE recommendation_rate_limits.window_start END,request_count=CASE WHEN recommendation_rate_limits.window_start<now()-interval '1 hour' THEN 1 ELSE recommendation_rate_limits.request_count+1 END WHERE recommendation_rate_limits.window_start<now()-interval '1 hour' OR recommendation_rate_limits.request_count<20 RETURNING user_id`;
  if(!allowed.length) return {candidates:[],status:"limited"};
  const signal=AbortSignal.timeout(9000);
  const results=await Promise.allSettled(queries.map(query=>request(key,query,signal)));
  let groups=results.flatMap(result=>result.status==="fulfilled"?[result.value]:[]);
  if(!groups.some(group=>group.length) && queries[0]!=="search.php?f=a") groups=[await request(key,"search.php?f=a",signal)];
  const unique=selectProviderMeals(groups);
  const full:Record<string,unknown>[]=[];
  for(let index=0;index<unique.length;index+=3) {
   const batch=await Promise.allSettled(unique.slice(index,index+3).map(async meal=>
     meal.strInstructions ? meal : (await request(key,"lookup.php?i="+encodeURIComponent(String(meal.idMeal)),signal))[0]
   ));
   for(const entry of batch) if(entry.status==="fulfilled"&&entry.value) full.push(entry.value);
  }
  const candidates=full.map(themealdbCandidate).filter((value):value is Candidate=>!!value);
  if(!candidates.length) return {candidates:[],status:"unavailable"};
  await sql`DELETE FROM recommendation_provider_cache WHERE expires_at<now()`;
  await sql`INSERT INTO recommendation_provider_cache(cache_key,payload,expires_at) VALUES(${cacheKey},${JSON.stringify(full)}::jsonb,now()+interval '6 hours') ON CONFLICT(cache_key) DO UPDATE SET payload=EXCLUDED.payload,expires_at=EXCLUDED.expires_at`;
  return {candidates,status:"available"};
 } catch {
  return {candidates:[],status:"unavailable"};
 }
}
