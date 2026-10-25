# V3 Build Log — Cooking Creator

> Project: `menishkumarmv07/Cook-` only. Keep this separate from App Market/MV and GKworks.
> Branch: `v3/ai-chef-content-studio`.
> Base: verified V2 main `5d0da951e2a73c5098ba82308f23438556b3f80c`.
> PR: [#83 — V3: AI Chef Studio, local media and owner-footage render foundation](https://github.com/menishkumarmv07/Cook-/pull/83), draft/open/unmerged.
> Log policy: record only observed actions and exact CI outcomes. A green documentation run is not a feature test. Do not claim a real video rendered until a real playback test confirms it.

## Hard constraints

- ₹0/no-card/no-mandatory-paid-provider; no paid APIs, credits, hidden paid fallback, or surprise external upload.
- The app is owner-controlled and local-first. The repository is public during active development by prior decision; never commit original chef/kitchen reference images, private audio, secrets or credentials.
- Preserve V1/V2 behaviour and test it on every candidate commit.
- Use only the actual owner-approved male-chef/kitchen references when supplied; do not invent details.
- A scene blueprint, storyboard, metadata bundle, or pan/zoom slideshow is not a realistic generated video.
- AI-generated video remains **NOT TESTED / NOT ENABLED** until a current provider meets cost, no-card, regional access, reference support, commercial rights and privacy requirements and actual clips pass visual review.

## Current implemented work

### V3.0 — Baseline and interface inventory
- Based work on the verified V2 main commit listed above and an isolated V3 branch; the main application branch is unchanged by V3 feature work.
- The V2 baseline exact-main Actions run #589 passed 137/137 unit tests, ESLint, TypeScript, production build, owner-auth smoke 10/10 and desktop/mobile E2E 96/96.
- Confirmed relevant V2 interfaces are local recipe storage, creator profile, Research Studio evidence archive, recipe-trial/approval lifecycle and source-traceable content pack.

### V3.1 — Deterministic recipe blueprint
- Added `lib/v3-content-blueprint.ts` and focused tests.
- Creates ordered opening, ingredient, cooking-step and closing scenes from an existing V2 recipe and optional research archive.
- Each factual scene has recipe/ingredient/step trace links. Missing amounts, units, actions, times, heat, visual cues and source conflicts stay unknown/warned; unreviewed/rejected claims are not added as facts.
- Pins recipe/profile/evidence input SHA-256 fingerprints. Backup import checks structure and fingerprints, bounds input size and migrates early unreleased blueprint schema/timing fields without inventing values.
- Manual scene edits remain drafts; they do not update the evidence snapshot or certify factual correctness.

### V3.2 — Chef & Kitchen Bible and local reference storage
- Added `lib/v3-continuity.ts`, tests, and a local reference-library UI.
- JPEG/PNG/WebP files are checked for declared MIME, extension, signature, decoding, dimensions, size and SHA-256 before being saved to IndexedDB.
- Reference roles include chef identity/wardrobe, kitchen-wide/detail, cookware/prop and finished dish.
- Imported references begin NOT REVIEWED; only the owner can mark one approved. Bible edits increment its version and clear old visual-review states.
- Actual chef/kitchen refs are not in the Git repository. Visual realism remains NOT TESTED until the real originals and real clip outputs are compared.

### V3.3 — Manual caption timeline and subtitle export
- Added `lib/v3-captions.ts`, tests and UI for explicit global-video start/end times.
- Exports real SRT and WebVTT files only with valid non-overlapping manually entered timing.
- Escapes subtitle text and rejects missing/invalid timing; V3 does not estimate speech timing when no audio transcription/word timing has been tested.

### V3.4 / V3.5 — Media preflight and owner-footage renderer foundation
- Added `lib/v3-rendering.ts`, `lib/v3-owner-footage-renderer.ts`, and preflight tests.
- Local video/audio imports are subject to per-file/library limits, extension+MIME+signature checks and actual browser decoder checks. SHA-256 is verified before rendering.
- Every video scene must point to a real video file and explicit trim range; every scene must be owner-reviewed; narration must be rights-cleared; captions must be timed. Unsupported or missing sources block render instead of becoming a fake scene.
- Renderer target is a portrait 720×1280 WebM from local footage with narration and subtitle overlays using the browser MediaRecorder/canvas path. The downloaded output must decode/play and pass duration/dimension checks and SHA-256 calculation.
- User must explicitly review the preview before download; the output is labelled **owner-footage edit, not AI-generated footage**.
- The renderer code path and UI exist, but target-device performance, actual output playback, audio synchronisation and cancellation still require exact-head browser runs and owner Android acceptance. Never claim a real successful render until those tests show it.

### Workspace integration
- Added the dedicated **AI Chef Studio** screen with minimal V1/V2 navigation change.
- Uses V2 saved recipes/profile and the existing Research Studio evidence archive as read-only sources.
- V3 projects, reference images, video and narration files stay in browser IndexedDB; revision checks reject stale-tab overwrites.
- JSON blueprint restore adds a new project, validates the source fingerprints and resets scene approvals. It does not overwrite the original V2 recipe or restore approvals blindly.

## Tests added

- `tests/v3-content-blueprint.test.ts`: deterministic scene mapping, unknown/missing facts, rejected/unreviewed evidence, fingerprint changes, bad URLs and references, invalid/oversized data, backup integrity and schema migration.
- `tests/v3-captions.test.ts`: SRT/WebVTT format, timecodes, missing/reversed/overlapping timings, escaping and text bounds.
- `tests/v3-continuity.test.ts`: reference metadata validation, Bible versioning, review reset and hard-fail visual criteria.
- `tests/v3-rendering.test.ts`: clip/media presence, owner approval, rights, trim bounds, narration alignment, caption timing and metadata validation.
- Added a Playwright flow in `e2e/recipe-studio.spec.ts` for creating a V2 recipe, creating a V3 blueprint, saving captions and downloading SRT/JSON backup. Record its exact CI result below only once that workflow completes.

## Known incomplete work / release gates

1. Confirm current exact-head Actions is SUCCESS after the latest code commit; earlier branch runs include intermediate test/lint failures and are historical diagnostics, not final status.
2. Fix any failures from the exact current head, then rerun unit tests, ESLint, TypeScript, production build, owner-auth smoke and desktop/mobile Playwright E2E.
3. Test actual rendering end to end using legal test clips and narration on desktop; validate the downloaded file by reopening and playing it, verify audio sync/scene transitions/caption placement, interruption/cancel handling and output recovery.
4. Test on the owner's physical Android Chrome. Automated desktop CI does not prove Android memory/render behaviour.
5. Add production-bundle export with the selected clips, script, source/rights manifest and timeline; keep it clearly distinct from a rendered video.
6. Complete IndexedDB quota/failure and multi-tab tests; ensure stale edits never overwrite current project state.
7. AI-reference video generation remains a separate blocker: do not enable a provider unless all current cost, region, rights, reference-support and privacy constraints pass.
8. Perform security/secret scan and privacy close-out before making the repository private as previously planned. Do not alter repo visibility without the agreed end-of-V3 review.

## CI run record

- V2 main baseline: Actions [#589](https://github.com/menishkumarmv07/Cook-/actions/runs/40178631663) — SUCCESS (137 unit tests, lint, typecheck, build, auth smoke, desktop/mobile E2E).
- V3 plan-only commit Actions [#591](https://github.com/menishkumarmv07/Cook-/actions/runs/40213157291) — SUCCESS on a documentation-only commit; this did not verify V3 features.
- Current V3 feature branch verification: **re-check the latest PR #83 head and latest Actions run before updating this line**. Do not copy the outcome from an earlier commit.
