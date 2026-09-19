# Edisco Implementation Plan and Specification Audit

Status: Phase 0 and the user-authorized Phase 1 persistence scope are complete, verified on 2026-09-19. Phase 1 uses user-selected Drizzle; the user explicitly deferred dimension-specific vector migration to Phase 4C. Product decisions and the schema changes they may require remain unresolved; this is not a frozen final product schema. Phase 2 and all product features have not started. The original audit below is retained; delivery records in Section 6 describe current implementation status.

## 1. Scope, sources, and readiness

All eight specification documents were read in full and considered collectively for the original plan. That audit did not approve their assumptions or select a provider. The repository originally contained only the specifications. A subsequent explicit user instruction authorized the minimum Phase 0 foundation; its implemented paths and deferred decisions are recorded in Section 6 and the root README. Other phases remain proposed work.

| Reference used below | Source | Primary contribution |
|---|---|---|
| README | [docs/README.md](docs/README.md) | Reading guidance, confirmation gate, provisional recommendations, MVP scope |
| PRD | [docs/prd.md](docs/prd.md) | Product, onboarding, navigation, content, quota, gamification |
| SRS | [docs/srs.md](docs/srs.md) | 42 functional requirements, 17 non-functional requirements, four use cases |
| ARCH | [docs/architecture.md](docs/architecture.md) | Frontend/API/worker separation, stack candidates, queue and generation flow |
| DATA | [docs/data-model.md](docs/data-model.md) | Eight entities, shared content, ownership, progress, jobs, weekly totals |
| BL | [docs/business-logic.md](docs/business-logic.md) | Quota, semantic reuse, expiry, templates, pace, XP, streak, league |
| API | [docs/api-spec.md](docs/api-spec.md) | 13 REST endpoints and common errors |
| OQ | [docs/open-questions.md](docs/open-questions.md) | Seven unresolved confirmations/decisions |

**Readiness verdict:** the proposed phase labels are useful, but a strictly sequential implementation is unsafe. Database design depends on unresolved product/contracts; generation reliability cannot wait until after working LLM/reuse paths; answer processing cannot be completed independently of reward rules; authenticated user/quota reads are needed before the Profile phase. Section 5 recommends the changes before implementation begins.

Interpretation rules for this plan:

- A **specified requirement** is supported by a source reference. Where sources disagree, the disagreement remains open.
- An **open decision** needs an explicit answer or documented disposition; source assumptions are not confirmations.
- A **proposed implementation safeguard** is a way to uphold specified ownership, quota, atomicity, or scalability requirements. Its mechanism is not an additional product requirement.
- A **missing requirement** is a gap to resolve, not permission to invent behavior. Conditional acceptance criteria below become final only after the corresponding decision is recorded and conflicting specifications are reconciled.
- Initial XP values, model examples, threshold examples, and stack alternatives remain recommendations. No current provider pricing or library support claims are made here; revalidation belongs to the later technical decision work.

## 2. Complete system model

### 2.1 Product and user journeys

Edisco is a responsive web learning application for arbitrary topics. A guest follows Welcome → multiple Interests (including Other text) → one Pace → Register/Login. Preferences temporarily live on the client, then are attached to the account through authenticated onboarding completion. Whether skipping is allowed remains OQ-1; returning-user routing and interrupted onboarding need clarification.

The five main destinations are Track, Lesson, New, League, and Profile. Mobile uses bottom navigation; desktop uses a sidebar. Track is the home learning path, with ordered lesson nodes and progress. A selector is provisional on OQ-2. Lesson lists owned lessons grouped by track and permits replay. New accepts topic/category; Generate Next appends a lesson to an existing track. League ranks weekly XP. Profile exposes identity, preferences, quota, XP, and streak statistics.

One successful generation gives one lesson with exactly five parts. The account receives three lifetime generations on onboarding completion under PRD §6/BL §1; new-track generation, continuation, and reuse each consume one. Failure consumes none. Both generation controls remain visible but disabled when exhausted, with a clear message. There is no reset, payment, or upgrade flow.

### 2.2 Component responsibilities

| Component | Specified responsibility | Important boundary |
|---|---|---|
| Next.js web app | Onboarding draft, five destinations, track path, exercise rendering, responsive states, polling | Presentation/client state; server owns quota, grading, rewards, and ownership checks |
| API modular monolith | Authentication, user preferences, track/lesson reads, generation submission/status, answers, league | Bearer-token contract is specified; exact auth integration is undecided |
| Separate worker process | Embedding query, eligible reuse lookup, structured LLM generation on miss, result persistence | Queue consumer, not a new HTTP domain service; can scale independently |
| PostgreSQL + pgvector | Domain data, jobs, vector search, ownership, progress, reward aggregates | Durable application state and transactional invariants |
| Redis/BullMQ | Queue between API and workers | Its delivery state must be reconciled with durable DB job state; failure policy is unspecified |
| Scheduled/background work | At least daily expiry flagging; weekly period handling according to selected strategy | Expiry never deletes content; weekly lazy creation is explicitly allowed |
| Generation/embedding providers | Structured five-part content and topic embeddings | Choices, dimensions, exact models, costs, and output capabilities remain open |

The API and worker share backend rules/contracts in one codebase. Do not duplicate quota or persistence logic across processes or turn each domain into a microservice. ARCH proposes Next.js, shadcn/ui/Tailwind, TanStack Query/Zustand, Fastify (with Hono as an alternative), BullMQ, and PostgreSQL/pgvector. Phase 0 selected Fastify and Phase 1 selected Drizzle; auth integration, hosting, and several operational choices remain unselected.

### 2.3 Data and ownership model

| Entity | Meaning and dependencies |
|---|---|
| User | Credentials, identity, interests/pace, onboarding marker, remaining quota, lifetime XP, streak dates/counts |
| Track | A user's ordered learning path for a broad topic; active-track policy unresolved |
| Lesson | Reusable shared content, category/topic, vector, content version, original generating user for audit, expiry |
| Part | One of exactly five ordered exercises; typed JSON includes private grading material |
| UserLesson | User-to-content assignment in a track, order, completion state, internal reuse marker |
| UserPartProgress | Progress for a part within a particular assignment, attempts, latest correctness, XP, completion time |
| GenerationJob | User request and durable PENDING/PROCESSING/DONE/FAILED status, eventual content/track identifiers |
| WeeklyLeagueEntry | Per-user weekly XP, Monday period identifier, optional stored rank; MVP ranking is on-read |

Shared Lesson content does not imply shared progress or authorization. `generatedByUserId` is audit provenance, not the owner check. All learner reads/writes traverse an owned UserLesson/Track. Foreign keys alone do not prove that a submitted part belongs to the lesson assignment or that a track belongs to the requesting user.

### 2.4 Generation, reuse, and quota lifecycle

The intended flow is authenticated submit → validate ownership/input/quota → persist/enqueue job → HTTP 202 → worker computes embedding → search eligible same-category lessons → reuse or structured LLM generation → commit assignment/content and one quota deduction → terminal job → client stops polling and opens the owned lesson.

The new-content branch creates one shared Lesson, five valid Parts, its embedding, original expiry, and an assignment. The reuse branch creates an assignment to existing content, sets `wasReused`, and avoids a content-generation LLM call. It still needs the query embedding and consumes one quota. Expiry limits future reuse only; existing owners keep access. Reuse disclosure is OQ-4.

The specifications do not yet define safe concurrent admission, job/request idempotency, DB-to-queue recovery, or the transaction boundary of terminal job status. They also do not define how continuation chooses a genuinely subsequent topic, how pace compatibility is enforced during reuse, or how the returned content ID resolves to the assignment ID needed by the UI. These are prerequisites, not final hardening details.

### 2.5 Content, learning, and rewards

Five categories have specialized banks plus a General fallback. Across them the named types are MULTIPLE_CHOICE, FILL_IN_BLANK, MATCHING, TRUE_FALSE, CODE_PREDICT, TRANSLATE, and SHORT_ANSWER. Mixed types and unrestricted composition remain OQ-3. Pace changes complexity/length, always retaining five parts. Type-specific prompt/answer/grading contracts must connect provider output, storage, API DTOs, and UI renderers.

The learner submits answers and receives correctness, explanation where available, earned XP, and lesson-completion status. SRS requires all five parts correct at least once for completion and allows replay. BL's retry XP and PRD's "at once" completion bonus do not fully agree with that model. Latest-answer correctness must be distinguished from historical completion. Successful activity affects total XP, daily streak, and the current weekly total; these effects need a consistent, concurrency-safe boundary.

Streak depends on days with at least one completed part. Weekly periods begin Monday in a consistent, unchosen timezone. The proposed global league is conditional on OQ-5; grouping/promotion is currently excluded. Exact reward eligibility, first-day behavior, replay rewards, ties, and zero-activity ranking are unresolved.

### 2.6 Security, reliability, and operational limits

Explicit security requirements are hashed passwords (never plaintext storage/logging), token validation on every protected request, and validation/sanitization of free-text topic input before prompts. Ownership enforcement follows from the specified user-owned resources. The private grading content stored in Part must be separated from the public prompt representation. Auth/session policy, detailed input limits, safe content rendering, rate-limit policy, and shared-content privacy handling still need design decisions; a new moderation/admin product is not authorized.

Explicit reliability requirements include no failed-job charge, atomic quota plus content/assignment persistence, idempotent expiry, and multiple workers without architecture changes. Polling is every 2–3 seconds until DONE/FAILED; generation must remain non-blocking. PRD's estimated 10–30 seconds is stronger wording in SRS and needs measurable conditions. Responsive checks cover approximately 360/768/1280+ pixels and evergreen browsers. Availability SLOs, backup/restore objectives, and failure recovery windows are not specified; this plan does not manufacture numeric targets.

## 3. Cross-specification audit

The IDs below are planning/audit references, not new FRs. "Blocks" identifies the first affected implementation decisions; Phase 8 also verifies the resolved outcomes. Resolution means an explicit decision and corresponding source/contract update, not a choice silently made by this plan.

