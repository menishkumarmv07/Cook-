# Cooking Creator Studio

Private V1 foundation for the AI Cooking Creator App. This repository and its notes are separate from the App Market/MV and GKworks projects.

## Current V1 features

- Responsive recipe creator dashboard.
- Installable PWA manifest, SVG app icon, service-worker app-shell caching, and offline fallback page; offline reopening is verified in CI after the first connected visit.
- Recipe intake with HTTP(S) source URL, servings/yield, and notes.
- Structured ingredient rows: amount, unit, name, preparation note.
- Ordered cooking-step editor: action, timing, heat/setting, and visual/doneness cue.
- Six-scene creator outline that can be edited.
- Rule-based validation warnings for missing amounts, units, steps, timings, serving count, source analysis, food safety, and nutrition.
- Structured multi-source research desk for recipe pages, videos/Reels, transcripts, and other references; captures what was checked and unresolved differences, flags invalid/duplicate URLs, and exports the evidence log without claiming independent verification.
- Narration-script preview, copy, and plain-text export with ingredient callouts, ordered cooking narration, recorded timing/heat/visual cues, serving count, manual source uncertainties, and pre-recording checks. Missing details are flagged rather than invented.
- Creator-entered cooking-trial rating and notes; recipes start Untested and require a real trial before being marked Tested.
- Explicit approval gate before sharing, with recipe edits resetting Tested and approval status.
- Short-form text content pack with five hook options, a caption draft, hashtags, CTA, narration/shot guidance, and manual source/review notes.
- Prepare-and-share workflow using the browser/Android share sheet when available, with a text download fallback. Sharing is manual; no direct platform API publishing is implemented.
- Deterministic Markdown tutorial draft preview and Markdown/JSON exports.
- Browser-local autosave/restore with basic validation of saved data and migration of the original V1 drafts, including safe defaults for newly added source-reference records. Service-worker caching supports reopening the shell offline after the app has first been loaded online; it does not add cloud sync.
- JSON backup import with schema and HTTP(S)-URL validation, including recovery of older V1 exports.
- Delete one draft or clear all local drafts with confirmation.
- Automated unit tests for URL validation, data shape, warnings, draft generation, JSON backup recovery, and scene count.
- Playwright browser tests for create/edit/reorder/reload/export, legacy JSON import and unsafe-URL rejection, plus a mobile-width overflow check.
- GitHub Actions workflow intended to run unit tests, ESLint, TypeScript check, and production build on pushes and pull requests.
- One-command quality gate: `npm run check` runs tests, lint, type-check and the production build in sequence.

## Run locally

Requires Node.js 20.9+ and npm.

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

The GitHub Actions workflow also installs Chromium and runs the Playwright end-to-end suite against the production build. The checks are configured, but do not consider them passed until the workflow or local commands actually complete successfully. The workflow does not use a lockfile yet; once CI has run successfully, commit a generated `package-lock.json` and switch CI to `npm ci` for reproducible installs.

For the Android/Chrome manual acceptance pass, follow [the V1 acceptance checklist](docs/V1-acceptance-checklist.md). Automated checks do not replace real-device testing.

## Important limitations

This remains a V1 prototype, not the finished AI video-production system. Structured source references are manual records only: the app still does not fetch or analyze source pages, transcribe videos, inspect frames, or resolve recipe disagreements automatically. Local drafts are stored in this browser on this device only. This is **not** owner authentication, encrypted storage, cloud backup, or multi-device sync. Clearing browser storage can delete drafts, so export important work.

The app does **not** yet inspect or transcribe linked videos, verify recipes against multiple external sources, calculate nutrition, perform actual food-safety checks, generate the chef's voice/audio or animation, render a finished video, connect social accounts, schedule/publish posts, or provide analytics. The tested status is a user-entered cooking-trial record, not independent verification. The current share pack is text only, and native sharing support varies by browser/device; it does not attach video media. The narration generator is a deterministic text draft only: it uses saved inputs, records manual source notes as unverified, and does not infer missing ingredient-to-step mappings. Source URLs are not fetched or analyzed. Validation warnings are basic completeness checks, not proof that a recipe is correct or safe. Tutorial and narration previews/exports are drafts and are not published content.

## US-first product direction

The app is being designed for a US-first creator workflow and publishing strategy, while allowing recipes from any cuisine or country. Actual US platform integrations, account eligibility, scheduling, audience analytics, and monetization features must be evaluated and connected in later stages using official supported APIs and explicit account authorization. Reach and revenue cannot be guaranteed. Manual text-pack sharing is an early prepare-and-share step, not direct publishing. Direct platform publishing remains a later optional integration, subject to each platform's current rules and account review.

## Cost and privacy

The current prototype has no required AI API key or paid creative provider. GitHub Actions and Vercel availability/limits depend on account settings and may change. Do not add paid services, billing, card verification, credentials, or secret keys without explicit approval. Keep the repository private and do not commit credentials or private chef/background assets.
