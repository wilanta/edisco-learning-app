# Edisco Demo Guide

This guide is intended for developers or evaluators who need to run and demonstrate the Edisco application locally.

## A. Prerequisites
Ensure you have the following installed:
* **Node.js** (v22+)
* **npm** (v10+)
* **PostgreSQL** (v17+) with **pgvector** extension installed
* **Redis** (v7.4+)
* *(Optional)* Docker and Docker Compose (to run Postgres and Redis easily via the provided `compose.yaml`)

## B. Installation

1. **Clone and open the repository:**
   Navigate into the root of the project directory `edisco-learning-app`.
2. **Install dependencies:**
   Run the following command at the root of the repository:
   ```bash
   npm install
   ```

## C. Environment Variables

Copy the provided example environment variables file to a local `.env` file at the root of the repository:

```bash
cp .env.example .env
```

### Required Configuration in `.env`:
* **PostgreSQL settings:** `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL` (Set to your local PostgreSQL credentials).
* **Redis settings:** `REDIS_URL`
* **JWT Authentication:** `JWT_SECRET` (Must be set to a secure string for the API to work, e.g. `your_secret_key`).

### AI Configuration (Mock vs. Real):
* `GENERATION_PLACEHOLDER_ENABLED=true`: Uses a placeholder task generator instead of an LLM. No lesson is actually created.
* `GENERATION_LLM_ENABLED=false`: Set to `true` to use the real LLM generation (requires `OPENAI_API_KEY`).
* `OPENAI_API_KEY=YOUR_API_KEY_HERE`: Only required if `GENERATION_LLM_ENABLED` is true.

## D. Database Setup

### Using Docker (If Available):
The repository provides a `compose.yaml` to easily start PostgreSQL (with `pgvector` enabled) and Redis.

1. Start the containers:
   ```bash
   docker compose up -d
   ```
2. Generate the Drizzle ORM client:
   ```bash
   npm run db:generate
   ```
3. Apply database migrations:
   ```bash
   npm run db:migrate
   ```

*(Note: If Docker is NOT VERIFIED IN CURRENT ENVIRONMENT, please install PostgreSQL and `pgvector` manually, update the `DATABASE_URL` in `.env`, and run `npm run db:generate` and `npm run db:migrate`)*

## E. Redis Setup

If you are using the Docker approach above, Redis starts automatically.
Otherwise, start your local Redis server and ensure it is reachable at the `REDIS_URL` defined in your `.env`.

## F. Running the Application

The repository is a monolithic monorepo managed with npm workspaces. You need to start three distinct processes.

Open three separate terminal windows in the repository root:

### Terminal 1: Web Frontend
Start the Next.js frontend:
```bash
npm run dev --workspace apps/web
```
*Expected: "Ready in Xms" and accessible at `http://localhost:3000`*

### Terminal 2: API Server
Start the Fastify backend API:
```bash
npm run dev --workspace @edisco/api
```
*Expected: "Server listening at http://127.0.0.1:3001"*

### Terminal 3: Background Worker
Start the generation job processing worker:
```bash
npm run dev --workspace @edisco/worker
```
*Expected: "Worker connected to Redis and waiting for jobs"*

---

## Demo Scenario

This step-by-step guide walks you through the core flow of the application.

1. **Open Edisco:** Navigate to `http://localhost:3000` in your browser.
2. **Register/login:** Click on Register. Enter an email and password to create an account.
3. **Complete onboarding:** Select at least one interest (e.g., Programming) and a daily learning pace.
4. **Open/create a Track:** You will be redirected to the "Tracks" dashboard. Click "+ New Lesson" to request content.
5. **Request a new lesson:** Enter a topic in your chosen interest category and click "Generate".
6. **Show generation loading:** Observe the polling UI as the background worker processes the request. *(Note: If placeholder mode is enabled, it completes quickly without generating an actual lesson. If you want full generation, enable LLM and set a valid OpenAI key)*.
7. **Open the lesson:** Once generation completes, click on the new Lesson link from the Track page.
8. **Complete exercises:** Answer the AI-generated questions (multiple-choice, fill-in-the-blank).
9. **Show persisted progress:** Upon answering, note the immediate correctness feedback and XP allocation. Reload the page to see progress is resumed correctly.
10. **Show XP/streak changes:** Complete all 5 parts of a lesson to see the completion bonus (+20 XP) and daily streak bonus (+5 XP) applied.
11. **Open League:** Navigate to "League" from the top navigation on the Track page to view your global weekly ranking and total XP.
12. **Open Profile:** Navigate to "Profile" from the top navigation to view your total XP, streak, and free generations left.
13. **Edit Profile:** Change your pace or interests on the Profile page and click "Save Preferences".
14. **Demonstrate Persistence:** Refresh the Profile page to verify your updated pace and interests were permanently saved.

---

## Troubleshooting

*   **Symptom:** `connect ECONNREFUSED 127.0.0.1:5432`
    *   **Cause:** PostgreSQL is not running or running on a different port.
    *   **Action:** Ensure Docker is running `docker compose up -d` or verify local Postgres service status. Update `.env` with the correct `POSTGRES_PORT`.
*   **Symptom:** Database migration fails mentioning vector extension.
    *   **Cause:** `pgvector` is not installed in the PostgreSQL instance.
    *   **Action:** Ensure you are using the `pgvector/pgvector` image in docker or install `pgvector` manually.
*   **Symptom:** `connect ECONNREFUSED 127.0.0.1:6379`
    *   **Cause:** Redis is not running.
    *   **Action:** Start Redis via Docker or local service.
*   **Symptom:** API endpoints return `500 Internal Server Error` immediately after login.
    *   **Cause:** `JWT_SECRET` is missing in the `.env` file.
    *   **Action:** Define a `JWT_SECRET` in `.env` and restart the API server.
*   **Symptom:** Generation job remains pending forever.
    *   **Cause:** The worker process is not running.
    *   **Action:** Start the worker using `npm run dev --workspace @edisco/worker`.

---

## Quick Demo Checklist

* [ ] `.env` is configured with DB, Redis, and JWT secrets.
* [ ] Database is created and `npm run db:migrate` ran successfully.
* [ ] Web, API, and Worker processes are running.
* [ ] Registration and onboarding complete successfully.
* [ ] User can request a lesson and worker processes it.
* [ ] User can answer lesson questions and earn XP.
* [ ] User's XP appears in the Weekly League leaderboard.
* [ ] Profile updates persist correctly.
