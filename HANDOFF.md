# Edisco Handoff

## Current Phase

Phase 1 — Database

## Phase Status

`COMPLETE`

Phase 0 and the user's Phase 1 persistence-only scope are complete. The user selected Drizzle and deferred dimension-specific vector migration to Phase 4C. The model is not frozen against unresolved product decisions. Phase 2 is not authorized.

## Last Agent

Codex

## Last Verified Commit

`4a1a290d942d8458fd9ac7166b657f043684d3fe` (`INIT`)

This commit predates Phase 0. Both phases and this handoff are currently uncommitted, untracked working-tree files; no commit contains the verified implementation. Inspect `git status`, the files themselves, and Git history before continuing (`git diff` alone omits untracked files).

## Completed Work

- Created an npm workspace containing a Next.js web app, Fastify API, separate Node.js worker, and shared TypeScript package.
- Added strict TypeScript configuration, Biome lint/format configuration, lockfile, environment example, and repository ignore rules.
- Added local PostgreSQL 17 with pgvector and Redis 7.4 through Docker Compose.
- Added the API `GET /health` liveness endpoint and consistent foundation-level 404 response.
- Added a worker entry point that validates `REDIS_URL` and verifies a BullMQ-compatible Redis connection. It has no queue processor or generation behavior.
- Added a minimal Next.js placeholder page with Tailwind CSS.
- Added a small Node foundation test covering API health, absent feature routes, invalid API port configuration, and invalid worker Redis configuration.
- Documented setup, startup, architecture boundaries, deferred choices, and environment-specific behavior in the root `README.md`.
- Recorded Phase 0 completion and verification evidence in the root `IMPLEMENTATION_PLAN.md`.
- Implemented all eight DATA entities with Drizzle in `packages/database/src/schema.ts` and a minimal server-only client shared by API and worker. No feature runtime code was changed.
- Applied `0000_initial_persistence.sql` and `0001_progress_relationships.sql` to the Compose development database: eight application tables, two migration records, zero application rows.
- Verified schema generation, clean migrations, constraints, progress/ownership relationships, transactions, and concurrency. No direct data-model/architecture incompatibility was found.

## Remaining Work

- No remaining task in the authorized Phase 0/1 delivery scope is known.
- Commit the verified working tree when explicitly requested or when the active workflow authorizes committing.
- Phase 4C must select the embedding model/dimension, validate stored vectors, and migrate to `vector(N)` with a compatible index/operator.
- Resolve A03 (required `User.pace` versus registration before onboarding) before Phase 2; do not invent a default. Later phases must reconcile the other recorded product, quota, part-type, reward, and job-reliability decisions before changing their contracts.
- Do not begin Phase 2 without an explicit user instruction.

## Important Implementation Decisions

- npm workspaces are used without an additional monorepo task runner.
- The three runtime components are Next.js (`apps/web`), Fastify (`apps/api`), and a separate non-HTTP worker (`apps/worker`). No additional services or microservices were introduced.
- PostgreSQL/pgvector and Redis are the only local datastore services.
- Biome handles linting and formatting. ESLint was not retained because the current plugin peer ranges conflicted during setup.
- Node's native environment-file support is used; no `dotenv` dependency was added.
- Shared types remain type-only and contain no backend runtime code or secrets.
- Drizzle 0.45.2 with node-postgres 8.23.0 is selected; Drizzle Kit 0.31.10 owns migrations under `apps/api/drizzle/`. The shared package has no service/repository abstraction or automatic startup migrations. Callers own transactions and pool shutdown.
- Schema preserves specified nullability/defaults and named part types. UUID and timestamp insertion defaults are supplied; timestamps use `timestamptz`, dates use `date`, JSON uses `jsonb`. Application writes in later phases own `updatedAt`, expiry calculation, and lifecycle transitions.
- Composite foreign keys enforce track ownership. Unique/check constraints and SQL progress relationship triggers enforce the plan's integrity requirements without extra model columns. Referenced data uses `NO ACTION`; repeated shared-content assignments are allowed. The required vector column is dimensionless pending 4C.
- Authentication, provider SDKs, queue jobs, product state libraries, PWA behavior, hosting, and all feature modules remain deferred to their approved phases. Product decisions in `docs/open-questions.md` remain unresolved.

## Files Changed

All entries below are currently untracked relative to the last verified commit:

