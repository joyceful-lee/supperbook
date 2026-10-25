# Verification record

Reviewed October 25, 2026 (America/Los_Angeles).

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

