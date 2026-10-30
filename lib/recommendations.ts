import { normalizeName, type Meals, type Recipe } from "./domain.ts";
import { recipeCollections } from "./recipe-management.ts";
export type RecommendationPreferences = { cuisines: string[]; maxMinutes: number | null; dislikedIngredients: string[] };
export type Candidate = { key: string; origin: "saved" | "starter" | "themealdb"; recipe: Recipe; timeKnown: boolean; servingsKnown: boolean };
export type Recommendation = Candidate & { reasons: string[]; extraIngredients: number | null };
export const defaultPreferences: RecommendationPreferences = { cuisines: [], maxMinutes: null, dislikedIngredients: [] };
export const cuisineOptions = ["American","British","Canadian","Chinese","French","Greek","Indian","Italian","Japanese","Mexican","Spanish","Thai","Turkish","Vietnamese"];
export function canonicalCuisine(value:string) {
 const aliases:Record<string,string>={"united states":"American","united states of america":"American","usa":"American","united kingdom":"British","uk":"British","canada":"Canadian","china":"Chinese","france":"French","greece":"Greek","india":"Indian","italy":"Italian","japan":"Japanese","mexico":"Mexican","spain":"Spanish","thailand":"Thai","turkey":"Turkish","vietnam":"Vietnamese","netherlands":"Dutch"};
 return aliases[value.trim().toLowerCase()]||value.trim();
}
export function candidateKey(recipe: Recipe) {
 return recipe.externalProvider && recipe.externalId ? `${recipe.externalProvider}:${recipe.externalId}` : `saved:${recipe.id}`;
}
export function asCandidate(recipe: Recipe, origin: Candidate["origin"] = "saved"): Candidate {
 return { key: origin === "starter" ? `starter:${recipe.id}` : candidateKey(recipe), origin, recipe, timeKnown: recipe.minutes > 0, servingsKnown: true };
}
const names = (recipe: Recipe) => [...new Set(recipe.ingredients.map(line => normalizeName(line.name)).filter(Boolean))];
function disliked(name: string, exclusions: string[]) {
 const text = " " + normalizeName(name) + " ";
 return exclusions.some(value => { const normalized = normalizeName(value); return normalized && text.includes(" " + normalized + " "); });
}
function overlap(a: string[], b: Set<string>) { return a.filter(name => b.has(name)).length; }
export function rankRecommendations(
 candidates: Candidate[], saved: Recipe[], meals: Meals, preferences: RecommendationPreferences,
 feedback: Record<string,"liked" | "dismissed"> = {}, limit = 12, activity:Record<string,number> = {},
): Recommendation[] {
 const active = saved.filter(recipe => !recipe.archived);
 const planned = active.filter(recipe => meals[recipe.id]);
 const plannedNames = new Set(planned.flatMap(names));
 const plannedTitles = new Set(planned.map(recipe => normalizeName(recipe.title)));
 const plannedKeys = new Set(planned.map(candidateKey));
 const ownedKeys = new Set(saved.map(candidateKey));
 const ownedUrls = new Set(saved.map(recipe=>recipe.sourceUrl).filter(Boolean));
 const ownedTitles = new Set(saved.map(recipe => normalizeName(recipe.title)));
 const taste = new Map<string,number>();
 for(const recipe of active) for(const name of names(recipe)) taste.set(name,(taste.get(name)||0)+(recipe.favorite?4:1)+Math.min(2,Math.log1p(activity[recipe.id]||0)));
 for(const candidate of candidates.filter(value=>feedback[value.key]==="liked")) for(const name of names(candidate.recipe)) taste.set(name,(taste.get(name)||0)+3);
 const favoriteCollections = new Set(active.filter(recipe=>recipe.favorite).flatMap(recipeCollections));
 const seen = new Set<string>();
 const scored = candidates.flatMap(candidate => {
  const recipe = candidate.recipe, ingredientNames = names(recipe);
  const titleKey = normalizeName(recipe.title);
  if(seen.has(candidate.key) || recipe.archived || feedback[candidate.key] === "dismissed" || plannedKeys.has(candidate.key) || plannedTitles.has(titleKey)) return [];
  if(candidate.origin !== "saved" && (ownedTitles.has(titleKey) || ownedKeys.has(candidate.key) || (recipe.sourceUrl && ownedUrls.has(recipe.sourceUrl)))) return [];
  if(recipe.ingredients.some(line => disliked(line.name,preferences.dislikedIngredients))) return [];
  if(preferences.maxMinutes !== null && (!candidate.timeKnown || recipe.minutes > preferences.maxMinutes)) return [];
  seen.add(candidate.key);
  const matches = overlap(ingredientNames,plannedNames);
  const affinity = ingredientNames.reduce((sum,name)=>sum+Math.min(1,(taste.get(name)||0)/4),0)/Math.max(1,ingredientNames.length);
  const cuisineMatch = preferences.cuisines.some(value=>canonicalCuisine(value).toLowerCase() === canonicalCuisine(recipe.cuisine||"").toLowerCase());
  let score = affinity*.45 + matches/Math.max(1,ingredientNames.length)*.3 + (candidate.timeKnown ? .1 : 0) + (cuisineMatch ? .15 : 0);
  const reasons:string[] = [];
  if((activity[recipe.id]||0)>=3) { score+=.1; reasons.push("Often added to your meal plans"); }
  if(recipe.favorite) { score+=.2; reasons.push("A favorite from your collection"); }
  if(matches) reasons.push(`Shares ${matches} ingredient${matches===1?"":"s"} with your meal plan`);
  if(cuisineMatch) reasons.push(`Matches your preference for ${recipe.cuisine} cooking`);
  if(feedback[candidate.key] === "liked") { score+=.25; reasons.push("You liked this suggestion"); }
  if(candidate.origin === "saved" && recipeCollections(recipe).some(name=>favoriteCollections.has(name))) score+=.05;
  if(!reasons.length && affinity>0 && saved.length) reasons.push("Uses ingredients in recipes you keep");
  if(candidate.timeKnown && preferences.maxMinutes !== null) reasons.push(`Fits your ${preferences.maxMinutes}-minute limit`);
  if(!reasons.length) reasons.push(candidate.origin === "saved" ? "From your saved recipes" : candidate.origin === "starter" ? "From the Supperbook collection" : "A new recipe to explore");
  return [{ candidate, ingredientNames, score, reasons:reasons.slice(0,3), extraIngredients: plannedNames.size ? ingredientNames.length-matches : null }];
 });
 const selected: typeof scored = [];
 while(scored.length && selected.length<limit) {
  let best=0,bestScore=-Infinity;
  scored.forEach((entry,index) => {
   const similarity = selected.reduce((max,other)=>Math.max(max,overlap(entry.ingredientNames,new Set(other.ingredientNames))/Math.max(1,new Set([...entry.ingredientNames,...other.ingredientNames]).size)),0);
   const variedScore = entry.score-similarity*.15;
   if(variedScore>bestScore) { best=index; bestScore=variedScore; }
  });
  selected.push(scored.splice(best,1)[0]);
 }
 return selected.map(({candidate,reasons,extraIngredients})=>({...candidate,reasons,extraIngredients}));
}
export function discoverySeeds(saved: Recipe[], meals: Meals, preferences: RecommendationPreferences) {
 const counts = new Map<string,number>();
 const providerNames = new Map<string,string>();
 const staples = new Set(["salt","water","black pepper","olive oil","vegetable oil","butter","sugar","flour"]);
 for(const recipe of saved.filter(recipe=>!recipe.archived)) for(const line of recipe.ingredients) {
  const name=normalizeName(line.name);
  if(!name || staples.has(name) || disliked(line.name,preferences.dislikedIngredients)) continue;
  providerNames.set(name,line.name.trim().toLowerCase());
  counts.set(name,(counts.get(name)||0)+(meals[recipe.id]?5:recipe.favorite?3:1));
 }
 return { cuisines:preferences.cuisines.slice(0,1).map(canonicalCuisine), ingredients:[...counts].sort((a,b)=>b[1]-a[1]).slice(0,2).map(([name])=>providerNames.get(name)||name) };
}
