# Verification record

Latest review: October 30, 2026 (America/Los_Angeles).

## Signed-in commenting — 2026-10-30

Verified the live community API without cookies or credentials: creating a comment, posting a reply and editing a comment each returned HTTP 401 with the application sign-in error. Requests targeted a nonexistent recipe/comment ID and created no records. The existing server session gate remains authoritative. Guest controls now explicitly read Sign in to reply, the main notice states that comments and replies require sign-in, and edit/remove/restore controls also require the current signed-in state. Public recipe and discussion reading remains available.

## Replies, mentions and notifications — 2026-10-30

Applied `db/007_threads_notifications.sql`. Replies have a same-recipe parent foreign key and a trigger that permits one reply level only. Public participant IDs are random profile identifiers, separate from authentication IDs. New mention, notification and preference tables have RLS enabled; all endpoints validate Neon Auth sessions and scope account operations to the session user.

All 36 automated tests pass, including whole-name mention matching, overlapping names (including first-name versus full-name collisions), tombstone privacy and reply projection. The rollback-only database suite `db/tests/threads_notifications.sql` passed against Neon and confirmed zero committed fixtures. It exercises self suppression, idempotent likes, the master switch, comments/replies and mention switches, parent-author delivery, mention priority without duplicate alerts, thread-only recipients, nesting rejection, retained replies after parent removal, private-recipe suppression and the JSON recipient insert used by the server. No real account received those fixture alerts.

Preview `dpl_CobdCacaTnWL8AUUoWYJaxquo3yo` passed the clean install, 35 tests, TypeScript and production build. The previously authorized review account verified the real inbox, individual settings persisting after reload, the master switch disabling channel controls, a saved reply beneath the existing parent, and a second post from the main form appearing as a separate parent. Preferences were restored to enabled, the test recipe was returned to private, and the account was signed out. The original meal plan still contains two meals. Generic test posts remain attached to the private test recipe.

Preview `dpl_AFMz6d9qeoh6DabDRx4kXPvdizwe` passed the same clean checks and included a preview-only component fixture route. It verified choosing Cedar and Maple from a thread picker, two highlighted mentions in a single flat reply with the original parent ID, marking an inbox as read, and navigation to the matching recipe/thread. A 390 × 844 review showed no horizontal overflow in the replies or inbox; the viewport was reset. Browser warning/error logs were empty on that fixture. The fixture route is not in the repository or production release.

A second account was not created; the optional authorization question did not receive a specific approval. Cross-account delivery was checked through the actual database functions inside rolled-back test transactions, while browser checks used the existing authorized account and synthetic participants. Later source refinements preserve mention labels through display-name changes and wrap long participant names and recipe titles. Notifications are in-app only, refresh while visible and on focus, and include individual/master controls under Notification preferences.

## Community update — 2026-10-30

Applied additive migration `db/006_community.sql`. All five existing recipes remained private; no existing recipe or account was opted into public sharing. The three community tables have RLS enabled, foreign keys cascade from permanently deleted recipes, and community reads/writes remain server-only.

The first preview `dpl_2fzwYbEPuqC1rrEZRFfjGuVLwxYg` passed a clean install, 30 tests, TypeScript and the production build. Browser verification used only the previously authorized kitchen-review test account in the protected preview. Its authored pasta recipe was temporarily shared as Review kitchen, liked, and given a generic cooking note. The comment persisted and was edited successfully. The removal confirmation was opened and canceled; no permanent deletion was performed. The like was cleared and the recipe made private again before release.

Signed-out browsing opened the copied public link and showed the shared recipe and its edited comment, with no edit/remove controls. Saving a private copy requested sign-in; signing in preserved the selected public recipe. The actual anonymous API JSON omitted personal notes, collections, account identifiers, emails and internal ingredient references. Unpublishing removed the recipe from the feed, returned a no-longer-public error from the public API, and removed its content from a freshly loaded shared link. The original meal plan and recipe contents were retained. The test comment remains attached to the private test recipe and is hidden.

