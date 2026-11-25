# crew.com build status

Last updated: 25 Nov 2026. This file is the honest record of what has and has not been verified.

## Invitations: where things stand

**Short answer: no real invite link has been used to join a trip on the hosted project yet.**
The flow is blocked on one approval, not on a secret (details below).

| Layer | How it is verified | Status |
|---|---|---|
| Invitation SQL functions: authorization, one-time use, expiry, atomicity, privacy of the public landing, budget privacy after joining | 33 tests against **real Postgres** (PGlite) running the project's **real migration files**, with real roles and RLS (`test/db`) | **PASSED** |
| Whole flow over HTTP: create, open link logged-out, sign in, join the right trip, reuse refused, expiry, replace, cancel, existing member "Open trip", dead-link messages | 19 tests: real Express app, real SQL functions, real RLS (`test/db/flow.test.js`). `admin()` throws, so the flow provably never needs a service-role key | **PASSED** |
| Server argument shapes, hashing, error mapping, rate limits, which client is used | scripted-database tests (`test/invitations.test.js`) | **PASSED** |
| **Migration `20261125160000_invitation_functions.sql` applied to the hosted Supabase project** | n/a | **NOT APPLIED. Awaiting explicit approval of the SQL.** |
| **Live two-account test on the hosted project** (`npm run test:live:invites`) | needs the migration applied | **BLOCKED / NOT VERIFIED** |
| Invite screens in a real signed-in browser session | manual | **NOT VERIFIED** |

### What was actually wrong

Every invite endpoint (create, replace, cancel, the public landing lookup, and accept) was written to use a
**service-role client**, which only exists if the server process holds `SUPABASE_SERVICE_ROLE_KEY`. The running
server never had that key, so every endpoint answered 503 ("Invites are not set up on this server yet"). The design
made the core feature depend on a god-mode secret.

### The fix

The five operations are now database functions (SECURITY DEFINER, `search_path = ''`, EXECUTE granted only to the roles
that need it). The server calls them with the **caller's own session**; the database checks who is calling and makes
each change in one transaction. RLS and the existing table grants are not loosened, no service-role key is needed or
used, and joining is now genuinely atomic (the invitation row is locked, so two people cannot both use one link).

`/healthz` reports `"invites": true` only when the functions answer, so a project without the migration is obvious
(and Invite explains it with a plain 503) instead of failing silently.

### To finish: after the SQL is approved

1. Apply `supabase/migrations/20261125160000_invitation_functions.sql` to the project.
2. `GET /healthz` should show `"invites": true`.
3. `npm run test:live:invites` with two pre-created test users in `.env.test`.

## Other verification

| Area | How it is verified | Status |
|---|---|---|
| Login, trip creation, preferences, private budget, RLS isolation between two users | `npm run test:live` against the real project (23 checks) | **PASSED** 23/23 |
| Server API, security headers, auth cookies, validation | `npm test` | **PASSED** |
| Client screens rendered in jsdom with a faked API | `npm test` (`test/client`) | **PASSED** |
| Trip dashboard "Up next" (#20) | pure-logic tests over 4,608 generated states + rendered-screen tests; layout measured at 320 / 390 / 1280 px | **PASSED / CHECKED** (not against a real signed-in session) |

## Trip dashboard (#20): what is and is not there

Built from real data only: hero, crew budget average, crew avatars and "x of y joined", and an ordered "Up next".
Deliberately NOT built, because there is no real data source and the PRD forbids invented content: the mockup's
"Explore" cards, the weather tile, and any "plan ready" / vote action.

## Open decisions

- Member cap rule (should it follow the expected crew size?).
- Email provider (#17) or defer email invites (#16).
- Whether Confirm email stays on for the demo.

## Not started

Plan generation, whole-plan voting, stays and experiences, expenses and settle up, email, deployment.
