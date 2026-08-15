# Product Requirements Document — Accountability Goal-Tracker App

| | |
|---|---|
| **Product name** | TBD (candidates: *Vowly*, *Milestern*, *CrewGoal* — see Naming Appendix) |
| **Owner** | Quinten Strijdonk (Q-Projects) |
| **Status** | Draft v1.0 — ready for Linear project setup |
| **Date** | 2026-07-31 |
| **Intended reader** | Claude Code, for scaffolding the Linear project (teams, epics, issues) and building the app |

---

## 1. Overview

### 1.1 Problem
People routinely fail to reach hard, multi-month goals (starting a business, finishing a course, launching a website) not because they lack ambition, but because big goals aren't broken into small enough steps, and there's no one checking whether the steps actually happened. Generic habit trackers handle daily micro-habits well but don't handle *dated, milestone-based goals*, and existing social/accountability apps don't combine goal decomposition, peer verification, and real stakes in one place.

### 1.2 Solution
A social accountability app where each user sets a **main goal** with a deadline, gets **AI-suggested milestones** broken into **weekly goals**, runs those on a **self-chosen weekly cycle**, and is kept honest by **buddy groups** — friends who don't share the same goal but who **peer-approve** weekly completions, chat in a shared space, and hold the user to a **reward-if-you-succeed / penalty-if-you-fail** commitment they set themselves.

### 1.3 Differentiation (validated by market research)
No existing competitor (Habit Huddle, Habitica, Kept, Nudge, StickK, Habitat, Daily Pact, etc.) combines all of: dated main goal → editable AI milestones → weekly goals, a **user-selectable week-start day**, buddy groups with **independent goals per member**, **one goal linkable to multiple separate groups**, **peer approval**, a **group-benefiting reward/penalty device**, and **per-group chat with attachments**. Full competitive detail lives in the prior research report; this PRD assumes that analysis and focuses on build requirements.

### 1.4 Goals for v1 (MVP)
- Prove the core loop end-to-end: goal → milestones → weekly goals → peer approval → points/streak → commitment resolution.
- Get one real accountability group (you + 2 buddies) running ≥4 consecutive weekly cycles.
- Ship on **mobile + web** from a single codebase.

### 1.5 Success metrics
| Metric | MVP target |
|---|---|
| Weekly goals marked done that get approved within 48h | ≥ 80% |
| Users with ≥1 active buddy group | ≥ 70% of signed-up users |
| 4-week retention (user completes ≥4 cycles) | ≥ 40% of activated users |
| At least one commitment (reward or penalty) resolved | ≥ 50% of users by week 8 |

### 1.6 Personas
- **The Founder/Freelancer (primary):** solo operator with a big, vague business goal (e.g., "launch my website," "land 3 new clients") who needs it broken down and someone checking in.
- **The Student:** studying for a certification/exam with a fixed deadline, wants weekly structure and peer pressure.
- **The Buddy:** may or may not have their own goal in the App; primary role is approving/encouraging a friend's progress inside a shared group.

---

## 2. Scope

### 2.1 In scope — MVP (Phase 1)
Auth, main goals with deadlines, AI milestone generation (editable), weekly goals with custom week-start day, points/streaks, one-or-more buddy groups with invite codes, independent goals per member, peer approval of completions, basic per-group text chat + system messages, daily/weekly push nudges, informal (non-monetary) reward/penalty commitment device, emerald/Habit-Huddle-inspired theme.

### 2.2 In scope — Phase 2
Photo/document attachments in chat and as completion proof, linking **one goal to multiple separate groups**, richer gamification (achievements, per-group leaderboards/seasons), AI-generated weekly-goal suggestions per milestone, configurable approval rules (majority/quorum instead of any-one-buddy).

### 2.3 In scope — Phase 3
Real-money commitment device via a licensed payment/escrow provider, advanced analytics/dashboards, calendar integration, streak freezes/vacation mode, moderation tooling for chat/attachments, native performance polish.

### 2.4 Out of scope (all phases, unless revisited)
Shared/team goals (a group *co-owning* one goal), public/discoverable groups or social feed, coaching marketplace, native desktop apps beyond a responsive web app, non-English/non-Dutch localization at launch.

---

## 3. Epics & User Stories

Each epic below is written to become a **Linear Project** (or top-level Epic issue), with stories as child issues. Suggested Linear fields are included per story: **Phase** (label: `phase:mvp` / `phase:v2` / `phase:v3`), **Priority** (P0–P3), **Estimate** (S/M/L using T-shirt or convert to points).

