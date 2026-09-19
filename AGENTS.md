# Repository Continuation Rules

Any coding agent continuing existing work in this repository must:

1. Read `HANDOFF.md` and the canonical implementation plan before changing code. The plan currently lives at root `IMPLEMENTATION_PLAN.md`; if it is later moved to `docs/IMPLEMENTATION_PLAN.md`, use that path.
2. Inspect the actual repository state and Git history instead of trusting `HANDOFF.md` blindly.
3. Update `HANDOFF.md` after completing a phase or before handing work to another agent.
4. Preserve correct work from previous agents and avoid rewriting it unnecessarily.
5. Never begin the next implementation phase unless the user explicitly instructs it.

More specific `AGENTS.md` files may add rules for their subtree but do not override these continuation requirements.
