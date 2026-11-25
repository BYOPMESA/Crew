# crew.com build status

Last updated: 25 Nov 2026. This file is the honest record of what has and has not been verified.

## Invitations: where things stand

**A real invite link, created by one real account, HAS been used by a second real account to join the organiser's
trip on the hosted project** (live test, 25 Nov 2026, 37/37 checks). No service-role key is involved anywhere.

| Layer | How it is verified | Status |
|---|---|---|
| **Hosted project, two real accounts** (`npm run test:live:invites`, 37 checks): create, link returned once, public landing, replace (old link dead), garbage link, join with the new link, reuse by the same person, used link reports used, organiser opens own link, existing-member "Open trip" (and anonymous never gets it), cancel, member cannot edit/invite/replace, member sees names but never tokens or emails, budget privacy (a member must not see the organiser's number until two have shared; both then see only the average) | real server + real Supabase project | **PASSED 37/37** |
| **Expiry on the hosted project** (one-off check, 8 checks): an expired link says so and reveals nothing about the trip, the invitee is refused (410) and stays locked out, the organiser sees it as expired, replaces it, and the person joins with the replacement. The expiry time of ONE test invitation was moved into the past by hand to simulate the passage of time | real server + real Supabase project | **PASSED 8/8** (one-off script, not kept in the repo) |
| Dead-end pages in a real logged-out browser: live link landing (join + log-in links carry the invite through sign-up), revoked link, unknown link | built-in browser against the real project | **CHECKED** |
| Invitation SQL: authorization, one-time use, expiry, atomicity, landing privacy, budget privacy | 33 tests on real Postgres (PGlite) running the real migration files, real roles and RLS (`test/db`) | **PASSED** |
| Whole flow over HTTP against real Postgres, with the service-role client made to throw | 19 tests (`test/db/flow.test.js`) | **PASSED** |
| Server argument shapes, hashing, error mapping, rate limits, which client is used | `test/invitations.test.js` | **PASSED** |
| Migration `20261125092535_invitation_functions` on the hosted project | applied after the SQL was reviewed; applied SQL is byte-identical to the repo file (md5 `ebc7373d...`); privileges and advisors checked | **APPLIED** |

**Not verified:**

- A signed-in click-through in a real browser: sign up or log in as the invited person, then press **Join the trip**.
  The same steps are verified over the API with real sessions, and the screen logic by jsdom tests.
- "Used by a third person" on the hosted project (only two test accounts exist). The SQL and the HTTP flow cover it,
  and the hosted landing reports `used`.
- Email invites (not built; the invite page says so).

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

### To re-verify on any other project

1. Apply the migrations in `supabase/migrations` (the invitation one needs the first two).
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
