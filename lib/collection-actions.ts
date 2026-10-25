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
      sql`UPDATE recipes SET collection='Unfiled',collection_id=NULL,updated_at=now() WHERE user_id=${userId} AND (collection_id=${id} OR (collection_id IS NULL AND collection=${owned[0].name}))`,
      sql`DELETE FROM collections WHERE id=${id} AND user_id=${userId}`,
    ]);
    return null;
  }
  return NextResponse.json(
    { error: "Unknown collection action." },
    { status: 400 },
  );
}
