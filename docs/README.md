# Project Documentation — Edisco

Recommended reading order (especially for use as vibe-coding context):

1. **`prd.md`** — Start here. Full product requirements: onboarding flow, menus, content model, business model, gamification.
2. **`srs.md`** — Formalized requirements: numbered functional requirements (FR-*), use cases, and detailed non-functional requirements. Use this when writing code or test cases against a specific, traceable requirement rather than prose.
3. **`open-questions.md`** — **Must be read & confirmed before coding starts.** Contains every assumption made because the original requirements weren't explicit yet.
4. **`architecture.md`** — Technical decisions: tech stack, why FE/BE are separated but still a modular monolith (not full microservices), the async generation flow.
5. **`data-model.md`** — Full database schema (Postgres + pgvector), relationships between tables.
6. **`business-logic.md`** — Detailed logic for quota, embedding-based lesson reuse/caching, expiry, XP, streak, and league.
7. **`api-spec.md`** — REST API contract between FE and BE, so both can be developed in parallel/consistently.

---

## Important Notes

- These documents are **not yet final** — there are 7 items in `open-questions.md` that need Wil's decision before implementation starts, since some decisions (e.g. single-track vs. multi-track) significantly impact the data structure.
- All technical recommendations (LLM provider, similarity threshold, XP numbers) are **starting points**, not final numbers — designed to be easy to tune via config without needing code changes/redeployment.
- Initial target: MVP with no monetization, focused on validating the concept first (whether people want to learn arbitrary topics in a Duolingo-like format).