| ID / type | Evidence and conflict or gap | Required disposition and phases affected |
|---|---|---|
| A01 — contradiction: approval state | README Important Notes and OQ introduction require confirmation before coding; SRS §2.4 says the assumptions are treated as resolved until corrected. PRD still marks them open. | Keep all seven unconfirmed. Record answers or an explicitly approved deferral, then reconcile documents before Phase 0. OQ-7's final empirical tuning is intentionally later. |
| A02 — incompatible auth assumptions | ARCH §2 recommends Auth.js or Lucia; API §1 specifies custom registration/login returning a bearer token to a separate API. DATA §1 allows nullable passwordHash for OAuth, although SRS FR-AUTH defines email/password only. | Specify credentials ownership, hashing, token issuance/validation, browser transport/storage, expiry, and cross-origin integration. Do not infer JWT, OAuth, or a replacement API. Blocks 0–2; verified in 3/8. |
| A03 — registration/schema contradiction | API registration carries only email/password/name and preferences arrive in a later PATCH. DATA §1 marks pace non-null with no default and interests as a required array. PRD's temporary client storage is not sent by the registration contract. | Define the pre-onboarding account state, nullable/default fields or revised atomic registration contract, and interrupted registration recovery. Do not fabricate a pace preference. Blocks 1–3. |
| A04 — quota activation and replay gap | DATA §1 defaults quota to 3; SRS §1.3 says "3 at signup"; PRD §6, FR-OB-09, and BL §1 grant it at onboarding completion. API onboarding always illustrates 3 and has no repeated-call semantics. | Reconcile stored pre-onboarding balance versus usable quota; grant once, with repeat/concurrent completion unable to replenish lifetime quota. Define incomplete-user generation access and repeat-PATCH response. Blocks 1/3/4A; verifies 4D/7. |
| A05 — interest/category representation gap | PRD §3/FR-OB-02 require Other free text and include Career/Soft Skills among examples. DATA §1 and API §§2/7 have only category-string arrays. Generation enum has six uppercase categories; onboarding examples are lowercase. DATA also promises interest-based suggestions on New. | Define canonical interests, Other text encoding, category mapping/General fallback, validation, and suggestion behavior. Interests are preferences, not a strict generation filter. Blocks 1/3/4A/4B/7. |
| A06 — returning user and onboarding recovery gap | FR-OB-06/08 require Register/Login last; UC-2 assumes a returning authenticated user. No returning-login bypass/re-entry policy is described. `GET /users/me` omits onboardingCompletedAt, although routing/recovery may need it. | Clarify returning-user navigation, failed onboarding save/resume, and whether draft preferences overwrite an existing account. Approve an onboarding-state contract if needed. Blocks 2/3; affects 7. |
| A07 — generation input/context inconsistency | ARCH §4 sends `{topic,category,pace}` and embeds topic+description; API §4 omits pace and makes topic optional for continuation; BL §2.1 suggests topic+category+level/pace. GenerationJob requires requestedTopic but stores no pace/context snapshot. | Define canonical request resolution for new/existing tracks, category mismatch handling, source of pace, and the point at which changing preferences stops affecting a pending job. Resolve missing-topic derivation. Blocks 1/4A–4C/7. |
| A08 — continuation semantics gap | PRD §5/FR-GEN-02 promise a next lesson in a path; UC-2 requires completed lessons but API defines no completion gate. BL's same-topic search can reuse the user's already-owned lesson; PRD §6 expressly permits same-user reuse in general. | Define curriculum/subtopic context, repeat-content policy for continuation versus a new request, prerequisites, and ordering under simultaneous continuations. Do not globally forbid same-user reuse or invent a curriculum engine. Blocks 1/4A–4C/5. |
| A09 — missing per-type content and grading contracts | DATA §4 supplies JSON and a type enum with an ellipsis; API §5 illustrates only MC and accepts string/string[] for every answer. BL §3 includes matching, translation, numeric/step answers, and possible intensive subquestions. | Define the closed MVP type set, prompt/answer DTOs, private solutions, normalization, matching encoding, accepted alternatives/tolerances, and grading method. Deterministic versus model-based grading is unresolved and affects latency/cost. Contracts must precede 4B and 5; schema support in 1. |
| A10 — conflicting completion/retry meaning | FR-TRK-05/UC-3 require all parts correct at least once; BL §4 gives 5 XP for a wrong answer that "proceeds after retry." It is unclear whether this means a later correct answer or advancing while still wrong. | Define retry/advance behavior, what counts as part completion and streak activity, and whether 10 versus 5 XP replaces or accumulates. Blocks progress/reward design in 1/5/6; informs 4B content feedback. |
| A11 — bonus/replay ambiguity | PRD §7.1 awards full-lesson bonus "at once"; FR-GAM-02 and BL §4 simply say five parts completed. FR-TRK-06 allows redo, with no repeat-XP policy or session model. API xpEarned does not state whether it includes bonuses. | Define session dependence, first completion versus replay eligibility, duplicate HTTP submission semantics, and response reward accounting. Do not assume zero replay XP or unlimited farming. Blocks 1/5/6. |
| A12 — progress-state ambiguity | DATA §6 isCorrect means latest attempt; FR-TRK-05 means ever correct. startedAt/completedAt/status transitions are unspecified. API read returns latest correctness/attempts but no durable per-part completion marker. | Define monotonic completion evidence and replay display/state rules; clarify whether viewing or answering starts a lesson. Use completedAt or another approved mechanism without clearing earlier completion on a later wrong answer. Blocks 1/5/6. |
| A13 — streak/daily-bonus gaps | BL §4 defines date differences but not first activity with null lastActivityDate, timezone, or displayed current streak after inactive days. "+5 XP bonus/day" and "cumulative" do not define eligibility or whether it scales with streak length. | Select calendar/timezone rules, first-day and inactivity behavior, daily-bonus timing/eligibility, and concurrent same-day handling. No per-user timezone preference is specified. Blocks 1/5/6/7. |
| A14 — league behavior and scheduling gaps | BL §5 permits scheduled or lazy weekly entry creation, calls for Monday boundaries, and makes prior-week finalization optional. API §6 lacks tie, no-entry/myRank, result-size, and zero-XP membership semantics. Global "all users" may differ from only users with lazy rows. | Select timezone, weekly rollover strategy, ranking ties, empty/new-user results and response bounds. Keep old-week history/badges optional; do not require rank storage. OQ-5 may change the scope. Blocks 1/6; affects 7/8. |
| A15 — job result cannot directly identify the learner route | DATA §7/API §4 return resultLessonId pointing to shared Lesson; API §5 opens `/lessons/:userLessonId`, a distinct assignment. Same content can have multiple assignments. ARCH §4 instead uses lessonId/lowercase statuses; API/DATA use uppercase. trackId null-until-complete wording also conflicts with a known continuation track. | Agree a navigable result contract: e.g. add an assignment ID, or explicitly resolve it through track results without ambiguity. Define field names, uppercase states and nullability by state. Proposed field changes need a contract update. Blocks 1/4A/4D/5. |
| A16 — DB/queue reliability gap | ARCH §4 saves a job then enqueues it, with no handling of partial DB/Redis failure, duplicate delivery, lost acknowledgement, or worker crash. DATA §7 has no retry/recovery metadata. NFR-SCALE-01 explicitly permits multiple workers. | Define durable handoff/reconciliation, idempotent execution/commit, recoverable versus terminal failures, provider deadlines, retry bounds/backoff, and stale-job recovery. An outbox is one candidate, not a selected requirement. Design in 0/1; implement safeguards in 4A before providers; stress in 4D/8. |
| A17 — concurrent quota and terminal-state gap | Admission only checks quota >0; charging happens after success. Multiple pending jobs can all pass on the last credit. FR-GEN-09 says "after ... DONE" while also requiring atomic assignment/decrement; ARCH separates persistence and final updates visually. | Decide concurrent admission behavior (serialization, separate reservation, or final conditional admission are alternatives). Specify user-visible denial/error behavior. Proposed invariant: guarded finalization commits assignment/content, one deduction and DONE together; failure/duplicate delivery cannot overspend or double-charge. Blocks 1/4A; both branches must use it in 4B/4C; prove in 4D. |
| A18 — missing relational/concurrency constraints | DATA provides FKs but no uniqueness for `(userLessonId,partId)`, `(userId,weekStartDate)`, part order, or orderInTrack; no positive/count constraints or same-owner cross-link protection. Multiple jobs may append the same order. | Plan constraints and transaction/locking rules for these invariants; validate exactly five distinct ordered parts at finalization. Do not add unique `(userId,lessonId)` until repeat-assignment policy is decided. Blocks 1 and each writing slice: 3/4A/5/6. |
| A19 — similarity metric/threshold inconsistency | BL §2.1 calls its ordering "cosine/L2 distance" and accepts distance <= threshold; §2.2/OQ-7 describe cosine similarity >0.92. These are not interchangeable scores/comparisons. | Select one metric and matching vector operator/index configuration, score conversion/range and equality rule. Do not compare a distance directly with the example similarity value. Verify provider/vector documentation when selecting implementation. Blocks vector migrations in 1 and lookup/evaluation in 4C. |
| A20 — personalization/reuse compatibility gap | FR-GEN-12 requires pace-adjusted content; BL §2.1 only hard-filters category and expiry, with pace merely an example embedding input. DATA Lesson has no explicit pace/level/context compatibility metadata. | Define when cross-pace or cross-level reuse is acceptable and how continuation/content-version compatibility is represented. Similar-topic proximity alone is not an agreed compatibility guarantee. Blocks 1/4B/4C/7. |
| A21 — expiry freshness and boundary inconsistency | FR-EXP-03/PRD §6 exclude expired lessons; BL §2.1 checks only isExpiredForReuse, updated daily. A just-expired lesson can remain eligible until cron. PRD says age <3 months; BL uses expiresAt < now(), leaving the exact boundary unclear. | Keep daily idempotent flagging and define time-based eligibility at query/commit boundaries. Resolve calendar-month arithmetic versus fixed duration and equality before tests; do not reset original expiry when reusing. Blocks 1/4C; failure/replay checks in 4D/8. |
| A22 — embedding/version/lookup decisions | DATA §3 describes normalized-topic lookup before vector search, absent from BL/ARCH flow; vector dimension depends on OQ-6. contentVersion exists but has no compatibility policy. Index is HNSW or IVFFlat, not selected. | Define normalization and whether exact lookup is used; it must not bypass semantic eligibility requirements. Select model/dimension/index and version compatibility. If model changes require re-embedding, document a future migration path, not an automatic MVP re-embedding feature. Blocks final vector schema in 1 and 4B/4C. |
| A23 — runtime configuration ambiguity | README says recommendations are tunable without code changes/redeployment; NFR-COST-02 explicitly requires threshold updates without code deployment. BL §2.2 suggests config/env but does not explain propagation to running workers. | Define validated configuration source, reload/restart expectations, consistency across processes and a per-job snapshot/version if necessary. Keep values centralized; do not assume a new admin UI or configuration service. Blocks 0/4A/4C/6; verify 8. |
| A24 — ownership and public/private payload gaps | API intro requires auth but does not spell out object ownership or public DTO filtering. DATA Part JSON includes correct answers; shared Lesson includes generatedByUserId/wasReused-related provenance. FR-GEN-10 is provisional. | Define ownership checks for tracks, jobs, assignments and nested parts; select forbidden-versus-not-found error behavior. Define learner-safe prompt fields and internal-only solutions/provenance, conditional on OQ-4. Blocks 2/4A/4B/5; adversarial verification 8. |
| A25 — security/input/failure contract gaps | NFR-SEC-03 requires topic validation; ARCH mentions Redis rate limiting but no policy. API lacks field limits, duplicate-email/credential error behavior, most HTTP error mappings, and safe provider error details. No generated-markup or shared-content privacy rules are supplied. | Define input bounds, credential/session/error rules, prompt/content isolation and safe renderer handling; decide whether rate limits are needed and their behavior without inventing numbers. Review cross-user reuse privacy. Moderation/admin workflows, OAuth, password reset and email verification are not implied scope. Blocks 0/2/3/4A/4B/5; verify 8. |
| A26 — platform scope ambiguity | PRD §1/ARCH §2 say PWA-ready; SRS §2.3 says PWA-installable. Single UI language is assumed but unnamed. Neither defines offline learning/generation. | Confirm installability deliverables and UI/content-language defaults. Do not infer offline lessons, background answer sync, audio or translation UI. Affects 0/3/4B/5/8. |
| A27 — unmeasurable performance/operations conditions | PRD §8 estimates 10–30 seconds; NFR-PERF-01 says shall complete within that range under normal provider latency. Queue wait, retry inclusion, expected concurrency, percentile and failure UI are unspecified. No uptime/backup/recovery targets exist. | Define measurement start/end, representative workload/provider conditions and reporting, plus operational recovery expectations. Treat faster reuse as success, not a failure to wait 10 seconds. Do not claim an unconditional 30-second SLA. Affects 0/4A–4D/8. |
| A28 — unselected infrastructure/stack decisions | ARCH §2/5 leaves Fastify/Hono, Auth.js/Lucia, Prisma/Drizzle, index, and backend hosting alternatives. ARCH §6 mentions microservices for worker scaling although NFR-SCALE-01 already requires independent workers. | Record concrete selections and a shared API/worker domain/persistence layout after compatibility review. Keep the specified modular monolith and scalable queue consumer; no service split is needed for MVP worker scaling. Blocks 0/1/2; provider-specific choices block 4B/4C. |
| A29 — illustrative contract examples versus lifetime quota | API §3 shows lessonCount=4, while PRD §6 grants only three lifetime successful assignments with no replenishment/import mechanism. API lesson-detail example shows one part, while the requirement is exactly five. | Treat examples as incomplete illustrations needing corrected fixtures, not authorization for a fourth credit or one-part lessons. Clarify any intended seeded data exception before adding it. Affects contract fixtures in 0/4A/5/8. |

