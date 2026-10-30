# Supperbook

A personal recipe notebook built with Next.js, Neon Postgres, and Neon Auth, prepared for Vercel and GitHub.

## Development

Use Node 22.17+ (Vercel uses Node 24). Run `npm ci --legacy-peer-deps`, copy `.env.example` to `.env.local`, fill in the three required environment variables, and run `npm run dev`. The app opens at http://localhost:3100.

The existing Neon project is `mute-moon-34257764`, branch `br-curly-grass-aki9bgto`, database `neondb` in AWS Oregon. Neon Auth uses its Better Auth integration. Never expose the database URL or auth cookie secret through a `NEXT_PUBLIC_` variable. `.env.local` and `.vercel` are ignored by Git.

## Data model

- `recipes` belongs to the validated Neon Auth user ID. All reads and writes scope ownership on the server.
- `ingredients` is a shared canonical library with category, normalized unique name, creator and trigram search index. Exact matches are reused. Similar names require a choice before a new entry is created.
- `recipe_ingredients` holds each recipe's ingredient reference, quantity, unit, preparation, original imported text and position. Measurements are never stored on canonical ingredients.
- `kitchen_state` persists each user's selected meals, their custom order, serving counts and checked shopping items.

The initial migration is `db/schema.sql` and has been applied to the provisioned database. It creates tables and seeds the shared ingredient library, with no user recipes. Database access remains server-only; non-owner roles have no application table grants and RLS defaults to deny. Do not use the owner connection in client code. For future migrations, review and apply SQL through the Neon console or migration tooling, then deploy the matching code.

## Recipe import

Authenticated users can import public recipe pages with Schema.org Recipe JSON-LD. The parser handles graph objects, instruction sections, common units and fractions. It retains the source and opens a reviewable draft. Websites that block imports or omit structured recipe data have a manual entry path. Imported ingredient names must be matched to or added to the library before a recipe can be saved.

The importer validates every redirect, rejects private/reserved network addresses, pins the validated DNS address for the request, uses a 15-second timeout and caps response size at 2 MB. No paywall or login bypass is provided.

## Shopping lists

Selected servings scale each recipe proportionally. Rows merge by ingredient ID and measurement dimension; compatible measurements combine using US cup measures, then display in the first recipe's kitchen unit. Large metric amounts use kilograms or liters. Count units, mass, volume and unspecified amounts remain distinct. Preparation notes and contributing recipes remain visible. Changing meal quantities resets checked items so the revised list can be reviewed. Lists can be shared as text, copied, or downloaded as TXT, Word (.docx), or PDF. Meal plans can be shared or copied in their saved order; drag handles and accessible move buttons change that order.

## Verification

Run `npm test`, `npm run typecheck`, and `npm run build`. See `VERIFICATION.md` for the latest verification evidence and any remaining limitations.

## Deployment

GitHub: https://github.com/joyceful-lee/supperbook

Vercel project: `supperbook` (`prj_EGANTuvF56cZWtCsueD92KCrnBDg`) in `leejoyce21-7656`.

Set `DATABASE_URL`, `NEON_AUTH_BASE_URL`, and `NEON_AUTH_COOKIE_SECRET` in Vercel. Use a random secret of at least 32 characters. Add exact deployment origins to Neon Auth trusted domains, including the eventual production/custom domain. The GitHub repository is connected to Vercel: pushes to main deploy automatically after the test and production build checks pass. Production is available at https://supperbook.vercel.app. The project uses the Next.js framework preset and the `pdx1` region near its Neon database. Preview deployments should use a separate Neon branch for future schema changes.

The sample recipe cards are authored starting points, not saved user records. Saving one creates a recipe for the signed-in user. Photography is served from Unsplash; Instrument Serif and DM Sans load from Google Fonts. Without those external assets, the app retains local fallback typography and food image placeholders.


## Recipe management

Apply db/schema.sql, db/002_recipe_management.sql, then db/003_meal_order_ingredient_names.sql for a fresh database. The third migration adds persisted meal order and capitalizes existing ingredient names. The second migration adds independent user-owned collections, collection membership references, and recipe archive status. Existing saved recipe collections are backfilled.

