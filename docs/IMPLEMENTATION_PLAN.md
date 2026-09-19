# Implementation Plan

The canonical plan remains at [root IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md). This pointer supports the requested docs path without duplicating the specification audit or moving existing references.

## Phase 4A — Generation Infrastructure

**Status: COMPLETE** for the user's infrastructure-only scope. See the [Phase 4A delivery record](../IMPLEMENTATION_PLAN.md#phase-4a--generation-infrastructure) for implementation, executed validation, deviations, and remaining reliability decisions.

The authenticated API → PostgreSQL job → BullMQ → separate placeholder worker → status endpoint pipeline is verified. The placeholder creates no lesson and spends no quota; `DONE` therefore has a null `resultLessonId`. Real generation, embeddings/reuse, expiry, quota finalization, and generation frontend remain excluded.

## Phase 4B — LLM Lesson Generation

**Status: COMPLETE** for the user-authorized implementation scope. See the [Phase 4B delivery record](../IMPLEMENTATION_PLAN.md#phase-4b--llm-generation) for decisions, validation, deviations, and release gates.

OpenAI structured generation, private schema validation, and atomic lesson/part/assignment persistence are implemented. Embeddings are nullable by explicit approval. Tests use a mocked provider with real PostgreSQL/Redis/worker infrastructure. Live-provider quality, cost, and latency are unverified because no API key was configured. Embeddings/reuse, quota charging, and generation frontend remain excluded.

## Phase 4C — Embeddings & Semantic Reuse

**Status: COMPLETE** for the specified implementation scope. See the [Phase 4C delivery record](../IMPLEMENTATION_PLAN.md#phase-4c--embedding--semantic-reuse) and HANDOFF.md for full validation, decisions, and remaining gates.

OpenAI `text-embedding-3-small` (1536 dimensions) embedding adapter, HNSW-indexed pgvector similarity search with configurable cosine-distance threshold, and transactional reuse with assignment-time eligibility recheck are implemented. Compatibility rules enforce same category, pace, continuation context, embedding profile, content version, non-expiry, and no repeat within a destination track. Embedding/search failure blocks LLM generation rather than bypassing mandatory reuse search. Tests cover the full API → Queue → Worker → Embedding → pgvector → Reuse/Generate → Persistence pipeline with real PostgreSQL/Redis and a separate worker process.

Live semantic quality and operational similarity-threshold tuning remain unverified because no real embedding API key or operational threshold is configured. Daily expiry cron is specified but not implemented as a standalone job; time-based eligibility is enforced at query and finalization boundaries. Quota decrement remains deferred to Phase 4D.

Begin Phase 4D only when explicitly instructed.