### EPIC 1 — Auth & Onboarding
*Goal: a new user can sign up, understand the concept, and create their first goal in under 2 minutes.*

| ID | Story | Priority | Phase | Est. |
|---|---|---|---|---|
| 1.1 | As a new user, I can sign up with email, Apple, or Google. | P0 | mvp | M |
| 1.2 | As a new user, I see a short (3–4 screen) explainer of how the App works before creating my first goal. | P1 | mvp | S |
| 1.3 | As a user, I can set my display name, avatar, and timezone. | P0 | mvp | S |
| 1.4 | As a user, I can choose which weekday my personal week starts on (0–6), editable later in settings. | P0 | mvp | S |
| 1.5 | As a user, I can set a default daily reminder time and reminder tone (gentle/firm). | P2 | mvp | S |

**Acceptance criteria (1.1):** email/password + at least one OAuth provider works; verified session persists via Supabase Auth; user record auto-creates a `profiles` row.

### EPIC 2 — Main Goals
*Goal: users can define what they're trying to achieve and by when.*

| ID | Story | Priority | Phase | Est. |
|---|---|---|---|---|
| 2.1 | As a user, I can create a main goal with title, description, category (business/study/other), and target date. | P0 | mvp | M |
| 2.2 | As a user, I can edit or archive a main goal. | P0 | mvp | S |
| 2.3 | As a user, I can see a dashboard of all my active goals with overall progress. | P0 | mvp | M |
| 2.4 | As a user, I can set a reward (text + optional image) to unlock when I hit this goal. | P1 | mvp | S |
| 2.5 | As a user, I can set a penalty and choose which of my groups benefits if I fail. | P1 | mvp | S |

**Acceptance criteria (2.1):** target date must be in the future; goal appears immediately on dashboard in "no milestones yet" state.

### EPIC 3 — AI Milestone Generation
*Goal: turn a vague big goal into a concrete, editable roadmap.*

| ID | Story | Priority | Phase | Est. |
|---|---|---|---|---|
| 3.1 | As a user, I can tap "Generate milestones" on a goal and receive an AI-suggested, ordered list of milestones with target dates. | P0 | mvp | L |
| 3.2 | As a user, I can edit, reorder, delete, or manually add milestones. | P0 | mvp | M |
| 3.3 | As a user, I can regenerate AI suggestions if I don't like them. | P2 | mvp | S |
| 3.4 | As a user, I can tap "Generate weekly goals" on a milestone to get AI-suggested weekly steps. | P1 | v2 | M |

**Acceptance criteria (3.1):** AI call runs server-side via a Supabase Edge Function (API key never client-side); returns structured JSON; failure falls back gracefully to "add milestone manually."

### EPIC 4 — Weekly Goals & Custom Cycle
*Goal: the weekly unit of action, running on each user's own week-start day.*

| ID | Story | Priority | Phase | Est. |
|---|---|---|---|---|
| 4.1 | As a user, I can add weekly goals under a milestone (or standalone under a main goal). | P0 | mvp | M |
| 4.2 | As a user, my "this week" view always reflects my chosen week-start day, not the calendar week. | P0 | mvp | M |
| 4.3 | As a user, I can mark a weekly goal as done, optionally with a note. | P0 | mvp | S |
| 4.4 | As a user, at cycle rollover, incomplete weekly goals are clearly flagged (not silently dropped). | P1 | mvp | S |
| 4.5 | As a user, I earn points for each approved weekly goal and see a running streak. | P0 | mvp | M |

**Acceptance criteria (4.2):** a scheduled Supabase Edge Function computes each user's current cycle boundaries from `week_start_day`; verified with users on different week-start days simultaneously.

### EPIC 5 — Buddy Groups
*Goal: social containers where members pursue independent goals.*

| ID | Story | Priority | Phase | Est. |
|---|---|---|---|---|
| 5.1 | As a user, I can create a group and get a shareable invite code/link. | P0 | mvp | M |
| 5.2 | As a user, I can join a group via invite code. | P0 | mvp | S |
| 5.3 | As a user, I can link one of my own goals to a group I'm in. | P0 | mvp | M |
| 5.4 | As a user, I can see, in a group, each member's linked goal(s) and their current progress. | P0 | mvp | M |
| 5.5 | As a user, I can link the *same* goal to more than one separate group. | P1 | v2 | M |
| 5.6 | As a user, I can leave a group without affecting my goal's presence in other groups. | P2 | v2 | S |

