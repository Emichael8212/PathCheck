# PathCheck — Claude Code Instructions

@AGENTS.md

Follow the repository-wide rules above. Read `PARALLEL_IMPLEMENTATION.md` for exact worktrees/branch names, `ARCHITECTURE.md` for frozen shared contracts, and `TEST_PLAN.md` for mandatory PR evidence and tests. This is an implementation handoff for a **future** coding session, not authorization to start in the planning chat.

## Assigned Claude agents

- **Claude 1 — Academic Engine:** own `src/catalog/**`, `src/engine/**`, `tests/engine/**`, `tests/fixtures/engine/**`. Implement deterministic audits, prerequisites, bounded candidate search, unselected-course analysis and reproducible fixtures. Ask the lead for the human-provided ASU CIS interpretation before authoring real catalog rules; use explicitly synthetic data until verified. Never substitute model-generated academic outcomes for tested algorithms.
- **Claude 2 — Frontend/UX:** own `src/screens/**`, `src/ui/**`, `src/styles/**`, `src/export/**`, `tests/ui/**`, `tests/fixtures/ui/**`. Implement all approved journeys, active/proposed provenance, availability reports, accessible responsive controls and PDF export. Only use typed fixture data during isolated development; integrated tests must exercise the real engine. Gemini consent and manual entry fallback UI belong here.
- **Claude 3 — Supabase:** own `src/auth/**`, `src/persistence/**`, `supabase/migrations/**`, `supabase/tests/**`, `tests/auth/**`, `tests/persistence/**`. Implement authentication, owned cloud records, RLS/grants, guest migration, revision conflicts, recovery and deletion. Perform two-account unauthorized CRUD testing. **Do not edit** `supabase/functions/extract-transcript/**` or lead-owned `supabase/config.toml`.

## Worktree and PR discipline

Use only the assigned worktree/feature branch. Shared TypeScript contracts, root dependencies, CI, E2E and cross-module composition belong to Codex 1; submit a precise change request instead of editing those paths. Run executable tests, repair failures, **commit/push only your assigned feature branch** (never `main`), and open a short professional PR targeting `main` using `.github/pull_request_template.md`. Except for the lead-owned foundation PR, every feature PR must contain working owned functionality; no static UI mockups, inert controls, PDF shells, canned academic outputs, or stub-only integrations. Development/test doubles do not establish live or integrated completion. Show real command results and relevant evidence. Mark unavailable external checks `BLOCKED`/`NOT RUN` with exact human verification steps. Do not claim ready to merge while mandatory checks fail or are blocked.

**Never merge a PR, enable auto-merge, push to `main`, bypass protection, or merge on the human's behalf—even after approval.** The lead reviews, coordinates integration and resolves conflicts on an uncommitted, unpushed local integration branch; **the human personally executes every GitHub merge** and separately authorizes production deployment. Do not deploy or change production settings without that separate authorization. If the one-day target expires, report actual status without shrinking the MVP.
