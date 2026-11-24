# crew.com: Product Requirements Document

_Version 3, 24 November 2026. Exported from the shared Google Doc._

**How to read this document.** Every statement carries one of four labels, so a decision is never confused with a suggestion.

- **[Decided]** Saqeeb said it himself in chat. Owner-confirmed, not necessarily agreed by the whole team.
- **[Reference]** Shown in the 29-page mockup boards (organiser A01 to A19, invitee B01 to B10). The target look and flow. Names, prices, ratings and people on the boards are sample data, not facts.
- **[Proposed]** A suggestion from the assistant. Saqeeb has not chosen it.
- **[Observed]** Verified hands-on in the running app on 24 November 2026, using disposable test accounts and a disposable trip. It shows what the build does today; it does not prove backend security or test coverage.

## 0. Document info

| Item | Detail |
|---|---|
| Product name | crew.com [Decided, 21 Nov]. Domain not bought, not deployed, no trademark check. |
| Product | A group trip planning web app. A friend group sets preferences, gets one flexible plan, votes on it, compares stays and experiences, and splits expenses. |
| Course context | Mesa AI hackathon / BYOP, AI Team 9 (Saqeeb Chand, Manas Kothari, Chris Mathew). Mentor: Kiran. Demo Day 1 December 2026, working product required. |
| Team roles | Not confirmed. |
| Status, 24 Nov | Working end-to-end build tested today [Observed]: signup, login, preferences, budget averaging, trip creation, per-friend invite links, plan generation, itinerary, stays and experiences with compare, whole-plan voting with live tally, expenses and settle up, opt-in reminders. Full verified list in section 12. |
| Build location | Saqeeb's Mac (~/mesa-byop, port 3003), shared through ephemeral Cloudflare tunnel links. Not deployed publicly. |
| Not decided | Logo, hosting and live address, email provider, option-vote decision rule, group decision rule, price data source, whether money ever moves in the app. See section 11. |

## 1. Problem and product direction

Planning a trip with friends is mostly a negotiation about money and dates that nobody wants to start. One friend ends up building options by hand and chasing replies, and someone on a tighter budget goes along with a plan they cannot really afford. Working hypothesis, not yet tested with real groups. [Proposed]

Direction Saqeeb set on 20 Nov [Decided]: after signup the user lands on a dashboard with New plan and Join a plan plus travel content. No question-based onboarding ("extremely generic"). Planning first: start from a real idea or destination, get a draft straight away, friends edit concrete parts. Scope ambition: "i want everything here".

## 2. Goals and non-goals

### Goals

- A real working app, not a mockup [Decided]: real accounts, saved backend data, invite links that work across devices, preferences, votes and expenses saved against the right users.
- The build matches the two mockup boards [Decided: the boards are "what i want to happen"].
- Demo on 1 December with the flow working end to end [Reference: course requirement].

### Non-goals for now

- Real bookings or payments. The app only keeps records; it never moves money (this copy already ships in expenses) [Observed].
- Invented live prices, reviews or weather. The build deliberately shows "not available" rather than fake numbers [Observed].
- A native app or in-app chat [Proposed, not discussed].
- Public deployment or sending real emails without Saqeeb's say. Secrets never in chat or source code; provider credentials via environment variables only [Decided for the email feature, 24 Nov].
- The declined checklist feature stays out. Only opt-in reminders were approved [Decided, 23 Nov].

## 3. Target users

Starting hypothesis: groups of 3 to 8 friends, about 18 to 28, in India, planning short trips on mixed budgets. Personas hypothetical, not from interviews. [Proposed]

| User | What they need |
|---|---|
| Organiser | Creates the crew, sets budget and trip basics, invites friends, reviews the plan, sends it to vote, closes voting. Needs a draft to react to and a decision without ten days of chat. |
| Invitee | Opens a link, signs up, joins, sets preferences and a personal budget, sees the plan, votes. Needs it to take minutes. |
| Slow replier | Needs a waiting screen that reflects what has actually been saved, and optional reminders. |

