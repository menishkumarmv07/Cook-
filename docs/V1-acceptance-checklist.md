# V1 Acceptance Checklist — Cooking Creator Studio

**Purpose:** prove the current V1 prototype is dependable before adding video generation, databases, or publishing integrations.

**Status key:** Not tested · Pass · Fail · Blocked. Do not mark a test Pass from code inspection alone.

## A. Automated checks

Run npm run check from the repository root. This runs the unit tests, ESLint, TypeScript checking, and production build. GitHub Actions additionally installs Chromium and runs `npm run e2e` against the production build.

- [ ] Unit tests pass.
- [ ] ESLint passes with no errors.
- [ ] TypeScript check passes.
- [ ] Production build passes.
- [ ] Playwright desktop browser workflow passes (create/edit/reorder/reload/export and JSON import safety cases).
- [ ] Playwright mobile-sized layout check passes without horizontal overflow.
- [ ] GitHub Actions result is green for the exact commit being reviewed.
- [ ] Record commit SHA, run URL, date, and any warnings.

**Current state (12 October 2026):** GitHub Actions run #79 passed on main commit `42d7e60dbc32b59579857b3c61af5a19a59b01d7`: [run #79](https://github.com/menishkumarmv07/Cook-/actions/runs/38170646309). Re-check the latest Actions run for the exact reviewed commit before marking this section complete. The real Android Chrome manual section remains not tested.

## B. Android Chrome manual test

Use a real Android phone with Chrome. Check portrait layout first, then landscape if practical.

