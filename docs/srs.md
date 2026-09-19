# Software Requirements Specification (SRS) — Edisco

> This document formalizes `prd.md` into structured, implementable requirements (functional requirements with IDs, use cases, and detailed non-functional requirements). Where `prd.md` explains the *why* and product intent, this document defines the *what*, precisely enough to write test cases and acceptance criteria against. It does not restate rationale already covered in `prd.md` or `business-logic.md` — refer back to those for context.

---

## 1. Introduction

### 1.1 Purpose
Defines the functional and non-functional requirements for Edisco, an MVP web application that generates Duolingo-style learning content on demand via AI, for any topic the user requests.

### 1.2 Scope
Covers: user onboarding, authentication, AI-driven lesson generation (with reuse/caching), lesson consumption and progress tracking, gamification (XP, streak, weekly league), and profile management. Excludes payment/subscription systems, audio/listening exercises, native mobile apps, and complex league grouping (see `prd.md` §9 for the full out-of-scope list).

### 1.3 Definitions

| Term | Definition |
|---|---|
| **Track** | A learning path for one topic, composed of an ordered sequence of Lessons. |
| **Lesson** | A unit of generated content, consisting of exactly 5 Parts. |
| **Part** | A single exercise/question within a Lesson (e.g. multiple choice, fill-in-blank). |
| **Generate** | The action of requesting new lesson content from the system, consuming free quota. |
| **Reuse** | Serving a previously generated Lesson to a user instead of calling the LLM again, based on semantic similarity. |
| **Quota** | The lifetime count of free generations available to a user (3 at signup). |

### 1.4 References
`prd.md`, `architecture.md`, `data-model.md`, `business-logic.md`, `api-spec.md`.

---

## 2. Overall Description

### 2.1 Product Perspective
A responsive web application (mobile/tablet/desktop) with a separated frontend (Next.js) and backend (Fastify API + async worker), as detailed in `architecture.md`. Not a native mobile app.

### 2.2 User Classes
- **Guest** — has not registered; only interacts with the onboarding flow.
- **Registered User** — has an account; the primary user class for all core features (Track, Lesson, New, League, Profile).

No admin/moderator role is defined for the MVP (out of scope — flagged as an open item if content moderation becomes necessary).

### 2.3 Operating Environment
Modern evergreen browsers (Chrome, Safari, Firefox, Edge) on mobile, tablet, and desktop viewports. PWA-installable but not distributed via app stores.

### 2.4 Assumptions and Dependencies
- Availability and pricing stability of the chosen third-party LLM and embedding provider(s) (see `architecture.md` §3).
- All items in `open-questions.md` are assumed resolved as documented until Wil confirms otherwise; requirements below reflect those assumptions and must be revised if answers change.

---

## 3. Functional Requirements

Each requirement has a unique ID (`FR-<area>-<number>`) for traceability into test cases and future task tracking.

### 3.1 Onboarding (FR-OB)

