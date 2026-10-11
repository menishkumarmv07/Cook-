# V1 Acceptance Checklist — Cooking Creator Studio

**Purpose:** prove the current V1 prototype is dependable before adding video generation, databases, or publishing integrations.

**Status key:** Not tested · Pass · Fail · Blocked. Do not mark a test Pass from code inspection alone.

## A. Automated checks

Run npm run check from the repository root. This runs the test suite, ESLint, TypeScript checking, and the Next.js production build in sequence.

- [ ] Unit tests pass.
- [ ] ESLint passes with no errors.
- [ ] TypeScript check passes.
- [ ] Production build passes.
- [ ] GitHub Actions result is green for the exact commit being reviewed.
- [ ] Record commit SHA, run URL, date, and any warnings.

**Current state:** configured; this checklist does not claim any of these checks have passed. CI must confirm the result.

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
- [ ] Tutorial preview preserves ingredient and step order and clearly says it is a draft.
- [ ] Export Markdown and open the file; check text and order.
- [ ] Export JSON and check the file parses and keeps verification flags false.
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
