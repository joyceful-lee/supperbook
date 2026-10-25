import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeName,
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
  assert.equal(rows.find((r) => r.unit === "ml")?.quantity, 236.588);
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
