# Cooking Creator Studio

V1 foundation plus integrated V2.0–V2.5 local creator research, planning, and monetization-readiness workflows. This repository and its notes are separate from the App Market/MV and GKworks projects.

## Current V1 features

- Responsive recipe creator dashboard.
- Device-local kitchen/creator profile for tone, catchphrases, language, cuisine, skill level, equipment, budget, diet/allergy constraints, units, time target, platforms, never-say list, and sample captions; fresh profiles default to English and US customary units for the US-first workflow, while Metric and dual-unit preferences remain selectable. Profile guidance is included in content packs and JSON backups.
- Installable PWA manifest and SVG app icon. The service worker caches static assets and a generic offline page only; it never caches protected workspace HTML. Offline mode therefore shows an offline notice rather than opening the private workspace.
- Recipe intake with HTTP(S) source URL, servings/yield, and notes.
- Owner-authenticated public recipe-page inspection from intake: fetches accessible HTML on explicit request, previews page text and optional Schema.org Recipe fields, and only copies extracted details into notes after the creator chooses to do so. Extracted values are unverified; it does not inspect video frames or transcribe audio.
- Structured ingredient rows: amount, unit, name, preparation note.
- Ordered cooking-step editor: action, timing, heat/setting, visual/doneness cue, and explicit ingredient-addition mapping. Ingredient timing is never inferred; unassigned ingredients are flagged.
- Six-scene creator outline that can be edited.
- Rule-based validation warnings for missing amounts, units, steps, timings, serving count, source analysis, food safety, and nutrition.
- Structured multi-source research desk for recipe pages, videos/Reels, transcripts, and other references; captures what was checked and unresolved differences, plus source-specific ingredient/quantity, method/order, timing/heat, and safety/storage findings. A coverage summary flags missing manual notes and exports them without claiming independent verification.
- Manual, source-linked nutrition worksheet: records calories/macros for each ingredient's exact listed amount, a required preparation/amount basis, and a valid source URL; totals complete values and divides by a clear serving count. It does not fetch nutrition data, convert units, or independently verify values.
- Narration-script preview, copy, and plain-text export with ingredient callouts, ordered cooking narration, recorded timing/heat/visual cues, serving count, manual source uncertainties, and pre-recording checks. Missing details are flagged rather than invented.
- Creator-entered cooking-trial photo (resized locally), rating, and notes; recipes start Untested and require a real dish photo plus a trial record before being marked Tested. Photo data is stored locally and is included in JSON backups.
- Explicit approval gate before sharing, with recipe edits resetting Tested and approval status.
- Short-form text content pack with five hook options, a caption draft, hashtags, CTA, narration/shot guidance, and manual source/review notes.
- Prepare-and-share workflow using the browser/Android share sheet when available, with a text download fallback. Sharing is manual; no direct platform API publishing is implemented.
- Flexible local link planner: accepts any number of valid HTTP(S) video/Reel URLs, lets the creator choose the maximum links per day and the number of US Eastern calendar days, checks capacity so no valid link is silently dropped, preserves pasted link order, balances posts across the selected date range, edits dates and suggested times, defaults to the US Eastern calendar date, handles daylight-saving calendar arithmetic, persists the links and custom settings in browser localStorage, validates restored/exported entries, and exports JSON. There are no fixed 3-day/7-day presets or arbitrary link-count/daily-setting caps. Suggested slots are starting points, not analytics-backed recommendations; the planner does not schedule or publish through social platforms.
- Deterministic Markdown tutorial draft preview and Markdown/JSON exports.
- Browser-local autosave/restore with basic validation of saved data and migration of the original V1 drafts, including safe defaults for newly added source-reference records. The service worker only caches static resources and an offline notice, never the authenticated workspace HTML.
- Separate browser-local chat history with New Chat, conversation titles and previews, switching/continuing older chats, restoring the active chat after refresh, migration from the original flat message history, and delete confirmation. Storage is limited to 25 conversations and 100 messages per conversation. Chat history is not cloud-synced and is not included in the recipe/profile workspace backup.
- Single-recipe JSON import with schema and HTTP(S)-URL validation, including recovery of older V1 exports.
- Whole-workspace JSON backup and restore: exports every local recipe draft plus the creator profile in one versioned archive; restore validates the entire archive, confirms before replacing current local drafts/profile, guards large files and estimated local-storage size, and leaves the archive on the user's device. This is a manual backup/restore flow, not cloud sync.
- Composer Download action creates the same versioned local recipe/profile backup, including when there are no recipe drafts yet. It never uploads or publishes data; conversation history remains separate.
- Delete one draft or clear all local drafts with confirmation.
- Automated unit tests for IPv4/IPv6 special-purpose blocking, external URL validation, HTML/Schema.org Recipe extraction, data shape, warnings, draft generation, JSON backup recovery, and scene count.
- Playwright browser tests for create/edit/reorder/reload/export, legacy JSON import and unsafe-URL rejection, plus a mobile-width overflow check.
- GitHub Actions CI runs on pushes and pull requests with `npm ci`, unit tests, ESLint, TypeScript checking, production build, Chromium installation, owner-auth browser smoke tests, and the full Playwright end-to-end suite.
- One-command quality gate: `npm run check` runs tests, lint, type-check and the production build in sequence.

