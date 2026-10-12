# Zero-cost-only product policy

**Status:** Required project constraint  
**Applies to:** Every feature, setup step, development tool, deployment choice, and publishing integration in the Cooking Creator App.

## Non-negotiable rule

The app must remain usable with a **₹0 / $0 required spend**. Do not introduce a required paid subscription, metered API, paid credit, paid hosting tier, payment card, card verification, trial that later bills, or hidden usage charge. A feature that needs any of these cannot be part of the required path.

## Implementation rules

1. Prefer browser/device-local processing, open-source libraries, and free tiers that do not require payment details.
2. Do not add paid API calls, AI gateways, voice services, video-generation services, cloud databases, storage, analytics, or publishing services as mandatory dependencies.
3. Before adding any external service, record whether it is genuinely free, whether a card is required, what usage limits apply, and what happens at the limit. Recheck current terms before implementation because free tiers can change.
4. If a useful feature cannot be delivered at $0, keep it optional and disabled by default, or provide a manual/local alternative. Never silently switch to a paid fallback.
5. Avoid billing credentials and API keys in client code, browser storage, source control, or documentation. Never ask the user to share passwords or secret keys in chat.
6. Do not claim a capability works until it is implemented and tested. A documented integration idea is not a working integration.
7. Make budget constraints visible in the development checklist and review each dependency change for cost, privacy, and account requirements.

## Current free-first architecture

- The current V1 is a private prototype using Next.js/React and browser-local draft storage.
- Recipe research references, nutrition values, source comparisons, and verification notes are manually entered; the app does not currently fetch or independently verify sources.
- Narration, tutorial, content-pack and JSON/Markdown exports are local/deterministic text features; the app does not render a finished video.
- Sharing uses the device/browser share sheet or a text-download fallback; direct social publishing is not implemented.
- GitHub Actions currently runs the repository's automated checks. Its availability and limits are governed by the repository account's current GitHub plan.
- No paid AI/video/voice API is required by the current V1 workflow.

## Feature acceptance gate

Before a feature is accepted, confirm:

- [ ] Core path requires no payment and no payment-card verification.
- [ ] No metered service can be called accidentally.
- [ ] If a free-tier quota is exhausted, the app fails safely and explains the limitation without billing.
- [ ] A manual or local alternative exists wherever practical.
- [ ] Dependencies, setup steps, limits, privacy, and test results are documented.
- [ ] README and V1 acceptance checklist describe the feature accurately.

## Important trade-off

A truly free build may not be able to automate every desired capability at production quality. AI video generation, realistic character animation, hosted voice generation, cloud processing, and automatic posting often depend on changing third-party plans or platform approvals. Do not promise these at $0 until a verified, no-card, no-charge implementation is available. Build the app in modular stages so a free local/manual path remains usable.
