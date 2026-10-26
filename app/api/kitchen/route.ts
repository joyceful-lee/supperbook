import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { normalizeName, isWebUrl, capitalizeIngredient, mealOrder } from "@/lib/domain";
import { importRecipe } from "@/lib/importer";
import { collectionAction } from "@/lib/collection-actions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const sql = neon(process.env.DATABASE_URL!);
const lineSchema = z.object({
  ingredientId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  quantity: z.number().min(0).max(100000).nullable(),
  unit: z.string().max(40),
  preparation: z.string().max(500),
  originalText: z.string().max(1000).optional(),
  allowNew: z.boolean().optional(),
});
const webUrl = z
  .string()
  .max(2000)
  .refine(isWebUrl, "Use a valid http or https URL.");
const collectionNameSchema = z
    .string()
    .trim()
    .min(1)
    .max(80)
    .transform((name) => name.replace(/\s+/g, " "))
    .refine(
      (name) =>
        !["all recipes", "favorites", "archived"].includes(name.toLowerCase()),
      "Please choose a different collection name.",
    )
    .transform((name) => (name.toLowerCase() === "unfiled" ? "Unfiled" : name));
const recipeSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000),
  imageUrl: webUrl,
  sourceUrl: webUrl,
  sourceName: z.string().max(200),
  servings: z.number().positive().max(1000),
  minutes: z.number().int().min(0).max(10080),
  collection: collectionNameSchema,
  collections: z.array(collectionNameSchema).max(30).optional(),
  instructions: z.array(z.string().max(6000)).max(100),
  notes: z.string().max(10000),
  favorite: z.boolean(),
  ingredients: z.array(lineSchema).min(1).max(100),
});
async function user() {
  const { data } = await auth.getSession();
  return data?.user?.id;
}
async function snapshot(id: string) {
  const [recipes, ingredients, state, collections] = await Promise.all([
    sql`SELECT r.id,r.title,r.description,r.image_url AS "imageUrl",r.source_url AS "sourceUrl",r.source_name AS "sourceName",r.servings::float8,r.minutes,r.collection,COALESCE((SELECT jsonb_agg(c.name ORDER BY lower(c.name)) FROM recipe_collections rc JOIN collections c ON c.id=rc.collection_id AND c.user_id=r.user_id WHERE rc.recipe_id=r.id AND rc.user_id=r.user_id),'[]') AS collections,r.instructions,r.notes,r.favorite,r.archived,r.collection_id AS "collectionId",COALESCE((SELECT jsonb_agg(jsonb_build_object('ingredientId',i.id,'name',i.name,'quantity',ri.quantity::float8,'unit',ri.unit,'preparation',ri.preparation,'originalText',ri.original_text) ORDER BY ri.position) FROM recipe_ingredients ri JOIN ingredients i ON i.id=ri.ingredient_id WHERE ri.recipe_id=r.id),'[]') AS ingredients FROM recipes r WHERE r.user_id=${id} ORDER BY r.updated_at DESC`,
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
export async function GET() {
  try {
    const id = await user();
    if (!id)
      return NextResponse.json(
        { error: "Sign in to open your recipe collection." },
        { status: 401 },
      );
    return NextResponse.json(await snapshot(id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    console.error(
      "Kitchen read failed",
      e instanceof Error ? e.message : "Unknown error",
    );
    return NextResponse.json(
      { error: "Your kitchen could not be loaded. Please try again." },
      { status: 500 },
    );
  }
}
export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin)
      return NextResponse.json(
        { error: "This request came from a different website." },
        { status: 403 },
      );
    const id = await user();
    if (!id)
      return NextResponse.json(
        { error: "Sign in to save changes." },
        { status: 401 },
      );
    if (Number(request.headers.get("content-length") || 0) > 200000)
      return NextResponse.json(
        { error: "This recipe is too large." },
        { status: 413 },
      );
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > 200000)
      return NextResponse.json(
        { error: "This recipe is too large." },
        { status: 413 },
      );
    const body = JSON.parse(text);
    if (body.action === "import") {
      const url = z.string().url().max(2000).parse(body.url);
      return NextResponse.json({ draft: await importRecipe(url) });
    }
    if (
      ["createCollection", "renameCollection", "deleteCollection"].includes(
        body.action,
      )
    ) {
      const error = await collectionAction(id, body);
      return error || NextResponse.json(await snapshot(id));
    }
    if (body.action === "archiveRecipe") {
      const recipeId = z.string().uuid().parse(body.id);
      const archived = z.boolean().parse(body.archived);
      const [result] = await sql.transaction([
        sql`UPDATE recipes SET archived=${archived},updated_at=now() WHERE id=${recipeId} AND user_id=${id} RETURNING id`,
        sql`UPDATE kitchen_state SET meals=meals-${recipeId}::text,checked='[]'::jsonb,updated_at=now() WHERE user_id=${id} AND ${archived}=true AND EXISTS(SELECT 1 FROM recipes WHERE id=${recipeId} AND user_id=${id} AND archived=true)`,
      ]);
      if (!result.length)
        return NextResponse.json(
          { error: "Recipe not found." },
          { status: 404 },
        );
      return NextResponse.json(await snapshot(id));
    }
    if (body.action === "ingredient") {
      const data = z
        .object({
          name: z.string().trim().min(1).max(120),
          category: z.enum([
            "Produce",
            "Pantry",
            "Dairy & eggs",
            "Meat & fish",
            "Frozen",
            "Other",
          ]),
          allowNew: z.boolean().optional(),
        })
        .parse(body);
      const normalized = normalizeName(data.name);
      if (!normalized) throw new Error("Give this ingredient a name.");
      const exact =
        await sql`SELECT id,name,category FROM ingredients WHERE normalized_name=${normalized}`;
      if (exact[0])
        return NextResponse.json({ ingredient: exact[0], existing: true });
      const similar =
        await sql`SELECT id,name,category FROM ingredients WHERE similarity(normalized_name,${normalized}) > 0.35 ORDER BY similarity(normalized_name,${normalized}) DESC LIMIT 5`;
      if (similar.length && !data.allowNew)
        return NextResponse.json(
          {
            error: "There are similar ingredients already in the library.",
            matches: similar,
          },
          { status: 409 },
        );
      const added =
        await sql`INSERT INTO ingredients(name,normalized_name,category,created_by) VALUES(${capitalizeIngredient(data.name)},${normalized},${data.category},${id}) ON CONFLICT(normalized_name) DO UPDATE SET normalized_name=EXCLUDED.normalized_name RETURNING id,name,category`;
      return NextResponse.json({ ingredient: added[0] });
    }
    if (body.action === "saveRecipe") {
      const recipe = recipeSchema.parse(body.recipe);
      const memberships = [...new Map((recipe.collections ?? [recipe.collection])
        .filter((name) => name !== "Unfiled").map((name) => [name.toLowerCase(),name])).values()];
      recipe.collection = memberships[0] || "Unfiled";
      const owned =
        await sql`SELECT user_id FROM recipes WHERE id=${recipe.id}`;
      if (owned[0] && owned[0].user_id !== id)
        return NextResponse.json(
          { error: "Recipe not found." },
          { status: 404 },
        );
      const resolved = [];
      for (let index = 0; index < recipe.ingredients.length; index++) {
        const line = recipe.ingredients[index];
        let matches = line.ingredientId
          ? await sql`SELECT id FROM ingredients WHERE id=${line.ingredientId}`
          : await sql`SELECT id FROM ingredients WHERE normalized_name=${normalizeName(line.name)}`;
        if (!matches[0])
          return NextResponse.json(
            {
              error: `Add “${line.name}” to the ingredient library, or choose an existing ingredient before saving.`,
              lineIndex: index,
            },
            { status: 422 },
          );
        resolved.push({ ...line, ingredientId: matches[0].id });
      }
      await sql.transaction([
        sql`INSERT INTO collections(user_id,name) SELECT ${id},name FROM jsonb_array_elements_text(${JSON.stringify(memberships)}::jsonb) AS names(name) ON CONFLICT DO NOTHING`,
        sql`INSERT INTO recipes(id,user_id,title,description,image_url,source_url,source_name,servings,minutes,collection,collection_id,instructions,notes,favorite) VALUES(${recipe.id},${id},${recipe.title},${recipe.description},${recipe.imageUrl},${recipe.sourceUrl},${recipe.sourceName},${recipe.servings},${recipe.minutes},COALESCE((SELECT name FROM collections WHERE user_id=${id} AND lower(name)=lower(${recipe.collection})),${recipe.collection}),(SELECT id FROM collections WHERE user_id=${id} AND lower(name)=lower(${recipe.collection})),${JSON.stringify(recipe.instructions)}::jsonb,${recipe.notes},${recipe.favorite}) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,image_url=EXCLUDED.image_url,source_url=EXCLUDED.source_url,source_name=EXCLUDED.source_name,servings=EXCLUDED.servings,minutes=EXCLUDED.minutes,collection=EXCLUDED.collection,collection_id=EXCLUDED.collection_id,instructions=EXCLUDED.instructions,notes=EXCLUDED.notes,favorite=EXCLUDED.favorite,updated_at=now() WHERE recipes.user_id=${id}`,
        sql`DELETE FROM recipe_collections WHERE recipe_id=${recipe.id} AND user_id=${id}`,
        sql`INSERT INTO recipe_collections(recipe_id,collection_id,user_id) SELECT ${recipe.id},c.id,${id} FROM collections c WHERE c.user_id=${id} AND lower(c.name) IN (SELECT lower(name) FROM jsonb_array_elements_text(${JSON.stringify(memberships)}::jsonb) AS names(name)) AND EXISTS(SELECT 1 FROM recipes WHERE id=${recipe.id} AND user_id=${id})`,
        sql`DELETE FROM recipe_ingredients WHERE recipe_id=${recipe.id} AND EXISTS(SELECT 1 FROM recipes WHERE id=${recipe.id} AND user_id=${id})`,
        sql`INSERT INTO recipe_ingredients(recipe_id,ingredient_id,quantity,unit,preparation,original_text,position) SELECT ${recipe.id},(line->>'ingredientId')::uuid,(line->>'quantity')::numeric,line->>'unit',line->>'preparation',COALESCE(line->>'originalText',''),(ordinality-1)::int FROM jsonb_array_elements(${JSON.stringify(resolved)}::jsonb) WITH ORDINALITY AS t(line,ordinality) WHERE EXISTS(SELECT 1 FROM recipes WHERE id=${recipe.id} AND user_id=${id})`,
      ]);
      return NextResponse.json(await snapshot(id));
    }
    if (body.action === "deleteRecipe") {
      const recipeId = z.string().uuid().parse(body.id);
      await sql.transaction([
        sql`DELETE FROM recipes WHERE id=${recipeId} AND user_id=${id}`,
        sql`UPDATE kitchen_state SET meals=meals-${recipeId}::text,checked='[]'::jsonb,updated_at=now() WHERE user_id=${id}`,
      ]);
      return NextResponse.json(await snapshot(id));
    }
    if (body.action === "favorite") {
      const recipeId = z.string().uuid().parse(body.id);
      const favorite = z.boolean().parse(body.favorite);
      await sql`UPDATE recipes SET favorite=${favorite} WHERE id=${recipeId} AND user_id=${id}`;
      return NextResponse.json(await snapshot(id));
    }
    if (body.action === "state") {
      const state = z
        .object({
          meals: z
            .record(z.string().uuid(), z.number().positive().max(1000))
            .refine((v) => Object.keys(v).length <= 100),
          checked: z.array(z.string().max(200)).max(1000),
          mealOrder: z.array(z.string().uuid()).max(100).optional(),
        })
        .parse(body);
      const owned =
        await sql`SELECT id FROM recipes WHERE user_id=${id} AND archived=false`;
      const ids = new Set(owned.map((r) => r.id));
      if (Object.keys(state.meals).some((key) => !ids.has(key)))
        return NextResponse.json(
          { error: "Choose recipes from your own collection." },
          { status: 400 },
        );
      await sql`INSERT INTO kitchen_state(user_id,meals,checked,meal_order) VALUES(${id},${JSON.stringify(state.meals)}::jsonb,${JSON.stringify(state.checked)}::jsonb,${JSON.stringify(mealOrder(state.meals,state.mealOrder))}::jsonb) ON CONFLICT(user_id) DO UPDATE SET meals=EXCLUDED.meals,checked=EXCLUDED.checked,meal_order=EXCLUDED.meal_order,updated_at=now()`;
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(
      { error: "Unknown kitchen action." },
      { status: 400 },
    );
  } catch (e) {
    if (e instanceof z.ZodError)
      return NextResponse.json(
        { error: e.issues[0]?.message || "Please check the recipe details." },
        { status: 400 },
      );
    console.error(
      "Kitchen action failed",
      e instanceof Error ? e.message : "Unknown error",
    );
    return NextResponse.json(
      {
        error:
          e instanceof Error &&
          /recipe|import|website|public|address|page|redirect/i.test(e.message)
            ? e.message
            : "Your change could not be saved. Please try again.",
      },
      { status: 400 },
    );
  }
}