A 390 × 844 review of the actual shared recipe and comment form found no horizontal overflow; both fields fit inside the viewport. The temporary viewport override was reset. Public source/photo links remain visible, and no generated imagery was introduced.

The final preview `dpl_8z27772gjszYv9ZUVk3JV7X2WKz3` passed all 31 tests, TypeScript and the clean production build. Browser checks confirmed Manage your recipe opens the owned visibility controls, signing out replaces the comment form with Sign in to comment, and the public API emits full microsecond ISO timestamps. The test recipe was made private and the test account signed out again.

The final source also gates the comment form before sign-in, offers owner management from the public view, explains that saved copies remain independent, and preserves PostgreSQL microseconds in pagination cursors so adjacent records are not skipped. Five community tests exercise the public field boundary, compact feed payloads, comment identity filtering, cursor validation and timestamp precision (31 total regression tests). Two-account interaction was not exercised; cross-user write restrictions are enforced in the authenticated SQL predicates and public permission flags.

## Recommendation update — 2026-10-29

Applied additive migration `db/005_recommendations.sql` to the existing Neon database. Personal preference, feedback and planning queries are authenticated and scoped to the current user. Provider provenance has a composite ownership foreign key and per-user provider-recipe uniqueness. New tables have RLS enabled; database access remains server-only.

The first strict preview, `dpl_46hmekGKXiybYMjQ1SxQSQqEVF46`, passed a clean install, 24 tests, TypeScript and the production build. Its authenticated browser checks confirmed cuisine/time/skipped-ingredient preferences survive reload, whole-ingredient exclusions work, positive feedback is reflected in explanations, dismissal hides a recipe, Undo preserves a prior like, and Add to meal plan removes the suggestion while updating shopping. Preferences and feedback were restored through the UI.

Development review deployment `dpl_3QsofKUsQhTX4WTdPzjqRRsfDCfv` passed 25 tests, TypeScript and the production build. It used the documented TheMealDB development key only in that isolated source-file preview; the repository and production provider reject test key 1. With explicit user authorization, the existing dedicated review account signed in. External discovery loaded real provider records, photos, attribution and shopping-overlap explanations. No personal account was accessed.

A Banana Pancakes discovery was reviewed and saved to the test account through the actual editor and API. Empty servings triggered native required-field validation. Servings were entered as 2, time remained unknown (stored as 0), cuisine and preparation were edited, and Oil was matched to existing Olive oil. Four common missing ingredients were added through the library check; Baking Powder correctly offered similar Baking soda before a distinct ingredient was selected. The database confirmed one owned provider source (TheMealDB 52855), seven separate measured ingredient lines and the edited fields.

Adding this recipe to the plan produced 16 shopping rows, with banana/egg counts, 125 g raspberries, 25 g pecans, 10 tsp combined oil and the original 300 ml milk. Archiving the test import restored the original two active meals and 11 shopping rows. The archived provider recipe no longer appeared in Discover. The test recipe remains archived; no permanent deletion was performed.

A 390 × 844 responsive review found no horizontal overflow and showed stacked, usable preference inputs. The viewport was reset. Browser error/warning logs were empty before and after account checks. All 26 local tests pass. Later source refinements balance results across provider searches, normalize country-shaped cuisine labels, clear stale feedback notices and place unknown cooking times last in Quickest first. These have regression coverage where appropriate.

Production external discovery requires `THEMEALDB_API_KEY` and a redeploy. The key was absent at the last environment-name check; saved-recipe recommendations work without it. Local dependency extraction remains incomplete, so clean Vercel compilation is the authoritative TypeScript/build result. Earlier entries below are historical verification records and their limitations are superseded by later checks.

## Initial review — October 25, 2026

## Provisioned resources

