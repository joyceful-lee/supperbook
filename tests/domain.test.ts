import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeName,
  capitalizeIngredient,
  mealOrder,
  isWebUrl,
  parseIngredient,
  shoppingList,
  type Recipe,
} from "../lib/domain.ts";
import { isPublicAddress } from "../lib/network.ts";
test("ingredient matching normalizes punctuation, accents and familiar plurals", () => {
  assert.equal(normalizeName("  CHERRY tomatoes "), "cherry tomato");
  assert.equal(normalizeName("Potatoes"), "potato");
  assert.equal(normalizeName("Crème fraîche"), "creme fraiche");
});
test("imports whole, fractional, mixed and unspecified quantities", () => {
  assert.equal(parseIngredient("1/2 cup rice").quantity, 0.5);
  assert.equal(parseIngredient("1 1/2 cups rice").quantity, 1.5);
  assert.equal(parseIngredient("1½ cups rice").quantity, 1.5);
  assert.deepEqual(parseIngredient("2 cloves garlic, minced"), {
    name: "garlic",
    quantity: 2,
    unit: "clove",
    preparation: "minced",
    originalText: "2 cloves garlic, minced",
  });
  assert.equal(parseIngredient("Salt, to taste").quantity, null);
});
test("shopping list scales servings, merges compatible units and keeps incompatible measures separate", () => {
  const recipe = (
    id: string,
    quantity: number | null,
    unit: string,
  ): Recipe => ({
    id,
    title: id,
    servings: 2,
    minutes: 1,
    description: "",
    collection: "",
    sourceUrl: "",
    sourceName: "",
    imageUrl: "",
    favorite: false,
    notes: "",
    instructions: [],
    ingredients: [
      { ingredientId: "rice", name: "Rice", quantity, unit, preparation: "" },
    ],
  });
  const rows = shoppingList(
    [
      recipe("a", 100, "g"),
      recipe("b", 0.5, "kg"),
      recipe("c", 1, "cup"),
      recipe("d", null, ""),
    ],
    { a: 4, b: 2, c: 2, d: 2 },
    [{ id: "rice", name: "Rice", category: "Pantry" }],
  );
  assert.equal(rows.length, 3);
  assert.equal(rows.find((r) => r.unit === "g")?.quantity, 700);
  assert.equal(rows.find((r) => r.unit === "cup")?.quantity, 1);
  assert.equal(rows.find((r) => r.quantity === null)?.name, "Rice");
});
test("import network guard rejects local, private, link-local and mapped private addresses", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "192.168.1.1",
    "172.16.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
  ])
    assert.equal(isPublicAddress(address), false, address);
  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])
    assert.equal(isPublicAddress(address), true, address);
});

test("recipe links reject malformed and executable URLs", () => {
 assert.equal(isWebUrl("https://example.com/recipe"), true);
 assert.equal(isWebUrl(""), true);
 for (const url of ["http://", "javascript:alert(1)", "https://user:pass@example.com"]) assert.equal(isWebUrl(url), false);
});

test("ingredient capitalization preserves the rest of a name", () => {
  assert.equal(capitalizeIngredient("  olive oil "), "Olive oil");
  assert.equal(capitalizeIngredient("crème fraîche"), "Crème fraîche");
  assert.equal(capitalizeIngredient("extra Virgin oil"), "Extra Virgin oil");
});
test("meal order retains chosen order and filters removed meals", () => {
  assert.deepEqual(mealOrder({ a: 2, b: 4, c: 1 }, ["b", "missing", "b", "a"]), ["b", "a", "c"]);
});
test("shopping combines spoon measures without turning them into milliliters", () => {
  const base: Recipe = { id: "oil", title: "Oil", servings: 1, minutes: 1, description: "", collection: "", sourceUrl: "", sourceName: "", imageUrl: "", favorite: false, notes: "", instructions: [], ingredients: [] };
  const rows = shoppingList([{ ...base, ingredients: [
    { name: "Oil", quantity: 1, unit: "tbsp", preparation: "" },
    { name: "Oil", quantity: 3, unit: "tsp", preparation: "" },
    { name: "Eggs", quantity: 2, unit: "", preparation: "" },
  ] }], { oil: 1 }, []);
  assert.equal(rows.find((r) => r.name === "Oil")?.unit, "tbsp");
  assert.ok(Math.abs(rows.find((r) => r.name === "Oil")!.quantity! - 2) < .001);
  assert.equal(rows.find((r) => r.name === "Eggs")?.unit, "");
});
