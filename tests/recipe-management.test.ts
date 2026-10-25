import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchesRecipeFilter,
  mergeImportedRecipe,
  photoSource,
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
