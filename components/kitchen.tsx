"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Clock3,
  Heart,
  Leaf,
  Link2,
  ListChecks,
  LoaderCircle,
  LogOut,
  Menu,
  Plus,
  Search,
  ShoppingBasket,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useRecipeExit } from "@/components/use-recipe-exit";
import { authClient } from "@/lib/auth-client";
import { examples } from "@/lib/examples";
import {
  matchesRecipeFilter,
  recipeCollections,
  collectionLabel,
  collectionSortKey,
  reorderMeals,
  mergeImportedRecipe,
  photoSource,
  type Collection,
} from "@/lib/recipe-management";
import {
  amount,
  mealOrder,
  normalizeName,
  shoppingList,
  type Ingredient,
  type Line,
  type Meals,
  type Recipe,
} from "@/lib/domain";
import { exportShoppingList, shoppingText, planText } from "@/lib/list-export";
const SortableMeals = dynamic(() => import("@/components/sortable-meals"));
type Snapshot = {
  collections: Collection[];
  recipes: Recipe[];
  ingredients: Ingredient[];
  meals: Meals;
  mealOrder: string[];
  checked: string[];
};
type Modal =
  | "import"
  | "auth"
  | "ingredient"
  | "collections"
  | "confirmDelete"
  | null;
const categories = [
  "Produce",
  "Pantry",
  "Dairy & eggs",
  "Meat & fish",
  "Frozen",
  "Other",
];
const emptyRecipe = (): Recipe => ({
  id: crypto.randomUUID(),
  title: "",
  description: "",
  imageUrl: "",
  sourceUrl: "",
  sourceName: "",
  servings: 2,
  minutes: 30,
  collection: "Everyday",
  instructions: [""],
  notes: "",
  favorite: false,
  ingredients: [{ name: "", quantity: null, unit: "", preparation: "" }],
});
function FoodImage({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? (
    <img
      className={className}
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
    />
  ) : (
    <div className={`food-placeholder ${className}`}>
      <Leaf size={48} strokeWidth={1} />
      <span>A recipe worth keeping</span>
    </div>
  );
}
export default function Kitchen() {
  const { data: session, isPending } = authClient.useSession();
  const [data, setData] = useState<Snapshot>({
    collections: [],
    recipes: [],
    ingredients: [],
    meals: {},
    mealOrder: [],
    checked: [],
  });
  const [loading, setLoading] = useState(false),
    [view, setView] = useState("recipes"),
    [filter, setFilter] = useState("All recipes"),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("recent");
  const [modal, setModal] = useState<Modal>(null),
    [detail, setDetail] = useState<Recipe | null>(null),
    [draft, setDraft] = useState<Recipe | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [url, setUrl] = useState(""),
    [authMode, setAuthMode] = useState("signin"),
    [mobile, setMobile] = useState(false);
  const [ingredientName, setIngredientName] = useState(""),
    [ingredientCategory, setIngredientCategory] = useState("Produce"),
    [matches, setMatches] = useState<Ingredient[]>([]),
    [ingredientLine, setIngredientLine] = useState<number | null>(null);
  const [collectionName, setCollectionName] = useState("");
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "recipe" | "collection";
    id: string;
    name: string;
  } | null>(null);
  const [sidebarCollectionsOpen, setSidebarCollectionsOpen] = useState(true);
  const [openIngredientCategories, setOpenIngredientCategories] = useState<string[]>([]);
  const [newRecipeCollection, setNewRecipeCollection] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const stateQueue = useRef(Promise.resolve());
  const { requestExit: requestDraftExit, cancelExit, confirmExit, confirmOpen } = useRecipeExit(!!draft, busy, () => {
    setModal(null);
    setDraft(null);
    setError("");
  });
  async function api(body: unknown) {
    const response = await fetch("/api/kitchen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      throw Object.assign(new Error(result.error), {
        matches: result.matches,
        lineIndex: result.lineIndex,
      });
    return result;
  }
  useEffect(() => {
    if (!session?.user) {
      setData({
        recipes: [],
        collections: [],
        ingredients: [],
        meals: {},
    mealOrder: [],
        checked: [],
      });
      return;
    }
    let active = true;
    setLoading(true);
    fetch("/api/kitchen")
      .then(async (r) => {
        const result = await r.json();
        if (!r.ok) throw new Error(result.error);
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.user?.id]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        if (confirmOpen) cancelExit();
        else if (modal) setModal(null);
        else if (draft) requestDraftExit();
        else setDetail(null);
      }
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [busy, modal, !!draft, requestDraftExit, confirmOpen, cancelExit]);
  const preview = !session?.user || (data.recipes.length === 0 && filter === "All recipes");
  const recipes = preview ? examples : data.recipes;
  const visible = useMemo(() => {
    let list = recipes.filter(
      (r) =>
        matchesRecipeFilter(r, filter) &&
        `${r.title} ${r.description} ${r.ingredients.map((i) => i.name).join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
    if (sort === "quick")
      list = [...list].sort((a, b) => a.minutes - b.minutes);
    if (sort === "az")
      list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "collections")
      list = [...list].sort((a,b) => collectionSortKey(a).localeCompare(collectionSortKey(b)) || a.title.localeCompare(b.title));
    return list;
  }, [recipes, filter, search, sort]);
  const shopping = shoppingList(
    data.recipes.filter((r) => !r.archived),
    data.meals,
    data.ingredients,
  );
  const collections = session?.user
    ? [
        ...data.collections.map((c) => c.name),
        ...(data.recipes.some((r) => recipeCollections(r).length === 0)
          ? ["Unfiled"]
          : []),
      ]
    : [...new Set(examples.map((r) => r.collection))];
  const selected = mealOrder(data.meals, data.mealOrder).map((id) => data.recipes.find((r) => r.id === id && !r.archived)).filter((r): r is Recipe => !!r);
  function requireUser() {
    if (session?.user) return true;
    setAuthMode("signin");
    setModal("auth");
    setError("");
    return false;
  }
  function navigate(next: string) {
    if (draft) { requestDraftExit(); return; }
    setView(next);
    setSearch("");
    setFilter("All recipes");
    setMobile(false);
    setError("");
  }
  function persistState(meals: Meals, checked: string[], order = data.mealOrder) {
    const ordered = mealOrder(meals, order);
    setData((d) => ({ ...d, meals, checked, mealOrder: ordered }));
    stateQueue.current = stateQueue.current
      .catch(() => {})
      .then(() => api({ action: "state", meals, checked, mealOrder: ordered }))
      .then(() => {})
      .catch((e) =>
        setError(
          `${e.message} Your latest shopping changes have not been saved; please try again.`,
        ),
      );
  }
  async function saveExample(recipe: Recipe) {
    const owned = data.recipes.find((r) => r.id === recipe.id);
    if (owned) return owned;
    const mapped = {
      ...recipe,
      id: crypto.randomUUID(),
      ingredients: recipe.ingredients.map((line) => ({
        ...line,
        ingredientId: data.ingredients.find(
          (i) => normalizeName(i.name) === normalizeName(line.name),
        )?.id,
      })),
    };
    const result = await api({ action: "saveRecipe", recipe: mapped });
    setData(result);
    return mapped;
  }
  async function plan(recipe: Recipe) {
    if (!requireUser()) return;
    setBusy(true);
    try {
      const r =
        data.recipes.find((r) => r.id === recipe.id) ||
        (await saveExample(recipe));
      const meals = { ...data.meals, [r.id]: data.meals[r.id] || r.servings };
      const owned = data.recipes.some((x) => x.id === r.id)
        ? data.recipes
        : [r, ...data.recipes];
      const order = mealOrder(meals, data.mealOrder);
      await api({ action: "state", meals, checked: [], mealOrder: order });
      setData((d) => ({ ...d, recipes: owned, meals, checked: [], mealOrder: order }));
      setToast("Added to your meal plan. Your shopping list is ready.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function favorite(recipe: Recipe) {
    if (!requireUser()) return;
    setBusy(true);
    try {
      const saved =
        data.recipes.find((r) => r.id === recipe.id) ||
        (await saveExample(recipe));
      const result = await api({
        action: "favorite",
        id: saved.id,
        favorite: !recipe.favorite,
      });
      setData(result);
      setDetail((d) =>
        d?.id === recipe.id ? { ...d, favorite: !d.favorite } : d,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function openIngredient(name = "", index: number | null = null) {
    if (!requireUser()) return;
    setIngredientName(name);
    setIngredientCategory("Produce");
    setMatches([]);
    setIngredientLine(index);
    setError("");
    setModal("ingredient");
  }
  async function addIngredient(allowNew = false) {
    setBusy(true);
    setError("");
    try {
      const result = await api({
        action: "ingredient",
        name: ingredientName,
        category: ingredientCategory,
        allowNew,
      });
      useIngredient(result.ingredient);
      setToast(
        result.existing
          ? "Using the ingredient already in your library."
          : "Ingredient added to the library.",
      );
    } catch (e) {
      const err = e as Error & { matches?: Ingredient[] };
      if (err.matches) setMatches(err.matches);
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  function useIngredient(ingredient: Ingredient) {
    setData((d) => ({
      ...d,
      ingredients: d.ingredients.some((i) => i.id === ingredient.id)
        ? d.ingredients
        : [...d.ingredients, ingredient].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
    }));
    if (ingredientLine !== null)
      setDraft((d) =>
        d
          ? {
              ...d,
              ingredients: d.ingredients.map((line, i) =>
                i === ingredientLine
                  ? {
                      ...line,
                      name: ingredient.name,
                      ingredientId: ingredient.id,
                    }
                  : line,
              ),
            }
          : d,
      );
    setMatches([]);
    setModal(null);
  }
  async function importUrl(event: FormEvent) {
    event.preventDefault();
    if (!requireUser()) return;
    setBusy(true);
    setError("");
    try {
      const result = await api({ action: "import", url });
      setDraft({
        ...result.draft,
        id: crypto.randomUUID(),
        ingredients: result.draft.ingredients.length
          ? result.draft.ingredients
          : emptyRecipe().ingredients,
      });
      setModal(null);
      setToast("Recipe imported. Review the details before saving.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (!draft || !requireUser()) return;
    setBusy(true);
    setError("");
    try {
      const recipe = {
        ...draft,
        instructions: draft.instructions.filter((s) => s.trim()),
        ingredients: draft.ingredients.map((line) => ({
          ...line,
          ingredientId:
            line.ingredientId ||
            data.ingredients.find(
              (i) => normalizeName(i.name) === normalizeName(line.name),
            )?.id,
        })),
      };
      const result = await api({ action: "saveRecipe", recipe });
      setData(result);
      setDraft(null);
      setDetail(result.recipes.find((r: Recipe) => r.id === recipe.id));
      setToast("Recipe saved to your collection.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function deleteRecipe(recipe: Recipe) {
    setError("");
    setDeleteTarget({ kind: "recipe", id: recipe.id, name: recipe.title });
    setModal("confirmDelete");
  }
  async function performDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    setError("");
    try {
      const result = await api({
        action:
          deleteTarget.kind === "recipe" ? "deleteRecipe" : "deleteCollection",
        id: deleteTarget.id,
      });
      setData(result);
      if (deleteTarget.kind === "recipe") setDetail(null);
      if (deleteTarget.kind === "collection" && filter === deleteTarget.name)
        setFilter("All recipes");
      setModal(deleteTarget.kind === "collection" ? "collections" : null);
      setToast(
        deleteTarget.kind === "recipe"
          ? "Recipe permanently deleted."
          : "Collection deleted. Recipes keep their other collections.",
      );
      setDeleteTarget(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function archiveRecipe(recipe: Recipe) {
    setBusy(true);
    setError("");
    try {
      const result = await api({
        action: "archiveRecipe",
        id: recipe.id,
        archived: !recipe.archived,
      });
      setData(result);
      setDetail((current) =>
        current?.id === recipe.id
          ? result.recipes.find((r: Recipe) => r.id === recipe.id) || null
          : current,
      );
      setToast(
        recipe.archived
          ? "Recipe restored to your collection."
          : "Recipe archived and removed from the meal plan.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveCollection(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api({
        action: editingCollectionId ? "renameCollection" : "createCollection",
        id: editingCollectionId,
        name: collectionName,
      });
      if (editingCollectionId) {
        const previous = data.collections.find(
          (c) => c.id === editingCollectionId,
        );
        if (previous?.name === filter)
          setFilter(
            result.collections.find(
              (c: Collection) => c.id === editingCollectionId,
            )?.name || "All recipes",
          );
      }
      setData(result);
      setEditingCollectionId(null);
      setCollectionName("");
      setToast("Collection saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importOriginal() {
    if (!draft || !requireUser()) return;
    setBusy(true);
    setError("");
    try {
      const result = await api({
        action: "import",
        url: draft.sourceUrl.trim(),
      });
      setDraft(
        mergeImportedRecipe(draft, {
          ...result.draft,
          ingredients: result.draft.ingredients.length
            ? result.draft.ingredients
            : emptyRecipe().ingredients,
        }),
      );
      setToast(
        "Recipe details imported. Review and edit them, then save when ready.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function moveMeal(id: string, target: string) {
    persistState(data.meals, data.checked, reorderMeals(selected.map((r) => r.id), id, target));
  }
  async function share(kind: "meals" | "shopping") {
    const text = kind === "meals" ? planText(selected, data.meals) : shoppingText(shopping, data.checked);
    const title = kind === "meals" ? "Meal plan" : "Shopping list";
    try {
      if (navigator.share) await navigator.share({ title, text });
      else { await navigator.clipboard.writeText(text); setToast(title + " copied, ready to share."); }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Sharing was unavailable. Please use Copy text instead.");
    }
  }
  async function downloadList(format: "txt" | "docx" | "pdf" | "copy") {
    setExportOpen(false);
    try {
      await exportShoppingList(format, shoppingText(shopping, data.checked));
      if (format === "copy") setToast("Shopping list copied.");
    } catch { setError("The list could not be exported. Please try again."); }
  }
  const updateLine = (index: number, patch: Partial<Line>) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            ingredients: d.ingredients.map((line, i) =>
              i === index ? { ...line, ...patch } : line,
            ),
          }
        : d,
    );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <a className="wordmark" href="/" aria-label="Supperbook home">
          supperbook<span className="wordmark-dot">.</span>
        </a>
        <div className="sidebar-caption">A place for good food</div>
        <button
          className="mobile-close icon-button"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        >
          <X />
        </button>
        <nav aria-label="Kitchen navigation">
          <button
            className={view === "recipes" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("recipes")}
          >
            <BookOpen size={19} />
            Recipe collection
            <span>
              {session?.user
                ? data.recipes.filter((r) => !r.archived).length
                : "04"}
            </span>
          </button>
          <button
            className={view === "meals" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("meals")}
          >
            <ListChecks size={19} />
            Meal plan<span>{selected.length || ""}</span>
          </button>
          <button
            className={view === "shopping" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("shopping")}
          >
            <ShoppingBasket size={19} />
            Shopping list<span>{shopping.length || ""}</span>
          </button>
          <button
            className={view === "ingredients" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("ingredients")}
          >
            <Leaf size={19} />
            Ingredient library
          </button>
        </nav>
        <div className="sidebar-section">
          <div className="collection-section-title">
            <button className="collections-toggle" aria-expanded={sidebarCollectionsOpen} aria-controls="sidebar-collections" onClick={() => setSidebarCollectionsOpen(!sidebarCollectionsOpen)}>
              <span className="eyebrow">YOUR COLLECTIONS</span><ChevronDown size={14} className={sidebarCollectionsOpen ? "expanded" : ""} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (requireUser()) {
                  setModal("collections");
                  setError("");
                  setEditingCollectionId(null);
                  setCollectionName("");
                }
              }}
            >
              Manage
            </button>
          </div>
          <div id="sidebar-collections" hidden={!sidebarCollectionsOpen}>
          {collections.map((collection, index) => (
            <button
              key={collection}
              className={`collection-link ${filter === collection ? "chosen" : ""}`}
              onClick={() => {
                setView("recipes");
                setFilter(collection);
                setMobile(false);
              }}
            >
              <i
                style={{
                  background: ["#9a704d", "#889069", "#bf967d"][index % 3],
                }}
              />
              {collection}
              <span>
                {
                  recipes.filter(
                    (r) => !r.archived && matchesRecipeFilter(r, collection),
                  ).length
                }
              </span>
            </button>
          ))}
          </div>
        </div>
        <div className="account">
          {session?.user ? (
            <>
              <div className="avatar">{session.user.name?.[0] || "K"}</div>
              <div className="account-name">
                <strong>{session.user.name || "Your kitchen"}</strong>
                <span>Your personal collection</span>
              </div>
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={() => authClient.signOut()}
              >
                <LogOut size={17} />
              </button>
            </>
          ) : (
            <button
              className="signin-link"
              onClick={() => {
                setModal("auth");
                setError("");
              }}
            >
              <Users size={18} />
              {isPending ? "Opening your kitchen…" : "Sign in to your kitchen"}
              <ArrowRight size={17} />
            </button>
          )}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>

          </div>
          <div className="topbar-right">
            <button
              className="text-button"
              onClick={() => {
                if (requireUser()) {
                  setUrl("");
                  setError("");
                  setModal("import");
                }
              }}
            >
              <Link2 size={16} />
              Import a recipe
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "recipes"
                  ? "THE PERSONAL COOKBOOK"
                  : view === "ingredients"
                    ? "THE BUILDING BLOCKS"
                    : view === "meals"
                      ? "A LITTLE THOUGHT AHEAD"
                      : "FROM KITCHEN TO MARKET"}
              </div>
              <h1>
                {view === "recipes"
                  ? filter === "Archived"
                    ? "Archived recipes"
                    : !["All recipes", "Favorites"].includes(filter)
                      ? filter
                      : "Your recipe collection"
                  : view === "ingredients"
                    ? "The ingredient library"
                    : view === "meals"
                      ? "What’s cooking?"
                      : "Your shopping list"}
                {view !== "meals" && <span className="heading-dot">.</span>}
              </h1>
              {view === "ingredients" && <p>A shared cupboard of ingredients, ready for your next recipe.</p>}
              {view === "shopping" && <p>Everything for your selected meals, gathered into one list.</p>}
            </div>
            <button
              className="primary"
              onClick={() => {
                if (!requireUser()) return;
                if (view === "ingredients") openIngredient();
                else if (view === "recipes") {
                  setDraft(emptyRecipe());
                  setError("");
                } else navigate("recipes");
              }}
            >
              <Plus size={17} />
              {view === "ingredients"
                ? "Add ingredient"
                : view === "recipes"
                  ? "Add a recipe"
                  : "Choose recipes"}
            </button>
          </div>
          {error && !modal && (
            <div className="error-banner" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {view === "recipes" && (
            <>
              <div className="collection-toolbar">
                <div className="filter-tabs">
                  {[
                    "All recipes",
                    "Favorites",
                    ...(session?.user ? ["Archived"] : []),
                  ].map((tab) => (
                    <button
                      key={tab}
                      className={filter === tab ? "selected" : ""}
                      onClick={() => setFilter(tab)}
                    >
                      {tab}
                      {tab === "All recipes" && (
                        <span>{recipes.filter((r) => !r.archived).length}</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="search-sort">
                  <label className="search">
                    <Search size={17} />
                    <input
                      aria-label="Search recipes"
                      placeholder="Find a recipe or ingredient…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <label className="sort">
                    <SlidersHorizontal size={16} />
                    <select
                      aria-label="Sort recipes"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="recent">Recently saved</option>
                      <option value="quick">Quickest first</option>
                      <option value="az">Recipe name</option>
                      <option value="collections">Collections</option>
                    </select>
                    <ChevronDown size={13} />
                  </label>
                </div>
              </div>
              {preview && (
                <p className="starter-note">
                  {session?.user
                    ? "Your collection is ready for its first recipe. These kitchen favorites are here to get you started."
                    : "A few recipes from our kitchen. Sign in to start a collection of your own."}
                </p>
              )}
              {loading ? (
                <div className="empty">
                  <LoaderCircle className="spin" />
                  <p>Opening your recipe collection…</p>
                </div>
              ) : visible.length ? (
                <div className="recipe-grid">
                  {visible.map((recipe, index) => (
                    <article className="recipe-card" key={recipe.id}>
                      <div className="card-photo">
                        <button
                          className="photo-button"
                          onClick={() => setDetail(recipe)}
                          aria-label={`Open ${recipe.title}`}
                        >
                          <FoodImage src={recipe.imageUrl} alt={recipe.title} />
                        </button>
                        <span className="card-category">
                          {collectionLabel(recipe)}
                        </span>
                        <button
                          disabled={busy}
                          className={`favorite icon-button ${recipe.favorite ? "is-favorite" : ""}`}
                          aria-label={`${recipe.favorite ? "Unfavorite" : "Favorite"} ${recipe.title}`}
                          onClick={() => favorite(recipe)}
                        >
                          <Heart
                            size={18}
                            fill={recipe.favorite ? "currentColor" : "none"}
                          />
                        </button>
                      </div>
                      <div className="card-body">
                        <span className="recipe-number">
                          RECIPE No. {String(index + 1).padStart(2, "0")}
                        </span>
                        <button
                          className="card-title"
                          onClick={() => setDetail(recipe)}
                        >
                          {recipe.title}
                        </button>
                        <p>{recipe.description}</p>
                        <div className="card-meta">
                          <span>
                            <Clock3 size={14} />
                            {recipe.minutes} min
                          </span>
                          <span>
                            <Users size={14} />
                            {recipe.servings} servings
                          </span>
                          <button
                            disabled={busy}
                            className={data.meals[recipe.id] ? "planned" : ""}
                            onClick={() =>
                              recipe.archived
                                ? archiveRecipe(recipe)
                                : plan(recipe)
                            }
                            aria-label={`${recipe.archived ? "Restore" : "Plan"} ${recipe.title}`}
                          >
                            {data.meals[recipe.id] ? (
                              <Check size={17} />
                            ) : (
                              <Plus size={17} />
                            )}
                            <span>
                              {recipe.archived
                                ? "Restore"
                                : data.meals[recipe.id]
                                  ? "Planned"
                                  : "Plan meal"}
                            </span>
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty">
                  <BookOpen size={35} strokeWidth={1} />
                  <h2>
                    {filter === "Favorites"
                      ? "Keep your favorites close"
                      : "No recipes found"}
                  </h2>
                  <p>
                    {filter === "Favorites"
                      ? "Tap the heart on a recipe to find it here."
                      : "Try another ingredient or recipe name."}
                  </p>
                </div>
              )}
            </>
          )}
          {view === "meals" && (
            <>
              <div className="section-intro">
                <p>
                  {selected.length
                    ? `${selected.length} ${selected.length === 1 ? "meal" : "meals"} for the days ahead. Adjust the servings to suit your table.`
                    : "Your plan can be as simple as a couple of suppers. Add recipes from your collection to begin."}
                </p>
                {selected.length > 0 && (
                  <div className="action-group">
                    <button className="outline" onClick={() => share("meals")}>Share meal plan</button>
                    <button className="outline" onClick={async () => {
                      try { await navigator.clipboard.writeText(planText(selected, data.meals)); setToast("Meal plan copied."); }
                      catch { setError("Clipboard access was unavailable."); }
                    }}>Copy plan</button>
                    <button className="outline" onClick={() => navigate("shopping")}>View shopping list <ArrowRight size={17} /></button>
                  </div>
                )}
              </div>
              {selected.length ? (
                <SortableMeals items={selected.map((recipe) => recipe.id)} labels={Object.fromEntries(selected.map((recipe) => [recipe.id, recipe.title]))}
                  onReorder={(order) => persistState(data.meals, data.checked, order)}
                  renderItem={(_id, index, handleProps) => {
                    const recipe = selected[index];
                    return <>
                      <div className="meal-reorder">
                        <button type="button" {...handleProps} className="drag-handle" aria-label={`Drag ${recipe.title} to reorder`}>⋮⋮</button>
                        <button type="button" disabled={index === 0} aria-label={`Move ${recipe.title} up`} onClick={() => moveMeal(recipe.id, selected[index - 1].id)}>↑</button>
                        <button type="button" disabled={index === selected.length - 1} aria-label={`Move ${recipe.title} down`} onClick={() => moveMeal(recipe.id, selected[index + 1].id)}>↓</button>
                      </div>
                      <span className="meal-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <FoodImage src={recipe.imageUrl} alt={recipe.title} />
                      <button
                        className="meal-title"
                        onClick={() => setDetail(recipe)}
                      >
                        {recipe.title}
                        <small>
                          {recipe.minutes} minutes · {collectionLabel(recipe)}
                        </small>
                      </button>
                      <label>
                        Servings
                        <input
                          type="number"
                          min="0.5"
                          max="1000"
                          step="0.5"
                          aria-label={`Servings for ${recipe.title}`}
                          value={data.meals[recipe.id]}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            if (value > 0 && value <= 1000)
                              persistState(
                                { ...data.meals, [recipe.id]: value },
                                [],
                              );
                          }}
                        />
                      </label>
                      <button
                        className="icon-button"
                        aria-label={`Remove ${recipe.title} from plan`}
                        onClick={() => {
                          const meals = { ...data.meals };
                          delete meals[recipe.id];
                          persistState(meals, []);
                        }}
                      >
                        <X size={19} />
                      </button>
                    </>;
                  }}
                />
              ) : (
                <Empty
                  title="A few good meals, all in one place"
                  text="When you add a meal, its ingredients will be waiting on your shopping list."
                  action={() => navigate("recipes")}
                  label="Browse recipes"
                />
              )}
            </>
          )}
          {view === "shopping" && (
            <>
              <div className="section-intro">
                <p>
                  {shopping.length
                    ? `${shopping.length - data.checked.filter((key) => shopping.some((r) => r.key === key)).length} items left to pick up for ${selected.length} ${selected.length === 1 ? "meal" : "meals"}.`
                    : "Your shopping list will appear as you choose meals."}
                </p>
                {shopping.length > 0 && (
                  <div className="action-group">
                    <button className="outline" onClick={() => share("shopping")}>Share shopping list</button>
                    <div className="export-control">
                      <button className="outline" aria-expanded={exportOpen} aria-controls="list-export-options" onClick={() => setExportOpen(!exportOpen)}>
                        <ArrowDownToLine size={17} /> Download list <ChevronDown size={14} />
                      </button>
                      {exportOpen && <div id="list-export-options" className="export-options">
                        <button onClick={() => downloadList("txt")}>Text (.txt)</button>
                        <button onClick={() => downloadList("docx")}>Word (.docx)</button>
                        <button onClick={() => downloadList("pdf")}>PDF (.pdf)</button>
                        <button onClick={() => downloadList("copy")}>Copy text</button>
                      </div>}
                    </div>
                  </div>
                )}
              </div>
              {shopping.length ? (
                <div className="shopping-layout">
                  <div>
                    {categories.map((category) => {
                      const rows = shopping
                        .filter((row) => row.category === category)
                        .sort((a, b) =>
                          Number(data.checked.includes(a.key)) - Number(data.checked.includes(b.key)),
                        );
                      return rows.length ? (
                        <section className="shopping-group" key={category}>
                          <h2>
                            {category}
                            <span>{rows.length}</span>
                          </h2>
                          {rows.map((row) => (
                            <label
                              className={`shopping-row ${data.checked.includes(row.key) ? "checked" : ""}`}
                              key={row.key}
                            >
                              <input
                                type="checkbox"
                                checked={data.checked.includes(row.key)}
                                onChange={() =>
                                  persistState(
                                    data.meals,
                                    data.checked.includes(row.key)
                                      ? data.checked.filter(
                                          (k) => k !== row.key,
                                        )
                                      : [...data.checked, row.key],
                                  )
                                }
                              />
                              <span className="custom-check">
                                <Check size={14} />
                              </span>
                              <span className="shopping-name">
                                {row.name}
                                <small>
                                  {row.preparations.join("; ")}
                                  {row.preparations.length ? " · " : ""}
                                  {row.recipes.join(", ")}
                                </small>
                              </span>
                              <strong>{amount(row.quantity, row.unit)}</strong>
                            </label>
                          ))}
                        </section>
                      ) : null;
                    })}
                  </div>
                  <aside className="list-note">
                    <ShoppingBasket size={30} strokeWidth={1} />
                    <h3>A list with a little thought.</h3>
                    <p>
                      Amounts follow the servings in your meal plan. Compatible
                      measures are combined; ingredients without an amount stay
                      separate.
                    </p>
                    <div className="list-rule" />
                    <span>ON THE MENU</span>
                    {selected.map((r) => (
                      <p key={r.id}>
                        {r.title}
                        <small>{data.meals[r.id]} servings</small>
                      </p>
                    ))}
                  </aside>
                </div>
              ) : (
                <Empty
                  title="Make room in your basket"
                  text="Choose recipes for your meal plan and we’ll gather the ingredients here."
                  action={() => navigate("recipes")}
                  label="Choose a few meals"
                />
              )}
            </>
          )}
          {view === "ingredients" && (
            <>
              <div className="ingredient-toolbar">
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label="Search ingredients"
                    placeholder="Look for an ingredient…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <span>
                  {data.ingredients.length} ingredients in the library
                </span>
              </div>
              {session?.user ? (
                <div className="ingredient-groups">
                  {categories.map((category) => {
                    const items = data.ingredients.filter(
                      (i) =>
                        i.category === category &&
                        i.name.toLowerCase().includes(search.toLowerCase()),
                    );
                    return items.length ? (
                      <section key={category} className="ingredient-category">
                        <h2>
                          <button className="ingredient-category-toggle" aria-expanded={!!search || openIngredientCategories.includes(category)} aria-controls={`ingredients-${category.replace(/[^a-z]/gi,"")}`} onClick={() => setOpenIngredientCategories((open) => open.includes(category) ? open.filter((name) => name !== category) : [...open, category])}>
                            <span>{category}</span><span className="category-count">{items.length}</span><ChevronDown size={16} />
                          </button>
                        </h2>
                        {(!!search || openIngredientCategories.includes(category)) && <div id={`ingredients-${category.replace(/[^a-z]/gi,"")}`}>
                        {items.map((i) => (
                          <div className="ingredient-item" key={i.id}>
                            <span>{i.name}</span>
                            <small>
                              {
                                data.recipes.filter((r) =>
                                  r.ingredients.some(
                                    (line) => line.ingredientId === i.id,
                                  ),
                                ).length
                              }{" "}
                              recipes
                            </small>
                          </div>
                        ))}
                        </div>}
                      </section>
                    ) : null;
                  })}
                  {!data.ingredients.some((i) =>
                    i.name.toLowerCase().includes(search.toLowerCase()),
                  ) && (
                    <p className="starter-note">
                      No matching ingredients. Add one to the library to use it
                      in a recipe.
                    </p>
                  )}
                </div>
              ) : (
                <Empty
                  title="Every ingredient has its place"
                  text="Sign in to browse the shared library and add ingredients for your recipes."
                  action={() => {
                    setModal("auth");
                    setError("");
                  }}
                  label="Sign in"
                />
              )}
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {detail && !draft && (
        <Dialog
          title={detail.title}
          onClose={() => {
            setDetail(null);
            setError("");
          }}
          wide
        >
          <div className="recipe-detail">
            <FoodImage
              className="detail-photo"
              src={detail.imageUrl}
              alt={detail.title}
            />
            <div className="detail-copy">
              <PhotoCredit src={detail.imageUrl} />
              {detail.archived && (
                <p className="archived-notice">
                  This recipe is archived. Restore it to include it in a meal
                  plan.
                </p>
              )}
              <span className="eyebrow">{collectionLabel(detail)}</span>
              <h2>{detail.title}</h2>
              <p>{detail.description}</p>
              <div className="detail-meta">
                <span>
                  <Clock3 size={16} />
                  {detail.minutes} minutes
                </span>
                <span>
                  <Users size={16} />
                  {detail.servings} servings
                </span>
              </div>
              {error && !modal && <p className="form-error" role="alert">{error}</p>}
              <div className="detail-actions">
                <button
                  className="primary"
                  disabled={busy || !!detail.archived}
                  onClick={() => plan(detail)}
                >
                  <Plus size={16} />
                  Add to meal plan
                </button>
                <button
                  className="outline"
                  disabled={busy}
                  onClick={() => {
                    if (requireUser()) {
                      setDraft({
                        ...detail,
                        id: data.recipes.some((r) => r.id === detail.id)
                          ? detail.id
                          : crypto.randomUUID(),
                      });
                      setError("");
                    }
                  }}
                >
                  {data.recipes.some((r) => r.id === detail.id)
                    ? "Edit recipe"
                    : "Save a copy"}
                </button>
              </div>
              <div className="detail-sections">
                <section>
                  <h3>Ingredients</h3>
                  {detail.ingredients.map((line, i) => (
                    <div className="detail-ingredient" key={i}>
                      <strong>{amount(line.quantity, line.unit)}</strong>
                      <span>
                        {line.name}
                        <small>{line.preparation}</small>
                      </span>
                    </div>
                  ))}
                </section>
                <section>
                  <h3>At the stove</h3>
                  {detail.instructions.map((step, i) => (
                    <div className="instruction" key={i}>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      <p>{step}</p>
                    </div>
                  ))}
                </section>
              </div>
              {detail.notes && (
                <div className="cook-note">
                  <span className="eyebrow">A NOTE FOR NEXT TIME</span>
                  <p>{detail.notes}</p>
                </div>
              )}
              <div className="detail-bottom">
                {detail.sourceUrl ? (
                  <a href={detail.sourceUrl} target="_blank" rel="noreferrer">
                    Original recipe ·{" "}
                    {detail.sourceName || new URL(detail.sourceUrl).hostname}
                    <ArrowRight size={14} />
                  </a>
                ) : (
                  <span>{detail.sourceName || "From your kitchen"}</span>
                )}
                {data.recipes.some((r) => r.id === detail.id) && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => archiveRecipe(detail)}
                  >
                    {detail.archived ? "Restore recipe" : "Archive recipe"}
                  </button>
                )}
                {data.recipes.some((r) => r.id === detail.id) && (
                  <button
                    className="danger text-button"
                    disabled={busy}
                    onClick={() => deleteRecipe(detail)}
                  >
                    <Trash2 size={14} />
                    Delete recipe
                  </button>
                )}
              </div>
            </div>
          </div>
        </Dialog>
      )}
      {draft && (
        <Dialog
          title="Recipe editor"
          onClose={requestDraftExit}
          wide
        >
          <form className="editor" onSubmit={saveDraft}>
            <div className="eyebrow">YOUR KITCHEN NOTEBOOK</div>
            <h2>
              {data.recipes.some((r) => r.id === draft.id)
                ? "Make it your own."
                : "A recipe worth keeping."}
            </h2>
            <p className="muted">
              Keep the details that matter, from the first ingredient to your
              own notes.
            </p>
            <div className="original-url-import">
              {" "}
              <label>
                Original recipe URL
                <input
                  type="url"
                  value={draft.sourceUrl}
                  onChange={(e) =>
                    setDraft({ ...draft, sourceUrl: e.target.value })
                  }
                  placeholder="https://…"
                />
              </label>
              <button
                type="button"
                className="outline"
                disabled={busy || !draft.sourceUrl.trim()}
                onClick={importOriginal}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <ArrowDownToLine size={16} />
                )}
                Import from original URL
              </button>
            </div>
            <p className="import-explainer">
              Paste the original link to fill this recipe. You can edit the
              imported values before saving; your collection and cooking notes
              are kept.
            </p>
            <label>
              Recipe name
              <input
                required
                maxLength={200}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="What are we cooking?"
              />
            </label>
            <label>
              A few words about the dish
              <textarea
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
                rows={2}
              />
            </label>
            <div className="form-grid">
              <label>
                Servings
                <input
                  type="number"
                  min="0.5"
                  max="1000"
                  step="0.5"
                  required
                  value={draft.servings}
                  onChange={(e) =>
                    setDraft({ ...draft, servings: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Total minutes
                <input
                  type="number"
                  min="0"
                  max="10080"
                  required
                  value={draft.minutes}
                  onChange={(e) =>
                    setDraft({ ...draft, minutes: Number(e.target.value) })
                  }
                />
              </label>
              <fieldset className="recipe-collections-picker">
                <legend>Collections</legend>
                <div className="recipe-collection-options">
                  {[...new Set([...collections.filter((name) => name !== "Unfiled"), ...recipeCollections(draft)])].map((name) =>
                    <label key={name}><input type="checkbox" checked={recipeCollections(draft).includes(name)} onChange={(event) => {
                      const selected = recipeCollections(draft);
                      const next = event.target.checked ? [...selected, name] : selected.filter((value) => value !== name);
                      setDraft({ ...draft, collections: next, collection: next[0] || "Unfiled" });
                    }} />{name}</label>
                  )}
                </div>
                {!recipeCollections(draft).length && <p>Unfiled until you choose a collection.</p>}
                <div className="new-recipe-collection">
                  <input aria-label="New collection name for recipe" maxLength={80} placeholder="New collection name" value={newRecipeCollection} onChange={(event) => setNewRecipeCollection(event.target.value)} />
                  <button type="button" className="outline" disabled={!newRecipeCollection.trim()} onClick={() => {
                    const name = newRecipeCollection.trim().replace(/\s+/g, " ");
                    if (["unfiled","all recipes","favorites","archived"].includes(name.toLowerCase())) { setError("Please choose a different collection name."); return; }
                    const names = recipeCollections(draft);
                    const existing = [...collections, ...names].find((value) => value.toLowerCase() === name.toLowerCase()) || name;
                    if (!names.includes(existing)) setDraft({ ...draft, collections: [...names, existing], collection: names[0] || existing });
                    setNewRecipeCollection("");
                  }}>Add</button>
                </div>
              </fieldset>
            </div>
            <div className="form-grid">
              <label>
                Photo URL
                <input
                  type="url"
                  value={draft.imageUrl}
                  onChange={(e) =>
                    setDraft({ ...draft, imageUrl: e.target.value })
                  }
                  placeholder="https://…"
                />
              </label>
            </div>

            {!!draft.imageOptions?.length && <fieldset className="header-image-picker">
              <legend>Choose a header photo</legend>
              <div className="header-image-options">
                {draft.imageOptions.map((image, index) => <label key={image} className={draft.imageUrl === image ? "chosen" : ""}>
                  <input type="radio" name="header-photo" value={image} checked={draft.imageUrl === image} onChange={() => setDraft({ ...draft, imageUrl: image })} />
                  <FoodImage src={image} alt={`Header photo option ${index + 1}`} />
                  <span>Photo {index + 1}{draft.imageUrl === image ? " · Selected" : ""}</span>
                </label>)}
              </div>
              {draft.imageOptions.length < 2 && <p>This source provided one usable photo. You can also enter a photo URL above.</p>}
            </fieldset>}
            <PhotoCredit src={draft.imageUrl} />
            <div className="editor-section-heading">
              <h3>Ingredients</h3>
              <span>Amounts belong to this recipe.</span>
            </div>
            <datalist id="ingredient-options">
              {data.ingredients.map((i) => (
                <option key={i.id} value={i.name} />
              ))}
            </datalist>
            {draft.ingredients.map((line, index) => {
              const found = data.ingredients.find(
                (i) =>
                  i.id === line.ingredientId ||
                  normalizeName(i.name) === normalizeName(line.name),
              );
              return (
                <div className="ingredient-editor" key={index}>
                  <div className="line-number">{index + 1}</div>
                  <label className="name-field">
                    <span>Ingredient</span>
                    <input
                      required
                      list="ingredient-options"
                      value={line.name}
                      aria-label={`Ingredient ${index + 1}`}
                      onChange={(e) =>
                        updateLine(index, {
                          name: e.target.value,
                          ingredientId: undefined,
                        })
                      }
                    />
                    {!found && line.name.trim() && (
                      <button
                        className="inline-link"
                        type="button"
                        onClick={() => openIngredient(line.name, index)}
                      >
                        Find or add to library
                        <ArrowRight size={12} />
                      </button>
                    )}
                    {found && (
                      <small className="matched">
                        <Check size={11} />
                        In the library
                      </small>
                    )}
                  </label>
                  <label>
                    <span>Amount</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      aria-label={`Amount ${index + 1}`}
                      value={line.quantity ?? ""}
                      onChange={(e) =>
                        updateLine(index, {
                          quantity:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                      placeholder="—"
                    />
                  </label>
                  <label>
                    <span>Unit</span>
                    <input
                      aria-label={`Unit ${index + 1}`}
                      value={line.unit}
                      onChange={(e) =>
                        updateLine(index, { unit: e.target.value })
                      }
                      placeholder="g, cup…"
                    />
                  </label>
                  <label className="prep-field">
                    <span>Preparation</span>
                    <input
                      aria-label={`Preparation ${index + 1}`}
                      value={line.preparation}
                      onChange={(e) =>
                        updateLine(index, { preparation: e.target.value })
                      }
                      placeholder="finely chopped"
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove ingredient ${index + 1}`}
                    disabled={draft.ingredients.length === 1}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        ingredients: draft.ingredients.filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                  >
                    <X size={17} />
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              className="outline"
              onClick={() =>
                setDraft({
                  ...draft,
                  ingredients: [
                    ...draft.ingredients,
                    { name: "", quantity: null, unit: "", preparation: "" },
                  ],
                })
              }
            >
              <Plus size={16} />
              Another ingredient
            </button>
            <h3>Method</h3>
            {draft.instructions.map((step, index) => (
              <label key={index}>
                Step {index + 1}
                <div className="step-editor">
                  <textarea
                    rows={3}
                    value={step}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        instructions: draft.instructions.map((s, i) =>
                          i === index ? e.target.value : s,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove step ${index + 1}`}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        instructions: draft.instructions.filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                  >
                    <X size={17} />
                  </button>
                </div>
              </label>
            ))}
            <button
              type="button"
              className="outline"
              onClick={() =>
                setDraft({
                  ...draft,
                  instructions: [...draft.instructions, ""],
                })
              }
            >
              <Plus size={16} />
              Another step
            </button>
            <label className="notes-label">
              Your cooking notes
              <textarea
                rows={3}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="A substitution that worked, a little less salt next time…"
              />
            </label>
            {error && !modal && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="editor-footer">
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={requestDraftExit}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Check size={16} />
                )}
                Save recipe
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {modal === "collections" && (
        <Dialog
          title="Manage collections"
          onClose={() => {
            setModal(null);
            setError("");
          }}
        >
          <div className="eyebrow">YOUR RECIPE SHELVES</div>
          <h2>Make room for what you cook.</h2>
          <p className="collection-explainer">
            Create a collection for any kind of cooking. Renaming it updates its
            recipes. Removing a collection keeps its recipes in their other collections, or Unfiled when none remain.
          </p>
          <form onSubmit={saveCollection}>
            <label>
              {editingCollectionId ? "Rename collection" : "New collection"}
              <input
                autoFocus
                required
                maxLength={80}
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                placeholder="Sunday suppers"
              />
            </label>
            <div className="collection-form-actions">
              <button className="primary" disabled={busy}>
                {editingCollectionId ? "Save name" : "Create collection"}
              </button>
              {editingCollectionId && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setEditingCollectionId(null);
                    setCollectionName("");
                  }}
                >
                  Cancel rename
                </button>
              )}
            </div>
          </form>
          <div className="collection-manager-list">
            {data.collections.length ? (
              data.collections.map((c) => (
                <div className="collection-manager-row" key={c.id}>
                  <button
                    type="button"
                    className="collection-open"
                    onClick={() => {
                      setView("recipes");
                      setFilter(c.name);
                      setSearch("");
                      setModal(null);
                      setMobile(false);
                    }}
                  >
                    {c.name}
                    <small>
                      {
                        data.recipes.filter((r) => recipeCollections(r).includes(c.name))
                          .length
                      }{" "}
                      recipes
                    </small>
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    aria-label={"Rename " + c.name}
                    onClick={() => {
                      setEditingCollectionId(c.id);
                      setCollectionName(c.name);
                      setError("");
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    disabled={busy}
                    aria-label={"Delete collection " + c.name}
                    onClick={() => {
                      setDeleteTarget({
                        kind: "collection",
                        id: c.id,
                        name: c.name,
                      });
                      setError("");
                      setModal("confirmDelete");
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            ) : (
              <p className="starter-note">
                Your first collection can start with a name; add recipes
                whenever you like.
              </p>
            )}
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </Dialog>
      )}
      {modal === "confirmDelete" && deleteTarget && (
        <Dialog
          title={
            deleteTarget.kind === "recipe"
              ? "Delete recipe"
              : "Delete collection"
          }
          onClose={() => {
            if (!busy) {
              setModal(
                deleteTarget.kind === "collection" ? "collections" : null,
              );
              setDeleteTarget(null);
              setError("");
            }
          }}
        >
          <div className="eyebrow">BEFORE YOU REMOVE IT</div>
          <h2>
            {deleteTarget.kind === "recipe"
              ? "Delete this recipe?"
              : "Delete this collection?"}
          </h2>
          <p className="collection-explainer">
            {deleteTarget.kind === "recipe"
              ? "“" +
                deleteTarget.name +
                "” and its cooking notes will be permanently deleted. You can archive it instead if you might want it later."
              : "“" +
                deleteTarget.name +
                "” will be removed. Its recipes keep their other collections and move to Unfiled only when none remain."}
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="confirm-actions">
            <button
              type="button"
              className="outline"
              disabled={busy}
              onClick={() => {
                setModal(
                  deleteTarget.kind === "collection" ? "collections" : null,
                );
                setDeleteTarget(null);
              }}
            >
              Keep it
            </button>
            <button
              type="button"
              className="primary danger-button"
              disabled={busy}
              onClick={performDelete}
            >
              {busy ? "Deleting…" : "Delete " + deleteTarget.kind}
            </button>
          </div>
        </Dialog>
      )}
      {modal === "import" && (
        <Dialog title="Import a recipe" onClose={() => setModal(null)}>
          <form onSubmit={importUrl}>
            <span className="modal-symbol">
              <Link2 size={28} strokeWidth={1.2} />
            </span>
            <div className="eyebrow">FROM SOMEWHERE DELICIOUS</div>
            <h2>Bring a recipe home.</h2>
            <p>
              Paste the recipe page below. You can adjust the ingredients,
              method, and notes before it joins your collection.
            </p>
            <label>
              Recipe link
              <input
                autoFocus
                required
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-favorite-kitchen.com/recipe"
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <ArrowDownToLine size={17} />
              )}{" "}
              {busy ? "Reading the recipe…" : "Import recipe"}
            </button>
            <p className="fine-print">
              Some websites don’t share readable recipe data. You can always
              keep a recipe by hand.
            </p>
            <button
              type="button"
              className="text-button centered"
              disabled={busy}
              onClick={() => {
                setDraft({ ...emptyRecipe(), sourceUrl: url });
                setModal(null);
                setError("");
              }}
            >
              Write it in instead
              <ArrowRight size={15} />
            </button>
          </form>
        </Dialog>
      )}
      {modal === "auth" && (
        <Dialog
          title="Your kitchen account"
          onClose={() => {
            setModal(null);
            setError("");
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const form = new FormData(e.currentTarget);
              try {
                const credentials = {
                  email: String(form.get("email")),
                  password: String(form.get("password")),
                };
                const result =
                  authMode === "signup"
                    ? await authClient.signUp.email({
                        ...credentials,
                        name: String(form.get("name")),
                      })
                    : await authClient.signIn.email(credentials);
                if (result.error)
                  throw new Error(
                    result.error.message || "Please check your details.",
                  );
                setModal(null);
                setToast(
                  authMode === "signup"
                    ? "Your kitchen is ready. Welcome to Supperbook."
                    : "Welcome back to your kitchen.",
                );
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <a href="/" className="wordmark modal-wordmark">
              supperbook.
            </a>
            <div className="eyebrow">A PLACE AT YOUR TABLE</div>
            <h2>
              {authMode === "signup"
                ? "Make yourself at home."
                : "Welcome back."}
            </h2>
            <p>
              {authMode === "signup"
                ? "Start keeping the recipes you want to cook again."
                : "Your recipes, cooking notes, and next few meals are waiting."}
            </p>
            {authMode === "signup" && (
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={100}
                />
              </label>
            )}
            <label>
              Email address
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                minLength={8}
                autoComplete={
                  authMode === "signup" ? "new-password" : "current-password"
                }
                required
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy && <LoaderCircle className="spin" size={16} />}{" "}
              {authMode === "signup" ? "Create your kitchen" : "Sign in"}
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              className="text-button centered"
              onClick={() => {
                setAuthMode(authMode === "signin" ? "signup" : "signin");
                setError("");
              }}
            >
              {authMode === "signin"
                ? "New here? Create an account"
                : "Already have an account? Sign in"}
            </button>
          </form>
        </Dialog>
      )}
      {modal === "ingredient" && (
        <Dialog
          title="Add an ingredient"
          onClose={() => {
            setModal(null);
            setError("");
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addIngredient();
            }}
          >
            <span className="modal-symbol">
              <Leaf size={28} strokeWidth={1.2} />
            </span>
            <div className="eyebrow">IN THE SHARED CUPBOARD</div>
            <h2>A place for every ingredient.</h2>
            <p>
              Look for a familiar name first. Quantities and preparation notes
              stay with the recipe.
            </p>
            <label>
              Ingredient name
              <input
                autoFocus
                required
                maxLength={120}
                value={ingredientName}
                onChange={(e) => {
                  setIngredientName(e.target.value);
                  setMatches([]);
                }}
              />
            </label>
            <label>
              Where you’ll find it
              <select
                value={ingredientCategory}
                onChange={(e) => setIngredientCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            {matches.length > 0 && (
              <div className="match-box">
                <h3>Could one of these be the same ingredient?</h3>
                <p>Choose a match, or add a distinct ingredient below.</p>
                {matches.map((i) => (
                  <button
                    type="button"
                    key={i.id}
                    onClick={() => useIngredient(i)}
                  >
                    <span>
                      {i.name}
                      <small>{i.category}</small>
                    </span>
                    <ArrowRight size={17} />
                  </button>
                ))}
                <button
                  type="button"
                  className="inline-link"
                  disabled={busy}
                  onClick={() => addIngredient(true)}
                >
                  Add “{ingredientName}” as a different ingredient
                </button>
              </div>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Search size={16} />
              )}
              Check & add ingredient
            </button>
          </form>
        </Dialog>
      )}
      {confirmOpen && (
        <Dialog title="Leave this recipe?" onClose={cancelExit}>
          <div className="exit-confirmation">
            <h2>Leave this recipe?</h2>
            <p>Your unsaved changes will be lost. You can keep editing and save the recipe before leaving.</p>
            <div className="action-group">
              <button className="outline" onClick={cancelExit}>Keep editing</button>
              <button className="primary" onClick={confirmExit} disabled={busy}>Discard changes</button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
function PhotoCredit({ src }: { src: string }) {
  const source = photoSource(src);
  return source ? (
    <p className="photo-credit">
      <a href={source.href} target="_blank" rel="noreferrer">
        Photo source · {source.publisher}
        <ArrowRight size={12} />
      </a>
    </p>
  ) : null;
}
function Empty({
  title,
  text,
  action,
  label,
}: {
  title: string;
  text: string;
  action: () => void;
  label: string;
}) {
  return (
    <div className="empty illustrated-empty">
      <span className="empty-illustration">
        <Leaf size={55} strokeWidth={0.9} />
        <span />
        <span />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="outline" onClick={action}>
        {label}
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
function Dialog({
  children,
  title,
  onClose,
  wide = false,
}: {
  children: React.ReactNode;
  title: string;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]),a[href],input,textarea,select",
        ) || [],
      ).filter((el) => el.offsetParent !== null);
    focusable()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = focusable(),
        first = list[0],
        last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", trap);
      before?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button
          className="modal-close icon-button"
          aria-label={`Close ${title}`}
          onClick={onClose}
        >
          <X size={21} />
        </button>
        {children}
      </div>
    </div>
  );
}
