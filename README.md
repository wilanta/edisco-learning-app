# Edisco

Edisco has a Next.js frontend, Fastify API, separate Node.js worker, and shared PostgreSQL/Drizzle package. Phase 4C adds embedding and semantic reuse before OpenAI content generation. Quota charging and recovery qualification remain deferred; generation is for development verification until those release gates pass.

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
- Drizzle uses its native `vector(1536)` type. Migration 0004 enforces dimensions and adds a cosine HNSW index; 0005 adds nullable embedding-profile, generation-pace, and context metadata. Legacy null embeddings/metadata remain stored but are ineligible for reuse. New generation writes vectors and compatibility metadata atomically with content. No automatic legacy backfill is performed.
- Committed migration 0002 makes `User.pace` and `interests` nullable for registration before onboarding. Registration inherits quota default 3; first onboarding writes 3 again. Generation requires completed onboarding regardless of that balance. The seven explicitly named part types are represented. These prior implementation choices need reconciliation with the original model; Phase 4A preserves them. Additional part types, reward rules, and other open product decisions remain unresolved.
- The Phase 4B dependency installation reported zero audit vulnerabilities. Worker Zod reuses the version already used by the API; OpenAI calls use native `fetch` without an SDK dependency.

## Development

Open three terminals at the repository root:

```text
npm run dev:web
npm run dev:api
npm run dev:worker
```

- Web: `http://localhost:3000` (existing onboarding/auth flow and placeholder Track page; no generation UI).
- API: `http://127.0.0.1:3001/health` returns `{"status":"ok","service":"api"}`. This is process liveness, not datastore readiness.
- Worker: consumes `edisco-generation` through BullMQ. PostgreSQL and Redis must be running; the worker has no HTTP listener. Enable exactly one mode: the Phase 4A placeholder or Phase 4B LLM mode described below.

API and worker scripts load the root `.env` with Node's native environment-file support. Existing process variables take precedence. Keep datastore credentials server-side; no secrets are injected into the web application. API `PORT` must be 1–65535. API `HOST` defaults to loopback; deployment settings remain deferred.

Stop processes with Ctrl+C. Stop infrastructure with `npm run infra:down` (or `wsl -d Ubuntu-24.04 -- docker compose down`). Named data volumes are preserved.

## Phase 4A pipeline verification

Set a private `JWT_SECRET` and explicitly set `GENERATION_PLACEHOLDER_ENABLED=true` in your local `.env` to run the authenticated API and placeholder worker. Apply existing migrations with `npm run db:migrate`, then start API and worker using the commands above. Keep the flag disabled for deployment until real generation is implemented.

An onboarded bearer-token user with positive quota can submit `POST /lessons/generate` with `{ "topic": "Python basics", "category": "PROGRAMMING" }`. Poll `GET /lessons/generate/:jobId` for PENDING → PROCESSING → DONE or FAILED. To continue an owned track, include its `trackId`; category must match, and omitted topic uses the track title for this placeholder. Only the owner can poll the job.

The placeholder changes only GenerationJob state. DONE has `resultLessonId: null`; a new track is not created. In placeholder mode no lesson, parts, assignment, embeddings, quota decrement, or expiry data is written. Queue submission failure produces HTTP 503 with a safe GENERATION_FAILED error and persists FAILED; worker failures expose a sanitized message. Raw database/Redis errors are not returned by the status endpoint.

Run `npm run test:generation` with the local databases running. It creates/removes isolated PostgreSQL databases and Redis namespaces and launches separate workers in both modes. OpenAI is mocked at the network boundary. Checks cover ownership, queue outage, persistence, rollback, invalid output, continuation, concurrent finalization, and unchanged quota. Tests supply their own JWT secret and mode flags. `GENERATION_QUEUE_PREFIX` optionally isolates queues (default `bull`); API and worker must use the same value.