## 4. Review of every open question

All statuses are **unconfirmed**. The dependencies below are in addition to the source-wide pre-coding confirmation gate (A01). Answers may require updating several specifications together; no branch here is silently selected.

| ID / source item | Current assumption, not approval | Decision or evidence needed | Directly dependent phases |
|---|---|---|---|
| OQ-1 / #1: skipping onboarding | Cannot skip; interests and pace required | Confirm no-skip, or specify skip/default behavior and what counts as completed onboarding/quota activation. | 1 pre-onboarding schema; 2 routing; 3 flow/validation; 4A/4B preference eligibility; 7 editing; 8 end-to-end criteria |
| OQ-2 / #2: multiple tracks | Multiple simultaneous tracks with selector | Confirm multi-track or define one-active-track/history/switch behavior. Single-track does not automatically imply deleting history. | 1 Track/assignment constraints; 4A new versus continue; 4C reuse assignment context; 5 path/list/selector; 8 navigation tests |
| OQ-3 / #3: mixed part types | Mixing allowed; AI freely chooses combination | Confirm both **mixing versus uniform** and **free composition versus fixed sequence/ratio**. BL §3 raises the second question explicitly; it must not disappear into the first. | 1 typed content contract; 4B templates/validation; 4C compatible stored content; 5 renderers/grading; 6 completion/reward integration; 8 coverage |
| OQ-4 / #4: disclose reuse | Hidden from learner | Confirm hidden or define visible label/copy/API fields. Regardless, reuse consumes quota and preserves owner access under existing rules. | 4A result contract/copy; 4C assignment/projection; 4D failure/success UX; 5 lesson presentation; 8 leakage checks |
| OQ-5 / #5: league grouping | One global leaderboard; grouping later | Confirm global MVP. If grouping is required, explicitly revise PRD §9/SRS scope and plan group/membership/rollover/promotion rules; a column alone is insufficient. | 1 weekly schema; 5 reward integration; 6 ranking/scheduler/UI; 7 stats consistency; 8 acceptance |
| OQ-6 / #6: providers | No selection; inexpensive content/embedding models recommended, may differ | Select provider/model for each role, embedding dimension, structured-output capabilities, cost/quality evaluation criteria and any category model routing. Check current provider documentation at selection time. | 0 provider configuration boundaries; 1 final vector migration; 4A provider error/timeout contract; 4B LLM; 4C embeddings; 4D failure/latency tests; 8 cost/performance evidence |
| OQ-7 / #7: similarity threshold | Strict initial cosine-similarity example >0.92; later empirical tuning | Confirm the initial experiment/rollout policy, metric conversion and configurable initial value. Final quality tuning needs real usage over subsequent weeks; it is not a number this plan can determine. | 0 configuration contract; 1 compatible index metric; 4C benchmark/threshold/logging; 4D reuse reliability; 8 initial evaluation and later-tuning handoff |

Before coding, record Wil's confirmations or explicitly authorized deferrals, consistent with README/OQ. OQ-7 can be acknowledged as an empirical decision whose final value remains deferred; this is different from silently accepting 0.92 as validated. Structural questions must be answered before their dependent schema or contracts are finalized. No response is solicited as a prerequisite to finishing this planning task.

## 5. Dependency analysis and recommended sequence

### 5.1 Changes required before implementation

1. **Add a decision/contract gate before Phase 0.** Reconcile A01–A09 and the structural parts of later findings as applicable. This is specification work, not a new application phase. Document selected alternatives and provisional acceptance conditions before committing dependent schema.
2. **Make Phase 1 incremental.** Establish relational foundations after structural decisions, then add provider-specific vector schema, job recovery fields, and reward constraints alongside their approved slices. Do not freeze all eight entities while OQ-2/5/6 and A03/A09/A17 are open.
3. **Move the minimum safety portion of 4D into 4A.** Durable handoff, ownership, bounded failure handling, idempotent terminal commit, concurrent quota policy and ordered assignment must exist with deterministic generation fixtures before real provider work. 4B and 4C extend that safe path; 4D then verifies recovery and race behavior across the complete pipeline.
4. **Pull the authenticated `GET /users/me` read into Phase 2/3 and use it in 4A.** Onboarding recovery and quota controls cannot wait until Phase 7. The full Profile screen and preference editing remain in 7.
5. **Agree Phase 5/6 contracts before Phase 5 answer writes; deliver their reward core together.** The answer API promises XP and completion immediately. Implement progress, reward eligibility, user totals, streak and weekly totals consistently in the same learning slice; Phase 6 completes league UI/period operations and broader gamification verification. Phase 5 is not accepted with a fake xpEarned field.
6. **Use vertical verification inside the generation split.** 4A exercises API → queue → worker → DB → polling with fixtures; 4B adds real validated content on an explicit test miss; 4C connects real embeddings/reuse and expiry; 4D qualifies the integrated behavior. The actual production pipeline searches before generation even though the LLM adapter is built before the embedding adapter. Do not release 4B alone as the specified generation feature.
7. **Begin security, responsiveness, and reliability in each slice.** Phase 8 integrates and hardens them; it does not supply the first ownership checks, password hashing, transaction protection, or mobile layout.

Recommended delivery order after the decision gate:

`0 → 1 (base, then incremental) → 2 → 3 → 4A (includes early 4D safety) → 4B → 4C → 4D → 5 + reward core of 6 → remainder of 6 → 7 → 8`

Phase 5 renderers/read-only pages may be developed using approved typed fixtures after Phase 3 and the content contracts, without waiting for live generation. Phase 7 preference UI may similarly be prepared early, but acceptance depends on its effects on generation and stats. These are dependency options, not instructions to start parallel agent work.

### 5.2 Gates and dependency evidence

| Gate | Must be available | Enables |
|---|---|---|
| G0: source/decision gate | OQ dispositions; stack/auth boundary; registration/quota activation; track/league scope; content, grading, reward, time and generation contract decisions scheduled before their affected work | Phase 0 only after required pre-coding confirmations; no coding in this task |
| G1: account foundation | Credential storage/token contract; partial account state; one-time onboarding grant; ownership convention | 2/3 and authenticated generation entry |
| G2: safe job slice | New/next resolved input, assignment-result ID contract, quota concurrency policy, DB/queue recovery, atomic idempotent finalization, configuration | Real provider integration in 4B/4C |
| G3: content and reuse | Type schemas and grading contract, provider/dimension/metric, pace/context compatibility, expiry rules, initial threshold policy | Full generation acceptance in 4D; real content in 5 |
| G4: learning/rewards | Retry/replay/completion rules, private/public content split, timezone/daily bonus/weekly rules, concurrency-safe persistence | Joint 5/6 answer slice and league |
| G5: release evidence | All FR/NFR/API mappings exercised, deferred decisions acknowledged, unresolved release blockers closed, operational evidence collected | Completion of 8; deployment itself is outside this planning task |

## 6. Phase-by-phase implementation plan

Paths are illustrative allocations following ARCH §5. They do not select an ORM or require a new framework. `apps/api/<db>/` means the selected ORM schema/migration directory; only one persistence tool is to be chosen. `packages/domain/` and `packages/database/` are proposed shared libraries for API/worker reuse, not new services. Exact file extensions/names are implementation choices after Phase 0 decisions.

### Phase 0 — Project Foundation

