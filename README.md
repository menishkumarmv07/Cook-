# Cooking Creator Studio

Private V1 foundation for the AI Cooking Creator App. This repository and its notes are separate from the App Market/MV and GKworks projects.

## Current V1 features

- Responsive recipe creator dashboard.
- Device-local kitchen/creator profile for tone, catchphrases, language, cuisine, skill level, equipment, budget, diet/allergy constraints, units, time target, platforms, never-say list, and sample captions; fresh profiles default to English and US customary units for the US-first workflow, while Metric and dual-unit preferences remain selectable. Profile guidance is included in content packs and JSON backups.
- Installable PWA manifest and SVG app icon. The service worker caches static assets and a generic offline page only; it never caches protected workspace HTML. Offline mode therefore shows an offline notice rather than opening the private workspace.
- Recipe intake with HTTP(S) source URL, servings/yield, and notes.
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
- Deterministic Markdown tutorial draft preview and Markdown/JSON exports.
- Browser-local autosave/restore with basic validation of saved data and migration of the original V1 drafts, including safe defaults for newly added source-reference records. The service worker only caches static resources and an offline notice, never the authenticated workspace HTML.
- Single-recipe JSON import with schema and HTTP(S)-URL validation, including recovery of older V1 exports.
- Whole-workspace JSON backup and restore: exports every local recipe draft plus the creator profile in one versioned archive; restore validates the entire archive, confirms before replacing current local drafts/profile, guards large files and estimated local-storage size, and leaves the archive on the user's device. This is a manual backup/restore flow, not cloud sync.
- Delete one draft or clear all local drafts with confirmation.
- Automated unit tests for URL validation, data shape, warnings, draft generation, JSON backup recovery, and scene count.
- Playwright browser tests for create/edit/reorder/reload/export, legacy JSON import and unsafe-URL rejection, plus a mobile-width overflow check.
- GitHub Actions workflow intended to run unit tests, ESLint, TypeScript check, and production build on pushes and pull requests.
- One-command quality gate: `npm run check` runs tests, lint, type-check and the production build in sequence.

## Owner-only sign-in and local setup

The workspace routes are gated by a server-verified owner session. There is no public sign-up. The server requires two private environment values: `OWNER_PASSWORD` (at least 16 characters) and `AUTH_SECRET` (at least 32 random bytes). If either is missing or too short, the workspace stays locked. The app signs an eight-hour session cookie using HMAC-SHA-256 and sets it `HttpOnly`, `SameSite=Strict`, and `Secure` on HTTPS. Sign-out clears the session cookie.

For local development, copy `.env.example` to `.env.local` and enter your own unique values in the local file. Keep `.env.local` private; it is ignored by Git. Generate a random `AUTH_SECRET` on your own device (for example, `openssl rand -base64 32`). Do not paste passwords or secrets into ChatGPT or commit them. The values written in the GitHub Actions workflow are disposable test-only credentials and must never be reused for a real app.

The login route includes a best-effort in-process failed-attempt throttle. This is **not** a distributed or hosting-level rate limiter and can reset when a serverless instance restarts. Before any public deployment, configure and verify host-level rate limiting and HTTPS, review server-route authorization, and complete the security acceptance checklist. Owner sign-in does not encrypt recipe data already stored in browser `localStorage`; anyone with access to the unlocked device/browser profile may still access that local data.

## Run locally

Requires Node.js 20.9+ and npm. After setting `.env.local` as described above:

```bash
npm install
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

## Important limitations

This remains a V1 prototype, not the finished AI video-production system. Structured source references are manual records only: the app still does not fetch or analyze source pages, transcribe videos, inspect frames, or resolve recipe disagreements automatically. Local drafts are stored in this browser on this device only. Owner-only route sign-in is implemented with server-side environment secrets and a signed cookie, but the app is not yet security-release-ready. Recipe data remains unencrypted in browser localStorage; there is no cloud backup or multi-device sync. Clearing browser storage can delete drafts, so export important work.

The creator profile is guidance for this deterministic text workflow, not an AI prompt system; language preference does not automatically translate content, and the never-say list is not a guaranteed automated filter. Profile data and recipe drafts are stored in localStorage without encryption. The app does **not** yet inspect or transcribe linked videos, verify recipes against multiple external sources, retrieve nutrition values from a food database, convert recipe units, independently verify nutrition values/sources, perform actual food-safety checks, generate the chef's voice/audio or animation, render a finished video, connect social accounts, schedule/publish posts, or provide analytics. Nutrition totals are arithmetic on manually entered values only, for the exact amount recorded; source links and amount/preparation bases must be checked by the creator. The tested status is a user-entered cooking-trial record, not independent verification. Trial photos are compressed in the browser (maximum stored data URL about 500 KB per photo) to reduce local-storage pressure; multiple photos may still fill browser storage, so export backups. The current share pack is text only, and native sharing support varies by browser/device; it does not attach video media. The narration generator is a deterministic text draft only: it uses saved inputs, records manual source notes as unverified, and does not infer missing ingredient-to-step mappings. Source URLs are not fetched or analyzed. Validation warnings are basic completeness checks, not proof that a recipe is correct or safe. Tutorial and narration previews/exports are drafts and are not published content.

## US-first product direction

The app is being designed for a US-first creator workflow and publishing strategy, while allowing recipes from any cuisine or country. Actual US platform integrations, account eligibility, scheduling, audience analytics, and monetization features must be evaluated and connected in later stages using official supported APIs and explicit account authorization. Reach and revenue cannot be guaranteed. Manual text-pack sharing is an early prepare-and-share step, not direct publishing. Direct platform publishing remains a later optional integration, subject to each platform's current rules and account review.

## Cost and privacy

The current prototype has no required AI API key or paid creative provider. GitHub Actions and Vercel availability/limits depend on account settings and may change. The repository is private, but that alone never made a deployment private; no successful Cooking Creator deployment is claimed. Do not add paid services, billing, card verification, credentials, or secret keys without explicit approval. Keep the repository private and do not commit credentials or private chef/background assets.
