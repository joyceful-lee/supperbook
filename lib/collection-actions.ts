import "server-only";
import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";
import { z } from "zod";
const sql = neon(process.env.DATABASE_URL!);
const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .transform((name) => name.replace(/\s+/g, " "))
  .refine(
    (name) =>
      !["unfiled", "all recipes", "favorites", "archived"].includes(
        name.toLowerCase(),
      ),
    "Please choose a different collection name.",
  );

export async function collectionAction(
  userId: string,
  body: Record<string, unknown>,
) {
  if (body.action === "setRecipeCollections") {
    const recipeId = z.string().uuid().parse(body.id);
    const requested = z.array(nameSchema).max(30).parse(body.collections);
    const names = [...new Map(requested.map((name) => [name.toLowerCase(), name])).values()];
    const owned = await sql`SELECT id FROM recipes WHERE id=${recipeId} AND user_id=${userId}`;
    if (!owned.length) return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
    await sql.transaction([
      sql`INSERT INTO collections(user_id,name) SELECT ${userId},name FROM jsonb_array_elements_text(${JSON.stringify(names)}::jsonb) AS requested(name) ON CONFLICT DO NOTHING`,
      sql`DELETE FROM recipe_collections WHERE recipe_id=${recipeId} AND user_id=${userId}`,
      sql`INSERT INTO recipe_collections(recipe_id,collection_id,user_id) SELECT ${recipeId},c.id,${userId} FROM collections c WHERE c.user_id=${userId} AND lower(c.name) IN (SELECT lower(name) FROM jsonb_array_elements_text(${JSON.stringify(names)}::jsonb) AS requested(name)) AND EXISTS(SELECT 1 FROM recipes WHERE id=${recipeId} AND user_id=${userId})`,
      sql`UPDATE recipes SET collection=COALESCE((SELECT name FROM collections WHERE user_id=${userId} AND lower(name)=lower(${names[0] || "Unfiled"})),'Unfiled'),collection_id=(SELECT id FROM collections WHERE user_id=${userId} AND lower(name)=lower(${names[0] || "Unfiled"})),updated_at=now() WHERE id=${recipeId} AND user_id=${userId}`,
    ]);
    return null;
  }
  if (body.action === "createCollection") {
    const name = nameSchema.parse(body.name);
    const added =
      await sql`INSERT INTO collections(user_id,name) VALUES(${userId},${name}) ON CONFLICT DO NOTHING RETURNING id`;
    if (!added.length)
      return NextResponse.json(
        { error: "A collection with that name already exists." },
        { status: 409 },
      );
    return null;
  }
  const id = z.string().uuid().parse(body.id);
  const owned =
    await sql`SELECT id,name FROM collections WHERE id=${id} AND user_id=${userId}`;
  if (!owned.length)
    return NextResponse.json(
      { error: "Collection not found." },
      { status: 404 },
    );
  if (body.action === "renameCollection") {
    const name = nameSchema.parse(body.name);
    const duplicate =
      await sql`SELECT id FROM collections WHERE user_id=${userId} AND lower(name)=lower(${name}) AND id<>${id}`;
    if (duplicate.length)
      return NextResponse.json(
        { error: "A collection with that name already exists." },
        { status: 409 },
      );
    await sql.transaction([
      sql`UPDATE collections SET name=${name} WHERE id=${id} AND user_id=${userId}`,
      sql`UPDATE recipes SET collection=${name},collection_id=${id},updated_at=now() WHERE user_id=${userId} AND (collection_id=${id} OR (collection_id IS NULL AND collection=${owned[0].name}))`,
    ]);
    return null;
  }
  if (body.action === "deleteCollection") {
    await sql.transaction([
      sql`DELETE FROM collections WHERE id=${id} AND user_id=${userId}`,
      sql`UPDATE recipes r SET collection=COALESCE((SELECT c.name FROM recipe_collections rc JOIN collections c ON c.id=rc.collection_id AND c.user_id=r.user_id WHERE rc.recipe_id=r.id AND rc.user_id=r.user_id ORDER BY lower(c.name) LIMIT 1),'Unfiled'),collection_id=(SELECT c.id FROM recipe_collections rc JOIN collections c ON c.id=rc.collection_id AND c.user_id=r.user_id WHERE rc.recipe_id=r.id AND rc.user_id=r.user_id ORDER BY lower(c.name) LIMIT 1),updated_at=now() WHERE r.user_id=${userId} AND r.collection_id IS NULL`,
    ]);
    return null;
  }
  return NextResponse.json(
    { error: "Unknown collection action." },
    { status: 400 },
  );
}
