# Supperbook

A personal recipe notebook built with Next.js, Neon Postgres, and Neon Auth, prepared for Vercel and GitHub.

## Development

Use Node 22.17+ (Vercel uses Node 24). Run `npm ci --legacy-peer-deps`, copy `.env.example` to `.env.local`, fill in the three environment variables, and run `npm run dev`. The app opens at http://localhost:3100.

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