- Neon project: `mute-moon-34257764` (Supperbook), AWS Oregon, `main` branch `br-curly-grass-aki9bgto`, database `neondb`.
- Neon Auth: enabled with Better Auth. Email/password sign-up and sign-in are enabled. Exact localhost and preview origins are allowlisted.
- GitHub: private repository https://github.com/joyceful-lee/supperbook, source pushed to `main`.
- Vercel: `supperbook`, project `prj_EGANTuvF56cZWtCsueD92KCrnBDg`, team `leejoyce21-7656`.
- Reviewed preview: https://supperbook-iqq720eu2-leejoyce21-7656.vercel.app (deployment `dpl_5LYBhHKFRwaDRAgg6eZC7KZZJdkk`). This is a source-file preview, not an automatically connected Git deployment. Vercel Authentication protects previews.

## Confirmed

- The cloud production build compiled, passed TypeScript, generated pages, and deployed both server routes successfully.
- The final build detected Next.js 16.4.3 and reported `found 0 vulnerabilities` after installing 226 packages. Zod 4.6.7 is pinned directly and through an override for the Neon SDK's transitive dependency copies.
- All five domain tests passed: ingredient normalization, fraction parsing, serving-scaled aggregation with incompatible unit separation, private-network address rejection, and malformed/executable URL rejection.
- The desktop recipe collection rendered with Instrument Serif and DM Sans, warm paper and olive colors, food photography, recipe cards, collections, and planning controls. Browser error/warning collection was empty during that review.
- Neon email/password sign-in succeeded through the app with a dedicated review account.
- Adding the pasta starter to the meal plan saved a new user-owned recipe. A direct database read confirmed six separate recipe-ingredient rows and the authenticated review user's ID.
- Changing the plan from two to four servings displayed 1,000 g tomatoes, 400 g pasta, six garlic cloves, and 60 g Parmesan. The checklist count changed when Basil was checked.
- Importing https://www.bbcgoodfood.com/recipes/easy-pancakes populated an editable draft with its title, yield, timing, image, source, six ingredient lines, and five method steps. The draft was not automatically saved.
- A database trigram query for `garlic clove` returned the existing Garlic ingredient with similarity 0.538. Exact-name uniqueness is enforced in the database, and the API returns a conflict with candidates before allowing a distinct similar ingredient.
- The preceding patched preview's `/api/auth/get-session` returned HTTP 200 with `null` for an unauthenticated request.

## Review fixes

- Starter copies receive fresh recipe IDs so users do not collide on a shared example ID.
- Removing a recipe also removes it from that user's persisted meal plan and clears stale checklist selections.
- Hero copy now reads as one sentence. The app contains no AI promotional copy or emoji graphics.
- The decorative sidebar note is hidden on short screens so account controls stay visible.
- The meal-plan question heading does not receive a second punctuation mark.
- Next.js and Zod were upgraded after the initial dependency audit reported published vulnerabilities.

## Limits and remaining work

- Browser automation timed out during the imported-recipe editing interaction. Saving edits to that imported draft, the ingredient conflict dialog, a complete mobile browser pass, and a full post-upgrade sign-in pass were not completed in the browser. The server build, route availability, domain tests, database records, and earlier sign-in/meal-planning behavior are independently confirmed above.
- Local package extraction stalled both in the synced workspace and a temporary build folder. Cloud builds were used as the authoritative compilation and TypeScript checks. A reproducible package lock and npm configuration are included; local `node_modules` may require a fresh `npm ci`.
- One test-only account (`kitchen-review-20261025@example.invalid`) remains in Neon with its own private pasta recipe and meal-plan state. No personal user's recipes were created or modified. Test credentials and scripts are ignored by Git.
- The user approved the persistent GitHub connection. Vercel confirms that the existing `supperbook` project is linked to `joyceful-lee/supperbook`. A Git-sourced production deployment of commit `9bcc9d702232c14eccdfe9ea792706c70093d6c0` reached READY in `pdx1` (deployment `dpl_Fr3KXdWr7g4BfrqM3hKE8V8CzNqb`). Pushes to `main` deploy automatically, using `npm ci`, five tests, TypeScript, and the Next.js production build.
- Production is deployed at https://supperbook.vercel.app. Vercel Authentication remains enabled. New preview URLs must be added to Neon Auth trusted origins before testing sign-in there.

