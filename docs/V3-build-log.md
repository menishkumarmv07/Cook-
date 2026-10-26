# V3 Build Log — Cooking Creator

## Implementation hardening — 26 October 2026

- Tightened the visual realism PASS contract: it now requires both an owner-approved pinned `chef-identity` reference and an owner-approved pinned `kitchen-wide` or `kitchen-detail` reference. A generic pinned image or a wardrobe-only image is not sufficient.
- Added unit coverage for no-reference, chef-only, kitchen-only, wardrobe-only, and valid chef+kitchen combinations.
- This is a guardrail for the manual review workflow; it does not turn manual review into AI vision analysis and does not certify that any clip is realistic. The actual reference files and actual owner-footage still need human review.
- Preceding exact-head run #696 was triggered for commit `7239e1a003dfdc45a3555a9d92aa36fb711f878f`; it must not be used to verify this newer change. Check the GitHub run attached to the new commit and record its actual final result.

---

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

## Execution update — 26 October 2026

**Implementation has started; V3 is not release-complete.** The repository already contains the V3 feature slices below. This is a working build log, not a claim that every gate passed.

- **V3.0 baseline/interface integration:** built on the verified V2 main baseline at `5d0da951e2a73c5098ba82308f23438556b3f80c`; branch is isolated and PR #83 stays draft. CI caught a missing dedicated-screen CSS reveal for `#v3-content-studio`; an explicit tool-visibility rule has been added and the browser test checks the tool route.
- **V3.1 blueprint:** the scene blueprint, provenance traces, input fingerprints, validation and backup handling are implemented with unit tests.
- **V3.2 continuity:** the local Chef & Kitchen reference library, owner-confirmed Bible, reference pinning, version invalidation and a per-render eight-item visual-review checklist are implemented. The review is explicitly manual; a PASS requires approved pinned references and every checklist item. The status belongs to the latest reviewed clip only; historical per-clip reviews are not falsely implied.
- **V3.3 narration/captions:** editable caption timing plus SRT/VTT export is implemented. The UI does not invent transcription or timing.
- **V3.4–V3.5 local renderer and fallback:** local video/audio import checks signatures and browser decodability; rights notes and owner-clearing gate exports; the WebM renderer validates dimensions, duration and playback before presenting a downloadable result. A separate ZIP production bundle contains the editable script, timeline/rights manifest, creator-readiness JSON, captions when valid, and selected local assets. It is always labelled as NOT a rendered video.
- **V3.7 creator readiness:** an owner checklist covers recipe facts, food safety, source/asset rights, originality and platform disclosure. Per-platform title/caption/CTA fields persist locally. Copy export is available, but publishing remains manual and unconnected.
- **Browser integration coverage:** Playwright generates a short synthetic WebM and PCM WAV fixture locally at test runtime, imports both through the app, assigns/approves four short scene trims, renders a real browser-recorded WebM, checks the preview's decoded dimensions/duration, downloads the WebM and verifies its EBML header. It also checks the ZIP fallback, platform-copy persistence and mobile horizontal overflow. These synthetic fixtures prove the local encoder/export path only—not realism, human narration, cooking accuracy or character continuity.
- **Latest observed test issue:** browser run #693 failed because a broad accessible-label locator matched both the V3 platform selector and the existing V2 creator-profile field. The test now targets the unique `#v3-target-platform` ID. The latest checked code-head run #694 was still running through its production build before the documentation edits below; check the live exact-head run after these docs commits rather than copying an earlier status.
- **Not yet verified:** owner-device Android Chrome performance, real owner footage playback/audio quality, quota/private-storage failure recovery, complete stale-tab/media race cases, and the visual realism gate using the actual chef/kitchen references. The originals are not in the repo, and provider-generated AI cooking video is not enabled under the hard ₹0/no-card constraint.


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
5. Production-bundle export is implemented (script, source/rights/timeline manifest, creator-readiness JSON, pinned refs/media when available, and valid subtitles). Verify exact-head tests plus ZIP contents/recovery; it is not a rendered video.
6. Complete IndexedDB quota/failure and multi-tab tests; ensure stale edits never overwrite current project state.
7. AI-reference video generation remains a separate blocker: do not enable a provider unless all current cost, region, rights, reference-support and privacy constraints pass.
8. Perform security/secret scan and privacy close-out before making the repository private as previously planned. Do not alter repo visibility without the agreed end-of-V3 review.

## CI run record

- V2 main baseline: Actions [#589](https://github.com/menishkumarmv07/Cook-/actions/runs/40178631663) — SUCCESS (137 unit tests, lint, typecheck, build, auth smoke, desktop/mobile E2E).
- V3 plan-only commit Actions [#591](https://github.com/menishkumarmv07/Cook-/actions/runs/40213157291) — SUCCESS on a documentation-only commit; this did not verify V3 features.
- Current V3 feature branch verification: **re-check the latest PR #83 head and latest Actions run before updating this line**. Do not copy the outcome from an earlier commit.
