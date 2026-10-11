# Cooking Creator Studio

Private V1 foundation for the AI Cooking Creator App. This repository and its notes are separate from the App Market/MV and GKworks projects.

## Current V1 features

- Responsive recipe creator dashboard.
- Recipe intake with HTTP(S) source URL, servings/yield, and notes.
- Structured ingredient rows: amount, unit, name, preparation note.
- Ordered cooking-step editor: action, timing, heat/setting, and visual/doneness cue.
- Six-scene creator outline that can be edited.
- Rule-based validation warnings for missing amounts, units, steps, timings, serving count, source analysis, food safety, and nutrition.
- Deterministic Markdown tutorial draft preview and Markdown/JSON exports.
- Browser-local autosave/restore with basic validation of saved data and migration of the original V1 drafts.
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

This remains a V1 prototype, not the finished AI video-production system. Local drafts are stored in this browser on this device only. This is **not** owner authentication, encrypted storage, cloud backup, or multi-device sync. Clearing browser storage can delete drafts, so export important work.

The app does **not** yet inspect or transcribe linked videos, verify recipes against multiple external sources, calculate nutrition, perform actual food-safety checks, generate the chef's voice/video, render a finished video, connect social accounts, schedule/publish posts, or provide analytics. Source URLs are not fetched or analyzed. Validation warnings are basic completeness checks, not proof that a recipe is correct or safe. Tutorial previews and exports are drafts and are not published content.

## US-first product direction

The app is being designed for a US-first creator workflow and publishing strategy, while allowing recipes from any cuisine or country. Actual US platform integrations, account eligibility, scheduling, audience analytics, and monetization features must be evaluated and connected in later stages using official supported APIs and explicit account authorization. Reach and revenue cannot be guaranteed. Publishing remains planned for V6.

## Cost and privacy

The current prototype has no required AI API key or paid creative provider. GitHub Actions and Vercel availability/limits depend on account settings and may change. Do not add paid services, billing, card verification, credentials, or secret keys without explicit approval. Keep the repository private and do not commit credentials or private chef/background assets.