- [ ] Dashboard loads without a blank screen or visible runtime error.
- [ ] Save a creator profile with tone, language, cuisine, units, platforms, never-say list, and sample captions; reload and confirm it persists.
- [ ] Prepare a content pack and confirm profile guidance appears without claiming automatic translation or AI review.
- [ ] Export JSON and confirm the creator profile is included; import the backup and confirm the profile restores.
- [ ] Manifest route returns valid PWA metadata and app icon.
- [ ] After one successful online visit and service-worker activation, reload in offline mode and confirm the cached app shell opens.
- [ ] From Android Chrome, use the browser menu's Install app / Add to Home screen option if offered; verify the installed icon and standalone launch. Record if Chrome does not offer installation.
- [ ] Open the hamburger navigation drawer, use its close button and Escape key, and confirm keyboard focus returns to the menu trigger; verify the drawer traps/contains focus as designed.
- [ ] Quick-action tiles (Today's Plan, Research & Trends, Content Studio, Publish) navigate to the intended existing sections; no unavailable feature should appear operational.
- [ ] Switch between light and dark appearance, reload, and confirm the selected theme persists locally.
- [ ] A fresh creator profile defaults to English and US customary units; Metric and both-unit preferences remain selectable. Existing saved preferences must not be silently overwritten.
- [ ] Main navigation links scroll to the correct sections.
- [ ] Recipe name is required; empty name shows a clear message.
- [ ] Blank optional source URL is accepted.
- [ ] Valid HTTP(S) URL is accepted; malformed URL and non-HTTP(S) protocols are rejected.
- [ ] Create a recipe named "Test recipe — do not publish", with a test URL and notes.
- [ ] Add at least three ingredients with quantities/units and preparation notes.
- [ ] Add at least three ordered cooking steps with timings, heat cues, and doneness cues.
- [ ] Edit all six scene titles/details/timings.
- [ ] Validation warnings remain visible for unverified source, food safety, and nutrition.
- [ ] Add two structured source references (for example, a recipe page and a video/Reel); record what was actually checked and any differences/uncertainty.
- [ ] Confirm duplicate source URLs are warned about, invalid source URLs are errors, and distinct case-sensitive paths/query strings are not incorrectly treated as duplicates.
- [ ] Reload and confirm source reference records persist.
- [ ] Tutorial preview/export includes each source reference and explicitly says manual notes are unverified; it must not claim automated link/video analysis.
- [ ] Tutorial preview preserves ingredient and step order and clearly says it is a draft.
- [ ] Narration preview/copy/export preserves ingredient and cooking-step order and uses recorded timings, heat settings, and visual cues only.
- [ ] Missing quantities/actions/timings are explicitly flagged. Ingredient additions are spoken only when explicitly mapped; all unassigned ingredients require a creator check before recording.
- [ ] Narration includes manual source uncertainties, marks them unverified, and states that no audio, chef animation, automatic nutrition database lookup, finished video, or post was created. If a manual nutrition worksheet is complete, its estimate and the manual/unverified disclaimer must appear.
- [ ] New recipes start Untested and cannot be approved/shared until a creator attaches a real-dish photo, enters a trial rating, and records useful trial notes.
- [ ] Confirm trial photo is resized in-browser, previewed, stored locally, included in JSON backup, and never uploaded automatically.
- [ ] Marking a recipe Tested reflects the creator's own cooking trial only; it must not imply independent safety or source verification.
- [ ] Prepare the short-form content pack and confirm it includes five hooks, narration/shot guidance, caption, hashtags, CTA, source, and limitations.
- [ ] Approve the pack explicitly; confirm the share action remains disabled before approval.
- [ ] Edit an ingredient, method, source, serving count, or scene after approval; confirm the recipe returns to Untested and approval resets.
- [ ] Export the content pack and confirm the file is plain text and does not claim to upload or publish.
- [ ] On Android Chrome, manually test the native share sheet where available and confirm choosing/cancelling a destination never causes silent publishing. If unavailable, verify the download fallback.
- [ ] Export Markdown and open the file; check text and order.
- [ ] Export JSON and check the file parses and keeps verification flags false.
- [ ] Import a valid single-recipe JSON backup and confirm its recipe details restore without silently replacing other drafts.
- [ ] Import a legacy V1 JSON backup and confirm missing fields default safely.
- [ ] Export all drafts and confirm the workspace JSON archive contains every current draft plus the creator profile, format/version metadata, and no upload/share side effect.
- [ ] Restore a valid workspace archive; confirm the prompt accurately warns that all current local drafts/profile will be replaced, then confirm restoration restores all archived recipes and profile fields.
- [ ] Cancel a workspace restore and confirm current drafts and profile remain unchanged.
- [ ] Try a corrupted/wrong-version workspace archive and an archive containing an unsafe URL; confirm the archive is rejected atomically with no partial restore.
- [ ] Try a backup above the file-size or estimated storage guard; confirm no existing data is replaced and the message explains the limitation.
- [ ] Import malformed JSON and a JSON draft with a `javascript:` URL; confirm it is rejected without adding a project.
- [ ] Reorder two cooking steps and confirm tutorial preview/export preserves the new order.
- [ ] Copy action either works or presents a useful fallback message.
- [ ] Reload the page; saved drafts restore on the same browser/device.
- [ ] Delete one test draft and confirm the other drafts remain.
- [ ] Clear-all requires confirmation and explains the action.
- [ ] Check that buttons, fields, messages, and long recipe names fit the screen and remain usable with the on-screen keyboard.
- [ ] Confirm there is no claim that a source URL was analyzed, nutrition values were automatically retrieved/verified, a video was generated, or a post was published. Manual nutrition arithmetic must be disclosed as user-entered and unverified.
- [ ] Remove the test recipe after collecting results.

Do not enter private passwords, API keys, real personal information, or valuable recipes during testing. Export important work before clearing browser data.

## C. Data and recovery checks

- [ ] Create, edit, reload, export, and delete a draft.
- [ ] Verify invalid or older local-storage data does not crash the app; confirm any skipped-data warning is understandable.
- [ ] Confirm storage-full/unavailable messaging is visible where it can be reproduced.
- [ ] Confirm an exported single draft and a full workspace archive can be kept independently of browser storage.
- [ ] Confirm a full workspace restore requires confirmation, assigns fresh local draft IDs, and does not claim to add cloud sync.
- [ ] Confirm clearing browser storage is documented as destructive and that drafts are device/browser-local only.

## D. Deployment checks (only after a Vercel project is found and linked)

- [ ] Confirm the Vercel project points to menishkumarmv07/Cook- and the intended branch/root directory.
- [ ] Confirm the deployment commit SHA matches the reviewed GitHub commit.
- [ ] Confirm build status is Ready, not merely queued or building.
- [ ] Open the deployment URL in Android Chrome and repeat the critical create/edit/export/reload path.
- [ ] Check browser console and network failures where tools permit.
- [ ] Confirm the app does not expose secrets, private character assets, or source data.
- [ ] Confirm the deployed environment is private or otherwise appropriately access-controlled before storing anything sensitive.
- [ ] If no matching Vercel project/deployment is visible, mark Blocked and request the project link or correct project name; do not claim deployment success.

## Nutrition worksheet manual checks

- [ ] Legacy drafts without nutrition fields still load; missing optional values default to blank.
- [ ] Every ingredient requires calories for the exact amount used, a matching amount/preparation basis, a valid HTTP(S) source URL, and a non-empty ingredient name/amount/unit before per-serving calories are shown.
- [ ] Blank, negative, non-numeric, or invalidly sourced values do not produce a misleading total.
- [ ] Ambiguous/non-positive serving counts show no calories-per-serving result; no portion count is guessed.
- [ ] Protein/carbohydrate/fat are shown only when each ingredient has a valid sourced value for that macro; incomplete macros are clearly marked.
- [ ] Tutorial and narration exports include the manual estimate only when complete and disclose that the app does not fetch or independently verify nutrition data.
- [ ] The UI states that it does not automatically convert units or infer whether a nutrition reference matches a raw/cooked/prepared ingredient.

## Ingredient-to-step mapping checks

- [ ] Assign an ingredient to a specific step and confirm the narration names the exact recorded amount, unit, ingredient, and prep note at that step.
- [ ] Confirm unassigned ingredients are flagged; generated text tells the creator to resolve them instead of guessing.
- [ ] Remove an ingredient and confirm its ID is removed from all step mappings.
- [ ] Confirm old drafts and JSON exports without ingredient mappings still import; unknown imported ingredient IDs are cleared.
- [ ] Confirm a mapped ingredient missing its amount, unit, or name is flagged as not ready to record.

## E. V1 feature honesty / release blockers

The following are **not implemented or not verified** in the current prototype and must remain clearly labelled as such:

- Video-link fetching, transcription, or visual frame analysis.
- Evidence-backed multi-source recipe comparison.
- Verified food-safety/allergen checks.
- Automatic nutrition lookup/calculation from food-composition data and ingredient unit conversions. The V1 worksheet only sums manually entered values for the exact recorded ingredient amounts and requires creator-checked source links/basis.
- Chef-character animation, voice/lip-sync, actual video rendering, and final tasting scene.
- Cloud database, secure owner authentication, backups, and multi-device sync.
- Social account authorization, scheduling, publishing, platform analytics, and monetization integrations.

Do not describe V1 as finished until the automated checks and Android manual acceptance pass are recorded. Do not begin automatic publishing until a real generated video passes the owner review and the destination platform confirms the authorized post.

## F. US-first product checks for later phases

- [ ] US audience settings are explicit; time zone is stored with each schedule and not inferred silently.
- [ ] Recipes from any cuisine remain supported.
- [ ] Platform capabilities and monetization eligibility are checked against official current documentation before implementation.
- [ ] Publishing uses supported official integrations and explicit account authorization; no scraping private content or bypassing platform limits.
- [ ] Captions, recipe name, source/rights notes, and any required disclosures are reviewed per platform.
- [ ] No promise of viral reach or guaranteed income.

## Test record template

- Date/time:
- Reviewer/device/browser:
- Commit SHA:
- Automated result (test/lint/typecheck/build):
- Android critical path result:
- Vercel project/deployment URL and status (or Blocked reason):
- Defects found:
- Fix commit(s):
- Retest result:
- Remaining known limitations:
