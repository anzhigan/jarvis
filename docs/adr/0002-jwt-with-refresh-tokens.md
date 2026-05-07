# ADR-0002: JWT access + refresh, no server-side sessions

**Date:** 2026-05-07
**Status:** Accepted

## Context

The app has a web client (SPA) and a native iOS client (Capacitor). The iOS client lives outside the same-origin cookie domain — server-side cookie sessions don't work cleanly across both.

## Decision

**JWT pair**:
- **Access token** — short TTL (60 min). Sent in `Authorization: Bearer <token>` on every API call.
- **Refresh token** — long TTL (30 days). Stored in localStorage on web, in iOS Keychain (via Capacitor Preferences) on native. Used only against `/auth/refresh` to mint a new access token.

**Storage:**
- Web: both tokens in `localStorage`. Yes, vulnerable to XSS — mitigated by strict CSP in `nginx.conf` (`script-src 'self'`, no `unsafe-inline`).
- iOS: refresh token in Keychain. Optional Face ID / Touch ID before unlocking it.

**Refresh flow:**
- API client (`src/api/client.ts`) intercepts `401`, fires a single in-flight refresh request (race-safe), retries the original request once.
- On refresh failure: drop tokens, dispatch `auth:logout` event, route to AuthPage.

**Backend invariant:** the `/auth/refresh` endpoint validates `payload.type == "refresh"` so an access token can't be used as a refresh token.

## Consequences

**Positive:**
- Stateless backend — no Redis session store. Scales horizontally without sticky sessions.
- Same API works for web + iOS without divergence.
- iOS can biometric-lock the refresh token without changing the protocol.

**Negative:**
- XSS on the web client = full session theft. CSP is the only mitigation; we don't refresh-rotate on every use (which would partially limit damage) because that complicates the client retry logic.
- Logout doesn't invalidate live access tokens (they expire on their own up to 60 min later). For aggressive revocation we'd need a token blacklist; we don't have one yet — accepted risk for a single-tenant app.

## Alternatives considered

- **Cookie sessions (HttpOnly, Secure, SameSite=Lax):** rejected — iOS Capacitor lives on `capacitor://localhost`, can't share cookies with the API domain. Would need WebView origin tricks.
- **OAuth via third party (Google, Apple):** out of scope; we have email/password with bcrypt.
