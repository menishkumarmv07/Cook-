# Private, owner-only app security plan

**Requirement:** This is a personal app for one owner only. It must not be a public multi-user product. Required spend remains ₹0 / $0.

## Current security status — do not overstate it

- The GitHub repository is intended to stay private. Repository privacy does **not** automatically make a deployed website private.
- The current V1 prototype saves recipe/profile data in browser localStorage without encryption and has no owner sign-in or authorization gate. Anyone with access to that browser profile may be able to open the app and view its saved data.
- There is no verified live deployment. Do not publish or expose a public URL until an owner-only access control has been implemented and tested.
- A client-side PIN alone is not sufficient owner authentication: a visitor can potentially bypass client code or inspect browser data.

## Required security design before private deployment

1. **Single owner only:** no public sign-up, invitations, shared workspaces, or additional user accounts.
2. **Real access control:** if hosted, enforce authentication and authorization on the server for every private page and data/API route. Hiding a button or adding a client-only PIN is not enough.
3. **No public deployment before the gate passes:** keep development local or in the private repository until owner-only access tests pass. A private source repository does not protect a public deployment.
4. **Zero-cost gate:** any hosting/auth option must be checked for current no-card/no-billing requirements and limits before use. If no verified $0 option meets the security requirement, use the local-only path rather than weakening security or silently adding billing.
5. **Secrets:** never place passwords, session secrets, API keys, recovery codes, or private chef assets in source code, client bundles, localStorage, Git commits, or chat. Use a password manager for credentials.
6. **Browser data:** localStorage is not encrypted storage. Before treating recipes/photos as sensitive, implement and test a data-protection design; explain recovery and backup behavior clearly. Treat exported JSON backups and cooking-trial photos as private files.
7. **Session protections for any hosted version:** secure, HttpOnly, SameSite cookies; HTTPS only; appropriate session expiry and logout; CSRF protections where applicable; rate limits for authentication; no public registration; no secrets in URLs or logs.
8. **Dependency and deployment checks:** pin dependencies with a lockfile, run unit tests/lint/type checks/build and desktop/mobile browser tests, review security-sensitive changes, and confirm the exact deployed URL and access behavior manually.
9. **Privacy by default:** no analytics, trackers, external AI calls, uploads, cloud sync, or third-party data sharing unless separately reviewed for privacy and zero cost. Recipe/source URLs are user data and should not be fetched automatically without an explicit design review.

## Release-blocking acceptance tests

- Signed-out visitor cannot access any private page, saved data, backup endpoint, or API route.
- Only the owner can sign in; public sign-up is absent.
- Logging out and session expiry remove access.
- Direct URL navigation and API requests are denied without an authorized session.
- No private recipe/profile/photo data appears in HTML, public assets, logs, or unauthenticated responses.
- Mobile Chrome and desktop tests cover sign-in, denied access, session expiry, logout, and restore behavior.
- CI passes; real Android Chrome is manually checked; zero-cost terms are verified. A green CI run alone does not prove production security.

## Safe current usage

Until the release blockers are satisfied, keep the app local on a device you control, secure that device with its screen lock, do not share the browser profile or exported backups, and do not treat the prototype as a secured private web app. This is a temporary safety boundary, not a claim that the app already has high-security authentication.
