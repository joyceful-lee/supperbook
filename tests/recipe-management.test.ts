import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchesRecipeFilter,
  mergeImportedRecipe,
  photoSource,
  recipeCollections,
  collectionSortKey,
  reorderMeals,
} from "../lib/recipe-management.ts";
import { shoppingList, type Recipe } from "../lib/domain.ts";
const recipe: Recipe = {
  id: "recipe-a",
  title: "Saved title",
  description: "",
  imageUrl: "",
  sourceUrl: "",
  sourceName: "",
  servings: 2,
  minutes: 30,
  collection: "Sunday suppers",
  instructions: [],
  notes: "Use less salt",
  favorite: true,
  archived: true,
  ingredients: [
    {
      name: "Rice",
      ingredientId: "rice",
      quantity: 100,
      unit: "g",
      preparation: "",
    },
  ],
};
test("reimport updates editable values without changing saved identity or personal organization", () => {
  const merged = mergeImportedRecipe(recipe, {
    id: "other",
    title: "Imported title",
    collection: "Everyday",
    notes: "publisher note",
    favorite: false,
    archived: false,
    servings: 4,
    instructions: ["Cook gently."],
  });
  assert.equal(merged.id, recipe.id);
  assert.equal(merged.title, "Imported title");
  assert.equal(merged.servings, 4);
  assert.equal(merged.collection, recipe.collection);
  assert.equal(merged.notes, recipe.notes);
  assert.equal(merged.favorite, true);
  assert.equal(merged.archived, true);
});
test("archived recipes only appear in the archive and do not contribute to shopping lists", () => {
  for (const filter of ["All recipes", "Favorites", "Sunday suppers"])
    assert.equal(matchesRecipeFilter(recipe, filter), false);
  assert.equal(matchesRecipeFilter(recipe, "Archived"), true);
  assert.equal(
    matchesRecipeFilter({ ...recipe, archived: false }, "Sunday suppers"),
    true,
  );
  assert.deepEqual(shoppingList([recipe], { "recipe-a": 4 }, []), []);
});
test("photo credits expose online sources without claiming third-party AI provenance", () => {
  assert.deepEqual(photoSource("https://images.unsplash.com/photo-123"), {
    href: "https://images.unsplash.com/photo-123",
    publisher: "Unsplash",
  });
  assert.equal(
    photoSource("https://www.example.com/image.jpg")?.publisher,
    "example.com",
  );
  assert.equal(photoSource("javascript:alert(1)"), null);
  assert.equal(photoSource(""), null);
});

test("one recipe appears in all assigned collections without changing its identity", () => {
  const shared = { ...recipe, archived: false, collections: ["Sunday suppers", "Quick dinners"] };
  assert.equal(matchesRecipeFilter(shared,"Sunday suppers"),true);
  assert.equal(matchesRecipeFilter(shared,"Quick dinners"),true);
  assert.equal(matchesRecipeFilter(shared,"Unfiled"),false);
  assert.equal(collectionSortKey(shared),"Quick dinners");
  assert.deepEqual(recipeCollections({ ...shared, collections: [] }),[]);
  assert.equal(matchesRecipeFilter({ ...shared, collections: [] },"Unfiled"),true);
  assert.equal(mergeImportedRecipe(shared,{ collections:["Imported"] }).collections,shared.collections);
});
test("live drag reorder moves only the dragged meal and preserves the other meals' order", () => {
  const original = ["pasta","soup","salad","curry"];
  const moved = reorderMeals(original,"pasta","salad");
  assert.deepEqual(moved,["soup","salad","pasta","curry"]);
  assert.deepEqual(reorderMeals(moved,"pasta","soup"),original);
  assert.deepEqual(original,["pasta","soup","salad","curry"]);
  assert.equal(reorderMeals(original,"missing","soup"),original);
});
