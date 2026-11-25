# crew.com build status

Last updated: 25 Nov 2026. This file is the honest record of what has and has not been verified.

## Verification matrix

| Area | How it is verified | Status |
|---|---|---|
| Login, trip creation, preferences, private budget, RLS isolation between two users | `npm run test:live` against the real Supabase project (23 checks) | **PASSED** 23/23 |
| Server API, security headers, auth cookies, validation, invitations logic | `npm test` with a fake database (no network) | **PASSED** (see test count in the latest run) |
| Client screens rendered in jsdom with a faked API | `npm test` (`test/client`) | **PASSED** |
| Trip dashboard "Up next" (#20): next-action rules over every state, UI states, edge cases | `npm test`: pure-logic tests over 4,608 generated states + rendered-screen tests (jsdom) | **PASSED** |
| Trip dashboard layout at 320 / 390 / 1280 px | Real app code + stylesheets in a browser with a faked API (throwaway harness, not in the repo); geometry measured | **CHECKED** (not against a real signed-in session) |
| **Live invite flow: create / replace / join / dead links / budget privacy with two real members** | `npm run test:live:invites` against the real project | **BLOCKED / NOT VERIFIED** |
| Signed-in screens in a real browser | manual | **NOT VERIFIED** |

### BLOCKED / NOT VERIFIED: live invite test

The invite endpoints need a server that holds the Supabase **service-role key** (clients cannot write
invitations or membership by design). No such server has been run, so the following have only been
checked against fakes and have **never been exercised against the real database**:

- that single-use links are enforced by real Postgres (the join "consumes" the link with one conditional update);
- that a second member joining works end to end (`trip_members` insert, RLS visibility afterwards);
- that budget privacy holds with **two real members** (the average is shown, individual amounts are not);
- that dead links (used / revoked / expired) behave the same against real data.

Do not report invitations as verified until `npm run test:live:invites` has passed against a server that
reports `"invites": true` on `/healthz`.

To unblock (done by the project owner, locally; the key is never shared in chat or committed):
run `scripts/start-with-key.ps1` in a terminal you can type into, confirm `http://localhost:3004/healthz`
shows `"invites":true`, then `$env:TEST_BASE_URL='http://localhost:3004'; npm run test:live:invites`.

## Open decisions (not blocking the work below)

- Atomic join as a database function (needs a migration, which needs explicit approval first).
- Member cap rule (should it follow the expected crew size?).
- Email provider (#17) or defer email invites (#16).
- Whether Confirm email stays on for the demo.

## Trip dashboard (#20): what is and is not there

Built from real data only: hero (trip name, destination, dates, nights), crew budget average, crew avatars and
"x of y joined", and an ordered "Up next" derived from the trip, crew progress and invitations.

Deliberately NOT built, because there is no real data source and the PRD forbids invented content:
the mockup's "Explore" cards (ratings, reviews), the weather tile, and any "plan ready" / vote action.
Voting open/closed (from `trips.status`) shows as an information row; there is no screen to link to yet.

## Not started

Plan generation, whole-plan voting, stays and experiences, expenses and settle up, email, deployment.
Dashboard Explore cards and weather (need a places / weather source).