| ID | Requirement |
|---|---|
| FR-OB-01 | The system shall present a Welcome screen as the first step of onboarding, with a call-to-action to proceed. |
| FR-OB-02 | The system shall present an Interest selection step allowing multiple selections from a predefined category list, plus a free-text "Other" option. |
| FR-OB-03 | The system shall require at least 1 interest to be selected before proceeding. |
| FR-OB-04 | The system shall present a Pace selection step as a single-choice input (Casual / Regular / Intensive). |
| FR-OB-05 | The system shall require a Pace selection before proceeding to registration. |
| FR-OB-06 | The system shall present Register/Login only after the Interest and Pace steps are completed. |
| FR-OB-07 | The system shall temporarily persist Interest and Pace selections on the client (e.g. session storage) until account creation, then attach them to the created account. |
| FR-OB-08 | The system shall not allow reordering or skipping of onboarding steps (per `open-questions.md` #1, pending confirmation). |
| FR-OB-09 | Upon completion of onboarding, the system shall set the user's `freeGenerationsLeft` to 3 and record `onboardingCompletedAt`. |

### 3.2 Authentication (FR-AUTH)

| ID | Requirement |
|---|---|
| FR-AUTH-01 | The system shall allow account registration with email, password, and name. |
| FR-AUTH-02 | The system shall allow login with email and password, returning an auth token on success. |
| FR-AUTH-03 | The system shall reject requests to protected endpoints that lack a valid auth token, returning `UNAUTHORIZED`. |
| FR-AUTH-04 | The system shall store passwords hashed, never in plaintext. |

### 3.3 Lesson Generation (FR-GEN)

| ID | Requirement |
|---|---|
| FR-GEN-01 | The system shall allow a registered user to request generation of a new Lesson by submitting a topic and category. |
| FR-GEN-02 | The system shall allow a registered user to request a follow-up Lesson for an existing Track via a "Generate Next" action. |
| FR-GEN-03 | The system shall reject a generate request with `QUOTA_EXCEEDED` if the user's `freeGenerationsLeft` is 0. |
| FR-GEN-04 | The system shall process generation asynchronously and return a job identifier immediately (HTTP 202), without blocking the client. |
| FR-GEN-05 | The system shall expose a job status endpoint that the client can poll until the job reaches a terminal state (`DONE` or `FAILED`). |
| FR-GEN-06 | Before generating new content via the LLM, the system shall compute a topic embedding and search for a semantically similar, non-expired existing Lesson in the same category. |
| FR-GEN-07 | If a similar existing Lesson is found within the configured similarity threshold, the system shall assign that Lesson to the user instead of calling the LLM, and mark the assignment as a reuse (`wasReused = true`). |
| FR-GEN-08 | If no similar Lesson is found, the system shall call the LLM to generate a new Lesson with exactly 5 Parts, store it with an embedding and a 3-month expiry, and assign it to the user. |
| FR-GEN-09 | The system shall decrement `freeGenerationsLeft` by exactly 1 only after a generate job reaches status `DONE` (never on `FAILED`), as an atomic operation with the lesson/assignment write. |
| FR-GEN-10 | The system shall not reveal to the user whether a received Lesson was newly generated or reused (per `open-questions.md` #4, pending confirmation). |
| FR-GEN-11 | The system shall select Part types for a generated Lesson according to the topic's category template (see `business-logic.md` §3), falling back to the General template for uncategorized topics. |
| FR-GEN-12 | The system shall adjust content depth/complexity of generated Parts according to the user's stored Pace, without changing the Part count (always 5). |

### 3.4 Lesson Expiry (FR-EXP)

| ID | Requirement |
|---|---|
| FR-EXP-01 | The system shall run a scheduled job at least once daily that marks Lessons as `isExpiredForReuse = true` when `expiresAt < now()`. |
| FR-EXP-02 | The system shall never delete a Lesson record as a result of expiry. |
| FR-EXP-03 | The system shall exclude expired Lessons from similarity-search candidates (FR-GEN-06) while continuing to serve them to users who already own them. |

### 3.5 Track & Lesson Consumption (FR-TRK)

| ID | Requirement |
|---|---|
| FR-TRK-01 | The system shall allow a user to view a list of their Tracks. |
| FR-TRK-02 | The system shall allow a user to view the ordered list of Lessons within a Track, including each Lesson's completion status. |
| FR-TRK-03 | The system shall allow a user to view all 5 Parts of a Lesson they own. |
| FR-TRK-04 | The system shall allow a user to submit an answer for a Part and receive immediate correctness feedback and any XP earned. |
| FR-TRK-05 | The system shall mark a Lesson as `COMPLETED` once all 5 Parts have been answered correctly at least once. |
| FR-TRK-06 | The system shall allow a user to revisit and redo a previously completed Lesson. |

### 3.6 Gamification (FR-GAM)

| ID | Requirement |
|---|---|
| FR-GAM-01 | The system shall award XP to a user upon completing a Part, per the values defined in `business-logic.md` §4. |
| FR-GAM-02 | The system shall award bonus XP upon completing all 5 Parts of a Lesson. |
| FR-GAM-03 | The system shall update the user's `currentStreak` and `longestStreak` based on daily activity, per the rules in `business-logic.md` §4. |
| FR-GAM-04 | The system shall maintain a weekly XP total per user (`WeeklyLeagueEntry`), resetting the counter at the start of each week. |
| FR-GAM-05 | The system shall expose a weekly leaderboard ranked by `xpThisWeek`, including the requesting user's own rank. |

### 3.7 Profile (FR-PROF)

| ID | Requirement |
|---|---|
| FR-PROF-01 | The system shall allow a user to view their profile: name, email, pace, interests, remaining quota, total XP, current streak, longest streak. |
| FR-PROF-02 | The system shall allow a user to update their pace and interests after onboarding. |
| FR-PROF-03 | The system shall not allow email/password changes through the same endpoint as pace/interest updates (security separation, per `api-spec.md` §7). |

---

## 4. Use Cases

### UC-1: First-time user generates their first lesson
**Actor:** Guest → Registered User
**Preconditions:** None.
**Main flow:**
1. User completes Welcome → Interest → Pace steps.
2. User registers an account; onboarding data is attached.
3. User is granted 3 free generations.
4. User navigates to "New," enters a topic and category, submits.
5. System enqueues a generation job and returns a job ID.
6. Client polls job status until `DONE`.
7. A new Track and its first Lesson (5 Parts) are created and shown to the user.

**Postconditions:** `freeGenerationsLeft = 2`; a new Track with 1 Lesson exists for the user.

**Alternate flow (reuse):** At step 6/7, if a similar Lesson already exists and is not expired, the system assigns it instead of calling the LLM. From the user's perspective, the outcome is identical (a new Lesson appears); quota is still decremented.

### UC-2: Returning user continues a track
**Actor:** Registered User
**Preconditions:** User owns at least one Track with completed Lessons; `freeGenerationsLeft > 0`.
**Main flow:**
1. User opens Track, scrolls to the end of the path.
2. User taps "Generate Next."
3. System runs the same generation flow as UC-1 steps 5–7, appending the new Lesson to the existing Track (`orderInTrack` incremented).

**Exception flow:** If `freeGenerationsLeft = 0`, the button is disabled and a message explains the quota is exhausted (FR-GEN-03).

### UC-3: User completes a lesson and climbs the leaderboard
**Actor:** Registered User
**Preconditions:** User has an in-progress Lesson.
**Main flow:**
1. User answers each of the 5 Parts.
2. Each correct answer awards XP (FR-GAM-01) and updates streak (FR-GAM-03).
3. Upon the 5th Part being answered correctly, the Lesson is marked `COMPLETED` and bonus XP is awarded (FR-GAM-02).
4. The user's `xpThisWeek` updates accordingly.
5. User opens League and sees their updated rank.

### UC-4: Quota exhaustion
**Actor:** Registered User
**Preconditions:** `freeGenerationsLeft = 0`.
**Main flow:**
1. User attempts to generate (new topic or "Generate Next").
2. System returns `QUOTA_EXCEEDED`.
3. UI displays a clear, non-blocking message; no payment prompt is shown (MVP has no monetization).

---

## 5. Non-Functional Requirements

### 5.1 Performance
- NFR-PERF-01: The generate flow (LLM call + embedding check) shall complete within 10–30 seconds under normal provider latency; the UI shall never block or freeze during this time (must use the async job pattern in FR-GEN-04/05).
- NFR-PERF-02: Job status polling shall occur at an interval of 2–3 seconds and shall stop once a terminal state is reached.
- NFR-PERF-03: Vector similarity search shall use an indexed lookup (HNSW or IVFFlat on pgvector) rather than a full table scan, to keep query time acceptable as the Lesson table grows.

### 5.2 Usability & Responsiveness
- NFR-USE-01: All screens shall render correctly and remain usable at mobile (~360px), tablet (~768px), and desktop (~1280px+) breakpoints.
- NFR-USE-02: The Track visual path component shall degrade gracefully (e.g. vertical scroll) on narrow viewports rather than overflowing or becoming unreadable.

### 5.3 Reliability
- NFR-REL-01: A failed generation job (`FAILED`) shall not decrement the user's quota (FR-GEN-09).
- NFR-REL-02: Quota decrement and lesson/assignment persistence shall be atomic (single transaction) to prevent partial states (e.g. quota consumed but no lesson created).
- NFR-REL-03: Expired-lesson flagging (FR-EXP-01) shall be idempotent — re-running the job multiple times shall not cause errors or duplicate side effects.

### 5.4 Cost Efficiency
- NFR-COST-01: The system shall prefer lower-cost LLM/embedding model tiers by default, escalating to higher-precision models only for categories explicitly requiring it (Math, Programming), per `architecture.md` §3.
- NFR-COST-02: The similarity threshold used for reuse decisions (FR-GEN-06/07) shall be externally configurable without a code deployment.

### 5.5 Security
- NFR-SEC-01: Passwords shall be hashed using an industry-standard algorithm (e.g. bcrypt/argon2), never stored or logged in plaintext.
- NFR-SEC-02: All protected endpoints shall validate the auth token on every request (FR-AUTH-03).
- NFR-SEC-03: User-submitted free-text topic input shall be sanitized/validated before being used in LLM prompts, to reduce prompt-injection risk affecting other users' generated content.

### 5.6 Maintainability
- NFR-MAINT-01: Business-rule constants (quota size, XP values, similarity threshold, expiry duration) shall live in configuration, not hardcoded inline, per `business-logic.md`.
- NFR-MAINT-02: The system shall be structured as a modular monolith (BE) plus a separate worker process, not fine-grained microservices, per the rationale in `architecture.md` §6.

### 5.7 Scalability (MVP-appropriate)
- NFR-SCALE-01: The worker process shall be horizontally scalable independently of the API server (multiple worker instances consuming the same queue) without requiring architectural changes.
- NFR-SCALE-02: The system is not required to support real-time (sub-second) leaderboard updates at MVP scale; on-read ranking computation (per `business-logic.md` §5) is acceptable.

---

## 6. Traceability Notes

- Every `FR-*` in this document maps to a corresponding section in `prd.md` and, where applicable, `business-logic.md` for exact values/algorithms and `api-spec.md` for the concrete request/response contract.
- Requirements marked as reflecting an open question (FR-OB-08, FR-GEN-10) must be revisited once `open-questions.md` items are resolved; treat them as provisional, not final, acceptance criteria.
