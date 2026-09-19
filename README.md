# Edisco

Edisco has a Next.js frontend, Fastify API, separate Node.js worker, and shared PostgreSQL/Drizzle package. Authentication and onboarding are implemented; Phase 4A adds an opt-in asynchronous generation placeholder. Real lesson generation is not implemented.

## Requirements and setup

- Node.js 22.20+ (22.x), npm 11.x.
- Docker with Compose for local PostgreSQL/pgvector and Redis. Docker inside WSL also works; run Docker commands from the repository's WSL path.

```powershell
npm ci
Copy-Item .env.example .env
npm run infra:up
```

On macOS/Linux, use `cp .env.example .env`. Do not overwrite an existing `.env`. The example credentials are for local development only. Both datastore ports bind to loopback.

If Docker is only installed in WSL, replace the infrastructure command with:

```powershell
wsl -d Ubuntu-24.04 -- docker compose up
```

Run that command from this repository; WSL inherits the working directory. Keep this terminal open: on the verification machine, WSL shut down the detached containers when its last foreground session ended. A continuously running Docker host can use the detached `npm run infra:up` command instead.

The SQL init file enables `vector` on a new database volume. Phase 1 migrations also initialize the extension, so an empty database outside Compose works. If another PostgreSQL service occupies port 5432, set `POSTGRES_PORT` and the port in `DATABASE_URL` to the same free port in `.env`. This machine uses 55432; the example retains 5432.

## Database workflow

With PostgreSQL running, execute from the repository root:

```text
npm run db:migrate
npm run test:database
```

`db:migrate` applies reviewed SQL files under `apps/api/drizzle/` to `DATABASE_URL`. It does not seed data. `test:database` creates a uniquely named `edisco_test_*` database from `template0`, applies the migrations twice, tests integrity and transactions, then removes only that test database. The development role needs database-creation and extension-installation permissions for this check; the Compose role has them.

The shared server-only `@edisco/database` package exports `createDatabase(connectionString)` and the schema at `@edisco/database/schema`. It returns Drizzle `db` and the underlying `pool`; the caller owns transactions and calls `pool.end()` on shutdown. API and worker declare this dependency but do not connect automatically. The web app has no database dependency.

Edit `packages/database/src/schema.ts`, then run `npm run db:generate -- --name=descriptive_name` and review the generated SQL before applying it. Drizzle infers types from the schema; `npm run build --workspace @edisco/database` emits declarations without a separate client generator. The extension statement and progress relationship triggers are explicit SQL: preserve them in subsequent migrations. Use migrations rather than schema push, which would omit this custom SQL. Applied migrations are immutable; rollback of this initial schema would delete data, so use a corrective forward migration or restore a backup instead. Disposable test databases are recreated by the test command.

Persistence decisions and limits:

- All eight documented entities use UUID keys, snake_case SQL names, and the documented defaults; Phase 2's nullable registration fields are noted below. Instant timestamps use `timestamptz`; calendar dates use `date`. IDs and creation/update timestamps receive insertion defaults. Later application writes must set `updatedAt` and compute `expiresAt` from `createdAt + 3 months`; no lifecycle business logic runs in the database.
- Ordered parts, ordered track assignments, progress per assignment/part, and weekly entries per user/week are unique. Checks enforce part positions 1–5, positive assignment order, nonnegative counters, Monday week starts, and positive optional rank. Composite foreign keys enforce track ownership; SQL triggers reject progress linked to a part from another lesson, including parent changes. Foreign keys use `NO ACTION`, preserving referenced content. Assigning the same shared lesson again is permitted; replay/reward policy remains open.
- The user selected Drizzle and explicitly deferred dimension-specific vector migration to Phase 4C. `Lesson.embedding` is currently a required, dimensionless pgvector column with a typed `number[]` mapping; no model or approximate-neighbor index is chosen. Phase 4C must validate stored dimensions and add `vector(N)` plus the chosen index/operator. See [pgvector's dimension guidance](https://github.com/pgvector/pgvector#can-i-store-vectors-with-different-dimensions-in-the-same-column) and [Drizzle custom types](https://orm.drizzle.team/docs/custom-types).
- Committed migration 0002 makes `User.pace` and `interests` nullable for registration before onboarding. Registration inherits quota default 3; first onboarding writes 3 again. Generation requires completed onboarding regardless of that balance. The seven explicitly named part types are represented. These prior implementation choices need reconciliation with the original model; Phase 4A preserves them. Additional part types, reward rules, and other open product decisions remain unresolved.
- Drizzle Kit 0.31.10 currently brings four moderate audit findings through its development-only legacy esbuild loader. Production dependency audit is clean. No esbuild development server is exposed by these database commands; an incompatible downgrade was not applied.

## Development

Open three terminals at the repository root:

```text
npm run dev:web
npm run dev:api
npm run dev:worker
```

- Web: `http://localhost:3000` (existing onboarding/auth flow and placeholder Track page; no generation UI).
- API: `http://127.0.0.1:3001/health` returns `{"status":"ok","service":"api"}`. This is process liveness, not datastore readiness.
- Worker: consumes `edisco-generation` through BullMQ and persists generation job status. Set `GENERATION_PLACEHOLDER_ENABLED=true` only to exercise the Phase 4A placeholder. PostgreSQL and Redis must be running; the worker has no HTTP listener or real generation logic.

API and worker scripts load the root `.env` with Node's native environment-file support. Existing process variables take precedence. Keep datastore credentials server-side; no secrets are injected into the web application. API `PORT` must be 1–65535. API `HOST` defaults to loopback; deployment settings remain deferred.

Stop processes with Ctrl+C. Stop infrastructure with `npm run infra:down` (or `wsl -d Ubuntu-24.04 -- docker compose down`). Named data volumes are preserved.

## Phase 4A pipeline verification

Set a private `JWT_SECRET` and explicitly set `GENERATION_PLACEHOLDER_ENABLED=true` in your local `.env` to run the authenticated API and placeholder worker. Apply existing migrations with `npm run db:migrate`, then start API and worker using the commands above. Keep the flag disabled for deployment until real generation is implemented.

An onboarded bearer-token user with positive quota can submit `POST /lessons/generate` with `{ "topic": "Python basics", "category": "PROGRAMMING" }`. Poll `GET /lessons/generate/:jobId` for PENDING → PROCESSING → DONE or FAILED. To continue an owned track, include its `trackId`; category must match, and omitted topic uses the track title for this placeholder. Only the owner can poll the job.

The placeholder changes only GenerationJob state. DONE has `resultLessonId: null`; a new track is not created. No lesson, parts, assignment, embeddings, quota decrement, expiry, or generation UI is implemented. Queue submission failure produces HTTP 503 with a safe GENERATION_FAILED error and persists FAILED; worker failures expose a sanitized message. Raw database/Redis errors are not returned by the status endpoint.

Run `npm run test:generation` with the local databases running. It creates/removes its own PostgreSQL database and Redis queue namespace, launches a separate worker process, and verifies success, failure, ownership, queue outage, duplicate delivery, and zero content/quota side effects. The suite supplies its own JWT secret and placeholder flag. `GENERATION_QUEUE_PREFIX` optionally isolates queues (default `bull`); API and worker must use the same value. It is used by tests without flushing shared Redis data.

BullMQ handles queue delivery and stalled jobs; connection settings follow its [producer/worker guidance](https://docs.bullmq.io/guide/connections). There is no durable DB-to-queue reconciliation yet: a crash between insert and enqueue or a database outage while persisting terminal status can strand a job. Request idempotency, queue retention, provider deadlines/retries, and atomic content/quota finalization must be settled before real production generation. Terminal placeholder queue records currently remain in Redis.

## Checks and production startup

```text
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

`npm run format` formats source/configuration; it excludes the original specifications, implementation plan and generated files. The small Node test checks API liveness, absent feature routes, invalid ports and missing/invalid Redis configuration without exposing its input.

After building, start each application separately:

```text
npm run start --workspace @edisco/web
npm run start --workspace @edisco/api
npm run start --workspace @edisco/worker
```

Start infrastructure first for the worker. Web and API liveness can start independently of it. No hosted deployment or CI service has been configured; the check commands above are usable by a later CI runner.

## Structure and decisions

```text
apps/web/app/             Next.js App Router, root layout/page, Tailwind CSS
apps/api/src/             Fastify application and process entry
apps/worker/src/          Separate worker process and Redis connection
packages/shared-types/   Public TypeScript contracts (type-only exports)
packages/database/src/   Shared server-only Drizzle schema and minimal client
apps/api/drizzle/        Reviewed SQL migrations and generated snapshots
apps/api/drizzle.config.ts  Migration configuration
infra/postgres/init.sql  Local pgvector extension initialization only
tests/                   Node's built-in test runner
compose.yaml             PostgreSQL + pgvector and Redis, no other services
```

This follows [architecture.md](docs/architecture.md) §§1/2/5:

- **npm workspaces** reuse the package manager bundled with the selected Node environment; no monorepo task runner or process supervisor is needed. Each application starts independently.
- **Fastify** selects the architecture's primary API option. Next.js serves the frontend; it does not become a second backend. The worker remains a queue-side process, not another HTTP service.
- **TypeScript** uses a shared strict baseline, Node ESM for backend processes, and Next.js bundler settings for the web app. Shared types contain no credentials or backend runtime code.
- **Biome** handles lint and format with one dependency. It is a [documented Next.js option](https://nextjs.org/docs/app/getting-started/installation); this avoids the conflicting ESLint 10 peer ranges in the current React/a11y plugin stack. Tailwind uses the [official PostCSS integration](https://tailwindcss.com/docs/installation/framework-guides/nextjs).
- **PostgreSQL 17/pgvector and Redis 7.4** run locally with persistent volumes; Redis uses `noeviction` and append-only persistence. BullMQ owns its Redis connection behavior; no custom queue abstraction was added. See its [connection guidance](https://docs.bullmq.io/guide/connections).
- **Drizzle** was selected by the user for Phase 1. Schema/client code is shared by API and worker through `packages/database`; migration ownership remains under `apps/api`. There are no repositories, services, or automatic startup migrations.
- **Existing authentication:** Fastify JWT and bcrypt were implemented in Phase 2; Phase 4A reuses them. Provider SDKs, hosting, generation frontend, and later feature modules remain deferred. Open product decisions are not silently resolved by the placeholder pipeline.

The initial page language is English placeholder copy, not a finalized product language choice. PWA installability remains unresolved. The domain module paths and feature route groups in the architecture are reserved for later phases, rather than populated with nonfunctional endpoints/screens now.

Next.js generated `apps/web/AGENTS.md` during development startup; its managed framework guidance is retained. The unrelated generated `CLAUDE.md` alias was removed during Ponytail review. ECC's installed architect guide was applied locally to the structure; no ECC CLI command or extra agent was assumed.

On the verification machine Redis reports that the WSL host's `vm.overcommit_memory` setting is disabled. Local queue verification passed; no host-wide kernel settings were changed. Revisit this before production persistent queue workloads.

The existing [specification index](docs/README.md), [implementation plan](IMPLEMENTATION_PLAN.md), and [handoff](HANDOFF.md) retain the requirements, current state, and unresolved decisions. Phase 4B has not started.
