## Live execution status — 26 October 2026 (08:35 UTC)

- Current PR head after quota-error hardening and regression coverage: `55ccd62f47cce2d78998c1026db1d5b6a8ecbae2`. PR #83 remains open, draft, and unmerged.
- Exact-head GitHub Actions [run #758](https://github.com/menishkumarmv07/Cook-/actions/runs/40292731160) succeeded: 207 unit tests, ESLint, TypeScript, production build, owner-auth browser smoke, and 104 desktop/mobile Playwright E2E tests passed.
- V3.6 browser quota safeguards now provide estimate warnings (80% warning / 90% critical), preserve native quota exceptions on local reference/media writes, and show backup-first guidance. The browser UI warning is covered in both desktop/mobile E2E; true quota exhaustion on the owner's device has not been forced.
- Current deploy status is blocked by the Vercel free-plan build-rate limit. No upgrade, card or paid fallback is acceptable; a matching Ready deployment is not verified.
- Rendering feasibility remains scoped to actual owner-provided moving footage and narration. CI synthetic fixtures prove browser WebM encode/finalize/reopen/playback mechanics only. AI reference-guided video generation is not enabled, original owner chef/kitchen references are not present in the repository, and actual visual realism/physical Android Chrome acceptance remain NOT TESTED.
- The 93-entry repo tree contains no tracked private media assets; `.env.example` is the only tracked dotenv file and has blank placeholders. Source-tree inspection is not a platform-wide secret scan.
- Continue V3.6 recovery failure-path tests and the integrated V3.8 gate in order. Preserve V1/V2; don't merge or claim V3 complete until all release gates have evidence.

# V3 research-backed execution plan — 25 October 2026

> <b>Status — implementation in progress:</b> V3 now has feature code on branch <code>v3/ai-chef-content-studio</code>, based on verified V2 main commit <code>5d0da951e2a73c5098ba82308f23438556b3f80c</code>. The blueprint, reference library/Bible, subtitle timeline, local owner-footage renderer, labelled ZIP fallback, and US creator-readiness checklist are implemented with unit and browser tests. Do NOT mark V3 complete yet: current exact-head CI, robust failure/recovery cases, physical Android acceptance, and real chef/kitchen visual-realism review remain release gates. AI-reference generation remains unavailable unless a genuinely ₹0/no-card provider is proven to meet every requirement. This is the execution authority for Cooking Creator only.

## 1. Objective and truthful definition of “realistic video”

Build an owner-controlled, simple, mobile-first AI Chef & Cooking Content Studio that turns an exact V2 recipe plus its reviewed evidence into a professional, editable, US-first cooking-video project. Preserve the owner's male chef character and kitchen look. Create believable motion, accurate cooking actions, coherent audio/captions and a valid playable export when an actually tested pipeline supports it. Keep a recoverable editable project if any step fails.

“Realistic video” means continuous believable motion; stable character, clothes, kitchen and props; physically plausible cooking actions; correct ingredients and food state; coherent lighting/camera movement; understandable narration/captions; and a valid video file that reopens and plays. A still image with a pan/zoom, storyboard, or ZIP of assets is not a realistic generated video and must never be labelled as one.

<b>Three visibly separate product modes:</b>

1. <b>Owner-footage mode:</b> edit video clips the owner records or legally owns, with the character/kitchen refs, recipe blueprint, narration, captions and local export. This is the most dependable ₹0 path and can yield genuinely real footage when the source footage is real.
2. <b>Reference-guided AI-generation mode:</b> generate/animate clips using the owner's approved chef/kitchen references only through a provider proven to support references, offer the intended rights, be accessible in the owner's region, and have a current ₹0/no-card/no-purchase path. Keep unavailable unless every condition passes.
3. <b>Production-bundle fallback:</b> if the device cannot render a valid video, export editable scenes, owner-cleared assets, script, captions, audio, timeline, rights/source metadata and a manifest. Label it as a bundle, not video.

A stable, commercially usable free AI video generator with no card, sustained quota and dependable character continuity is <b>not assumed to exist</b>. The early feasibility gate may conclude that realistic AI animation cannot be promised inside the current ₹0 constraints. Never use paid credits/APIs, credit top-ups, card-required trials, hidden paid fallbacks or surprise external uploads. If no qualifying generator exists, keep AI animation explicitly unavailable and deliver the real-footage editor + bundle fallback; do not quietly weaken the user's zero-cost rule.

## 2. Current external research that shapes decisions

### Video generation and price

- Google's current official docs describe Gemini Omni Flash image/reference-guided short video creation and conversational editing. The current model guide describes 3–10 second clips at 24 FPS and 9:16 portrait support. Current API pricing shows no free tier for video generation and an effective cost around US\$0.10/second for 720p. The docs say Veo 3.1 Preview API endpoints shut down on 22 October 2026. So V3 must not hard-code preview model names or assume a free quota; use a provider-neutral capability registry and re-check official documentation before activating an adapter. Sources: [Gemini video generation](https://ai.google.dev/gemini-api/docs/video), [Gemini Omni guide](https://ai.google.dev/gemini-api/docs/omni), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing).
- Runway's official developer API pricing is metered by model, output seconds, resolution and references; it is not a reliable ₹0 foundation. Source: [Runway developer pricing](https://dev.runway.com/pricing).
- Provider connection is not in scope as a required dependency. Before any future adapter is enabled, re-verify current price/quota, no-card terms, India availability, commercial-use rights, reference support, resolution/duration limits, data retention/training, cancellation, output codec, and whether the user must upload private refs. A missing/unclear term means the adapter stays disabled. Do not add API keys, billing accounts or paid dependencies without explicit approval.

### Browser video assembly

- MDN describes MediaRecorder as widely available, but codecs/MIME formats vary; a positive isTypeSupported result does not guarantee recording can finish if device/browser resources are insufficient. Runtime-test an actual short export and validate it. Sources: [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder), [MIME detection](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static).
- ffmpeg.wasm's official performance comparison is dramatically slower than native FFmpeg on its tested desktop; that is not proof of Android performance. Treat WASM FFmpeg as a benchmark candidate, not a default dependency. Source: [ffmpeg.wasm performance](https://ffmpegwasm.netlify.app/docs/performance/).
- Benchmark on Android Chrome and desktop before choosing Canvas capture/MediaRecorder, WebCodecs or ffmpeg.wasm. Check real playback, output format, frames, dimensions, audio sync, time, memory and failure recovery. Never run long video work in a long-running Vercel/serverless request.

### US platform rules

- YouTube requires disclosure for eligible realistic altered/synthetic content, and its monetization policy excludes mass-produced/repetitive low-value template output. Source: [YouTube AI labels](https://support.google.com/youtube/blog/424874071/updates-to-ai-content-disclosure-and-labels), [YouTube channel monetization](https://support.google.com/youtube/answer/1311392), [YouTube monetization rights](https://support.google.com/youtube/answer/2490020).
- TikTok requires labels for realistic AI-generated content and says not to mislead viewers about people, products or facts. Sources: [TikTok AI content](https://support.tiktok.com/en/using-tiktok/creating-videos/ai-generated-content), [TikTok US AI rules](https://seller-us.tiktok.com/university/essay?knowledge_id=491489038501663).
- Meta says it uses industry signals and “AI info” labels for detected AI content and requires its disclosure tool for organic photorealistic video/realistic-sounding audio that was digitally created or altered. Source: [Meta AI identification/labels](https://about.fb.com/news/2026/02/meta-prepares-for-2026-us-midterms/).
- V3 will have a visible AI-use/provenance/disclosure checklist and owner review. Never guarantee audience reach, income, monetization eligibility or payout dates. Account, age and region eligibility rules must be followed, not bypassed.

## 3. V1/V2 integration contract and current risk

Verified V2 baseline: main SHA 5d0da951e2a73c5098ba82308f23438556b3f80c; exact-head [GitHub Actions run #589](https://github.com/menishkumarmv07/Cook-/actions/runs/40178631663) passed 137 unit tests, ESLint, TypeScript, production build, owner-auth smoke 10/10 and desktop/mobile Playwright E2E 96/96. V3 test counts will grow, but all current checks must remain green.

Important V2 modules: lib/recipe.ts (recipe/creator profile), lib/recipe-trust.ts (tested/approved lifecycle), lib/research-evidence.ts (source/claim archive), lib/creator-content-pack.ts (US creator content pack). The UI entry app/page.tsx and app/globals.css are large; <b>do not rewrite the whole application or redesign its established UX</b>. Put V3 domain logic in focused lib files and UI in a dedicated component; make the smallest navigation change possible, lazy-load heavy render code, and protect V1/V2 with E2E.

The recipe revision counter is not an immutable snapshot ID. Every V3 project must pin a normalized source recipe snapshot and SHA-256 fingerprint, exact evidence claims/sources and review states, and creator profile snapshot. Rejected/unreviewed claims must not silently become factual script lines. Missing quantities, units, timings, heat, ingredient-step mappings, storage and safe temperatures stay missing/unknown rather than invented. Use V2 validation/trust functions; do not fork or weaken them.

Current V2 boundaries remain: deterministic text workflows; manually entered metrics/nutrition; no connected AI generation provider, video-frame/audio understanding, social publishing, live analytics, cloud sync or payouts. Most project data is browser-local and not encrypted at rest. Keep V3 local-first and avoid claims of independent verification.

Current GitHub tree did not contain the owner's character/kitchen reference images (only generic app/offline assets). Audit the original assets from owner-controlled storage before continuity coding. Since the repository stays public during active V3 by the owner's choice, <b>never commit original chef/kitchen references, voice recordings, personal files, payment information, owner credentials, API keys or secrets</b>. Import them to the app locally. Public CI must use only cleared non-sensitive fixtures. At V3 close-out, scan the commit history for secrets/assets and switch the repo to Private as agreed.

## 4. Architecture and product decisions

### A. Freeze versioned contracts before building screens

Create small domain boundaries:

- V3 project schema and lifecycle/state machine.
- Recipe/evidence/profile snapshot adapter reusing V2 validators.
- Deterministic blueprint builder + schema validator.
- Versioned Chef & Kitchen Bible and asset manifest.
- Narration, audio, captions and timeline utilities.
- IndexedDB storage/migrations/JSON backup and restore.
- Renderer capability probe, benchmark, job state and output verifier.
- Dedicated Content Studio component with minimal app navigation integration.

Keep source recipe and evidence in their V2 storage; store V3 project metadata and binary assets in a separate versioned IndexedDB database, not localStorage. Use transactions, explicit migrations, quota and file-size guards, checksums and user-visible storage/backup errors. Never overwrite canonical V2 data as a side effect. Avoid external upload or cloud sync by default.

### B. Project snapshot and provenance

Each project stores a project/schema ID, timestamps and state; source recipe ID and displayed revision; normalized recipe JSON + SHA-256; exact research archive/claim/source snapshot (IDs, URLs, excerpts/timestamps and status); creator-profile snapshot; blueprint versions; ordered scene data; asset origin/rights/checksum/MIME/size and optional tool/model/version; audio/caption versions; review/approval history; render jobs, output checksum and manifest.

If source recipe/evidence/profile changes, keep the old project immutable, label it “Based on an older recipe/evidence version,” offer a refresh that makes a new version, and invalidate affected approvals. V2 “Tested by owner” is not proof that the resulting V3 media is accurate or approved.

### C. Lifecycle and approval

Use visible states such as Draft → Blueprint reviewed → Visuals reviewed → Audio/captions reviewed → Ready to export → Exported. Scene, source, voice or caption edits invalidate affected approvals. Preserve a “Untried recipe draft” label for recipes without a real cooking trial. Keep source disagreement/unknowns visible in the project and export appendix.

### D. Chef/kitchen continuity bible

Create a versioned bible pointing at—never overwriting—the owner's approved original references. Store only owner-confirmed attributes: reference IDs, wardrobe, appearance, kitchen layout/background, counter, props/cookware, lighting, framing, camera style and allowed variations. Do not invent character traits absent from the actual references. Pin bible version per project.

Give scene prompts reference roles (character, kitchen/style, ingredient/prop, first/last frame) and allow one-scene replacement. Review each scene for:

- Chef/wardrobe match and kitchen layout/light/color continuity.
- Ingredient identity/count, cookware and food state.
- Plausible hand/tool contact, cutting/stirring/pouring and heat/steam.
- Camera framing, movement, texture, flicker and temporal coherence.
- No unexplained objects, logos, text or unsupported cooking/health claims.

Unless a vision model is independently tested and available under the user's constraints, this is a review checklist, not automated semantic scene analysis. Do not promise perfect consistency. Compare generated scenes to actual supplied refs and record pass/fail before export.

**Realism acceptance rubric (required; not a model marketing claim):** review at least five actual clips against the owner's real approved references, covering chef close-up, counter scene, hand/prep action, stove action and plated result. For every clip, record Pass / Needs edit / Fail for (1) chef/wardrobe continuity, (2) kitchen/lighting/prop continuity, (3) physically plausible hand-tool contact and action, (4) ingredient identity and food-state progression, (5) temporal motion/flicker/artifacts, (6) framing/material realism, and (7) audio/caption sync when present. Any wrong recipe step, unsafe instruction, ingredient mismatch, severe identity/kitchen drift, impossible action that changes meaning, rights uncertainty or missing required disclosure is a hard fail; do not approve it because other scores are good. “Needs edit” must be revised and re-reviewed. Keep clips, rubric results and limitations in the build log. If the actual reference images or real generated clips are unavailable, mark visual realism NOT TESTED—not passed. If a qualifying generator is found, test across at least three materially different recipes before enabling a general AI-generation claim.

### E. Realism-first shot planning

Use recipe-specific shots rather than repeated generic templates: hook/finished dish; ingredients; prep action; key stove/pan action; texture/doneness cue; plating; final reveal. Put the chef on camera when it improves the recipe, not as a mandatory talking avatar in every scene. Every scene must map to an actual V2 step or be visibly a non-instructional opening/closing shot.

Construct per-shot prompts from structured fields: action, exact source ingredient/step IDs, reference roles, environment, camera/framing, movement, lighting/materials, duration, expected first/last state and disallowed deviations. Avoid depending on provider-specific fields the chosen model doesn't support. Keep any generated dialogue separate until it is checked against the approved recipe. Model quality claims do not substitute for food accuracy or human review.

## 5. Work packages and per-slice tests

### V3.0 — Baseline, inventory and interface freeze (first)

Tasks: verify branch base SHA; run existing gates before editing; map local recipe/profile storage, evidence IndexedDB, trust functions, backup/restore, navigation and service worker; locate approved reference assets without pushing them to public Git; prepare cleared fixtures and snapshot interfaces.<br />Exit tests: baseline CI green on exact SHA; every needed V2 field is mapped or explicitly unsupported; no owner assets/secrets in repository; no production deploy or UI rewrite just for this phase.

### V3.1 — Deterministic Content Blueprint

Produce editable hooks, a unique recipe-specific viewer promise, scene order, ingredient callouts, exact units/amounts, duration/timing/heat/visual cues, camera notes, narration, captions, description, CTA/hashtags and platform variants. Include source/uncertainty/allergen/safety/rights appendix. Default generator is a deterministic transformation of saved facts; do not require a paid LLM. An optional later text-model adapter must obey the same schema and evidence allowlist.

Tests: complete/tested recipe, untried recipe, missing amount/unit/timing/heat, conflicting claims, allergy note, stale snapshot, Unicode names, long list and scene edits. Assert every amount/action maps to an explicit recipe field or is marked owner-entered/unverified. Assert no invented quantities, temperatures, timing or order; no lost source step; correct step↔ingredient mapping and servings. Reject invalid schema, malicious markup, excess text, blank titles and invalid IDs. Generate the same fixture twice and compare deterministic fallback output. Editing, reordering, replacing and restoring scenes must keep stable IDs and traceability.

### V3.2 — Asset library, Chef & Kitchen Bible and continuity

Implement versioned reference records, preview/picker, role, rights/origin status, checksum and file validation. Keep originals and derivatives distinct. Allow replacing a single scene and preserve unrelated scenes.

Tests: wrong MIME/extension, corrupt image, oversized file, unsafe filename, failed decode, repeated import, stale tabs, quota-full, interrupted write, bible-version change and project restore. Ensure replacing a scene invalidates only relevant reviews; no source original is mutated. Manually compare at least five representative shots (chef close-up, at counter, hand prep, stove action, plated result) to owner refs. Record actual visual misses; do not mark continuity complete from schema tests alone.

### V3.3 — Narration, audio, captions

Prioritize owner-recorded narration and uploaded audio. Build optional in-browser recording only after testing it on target devices. Browser speech is preview-only unless it creates a real downloadable audio file. Keep pronunciation, language, rate, per-scene timing and text editable. Export SRT/VTT and optional burned-in captions. No scraped trending music or unlicensed tracks; no voice cloning without rights/consent.

Tests: permission denied/revoked, interrupted recording, silence, empty/large upload, unsupported codec, trim/offset boundaries, overlap/negative caption timing, Unicode, punctuation, escaped tags and missing scene audio. Compare timecodes to a reviewed audio sample. Scene/script edits must invalidate affected caption/audio review. Test mobile caption readability, safe margins, contrast and export/restore. Never report audio exported when only browser speech preview exists.

### V3.4 — Renderer/provider feasibility benchmark (blocking decision)

Before selecting a stack, make an isolated prototype comparing:

1. Canvas captureStream + MediaRecorder with runtime codec/MIME detection.
2. WebCodecs only if target browser/codec support is proven.
3. ffmpeg.wasm as an isolated candidate, only if measurements justify its bundle/memory cost.
4. Manual external editor/bundle fallback when on-device rendering is unsupported.

Benchmark the same cleared 5–15 second portrait sample with video, captions and narration on Android Chrome and desktop. Measure actual container/MIME, playback after download/reopen, duration, resolution/aspect, frame rate, audio sync, caption positions, render time/file size, memory/crashes, tab backgrounding, screen lock, cancel/retry and storage exhaustion. Test output rather than trusting a capability flag. Never rename WebM to MP4. Never render a long video inside a Vercel/serverless request.

AI provider gate is separate: only test an API if current docs prove a genuine free/no-card allowance and commercial rights, region, reference support and retention are acceptable. No purchase or paid API trial. Save the dated decision, measurements and output checksums in the V3 Build Log.<br />Decision: choose the simplest renderer that passes on both target classes. If none can create a valid video, mark rendering unavailable for that device and bundle assets. If no generator meets cost/rights/realism requirements, keep AI animation unavailable; don't imply a generated realistic clip exists.

### V3.5 — Real video render and export

After the benchmark, assemble actual owner footage and/or verified generated clips in scene order, with narration, audio and captions. Portrait 9:16 first; 1080×1920 is a target only where tested hardware/codecs permit. Support landscape only after portrait is stable. Show progress, cancel, safe retry and failure recovery. Validate output MIME, decodability/playback, dimensions, duration and audio/video tracks before calling it Exported. Record output hash, source snapshot, timeline manifest, rights and AI-disclosure checklist. On failure, preserve the editable project and offer the correctly labelled bundle fallback.

Tests: single and multi-scene outputs, missing clip, no narration, no music, captions, transitions, mixed source formats, cancel at each stage, simulated crash, repeated export, bad codec and corrupt output. Invalid or partial output must never be marked successful. Change recipe/evidence after blueprint and ensure export blocks until refresh/review. Restore a bundle and verify project/asset/checksum parity.

### V3.6 — IndexedDB persistence, restore and recovery

Use dedicated versioned IndexedDB stores for project metadata, assets, blueprint revisions and render jobs. Add transactional saves, migrations, duplicate detection, storage quota warnings, project versioning and import validation. Avoid large base64/localStorage blobs; clean up object URLs and release preview resources.

Tests: current and older backup formats, corrupted/partial/oversized/unknown-version archives, quota exhaustion, unsupported IndexedDB, transaction abort, repeated restores, duplicate IDs, two-tab conflicts and reload during each state. Invalid imports cannot overwrite existing work; stale edits must be reported rather than silently winning. Failed/cancelled render jobs resume in a safe state without losing the project.

### V3.7 — US-first creator readiness

Provide editable export presets for YouTube Shorts first, then Instagram Reels/TikTok candidates. Include appropriate vertical framing, readable captions, hook, recipe-specific educational value, source/rights/AI disclosure and human-review checklist. Respect creator-profile language and US-customary preferences but never silently convert recipe source amounts. Don't auto-publish, schedule, fetch social analytics or pay out funds; that remains outside V3/V6 boundary. Don't guarantee views, viral reach or revenue.

Tests: output field/length limits, portrait-safe margins, title/caption variants, disclosures/rights in export and restore, stale recipe state, and repeated-template detection that asks for substantive human review rather than calling generic content monetization-ready.

### V3.8 — Integrated release

Every code slice runs its narrow unit tests before continuing; after the slice, run the full gate. Final gate includes unit tests, ESLint, TypeScript, production build, owner-auth browser smoke with disposable CI-only credentials, desktop and mobile Playwright E2E, accessibility pass, upload/privacy/security review, PWA/service-worker review, exact-head GitHub Actions, matching Vercel deployment and V1/V2 regression. Never use the real owner password in CI or ChatGPT.

Physical Android Chrome owner acceptance is its own gate: sign in on the actual phone, import real refs locally, edit/reload/restore one short project, export a valid playable file or a correctly labelled bundle, and confirm no horizontal overflow. I cannot claim to have physically operated the owner's device without that observed result.

## 6. High-value test matrix

| Area | Positive | Failure/edge case | Required result |
| --- | --- | --- | --- |
| Source snapshot | Complete recipe + accepted claims | Source recipe/evidence changes later | Immutable hash kept; stale warning; affected approval cleared |
| Recipe accuracy | Correct ingredient/step mapping | Missing values or source conflict | Nothing invented; unknowns visible |
| Blueprint | Edit/reorder/reload/restore | Invalid schema, script-injection text, invalid IDs | Validated, safely rendered, stable traceability |
| Asset library | Approved ref imported | Wrong MIME, corruption, oversize, quota full | Safe rejection/recovery; original never overwritten |
| Continuity | Scene uses pinned Bible | Wardrobe/layout/tool/food mismatch | Review flag; no false automated-analysis claim |
| Audio | Recorded/uploaded file persists | Denied permission, silence, unsupported codec | Clear failure/retry; no data loss or fake file |
| Captions | SRT/VTT aligns with script | Overlap, Unicode, invalid timing | Correct escaping; mismatch review required |
| Rendering | Downloaded output reopens and plays | Unsupported codec or corrupt container | No false success; preserve project and bundle fallback |
| Cancellation | Cancel a render safely | Cancel/close tab mid-render | Recoverable state and safe retry |
| Restore | Full valid round-trip | Truncated/partial/oversized archive | Atomic validation; existing work untouched |
| Rights/privacy | Provenance included in export | Unknown asset rights/provider terms | Block or mark unresolved; no false license claim |
| Platform compliance | AI-use checklist included | Realistic AI scene disclosure not reviewed | Warning/blocking owner review |
| Regression | V1/V2 flows still work | Migration/stale-tab bug | Full suite remains green |
| Mobile performance | Short output on Android | Low memory/codec unavailable | Graceful bundle fallback, no project loss |
| Cost guardrail | Local path works without keys | Provider unavailable/quota exhausted | Explicit unavailable; never paid fallback or surprise upload |

Every test must assert meaningful behavior, not merely “did not throw.” Add a regression test for every discovered defect. If any stage fails, reproduce, isolate, fix, test narrowly, rerun the full gate and inspect the diff before advancing.

## 7. Test fixtures and quality bar

Use deterministic synthetic recipe data and licensed/owner-cleared sample assets only; do not place private chef/kitchen refs in public CI. Include fixtures for tested/untried recipes, missing amounts/units/timing/heat, conflicting sources, allergens, long ingredient names, Unicode, no scenes, maximum scenes, old/current project snapshots, accepted/rejected/unreviewed evidence, valid/silent/interrupted audio, corrupted/unsupported/mixed-format video, and corrupted archive imports.

Run tests after every coding slice. Then run the complete quality gate and confirm CI applies to the exact current branch commit. Keep V3 isolated in a draft PR; do not merge/promote broken code. Inspect every agent/helper diff, dependency change, asset path and test log. Never interpret “green earlier” as “green now.”

## 8. Risk register

- <b>No qualifying free AI generator:</b> decide early; owner-footage editing + bundle; no paid credits.
- <b>Character drift/uncanny clips:</b> pinned references, role-based prompts, one-scene replacement and actual visual review; no perfection claims.
- <b>Cooking errors:</b> immutable source snapshots, ingredient-step mapping, missing-information warnings and human review.
- <b>Android render crash:</b> benchmark early, short jobs, capability detection, quota/memory guards and bundle fallback.
- <b>Large client bundle/performance hit:</b> separate modules, lazy-load renderer, no FFmpeg package until benchmarks justify it.
- <b>Public repository leaks:</b> never commit original refs/voice or private information while public; use cleared fixtures and scan history at close-out.
- <b>Data loss/stale tabs:</b> IndexedDB transactions, versioned backups, checksum validation, stale revision detection and recovery tests.
- <b>Provider changes/terms:</b> adapter/capability registry, live official-doc check, disabled on unknown status; no deprecated API IDs in core.
- <b>Platform monetization/disclosure:</b> dated policy references, unique recipe-specific value, rights checklist and manual review; no earnings guarantees.
- <b>V2 regressions:</b> avoid rewriting app/page.tsx; minimal screen/nav wiring and full E2E.
- <b>Automated test overconfidence:</b> distinguish unit/CI checks from subjective visual and physical-device gates.

## 9. Separate review passes and development workflow

Work one slice at a time:

1. <b>Architecture/contracts review:</b> V2 compatibility, snapshot immutability, migrations, small diffs.
2. <b>Product/UI review:</b> existing warm theme, simple phone-first screen, Back navigation, touch targets, no horizontal overflow.
3. <b>QA review:</b> positive, negative, boundary, restore/retry, mobile and exact-head coverage.
4. <b>Security/privacy review:</b> file validation, escaping, local-only assets, no secret/asset leaks, no unexpected network upload.
5. <b>Visual/creator review:</b> compare actual reference assets, motion and cooking-action accuracy, captions, rights and AI disclosure.
6. <b>Release review:</b> exact SHA CI, Vercel READY, run logs, owner-only pending tasks and privacy close-out.

Use existing GitHub/Notion and available coding/testing workflows. No new paid plugin is required. Connected creative tools remain optional research only. A tool/agent summary is not proof: review its actual diff, outputs and test results.

## 10. V3 completion and final privacy close-out

Content Studio acceptance: create a project from a saved V2 recipe; verify source/evidence snapshot; edit a scene; preserve the pinned chef/kitchen Bible; review audio/captions; reload/restore; and export an actually playable, reviewed video on tested hardware or a complete, correctly labelled bundle where video rendering is unsupported. Unknowns stay visible and no paid service/card/account is required.

<b>Separate realistic-generation acceptance:</b> mark reference-guided AI video generation complete only if real clips are generated from the approved references through an available ₹0/no-card route, commercial rights/privacy terms are verified, and a manual visual/temporal/cooking-accuracy test set passes. Otherwise report that AI generation is not satisfied by current free constraints. Never disguise a slide animation as generated realism.

Final release requires all automated checks green on the exact candidate SHA, V1/V2 regression green, matching deployment checked, and physical Android acceptance recorded. Publishing and live schedule remain V6 scope.

After V3 completion, inspect current tree and commit history for secrets and proprietary assets, verify only the blank .env.example template is tracked, perform secret/dependency review, then have the owner switch GitHub to Private as requested. Repository visibility has not changed yet. Vercel URLs are not private solely because the app has an owner password; review deployment exposure without adding a third-party login requirement.

> <b>Execution checkpoint — 26 October 2026:</b> Verified V2 base is <code>5d0da951e2a73c5098ba82308f23438556b3f80c</code>; V2 main Actions [#589](https://github.com/menishkumarmv07/Cook-/actions/runs/40178631663) passed 137/137 unit tests, ESLint, TypeScript, production build, owner-auth smoke 10/10 and desktop/mobile E2E 96/96. V3 feature code is on the isolated branch <code>v3/ai-chef-content-studio</code>. At the last re-check, branch/PR head was <code>712e8c88863295af1e770027a445412284155167</code>; draft PR [#83](https://github.com/menishkumarmv07/Cook-/pull/83) remains OPEN and UNMERGED. Exact-head Actions [#694](https://github.com/menishkumarmv07/Cook-/actions/runs/40271431737) was running through production build; it had not yet returned a final result. Earlier E2E failures revealed and drove fixes for (1) missing CSS visibility for the new dedicated AI Chef Studio tool, and (2) an ambiguous platform locator in the test; the latter was changed to the unique <code>#v3-target-platform</code> selector and is awaiting the current run. Code now includes a short synthetic WebM/WAV browser render test; this checks encoder/export mechanics only, not cooking realism. V3 implementation has started but is NOT complete. No real owner chef/kitchen references exist in the repository; realism remains NOT TESTED. Repository visibility remains public by prior development decision; a secret/privacy audit and owner-approved close-out are still required before changing it to Private.

## 11. New-chat continuation prompt (copy/paste)

Use this prompt in a fresh ChatGPT conversation to continue the same Cooking Creator project without restarting the research:

> **Continue my Cooking Creator V3 work from the existing notes and repository. First read the V3 Notion plan and `docs/V3-plan.md`, then inspect GitHub PR #83, branch `v3/ai-chef-content-studio`, its latest commit and exact-head Actions status. Trust the latest verified repository state, not stale notes.**
>
> 1. This is only the Cooking Creator app `menishkumarmv07/Cook-`; do not mix it with App Market/MV or GKworks.
> 2. V1 is owner-confirmed complete. V2.0–V2.5 is on `main` at `5d0da951e2a73c5098ba82308f23438556b3f80c`. Exact-main Actions run #589 passed 137 unit tests, lint, TypeScript, production build, owner-auth smoke 10/10 and desktop/mobile E2E 96/96. Keep all V1/V2 behaviour working.
> 3. Research and planning are complete; V3 implementation is underway. Branch `v3/ai-chef-content-studio`; PR #83 is draft/open/unmerged. At the last verified re-check, head was `712e8c88863295af1e770027a445412284155167`; exact-head Actions #694 was still running: https://github.com/menishkumarmv07/Cook-/actions/runs/40271431737. Re-check current head and CI before proceeding; prior commits contain implementation/test iterations, including failures that were inspected and corrected.
> 4. The V3.0 baseline/interface audit has been started and the current branch already contains V3 feature code. First check exact-head CI and recent logs, fix any new failing assertions rather than weakening real checks, then finish the remaining V3.1–V3.8 gates. Do not rewrite the whole app or change V2/main/production.
> 5. Then work one small, ordered, tested slice at a time: (a) deterministic recipe content blueprint; (b) Chef & Kitchen Bible and asset continuity; (c) narration/audio/captions; (d) early Android Chrome + desktop rendering/provider feasibility benchmark; (e) valid video export and bundle fallback; (f) local persistence/backup/restore; (g) US-first creator-readiness checks; (h) final full regression and release verification. Read the V3 plan for detailed acceptance tests.
> 6. The goal is genuinely realistic cooking videos that preserve my approved male chef character and kitchen, with believable motion, plausible cooking actions, correct recipe details, coherent audio/captions and a real playable export. Do not call a slideshow or asset bundle a video. Test actual clips against the real references using the V3 realism rubric. If references/clips are not available, mark realism NOT TESTED. Do not promise perfect consistency.
> 7. Keep the app US-first for creator workflows and potential social-media earnings, but never guarantee reach, monetization or income. Include rights/source/safety and applicable AI-disclosure review.
> 8. Hard constraints: ₹0/no-card/no-required paid service, no paid API/trial/credits, no hidden paid fallback, no surprise external upload, owner-only private personal app. Use local-first processing by default. A provider may be enabled only after current cost, access, reference support, commercial rights and privacy terms are verified.
> 9. The original chef/kitchen reference assets are not in the repository. Never invent their details or commit private references, voice recordings, secrets or credentials while the repo is public. Inspect actual owner-controlled references when available; use only cleared fixtures in public CI.
> 10. After every code slice, run focused tests, fix failures before moving on, then run the full test/lint/typecheck/build/owner-auth/desktop-mobile E2E suite on the exact current commit. Inspect the actual diff and output. Do not say device acceptance passed unless it was actually observed on a physical Android device. Keep the PR draft until all required gates pass, update the Notion V3/V2 handoff and this build log with exact commit/test results, and never claim incomplete features are done.
>
> **Immediate next action: verify the latest exact-head CI for the current branch. Fix remaining failures, continue focused render/recovery/privacy tests, update the log after each meaningful slice, and keep PR #83 draft until all required gates pass. Do not repeat the completed research/planning phase.**

**Resume status as of 26 October 2026:** V3 feature implementation is in progress on `v3/ai-chef-content-studio`; PR #83 is still draft/open/unmerged. Exact-head run #745 passed the configured install/test/lint/TypeScript/build job on `c510e67102be32801bce1b3d488cf1c2d66dd734`. Documentation checkpoint commit `92e2508d490420c59c08cc11498f1bb91fb3ebf5` triggered run #746, which was still in progress at the last check; do not call it passed until it completes. The browser suite uses local synthetic WebM/WAV fixtures to test a WebM render/download route, ZIP fallback and creator-copy persistence; synthetic footage is only an encoder test, not realism evidence. V3 is not complete. Real chef/kitchen AI-reference realism and owner-device acceptance remain NOT TESTED. Outstanding: exact-head E2E review, playback inspection, physical Android Chrome acceptance, IndexedDB quota/recovery/stale-tab tests, privacy/secret scan, and V1/V2 regression verification.
