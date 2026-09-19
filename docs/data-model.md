# Data Model — Edisco

> Schema is simplified (not literal Prisma/Drizzle syntax, but detailed enough to translate directly). Adjust ID type (cuid/uuid) to match your chosen ORM.

---

## 1. User

```
User {
  id                UUID (PK)
  email             String (unique)
  passwordHash      String (nullable if using OAuth)
  name              String
  pace              Enum(CASUAL, REGULAR, INTENSIVE)
  interests         String[]           // onboarding result, categories selected
  freeGenerationsLeft  Int (default 3)
  totalXp           Int (default 0)
  currentStreak     Int (default 0)
  longestStreak     Int (default 0)
  lastActivityDate  Date (nullable)    // used to compute streak
  onboardingCompletedAt  Timestamp (nullable)
  createdAt         Timestamp
  updatedAt         Timestamp
}
```

**Notes:**
- `freeGenerationsLeft` is decremented every time a generation succeeds (both a brand-new lesson and a reused one) — see `business-logic.md`.
- `interests` is stored as an array of category strings (e.g. `["programming", "language"]`), used to personalize topic suggestions on the "New" page (not a strict filter).

---

## 2. Track

A **Track** = one broad topic the user is currently learning (e.g. "Python for Beginners", "Beginner Spanish"). One Track contains many sequential Lessons.

```
Track {
  id            UUID (PK)
  userId        UUID (FK -> User)
  title         String            // generated/derived from the initial topic
  category      Enum(PROGRAMMING, LANGUAGE, MATH, SCIENCE, ENGINEERING, GENERAL)
  createdAt     Timestamp
  updatedAt     Timestamp
}
```

> ⚠️ This structure assumes the open question "can a user have multiple active tracks" = **yes**. If the answer turns out to be "no, only one active track," then `Track` can be a single row per user (or an `isActive` field can be added to mark which track is currently running).

---

## 3. Lesson

Lesson is **generated content** (which can be reused by many users via the reuse mechanism). Because of this, Lesson does **not** have a direct `userId` — the relationship to users goes through a `UserLesson` table (many-to-many, so 1 lesson can be owned by many users as a result of reuse).

```
Lesson {
  id                UUID (PK)
  trackTemplateTopic String           // normalized topic, used for initial lookup before vector search
  category          Enum(PROGRAMMING, LANGUAGE, MATH, SCIENCE, ENGINEERING, GENERAL)
  title             String
  description       String
  embedding         Vector(N)         // pgvector, N depends on chosen embedding model
  contentVersion    Int (default 1)   // eases migration if the template format changes
  generatedByUserId UUID (FK -> User) // the user whose request first triggered this lesson's generation (for audit, not exclusive ownership)
  isExpiredForReuse Boolean (default false)  // true after 3 months — no longer used for reuse, NOT deleted
  expiresAt         Timestamp         // createdAt + 3 months, computed at insert time
  createdAt         Timestamp
  updatedAt         Timestamp
}
```

**Important note on expiry:** `isExpiredForReuse` is checked via a scheduled job (e.g. daily cron) that flags lessons where `expiresAt < now()`. Expired lessons **remain in the DB** and stay accessible via `UserLesson` to anyone who already received them — they simply no longer appear as candidates in the vector search for new users.

---

## 4. Part

```
Part {
  id            UUID (PK)
  lessonId      UUID (FK -> Lesson)
  order         Int (1-5)
  type          Enum(MULTIPLE_CHOICE, FILL_IN_BLANK, MATCHING, TRUE_FALSE, CODE_PREDICT, TRANSLATE, SHORT_ANSWER, ...)
                // these vary per category, see business-logic.md §Content Templates
  promptContent Json          // question structure (question, options, correct answer, explanation) — schema differs per `type`
  createdAt     Timestamp
}
```

> `promptContent` is intentionally `Json` (not a rigid column) because each `type` has a different field structure (MC needs `options[]`, fill-in-blank needs `blanks[]`, etc.). Structure validation happens at the application level (Zod schema per type), not at the DB level.

---

## 5. UserLesson (Ownership + Progress Relation)

Stores which lessons are **owned** by which user (whether from an original generation or a reuse result), along with progress.

```
UserLesson {
  id            UUID (PK)
  userId        UUID (FK -> User)
  lessonId      UUID (FK -> Lesson)
  trackId       UUID (FK -> Track)
  orderInTrack  Int              // this lesson's order within the user's track
  status        Enum(NOT_STARTED, IN_PROGRESS, COMPLETED)
  wasReused     Boolean          // true if this lesson was obtained via the reuse mechanism (for internal analytics, not shown to the user — see prd.md §6)
  startedAt     Timestamp (nullable)
  completedAt   Timestamp (nullable)
  createdAt     Timestamp
}
```

---

## 6. UserPartProgress

```
UserPartProgress {
  id            UUID (PK)
  userLessonId  UUID (FK -> UserLesson)
  partId        UUID (FK -> Part)
  isCorrect     Boolean (nullable)   // result of the user's latest answer attempt
  attempts      Int (default 0)
  xpEarned      Int (default 0)
  completedAt   Timestamp (nullable)
  createdAt     Timestamp
}
```

---

## 7. GenerationJob

Tracks the status of an async generate job (used by the FE for polling).

```
GenerationJob {
  id            UUID (PK)
  userId        UUID (FK -> User)
  trackId       UUID (FK -> Track, nullable if the track doesn't exist yet)
  requestedTopic String
  category      Enum(...)
  status        Enum(PENDING, PROCESSING, DONE, FAILED)
  resultLessonId UUID (FK -> Lesson, nullable until complete)
  errorMessage  String (nullable)
  createdAt     Timestamp
  updatedAt     Timestamp
}
```

---

## 8. WeeklyLeagueEntry

```
WeeklyLeagueEntry {
  id            UUID (PK)
  userId        UUID (FK -> User)
  weekStartDate Date          // Monday of the current week, used as the period identifier
  xpThisWeek    Int (default 0)
  rank          Int (nullable, computed on-read or via scheduled job)
  createdAt     Timestamp
  updatedAt     Timestamp
}
```

> MVP: one global leaderboard per week (see `prd.md` §7.3). If league grouping (Bronze/Silver/etc.) is needed later, add a `leagueGroupId` column here — this structure is already extensible enough for that without a major migration.

---

## 9. Relationship Summary

```
User 1---N Track
User 1---N UserLesson
User 1---N GenerationJob
User 1---N WeeklyLeagueEntry
Track 1---N UserLesson
Lesson 1---N Part
Lesson 1---N UserLesson   (many users can share 1 lesson via reuse)
UserLesson 1---N UserPartProgress
Part 1---N UserPartProgress
```
