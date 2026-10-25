export type Ingredient = {
  id: string;
  name: string;
  category: string;
  normalized_name?: string;
};
export type Line = {
  ingredientId?: string;
  name: string;
  quantity: number | null;
  unit: string;
  preparation: string;
  originalText?: string;
  allowNew?: boolean;
};
export type Recipe = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  sourceUrl: string;
  sourceName: string;
  servings: number;
  minutes: number;
  collection: string;
  instructions: string[];
  notes: string;
  favorite: boolean;
  ingredients: Line[];
};
export type Meals = Record<string, number>;
export function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(
      (w) =>
        ({ tomatoes: "tomato", potatoes: "potato", leaves: "leaf" })[w] ||
        (w.endsWith("s") && !w.endsWith("ss") && w.length > 3
          ? w.slice(0, -1)
          : w),
    )
    .join(" ");
}
const units: Record<
  string,
  { dimension: string; factor: number; unit: string }
> = {
  g: { dimension: "mass", factor: 1, unit: "g" },
  kg: { dimension: "mass", factor: 1000, unit: "g" },
  oz: { dimension: "mass", factor: 28.3495, unit: "g" },
  lb: { dimension: "mass", factor: 453.592, unit: "g" },
  ml: { dimension: "volume", factor: 1, unit: "ml" },
  l: { dimension: "volume", factor: 1000, unit: "ml" },
  tsp: { dimension: "volume", factor: 4.92892, unit: "ml" },
  tbsp: { dimension: "volume", factor: 14.7868, unit: "ml" },
  cup: { dimension: "volume", factor: 236.588, unit: "ml" },
};
export function canonicalUnit(unit: string) {
  const u = unit.toLowerCase().trim().replace(/\.$/, "");
  return (
    (
      {
        grams: "g",
        gram: "g",
        kilograms: "kg",
        kilogram: "kg",
        ounces: "oz",
        ounce: "oz",
        pounds: "lb",
        pound: "lb",
        lbs: "lb",
        teaspoon: "tsp",
        teaspoons: "tsp",
        tablespoon: "tbsp",
        tablespoons: "tbsp",
        cups: "cup",
        milliliters: "ml",
        liters: "l",
        cloves: "clove",
        pieces: "piece",
      } as Record<string, string>
    )[u] || u
  );
}
export function shoppingList(
  recipes: Recipe[],
  meals: Meals,
  ingredients: Ingredient[],
) {
  const rows = new Map<
    string,
    {
      key: string;
      name: string;
      category: string;
      quantity: number | null;
      unit: string;
      recipes: string[];
      preparations: string[];
    }
  >();
  for (const recipe of recipes) {
    if (!meals[recipe.id]) continue;
    for (const line of recipe.ingredients) {
      const unit = canonicalUnit(line.unit);
      const conversion = units[unit];
      const key = `${line.ingredientId || normalizeName(line.name)}:${line.quantity === null ? "unspecified:" + unit : conversion?.dimension || unit}`;
      const quantity =
        line.quantity === null
          ? null
          : line.quantity *
            (meals[recipe.id] / recipe.servings) *
            (conversion?.factor || 1);
      const existing = rows.get(key);
      if (existing) {
        if (quantity !== null)
          existing.quantity = (existing.quantity || 0) + quantity;
        if (!existing.recipes.includes(recipe.title))
          existing.recipes.push(recipe.title);
        if (
          line.preparation &&
          !existing.preparations.includes(line.preparation)
        )
          existing.preparations.push(line.preparation);
      } else {
        rows.set(key, {
          key,
          name: line.name,
          category:
            ingredients.find((i) => i.id === line.ingredientId)?.category ||
            "Other",
          quantity,
          unit: conversion?.unit || unit,
          recipes: [recipe.title],
          preparations: line.preparation ? [line.preparation] : [],
        });
      }
    }
  }
  return [...rows.values()].sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );
}
export function amount(q: number | null, unit: string) {
  if (q === null) return unit || "As needed";
  return `${Number(q.toFixed(2))}${unit ? " " + unit : ""}`;
}
export function parseIngredient(text: string): Line {
  const fractions: Record<string, string> = {
    "½": " 1/2",
    "¼": " 1/4",
    "¾": " 3/4",
    "⅓": " 1/3",
    "⅔": " 2/3",
    "⅛": " 1/8",
  };
  const clean = text.replace(/[½¼¾⅓⅔⅛]/g, (c) => fractions[c]).trim();
  const match = clean.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(.*)$/);
  let quantity: number | null = null,
    rest = clean;
  if (match) {
    quantity = match[1]
      .split(/\s+/)
      .reduce(
        (sum, v) =>
          sum +
          (v.includes("/")
            ? Number(v.split("/")[0]) / Number(v.split("/")[1])
            : Number(v)),
        0,
      );
    rest = match[2];
  }
  const unitMatch = rest.match(
    /^(cups?|tbsps?|tsps?|tablespoons?|teaspoons?|grams?|kilograms?|kg|g|ml|l|ounces?|oz|pounds?|lbs?|cloves?|pieces?|cans?|bunch(?:es)?)\b\s*/i,
  );
  const unit = unitMatch ? canonicalUnit(unitMatch[1]) : "";
  if (unitMatch) rest = rest.slice(unitMatch[0].length);
  const [name, ...prep] = rest.split(",");
  return {
    name: name.trim() || text,
    quantity,
    unit,
    preparation: prep.join(",").trim(),
    originalText: text,
  };
}

export function isWebUrl(value: string) {
  if (!value) return true;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
