import type { Recipe } from "./domain";
export type Collection = { id: string; name: string };
export function recipeCollections(recipe: Pick<Recipe, "collection" | "collections">) {
  return recipe.collections ?? (recipe.collection && recipe.collection !== "Unfiled" ? [recipe.collection] : []);
}
export function collectionLabel(recipe: Pick<Recipe, "collection" | "collections">) {
  return recipeCollections(recipe).join(" · ") || "Unfiled";
}
export function collectionSortKey(recipe: Recipe) {
  return [...recipeCollections(recipe)].sort((a,b) => a.localeCompare(b))[0] || "Unfiled";
}
export function reorderMeals(order: string[], id: string, target: string) {
  const from = order.indexOf(id), to = order.indexOf(target);
  if (from < 0 || to < 0 || from === to) return order;
  const next = [...order]; next.splice(from, 1); next.splice(to, 0, id);
  return next;
}
export function mergeImportedRecipe(
  current: Recipe,
  imported: Partial<Recipe>,
): Recipe {
  return {
    ...current,
    ...imported,
    id: current.id,
    collection: current.collection,
    collections: current.collections,
    notes: current.notes,
    favorite: current.favorite,
    archived: current.archived,
  };
}
export function matchesRecipeFilter(recipe: Recipe, filter: string) {
  if (filter === "Archived") return !!recipe.archived;
  if (recipe.archived) return false;
  return (
    filter === "All recipes" ||
    (filter === "Favorites" && recipe.favorite) ||
    (filter === "Unfiled" ? recipeCollections(recipe).length === 0 : recipeCollections(recipe).includes(filter))
  );
}
export function photoSource(imageUrl: string) {
  if (!imageUrl) return null;
  try {
    const url = new URL(imageUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return {
      href: url.href,
      publisher:
        url.hostname === "images.unsplash.com"
          ? "Unsplash"
          : url.hostname.replace(/^www\./, ""),
    };
  } catch {
    return null;
  }
}
