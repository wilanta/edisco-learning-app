# API Spec — Edisco

> Contract between FE (Next.js) and BE (Fastify). Format: REST + JSON. All endpoints (except auth) require an `Authorization: Bearer <token>` header.

---

## 1. Auth

### `POST /auth/register`
```json
// Request
{ "email": "string", "password": "string", "name": "string" }
// Response 201
{ "userId": "uuid", "token": "string" }
```

### `POST /auth/login`
```json
// Request
{ "email": "string", "password": "string" }
// Response 200
{ "userId": "uuid", "token": "string" }
```

---

## 2. Onboarding

### `PATCH /users/me/onboarding`
Called after registration, carrying the interest + pace data collected during the onboarding flow (stored temporarily on the client before the account exists).
```json
// Request
{
  "interests": ["programming", "language"],
  "pace": "REGULAR"
}
// Response 200
{
  "userId": "uuid",
  "freeGenerationsLeft": 3,
  "onboardingCompletedAt": "ISO-8601"
}
```

---

## 3. Track

### `GET /tracks`
List all tracks owned by the user (for the selector on the Track page — see the open question about multi-track).
```json
// Response 200
{
  "tracks": [
    { "id": "uuid", "title": "Python for Beginners", "category": "PROGRAMMING", "lessonCount": 4, "completedCount": 2 }
  ]
}
```

### `GET /tracks/:trackId`
Detail of one track including lesson order (for rendering the visual path).
```json
// Response 200
{
  "id": "uuid",
  "title": "Python for Beginners",
  "lessons": [
    { "userLessonId": "uuid", "order": 1, "title": "Variables & Data Types", "status": "COMPLETED" },
    { "userLessonId": "uuid", "order": 2, "title": "Conditionals", "status": "IN_PROGRESS" }
  ]
}
```

---

## 4. Generate Lesson (Async)

### `POST /lessons/generate`
Used both from the "New" menu (new track) and the "Generate Next" button (existing track).
```json
// Request
{
  "topic": "string (free text, required if it's a new track)",
  "category": "PROGRAMMING | LANGUAGE | MATH | SCIENCE | ENGINEERING | GENERAL",
  "trackId": "uuid (optional — present means 'continue track', absent means a new track)"
}
// Response 202 Accepted
{ "jobId": "uuid", "status": "PENDING" }

// Error 403 if quota exhausted
{ "error": "QUOTA_EXCEEDED", "message": "Free generation quota has been used up" }
```

### `GET /lessons/generate/:jobId`
Poll job status (FE polls every 2–3 seconds until status is `DONE`/`FAILED`).
```json
// Response 200
{
  "jobId": "uuid",
  "status": "PENDING | PROCESSING | DONE | FAILED",
  "resultLessonId": "uuid (null until complete)",
  "trackId": "uuid (null until complete, populated once the track is created)",
  "errorMessage": "string (if FAILED)"
}
```

---

## 5. Lesson & Part

### `GET /lessons`
List of all lessons owned by the user (for the "Lesson" menu), grouped by track.
```json
// Response 200
{
  "tracks": [
    {
      "trackId": "uuid",
      "trackTitle": "Python for Beginners",
      "lessons": [
        { "userLessonId": "uuid", "title": "Variables & Data Types", "status": "COMPLETED", "order": 1 }
      ]
    }
  ]
}
```

### `GET /lessons/:userLessonId`
Lesson detail + its 5 parts, for the user to view/complete.
```json
// Response 200
{
  "userLessonId": "uuid",
  "title": "Variables & Data Types",
  "status": "IN_PROGRESS",
  "parts": [
    {
      "partId": "uuid",
      "order": 1,
      "type": "MULTIPLE_CHOICE",
      "prompt": { "question": "...", "options": ["...", "..."] },
      "userProgress": { "isCorrect": null, "attempts": 0 }
    }
  ]
}
```

### `POST /lessons/:userLessonId/parts/:partId/answer`
```json
// Request
{ "answer": "string | string[] (depends on part type)" }
// Response 200
{
  "isCorrect": true,
  "xpEarned": 10,
  "explanation": "string (optional, explains the answer)",
  "lessonCompleted": false
}
```

---

## 6. League

### `GET /league/weekly`
```json
// Response 200
{
  "weekStartDate": "2026-09-14",
  "myRank": 12,
  "myXp": 340,
  "leaderboard": [
    { "rank": 1, "userId": "uuid", "name": "string", "xp": 980 }
  ]
}
```

---

## 7. Profile

### `GET /users/me`
```json
// Response 200
{
  "id": "uuid",
  "name": "string",
  "email": "string",
  "pace": "REGULAR",
  "interests": ["programming"],
  "freeGenerationsLeft": 2,
  "totalXp": 340,
  "currentStreak": 5,
  "longestStreak": 12
}
```

### `PATCH /users/me`
Update preferences (e.g. change pace; excludes email/password on this endpoint for security separation).
```json
// Request
{ "pace": "INTENSIVE", "interests": ["programming", "math"] }
// Response 200
{ "id": "uuid", "pace": "INTENSIVE", "interests": ["programming", "math"] }
```

---

## 8. Error Convention

All errors follow a consistent format:
```json
{ "error": "ERROR_CODE", "message": "User-displayable message" }
```
Common codes: `UNAUTHORIZED`, `QUOTA_EXCEEDED`, `VALIDATION_ERROR`, `NOT_FOUND`, `GENERATION_FAILED`.
