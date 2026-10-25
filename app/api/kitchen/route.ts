import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { normalizeName } from '@/lib/domain';
import { importRecipe } from '@/lib/importer';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const sql=neon(process.env.DATABASE_URL!);
const lineSchema=z.object({ingredientId:z.string().uuid().optional(),name:z.string().trim().min(1).max(120),quantity:z.number().min(0).max(100000).nullable(),unit:z.string().max(40),preparation:z.string().max(500),originalText:z.string().max(1000).optional(),allowNew:z.boolean().optional()});
const webUrl=z.string().max(2000).refine(v=>!v||/^https?:\/\//i.test(v),'Use an http or https URL.');
const recipeSchema=z.object({id:z.string().uuid(),title:z.string().trim().min(1).max(200),description:z.string().max(4000),imageUrl:webUrl,sourceUrl:webUrl,sourceName:z.string().max(200),servings:z.number().positive().max(1000),minutes:z.number().int().min(0).max(10080),collection:z.string().trim().min(1).max(80),instructions:z.array(z.string().max(6000)).max(100),notes:z.string().max(10000),favorite:z.boolean(),ingredients:z.array(lineSchema).min(1).max(100)});
async function user(){const {data}=await auth.getSession();return data?.user?.id;}
async function snapshot(id:string){const [recipes,ingredients,state]=await Promise.all([sql`SELECT r.id,r.title,r.description,r.image_url AS "imageUrl",r.source_url AS "sourceUrl",r.source_name AS "sourceName",r.servings::float8,r.minutes,r.collection,r.instructions,r.notes,r.favorite,COALESCE((SELECT jsonb_agg(jsonb_build_object('ingredientId',i.id,'name',i.name,'quantity',ri.quantity::float8,'unit',ri.unit,'preparation',ri.preparation,'originalText',ri.original_text) ORDER BY ri.position) FROM recipe_ingredients ri JOIN ingredients i ON i.id=ri.ingredient_id WHERE ri.recipe_id=r.id),'[]') AS ingredients FROM recipes r WHERE r.user_id=${id} ORDER BY r.updated_at DESC`,sql`SELECT id,name,category FROM ingredients ORDER BY name`,sql`SELECT meals,checked FROM kitchen_state WHERE user_id=${id}`]);return {recipes,ingredients,meals:state[0]?.meals||{},checked:state[0]?.checked||[]};}
export async function GET(){try{const id=await user();if(!id)return NextResponse.json({error:'Sign in to open your recipe collection.'},{status:401});return NextResponse.json(await snapshot(id),{headers:{'Cache-Control':'private, no-store'}});}catch(e){console.error('Kitchen read failed',e instanceof Error?e.message:'Unknown error');return NextResponse.json({error:'Your kitchen could not be loaded. Please try again.'},{status:500});}}
export async function POST(request:NextRequest){
 try{if(request.headers.get('origin')!==request.nextUrl.origin)return NextResponse.json({error:'This request came from a different website.'},{status:403});
 const id=await user();if(!id)return NextResponse.json({error:'Sign in to save changes.'},{status:401});
 if(Number(request.headers.get('content-length')||0)>200000)return NextResponse.json({error:'This recipe is too large.'},{status:413});
 const body=await request.json();
 if(body.action==='import'){const url=z.string().url().max(2000).parse(body.url);return NextResponse.json({draft:await importRecipe(url)});}
 if(body.action==='ingredient'){
 const data=z.object({name:z.string().trim().min(1).max(120),category:z.enum(['Produce','Pantry','Dairy & eggs','Meat & fish','Frozen','Other']),allowNew:z.boolean().optional()}).parse(body);
 const normalized=normalizeName(data.name);if(!normalized)throw new Error('Give this ingredient a name.');
 const exact=await sql`SELECT id,name,category FROM ingredients WHERE normalized_name=${normalized}`;if(exact[0])return NextResponse.json({ingredient:exact[0],existing:true});
 const similar=await sql`SELECT id,name,category FROM ingredients WHERE similarity(normalized_name,${normalized}) > 0.35 ORDER BY similarity(normalized_name,${normalized}) DESC LIMIT 5`;
 if(similar.length&&!data.allowNew)return NextResponse.json({error:'There are similar ingredients already in the library.',matches:similar},{status:409});
 const added=await sql`INSERT INTO ingredients(name,normalized_name,category,created_by) VALUES(${data.name},${normalized},${data.category},${id}) ON CONFLICT(normalized_name) DO UPDATE SET normalized_name=EXCLUDED.normalized_name RETURNING id,name,category`;return NextResponse.json({ingredient:added[0]});
 }
 if(body.action==='saveRecipe'){
 const recipe=recipeSchema.parse(body.recipe);const owned=await sql`SELECT user_id FROM recipes WHERE id=${recipe.id}`;
 if(owned[0]&&owned[0].user_id!==id)return NextResponse.json({error:'Recipe not found.'},{status:404});
 const resolved=[];
 for(let index=0;index<recipe.ingredients.length;index++){
 const line=recipe.ingredients[index];let matches=line.ingredientId?await sql`SELECT id FROM ingredients WHERE id=${line.ingredientId}`:await sql`SELECT id FROM ingredients WHERE normalized_name=${normalizeName(line.name)}`;
 if(!matches[0])return NextResponse.json({error:`Add “${line.name}” to the ingredient library, or choose an existing ingredient before saving.`,lineIndex:index},{status:422});
 resolved.push({...line,ingredientId:matches[0].id});
 }
 await sql.transaction([
 sql`INSERT INTO recipes(id,user_id,title,description,image_url,source_url,source_name,servings,minutes,collection,instructions,notes,favorite) VALUES(${recipe.id},${id},${recipe.title},${recipe.description},${recipe.imageUrl},${recipe.sourceUrl},${recipe.sourceName},${recipe.servings},${recipe.minutes},${recipe.collection},${JSON.stringify(recipe.instructions)}::jsonb,${recipe.notes},${recipe.favorite}) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,image_url=EXCLUDED.image_url,source_url=EXCLUDED.source_url,source_name=EXCLUDED.source_name,servings=EXCLUDED.servings,minutes=EXCLUDED.minutes,collection=EXCLUDED.collection,instructions=EXCLUDED.instructions,notes=EXCLUDED.notes,favorite=EXCLUDED.favorite,updated_at=now() WHERE recipes.user_id=${id}`,
 sql`DELETE FROM recipe_ingredients WHERE recipe_id=${recipe.id} AND EXISTS(SELECT 1 FROM recipes WHERE id=${recipe.id} AND user_id=${id})`,
 sql`INSERT INTO recipe_ingredients(recipe_id,ingredient_id,quantity,unit,preparation,original_text,position) SELECT ${recipe.id},(line->>'ingredientId')::uuid,(line->>'quantity')::numeric,line->>'unit',line->>'preparation',COALESCE(line->>'originalText',''),(ordinality-1)::int FROM jsonb_array_elements(${JSON.stringify(resolved)}::jsonb) WITH ORDINALITY AS t(line,ordinality) WHERE EXISTS(SELECT 1 FROM recipes WHERE id=${recipe.id} AND user_id=${id})`
 ]);return NextResponse.json(await snapshot(id));
 }
 if(body.action==='deleteRecipe'){const recipeId=z.string().uuid().parse(body.id);await sql`DELETE FROM recipes WHERE id=${recipeId} AND user_id=${id}`;return NextResponse.json(await snapshot(id));}
 if(body.action==='favorite'){const recipeId=z.string().uuid().parse(body.id);const favorite=z.boolean().parse(body.favorite);await sql`UPDATE recipes SET favorite=${favorite} WHERE id=${recipeId} AND user_id=${id}`;return NextResponse.json(await snapshot(id));}
 if(body.action==='state'){const state=z.object({meals:z.record(z.string().uuid(),z.number().positive().max(1000)).refine(v=>Object.keys(v).length<=100),checked:z.array(z.string().max(200)).max(1000)}).parse(body);const owned=await sql`SELECT id FROM recipes WHERE user_id=${id}`;const ids=new Set(owned.map(r=>r.id));if(Object.keys(state.meals).some(key=>!ids.has(key)))return NextResponse.json({error:'Choose recipes from your own collection.'},{status:400});await sql`INSERT INTO kitchen_state(user_id,meals,checked) VALUES(${id},${JSON.stringify(state.meals)}::jsonb,${JSON.stringify(state.checked)}::jsonb) ON CONFLICT(user_id) DO UPDATE SET meals=EXCLUDED.meals,checked=EXCLUDED.checked,updated_at=now()`;return NextResponse.json({ok:true});}
 return NextResponse.json({error:'Unknown kitchen action.'},{status:400});
 }catch(e){if(e instanceof z.ZodError)return NextResponse.json({error:e.issues[0]?.message||'Please check the recipe details.'},{status:400});console.error('Kitchen action failed',e instanceof Error?e.message:'Unknown error');return NextResponse.json({error:e instanceof Error&&(/recipe|import|website|public|address|page|redirect/i.test(e.message))?e.message:'Your change could not be saved. Please try again.'},{status:400});}
}