## Sources used for dependency corrections

- https://github.com/advisories/GHSA-2464-fhr4-w9xw
- https://github.com/advisories/GHSA-mrhx-c7xc-m3w5


## Recipe-management update

The additive migration db/002_recipe_management.sql has been applied. Collections are now independently saved, user-owned records, with case-insensitive unique names. Existing recipe collections were backfilled without removing data.

Browser verification on the updated preview confirmed: sign-in, creating an empty collection, renaming it, assigning a recipe to it, renaming the populated collection and observing the recipe update, and opening its filtered view. Archiving removed the review recipe from active recipes and cleared its meal/shopping state; restoring returned it. Both deletion confirmation dialogs were reviewed and cancelled; permanent deletion was not executed during QA. Deleting a collection is implemented transactionally to keep its recipes in Unfiled.

The original-URL import button was tested against the BBC Good Food easy-pancakes page. It populated title, description, yield, timing, image, ingredients, and method. The imported title remained editable, and the existing recipe identity, collection, and cooking notes were preserved. The imported draft was cancelled; a separate saved collection edit was confirmed in the database. The import control was then moved to the top of the editor for short-screen visibility.

All eight domain/regression tests passed. The cloud preview build passed the test suite, TypeScript and production compilation. Local typechecking remains limited by an incomplete lucide-react dependency extraction in this workspace; the clean cloud install provides the authoritative build result.

Photo provenance: starter photos are existing images served by images.unsplash.com, with visible credits and source links. Imported photos use the image URL supplied by the recipe publisher. Supperbook does not generate images and does not claim to certify arbitrary third-party images as non-AI.

## Collection, planning and export update — 2026-10-25

Migration db/003_meal_order_ingredient_names.sql was applied to Neon. Six existing library names were capitalized; a subsequent audit found zero remaining mismatches. The browser added lowercase milk as Milk, preserving the library duplicate/similarity check.

Preview dpl_9JK9s47WQim3zLh55yN6wcXXXsYb passed all 13 tests, TypeScript and the clean production build. Added tests cover casing, custom meal order, compatible spoon units, and shared/exported list and plan contents. Local typechecking is still limited by incomplete parent-workspace TypeScript packages; the cloud build is authoritative.

Browser checks confirmed the requested collection hero and copy were removed. Importing the BBC Good Food pancake recipe offered three publisher image variants. Selecting the third changed the photo URL; saving the editable draft persisted that URL in the recipe detail. The import screen no longer includes the removed photo-generation statement.

A second private recipe was saved only to the dedicated review account. Dragging the first meal below the second reordered the plan; accessible move buttons also worked. The order survived reload. Shopping retained grams, tablespoons, whole egg counts and the recipe's milliliters for milk. Copy plan and Copy text displayed success feedback. Native sharing opens the device's sharing flow; no recipient was chosen and no messages were sent during QA.

TXT, PDF and Word downloads completed through browser download controls. The Word file was a valid OOXML ZIP with all 11 shopping rows and 3 tbsp oil. The one-page PDF was parsed and rendered with Poppler: its quantities and full checklist were present and legible. Mobile review at 390 × 844 confirmed readable meal cards, usable move controls and an export menu inside the viewport. The viewport override was reset afterward.

The authored cookbook SVG favicon is served through Next.js app/icon.svg. PDF and Word generation libraries are dynamically imported only when those export formats are requested.

## Exit protection and completed shopping rows — 2026-10-25

Removed the shared page footer. Shopping rows now sort unchecked items ahead of checked items within each category, preserving the existing alphabetical order within each group. Browser review checked Basil and confirmed it moved below Lemon in Produce; unchecking restored its position. The test checklist was restored.