## Owner-only sign-in and local setup

The workspace routes are gated by a server-verified owner session. There is no public sign-up. The server requires two private environment values: `OWNER_PASSWORD` (at least 16 characters) and `AUTH_SECRET` (at least 32 random bytes). If either is missing or too short, the workspace stays locked. The app signs an eight-hour session cookie using HMAC-SHA-256 and sets it `HttpOnly`, `SameSite=Strict`, and `Secure` on HTTPS. Sign-out clears the session cookie.

For local development, copy `.env.example` to `.env.local` and enter your own unique values in the local file. Keep `.env.local` private; it is ignored by Git. Generate a random `AUTH_SECRET` on your own device (for example, `openssl rand -base64 32`). Do not paste passwords or secrets into ChatGPT or commit them. The values written in the GitHub Actions workflow are disposable test-only credentials and must never be reused for a real app.

The login route includes a best-effort in-process failed-attempt throttle. This is **not** a distributed or hosting-level rate limiter and can reset when a serverless instance restarts. Before any public deployment, configure and verify host-level rate limiting and HTTPS, review server-route authorization, and complete the security acceptance checklist. Owner sign-in does not encrypt recipe data already stored in browser `localStorage`; anyone with access to the unlocked device/browser profile may still access that local data.

## Run locally

Requires Node.js 20.9+ and npm. After setting `.env.local` as described above:

```bash
npm ci
npm run dev
```


Open http://localhost:3000.

## Quality checks

Run the complete local gate (tests, lint, type-check, and production build):

```bash
npm run check
npm run e2e
```

Or run each stage separately:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

The GitHub Actions workflow installs Chromium and runs the Playwright end-to-end suite against the production build. CI uses the committed `package-lock.json` with `npm ci` for reproducible dependency installation. Treat each check as passed only when the workflow or local command actually completes successfully; historical green runs do not verify later changes.

For the Android/Chrome manual acceptance pass, follow [the V1 acceptance checklist](docs/V1-acceptance-checklist.md). Automated checks do not replace real-device testing.

## Integrated V2.0–V2.5 features

- **Research Studio:** local source-linked evidence ledger for structured claim notes, source-specific ingredient/method/timing/safety findings, uncertainty/disagreement review, and conservative URL validation. Imported or owner-entered text is not treated as independently verified.
- **US-first creator content packs:** editable creator-ready text, originality worksheet, platform-specific finishing prompts, voiceover draft, nutrition traceability and source-review caveats.
- **Recipe trust lifecycle:** explicit Draft → Evidence reviewed → Ready for cooking trial → Tested by owner → Approved gates; current-version cooking-trial date, changes, rating, notes and dish-photo checks; edits invalidate stale trust/approval.
- **Growth Lab:** browser-local manual metrics and experiments; actual values are distinguished from estimates, malformed/duplicate CSV rows are guarded, and experiments require outcomes/next actions.
- **Editorial Calendar:** monthly idea planning, dated source observations distinct from hypotheses, review/readiness gates, scoring and local export/backup.
- **Monetization Readiness:** media-kit preview/export, dated owner-entered platform metrics, brand-partnership and affiliate registers, disclosures/rights/eligibility checks and evidence-gated actual-received USD tracking distinct from estimates/offers/contracts.
- **Backups:** supported workspaces have versioned JSON backup/restore or merge and CSV/Markdown exports. The workspaces remain device-local and do not synchronize automatically.