**Acceptance criteria (5.3):** a goal can appear in group A's member list without appearing in group B's, even for the same user, until explicitly linked.

### EPIC 6 — Peer Approval
*Goal: self-reported completions are socially verified.*

| ID | Story | Priority | Phase | Est. |
|---|---|---|---|---|
| 6.1 | As a group member, when a buddy marks a weekly goal done, I get a notification to review it. | P0 | mvp | M |
| 6.2 | As a group member, I can approve or request changes on a buddy's completion. | P0 | mvp | M |
| 6.3 | As a user, my weekly goal becomes "approved" (and points/streak update) once any one group member approves it (MVP rule). | P0 | mvp | S |
| 6.4 | As a group, we can later configure approval to require a majority instead of any-one-buddy. | P3 | v2 | M |

**Acceptance criteria (6.3):** points and streak only increment on approval, never on self-mark-done alone; approval is logged with approver + timestamp in `completion_approvals`.

### EPIC 7 — In-Group Chat
*Goal: keep all accountability activity inside the App.*

| ID | Story | Priority | Phase | Est. |
|---|---|---|---|---|
| 7.1 | As a group member, I can send/receive text messages in real time within my group. | P0 | mvp | M |
| 7.2 | As a group member, I see auto-posted system messages for key events (completion pending, approved, milestone hit, reward/penalty resolved). | P1 | mvp | S |
| 7.3 | As a group member, I can share photos in chat. | P1 | v2 | M |
| 7.4 | As a group member, I can share documents in chat. | P2 | v2 | M |

**Acceptance criteria (7.1):** uses Supabase Realtime; messages persist in `chat_messages`; RLS restricts visibility to `group_members` of that group only.

### EPIC 8 — Gamification
*Goal: make the process feel like a game, not admin work.*

| ID | Story | Priority | Phase | Est. |
|---|---|---|---|---|
| 8.1 | As a user, I see my current streak and total points on my dashboard. | P0 | mvp | S |
| 8.2 | As a user, I get a celebratory animation/message when a weekly goal is approved. | P1 | mvp | S |
| 8.3 | As a user, I receive a daily nudge if I haven't acted on my current weekly goal(s). | P0 | mvp | M |
| 8.4 | As a user, I can earn badges/achievements for milestones like "4-week streak" or "first goal completed." | P2 | v2 | M |
| 8.5 | As a group, we can see a per-group leaderboard with seasonal resets. | P3 | v2 | M |

### EPIC 9 — Reward / Penalty Commitment Device
*Goal: skin in the game, resolved socially.*

| ID | Story | Priority | Phase | Est. |
|---|---|---|---|---|
| 9.1 | As a user, when I hit my goal by the deadline, my pre-set reward is marked "unlocked" and posted to my group(s). | P1 | mvp | M |
| 9.2 | As a user, if I miss my goal deadline, my pre-set penalty is marked "due" and posted to the beneficiary group. | P1 | mvp | M |
| 9.3 | As a user, commitments in MVP are informal/tracked only — no real money is processed. | P0 | mvp | — |
| 9.4 | As a user, in a later phase, I can process real-money penalties via a licensed payment provider. | P3 | v3 | L |

### EPIC 10 — Design System & Theming
*Goal: an inviting, game-like, Habit-Huddle-inspired visual identity.*

| ID | Story | Priority | Phase | Est. |
|---|---|---|---|---|
| 10.1 | Establish design tokens: emerald `#10b981` primary, dark-mode-friendly, amber/coral for rewards, restrained red for penalties/at-risk. | P0 | mvp | M |
| 10.2 | Build core component library (cards, streak counters, badge tiles, buttons) reused across screens. | P0 | mvp | L |
| 10.3 | Dark mode support across all screens. | P1 | mvp | M |

### EPIC 11 — Notifications
| ID | Story | Priority | Phase | Est. |
|---|---|---|---|---|
| 11.1 | As a user, I receive push notifications for: daily nudge, pending approval request, approval received, cycle rollover summary. | P0 | mvp | M |
| 11.2 | As a user, I can control which notification types I receive. | P2 | v2 | S |

---

## 4. Technical Requirements