The recipe editor now asks through an in-app Keep editing / Discard changes dialog when closed through Cancel, the close button, Escape, the backdrop, in-app navigation or browser Back. Nested ingredient-dialog Escape closes only that dialog. A beforeunload listener requests the browser's native warning for refresh, tab close and document navigation. Saving exits directly and removes the guard.

Preview dpl_DAyo9A5hXhU5q3t3mBXUnBWY9Zxb passed the 13 regression tests, TypeScript and the production build. Browser checks exercised close, Cancel, Escape and Back. Repeated Keep editing actions preserved edited cooking notes. The temporary notes were restored to their original value before saving the review recipe. Saving closed the editor, and a subsequent reload did not show a warning. The footer is absent from the rendered page. Native beforeunload behavior is installed in source; its prompt wording and display are controlled by the browser.

## Multiple collections and sortable meals — 2026-10-26

Applied the additive db/004_recipe_collections.sql migration. All four existing saved recipes retained their collection membership. The join table has composite foreign keys tying both recipe and collection to the same user, plus RLS. Saves update memberships transactionally; renames resolve through collection IDs, and removing a collection preserves other memberships.

Browser verification on the first preview confirmed the sidebar collapses independently, ingredient sections begin collapsed, expanding and collapsing works, and search reveals matching ingredients. The review-account pancake recipe was saved to two collections. Both sidebar filters displayed it, their counts updated, and the database confirmed one recipe row with two memberships. The Collections sort option was selected successfully.

Native browser dragging proved unreliable when DOM rows were moved during the drag, so the final implementation uses @dnd-kit/sortable. The meal list loads this component on demand. Pointer, touch and keyboard sensors use sortable transforms to shift neighboring rows before committing on drop. Recipe titles appear in screen-reader announcements and reduced-motion preferences are respected.

The final preview dpl_2BStzz5SUJQMY8ESFHYxMWzmz5Rf passed all 15 regression tests, TypeScript and the production build. Its preview-only interaction-review route uses synthetic recipe fixtures and is not present in the repository or production deployment. On that route, keyboard dragging displaced adjacent rows in the DOM presentation (the next row moved up 130px while the active row moved down 130px). Dropping updated the saved order. Pointer dragging moved a recipe from first to third. Escape canceled a subsequent drag without changing saved order. Browser error and warning logs were empty. A phone-width layout check was performed and the viewport reset.

An additional review-account sign-in was rejected by automatic approval review because explicit authorization for that credential pair was missing. It was not retried; final sortable interaction checks used synthetic recipes without accessing an account. Prior successful collection checks and database confirmation are recorded above. No permanent deletions were executed during verification.

## Collection dropdown and tile shortcut — 2026-10-26

Replaced the editor's inline collection checkboxes with a shared searchable multi-select dropdown. It supports multiple selections, creating and selecting a collection, selected-count feedback and Escape/outside-click dismissal. Enter in its inputs does not accidentally submit the recipe form.

Recipe cards expose Add to collection on hover or keyboard focus, and show it persistently on touch/coarse-pointer devices. The tile dropdown stages selections until Save collections, retains selections on server errors, and saves only collection membership through the authenticated setRecipeCollections action. The action checks ownership before mutation, validates names, and transactionally updates memberships and the legacy primary collection. It does not rewrite title, ingredients, notes, servings or archive state.

Preview dpl_5dkakiBg7gsq4CMfV3iY7BuR9mBK passed all 15 regression tests, TypeScript and the production build. A preview-only fixture page tested the actual shared component with synthetic recipes and no account sign-in. Browser checks selected multiple collections, filtered names, added a new name with Enter, confirmed the recipe form submission count stayed zero, and closed with Escape. The tile dropdown committed three selections through its save callback. Dismissing an unsaved change by clicking outside restored the saved selection on reopening. At 390px viewport width the popup stayed within the screen; the viewport was reset. Browser errors and warnings were empty. The fixture route is not in the repository and will not be deployed to production.