- **Delivery status (2026-09-19):** Complete within the subsequent user instruction's minimum-infrastructure scope. The user explicitly authorized Phase 0 despite the original blanket pre-coding gate. This is a scoped deferral of unrelated product decisions, not confirmation of OQ-1–7 or authorization for Phase 1.
- **Delivered files:** Root npm workspace/lockfile, strict TypeScript baseline, Biome configuration, ignored local environment plus `.env.example`, root `README.md`, `compose.yaml`, pgvector initialization; `apps/web` (Next.js App Router + Tailwind), `apps/api` (Fastify health/404 and entry point), `apps/worker` (BullMQ Redis connection and process lifecycle), `packages/shared-types` (type-only health contract), and `tests/foundation.test.mjs` (Node's built-in runner). No original `docs/` specification was changed.
- **Architecture decisions:** npm workspaces with no additional task runner; Next.js frontend and Fastify primary API choice; separate non-HTTP worker; PostgreSQL/pgvector and Redis as the only datastore services. Native Node environment loading avoids dotenv. Biome supplies lint/format together, avoiding incompatible current ESLint plugin peer ranges. Shared types hold no backend runtime or secrets. Exact installed versions are locked.
- **Scope adjustments/deferred decisions:** No ORM/schema/application DB client, auth library, provider SDK, business-rule constants, shared domain/config/database abstraction, hosted CI/deployment, state provider, shadcn component or empty feature route/module is added before use. The worker verifies Redis readiness but consumes no jobs; Phase 4A owns queue/processor and recovery policy. Product language/PWA scope and all seven open questions remain unresolved. Root README documents these boundaries and run commands.
- **Verification record:** `npm install --no-fund`, clean `npm ci --no-fund` (0 reported vulnerabilities), `npm run build`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, and `npm ls --depth=0` passed. Both production `start --workspace` and development `dev:web`/`dev:api`/`dev:worker` startup passed; web HTTP 200, API health `ok`, worker Redis readiness, Redis `PONG`, and PostgreSQL pgvector 0.8.6 with zero application tables were observed. Docker Compose configuration and datastore health were checked through WSL. `.env` and build outputs are ignored; `git diff -- docs` is empty.
- **Continuation closeout:** Inspected the existing foundation before making further changes; no additional application code or infrastructure was needed. Repeated clean install, build, typecheck, lint, format check, the foundation test and workspace dependency validation successfully. A final production startup smoke check passed for web/API/worker; datastore checks again confirmed pgvector and zero application tables. Temporary verification processes were stopped and Compose containers removed with data volumes preserved. No Phase 1 work was started.
- **Review:** Applied the installed ECC architect guide locally against ARCH §§1/2/5; no nonexistent ECC command was invoked. Applied the installed Ponytail full and Ponytail review skills. Removed the unused Next-generated `CLAUDE.md` alias (1 line); retained the automatically managed `apps/web/AGENTS.md`. Final complexity review: lean, no further cuts identified. Architecture remains one web app, one API and one separate worker process with the two specified datastores. No speculative feature infrastructure was introduced.
- **Environment issues:** Docker is available through Ubuntu WSL, not Windows PATH. This machine stopped detached containers when the last foreground WSL session ended, so verification kept Compose attached; README gives the working command. Redis's host memory-overcommit warning remains an environment follow-up for queue workloads, not a foundation startup failure.
- **Objective:** Prepare the agreed frontend/API/worker workspace, shared contracts/configuration and development checks without implementing product features prematurely.
- **Specification references:** README Important Notes; ARCH §§1–6; SRS §2 and NFR-MAINT-01/02, NFR-SCALE-01; API introduction/§8; OQ #1–7.
- **Dependencies:** Original G0 is superseded only for the user-authorized minimum Phase 0 scope documented above. Framework/workspace choices are recorded; ORM/auth/hosting/provider decisions remain deferred to their dependent work. Later phase gates are unchanged.
- **Expected modules/files:** Future workspace manifests and scripts; `apps/web/app/`, `apps/api/src/`, `apps/worker/src/`; `packages/shared-types/` for public contracts; proposed shared domain/config/database boundaries; `.env.example`; local PostgreSQL/pgvector/Redis configuration; CI/check configuration; decision records if adopted.
- **Database work:** Establish migration ownership and local extension/connection requirements; no speculative final product schema before Phase 1 decisions. Confirm the chosen persistence tool can support the required vector SQL/indexes and transactions.
- **Backend work:** Agree module boundaries (auth/users/tracks/lessons/quota/league), request validation/error conventions, configuration validation and secret handling. Resolve the auth integration contract, rather than installing an auth library and discovering incompatibility later.
- **Frontend work:** Establish Next.js and the proposed UI/state stack, route grouping, API-client contract, responsive primitives, and onboarding/main-shell boundary. Record installability and single-language scope.
- **Worker/background work:** Establish separate process entry/config/queue contract and a shared-rule import strategy. Decide configuration propagation and scheduler ownership; do not call providers.
- **Tests:** Future type/lint/build checks; configuration rejects missing secrets/invalid constants; API/worker can use the same contracts; local dependency connectivity and process isolation checks.
- **Acceptance criteria:** One documented stack selection; reproducible development/check commands; API and worker are independently runnable with shared contracts; secrets are server-only; no unresolved choice is buried in dependency installation. Foundation reflects the approved API boundary.
- **Explicit non-goals:** Product endpoints, complete schema, auth feature delivery, provider integration, deployments, microservices, extra app features.
- **Unresolved decisions affecting phase:** A01/A02/A23/A25–A28; all OQ dispositions at G0. OQ-6/7 may leave isolated provider/evaluation details deferred only if explicitly recorded.

### Phase 1 — Database

- **Delivery status (2026-09-19):** `COMPLETE` for the user's explicit persistence-only scope. All eight DATA entities are implemented without feature behavior. Phase 2 remains unauthorized. The original broader acceptance criteria below are not all settled: A03's pre-onboarding account contract and later provider/reward/job decisions still need reconciliation before their dependent phases.
- **Confirmed choices:** The user selected **Drizzle** and explicitly deferred dimension-specific vector migration to **4C**. No direct DATA/ARCH incompatibility was found. `embedding` remains required but uses dimensionless pgvector until the selected model/dimension and index/operator are known. Existing product ambiguities remain unresolved; required `User.pace`, quota default 3, and the documented track/league structures are preserved rather than redesigned.
- **Delivered files:** `packages/database/src/{schema,client}.ts`, package/TypeScript configuration, `apps/api/drizzle.config.ts`, migrations `0000_initial_persistence.sql` and `0001_progress_relationships.sql` plus generated metadata, `tests/database.test.mjs`, workspace dependency/scripts/lockfile updates, environment/Compose port configuration, and root README/handoff updates. API and worker share the server-only client package; no runtime connection or feature module is added to either application. This moves the shared schema to a package while retaining migration ownership under the API.
- **Database integrity:** Eight UUID primary keys, twelve foreign keys, six unique constraints, seven checks, eleven additional B-tree indexes (25 indexes including key/unique indexes). Composite track-owner foreign keys and three SQL triggers prevent invalid progress relationships, including concurrent parent changes, without adding model columns. Referenced rows use `NO ACTION`; expired shared content is retained. The seven explicitly listed part types are represented; new types require an approved migration. JSON shape, exactly-five insertion, `updatedAt` updates, expiry calculation, job state transitions, quota, and rewards remain application responsibilities in later phases.
- **Verification:** Both migrations applied successfully to the existing Compose development database; it has eight application tables, two migration records, and zero application rows. Integration tests create a fresh database without pgvector, initialize the extension through migrations, apply/reapply migrations, exercise constraints/relationships/defaults/vector and JSON mapping/shared progress/rollback/concurrent ordering and league inserts/concurrent parent changes/expiry retention, then remove only that temporary database (8 tests passed). Schema regeneration reports no changes; database build emits inferred type declarations. Workspace build, typecheck, foundation test, lint and formatting checks pass. Production dependency audit reports 0 vulnerabilities; the full audit reports 4 moderate findings in Drizzle Kit's development-only esbuild chain. Ponytail database review found no unnecessary abstractions to remove.
- **Environment adjustment:** A pre-existing Windows PostgreSQL process owns port 5432. Made the Compose host port configurable with default 5432; this machine's ignored `.env` uses port 55432 for both Compose and `DATABASE_URL`. No other database service or volume was changed. The initial authentication failure occurred before migration; an integration assertion was also corrected to isolate the intended ownership constraint from an overlapping uniqueness violation.
- **Deferred migrations/limits:** Phase 4C owns `vector(N)`, dimension validation, index/operator choice, and compatibility policy. A03 must reconcile registration-before-onboarding with DATA's required pace before Phase 2. Future slices own approved changes for quota activation, part-type contracts, rewards, job recovery, or product decisions. No provider, auth, replay policy, league grouping, or generation logic was selected or implemented here.
- **Objective:** Establish the approved relational model and invariant-supporting migrations, adding later slices' fields only once their contracts are settled.
- **Specification references:** DATA §§1–9; BL §§1–5; SRS FR-OB-09, FR-GEN-08/09, FR-EXP-01–03, FR-TRK-05, FR-GAM-01–05; NFR-REL-02/03, NFR-PERF-03, NFR-SCALE-01.
- **Dependencies:** Phase 0; G1 account decisions; OQ-2/5 for track/league structure. Final vector migration depends on OQ-6 plus A19/A22. Progress/reward schema depends on A09–A14. Job safety additions depend on A15–A18.
- **Expected modules/files:** `apps/api/<db>/schema.*`, ordered migrations, `packages/database/` client/repositories/transaction helpers, `packages/shared-types/` enums and approved content/answer types; database integration fixtures.
- **Database work:** Implement User, Track, Lesson, Part, UserLesson, UserPartProgress, GenerationJob, WeeklyLeagueEntry as reconciled. Define FK/delete behavior without deleting expired owned content. Propose unique part order, assignment order, progress-per-part, weekly-user-period, nonnegative balances/counts, and ownership consistency. Scope any deduplication to the decided job/request semantics. Finalize vector dimension/index metric and reusable eligibility indexes with 4C if not ready earlier. Exactly-five validation belongs in transactional application writes as well as appropriate DB constraints.
- **Backend work:** Provide persistence operations that can participate in one transaction; avoid separate repositories that independently commit assignment, quota, progress and rewards. Keep public DTOs distinct from persistence rows.
- **Frontend work:** Consume approved enums/DTOs only; no DB client in the browser. Supply fixture contracts needed by onboarding and exercise work.
- **Worker/background work:** Allow API and worker to use the same migration version and persistence logic; design safe job-finalization and scheduled-job writes. Add handoff/recovery storage only for the selected mechanism.
- **Tests:** Migration from empty database; FK/uniqueness/check violations; two users sharing content with independent assignments/progress; transaction rollback; approved pre-onboarding state; concurrent order/weekly-entry creation. Test vector dimensions/index compatibility when that migration is introduced.
- **Acceptance criteria:** Schema supports registration before onboarding, the confirmed track model and all specified entity relationships. Invalid cross-links/duplicate progress cannot corrupt state. Remaining dependent migrations are explicitly listed; this phase is not called final while provider/reward decisions remain open.
- **Explicit non-goals:** Guessing missing preferences, adding payments/groups contrary to scope, automatic data imports, deleting expired lessons, selecting replay restrictions through an accidental uniqueness constraint.
- **Unresolved decisions affecting phase:** OQ-1/2/3/5/6/7; A03–A05/A07–A22/A28. A02 affects credential/session storage. A01 governs readiness.

### Phase 2 — Authentication

- **Objective:** Deliver email/password registration and login with token-protected backend access and the early current-user read needed by later flows.
- **Specification references:** SRS FR-AUTH-01–04, NFR-SEC-01/02; PRD §3; ARCH §2; DATA §1; API introduction, §§1/7/8.
- **Dependencies:** Phase 0 auth decision; Phase 1 account/credential schema and G1; routing policy from A06. Registration must work before preferences are attached.
- **Expected modules/files:** `apps/api/src/modules/auth/` handlers/service/token validation; `apps/api/src/modules/users/` current-user read; `apps/api/src/plugins/` auth integration; `apps/web/app/(onboarding)/` register/login pages; `apps/web/lib/api-client.*` and auth/session boundary; public auth/user DTOs.
- **Database work:** Unique account identity and approved password hashing storage; session/token persistence only if required by the chosen design. Preserve the approved incomplete-onboarding state and unactivated quota semantics.
- **Backend work:** `POST /auth/register` (201), `POST /auth/login` (200), protected-request token validation, consistent errors. Implement `GET /users/me` now for authenticated user/quota state; reconcile any onboarding-state addition before use. Apply object-ownership helpers as resource modules appear.
- **Frontend work:** Register/Login screens placed at the specified point in the first-time flow, with credentials errors and session handling. Follow the resolved returning-user navigation; integrate the early current-user query. Do not lose the draft preferences while authenticating.
- **Worker/background work:** None required; worker does not receive browser credentials or issue user tokens.
- **Tests:** Valid and invalid registration/login, duplicate identity behavior, password hashes and no plaintext logging, missing/invalid/expired token behavior as selected, protected endpoint rejection, isolation of authenticated users, partial-account persistence and current-user projection.
- **Acceptance criteria:** API auth request/response contract works end-to-end; token validation runs on every protected route; credential storage meets NFR-SEC-01; a registered but incomplete account can resume onboarding according to the approved contract without receiving extra usable quota.
- **Explicit non-goals:** OAuth, social login, email verification, password reset, email/password edit APIs, or logout/refresh endpoints unless separately specified during contract resolution. Do not silently replace bearer auth with an incompatible browser-only session flow.
- **Unresolved decisions affecting phase:** OQ-1; A02–A06/A24/A25. Additional auth lifecycle behavior must be settled rather than inferred from a library default.

### Phase 3 — Onboarding

- **Objective:** Deliver the first complete account journey: collect preferences before registration, persist them after authentication, and activate the lifetime grant once.
- **Specification references:** PRD §§3/6; SRS FR-OB-01–09, UC-1; DATA §1; BL §1; API §2; OQ #1.
- **Dependencies:** Phase 2; account/onboarding schema from 1; confirmed skipping, returning-user, Other-text/category and grant/retry contracts (G1).
- **Expected modules/files:** `apps/web/app/(onboarding)/` welcome/interests/pace/auth flow; `apps/web/lib/onboarding-draft.*`; `apps/api/src/modules/users/onboarding.*`; shared onboarding schemas; navigation-shell integration.
- **Database work:** Persist interest/Other representation, pace, onboardingCompletedAt and approved initial quota activation in a guarded transaction. Repeated/concurrent completion must not refill spent credits or change the original completion marker unintentionally.
- **Backend work:** `PATCH /users/me/onboarding` with confirmed validation and repeat-call semantics; expose sufficient current-user state for recovery. Enforce the approved incomplete-onboarding access rule for later generation. Keep preference edits from becoming a second grant mechanism.
- **Frontend work:** Welcome CTA → multiple interests (at least one under the current assumption) → one pace → Register/Login. Persist the draft as specified, handle refresh/back and failed preference save, and clear it after successful attachment according to the resolved recovery policy. Render responsive empty Track/main navigation states after onboarding.
- **Worker/background work:** None; onboarding/grant is synchronous database work, not a generation job.
- **Tests:** Required selections/Other validation, agreed skip behavior, order/deep-link enforcement, draft survival and cleanup, register-then-save retry, returning-login behavior, concurrent/repeated onboarding PATCH after quota has been spent, server-side generation eligibility.
- **Acceptance criteria:** UC-1 account segment works in the specified order; approved preferences reach the account; completion grants exactly three lifetime usable generations once; repeating the operation cannot replenish them; failures can be retried without losing the draft or corrupting account state.
- **Explicit non-goals:** LLM generation, payment/reset mechanisms, changing pace into a variable part count, unapproved onboarding shortcuts.
- **Unresolved decisions affecting phase:** OQ-1; A03–A06/A25/A26. OQ-2 affects the destination/empty Track presentation but does not justify deciding active-track behavior here.

### Phase 4A — Generation Infrastructure

- **Objective:** Deliver a safe, authenticated async generation slice using deterministic five-part fixtures, including the minimum reliability/quota work pulled forward from 4D.
- **Specification references:** ARCH §§1/4/5; API §4; DATA §§2/5/7; BL §1; SRS FR-GEN-01–05/09, NFR-PERF-02, NFR-REL-01/02, NFR-SCALE-01; UC-1/2/4.
- **Dependencies:** Phases 1–3; G2 decisions covering new/continue context, job result identifiers, queue recovery, concurrent quota admission and terminal commit. Part fixtures must follow the approved A09 contract. Early current-user/quota read is already available.
- **Expected modules/files:** `apps/api/src/modules/lessons/generation.*`, `modules/quota/`, `modules/tracks/`; `apps/api/src/jobs/` producer/contracts; `apps/worker/src/` consumer/pipeline; proposed shared `packages/domain/generation/` finalization; `apps/web/app/(main)/new/`, Track generation control, `apps/web/lib/generation-polling.*`; job/request DTOs and fixture providers in test support.
- **Database work:** Persist GenerationJob and approved resolved input/snapshot; introduce selected handoff/recovery/deduplication storage as needed. Implement guarded atomic finalization of Track if new, content/Parts or reused reference, UserLesson, quota and DONE/result identifiers. Allocate orderInTrack safely. Any reservation is distinct from a spent credit and requires explicit lifecycle/response semantics.
- **Backend work:** `POST /lessons/generate` with ownership, onboarding/input/category/quota checks and 202; `GET /lessons/generate/:jobId` scoped to requester; common public errors. Agree submission retries and in-flight quota behavior before accepting requests. Provide the minimal track reads needed to pick a continuation and navigate to a completed result. Network/provider calls stay outside the final DB transaction.
- **Frontend work:** Topic/category form and Generate Next entry, interest-based suggestions as agreed, visible disabled controls at quota zero, non-blocking PENDING/PROCESSING states, safe failure display, 2–3-second polling that stops on DONE/FAILED and cleans up on unmount. Resolve refresh/recovery of in-flight jobs without inventing a job-list endpoint. Refresh quota/track data on completion and navigate using an owned assignment identifier.
- **Worker/background work:** Queue consumer with deterministic valid output, retry/deadline/recovery boundaries, claim/deduplication and idempotent completion. Implement the chosen DB-to-queue recovery mechanism and safe handling of worker restart/lost acknowledgement before real providers. Separate transient retries from terminal FAILED.
- **Tests:** API → DB/queue → worker → assignment → polling with fixtures; unauthorized/foreign track/job; new versus continue; quota zero; duplicate submission/delivery; last-credit concurrent jobs; concurrent continuation order; enqueue failure and crash before/after commit; failed jobs leave quota unchanged; a DONE job has one resolvable assignment and one charge.
- **Acceptance criteria:** G2 invariants pass with multiple worker instances and deterministic fixtures. An accepted job can recover or terminate under the selected failure policy instead of silently remaining orphaned. No negative quota, duplicate successful charge, or partial success is possible in tested fault cases. UI stays usable and observes terminal state/updated balance correctly.
- **Explicit non-goals:** Live LLM/embedding behavior, production release of a fixture-backed generator, final content/reuse quality, advanced queue dashboard, WebSocket/SSE, treating 4D as the first safety implementation.
- **Unresolved decisions affecting phase:** OQ-1/2/4/6; A04–A09/A15–A18/A23–A25/A27. A10–A14 need settled contracts before fixtures imply reward behavior. Any in-flight quota rejection needs an agreed status/error mapping rather than a newly invented code.

### Phase 4B — LLM Generation

- **Objective:** Implement the validated content-generation branch for an explicit cache miss, with five category-appropriate parts and pace-adjusted depth.
- **Specification references:** PRD §§5/8; ARCH §3; DATA §§3/4; BL §§3/3.1/6; SRS FR-GEN-08/11/12, NFR-COST-01, NFR-SEC-03; OQ #3/6.
- **Dependencies:** Phase 4A safe pipeline/finalization; G3 content and grading contracts; provider/model selected under OQ-6; OQ-3 composition decision. Continuation context and input/pace snapshots must be specified. Real semantic routing arrives in 4C.
- **Expected modules/files:** `apps/worker/src/generators/` provider adapter and generation service; `generators/templates/` programming/language/math/science/engineering/general; shared typed content validators and private grading schemas; provider fixture/evaluation cases; domain configuration for model selection.
- **Database work:** Add/reconcile generated content fields, contentVersion and any approved pace/context compatibility metadata. Persist validated content and exactly five ordered Parts only through the existing finalization boundary. Complete expiry timestamp calculation after A21 resolution; use the embedding interface without writing placeholder vectors into real reusable content.
- **Backend work:** Share prompt-input validation and safe public error projection with the worker. Finalize public prompt versus private solution contracts jointly with the Phase 5 grading design. Keep provider-specific representations behind the adapter.
- **Frontend work:** Continue the generation UI from 4A and expose safe validation/failure outcomes. Exercise representative content with Phase 5 renderers when available; this phase does not claim the full learning experience is complete.
- **Worker/background work:** Use the selected provider's structured-output/JSON feature, then independently validate schema, category-allowed types, order and exactly-five cardinality before commit. Supply agreed track context and server-resolved pace. Respect bounded retry/deadline behavior. Apply model routing only as approved; a higher-cost model for Math/Programming is a candidate, not a mandated provider selection.
- **Tests:** Valid/invalid output for every agreed type and all six category templates; malformed JSON/schema, wrong part count, duplicate/missing order, off-template types, impossible answer structures, refusal/timeout/rate-limit/unavailable provider; prompt-injection inputs; light/regular/intensive fixtures; continuation context; representative manual answer-quality review, especially math/code. Mocked contract tests plus a controlled live-provider evaluation after credentials/selection are available.
- **Acceptance criteria:** The cache-miss branch yields five valid renderable/gradable parts, aligned with category and pace, or fails without assignment/charge. Structural validation is not claimed to prove factual correctness; quality evidence and provider/cost conditions are recorded. All successful writes use 4A's transaction and idempotency path.
- **Explicit non-goals:** Shipping generation without the required reuse check, automatic mastery/curriculum features, arbitrary code execution, audio/TTS, an unapproved LLM grading service, selecting the similarity threshold here.
- **Unresolved decisions affecting phase:** OQ-1/3/6; A05/A07–A11/A20–A23/A25–A27. Provider-independent work can use agreed fixtures, but live-provider acceptance cannot pass without OQ-6.

### Phase 4C — Embedding & Semantic Reuse

- **Objective:** Complete the actual generation routing: embed the resolved request, search compatible non-expired content, reuse on an eligible match, otherwise call 4B; maintain expiry without removing owner access.
- **Specification references:** PRD §6; ARCH §§3/4; DATA §§3/5; BL §§2/6; SRS FR-GEN-06–10/12, FR-EXP-01–03, NFR-PERF-03, NFR-COST-01/02, NFR-REL-03; OQ #4/6/7.
- **Dependencies:** 4A safety path, 4B miss branch, approved provider/dimension/metric/index migration in 1; A08/A19–A23 context, compatibility, expiry and configuration decisions; acknowledged initial OQ-7 evaluation policy.
- **Expected modules/files:** `apps/worker/src/embedding/` adapter/request representation/search policy; shared lesson search repository/vector SQL and migrations; reuse decision service; `apps/worker/src/jobs/expire-lessons.*`; validated threshold configuration; semantic evaluation corpus and fixtures.
- **Database work:** Install the selected pgvector index with the matching metric/dimension. Query same category and all approved compatibility/time eligibility conditions. Create UserLesson with wasReused for a hit; preserve original Lesson/Part identity, generatedByUserId and expiry. Add indexes/metadata only as required by approved compatibility. Schedule idempotent expired-flag updates; no deletion/cascade due to expiry.
- **Backend work:** Maintain identical user-facing job/result/quota contracts for miss and hit, subject to OQ-4. Ensure lesson reads continue serving expired content to owners. Keep similarity/provenance analytics out of public responses unless disclosure is approved.
- **Frontend work:** Display the completed lesson through the same flow; implement any approved reuse label/copy only if OQ-4 changes. Refresh owned lists/path; owner access must remain intact when content later expires.
- **Worker/background work:** Compute the agreed embedding representation, reject incompatible dimensions/results, run indexed search, apply the configured metric/threshold, and log decision/score for evaluation without leaking credentials/private input. Reuse invokes no content LLM call. Execute daily expiry flagging and decide eligibility at the agreed timestamp boundary. Define behavior on embedding/search failure explicitly; do not silently bypass mandatory reuse search to call the LLM.
- **Tests:** Same/different category, exact topic versus semantic match, below/equal/above threshold as decided, cross-pace/context cases, same-user repeat/continuation policy, model/version incompatibility, expired-but-not-yet-flagged content, exact expiry boundary, month-end arithmetic, repeat expiry runs, ownership/progress isolation across reuse, no content LLM call on hit, both branches charge once, config change propagation. Evaluate nearest-neighbor index/query plan on representative data, and labeled semantic pairs for false reuse/missed reuse.
- **Acceptance criteria:** Every real generation follows embedding/search before the LLM branch; eligible reuse creates a separate user assignment with independent progress, one quota charge, and no content-generation call. Expired content cannot be newly reused and remains readable by owners. Indexed lookup/configurable scoring work under documented conditions; the initial threshold is recorded as evaluated/provisional, not permanently validated.
- **Explicit non-goals:** Dedicated vector database, automatic mass re-embedding, deleting stale lessons, free reuse, unapproved disclosure, final empirical threshold tuning that requires weeks of future usage.
- **Unresolved decisions affecting phase:** OQ-2/3/4/6/7; A07–A09/A15/A19–A25/A27. Selection of index/operator and runtime config propagation must precede claims of NFR-PERF-03/NFR-COST-02 compliance.

### Phase 4D — Generation Reliability & Quota

- **Objective:** Qualify and complete the integrated generation system under failures/concurrency, building on the safety already delivered in 4A.
- **Specification references:** BL §§1/2; ARCH §4; DATA §§5/7; API §4/§8; SRS FR-GEN-03–09, FR-EXP-01–03, NFR-REL-01–03, NFR-PERF-01/02, NFR-SCALE-01; UC-1/2/4.
- **Dependencies:** 4A/4B/4C with both real branches; approved operational failure policy and workload measurement conditions. No release before this gate passes.
- **Expected modules/files:** Existing generation/quota/domain transaction code; worker retry/reconciliation/scheduler modules; generation integration and failure-injection suites; `apps/web/lib/generation-polling.*` recovery states; operational notes/runbooks and structured generation logs.
- **Database work:** Review transaction scope and constraints under actual worker concurrency; finalize any selected recovery metadata/indexes. Verify result/assignment linkage, nonnegative quota, one terminal outcome, track ordering and non-destructive expiry. No separate later billing transaction is permitted by the atomicity requirement.
- **Backend work:** Test admission/quota behavior while other jobs are pending; normalize safe error codes/messages, public terminal states and transient retry visibility; reconcile the durable job/queue result. Ensure exhausted/incomplete users cannot circumvent guards via direct requests or repeated onboarding.
- **Frontend work:** Complete failure/retry, refresh/navigation recovery and quota refresh according to the chosen request-retry semantics. Stop polling terminal jobs; handle auth loss/network errors without claiming the generation itself failed. Both New and Generate Next show the specified disabled exhausted state.
- **Worker/background work:** Exercise provider/Redis/Postgres interruptions, stalled jobs, process death and redelivery, including crash after commit before acknowledgement. Confirm retries cannot duplicate an assignment/charge or reset terminal results. Validate recovery with multiple worker instances and repeat expiry execution.
- **Tests:** Fault matrix across before enqueue, after enqueue, during embedding, during LLM, before transaction, during rollback, after commit, and before acknowledgement; concurrent last-credit new/reuse/continue jobs; duplicated requests and queue delivery; three successful generations across multiple tracks then rejection; failed jobs and repeated onboarding do not alter lifetime allowance. Measure total generation/polling behavior under approved normal-provider and workload conditions.
- **Acceptance criteria:** Each logical success produces exactly its agreed assignment and one deduction; terminal failure consumes none; no overspend/partial state/duplicate side effects in fault tests. Recovery reaches the agreed durable state, and owners can navigate the result. Confirm NFR-SCALE-01 without changing architecture and publish performance evidence with its limits.
- **Explicit non-goals:** First implementation of transactions/idempotency, paywalls/quota refresh, distributed services, unsupported unconditional latency/uptime claims, concealing unresolved operational policies as a test pass.
- **Unresolved decisions affecting phase:** OQ-4/6/7; A04/A07/A15–A18/A21/A23–A25/A27. In-flight admission/retry/error rules must be settled before acceptance, even if their low-level mechanism is an implementation choice.

### Phase 5 — Learning Experience

- **Objective:** Deliver Track/Lesson browsing, all agreed exercise types, resumable progress and immediate answer feedback through a vertical slice that includes the Phase 6 reward core.
- **Specification references:** PRD §§4/5/7.1; SRS FR-TRK-01–06, FR-GAM-01–04, UC-2/3, NFR-USE-01/02; BL §§3/4/5; DATA §§2–6/8; API §§3/5.
- **Dependencies:** Auth/onboarding; approved OQ-2/3 and A08–A14/A24 content, progression, grading and reward contracts (G4). Read/rendering work can use approved fixtures after 3; final generation integration requires 4D. Reward effects from 6 are part of acceptance, not a placeholder.
- **Expected modules/files:** `apps/web/app/(main)/track/`, `lesson/` list/detail and exercise routes; track-path, track-selector (if approved), part renderer/answer/feedback components; `apps/api/src/modules/tracks/`, `modules/lessons/` reads/answers; shared type-specific graders and progress/reward services; Phase 6 aggregate persistence.
- **Database work:** Approved UserLesson status/timestamps and UserPartProgress update rules; preserve ever-completed evidence separately from latest correctness. Atomically apply accepted answer, progress, completion and eligible reward/aggregate changes to prevent split outcomes. Deduplication/idempotency storage follows the decided submission-versus-replay semantics.
- **Backend work:** Complete `GET /tracks`, `GET /tracks/:trackId`, `GET /lessons`, `GET /lessons/:userLessonId`, and `POST /lessons/:userLessonId/parts/:partId/answer`. Enforce owner and part-membership checks, per-type grading, public prompt filtering, exact five-part projection, completed/replay rules, and agreed xpEarned accounting. Return the specified feedback immediately under the chosen grader.
- **Frontend work:** Track as home; ordered nodes/progress; confirmed track selection behavior; grouped lesson library; all allowed exercise renderers and answer controls; explanations, retry/redo/resume, empty/loading/error states and Generate Next placement. Render narrow paths without overflow; handle code/math safely without assuming executable-code or rich-content product features.
- **Worker/background work:** No answer-worker architecture is specified. If proposed model grading changes the immediate answer contract, resolve A09 before adopting it. Existing generation/expiry runs independently of the learning flow.
- **Tests:** Every agreed part-type request/response/renderer; correct/incorrect/retry paths; latest wrong after earlier correct; status/timestamp transitions; five-of-five completion; approved replay rewards; duplicate/concurrent answer submission including two final parts; foreign user/part attacks; private-solution exclusion; expired-owned access; reload/resume; mobile/tablet/desktop path and input use.
- **Acceptance criteria:** An owner can find, open, answer, finish and redo a five-part lesson per resolved rules. Completion follows FR-TRK-05 or an explicitly revised specification, never an implicit interpretation of retry XP. Correctness, earned XP, completion, streak and weekly totals stay consistent across answer races. No fake reward response is used to declare the phase complete.
- **Explicit non-goals:** New exercise types outside the agreed bank, code execution/sandboxing, adaptive mastery curriculum, audio, offline sync, locking nodes/gating Generate Next without a confirmed rule, granting progress from client-supplied correctness.
- **Unresolved decisions affecting phase:** OQ-1/2/3/4/5; A08–A14/A15/A18/A24–A26/A29. A09–A14 must be resolved before answer writes, even though league presentation is labeled Phase 6.

### Phase 6 — Gamification

- **Objective:** Complete XP/streak/weekly league behavior; provide the reward core with Phase 5, then finish ranking presentation and week-boundary operations.
- **Specification references:** PRD §7; BL §§4/5; DATA §§1/6/8; SRS FR-GAM-01–05, UC-3, NFR-MAINT-01, NFR-SCALE-02; API §6; OQ #5.
- **Dependencies:** G4 reward/time decisions and confirmed OQ-5; Phase 5 answer contract and transactional integration. User and weekly schemas/constraints must support the agreed eligibility and concurrency rules.
- **Expected modules/files:** Proposed `packages/domain/rewards/` XP/streak/week calculations; `apps/api/src/modules/league/` query/ranking handlers; shared reward transaction operations; `apps/web/app/(main)/league/` and XP/streak feedback; optional selected weekly scheduler under `apps/worker/src/jobs/`; central XP configuration.
- **Database work:** Update User.totalXp/currentStreak/longestStreak/lastActivityDate, UserPartProgress.xpEarned and WeeklyLeagueEntry in the learning transaction. Prevent duplicate daily/lesson rewards using the approved mechanism. Ensure one user-period row; on-read rank need not persist. Do not destructively reset lifetime totals during a new week.
- **Backend work:** Calculate configured part/lesson/daily rewards under explicit retry/replay rules; apply all XP sources to weekly totals; calculate week periods in the selected timezone and expose `GET /league/weekly` including own rank/XP and agreed ties/empty cases. Candidate values remain 10/5/+20/+5 until confirmed; they are not unconditional acceptance totals.
- **Frontend work:** Finish earned-XP/lesson-bonus/streak feedback as defined by the API contract; global weekly leaderboard if confirmed, own rank even when outside the returned leaderboard window, and agreed no-activity/empty states. No sub-second updates required.
- **Worker/background work:** Implement the selected weekly strategy: lazy creation and period-based reads may avoid mass row creation; a weekly job is needed only for selected scheduled behavior. Optional history/badge finalization is not made mandatory. No grouping jobs under the current MVP assumption.
- **Tests:** Approved correct/retry/replay XP table, once-per-event bonuses under duplicate/concurrent answers, total/weekly consistency, first activity/same day/consecutive day/gap/null dates, displayed inactive streak rule, midnight and Monday timezone boundaries (DST if the chosen zone observes it), tie ranking and inactive-user semantics, rollover without zeroing lifetime XP, concurrent first entry creation.
- **Acceptance criteria:** UC-3 updates progress/reward/streak/weekly data consistently, using configurable values and approved eligibility. League shows the current period and correct own rank under documented ties/membership rules; no double daily/lesson rewards on retry. Phase 5's reward core and this phase's league finish are both complete before acceptance.
- **Explicit non-goals:** Promotion/demotion/group leagues unless OQ-5 explicitly changes MVP scope, streak freezes/repair, badges/history beyond a selected requirement, real-time sockets, XP for generation itself.
- **Unresolved decisions affecting phase:** OQ-3/5; A09–A14/A18/A23. No timezone is selected merely because the developer environment has one.

### Phase 7 — Profile

- **Objective:** Deliver the full profile and preference-editing experience using the early current-user contract and validated generation/reward data.
- **Specification references:** PRD §4; SRS FR-PROF-01–03; DATA §1; API §7; BL §§1/3.1/4.
- **Dependencies:** Auth/current-user read from 2, onboarding from 3, generation/quota from 4D, stats from 5/6. Preference changes must obey the already approved job snapshot/reuse compatibility rules.
- **Expected modules/files:** `apps/web/app/(main)/profile/`, preference form/stat components; `apps/api/src/modules/users/` profile read/update handlers; shared profile DTOs/validators; query invalidation for current user and New suggestions.
- **Database work:** Update only the approved preference fields. Preserve quota, onboarding grant marker, credential fields and reward aggregates. No schema expansion for unrelated user settings.
- **Backend work:** Complete `GET /users/me` projection (already introduced earlier), implement `PATCH /users/me` for pace/interests/Other representation, validate allowed fields and partial-update behavior. Reject or ignore disallowed fields only according to the agreed validation contract; never mutate email/password/quota/XP through this endpoint.
- **Frontend work:** Display name, email, pace, interests, remaining generations, total XP, current and longest streak; allow preference editing with clear save/error states. Refresh generation suggestions and use new preferences on future jobs according to the resolved snapshot rule. Show exhaustion without payment prompts.
- **Worker/background work:** No new job. Workers must retain the agreed preference context for already submitted jobs and use updated preferences for eligible later requests.
- **Tests:** Profile projection and editing, validation/Other values, mass-assignment attempts against quota/XP/email/password/onboarding fields, stale UI refresh after generation/answer, mid-job preference changes, subsequent pace-personalized generation/reuse compatibility, unchanged earlier owned content, responsive layout.
- **Acceptance criteria:** FR-PROF-01–03 are satisfied; displayed quota/stats match persisted outcomes; approved preference updates affect future generation as specified without regranting quota or altering credentials. Previously owned content remains accessible.
- **Explicit non-goals:** Email/password change workflows, arbitrary name/avatar/settings editing not specified in API, account deletion/export, timezone settings without a product decision, payments or quota replenishment.
- **Unresolved decisions affecting phase:** OQ-1; A04–A07/A13/A20/A25/A26. A06 may require a reconciled onboarding-state field in the early read contract; do not add it silently only in this phase.

### Phase 8 — Final Integration & Hardening

- **Objective:** Verify the assembled MVP against reconciled specifications and collect release evidence for security, reliability, performance, cost, and responsive use.
- **Specification references:** All eight source documents; all SRS FR/NFR IDs and UC-1–4; API §§1–8; README confirmation requirement.
- **Dependencies:** Phases 0–7 accepted, including early 4D safety and joint 5/6 reward work; G5. No release blocker can be relabeled "hardening" and left unresolved.
- **Expected modules/files:** End-to-end/API contract/database/worker test suites, performance/evaluation scripts and evidence, operational runbooks/configuration/deployment descriptors for the selected environments, final traceability/decision updates. These are future deliverables; this planning task creates none of their implementation.
- **Database work:** Verify clean migration/install and upgrade behavior on the selected host, pgvector/index availability, transaction/constraint enforcement, expiry accessibility and week rollover. Rehearse backup/restore only against agreed operational expectations; do not claim unspecified recovery objectives. Validate no production-facing seeded fixtures violate quota/content rules.
- **Backend work:** Audit every endpoint's authentication, authorization, input/error/projection contract and concurrency boundaries. Verify safe configuration/secrets/logging, chosen cross-origin/session behavior and any agreed rate limits. Validate query plans at representative data volumes and preserve modular-monolith ownership of rules.
- **Frontend work:** Exercise all five destinations, first-time/returning/interrupted journeys, loading/empty/error/exhaustion states, answer recovery, polling cleanup, navigation and responsive paths at ~360/~768/~1280+ px in the specified evergreen browsers. Verify the confirmed PWA deliverable and language scope without adding offline features.
- **Worker/background work:** Re-run targeted integrated fault cases for Redis/database/provider failure and multi-worker redelivery; verify daily expiry and selected weekly behavior, scheduler idempotency, safe worker shutdown/restart, configuration propagation and useful decision/error logs.
- **Tests:** UC-1 new and reused lesson, UC-2 continuation under its confirmed prerequisites, UC-3 full learning/rewards/league, UC-4 exhaustion. Cover two-user content reuse with isolated progress; expired owned lessons; fourth successful-generation rejection; failed jobs and repeated onboarding; race/fault matrix; every part type; token/ownership/prompt/renderer attacks; chosen workload latency, cost accounting and semantic-quality evidence. Reuse prior passing slice tests rather than inventing redundant checks.
- **Acceptance criteria:** Every traceability entry below has passing evidence or a specifically approved specification change; original and newly found release-blocking decisions are resolved. No failed-job charge, overspend, leaked private solution/foreign resource, duplicate reward or inaccessible expired owned content remains. Performance claims state provider/workload conditions; threshold tuning remains an explicit ongoing evaluation. Record any unfulfilled requirement as a blocker, not "done."
- **Explicit non-goals:** Starting v2 features, payments, native apps, audio, multilingual UI, offline sync, group leagues/streak repair under current scope, microservice migration, deployment/publishing as part of this analysis task.
- **Unresolved decisions affecting phase:** Any remaining OQ/A findings, especially A23/A25–A27 and the empirical portion of OQ-7. The latter permits a documented initial policy and future evaluation; it does not excuse missing initial reuse validation.

## 7. Requirement Traceability

Phase numbers refer to Section 6 with the sequencing changes in Section 5. "5/6 core" means reward effects delivered with the answer slice, not postponed until a later UI phase. All entries receive final integration verification in Phase 8. Test descriptions are planned evidence, not claims that tests have run. The source IDs are preserved verbatim; audit IDs are not replacements for them.

### 7.1 Functional requirements — all 42 SRS IDs

| Requirement | Delivery phase(s) | Acceptance evidence / decision dependency |
|---|---|---|
| FR-OB-01 | 3 | Welcome is first with CTA; first-time journey test |
| FR-OB-02 | 1/3, shared validation 7 | Multi-select plus Other text survives save/read; A05 encoding |
| FR-OB-03 | 3 | Empty interests rejected under confirmed OQ-1 |
| FR-OB-04 | 3 | One CASUAL/REGULAR/INTENSIVE selection persisted |
| FR-OB-05 | 3 | Missing pace blocks progression under confirmed OQ-1 |
| FR-OB-06 | 2/3 | First-time auth step follows interests/pace; A06 returning-user exception resolved |
| FR-OB-07 | 2/3 | Draft survives auth and attaches to correct account; interrupted-save recovery |
| FR-OB-08 | 3 | Ordered/non-skippable flow if OQ-1 confirmed; provisional until then |
| FR-OB-09 | 1/3, race verification 4D | Exactly one grant of 3 and completion timestamp; A03/A04 |
| FR-AUTH-01 | 1/2 | Email/password/name registration and correct partial-account state |
| FR-AUTH-02 | 2 | Credentials login returns token per reconciled A02 contract |
| FR-AUTH-03 | 2 and every protected slice | Missing/invalid token rejected with UNAUTHORIZED |
| FR-AUTH-04 | 1/2 | Password is hashed; no plaintext persistence/logging |
| FR-GEN-01 | 4A–4D | Authenticated topic/category → new track and owned five-part lesson |
| FR-GEN-02 | 4A–4D/5 | Generate Next appends safely to owned track; A07/A08/OQ-2 |
| FR-GEN-03 | 3/4A/4D | Zero balance returns 403 QUOTA_EXCEEDED and disables visible controls |
| FR-GEN-04 | 4A, verification 4D | Durable asynchronous submission returns 202/job ID; non-blocking UI |
| FR-GEN-05 | 4A/4D | Owner-scoped polling sees terminal DONE/FAILED; A15/A16 |
| FR-GEN-06 | 1/4C | Real embedding plus indexed same-category, non-expired search precedes content LLM |
| FR-GEN-07 | 4C/4D | Eligible hit assigns shared content with internal wasReused; no content LLM call |
| FR-GEN-08 | 4B/4C/4D | Miss stores five Parts, embedding, approved three-month expiry and assignment |
| FR-GEN-09 | 1/4A onward, proof 4D | One transactional deduction per DONE assignment, none on FAILED; A17 sequencing reconciled |
| FR-GEN-10 | 4A/4C/5 | Public response/UI disclosure matches OQ-4; provisional hidden behavior |
| FR-GEN-11 | 4B, renderer integration 5 | All six category banks and General fallback; OQ-3 composition |
| FR-GEN-12 | 3/4B/4C/7 | Five parts at all paces; content depth and reuse compatibility follow stored/snapshotted preference |
| FR-EXP-01 | 4C/4D | At least daily idempotent expiry flagging |
| FR-EXP-02 | 1/4C/5 | Expiry does not delete Lesson or remove owner access |
| FR-EXP-03 | 4C/5 | Expired candidates excluded even with stale flag; existing owners can read/redo |
| FR-TRK-01 | Minimal 4A, complete 5 | Only own tracks listed; OQ-2 active-track design |
| FR-TRK-02 | Minimal 4A, complete 5 | Owned ordered lessons/status and safe concurrent append |
| FR-TRK-03 | 4B contract/5 | Owner receives exactly five public prompts with independent progress |
| FR-TRK-04 | 5/6 core | Every agreed answer type gets correctness and actual XP; A09–A11 |
| FR-TRK-05 | 1/5/6 core | All five ever-correct parts complete lesson per reconciled A10/A12 |
| FR-TRK-06 | 5/6 core | Replay works with explicitly agreed progress/reward semantics |
| FR-GAM-01 | 5/6 core | Configured part XP follows approved correctness/retry/replay policy |
| FR-GAM-02 | 5/6 core | Approved full-lesson bonus eligible exactly as decided, safe on duplicate final answers |
| FR-GAM-03 | 5/6 core, display 7 | First/same/consecutive/gap day and longest-streak cases; A13 timezone/inactivity |
| FR-GAM-04 | 1/5/6 | Every earned XP source updates correct weekly period; rollover and concurrency |
| FR-GAM-05 | 6 | On-read leaderboard includes correct own rank; OQ-5/A14 |
| FR-PROF-01 | Early read 2/3; full UI 7 | Required identity/preference/quota/XP/streak fields reflect persisted state |
| FR-PROF-02 | 7, effect verification 4B/4C integration | Pace/interests save and affect agreed future requests without modifying in-flight context unexpectedly |
| FR-PROF-03 | 2/7 | Profile update cannot change email/password |

### 7.2 Non-functional requirements — all 17 SRS IDs

| Requirement | Delivery phase(s) | Verification and limits |
|---|---|---|
| NFR-PERF-01 | 4A–4D/8 | Measure end-to-end generation under documented normal provider/load conditions; no UI freeze; A27 resolves 10–30-second wording |
| NFR-PERF-02 | 4A/4D | Poll interval 2–3 seconds, stop on DONE/FAILED; cleanup tests |
| NFR-PERF-03 | 1/4C/8 | Selected HNSW/IVFFlat index and metric, representative query-plan/performance evidence; do not infer index use from tiny fixtures alone |
| NFR-USE-01 | 0 primitives; 2–7 screens; 8 | All screens usable at ~360/~768/~1280+ px, specified browser matrix |
| NFR-USE-02 | 5/8 | Narrow Track path scrolls/readable, no overflow |
| NFR-REL-01 | 4A–4D | FAILED jobs and provider faults consume no quota |
| NFR-REL-02 | 1/4A–4D | Transaction rollback and crash/race tests across content/assignment/quota/finalization |
| NFR-REL-03 | 4C/4D/8 | Repeat and concurrent expiry execution has no duplicate/destructive effects |
| NFR-COST-01 | Provider decision 0; 4B/4C/8 | Approved inexpensive default models; explicit Math/Programming precision routing if chosen; record measured cost/quality, not assumed prices |
| NFR-COST-02 | 0/4C/8 | Threshold changes through agreed external configuration without code deployment; verify worker propagation (A23) |
| NFR-SEC-01 | 2/8 | Approved password hash implementation, no plaintext storage/logging |
| NFR-SEC-02 | 2 and each API slice, audit 8 | Validated token on all 11 non-auth endpoints |
| NFR-SEC-03 | 4A/4B/4C/8 | Validated topic boundary, prompt-injection cases and shared-content isolation; sanitization alone is not assumed to prove safety |
| NFR-MAINT-01 | 0 then 3/4A–4C/6 | Quota size, XP, threshold, expiry centralized/configurable; recommended numbers not copied inline |
| NFR-MAINT-02 | 0 and all slices | One backend domain codebase, separate web/API/worker processes, no per-domain services |
| NFR-SCALE-01 | 0/1/4A/4D/8 | Multiple queue consumers work safely without architecture change; duplicate-delivery and concurrent-write tests |
| NFR-SCALE-02 | 6/8 | Correct on-read weekly rank; no sub-second/real-time requirement added |

### 7.3 API endpoint traceability — all 13 specified endpoints

| API endpoint | Primary phase / dependent completion | Contract and integration checks |
|---|---|---|
| `POST /auth/register` | 2; onboarding 3 | 201 userId/token, credential validation, A02/A03 partial account |
| `POST /auth/login` | 2; navigation 3 | 200 userId/token, invalid credentials/session behavior |
| `PATCH /users/me/onboarding` | 3; replay attacks 4D | 200 completion/quota, preference schema, one-time grant and retry response |
| `GET /tracks` | Minimal 4A; full 5 | Owned tracks and counts, confirmed selector policy, corrected illustrative fixtures |
| `GET /tracks/:trackId` | Minimal 4A; full 5 | Owner check, ordered assignment IDs/titles/status, no shared-ID navigation confusion |
| `POST /lessons/generate` | 4A; provider/reuse 4B/4C; proof 4D | 202 PENDING/jobId; new/next conditional inputs; 403 QUOTA_EXCEEDED; concurrency/input/ownership errors defined |
| `GET /lessons/generate/:jobId` | 4A/4D | Owner check, all four states, approved terminal result/assignment mapping/nullability and safe errors |
| `GET /lessons` | 5 | Owned assignments grouped by track, statuses/order, reused and expired-owned content included |
| `GET /lessons/:userLessonId` | 5 | Five public Parts, owner/assignment scope, progress/replay projection, private solutions excluded |
| `POST /lessons/:userLessonId/parts/:partId/answer` | 5 with 6 reward core | Per-type answer validation, ownership and part membership, isCorrect/xpEarned/explanation/lessonCompleted with atomic effects |
| `GET /league/weekly` | 6 | Current weekStartDate, myRank/myXp and leaderboard under approved timezone/tie/membership rules |
| `GET /users/me` | Early 2/3; generation 4A; full 7 | Identity/preferences/quota/stats; reconcile onboarding state for recovery, never expose credential internals |
| `PATCH /users/me` | 7 | Only approved preferences; 200 updated projection; email/password/aggregate fields protected |

API §8's `{error, message}` convention applies from Phase 0 contracts and Phase 2 handlers through every endpoint. `UNAUTHORIZED`, `QUOTA_EXCEEDED`, `VALIDATION_ERROR`, `NOT_FOUND`, and `GENERATION_FAILED` are the named codes; exact missing HTTP mappings and transient-job/error semantics are A16/A17/A25 decisions. No additional endpoints are silently introduced by this plan. All non-auth endpoints require bearer authentication and applicable resource ownership checks.

### 7.4 Business rules and prose requirements

These BR labels are local traceability aliases for the cited prose, not newly invented requirements.

| Alias / rule | Specification reference | Implementation phase(s) and decision dependency |
|---|---|---|
| BR-01: three lifetime account generations activated after onboarding; no automatic reset/payment | PRD §6; BL §1; FR-OB-09 | 1/3/4A/4D/7; A04 reconciles schema/signup wording |
| BR-02: new, next and reuse each cost one; failed jobs cost zero | PRD §§5/6; BL §§1/2.3 | 4A–4D; A17 concurrent admission and atomic terminal commit |
| BR-03: exhausted New/Generate Next controls visible, disabled, explained | BL §1; UC-4 | 4A/4D/5/7; current-user read pulled forward |
| BR-04: one successful generation gives one lesson with exactly five parts | PRD §5; FR-GEN-08; DATA §§3–5 | 1/4A/4B/4C/5; type/cardinality validation |
| BR-05: five specialized category banks plus General fallback | PRD §5; BL §3 | 3 category mapping, 4B schemas/templates, 5 renderers; A05/A09/OQ-3 |
| BR-06: mixed/free composition is provisional | PRD §5; BL §3; OQ #3 | Contract before 1/4B/5; confirm both mixing and ratio/order |
| BR-07: pace changes depth/complexity, never part count | BL §3.1; FR-GEN-12 | 3/4B/4C/7; A07/A20 snapshot and reuse compatibility |
| BR-08: embed, search same category, choose eligible top candidate by configured threshold before LLM | BL §§2.1/2.2; FR-GEN-06/07 | 1/4C; A19/A20/A22 and OQ-6/7 |
| BR-09: reuse shared Lesson, independent UserLesson/progress; still charged | DATA §§3/5/6; BL §2 | 1/4C/5; same-user duplicate/continuation policy A08 |
| BR-10: reuse disclosure currently assumed hidden | PRD §6; OQ #4; FR-GEN-10 | 4A/4C/5; do not finalize before confirmation |
| BR-11: expiry based on original creation plus three months; daily flag; no deletion or owner-access loss | BL §2.4; FR-EXP-01–03 | 1/4B/4C/4D/5; A21 exact time rule |
| BR-12: recommended part XP 10/correct or 5/retry case | BL §4 | 5/6 core; amounts and eligibility provisional, A10/A11 |
| BR-13: recommended full-lesson +20 and daily streak +5 bonus | PRD §7.1; BL §4 | 5/6 core; "at once," replay and daily eligibility A11/A13 |
| BR-14: daily completed-part activity advances/preserves/resets streak and longest count | PRD §7.2; BL §4 | 5/6/7; A10/A13 completion/time/first-day/inactivity |
| BR-15: weekly XP includes all earned XP, Monday periods, on-read ranking | BL §5; FR-GAM-04/05 | 1/5/6; A14 timezone/ties/lazy or scheduled creation |
| BR-16: global league is provisional; grouping/promotion and freezes excluded under current MVP | PRD §§7/9; OQ #5 | 1/6/8; revise scope explicitly if OQ-5 changes |
| BR-17: low-cost default models, structured output, reuse decision score logging and later tuning | ARCH §3; BL §§2.2/6; README | 0/4B/4C/8; OQ-6/7, no claimed current price/model winner |
| BR-18: responsive five-item navigation; Track is home; lessons grouped/replayable | PRD §4; FR-TRK-01–06 | 0 shell; 3 empty state; 4A New; 5 Track/Lesson; 6 League; 7 Profile; 8 integration |
| BR-19: interests personalize New suggestions but do not restrict available topics | DATA §1 notes; PRD §§3/4 | 3/4A/7; A05 suggestion/category/Other contract |
| BR-20: configurable quota/XP/threshold/expiry values | README Important Notes; NFR-MAINT-01/NFR-COST-02 | 0/3/4A–4C/6/8; A23 propagation semantics |
| BR-21: installability/readiness and single-language scope | PRD §§1/9; SRS §2.3; ARCH §2 | 0 decision, 3–7 presentation, 8 verification; A26; no offline features inferred |
| BR-22: ownership through assignments; internal grading data stays separate from learner prompts | DATA §§3–6; API §§3–5; FR-TRK-01–04 | 1/2/4A/4B/5/8; A24 reconciles DTO/authorization detail |

### 7.5 Use-case acceptance paths

| SRS use case | Vertical acceptance path |
|---|---|
| UC-1 — first lesson | 2/3 guest-to-account and grant → 4A–4D generation (both new and reused content) → 5 owned lesson route; resulting quota 2, one track/assignment, five parts |
| UC-2 — next lesson | 5 owned track and confirmed completion prerequisite → 4A–4D continuation → 5 correctly ordered new assignment, one charge; zero quota disables action |
| UC-3 — learning and league | 5/6 joint answer/progress/reward core → five correct-at-least-once parts per reconciled rule → bonus/streak/weekly effects → 6 updated leaderboard |
| UC-4 — exhaustion | Three successful assignments across any tracks → 4A/4D both controls disabled and API 403 → clear message with no payment prompt; failed jobs never use a credit |

## 8. Audit summary and implementation handoff

The review identified **29 audit findings**, including contradictions, incomplete contracts, ambiguous behavior and unresolved technical decisions. The highest-risk blockers are:

- **Account lifecycle:** registration does not supply the required preference fields; quota defaults conflict with onboarding activation; repeated onboarding could replenish lifetime credits unless explicitly guarded (A03/A04).
- **Generation correctness and delivery:** next-lesson context is unspecified, result content IDs differ from learner assignment IDs, and queue handoff/concurrent quota/finalization rules are incomplete (A07/A08/A15–A18).
- **Content and reuse:** per-type grading contracts, pace/context compatibility, metric/threshold units, and expiry freshness need definition before real content is accepted (A09/A19–A22).
- **Learning and rewards:** retry completion, bonus timing, replay XP, durable completion state, daily bonus and calendar rules cannot be implemented consistently from the current prose alone (A10–A14).
- **Decisions and scope:** all seven original questions remain unconfirmed; auth/stack choices, configuration propagation, installability and measurable operating conditions remain open (A01/A02/A23/A26–A28).

The phase order is conditionally viable after the Section 5 changes: decision gate first, incremental schema, reliability safeguards in 4A, early current-user reads, and a joint Phase 5/6 answer/reward slice. Both generation branches must pass 4D before the generation feature is accepted. Phase 8 verifies integrated requirements rather than introducing their safety foundations.

Before an implementation handoff, the decision record must show the answer/disposition, affected specification changes, and acceptance impact for each blocker. Questions that change product behavior belong to Wil; technical choices need a documented owner and compatibility evidence. Do not turn an unconfirmed example or a test fixture into a product decision. Final real-world threshold tuning may remain future work under an acknowledged initial evaluation policy.

The original planning deliverable covers all 42 FRs, all 17 NFRs, all 13 API endpoints, the four SRS use cases, and the prose business rules above. It records modules, database/API/frontend/worker work, tests, acceptance, exclusions and unresolved decisions for all 12 phases. Subsequent authorized Phase 0 foundation and Phase 1 persistence deliveries are recorded in Section 6; Phase 2 and product features have not started.