The editor accepts an original recipe URL at the top and has an Import from original URL button. Imported values remain editable until Save recipe; personal notes, collection and identity survive re-imports. Recipes can be archived, restored from Archived, or permanently deleted after confirmation. Archiving removes the recipe from meal planning and shopping. Manage beside Your Collections opens create, read, rename and delete controls. Deleting a collection moves its recipes to Unfiled and does not delete recipes. Photo source links are shown in the editor and recipe detail.

Import drafts offer up to three HTTPS header photos extracted from the recipe page, with the first selected initially. Sources with fewer photos show only their available images; users can also enter a photo URL. The selected URL is saved with the recipe. New library ingredient names have their first letter capitalized without changing the rest of the name.

Apply db/004_recipe_collections.sql after earlier migrations. It adds user-scoped, many-to-many recipe collection membership with database ownership constraints and backfills the existing memberships. Recipe editors can select several collections or create names while editing. Collection filtering and counts use memberships; the Collections sort uses each recipe’s first alphabetical collection. Removing a collection keeps recipes in any other collections, falling back to Unfiled only if none remain.

Ingredient sections start collapsed and automatically show search results. The sidebar collection list can be collapsed independently. Meal dragging previews the reordered rows and animates neighboring recipes; dropping saves the order, while canceling a drag restores the saved order. Move buttons remain available for keyboard and touch users.

Collection selection uses a searchable multi-select dropdown in the editor. Recipe tiles show Add to collection on hover and keyboard focus, and keep it visible on touch devices. Tile selections are staged until Save collections, then update only that recipe’s collection membership through an authenticated, owner-scoped transaction. Editor selections remain part of the unsaved recipe draft.

## Recipe recommendations

Apply `db/005_recommendations.sql` after the earlier migrations. It adds recipe cuisine, user preferences and feedback, planning history, provider provenance, an expiring public-recipe cache and per-user discovery limits. All personal recommendation reads and writes are scoped to the authenticated user.

Discover ranks saved recipes and optional TheMealDB suggestions using favorites, ingredient similarity, prior planning, preferred cuisines, cooking-time limits and thumbs-up feedback. It favors overlap with the current meal plan and adds variety. Ingredient-library entries are a shared catalog, not pantry inventory. Archived, already planned, dismissed and previously saved provider recipes are excluded. New users can review authored starter recipes.

External recipes remain suggestions until Review and save opens an editable draft. TheMealDB does not supply servings or cooking time; servings must be entered before saving and unknown cooking time remains blank. Original publisher links, TheMealDB attribution and existing source photos are retained. Ingredient names must still be matched against the canonical library; quantities and preparation stay on recipe lines.

For production discovery, obtain a production key from https://www.themealdb.com/api.php and add `THEMEALDB_API_KEY` to Vercel for the intended environments, then redeploy. Keep it server-only. Missing keys and the public development key `1` are rejected in production; recommendations from saved recipes continue working. Local `npm run dev` can use the documented development key. Server requests have a nine-second budget, a six-hour shared cache of public recipes, and a limit of 20 uncached discovery batches per user per hour. Only cuisine and ingredient keywords are sent to the provider. Provider failures fall back to local suggestions.

## Community recipes

Apply `db/006_community.sql` after the earlier migrations. Existing and new recipes are private by default. Open an owned recipe and choose Share publicly, enter a public display name, then Publish recipe. Owners can return it to private at any time or manage it from its community view. Archiving also unpublishes; restoring an archive leaves it private. Saving recipe edits preserves the current visibility.

Community lists public, active recipes with title search, paginated browsing, like counts and comments. Public recipe links use `/?shared=<recipe-id>`. Anyone can read a shared recipe; Neon Auth sign-in is required for likes, comments and saving a private copy. Saved copies belong to the copying user and do not inherit public visibility, private notes or collection membership. Copies already saved remain independent if the original is later made private.

Public responses use an explicit field projection and exclude account identifiers, emails, personal cooking notes, collections, favorites and ingredient-library IDs. Only a chosen public display name is shown. The endpoints enforce ownership for publishing and editing comments; recipe owners may also remove comments on their recipes. Like writes are idempotent, comments are plain text (up to 2,000 characters), and new comments are limited to 30 per user per hour. Public queries recheck visibility, and all responses are private/no-store because viewer permissions and like state vary by session. Publishing and commenting use transaction locks to serialize changes with visibility updates.
