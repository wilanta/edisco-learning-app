# Handoff

## Current Phase
Phase 3 — Onboarding End-to-End

## Phase Status
COMPLETE

## Next Action
Begin Phase 4A

## Repository State

The project currently consists of:
- **Database (`@edisco/database`)**: PostgreSQL schema with `drizzle-orm`. `users` table handles authentication fields and onboarding data (`interests`, `pace`, `freeGenerationsLeft`, `onboardingCompletedAt`).
- **API (`@edisco/api`)**: Fastify backend.
  - **Auth**: `POST /auth/register` and `POST /auth/login` handle JWT auth.
  - **Users**: `GET /users/me` retrieves the current user profile. `PATCH /users/me/onboarding` handles the business logic for submitting interests, pace, and activating the lifetime grant (3 free generations). The endpoint is idempotent (returns 200 without changing data if onboarding is already completed).
- **Web (`@edisco/web`)**: Next.js App Router frontend with Tailwind.
  - An onboarding flow at `/(onboarding)` routing through Welcome -> Interests -> Pace -> Register/Login.
  - Draft state is held in `sessionStorage` via `lib/onboarding-draft.ts`.
  - Registration/Login successfully calls the onboarding API using the draft and then clears it.
  - A placeholder track page exists at `/(main)/track`.

## Unresolved Product Assumptions
- Onboarding is completely mandatory; a skipped onboarding defaults to returning to the Interests page.
- The "Other" category in Interests is allowed via a text input, but submitted to the backend as a standard string inside the `interests` array.
- There is no specific behavior defined if a user refreshes the page during registration besides the session storage surviving the reload.

## Tests
Integration tests for business rules are written in `tests/onboarding.test.mjs` and `tests/auth.test.mjs`. (Note: they currently fail in local development if the `postgres` password is not set correctly in `DATABASE_URL`).
The frontend and backend contracts compile cleanly (`npm run typecheck` and `npm run lint` pass without errors).
