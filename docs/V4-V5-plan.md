# Cooking Creator App — V4 and V5 Delivery Plan

**Project:** `menishkumarmv07/Cook-`  
**Branch:** `v3/ai-chef-content-studio` (V4/V5 work remains isolated from V2/main)  
**Hard constraints:** ₹0/no card/no paid credits, no surprise uploads, protect owner references, no bypassing age/platform rules, owner approval before publication, no promised earnings.

## Product definition

The app is a personal cooking-content production and business-planning workspace. It can help plan original content, check recipe evidence, assemble owner-supplied clips, prepare captions, track business relationships, model scenarios, and learn from actual creator metrics. It cannot guarantee reach, acceptance into a monetization programme, sponsorships, commission, or income. An "earning machine" is not an honest product claim; the target is an evidence-led workflow that reduces avoidable errors and improves the quality of experiments over time.

## V4 — Revenue Scenario Planner

### Implemented and automated checks green; production release gates remain open

- Added `lib/revenue-scenario.ts` with bounded inputs, validation, scenario math, safe JSON backup parsing, and explicit unknown assumptions.
- Added `components/revenue-scenario-planner.tsx` and a **Revenue scenarios** sub-navigation screen under the existing Monetization Readiness workspace.
- Models separate ad-RPM, affiliate conversion/commission, sponsorship, and operating-cost assumptions. It distinguishes an editable target from modeled net subtotal and from actual received income.
- Blank rates remain unknown; a stream with activity but missing rates displays **Needs an assumption** and is excluded from the modeled subtotal rather than silently called zero revenue.
- Calculates additional monthly views needed only when the required assumptions are present. Outputs remain scenario estimates and are not added to actual revenue records.
- Settings save locally in a dedicated versioned key; JSON backup import is size-limited, validated and confirmation-gated. Corrupt saved data is left untouched until the owner explicitly replaces it.
- Added unit tests for scenarios, missing assumptions, numeric boundaries, backup round-tripping and malformed backups; added a browser test for assumptions, output, reload persistence, export, and mobile horizontal overflow.
- The default $1,500/month number is only an editable planning target (equivalent to $50/day over 30 days). It is not a rate, forecast, or implied achievable result. All RPM/conversion/fee figures should come from the owner's own current, appropriately scoped dashboard or be labelled hypothetical.

### V4 release criteria

