# Private App Security Plan — Owner-only V1

## Non-negotiable rules
- One owner only. No public sign-up, invites, user directory, or multi-user accounts.
- Do not deploy until access control and release checks pass.
- No paid services, API credits, card verification, or hidden billing are allowed by default.
- Keep this app separate from App Market/MV and GKworks.
- Use white surfaces, black text, grayscale details, mobile-first layout, and adjustable design tokens.

## Current implementation branch
`feat/owner-only-access-gate` adds:
- A password-only login screen; it has no registration flow.
- A server login endpoint that checks an environment-configured owner password.
- A signed, eight-hour, HTTP-only session cookie with SameSite=Strict and Secure in production.
- Middleware guarding pages and API routes, returning a redirect for pages and 401 for anonymous API requests.
- A logout endpoint that expires the cookie.
- A minimal environment template with placeholders only.

## Required environment secrets
- `COOKING_OWNER_PASSWORD`: long, unique password; set only in local environment or encrypted hosting secrets.
- `COOKING_SESSION_SECRET`: at least 32 random characters. Generate locally; never commit the actual value or share it in chat.
- If either value is absent or invalid, the app must fail closed.

## Important limitations and follow-up work
This is an initial access boundary, not a completed security audit. Login currently has no built-in rate limiter; add hosting-edge rate limiting before deployment. Test production HTTPS and secure cookies. Review CSRF defenses before adding any state-changing API routes. Confirm middleware coverage for every future route and asset. Browser-local recipe data remains readable by anyone who can access the unlocked browser profile and is not encrypted at rest. A private GitHub repository alone does not make a hosted website private.

## Release-blocking verification
- [ ] Anonymous requests cannot reach the workspace or protected APIs.
- [ ] Wrong password does not create a session.
- [ ] Missing secrets fail closed.
- [ ] Expired and tampered sessions are rejected.
- [ ] Cookie attributes are correct in production.
- [ ] Logout expires the session.
- [ ] Rate limiting and HTTPS are enabled.
- [ ] `npm run check` and `npm run e2e` pass.
- [ ] Manual Android/Chrome tests pass.
- [ ] Deployment URL is tested independently before calling it private.
