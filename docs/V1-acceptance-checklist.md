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

**Current state:** automated CI has passed on earlier commits; re-check the latest Actions run for the exact current commit before marking this section complete. The real Android Chrome manual section remains not tested.

## B. Android Chrome manual test

Use a real Android phone with Chrome. Check portrait layout first, then landscape if practical.

- [ ] Dashboard loads without a blank screen or visible runtime error.
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
- [ ] Missing quantities/actions/timings are explicitly flagged; no ingredient-to-step mapping or timing is silently invented.
- [ ] Narration includes manual source uncertainties, marks them unverified, and states that no audio, chef animation, nutrition calculation, finished video, or post was created.
- [ ] New recipes start Untested and cannot be approved/shared until a creator enters a trial rating and useful trial notes.
- [ ] Marking a recipe Tested reflects the creator's own cooking trial only; it must not imply independent safety or source verification.
- [ ] Prepare the short-form content pack and confirm it includes five hooks, narration/shot guidance, caption, hashtags, CTA, source, and limitations.
- [ ] Approve the pack explicitly; confirm the share action remains disabled before approval.
- [ ] Edit an ingredient, method, source, serving count, or scene after approval; confirm the recipe returns to Untested and approval resets.
- [ ] Export the content pack and confirm the file is plain text and does not claim to upload or publish.
- [ ] On Android Chrome, manually test the native share sheet where available and confirm choosing/cancelling a destination never causes silent publishing. If unavailable, verify the download fallback.
- [ ] Export Markdown and open the file; check text and order.
- [ ] Export JSON and check the file parses and keeps verification flags false.
- [ ] Import a valid JSON backup and confirm its recipe details restore.
- [ ] Import a legacy V1 JSON backup and confirm missing fields default safely.
- [ ] Import malformed JSON and a JSON draft with a `javascript:` URL; confirm it is rejected without adding a project.
- [ ] Reorder two cooking steps and confirm tutorial preview/export preserves the new order.
- [ ] Copy action either works or presents a useful fallback message.
- [ ] Reload the page; saved drafts restore on the same browser/device.
- [ ] Delete one test draft and confirm the other drafts remain.
- [ ] Clear-all requires confirmation and explains the action.
- [ ] Check that buttons, fields, messages, and long recipe names fit the screen and remain usable with the on-screen keyboard.
- [ ] Confirm there is no claim that the source URL was analyzed, nutrition calculated, video generated, or post published.
- [ ] Remove the test recipe after collecting results.

Do not enter private passwords, API keys, real personal information, or valuable recipes during testing. Export important work before clearing browser data.

## C. Data and recovery checks

- [ ] Create, edit, reload, export, and delete a draft.
- [ ] Verify invalid or older local-storage data does not crash the app; confirm any skipped-data warning is understandable.
- [ ] Confirm storage-full/unavailable messaging is visible where it can be reproduced.
- [ ] Confirm an exported draft can be kept independently of browser storage.
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

## E. V1 feature honesty / release blockers

The following are **not implemented or not verified** in the current prototype and must remain clearly labelled as such:

- Video-link fetching, transcription, or visual frame analysis.
- Evidence-backed multi-source recipe comparison.
- Verified food-safety/allergen checks.
- Nutrition calculation from ingredient quantities.
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