## 4. Core flows as built

**Organiser** [Observed 24 Nov]: signup or login with email and password, home (New plan / Join a plan, recent trips), create crew (crew name), preferences step (own budget slider, expected group size, interests, vibe, stay style, must-visit place), crew budget step (live average), The basics (trip name, dates, crew size, notes, optional itinerary file), destination (search, suggestions, optional AI ideas), invite the crew (per-friend one-time links, 7-day expiry, copy or replace, pending and joined status), plan generation ("Building your plan", continues on server), flexible plan itinerary (day tabs, morning/afternoon/evening options, tap to select, refresh suggestions when budgets change), trip dashboard (budget, nights, joined count, up-next links, explore section), getting around (mapped rentals, trains, ferries, airports), stays and stay detail, experiences, compare modal, expenses with categories and settle up, members and invites page, reminders page (off by default), profile.

**Invitee** [Observed 24 Nov]: invite landing page (who invited you, destination, dates, crew size), join through signup or login (invitation survives the handoff), preferences with own personal budget, waiting page, "Voting open" banner when the organiser sends the plan, vote page (yes or suggest a change), own view of the plan, expenses and settle up.

## 5. Budget logic

[Decided, 22 Nov; verified working 24 Nov] The organiser enters a personal budget plus an editable expected headcount. Each invitee who joins enters their own personal budget. The shared figure is the arithmetic mean of the budgets actually submitted: no weighting by headcount, and unanswered members are excluded, not counted as zero. Only the average is shown to others; each person's amount stays private. Verified example: 8000 and 6000 from 2 of 4 expected members shows 7000, "2 of 4 people have shared a budget".

## 6. Voting

**Whole-plan vote** [Observed]: the organiser sends the plan to vote from the itinerary; voting locks the plan; each member gets one saved vote (yes or suggest a change) that cannot be changed; a live tally shows progress; the organiser closes voting.

**Option-level voting** [Decided, 24 Nov]: experiences and stays must be sendable to a crew vote as options (the stays "Shortlist for the vote" button exists in [Reference] page 15 but not in the build). Open rule: what decides a winning option, and how winning options enter the plan, is not defined. Reuse the existing vote mechanics; if no rule fits, this must be settled before or during implementation. See section 11.

## 7. Stays

[Observed] Real stays near the destination from OpenStreetMap, matched to the crew's stay-style picks, with filters (All, Hostel, Hotel, Resort, Villa), a compare view, stay detail pages (address, mapped star rating, website and map links where mapped), and honest "not available" states for prices and ratings. No way to add a stay today.

[Decided, 24 Nov] "Add your own stay": search any location, not just the trip destination, or enter a stay manually (name, area, price per night, optional link). Manually added stays join the same shortlist, compare and vote flow as generated ones. Rationale in Saqeeb's words: no sense being limited to random places; add a stay wherever you want.

## 8. Experiences

[Observed] Real places from OpenStreetMap with photos where available, category filters (All, Water, Culture, Food, Night), multi-select compare, and "Add to plan" with a day and time-block picker. No vote today.

[Decided, 24 Nov] Selected experiences get a "Send to vote" action so the crew votes on shortlisted experiences, parallel to stays.

## 9. Expenses and settle up

[Observed] Add expense (description, amount, category: Stay, Food, Travel, Activities, Other; paid by the person adding it, split equally between ticked members). Trip total, your share, net balance, "where it went" breakdown, edit and remove per expense. Settle up shows who owes who with "Mark paid" (records money moved outside the app; can be undone). Verified example: 1000 split 2 ways, share 500, settle shows the other member owes 500.

[Decided, 24 Nov] Expenses becomes a dedicated tab in the bottom navigation, separate from the trip planning flow. The trip screens keep a link that jumps to it.

## 10. Invites and email

[Observed] Invites today: the organiser types a friend's name, the app creates a personal one-time join link (7-day expiry), shown once, with copy and replace. Joining through a link preserves the invitation through signup.

[Decided, 24 Nov] Invite by email: the organiser enters a friend's email (and optional name) and the app emails them their personal join link. The manual link flow stays as fallback, and the crew list shows email invites as sent then pending. Provider credentials come from environment variables, never hardcoded; when email is not configured the app says so explicitly (the reminders page already has an "Email: Not configured" pattern to reuse). No test emails are sent during build verification. Current status: no email provider configured [Observed].

## 11. Open decisions

| Question | State |
|---|---|
| Option-vote decision rule (what wins, how winners enter the plan) | Open. Needed by the new experience and stay votes. Reuse existing vote mechanics where possible. |
| Email provider and credentials | Open. Env-var based; Saqeeb configures and tests sending himself. |
| Trip name vs crew name | Fix in progress (section 12, bug 1). One clear trip name shown everywhere; crew name either merged or clearly labelled. |
| Logo | Open. Several directions rejected; Saqeeb drafted his own crew-logo.svg. |
| Hosting and public URL | Open. Currently ephemeral Cloudflare tunnels from his Mac. |
| Group decision rule beyond voting | Open (carried from v2). |
| Price data source | Open. Build currently shows no prices by design; mockups show them. Adding real prices needs a chosen source. |

## 12. Verified build state and known bugs, 24 Nov

**Verified working today** [Observed, disposable accounts and trip only]: signup and login; preferences; budget average (8000 and 6000 gives 7000, "2 of 4 shared"); The basics; destination; per-friend invite links with expiry, copy and replace; plan generation; itinerary with real OpenStreetMap places and source links; budget-change "Refresh suggestions" notice; invitee join handoff; waiting page; whole-plan vote with live tally on both sides; plan locks when voting starts; experiences with day and time-block add-to-plan; stays with compare; compare modal renders fully at 390x640 (the old clipping is fixed); expenses with categories; settle up with Mark paid; reminders page (off by default, in-app delivery); AI ideas page (works, first lookup can take a couple of minutes).

**Known bugs handed to the build prompt today** [Observed]:

- **Trip name ignored.** A custom trip name set on The basics appears nowhere: the dashboard titles the trip "OUR TRIP", the Home recent-trips card shows the crew name, other headers show the destination. Crew name and trip name are conflated.
- **Intermittent "null" text.** A bare "null" rendered once on the itinerary above "Why this fits:" before voting started; it did not reproduce afterwards. Unguarded template value to find and guard.
- **Member names collide.** Two members whose names start with the same word both render as that word ("split 2 ways: QA, QA") with identical single-letter avatars.
- **Photo coverage.** Most places show "No photo" placeholders; some Wikipedia photos load. Mockups show photos everywhere.
- **Visual gaps vs mockups.** Destination step lacks photo cards and price chips; Home lacks the location card and suggested-destinations section.

## 13. Design reference

[Reference] The 29-page mockup PDF (390x844) is the visual target: teal and yellow palette, serif display headings, organiser flow A01 to A19 and invitee flow B01 to B10. Saqeeb: "i need it to be exact". Working flows must not be restyled while closing the gaps in section 12.

## 14. Change log

- 20 Nov: first text PRD (concept stage, nothing built).
- 21 Nov: v2, name decided as crew.com, mockup boards as target, build stages.
- 22 Nov: budget logic decided (mean of submitted personal budgets, expected headcount editable).
- 23 Nov: opt-in reminders approved, checklist declined; signup-invite handoff and expenses verified on an earlier build.
- 24 Nov: v3. Full audit of the current build. New approved scope: trip-naming fix, email invites, add stays anywhere, experience and stay option voting, expenses as its own tab. Two earlier mockup-only auth items (phone login, Google or OTP sign-in) are not in scope.
