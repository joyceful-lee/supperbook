"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, BookOpen, Clock3, LoaderCircle, SlidersHorizontal, ThumbsDown, ThumbsUp } from "lucide-react";
import FoodImage from "./food-image";
import { cuisineOptions, defaultPreferences, type Recommendation, type RecommendationPreferences } from "@/lib/recommendations";
import type { Recipe } from "@/lib/domain";
export type DiscoveryResponse = {
 recommendations: Recommendation[]; preferences: RecommendationPreferences;
 feedback:Record<string,"liked"|"dismissed">; personalized:boolean;
 discoveryStatus:"available"|"not_configured"|"unavailable"|"limited"|"sign_in";
};
type Transport=(method:"GET"|"POST",body?:unknown)=>Promise<unknown>;
async function serverRequest(method:"GET"|"POST",body?:unknown) {
 const response=await fetch("/api/recommendations",{method,cache:"no-store",signal:AbortSignal.timeout(22000),
  ...(body?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});
 const data=await response.json();
 if(!response.ok) throw new Error(data.error || "Suggestions could not be loaded.");
 return data;
}
type Props={
 contextKey:string; requireUser:()=>boolean;
 onPreview:(recipe:Recipe)=>void; onReview:(recipe:Recipe)=>void; onPlan:(recipe:Recipe)=>Promise<void>;
 request?:Transport;
};
export default function Discover({contextKey,requireUser,onPreview,onReview,onPlan,request=serverRequest}:Props) {
 const [data,setData]=useState<DiscoveryResponse|null>(null);
 const [preferences,setPreferences]=useState<RecommendationPreferences>(defaultPreferences);
 const [dislikes,setDislikes]=useState("");
 const [loading,setLoading]=useState(true),[working,setWorking]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [lastDismissed,setLastDismissed]=useState<{key:string;title:string;previous?:"liked"|"dismissed"}|null>(null);
 const initialized=useRef(false);
 const requestSequence=useRef(0);
 const load=useCallback(async(syncPreferences=false)=>{
  const sequence=++requestSequence.current;
  setLoading(true);setError("");
  try {
   const result=await request("GET") as DiscoveryResponse;
   if(!Array.isArray(result.recommendations)) throw new Error("Suggestions could not be loaded.");
   if(sequence!==requestSequence.current)return;
   setData(result);
   if(syncPreferences||!initialized.current) {
    setPreferences(result.preferences);setDislikes(result.preferences.dislikedIngredients.join(", "));
    initialized.current=true;
   }
  } catch(error) {if(sequence===requestSequence.current)setError(error instanceof Error?error.message:"Suggestions could not be loaded.");}
  finally {if(sequence===requestSequence.current)setLoading(false);}
 },[request]);
 useEffect(()=>{void load();return()=>{requestSequence.current++;};},[load,contextKey]);
 async function savePreferences(event:FormEvent) {
  event.preventDefault();if(!requireUser())return;
  setWorking("preferences");setError("");
  try {
   await request("POST",{action:"preferences",preferences:{...preferences,dislikedIngredients:dislikes.split(",").map(value=>value.trim()).filter(Boolean)}});
   await load(true);setNotice("Preferences saved.");
  } catch(error) {setError((error as Error).message);}
  finally {setWorking("");}
 }
 async function react(item:Recommendation,feedback:"liked"|"dismissed"|"clear") {
  if(!requireUser())return;
  setWorking(item.key);setError("");setNotice("");
  try {
   await request("POST",{action:"feedback",key:item.key,feedback});
   if(feedback==="dismissed") {
    setLastDismissed({key:item.key,title:item.recipe.title,previous:data?.feedback[item.key]});
    setData(current=>current?{...current,recommendations:current.recommendations.filter(value=>value.key!==item.key)}:current);
   } else setNotice(feedback==="liked"?"We’ll use this to shape future suggestions.":"Preference removed.");
   await load();
  } catch(error) {setError((error as Error).message);}
  finally {setWorking("");}
 }
 async function addToPlan(item:Recommendation) {
  if(!requireUser())return;
  setWorking(item.key);
  try {await onPlan(item.recipe);await load();} finally {setWorking("");}
 }
 async function undoDismissal() {
  if(!lastDismissed)return;
  setWorking("undo");
  try {
   await request("POST",{action:"feedback",key:lastDismissed.key,feedback:lastDismissed.previous||"clear"});
   setLastDismissed(null);setNotice("Suggestion restored.");await load();
  } catch(error) {setError((error as Error).message);}
  finally {setWorking("");}
 }
 return <div className="discover">
  <div className="discover-intro">
   <p>Suggestions based on the recipes you keep and the meals you plan.</p>
   <button className="outline" disabled={loading||!!working} onClick={()=>load()}>{loading?<LoaderCircle size={16} className="spin"/>:<ArrowRight size={16}/>}Refresh suggestions</button>
  </div>
  {data&&!data.personalized&&<div className="discovery-notice">Sign in to personalize suggestions and save your preferences. <button className="inline-link" onClick={requireUser}>Sign in</button></div>}
  <details className="discovery-preferences">
   <summary><SlidersHorizontal size={16}/>Your preferences</summary>
   <form onSubmit={savePreferences}>
    <fieldset><legend>Preferred cuisines</legend><div className="cuisine-options">
     {cuisineOptions.map(cuisine=><label key={cuisine}><input type="checkbox" checked={preferences.cuisines.includes(cuisine)} disabled={preferences.cuisines.length>=8&&!preferences.cuisines.includes(cuisine)}
      onChange={event=>setPreferences(current=>({...current,cuisines:event.target.checked?[...current.cuisines,cuisine]:current.cuisines.filter(value=>value!==cuisine)}))}/>{cuisine}</label>)}
    </div></fieldset>
    <div className="discovery-preference-fields">
     <label>Maximum cooking time<input type="number" min={5} max={240} placeholder="No time limit" value={preferences.maxMinutes??""} onChange={event=>setPreferences(current=>({...current,maxMinutes:event.target.value?Number(event.target.value):null}))}/><small>Minutes. Recipes with unknown times are excluded when you set a limit.</small></label>
     <label>Ingredients to skip<input maxLength={1000} placeholder="Olives, coriander" value={dislikes} onChange={event=>setDislikes(event.target.value)}/><small>Separate names with commas.</small></label>
    </div>
    <button className="primary" disabled={!!working}>{working==="preferences"&&<LoaderCircle size={15} className="spin"/>}Save preferences</button>
   </form>
  </details>
  {error&&<div className="error-banner" role="alert">{error}<button className="inline-link" onClick={()=>load()}>Try again</button></div>}
  {notice&&<p className="discovery-status" role="status">{notice}</p>}
  {lastDismissed&&<div className="discovery-notice" role="status">Hidden: {lastDismissed.title}<button className="inline-link" disabled={!!working} onClick={undoDismissal}>Undo</button></div>}
  {data?.personalized&&data.discoveryStatus!=="available"&&<p className="discovery-provider-note">
   {data.discoveryStatus==="limited"?"New recipe discovery has reached its hourly limit. Suggestions from your collection are still available.":data.discoveryStatus==="unavailable"?"New recipes couldn’t be loaded. Suggestions from your collection are still available.":"Showing saved and starter recipes for now."}
  </p>}
  {loading&&!data?<div className="empty" role="status"><LoaderCircle className="spin"/><p>Finding recipes for your next few meals…</p></div>:data?.recommendations.length?
   <div className="recipe-grid discovery-grid" aria-busy={loading}>
    {data.recommendations.map(item=><article className="recipe-card discovery-card" key={item.key}>
     <div className="card-photo"><button className="photo-button" aria-label={`Preview ${item.recipe.title}`} onClick={()=>onPreview(item.recipe)}><FoodImage src={item.recipe.imageUrl} alt={item.recipe.title}/></button>
     <span className="card-category">{item.origin==="saved"?"Saved recipe":item.origin==="themealdb"?"TheMealDB":"Supperbook"}</span></div>
     <div className="card-body">
      <button className="card-title" onClick={()=>onPreview(item.recipe)}>{item.recipe.title}</button>
      {item.recipe.cuisine&&<p className="discovery-cuisine">{item.recipe.cuisine}</p>}
      <ul className="recommendation-reasons">{item.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>
      {item.extraIngredients!==null&&<p className="discovery-extra">{item.extraIngredients ? `Adds ${item.extraIngredients} ingredient${item.extraIngredients===1?"":"s"} to your shopping list` : "Uses ingredients already on your shopping list"}</p>}
      <div className="discovery-time"><Clock3 size={14}/>{item.timeKnown?`${item.recipe.minutes} minutes`:"Cooking time not listed"}</div>
      {item.origin==="themealdb"&&<a className="discovery-attribution" target="_blank" rel="noreferrer" href={`https://www.themealdb.com/meal.php?c=${item.recipe.externalId}`}>Recipe from TheMealDB</a>}
      <div className="discovery-card-actions">
       <button className="outline" disabled={!!working} onClick={()=>item.origin==="saved"?addToPlan(item):onReview(item.recipe)}><BookOpen size={14}/>{item.origin==="saved"?"Add to meal plan":"Review and save"}</button>
       <div className="recommendation-feedback">
        <button className="icon-button" disabled={!!working} aria-pressed={data.feedback[item.key]==="liked"} aria-label={`More like ${item.recipe.title}`} onClick={()=>react(item,data.feedback[item.key]==="liked"?"clear":"liked")}><ThumbsUp size={16}/></button>
        <button className="icon-button" disabled={!!working} aria-label={`Not interested in ${item.recipe.title}`} onClick={()=>react(item,"dismissed")}><ThumbsDown size={16}/></button>
       </div>
      </div>
     </div>
    </article>)}
   </div>:!loading&&!error&&<div className="empty"><h2>No suggestions yet</h2><p>All matching recipes may already be planned, hidden, or outside your preferences. Try changing your time limit, adding recipes, or undoing your last dismissal.</p></div>}
 </div>;
}
