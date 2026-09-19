# Edisco Handoff

## Current Phase

Phase 4A — Generation Infrastructure

## Phase Status

COMPLETE

Complete for the user's infrastructure-only scope. This is an opt-in placeholder pipeline, not real lesson generation or completion of the original broader Phase 4A product/reliability gate.

## Last Agent

Codex — Ponytail full; existing implementation preserved.

## Last Verified Commit

`07871c2fe9578210aa97ac80834a1ed173f40f5b` — `Feat: add feature auth and onboarding`.

This is the inspected baseline, not a commit containing Phase 4A. Current Phase 4A changes are uncommitted. Inspect source, Git history, tracked diffs, and untracked files before continuing.

## Completed Work

- Existing Phases 0–3: npm workspace, Next.js web, Fastify API, PostgreSQL/pgvector with Drizzle, Redis/BullMQ, JWT/bcrypt authentication, onboarding API/UI, and placeholder Track page.
- Added authenticated `POST /lessons/generate`: validates input, completed onboarding, positive quota, and owned continuation track; persists PENDING, submits the same UUID to BullMQ, and returns 202. No quota is deducted.
- Added owner-only `GET /lessons/generate/:jobId` with explicit response fields and safe errors.
- Worker consumes `edisco-generation`, loads inputs from SQL, records PROCESSING then DONE/FAILED, and does not reopen terminal rows on redelivery. Queue submission failure and processor failure persist sanitized failure messages.
- Placeholder returns `{ placeholder: true, jobId }` to BullMQ. It creates no Track/Lesson/Part/UserLesson, vector, expiry data, or generation UI.
- Added isolated end-to-end tests using PostgreSQL, a unique Redis prefix, and a separate worker process. Fixed pre-existing test cleanup order, foundation JWT setup, and stale migration/nullability expectations.
- Updated canonical root plan, added `docs/IMPLEMENTATION_PLAN.md` as a pointer with Phase 4A status, and documented startup/limits in README. No new migration was needed; existing migrations were applied to development PostgreSQL.

## Remaining Work

- No remaining task in the authorized placeholder infrastructure scope.
- Before real generation: settle content/part contracts, provider/model, continuation context, durable DB-to-queue recovery, request idempotency, retry/deadline policy, and atomic result/assignment/quota finalization.
- Phase 4C still owns embedding model/dimension/index selection. Later phases own generation UI, real content, semantic reuse, expiry, quota charging, learning, and gamification.
- Do not start Phase 4B without explicit instruction.

## Important Implementation Decisions

- Keep the modular Fastify API and separate non-HTTP worker. Reuse the existing schema/client/authentication; no provider interface, new service, outbox schema, or repository abstraction was added.
- `GENERATION_PLACEHOLDER_ENABLED=true` explicitly enables the smoke path in API and worker; the environment example defaults to false. Set a private `JWT_SECRET` for normal API startup. Tests provide their own secret and flag.
- Queue payload contains only the durable job ID. Queue job ID equals GenerationJob UUID. API and worker use `GENERATION_QUEUE_PREFIX` (default `bull`); tests use a unique prefix.
- DONE currently has `resultLessonId: null`. A new-track job retains null track ID; continuation retains its existing track ID. This scoped exception to the eventual real-content API contract must be replaced when content finalization exists.
- Continuation category must match its owned track; an omitted topic uses the track title only for the placeholder, not a curriculum decision.
- Producer commands fail promptly; worker connections reconnect. Processing has one attempt; BullMQ supplies its default stalled-job handling. Terminal jobs remain in Redis.
- Prior Phase 2 migration 0002 made pace/interests nullable before onboarding. Registration inherits the database quota default of 3; first onboarding writes 3 again. Generation now requires completed onboarding regardless of the stored balance. These existing choices were preserved, not redesigned here.
- Root `IMPLEMENTATION_PLAN.md` remains canonical. The docs-path file links to it; it is not a second independent plan.

## Files Changed

- New: `apps/api/src/modules/lessons/generation.routes.ts`, `apps/worker/src/generation.ts`, `tests/generation.test.mjs`, `docs/IMPLEMENTATION_PLAN.md`.
- Updated: API registration and package manifest; worker entry point and manifest; shared status DTO; root package scripts/lockfile; `.env.example`; README; root implementation plan; this handoff.
- Existing tests adjusted: `tests/{auth,onboarding,foundation,database}.test.mjs`. Auth/onboarding production behavior, frontend source, schema, and migrations were not changed.
- Local secrets remain ignored. No commit was created.

## Validation Status

Executed on 2026-09-19:

- Dependency installation passed.
- `npm run test:generation`: 7 passed, including the parent suite.
- `npm test`: 20 passed, including auth, onboarding, foundation, and generation.
- `npm run test:database`: 8 passed.
- API, worker, and database builds passed via test scripts; `npm run typecheck` passed across all workspaces.
- `npm run lint`: exit 0 with five pre-existing warnings in unchanged auth/frontend files. New code has no reported lint warnings.
- Formatting check of changed code/config passed; `git diff --check` passed. No claim of a clean repository-wide formatting check.
- `npm run db:migrate` passed using existing migrations; no Phase 4A DDL was introduced.
- Integration coverage includes observable PENDING/PROCESSING/DONE/FAILED, queue delivery, owner isolation, validation/eligibility, continuation, duplicate delivery, queue outage, sanitized failure, and no content/quota side effects.
- Ponytail review: no unnecessary abstractions found.
- Verification worker processes and test data/queue namespaces were cleaned up. Compose verification containers were stopped afterward with persistent volumes preserved.

## Known Issues

- This is not a production generator. No durable DB/Redis reconciliation exists: crash between insert and enqueue, Redis data loss, or database outage during terminal status writes can strand jobs. Request idempotency, queue retention, and provider retry/deadline behavior remain unresolved. Producer failure may require restarting the API after Redis recovers.
- Existing onboarding grant uses a read-then-update flow. Tests cover sequential repeats, not safe concurrent grant activation; address before real quota charging.
- Original product questions and other audit conflicts remain open. Current JWT/auth and nullable registration choices need specification reconciliation; this turn did not approve broader product decisions.
- Five pre-existing lint warnings remain. Other unchanged source files may have formatting drift.
- Docker runs through Ubuntu WSL. Keep Compose attached on this machine; detached containers may stop when WSL becomes idle.
- An unrelated Windows PostgreSQL occupies 5432. Existing local configuration uses Compose PostgreSQL on 55432; keep `POSTGRES_PORT` and `DATABASE_URL` aligned.
- Redis reports disabled WSL `vm.overcommit_memory`; local tests passed, but production host configuration remains outstanding.

## Next Action

Begin Phase 4B only when explicitly instructed.
