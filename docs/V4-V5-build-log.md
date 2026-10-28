# V4/V5 Build Log — Cooking Creator

## Latest re-test — 28 October 2026

- **Current branch head:** `dbd1a084d6f695f8738e47a85cbc45f5da38f02c` on `v3/ai-chef-content-studio`; the stable V1/V2 base remains `5d0da951e2a73c5098ba82308f23438556b3f80c`.
- **Latest exact-head CI:** [GitHub Actions run #829](https://github.com/menishkumarmv07/Cook-/actions/runs/40654842346) — **SUCCESS**. Detailed logs confirm npm audit **0 vulnerabilities**, **238/238 unit tests**, owner-auth browser smoke **10/10**, desktop/mobile Playwright **112/112**, ESLint, TypeScript, production build and Chromium setup all passed. The previous three unused-variable lint warnings were removed by a test-only cleanup. npm still emits a deprecated-version warning for ESLint; the dependency support status should be reviewed separately rather than upgrading without compatibility tests.
- **Exact-head preview:** [open the preview](https://cook-pt8ipok9w-menishkumarmv07.vercel.app/) · [deployment inspector](https://vercel.com/menishkumarmv07/cook/4ssx5JUzyoFbpGHHNVmvoUfydMkg) — **READY**, mapped to the same `dbd1a084...` SHA.
- **V1–V5 review:** V1 recipe/content foundation and V2 research/planning/monetisation-readiness workflows have automated regression coverage. V3 provides blueprint/local-reference/owner-footage rendering foundations, but no validated realistic AI-video generator. V4 revenue scenarios are assumption-based estimates, not a forecast. V5 growth experiments and metric matching use manual evidence and do not prove causality or earnings.
- **Still not closed by automated tests:** GitHub repository remains public; eligible production hosting for the planned private/commercial workflow is unresolved; owner-approved canonical chef/kitchen references and real footage have not passed manual visual/audio/caption review; physical Android Chrome acceptance and the full V1 hands-on cooking/device checklist are outstanding. PR #83 remains open/draft/unmerged. No private footage or secrets should be added to the public repository.
- The detailed version-by-version decision is in [`docs/V1-V5-audit.md`](https://github.com/menishkumarmv07/Cook-/blob/v3/ai-chef-content-studio/docs/V1-V5-audit.md). This is the latest **engineering verification**, not a claim that production release or monetization has been completed.

## Latest verified code checkpoint — 27 October 2026 (16:56 UTC)

**Project:** `menishkumarmv07/Cook-`  
**Branch:** `v3/ai-chef-content-studio`  
**Verified code commit:** `0710b00807ec7f07b769ae78a71ee3981f540ac4`  
**Base remains:** V2/main `5d0da951e2a73c5098ba82308f23438556b3f80c`  
**Exact-head GitHub Actions:** [run #824](https://github.com/menishkumarmv07/Cook-/actions/runs/40545214098) — **SUCCESS** on the exact code SHA.  
**Exact-head Vercel preview:** [open the preview](https://cook-19ccceqq1-menishkumarmv07.vercel.app/) · [deployment inspector](https://vercel.com/menishkumarmv07/cook/GVrk4nmzYADykPcmffrw4JxKf1pj) — **READY**, mapped to the same SHA.

### Verification results

- Dependency audit: **0 vulnerabilities**.
- Unit tests: **238 passed, 0 failed**.
- Owner-auth browser smoke: **10 passed**.
- Desktop/mobile Playwright E2E: **112 passed**.
- ESLint, TypeScript check, production build, Chromium setup: **all passed**.
- The initial run #823 identified two regression-test issues in the new experiment plan/legacy migration; these were corrected and the next exact-head run #824 passed. The failed run is retained in history: [run #823](https://github.com/menishkumarmv07/Cook-/actions/runs/40544991859).
- Earlier limited Vercel log queries reported no runtime errors in their requested windows. This is not proof of zero errors or complete traffic coverage.
- No test password or secret value is stored in this document. The owner-auth smoke uses test-only CI configuration and does not establish that the owner completed authentication on a physical device.

### V4 — Revenue Scenario Planner

- Added `lib/revenue-scenario.ts` for bounded, user-entered inputs and separately calculated ad-RPM, affiliate, sponsorship and operating-cost scenarios.
- Unknown revenue assumptions stay unknown when activity exists but a required rate is missing; incomplete streams are not silently reported as known zero revenue.
- “Additional monthly views needed” is calculated only when the required assumptions are present. The default $1,500/month is an editable planning target, not a forecast.
- Added `components/revenue-scenario-planner.tsx` with local save/restore, validated JSON export/import and explicit caveats. Access path: **Monetization Readiness → Revenue scenarios**.
- Unit tests: `tests/revenue-scenario.test.ts`. E2E coverage verifies unknown RPM handling, modeled arithmetic, persistence, JSON export and mobile-width overflow.

### V5 — Experiment evidence review and planned experiment design

- Added `summarizeGrowthExperimentEvidence()` in `lib/growth-lab.ts` to provisionally match metric rows to an experiment by platform, date window and exact title when supplied.
- Estimates stay separate; only valid actual rows feed the actual views, median-retention and entered content-level revenue summaries. The panel warns about small samples and makes clear that a record match does not establish causation.
- New experiments now require an intended audience, one primary outcome metric, start date and planned review date, in addition to a hypothesis and one changed variable. The card keeps those design details editable.
- Growth Lab renders evidence matching only when the owner clicks **Check matching metrics** on an experiment card.
- Backup schema version 3 migrates older V1/V2 records by leaving newly introduced planning fields blank instead of inventing data. Tests cover strict new-plan validation, malformed fields, and legacy migration.
- Exact-head run #824 covers these changes: 238 unit tests, owner-auth smoke 10/10, Playwright desktop/mobile 112/112, dependency audit 0 vulnerabilities, ESLint, TypeScript and production build all passed.
- No external social connection, publication, scraping, paid API, unexpected upload or model call was added.

### Important non-code release blockers

- PR #83 remains **OPEN / DRAFT / NOT MERGED** so V1/V2 remains isolated from main.
- GitHub still reports the repository as **PUBLIC**. Do not place private reference files, private footage, voice recordings or credentials in the repository. The currently available GitHub connector actions do not expose the visibility-change operation; public visibility has not been silently represented as fixed.
- Reference-guided realistic AI cooking-video generation satisfying all of the user's ₹0/no-card/privacy/commercial-rights conditions is **not enabled**. A local renderer for owner-supplied footage exists, but real footage has not passed manual review for plausible actions, food-state progression, playback, audio and caption sync. Synthetic CI clips test rendering mechanics only.
- Physical Android Chrome acceptance has not been directly observed in this workflow. Playwright mobile-emulation coverage is not a substitute for an owner using their actual Android device.
- Hosting/privacy compliance remains unresolved for the intended monetized use. The current Vercel Hobby plan is not an accepted production solution for this project's commercial/private requirements. Do not pay, add card details, misstate account eligibility or bypass provider terms.
- The app assists a creator workflow; it cannot guarantee views, audience growth, platform approval, sponsorships, or income. Use actual platform metrics and receipts separately from estimates, obey platform rules, keep disclosures clear, and avoid celebrity impersonation or copied cooking footage.

## Release rule

The current V5 code commit `0710b00807ec7f07b769ae78a71ee3981f540ac4` passed exact-head GitHub Actions [run #824](https://github.com/menishkumarmv07/Cook-/actions/runs/40545214098), including 238 unit tests, owner-auth smoke 10/10, Playwright desktop/mobile 112/112, dependency audit, lint, TypeScript and production build. The following documentation-only commit `9f2aac769096ad2aed7e1d3208d30c73fc7e9866` also passed [run #825](https://github.com/menishkumarmv07/Cook-/actions/runs/40545991084). A READY preview was mapped to each corresponding SHA. Automated tests do not satisfy the unresolved owner media, physical-device, repository-privacy and compliant-hosting gates. Do not call V3/V4/V5 a fully released production product until those external and owner-controlled gates have evidence of completion.
