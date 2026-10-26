import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch } from "undici";
import { load } from "cheerio";
import { parseIngredient } from "./domain";
import { isPublicAddress } from "./network";
function safeImage(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}
function duration(value: unknown) {
  const m = String(value || "").match(
    /P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/,
  );
  return m
    ? Number(m[1] || 0) * 1440 + Number(m[2] || 0) * 60 + Number(m[3] || 0)
    : 0;
}
export async function importRecipe(input: string) {
  let url = new URL(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    for (let redirect = 0; redirect < 5; redirect++) {
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        (url.port && !["80", "443"].includes(url.port))
      )
        throw new Error(
          "Use a public recipe page with a standard web address.",
        );
      const host = url.hostname.replace(/^\[|\]$/g, "");
      const addresses = isIP(host)
        ? [{ address: host, family: isIP(host) }]
        : await lookup(host, { all: true });
      if (
        !addresses.length ||
        addresses.some((a) => !isPublicAddress(a.address))
      )
        throw new Error("Only public recipe websites can be imported.");
      const address = addresses[0];
      const agent = new Agent({
        connect: {
          autoSelectFamily: false,
          lookup: (_host, _options, callback) => {
            callback(null, address.address, address.family);
          },
        },
      });
      try {
        const response = await fetch(url, {
          dispatcher: agent,
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "User-Agent": "Supperbook/1.0 Recipe Importer",
            Accept: "text/html",
          },
        });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          await response.body?.cancel();
          if (!location)
            throw new Error("The website returned an incomplete redirect.");
          url = new URL(location, url);
          continue;
        }
        if (!response.ok)
          throw new Error(
            `The recipe website returned ${response.status}. You can still enter the recipe by hand.`,
          );
        if (!response.headers.get("content-type")?.includes("text/html"))
          throw new Error("That address is not a recipe webpage.");
        let size = 0;
        const chunks: Uint8Array[] = [];
        for await (const chunk of response.body!) {
          size += chunk.length;
          if (size > 2_000_000)
            throw new Error("This page is too large to import.");
          chunks.push(chunk);
        }
        const $ = load(Buffer.concat(chunks).toString("utf8"));
        const candidates: Record<string, unknown>[] = [];
        const walk = (value: unknown) => {
          if (Array.isArray(value)) {
            value.forEach(walk);
            return;
          }
          if (value && typeof value === "object") {
            const o = value as Record<string, unknown>;
            if ([o["@type"]].flat().some((t) => t === "Recipe"))
              candidates.push(o);
            if (o["@graph"]) walk(o["@graph"]);
            if (o.mainEntity) walk(o.mainEntity);
          }
        };
        $('script[type="application/ld+json"]').each((_, el) => {
          try {
            walk(JSON.parse($(el).text()));
          } catch {}
        });
        const recipe = candidates[0];
        if (!recipe)
          throw new Error(
            "This page does not include recipe data we can read. Add it by hand and keep the source link.",
          );
        const text = (v: unknown) =>
          typeof v === "string" ? load(v).text().trim() : "";
        const steps: string[] = [];
        const instructions = (v: unknown) => {
          if (Array.isArray(v)) v.forEach(instructions);
          else if (typeof v === "string") steps.push(text(v));
          else if (v && typeof v === "object") {
            const o = v as Record<string, unknown>;
            if (o.itemListElement) instructions(o.itemListElement);
            else if (o.text) steps.push(text(o.text));
          }
        };
        instructions(recipe.recipeInstructions);
        const imageOptions: string[] = [];
        const addImage = (value: unknown) => {
          if (Array.isArray(value)) { value.forEach(addImage); return; }
          if (value && typeof value === "object") {
            const image = value as Record<string, unknown>;
            addImage(image.url || image.contentUrl); return;
          }
          if (typeof value !== "string") return;
          let image = "";
          try { image = safeImage(new URL(value, url).href); } catch {}
          if (image && !imageOptions.includes(image)) imageOptions.push(image);
        };
        addImage(recipe.image);
        $('meta[property="og:image"],meta[name="twitter:image"]').each((_, el) => addImage($(el).attr("content")));
        $('article img,main img').each((_, el) => {
          const img = $(el);
          const width = Number(img.attr("width") || 0);
          const height = Number(img.attr("height") || 0);
          if (width >= 500 && height >= 250) addImage(img.attr("data-src") || img.attr("src"));
        });
        const yieldText = String(recipe.recipeYield || "2");
        const servings = Number(yieldText.match(/\d+(?:\.\d+)?/)?.[0] || 2);
        return {
          title: text(recipe.name) || "Imported recipe",
          description: text(recipe.description),
          imageUrl: imageOptions[0] || "",
          imageOptions: imageOptions.slice(0, 3),
          sourceUrl: url.href,
          sourceName: url.hostname.replace(/^www\./, ""),
          servings: Math.min(1000, Math.max(1, servings)),
          minutes: Math.min(
            10080,
            duration(recipe.totalTime) ||
              duration(recipe.prepTime) + duration(recipe.cookTime) ||
              30,
          ),
          collection: "Everyday",
          instructions: steps,
          notes: "",
          favorite: false,
          ingredients: (Array.isArray(recipe.recipeIngredient)
            ? recipe.recipeIngredient
            : []
          )
            .slice(0, 100)
            .map((v) => parseIngredient(text(v))),
        };
      } finally {
        await agent.close();
      }
    }
    throw new Error("The recipe website redirected too many times.");
  } finally {
    clearTimeout(timeout);
  }
}
