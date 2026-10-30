import { test } from "node:test";
import assert from "node:assert/strict";
import { asCandidate, defaultPreferences, discoverySeeds, rankRecommendations, type Candidate } from "../lib/recommendations.ts";
import { themealdbCandidate, selectProviderMeals } from "../lib/themealdb.ts";
import type { Recipe } from "../lib/domain.ts";
const recipe=(id:string,ingredients:string[],extra:Partial<Recipe>={}):Recipe=>({
 id,title:id,description:"",imageUrl:"",sourceUrl:"",sourceName:"",servings:2,minutes:25,
 collection:"Everyday",collections:["Everyday"],instructions:["Cook."],notes:"",favorite:false,
 ingredients:ingredients.map(name=>({name,quantity:1,unit:"",preparation:""})),...extra,
});
const external=(id:string,ingredients:string[],extra:Partial<Recipe>={}):Candidate=>({
 key:"themealdb:"+id,origin:"themealdb",recipe:recipe(id,ingredients,{externalProvider:"themealdb",externalId:id,...extra}),
 timeKnown:true,servingsKnown:true,
});
test("planned, archived, dismissed and already-saved external recipes are excluded",()=>{
 const planned=recipe("planned",["Rice"]), archived=recipe("archived",["Eggs"],{archived:true});
 const saved=recipe("edited name",["Beans"],{externalProvider:"themealdb",externalId:"10"});
 const result=rankRecommendations([asCandidate(planned),asCandidate(archived),external("10",["Beans"]),external("20",["Carrots"]),external("30",["Spinach"])],[planned,archived,saved],{planned:2},defaultPreferences,{"themealdb:20":"dismissed"});
 assert.deepEqual(result.map(value=>value.key),["themealdb:30"]);
});
test("favorites and shopping overlap rank relevant meals and give factual reasons",()=>{
 const favorite=recipe("favorite",["Lemon","Chickpeas"],{favorite:true});
 const planned=recipe("planned",["Spinach","Lemon"]);
 const result=rankRecommendations([external("1",["Carrots","Rice"]),external("2",["Lemon","Chickpeas","Spinach"])],[favorite,planned],{planned:2},defaultPreferences);
 assert.equal(result[0].key,"themealdb:2");
 assert.ok(result[0].reasons.some(reason=>reason.includes("2 ingredients")));
 assert.equal(result[0].extraIngredients,1);
 assert.ok(result.every(value=>value.reasons.every(reason=>!reason.includes("pantry"))));
});
test("time limits exclude unknown times and dislikes do not confuse eggs with eggplant",()=>{
 const candidates=[external("1",["Egg"]),external("2",["Eggplant"]),{...external("3",["Rice"]),timeKnown:false}];
 const result=rankRecommendations(candidates,[],{},{cuisines:[],maxMinutes:30,dislikedIngredients:["eggs"]});
 assert.deepEqual(result.map(value=>value.key),["themealdb:2"]);
});
test("liked feedback influences related recipes while diversity breaks ties",()=>{
 const result=rankRecommendations([external("1",["Lemon"]),external("2",["Lemon"]),external("3",["Carrots"])],[],{},defaultPreferences,{"themealdb:1":"liked"});
 assert.equal(result[0].key,"themealdb:1");
 assert.equal(result[1].key,"themealdb:2");
 const varied=rankRecommendations([external("1",["Rice"]),external("2",["Rice"]),external("3",["Carrots"])],[],{},defaultPreferences);
 assert.equal(varied[1].key,"themealdb:3");
});
test("discovery seeds prioritize planned ingredients and omit common staples",()=>{
 const planned=recipe("p",["Olive oil","Salt","Spinach"]);
 assert.deepEqual(discoverySeeds([planned],{p:2},{...defaultPreferences,cuisines:["Italian"]}),{cuisines:["Italian"],ingredients:["spinach"]});
});
test("TheMealDB conversion preserves measures, provenance and unknown yield/time",()=>{
 const candidate=themealdbCandidate({idMeal:"123",strMeal:"Pancakes",strArea:"British",strCategory:"Dessert",
 strIngredient1:"Eggs",strMeasure1:"2 large",strIngredient2:"Flour",strMeasure2:"1 1/2 cups",
 strInstructions:"Whisk.\r\nCook.",strSource:"javascript:alert(1)",strMealThumb:"https://www.themealdb.com/images/media/meals/example.jpg"});
 assert.ok(candidate);
 assert.equal(candidate.recipe.ingredients[0].name,"Eggs");
 assert.equal(candidate.recipe.ingredients[0].quantity,2);
 assert.equal(candidate.recipe.ingredients[0].preparation,"large");
 assert.equal(candidate.recipe.ingredients[1].quantity,1.5);
 assert.equal(candidate.recipe.ingredients[1].unit,"cup");
 assert.equal(candidate.recipe.sourceUrl,"https://www.themealdb.com/meal.php?c=123");
 assert.equal(candidate.recipe.servings,0);
 assert.equal(candidate.recipe.minutes,0);
 assert.equal(candidate.timeKnown,false);
 assert.equal(candidate.servingsKnown,false);
 assert.deepEqual(candidate.recipe.instructions,["Whisk.","Cook."]);
});
test("incomplete provider records do not become recommendations",()=>{
 assert.equal(themealdbCandidate({idMeal:"123",strMeal:"Missing method",strIngredient1:"Rice"}),null);
 assert.equal(themealdbCandidate({idMeal:"bad",strMeal:"Recipe"}),null);
});
test("planning history is treated as planned meals rather than cooked meals",()=>{
 const saved=recipe("repeat",["Rice"]);
 const result=rankRecommendations([asCandidate(saved)],[saved],{},defaultPreferences,{},12,{repeat:3});
 assert.ok(result[0].reasons.includes("Often added to your meal plans"));
 assert.ok(result[0].reasons.every(reason=>!reason.includes("cooked")));
});

test("provider discovery preserves plural ingredient names while matching internally",()=>{
 const saved=recipe("beans",["Chickpeas"]);
 assert.deepEqual(discoverySeeds([saved],{},defaultPreferences).ingredients,["chickpeas"]);
});

test("provider discovery balances search groups and deduplicates recipe ids",()=>{
 const meals=(ids:string[])=>ids.map(idMeal=>({idMeal}));
 const result=selectProviderMeals([meals(["1","2","3","4"]),meals(["1","5","6"]),meals(["7","bad","8"])],6);
 assert.deepEqual(result.map(meal=>meal.idMeal),["1","7","2","5","3","6"]);
});

test("country-shaped provider cuisine names match the cuisine preference",()=>{
 const candidate=themealdbCandidate({idMeal:"123",strMeal:"Pancakes",strArea:"United States",strIngredient1:"Eggs",strInstructions:"Whisk and cook."});
 assert.ok(candidate);
 assert.equal(candidate.recipe.cuisine,"American");
 const result=rankRecommendations([candidate],[],{},{...defaultPreferences,cuisines:["American"]});
 assert.ok(result[0].reasons.includes("Matches your preference for American cooking"));
});
