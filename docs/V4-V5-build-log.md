# V4/V5 Build Log — Cooking Creator

## Latest verified code checkpoint — 27 October 2026

**Project:** `menishkumarmv07/Cook-`  
**Branch:** `v3/ai-chef-content-studio`  
**Verified code commit:** `8620d8bf17a451479bda3d45320bc7a26621ce72`  
**Base remains:** V2/main `5d0da951e2a73c5098ba82308f23438556b3f80c`  
**Exact-head GitHub Actions:** [run #821](https://github.com/menishkumarmv07/Cook-/actions/runs/40490715760) — **SUCCESS**.  
**Exact-head Vercel preview:** [deployment inspector](https://vercel.com/menishkumarmv07/cook/9oFXNnMJDKmbxnc1xuDqaw3o9UZN) — **READY**, mapped to the same SHA.

### Verification results

- Dependency audit: **0 vulnerabilities**.
- Unit tests: **238 passed, 0 failed**.
- Owner-auth browser smoke: **10 passed**.
- Desktop/mobile Playwright E2E: **112 passed**.
- ESLint, TypeScript check, production build, Chromium setup: **all passed**.
- Vercel aggregated runtime-error query for the last 24 hours: **no runtime errors found**. A targeted preview-runtime query for the last 30 minutes returned no error/fatal logs. Runtime log retention is limited on Hobby; absence of logs in this window is not proof of zero errors or complete traffic coverage.
- No test password or secret value is stored in this document. The owner-auth smoke uses a test-only CI configuration and does not establish that the production account has been successfully unlocked by the owner on their physical device.

### V4 — Revenue Scenario Planner

- Added `lib/revenue-scenario.ts` for bounded, user-entered inputs and separately calculated ad-RPM, affiliate, sponsorship and operating-cost scenarios.
- Unknown revenue assumptions stay unknown when activity exists but a required rate is missing; incomplete streams are not silently reported as known zero revenue.
- “Additional monthly views needed” is calculated only when the required assumptions are present. The default $1,500/month is an editable planning target, not a forecast.
- Added `components/revenue-scenario-planner.tsx` with local save/restore, validated JSON export/import and explicit caveats. Access path: **Monetization Readiness → Revenue scenarios**.
- Unit tests: `tests/revenue-scenario.test.ts`. E2E coverage verifies unknown RPM handling, modeled arithmetic, persistence, JSON export and mobile-width overflow.

### V5 — Experiment evidence review

- Added `summarizeGrowthExperimentEvidence()` in `lib/growth-lab.ts` to provisionally match metric rows to an experiment by platform, date window and exact title when supplied.
- Estimates stay separate; only valid actual rows feed the actual views, median-retention and entered content-level revenue summaries. The panel warns about small samples and makes clear that a record match does not establish causation.
- Growth Lab renders this only when the owner clicks **Check matching metrics** on an experiment card.
- Unit tests cover platform/title/date exclusions, estimate separation, small-sample warnings and invalid experiment input. Browser tests cover the new panel and cautionary language.
- No external social connection, publication, scraping, paid API, unexpected upload or model call was added.

### Important non-code release blockers

- PR #83 remains **OPEN / DRAFT / NOT MERGED** so V1/V2 remains isolated from main.
- GitHub still reports the repository as **PUBLIC**. Do not place private reference files, private footage, voice recordings or credentials in the repository. The currently available GitHub connector actions do not expose the visibility-change operation; public visibility has not been silently represented as fixed.
- Reference-guided realistic AI cooking-video generation satisfying all of the user's ₹0/no-card/privacy/commercial-rights conditions is **not enabled**. A local renderer for owner-supplied footage exists, but real footage has not passed manual review for plausible actions, food-state progression, playback, audio and caption sync. Synthetic CI clips test rendering mechanics only.
- Physical Android Chrome acceptance has not been directly observed in this workflow. Playwright mobile-emulation coverage is not a substitute for an owner using their actual Android device.
- Hosting/privacy compliance remains unresolved for the intended monetized use. The current Vercel Hobby plan is not an accepted production solution for this project's commercial/private requirements. Do not pay, add card details, misstate account eligibility or bypass provider terms.
- The app assists a creator workflow; it cannot guarantee views, audience growth, platform approval, sponsorships, or income. Use actual platform metrics and receipts separately from estimates, obey platform rules, keep disclosures clear, and avoid celebrity impersonation or copied cooking footage.

## Release rule

The exact code commit `8620d8bf17a451479bda3d45320bc7a26621ce72` passed the automated checks listed above. Any later code change needs its own completed exact-head CI run. A successful automated run and READY preview do not satisfy the unresolved owner media, device, repository-privacy and compliant-hosting gates. Do not call V3/V4/V5 a fully released production product until those external and owner-controlled gates have evidence of completion.
