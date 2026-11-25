# crew.com build status

Last updated: 25 Nov 2026. This file is the honest record of what has and has not been verified.

## Verification matrix

| Area | How it is verified | Status |
|---|---|---|
| Login, trip creation, preferences, private budget, RLS isolation between two users | `npm run test:live` against the real Supabase project (23 checks) | **PASSED** 23/23 |
| Server API, security headers, auth cookies, validation, invitations logic | `npm test` with a fake database (no network) | **PASSED** (see test count in the latest run) |
| Client screens rendered in jsdom with a faked API | `npm test` (`test/client`) | **PASSED** |
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

## Not started

Plan generation, whole-plan voting, stays and experiences, expenses and settle up, email, deployment.
