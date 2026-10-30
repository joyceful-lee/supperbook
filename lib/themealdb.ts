import { parseIngredient, type Recipe } from "./domain.ts";
import { canonicalCuisine, type Candidate } from "./recommendations.ts";
function text(value: unknown, max = 1000) { return typeof value === "string" ? value.trim().slice(0,max) : ""; }
function webUrl(value: unknown) {
 try { const url=new URL(text(value,2000)); return ["http:","https:"].includes(url.protocol)&&!url.username&&!url.password ? url.href : ""; } catch { return ""; }
}
export function themealdbCandidate(meal: Record<string,unknown>): Candidate | null {
 const id=text(meal.idMeal,20), title=text(meal.strMeal,200);
 if(!/^\d{1,12}$/.test(id)||!title) return null;
 const ingredients:Recipe["ingredients"]=[];
 for(let index=1;index<=20;index++) {
  const name=text(meal["strIngredient"+index],120);
  if(!name) continue;
  const measure=text(meal["strMeasure"+index],100);
  const parsed=parseIngredient(measure ? measure+" "+name : name);
  const extra=parsed.name.endsWith(name) ? parsed.name.slice(0,-name.length).trim() : "";
  ingredients.push({...parsed,name,preparation:[extra,parsed.preparation].filter(Boolean).join(", "),originalText:measure ? measure+" "+name : name});
 }
 const instructions=text(meal.strInstructions,50000).split(/\r?\n+/).map(value=>value.trim()).filter(Boolean).slice(0,100);
 if(!ingredients.length||!instructions.length) return null;
 const providerUrl=`https://www.themealdb.com/meal.php?c=${id}`;
 const sourceUrl=webUrl(meal.strSource)||providerUrl;
 const sourceName=sourceUrl===providerUrl?"TheMealDB":new URL(sourceUrl).hostname.replace(/^www\./,"");
 const recipe:Recipe={
  id:"",title,description:[text(meal.strArea,80),text(meal.strCategory,80)].filter(Boolean).join(" · "),
  imageUrl:webUrl(meal.strMealThumb),sourceUrl,sourceName,
  servings:0,minutes:0,collection:"Everyday",collections:["Everyday"],instructions,notes:"",favorite:false,
  ingredients,cuisine:canonicalCuisine(text(meal.strArea,80)),externalProvider:"themealdb",externalId:id,
 };
 return {key:"themealdb:"+id,origin:"themealdb",recipe,timeKnown:false,servingsKnown:false};
}

export function selectProviderMeals(groups:Record<string,unknown>[][],limit=9) {
 const meals:Record<string,unknown>[]=[];
 const seen=new Set<string>();
 const longest=Math.max(0,...groups.map(group=>group.length));
 for(let index=0;index<longest&&meals.length<limit;index++) for(const group of groups) {
  const meal=group[index];
  if(!meal||typeof meal.idMeal!=="string"||!/^\d{1,12}$/.test(meal.idMeal)||seen.has(meal.idMeal))continue;
  seen.add(meal.idMeal);meals.push(meal);
  if(meals.length===limit)break;
 }
 return meals;
}
