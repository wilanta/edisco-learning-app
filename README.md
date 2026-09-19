# Edisco

Phase 0 foundation and Phase 1 persistence: a Next.js frontend, Fastify API, separate Node.js worker, and shared PostgreSQL/Drizzle package in one npm workspace. Product features start in later phases.

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

- All eight documented entities use UUID keys, snake_case SQL names, required/nullable fields as specified, and the documented defaults. Instant timestamps use `timestamptz`; calendar dates use `date`. IDs and creation/update timestamps receive insertion defaults. Later application writes must set `updatedAt` and compute `expiresAt` from `createdAt + 3 months`; no lifecycle business logic runs in the database.
- Ordered parts, ordered track assignments, progress per assignment/part, and weekly entries per user/week are unique. Checks enforce part positions 1–5, positive assignment order, nonnegative counters, Monday week starts, and positive optional rank. Composite foreign keys enforce track ownership; SQL triggers reject progress linked to a part from another lesson, including parent changes. Foreign keys use `NO ACTION`, preserving referenced content. Assigning the same shared lesson again is permitted; replay/reward policy remains open.
- The user selected Drizzle and explicitly deferred dimension-specific vector migration to Phase 4C. `Lesson.embedding` is currently a required, dimensionless pgvector column with a typed `number[]` mapping; no model or approximate-neighbor index is chosen. Phase 4C must validate stored dimensions and add `vector(N)` plus the chosen index/operator. See [pgvector's dimension guidance](https://github.com/pgvector/pgvector#can-i-store-vectors-with-different-dimensions-in-the-same-column) and [Drizzle custom types](https://orm.drizzle.team/docs/custom-types).
- `User.pace` remains required with no fabricated default, quota starts at 3, and the seven explicitly named part types are represented. The audited pre-onboarding account conflict, quota activation, additional part types, reward rules, job reliability, and open product decisions still require their later-phase decisions. This schema does not settle them.
- Drizzle Kit 0.31.10 currently brings four moderate audit findings through its development-only legacy esbuild loader. Production dependency audit is clean. No esbuild development server is exposed by these database commands; an incompatible downgrade was not applied.

## Development

Open three terminals at the repository root:

```text
npm run dev:web
npm run dev:api
npm run dev:worker
```

- Web: `http://localhost:3000` (static placeholder only).
- API: `http://127.0.0.1:3001/health` returns `{"status":"ok","service":"api"}`. This is process liveness, not datastore readiness.
- Worker: validates `REDIS_URL`, opens a BullMQ-compatible Redis connection and logs readiness. It has no HTTP listener, queue, processor, scheduled job, or generation logic. It does not retry Redis failures; recovery policy belongs to Phase 4A.

API and worker scripts load the root `.env` with Node's native environment-file support. Existing process variables take precedence. Keep datastore credentials server-side; no secrets are injected into the web application. API `PORT` must be 1–65535. API `HOST` defaults to loopback; deployment settings remain deferred.

Stop processes with Ctrl+C. Stop infrastructure with `npm run infra:down` (or `wsl -d Ubuntu-24.04 -- docker compose down`). Named data volumes are preserved.

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
- **Deferred by scope:** auth integration, provider SDKs, runtime business configuration, hosting, shadcn components, TanStack Query/Zustand providers, domain packages and feature directories. Add them when the approved phase first needs them. This foundation makes no product decisions about the seven open questions.

The initial page language is English placeholder copy, not a finalized product language choice. PWA installability remains unresolved. The domain module paths and feature route groups in the architecture are reserved for later phases, rather than populated with nonfunctional endpoints/screens now.

Next.js generated `apps/web/AGENTS.md` during development startup; its managed framework guidance is retained. The unrelated generated `CLAUDE.md` alias was removed during Ponytail review. ECC's installed architect guide was applied locally to the structure; no ECC CLI command or extra agent was assumed.

On the verification machine Redis reported that the WSL host's `vm.overcommit_memory` setting was disabled. Startup/connectivity passed; no host-wide kernel settings were changed. Revisit the setting before exercising persistent queue workloads in Phase 4A.

The existing [specification index](docs/README.md), [implementation plan](IMPLEMENTATION_PLAN.md), and [handoff](HANDOFF.md) retain the requirements, current state, and unresolved decisions. Phase 2 has not started.
