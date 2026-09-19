# Open Questions – Phase 8 Audit Resolution

This document summarizes the final state of the initial open product decisions based on the Phase 8 audit of the actual Edisco implementation.

---

### 1. Can onboarding be skipped?
**Status: Resolved by existing approved implementation decision**
Onboarding cannot be skipped. The application enforces interests and pace selection before granting access to generation and tracks. Missing pace/interests block progression.

### 2. Multiple tracks at once?
**Status: Resolved by existing approved implementation decision**
Multiple tracks are allowed simultaneously. The UI provides a tab/list selector on the Tracks page to navigate between active topics.

### 3. Variety of part types within one lesson
**Status: Resolved by existing approved implementation decision**
Mixing is allowed. The AI freely generates different question types (Multiple Choice, Fill in the Blank, Matching) within the same 5-part lesson structure.

### 4. Transparency of lesson reuse to the user
**Status: Resolved by existing approved implementation decision**
Hidden. Reused lessons appear identical to newly generated ones from the learner's perspective, avoiding additional UI complexity.

### 5. League grouping vs. global leaderboard
**Status: Resolved by existing approved implementation decision (MVP scope)**
A single global leaderboard is implemented based on total XP within the current UTC week. Leagues (Bronze/Silver/Gold) and promotion/demotion are out of scope for MVP.

### 6. LLM & Embedding provider
**Status: Resolved by existing approved implementation decision**
OpenAI is the chosen provider (`gpt-4o-mini-2024-07-18` and `text-embedding-3-small`). The architecture successfully abstracts this via a placeholder mode (`GENERATION_PLACEHOLDER_ENABLED`) for safe UI/integration testing without incurring provider costs.

### 7. Similarity threshold for reuse
**Status: Still unresolved but non-blocking**
The application implements a configurable threshold (`SIMILARITY_MAX_DISTANCE`). The initial strict setting operates as intended, but determining the optimal real-world semantic threshold requires production data evaluation.
