import { test } from "node:test";
import assert from "node:assert/strict";
import { shoppingText, planText } from "../lib/list-export.ts";
test("shared shopping text retains quantities, categories, checks and preparation", () => {
  const text = shoppingText([{ key: "oil", name: "Olive oil", category: "Pantry", quantity: 2, unit: "tbsp", recipes: ["Soup"], preparations: ["divided"] }], ["oil"]);
  assert.match(text, /Pantry\n\[x\] Olive oil — 2 tbsp \(divided\)/);
});
test("shared meal plan follows displayed order and includes servings", () => {
  const text = planText([{ id: "b", title: "Soup", sourceUrl: "https://example.com/soup" }, { id: "a", title: "Pasta", sourceUrl: "" }] as Parameters<typeof planText>[0], { a: 2, b: 4 });
  assert.ok(text.indexOf("1. Soup — 4 servings") < text.indexOf("2. Pasta — 2 servings"));
  assert.match(text, /https:\/\/example.com\/soup/);
});
