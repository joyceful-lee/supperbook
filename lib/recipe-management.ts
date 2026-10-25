import type { Recipe } from "./domain";
export type Collection = { id: string; name: string };
export function mergeImportedRecipe(
  current: Recipe,
  imported: Partial<Recipe>,
): Recipe {
  return {
    ...current,
    ...imported,
    id: current.id,
    collection: current.collection,
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
    recipe.collection === filter
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