- Exact-head audit, unit tests, lint, type check, production build, owner-auth smoke and desktop/mobile E2E passed on code commit `8620d8bf17a451479bda3d45320bc7a26621ce72` (run #821); following docs-only HEAD `d6ef810a016ef452a6f506922266a26994bc2237` also passed run #822.
- Review the revenue formula and edge cases on both desktop and mobile; confirm unknown rates cannot create an overconfident result.
- Check export/import restoration in a real browser and ensure estimates do not mutate the separate actual-receipts ledger.
- Keep publication and external account integrations manual. No API keys, external uploads, paid provider or platform connection is required for this planner.
- Mark V4 **verified** only after the checks above; mark it **production released** only after compliant hosting, authentication, privacy, and owner-device acceptance are also satisfied.

## V5 — Evidence-led Creator Growth Loop

V5 should improve the existing Growth Lab, Editorial Calendar and Monetization Readiness modules rather than fork their logic or introduce a second competing database.

### Functional scope

1. **Evidence intake:** record only the data shown by the owner's platform dashboards; preserve platform, content ID/title, period/date, metric name, actual-versus-estimate label, and source/evidence note. Keep estimated values separate from actual observations.
2. **Experiment design:** each experiment states one hypothesis, the single main variable to change, audience/platform, start date, a measurable outcome, a planned review date and a next action. Do not treat observational comparisons as proof of causation.
3. **Decision review:** produce cautious, plain-language summaries only when sample-size gates are met. Show missing data, conflicting periods, estimates, small sample sizes and alternative explanations. Never create fake numeric values or promise growth.
4. **Content feedback loop:** allow an owner to record which hook, recipe step, camera framing, duration, narration, caption, or original contribution was tested. Recommend a follow-up experiment only from entered evidence; do not infer unseen video details from a title or view count.
5. **Monetization alignment:** compare the owner's actual receipts and documented costs against their own target without merging estimates, offers or contracted amounts into paid receipts. Keep affiliate/sponsorship disclosures, rights review, age/guardian eligibility and payment records visible.
6. **Scheduling remains owner-controlled:** calendar suggestions and reminders may be local. Posting, account access, trend scraping, auto-commenting, purchasing ads and changing account details stay unconnected unless separately reviewed and explicitly authorised.
7. **Backup/privacy:** keep local-first data, validate imports, detect duplicates, support JSON/CSV export, and show visible warnings that browser storage is not encrypted at rest. Do not include API secrets or personal identity/payment documents.

### V5 acceptance criteria

- Tests cover actual versus estimated values, invalid dates, duplicate imports, small samples, missing metrics, unusual outliers, empty datasets, malformed CSV/JSON, and experiments with future/missing dates.
- Every output is reproducible from its displayed input records and labels; no opaque "AI score" claims; no income or view guarantees.
- One-variable experiment advice is presented as a hypothesis to test, not a causal finding.
- Existing V1/V2 behavior and all V3 recipe/evidence/rendering guardrails remain intact; desktop/mobile E2E passes.
- Physical Android Chrome performance and exports are checked with owner-controlled data; public CI uses synthetic non-private fixtures only.
- No social publishing, analytics API, payment processing, affiliate tracking pixel, or provider data collection is silently introduced.

## Non-negotiable visual and video policy

The owner-provided chef turnaround and two warm, timber/green-brick kitchen views are private visual references. The project may preserve the clothing, sunglasses, broad silhouette, kitchen materials and cinematic lighting direction, but the fictional chef must remain clearly original. Do not reproduce Brad Pitt's exact facial identity or clone his voice or performance. Use an original voice or owner-recorded narration. The reference notes added for new V3 projects do not import private image bytes or prove any real clip is consistent.

A real cooking video requires continuous plausible movement, hand/tool contact, coherent ingredient and food-state progression, stable scene identity, readable synced captions/audio, and a downloaded file that reopens and plays. Synthetic CI clips prove only the rendering path. If a current generator cannot meet ₹0/no-card, regional access, reference support, privacy, commercial rights and realistic quality gates, leave AI generation marked unavailable and use the local owner-footage editor instead.

## Compliance and earnings guardrails

- US audience targeting does not remove applicable Indian law or platform terms. The app is a workbench, not legal or tax advice.
- Brand gifts, sponsorships and affiliate relationships require clear and conspicuous disclosures appropriate to the platform/content. See the [FTC's influencer disclosure guidance](https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers).
- YouTube monetization is programme- and feature-specific and subject to policy review; check current [YouTube Partner Program eligibility](https://support.google.com/youtube/answer/72851?hl=en) and [monetization feature requirements](https://support.google.com/youtube/answer/94522?hl=en) before relying on a specific feature.
- Some creator marketplaces and payouts have minimum-age or guardian requirements. Check the platform's current official terms; never falsify age or bypass review.
- Do not buy followers/views, scrape private data, copy others' videos, impersonate a real person, or mass-publish repetitive low-value templates.

## Current external release blockers

- The repository is public at the current checkpoint. Owner references, voice recordings and private footage must not be committed while it remains public. The owner intends to change repository visibility after the project is finished; before doing so, review secrets/history and access paths.
- The current Vercel Hobby terms restrict use to personal/non-commercial use and impose account eligibility terms; this does not fit an intended monetized production workflow without further resolution. See [Vercel Terms of Service](https://vercel.com/legal/terms). Do not pay, add card details, misstate account eligibility or route around provider rules. A compliant ₹0/no-card commercial production host has not yet been verified.
- Reference-guided AI cooking generation is not enabled. The actual private chef/kitchen files have not been imported into the app from this conversation, and no real owner-footage export has passed a manual realism/audio/caption review.
- Physical Android Chrome acceptance has not been observed by this workflow.
- These external/owner-controlled gates cannot be made green by automated unit tests or by writing a plan. Maintain truthful status until evidence exists.

## Release sequence

1. Finish V4 implementation CI on the exact head and fix any real failures before proceeding.
2. Verify V4 browser persistence, export/restore, mobile layout, and no regression to the existing workspace.
3. Close V3 owner-media, physical Android, and privacy/hosting acceptance gates without paid services or age-policy bypass.
4. Implement V5 slices in a separate focused PR/commit series, each with tests and a clean rollback path.
5. Run the full test suite on one exact commit, confirm deployment maps to that commit, then perform human/physical-device acceptance.
6. Only then consider removing draft status/merging; do not call the app 100% complete while any external release gate is open.