## Important limitations

The app is integrated through V2.5, but it remains a local-first creator workspace rather than a finished AI video-production system. V2 research, Growth Lab, Editorial Calendar, and Monetization Readiness records are manually maintained in this browser. Source-ledger notes and review states are records of what the owner entered or checked; they are not independent fact-checking, food-safety certification, legal/tax advice, or proof of platform eligibility. CSV and versioned JSON backup/restore flows are provided for supported workspaces. Local records do not sync between devices and can be lost if browser storage is cleared; export backups regularly.

The content-pack and narration generators remain deterministic text workflows based on saved inputs; no generative AI provider is connected. Recipe-page inspection can extract selected accessible HTML and optional Schema.org Recipe fields only when explicitly requested. The app does not inspect video frames, transcribe linked video audio, fetch nutrition data from USDA/other food databases automatically, infer missing quantities or ingredient-to-step mappings, generate the chef's voice/animation, or render finished video. Nutrition values are manually entered and need owner verification. A cooking trial, recipe review, media-kit metric, platform observation, partnership amount, or affiliate commission is a user-entered record and is not independently verified by the app. Estimated, offered, contracted, and actually received USD amounts are kept distinct; reach and earnings cannot be guaranteed. Social-account integrations, automatic scheduling/publishing, direct payouts, and remote analytics are not implemented. Share packs are text drafts; sharing remains manual. Validation warnings are completeness checks, not proof that a recipe is correct or safe.

Owner sign-in uses server-side environment secrets and an HMAC-signed session cookie. The failed-login throttle is best-effort and in-process only, not a distributed or host-level rate limiter. Browser localStorage is not encrypted at rest. Do not store sensitive personal, contract, or payment information here. The owner-password gate protects the workspace, but it does not make repository source/history or deployment URLs private.

## US-first product direction

The app is built around a US-first creator workflow and USD-oriented business tracking while allowing recipes from any cuisine or country. The current calendar, experiments, media kit, partnership register and affiliate register are local/manual planning tools, not live integrations with YouTube, Instagram, TikTok, brand payment systems, or affiliate networks. Eligibility and required disclosures must be checked against official current platform terms. Actual posting, platform analytics retrieval, payout processing, and direct publishing are not implemented. Reach and revenue cannot be guaranteed.

## Cost and privacy

The current V2.5 local workflows do not require a paid AI API, card, or paid creative provider. GitHub Actions and Vercel availability/limits depend on account settings and may change. The latest integrated main commit passed [GitHub Actions run #588](https://github.com/menishkumarmv07/Cook-/actions/runs/40003290543): 137 unit tests, ESLint, TypeScript, production build, owner-auth smoke 10/10, and desktop/mobile E2E 96/96. The current production alias is [cook-silk.vercel.app](https://cook-silk.vercel.app); its current deployment is READY and the root page returns the owner-password sign-in form.

**Repository privacy requires separate attention:** GitHub currently reports this repository as public. The owner-password gate does not hide public source code/history. To keep the code private, change the repository visibility under GitHub **Settings → General → Danger Zone → Change repository visibility → Make private**. Project-level Vercel Authentication is disabled to avoid requiring a third-party account; therefore deployment URLs may load the app login screen and should not be treated as private links. Keep the owner password private.

The latest .gitignore ignores .env* while preserving the blank .env.example. Never commit .env.local, owner passwords, session secrets, API keys, credentials, private assets, or personal/payment data. Browser-local recipe, chat, research, growth, calendar, and monetization data are not encrypted at rest or cloud-synced; make backups and do not use this prototype as a secure vault. Do not add paid services, billing, card verification, or secret keys without explicit approval.