BullMQ handles queue delivery and stalled jobs; connection settings follow its [producer/worker guidance](https://docs.bullmq.io/guide/connections). There is no durable DB-to-queue reconciliation yet: a crash between insert and enqueue or a database outage while persisting terminal status can strand a job. Request idempotency, queue retention, recovery/retry policy, and quota finalization remain production release gates. Phase 4B adds a bounded provider deadline and atomic content/assignment finalization. Terminal queue records remain in Redis.

## Phase 4B lesson generation

Apply all migrations with `npm run db:migrate`. In the ignored local `.env`, set `GENERATION_LLM_ENABLED=true`, `GENERATION_PLACEHOLDER_ENABLED=false`, a private `OPENAI_API_KEY`, and an explicitly evaluated `SIMILARITY_MAX_DISTANCE` as described below. API and worker must use the same mode and queue prefix. `OPENAI_MODEL` defaults to `gpt-4o-mini-2024-07-18`; change it only to a compatible structured-output model after evaluation. Never expose keys through `NEXT_PUBLIC_*` or commit them.

The worker uses OpenAI's [Responses structured-output format](https://developers.openai.com/api/docs/guides/structured-outputs) with [GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini). Requests have a 30-second deadline, a 6,000 output-token cap, `store: false`, no tools, and one attempt. Topic text and prior summaries are serialized as untrusted user-message data, separate from instructions. This reduces injection exposure; structural validation cannot prove factual correctness or perfect topic adherence.

Topics are trimmed, limited to 1–2,000 characters, and reject control characters except tab/newline. The worker revalidates durable input, reads the user's current database pace, and supplies the last five owned lesson summaries in track order. An omitted continuation topic uses the track title. These bounded defaults do not settle the open curriculum/context policy. Templates follow business-logic §3; GENERAL applies when explicitly selected, without a new category classifier. Composition follows the documented provisional free-choice assumption, with at least two exercise types per lesson; fixed ratios remain open.

On a cache miss, one SQL transaction creates the Track when needed, Lesson with its embedding, five Parts, UserLesson (`NOT_STARTED`, `wasReused=false`), and DONE result IDs. Job/track locks prevent duplicate publication and colliding positions. Provider calls occur outside the transaction; overlapping deliveries can incur duplicate provider calls. No quota is deducted. Original expiry uses UTC PostgreSQL calendar arithmetic (`created_at + interval '3 months'`, clipping month ends) and is never refreshed on reuse.

Private `contentVersion=1` Part JSON always contains `question` and `explanation`:

| Type | Additional private fields |
| --- | --- |
| MULTIPLE_CHOICE | Unique `options[]`; string `correctAnswer` matching an option |
| FILL_IN_BLANK | `blanks: [{id, correctAnswer}]`; each `[[id]]` occurs once in the question |
| MATCHING | Unique `leftOptions[]`, `rightOptions[]`; bijective `correctAnswer: [{left, right}]` |
| TRUE_FALSE | Boolean `correctAnswer` |
| CODE_PREDICT / TRANSLATE / SHORT_ANSWER | String `correctAnswer`; source/code context in the question |

Zod validates structure, category types, five ordered positions, varied composition, and answer consistency. These schemas remain worker-private until Phase 5 defines public rendering/grading. Never return stored solution JSON directly as a public lesson DTO. No code is executed. Malformed output, refusal, timeout, or provider failure produces FAILED without partial content.

No real API key was available during implementation. Mocked tests do not establish real answer quality, cost, or latency. With credentials, generate representative math/code/language lessons at each pace and manually review correctness and difficulty before release. The provider deadline does not establish the product's end-to-end latency target.

Migration 0003 only drops the embedding NOT NULL constraint. To reverse it, populate genuine embeddings for null rows after model selection, then apply a reviewed forward migration restoring NOT NULL. Do not use fake vectors or remove owned lessons to reverse this change.

## Phase 4C embeddings and reuse

Every real generation now embeds the validated topic/category/server pace, searches PostgreSQL, then either reuses the best eligible lesson or calls the existing content generator. OpenAI `text-embedding-3-small` uses its [documented 1,536 dimensions](https://developers.openai.com/api/docs/guides/embeddings). The adapter uses native fetch, one bounded request, and validates model identity, vector length, finite float32 values, and nonzero vectors. An embedding/search failure fails the job; it cannot bypass search and call the content model.

Search orders by pgvector cosine **distance** (`<=>`) and requests the nearest five eligible candidates. The best is reused when `distance <= SIMILARITY_MAX_DISTANCE`. This is an inclusive maximum distance in [0,2], not a minimum similarity score. There is **no numeric default**: missing/invalid configuration stops real-worker startup and fails processing safely. Set the environment value and restart workers to change it without a code deployment; each job snapshots the value. Test-only values do not constitute an evaluated operating threshold. Logs record job ID, reuse/generate decision, distance, maximum distance, and embedding profile without topic text or solutions.

Eligibility requires matching category, `isExpiredForReuse=false`, `expiresAt > current time`, non-null compatible embedding profile, contentVersion 1, equal stored generation pace, and equal continuation context. The approved context safeguard hashes the ordered IDs of the latest five lessons used in the content prompt (an empty list for an initial lesson). A continuation cannot reuse any lesson already assigned to that track. Same-user reuse into a new track remains allowed. These safeguards preserve the Phase 4B bounded context; they do not introduce curriculum planning.

The profile identifies provider/model/dimension/input format. Model or representation changes require a distinct profile and any necessary reviewed dimension/index migration; unrelated vectors must never be compared. Legacy null metadata is not inferred from a user's mutable current pace. Existing owners retain their content and progress. The normalized topic field is retained, but there is no exact-topic shortcut bypassing vector search or eligibility.

The cosine HNSW index uses [strict iterative scanning](https://github.com/pgvector/pgvector#iterative-index-scans) so filtering can search beyond initially ineligible neighbors (pgvector >=0.8). A transaction-local `enable_sort=off` preference avoids a category-index scan followed by sorting every candidate. Tests verify the actual query's HNSW plan with 1,000 vector fixtures. HNSW remains an approximate neighbor index: real-corpus recall and latency require evaluation; strict ordering does not make its recall exact.

Reuse creates a distinct owned UserLesson (`wasReused=true`) through the existing finalization transaction, preserving Lesson/Part identity, provenance, original expiry, and other users' progress. Eligibility, distance, and continuation context are rechecked under finalization locks. If a candidate expires or becomes incompatible before assignment, the job fails safely without partial writes. The owner-only status response exposes neither reuse provenance nor private answers.

Migrations 0004/0005 were applied to development PostgreSQL and verified from a clean database. 0004 refuses incompatible existing dimensions rather than truncating/padding them. Rollback requires a reviewed forward migration (drop the added index before widening the vector type); preserve vectors and compatibility metadata, and do not delete owned content. No daily expiry scheduler, quota charging, frontend, or bulk re-embedding was added. Expiry is checked directly during search/assignment; the scheduled flagging requirement remains later work under this phase's narrowed scope.

No live OpenAI calls or semantic quality benchmark ran: credentials and an operational threshold are not configured. Production threshold selection and real-corpus evaluation remain outstanding. `npm run test:generation` covers provider failures, inclusive boundaries, all eligibility filters, shared progress isolation, continuation reuse, expiry races, and the actual API/queue/worker pipeline.

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

The [specification index](docs/README.md), [implementation plan](IMPLEMENTATION_PLAN.md), and [handoff](HANDOFF.md) retain requirements and current state. Begin Phase 4D only when explicitly instructed.
