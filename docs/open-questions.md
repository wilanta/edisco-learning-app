# Open Questions — Needs Wil's Confirmation

Consolidated list of all assumptions made because a requirement wasn't explicit yet. **Please confirm/correct each point before coding starts** — the most sensible assumption has already been chosen for each, but a wrong guess could change the data structure/flow.

---

### 1. Can onboarding be skipped?
- **Assumption used:** Cannot be skipped — interests & pace are required since they personalize the first generation.
- **Impact if wrong:** Need to handle an "empty interest/pace" state in the data model + fallback default values.

### 2. Multiple tracks at once?
- **Question:** Can a user have multiple active Tracks at the same time (e.g. learning Python + Spanish simultaneously), or only one active track that must be "switched"?
- **Assumption used:** Multiple tracks at once are allowed, with a selector/tab on the Track page.
- **Impact if wrong:** The `Track` table structure and the Track/Lesson page UI change significantly (becomes single-track with an `isActive` field or a history archive).

### 3. Variety of part types within one lesson
- **Question:** Can the 5 parts within one lesson mix question types (MC, fill-in-blank, matching, etc. within the same lesson), or must they be uniform?
- **Assumption used:** Mixing is allowed, AI freely chooses the combination.
- **Impact if wrong:** Simplifies template generation (1 type per generate call), but reduces variety/engagement.

### 4. Transparency of lesson reuse to the user
- **Question:** Should the user know that a lesson they received is a reuse result (not generated specifically for them), or should this be fully hidden?
- **Assumption used:** Hidden — from the user's perspective, everything feels like a new lesson.
- **Impact if wrong:** Requires additional UI (e.g. a "popular lesson" badge/label) and different messaging/copy considerations.

### 5. League grouping vs. global leaderboard
- **Question:** Does the MVP need league grouping (Bronze/Silver/Gold, small groups like the original Duolingo), or is a single global leaderboard enough for now?
- **Assumption used:** Global for now, grouping is v2.
- **Impact if wrong:** Requires an additional scheduled job for grouping + a `leagueGroupId` table + promotion/demotion logic.

### 6. LLM & Embedding provider
- **Question:** Which provider should be used for content generation (OpenAI/Anthropic/other) and for embeddings (can be a different provider)?
- **Assumption used:** Not finalized — recommendation is to start with a "mini/cheap" tier model from whichever provider is easiest for Wil to integrate, mixing providers for LLM vs. embedding is fine.
- **Impact if wrong:** Determines which SDK gets installed in `worker`, and affects prompt/structured-output format (each provider has a different approach).

### 7. Similarity threshold for reuse
- **Question:** Not something to answer right now, but a **note**: the cosine similarity threshold for the reuse decision can't be determined on paper — it needs real-data experimentation after a few weeks of usage.
- **Assumption used:** Start strict (>0.92), tune based on real logs.

---

## How to Answer

Feel free to answer by number briefly (e.g. "1: cannot be skipped, 2: single-track for now, etc."), and the relevant documents (`prd.md`, `data-model.md`, `business-logic.md`) will be updated to match the final answers.