### 4.1 Stack
- **Front end:** React + Expo (React Native) for a single codebase across iOS, Android, and web. Scaffolded via Bolt.new, iterated with Claude Code.
- **Backend:** Supabase — Postgres, Auth (email + Apple + Google), Realtime (chat, live approval/feed updates), Storage (photos/documents, Phase 2+), Edge Functions (AI calls, scheduled cycle-rollover jobs, push dispatch).
- **AI:** LLM called server-side only, via an Edge Function, returning structured JSON for milestones/weekly goals.
- **Push:** Expo push notifications.

### 4.2 Security & privacy
- **Row Level Security enabled on every table**, default deny. Users read/write only: their own `profiles`/`goals`/`weekly_goals`; rows for `groups` they belong to via `group_members`; `chat_messages`/`attachments` scoped to their groups.
- `service_role` key never shipped client-side; all privileged operations go through Edge Functions.
- EU/Dutch context: plan for GDPR-compliant data handling once chat attachments (Phase 2) and any payment data (Phase 3) are introduced.

### 4.3 Data model (MVP)
```
profiles(id, display_name, avatar_url, week_start_day, reminder_time, tz)
goals(id, owner_id, title, description, category, target_date, status,
      reward_text, reward_image, penalty_text, beneficiary_group_id, created_at)
milestones(id, goal_id, title, target_date, order_index, status, ai_generated)
weekly_goals(id, milestone_id, goal_id, title, week_start_date, week_index,
             status[todo|pending|approved], points, ai_generated)
groups(id, name, icon, created_by, invite_code)
group_members(group_id, user_id, role, joined_at)
goal_group_links(goal_id, group_id)          -- enables one goal in many groups (v2)
completion_approvals(id, weekly_goal_id, approver_user_id,
                      status[approved|changes_requested], comment, created_at)
chat_messages(id, group_id, sender_id, body, type[text|photo|doc|system],
              attachment_url, created_at)
points_ledger(user_id, group_id, points, current_streak, best_streak, last_cycle_date)
```

### 4.4 Non-functional requirements
- Realtime approval/chat updates delivered in < 2s under normal conditions.
- Cycle-rollover job must be timezone- and week-start-day-aware per user; tested with users on different configurations running concurrently.
- App must function (read-only) with a degraded/no network connection for the current cycle's data (basic offline cache).

---

## 5. Release Plan

| Phase | Focus | Exit criteria |
|---|---|---|
| **Phase 1 — MVP** | Epics 1–4, 6–8 (text only), 9 (informal), 10, 11 | Core loop works end-to-end for a 3-person group across ≥4 weekly cycles |
| **Phase 2** | Photo/doc attachments (Epic 7.3–7.4), multi-group goal linking (5.5–5.6), AI weekly-goal suggestions (3.4), badges/leaderboards (8.4–8.5), configurable approval (6.4) | ≥3 active groups using attachments and multi-group linking |
| **Phase 3** | Real-money commitments (9.4), advanced analytics, calendar integration, vacation mode, moderation tooling | Payment provider integrated and compliant |

---

## 6. Open Questions / Risks
- **Cold start:** an accountability group is only as good as its members — need an MVP flow that's still valuable to a lone user (e.g., "solo mode" with AI as the only accountability partner) before buddies join.
- **Approval abuse:** any-one-buddy approval (6.3) is fast but gameable if a group colludes to always approve; monitor before hardening to majority rule (6.4).
- **AI cost/latency:** milestone generation (3.1) needs a fallback and rate-limiting plan before broad rollout.
- **Naming/trademark:** finalize product name and run formal trademark + store search before public launch (see prior research report, Section D).
- **Payments regulation:** real-money penalties (9.4) require legal/compliance review before Phase 3 starts.

---

## 7. Suggested Linear Setup (for Claude Code)

- **Team:** one team, e.g. `App` (rename once product name is set).
- **Labels:**
  - Phase: `phase:mvp`, `phase:v2`, `phase:v3`
  - Area: `area:frontend`, `area:backend`, `area:design`, `area:ai`, `area:infra`
  - Type: `type:feature`, `type:bug`, `type:chore`
- **Projects (one per Epic above):** Auth & Onboarding, Main Goals, AI Milestones, Weekly Goals & Cycle, Buddy Groups, Peer Approval, Group Chat, Gamification, Commitment Device, Design System, Notifications.
- **Issues:** create one Linear issue per story row above (ID, title, description = story text, acceptance criteria as a checklist, priority and phase label as specified). Group issues under their Epic's project; order by Priority within `phase:mvp` first.
- **Milestones:** map the three Release Plan phases (Section 5) to Linear Milestones/Cycles, with Phase 1 issues targeted first.
