import "server-only";
import { mealOrder } from "./domain";
import { neon } from "@neondatabase/serverless";
const sql=neon(process.env.DATABASE_URL!);
export async function kitchenSnapshot(id: string) {
  const [recipes, ingredients, state, collections] = await Promise.all([
    sql`SELECT r.id,r.title,r.description,r.image_url AS "imageUrl",r.source_url AS "sourceUrl",r.source_name AS "sourceName",r.servings::float8,r.minutes,r.cuisine,(SELECT provider FROM recipe_sources rs WHERE rs.recipe_id=r.id AND rs.user_id=r.user_id) AS "externalProvider",(SELECT provider_recipe_id FROM recipe_sources rs WHERE rs.recipe_id=r.id AND rs.user_id=r.user_id) AS "externalId",r.collection,COALESCE((SELECT jsonb_agg(c.name ORDER BY lower(c.name)) FROM recipe_collections rc JOIN collections c ON c.id=rc.collection_id AND c.user_id=r.user_id WHERE rc.recipe_id=r.id AND rc.user_id=r.user_id),'[]') AS collections,r.instructions,r.notes,r.favorite,r.archived,r.collection_id AS "collectionId",COALESCE((SELECT jsonb_agg(jsonb_build_object('ingredientId',i.id,'name',i.name,'quantity',ri.quantity::float8,'unit',ri.unit,'preparation',ri.preparation,'originalText',ri.original_text) ORDER BY ri.position) FROM recipe_ingredients ri JOIN ingredients i ON i.id=ri.ingredient_id WHERE ri.recipe_id=r.id),'[]') AS ingredients FROM recipes r WHERE r.user_id=${id} ORDER BY r.updated_at DESC`,
    sql`SELECT id,name,category FROM ingredients ORDER BY name`,
    sql`SELECT meals,checked,meal_order FROM kitchen_state WHERE user_id=${id}`,
    sql`SELECT id,name FROM collections WHERE user_id=${id} ORDER BY lower(name)`,
  ]);
  return {
    recipes,
    collections,
    ingredients,
    meals: state[0]?.meals || {},
    checked: state[0]?.checked || [],
    mealOrder: mealOrder(state[0]?.meals || {}, state[0]?.meal_order || []),
  };
}
