# V4/V5 Build Log — Cooking Creator

## Latest implementation checkpoint — 27 October 2026

**Current code slice:** V4 revenue scenario planning + V5 provisional experiment-evidence review.  
**Branch:** `v3/ai-chef-content-studio`.  
**Base remains:** V2/main `5d0da951e2a73c5098ba82308f23438556b3f80c`.  
**Latest feature commit at checkpoint:** `7529ef1915c1fdf6b35ef90884df0cca702349b9`.  
**Automated verification:** GitHub Actions run [#817](https://github.com/menishkumarmv07/Cook-/actions/runs/40489248209) is pending at this checkpoint; no V4/V5 code result is declared passed until that exact-head run completes.

### V4 — Revenue Scenario Planner

- New module `lib/revenue-scenario.ts` validates bounded, user-entered inputs and calculates ad-RPM, affiliate, sponsorship and operating-cost scenarios.
- Unknown revenue assumptions remain unknown when activity exists but a required rate is absent. Incomplete streams are not silently reported as known zero revenue.
- “Additional monthly views needed” is calculated only when the view RPM and the other active revenue assumptions are present. The default $1,500/month is an editable target only, not a forecast.
- New `components/revenue-scenario-planner.tsx` adds local save/restore, validated JSON export/import and visible assumption caveats. It is reachable via **Monetization Readiness → Revenue scenarios**.
- Unit test file: `tests/revenue-scenario.test.ts`. Browser test: `revenue scenario planner labels estimates, persists locally and exports assumptions`.
- Source/module/UI/test integration commit range is included in PR #83; final CI is required to confirm type, build and real browser behavior.

### V5 — Experiment evidence review

- New `summarizeGrowthExperimentEvidence()` function in `lib/growth-lab.ts` provisionally matches metric rows to an experiment using platform, date window and exact title when supplied.
- It keeps estimates separate, summarizes actual views/median retention/entered content-level revenue only from valid actual rows, warns when samples are small, and states that this matching is descriptive and does not show causation.
- Growth Lab now displays this information only when the owner clicks **Check matching metrics** on an experiment card. The collapsed-on-demand panel avoids calculating matches for every experiment during every render.
- New unit tests cover exact matching, date/platform/title exclusions, estimate separation, small-sample warnings and malformed experiment input. The existing Growth Lab browser flow asserts the new panel and safe caveats.
- No social account connection, publication, scraping, data upload, paid API, or model call was added.

### Guardrails and known limits

- This is evidence-led planning, not an income promise. Actual revenue, offers, contracts and estimates remain separate in the existing workspace.
- No celebrity face/voice impersonation was added. The fictional chef continuity starter reflects broad visual styling only; reference files have not been auto-imported or committed.
- V1/V2 code is still isolated from the main branch because PR #83 remains draft/unmerged. Do not merge until all tests and owner acceptance gates pass.
- The existing V3 blockers are still open: reference-guided AI video generation under the user's ₹0/no-card/privacy/commercial-rights constraints is not enabled; actual owner-footage export realism/audio/caption review is pending; physical Android Chrome acceptance is pending; and compliant commercial/private hosting has not been verified. The GitHub repository is still public at this checkpoint.
- Vercel Hobby Terms currently restrict use to personal/non-commercial use; this project’s intended monetized creator workflow must not be deployed as production until an eligible, terms-compatible hosting decision is made. Do not buy credits, enter payment details, falsify eligibility, or bypass provider terms.

### Exact-head status rule

Only the final status from the latest completed workflow run may be copied into this log. If a test fails, inspect its step log, fix the code on the same feature branch, and wait for a new exact-head run before recording success. A ready deployment is not proof of authenticated owner acceptance or physical-device success.