- Root: `.env.example`, `.gitignore`, `AGENTS.md`, `HANDOFF.md`, `IMPLEMENTATION_PLAN.md`, `README.md`, `biome.json`, `compose.yaml`, `package.json`, `package-lock.json`, `tsconfig.base.json`.
- Web: `apps/web/AGENTS.md`, `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next-env.d.ts`, `apps/web/postcss.config.mjs`, and `apps/web/app/{globals.css,layout.tsx,page.tsx}`.
- API: `apps/api/package.json`, `apps/api/tsconfig.json`, and `apps/api/src/{app.ts,server.ts}`.
- Worker: `apps/worker/package.json`, `apps/worker/tsconfig.json`, and `apps/worker/src/index.ts`.
- Shared package: `packages/shared-types/package.json`, `packages/shared-types/tsconfig.json`, and `packages/shared-types/src/index.ts`.
- Infrastructure/tests: `infra/postgres/init.sql` and `tests/foundation.test.mjs`.
- Phase 1 additions: `packages/database/{package.json,tsconfig.json,src/schema.ts,src/client.ts}`, `apps/api/drizzle.config.ts`, `apps/api/drizzle/{0000_initial_persistence.sql,0001_progress_relationships.sql,meta/0000_snapshot.json,meta/0001_snapshot.json,meta/_journal.json}`, and `tests/database.test.mjs`.

The original specification files under `docs/` were not modified during either phase.

Phase 1 also changed root `package.json`, `package-lock.json`, `biome.json`, `.env.example`, `compose.yaml`, `README.md`, `IMPLEMENTATION_PLAN.md`, this handoff, and API/worker package manifests. The ignored local `.env` now uses PostgreSQL port 55432; do not commit it. Existing web, API, worker, and shared-types source files were preserved.

## Validation Status

Phase 1 verification on 2026-09-19:

- Dependency install and `npm ls --depth=0` passed.
- `npm run db:migrate` passed on development PostgreSQL; `npm run db:generate` reports no changes.
- `npm run test:database` passed (8 tests including the parent suite). It starts from a fresh database with no vector extension, applies migrations twice, verifies integrity and concurrent changes, and removes its fixtures/database. No test databases remain.
- `npm run build`, `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm test` all passed. Database declaration/type generation passed.
- Development catalog: 8 primary keys, 12 foreign keys, 6 unique constraints, 7 check constraints, 25 indexes including key/unique indexes, and 3 progress relationship triggers. Application rows: 0.
- Ponytail review of the persistence changes found no unnecessary abstraction to remove.
- `npm audit --omit=dev`: 0 vulnerabilities. Full audit: 4 moderate findings through Drizzle Kit's development-only esbuild chain; npm's offered fix is an incompatible downgrade and was not applied.
- `git diff --check` passed; implementation files are untracked, so source/config formatting was checked separately.

Historical Phase 0 verification (2026-09-19; retained as startup evidence, not a new Phase 1 startup run):

- `npm ci --no-fund` — passed; 0 reported vulnerabilities.
- `npm run build` — passed for shared types, web, API, and worker.
- `npm run typecheck` — passed for all workspaces.
- `npm run lint` — passed.
- `npm run format:check` — passed.
- `npm test` — passed (1 test, 0 failures).
- `npm ls --depth=0` — passed with the expected workspace dependency tree.
- Production startup smoke check — passed: web returned HTTP 200 with Edisco content, API returned `{ "status": "ok", "service": "api" }`, and worker reported Redis readiness.
- Docker Compose configuration — valid.
- PostgreSQL — healthy with pgvector 0.8.6 enabled and 0 application tables.
- Redis — healthy and returned `PONG`.
- `git diff --check` — passed.

Phase 0 verification application processes and Compose containers were stopped afterward. Phase 1 used only Compose PostgreSQL and also stopped its verification container after testing; the migrated named volume was preserved.

## Known Issues

- Docker is available through Ubuntu WSL on the verified machine, not directly on the Windows PATH.
- On this machine, detached Compose containers stopped when the last WSL foreground session ended. The root `README.md` documents the attached WSL command that worked for verification.
- Redis reports that WSL host `vm.overcommit_memory` is disabled. Phase 0 connectivity works; revisit this host setting before persistent queue workloads in Phase 4A.
- Windows already runs an unrelated PostgreSQL process on 5432. Compose's port is now configurable (default 5432); local `.env` sets both `POSTGRES_PORT` and the `DATABASE_URL` port to 55432. The Windows service was not changed. The initial authentication failure reached that other service and applied no migration.
- Drizzle Kit has the development dependency audit findings listed above; the production dependency audit is clean.
- The Phase 0/1 working tree is uncommitted and untracked relative to `4a1a290`; Git history alone does not represent the current implementation.
- The canonical plan is currently `IMPLEMENTATION_PLAN.md` at the repository root. There is no `docs/IMPLEMENTATION_PLAN.md`.
- All seven product questions in `docs/open-questions.md` remain unresolved.

## Next Action

Wait for an explicit next-phase instruction. Before any continuation, read this file and root `IMPLEMENTATION_PLAN.md`, then inspect actual files and Git history. Preserve the implemented Drizzle schema and migrations. When Phase 2 is authorized, first reconcile A03's pre-onboarding account contract against the required pace field. Do not begin Phase 2 based only on this handoff.
